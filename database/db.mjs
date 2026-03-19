import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// database initialization functions
export async function initializeDatabase() {
    
    // database connection functions
    const db = await open({
        filename: './kanban.db',
        driver: sqlite3.Database
    });

    // database configuration functions
    await db.exec('PRAGMA foreign_keys = ON;');

    // database schema functions
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            userID TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            direction TEXT,
            workspaceID TEXT NOT NULL,
            FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            isCompleted BOOLEAN,
            originalCategory TEXT,
            listID TEXT NOT NULL,
            FOREIGN KEY (listID) REFERENCES lists (id) ON DELETE CASCADE
        );
    `);

    return db;
}