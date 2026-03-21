import { useState, useRef, useEffect } from 'react';
import CategoryDropdown from './CategoryDropdown';


// Component
export default function KanbanTask({ task, categories, dragging, isClone, onUpdate, onDelete, onStartDrag, onOpen, registerTask, registerElement }) {
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    const titleRef = useRef(null);
    const taskRef = useRef(null);

    useEffect(() => {
        if (registerTask) {
            registerTask(task.id, taskRef.current);
            return () => registerTask(task.id, null);
        }
    }, [task.id]);

    useEffect(() => {
        if (registerElement && !isClone) {
            registerElement(task.id, taskRef.current);
            return () => registerElement(task.id, null);
        }
    }, [task.id]);

    const categoryData = categories.find(c => c.name === task.originalCategory);
    const bannerColor = categoryData?.color || '#555';

    function handleMouseDown(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-cat-btn') ||
            e.target.closest('.cat-dropdown')
        ) return;
        onStartDrag(e, task, taskRef.current);
    }

    function handleClick(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-cat-btn') ||
            e.target.closest('.cat-dropdown')
        ) return;
        onOpen();
    }

    function handleTitleBlur() {
        const text = titleRef.current?.textContent.trim() || 'New Task';
        onUpdate({ title: text });
    }

    function handleTitleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleRef.current?.blur();
        }
    }

    return (
        <div
            ref={taskRef}
            className={`kanban-task ${dragging ? 'is-dragging' : ''} ${isClone ? 'is-clone' : ''}`}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            <div className="kanban-task-banner" style={{ background: bannerColor }} />

            <div className="kanban-task-body">
                <input
                    type="checkbox"
                    className="kanban-task-checkbox"
                    checked={task.isCompleted}
                    onChange={e => onUpdate({ isCompleted: e.target.checked })}
                />

                <span
                    ref={titleRef}
                    className="kanban-task-title"
                    contentEditable={!isClone}
                    suppressContentEditableWarning
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    onMouseDown={e => {
                        e.stopPropagation();
                        titleRef.current?.focus();
                    }}
                >
                    {task.title}
                </span>

                <div className="kanban-task-cat-row">
                    <span className="kanban-task-cat-label">
                        {task.originalCategory || 'No category'}
                    </span>
                    {!isClone && (
                        <button
                            className="kanban-task-cat-btn"
                            onClick={e => { e.stopPropagation(); setShowCatDropdown(o => !o); }}
                        >
                            ▾
                        </button>
                    )}
                    {showCatDropdown && (
                        <CategoryDropdown
                            categories={categories}
                            selected={task.originalCategory}
                            onSelect={cat => {
                                onUpdate({ originalCategory: cat.name, color: cat.color });
                                setShowCatDropdown(false);
                            }}
                            onClose={() => setShowCatDropdown(false)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}