import { useState, useEffect } from 'react';

const API = 'http://localhost:8080/api';


// Hook
export function useWorkspaces(userID) {
    const [workspaces, setWorkspaces] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userID) return;
        Promise.all([
            fetch(`${API}/workspaces?userID=${userID}`).then(r => r.json()),
            fetch(`${API}/workspaces/categories?userID=${userID}`).then(r => r.json()),
        ]).then(([wsData, catData]) => {
            setWorkspaces(wsData.workspaces || []);
            setCategories(catData.categories || []);
        }).finally(() => setLoading(false));
    }, [userID]);

    async function createWorkspace(name, categoryID) {
        const res = await fetch(`${API}/workspaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, userID, categoryID }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setWorkspaces(prev => [data.workspace, ...prev]);
        return data.workspace;
    }

    async function deleteWorkspace(id) {
        await fetch(`${API}/workspaces/${id}`, { method: 'DELETE' });
        setWorkspaces(prev => prev.filter(w => w.id !== id));
    }

    async function createCategory(name, color) {
        const res = await fetch(`${API}/workspaces/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color, userID }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setCategories(prev => [...prev, data.category]);
        return data.category;
    }

    return { workspaces, categories, loading, createWorkspace, deleteWorkspace, createCategory };
}