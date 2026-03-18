import express from 'express';
import { catchAsync } from './apiUtils.mjs';

// router initialization functions
export default function createKanbanRouter(db) {
    const router = express.Router();

    // API routing functions
    router.get('/board', catchAsync(async (req, res) => {
        const lists = await db.all('SELECT * FROM lists');
        const tasks = await db.all('SELECT * FROM tasks');
        
        res.json({ lists, tasks });
    }));

    // API routing functions
    router.post('/lists', catchAsync(async (req, res) => {
        const { id, name, category, direction } = req.body;
        
        await db.run(
            'INSERT INTO lists (id, name, category, direction) VALUES (?, ?, ?, ?)',
            [id, name, category, direction]
        );
        
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

    return router;
}