/**
 * 快捷命令注册表
 *
 * 管理AI助手的快捷命令扩展
 */

import type { QuickCommandContribution } from '../types'

/**
 * 快捷命令注册表
 *
 * 负责管理快捷命令的注册、查询和执行
 */
export class QuickCommandRegistry {
  private commands: Map<string, QuickCommandContribution> = new Map()

  /**
   * 注册快捷命令
   */
  register(contribution: QuickCommandContribution): void {
    if (this.commands.has(contribution.id)) {
      console.warn(`快捷命令 ${contribution.id} 已注册，将被覆盖`)
    }

    this.commands.set(contribution.id, contribution)
    console.log(`✅ 快捷命令 ${contribution.id} 已注册`)
  }

  /**
   * 注销快捷命令
   */
  unregister(id: string): void {
    this.commands.delete(id)
    console.log(`✅ 快捷命令 ${id} 已注销`)
  }

  /**
   * 获取快捷命令
   */
  get(id: string): QuickCommandContribution | undefined {
    return this.commands.get(id)
  }

  /**
   * 获取所有快捷命令
   */
  getAll(): QuickCommandContribution[] {
    return Array.from(this.commands.values())
  }

  /**
   * 按命令文本搜索
   *
   * @param text 命令文本
   * @returns 匹配的快捷命令列表
   */
  searchByText(text: string): QuickCommandContribution[] {
    const lowerText = text.toLowerCase()
    return this.getAll().filter(cmd =>
      cmd.text.toLowerCase().includes(lowerText) ||
      cmd.command.toLowerCase().includes(lowerText)
    )
  }

  /**
   * 按命令字符串获取
   *
   * @param command 命令字符串
   * @returns 快捷命令或undefined
   */
  getByCommand(command: string): QuickCommandContribution | undefined {
    return this.getAll().find(cmd => cmd.command === command)
  }

  /**
   * 检查快捷命令是否已注册
   */
  has(id: string): boolean {
    return this.commands.has(id)
  }

  /**
   * 执行快捷命令
   *
   * @param id 命令ID
   */
  async execute(id: string): Promise<void> {
    const command = this.commands.get(id)
    if (!command) {
      throw new Error(`快捷命令 ${id} 未注册`)
    }

    if (!command.handler) {
      console.warn(`快捷命令 ${id} 没有处理器`)
      return
    }

    try {
      await command.handler()
      console.log(`✅ 快捷命令 ${id} 执行成功`)
    } catch (error) {
      console.error(`快捷命令 ${id} 执行失败:`, error)
      throw error
    }
  }

  /**
   * 执行命令字符串
   *
   * @param command 命令字符串
   */
  async executeCommand(command: string): Promise<void> {
    const cmd = this.getByCommand(command)
    if (!cmd) {
      throw new Error(`快捷命令 ${command} 未注册`)
    }

    await this.execute(cmd.id)
  }

  /**
   * 清除所有快捷命令
   */
  clear(): void {
    this.commands.clear()
    console.log('✅ 所有快捷命令已清除')
  }
}
