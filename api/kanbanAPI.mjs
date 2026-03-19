import express from 'express';
import { catchAsync } from './apiUtils.mjs';

// router initialization functions
export default function createKanbanRouter(db) {
    const router = express.Router();

    // API routing functions
    router.get('/board/:workspaceId', catchAsync(async (req, res) => {
        // data extraction functions
        const { workspaceId } = req.params;

        // database retrieval functions
        const lists = await db.all('SELECT * FROM lists WHERE workspaceID = ?', [workspaceId]);
        
        // data logic functions
        const listIds = lists.map(list => list.id);
        
        let tasks = [];
        if (listIds.length > 0) {
            const placeholders = listIds.map(() => '?').join(',');
            tasks = await db.all(`SELECT * FROM tasks WHERE listID IN (${placeholders})`, listIds);
        }
        
        // response logic functions
        res.json({ lists, tasks });
    }));

    // API routing functions
    router.post('/lists', catchAsync(async (req, res) => {
        // data extraction functions
        const { id, name, category, direction, workspaceID } = req.body;
        
        // database insertion functions
        await db.run(
            'INSERT INTO lists (id, name, category, direction, workspaceID) VALUES (?, ?, ?, ?, ?)',
            [id, name, category, direction, workspaceID]
        );
        
        // response logic functions
        res.status(201).json({ message: "List created successfully" });
    }));

    // API routing functions
    router.post('/tasks', catchAsync(async (req, res) => {
        const { id, title, description, isCompleted, originalCategory, listID } = req.body;
        
        await db.run(
            'INSERT INTO tasks (id, title, description, isCompleted, originalCategory, listID) VALUES (?, ?, ?, ?, ?, ?)',
            [id, title, description, isCompleted, originalCategory, listID]
        );
        
        res.status(201).json({ message: "Task created successfully" });
    }));

    router.put('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;
        const { title, description, isCompleted, listID } = req.body;

        await db.run(
            'UPDATE tasks SET title = ?, description = ?, isCompleted = ?, listID = ? WHERE id = ?',
            [title, description, isCompleted, listID, taskId]
        );

        res.json({ message: "Task updated successfully" });
    }));

    router.delete('/tasks/:taskId', catchAsync(async (req, res) => {
        const { taskId } = req.params;
        await db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
        res.json({ message: "Task deleted successfully" });
    }));

    return router;
}