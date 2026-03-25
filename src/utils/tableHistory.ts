/**
 * 表格历史记录管理器
 * 支持撤销/重做功能
 */

import type { Sheet, MemorySystem } from './tableMemory'
import { exportMemory, importMemory } from './tableMemory'

/**
 * 历史记录项
 */
export interface HistoryEntry {
  id: string
  timestamp: number
  action: string
  description: string
  snapshot: string  // JSON 快照
  sheetUid?: string
}

/**
 * 历史管理器选项
 */
export interface HistoryManagerOptions {
  maxSize?: number  // 最大历史记录数
  enableAutoSave?: boolean  // 自动保存
}

/**
 * 历史管理器
 */
export class TableHistoryManager {
  private history: HistoryEntry[] = []
  private currentIndex: number = -1
  private maxSize: number
  private enableAutoSave: boolean

  constructor(options: HistoryManagerOptions = {}) {
    this.maxSize = options.maxSize || 50
    this.enableAutoSave = options.enableAutoSave ?? true
  }

  /**
   * 记录操作
   */
  record(
    action: string,
    description: string,
    memory: MemorySystem,
    sheetUid?: string
  ): void {
    // 删除当前位置之后的所有记录
    this.history = this.history.slice(0, this.currentIndex + 1)

    // 创建新记录
    const entry: HistoryEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      action,
      description,
      snapshot: exportMemory(memory),
      sheetUid
    }

    this.history.push(entry)
    this.currentIndex = this.history.length - 1

    // 限制历史记录数量
    if (this.history.length > this.maxSize) {
      const removed = this.history.length - this.maxSize
      this.history = this.history.slice(removed)
      this.currentIndex -= removed
    }
  }

  /**
   * 撤销
   */
  undo(memory: MemorySystem): MemorySystem | null {
    if (!this.canUndo()) {
      return null
    }

    this.currentIndex--
    const entry = this.history[this.currentIndex]

    if (entry) {
      return importMemory(entry.snapshot)
    }

    // 如果当前索引为 -1，返回到初始状态
    // 这种情况不应该发生，但作为保护
    return null
  }

  /**
   * 重做
   */
  redo(memory: MemorySystem): MemorySystem | null {
    if (!this.canRedo()) {
      return null
    }

    this.currentIndex++
    const entry = this.history[this.currentIndex]

    if (entry) {
      return importMemory(entry.snapshot)
    }

    return null
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.currentIndex > 0
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  /**
   * 获取历史记录列表
   */
  getHistory(): HistoryEntry[] {
    return [...this.history]
  }

  /**
   * 获取当前记录
   */
  getCurrentEntry(): HistoryEntry | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex]
    }
    return null
  }

  /**
   * 获取撤销描述
   */
  getUndoDescription(): string | null {
    if (!this.canUndo()) {
      return null
    }
    return this.history[this.currentIndex]?.description || null
  }

  /**
   * 获取重做描述
   */
  getRedoDescription(): string | null {
    if (!this.canRedo()) {
      return null
    }
    return this.history[this.currentIndex + 1]?.description || null
  }

  /**
   * 跳转到指定历史记录
   */
  jumpTo(index: number): MemorySystem | null {
    if (index < 0 || index >= this.history.length) {
      return null
    }

    this.currentIndex = index
    const entry = this.history[index]
    return importMemory(entry.snapshot)
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.history = []
    this.currentIndex = -1
  }

  /**
   * 获取历史统计
   */
  getStats(): {
    total: number
    currentIndex: number
    canUndo: boolean
    canRedo: boolean
  } {
    return {
      total: this.history.length,
      currentIndex: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    }
  }
}

/**
 * 创建历史管理器实例
 */
export function createHistoryManager(options?: HistoryManagerOptions): TableHistoryManager {
  return new TableHistoryManager(options)
}

/**
 * 操作类型常量
 */
export const HISTORY_ACTIONS = {
  CELL_EDIT: 'cell_edit',
  ROW_ADD: 'row_add',
  ROW_DELETE: 'row_delete',
  ROW_EDIT: 'row_edit',
  ROW_MOVE: 'row_move',
  COLUMN_ADD: 'column_add',
  COLUMN_DELETE: 'column_delete',
  COLUMN_RENAME: 'column_rename',
  SHEET_CREATE: 'sheet_create',
  SHEET_DELETE: 'sheet_delete',
  SHEET_RENAME: 'sheet_rename',
  IMPORT: 'import',
  BATCH_EDIT: 'batch_edit'
} as const

/**
 * 生成操作描述
 */
export function generateActionDescription(
  action: string,
  details: Record<string, any> = {}
): string {
  switch (action) {
    case HISTORY_ACTIONS.CELL_EDIT:
      return `编辑单元格 ${details.row}行${details.col}列`

    case HISTORY_ACTIONS.ROW_ADD:
      return `添加第 ${details.row} 行`

    case HISTORY_ACTIONS.ROW_DELETE:
      return `删除第 ${details.row} 行`

    case HISTORY_ACTIONS.ROW_EDIT:
      return `编辑第 ${details.row} 行`

    case HISTORY_ACTIONS.ROW_MOVE:
      return `移动第 ${details.from} 行到第 ${details.to} 行`

    case HISTORY_ACTIONS.COLUMN_ADD:
      return `添加列 "${details.name}"`

    case HISTORY_ACTIONS.COLUMN_DELETE:
      return `删除列 "${details.name}"`

    case HISTORY_ACTIONS.COLUMN_RENAME:
      return `重命名列: ${details.oldName} → ${details.newName}`

    case HISTORY_ACTIONS.SHEET_CREATE:
      return `创建表格 "${details.name}"`

    case HISTORY_ACTIONS.SHEET_DELETE:
      return `删除表格 "${details.name}"`

    case HISTORY_ACTIONS.SHEET_RENAME:
      return `重命名表格: ${details.oldName} → ${details.newName}`

    case HISTORY_ACTIONS.IMPORT:
      return `导入 ${details.count} 个表格`

    case HISTORY_ACTIONS.BATCH_EDIT:
      return `批量编辑 ${details.count} 个单元格`

    default:
      return details.description || '未知操作'
  }
}
