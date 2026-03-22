import express from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';


// Router
export default function createKanbanRouter(db) {
    const router = express.Router();


    // Tabs
    router.get('/tabs/:workspaceId', catchAsync(async (req, res) => {
        const { workspaceId } = req.params;

        const tabs = await db.all(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 ORDER BY tabOrder ASC',
            [workspaceId]
        );

        // Default tab
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
            'UPDATE kanban_tabs SET name = ?, color = ? WHERE id = ?',
            [name, color, tabId]
        );

        res.json({ message: 'Tab updated successfully' });
    }));

    router.put('/tabs/:tabId/archive', catchAsync(async (req, res) => {
        const { tabId } = req.params;

        await db.run(
            'UPDATE kanban_tabs SET isArchived = 1 WHERE id = ?',
            [tabId]
        );

        res.json({ message: 'Tab archived successfully' });
    }));

    router.put('/tabs/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, tabOrder }) =>
            db.run('UPDATE kanban_tabs SET tabOrder = ? WHERE id = ?', [tabOrder, id])
        ));

        res.json({ message: 'Tabs reordered successfully' });
    }));


    // Board
    router.get('/board/:workspaceId/:tabId', catchAsync(async (req, res) => {
        const { workspaceId, tabId } = req.params;

        const lists = await db.all(
            'SELECT * FROM lists WHERE workspaceID = ? AND tabID = ?',
            [workspaceId, tabId]
        );

        const listIds = lists.map(list => list.id);
        let tasks = [];
        if (listIds.length > 0) {
            const placeholders = listIds.map(() => '?').join(',');
            tasks = await db.all(
                `SELECT * FROM tasks WHERE listID IN (${placeholders}) ORDER BY taskOrder ASC`,
                listIds
            );
        }

        res.json({ lists, tasks });
    }));

    router.get('/board/:workspaceId', catchAsync(async (req, res) => {
        const { workspaceId } = req.params;

        const lists = await db.all('SELECT * FROM lists WHERE workspaceID = ?', [workspaceId]);

        const listIds = lists.map(list => list.id);
        let tasks = [];
        if (listIds.length > 0) {
            const placeholders = listIds.map(() => '?').join(',');
            tasks = await db.all(
                `SELECT * FROM tasks WHERE listID IN (${placeholders}) ORDER BY taskOrder ASC`,
                listIds
            );
        }

        res.json({ lists, tasks });
    }));


    // Lists
    router.post('/lists', catchAsync(async (req, res) => {
        const { id, name, category, color, direction, workspaceID, columnIndex, tabID } = req.body;

        await db.run(
            'INSERT INTO lists (id, name, category, color, direction, workspaceID, columnIndex, tabID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name, category ?? '', color ?? '', direction, workspaceID, columnIndex ?? 0, tabID ?? null]
        );

        res.status(201).json({ message: 'List created successfully' });
    }));

    router.put('/lists/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, columnIndex }) =>
            db.run('UPDATE lists SET columnIndex = ? WHERE id = ?', [columnIndex, id])
        ));

        res.json({ message: 'Lists reordered successfully' });
    }));

    router.put('/lists/:listId', catchAsync(async (req, res) => {
        const { listId } = req.params;
        const { name, category, color } = req.body;

        await db.run(
            'UPDATE lists SET name = ?, category = ?, color = ? WHERE id = ?',
            [name, category, color, listId]
        );

        res.json({ message: 'List updated successfully' });
    }));

    router.delete('/lists/:listId', catchAsync(async (req, res) => {
        const { listId } = req.params;
        await db.run('DELETE FROM lists WHERE id = ?', [listId]);
        res.json({ message: 'List deleted successfully' });
    }));


    // Tasks
    router.post('/tasks', catchAsync(async (req, res) => {
        const { id, title, description, isCompleted, originalCategory, color, listID, taskOrder } = req.body;

        await db.run(
            'INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, title, description, isCompleted, originalCategory, color ?? '', listID, taskOrder ?? 0]
        );

        res.status(201).json({ message: 'Task created successfully' });
    }));

    router.put('/tasks/reorder', catchAsync(async (req, res) => {
        const { updates } = req.body;

        await Promise.all(updates.map(({ id, listID, taskOrder }) =>
            db.run(
                'UPDATE tasks SET listID = ?, taskOrder = ? WHERE id = ?',
                [listID, taskOrder, id]
            )
        ));

        res.json({ message: 'Tasks reordered successfully' });
    }));

    router.put('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;
        const { title, description, isCompleted, listID, originalCategory, color, taskOrder } = req.body;

        await db.run(
            'UPDATE tasks SET title = ?, description = ?, isCompleted = ?, listID = ?, originalCategory = ?, color = ?, taskOrder = ? WHERE id = ?',
            [title, description, isCompleted, listID, originalCategory, color, taskOrder, taskId]
        );

        res.json({ message: 'Task updated successfully' });
    }));

    router.delete('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;
        await db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
        res.json({ message: 'Task deleted successfully' });
    }));


    return router;
}