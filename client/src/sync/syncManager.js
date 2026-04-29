// initialization functions
import { WorkerClient } from './workerClient.js';

const API = 'http://localhost:8080/api';

// NOTE: updatedAt has NO default. Every write must set it explicitly via SyncManager.nowIso().
// SQLite's CURRENT_TIMESTAMP only has second precision, which would silently lose writes
// during rapid bursts (rows on the same second get a watermark advanced past them with ms
// precision and become invisible to the next push's "updatedAt > lastSync" filter).
// Existing user DBs created before this change still have DEFAULT CURRENT_TIMESTAMP on the
// column — that's harmless as long as every callsite passes updatedAt explicitly.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, displayName TEXT, firstName TEXT, lastName TEXT, countryIso TEXT, phoneNumber TEXT, gender TEXT, skillset TEXT, privacySettings TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, userID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, userID TEXT NOT NULL, categoryID TEXT, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspaceID TEXT NOT NULL, userID TEXT NOT NULL, role TEXT DEFAULT 'editor', joinedAt DATETIME, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'New Tab', color TEXT NOT NULL DEFAULT '#888888', tabOrder INTEGER NOT NULL DEFAULT 0, isArchived INTEGER NOT NULL DEFAULT 0, workspaceID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_columns (id TEXT PRIMARY KEY, tabID TEXT NOT NULL, workspaceID TEXT NOT NULL, columnIndex INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, color TEXT, direction TEXT, listOrder INTEGER NOT NULL DEFAULT 0, columnID TEXT NOT NULL, workspaceID TEXT NOT NULL, tabID TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, isCompleted BOOLEAN, originalCategory TEXT, color TEXT, listID TEXT NOT NULL, taskOrder INTEGER NOT NULL DEFAULT 0, deadline TEXT, subtasks TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '{}', workspaceID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notation_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, workspaceID TEXT NOT NULL, groupOrder INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notation_pages (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled', workspaceID TEXT NOT NULL, groupID TEXT, pageOrder INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
  CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(listID, taskOrder);
  CREATE INDEX IF NOT EXISTS idx_lists_column ON lists(columnID);
  CREATE INDEX IF NOT EXISTS idx_columns_tab ON kanban_columns(workspaceID, tabID);
