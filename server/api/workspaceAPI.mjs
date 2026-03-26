/**
 * workspaceAPI.mjs — updated to accept client-supplied id on POST /workspaces
 * so that sync flush can replay with INSERT OR IGNORE using the same id.
 */
import { Router } from 'express';
import { catchAsync } from './apiUtils.mjs';
import crypto from 'crypto';

export default function createWorkspaceRouter(db) {
    const router = Router();

    router.get('/', catchAsync(async (req, res) => {
        const { userID } = req.query;
        if (!userID) return res.status(400).json({ error: 'userID is required.' });
        const workspaces = await db.all(`
            SELECT w.*, c.name as categoryName, c.color as categoryColor
            FROM workspaces w
            LEFT JOIN categories c ON w.categoryID = c.id
            WHERE w.userID = ?
            ORDER BY w.createdAt DESC
        `, userID);
        return res.json({ workspaces });
    }));

    router.post('/', catchAsync(async (req, res) => {
        const { name, userID, categoryID } = req.body;
        if (!name || !userID) return res.status(400).json({ error: 'Name and userID are required.' });

        // Accept a client-supplied id (for sync replay) or generate one
        const id = req.body.id || crypto.randomUUID();

        await db.run(
            'INSERT OR IGNORE INTO workspaces (id, name, userID, categoryID) VALUES (?, ?, ?, ?)',
            id, name, userID, categoryID || null
        );

        const workspace = await db.get(`
            SELECT w.*, c.name as categoryName, c.color as categoryColor
            FROM workspaces w LEFT JOIN categories c ON w.categoryID = c.id
            WHERE w.id = ?
        `, id);
        return res.status(201).json({ workspace });
    }));

    router.delete('/:id', catchAsync(async (req, res) => {
        await db.run('DELETE FROM workspaces WHERE id = ?', req.params.id);
        return res.json({ message: 'Workspace deleted.' });
    }));

    router.patch('/:id', catchAsync(async (req, res) => {
        const { name, categoryID } = req.body;
        await db.run(
            'UPDATE workspaces SET name = ?, categoryID = ? WHERE id = ?',
            name, categoryID || null, req.params.id
        );
        const workspace = await db.get(`
            SELECT w.*, c.name as categoryName, c.color as categoryColor
            FROM workspaces w LEFT JOIN categories c ON w.categoryID = c.id
            WHERE w.id = ?
        `, req.params.id);
        return res.json({ workspace });
    }));

    router.get('/categories', catchAsync(async (req, res) => {
        const { userID } = req.query;
        if (!userID) return res.status(400).json({ error: 'userID is required.' });
        const categories = await db.all('SELECT * FROM categories WHERE userID = ? ORDER BY name ASC', userID);
        return res.json({ categories });
    }));

    router.post('/categories', catchAsync(async (req, res) => {
        const { name, color, userID } = req.body;
        if (!name || !color || !userID) return res.status(400).json({ error: 'Name, color and userID are required.' });
        const id = req.body.id || crypto.randomUUID();
        await db.run(
            'INSERT OR IGNORE INTO categories (id, name, color, userID) VALUES (?, ?, ?, ?)',
            id, name, color, userID
        );
        return res.status(201).json({ category: { id, name, color, userID } });
    }));

    router.delete('/categories/:id', catchAsync(async (req, res) => {
        await db.run('DELETE FROM categories WHERE id = ?', req.params.id);
        return res.json({ message: 'Category deleted.' });
    }));

    return router;
}
