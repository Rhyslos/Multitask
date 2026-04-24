import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// database initialization functions
export async function initializeDatabase() {
    const db = await open({
        filename: './database/superSecretHighSecurityDataBase.db',
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');

    await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        displayName TEXT,
        firstName TEXT,
        lastName TEXT,
        countryIso TEXT,
        countryCode TEXT,
        phoneNumber TEXT,
        jobTitle TEXT,
        gender TEXT,
        skillset TEXT,
        privacySettings TEXT DEFAULT '{}',
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
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS kanban_columns (
        id TEXT PRIMARY KEY,
        tabID TEXT NOT NULL,
        workspaceID TEXT NOT NULL,
        columnIndex INTEGER NOT NULL DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (tabID) REFERENCES kanban_tabs (id) ON DELETE CASCADE,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        color TEXT,
        direction TEXT,
        listOrder INTEGER NOT NULL DEFAULT 0,
        columnID TEXT NOT NULL,
        workspaceID TEXT NOT NULL,
        tabID TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (columnID) REFERENCES kanban_columns (id) ON DELETE CASCADE,
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
        deadline TEXT,
        subtasks TEXT,
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

    CREATE TABLE IF NOT EXISTS notation_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        workspaceID TEXT NOT NULL,
        color TEXT,
        groupOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notation_pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Untitled',
        workspaceID TEXT NOT NULL,
        groupID TEXT,
        pageOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        isDeleted INTEGER DEFAULT 0,
        FOREIGN KEY (workspaceID) REFERENCES workspaces (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_members_user_ws ON workspace_members(userID, workspaceID);
    CREATE INDEX IF NOT EXISTS idx_workspace_members_ws ON workspace_members(workspaceID);
    CREATE INDEX IF NOT EXISTS idx_tasks_list_order ON tasks(listID, taskOrder);
    CREATE INDEX IF NOT EXISTS idx_lists_column ON lists(columnID);
    CREATE INDEX IF NOT EXISTS idx_columns_tab ON kanban_columns(workspaceID, tabID);
    CREATE INDEX IF NOT EXISTS idx_notation_pages_workspace ON notation_pages(workspaceID);
    CREATE INDEX IF NOT EXISTS idx_notation_pages_group ON notation_pages(groupID);
    `);

    return db;
}