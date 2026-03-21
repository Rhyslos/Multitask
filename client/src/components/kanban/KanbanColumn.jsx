import AnimatedRemoval from '../AnimatedRemoval';
import KanbanList from './KanbanList';


// Component
export default function KanbanColumn({
    colIndex, lists, tasks, categories, focusedListId, dragging, insertionPoint, isDragging,
    onUpdateList, onDeleteList, onAddTask, onUpdateTask, onDeleteTask,
    onStartDrag, onOpenTask, onFocusClear, registerList, registerTask,
    registerGhost, registerTaskElement, registerListElement, removingIds
}) {
    return (
        <div className="kanban-column" style={{ '--col': colIndex }}>
            {lists.map(list => (
                <AnimatedRemoval key={list.id} removing={removingIds?.has(list.id)}>
                    <KanbanList
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
                        registerTaskElement={registerTaskElement}
                        registerListElement={registerListElement}
                    />
                </AnimatedRemoval>
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