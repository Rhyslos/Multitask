import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useColumns } from "../hooks/useColumns";
import { useLists } from "../hooks/useLists";
import { useTasks } from "../hooks/useTasks";
import { useTabs } from "../hooks/useTabs";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { useAuth } from "../hooks/useAuth";
import { useDragDrop } from "../hooks/useDragDrop";
import { useFlipAnimation } from "../hooks/useFlipAnimation";
import KanbanSubbar from "../components/subbar/KanbanSubbar";
import KanbanColumn from "../components/kanban/KanbanColumn";
import KanbanTask from "../components/kanban/KanbanTask";
import TaskModal from "../components/kanban/TaskModal";
import { useSync } from "../hooks/useSync";

// Page
export default function Kanban() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { categories } = useWorkspaces(user?.id);
    const { sm } = useSync();

    const { tabs, activeTabId, setActiveTabId, addTab, updateTab, archiveTab } =
        useTabs(workspaceID);

    // --- Data layer ---
    const { columns, addColumn, deleteColumn } =
        useColumns(workspaceID, activeTabId);

    const columnIDs = useMemo(
        () => columns.map(c => c.id), 
        [columns.map(c => c.id).join(',')]
    );
    const { lists, addList, updateList, deleteList, reorderLists } = useLists(columnIDs);

    const listIDs = useMemo(
        () => lists.map(l => l.id), 
        [lists.map(l => l.id).join(',')]
    );

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

    // --- Drag and drop ---
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
        onReorderTasks: reorderTasks,
        onReorderLists: reorderLists,
        onGhostDrop: async (key, item) => {
            // If dragging a list container directly onto a ghost column marker, avoid standard task mappings
            const isListDrop = item?.columnID !== undefined;
            const isNewColumn = key === "new-column";

            let columnID;

            if (isNewColumn) {
                columnID = await addColumn(columns.length);
                if (!columnID) return;
            } else {
                const targetIndex = parseInt(key.replace("ghost-col-", ""));
                const existingColumn = columns.find(c => c.columnIndex === targetIndex);
                columnID = existingColumn?.id;
                if (!columnID) return;
            }

            if (isListDrop) {
                // Route dragged list directly to the generated target column
                reorderLists([{ id: item.id, columnID, listOrder: 0 }]);
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

    async function handleDeleteList(listID) {
        const list = lists.find(l => l.id === listID);
        if (!list) return;

        await deleteList(listID);

        const remainingInColumn = lists.filter(
            l => l.columnID === list.columnID && l.id !== listID
        );
        if (remainingInColumn.length === 0) {
            await deleteColumn(list.columnID);
        }
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