// imports
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { URL as NodeURL } from 'url';

// constants
const SAVE_DEBOUNCE_MS = 1000;

// database schema
//
// Two doc tables, one per feature. Graph docs are keyed by workspaceID
// (one graph per workspace); notation docs are keyed by pageID (many pages
// per workspace). Both store a Yjs document as a binary update blob.
const GRAPH_DOCS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS graph_docs (
        workspaceID TEXT PRIMARY KEY,
        ydocBinary BLOB NOT NULL,
        updatedAt DATETIME NOT NULL
    );
`;

const NOTATION_DOCS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS notation_docs (
        pageID TEXT PRIMARY KEY,
        ydocBinary BLOB NOT NULL,
        updatedAt DATETIME NOT NULL,
        FOREIGN KEY (pageID) REFERENCES notation_pages (id) ON DELETE CASCADE
    );
`;

// state variables
const saveTimers = new Map();

// Per-feature persistence config. The room name carried by Yjs is prefixed
// ("graph/<id>" or "notation/<id>"); routeDoc() parses that prefix and hands
// back the matching entry so bindState/writeState know which table + key
// column to use. Adding a third synced doc type later = one more entry here.
const PERSISTENCE = {
    graph:    { table: 'graph_docs',    keyCol: 'workspaceID' },
    notation: { table: 'notation_docs', keyCol: 'pageID' },
};

// setup functions
export async function attachGraphSync(wss, db) {
    await db.exec(GRAPH_DOCS_SCHEMA);
    await db.exec(NOTATION_DOCS_SCHEMA);

    // Single global persistence handler for every room y-websocket manages.
    // It can't assume a doc is a graph doc anymore — it routes by prefix.
    setPersistence({
        bindState: async (docName, ydoc) => {
            const route = routeDoc(docName);
            if (!route) return; // unknown prefix: transport-only, no persistence

            const { table, keyCol, id } = route;
            const row = await db.get(
                `SELECT ydocBinary FROM ${table} WHERE ${keyCol} = ?`,
                [id]
            );
            if (row?.ydocBinary) {
                const bytes = row.ydocBinary instanceof Uint8Array
                    ? row.ydocBinary
                    : new Uint8Array(row.ydocBinary);
                Y.applyUpdate(ydoc, bytes);
            }

            ydoc.on('update', () => scheduleSave(db, docName, ydoc));
        },
        writeState: async (docName, ydoc) => {
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
            const room = parseRoomFromUrl(req.url);

            if (!room) {
                conn.close(1008, 'Missing room');
                return;
            }

            // Resolve the room to the workspace whose membership governs
            // access. Graph rooms ARE a workspace; notation rooms are a page
            // that belongs to a workspace, so we look the parent up.
            let workspaceID;
            if (room.kind === 'graph') {
                workspaceID = room.id;
            } else if (room.kind === 'notation') {
                const page = await db.get(
                    'SELECT workspaceID FROM notation_pages WHERE id = ? AND isDeleted = 0',
                    [room.id]
                );
                if (!page) {
                    conn.close(1008, 'Unknown notation page');
                    return;
                }
                workspaceID = page.workspaceID;
            } else {
                conn.close(1008, 'Unknown room type');
                return;
            }

            const allowed = await canAccessWorkspace(db, identity.userId, workspaceID);
            if (!allowed) {
                conn.close(1008, 'Not a member of this workspace');
                return;
            }

            setupWSConnection(conn, req, { gc: true });
        } catch (err) {
            console.error('[graphSync] upgrade failed:', err.message);
            try { conn.close(1008, err.message); } catch {}
        }
    });
}

// persistence functions
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
    const route = routeDoc(docName);
    if (!route) return; // unknown prefix: nothing to persist

    const { table, keyCol, id } = route;
    const bytes = Y.encodeStateAsUpdate(ydoc);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    await db.run(
        `INSERT INTO ${table} (${keyCol}, ydocBinary, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(${keyCol}) DO UPDATE SET
            ydocBinary = excluded.ydocBinary,
            updatedAt  = excluded.updatedAt`,
        [id, Buffer.from(bytes), now]
    );
}

// auth functions
async function authenticateUpgrade(req) {
    const url = new NodeURL(req.url, 'http://localhost');
    const userId = url.searchParams.get('userId');
    const email = url.searchParams.get('email');

    if (!userId || !email) {
        throw new Error('Missing userId or email in WS URL');
    }
    return { userId, email };
}

// utility functions
//
// Room names are prefixed: "graph/<workspaceID>" or "notation/<pageID>".
// Returns { kind, id } or null if the path is empty / unprefixed.
function parseRoomFromUrl(rawUrl) {
    const url = new NodeURL(rawUrl, 'http://localhost');
    const pathname = url.pathname.replace(/^\/+/, '');
    if (!pathname) return null;

    const slash = pathname.indexOf('/');
    if (slash === -1) return null; // unprefixed room — reject

    const kind = pathname.slice(0, slash);
    const id = pathname.slice(slash + 1);
    if (!kind || !id) return null;

    return { kind, id };
}

// Maps a Yjs docName ("graph/<id>" / "notation/<id>") to its persistence
// target. Returns null for anything unrecognized so callers can no-op.
function routeDoc(docName) {
    const slash = docName.indexOf('/');
    if (slash === -1) return null;

    const kind = docName.slice(0, slash);
    const id = docName.slice(slash + 1);
    const cfg = PERSISTENCE[kind];
    if (!cfg || !id) return null;

    return { ...cfg, id };
}

// permission functions
async function canAccessWorkspace(db, userId, workspaceID) {
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
