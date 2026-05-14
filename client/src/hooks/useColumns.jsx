import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// Cheap structural-equality check for an array of rows: same length, and every
// row matches by id + updatedAt. Server merges only land via the upsert path
// (which bumps updatedAt), so this is sufficient to detect real change.
// Cheaper and more correct than JSON.stringify, which is O(n) on every fire
// and not guaranteed to be order-stable across object key orderings.
function rowsEqualByIdAndUpdatedAt(a, b) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].updatedAt !== b[i].updatedAt) return false;
    }
    return true;
}

// Fetches and manages kanban columns for a given tab.
// A column is a stable entity with a UUID — columnIndex is only used for
// display ordering and is never used as a React key or identifier.
export function useColumns(workspaceID, tabID) {
    const { sm } = useSync();
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadLocal = useCallback(async () => {
        if (!sm || !workspaceID || !tabID) return;

        const rows = await sm.query(
            `SELECT * FROM kanban_columns
             WHERE workspaceID = ? AND tabID = ? AND isDeleted = 0
             ORDER BY columnIndex ASC`,
            [workspaceID, tabID]
        );

        setColumns(prev => rowsEqualByIdAndUpdatedAt(prev, rows) ? prev : rows);
        setLoading(false);
    }, [sm, workspaceID, tabID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        // sm.subscribe fires on every local mutation AND every server merge,
        // so the columns stay in sync without any manual triggers. Login-time
        // reconciliation is handled centrally by SyncManager.setUser().
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    // Adds a new column at the given columnIndex. The caller is responsible for
    // passing the correct index — typically columnCount (appending at the end)
    // or an explicit index for insertion.
    async function addColumn(columnIndex) {
        if (!sm || !workspaceID || !tabID) return null;

        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            [id, tabID, workspaceID, columnIndex, SyncManager.nowIso()]
        );

        return id;
    }

    // Soft-deletes a column. The cascade to lists and tasks is handled by
    // the backend on sync — locally we only mark the column itself deleted,
    // and useLists/useTasks will naturally return empty for a deleted columnID.
    async function deleteColumn(columnID) {
        if (!sm) return;

        await sm.execute(
            `UPDATE kanban_columns SET isDeleted = 1, updatedAt = ? WHERE id = ?`,
            [SyncManager.nowIso(), columnID]
        );
    }

    // Updates the columnIndex of every column in the given array. Used after
    // a delete to close gaps in the index sequence.
    async function reorderColumns(updates) {
        if (!sm || updates.length === 0) return;

        const ts = SyncManager.nowIso();
        await sm.runBatch(
            updates.map(({ id, columnIndex }) => ({
                sql: 'UPDATE kanban_columns SET columnIndex = ?, updatedAt = ? WHERE id = ?',
                params: [columnIndex, ts, id],
            }))
        );
    }

    return { columns, loading, addColumn, deleteColumn, reorderColumns };
}
