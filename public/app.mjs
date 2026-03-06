import * as tool from "../modules/lib.mjs"
import { KanbanBoard } from "../modules/kanban/board.mjs";
import { KanbanList } from "../modules/kanban/list.mjs";
import { KanbanTask } from "../modules/kanban/task.mjs";
import * as constant from "../modules/kanban/constants.mjs";

// Data initialization functions
const board = new KanbanBoard();

// View loading functions
async function loadBoardView() {
    try {
        const response = await fetch('/views/kanban_view/board.html');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const htmlText = await response.text();
        
        const appRoot = tool.locate('id', 'app-root');
        if(appRoot) {
            appRoot.innerHTML = htmlText;
            renderAddColumnButton();
            bindBoardEvents();
        }
    } catch (error) {
        console.error("Failed to load the board view:", error);
    }
}

// DOM rendering functions
function renderAddColumnButton() {
    const navbar = tool.locate('id', 'tab-navbar');
    const template = tool.locate('id', 'add-column-button-template');
    
    if (navbar && template) {
        const clone = template.content.cloneNode(true);
        navbar.appendChild(clone);
        
        bindNewButtonEvent(navbar);
    }
}

function spawnNewList(columnIndex) {
    const listsContainer = tool.locate('id', 'lists-container');
    const template = tool.locate('id', 'vertical-list-template');
    
    if (listsContainer && template) {
        // ID generation functions
        const listID = `list-${Date.now()}`;
        
        // Data logic functions
        const newList = new KanbanList(listID, "New List", "General", constant.boardAlignment.Vertical);
        board.addList(newList);

        // Column creation functions
        let columns = tool.locateAll('class', 'list-column', listsContainer);
        let targetColumn = columns[columnIndex];
        
        if (!targetColumn) {
            targetColumn = document.createElement('div');
            targetColumn.className = 'list-column';
            listsContainer.appendChild(targetColumn);
        }

        // UI logic functions
        const clone = template.content.cloneNode(true);
        targetColumn.appendChild(clone);
        
        // DOM selection functions
        const addedLists = tool.locateAll('class', 'kanban-list', targetColumn);
        const newestListElement = addedLists[addedLists.length - 1];
        newestListElement.id = listID;
        
        // Event binding functions
        const addTaskBtn = tool.locate('class', 'add-task-btn', newestListElement);
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => spawnNewTask(listID));
        }

        return listID;
    }
    return null;
}

function spawnNewTask(listID) {
    const listElement = tool.locate('id', listID);
    const taskContainer = tool.locate('class', 'task-container', listElement);
    const template = tool.locate('id', 'task-template');

    if (taskContainer && template) {
        // ID generation functions
        const taskID = `task-${Date.now()}`;
        
        // Data logic functions
        const listData = board.getList(listID);
        const category = listData ? listData.category : "General";
        
        const newTask = new KanbanTask(taskID, "New Task", category, listID);
        if (listData) {
            listData.addTask(newTask);
        }

        // UI logic functions
        const clone = template.content.cloneNode(true);
        taskContainer.appendChild(clone);

        // DOM selection functions
        const addedTasks = tool.locateAll('class', 'kanban-task', taskContainer);
        const newestTaskElement = addedTasks[addedTasks.length - 1];
        newestTaskElement.id = taskID;

        // Event binding functions
        newestTaskElement.addEventListener('dragstart', handleDragStart);
        newestTaskElement.addEventListener('dragend', handleDragEnd);
    }
}

function showDropZones() {
    const listArea = tool.locate('id', 'lists-container');
    const columns = tool.locateAll('class', 'list-column', listArea);
    const template = tool.locate('id', 'ghost-list-template');
    
    if (!template || !listArea) return;

    // UI logic functions
    const columnArray = Array.from(columns);
    for (let col of columnArray) {
        const clone = template.content.cloneNode(true);
        col.appendChild(clone);
    }

    // Column creation functions
    const newCol = document.createElement('div');
    newCol.className = 'list-column ghost-column';
    newCol.appendChild(template.content.cloneNode(true));
    listArea.appendChild(newCol);
}

function hideDropZones() {
    // DOM selection functions
    const ghosts = Array.from(tool.locateAll('class', 'ghost-list'));
    const ghostCols = Array.from(tool.locateAll('class', 'ghost-column'));

    // UI logic functions
    ghosts.forEach(g => g.remove());
    ghostCols.forEach(c => c.remove());
}

// Event binding functions
function bindNewButtonEvent(navbar) {
    const buttons = tool.locateAll('class', 'add-list-btn', navbar);
    const newButton = buttons[buttons.length - 1];
    
    if (newButton) {
        newButton.addEventListener('click', handleAddColumnClick);
    }
}

function bindBoardEvents() {
    const boardContainer = tool.locate('id', 'board-container');
    if (boardContainer) {
        boardContainer.addEventListener('dragover', handleDragOver);
        boardContainer.addEventListener('drop', handleDrop);
    }
}

// Event handling functions
function handleAddColumnClick(event) {
    const clickedButton = event.target;
    const navbar = tool.locate('id', 'tab-navbar');
    const buttons = tool.locateAll('class', 'add-list-btn', navbar);
    
    // Utility functions
    const buttonIndex = Array.from(buttons).indexOf(clickedButton);
    
    spawnNewList(buttonIndex);
    
    // UI logic functions
    if (buttonIndex === buttons.length - 1) {
        renderAddColumnButton();
    }
}

function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', event.target.id);
    event.target.classList.add('is-dragging');
    showDropZones();
}

function handleDragEnd(event) {
    event.target.classList.remove('is-dragging');
    hideDropZones();
}

function handleDragOver(event) {
    event.preventDefault(); 
}

function handleDrop(event) {
    event.preventDefault();
    const taskID = event.dataTransfer.getData('text/plain');
    if (!taskID) return;

    // DOM selection functions
    const listArea = tool.locate('id', 'lists-container');
    const dropTargetList = event.target.closest('.kanban-list');
    const dropTargetGhost = event.target.closest('.ghost-list');
    const dropTargetColumn = event.target.closest('.list-column');

    // Utility functions
    const isGhostColumn = dropTargetColumn && dropTargetColumn.classList.contains('ghost-column');
    const isGhostList = !!dropTargetGhost;
    const columns = tool.locateAll('class', 'list-column', listArea);
    const colIndex = dropTargetColumn ? Array.from(columns).indexOf(dropTargetColumn) : columns.length;

    // UI logic functions
    hideDropZones();

    if (dropTargetList) {
        handleTaskDrop(taskID, dropTargetList.id);
    } else if (isGhostList || isGhostColumn || dropTargetColumn) {
        if (isGhostColumn) {
            const newListID = spawnNewList(colIndex);
            if (newListID) handleTaskDrop(taskID, newListID);
            
            // UI logic functions
            renderAddColumnButton();
        } else {
            const newListID = spawnNewList(colIndex);
            if (newListID) handleTaskDrop(taskID, newListID);
        }
    }
}

function handleTaskDrop(taskID, targetListID){
    const taskElement = tool.locate('id', taskID);
    const sourceListElement = taskElement.closest('.kanban-list');
    
    if (sourceListElement && taskElement) {
        board.moveTask(taskID, sourceListElement.id, targetListID);

        const targetListContainer = tool.locate('id', targetListID);
        const taskContainer = tool.locate('class', 'task-container', targetListContainer);
        taskContainer.appendChild(taskElement);
    }
}

// App execution functions
loadBoardView();