import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

export function useWorkspaces(userID) {
    const { sm } = useSync();
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(async () => {
        if (!sm || !userID) return;

        const ws = await sm.query(`
            SELECT w.*, c.name as categoryName, c.color as categoryColor
            FROM workspaces w
            LEFT JOIN categories c ON w.categoryID = c.id
            WHERE w.userID = ? AND w.isDeleted = 0
            ORDER BY w.createdAt DESC
        `, [userID]);

        const cats = await sm.query(
            'SELECT * FROM categories WHERE userID = ? AND isDeleted = 0 ORDER BY name ASC',
            [userID]
        );

        setWorkspaces(ws);
        setCategories(cats);
        setLoading(false);
    }, [sm, userID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    useEffect(() => {
        if (!sm || !userID) return;
        sm.sync(); // Trigger LWW sync instead of old pull
    }, [sm, userID]);

    async function createWorkspace(name, categoryID) {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        await sm.execute(
            `INSERT INTO workspaces (id, name, userID, categoryID, createdAt) VALUES (?,?,?,?,?)`,
            [id, name, userID, categoryID || null, createdAt]
        );
        const cat = categories.find(c => c.id === categoryID);
        return { id, name, userID, categoryID, createdAt, categoryName: cat?.name, categoryColor: cat?.color };
    }

    async function deleteWorkspace(id) {
        // Soft delete and update timestamp
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