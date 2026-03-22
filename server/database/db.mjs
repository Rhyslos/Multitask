import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Database initialization
export async function initializeDatabase() {

    // Connection
    const db = await open({
        filename: './database/multitask.db',
        driver: sqlite3.Database
    });

    // Configuration
    await db.exec('PRAGMA foreign_keys = ON;');

    // Schema
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            userID TEXT NOT NULL,
            FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            userID TEXT NOT NULL,
            categoryID TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (categoryID) REFERENCES categories (id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS kanban_tabs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT 'New Tab',
            color TEXT NOT NULL DEFAULT '#888888',
            tabOrder INTEGER NOT NULL DEFAULT 0,
            isArchived INTEGER NOT NULL DEFAULT 0,
            workspaceID TEXT NOT NULL,
            FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            color TEXT,
            direction TEXT,
            columnIndex INTEGER NOT NULL DEFAULT 0,
            workspaceID TEXT NOT NULL,
            tabID TEXT,
            FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE,
            FOREIGN KEY (tabID) REFERENCES kanban_tabs (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            isCompleted BOOLEAN,
            originalCategory TEXT,
            color TEXT,
            listID TEXT NOT NULL,
            taskOrder INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (listID) REFERENCES lists (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '{}',
            workspaceID TEXT UNIQUE NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
        );
    `);

    // Migration
    const listCols = await db.all(`PRAGMA table_info(lists)`);
    if (!listCols.find(c => c.name === 'tabID')) {
        await db.exec(`ALTER TABLE lists ADD COLUMN tabID TEXT REFERENCES kanban_tabs(id) ON DELETE CASCADE`);
    }

    return db;
}