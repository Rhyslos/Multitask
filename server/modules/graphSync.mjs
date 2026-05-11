// Server-side Yjs sync for the graph editor.
//
// Plugs into the existing WebSocketServer started in server.mjs. Replaces the
// bare `setupWSConnection(conn, req)` call with a wrapper that adds two things
// y-websocket's reference impl doesn't ship with:
//
//   1. Persistence — load/save Y.Doc binaries to the same SQLite the rest of
//      the app uses. New table `graph_docs (workspaceID, ydocBinary, updatedAt)`.
//      We rewrite the whole BLOB on a 1s debounce after the last update. This
//      is fine for graphs with up to a few hundred elements; if you ever scale
//      past that, switch to y-leveldb or implement incremental updates.
//
//   2. Auth + workspace scoping — verify the connecting user is a member of the
//      workspace they're trying to join. Auth itself is currently a stub
//      (matches the trust level of the rest of your API: trust email/userID
//      from query params). When you add real session validation elsewhere,
//      replace `authenticateUpgrade` here in the same shot.
//
// Room naming: y-websocket parses the URL path as the room name. The client
// connects to ws://host/<workspaceID> — so room name === workspace ID. Keep
// it that way; it's the simplest mapping and the auth check uses the same id.

import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { URL as NodeURL } from 'url';

const SAVE_DEBOUNCE_MS = 1000;

// Schema is created once on init. Keeping it here (rather than in the central
// schema file) makes the graph sync feature self-contained — if you remove it,
// you remove this file and one line from server.mjs.
const GRAPH_DOCS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS graph_docs (
        workspaceID TEXT PRIMARY KEY,
        ydocBinary BLOB NOT NULL,
        updatedAt DATETIME NOT NULL
    );
`;

// One pending save timer per workspace, so concurrent updates collapse into
// one disk write. The Map is keyed by docName (= workspaceID).
const saveTimers = new Map();

/**
 * Wire up Yjs sync on an existing WebSocketServer.
 *
 * @param {WebSocketServer} wss     - the ws server already created in server.mjs
 * @param {object}          db      - the shared SQLite handle (same one passed to API routers)
 */
export async function attachGraphSync(wss, db) {
    await db.exec(GRAPH_DOCS_SCHEMA);

    // Tell y-websocket how to load and save Y.Docs. setPersistence is a global
    // hook in y-websocket — every doc this server handles uses the same
    // persistence layer. That's fine: we only handle graph docs here.
    setPersistence({
        bindState: async (docName, ydoc) => {
            // docName is the workspaceID (URL path).
            const row = await db.get(
                'SELECT ydocBinary FROM graph_docs WHERE workspaceID = ?',
                [docName]
            );
            if (row?.ydocBinary) {
                // Drivers vary — some return BLOBs as Buffer, some as Uint8Array.
                // Y.applyUpdate wants Uint8Array. Buffer extends it, so this works
                // in both cases, but we normalize defensively.
                const bytes = row.ydocBinary instanceof Uint8Array
                    ? row.ydocBinary
                    : new Uint8Array(row.ydocBinary);
                Y.applyUpdate(ydoc, bytes);
            }

            // Subscribe to updates so we can persist them. Debounced to avoid
            // hammering disk during drags (which can produce ~30 updates/sec
            // per dragger).
            ydoc.on('update', () => scheduleSave(db, docName, ydoc));
        },
        writeState: async (docName, ydoc) => {
            // Called by y-websocket when the last connection to a doc closes.
            // Cancel any pending debounced save and write synchronously so we
            // don't lose the final state if the process exits right after.
            const timer = saveTimers.get(docName);
            if (timer) {
                clearTimeout(timer);
                saveTimers.delete(docName);
            }
            await persistDoc(db, docName, ydoc);
        },
    });

    wss.on('connection', async (conn, req) => {
        try {
            const identity = await authenticateUpgrade(req);
            const workspaceID = parseRoomFromUrl(req.url);

            if (!workspaceID) {
                conn.close(1008, 'Missing workspace ID');
                return;
            }

            const allowed = await canAccessWorkspace(db, identity.userId, workspaceID);
            if (!allowed) {
                conn.close(1008, 'Not a member of this workspace');
                return;
            }

            // y-websocket parses the doc name from req.url. Pass it through
            // unchanged — the URL path IS the workspaceID.
            setupWSConnection(conn, req, { gc: true });
        } catch (err) {
            console.error('[graphSync] upgrade failed:', err.message);
            try { conn.close(1008, err.message); } catch { /* already closed */ }
        }
    });
}

// ───────────────────────────────────────────────────────────────
// Persistence
// ───────────────────────────────────────────────────────────────

function scheduleSave(db, docName, ydoc) {
    const existing = saveTimers.get(docName);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        saveTimers.delete(docName);
        persistDoc(db, docName, ydoc).catch(err => {
            console.error(`[graphSync] save failed for ${docName}:`, err.message);
        });
    }, SAVE_DEBOUNCE_MS);

    saveTimers.set(docName, timer);
}

async function persistDoc(db, docName, ydoc) {
    const bytes = Y.encodeStateAsUpdate(ydoc);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    // sqlite supports BLOB params as Buffer or Uint8Array depending on the
    // driver; Buffer.from is the universal choice.
    await db.run(
        `INSERT INTO graph_docs (workspaceID, ydocBinary, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(workspaceID) DO UPDATE SET
            ydocBinary = excluded.ydocBinary,
            updatedAt  = excluded.updatedAt`,
        [docName, Buffer.from(bytes), now]
    );
}

// ───────────────────────────────────────────────────────────────
// Auth — STUBBED to match the existing API trust model
// ───────────────────────────────────────────────────────────────

async function authenticateUpgrade(req) {
    // STUB. Today: the rest of your API trusts a userID from the request body
    // and an email in the SSE URL. We do the same here — read both from the
    // query string. When you add real session validation (cookies, JWTs,
    // whatever), this is where it goes. The function should resolve to
    // { userId, email } or throw.
    //
    // y-websocket's WebsocketProvider supports a `params` option that appends
    // these to the URL automatically; the client uses that.
    const url = new NodeURL(req.url, 'http://localhost');
    const userId = url.searchParams.get('userId');
    const email = url.searchParams.get('email');

    if (!userId || !email) {
        throw new Error('Missing userId or email in WS URL');
    }
    return { userId, email };
}

// ───────────────────────────────────────────────────────────────
// Routing helpers
// ───────────────────────────────────────────────────────────────

function parseRoomFromUrl(rawUrl) {
    // y-websocket convention: room name is the URL path with the leading slash
    // stripped, query string ignored. e.g. "/abc-123?email=..." → "abc-123".
    const url = new NodeURL(rawUrl, 'http://localhost');
    const pathname = url.pathname.replace(/^\/+/, '');
    return pathname || null;
}

async function canAccessWorkspace(db, userId, workspaceID) {
    // A user can access a workspace if they own it OR are a member.
    const owns = await db.get(
        'SELECT 1 FROM workspaces WHERE id = ? AND userID = ? AND isDeleted = 0',
        [workspaceID, userId]
    );
    if (owns) return true;

    const member = await db.get(
        `SELECT 1 FROM workspace_members
         WHERE workspaceID = ? AND userID = ? AND isDeleted = 0`,
        [workspaceID, userId]
    );
    return !!member;
}
