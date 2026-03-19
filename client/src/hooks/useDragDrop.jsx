import { useState, useRef, useEffect, useCallback } from 'react';


// Hook
export function useDragDrop({ tasks, onReorder, onGhostDrop }) {
    const [dragging, setDragging] = useState(null);
    const [clone, setClone] = useState(null);
    const [insertionPoint, setInsertionPoint] = useState(null);
    const [tilt, setTilt] = useState(0);

    const listRefs = useRef({});
    const taskRefs = useRef({});
    const ghostRefs = useRef({});
    const dragOffset = useRef({ x: 0, y: 0 });
    const draggingRef = useRef(null);
    const tasksRef = useRef(tasks);
    const lastPos = useRef({ x: 0, y: 0 });

    useEffect(() => { tasksRef.current = tasks; }, [tasks]);

    function registerList(listId, el) {
        if (el) listRefs.current[listId] = el;
        else delete listRefs.current[listId];
    }

    function registerTask(taskId, el) {
        if (el) taskRefs.current[taskId] = el;
        else delete taskRefs.current[taskId];
    }

    function registerGhost(key, el) {
        if (el) ghostRefs.current[key] = el;
        else delete ghostRefs.current[key];
    }

    function startDrag(e, task, element) {
        if (e.button !== 0) return;
        e.preventDefault();

        const rect = element.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        lastPos.current = { x: e.clientX, y: e.clientY };

        const cloneData = {
            id: task.id,
            width: rect.width,
            height: rect.height,
            x: e.clientX - dragOffset.current.x,
            y: e.clientY - dragOffset.current.y,
        };

        draggingRef.current = task;
        setDragging(task.id);
        setClone(cloneData);
        setTilt(0);
    }

    const onMouseMove = useCallback((e) => {
        if (!draggingRef.current) return;

        const dx = e.clientX - lastPos.current.x;
        lastPos.current = { x: e.clientX, y: e.clientY };

        const newTilt = Math.max(-15, Math.min(15, dx * 0.8));
        setTilt(newTilt);

        setClone(prev => prev ? ({
            ...prev,
            x: e.clientX - dragOffset.current.x,
            y: e.clientY - dragOffset.current.y,
        }) : null);

        const point = getInsertionPoint(e.clientX, e.clientY, draggingRef.current.id);
        setInsertionPoint(point);
    }, []);

    const onMouseUp = useCallback((e) => {
        if (!draggingRef.current) return;

        const point = getInsertionPoint(e.clientX, e.clientY, draggingRef.current.id);

        if (point) {
            commitReorder(draggingRef.current, point);
        } else {
            for (const [key, el] of Object.entries(ghostRefs.current)) {
                const rect = el.getBoundingClientRect();
                if (
                    e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom
                ) {
                    onGhostDrop?.(key, draggingRef.current);
                    break;
                }
            }
        }

        draggingRef.current = null;
        setDragging(null);
        setClone(null);
        setInsertionPoint(null);
        setTilt(0);
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    function getInsertionPoint(cx, cy, draggedId) {
        let targetListId = null;

        for (const [listId, el] of Object.entries(listRefs.current)) {
            const rect = el.getBoundingClientRect();
            if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                targetListId = listId;
                break;
            }
        }

        if (!targetListId) return null;

        const listTasks = tasksRef.current
            .filter(t => t.listID === targetListId && t.id !== draggedId)
            .sort((a, b) => a.taskOrder - b.taskOrder);

        let insertIndex = listTasks.length;

        for (let i = 0; i < listTasks.length; i++) {
            const el = taskRefs.current[listTasks[i].id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (cy < midY) {
                insertIndex = i;
                break;
            }
        }

        return { listId: targetListId, insertIndex, listTasks };
    }

    function commitReorder(task, point) {
        const { listId, insertIndex, listTasks } = point;

        const newOrder = [...listTasks];
        newOrder.splice(insertIndex, 0, task);

        const updates = newOrder.map((t, i) => ({
            id: t.id,
            listID: listId,
            taskOrder: i,
        }));

        const otherTasks = tasksRef.current.filter(
            t => t.listID !== listId && t.id !== task.id
        );

        const allUpdates = [
            ...otherTasks.map(t => ({ id: t.id, listID: t.listID, taskOrder: t.taskOrder })),
            ...updates,
        ];

        onReorder(allUpdates, listId, task.id);
    }

    return { dragging, clone, tilt, insertionPoint, registerList, registerTask, registerGhost, startDrag };
}