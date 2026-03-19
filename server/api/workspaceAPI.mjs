import express from 'express';
import { catchAsync } from './apiUtils.mjs';

// Router initialization functions
export default function createWorkspaceRouter(db) {
    const router = express.Router();

    router.get('/user/:userId', catchAsync(async (req, res) => {
        const { userId } = req.params;
        const workspaces = await db.all('SELECT * FROM workspaces WHERE userID = ?', [userId]);
        
        res.json({ workspaces });
    }));

    router.post('/', catchAsync(async (req, res) => {
        const { id, name, userID } = req.body;
        
        await db.run(
            'INSERT INTO workspaces (id, name, userID) VALUES (?, ?, ?)',
            [id, name, userID]
        );
        
        res.status(201).json({ message: "Workspace created successfully" });
    }));

    router.delete('/:workspaceId', catchAsync(async (req, res) => {
        const { workspaceId } = req.params;
        
        await db.run('DELETE FROM workspaces WHERE id = ?', [workspaceId]);
        
        res.json({ message: "Workspace deleted successfully" });
    }));

    return router;
}