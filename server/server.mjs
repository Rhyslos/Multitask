import express from 'express';
import { initializeDatabase } from './modules/database/db.mjs';
import createKanbanRouter from '../api/kanbanAPI.mjs';

export class MultitaskServer {
    constructor() {
        // Server initialization functions
        this.app = express();
        this.port = process.env.PORT || 8080;
        this.serverInstance = null;
        this.db = null;
    }

    async initialize() {
        // Database initialization functions
        this.db = await initializeDatabase();

        // Middleware functions
        this.app.use(express.json());
        this.app.use(express.static('public'));
        this.app.use('/modules', express.static('modules'));

        // API routing functions
        this.app.use('/api/kanban', createKanbanRouter(this.db));
    }

    start() {
        // Server execution functions
        this.serverInstance = this.app.listen(this.port, () => {
            console.log(`Server running at http://localhost:${this.port}`);
        });
    }

    stop() {
        if (this.serverInstance) {
            this.serverInstance.close(() => {
                console.log("Server stopped.");
            });
        }
    }
}

// App execution functions
async function run() {
    const server = new MultitaskServer();
    await server.initialize();
    server.start();
}

run();