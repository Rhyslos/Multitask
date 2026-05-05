// Thin RPC wrapper around dbWorker.js. Owns the postMessage <-> Promise plumbing
// (msgId allocation, pending-request map, error routing) and exposes a typed
// method per worker command.
//
// This class deliberately knows nothing about sync, schemas, watermarks, or
// network state. It just sends commands to the worker and resolves the
// matching response. SyncManager composes a WorkerClient with everything else.
//
// Why split this out: the sync algorithm and the worker plumbing are two
// independent concerns. Reading SyncManager.runPush() shouldn't require
// scrolling past msgId bookkeeping. This class is also the natural unit to
// test in isolation if we ever want to.

import DbWorker from './dbWorker.js?worker';

export class WorkerClient {
    constructor() {
        this._worker = new DbWorker();
        this._msgId = 0;
        this._pendingRequests = new Map();

        this._worker.onmessage = (event) => {
            const { type, payload, msgId } = event.data;
            if (this._pendingRequests.has(msgId)) {
                const { res, rej } = this._pendingRequests.get(msgId);
                this._pendingRequests.delete(msgId);
                if (type === 'ERROR') rej(new Error(payload));
                else res(payload);
                return;
            }
            // Unsolicited error from the worker (no msgId match) — log and
            // drop. The worker shouldn't normally produce these.
            if (type === 'ERROR') console.error('[worker]', payload);
        };

        this._worker.onerror = (error) => {
            // Worker-level error not tied to a specific request (e.g. WASM
            // load failure). Reject every outstanding request so callers
            // don't hang.
            this._pendingRequests.forEach(({ rej }) => rej(error));
            this._pendingRequests.clear();
        };
    }

    /** Send a command to the worker and resolve when it replies. Internal —
     *  callers use the typed methods below. */
    _send(type, payload) {
        return new Promise((res, rej) => {
            const msgId = ++this._msgId;
            this._pendingRequests.set(msgId, { res, rej });
            this._worker.postMessage({ type, msgId, ...payload });
        });
    }

    /** Open (or reopen) the OPFS-backed SQLite database. */
    init(dbName) { return this._send('INIT', { dbName }); }

    /** Execute SQL with no result set (DDL / INSERT / UPDATE / DELETE). */
    execute(sql, params = []) { return this._send('EXECUTE', { sql, params }); }

    /** Run SQL and return matched rows as objects. */
    query(sql, params = []) { return this._send('QUERY', { sql, params }); }

    /** Run a list of {sql, params} statements as a single transaction. */
    batch(statements) { return this._send('BATCH', { statements }); }

    /** Close the database. The worker stays alive but holds no DB handle. */
    close() { return this._send('CLOSE', {}); }

    /** Tear down the worker. After this, no further calls work. */
    terminate() {
        this._worker.terminate();
        // Reject anything still pending — the worker won't reply.
        this._pendingRequests.forEach(({ rej }) => rej(new Error('Worker terminated')));
        this._pendingRequests.clear();
    }
}
