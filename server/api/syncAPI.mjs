import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';
import { notifyUser } from '../modules/networking.mjs';
import crypto from 'crypto';

export default function createSyncRouter(db) {
    const router = Router();

    // Pure pull — called by syncNow() on SSE-triggered updates.
    // No writes, no broadcasts. Safe to call at any time without side-effects.
    router.get('/', catchAsync(async (req, res) => {
        const { userID, lastSync } = req.query;
        if (!userID) return res.status(400).json({ error: 'userID required' });
        const since = lastSync || '1970-01-01 00:00:00';
        const serverChanges = await getServerChanges(db, userID, since);
        return res.json(serverChanges);
    }));

    router.post('/', catchAsync(async (req, res) => {
        const { userID, lastSync, clientChanges } = req.body;
        if (!userID) return res.status(400).json({ error: 'userID required' });

        const hasIncomingChanges = clientChanges && Object.keys(clientChanges).length > 0;

        if (hasIncomingChanges) {
            await applyClientChanges(db, clientChanges);

            try {
                const sharedUsers = await db.all(`
                    SELECT DISTINCT u.email 
                    FROM workspace_members wm1
                    JOIN workspace_members wm2 ON wm1.workspaceID = wm2.workspaceID
                    JOIN users u ON wm2.userID = u.id
                    WHERE wm1.userID = ? AND u.id != ?
                `, [userID, userID]);

                sharedUsers.forEach(user => {
                    notifyUser(user.email, 'kanban_updated', { trigger: 'sync' });
                });
            } catch (broadcastError) {
                console.error('[SYNC] Broadcast failed:', broadcastError.message);
            }
        }

        const serverChanges = await getServerChanges(db, userID, lastSync);
        return res.json(serverChanges);
    }));

    return router;
}

async function applyClientChanges(db, changes) {
    // 1. Categories
    if (changes.categories) {
        for (const c of changes.categories) {
            try {
                await db.run(
                    `INSERT INTO categories (id, name, color, userID, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     name=excluded.name, color=excluded.color, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > categories.updatedAt`,
                    [c.id, c.name, c.color, c.userID, c.updatedAt, c.isDeleted]
                );
            } catch (e) { /* Skip stale data */ }
        }
    }

    // 2. Workspaces
    if (changes.workspaces) {
        for (const w of changes.workspaces) {
            try {
                await db.run(
                    `INSERT INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     name=excluded.name, categoryID=excluded.categoryID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > workspaces.updatedAt`,
                    [w.id, w.name, w.userID, w.categoryID, w.createdAt, w.updatedAt, w.isDeleted]
                );
                await db.run(
                    `INSERT OR IGNORE INTO workspace_members (id, workspaceID, userID, role) VALUES (?, ?, ?, ?)`,
                    [crypto.randomUUID(), w.id, w.userID, 'owner']
                );
            } catch (e) { /* Skip stale data */ }
        }
    }

    // 3. Kanban tabs
    if (changes.kanban_tabs) {
        for (const t of changes.kanban_tabs) {
            try {
                await db.run(
                    `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     name=excluded.name, color=excluded.color, tabOrder=excluded.tabOrder, isArchived=excluded.isArchived, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > kanban_tabs.updatedAt`,
                    [t.id, t.name, t.color, t.tabOrder, t.isArchived, t.workspaceID, t.updatedAt, t.isDeleted]
                );
            } catch (e) { /* Skip stale data */ }
        }
    }

    // 4. Kanban columns — must be applied before lists since lists FK to columns
    if (changes.kanban_columns) {
        for (const c of changes.kanban_columns) {
            try {
                await db.run(
                    `INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     tabID=excluded.tabID, columnIndex=excluded.columnIndex, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > kanban_columns.updatedAt`,
                    [c.id, c.tabID, c.workspaceID, c.columnIndex, c.updatedAt, c.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] Column ${c.id} skipped: Parent missing`);
            }
        }
    }

    // 5. Lists — now reference columnID instead of columnIndex
    if (changes.lists) {
        for (const l of changes.lists) {
            try {
                await db.run(
                    `INSERT INTO lists (id, name, category, color, direction, columnID, workspaceID, tabID, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     name=excluded.name, category=excluded.category, color=excluded.color, direction=excluded.direction, columnID=excluded.columnID, tabID=excluded.tabID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > lists.updatedAt`,
                    [l.id, l.name, l.category, l.color, l.direction, l.columnID, l.workspaceID, l.tabID, l.updatedAt, l.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] List ${l.id} skipped: Parent missing`);
            }
        }
    }

    // 6. Tasks
    if (changes.tasks) {
        for (const t of changes.tasks) {
            try {
                await db.run(
                    `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     title=excluded.title, description=excluded.description, isCompleted=excluded.isCompleted, originalCategory=excluded.originalCategory, color=excluded.color, listID=excluded.listID, taskOrder=excluded.taskOrder, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > tasks.updatedAt`,
                    [t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder, t.updatedAt, t.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] Task ${t.id} skipped: Parent missing`);
            }
        }
    }

    // 7. Notes
    if (changes.notes) {
        for (const n of changes.notes) {
            try {
                await db.run(
                    `INSERT INTO notes (id, content, workspaceID, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     content=excluded.content, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > notes.updatedAt`,
                    [n.id, n.content, n.workspaceID, n.updatedAt, n.isDeleted]
                );
            } catch (e) { /* Skip stale data */ }
        }
    }
}

async function getServerChanges(db, userID, lastSync) {
    const since = lastSync || '1970-01-01 00:00:00';

    const workspaces = await db.all(`
        SELECT DISTINCT w.* FROM workspaces w
        LEFT JOIN workspace_members wm ON w.id = wm.workspaceID
        WHERE (w.userID = ? OR wm.userID = ?) AND w.updatedAt > ?
    `, [userID, userID, since]);

    const categories = await db.all(
        'SELECT * FROM categories WHERE userID = ? AND updatedAt > ?',
        [userID, since]
    );

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

    // Columns must be sent before lists so the client can apply them in order
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

    const listQuery = `SELECT id FROM lists WHERE workspaceID IN (${wsQuery})`;
    const tasks = await db.all(
        `SELECT * FROM tasks WHERE listID IN (${listQuery}) AND updatedAt > ?`,
        wsParams
    );

    return { workspaces, categories, kanban_tabs, kanban_columns, lists, tasks, notes };
}
