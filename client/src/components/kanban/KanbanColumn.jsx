// initialization functions
import KanbanList from './KanbanList';

// class functions
export default function KanbanColumn({
    column,
    lists,
    tasksByListID,
    categories,
    focusedListId,
    dragging,
    dragType,
    insertionPoint,
    isDraggingTaskToEmptyCol,
    onAddTask,
    onUpdateList,
    onDeleteList,
    onUpdateTask,
    onDeleteTask,
    onStartTaskDrag,
    onStartListDrag,
    onOpenTask,
    onFocusClear,
    registerList,
    registerTask,
    registerGhost,
    registerTaskElement,
    registerListElement,
}) {
    // data processing functions
    const sortedLists = [...lists].sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

    const listInsertionIndex = insertionPoint?.type === 'list' && insertionPoint.colIndex === column.columnIndex
        ? insertionPoint.insertIndex
        : null;

    return (
        <div className="kanban-column" style={{ '--col': column.columnIndex }}>
            {sortedLists.map((list, index) => (
                <div key={list.id} style={{ width: '100%' }}>
                    {listInsertionIndex === index && (
                        <div className="kanban-list-insertion-indicator" style={{ height: '4px', background: 'var(--accent)', margin: '4px 0', borderRadius: '2px' }} />
                    )}

                    <KanbanList
                        list={list}
                        tasks={tasksByListID[list.id] ?? []}
                        categories={categories}
                        isFocused={focusedListId === list.id}
                        dragging={dragType === 'task' ? dragging : null}
                        isDraggingList={dragType === 'list' && dragging === list.id}
                        insertionPoint={insertionPoint}
                        onUpdate={changes => onUpdateList(list.id, changes)}
                        onDelete={() => onDeleteList(list.id)}
                        onAddTask={() => onAddTask(list.id)}
                        onUpdateTask={onUpdateTask}
                        onDeleteTask={onDeleteTask}
                        onStartTaskDrag={onStartTaskDrag}
                        onStartListDrag={onStartListDrag}
                        onOpenTask={onOpenTask}
                        onFocusClear={onFocusClear}
                        registerList={registerList}
                        registerTask={registerTask}
                        registerTaskElement={registerTaskElement}
                        registerListElement={registerListElement}
                    />
                </div>
            ))}

            {listInsertionIndex === sortedLists.length && (
                <div className="kanban-list-insertion-indicator" style={{ height: '4px', background: 'var(--accent)', margin: '4px 0', borderRadius: '2px' }} />
            )}

            {/* Ghost zone for dropping a TASK into a column that has no lists.
                Namespaced key ('ghost-task-col-') prevents collision with the
                list-empty-column dropzone below. The onGhostDrop handler in
                Kanban.jsx parses both prefixes. */}
            {isDraggingTaskToEmptyCol && (
                <div
                    className="kanban-ghost-list"
                    ref={el => registerGhost(`ghost-task-col-${column.columnIndex}`, el)}
                >
                    <span>+ Drop to create list</span>
                </div>
            )}

            {/* Ghost zone for dropping a LIST into a column with no other lists.
                Distinct key from the task variant above. */}
            {dragType === 'list' && sortedLists.length === 0 && (
                <div
                    className="kanban-empty-column-dropzone"
                    ref={el => registerGhost(`ghost-list-col-${column.columnIndex}`, el)}
                    style={{ flex: 1, border: '2px dashed var(--border)', borderRadius: '8px', minHeight: '100px', opacity: 0.5 }}
                />
            )}
        </div>
    );
}
