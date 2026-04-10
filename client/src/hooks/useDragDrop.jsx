import { useState, useRef, useEffect, useCallback } from 'react';

export function useDragDrop({ tasks, onReorder, onGhostDrop }) {
    const [dragging, setDragging] = useState(null);
    const [cloneMeta, setCloneMeta] = useState(null);
    const [insertionPoint, setInsertionPoint] = useState(null);

    const listRefs = useRef({});
    const taskRefs = useRef({});
    const ghostRefs = useRef({});
    const dragOffset = useRef({ x: 0, y: 0 });
    const draggingRef = useRef(null);
    const tasksRef = useRef(tasks);
    const lastPos = useRef({ x: 0, y: 0 });
    const cloneOuterRef = useRef(null);
    const cloneInnerRef = useRef(null);
    const tiltRef = useRef(0);
    const targetTiltRef = useRef(0);
    const rafRef = useRef(null);

    // FIX 2: Prevent Stale Closures by wrapping callbacks in refs
    const onGhostDropRef = useRef(onGhostDrop);
    const onReorderRef = useRef(onReorder);
    
    useEffect(() => { onGhostDropRef.current = onGhostDrop; }, [onGhostDrop]);
    useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);
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

    function registerCloneOuter(el) { cloneOuterRef.current = el; }
    function registerCloneInner(el) { cloneInnerRef.current = el; }

    const onMouseMove = useCallback((e) => {
        if (!draggingRef.current) return;

        const dx = e.clientX - lastPos.current.x;
        lastPos.current = { x: e.clientX, y: e.clientY };

        targetTiltRef.current = Math.max(-15, Math.min(15, dx * 0.8));

        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            tiltRef.current = tiltRef.current + (targetTiltRef.current - tiltRef.current) * 0.15;

            if (cloneOuterRef.current) {
                cloneOuterRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            if (cloneInnerRef.current) {
                cloneInnerRef.current.style.transform = `scale(1.08) rotate(${tiltRef.current}deg)`;
            }
        });

        const point = getInsertionPoint(e.clientX, e.clientY, draggingRef.current.id);
        
        // FIX 1: Stop the State Spam! Only trigger a React re-render if the insertion index actually changed.
        setInsertionPoint(prev => {
            if (!prev && !point) return prev;
            if (prev && point && prev.listId === point.listId && prev.insertIndex === point.insertIndex) return prev;
            return point;
        });
    }, []);

    const onMouseUp = useCallback((e) => {
        if (!draggingRef.current) return;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

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
                    onGhostDropRef.current?.(key, draggingRef.current);
                    break;
                }
            }
        }

        draggingRef.current = null;
        setDragging(null);
        setCloneMeta(null);
        setInsertionPoint(null);
        tiltRef.current = 0;
        targetTiltRef.current = 0;

        // FIX 3: Clean up event listeners immediately when the drag finishes
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    function startDrag(e, task, element) {
        if (e.button !== 0) return;
        e.preventDefault();

        const rect = element.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        lastPos.current = { x: e.clientX, y: e.clientY };
        tiltRef.current = 0;
        targetTiltRef.current = 0;

        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        setCloneMeta({ width: rect.width, height: rect.height });
        draggingRef.current = task;
        setDragging(task.id);

        requestAnimationFrame(() => {
            if (cloneOuterRef.current) {
                cloneOuterRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            if (cloneInnerRef.current) {
                cloneInnerRef.current.style.transform = `scale(1.08) rotate(0deg)`;
            }
        });

        // FIX 3: Only listen to the window when actively dragging
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

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

        const updates = newOrder
            .map((t, i) => ({ id: t.id, listID: listId, taskOrder: i }))
            .filter(u => {
                const original = tasksRef.current.find(t => t.id === u.id);
                return !original || original.listID !== u.listID || original.taskOrder !== u.taskOrder;
            });

        // Pulls the freshest function from the ref instead of the stale closure
        onReorderRef.current?.(updates);
    }

    return {
        dragging,
        cloneMeta,
        insertionPoint,
        registerList,
        registerTask,
        registerGhost,
        registerCloneOuter,
        registerCloneInner,
        startDrag,
    };
}