// react functions
import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// hook functions
export function useTabs(workspaceID) {
    const { sm } = useSync();
    const [tabs, setTabs] = useState([]);
    const [activeTabId, setActiveTabId] = useState(null);
    const [loading, setLoading] = useState(true);

    // In useTabs.jsx
    const loadLocal = useCallback(async () => {
        if (!sm || !workspaceID) return;

        const wsCheck = await sm.query('SELECT id FROM workspaces WHERE id = ?', [workspaceID]);
        if (wsCheck.length === 0) {
            setLoading(false);
            return; // workspace not known yet, wait for sync
        }

        let fetched = await sm.query(
            'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 AND isDeleted = 0 ORDER BY tabOrder ASC',
            [workspaceID]
        );

        // hook functions
        if (fetched.length === 0) {
            const owned = await sm.query(
                'SELECT id FROM workspaces WHERE id = ? AND userID = ?',
                [workspaceID, sm._userId]
            );

            if (owned.length === 0) {
                setLoading(false);
                return;
            }

            // ID generation functions
            const id = `default-tab-${workspaceID}`;

            // db insertion functions
            await sm.execute(
                `INSERT OR IGNORE INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt) VALUES (?,?,?,?,?,?,?)`,
                [id, 'Main', '#6c8ebf', 0, 0, workspaceID, SyncManager.nowIso()]
            );

            // data retrieval functions
            fetched = await sm.query(
                'SELECT * FROM kanban_tabs WHERE workspaceID = ? AND isArchived = 0 AND isDeleted = 0 ORDER BY tabOrder ASC',
                [workspaceID]
            );
        }

        setTabs(fetched);
        setActiveTabId(current => (!current && fetched.length > 0 ? fetched[0].id : current));
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
            `INSERT INTO kanban_tabs (id, name, color, tabOrder, isArchived, workspaceID, updatedAt) VALUES (?,?,?,?,?,?,?)`,
            [id, 'New Tab', '#888888', tabOrder, 0, workspaceID, SyncManager.nowIso()]
        );
        setActiveTabId(id);
        return id;
    }

    async function updateTab(tabId, changes) {
        const { name, color } = changes;
        await sm.execute(
            `UPDATE kanban_tabs SET name = ?, color = ?, updatedAt = ? WHERE id = ?`,
            [name, color, SyncManager.nowIso(), tabId]
        );
    }

    async function archiveTab(tabId) {
        if (activeTabId === tabId) {
            const remaining = tabs.filter(t => t.id !== tabId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }
        await sm.execute(
            `UPDATE kanban_tabs SET isArchived = 1, updatedAt = ? WHERE id = ?`,
            [SyncManager.nowIso(), tabId]
        );
    }

    // Soft-deletes a tab and everything underneath it: columns, lists, and
    // tasks. Single batch so the cascade is atomic — no flicker where the
    // tab is gone but its columns are still rendered, and no half-cascade
    // if the underlying worker call fails partway.
    //
    // The task sweep uses a subquery against the (pre-delete) lists table.
    // Because soft-deletes only set isDeleted = 1 (rows aren't physically
    // removed), the subquery still matches them inside the same batch.
    // Order of statements doesn't change the result; SQLite runs the whole
    // batch as one transaction.
    //
    // Active-tab handoff happens BEFORE the await so the UI can switch
    // immediately on the next render — matching how archiveTab does it.
    async function deleteTab(tabId) {
        if (!sm) return;

        if (activeTabId === tabId) {
            const remaining = tabs.filter(t => t.id !== tabId);
            setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
        }

        const ts = SyncManager.nowIso();
        await sm.runBatch([
            {
                sql: 'UPDATE kanban_tabs SET isDeleted = 1, updatedAt = ? WHERE id = ?',
                params: [ts, tabId],
            },
            {
                sql: 'UPDATE kanban_columns SET isDeleted = 1, updatedAt = ? WHERE tabID = ?',
                params: [ts, tabId],
            },
            {
                sql: 'UPDATE lists SET isDeleted = 1, updatedAt = ? WHERE tabID = ?',
                params: [ts, tabId],
            },
            {
                sql: 'UPDATE tasks SET isDeleted = 1, updatedAt = ? WHERE listID IN (SELECT id FROM lists WHERE tabID = ?)',
                params: [ts, tabId],
            },
        ]);
    }

    return { tabs, activeTabId, setActiveTabId, loading, addTab, updateTab, archiveTab, deleteTab };
}
