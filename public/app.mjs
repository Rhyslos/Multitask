import * as tool from "../modules/lib.mjs"
import { KanbanBoard } from "../modules/kanban/board.mjs";

const board = new KanbanBoard();

function handleTaskDrop(taskID, targetListID){
    const taskElement   = tool.locate('class', taskID);
    const sourceListID  = taskElement.parentElement.id;

    board.moveTask(taskID, sourceListID, targetListID);

    const targetListContainer = tool.locate('id', targetListID);
    targetListContainer.appendChild(taskElement);
}

function updateTaskUI(taskID, targetListID){
    const taskElement = tool.locate('id', taskID);
    const targetList = tool.locate('id', targetListID);

    targetList.appendChild(taskElement);
}

