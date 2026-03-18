import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// database initialization functions
export async function initializeDatabase() {
    // database connection functions
    const db = await open({
        filename: './kanban.db',
        driver: sqlite3.Database
    });

    // database schema functions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            direction TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            isCompleted BOOLEAN,
            originalCategory TEXT,
            listID TEXT,
            FOREIGN KEY (listID) REFERENCES lists (id)
        );
    `);

    return db;
}