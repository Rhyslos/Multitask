import { Router } from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';


// Routes
export default function createNotesRouter(db) {
    const router = Router();


    // Get or create note for workspace
    router.get('/:workspaceID', catchAsync(async (req, res) => {
        const { workspaceID } = req.params;

        let note = await db.get('SELECT * FROM notes WHERE workspaceID = ?', workspaceID);

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


    // Save note content
    router.put('/:workspaceID', catchAsync(async (req, res) => {
        const { workspaceID } = req.params;
        const { content } = req.body;

        await db.run(
            'UPDATE notes SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE workspaceID = ?',
            JSON.stringify(content), workspaceID
        );

        return res.json({ message: 'Note saved.' });
    }));


    return router;
}