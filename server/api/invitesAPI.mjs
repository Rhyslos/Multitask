import { Router } from 'express';
import crypto from 'crypto';
import { catchAsync, nowIso } from './apiUtils.mjs';
import { notifyUser, notifyEmails } from '../modules/networking.mjs';

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

        // one timestamp for the whole transaction — workspace_members insert,
        // workspaces.updatedAt bump, and the invitations row update all
        // describe a single user-visible event ("Alice accepted").
        const ts = nowIso();

        let workspaceID = null;

        if (action === 'accept') {
            const invite = await db.get('SELECT workspaceID FROM invitations WHERE id = ?', inviteID);
            if (invite) {
                workspaceID = invite.workspaceID;
                const memberId = crypto.randomUUID();
                // workspace_members.updatedAt must be passed explicitly even
                // though the column has a ms-precision default — being explicit
                // keeps the timestamp identical across the three writes below,
                // so other clients see them as one consistent batch on next pull.
                await db.run(
                    'INSERT OR IGNORE INTO workspace_members (id, workspaceID, userID, role, updatedAt) VALUES (?, ?, ?, ?, ?)',
                    memberId, workspaceID, userID, 'editor', ts
                );

                // bump workspaces.updatedAt so SyncManager.pullFromServer picks
                // up the new member relationship via the workspaces row.
                // CURRENT_TIMESTAMP would be second-precision and silently lose
                // this update against ms-precision client watermarks.
                await db.run(
                    'UPDATE workspaces SET updatedAt = ? WHERE id = ?',
                    ts, workspaceID
                );
            }
        }

        // invitations isn't in SYNC_TABLES — clients fetch this via /invites/pending
        // explicitly — but we use nowIso() anyway for format consistency.
        await db.run(
            'UPDATE invitations SET status = ?, updatedAt = ? WHERE id = ?',
            action === 'accept' ? 'accepted' : 'rejected', ts, inviteID
        );

        // Tell every member of the workspace (including the new member who just
        // joined) that the workspace changed. Without this, existing members
        // wouldn't know about the new member until their next push or reconnect.
        // No originClientId — the acceptance was driven by an HTTP call, not a
        // sync push, so there's no "originating tab" to suppress an echo for.
        // The acceptor's own client gets one redundant pull (workspacesUpdated
        // window event already triggers one), which is idempotent and cheap.
        if (action === 'accept' && workspaceID) {
            try {
                const recipients = await db.all(`
                    SELECT u.email
                    FROM workspace_members wm
                    JOIN users u ON wm.userID = u.id
                    WHERE wm.workspaceID = ? AND wm.isDeleted = 0
                `, workspaceID);

                notifyEmails(
                    recipients.map(r => r.email),
                    'kanban_updated',
                    { trigger: 'invite_accepted', originClientId: null }
                );
            } catch (broadcastError) {
                console.error('[INVITES] Broadcast failed:', broadcastError.message);
            }
        }

        return res.json({ message: `Invite ${action}ed.` });
    }));

    return router;
}