import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// custom hook functions
export function useWorkspaces(userID) {
    const { sm } = useSync();
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // database functions
    const loadLocal = useCallback(async () => {
        if (!sm || !userID) return;

        try {
            const ws = await sm.query(`
                SELECT w.*, c.name as categoryName, c.color as categoryColor
                FROM workspaces w
                LEFT JOIN categories c ON w.categoryID = c.id
                WHERE w.isDeleted = 0
                ORDER BY w.createdAt DESC
            `);

            const cats = await sm.query(
                'SELECT * FROM categories WHERE userID = ? AND isDeleted = 0 ORDER BY name ASC',
                [userID]
            );

            setWorkspaces(ws);
            setCategories(cats);
            setLoading(false);
        } catch (err) {
            console.error(err);
        }
    }, [sm, userID]);

    // event listener functions
    useEffect(() => {
        const handleUpdate = () => {
            // Some other part of the UI signaled "workspaces changed, refresh from server."
            // Pull explicitly from the server (e.g. after accepting an invite).
            if (sm) sm.pullFromServer();
        };
        window.addEventListener('workspacesUpdated', handleUpdate);
        return () => window.removeEventListener('workspacesUpdated', handleUpdate);
    }, [sm]);

    // subscription functions
    useEffect(() => {
        if (!sm) return;
        loadLocal();
        // Reload local state whenever the SyncManager notifies of a change
        // (local mutation OR merged server data). No polling needed.
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    // creation functions
    async function createWorkspace(name, categoryID) {
        const id = crypto.randomUUID();

        // date generation functions — millisecond precision to match server schema.
        const now = SyncManager.nowIso();

        // database functions
        await sm.execute(
            `INSERT INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`,
            [id, name, userID, categoryID || null, now, now]
        );

        await sm.execute(
            `INSERT INTO workspace_members (id, workspaceID, userID, role, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), id, userID, 'owner', now]
        );

        const cat = categories.find(c => c.id === categoryID);
        return { id, name, userID, categoryID, createdAt: now, categoryName: cat?.name, categoryColor: cat?.color };
    }

    // deletion functions
    async function deleteWorkspace(id) {
        await sm.execute(
            `UPDATE workspaces SET isDeleted = 1, updatedAt = ? WHERE id = ?`,
            [SyncManager.nowIso(), id]
        );
    }

    // creation functions
    async function createCategory(name, color) {
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO categories (id, name, color, userID, updatedAt) VALUES (?,?,?,?,?)`,
            [id, name, color, userID, SyncManager.nowIso()]
        );
        return { id, name, color, userID };
    }

    return { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory };
}