/**
 * 侧边栏面板注册表
 *
 * 管理应用程序侧边栏面板扩展
 */

import type { SidebarPanelContribution } from '../types'

/**
 * 侧边栏面板注册表
 *
 * 负责管理侧边栏面板的注册、查询和布局
 */
export class SidebarPanelRegistry {
  private panels: Map<string, SidebarPanelContribution> = new Map()

  /**
   * 注册侧边栏面板
   */
  register(contribution: SidebarPanelContribution): void {
    if (this.panels.has(contribution.id)) {
      console.warn(`侧边栏面板 ${contribution.id} 已注册，将被覆盖`)
    }

    this.panels.set(contribution.id, contribution)
    console.log(`✅ 侧边栏面板 ${contribution.id} 已注册`)
  }

  /**
   * 注销侧边栏面板
   */
  unregister(id: string): void {
    this.panels.delete(id)
    console.log(`✅ 侧边栏面板 ${id} 已注销`)
  }

  /**
   * 获取侧边栏面板
   */
  get(id: string): SidebarPanelContribution | undefined {
    return this.panels.get(id)
  }

  /**
   * 获取所有侧边栏面板
   */
  getAll(): SidebarPanelContribution[] {
    return Array.from(this.panels.values())
  }

  /**
   * 按位置获取侧边栏面板
   *
   * @param position 位置 ('left' | 'right')
   * @returns 按order排序的面板列表
   */
  getByPosition(position: 'left' | 'right'): SidebarPanelContribution[] {
    return this.getAll()
      .filter(panel => panel.position === position)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  /**
   * 获取左侧面板
   */
  getLeftPanels(): SidebarPanelContribution[] {
    return this.getByPosition('left')
  }

  /**
   * 获取右侧面板
   */
  getRightPanels(): SidebarPanelContribution[] {
    return this.getByPosition('right')
  }

  /**
   * 检查侧边栏面板是否已注册
   */
  has(id: string): boolean {
    return this.panels.has(id)
  }

  /**
   * 获取面板组件
   *
   * @param id 面板ID
   * @returns Vue组件
   */
  getComponent(id: string) {
    const panel = this.panels.get(id)
    return panel?.component
  }

  /**
   * 获取面板宽度
   *
   * @param id 面板ID
   * @returns 宽度（像素）
   */
  getWidth(id: string): number | undefined {
    const panel = this.panels.get(id)
    return panel?.width
  }

  /**
   * 清除所有侧边栏面板
   */
  clear(): void {
    this.panels.clear()
    console.log('✅ 所有侧边栏面板已清除')
  }
}
