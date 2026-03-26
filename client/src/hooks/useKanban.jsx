/**
 * useKanban.jsx  — offline-first rewrite
 *
 * All reads come from the local sql.js DB.
 * All writes go to the local DB first, then attempt the server.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSync } from './useSync';

const API = 'http://localhost:8080/api';

export function useKanban(workspaceID, tabID) {
    const { sm, ready } = useSync();
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

    // ── Load from local DB ────────────────────────────────────────────────────

    const loadLocal = useCallback(() => {
        if (!sm || !workspaceID || !tabID) return;
        const ls = sm.query(
            'SELECT * FROM lists WHERE workspaceID = ? AND tabID = ?',
            [workspaceID, tabID]
        );
        const listIds = ls.map(l => l.id);
        let ts = [];
        if (listIds.length > 0) {
            const ph = listIds.map(() => '?').join(',');
            ts = sm.query(
                `SELECT * FROM tasks WHERE listID IN (${ph}) ORDER BY taskOrder ASC`,
                listIds
            );
        }
        setLists(ls);
        setTasks(ts);
        setLoading(false);
        columnIds.current = {};
    }, [sm, workspaceID, tabID]);

    // Re-render when local DB changes (after any write / sync pull)
    useEffect(() => {
        if (!sm) return;
        loadLocal();
        const unsub = sm.subscribe(loadLocal);
        return unsub;
    }, [sm, loadLocal]);

    // On mount, also try a server pull to get the latest data
    useEffect(() => {
        if (!ready || !workspaceID) return;
        sm?.pullFromServer();
    }, [ready, workspaceID]);

    // ── Lists ─────────────────────────────────────────────────────────────────

    async function addList(columnIndex, wsID) {
        const id = crypto.randomUUID();
        const newList = { id, name: 'New List', category: '', color: '', direction: 'vertical', columnIndex, workspaceID: wsID, tabID };

        await sm.execute(
            `INSERT INTO lists (id, name, category, color, direction, workspaceID, columnIndex, tabID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, newList.name, '', '', 'vertical', wsID, columnIndex, tabID],
            { serverMethod: 'POST', serverPath: '/api/kanban/lists', serverBody: newList }
        );
        return id;
    }

    async function updateList(listId, changes) {
        const { name = '', category = '', color = '' } = changes;
        await sm.execute(
            `UPDATE lists SET name = ?, category = ?, color = ? WHERE id = ?`,
            [name, category, color, listId],
            { serverMethod: 'PUT', serverPath: `/api/kanban/lists/${listId}`, serverBody: changes }
        );
    }

    async function deleteList(listId) {
        // Re-index remaining columns (mirrors server logic)
        const remaining = sm.query(
            'SELECT * FROM lists WHERE workspaceID = ? AND id != ?',
            [workspaceID, listId]
        );
        const cols = [...new Set(remaining.map(l => l.columnIndex))].sort((a, b) => a - b);
        const remap = {};
        cols.forEach((c, i) => { remap[c] = i; });

        setRemovingIds(prev => new Set([...prev, listId]));

        await sm.execute(`DELETE FROM lists WHERE id = ?`, [listId],
            { serverMethod: 'DELETE', serverPath: `/api/kanban/lists/${listId}`, serverBody: {} }
        );
        await sm.execute(`DELETE FROM tasks WHERE listID = ?`, [listId]);

        // Re-index
        for (const l of remaining) {
            const newIdx = remap[l.columnIndex];
            if (newIdx !== l.columnIndex) {
                await sm.execute(
                    `UPDATE lists SET columnIndex = ? WHERE id = ?`,
                    [newIdx, l.id],
                    { serverMethod: 'PUT', serverPath: '/api/kanban/lists/reorder', serverBody: { updates: [{ id: l.id, columnIndex: newIdx }] } }
                );
            }
        }

        setTimeout(() => {
            setRemovingIds(prev => { const n = new Set(prev); n.delete(listId); return n; });
        }, 250);
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────

    async function addTask(listId) {
        const list = lists.find(l => l.id === listId);
        const listTasks = tasks.filter(t => t.listID === listId);
        const id = crypto.randomUUID();
        const newTask = {
            id, title: 'New Task', description: '', isCompleted: 0,
            originalCategory: list?.category || '', color: list?.color || '',
            listID: listId, taskOrder: listTasks.length,
        };
        await sm.execute(
            `INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, newTask.title, '', 0, newTask.originalCategory, newTask.color, listId, newTask.taskOrder],
            { serverMethod: 'POST', serverPath: '/api/kanban/tasks', serverBody: newTask }
        );
        return id;
    }

    async function updateTask(taskId, changes) {
        const task = tasks.find(t => t.id === taskId);
        const updated = { ...task, ...changes };
        await sm.execute(
            `UPDATE tasks SET title=?, description=?, isCompleted=?, listID=?, originalCategory=?, color=?, taskOrder=? WHERE id=?`,
            [updated.title, updated.description, updated.isCompleted ? 1 : 0, updated.listID, updated.originalCategory, updated.color, updated.taskOrder, taskId],
            { serverMethod: 'PUT', serverPath: `/api/kanban/tasks/${taskId}`, serverBody: updated }
        );
    }

    async function deleteTask(taskId) {
        await sm.execute(`DELETE FROM tasks WHERE id = ?`, [taskId],
            { serverMethod: 'DELETE', serverPath: `/api/kanban/tasks/${taskId}`, serverBody: {} }
        );
    }

    async function reorderTasks(updates, targetListId, taskId) {
        sm.runBatch(
            updates.map(u => ({
                sql: 'UPDATE tasks SET listID = ?, taskOrder = ? WHERE id = ?',
                params: [u.listID, u.taskOrder, u.id],
            }))
        );

        await sm.execute('SELECT 1', [], {
            serverMethod: 'PUT',
            serverPath: '/api/kanban/tasks/reorder',
            serverBody: { updates },
        });
    }

    return { lists, tasks, loading, removingIds, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks, getColumnId };
}
