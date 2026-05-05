// router functions
import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';
import { notifyEmails } from '../modules/networking.mjs';
import crypto from 'crypto';

export default function createSyncRouter(db) {
    const router = Router();

    router.get('/', catchAsync(async (req, res) => {
        const { userID, lastSync } = req.query;
        
        // validation functions
        if (!userID) return res.status(400).json({ error: 'userID required' });

        const userCheck = await db.get('SELECT id FROM users WHERE id = ?', [userID]);
        if (!userCheck) {
            return res.status(401).json({ error: 'User missing from server' });
        }

        // ms-precision floor matches the format used everywhere else.
        // String comparison vs '1970-01-01 00:00:00' is identical for any real
        // timestamp; standardizing the format prevents confusion only.
        const since = lastSync || '1970-01-01 00:00:00.000';
        const serverChanges = await getServerChanges(db, userID, since);
        return res.json(serverChanges);
    }));

    router.post('/', catchAsync(async (req, res) => {
        const { userID, lastSync, clientChanges, clientId } = req.body;

        // validation functions
        if (!userID) return res.status(400).json({ error: 'userID required' });

        const userCheck = await db.get('SELECT id FROM users WHERE id = ?', [userID]);
        if (!userCheck) {
            return res.status(401).json({ error: 'User missing from server' });
        }

        if (clientChanges?.kanban_tabs) {
            console.log(`[6. Server] Received tab push from user ${userID}:`, clientChanges.kanban_tabs);
        }

        const hasIncomingChanges = clientChanges && Object.keys(clientChanges).length > 0;

        if (hasIncomingChanges) {
            await applyClientChanges(db, clientChanges);

            // Broadcast to every workspace member who shares a workspace with
            // the writer — INCLUDING the writer themselves. The writer's other
            // tabs / devices need this echo to update; the originating tab
            // suppresses its own echo by checking originClientId in the SSE
            // payload against its SyncManager._clientId.
            //
            // Best-effort: if SQL or notify throws we log and move on. The
            // affected client will catch up on its next push or reconnect.
            try {
                const recipients = await db.all(`
                    SELECT DISTINCT u.email
                    FROM workspace_members wm1
                    JOIN workspace_members wm2 ON wm1.workspaceID = wm2.workspaceID
                    JOIN users u ON wm2.userID = u.id
                    WHERE wm1.userID = ?
                `, [userID]);

                notifyEmails(
                    recipients.map(r => r.email),
                    'kanban_updated',
                    { trigger: 'sync', originClientId: clientId ?? null }
                );
            } catch (broadcastError) {
                console.error('[SYNC] Broadcast failed:', broadcastError.message);
            }
        }

        const serverChanges = await getServerChanges(db, userID, lastSync);
        return res.json(serverChanges);
    }));

    return router;
}

// database functions
const ALLOWED_TABLES = [
    'categories', 'workspaces', 'workspace_members', 'kanban_tabs', 
    'kanban_columns', 'lists', 'tasks', 'notes', 'notation_groups', 'notation_pages'
];

async function applyClientChanges(db, changes) {
    for (const [tableName, rows] of Object.entries(changes)) {
        if (!ALLOWED_TABLES.includes(tableName) || !Array.isArray(rows) || rows.length === 0) continue;

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

        for (const row of rows) {
            // Defense-in-depth: every synced row MUST carry a client-supplied
            // updatedAt. The schema's STRFTIME default would still produce a
            // valid value if we let the row through, but doing so means the
            // server is fabricating a timestamp for a client-originated write —
            // breaking last-write-wins (the row sorts as if it was written
            // server-side, not when the user actually edited). Skip + log so
            // the offending client surfaces in the logs.
            if (row.updatedAt == null) {
                console.error(
                    `[SYNC] Refusing row in ${tableName} (${row.id}): missing updatedAt. ` +
                    `This indicates a client-side bug — every write to a synced table must set updatedAt.`
                );
                continue;
            }

            try {
                const values = columns.map(col => {
                    // parsing functions
                    if (tableName === 'tasks' && col === 'subtasks' && typeof row[col] !== 'string') {
                        return row[col] ? JSON.stringify(row[col]) : null;
                    }
                    return row[col];
                });

                await db.run(sql, values);
            } catch (e) {
                // error handling functions
                console.error(`[SYNC ERROR] Failed to insert into ${tableName} (${row.id}):`, e.message);
            }
        }
    }
}

async function getServerChanges(db, userID, lastSync) {
    const since = lastSync || '1970-01-01 00:00:00.000';

    const workspaces = await db.all(`
        SELECT DISTINCT w.* FROM workspaces w
        LEFT JOIN workspace_members wm ON w.id = wm.workspaceID
        WHERE (w.userID = ? OR wm.userID = ?) AND w.updatedAt > ?
    `, [userID, userID, since]);

    const categories = await db.all(
        'SELECT * FROM categories WHERE userID = ? AND updatedAt > ?',
        [userID, since]
    );

    // wsQuery is defined here, so any queries using it MUST come below this line
    const wsQuery = `
        SELECT id FROM workspaces WHERE userID = ? 
        UNION 
        SELECT workspaceID FROM workspace_members WHERE userID = ?
    `;
    const wsParams = [userID, userID, since];

    const kanban_tabs = await db.all(
        `SELECT * FROM kanban_tabs WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const kanban_columns = await db.all(
        `SELECT * FROM kanban_columns WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const lists = await db.all(
        `SELECT * FROM lists WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const notes = await db.all(
        `SELECT * FROM notes WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const notation_groups = await db.all(
        `SELECT * FROM notation_groups WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const notation_pages = await db.all(
        `SELECT * FROM notation_pages WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const listQuery = `SELECT id FROM lists WHERE workspaceID IN (${wsQuery})`;
    const tasks = await db.all(
        `SELECT * FROM tasks WHERE listID IN (${listQuery}) AND updatedAt > ?`,
        wsParams
    );

    // --- NEW: Pulling workspace members and safe user data ---
    const workspace_members = await db.all(
        `SELECT * FROM workspace_members WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`,
        wsParams
    );

    const usersQuery = `SELECT userID FROM workspace_members WHERE workspaceID IN (${wsQuery})`;

    const users = await db.all(`
        SELECT DISTINCT u.id, u.email, u.displayName, u.firstName, u.lastName, u.countryIso, u.phoneNumber, u.gender, u.skillset, u.privacySettings, u.updatedAt, u.isDeleted 
        FROM users u
        JOIN workspace_members wm ON u.id = wm.userID
        WHERE wm.workspaceID IN (${wsQuery}) 
        AND (u.updatedAt > ? OR wm.updatedAt > ?)
    `, [userID, userID, since, since]);

    return { users, workspace_members, workspaces, categories, kanban_tabs, kanban_columns, lists, tasks, notes, notation_groups, notation_pages };
}