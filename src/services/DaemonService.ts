/**
 * DaemonService — 后台 Pipeline 执行器
 *
 * 管理后台 Pipeline 执行，支持：
 * - 定时调度（scheduleIntervalMs 间隔触发）
 * - 安全门控（每日章节上限、Token上限、费用上限、连续失败暂停）
 * - 进度事件通知（通过事件监听器）
 * - 三种运行模式：auto（全自动）、semi（半自动，需确认）、manual（手动触发）
 *
 * 注意：PipelineRunner 和 BatchContinueScheduler 使用动态 import，
 * 避免循环依赖。项目存储同样使用动态 import。
 */

import { getLogger } from '@/utils/logger'
import type { PipelineConfig } from '@/services/pipeline/types'
import type { ChapterPipelineResult } from '@/services/pipeline/types'
import { acquireProjectLock, releaseProjectLock, getLockConflictMessage } from '@/utils/pipelineLock'

const logger = getLogger('service:daemon')

// ============================================================================
// 类型定义
// ============================================================================

export interface DaemonConfig {
  /** 是否启用守护服务 */
  enabled: boolean
  /** 运行模式：全自动 / 半自动 / 手动 */
  mode: 'auto' | 'semi' | 'manual'
  /** 调度间隔（毫秒），默认 3600000（1小时） */
  scheduleIntervalMs: number
  /** 单次会话最大章节数，默认 10 */
  maxChaptersPerSession: number
  /** 每日章节数上限，默认 50 */
  maxChaptersPerDay: number
  /** 每日 Token 上限，默认 5000000 */
  maxTokenPerDay: number
  /** 每日费用上限（美元），默认 $5 */
  maxCostPerDayUSD: number
  /** 连续失败暂停阈值，默认 3 */
  consecutiveFailureThreshold: number
  /** 章间冷却时间（毫秒），默认 2000 */
  cooldownBetweenChaptersMs: number
  /** Pipeline 配置覆盖 */
  pipelineConfig?: Partial<PipelineConfig>
}

export interface DaemonState {
  /** 守护服务状态 */
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error'
  /** 当前正在执行的章节号 */
  currentChapter?: number
  /** 今日已完成章节数 */
  chaptersCompletedToday: number
  /** 今日已消耗 Token 数 */
  tokensUsedToday: number
  /** 上次运行时间戳 */
  lastRunTimestamp: number
  /** 最后一次错误信息 */
  lastError?: string
  /** 连续失败计数 */
  consecutiveFailures: number
  /** 下次调度时间戳 */
  scheduledNextRun?: number
}

export type DaemonEventType =
  | 'started'
  | 'chapter-start'
  | 'chapter-complete'
  | 'chapter-failed'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'error'
  | 'daily-limit-reached'
  | 'schedule-tick'

export interface DaemonEvent {
  type: DaemonEventType
  timestamp: number
  chapterNumber?: number
  chapterResult?: ChapterPipelineResult
  error?: string
  state: DaemonState
}

export type DaemonEventListener = (event: DaemonEvent) => void

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  enabled: true,
  mode: 'auto',
  scheduleIntervalMs: 3_600_000,       // 1 小时
  maxChaptersPerSession: 10,
  maxChaptersPerDay: 50,
  maxTokenPerDay: 5_000_000,
  maxCostPerDayUSD: 5,
  consecutiveFailureThreshold: 3,
  cooldownBetweenChaptersMs: 2_000,
}

// ============================================================================
// DaemonService
// ============================================================================

export class DaemonService {
  private config: DaemonConfig
  private state: DaemonState
  private listeners: DaemonEventListener[] = []
  private scheduleTimer: ReturnType<typeof setInterval> | null = null
  private isExecutingChapter = false

  constructor(config?: Partial<DaemonConfig>) {
    this.config = { ...DEFAULT_DAEMON_CONFIG, ...config }
    this.state = this.createInitialState()
    logger.info('DaemonService 已创建', {
      mode: this.config.mode,
      scheduleIntervalMs: this.config.scheduleIntervalMs,
      maxChaptersPerDay: this.config.maxChaptersPerDay,
    })
  }

