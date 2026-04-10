import { Router } from 'express';
import crypto from 'crypto';
import { catchAsync } from './apiUtils.mjs';
import { notifyUser } from '../modules/networking.mjs';

// router configuration
export default function createInvitesRouter(db) {
    const router = Router();

    // invite routes
    router.post('/send', catchAsync(async (req, res) => {
        const { workspaceID, senderID, receiverEmail } = req.body;

        const receiver = await db.get('SELECT id FROM users WHERE email = ?', receiverEmail);
        if (!receiver) return res.status(404).json({ error: 'User not found' });
        if (receiver.id === senderID) return res.status(400).json({ error: 'Cannot invite yourself' });

        const existing = await db.get(
            'SELECT * FROM invitations WHERE workspaceID = ? AND receiverEmail = ? AND status = "pending"',
            workspaceID, receiverEmail
        );
        if (existing) return res.status(400).json({ error: 'Invite already pending' });

        const id = crypto.randomUUID();
        
        try {
            await db.run(
                'INSERT INTO invitations (id, workspaceID, senderID, receiverEmail) VALUES (?, ?, ?, ?)',
                id, workspaceID, senderID, receiverEmail
            );
        } catch (err) {
            if (err.message.includes('FOREIGN KEY')) {
                return res.status(400).json({ 
                    error: 'Sync pending: This workspace has not been fully saved to the server yet. Please wait a moment for the sync to finish before inviting members.' 
                });
            }
            throw err;
        }

        const updatedInvites = await db.all(`
            SELECT i.id, i.workspaceID, i.senderID, i.receiverEmail, i.status, 
                   w.name as workspaceName, u.email as senderEmail
            FROM invitations i
            JOIN workspaces w ON i.workspaceID = w.id
            JOIN users u ON i.senderID = u.id
            WHERE i.receiverEmail = ? AND i.status = 'pending'
            ORDER BY i.createdAt DESC
        `, receiverEmail);

        notifyUser(receiverEmail, 'invites_updated', { invites: updatedInvites });

        return res.json({ message: 'Invite sent' });
    }));

    // query routes
    router.get('/pending/:email', catchAsync(async (req, res) => {
        const { email } = req.params;
        const invites = await db.all(`
            SELECT i.id, i.workspaceID, i.senderID, i.receiverEmail, i.status, 
                   w.name as workspaceName, u.email as senderEmail
            FROM invitations i
            JOIN workspaces w ON i.workspaceID = w.id
            JOIN users u ON i.senderID = u.id
            WHERE i.receiverEmail = ? AND i.status = 'pending'
            ORDER BY i.createdAt DESC
        `, email);
        return res.json({ invites });
    }));

    // response routes
    router.post('/respond', catchAsync(async (req, res) => {
        const { inviteID, userID, action } = req.body; 

        if (action === 'accept') {
            const invite = await db.get('SELECT workspaceID FROM invitations WHERE id = ?', inviteID);
            if (invite) {
                const memberId = crypto.randomUUID();
                await db.run(
                    'INSERT OR IGNORE INTO workspace_members (id, workspaceID, userID, role) VALUES (?, ?, ?, ?)',
                    memberId, invite.workspaceID, userID, 'editor'
                );
                
                await db.run(
                    'UPDATE workspaces SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                    invite.workspaceID
                );
            }
        }

        await db.run(
            'UPDATE invitations SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            action === 'accept' ? 'accepted' : 'rejected', inviteID
        );

        return res.json({ message: `Invite ${action}ed.` });
    }));

    return router;
}