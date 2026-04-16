import express from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';

export default function createKanbanRouter(db) {
    const router = express.Router();

    router.get('/tabs/:workspaceId', catchAsync(async (req, res) => {
        const { workspaceId } = req.params;

        const tabs = await db.all(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 ORDER BY tabOrder ASC',
            [workspaceId]
        );

        if (tabs.length === 0) {
            const id = crypto.randomUUID();
            await db.run(
                'INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?, ?, ?, ?, ?, ?)',
                [id, 'Main', '#6c8ebf', 0, 0, workspaceId]
            );
            return res.json({ tabs: [{ id, name: 'Main', color: '#6c8ebf', tabOrder: 0, isArchived: 0, workspaceID: workspaceId }] });
        }

        res.json({ tabs });
    }));

    router.post('/tabs', catchAsync(async (req, res) => {
        const { id, name, color, tabOrder, workspaceID } = req.body;

        await db.run(
            'INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?, ?, ?, ?, ?, ?)',
            [id, name ?? 'New Tab', color ?? '#888888', tabOrder ?? 0, 0, workspaceID]
        );

        const tab = await db.get('SELECT * FROM kanban_tabs WHERE id = ?', [id]);
        res.status(201).json({ tab });
    }));

    router.put('/tabs/:tabId', catchAsync(async (req, res) => {
        const { tabId } = req.params;
        const { name, color } = req.body;

        await db.run(
            'UPDATE kanban_tabs SET name = ?, color = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [name, color, tabId]
        );

        res.json({ message: 'Tab updated successfully' });
    }));

    router.put('/tabs/:tabId/archive', catchAsync(async (req, res) => {
        const { tabId } = req.params;

        await db.run(
            'UPDATE kanban_tabs SET isArchived = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [tabId]
        );

        res.json({ message: 'Tab archived successfully' });
    }));

    router.put('/tabs/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, tabOrder }) =>
            db.run(
                'UPDATE kanban_tabs SET tabOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                [tabOrder, id]
            )
        ));

        res.json({ message: 'Tabs reordered successfully' });
    }));

    router.post('/columns', catchAsync(async (req, res) => {
        const { id, tabID, workspaceID, columnIndex } = req.body;

        await db.run(
            'INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex) VALUES (?, ?, ?, ?)',
            [id, tabID, workspaceID, columnIndex ?? 0]
        );

        const column = await db.get('SELECT * FROM kanban_columns WHERE id = ?', [id]);
        res.status(201).json({ column });
    }));

    router.delete('/columns/:columnId', catchAsync(async (req, res) => {
        const { columnId } = req.params;

        await db.run(
            'UPDATE kanban_columns SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [columnId]
        );
        await db.run(
            'UPDATE lists SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE columnID = ?',
            [columnId]
        );
        await db.run(`
            UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP 
            WHERE listID IN (SELECT id FROM lists WHERE columnID = ?)
        `, [columnId]);

        res.json({ message: 'Column deleted successfully' });
    }));

    router.put('/columns/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, columnIndex }) =>
            db.run(
                'UPDATE kanban_columns SET columnIndex = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                [columnIndex, id]
            )
        ));

        res.json({ message: 'Columns reordered successfully' });
    }));

    router.get('/board/:workspaceId/:tabId', catchAsync(async (req, res) => {
        const { workspaceId, tabId } = req.params;

        const columns = await db.all(
            'SELECT * FROM kanban_columns WHERE workspaceID = ? AND tabID = ? AND isDeleted = 0 ORDER BY columnIndex ASC',
            [workspaceId, tabId]
        );

        const columnIds = columns.map(c => c.id);
        let lists = [];
        let tasks = [];

        if (columnIds.length > 0) {
            const colPlaceholders = columnIds.map(() => '?').join(',');
            lists = await db.all(
                `SELECT * FROM lists WHERE columnID IN (${colPlaceholders}) AND isDeleted = 0`,
                columnIds
            );

            const listIds = lists.map(l => l.id);
            if (listIds.length > 0) {
                const listPlaceholders = listIds.map(() => '?').join(',');
                tasks = await db.all(
                    `SELECT * FROM tasks WHERE listID IN (${listPlaceholders}) AND isDeleted = 0 ORDER BY taskOrder ASC`,
                    listIds
                );
            }
        }

        res.json({ columns, lists, tasks });
    }));

    router.post('/lists', catchAsync(async (req, res) => {
        const { id, name, category, color, direction, columnID, workspaceID, tabID } = req.body;

        await db.run(
            'INSERT INTO lists (id, name, category, color, direction, columnID, workspaceID, tabID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name ?? 'New List', category ?? '', color ?? '', direction ?? 'vertical', columnID, workspaceID, tabID ?? null]
        );

        const list = await db.get('SELECT * FROM lists WHERE id = ?', [id]);
        res.status(201).json({ list });
    }));

    router.put('/lists/:listId', catchAsync(async (req, res) => {
        const { listId } = req.params;
        const { name, category, color } = req.body;

        await db.run(
            'UPDATE lists SET name = ?, category = ?, color = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [name, category, color, listId]
        );

        res.json({ message: 'List updated successfully' });
    }));

    router.delete('/lists/:listId', catchAsync(async (req, res) => {
        const { listId } = req.params;

        await db.run(
            'UPDATE lists SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [listId]
        );
        await db.run(
            'UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE listID = ?',
            [listId]
        );

        res.json({ message: 'List deleted successfully' });
    }));

    router.post('/tasks', catchAsync(async (req, res) => {
        const { id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks } = req.body;

        await db.run(
            'INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, title ?? 'New Task', description ?? '', isCompleted ?? 0, originalCategory ?? '', color ?? '', listID, taskOrder ?? 0, deadline ?? null, subtasks ? JSON.stringify(subtasks) : null]
        );

        const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
        res.status(201).json({ task });
    }));

    router.put('/tasks/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, listID, taskOrder }) =>
            db.run(
                'UPDATE tasks SET listID = ?, taskOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                [listID, taskOrder, id]
            )
        ));

        res.json({ message: 'Tasks reordered successfully' });
    }));

    router.put('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;
        const { title, description, isCompleted, listID, originalCategory, color, taskOrder, deadline, subtasks } = req.body;

        await db.run(
            'UPDATE tasks SET title = ?, description = ?, isCompleted = ?, listID = ?, originalCategory = ?, color = ?, taskOrder = ?, deadline = ?, subtasks = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [title, description, isCompleted, listID, originalCategory, color, taskOrder, deadline, subtasks ? JSON.stringify(subtasks) : null, taskId]
        );

        res.json({ message: 'Task updated successfully' });
    }));

    router.delete('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;

        await db.run(
            'UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [taskId]
        );

        res.json({ message: 'Task deleted successfully' });
    }));


    return router;
}
