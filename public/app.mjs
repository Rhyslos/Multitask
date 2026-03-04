import { KanbanBoard } from "../modules/kanban/board.mjs";

const board = new KanbanBoard();

function handleTaskDrop(taskID, targetListID){
    const taskElement   = document.getElementById(taskID);
    const sourceListID  = taskElement.parentElement.id;

    board.moveTask(taskID, sourceListID, targetListID);

    const targetListContainer = document.getElementById(targetListID);
    targetListContainer.appendChild(taskElement);

}