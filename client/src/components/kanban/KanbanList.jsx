import React, { useEffect, useRef } from 'react';
import KanbanTask from './KanbanTask';


// Component
export default function KanbanList({
    list, tasks, categories, isFocused, dragging, insertionPoint,
    onUpdate, onDelete, onAddTask, onUpdateTask, onDeleteTask,
    onStartDrag, onOpenTask, onFocusClear, registerList, registerTask,
    registerTaskElement, registerListElement
}) {
    const nameRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        registerList(list.id, listRef.current);
        return () => registerList(list.id, null);
    }, [list.id]);

    useEffect(() => {
        if (registerListElement) {
            registerListElement(list.id, listRef.current);
            return () => registerListElement(list.id, null);
        }
    }, [list.id]);

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

    const categoryData = categories.find(c => c.name === list.category);

    const showInsertionAt = insertionPoint?.listId === list.id
        ? insertionPoint.insertIndex
        : null;

    return (
        <div className="kanban-list" ref={listRef}>
            <div className="kanban-list-header">
                {categoryData && (
                    <span
                        className="kanban-list-category-dot"
                        style={{ background: categoryData.color }}
                    />
                )}
                <span
                    ref={nameRef}
                    className="kanban-list-name"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={handleNameBlur}
                    onKeyDown={handleNameKeyDown}
                >
                    {list.name}
                </span>
                <button className="kanban-list-delete" onClick={onDelete}>✕</button>
            </div>

            <div className="kanban-task-container">
                {tasks.map((task, index) => (
                    <React.Fragment key={task.id}>
                        {showInsertionAt === index && (
                            <div className="kanban-insertion-indicator" />
                        )}
                        <KanbanTask
                            task={task}
                            categories={categories}
                            dragging={dragging === task.id}
                            onUpdate={changes => onUpdateTask(task.id, changes)}
                            onDelete={() => onDeleteTask(task.id)}
                            onStartDrag={onStartDrag}
                            onOpen={() => onOpenTask(task)}
                            registerTask={registerTask}
                            registerElement={registerTaskElement}
                        />
                    </React.Fragment>
                ))}
                {showInsertionAt === tasks.length && (
                    <div className="kanban-insertion-indicator" />
                )}
            </div>

            <button className="kanban-add-task-btn" onClick={onAddTask}>
                + Add task
            </button>
        </div>
    );
}