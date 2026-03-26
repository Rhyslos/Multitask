/**
 * useWorkspaces.jsx — offline-first
 */
import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

const API = 'http://localhost:8080/api';

export function useWorkspaces(userID) {
    const { sm, ready } = useSync();
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(() => {
        if (!sm || !userID) return;

        // Workspaces joined with category name/color
        const ws = sm.query(`
            SELECT w.*, c.name as categoryName, c.color as categoryColor
            FROM workspaces w
            LEFT JOIN categories c ON w.categoryID = c.id
            WHERE w.userID = ?
            ORDER BY w.createdAt DESC
        `, [userID]);

        const cats = sm.query(
            'SELECT * FROM categories WHERE userID = ? ORDER BY name ASC',
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

    // Pull from server on mount
    useEffect(() => {
        if (!ready || !userID || !sm) return;
        sm.pullFromServer(userID);
    }, [ready, userID, sm]);

    async function createWorkspace(name, categoryID) {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        await sm.execute(
            `INSERT INTO workspaces (id, name, userID, categoryID, createdAt) VALUES (?,?,?,?,?)`,
            [id, name, userID, categoryID || null, createdAt],
            { serverMethod: 'POST', serverPath: '/api/workspaces', serverBody: { name, userID, categoryID } }
        );
        // Return a synthetic workspace object (matches server shape)
        const cat = categories.find(c => c.id === categoryID);
        return { id, name, userID, categoryID, createdAt, categoryName: cat?.name, categoryColor: cat?.color };
    }

    async function deleteWorkspace(id) {
        await sm.execute(`DELETE FROM workspaces WHERE id = ?`, [id],
            { serverMethod: 'DELETE', serverPath: `/api/workspaces/${id}`, serverBody: {} }
        );
    }

    async function createCategory(name, color) {
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO categories (id, name, color, userID) VALUES (?,?,?,?)`,
            [id, name, color, userID],
            { serverMethod: 'POST', serverPath: '/api/workspaces/categories', serverBody: { name, color, userID } }
        );
        return { id, name, color, userID };
    }

    return { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory };
}
