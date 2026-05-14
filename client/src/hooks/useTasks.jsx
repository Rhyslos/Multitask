import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSync } from './useSync';
import { SyncManager } from '../sync/syncManager';

// Cheap structural-equality check (see useColumns for rationale).
// updatedAt covers any field change including subtasks, since the writer always
// bumps it on update.
function rowsEqualByIdAndUpdatedAt(a, b) {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id || a[i].updatedAt !== b[i].updatedAt) return false;
    }
    return true;
}

// Fetches and manages tasks for a given set of list IDs.
// Receives listIDs as an array — one subscription covers all lists in the tab,
// which is the correct granularity for drag-and-drop across lists.
export function useTasks(listIDs) {
    const { sm } = useSync();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    // Stable serialized key so loadLocal's identity doesn't change just because
    // the parent passed a new array reference with the same IDs.
    const listIDsKey = useMemo(
        () => (listIDs ?? []).join(','),
        [listIDs]
    );

    // query functions
    const loadLocal = useCallback(async () => {
        if (!sm || !listIDsKey) {
            setTasks([]);
            setLoading(false);
            return;
        }

        const ids = listIDsKey.split(',').filter(Boolean);
        if (ids.length === 0) {
            setTasks([]);
            setLoading(false);
            return;
        }

        const placeholders = ids.map(() => '?').join(',');
        const rows = await sm.query(
            `SELECT * FROM tasks
            WHERE listID IN (${placeholders}) AND isDeleted = 0
            ORDER BY taskOrder ASC`,
            ids
        );

        // parsing functions
        const parsedRows = rows.map(row => ({
            ...row,
            subtasks: row.subtasks ? JSON.parse(row.subtasks) : []
        }));

        setTasks(prev => rowsEqualByIdAndUpdatedAt(prev, parsedRows) ? prev : parsedRows);
        setLoading(false);
    }, [sm, listIDsKey]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    // add functions
    async function addTask(listID, listCategory, listColor) {
        if (!sm || !listID) return null;

        const existingTasks = tasks.filter(t => t.listID === listID);
        const id = crypto.randomUUID();

        await sm.execute(
            `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, 'New Task', '', 0, listCategory ?? '', listColor ?? '', listID, existingTasks.length, null, null, SyncManager.nowIso()]
        );

        return id;
    }

    // update functions
    async function updateTask(taskID, changes) {
        if (!sm) return;

        const task = tasks.find(t => t.id === taskID);
        if (!task) return;

        const updated = { ...task, ...changes };
        const subtasksString = updated.subtasks ? JSON.stringify(updated.subtasks) : null;

        await sm.execute(
            `UPDATE tasks SET
                title = ?, description = ?, isCompleted = ?,
                listID = ?, originalCategory = ?, color = ?, taskOrder = ?,
                deadline = ?, subtasks = ?,
                updatedAt = ?
            WHERE id = ?`,
            [
                updated.title,
                updated.description,
                updated.isCompleted ? 1 : 0,
                updated.listID,
                updated.originalCategory,
                updated.color,
                updated.taskOrder,
                updated.deadline,
                subtasksString,
                SyncManager.nowIso(),
                taskID,
            ]
        );
    }

    async function deleteTask(taskID) {
        if (!sm) return;

        await sm.execute(
            'UPDATE tasks SET isDeleted = 1, updatedAt = ? WHERE id = ?',
            [SyncManager.nowIso(), taskID]
        );
    }

    // Applies a batch of position updates — used by drag-and-drop to move a
    // task within or between lists. Each update is { id, listID, taskOrder }.
    // All updates in the batch share one timestamp — they're a single logical
    // event from the user's perspective and should sort identically.
    async function reorderTasks(updates) {
        if (!sm || updates.length === 0) return;

        const ts = SyncManager.nowIso();
        await sm.runBatch(
            updates.map(u => ({
                sql: 'UPDATE tasks SET listID = ?, taskOrder = ?, updatedAt = ? WHERE id = ?',
                params: [u.listID, u.taskOrder, ts, u.id],
            }))
        );
    }

    return { tasks, loading, addTask, updateTask, deleteTask, reorderTasks };
}
