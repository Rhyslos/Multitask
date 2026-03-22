import { useState, useEffect } from 'react';

const API = 'http://localhost:8080/api';


// Hook
export function useTabs(workspaceID) {
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!workspaceID) return;
        setLoading(true);
        fetch(`${API}/kanban/tabs/${workspaceID}`)
            .then(r => r.json())
            .then(data => {
                const fetched = data.tabs || [];
                setTabs(fetched);
                if (fetched.length > 0) setActiveTabId(fetched[0].id);
            })
            .finally(() => setLoading(false));
    }, [workspaceID]);

    async function addTab() {
        const id = crypto.randomUUID();
        const tabOrder = tabs.length;
        const newTab = {
            id,
            name: 'New Tab',
            color: '#888888',
            tabOrder,
            workspaceID,
        };

        await fetch(`${API}/kanban/tabs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTab),
        });

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(id);
        return id;
    }

    async function updateTab(tabId, changes) {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...changes } : t));

        await fetch(`${API}/kanban/tabs/${tabId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes),
        });
    }

    async function archiveTab(tabId) {
        if (activeTabId === tabId) {
            const remaining = tabs.filter(t => t.id !== tabId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }

        setTabs(prev => prev.filter(t => t.id !== tabId));

        await fetch(`${API}/kanban/tabs/${tabId}/archive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return { tabs, activeTabId, setActiveTabId, loading, addTab, updateTab, archiveTab };
}