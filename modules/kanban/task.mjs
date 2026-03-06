
export class KanbanTask {
  constructor(id, title, category, originListID) {
    this.id = id;
    this.title = title;
    this.originalCategory = category;
    this.originListID = originListID;
    this.description = "";
    this.isCompleted = false;
  }
}