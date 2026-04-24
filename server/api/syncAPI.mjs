// router functions
import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';
import { notifyUser } from '../modules/networking.mjs';
import crypto from 'crypto';

export default function createSyncRouter(db) {
    const router = Router();

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

        if (clientChanges?.kanban_tabs) {
            console.log(`[6. Server] Received tab push from user ${userID}:`, clientChanges.kanban_tabs);
        }

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

// database functions
async function applyClientChanges(db, changes) {
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
            } catch (e) {}
        }
    }

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
            } catch (e) {
                // Now you will actually see WHY a workspace failed to save!
                console.error(`[SYNC ERROR] Failed to insert workspace ${w.id}:`, e.message);
            }
        }
    }

    if (changes.workspace_members) {
        for (const wm of changes.workspace_members) {
            try {
                await db.run(
                    `INSERT INTO workspace_members (id, workspaceID, userID, role, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     workspaceID=excluded.workspaceID, userID=excluded.userID, role=excluded.role, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > workspace_members.updatedAt`,
                    [wm.id, wm.workspaceID, wm.userID, wm.role, wm.updatedAt, wm.isDeleted]
                );
            } catch (e) {}
        }
    }

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
            } catch (e) {}
        }
    }

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

    if (changes.lists) {
        for (const l of changes.lists) {
            try {
                await db.run(
                    `INSERT INTO lists (id, name, category, color, direction, listOrder, columnID, workspaceID, tabID, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     name=excluded.name, category=excluded.category, color=excluded.color, direction=excluded.direction, listOrder=excluded.listOrder, columnID=excluded.columnID, tabID=excluded.tabID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > lists.updatedAt`,
                    [l.id, l.name, l.category, l.color, l.direction, l.listOrder ?? 0, l.columnID, l.workspaceID, l.tabID, l.updatedAt, l.isDeleted]
                );
            } catch (e) {
                // error handling functions
                console.warn(`[SYNC] List ${l.id} skipped:`, e.message);
            }
        }
    }

   if (changes.tasks) {
        for (const t of changes.tasks) {
            try {
                const subtasksStr = t.subtasks ? (typeof t.subtasks === 'string' ? t.subtasks : JSON.stringify(t.subtasks)) : null;
                
                await db.run(
                    `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks, updatedAt, isDeleted) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET 
                     title=excluded.title, description=excluded.description, isCompleted=excluded.isCompleted, originalCategory=excluded.originalCategory, color=excluded.color, listID=excluded.listID, taskOrder=excluded.taskOrder, deadline=excluded.deadline, subtasks=excluded.subtasks, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                     WHERE excluded.updatedAt > tasks.updatedAt`,
                    [t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder, t.deadline, subtasksStr, t.updatedAt, t.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] Task ${t.id} skipped:`, e.message);
            }
        }
    }

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
            } catch (e) {}
        }
    }

    if (changes.notation_groups) {
        for (const g of changes.notation_groups) {
            try {
                await db.run(
                    `INSERT INTO notation_groups (id, name, color, workspaceID, groupOrder, updatedAt, isDeleted)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name, color=excluded.color, groupOrder=excluded.groupOrder, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted
                    WHERE excluded.updatedAt > notation_groups.updatedAt`,
                    [g.id, g.name, g.color, g.workspaceID, g.groupOrder, g.updatedAt, g.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] notation_group ${g.id} skipped:`, e.message);
            }
        }
    }

    if (changes.notation_pages) {
        for (const p of changes.notation_pages) {
            try {
                await db.run(
                    `INSERT INTO notation_pages (id, title, workspaceID, groupID, pageOrder, updatedAt, isDeleted)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title, groupID=excluded.groupID, pageOrder=excluded.pageOrder, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted
                    WHERE excluded.updatedAt > notation_pages.updatedAt`,
                    [p.id, p.title, p.workspaceID, p.groupID, p.pageOrder, p.updatedAt, p.isDeleted]
                );
            } catch (e) {
                console.warn(`[SYNC] notation_page ${p.id} skipped:`, e.message);
            }
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