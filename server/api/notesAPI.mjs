import { Router } from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';

// Routes
export default function createNotesRouter(db) {
    const router = Router();

    // Get the default note for a workspace
    router.get('/workspace/:workspaceID', catchAsync(async (req, res) => {
        const { workspaceID } = req.params;

        // Try to find the oldest/first note to act as the default tab
        let note = await db.get(
            'SELECT * FROM notes WHERE workspaceID = ? AND isDeleted = 0 ORDER BY createdAt ASC LIMIT 1', 
            workspaceID
        );

        // If none exists, create the first one
        if (!note) {
            const id = crypto.randomUUID();
            await db.run(
                'INSERT INTO notes (id, content, workspaceID) VALUES (?, ?, ?)',
                id, '{}', workspaceID
            );
            note = { id, content: '{}', workspaceID };
        }

        return res.json({ note });
    }));

    // Save specific note content by Note ID (NOT Workspace ID)
    router.put('/:noteID', catchAsync(async (req, res) => {
        const { noteID } = req.params;
        const { content } = req.body;

        await db.run(
            'UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            JSON.stringify(content), noteID
        );

        return res.json({ message: 'Note saved.' });
    }));

    return router;
}