
export class KanbanList {
  constructor(id, name, category, direction) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.direction = direction;
    this.tasks = new Map();
  }
}