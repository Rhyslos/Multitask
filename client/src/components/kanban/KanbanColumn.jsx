import KanbanList from './KanbanList';

export default function KanbanColumn({
    column,
    lists,
    tasksByListID,
    categories,
    focusedListId,
    dragging,
    insertionPoint,
    isDragging,
    onAddTask,
    onUpdateList,
    onDeleteList,
    onUpdateTask,
    onDeleteTask,
    onStartDrag,
    onOpenTask,
    onFocusClear,
    registerList,
    registerTask,
    registerGhost,
    registerTaskElement,
    registerListElement,
}) {
    return (
        <div className="kanban-column" style={{ '--col': column.columnIndex }}>
            {lists.map(list => (
                <KanbanList
                    key={list.id}
                    list={list}
                    tasks={tasksByListID[list.id] ?? []}
                    categories={categories}
                    isFocused={focusedListId === list.id}
                    dragging={dragging}
                    insertionPoint={insertionPoint}
                    onUpdate={changes => onUpdateList(list.id, changes)}
                    onDelete={() => onDeleteList(list.id)}
                    onAddTask={() => onAddTask(list.id)}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                    onStartDrag={onStartDrag}
                    onOpenTask={onOpenTask}
                    onFocusClear={onFocusClear}
                    registerList={registerList}
                    registerTask={registerTask}
                    registerTaskElement={registerTaskElement}
                    registerListElement={registerListElement}
                />
            ))}

            {isDragging && (
                <div
                    className="kanban-ghost-list"
                    ref={el => registerGhost(`ghost-col-${column.columnIndex}`, el)}
                >
                    <span>+ Drop to create list</span>
                </div>
            )}
        </div>
    );
}