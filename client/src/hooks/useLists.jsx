import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// Fetches and manages lists for a given set of column IDs.
// Receives columnIDs as an array so the parent (Kanban page) can pass all
// column IDs for the active tab in one call — avoiding N separate subscriptions.
export function useLists(columnIDs) {
    const { sm } = useSync();
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);

    // Stable serialized key so useCallback doesn't change on every render
    const columnIDsKey = JSON.stringify(columnIDs);

    const loadLocal = useCallback(async () => {
        if (!sm || !columnIDs || columnIDs.length === 0) {
            setLists([]);
            setLoading(false);
            return;
        }

        const placeholders = columnIDs.map(() => '?').join(',');
        const rows = await sm.query(
            `SELECT * FROM lists WHERE columnID IN (${placeholders}) AND isDeleted = 0`,
            columnIDs
        );

        setLists(prev => JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows);
        setLoading(false);
    }, [sm, columnIDsKey]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    async function addList(columnID, workspaceID, tabID) {
        if (!sm) return null;

        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO lists (id, name, category, color, direction, columnID, workspaceID, tabID, updatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, 'New List', '', '', 'vertical', columnID, workspaceID, tabID, SyncManager.nowIso()]
        );

        return id;
    }

    // Changes is an object with any subset of { name, category, color }.
    // Only the fields present in the schema are updated — no silent drops.
    async function updateList(listID, changes) {
        if (!sm) return;

        const list = lists.find(l => l.id === listID);
        if (!list) return;

        const updated = { ...list, ...changes };
        await sm.execute(
            `UPDATE lists SET name = ?, category = ?, color = ?, updatedAt = ? WHERE id = ?`,
            [updated.name, updated.category, updated.color, SyncManager.nowIso(), listID]
        );
    }

    // Soft-deletes a list and all its tasks in a single batch. Both statements
    // share one timestamp — they represent one logical action.
    async function deleteList(listID) {
        if (!sm) return;

        const ts = SyncManager.nowIso();
        await sm.runBatch([
            {
                sql: 'UPDATE lists SET isDeleted = 1, updatedAt = ? WHERE id = ?',
                params: [ts, listID],
            },
            {
                sql: 'UPDATE tasks SET isDeleted = 1, updatedAt = ? WHERE listID = ?',
                params: [ts, listID],
            },
        ]);
    }

    return { lists, loading, addList, updateList, deleteList };
}
