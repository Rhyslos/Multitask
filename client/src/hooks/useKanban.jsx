import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:8080/api';


// Hook
export function useKanban(workspaceID, tabID) {
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

    useEffect(() => {
        if (!workspaceID || !tabID) return;
        setLoading(true);
        setLists([]);
        setTasks([]);
        columnIds.current = {};

        fetch(`${API}/kanban/board/${workspaceID}/${tabID}`)
            .then(r => r.json())
            .then(data => {
                setLists(data.lists || []);
                setTasks(data.tasks || []);
            })
            .finally(() => setLoading(false));
    }, [workspaceID, tabID]);

    async function addList(columnIndex, workspaceID) {
        const id = crypto.randomUUID();
        const newList = {
            id,
            name: 'New List',
            category: '',
            color: '',
            direction: 'vertical',
            columnIndex,
            workspaceID,
            tabID,
        };

        await fetch(`${API}/kanban/lists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newList),
        });

        setLists(prev => [...prev, newList]);
        return id;
    }

    async function updateList(listId, changes) {
        setLists(prev => prev.map(l => l.id === listId ? { ...l, ...changes } : l));

        await fetch(`${API}/kanban/lists/${listId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(changes),
        });
    }

    async function deleteList(listId) {
        const remainingLists = lists.filter(l => l.id !== listId);
        const remainingColumns = [...new Set(remainingLists.map(l => l.columnIndex))].sort((a, b) => a - b);
        const columnRemap = {};
        remainingColumns.forEach((col, i) => { columnRemap[col] = i; });

        const reorderedLists = remainingLists.map(l => ({
            ...l,
            columnIndex: columnRemap[l.columnIndex],
        }));

        setRemovingIds(prev => new Set([...prev, listId]));

        await fetch(`${API}/kanban/lists/${listId}`, { method: 'DELETE' });

        setTimeout(() => {
            const newColumnIds = {};
            remainingColumns.forEach((oldCol, newIdx) => {
                newColumnIds[newIdx] = columnIds.current[oldCol];
            });
            columnIds.current = newColumnIds;

            setLists(reorderedLists);
            setTasks(prev => prev.filter(t => t.listID !== listId));
            setRemovingIds(prev => {
                const next = new Set(prev);
                next.delete(listId);
                return next;
            });

            const updates = reorderedLists.map(l => ({ id: l.id, columnIndex: l.columnIndex }));
            if (updates.length > 0) {
                fetch(`${API}/kanban/lists/reorder`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates }),
                });
            }
        }, 250);
    }

    async function addTask(listId) {
        const list = lists.find(l => l.id === listId);
        const listTasks = tasks.filter(t => t.listID === listId);
        const id = crypto.randomUUID();
        const newTask = {
            id,
            title: 'New Task',
            description: '',
            isCompleted: false,
            originalCategory: list?.category || '',
            color: list?.color || '',
            listID: listId,
            taskOrder: listTasks.length,
        };

        await fetch(`${API}/kanban/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask),
        });

        setTasks(prev => [...prev, newTask]);
        return id;
    }

    async function updateTask(taskId, changes) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...changes } : t));

        const task = tasks.find(t => t.id === taskId);
        const updated = { ...task, ...changes };

        await fetch(`${API}/kanban/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        });
    }

    async function deleteTask(taskId) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        await fetch(`${API}/kanban/tasks/${taskId}`, { method: 'DELETE' });
    }

    async function reorderTasks(updates, targetListId, taskId) {
        setTasks(prev => {
            return prev.map(t => {
                const update = updates.find(u => u.id === t.id);
                return update ? { ...t, listID: update.listID, taskOrder: update.taskOrder } : t;
            });
        });

        await fetch(`${API}/kanban/tasks/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates }),
        });
    }

    return { lists, tasks, loading, removingIds, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks, getColumnId };
}