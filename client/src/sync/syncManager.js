/**
 * syncManager.js
 *
 * Offline-first sync layer.
 *
 * Strategy:
 *   - Every write goes to the local sql.js SQLite DB immediately (optimistic).
 *   - If the server is reachable the same write is also sent to the server.
 *   - If the server is unreachable the write is recorded in `pending_ops`.
 *   - On reconnect (or on every periodic health-check) pending_ops are
 *     flushed to the server via POST /api/sync/flush.
 *   - On startup (or re-connect) the client pulls the latest server state
 *     via GET /api/sync/pull and merges it into the local DB.
 *
 * Usage (from a React hook):
 *   const sm = await SyncManager.getInstance();
 *   const result = await sm.query('SELECT * FROM tasks WHERE listID = ?', [id]);
 *   await sm.execute('INSERT INTO tasks (...) VALUES (?,...)', [...values], {
 *     serverMethod: 'POST',
 *     serverPath: '/api/kanban/tasks',
 *     serverBody: { ...taskObj },
 *   });
 */

const API = 'http://localhost:8080/api';
const DB_STORAGE_KEY_PREFIX = 'studyspace_db_'; // + userId

// ─── Schema (mirrors server db.mjs) ─────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    userID TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    userID TEXT NOT NULL,
    categoryID TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS kanban_tabs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'New Tab',
    color TEXT NOT NULL DEFAULT '#888888',
    tabOrder INTEGER NOT NULL DEFAULT 0,
    isArchived INTEGER NOT NULL DEFAULT 0,
    workspaceID TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    color TEXT,
    direction TEXT,
    columnIndex INTEGER NOT NULL DEFAULT 0,
    workspaceID TEXT NOT NULL,
    tabID TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    isCompleted BOOLEAN,
    originalCategory TEXT,
    color TEXT,
    listID TEXT NOT NULL,
    taskOrder INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '{}',
    workspaceID TEXT UNIQUE NOT NULL,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pending_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT NOT NULL
  );
