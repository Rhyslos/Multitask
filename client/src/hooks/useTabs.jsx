// user functions
import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

export function useTabs(workspaceID) {
    const { sm } = useSync();
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(async () => {
        if (!sm || !workspaceID) return;
        
        const wsCheck = await sm.query('SELECT id FROM workspaces WHERE id = ?', [workspaceID]);
        if (wsCheck.length === 0) {
            setTabs([]);
            setLoading(false);
            return;
        }

        let fetched = await sm.query(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 AND isDeleted = 0 ORDER BY tabOrder ASC',
            [workspaceID]
        );

        if (fetched.length === 0) {
            const id = crypto.randomUUID();
            await sm.execute(
                `INSERT OR IGNORE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`,
                [id, 'Main', '#6c8ebf', 0, 0, workspaceID]
            );
            fetched = await sm.query(
                'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 AND isDeleted = 0 ORDER BY tabOrder ASC',
                [workspaceID]
            );
        }

        setTabs(fetched);
        
        setActiveTabId(currentActiveId => {
            if (fetched.length > 0 && !currentActiveId) return fetched[0].id;
            return currentActiveId;
        });
        
        setLoading(false);
    }, [sm, workspaceID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    async function addTab() {
        const id = crypto.randomUUID();
        const tabOrder = tabs.length;
        await sm.execute(
            `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID) VALUES (?,?,?,?,?,?)`,
            [id, 'New Tab', '#888888', tabOrder, 0, workspaceID]
        );
        setActiveTabId(id);
        return id;
    }

    async function updateTab(tabId, changes) {
        const { name, color } = changes;
        await sm.execute(
            `UPDATE kanban_tabs SET name = ?, color = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, color, tabId]
        );
    }

    async function archiveTab(tabId) {
        if (activeTabId === tabId) {
            const remaining = tabs.filter(t => t.id !== tabId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }
        await sm.execute(
            `UPDATE kanban_tabs SET isArchived = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [tabId]
        );
    }

    return { tabs, activeTabId, setActiveTabId, loading, addTab, updateTab, archiveTab };
}