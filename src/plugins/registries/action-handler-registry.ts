/**
 * AI动作处理器注册表
 *
 * 管理AI助手的动作处理器扩展
 */

import type { AIActionHandlerContribution, ActionContext } from '../types'

/**
 * AI动作处理器注册表
 *
 * 负责管理AI动作处理器的注册、查询和执行
 */
export class AIActionHandlerRegistry {
  private handlers: Map<string, AIActionHandlerContribution> = new Map()

  /**
   * 注册AI动作处理器
   */
  register(contribution: AIActionHandlerContribution): void {
    if (this.handlers.has(contribution.type)) {
      console.warn(`AI动作处理器 ${contribution.type} 已注册，将被覆盖`)
    }

    this.handlers.set(contribution.type, contribution)
    console.log(`✅ AI动作处理器 ${contribution.type} 已注册`)
  }

  /**
   * 注销AI动作处理器
   */
  unregister(type: string): void {
    this.handlers.delete(type)
    console.log(`✅ AI动作处理器 ${type} 已注销`)
  }

  /**
   * 获取AI动作处理器
   */
  get(type: string): AIActionHandlerContribution | undefined {
    return this.handlers.get(type)
  }

  /**
   * 获取所有AI动作处理器
   */
  getAll(): AIActionHandlerContribution[] {
    return Array.from(this.handlers.values())
  }

  /**
   * 获取处理器函数
   *
   * @param type 动作类型
   * @returns 处理器函数或undefined
   */
  getHandler(type: string): AIActionHandlerContribution['handler'] | undefined {
    const handler = this.handlers.get(type)
    return handler?.handler
  }

  /**
   * 检查AI动作处理器是否已注册
   */
  has(type: string): boolean {
    return this.handlers.has(type)
  }

  /**
   * 执行AI动作处理器
   *
   * @param type 动作类型
   * @param data 动作数据
   * @param context 动作上下文
   */
  async execute(type: string, data: any, context: ActionContext): Promise<void> {
    const handler = this.handlers.get(type)
    if (!handler) {
      throw new Error(`AI动作处理器 ${type} 未注册`)
    }

    try {
      console.log(`执行AI动作: ${type}`)
      const startTime = Date.now()

      await handler.handler(data, context)

      const duration = Date.now() - startTime
      console.log(`✅ AI动作 ${type} 执行完成，耗时: ${duration}ms`)
    } catch (error) {
      console.error(`AI动作 ${type} 执行失败:`, error)
      throw error
    }
  }

  /**
   * 获取所有支持的动作类型
   */
  getSupportedTypes(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * 批量执行多个动作
   *
   * @param actions 动作列表
   * @param context 动作上下文
   */
  async executeBatch(
    actions: Array<{ type: string; data: any }>,
    context: ActionContext
  ): Promise<void> {
    for (const action of actions) {
      await this.execute(action.type, action.data, context)
    }
  }

  /**
   * 清除所有AI动作处理器
   */
  clear(): void {
    this.handlers.clear()
    console.log('✅ 所有AI动作处理器已清除')
  }
}
