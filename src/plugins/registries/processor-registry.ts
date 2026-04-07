/**
 * 处理器注册表
 *
 * 管理数据处理器插件，支持管道式数据处理
 */

import type { ProcessorContribution, ProcessorContext } from '../types'

/**
 * 处理阶段
 */
export type ProcessorStage = 'pre-import' | 'post-import' | 'pre-export' | 'post-generation'

/**
 * 处理器注册表
 *
 * 负责管理所有数据处理器的注册、查询和管道执行
 */
export class ProcessorRegistry {
  private processors: Map<string, ProcessorContribution> = new Map()
  private processorsByStage: Map<ProcessorStage, ProcessorContribution[]> = new Map()

  /**
   * 执行带超时保护的处理器
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`processor timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  }

  /**
   * 获取阶段处理器（按优先级降序）
   */
  private getSortedStageProcessors(stage: ProcessorStage): ProcessorContribution[] {
    return [...(this.processorsByStage.get(stage) || [])]
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  constructor() {
    // 初始化各阶段的处理器列表
    this.processorsByStage.set('pre-import', [])
    this.processorsByStage.set('post-import', [])
    this.processorsByStage.set('pre-export', [])
    this.processorsByStage.set('post-generation', [])
  }

  /**
   * 注册处理器
   */
  register(contribution: ProcessorContribution): void {
    if (this.processors.has(contribution.id)) {
      console.warn(`处理器 ${contribution.id} 已注册，将被覆盖`)
      // 先从阶段列表中移除旧的
      this.unregister(contribution.id)
    }

    this.processors.set(contribution.id, contribution)

    // 添加到对应的阶段列表
    const stageList = this.processorsByStage.get(contribution.stage as ProcessorStage)
    if (stageList) {
      stageList.push(contribution)
    }

    console.log(`✅ 处理器 ${contribution.id} 已注册，阶段: ${contribution.stage}`)
  }

  /**
   * 注销处理器
   */
  unregister(id: string): void {
    const processor = this.processors.get(id)
    if (!processor) return

    this.processors.delete(id)

    // 从阶段列表中移除
    const stageList = this.processorsByStage.get(processor.stage as ProcessorStage)
    if (stageList) {
      const index = stageList.findIndex(p => p.id === id)
      if (index >= 0) {
        stageList.splice(index, 1)
      }
    }

    console.log(`✅ 处理器 ${id} 已注销`)
  }

  /**
   * 获取处理器
   */
  get(id: string): ProcessorContribution | undefined {
    return this.processors.get(id)
  }

  /**
   * 获取所有处理器
   */
  getAll(): ProcessorContribution[] {
    return Array.from(this.processors.values())
  }

  /**
   * 按阶段获取处理器
   */
  getByStage(stage: ProcessorStage): ProcessorContribution[] {
    return this.processorsByStage.get(stage) || []
  }

  /**
   * 检查处理器是否已注册
   */
  has(id: string): boolean {
    return this.processors.has(id)
  }

  /**
   * 执行单个处理器
   *
   * @param processorId 处理器ID
   * @param data 输入数据
   * @param context 处理上下文
   * @returns 处理后的数据
   */
  async process(
    processorId: string,
    data: any,
    context: ProcessorContext
  ): Promise<unknown> {
    const processor = this.processors.get(processorId)
    if (!processor) {
      throw new Error(`处理器 ${processorId} 未注册`)
    }

    try {
      console.log(`执行处理器: ${processorId}`)
      const startTime = Date.now()

      const result = await this.executeWithTimeout(
        processor.process(data, context),
        processor.timeoutMs ?? 5000
      )

      const duration = Date.now() - startTime
      console.log(`✅ 处理器 ${processorId} 执行完成，耗时: ${duration}ms`)

      return result
    } catch (error) {
      console.error(`处理器 ${processorId} 执行失败:`, error)
      throw error
    }
  }

  /**
   * 执行处理管道
   *
   * 按顺序执行指定阶段的所有处理器
   *
   * @param stage 处理阶段
   * @param data 输入数据
   * @param context 处理上下文
   * @returns 处理后的数据
   */
  async processPipeline(
    stage: ProcessorStage,
    data: any,
    context: ProcessorContext
  ): Promise<unknown> {
    const processors = this.getSortedStageProcessors(stage)

    if (processors.length === 0) {
      console.log(`阶段 ${stage} 没有注册处理器，跳过`)
      return data
    }

    console.log(`开始执行 ${stage} 管道，共 ${processors.length} 个处理器`)

    let result = data
    const startTime = Date.now()

    for (const processor of processors) {
      try {
        console.log(`  执行处理器: ${processor.id}`)
        result = await this.executeWithTimeout(
          processor.process(result, context),
          processor.timeoutMs ?? 5000
        )
      } catch (error) {
        const onError = processor.onError ?? 'abort'
        console.error(`处理器 ${processor.id} 执行失败，策略: ${onError}`, error)
        if (onError === 'abort') {
          console.error(`${stage} 管道执行失败:`, error)
          throw error
        }
      }
    }

    const duration = Date.now() - startTime
    console.log(`✅ ${stage} 管道执行完成，耗时: ${duration}ms`)

    return result
  }

  /**
   * 执行多个指定的处理器
   *
   * @param processorIds 处理器ID列表
   * @param data 输入数据
   * @param context 处理上下文
   * @returns 处理后的数据
   */
  async processChain(
    processorIds: string[],
    data: any,
    context: ProcessorContext
  ): Promise<unknown> {
    let result = data

    for (const processorId of processorIds) {
      result = await this.process(processorId, result, context)
    }

    return result
  }

  /**
   * 并行执行多个处理器
   *
   * @param processorIds 处理器ID列表
   * @param data 输入数据（每个处理器接收相同的输入）
   * @param context 处理上下文
   * @returns 所有处理器的结果数组
   */
  async processParallel(
    processorIds: string[],
    data: any,
    context: ProcessorContext
  ): Promise<any[]> {
    const promises = processorIds.map(async (processorId) => {
      return await this.process(processorId, data, context)
    })

    return await Promise.all(promises)
  }

  /**
   * 获取处理器的设置组件
   *
   * @param processorId 处理器ID
   * @returns Vue组件或undefined
   */
  getSettingsComponent(processorId: string) {
    const processor = this.processors.get(processorId)
    if (!processor) {
      return undefined
    }

    return processor.getSettingsComponent?.()
  }

  /**
   * 清除所有处理器
   */
  clear(): void {
    this.processors.clear()
    this.processorsByStage.set('pre-import', [])
    this.processorsByStage.set('post-import', [])
    this.processorsByStage.set('pre-export', [])
    this.processorsByStage.set('post-generation', [])
    console.log('✅ 所有处理器已清除')
  }

  /**
   * 获取统计信息
   */
  getStats(): Record<ProcessorStage, number> {
    return {
      'pre-import': this.getByStage('pre-import').length,
      'post-import': this.getByStage('post-import').length,
      'pre-export': this.getByStage('pre-export').length,
      'post-generation': this.getByStage('post-generation').length
    }
  }
}