`;

const SYNC_TABLES = ['users', 'categories', 'workspaces', 'workspace_members', 'kanban_tabs', 'kanban_columns', 'lists', 'tasks', 'notes', 'notation_groups', 'notation_pages'];

// debounce window: short enough that a burst of edits feels live to other clients,
// long enough to coalesce rapid keystrokes into one push.
const PUSH_DEBOUNCE_MS = 250;

let instancePromise = null;

// class functions
export class SyncManager {
    // class functions
    constructor() {
        // Worker handle. Created lazily in _init() so we can match it to the
        // user's DB on setUser(). Owns its own msgId/pendingRequests plumbing.
        this._worker = null;
        this._online = navigator.onLine;
        this._userId = null;
        this._listeners = new Set();
        this._listenersAttached = false;

        // Random per-instance ID. Sent on every push; comes back in the
        // server's broadcast so this tab can ignore the echo of its own write.
        // Different tabs / devices get different values (each runs its own
        // SyncManager), so they correctly DO pull on each other's pushes.
        this._clientId = crypto.randomUUID();

        // sync state
        this._syncing = false;
        this._pushDebounceTimer = null;
        this._pendingPushResolvers = [];
        this._pullQueued = false;
        // when a push request arrives while another push is in flight, we queue it.
        // the in-flight push captures its watermark BEFORE its SELECT, so any rows
        // written during it will still satisfy the next push's "updatedAt > watermark"
        // filter. the queued follow-up guarantees that next push actually happens.
        this._pushQueued = false;
        this._pushQueuedResolvers = [];
        // waiters from flushPush() — resolved on every _runPush completion so the
        // flushPush loop can re-check the idle condition.
        this._onPushComplete = [];

        // network listener refs (so we can detach in reset())
        this._onOnline = null;
        this._onOffline = null;

        // SSE stream state. Owned by SyncManager (not the React layer) because
        // the connection's lifecycle matches the manager's, not any component's.
        // _streamEmail is the email we're connected/connecting AS — used to
        // short-circuit duplicate connectStream calls and to detect that a
        // pending reconnect was rendered moot by a user switch (the timer
        // checks _streamEmail before reconnecting).
        this._streamEmail = null;
        this._eventSource = null;
        this._streamRetryDelay = 1000;
        this._streamRetryTimer = null;

        // db readiness
        this._dbReadyPromise = null;
        this._dbReadyResolver = null;
        this._resetDbReady();
    }

    get isOnline() { return this._online; }

    _resetDbReady() {
        this._dbReadyPromise = new Promise(res => { this._dbReadyResolver = res; });
    }

    _setOnline(status) {
        if (this._online !== status) {
            this._online = status;
            this._notify();
        }
    }

    static getInstance() {
        if (!instancePromise) {
            instancePromise = (async () => {
                const manager = new SyncManager();
                await manager._init();
                return manager;
            })();
        }
        return instancePromise;
    }

    static reset() {
        if (instancePromise) {
            instancePromise.then(manager => {
                manager.disconnectStream();
                manager._teardownNetworkListeners();
                clearTimeout(manager._pushDebounceTimer);
                if (manager._worker) {
                    // Best-effort close; we ignore the result because we're
                    // tearing down anyway. terminate() rejects any in-flight
                    // promises, so we don't need to await close().
                    manager._worker.close().catch(() => {});
                    manager._worker.terminate();
                }
            });
        }
        instancePromise = null;
    }

    // database functions
    async _init() {
        // Just instantiate the worker client. The actual DB INIT command is
        // sent later from setUser(), once we know which DB to open.
        this._worker = new WorkerClient();
    }

    // user functions
    async setUser(userId, email = null) {
        // Same user as current → only the stream needs reconciling, not the DB.
        // (e.g. updateUser changing email but not id.) Avoid re-INIT'ing the worker.
        if (this._userId === userId) {
            if (email && email !== this._streamEmail) this.connectStream(email);
            return;
        }
        this._userId = userId;

        // always rebuild the readiness gate when switching users — any in-flight
        // query() call is awaiting the OLD promise, which is fine: it was for the old DB.
        // new calls will await the new gate and unblock only after the new DB is open.
        this._resetDbReady();

        try {
            await this._worker.init(`studyspace_${userId}_v2`);
            await this._worker.execute(SCHEMA_SQL);

            if (!this._listenersAttached) {
                this._setupNetworkListeners();
                this._listenersAttached = true;
            }

            this._dbReadyResolver();

            // one-shot reconciliation on login: pull anything we missed while offline.
            if (this._online) this._reconcile();

            // open the live event stream once we're set up. SSE was previously
            // owned by useSync.jsx; lives here now so its lifecycle matches the
            // manager's and so reset() can tear it down deterministically.
            if (email) this.connectStream(email);
        } catch (e) {
            console.error(e);
        }
    }

    // network functions
    _setupNetworkListeners() {
        this._onOnline = () => { this._setOnline(true); this._reconcile(); };
        this._onOffline = () => { this._setOnline(false); };
        window.addEventListener('online', this._onOnline);
        window.addEventListener('offline', this._onOffline);
    }

    _teardownNetworkListeners() {
        if (this._onOnline) window.removeEventListener('online', this._onOnline);
        if (this._onOffline) window.removeEventListener('offline', this._onOffline);
        this._onOnline = null;
        this._onOffline = null;
        this._listenersAttached = false;
    }

    // SSE stream functions
    //
    // The server pushes events over SSE whenever something changes that this
    // user cares about (kanban_updated, invites_updated, presence_updated).
    // On kanban_updated we trigger a pull; the others are dispatched as window
    // events so the existing usePendingInvites / useWorkspacePresence hooks
    // pick them up without modification.
    //
    // There is a deliberate redundancy: when the network comes back, BOTH
    // _onOnline (calling _reconcile → pull) and the SSE onopen handler
    // (calling pullFromServer) will fire. The pulls coalesce via _pullQueued
    // so the redundancy is cheap; don't try to "fix" it by removing one.

    /** Open the SSE stream for the given email. Idempotent: safe to call
     *  with the same email while already connected. Switching emails closes
     *  the old stream first. */
    connectStream(email) {
        if (!email) return;
        if (this._streamEmail === email && this._eventSource) return;

        this.disconnectStream();
        this._streamEmail = email;
        this._streamRetryDelay = 1000;
        this._openEventSource();
    }

    /** Close the SSE stream, cancel any pending reconnect, and forget the email. */
    disconnectStream() {
        if (this._streamRetryTimer) {
            clearTimeout(this._streamRetryTimer);
            this._streamRetryTimer = null;
        }
        if (this._eventSource) {
            this._eventSource.close();
            this._eventSource = null;
        }
        this._streamEmail = null;
    }

    _openEventSource() {
        // capture the email we're connecting AS, so a delayed reconnect that
        // fires after disconnectStream() (or after a user switch) can detect
        // staleness and bail out.
        const connectingAs = this._streamEmail;
        if (!connectingAs) return;

        const es = new EventSource(`${API}/network/stream/${connectingAs}`);
        this._eventSource = es;

        es.onopen = () => {
            // reset backoff on a successful connect
            this._streamRetryDelay = 1000;
            // we just (re)connected — pull in case we missed events while disconnected.
            // this is the only "catch-up" sync; the rest is purely event-driven.
            this.pullFromServer();
        };

        es.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (err) {
                console.warn('[sse] malformed message, ignoring:', err.message);
                return;
            }

            // server tells us another client pushed → pull immediately. no debounce here:
            // SSE events are already coalesced server-side and we want the UI to feel live.
            if (data.type === 'kanban_updated') {
                // Skip the echo of our own push. The originating push already
                // wrote everything locally and confirmed with the server; pulling
                // again would just be a wasted round-trip. Other tabs/devices
                // have different _clientId values so they correctly DO pull.
                // originClientId is null for server-originated changes (e.g.
                // invite acceptance), in which case everyone pulls.
                if (data.originClientId && data.originClientId === this._clientId) {
                    return;
                }
                this.pullFromServer();
            }
            if (data.type === 'invites_updated') {
                window.dispatchEvent(new CustomEvent('invites_updated', { detail: data }));
            }
            if (data.type === 'presence_updated') {
                window.dispatchEvent(new CustomEvent('presence_updated', { detail: data }));
            }
        };

        es.onerror = () => {
            es.close();
            // only clear _eventSource if it's still us — guards against a race where
            // disconnectStream already cleared it.
            if (this._eventSource === es) this._eventSource = null;

            // if the stream was torn down deliberately (disconnectStream cleared
            // _streamEmail) don't try to reconnect. otherwise schedule a backoff retry.
            if (!this._streamEmail) return;

            const reconnectingAs = connectingAs;
            this._streamRetryTimer = setTimeout(() => {
                this._streamRetryTimer = null;
                // if the user switched (or logged out) while we were waiting,
                // _streamEmail won't match — abandon this retry.
                if (this._streamEmail !== reconnectingAs) return;
                this._streamRetryDelay = Math.min(this._streamRetryDelay * 2, 30000);
                this._openEventSource();
            }, this._streamRetryDelay);
        };
    }

    // event functions
    subscribe(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify() { this._listeners.forEach(fn => fn()); }

    // query functions
    //
    // The DB-readiness gate (await _dbReadyPromise) is a SyncManager concern,
    // not a worker concern: it ensures calls during a user switch wait for the
    // new DB to be open. WorkerClient itself doesn't know about user switches.
    //
    // execute() and runBatch() also fire _notify() and _schedulePush() — those
    // are sync-level side effects, NOT something the worker layer should do.
    // Calls inside SyncManager that need to bypass these side effects (schema
    // init in setUser, server-data merge in _mergeServerData) call
    // this._worker.execute() / .batch() directly.
    async query(sql, params = []) {
        await this._dbReadyPromise;
        return await this._worker.query(sql, params);
    }

    async execute(sql, params = []) {
        await this._dbReadyPromise;
        await this._worker.execute(sql, params);
        this._notify();
        this._schedulePush();
    }

    async runBatch(statements) {
        await this._dbReadyPromise;
        await this._worker.batch(statements);
        this._notify();
        this._schedulePush();
    }

    // synchronization functions
    //
    // Sync is event-driven, not polling. It runs in three situations:
    //   1. _schedulePush()  — debounced, after a local mutation (execute / runBatch).
    //   2. pullFromServer() — immediate, when SSE tells us the server has news for us.
    //   3. _reconcile()     — one-shot, on login or when the network comes back.
    //
    // There is no recurring timer. There is no heartbeat. If nothing happens, nothing syncs.

    /** Schedule a push of local changes to the server. Debounced so a burst of edits
     *  becomes one HTTP call. Returns a promise that resolves when the push completes. */
    _schedulePush() {
        if (!this._online || !this._userId) return Promise.resolve();

        const promise = new Promise(resolve => this._pendingPushResolvers.push(resolve));

        clearTimeout(this._pushDebounceTimer);
        this._pushDebounceTimer = setTimeout(() => {
            this._pushDebounceTimer = null;
            this._runPush();
        }, PUSH_DEBOUNCE_MS);

        return promise;
    }

    /** Force any pending or queued pushes to complete, and wait for them.
     *  Used when a caller needs to be sure the server has the latest data
     *  before doing something else (e.g. sending an invite for a workspace
     *  that was just created locally). Idempotent and safe to call when idle. */
    async flushPush() {
        // if there's a debounce timer waiting, fire it now.
        if (this._pushDebounceTimer) {
            clearTimeout(this._pushDebounceTimer);
            this._pushDebounceTimer = null;
            this._runPush();
        }

        // wait until the push subsystem reports fully idle: nothing in flight,
        // nothing queued, no debounce timer pending. each iteration of the loop
        // waits for the NEXT push completion (signaled by _onPushComplete), then
        // re-checks. this handles the case where a queued push spawns another
        // queued push, and so on.
        while (this._syncing || this._pushQueued || this._pushDebounceTimer) {
            await new Promise(resolve => this._onPushComplete.push(resolve));
        }
    }

    /** Notify everything waiting on flushPush that a push just completed.
     *  Called from _runPush's finally block. */
    _signalPushComplete() {
        const waiters = this._onPushComplete;
        this._onPushComplete = [];
        waiters.forEach(r => r());
    }

    /** Pull fresh data from the server. Called by the SSE handler when another
     *  client pushed something that affects us. Coalesces concurrent calls. */
    async pullFromServer() {
        if (!this._online || !this._userId) return;
        if (this._syncing) {
            // a sync is already in flight; mark that we want another pass after it.
            this._pullQueued = true;
            return;
        }
        await this._runPull();
    }

    /** One-shot reconciliation: pull, then flush any queued local pushes.
     *  Used on login and on network reconnect. */
    async _reconcile() {
        await this.pullFromServer();
        await this.flushPush();
    }

    async _runPush() {
        if (this._syncing) {
            // another push is in flight. queue our resolvers onto a follow-up push
            // that will run as soon as the current one finishes. we do NOT resolve
            // the waiters now — their changes might not have been included in the
            // in-flight push (they were written AFTER it captured its watermark).
            this._pushQueued = true;
            const moved = this._pendingPushResolvers;
            this._pendingPushResolvers = [];
            this._pushQueuedResolvers.push(...moved);
            return;
        }

        const resolvers = this._pendingPushResolvers;
        this._pendingPushResolvers = [];

        // CAPTURE THE WATERMARK NOW, before we read or write anything.
        // any local mutation that happens during this push will have an updatedAt
        // strictly greater than this value, so the next push's SELECT will catch it.
        // this is the critical fix for the "rapid burst" data-loss bug: if we
        // captured the watermark AFTER the request, any row written during the
        // round-trip would be marked synced without ever being sent.
        const newWatermark = this._nowIso();

        try {
            this._syncing = true;
            await this._dbReadyPromise;

            const syncKey = `sync_time_${this._userId}`;
            const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00.000';

            const pushPayload = {};
            for (const table of SYNC_TABLES) {
                // bound the SELECT by the captured watermark. without the upper bound,
                // a slow DB read could pick up rows that arrived AFTER we captured
                // the watermark, push them, AND leave them eligible for the next
                // push too — harmless but wasteful. the upper bound makes the
                // window of rows we own clean and disjoint from the next push's window.
                const changedRows = await this.query(
                    `SELECT * FROM ${table} WHERE updatedAt > ? AND updatedAt <= ?`,
                    [lastSyncTime, newWatermark]
                );
                if (changedRows.length > 0) pushPayload[table] = changedRows;
            }

            // nothing to push? still advance the watermark so we don't keep
            // re-scanning the same window forever, but skip the network round trip.
            if (Object.keys(pushPayload).length === 0) {
                localStorage.setItem(syncKey, newWatermark);
                return;
            }

            const r = await fetch(`${API}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000),
                body: JSON.stringify({
                    userID: this._userId,
                    lastSync: lastSyncTime,
                    clientChanges: pushPayload,
                    clientId: this._clientId,
                }),
            });

            if (r.status === 401) {
                window.dispatchEvent(new CustomEvent('force_logout'));
                throw new Error('User deleted from server');
            }
            if (!r.ok) throw new Error(`Push failed: ${r.status}`);

            const serverChanges = await r.json();
            await this._mergeServerData(serverChanges);

            // advance to the watermark we captured at the start. server-returned rows
            // may have updatedAt timestamps later than this (other clients writing
            // concurrently), but they were merged via _mergeServerData and we'll pick
            // them up on the next pull. using OUR watermark (not the server's max)
            // is what protects local mutations made during the round-trip.
            localStorage.setItem(syncKey, newWatermark);
            this._setOnline(true);
        } catch (e) {
            this._setOnline(false);
            console.error('[push]', e.message);
            // on failure: don't advance the watermark, so the same rows get retried
            // next push. but DO put the resolvers back so callers awaiting flushPush
            // get unblocked — they shouldn't hang on a network error.
        } finally {
            this._syncing = false;
            resolvers.forEach(r => r());

            // if changes arrived while we were running, run another push immediately.
            // their resolvers are already in _pushQueuedResolvers and will be picked
            // up by that push's _pendingPushResolvers swap.
            if (this._pushQueued) {
                this._pushQueued = false;
                this._pendingPushResolvers.push(...this._pushQueuedResolvers);
                this._pushQueuedResolvers = [];
                // microtask, not setTimeout, so this happens before any new schedule.
                Promise.resolve().then(() => this._runPush());
            }

            if (this._pullQueued) {
                this._pullQueued = false;
                this.pullFromServer();
            }

            // signal flushPush waiters AFTER the queue work above is dispatched, so
            // when they re-check the idle condition, _pushQueued/_syncing reflect
            // whether more work is coming. (they'll re-await on this same channel
            // until truly idle.)
            this._signalPushComplete();
        }
    }

    async _runPull() {
        // capture the watermark NOW, same reasoning as _runPush: any local mutation
        // that happens during the pull must remain eligible for the next push.
        // (we don't filter the SELECT here because pull doesn't read local rows;
        // it only writes server rows. but advancing the watermark to "now-at-start"
        // instead of "max server timestamp" or "now-at-end" is what protects against
        // overshooting and skipping rows.)
        const newWatermark = this._nowIso();

        try {
            this._syncing = true;
            await this._dbReadyPromise;

            const syncKey = `sync_time_${this._userId}`;
            const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00.000';

            const url = `${API}/sync?userID=${encodeURIComponent(this._userId)}&lastSync=${encodeURIComponent(lastSyncTime)}`;
            const r = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000),
            });

            if (r.status === 401) {
                window.dispatchEvent(new CustomEvent('force_logout'));
                throw new Error('User deleted from server');
            }
            if (!r.ok) throw new Error(`Pull failed: ${r.status}`);

            const serverChanges = await r.json();
            await this._mergeServerData(serverChanges);

            // a server row may have updatedAt > newWatermark (it was written after
            // we captured). that's fine — it WAS in this pull's response, it's
            // already merged locally, and it has updatedAt > our current lastSync,
            // so the next push won't try to send it back (the server rejects via
            // its ON CONFLICT WHERE excluded.updatedAt > existing.updatedAt clause).
            // we still advance our own watermark to the captured value to keep
            // local mutations during the pull eligible for the next push.
            localStorage.setItem(syncKey, newWatermark);
            this._setOnline(true);
        } catch (e) {
            this._setOnline(false);
            console.error('[pull]', e.message);
        } finally {
            this._syncing = false;
            if (this._pullQueued) {
                this._pullQueued = false;
                this.pullFromServer();
            }
        }
    }

    /** Generates a millisecond-precision UTC timestamp matching the server's
     *  STRFTIME('%Y-%m-%d %H:%M:%f', 'now') format. Static so hooks can call it
     *  without touching an instance: SyncManager.nowIso(). Every write to a
     *  synced table MUST set updatedAt to this — see SCHEMA_SQL note. */
    static nowIso() {
        const d = new Date();
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
               `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
    }

    _nowIso() { return SyncManager.nowIso(); }

    async _mergeServerData(serverChanges) {
        if (!serverChanges) return;

        const batchStatements = [];

        for (const [tableName, rows] of Object.entries(serverChanges)) {
            if (!SYNC_TABLES.includes(tableName) || !Array.isArray(rows) || rows.length === 0) continue;

            // user functions
            if (tableName === 'users') {
                const activeUser = rows.find(u => u.id === this._userId);
                if (activeUser && activeUser.isDeleted === 1) {
                    window.dispatchEvent(new CustomEvent('force_logout'));
                    return;
                }
            }

            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const updateSet = columns.map(col => `${col}=excluded.${col}`).join(', ');

            const sql = `
                INSERT INTO ${tableName} (${columns.join(', ')}) 
                VALUES (${placeholders}) 
                ON CONFLICT(id) DO UPDATE SET 
                ${updateSet} 
                WHERE excluded.updatedAt > ${tableName}.updatedAt
            `;

            rows.forEach(row => {
                const values = columns.map(col => row[col]);
                batchStatements.push({ sql, params: values });
            });
        }

        if (batchStatements.length > 0) {
            // run the batch directly through the worker — calling runBatch() would
            // re-trigger _schedulePush, which we don't want during a merge.
            await this._worker.batch(batchStatements);
            this._notify();
        }
    }
}