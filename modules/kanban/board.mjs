import * as constant from "./constants.mjs"

export class KanbanBoard {
  constructor() {
    this.horizontalLists = new Map();
    this.verticalLists = new Map();
  }

  addList(list){
    if(list.direction === constant.boardAlignment.Horizontal){
      this.horizontalLists.set(list.id, list);
    }else if(list.direction === constant.boardAlignment.Vertical){
      this.verticalLists.set(list.id, list);
    }
  }

}