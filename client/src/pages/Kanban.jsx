import { useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useColumns } from "../hooks/useColumns";
import { useLists } from "../hooks/useLists";
import { useTasks } from "../hooks/useTasks";
import { useTabs } from "../hooks/useTabs";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { useAuth } from "../hooks/useAuth";
import { useDragDrop } from "../hooks/useDragDrop";
import { useFlipAnimation } from "../hooks/useFlipAnimation";
import { useSync } from "../hooks/useSync";
import { SyncManager } from "../sync/syncManager";
import KanbanSubbar from "../components/subbar/KanbanSubbar";
import KanbanColumn from "../components/kanban/KanbanColumn";
import KanbanTask from "../components/kanban/KanbanTask";
import TaskModal from "../components/kanban/TaskModal";

// Page
export default function Kanban() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { categories } = useWorkspaces(user?.id);

    const { tabs, activeTabId, setActiveTabId, addTab, updateTab, archiveTab } =
        useTabs(workspaceID);

    // `sm` is used here only for atomic combined writes — see
    // reorderListsAndPruneAtomic below. Single-table mutations stay inside
    // their respective hooks (useLists, useColumns, etc.).
    const { sm } = useSync();

    // --- Data layer ---
    // Note: `deleteList`, `reorderLists`, and `deleteColumn` are deliberately
    // NOT destructured here. The atomic helpers below (reorderListsAndPruneAtomic,
    // deleteListAndPruneAtomic) issue those SQL writes themselves via sm.runBatch
    // so the list mutation and the column prune land in a single transaction.
    const { columns, addColumn } =
        useColumns(workspaceID, activeTabId);

    // Note: the previous `useMemo` with a `[columns.map(c => c.id).join(',')]`
    // dependency was running the map+join on every render anyway — the memo
    // only saved one extra `.map()`. Just compute inline; downstream hooks
    // re-query on their own subscriptions.
    const columnIDs = columns.map(c => c.id);
    const { lists, addList, updateList } = useLists(columnIDs);

    const listIDs = lists.map(l => l.id);
    const { tasks, addTask, updateTask, deleteTask, reorderTasks } =
        useTasks(listIDs);

    // --- UI state ---
    const [activeTask, setActiveTask] = useState(null);
    const [focusedListId, setFocusedListId] = useState(null);

    const topbarRef = useRef(null);
    const boardRef = useRef(null);

    // --- Animations ---
    const { registerElement: registerTaskElement } = useFlipAnimation(tasks);
    const { registerElement: registerListElement } = useFlipAnimation(lists);

    // ---------- Column auto-prune (action-scoped, atomic) ----------
    //
    // When a list moves away from a column OR a column's last list is deleted,
    // the source column may end up empty. If that source column is the
    // rightmost column on the board, auto-delete it — matching the
    // long-standing "the rightmost column should never sit empty after you
    // emptied it yourself" UX.
    //
    // Rules:
    //   - ACTION-SCOPED: only columns that were the source of the current
    //     action are candidates. Columns emptied by other peers (via sync) or
    //     left empty by earlier user actions are untouched. This avoids a
    //     race where Bob adds an empty column and Alice's next drag eats it.
    //   - RIGHTMOST-ONLY: a source column is only deleted if its columnIndex
    //     equals max(columns.columnIndex). No mid-board deletions.
    //   - NO INTRA-ACTION CASCADE: at most one column is deleted per action.
    //     Successive user actions still cascade naturally over time.
    //
    // The reorder writes and the column soft-delete are dispatched in a
    // single sm.runBatch — one worker transaction, one _notify, no flicker
    // window where the moved list is in its new column but the old empty
    // column is still rendered.

    // Given the predicted post-action lists and the set of source columns
    // touched by the action, return the column to delete (or null).
    function pickColumnToPrune(sourceColumnIDs, predictedLists) {
        if (columns.length === 0 || sourceColumnIDs.size === 0) return null;

        const maxIndex = columns.reduce((m, c) => Math.max(m, c.columnIndex), -1);
        const occupied = new Set(predictedLists.map(l => l.columnID));

        for (const col of columns) {
            if (!sourceColumnIDs.has(col.id)) continue;
            if (occupied.has(col.id)) continue;
            if (col.columnIndex !== maxIndex) continue;
            return col;
        }
        return null;
    }

    // Atomic: list reorder + optional column delete in one batch.
    // `updates` is the same shape as useLists.reorderLists takes.
    async function reorderListsAndPruneAtomic(updates) {
        if (!sm || !updates || updates.length === 0) return;

        // 1. Compute predicted post-action lists.
        const updateMap = new Map(updates.map(u => [u.id, u]));
        const predicted = lists.map(l => {
            const u = updateMap.get(l.id);
            return u ? { ...l, columnID: u.columnID, listOrder: u.listOrder } : l;
        });

        // 2. The source columns are those the moved lists came FROM —
        //    i.e. their pre-action columnID, not the new one.
        const sourceColumnIDs = new Set();
        for (const u of updates) {
            const before = lists.find(l => l.id === u.id);
            if (before && before.columnID !== u.columnID) {
                sourceColumnIDs.add(before.columnID);
            }
        }

        // 3. Pick a single column to prune under the action-scoped rules.
        const colToDelete = pickColumnToPrune(sourceColumnIDs, predicted);

        // 4. Build one batch.
        const ts = SyncManager.nowIso();
        const statements = updates.map(u => ({
            sql: 'UPDATE lists SET columnID = ?, listOrder = ?, updatedAt = ? WHERE id = ?',
            params: [u.columnID, u.listOrder, ts, u.id],
        }));
        if (colToDelete) {
            statements.push({
                sql: 'UPDATE kanban_columns SET isDeleted = 1, updatedAt = ? WHERE id = ?',
                params: [ts, colToDelete.id],
            });
        }

        await sm.runBatch(statements);
    }

    // Atomic variant for the delete-last-list case. The list-delete cascade
    // (list + its tasks) and the optional column prune go in one batch.
    async function deleteListAndPruneAtomic(listID) {
        if (!sm) return;
        const list = lists.find(l => l.id === listID);
        if (!list) return;

        const predicted = lists.filter(l => l.id !== listID);
        const sourceColumnIDs = new Set([list.columnID]);
        const colToDelete = pickColumnToPrune(sourceColumnIDs, predicted);

        const ts = SyncManager.nowIso();
        const statements = [
            {
                sql: 'UPDATE lists SET isDeleted = 1, updatedAt = ? WHERE id = ?',
                params: [ts, listID],
            },
            {
                sql: 'UPDATE tasks SET isDeleted = 1, updatedAt = ? WHERE listID = ?',
                params: [ts, listID],
            },
        ];
        if (colToDelete) {
            statements.push({
                sql: 'UPDATE kanban_columns SET isDeleted = 1, updatedAt = ? WHERE id = ?',
                params: [ts, colToDelete.id],
            });
        }

        await sm.runBatch(statements);
    }

    // --- Drag and drop ---
    // `columns` is passed in so useDragDrop can resolve columnIndex from state
    // rather than parsing inline CSS variables off the DOM.
    const {
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
    } = useDragDrop({
        tasks,
        lists,
        columns,
        onReorderTasks: reorderTasks,
        // List reorders go through the atomic prune wrapper so the source
        // column (if it was the rightmost and is now empty) is auto-cleaned
        // in the same batch — no flicker.
        onReorderLists: reorderListsAndPruneAtomic,
        onGhostDrop: async (key, item) => {
            // If dragging a list container directly onto a ghost column marker,
            // avoid standard task mappings.
            const isListDrop = item?.columnID !== undefined;
            const isNewColumn = key === "new-column";

            let columnID;

            if (isNewColumn) {
                columnID = await addColumn(columns.length);
                if (!columnID) return;
            } else {
                // Ghost keys are namespaced by drag type to avoid collisions
                // between the task and list empty-column dropzones in
                // KanbanColumn — see the registerGhost calls there.
                const indexFromKey = key.startsWith("ghost-task-col-")
                    ? parseInt(key.replace("ghost-task-col-", ""))
                    : key.startsWith("ghost-list-col-")
                    ? parseInt(key.replace("ghost-list-col-", ""))
                    : parseInt(key.replace("ghost-col-", "")); // legacy fallback

                const existingColumn = columns.find(c => c.columnIndex === indexFromKey);
                columnID = existingColumn?.id;
                if (!columnID) return;
            }

            if (isListDrop) {
                // Route dragged list directly to the generated target column,
                // then prune the source column if it was rightmost and emptied.
                reorderListsAndPruneAtomic([{ id: item.id, columnID, listOrder: 0 }]);
                return;
            }

            // Standard fallback logic handles dropped tasks spawning intermediate lists
            const listID = await addList(columnID, workspaceID, activeTabId);
            if (!listID) return;

            reorderTasks([{ id: item.id, listID, taskOrder: 0 }]);
        },
    });

    const isDragging = !!dragging;
    const draggingTask = dragType === 'task' ? tasks.find(t => t.id === dragging) : null;
    const draggingList = dragType === 'list' ? lists.find(l => l.id === dragging) : null;

    // --- Layout ---
    const columnCount = columns.length;
    const plusButtonCount = columnCount + 1;
    const boardInnerWidth = columnCount * (300 + 16) + 24 + (isDragging ? 316 : 0);

    function handleBoardScroll() {
        if (topbarRef.current && boardRef.current) {
            topbarRef.current.scrollLeft = boardRef.current.scrollLeft;
        }
    }

    async function handleAddColumn(columnIndex) {
        const existingColumn = columns.find(c => c.columnIndex === columnIndex);

        const columnID = existingColumn
            ? existingColumn.id
            : await addColumn(columnIndex);

        if (!columnID) return;

        const listID = await addList(columnID, workspaceID, activeTabId);
        if (listID) setFocusedListId(listID);
    }

    // When a list is deleted, atomically prune the parent column if it was
    // the rightmost and is now empty. The list delete, its task-cascade, and
    // the optional column delete all land in one batch — no flicker.
    async function handleDeleteList(listID) {
        await deleteListAndPruneAtomic(listID);
    }

    const tasksByListID = useMemo(() => {
        const map = {};
        for (const task of tasks) {
            if (!map[task.listID]) map[task.listID] = [];
            map[task.listID].push(task);
        }
        return map;
    }, [tasks]);

    const listsByColumnID = useMemo(() => {
        const map = {};
        for (const list of lists) {
            if (!map[list.columnID]) map[list.columnID] = [];
            map[list.columnID].push(list);
        }
        return map;
    }, [lists]);

    return (
        <div className="kanban-root">
            <KanbanSubbar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabSelect={setActiveTabId}
                onTabAdd={addTab}
                onTabUpdate={updateTab}
                onTabArchive={archiveTab}
            />

            <div className="kanban-topbar" ref={topbarRef}>
                {Array.from({ length: plusButtonCount }).map((_, i) => (
                    <button
                        key={i}
                        className="kanban-add-col-btn"
                        onClick={() => handleAddColumn(i)}
                    >
                        +
                    </button>
                ))}
            </div>

            <div className="kanban-board" ref={boardRef} onScroll={handleBoardScroll}>
                <div style={{ position: "relative", width: boardInnerWidth, minHeight: "100%" }}>

                    {columns.map(column => (
                        <KanbanColumn
                            key={column.id}
                            column={column}
                            lists={listsByColumnID[column.id] ?? []}
                            tasksByListID={tasksByListID}
                            categories={categories}
                            focusedListId={focusedListId}
                            dragging={dragging}
                            dragType={dragType}
                            insertionPoint={insertionPoint}
                            isDraggingTaskToEmptyCol={isDragging && dragType === 'task'}
                            onAddTask={(listID) => {
                                const list = lists.find(l => l.id === listID);
                                addTask(listID, list?.category, list?.color);
                            }}
                            onUpdateList={updateList}
                            onDeleteList={handleDeleteList}
                            onUpdateTask={updateTask}
                            onDeleteTask={deleteTask}
                            onStartTaskDrag={(e, task, el) => startDrag(e, task, el, 'task')}
                            onStartListDrag={(e, list, el) => {
                                // Cache active container boundary refs cleanly into the pointer tracking matrix
                                registerListElement(list.id, el);
                                startDrag(e, list, el, 'list');
                            }}
                            onOpenTask={setActiveTask}
                            onFocusClear={() => setFocusedListId(null)}
                            registerList={registerList}
                            registerTask={registerTask}
                            registerGhost={registerGhost}
                            registerTaskElement={registerTaskElement}
                            registerListElement={registerListElement}
                        />
                    ))}

                    {isDragging && (
                        <div
                            className="kanban-ghost-column"
                            ref={el => registerGhost("new-column", el)}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: columnCount * (300 + 16),
                            }}
                        >
                            <span>+ New column</span>
                        </div>
                    )}
                </div>
            </div>

            {cloneMeta && (draggingTask || draggingList) && (
                <div
                    ref={registerCloneOuter}
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: cloneMeta.width,
                        pointerEvents: "none",
                        zIndex: 1000,
                        willChange: "transform",
                    }}
                >
                    <div ref={registerCloneInner} className="kanban-drag-clone">
                        {dragType === 'task' && draggingTask && (
                            <KanbanTask
                                task={draggingTask}
                                categories={categories}
                                isClone={true}
                                onUpdate={() => {}}
                                onDelete={() => {}}
                                onStartDrag={() => {}}
                                onOpen={() => {}}
                            />
                        )}
                        {dragType === 'list' && draggingList && (
                            <div className="kanban-list is-clone" style={{ width: cloneMeta.width }}>
                                <div className="kanban-list-header">
                                    <span className="kanban-list-name" style={{ flex: 1 }}>
                                        {draggingList.name}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTask && (
                <TaskModal
                    task={activeTask}
                    categories={categories}
                    onSave={changes => {
                        updateTask(activeTask.id, changes);
                        setActiveTask(null);
                    }}
                    onClose={() => setActiveTask(null)}
                />
            )}
        </div>
    );
}