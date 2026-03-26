import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './database/db.mjs';
import createKanbanRouter from './api/kanbanAPI.mjs';
import createWorkspaceRouter from './api/workspaceAPI.mjs';
import createUserRouter from './api/userAPI.mjs';
import createNotesRouter from './api/notesAPI.mjs';
import createSyncRouter from './api/syncAPI.mjs';

export class KanbanServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8080;
        this.db = null;
    }

    async initialize() {
        this.db = await initializeDatabase();

        this.app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
        this.app.use(express.json({ limit: '10mb' }));

        // Health check — client uses this to detect connectivity
        this.app.get('/api/health', (_req, res) => res.json({ ok: true }));

        this.app.use('/api/kanban', createKanbanRouter(this.db));
        this.app.use('/api/users', createUserRouter(this.db));
        this.app.use('/api/workspaces', createWorkspaceRouter(this.db));
        this.app.use('/api/notes', createNotesRouter(this.db));
        this.app.use('/api/sync', createSyncRouter(this.db, this.app));
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`Backend server running on http://localhost:${this.port}`);
        });
    }
}

async function run() {
    const server = new KanbanServer();
    await server.initialize();
    server.start();
}

run();
