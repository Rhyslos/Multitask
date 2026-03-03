
export class KanbanTask {
  constructor(id, title, category, originListId) {
    this.id = id;
    this.title = title;
    this.originalCategory = category;
    this.originListId = originListId;
  }
}