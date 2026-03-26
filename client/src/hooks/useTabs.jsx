/**
 * useTabs.jsx — offline-first
 */
import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

const API = 'http://localhost:8080/api';

export function useTabs(workspaceID) {
    const { sm, ready } = useSync();
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(() => {
        if (!sm || !workspaceID) return;
        const fetched = sm.query(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 ORDER BY tabOrder ASC',
            [workspaceID]
        );
        setTabs(fetched);
        if (fetched.length > 0 && !activeTabId) setActiveTabId(fetched[0].id);
        setLoading(false);
    }, [sm, workspaceID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    // Seed default tab if the local DB has none and we're first loading
    useEffect(() => {
        if (!ready || !workspaceID || !sm) return;
        const existing = sm.query(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0',
            [workspaceID]
        );
        if (existing.length === 0) {
            const id = crypto.randomUUID();
            sm.execute(
                `INSERT OR IGNORE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`,
                [id, 'Main', '#6c8ebf', 0, 0, workspaceID],
                { serverMethod: 'POST', serverPath: '/api/kanban/tabs', serverBody: { id, name: 'Main', color: '#6c8ebf', tabOrder: 0, workspaceID } }
            );
        }
    }, [ready, workspaceID, sm]);

    async function addTab() {
        const id = crypto.randomUUID();
        const tabOrder = tabs.length;
        await sm.execute(
            `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`,
            [id, 'New Tab', '#888888', tabOrder, 0, workspaceID],
            { serverMethod: 'POST', serverPath: '/api/kanban/tabs', serverBody: { id, name: 'New Tab', color: '#888888', tabOrder, workspaceID } }
        );
        setActiveTabId(id);
        return id;
    }

    async function updateTab(tabId, changes) {
        const { name, color } = changes;
        await sm.execute(
            `UPDATE kanban_tabs SET name = ?, color = ? WHERE id = ?`,
            [name, color, tabId],
            { serverMethod: 'PUT', serverPath: `/api/kanban/tabs/${tabId}`, serverBody: changes }
        );
    }

    async function archiveTab(tabId) {
        if (activeTabId === tabId) {
            const remaining = tabs.filter(t => t.id !== tabId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }
        await sm.execute(
            `UPDATE kanban_tabs SET isArchived = 1 WHERE id = ?`,
            [tabId],
            { serverMethod: 'PUT', serverPath: `/api/kanban/tabs/${tabId}/archive`, serverBody: {} }
        );
    }

    return { tabs, activeTabId, setActiveTabId, loading, addTab, updateTab, archiveTab };
}