  // ==========================================================================
  // 公共方法
  // ==========================================================================

  /**
   * 启动守护服务
   * 设置状态为 running，启动定时调度器
   */
  start(): void {
    if (this.state.status === 'running') {
      logger.warn('守护服务已在运行中，忽略重复启动请求')
      return
    }

    if (!this.config.enabled) {
      logger.warn('守护服务已禁用，无法启动')
      return
    }

    this.state = {
      ...this.state,
      status: 'running',
      lastError: undefined,
      scheduledNextRun: Date.now() + this.config.scheduleIntervalMs,
    }

    // 启动定时调度器
    this.scheduleTimer = setInterval(
      () => this.onScheduleTick(),
      this.config.scheduleIntervalMs,
    )

    this.emit({
      type: 'started',
      timestamp: Date.now(),
      state: { ...this.state },
    })

    logger.info('守护服务已启动', {
      下次调度时间: new Date(this.state.scheduledNextRun!).toISOString(),
      调度间隔: `${this.config.scheduleIntervalMs / 1000}秒`,
    })
  }

  /**
   * 停止守护服务
   * 清除定时器，设置状态为 stopped
   */
  stop(): void {
    if (this.state.status === 'stopped') {
      logger.warn('守护服务已停止，忽略重复停止请求')
      return
    }

    this.clearScheduleTimer()

    this.state = {
      ...this.state,
      status: 'stopped',
      scheduledNextRun: undefined,
    }

    this.emit({
      type: 'stopped',
      timestamp: Date.now(),
      state: { ...this.state },
    })

    logger.info('守护服务已停止')
  }

  /**
   * 暂停守护服务
   * 当前正在执行的章节会继续完成，之后进入暂停状态
   */
  pause(): void {
    if (this.state.status !== 'running') {
      logger.warn(`当前状态为 ${this.state.status}，无法暂停`)
      return
    }

    this.state = {
      ...this.state,
      status: 'paused',
      scheduledNextRun: undefined,
    }

    // 暂停时清除定时器，暂停后由 resume 恢复
    this.clearScheduleTimer()

    this.emit({
      type: 'paused',
      timestamp: Date.now(),
      state: { ...this.state },
    })

    logger.info('守护服务已暂停', {
      正在执行章节: this.isExecutingChapter ? '是（将等待当前章节完成）' : '否',
    })
  }

  /**
   * 从暂停状态恢复
   */
  resume(): void {
    if (this.state.status !== 'paused') {
      logger.warn(`当前状态为 ${this.state.status}，无法恢复`)
      return
    }

    this.state = {
      ...this.state,
      status: 'running',
      lastError: undefined,
      scheduledNextRun: Date.now() + this.config.scheduleIntervalMs,
    }

    // 恢复定时调度
    this.scheduleTimer = setInterval(
      () => this.onScheduleTick(),
      this.config.scheduleIntervalMs,
    )

    this.emit({
      type: 'resumed',
      timestamp: Date.now(),
      state: { ...this.state },
    })

    logger.info('守护服务已恢复运行')
  }

  /**
   * 获取当前守护服务状态（返回副本）
   */
  getState(): DaemonState {
    return { ...this.state }
  }

  /**
   * 更新守护服务配置
   * 注意：部分配置变更需要重启服务才能生效
   */
  updateConfig(config: Partial<DaemonConfig>): void {
    const prevInterval = this.config.scheduleIntervalMs
    this.config = { ...this.config, ...config }

    logger.info('守护服务配置已更新', config)

    // 如果调度间隔发生变化且服务正在运行，重启定时器
    if (
      config.scheduleIntervalMs !== undefined &&
      config.scheduleIntervalMs !== prevInterval &&
      this.state.status === 'running' &&
      this.scheduleTimer !== null
    ) {
      this.clearScheduleTimer()
      this.scheduleTimer = setInterval(
        () => this.onScheduleTick(),
        this.config.scheduleIntervalMs,
      )
      this.state = {
        ...this.state,
        scheduledNextRun: Date.now() + this.config.scheduleIntervalMs,
      }
      logger.info(`调度间隔已更新为 ${this.config.scheduleIntervalMs / 1000}秒`)
    }

    // 如果配置被禁用，自动停止服务
    if (config.enabled === false && this.state.status === 'running') {
      this.stop()
    }
  }

