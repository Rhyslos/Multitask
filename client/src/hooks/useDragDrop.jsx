// initialization functions
import { useState, useRef, useEffect, useCallback } from 'react';

// user functions
//
// Drag-and-drop hook for tasks and lists.
//
// Accepts `columns` so colIndex/columnID lookups can be done against React
// state rather than the DOM — the old version parsed `--col` off an inline
// style, which silently returned 0 if the DOM shape ever changed.
//
// `onDeleteDrop` and the delete-zone ref-registrar wire in the drag-to-delete
// dropzone. The delete zone has PRIORITY over insertion points and ghost
// zones: at the bottom of the viewport the cursor is almost always also over
// a valid list/column, so we suppress the blue insertion indicator while the
// cursor is over the delete bar and short-circuit the reorder commit on mouseup.
export function useDragDrop({
    tasks,
    lists,
    columns,
    onReorderTasks,
    onReorderLists,
    onGhostDrop,
    onDeleteDrop,
}) {
    const [dragging, setDragging] = useState(null);
    const [dragType, setDragType] = useState(null);
    const [cloneMeta, setCloneMeta] = useState(null);
    const [insertionPoint, setInsertionPoint] = useState(null);
    const [isOverDeleteZone, setIsOverDeleteZone] = useState(false);

    const listRefs = useRef({});
    const taskRefs = useRef({});
    const ghostRefs = useRef({});
    const deleteZoneRef = useRef(null);
    const dragOffset = useRef({ x: 0, y: 0 });
    const draggingRef = useRef(null);
    const tasksRef = useRef(tasks);
    const listsRef = useRef(lists || []);
    const columnsRef = useRef(columns || []);
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
    const onDeleteDropRef = useRef(onDeleteDrop);

    // event functions
    useEffect(() => { onGhostDropRef.current = onGhostDrop; }, [onGhostDrop]);
    useEffect(() => { onReorderTasksRef.current = onReorderTasks; }, [onReorderTasks]);
    useEffect(() => { onReorderListsRef.current = onReorderLists; }, [onReorderLists]);
    useEffect(() => { onDeleteDropRef.current = onDeleteDrop; }, [onDeleteDrop]);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { if (lists) listsRef.current = lists; }, [lists]);
    useEffect(() => { if (columns) columnsRef.current = columns; }, [columns]);

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

    function registerDeleteZone(el) { deleteZoneRef.current = el; }
    function registerCloneOuter(el) { cloneOuterRef.current = el; }
    function registerCloneInner(el) { cloneInnerRef.current = el; }

    // Shared hit-test for the delete zone. Read from getBoundingClientRect
    // rather than relying on pointer events on the element itself — the
    // dropzone sets pointerEvents: 'none' so it can't eat clicks underneath
    // when no drag is active.
    function isPointOverDeleteZone(cx, cy) {
        const el = deleteZoneRef.current;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }

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

        // Delete zone wins over insertion points. If the cursor is over the
        // delete bar, clear the insertion indicator so the blue line doesn't
        // flicker underneath the red dropzone.
        const overDelete = isPointOverDeleteZone(e.clientX, e.clientY);
        setIsOverDeleteZone(prev => prev === overDelete ? prev : overDelete);

        if (overDelete) {
            setInsertionPoint(prev => prev ? null : prev);
            return;
        }

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

        // Delete zone short-circuits everything. The parent's onDeleteDrop
        // owns the mutation (and the fade animation via useAnimatedRemoval).
        // No reorder commit, no ghost fallback — releasing over the delete
        // bar means destroy, full stop.
        if (isPointOverDeleteZone(e.clientX, e.clientY)) {
            onDeleteDropRef.current?.(
                draggingRef.current.item,
                draggingRef.current.type
            );
        } else {
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
        }

        draggingRef.current = null;
        setDragging(null);
        setDragType(null);
        setCloneMeta(null);
        setInsertionPoint(null);
        setIsOverDeleteZone(false);
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

        // We only return targetListId and the cursor's insertion index here.
        // The actual sibling array is recomputed at commit time from tasksRef
        // — see commitTaskReorder for why (stale-snapshot defence).
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

        return { type: 'task', listId: targetListId, insertIndex };
    }

    function getListInsertionPoint(cx, cy, draggedId) {
        let targetColumnId = null;

        // 1. Identify which column zone is active by measuring against existing list containers.
        //    A ±30px slop on x is intentional — it gives the user some forgiveness when dropping
        //    near the gap between columns.
        for (const [listId, el] of Object.entries(listRefs.current)) {
            const rect = el.getBoundingClientRect();
            if (cx >= rect.left - 30 && cx <= rect.right + 30) {
                const matchedList = listsRef.current.find(l => l.id === listId);
                if (matchedList) {
                    targetColumnId = matchedList.columnID;
                    break;
                }
            }
        }

        // If no target column is found, return null to trigger a ghost drop.
        if (!targetColumnId) return null;

        // 2. Filter sibling lists mapped to the targeted column container
        const candidateLists = listsRef.current
            .filter(l => l.columnID === targetColumnId && l.id !== draggedId)
            .sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

        let insertIndex = candidateLists.length;

        // 3. Standard midpoint split evaluation
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

        // 4. Read colIndex from React state via columnsRef — never from DOM.
        //    The previous version parsed `--col` off an inline style, which would
        //    silently return 0 if the class/style ever moved, breaking the insertion
        //    indicator highlight in KanbanColumn.
        const targetColumn = columnsRef.current.find(c => c.id === targetColumnId);
        const colIndex = targetColumn?.columnIndex ?? 0;

        return { type: 'list', columnId: targetColumnId, colIndex, insertIndex };
    }

    function commitTaskReorder(task, point) {
        const { listId, insertIndex } = point;

        // Recompute siblings from the CURRENT tasksRef rather than using the snapshot
        // taken when the cursor last moved — that snapshot can be stale if a server
        // merge landed mid-drag, which would cause the commit to overwrite remote
        // changes with old positions.
        const listTasks = tasksRef.current
            .filter(t => t.listID === listId && t.id !== task.id)
            .sort((a, b) => a.taskOrder - b.taskOrder);

        const clampedIndex = Math.min(Math.max(insertIndex, 0), listTasks.length);
        const newOrder = [...listTasks];
        newOrder.splice(clampedIndex, 0, task);

        const updates = newOrder
            .map((t, i) => ({ id: t.id, listID: listId, taskOrder: i }))
            .filter(u => {
                const original = tasksRef.current.find(t => t.id === u.id);
                return !original || original.listID !== u.listID || original.taskOrder !== u.taskOrder;
            });

        if (updates.length > 0) onReorderTasksRef.current?.(updates);
    }

    function commitListReorder(list, point) {
        const { columnId, insertIndex } = point;

        // Same stale-snapshot defence as commitTaskReorder — recompute siblings
        // from listsRef so we don't fight server merges that landed mid-drag.
        const candidateLists = listsRef.current
            .filter(l => l.columnID === columnId && l.id !== list.id)
            .sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

        const clampedIndex = Math.min(Math.max(insertIndex, 0), candidateLists.length);
        const newOrder = [...candidateLists];
        newOrder.splice(clampedIndex, 0, list);

        const updates = newOrder
            .map((l, i) => ({ id: l.id, columnID: columnId, listOrder: i }))
            .filter(u => {
                const original = listsRef.current.find(l => l.id === u.id);
                return !original || original.columnID !== u.columnID || original.listOrder !== u.listOrder;
            });

        if (updates.length > 0) onReorderListsRef.current?.(updates);
    }

    return {
        dragging,
        dragType,
        cloneMeta,
        insertionPoint,
        isOverDeleteZone,
        registerList,
        registerTask,
        registerGhost,
        registerDeleteZone,
        registerCloneOuter,
        registerCloneInner,
        startDrag,
    };
}
