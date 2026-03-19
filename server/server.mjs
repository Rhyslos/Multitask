import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

// Import functions
import { initializeDatabase } from './database/db.mjs';
import createKanbanRouter from './api/kanbanAPI.mjs';
import createWorkspaceRouter from './api/workspaceAPI.mjs';
import createUserRouter from './api/userAPI.mjs';

export class KanbanServer {
    // Initialization
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8080;
        this.db = null;
    }

    // Setup
    async initialize() {
        this.db = await initializeDatabase();

        this.app.use(cors({ origin: 'http://localhost:5173' }));
        this.app.use(express.json());

        this.app.use('/api/kanban', createKanbanRouter(this.db));
        this.app.use('/api/users', createUserRouter(this.db));
        this.app.use('/api/workspaces', createWorkspaceRouter(this.db));
    }

    // Execution
    start() {
        this.app.listen(this.port, () => {
            console.log(`Backend server running on http://localhost:${this.port}`);
        });
    }
}

// Entry
async function run() {
    const server = new KanbanServer();
    await server.initialize();
    server.start();
}

run();