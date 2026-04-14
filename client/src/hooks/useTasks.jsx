import { useState, useEffect, useCallback } from 'react';
import { useSync } from './useSync';

// Fetches and manages tasks for a given set of list IDs.
// Receives listIDs as an array — one subscription covers all lists in the tab,
// which is the correct granularity for drag-and-drop across lists.
export function useTasks(listIDs) {
    const { sm } = useSync();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    // Stable serialized key so useCallback doesn't change on every render
    const listIDsKey = JSON.stringify(listIDs);

    const loadLocal = useCallback(async () => {
        if (!sm || !listIDs || listIDs.length === 0) {
            setTasks([]);
            setLoading(false);
            return;
        }

        const placeholders = listIDs.map(() => '?').join(',');
        const rows = await sm.query(
            `SELECT * FROM tasks 
             WHERE listID IN (${placeholders}) AND isDeleted = 0 
             ORDER BY taskOrder ASC`,
            listIDs
        );

        setTasks(prev => JSON.stringify(prev) === JSON.stringify(rows) ? prev : rows);
        setLoading(false);
    }, [sm, listIDsKey]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    async function addTask(listID, listCategory, listColor) {
        if (!sm || !listID) return null;

        const existingTasks = tasks.filter(t => t.listID === listID);
        const id = crypto.randomUUID();

        await sm.execute(
            `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, 'New Task', '', 0, listCategory ?? '', listColor ?? '', listID, existingTasks.length]
        );

        return id;
    }

    // Merges changes into the existing task record — never silently drops fields.
    async function updateTask(taskID, changes) {
        if (!sm) return;

        const task = tasks.find(t => t.id === taskID);
        if (!task) return;

        const updated = { ...task, ...changes };
        await sm.execute(
            `UPDATE tasks SET 
                title = ?, description = ?, isCompleted = ?, 
                listID = ?, originalCategory = ?, color = ?, taskOrder = ?,
                updatedAt = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                updated.title,
                updated.description,
                updated.isCompleted ? 1 : 0,
                updated.listID,
                updated.originalCategory,
                updated.color,
                updated.taskOrder,
                taskID,
            ]
        );
    }

    async function deleteTask(taskID) {
        if (!sm) return;

        await sm.execute(
            'UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [taskID]
        );
    }

    // Applies a batch of position updates — used by drag-and-drop to move a
    // task within or between lists. Each update is { id, listID, taskOrder }.
    async function reorderTasks(updates) {
        if (!sm || updates.length === 0) return;

        await sm.runBatch(
            updates.map(u => ({
                sql: 'UPDATE tasks SET listID = ?, taskOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                params: [u.listID, u.taskOrder, u.id],
            }))
        );
    }

    return { tasks, loading, addTask, updateTask, deleteTask, reorderTasks };
}
