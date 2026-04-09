import DbWorker from './dbWorker.js?worker';

const API = 'http://localhost:8080/api';

// schema functions
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, userID TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, userID TEXT NOT NULL, categoryID TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  
  CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspaceID TEXT NOT NULL, userID TEXT NOT NULL, role TEXT DEFAULT 'editor', updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  
  CREATE TABLE IF NOT EXISTS kanban_tabs (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'New Tab', color TEXT NOT NULL DEFAULT '#888888', tabOrder INTEGER NOT NULL DEFAULT 0, isArchived INTEGER NOT NULL DEFAULT 0, workspaceID TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, color TEXT, direction TEXT, columnIndex INTEGER NOT NULL DEFAULT 0, workspaceID TEXT NOT NULL, tabID TEXT, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, isCompleted BOOLEAN, originalCategory TEXT, color TEXT, listID TEXT NOT NULL, taskOrder INTEGER NOT NULL DEFAULT 0, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '{}', workspaceID TEXT UNIQUE NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, isDeleted INTEGER DEFAULT 0);

  CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
  CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
`;

let instancePromise = null;

export class SyncManager {
  
  // initialization functions
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
    
    // The "Lock" that pauses queries until the DB file is initialized
    this._dbReadyResolver = null;
    this._dbReadyPromise = new Promise(res => { this._dbReadyResolver = res; });
  }

  get isOnline(){
    return this._online;
  }

  _setOnline(status){
    if(this._online !== status){
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

        // Route responses back to their specific awaiting Promises
        if (this._pendingRequests.has(msgId)) {
          const { res, rej } = this._pendingRequests.get(msgId);
          this._pendingRequests.delete(msgId);
          if (type === 'ERROR') rej(new Error(payload));
          else res(payload);
          return;
        }

        if (type === 'ERROR') {
          console.error('[SyncManager Worker]', payload);
        }
      };

      this._worker.onerror = (error) => reject(error);
      
      // Resolve instance creation immediately. Queries will wait for the _dbReadyPromise lock.
      resolve(); 
    });
  }

  // user context functions
  async setUser(userId) {
    if (this._userId === userId) return;
    this._userId = userId;

    // Reset the lock if a different user logs in
    if (this._dbReadyResolver === null) {
      this._dbReadyPromise = new Promise(res => { this._dbReadyResolver = res; });
    }

    try {
      // 1. Tell worker to create/open this specific user's file
      await this._execWorker('INIT', { dbName: `studyspace_${userId}` });
      
      // 2. Setup schema (bypassing the lock since we use _execWorker directly)
      await this._execWorker('EXECUTE', { sql: SCHEMA_SQL });

      if (!this._listenersAttached) {
        this._setupNetworkListeners();
        this._listenersAttached = true;
      }
      this._startFlushTimer();

      // 3. UNLOCK! All paused React queries will now fire simultaneously
      this._dbReadyResolver();
      this._dbReadyResolver = null;

      if (this._online) {
        this.sync();
      }
    } catch (e) {
      console.error('Failed to initialize user DB:', e);
    }
  }

  // network functions
  _setupNetworkListeners() {
    window.addEventListener('online', () => {
      this._setOnline(true);
      this.sync();
    });
    window.addEventListener('offline', () => {
      this._setOnline(false);
    });
  }

  _startFlushTimer() {
    this._flushTimer = setInterval(async () => {
        const reachable = await this._checkServer();
        if (reachable) {
            this._setOnline(true);
            // Only push if there are actual local changes since last sync.
            // This prevents the timer from broadcasting to coworkers
            // every 2 seconds even when nothing has changed.
            const syncKey = `sync_time_${this._userId}`;
            const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';
            const tables = ['categories', 'workspaces', 'kanban_tabs', 'lists', 'tasks', 'notes'];
            let hasChanges = false;
            for (const table of tables) {
                const rows = await this.query(`SELECT id FROM ${table} WHERE updatedAt > ? LIMIT 1`, [lastSyncTime]);
                if (rows.length > 0) { hasChanges = true; break; }
            }
            if (hasChanges) this.sync();
        } else {
            this._setOnline(false);
        }
    }, 2000);
}

  _stopFlushTimer() {
    if (this._flushTimer) clearInterval(this._flushTimer);
  }

  async _checkServer() {
    try {
      const r = await fetch(`${API}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch {
      return false;
    }
  }

  // subscription functions
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => fn());
  }

  // worker communication functions
  _execWorker(type, payloadData) {
    return new Promise((res, rej) => {
      const msgId = ++this._msgId;
      this._pendingRequests.set(msgId, { res, rej });
      this._worker.postMessage({ type, msgId, ...payloadData });
    });
  }

  // query functions
  async query(sql, params = []) {
    await this._dbReadyPromise; // PAUSE if DB is not ready yet
    return await this._execWorker('QUERY', { sql, params });
  }

  async execute(sql, params = []) {
    await this._dbReadyPromise; // PAUSE if DB is not ready yet
    await this._execWorker('EXECUTE', { sql, params });
    this._notify();

    if (this._online) {
      this.sync();
    }
  }

  async runBatch(statements) {
    await this._dbReadyPromise; // PAUSE if DB is not ready yet
    await this._execWorker('BATCH', { statements });
    this._notify();
  }

  // sync functions
  async sync() {
    if (this._syncing || !this._online || !this._userId) return;

    clearTimeout(this._syncDebounceTimer);

    this._syncDebounceTimer = setTimeout(async () => {
      try {
        this._syncing = true;
        await this._dbReadyPromise;

        const syncKey = `sync_time_${this._userId}`;
        const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';

        const tables = ['categories', 'workspaces', 'kanban_tabs', 'lists', 'tasks', 'notes'];
        const pushPayload = {};

        for (const table of tables) {
          const changedRows = await this.query(`SELECT * FROM ${table} WHERE updatedAt > ?`, [lastSyncTime]);
          if (changedRows.length > 0) {
            pushPayload[table] = changedRows;
          }
        }

        // Snapshot time AFTER collecting rows but BEFORE the fetch.
        // Any write that arrives after this point will have updatedAt > flightTime
        // and will be caught by the follow-up sync triggered below.
        const flightTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

        const r = await fetch(`${API}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userID: this._userId, lastSync: lastSyncTime, clientChanges: pushPayload }),
          signal: AbortSignal.timeout(5000),
        });

        if (!r.ok) throw new Error(`Sync failed: ${r.status}`);

        const serverChanges = await r.json();
        await this._mergeServerData(serverChanges);

        // Advance cursor to flightTime only — writes after the snapshot are still
        // > flightTime and will be included in the next sync.
        localStorage.setItem(syncKey, flightTime);
        this._setOnline(true);

        // If new local writes landed while the fetch was in-flight, sync again
        // immediately so they aren't stranded until the 2s timer fires.
        let hasUnsynced = false;
        for (const table of tables) {
          const rows = await this.query(`SELECT id FROM ${table} WHERE updatedAt > ? LIMIT 1`, [flightTime]);
          if (rows.length > 0) { hasUnsynced = true; break; }
        }
        if (hasUnsynced) {
          this._syncing = false; // release lock before re-triggering
          this.sync();
          return;
        }
      } catch (e) {
        this._setOnline(false);
      } finally {
        this._syncing = false;
      }
    }, 300);
  }

  // Pure pull triggered by SSE. Skips the debounce and the _syncing guard
  // because we're not pushing anything — there's no risk of broadcast loops.
  async syncNow() {
    if (!this._online || !this._userId) return;
    try {
      await this._dbReadyPromise;
      const syncKey = `sync_time_${this._userId}`;
      const lastSyncTime = localStorage.getItem(syncKey) || '1970-01-01 00:00:00';
      const currentSyncTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

      const r = await fetch(
        `${API}/sync?userID=${encodeURIComponent(this._userId)}&lastSync=${encodeURIComponent(lastSyncTime)}`,
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
  }

  async _mergeServerData(serverChanges) {
    const statements = [];

    if (serverChanges.categories) {
      serverChanges.categories.forEach(c => statements.push({ sql: `INSERT OR REPLACE INTO categories (id, name, color, userID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?)`, params: [c.id, c.name, c.color, c.userID, c.updatedAt, c.isDeleted] }));
    }
    if (serverChanges.workspaces) {
      serverChanges.workspaces.forEach(w => statements.push({ sql: `INSERT OR REPLACE INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?)`, params: [w.id, w.name, w.userID, w.categoryID, w.createdAt, w.updatedAt, w.isDeleted] }));
    }
    if (serverChanges.kanban_tabs) {
      serverChanges.kanban_tabs.forEach(t => statements.push({ sql: `INSERT OR REPLACE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?)`, params: [t.id, t.name, t.color, t.tabOrder, t.isArchived, t.workspaceID, t.updatedAt, t.isDeleted] }));
    }
    if (serverChanges.lists) {
      serverChanges.lists.forEach(l => statements.push({ sql: `INSERT OR REPLACE INTO lists (id, name, category, color, direction, columnIndex, workspaceID, tabID, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?,?,?)`, params: [l.id, l.name, l.category, l.color, l.direction, l.columnIndex, l.workspaceID, l.tabID, l.updatedAt, l.isDeleted] }));
    }
    if (serverChanges.tasks) {
      serverChanges.tasks.forEach(t => statements.push({ sql: `INSERT OR REPLACE INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, updatedAt, isDeleted) VALUES (?,?,?,?,?,?,?,?,?,?)`, params: [t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder, t.updatedAt, t.isDeleted] }));
    }
    if (serverChanges.notes) {
      serverChanges.notes.forEach(n => statements.push({ sql: `INSERT OR REPLACE INTO notes (id, content, workspaceID, updatedAt, isDeleted) VALUES (?,?,?,?,?)`, params: [n.id, n.content, n.workspaceID, n.updatedAt, n.isDeleted] }));
    }

    if (statements.length > 0) {
      await this.runBatch(statements);
    }
  }
}