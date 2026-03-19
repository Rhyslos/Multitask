import express from 'express';

// Import functions
import { initializeDatabase } from './database/db.mjs';
import createKanbanRouter from './api/kanbanAPI.mjs';
import createWorkspaceRouter from './api/workspaceAPI.mjs';

export class KanbanServer {
    // Initialization functions
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 8080;
        this.db = null;
    }

    // Setup functions
    async initialize() {
        this.db = await initializeDatabase();
        this.app.use(express.json());

        this.app.use('/api/kanban', createKanbanRouter(this.db));
        this.app.use('/api/users', createUserRouter(this.db));
        this.app.use('/api/workspaces', createWorkspaceRouter(this.db));
    }

    // Execution functions
    start() {
        this.app.listen(this.port, () => {
            console.log(`Backend server running on http://localhost:${this.port}`);
        });
    }
}

// Execution functions
async function run() {
    const server = new KanbanServer();
    await server.initialize();
    server.start();
}

run();