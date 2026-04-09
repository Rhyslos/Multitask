import { Router } from 'express';

// state variables
const clients = new Map();

// notification functions
export function notifyUser(email, type, payload) {
    if (clients.has(email)) {
        const dataString = JSON.stringify({ type, ...payload });
        clients.get(email).forEach(clientRes => {
            clientRes.write(`data: ${dataString}\n\n`);
        });
    }
}

// router configuration
export default function createNetworkingRouter() {
    const router = Router();

    // sse routes
    router.get('/stream/:email', (req, res) => {
        const { email } = req.params;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        if (!clients.has(email)) {
            clients.set(email, new Set());
        }
        clients.get(email).add(res);

        res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

        req.on('close', () => {
            clients.get(email).delete(res);
            if (clients.get(email).size === 0) {
                clients.delete(email);
            }
        });
    });

    return router;
}