/**
 * 撤销/重做管理器
 * 基于 Command Pattern 管理图表操作历史
 */

export interface UndoableAction {
  type: string
  data: any
}

export class UndoRedoManager {
  private undoStack: UndoableAction[] = []
  private redoStack: UndoableAction[] = []
  private maxHistory: number

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory
  }

  /**
   * 记录一个操作
   */
  push(action: UndoableAction): void {
    this.undoStack.push(action)
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
    // 新操作清空重做栈
    this.redoStack = []
  }

  /**
   * 撤销
   */
  undo(): UndoableAction | null {
    const action = this.undoStack.pop()
    if (action) {
      this.redoStack.push(action)
      return action
    }
    return null
  }

  /**
   * 重做
   */
  redo(): UndoableAction | null {
    const action = this.redoStack.pop()
    if (action) {
      this.undoStack.push(action)
      return action
    }
    return null
  }

  /**
   * 是否可撤销
   */
  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /**
   * 是否可重做
   */
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

export default UndoRedoManager
