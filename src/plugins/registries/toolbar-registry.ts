/**
 * 工具栏按钮注册表
 *
 * 管理编辑器工具栏按钮扩展
 */

import type { ToolbarButtonContribution, EditorContext } from '../types'

/**
 * 工具栏按钮注册表
 *
 * 负责管理工具栏按钮的注册、查询和执行
 */
export class ToolbarButtonRegistry {
  private buttons: Map<string, ToolbarButtonContribution> = new Map()

  /**
   * 注册工具栏按钮
   */
  register(contribution: ToolbarButtonContribution): void {
    if (this.buttons.has(contribution.id)) {
      console.warn(`工具栏按钮 ${contribution.id} 已注册，将被覆盖`)
    }

    this.buttons.set(contribution.id, contribution)
    console.log(`✅ 工具栏按钮 ${contribution.id} 已注册`)
  }

  /**
   * 注销工具栏按钮
   */
  unregister(id: string): void {
    this.buttons.delete(id)
    console.log(`✅ 工具栏按钮 ${id} 已注销`)
  }

  /**
   * 获取工具栏按钮
   */
  get(id: string): ToolbarButtonContribution | undefined {
    return this.buttons.get(id)
  }

  /**
   * 获取所有工具栏按钮
   */
  getAll(): ToolbarButtonContribution[] {
    return Array.from(this.buttons.values())
  }

  /**
   * 按位置获取工具栏按钮
   *
   * @param location 位置 ('chapter-editor' | 'outline-editor' | 'character-editor')
   * @returns 按order排序的按钮列表
   */
  getByLocation(location: string): ToolbarButtonContribution[] {
    return this.getAll()
      .filter(button => button.location === location)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  /**
   * 获取章节编辑器按钮
   */
  getChapterEditorButtons(): ToolbarButtonContribution[] {
    return this.getByLocation('chapter-editor')
  }

  /**
   * 获取大纲编辑器按钮
   */
  getOutlineEditorButtons(): ToolbarButtonContribution[] {
    return this.getByLocation('outline-editor')
  }

  /**
   * 获取人物编辑器按钮
   */
  getCharacterEditorButtons(): ToolbarButtonContribution[] {
    return this.getByLocation('character-editor')
  }

  /**
   * 检查工具栏按钮是否已注册
   */
  has(id: string): boolean {
    return this.buttons.has(id)
  }

  /**
   * 执行按钮处理
   *
   * @param id 按钮ID
   * @param context 编辑器上下文
   */
  async execute(id: string, context: EditorContext): Promise<void> {
    const button = this.buttons.get(id)
    if (!button) {
      throw new Error(`工具栏按钮 ${id} 未注册`)
    }

    try {
      await button.handler(context)
      console.log(`✅ 工具栏按钮 ${id} 执行成功`)
    } catch (error) {
      console.error(`工具栏按钮 ${id} 执行失败:`, error)
      throw error
    }
  }

  /**
   * 清除所有工具栏按钮
   */
  clear(): void {
    this.buttons.clear()
    console.log('✅ 所有工具栏按钮已清除')
  }
}
