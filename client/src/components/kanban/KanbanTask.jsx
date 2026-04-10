import { useState, useRef, useEffect } from 'react';
import CategoryDropdown from './CategoryDropdown';

// user functions
export default function KanbanTask({
    task,
    categories,
    isDragging,
    isClone,
    onUpdate,
    onDelete,
    onStartDrag,
    onOpen,
    registerTask,
    registerElement,
}) {
    const [showCatDropdown, setShowCatDropdown] = useState(false);
    const titleRef = useRef(null);
    const taskRef = useRef(null);

    useEffect(() => {
        if (registerTask) {
            registerTask(task.id, taskRef.current);
            return () => registerTask(task.id, null);
        }
    }, [task.id, registerTask]);

    useEffect(() => {
        if (registerElement && !isClone) {
            registerElement(task.id, taskRef.current);
            return () => registerElement(task.id, null);
        }
    }, [task.id, registerElement, isClone]);

    const categoryData = categories.find(c => c.name === task.originalCategory);
    const bannerColor = categoryData?.color || '#555';

    // Calculate subtask completion: X/X
    const totalSubtasks = task.subtasks?.length || 0;
    const completedSubtasks = task.subtasks?.filter(st => st.done).length || 0;

    function handleClick(e) {
        if (
            e.target.closest('.kanban-task-title') ||
            e.target.closest('.kanban-task-checkbox') ||
            e.target.closest('.kanban-task-cat-btn') ||
            e.target.closest('.cat-dropdown') ||
            e.target.closest('.kanban-task-drag-handle')
        ) return;
        
        onOpen(task); 
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
            className={`kanban-task ${isDragging ? 'is-dragging' : ''} ${isClone ? 'is-clone' : ''}`}
            onClick={handleClick}
            /* Apply custom task color if set, otherwise defaults to CSS variable */
            style={{ backgroundColor: task.color || 'var(--panel)' }}
        >
            <div className="kanban-task-banner" style={{ background: bannerColor }} />

            <div className="kanban-task-body">
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <input
                        type="checkbox"
                        className="kanban-task-checkbox"
                        checked={task.isCompleted}
                        onChange={e => onUpdate({ isCompleted: e.target.checked })}
                    />
                    
                    <div 
                        className="kanban-task-drag-handle"
                        onMouseDown={e => onStartDrag(e, task, taskRef.current)}
                        style={{ cursor: 'grab', color: '#aaa', padding: '0 4px', fontSize: '14px', userSelect: 'none' }}
                        title="Drag to move"
                    >
                        ⋮⋮
                    </div>
                </div>

                <span
                    ref={titleRef}
                    className="kanban-task-title"
                    contentEditable={!isClone}
                    suppressContentEditableWarning
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    onMouseDown={e => {
                        e.stopPropagation();
                        setTimeout(() => titleRef.current?.focus(), 0); 
                    }}
                >
                    {task.title}
                </span>

                {/* NEW: Visual Indicators Row */}
                <div className="kanban-task-indicators" style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {/* Description Indicator */}
                    {task.description && (
                        <span title="Has description" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            ☰
                        </span>
                    )}

                    {/* Deadline Indicator */}
                    {task.deadline && (
                        <span title={`Deadline: ${task.deadline}`} style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            📅 {task.deadline}
                        </span>
                    )}

                    {/* Subtask Checkbox Indicator */}
                    {totalSubtasks > 0 && (
                        <span title="Subtasks" style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            ☑ {completedSubtasks}/{totalSubtasks}
                        </span>
                    )}

                    {/* Group Members (Placeholder for future feature) */}
                    {task.assignedUsers?.length > 0 && (
                        <span title="Assigned members" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            👤 {task.assignedUsers.length}
                        </span>
                    )}
                </div>

                <div className="kanban-task-cat-row" style={{ marginTop: '4px' }}>
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