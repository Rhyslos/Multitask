import DbWorker from './dbWorker.js?worker';

const API = 'http://localhost:8080/api';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, userID TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, userID TEXT NOT NULL, categoryID TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspaceID TEXT NOT NULL, userID TEXT NOT NULL, role TEXT DEFAULT 'editor', updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'New Tab', color TEXT NOT NULL DEFAULT '#888888', tabOrder INTEGER NOT NULL DEFAULT 0, isArchived INTEGER NOT NULL DEFAULT 0, workspaceID TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS kanban_columns (id TEXT PRIMARY KEY, tabID TEXT NOT NULL, workspaceID TEXT NOT NULL, columnIndex INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, color TEXT, direction TEXT, columnID TEXT NOT NULL, workspaceID TEXT NOT NULL, tabID TEXT, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, isCompleted BOOLEAN, originalCategory TEXT, color TEXT, listID TEXT NOT NULL, taskOrder INTEGER NOT NULL DEFAULT 0, deadline TEXT, subtasks TEXT, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '{}', workspaceID TEXT UNIQUE NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
  CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(listID, taskOrder);
  CREATE INDEX IF NOT EXISTS idx_lists_column ON lists(columnID);
  CREATE INDEX IF NOT EXISTS idx_columns_tab ON kanban_columns(workspaceID, tabID);
`;

const SYNC_TABLES = ['categories', 'workspaces', 'kanban_tabs', 'kanban_columns', 'lists', 'tasks', 'notes'];

let instancePromise = null;

export class SyncManager {
    constructor() {
        this._worker = null;
        this._online = navigator.onLine;
        this._userId = null;
        this._flushTimer = null;
        this._listeners = new Set();
        this._listenersAttached = false;
        this._msgId = 0;
        this._pendingRequests = new Map();
        this._syncing = false;
        this._syncDebounceTimer = null;
        this._syncNowDebounce = null; // Added for pull debouncing
        this._dbReadyResolver = null;
        this._dbReadyPromise = new Promise(res => { this._dbReadyResolver = res; });
    }

    get isOnline() { return this._online; }

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
                manager._stopFlushTimer();
                if (manager._worker) {
                    manager._worker.postMessage({ type: 'CLOSE', msgId: ++manager._msgId });
                    manager._worker.terminate();
                }
            });
        }
        instancePromise = null;
    }

    async _init() {
        return new Promise((resolve, reject) => {
            this._worker = new DbWorker();
            this._worker.onmessage = (event) => {
                const { type, payload, msgId } = event.data;
                if (this._pendingRequests.has(msgId)) {
                    const { res, rej } = this._pendingRequests.get(msgId);
                    this._pendingRequests.delete(msgId);
                    if (type === 'ERROR') rej(new Error(payload));
                    else res(payload);
                    return;
                }
                if (type === 'ERROR') console.error('[SyncManager Worker]', payload);
            };
            this._worker.onerror = (error) => reject(error);
            resolve();
        });
    }

    async setUser(userId) {
        if (this._userId === userId) return;
        this._userId = userId;
        if (this._dbReadyResolver === null) this._dbReadyPromise = new Promise(res => { this._dbReadyResolver = res; });

        try {
            await this._execWorker('INIT', { dbName: `studyspace_${userId}` });
            await this._execWorker('EXECUTE', { sql: SCHEMA_SQL });

            if (!this._listenersAttached) {
                this._setupNetworkListeners();
                this._listenersAttached = true;
            }
            this._startFlushTimer();
            this._dbReadyResolver();
            this._dbReadyResolver = null;

            if (this._online) this.sync();
        } catch (e) {
            console.error('Failed to initialize user DB:', e);
        }
    }

    _setupNetworkListeners() {
        window.addEventListener('online', () => { this._setOnline(true); this.sync(); });
        window.addEventListener('offline', () => { this._setOnline(false); });
    }

    _startFlushTimer() {
        this._flushTimer = setInterval(async () => {
            const reachable = await this._checkServer();
            if (reachable) {
                this._setOnline(true);
                const syncKey = `sync_time_${this._userId}`;
                
                // Overlap flush check by 2 seconds
                let safeTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';
                if (safeTime !== '1970-01-01 00:00:00') {
                    const d = new Date(safeTime.replace(' ', 'T') + 'Z');
                    d.setSeconds(d.getSeconds() - 2);
                    safeTime = d.toISOString().replace('T', ' ').slice(0, 19);
                }
                
                let hasChanges = false;
                for (const table of SYNC_TABLES) {
                    const rows = await this.query(`SELECT id FROM ${table} WHERE updatedAt > ? LIMIT 1`, [safeTime]);
                    if (rows.length > 0) { hasChanges = true; break; }
                }
                if (hasChanges) this.sync();
            } else {
                this._setOnline(false);
            }
        }, 2000);
    }

    _stopFlushTimer() { if (this._flushTimer) clearInterval(this._flushTimer); }

    async _checkServer() {
        try {
            const r = await fetch(`${API}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
            return r.ok;
        } catch {
            return false;
        }
    }

    subscribe(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify() { this._listeners.forEach(fn => fn()); }

    _execWorker(type, payloadData) {
        return new Promise((res, rej) => {
            const msgId = ++this._msgId;
            this._pendingRequests.set(msgId, { res, rej });
            this._worker.postMessage({ type, msgId, ...payloadData });
        });
    }

    async query(sql, params = []) {
        await this._dbReadyPromise;
        return await this._execWorker('QUERY', { sql, params });
    }

    async execute(sql, params = []) {
        await this._dbReadyPromise;
        await this._execWorker('EXECUTE', { sql, params });
        this._notify();
        if (this._online) this.sync(); // Local changes SHOULD trigger an outbound push
    }

    async runBatch(statements) {
        await this._dbReadyPromise;
        await this._execWorker('BATCH', { statements });
        this._notify();
        // FIX 1: Removed `if (this._online) this.sync();` to prevent the infinite ping-pong loop!
    }

    async sync() {
        if (this._syncing || !this._online || !this._userId) return;
        clearTimeout(this._syncDebounceTimer);

        this._syncDebounceTimer = setTimeout(async () => {
            try {
                this._syncing = true;
                await this._dbReadyPromise;

                const syncKey = `sync_time_${this._userId}`;
                const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';
                
                // FIX 2: Create a 2-second overlap window to prevent SQLite precision tearing
                let safeSyncTime = lastSyncTime;
                if (lastSyncTime !== '1970-01-01 00:00:00') {
                    const d = new Date(lastSyncTime.replace(' ', 'T') + 'Z');
                    d.setSeconds(d.getSeconds() - 2);
                    safeSyncTime = d.toISOString().replace('T', ' ').slice(0, 19);
                }

                const pushPayload = {};
                for (const table of SYNC_TABLES) {
                    const changedRows = await this.query(`SELECT * FROM ${table} WHERE updatedAt > ?`, [safeSyncTime]);
                    if (changedRows.length > 0) pushPayload[table] = changedRows;
                }

                const flightTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

                const r = await fetch(`${API}/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userID: this._userId, lastSync: safeSyncTime, clientChanges: pushPayload }),
                    signal: AbortSignal.timeout(5000),
                });

                if (!r.ok) throw new Error(`Sync failed: ${r.status}`);

                const serverChanges = await r.json();
                await this._mergeServerData(serverChanges);
                localStorage.setItem(syncKey, flightTime);
                this._setOnline(true);
            } catch (e) {
                this._setOnline(false);
            } finally {
                this._syncing = false;
            }
        }, 300);
    }

    async syncNow() {
        if (!this._online || !this._userId) return;
        
        // FIX 3: Debounce incoming SSE triggers to prevent DDOSing the server
        clearTimeout(this._syncNowDebounce);
        this._syncNowDebounce = setTimeout(async () => {
            try {
                await this._dbReadyPromise;
                const syncKey = `sync_time_${this._userId}`;
                const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';
                const currentSyncTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

                let safeSyncTime = lastSyncTime;
                if (lastSyncTime !== '1970-01-01 00:00:00') {
                    const d = new Date(lastSyncTime.replace(' ', 'T') + 'Z');
                    d.setSeconds(d.getSeconds() - 2);
                    safeSyncTime = d.toISOString().replace('T', ' ').slice(0, 19);
                }

                const r = await fetch(
                    `${API}/sync?userID=${encodeURIComponent(this._userId)}&lastSync=${encodeURIComponent(safeSyncTime)}`,
                    { signal: AbortSignal.timeout(5000) }
                );
                
                if (!r.ok) throw new Error(`syncNow failed: ${r.status}`);

                const serverChanges = await r.json();
                await this._mergeServerData(serverChanges);
                localStorage.setItem(syncKey, currentSyncTime);
                this._setOnline(true);
            } catch (e) {
                console.warn('[SyncManager] syncNow failed:', e.message);
            }
        }, 300);
    }

    async _mergeServerData(serverChanges) {
        // FIX 4: Swapped INSERT OR REPLACE for ON CONFLICT DO UPDATE so the 2-second overlap window doesn't overwrite your newer local edits
        if (serverChanges.categories?.length) {
            await this.runBatch(serverChanges.categories.map(c => ({
                sql: `INSERT INTO categories (id, name, color, userID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, userID=excluded.userID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > categories.updatedAt`,
                params: [c.id, c.name, c.color, c.userID, c.updatedAt, c.isDeleted],
            })));
        }

        if (serverChanges.workspaces?.length) {
            await this.runBatch(serverChanges.workspaces.map(w => ({
                sql: `INSERT INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, userID=excluded.userID, categoryID=excluded.categoryID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > workspaces.updatedAt`,
                params: [w.id, w.name, w.userID, w.categoryID, w.createdAt, w.updatedAt, w.isDeleted],
            })));
        }

        if (serverChanges.kanban_tabs?.length) {
            await this.runBatch(serverChanges.kanban_tabs.map(t => ({
                sql: `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, tabOrder=excluded.tabOrder, isArchived=excluded.isArchived, workspaceID=excluded.workspaceID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > kanban_tabs.updatedAt`,
                params: [t.id, t.name, t.color, t.tabOrder, t.isArchived, t.workspaceID, t.updatedAt, t.isDeleted],
            })));
        }

        if (serverChanges.kanban_columns?.length) {
            await this.runBatch(serverChanges.kanban_columns.map(c => ({
                sql: `INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex, updatedAt, isDeleted) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tabID=excluded.tabID, workspaceID=excluded.workspaceID, columnIndex=excluded.columnIndex, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > kanban_columns.updatedAt`,
                params: [c.id, c.tabID, c.workspaceID, c.columnIndex, c.updatedAt, c.isDeleted],
            })));
        }

        if (serverChanges.lists?.length) {
            await this.runBatch(serverChanges.lists.map(l => ({
                sql: `INSERT INTO lists (id, name, category, color, direction, columnID, workspaceID, tabID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, color=excluded.color, direction=excluded.direction, columnID=excluded.columnID, workspaceID=excluded.workspaceID, tabID=excluded.tabID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > lists.updatedAt`,
                params: [l.id, l.name, l.category, l.color, l.direction, l.columnID, l.workspaceID, l.tabID, l.updatedAt, l.isDeleted],
            })));
        }

        if (serverChanges.tasks?.length) {
            await this.runBatch(serverChanges.tasks.map(t => ({
                sql: `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, isCompleted=excluded.isCompleted, originalCategory=excluded.originalCategory, color=excluded.color, listID=excluded.listID, taskOrder=excluded.taskOrder, deadline=excluded.deadline, subtasks=excluded.subtasks, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > tasks.updatedAt`,
                params: [t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder, t.deadline, t.subtasks, t.updatedAt, t.isDeleted],
            })));
        }

        if (serverChanges.notes?.length) {
            await this.runBatch(serverChanges.notes.map(n => ({
                sql: `INSERT INTO notes (id, content, workspaceID, updatedAt, isDeleted) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content, workspaceID=excluded.workspaceID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted WHERE excluded.updatedAt > notes.updatedAt`,
                params: [n.id, n.content, n.workspaceID, n.updatedAt, n.isDeleted],
            })));
        }
    }
}