import KanbanList from './KanbanList';


// Component
export default function KanbanColumn({
    colIndex, lists, tasks, categories, focusedListId, dragging, insertionPoint, isDragging,
    onUpdateList, onDeleteList, onAddTask, onUpdateTask, onDeleteTask,
    onStartDrag, onOpenTask, onFocusClear, registerList, registerTask, registerGhost
}) {
    return (
        <div className="kanban-column">
            {lists.map(list => (
                <KanbanList
                    key={list.id}
                    list={list}
                    tasks={tasks.filter(t => t.listID === list.id).sort((a, b) => a.taskOrder - b.taskOrder)}
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
                />
            ))}

            {isDragging && (
                <div
                    className="kanban-ghost-list"
                    ref={el => registerGhost(`ghost-col-${colIndex}`, el)}
                >
                    <span>+ Drop to create list</span>
                </div>
            )}
        </div>
    );
}