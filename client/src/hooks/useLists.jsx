import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// Cheap structural-equality check (see useColumns for rationale).
function rowsEqualByIdAndUpdatedAt(a, b) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].updatedAt !== b[i].updatedAt) return false;
    }
    return true;
}

// Fetches and manages lists for a given set of column IDs.
// Receives columnIDs as an array so the parent (Kanban page) can pass all
// column IDs for the active tab in one call — avoiding N separate subscriptions.
export function useLists(columnIDs) {
    const { sm } = useSync();
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);

    // Stable serialized key so loadLocal's identity doesn't change just because
    // the parent passed a new array reference with the same IDs.
    const columnIDsKey = useMemo(
        () => (columnIDs ?? []).join(','),
        [columnIDs]
    );

    const loadLocal = useCallback(async () => {
        if (!sm || !columnIDsKey) {
            setLists([]);
            setLoading(false);
            return;
        }

        const ids = columnIDsKey.split(',').filter(Boolean);
        if (ids.length === 0) {
            setLists([]);
            setLoading(false);
            return;
        }

        const placeholders = ids.map(() => '?').join(',');
        const rows = await sm.query(
            `SELECT * FROM lists WHERE columnID IN (${placeholders}) AND isDeleted = 0`,
            ids
        );

        setLists(prev => rowsEqualByIdAndUpdatedAt(prev, rows) ? prev : rows);
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

    // Updates the column mapping and listOrder for multiple lists at once.
    async function reorderLists(updates) {
        if (!sm || !updates || updates.length === 0) return;

        const ts = SyncManager.nowIso();

        // Map the drag-and-drop updates into an array of SQL transactions
        const batchStatements = updates.map(u => ({
            sql: 'UPDATE lists SET columnID = ?, listOrder = ?, updatedAt = ? WHERE id = ?',
            params: [u.columnID, u.listOrder, ts, u.id],
        }));

        // Execute them all at once so the UI stays snappy and in sync
        await sm.runBatch(batchStatements);
    }

    return { lists, loading, addList, updateList, deleteList, reorderLists };
}
