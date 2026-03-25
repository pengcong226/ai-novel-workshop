/**
 * 菜单项注册表
 *
 * 管理应用程序菜单项扩展
 */

import type { MenuItemContribution } from '../types'

/**
 * 菜单项注册表
 *
 * 负责管理菜单项的注册、查询和分组
 */
export class MenuItemRegistry {
  private items: Map<string, MenuItemContribution> = new Map()

  /**
   * 注册菜单项
   */
  register(contribution: MenuItemContribution): void {
    if (this.items.has(contribution.id)) {
      console.warn(`菜单项 ${contribution.id} 已注册，将被覆盖`)
    }

    this.items.set(contribution.id, contribution)
    console.log(`✅ 菜单项 ${contribution.id} 已注册`)
  }

  /**
   * 注销菜单项
   */
  unregister(id: string): void {
    this.items.delete(id)
    console.log(`✅ 菜单项 ${id} 已注销`)
  }

  /**
   * 获取菜单项
   */
  get(id: string): MenuItemContribution | undefined {
    return this.items.get(id)
  }

  /**
   * 获取所有菜单项
   */
  getAll(): MenuItemContribution[] {
    return Array.from(this.items.values())
  }

  /**
   * 按组获取菜单项
   *
   * @returns 按组名分组的菜单项Map
   */
  getByGroup(): Map<string, MenuItemContribution[]> {
    const groups = new Map<string, MenuItemContribution[]>()

    for (const item of this.getAll()) {
      const group = item.group || 'default'
      if (!groups.has(group)) {
        groups.set(group, [])
      }
      groups.get(group)!.push(item)
    }

    // 每组内按order排序
    groups.forEach((items) => {
      items.sort((a, b) => (a.order || 0) - (b.order || 0))
    })

    return groups
  }

  /**
   * 获取可见的菜单项
   *
   * @returns 当前应该显示的菜单项列表
   */
  getVisible(): MenuItemContribution[] {
    return this.getAll().filter(item => {
      if (item.when) {
        try {
          return item.when()
        } catch (error) {
          console.error(`菜单项 ${item.id} 的 when 条件执行失败:`, error)
          return false
        }
      }
      return true
    })
  }

  /**
   * 执行菜单项处理
   *
   * @param id 菜单项ID
   */
  async execute(id: string): Promise<void> {
    const item = this.items.get(id)
    if (!item) {
      throw new Error(`菜单项 ${id} 未注册`)
    }

    try {
      await item.handler()
      console.log(`✅ 菜单项 ${id} 执行成功`)
    } catch (error) {
      console.error(`菜单项 ${id} 执行失败:`, error)
      throw error
    }
  }

  /**
   * 检查菜单项是否已注册
   */
  has(id: string): boolean {
    return this.items.has(id)
  }

  /**
   * 清除所有菜单项
   */
  clear(): void {
    this.items.clear()
    console.log('✅ 所有菜单项已清除')
  }
}
