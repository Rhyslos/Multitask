import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// initialization functions
export async function initializeDatabase() {

    const db = await open({
        filename: './database/superSecretHighSecurityDataBase.db',
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');

    // database schema
    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        userID TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        userID TEXT NOT NULL,
        categoryID TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (categoryID) REFERENCES categories (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
        id TEXT PRIMARY KEY,
        workspaceID TEXT NOT NULL,
        userID TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'editor',
        joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE,
        FOREIGN KEY (userID) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        workspaceID TEXT NOT NULL,
        senderID TEXT NOT NULL,
        receiverEmail TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE,
        FOREIGN KEY (senderID) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kanban_tabs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'New Tab',
        color TEXT NOT NULL DEFAULT '#888888',
        tabOrder INTEGER NOT NULL DEFAULT 0,
        isArchived INTEGER NOT NULL DEFAULT 0,
        workspaceID TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
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
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
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
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (listID) REFERENCES lists (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '{}',
        workspaceID TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
    );

    -- THE PERFORMANCE FIX: Added to make live sync and megaphone broadcast lightning fast
    CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
    CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(listID, taskOrder);
    CREATE INDEX IF NOT EXISTS idx_lists_workspace_tab ON lists(workspaceID, tabID);
`);

    // migration functions
    const tables = ['users', 'categories', 'workspaces', 'kanban_tabs', 'lists', 'tasks', 'notes'];
    
    for (const table of tables) {
        const cols = await db.all(`PRAGMA table_info(${table})`);
        
        if (!cols.find(c => c.name === 'updatedAt')) {
            await db.exec(`ALTER TABLE ${table} ADD COLUMN updatedAt DATETIME`);
            await db.exec(`UPDATE ${table} SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL`);
        }
        
        if (!cols.find(c => c.name === 'isDeleted')) {
            await db.exec(`ALTER TABLE ${table} ADD COLUMN isDeleted INTEGER DEFAULT 0`);
        }
    }

    const listCols = await db.all('PRAGMA table_info(lists)');
    if (!listCols.find(c => c.name === 'tabID')) {
        await db.exec('ALTER TABLE lists ADD COLUMN tabID TEXT REFERENCES kanban_tabs(id) ON DELETE CASCADE');
    }

    return db;
}