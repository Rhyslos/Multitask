// imports
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import * as Y from 'yjs';
import { URL as NodeURL } from 'url';

// constants
const SAVE_DEBOUNCE_MS = 1000;

// database schema
const GRAPH_DOCS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS graph_docs (
        workspaceID TEXT PRIMARY KEY,
        ydocBinary BLOB NOT NULL,
        updatedAt DATETIME NOT NULL
    );
`;

// state variables
const saveTimers = new Map();

// setup functions
export async function attachGraphSync(wss, db) {
    await db.exec(GRAPH_DOCS_SCHEMA);

    setPersistence({
        bindState: async (docName, ydoc) => {
            const row = await db.get(
                'SELECT ydocBinary FROM graph_docs WHERE workspaceID = ?',
                [docName]
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
    const bytes = Y.encodeStateAsUpdate(ydoc);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    
    await db.run(
        `INSERT INTO graph_docs (workspaceID, ydocBinary, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(workspaceID) DO UPDATE SET
            ydocBinary = excluded.ydocBinary,
            updatedAt  = excluded.updatedAt`,
        [docName, Buffer.from(bytes), now]
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
function parseRoomFromUrl(rawUrl) {
    const url = new NodeURL(rawUrl, 'http://localhost');
    const pathname = url.pathname.replace(/^\/+/, '');
    return pathname || null;
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