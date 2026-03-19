
export class KanbanList {
  constructor(id, name, category, direction) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.direction = direction;
    this.tasks = new Map();
  }

  addTask(task) {
    this.tasks.set(task.id, task);
  }

  removeTask(taskID){
    const task = this.tasks.get(taskID);
    this.tasks.delete(taskID);
    return task;
  }

  getDefaultTaskCategory(task){
    if(task.originListID === this.id){
      return this.category;
    }
    return task.originalCategory;
  }
}