`;

// ─── Singleton ───────────────────────────────────────────────────────────────

let instance = null;

export class SyncManager {
  constructor() {
    this._db = null;
    this._SQL = null;
    this._online = true;
    this._userId = null;
    this._flushTimer = null;
    this._listeners = new Set(); // () => void  — called when local DB changes
  }

  /** Always use this instead of `new SyncManager()` */
  static async getInstance() {
    if (!instance) {
      instance = new SyncManager();
      await instance._init();
    }
    return instance;
  }

  /** Reset the singleton (e.g. on logout) */
  static reset() {
    if (instance) {
      instance._stopFlushTimer();
      instance._db?.close();
    }
    instance = null;
  }

  // ─── Initialisation ────────────────────────────────────────────────────────

  async _init() {
    // Load sql.js from CDN
    const initSqlJs = await this._loadSqlJs();
    this._SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` });

    this._db = new this._SQL.Database();
    this._db.run(SCHEMA_SQL);

    // Restore persisted DB if available
    this._restoreFromStorage();

    // Listen for online/offline events
    window.addEventListener('online', () => this._handleOnline());
    window.addEventListener('offline', () => this._handleOffline());
    this._online = navigator.onLine;

    // Periodic health-check every 5 s
    this._startFlushTimer();
  }

  _loadSqlJs() {
    return new Promise((resolve, reject) => {
      if (window.initSqlJs) { resolve(window.initSqlJs); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
      s.onload = () => resolve(window.initSqlJs);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ─── Persistence (localStorage, base64) ───────────────────────────────────

  _storageKey() {
    return DB_STORAGE_KEY_PREFIX + (this._userId || 'anon');
  }

  _persistToStorage() {
    try {
      const data = this._db.export(); // Uint8Array
      const b64 = btoa(String.fromCharCode(...data));
      localStorage.setItem(this._storageKey(), b64);
    } catch (e) {
      console.warn('[SyncManager] persist failed:', e);
    }
  }

  _restoreFromStorage() {
    try {
      const b64 = localStorage.getItem(this._storageKey());
      if (!b64) return;
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      this._db = new this._SQL.Database(arr);
      // Re-run schema to add any new tables
      this._db.run(SCHEMA_SQL);
    } catch (e) {
      console.warn('[SyncManager] restore failed, starting fresh:', e);
      this._db = new this._SQL.Database();
      this._db.run(SCHEMA_SQL);
    }
  }

  // ─── User context ──────────────────────────────────────────────────────────

  /** Call this after login so the DB key is user-specific */
  setUser(userId) {
    if (this._userId === userId) return;
    this._userId = userId;
    // Try to restore a saved DB for this user
    this._restoreFromStorage();
  }

  // ─── Online / Offline ──────────────────────────────────────────────────────

  _handleOnline() {
    this._online = true;
    console.log('[SyncManager] Back online — flushing pending ops');
    this.flushPending();
    this.pullFromServer();
  }

  _handleOffline() {
    this._online = false;
    console.log('[SyncManager] Offline — writes will queue locally');
  }

  _startFlushTimer() {
    this._flushTimer = setInterval(async () => {
      const reachable = await this._checkServer();
      if (reachable && !this._online) this._handleOnline();
      else if (reachable) {
        this.flushPending();
      }
    }, 5000);
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

  // ─── Change listeners ──────────────────────────────────────────────────────

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    if (!this._db) return;
    this._persistToStorage();
    this._listeners.forEach(fn => fn());
  }

  /**
   * Run multiple SQL statements atomically in a single transaction.
   * Used for bulk reorders where we want one server op but many local writes.
   * Does NOT trigger a server call — pass serverOp separately if needed.
   */
  runBatch(statements) {
    if (!this._db) return;
    this._db.run('BEGIN');
    try {
      for (const { sql, params = [] } of statements) {
        this._db.run(sql, params);
      }
      this._db.run('COMMIT');
    } catch (e) {
      this._db.run('ROLLBACK');
      throw e;
    }
    this._notify();
  }

  // ─── Core DB API ───────────────────────────────────────────────────────────

  /**
   * Read-only query. Returns array of plain objects.
   * Returns [] safely if the DB is not yet ready.
   */
  query(sql, params = []) {
    if (!this._db) return [];
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /**
   * Write to local DB. Optionally syncs to server.
   *
   * @param {string} sql - SQL statement
   * @param {Array}  params
   * @param {{ serverMethod?: string, serverPath?: string, serverBody?: object }} [serverOp]
   */
  async execute(sql, params = [], serverOp = null) {
    if (!this._db) { console.warn('[SyncManager] execute() called before DB ready'); return; }
    this._db.run(sql, params);
    this._notify();

    if (!serverOp) return;

    if (this._online) {
      try {
        const r = await fetch(`${API}${serverOp.serverPath}`, {
          method: serverOp.serverMethod || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverOp.serverBody ?? {}),
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) throw new Error(`Server ${r.status}`);
        return await r.json();
      } catch (e) {
        console.warn('[SyncManager] Server write failed, queuing:', e.message);
        this._online = false;
        this._enqueuePending(serverOp);
      }
    } else {
      this._enqueuePending(serverOp);
    }
  }

  // ─── Pending queue ─────────────────────────────────────────────────────────

  _enqueuePending({ serverMethod, serverPath, serverBody }) {
    if (!this._db) return;
    this._db.run(
      `INSERT INTO pending_ops (created_at, method, path, body) VALUES (?, ?, ?, ?)`,
      [Date.now(), serverMethod || 'POST', serverPath, JSON.stringify(serverBody ?? {})]
    );
    this._persistToStorage();
  }

  pendingCount() {
    const rows = this.query('SELECT COUNT(*) as n FROM pending_ops');
    return rows[0]?.n ?? 0;
  }

  /**
   * Flush all pending ops to the server in order.
   * Called on reconnect or by timer.
   */
  async flushPending() {
    const ops = this.query('SELECT * FROM pending_ops ORDER BY id ASC');
    if (ops.length === 0) return;

    console.log(`[SyncManager] Flushing ${ops.length} pending op(s)`);

    // Send them to the batch endpoint
    try {
      const r = await fetch(`${API}/sync/flush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: ops.map(o => ({ method: o.method, path: o.path, body: JSON.parse(o.body) })) }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        // Clear all pending ops that were just sent
        this._db.run('DELETE FROM pending_ops WHERE id <= ?', [ops[ops.length - 1].id]);
        this._persistToStorage();
        console.log('[SyncManager] Flush complete');
      }
    } catch (e) {
      console.warn('[SyncManager] Flush failed:', e.message);
      this._online = false;
    }
  }

  // ─── Pull from server ──────────────────────────────────────────────────────

  /**
   * Pull the full server state for a user and merge into local DB.
   * Server returns { workspaces, categories, tabs, lists, tasks, notes }.
   * Strategy: server wins for all records (last-write-wins by server timestamp).
   */
  async pullFromServer(userId) {
    const uid = userId || this._userId;
    if (!uid) return;
    try {
      const r = await fetch(`${API}/sync/pull?userID=${uid}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const data = await r.json();
      this._mergeServerData(data);
    } catch (e) {
      console.warn('[SyncManager] Pull failed:', e.message);
    }
  }

  _mergeServerData({ workspaces = [], categories = [], tabs = [], lists = [], tasks = [], notes = [] }) {
    if (!this._db) return;
    // Upsert everything from the server — server wins
    const upsertWorkspace = this._db.prepare(
      `INSERT OR REPLACE INTO workspaces (id, name, userID, categoryID, createdAt) VALUES (?,?,?,?,?)`
    );
    workspaces.forEach(w => upsertWorkspace.run([w.id, w.name, w.userID, w.categoryID, w.createdAt]));
    upsertWorkspace.free();

    const upsertCategory = this._db.prepare(
      `INSERT OR REPLACE INTO categories (id, name, color, userID) VALUES (?,?,?,?)`
    );
    categories.forEach(c => upsertCategory.run([c.id, c.name, c.color, c.userID]));
    upsertCategory.free();

    const upsertTab = this._db.prepare(
      `INSERT OR REPLACE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`
    );
    tabs.forEach(t => upsertTab.run([t.id, t.name, t.color, t.tabOrder, t.isArchived, t.workspaceID]));
    upsertTab.free();

    const upsertList = this._db.prepare(
      `INSERT OR REPLACE INTO lists (id, name, category, color, direction, columnIndex, workspaceID, tabID) VALUES (?,?,?,?,?,?,?,?)`
    );
    lists.forEach(l => upsertList.run([l.id, l.name, l.category, l.color, l.direction, l.columnIndex, l.workspaceID, l.tabID]));
    upsertList.free();

    const upsertTask = this._db.prepare(
      `INSERT OR REPLACE INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder) VALUES (?,?,?,?,?,?,?,?)`
    );
    tasks.forEach(t => upsertTask.run([t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder]));
    upsertTask.free();

    const upsertNote = this._db.prepare(
      `INSERT OR REPLACE INTO notes (id, content, workspaceID, updatedAt) VALUES (?,?,?,?)`
    );
    notes.forEach(n => upsertNote.run([n.id, n.content, n.workspaceID, n.updatedAt]));
    upsertNote.free();

    this._notify();
    console.log('[SyncManager] Merged server data');
  }
}