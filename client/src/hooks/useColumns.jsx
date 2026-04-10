import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

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

        setColumns(prev => JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows);
        setLoading(false);
    }, [sm, workspaceID, tabID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    useEffect(() => {
        if (!sm || !workspaceID) return;
        sm.sync();
    }, [sm, workspaceID]);

    // Adds a new column at the given columnIndex. The caller is responsible for
    // passing the correct index — typically columnCount (appending at the end)
    // or an explicit index for insertion.
    async function addColumn(columnIndex) {
        if (!sm || !workspaceID || !tabID) return null;

        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex) VALUES (?, ?, ?, ?)`,
            [id, tabID, workspaceID, columnIndex]
        );

        return id;
    }

    // Soft-deletes a column. The cascade to lists and tasks is handled by
    // the backend on sync — locally we only mark the column itself deleted,
    // and useLists/useTasks will naturally return empty for a deleted columnID.
    async function deleteColumn(columnID) {
        if (!sm) return;

        await sm.execute(
            `UPDATE kanban_columns SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [columnID]
        );
    }

    // Updates the columnIndex of every column in the given array. Used after
    // a delete to close gaps in the index sequence.
    async function reorderColumns(updates) {
        if (!sm || updates.length === 0) return;

        await sm.runBatch(
            updates.map(({ id, columnIndex }) => ({
                sql: 'UPDATE kanban_columns SET columnIndex = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                params: [columnIndex, id],
            }))
        );
    }

    return { columns, loading, addColumn, deleteColumn, reorderColumns };
}
