import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

export function useWorkspaces(userID) {
    const { sm } = useSync();
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(async () => {
        if (!sm || !userID) return;
        console.log("[FRONTEND] loadLocal triggered, querying browser SQLite...");

        try {
            const ws = await sm.query(`
                SELECT w.*, c.name as categoryName, c.color as categoryColor
                FROM workspaces w
                LEFT JOIN categories c ON w.categoryID = c.id
                WHERE w.isDeleted = 0
                ORDER BY w.createdAt DESC
            `);
            
            console.log(`[FRONTEND] Found ${ws.length} workspaces in local DB.`, ws);

            const cats = await sm.query(
                'SELECT * FROM categories WHERE userID = ? AND isDeleted = 0 ORDER BY name ASC',
                [userID]
            );

            setWorkspaces(ws);
            setCategories(cats);
            setLoading(false);
        } catch (err) {
            console.error("[FRONTEND] Error in loadLocal:", err);
        }
    }, [sm, userID]);

    // Listen for the invite acceptance event and force a sync
    useEffect(() => {
        const handleUpdate = () => {
            console.log("[FRONTEND] 'workspacesUpdated' event received! Forcing sync...");
            if (sm) {
                sm.sync().then(() => {
                    console.log("[FRONTEND] sm.sync() finished. Calling loadLocal()...");
                    loadLocal();
                }).catch(err => console.error("[FRONTEND] sm.sync() failed:", err));
            }
        };
        window.addEventListener('workspacesUpdated', handleUpdate);
        return () => window.removeEventListener('workspacesUpdated', handleUpdate);
    }, [sm, loadLocal]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    useEffect(() => {
        if (!sm || !userID) return;
        sm.sync(); 
    }, [sm, userID]);

    useEffect(() => {
        const handleUpdate = () => {
            if (sm) {
                sm.sync().then(loadLocal);
            }
        };
        window.addEventListener('workspacesUpdated', handleUpdate);
        return () => window.removeEventListener('workspacesUpdated', handleUpdate);
    }, [sm, loadLocal]);

   async function createWorkspace(name, categoryID) {
        const id = crypto.randomUUID();
        
        // Generate the exact datetime string SQLite expects (YYYY-MM-DD HH:MM:SS)
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        
        // 1. Insert Workspace locally WITH the explicit timestamp
        await sm.execute(
            `INSERT INTO workspaces (id, name, userID, categoryID, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`,
            [id, name, userID, categoryID || null, now, now]
        );

        // 2. Insert creator into workspace_members locally WITH explicit timestamp
        await sm.execute(
            `INSERT INTO workspace_members (id, workspaceID, userID, role, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), id, userID, 'owner', now]
        );

        // 3. Force an immediate, blocking sync to the server
        try {
            await sm.forceSync();
        } catch (e) {
            console.warn("Could not force sync workspace to server yet:", e);
        }

        const cat = categories.find(c => c.id === categoryID);
        return { id, name, userID, categoryID, createdAt: now, categoryName: cat?.name, categoryColor: cat?.color };
    }

    async function deleteWorkspace(id) {
        await sm.execute(
            `UPDATE workspaces SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, 
            [id]
        );
    }

    async function createCategory(name, color) {
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO categories (id, name, color, userID) VALUES (?,?,?,?)`,
            [id, name, color, userID]
        );
        return { id, name, color, userID };
    }

    return { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory };
}