import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useKanban } from '../hooks/useKanban';
import { useTabs } from '../hooks/useTabs';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../hooks/useAuth';
import { useDragDrop } from '../hooks/useDragDrop';
import { useFlipAnimation } from '../hooks/useFlipAnimation';
import Navbar from '../components/Navbar';
import Subbar from '../components/Subbar';
import KanbanColumn from '../components/kanban/KanbanColumn';
import KanbanTask from '../components/kanban/KanbanTask';
import TaskModal from '../components/kanban/TaskModal';


// Page
export default function Kanban() {
    const { workspaceID } = useParams();
    const { user } = useAuth();
    const { categories } = useWorkspaces(user?.id);

    const { tabs, activeTabId, setActiveTabId, addTab, updateTab, archiveTab } = useTabs(workspaceID);

    const { lists, tasks, loading, removingIds, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks, getColumnId } = useKanban(workspaceID, activeTabId);

    const [activeTask, setActiveTask] = useState(null);
    const [focusedListId, setFocusedListId] = useState(null);

    const topbarRef = useRef(null);
    const boardRef = useRef(null);
    const columnCountRef = useRef(0);

    const { registerElement: registerTaskElement } = useFlipAnimation(tasks);
    const { registerElement: registerListElement } = useFlipAnimation(lists);

    const {
        dragging,
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
        onReorder: reorderTasks,
        onGhostDrop: async (key, task) => {
            if (key === 'new-column') {
                const id = await addList(columnCountRef.current, workspaceID);
                reorderTasks(
                    [{ id: task.id, listID: id, taskOrder: 0 }],
                    id,
                    task.id
                );
            } else {
                const colIndex = parseInt(key.replace('ghost-col-', ''));
                const id = await addList(colIndex, workspaceID);
                reorderTasks(
                    [{ id: task.id, listID: id, taskOrder: 0 }],
                    id,
                    task.id
                );
            }
        },
    });

    const isDragging = !!dragging;
    const draggingTask = tasks.find(t => t.id === dragging);

    const columnCount = lists.length > 0
        ? Math.max(...lists.map(l => l.columnIndex)) + 1
        : 0;

    const plusButtonCount = columnCount + 1;

    useEffect(() => { columnCountRef.current = columnCount; }, [columnCount]);

    async function handleAddList(columnIndex) {
        const id = await addList(columnIndex, workspaceID);
        setFocusedListId(id);
    }

    function getListsInColumn(colIndex) {
        return lists.filter(l => l.columnIndex === colIndex);
    }

    function handleBoardScroll() {
        if (topbarRef.current && boardRef.current) {
            topbarRef.current.scrollLeft = boardRef.current.scrollLeft;
        }
    }

    const boardInnerWidth = (columnCount * (300 + 16)) + 24 + (isDragging ? 316 : 0);

    return (
        <div className="kanban-root">
            <Navbar />
            <Subbar
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
                        onClick={() => handleAddList(i)}
                    >
                        +
                    </button>
                ))}
            </div>

            <div className="kanban-board" ref={boardRef} onScroll={handleBoardScroll}>
                <div style={{
                    position: 'relative',
                    width: boardInnerWidth,
                    minHeight: '100%',
                }}>
                    {[...new Set(lists.map(l => l.columnIndex))].sort((a, b) => a - b).map((colIndex) => (
                        <KanbanColumn
                            key={getColumnId(colIndex)}
                            colIndex={colIndex}
                            lists={getListsInColumn(colIndex)}
                            tasks={tasks}
                            categories={categories}
                            focusedListId={focusedListId}
                            dragging={dragging}
                            insertionPoint={insertionPoint}
                            isDragging={isDragging}
                            onUpdateList={updateList}
                            onDeleteList={(listId) => deleteList(listId)}
                            onAddTask={addTask}
                            onUpdateTask={updateTask}
                            onDeleteTask={deleteTask}
                            onStartDrag={startDrag}
                            onOpenTask={setActiveTask}
                            onFocusClear={() => setFocusedListId(null)}
                            registerList={registerList}
                            registerTask={registerTask}
                            registerGhost={registerGhost}
                            registerTaskElement={registerTaskElement}
                            registerListElement={registerListElement}
                            removingIds={removingIds}
                        />
                    ))}

                    {isDragging && (
                        <div
                            className="kanban-ghost-column"
                            ref={el => registerGhost('new-column', el)}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: columnCount * (300 + 16),
                            }}
                        >
                            <span>+ New column</span>
                        </div>
                    )}
                </div>
            </div>

            {cloneMeta && draggingTask && (
                <div
                    ref={registerCloneOuter}
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        width: cloneMeta.width,
                        pointerEvents: 'none',
                        zIndex: 1000,
                        willChange: 'transform',
                    }}
                >
                    <div ref={registerCloneInner} className="kanban-drag-clone">
                        <KanbanTask
                            task={draggingTask}
                            categories={categories}
                            dragging={false}
                            isClone={true}
                            onUpdate={() => {}}
                            onDelete={() => {}}
                            onStartDrag={() => {}}
                            onOpen={() => {}}
                            registerTask={() => {}}
                            registerElement={() => {}}
                        />
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