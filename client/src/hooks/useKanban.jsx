import { useState, useEffect } from 'react';

const API = 'http://localhost:8080/api';


// Hook
export function useKanban(workspaceID) {
    const [lists, setLists] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!workspaceID) return;
        fetch(`${API}/kanban/board/${workspaceID}`)
            .then(r => r.json())
            .then(data => {
                setLists(data.lists || []);
                setTasks(data.tasks || []);
            })
            .finally(() => setLoading(false));
    }, [workspaceID]);

    async function addList(columnIndex, workspaceID) {
        const id = crypto.randomUUID();
        const newList = { id, name: 'New List', category: '', color: '', direction: 'vertical', columnIndex, workspaceID };

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
        setLists(prev => prev.filter(l => l.id !== listId));
        setTasks(prev => prev.filter(t => t.listID !== listId));
        await fetch(`${API}/kanban/lists/${listId}`, { method: 'DELETE' });
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
            const updated = [...prev];
            return updated.map(t => {
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

    return { lists, tasks, loading, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks };
}