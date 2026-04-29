import { Router } from 'express';

// state variables
const clients = new Map();
const activeWorkspaces = new Map();

// broadcast functions
function broadcastPresence(workspaceID) {
    if (!workspaceID) return;
    
    const onlineInWorkspace = [];
    activeWorkspaces.forEach((wsID, email) => {
        if (wsID === workspaceID) onlineInWorkspace.push(email);
    });

    onlineInWorkspace.forEach(email => {
        notifyUser(email, 'presence_updated', { workspaceID, onlineEmails: onlineInWorkspace });
    });
}

// notification functions
export function notifyUser(email, type, payload) {
    if (clients.has(email)) {
        const dataString = JSON.stringify({ type, ...payload });
        clients.get(email).forEach(clientRes => {
            clientRes.write(`data: ${dataString}\n\n`);
        });
    }
}

// Broadcast to a list of emails. Pure transport — caller decides the recipient
// set with whatever SQL they need. Iterating notifyUser keeps the offline-skip
// logic in one place (notifyUser is a no-op if the email has no SSE clients).
//
// Recipients echo their own writes too — the originating client is expected to
// ignore the echo by checking originClientId in the payload against its own
// SyncManager._clientId. That keeps the server-side query simple (no exclusion
// joins) and generalizes to other origin-aware events.
export function notifyEmails(emails, type, payload) {
    if (!Array.isArray(emails)) return;
    for (const email of emails) {
        notifyUser(email, type, payload);
    }
}

// interval functions
setInterval(() => {
    clients.forEach((userStreams) => {
        userStreams.forEach(clientRes => {
            clientRes.write(':\n\n'); 
        });
    });
}, 15000);

// router configuration
export default function createNetworkingRouter() {
    const router = Router();

    // sse routes
    router.get('/stream/:email', (req, res) => {
    const { email } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (!clients.has(email)) clients.set(email, new Set());
    clients.get(email).add(res);

    res.write('retry: 3000\n\n');  
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        // event listeners
        req.on('close', () => {
            const userStreams = clients.get(email);
            if (userStreams) {
                userStreams.delete(res);
                if (userStreams.size === 0) {
                    clients.delete(email);
                    
                    const wsID = activeWorkspaces.get(email);
                    if (wsID) {
                        activeWorkspaces.delete(email);
                        broadcastPresence(wsID);
                    }
                }
            }
        });
    });

    // api routes
    router.post('/presence', (req, res) => {
        const { email, workspaceID } = req.body;
        
        if (!email) return res.status(400).json({ error: 'Email required' });

        const previousWsID = activeWorkspaces.get(email);
        
        if (previousWsID && previousWsID !== workspaceID) {
            activeWorkspaces.delete(email);
            broadcastPresence(previousWsID);
        }

        if (workspaceID) {
            activeWorkspaces.set(email, workspaceID);
            broadcastPresence(workspaceID);
        }

        res.json({ success: true });
    });

    return router;
}