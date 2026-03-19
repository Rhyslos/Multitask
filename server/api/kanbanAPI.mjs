import express from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';


// Router
export default function createKanbanRouter(db) {
    const router = express.Router();


    // Board
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
        const { id, name, category, color, direction, workspaceID, columnIndex } = req.body;

        await db.run(
            'INSERT INTO lists (id, name, category, color, direction, workspaceID, columnIndex) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, name, category ?? '', color ?? '', direction, workspaceID, columnIndex ?? 0]
        );

        res.status(201).json({ message: 'List created successfully' });
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