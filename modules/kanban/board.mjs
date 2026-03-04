import * as constant from "./constants.mjs"

export class KanbanBoard {
  constructor() {
    this.horizontalLists = new Map();
    this.verticalLists = new Map();
  }

  addList(list){
    if(list.direction === constant.boardAlignmentHorizontal){
      this.horizontalLists.set(list.id, list);
    }else if(list.direction === constant.boardAlignmentVertical){
      this.verticalLists.set(list.id, list);
    }
  }

}