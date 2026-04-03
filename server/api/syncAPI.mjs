import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';

// router functions
export default function createSyncRouter(db) {
    const router = Router();

    // endpoint functions
    router.post('/', catchAsync(async (req, res) => {
        const { userID, lastSync, clientChanges } = req.body;
        
        if (!userID) return res.status(400).json({ error: 'userID required' });

        if (clientChanges) {
            await applyClientChanges(db, clientChanges);
        }

        const serverChanges = await getServerChanges(db, userID, lastSync);

        return res.json(serverChanges);
    }));

    return router;
}

// sync functions
async function applyClientChanges(db, changes) {
    // 1. Categories (Depends only on Users)
    if (changes.categories) {
        for (const c of changes.categories) {
            await db.run(
                `INSERT INTO categories (id, name, color, userID, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 name=excluded.name, color=excluded.color, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > categories.updatedAt`,
                [c.id, c.name, c.color, c.userID, c.updatedAt, c.isDeleted]
            );
        }
        console.log("Categories Updated")
    }

    // 2. Workspaces (Depends on Users & Categories)
    if (changes.workspaces) {
        for (const w of changes.workspaces) {
            await db.run(
                `INSERT INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 name=excluded.name, categoryID=excluded.categoryID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > workspaces.updatedAt`,
                [w.id, w.name, w.userID, w.categoryID, w.createdAt, w.updatedAt, w.isDeleted]
            );
        }
        console.log("Workspace Updated")
    }

    // 3. Kanban Tabs (Depends on Workspaces)
    if (changes.kanban_tabs) {
        for (const t of changes.kanban_tabs) {
            await db.run(
                `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 name=excluded.name, color=excluded.color, tabOrder=excluded.tabOrder, isArchived=excluded.isArchived, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > kanban_tabs.updatedAt`,
                [t.id, t.name, t.color, t.tabOrder, t.isArchived, t.workspaceID, t.updatedAt, t.isDeleted]
            );
        }
        console.log("Tabs Updated")
    }

    // 4. Lists (Depends on Workspaces & Kanban Tabs)
    if (changes.lists) {
        for (const l of changes.lists) {
            await db.run(
                `INSERT INTO lists (id, name, category, color, direction, columnIndex, workspaceID, tabID, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 name=excluded.name, category=excluded.category, color=excluded.color, direction=excluded.direction, columnIndex=excluded.columnIndex, tabID=excluded.tabID, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > lists.updatedAt`,
                [l.id, l.name, l.category, l.color, l.direction, l.columnIndex, l.workspaceID, l.tabID, l.updatedAt, l.isDeleted]
            );
        }
        console.log("Lists Updated")
    }

    // 5. Tasks (Depends on Lists)
    if (changes.tasks) {
        for (const t of changes.tasks) {
            await db.run(
                `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 title=excluded.title, description=excluded.description, isCompleted=excluded.isCompleted, originalCategory=excluded.originalCategory, color=excluded.color, listID=excluded.listID, taskOrder=excluded.taskOrder, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > tasks.updatedAt`,
                [t.id, t.title, t.description, t.isCompleted ? 1 : 0, t.originalCategory, t.color, t.listID, t.taskOrder, t.updatedAt, t.isDeleted]
            );
        }
        console.log("Tasks Updated")
    }

    // 6. Notes (Depends on Workspaces)
    if (changes.notes) {
        for (const n of changes.notes) {
            await db.run(
                `INSERT INTO notes (id, content, workspaceID, updatedAt, isDeleted) 
                 VALUES (?, ?, ?, ?, ?) 
                 ON CONFLICT(id) DO UPDATE SET 
                 content=excluded.content, updatedAt=excluded.updatedAt, isDeleted=excluded.isDeleted 
                 WHERE excluded.updatedAt > notes.updatedAt`,
                [n.id, n.content, n.workspaceID, n.updatedAt, n.isDeleted]
            );
        }
        console.log("Notes Updated")
    }
}

// query functions
async function getServerChanges(db, userID, lastSync) {
    const workspaces = await db.all('SELECT * FROM workspaces WHERE userID = ? AND updatedAt > ?', [userID, lastSync]);
    const categories = await db.all('SELECT * FROM categories WHERE userID = ? AND updatedAt > ?', [userID, lastSync]);
    
    const wsQuery = 'SELECT id FROM workspaces WHERE userID = ?';
    
    const kanban_tabs = await db.all(`SELECT * FROM kanban_tabs WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`, [userID, lastSync]);
    const lists = await db.all(`SELECT * FROM lists WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`, [userID, lastSync]);
    const notes = await db.all(`SELECT * FROM notes WHERE workspaceID IN (${wsQuery}) AND updatedAt > ?`, [userID, lastSync]);
    
    const listQuery = `SELECT id FROM lists WHERE workspaceID IN (${wsQuery})`;
    const tasks = await db.all(`SELECT * FROM tasks WHERE listID IN (${listQuery}) AND updatedAt > ?`, [userID, lastSync]);

    return { workspaces, categories, kanban_tabs, lists, tasks, notes };
}