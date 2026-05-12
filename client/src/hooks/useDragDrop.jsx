// initialization functions
import { useState, useRef, useEffect, useCallback } from 'react';

// user functions
export function useDragDrop({ tasks, lists, onReorderTasks, onReorderLists, onGhostDrop }) {
    const [dragging, setDragging] = useState(null);
    const [dragType, setDragType] = useState(null); 
    const [cloneMeta, setCloneMeta] = useState(null);
    const [insertionPoint, setInsertionPoint] = useState(null);

    const listRefs = useRef({});
    const taskRefs = useRef({});
    const ghostRefs = useRef({});
    const dragOffset = useRef({ x: 0, y: 0 });
    const draggingRef = useRef(null);
    const tasksRef = useRef(tasks);
    const listsRef = useRef(lists || []);
    const lastPos = useRef({ x: 0, y: 0 });
    const cloneOuterRef = useRef(null);
    const cloneInnerRef = useRef(null);
    const tiltRef = useRef(0);
    const targetTiltRef = useRef(0);
    const rafRef = useRef(null);

    // Dynamic ref caching avoids stale closures during rapid callback triggers
    const onGhostDropRef = useRef(onGhostDrop);
    const onReorderTasksRef = useRef(onReorderTasks);
    const onReorderListsRef = useRef(onReorderLists);
    
    // event functions
    useEffect(() => { onGhostDropRef.current = onGhostDrop; }, [onGhostDrop]);
    useEffect(() => { onReorderTasksRef.current = onReorderTasks; }, [onReorderTasks]);
    useEffect(() => { onReorderListsRef.current = onReorderLists; }, [onReorderLists]);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { if (lists) listsRef.current = lists; }, [lists]);

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

        // Evaluate drop location dynamically based on payload type
        const point = draggingRef.current.type === 'list' 
            ? getListInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id)
            : getTaskInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id);
        
        setInsertionPoint(prev => {
            if (!prev && !point) return prev;
            if (prev && point && prev.type === point.type) {
                if (prev.type === 'task' && prev.listId === point.listId && prev.insertIndex === point.insertIndex) return prev;
                if (prev.type === 'list' && prev.colIndex === point.colIndex && prev.insertIndex === point.insertIndex) return prev;
            }
            return point;
        });
    }, []);

    const onMouseUp = useCallback((e) => {
        if (!draggingRef.current) return;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        const isListDrag = draggingRef.current.type === 'list';
        const point = isListDrag
            ? getListInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id)
            : getTaskInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id);

        if (point) {
            // Explicitly commit calculated array indices back to the parent sync manager
            if (isListDrag) commitListReorder(draggingRef.current.item, point);
            else commitTaskReorder(draggingRef.current.item, point);
        } else {
            // Fallback evaluates direct drops onto ghost zones (spawning empty columns/lists)
            for (const [key, el] of Object.entries(ghostRefs.current)) {
                const rect = el.getBoundingClientRect();
                if (
                    e.clientX >= rect.left && e.clientX <= rect.right &&
                    e.clientY >= rect.top && e.clientY <= rect.bottom
                ) {
                    onGhostDropRef.current?.(key, draggingRef.current.item);
                    break;
                }
            }
        }

        draggingRef.current = null;
        setDragging(null);
        setDragType(null);
        setCloneMeta(null);
        setInsertionPoint(null);
        tiltRef.current = 0;
        targetTiltRef.current = 0;

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    function startDrag(e, item, element, type = 'task') {
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

        setCloneMeta({ width: rect.width, height: rect.height, type });
        draggingRef.current = { item, type };
        setDragging(item.id);
        setDragType(type);

        requestAnimationFrame(() => {
            if (cloneOuterRef.current) {
                cloneOuterRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            if (cloneInnerRef.current) {
                cloneInnerRef.current.style.transform = `scale(1.08) rotate(0deg)`;
            }
        });

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    // data processing functions
    function getTaskInsertionPoint(cx, cy, draggedId) {
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

        return { type: 'task', listId: targetListId, insertIndex, listTasks };
    }

    function getListInsertionPoint(cx, cy, draggedId) {
        let targetColumnId = null;
        let candidateLists = [];

        // 1. Identify which column zone is active by measuring against existing list containers
        for (const [listId, el] of Object.entries(listRefs.current)) {
            const rect = el.getBoundingClientRect();
            // Generous horizontal padding evaluates drops easily into neighboring column layouts
            if (cx >= rect.left - 30 && cx <= rect.right + 30) {
                const matchedList = listsRef.current.find(l => l.id === listId);
                if (matchedList) {
                    targetColumnId = matchedList.columnID;
                    break;
                }
            }
        }

        // 2. If dropped outside cached vertical zones, find the closest active column contextually
        if (!targetColumnId && listsRef.current.length > 0) {
            targetColumnId = listsRef.current[0].columnID;
        }

        if (!targetColumnId) return null;

        // 3. Filter sibling lists mapped to the targeted column container
        candidateLists = listsRef.current
            .filter(l => l.columnID === targetColumnId && l.id !== draggedId)
            .sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

        let insertIndex = candidateLists.length;

        // 4. Reuse standard midpoint split evaluations to support dragging lists Up/Down smoothly
        for (let i = 0; i < candidateLists.length; i++) {
            const el = listRefs.current[candidateLists[i].id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (cy < midY) {
                insertIndex = i;
                break;
            }
        }

        // Resolve active column index matching for accurate view layer indicators
        const referenceList = listsRef.current.find(l => l.columnID === targetColumnId);
        const colIndex = referenceList ? referenceList.columnIndex ?? 0 : 0;

        return { type: 'list', columnId: targetColumnId, colIndex, insertIndex, candidateLists };
    }

    function commitTaskReorder(task, point) {
        const { listId, insertIndex, listTasks } = point;

        const newOrder = [...listTasks];
        newOrder.splice(insertIndex, 0, task);

        const updates = newOrder
            .map((t, i) => ({ id: t.id, listID: listId, taskOrder: i }))
            .filter(u => {
                const original = tasksRef.current.find(t => t.id === u.id);
                return !original || original.listID !== u.listID || original.taskOrder !== u.taskOrder;
            });

        onReorderTasksRef.current?.(updates);
    }

    function commitListReorder(list, point) {
        const { columnId, insertIndex, candidateLists } = point;

        const newOrder = [...candidateLists];
        newOrder.splice(insertIndex, 0, list);

        // Map column assignments and continuous ordering sequences back to the SQLite data pool
        const updates = newOrder
            .map((l, i) => ({ id: l.id, columnID: columnId, listOrder: i }))
            .filter(u => {
                const original = listsRef.current.find(l => l.id === u.id);
                return !original || original.columnID !== u.columnID || original.listOrder !== u.listOrder;
            });

        onReorderListsRef.current?.(updates);
    }

    return {
        dragging,
        dragType,
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