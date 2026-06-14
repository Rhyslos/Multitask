// initialization functions
import { WorkerClient } from './workerClient.js';

const API = 'http://localhost:8080/api';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL, displayName TEXT, firstName TEXT, lastName TEXT, countryIso TEXT, phoneNumber TEXT, gender TEXT, skillset TEXT, cursorColor TEXT, privacySettings TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, userID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, userID TEXT NOT NULL, categoryID TEXT, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspaceID TEXT NOT NULL, userID TEXT NOT NULL, role TEXT DEFAULT 'editor', joinedAt DATETIME, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'New Tab', color TEXT NOT NULL DEFAULT '#888888', tabOrder INTEGER NOT NULL DEFAULT 0, isArchived INTEGER NOT NULL DEFAULT 0, workspaceID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_columns (id TEXT PRIMARY KEY, tabID TEXT NOT NULL, workspaceID TEXT NOT NULL, columnIndex INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, color TEXT, direction TEXT, listOrder INTEGER NOT NULL DEFAULT 0, columnID TEXT NOT NULL, workspaceID TEXT NOT NULL, tabID TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, isCompleted BOOLEAN, originalCategory TEXT, color TEXT, listID TEXT NOT NULL, taskOrder INTEGER NOT NULL DEFAULT 0, deadline TEXT, subtasks TEXT, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '{}', workspaceID TEXT NOT NULL, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notation_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT, workspaceID TEXT NOT NULL, groupOrder INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notation_pages (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT 'Untitled', workspaceID TEXT NOT NULL, groupID TEXT, pageOrder INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME NOT NULL, isDeleted INTEGER INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
  CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(listID, taskOrder);
  CREATE INDEX IF NOT EXISTS idx_lists_column ON lists(columnID);
  CREATE INDEX IF NOT EXISTS idx_columns_tab ON kanban_columns(workspaceID, tabID);
`;

const SYNC_TABLES = ['users', 'categories', 'workspaces', 'workspace_members', 'kanban_tabs', 'kanban_columns', 'lists', 'tasks', 'notes', 'notation_groups', 'notation_pages'];

const MIGRATIONS = [
    { table: 'users', column: 'cursorColor', type: 'TEXT' },
];

const PUSH_DEBOUNCE_MS = 250;

let instancePromise = null;

// class functions
export class SyncManager {
    constructor() {
        this._worker = null;
        this._online = navigator.onLine;
        this._userId = null;
        this._listeners = new Set();
        this._listenersAttached = false;
        this._clientId = crypto.randomUUID();
        this._syncing = false;
        this._pushDebounceTimer = null;
        this._pendingPushResolvers = [];
        this._pullQueued = false;
        this._pushQueued = false;
        this._pushQueuedResolvers = [];
        this._onPushComplete = [];
        this._onOnline = null;
        this._onOffline = null;
        this._streamEmail = null;
        this._eventSource = null;
        this._streamRetryDelay = 1000;
        this._streamRetryTimer = null;
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
                    manager._worker.close().catch(() => {});
                    manager._worker.terminate();
                }
            });
        }
        instancePromise = null;
    }

    // database functions
    async _init() {
        this._worker = new WorkerClient();
    }

    // user functions
    async setUser(userId, email = null) {
        if (this._userId === userId) {
            if (email && email !== this._streamEmail) this.connectStream(email);
            return;
        }
        this._userId = userId;

        this._resetDbReady();

        try {
            await this._worker.init(`studyspace_${userId}_v2`);
            await this._worker.execute(SCHEMA_SQL);
            await this._runMigrations();

            if (!this._listenersAttached) {
                this._setupNetworkListeners();
                this._listenersAttached = true;
            }

            this._dbReadyResolver();

            if (this._online) this._reconcile();

            if (email) this.connectStream(email);
        } catch (e) {
            console.error(e);
        }
    }

    // Applies MIGRATIONS to the local DB. Uses the worker directly (not the
    // public query/execute) because _dbReadyPromise has not resolved yet at
    // this point, and we don't want a migration to trigger a sync push.
    async _runMigrations() {
        for (const { table, column, type } of MIGRATIONS) {
            try {
                const cols = await this._worker.query(`PRAGMA table_info(${table})`);
                // PRAGMA rows are normally objects ({ name: 'colname', ... }).
                // Guard against an array-row shape just in case the worker
                // returns positional rows — column name is index 1 there.
                const exists = Array.isArray(cols) && cols.some(c =>
                    (c && c.name === column) ||
                    (Array.isArray(c) && c[1] === column)
                );
                if (!exists) {
                    await this._worker.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
                    console.log(`[sync] migration: added ${table}.${column}`);
                }
            } catch (e) {
                console.error(`[sync] migration failed for ${table}.${column}:`, e.message);
            }
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
    connectStream(email) {
        if (!email) return;
        if (this._streamEmail === email && this._eventSource) return;

        this.disconnectStream();
        this._streamEmail = email;
        this._streamRetryDelay = 1000;
        this._openEventSource();
    }

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
        const connectingAs = this._streamEmail;
        if (!connectingAs) return;

        const es = new EventSource(`${API}/network/stream/${connectingAs}`);
        this._eventSource = es;

        es.onopen = () => {
            this._streamRetryDelay = 1000;
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

            if (data.type === 'kanban_updated') {
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
            if (this._eventSource === es) this._eventSource = null;

            if (!this._streamEmail) return;

            const reconnectingAs = connectingAs;
            this._streamRetryTimer = setTimeout(() => {
                this._streamRetryTimer = null;
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

    async flushPush() {
        if (this._pushDebounceTimer) {
            clearTimeout(this._pushDebounceTimer);
            this._pushDebounceTimer = null;
            this._runPush();
        }

        while (this._syncing || this._pushQueued || this._pushDebounceTimer) {
            await new Promise(resolve => this._onPushComplete.push(resolve));
        }
    }

    _signalPushComplete() {
        const waiters = this._onPushComplete;
        this._onPushComplete = [];
        waiters.forEach(r => r());
    }

    async pullFromServer() {
        if (!this._online || !this._userId) return;
        if (this._syncing) {
            this._pullQueued = true;
            return;
        }
        await this._runPull();
    }

    async _reconcile() {
        await this.pullFromServer();
        await this.flushPush();
    }

    async _runPush() {
        if (this._syncing) {
            this._pushQueued = true;
            const moved = this._pendingPushResolvers;
            this._pendingPushResolvers = [];
            this._pushQueuedResolvers.push(...moved);
            return;
        }

        const resolvers = this._pendingPushResolvers;
        this._pendingPushResolvers = [];

        const newWatermark = this._nowIso();

        try {
            this._syncing = true;
            await this._dbReadyPromise;

            const syncKey = `sync_time_${this._userId}`;
            const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00.000';

            const pushPayload = {};
            for (const table of SYNC_TABLES) {
                const changedRows = await this.query(
                    `SELECT * FROM ${table} WHERE updatedAt > ? AND updatedAt <= ?`,
                    [lastSyncTime, newWatermark]
                );
                if (changedRows.length > 0) pushPayload[table] = changedRows;
            }

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

            localStorage.setItem(syncKey, newWatermark);
            this._setOnline(true);
        } catch (e) {
            this._setOnline(false);
            console.error('[push]', e.message);
        } finally {
            this._syncing = false;
            resolvers.forEach(r => r());

            if (this._pushQueued) {
                this._pushQueued = false;
                this._pendingPushResolvers.push(...this._pushQueuedResolvers);
                this._pushQueuedResolvers = [];
                Promise.resolve().then(() => this._runPush());
            }

            if (this._pullQueued) {
                this._pullQueued = false;
                this.pullFromServer();
            }

            this._signalPushComplete();
        }
    }

    async _runPull() {
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

    // data processing functions
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
            await this._worker.batch(batchStatements);
            this._notify();
        }
    }
}