// initialization functions
import { useEffect, useRef } from 'react';
import KanbanTask from './KanbanTask';

// class functions
export default function KanbanList({
    list,
    tasks,
    categories,
    isFocused,
    dragging,
    insertionPoint,
    isDraggingList, 
    onUpdate,
    onDelete,
    onAddTask,
    onUpdateTask,
    onDeleteTask,
    onStartTaskDrag, 
    onStartListDrag, 
    onOpenTask,
    onFocusClear,
    registerList,
    registerTask,
    registerTaskElement,
    registerListElement,
}) {
    const nameRef = useRef(null);
    const listRef = useRef(null);

    // event functions
    useEffect(() => {
        registerList(list.id, listRef.current);
        return () => registerList(list.id, null);
    }, [list.id, registerList]);

    useEffect(() => {
        if (registerListElement) {
            registerListElement(list.id, listRef.current);
            return () => registerListElement(list.id, null);
        }
    }, [list.id, registerListElement]);

    useEffect(() => {
        if (isFocused && nameRef.current) {
            nameRef.current.focus();
            const range = document.createRange();
            range.selectNodeContents(nameRef.current);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        }
    }, [isFocused]);

    function handleNameBlur() {
        const text = nameRef.current?.textContent.trim() || 'New List';
        onUpdate({ name: text });
        onFocusClear();
    }

    function handleNameKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            nameRef.current?.blur();
        }
    }

    // data processing functions
    const categoryData = categories.find(c => c.name === list.category);
    const sortedTasks = [...tasks].sort((a, b) => a.taskOrder - b.taskOrder);
    
    const taskInsertionIndex = insertionPoint?.type === 'task' && insertionPoint.listId === list.id 
        ? insertionPoint.insertIndex 
        : null;

    return (
        <div 
            className={`kanban-list ${isDraggingList ? 'is-dragging-list' : ''}`} 
            ref={listRef}
        >
            <div className="kanban-list-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div 
                    className="kanban-list-drag-handle"
                    onMouseDown={e => onStartListDrag(e, list, listRef.current)}
                    style={{ cursor: 'grab', color: '#aaa', padding: '0 2px', fontSize: '14px', userSelect: 'none' }}
                    title="Drag to move list"
                >
                    ⋮⋮
                </div>

                {categoryData && (
                    <span
                        className="kanban-list-category-dot"
                        style={{ background: categoryData.color, flexShrink: 0 }}
                    />
                )}
                
                <span
                    ref={nameRef}
                    className="kanban-list-name"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleNameBlur}
                    onKeyDown={handleNameKeyDown}
                    style={{ flex: 1, minWidth: 0, outline: 'none' }}
                >
                    {list.name}
                </span>

                <button className="kanban-list-delete" onClick={onDelete} style={{ flexShrink: 0 }}>✕</button>
            </div>

            <div className="kanban-task-container">
                {sortedTasks.map((task, index) => (
                    <div key={task.id}>
                        {taskInsertionIndex === index && (
                            <div className="kanban-insertion-indicator" />
                        )}
                        <KanbanTask
                            task={task}
                            categories={categories}
                            isDragging={dragging === task.id}
                            onUpdate={changes => onUpdateTask(task.id, changes)}
                            onDelete={() => onDeleteTask(task.id)}
                            onStartDrag={onStartTaskDrag}
                            onOpen={() => onOpenTask(task)}
                            registerTask={registerTask}
                            registerElement={registerTaskElement}
                        />
                    </div>
                ))}
                {taskInsertionIndex === sortedTasks.length && (
                    <div className="kanban-insertion-indicator" />
                )}
            </div>

            <button className="kanban-add-task-btn" onClick={onAddTask}>
                + Add task
            </button>
        </div>
    );
}