  /**
   * 订阅守护服务事件
   * @returns 取消订阅函数
   */
  onEvent(listener: DaemonEventListener): () => void {
    this.listeners.push(listener)
    logger.debug(`已注册事件监听器，当前监听器数量: ${this.listeners.length}`)

    return () => {
      const index = this.listeners.indexOf(listener)
      if (index !== -1) {
        this.listeners.splice(index, 1)
        logger.debug(`已注销事件监听器，当前监听器数量: ${this.listeners.length}`)
      }
    }
  }

  /**
   * 重置每日计数器
   * 通常在午夜或新的一天开始时调用
   */
  resetDailyCounters(): void {
    const prevChapters = this.state.chaptersCompletedToday
    const prevTokens = this.state.tokensUsedToday

    this.state = {
      ...this.state,
      chaptersCompletedToday: 0,
      tokensUsedToday: 0,
    }

    logger.info('每日计数器已重置', {
      重置前章节数: prevChapters,
      重置前Token数: prevTokens,
    })

    // 如果之前因达到每日限额而暂停，且当前状态是 paused，可以考虑自动恢复
    // 这里不自动恢复，由调用方决定
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 创建初始状态
   */
  private createInitialState(): DaemonState {
    return {
      status: 'idle',
      chaptersCompletedToday: 0,
      tokensUsedToday: 0,
      lastRunTimestamp: 0,
      consecutiveFailures: 0,
    }
  }

  /**
   * 清除调度定时器
   */
  private clearScheduleTimer(): void {
    if (this.scheduleTimer !== null) {
      clearInterval(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  /**
   * 调度定时回调
   * 每次调度间隔触发时执行
   */
  private async onScheduleTick(): Promise<void> {
    logger.debug('调度定时器触发', {
      当前状态: this.state.status,
      正在执行章节: this.isExecutingChapter,
    })

    // 只在运行状态下处理调度
    if (this.state.status !== 'running') {
      logger.debug(`当前状态为 ${this.state.status}，跳过调度`)
      return
    }

    // 如果正在执行章节，跳过本次调度
    if (this.isExecutingChapter) {
      logger.debug('当前正在执行章节，跳过本次调度')
      return
    }

    // 更新下次调度时间
    this.updateState({
      scheduledNextRun: Date.now() + this.config.scheduleIntervalMs,
    })

    this.emit({
      type: 'schedule-tick',
      timestamp: Date.now(),
      state: { ...this.state },
    })

    // 检查安全门控
    const gateCheck = this.checkSafetyGates()
    if (!gateCheck.allowed) {
      logger.warn(`安全门控未通过: ${gateCheck.reason}`)
      return
    }

    // 执行章节生成
    try {
      await this.executeChapter()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('调度执行章节时发生未捕获异常', { 错误: errorMessage })
      this.handleChapterFailure(undefined, errorMessage)
    }
  }

  /**
   * 执行单个章节的 Pipeline
   * 通过动态 import 加载 PipelineRunner 和项目存储，避免循环依赖
   */
  private async executeChapter(): Promise<ChapterPipelineResult | null> {
    if (this.isExecutingChapter) {
      logger.warn('已有章节正在执行，跳过重复请求')
      return null
    }

    this.isExecutingChapter = true
    const startTime = Date.now()
    let lockedProjectId: string | null = null

    try {
      // 动态导入项目存储，获取当前项目和确定下一章节号
      const { useProjectStore } = await import('@/stores/project')
      const projectStore = useProjectStore()
      const project = projectStore.currentProject

      if (!project) {
        logger.error('未找到当前项目，无法执行章节生成')
        this.handleChapterFailure(undefined, '未找到当前项目')
        return null
      }

      // 获取项目锁，防止与一键续写并发
      lockedProjectId = project.id
      if (!acquireProjectLock(lockedProjectId, 'daemon')) {
        const conflictMsg = getLockConflictMessage(lockedProjectId)
        logger.warn(`[Daemon] 锁冲突，跳过本轮: ${conflictMsg}`)
        return null
      }

      // 确定下一章节号
      const chapterNumber = this.determineNextChapter(project)
      if (chapterNumber === null) {
        logger.info('所有章节已完成，守护服务无需继续执行')
        return null
      }

      logger.info(`开始执行第 ${chapterNumber} 章生成`, {
        已完成章节: this.state.chaptersCompletedToday,
        已用Token: this.state.tokensUsedToday,
      })

      this.updateState({ currentChapter: chapterNumber })

      this.emit({
        type: 'chapter-start',
        timestamp: Date.now(),
        chapterNumber,
        state: { ...this.state },
      })

      // 动态导入 PipelineRunner 和 BatchContinueScheduler
      const { PipelineRunner } = await import('@/services/pipeline/PipelineRunner')
      const { BatchContinueScheduler } = await import('@/services/pipeline/BatchContinueScheduler')

      // 构建 Pipeline 配置
      const pipelineConfig: Partial<PipelineConfig> = {
        ...this.config.pipelineConfig,
      }

      // 创建 PipelineRunner 实例并执行单章
      const runner = new PipelineRunner(pipelineConfig)

      // 获取章节大纲（如果有）
      const chapterOutline = project.outline?.chapters?.[chapterNumber - 1]

      // 获取上一章结尾摘要（用于衔接）
      const previousEndingExcerpt = await this.getPreviousEndingExcerpt(projectStore, chapterNumber)

      // 构建执行选项
      const options: import('@/services/pipeline/types').WriteNextChapterOptions = {
        project,
        chapterNumber,
        chapterOutline,
        externalContext: previousEndingExcerpt,
      }

      // 执行 Pipeline
      const result = await runner.writeNextChapter(options)

      // 更新计数器
      const tokenUsage = result.tokenUsage.total.totalTokens
      this.state = {
        ...this.state,
        chaptersCompletedToday: this.state.chaptersCompletedToday + 1,
        tokensUsedToday: this.state.tokensUsedToday + tokenUsage,
        lastRunTimestamp: Date.now(),
        consecutiveFailures: 0,
        currentChapter: undefined,
      }

      // 保存章节结果到项目存储
      await this.saveChapterResult(projectStore, result)

      this.emit({
        type: 'chapter-complete',
        timestamp: Date.now(),
        chapterNumber,
        chapterResult: result,
        state: { ...this.state },
      })

      const duration = Date.now() - startTime
      logger.info(`第 ${chapterNumber} 章生成完成`, {
        耗时: `${(duration / 1000).toFixed(1)}秒`,
        字数: result.wordCount,
        本次Token: tokenUsage,
        今日已完成: this.state.chaptersCompletedToday,
        今日Token总计: this.state.tokensUsedToday,
      })

      // 章间冷却
      if (this.config.cooldownBetweenChaptersMs > 0) {
        logger.debug(`章间冷却 ${this.config.cooldownBetweenChaptersMs}ms`)
        await this.delay(this.config.cooldownBetweenChaptersMs)
      }

      // 检查是否需要自动继续下一章（仅 auto 模式）
      if (this.config.mode === 'auto') {
        const nextGateCheck = this.checkSafetyGates()
        if (nextGateCheck.allowed) {
          logger.debug('安全门控通过，自动继续下一章')
          // 递归调用执行下一章（但在调度框架内，避免无限递归）
          // 实际上由下一次调度间隔触发
        }
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('章节执行失败', {
        错误: errorMessage,
        堆栈: error instanceof Error ? error.stack : undefined,
      })
      this.handleChapterFailure(this.state.currentChapter, errorMessage)
      return null
    } finally {
      this.isExecutingChapter = false
      if (lockedProjectId) {
        releaseProjectLock(lockedProjectId, 'daemon')
      }
    }
  }

  /**
   * 检查安全门控
   * 在执行章节前检查是否满足所有安全条件
   */
  private checkSafetyGates(): { allowed: boolean; reason?: string } {
    // 检查每日章节上限
    if (this.state.chaptersCompletedToday >= this.config.maxChaptersPerDay) {
      this.emitDailyLimitReached('章节')
      return {
        allowed: false,
        reason: `已达到每日章节上限 (${this.config.maxChaptersPerDay})`,
      }
    }

    // 检查每日 Token 上限
    if (this.state.tokensUsedToday >= this.config.maxTokenPerDay) {
      this.emitDailyLimitReached('Token')
      return {
        allowed: false,
        reason: `已达到每日 Token 上限 (${this.config.maxTokenPerDay})`,
      }
    }

    // 检查每日费用上限（基于 Token 估算费用）
    const estimatedCostUSD = this.estimateCostUSD(this.state.tokensUsedToday)
    if (estimatedCostUSD >= this.config.maxCostPerDayUSD) {
      this.emitDailyLimitReached('费用')
      return {
        allowed: false,
        reason: `已达到每日费用上限 ($${this.config.maxCostPerDayUSD})`,
      }
    }

    // 检查连续失败次数
    if (this.state.consecutiveFailures >= this.config.consecutiveFailureThreshold) {
      // 自动暂停
      if (this.state.status === 'running') {
        this.pause()
      }
      return {
        allowed: false,
        reason: `连续失败次数 (${this.state.consecutiveFailures}) 达到阈值 (${this.config.consecutiveFailureThreshold})，已自动暂停`,
      }
    }

    // 检查单次会话最大章节数
    if (this.state.chaptersCompletedToday >= this.config.maxChaptersPerSession) {
      return {
        allowed: false,
        reason: `已达到单次会话最大章节数 (${this.config.maxChaptersPerSession})`,
      }
    }

    return { allowed: true }
  }

  /**
   * 发送事件到所有监听器
   */
  private emit(event: DaemonEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        logger.error('事件监听器执行异常', {
          事件类型: event.type,
          错误: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /**
   * 更新状态并触发状态变更事件
   */
  private updateState(updates: Partial<DaemonState>): void {
    this.state = { ...this.state, ...updates }
  }

  /**
   * 处理章节生成失败
   */
  private handleChapterFailure(chapterNumber: number | undefined, errorMessage: string): void {
    this.state = {
      ...this.state,
      consecutiveFailures: this.state.consecutiveFailures + 1,
      lastError: errorMessage,
      lastRunTimestamp: Date.now(),
      currentChapter: undefined,
    }

    this.emit({
      type: 'chapter-failed',
      timestamp: Date.now(),
      chapterNumber,
      error: errorMessage,
      state: { ...this.state },
    })

    logger.error('章节执行失败', {
      章节号: chapterNumber,
      错误: errorMessage,
      连续失败: this.state.consecutiveFailures,
      失败阈值: this.config.consecutiveFailureThreshold,
    })

    // 检查是否需要因连续失败而自动暂停
    if (this.state.consecutiveFailures >= this.config.consecutiveFailureThreshold) {
      logger.warn(
        `连续失败次数 (${this.state.consecutiveFailures}) 达到阈值 (${this.config.consecutiveFailureThreshold})，自动暂停守护服务`,
      )
      if (this.state.status === 'running') {
        this.pause()
      }

      this.emit({
        type: 'error',
        timestamp: Date.now(),
        error: `连续失败次数过多，已自动暂停: ${errorMessage}`,
        state: { ...this.state },
      })
    }
  }

  /**
   * 发送每日限额达到事件
   */
  private emitDailyLimitReached(limitType: string): void {
    logger.warn(`每日${limitType}限额已达到`)

    this.emit({
      type: 'daily-limit-reached',
      timestamp: Date.now(),
      error: `每日${limitType}限额已达到`,
      state: { ...this.state },
    })
  }

  /**
   * 确定下一个需要生成的章节号
   * 查找项目中尚未生成内容的章节
   */
  private determineNextChapter(project: any): number | null {
    // 从章节大纲中查找第一个未完成的章节
    const chapters = project.outline?.chapters
    if (!chapters || chapters.length === 0) {
      logger.warn('项目没有章节大纲，无法确定下一章节')
      return null
    }

    // 查找项目中已有的章节内容
    const existingChapters = project.chapters || []
    const existingNumbers = new Set(
      existingChapters
        .filter((ch: any) => ch.content && ch.content.trim().length > 0)
        .map((ch: any) => ch.number ?? ch.chapterNumber),
    )

    // 从大纲中找到第一个没有对应内容的章节
    for (let i = 0; i < chapters.length; i++) {
      const chapterNum = i + 1
      if (!existingNumbers.has(chapterNum)) {
        return chapterNum
      }
    }

    // 所有章节都已完成
    return null
  }

  /**
   * 获取上一章的结尾摘录，用于章节衔接
   */
  private async getPreviousEndingExcerpt(
    projectStore: any,
    currentChapter: number,
  ): Promise<string | undefined> {
    try {
      if (currentChapter <= 1) return undefined

      const chapters = projectStore.project?.chapters || []
      const prevChapter = chapters.find(
        (ch: any) => (ch.number ?? ch.chapterNumber) === currentChapter - 1,
      )

      if (!prevChapter?.content) return undefined

      // 取上一章最后 500 字符作为衔接上下文
      const content = prevChapter.content
      const excerptLength = Math.min(500, content.length)
      return content.slice(-excerptLength)
    } catch (error) {
      logger.warn('获取上一章结尾摘录失败', {
        章节号: currentChapter,
        错误: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  /**
   * 保存章节生成结果到项目存储
   */
  private async saveChapterResult(
    projectStore: any,
    result: ChapterPipelineResult,
  ): Promise<void> {
    try {
      // 动态导入项目存储的 action 来保存章节
      const projectActions = projectStore

      if (typeof projectActions.saveChapter === 'function') {
        await projectActions.saveChapter(result.chapterNumber, {
          number: result.chapterNumber,
          title: result.title,
          content: result.content,
          wordCount: result.wordCount,
          status: result.status,
          auditResult: result.auditResult,
          tokenUsage: result.tokenUsage,
          durationMs: result.durationMs,
        })
        logger.info(`第 ${result.chapterNumber} 章已保存到项目存储`)
      } else if (typeof projectActions.updateChapter === 'function') {
        await projectActions.updateChapter(result.chapterNumber, {
          title: result.title,
          content: result.content,
          wordCount: result.wordCount,
          status: result.status,
        })
        logger.info(`第 ${result.chapterNumber} 章已更新到项目存储`)
      } else {
        logger.warn('项目存储未找到保存/更新章节的方法，章节结果未持久化')
      }
    } catch (error) {
      logger.error('保存章节结果失败', {
        章节号: result.chapterNumber,
        错误: error instanceof Error ? error.message : String(error),
      })
      // 保存失败不影响主流程，仅记录日志
    }
  }

  /**
   * 基于 Token 使用量估算费用（美元）
   * 使用简化的估算模型：约 $0.002 / 1K tokens（混合输入输出）
   */
  private estimateCostUSD(tokens: number): number {
    const costPerThousandTokens = 0.002
    return (tokens / 1000) * costPerThousandTokens
  }

  /**
   * 延迟执行
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
