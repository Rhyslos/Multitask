import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useKanban } from '../hooks/useKanban';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAuth } from '../hooks/useAuth';
import { useDragDrop } from '../hooks/useDragDrop';
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
    const { lists, tasks, loading, addList, updateList, deleteList, addTask, updateTask, deleteTask, reorderTasks } = useKanban(workspaceID);

    const [activeTask, setActiveTask] = useState(null);
    const [focusedListId, setFocusedListId] = useState(null);

    const topbarRef = useRef(null);
    const boardRef = useRef(null);
    const columnCountRef = useRef(0);

    const { dragging, clone, tilt, insertionPoint, registerList, registerTask, registerGhost, startDrag } = useDragDrop({
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

    const draggingTask = tasks.find(t => t.id === dragging);

    return (
        <div className="kanban-root">
            <Navbar />
            <Subbar />

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
                {Array.from({ length: columnCount }).map((_, colIndex) => (
                    <KanbanColumn
                        key={colIndex}
                        colIndex={colIndex}
                        lists={getListsInColumn(colIndex)}
                        tasks={tasks}
                        categories={categories}
                        focusedListId={focusedListId}
                        dragging={dragging}
                        insertionPoint={insertionPoint}
                        isDragging={isDragging}
                        onUpdateList={updateList}
                        onDeleteList={deleteList}
                        onAddTask={addTask}
                        onUpdateTask={updateTask}
                        onDeleteTask={deleteTask}
                        onStartDrag={startDrag}
                        onOpenTask={setActiveTask}
                        onFocusClear={() => setFocusedListId(null)}
                        registerList={registerList}
                        registerTask={registerTask}
                        registerGhost={registerGhost}
                    />
                ))}

                {isDragging && (
                    <div
                        className="kanban-ghost-column"
                        ref={el => registerGhost('new-column', el)}
                    >
                        <span>+ New column</span>
                    </div>
                )}
            </div>

            {clone && draggingTask && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        width: clone.width,
                        transform: `translate(${clone.x}px, ${clone.y}px)`,
                        pointerEvents: 'none',
                        zIndex: 1000,
                    }}
                >
                    <div
                        className="kanban-drag-clone"
                        style={{
                            transform: `scale(1.08) rotate(${tilt}deg)`,
                        }}
                    >
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