import { useState, useEffect, useRef, useCallback } from 'react';
import { useSync } from './useSync';

export function useKanban(workspaceID, tabID) {
    const { sm } = useSync();
    const [lists, setLists] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [removingIds, setRemovingIds] = useState(new Set());
    const columnIds = useRef({});

    function getColumnId(colIndex) {
        if (!columnIds.current[colIndex]) {
            columnIds.current[colIndex] = crypto.randomUUID();
        }
        return columnIds.current[colIndex];
    }

    const loadLocal = useCallback(async () => {
        if (!sm || !workspaceID || !tabID) return;
        const ls = await sm.query(
            'SELECT * FROM lists WHERE workspaceID = ? AND tabID = ? AND isDeleted = 0',
            [workspaceID, tabID]
        );
        const listIds = ls.map(l => l.id);
        let ts = [];
        if (listIds.length > 0) {
            const ph = listIds.map(() => '?').join(',');
            ts = await sm.query(
                `SELECT * FROM tasks WHERE listID IN (${ph}) AND isDeleted = 0 ORDER BY taskOrder ASC`,
                listIds
            );
        }
        setLists(ls);
        setTasks(ts);
        setLoading(false);
        columnIds.current = {};
    }, [sm, workspaceID, tabID]);

    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    useEffect(() => {
        if (!sm || !workspaceID) return;
        sm.sync(); // Trigger LWW sync
    }, [sm, workspaceID]);

    async function addList(columnIndex, wsID) {
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO lists (id, name, category, color, direction, workspaceID, columnIndex, tabID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, 'New List', '', '', 'vertical', wsID, columnIndex, tabID]
        );
        return id;
    }

    async function updateList(listId, changes) {
        const { name = '', category = '', color = '' } = changes;
        await sm.execute(
            `UPDATE lists SET name = ?, category = ?, color = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, category, color, listId]
        );
    }

    async function deleteList(listId) {
        const remaining = await sm.query(
            'SELECT * FROM lists WHERE workspaceID = ? AND id != ? AND isDeleted = 0',
            [workspaceID, listId]
        );
        const cols = [...new Set(remaining.map(l => l.columnIndex))].sort((a, b) => a - b);
        const remap = {};
        cols.forEach((c, i) => { remap[c] = i; });

        setRemovingIds(prev => new Set([...prev, listId]));

        await sm.execute(`UPDATE lists SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [listId]);
        await sm.execute(`UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE listID = ?`, [listId]);

        for (const l of remaining) {
            const newIdx = remap[l.columnIndex];
            if (newIdx !== l.columnIndex) {
                await sm.execute(`UPDATE lists SET columnIndex = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [newIdx, l.id]);
            }
        }

        setTimeout(() => {
            setRemovingIds(prev => { const n = new Set(prev); n.delete(listId); return n; });
        }, 250);
    }

    async function addTask(listId) {
        const list = lists.find(l => l.id === listId);
        const listTasks = tasks.filter(t => t.listID === listId);
        const id = crypto.randomUUID();
        await sm.execute(
            `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, 'New Task', '', 0, list?.category || '', list?.color || '', listId, listTasks.length]
        );
        return id;
    }

    async function updateTask(taskId, changes) {
        const task = tasks.find(t => t.id === taskId);
        const updated = { ...task, ...changes };
        await sm.execute(
            `UPDATE tasks SET title=?, description=?, isCompleted=?, listID=?, originalCategory=?, color=?, taskOrder=?, updatedAt = CURRENT_TIMESTAMP WHERE id=?`,
            [updated.title, updated.description, updated.isCompleted ? 1 : 0, updated.listID, updated.originalCategory, updated.color, updated.taskOrder, taskId]
        );
    }

    async function deleteTask(taskId) {
        await sm.execute(`UPDATE tasks SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [taskId]);
    }

    async function reorderTasks(updates, targetListId, taskId) {
        await sm.runBatch(
            updates.map(u => ({
                sql: 'UPDATE tasks SET listID = ?, taskOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
                params: [u.listID, u.taskOrder, u.id],
            }))
        );
    }

    return { lists, tasks, loading, removingIds, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks, getColumnId };
}