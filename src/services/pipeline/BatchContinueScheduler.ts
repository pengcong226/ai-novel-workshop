/**
 * BatchContinueScheduler — 批量续写调度器
 *
 * 编排多章节生成，支持暂停/恢复/取消，
 * 提供进度事件、检查点、Token 预算控制和每日限额。
 */

import { PipelineRunner } from './PipelineRunner'
import { CheckpointManager } from './checkpointManager'
import type {
  PipelineConfig,
  ChapterPipelineResult,
  WriteNextChapterOptions,
  TokenUsageSummary,
} from './types'
import { emptyTokenUsageSummary } from './types'
import { getLogger } from '@/utils/logger'
import { acquireProjectLock, releaseProjectLock, getLockConflictMessage } from '@/utils/pipelineLock'

const logger = getLogger('pipeline:batch-scheduler')

// ============================================================================
// 接口定义
// ============================================================================

export interface ContinueWritingOptions {
  /** 生成章节数量（1-100） */
  chapterCount: number
  /** 可选的方向引导提示 */
  directionPrompt?: string
  /** 检查点间隔（0 = 不设置检查点） */
  checkpointInterval?: number
  /** 是否自动保存（默认 true） */
  autoSave: boolean
  /** 章节完成回调 */
  onChapterComplete?: (result: ChapterPipelineResult, index: number) => Promise<void>
  /** 检查点回调（返回 false 停止） */
  onCheckpoint?: (completedResults: ChapterPipelineResult[]) => Promise<boolean>
  /** 进度事件回调 */
  onProgress?: (event: PipelineProgressEvent) => void
  /** 错误回调 */
  onError?: (chapterNumber: number, error: Error) => void
}

export interface PipelineProgressEvent {
  type: 'stage-start' | 'stage-complete' | 'chapter-start' | 'chapter-complete' | 'batch-complete' | 'batch-paused' | 'batch-cancelled' | 'error'
  chapterNumber: number
  stage?: string
  stageDetail?: string
  progress: number
  chapterIndex?: number
  totalChapters?: number
  auditScore?: number
  wordCount?: number
  currentTokenUsage?: number
  totalTokenUsage?: number
  error?: string
}

export interface BatchBudgetConfig {
  /** 每章最大 Token 数（默认 150000） */
  maxTokenPerChapter: number
  /** 总最大 Token 数（默认 5000000） */
  maxTotalTokens: number
  /** 预警阈值（默认 0.8） */
  alertThreshold: number
}

export interface BatchContinueResult {
  results: ChapterPipelineResult[]
  totalChapters: number
  completedChapters: number
  failedChapters: number
  totalTokenUsage: number
  totalDurationMs: number
  cancelled: boolean
}

// ============================================================================
// 默认预算配置
// ============================================================================

const DEFAULT_BUDGET_CONFIG: BatchBudgetConfig = {
  maxTokenPerChapter: 150000,
  maxTotalTokens: 5000000,
  alertThreshold: 0.8,
}

// ============================================================================
// BatchContinueScheduler
// ============================================================================

export class BatchContinueScheduler {
  private pipeline: PipelineRunner
  private currentRunId: number = 0
  private paused: boolean = false
  private pauseResolver?: () => void
  private budgetConfig: BatchBudgetConfig
  private totalTokensUsed: number = 0
  private dailyChapterCount: number = 0
  private readonly MAX_CHAPTERS_PER_DAY = 50
  private readonly COOLDOWN_MS = 2000
  private readonly MAX_RETRIES_PER_CHAPTER = 2
  private RETRY_DELAY_MS = 5000
  private readonly PAUSE_AFTER_CONSECUTIVE_FAILURES = 3

  constructor(pipeline?: PipelineRunner, budgetConfig?: Partial<BatchBudgetConfig>, options?: { retryDelayMs?: number }) {
    this.pipeline = pipeline || new PipelineRunner()
    this.budgetConfig = { ...DEFAULT_BUDGET_CONFIG, ...budgetConfig }
    if (options?.retryDelayMs !== undefined) {
      this.RETRY_DELAY_MS = options.retryDelayMs
    }
    logger.info('[BatchScheduler] 批量续写调度器初始化完成', {
      budget: this.budgetConfig,
      maxChaptersPerDay: this.MAX_CHAPTERS_PER_DAY,
    })
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  /**
   * 执行批量续写
   */
  async executeBatchContinue(
    project: any,
    startChapter: number,
    options: ContinueWritingOptions,
    pipelineConfig?: Partial<PipelineConfig>
  ): Promise<BatchContinueResult> {
    const runId = ++this.currentRunId
    const batchStartTime = performance.now()
    const results: ChapterPipelineResult[] = []
    let failedChapters = 0
    let cancelled = false
    let consecutiveFailures = 0

    // 参数校验
    const chapterCount = Math.max(1, Math.min(100, options.chapterCount))
    const checkpointInterval = options.checkpointInterval ?? 0

    logger.info(`[BatchScheduler] ====== 开始批量续写 ======`)
    logger.info(`[BatchScheduler] 起始章节: ${startChapter}, 数量: ${chapterCount}, 运行ID: ${runId}`)

    // 获取项目锁，防止并发
    const projectId = project?.id || 'unknown'
    if (!acquireProjectLock(projectId, 'batch-continue', startChapter)) {
      const conflictMsg = getLockConflictMessage(projectId)
      logger.warn(`[BatchScheduler] 锁冲突，无法启动: ${conflictMsg}`)
      throw new Error(conflictMsg || '项目正在被其他任务使用，请稍后再试')
    }

    this.emitProgress(options.onProgress, {
      type: 'chapter-start',
      chapterNumber: startChapter,
      progress: 0,
      chapterIndex: 0,
      totalChapters: chapterCount,
      totalTokenUsage: this.totalTokensUsed,
    })

    try {
      for (let i = 0; i < chapterCount; i++) {
        // 检查是否已取消
        if (this.isRunCancelled(runId)) {
          logger.info(`[BatchScheduler] 批量续写已取消（运行ID: ${runId}）`)
          cancelled = true
          this.emitProgress(options.onProgress, {
            type: 'batch-cancelled',
            chapterNumber: startChapter + i,
            progress: this.calculateProgress(i, chapterCount),
            chapterIndex: i,
            totalChapters: chapterCount,
            totalTokenUsage: this.totalTokensUsed,
          })
          break
        }

        // 等待暂停恢复
        await this.waitIfPaused(runId)
        if (this.isRunCancelled(runId)) {
          cancelled = true
          break
        }

        // 检查每日限额
        if (this.dailyChapterCount >= this.MAX_CHAPTERS_PER_DAY) {
          logger.warn(`[BatchScheduler] 已达到每日限额（${this.MAX_CHAPTERS_PER_DAY}章），停止批量续写`)
          this.emitProgress(options.onProgress, {
            type: 'batch-paused',
            chapterNumber: startChapter + i,
            progress: this.calculateProgress(i, chapterCount),
            chapterIndex: i,
            totalChapters: chapterCount,
            totalTokenUsage: this.totalTokensUsed,
            error: '已达到每日限额',
          })
          break
        }

        const chapterNumber = startChapter + i
        let result: ChapterPipelineResult | null = null
        let retries = 0
        let success = false

        // 带重试的章节生成
        while (retries <= this.MAX_RETRIES_PER_CHAPTER && !success) {
          try {
            if (retries > 0) {
              logger.info(`[BatchScheduler] 第${chapterNumber}章重试第${retries}次（共${this.MAX_RETRIES_PER_CHAPTER}次）`)
              await this.cooldown(this.RETRY_DELAY_MS)
            }

            // 发送章节开始事件
            this.emitProgress(options.onProgress, {
              type: 'chapter-start',
              chapterNumber,
              progress: this.calculateProgress(i, chapterCount),
              chapterIndex: i,
              totalChapters: chapterCount,
              totalTokenUsage: this.totalTokensUsed,
            })

            // 配置流水线进度回调
            const pipelineOptions: WriteNextChapterOptions = {
              project,
              chapterNumber,
            }

            const configWithCallbacks: Partial<PipelineConfig> = {
              ...pipelineConfig,
              onStageProgress: (stage: string, detail: string) => {
                this.emitProgress(options.onProgress, {
                  type: 'stage-start',
                  chapterNumber,
                  stage,
                  stageDetail: detail,
                  progress: this.calculateProgress(i, chapterCount),
                  chapterIndex: i,
                  totalChapters: chapterCount,
                  totalTokenUsage: this.totalTokensUsed,
                })
              },
            }

            // 设置流水线配置并执行
            this.pipeline.updateConfig(configWithCallbacks)
            result = await this.pipeline.writeNextChapter(pipelineOptions)

            // 检查预算
            const chapterTokens = result.tokenUsage.total.totalTokens
            const budgetCheck = this.checkBudget(chapterTokens)
            if (!budgetCheck.allowed) {
              logger.warn(`[BatchScheduler] 预算超限: ${budgetCheck.reason}`)
              this.emitProgress(options.onProgress, {
                type: 'batch-paused',
                chapterNumber,
                progress: this.calculateProgress(i, chapterCount),
                chapterIndex: i,
                totalChapters: chapterCount,
                totalTokenUsage: this.totalTokensUsed,
                error: budgetCheck.reason,
              })
              break
            }

            // 更新 Token 统计
            this.totalTokensUsed += chapterTokens
            this.dailyChapterCount++
            consecutiveFailures = 0
            success = true

            // 发送章节完成事件
            this.emitProgress(options.onProgress, {
              type: 'chapter-complete',
              chapterNumber,
              progress: this.calculateProgress(i + 1, chapterCount),
              chapterIndex: i,
              totalChapters: chapterCount,
              auditScore: result.auditResult.overallScore,
              wordCount: result.wordCount,
              currentTokenUsage: chapterTokens,
              totalTokenUsage: this.totalTokensUsed,
            })

            // 调用章节完成回调
            if (options.onChapterComplete) {
              await options.onChapterComplete(result, i)
            }

            results.push(result)

            // 持久化断点到 IndexedDB，确保刷新后可恢复
            try {
              await CheckpointManager.saveCheckpoint({
                projectId: project.id,
                startChapter,
                targetCount: chapterCount,
                completedChapters: results.map(r => r.chapterNumber),
                lastCompletedChapter: chapterNumber,
                directionPrompt: options.directionPrompt,
                checkpointInterval,
                autoSave: options.autoSave,
                timestamp: Date.now(),
                totalTokensUsed: this.totalTokensUsed,
              })
            } catch (cpError) {
              logger.warn('[BatchScheduler] 断点持久化失败（不阻断续写）:', cpError)
            }

          } catch (error) {
            retries++
            consecutiveFailures++
            const errorMsg = error instanceof Error ? error.message : String(error)
            logger.error(`[BatchScheduler] 第${chapterNumber}章生成失败（第${retries}次）: ${errorMsg}`)

            this.emitProgress(options.onProgress, {
              type: 'error',
              chapterNumber,
              progress: this.calculateProgress(i, chapterCount),
              chapterIndex: i,
              totalChapters: chapterCount,
              error: errorMsg,
            })

            if (options.onError) {
              options.onError(chapterNumber, error instanceof Error ? error : new Error(errorMsg))
            }

            // 连续失败自动暂停
            if (consecutiveFailures >= this.PAUSE_AFTER_CONSECUTIVE_FAILURES) {
              logger.warn(`[BatchScheduler] 连续${consecutiveFailures}章失败，自动暂停`)
              this.paused = true
              this.emitProgress(options.onProgress, {
                type: 'batch-paused',
                chapterNumber,
                progress: this.calculateProgress(i, chapterCount),
                chapterIndex: i,
                totalChapters: chapterCount,
                totalTokenUsage: this.totalTokensUsed,
                error: `连续${consecutiveFailures}章失败，已自动暂停`,
              })
              await this.waitIfPaused(runId)
              consecutiveFailures = 0
            }

            if (retries > this.MAX_RETRIES_PER_CHAPTER) {
              logger.error(`[BatchScheduler] 第${chapterNumber}章重试耗尽，跳过`)
              failedChapters++
              // 创建失败结果
              const failedResult: ChapterPipelineResult = {
                chapterNumber,
                title: `第${chapterNumber}章`,
                wordCount: 0,
                content: '',
                auditResult: {
                  passed: false,
                  overallScore: 0,
                  issues: [{
                    severity: 'critical',
                    category: 'batch-scheduler',
                    description: `重试${this.MAX_RETRIES_PER_CHAPTER}次后仍然失败: ${errorMsg}`,
                    suggestion: '请检查AI服务配置或网络连接',
                  }],
                  summary: '批量续写失败',
                  dimensionScores: {},
                  tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                },
                revised: false,
                postReviseCount: 0,
                status: 'audit-failed',
                tokenUsage: emptyTokenUsageSummary(),
                durationMs: 0,
                stageTimings: {},
              }
              results.push(failedResult)
            }
          }
        }

        // 检查点回调
        if (success && checkpointInterval > 0 && (i + 1) % checkpointInterval === 0) {
          logger.info(`[BatchScheduler] 达到检查点（每${checkpointInterval}章），已生成${results.length}章`)
          if (options.onCheckpoint) {
            const shouldContinue = await options.onCheckpoint([...results])
            if (!shouldContinue) {
              logger.info('[BatchScheduler] 检查点回调返回 false，停止批量续写')
              break
            }
          }
        }

        // 章节间冷却
        if (i < chapterCount - 1 && !this.isRunCancelled(runId)) {
          await this.cooldown(this.COOLDOWN_MS)
        }
      }

      // 发送批量完成事件
      if (!cancelled) {
        this.emitProgress(options.onProgress, {
          type: 'batch-complete',
          chapterNumber: startChapter + chapterCount - 1,
          progress: 100,
          chapterIndex: chapterCount - 1,
          totalChapters: chapterCount,
          totalTokenUsage: this.totalTokensUsed,
        })
      }

      const totalDurationMs = Math.round(performance.now() - batchStartTime)

      logger.info(`[BatchScheduler] ====== 批量续写完成 ======`)
      logger.info(`[BatchScheduler] 总章节: ${chapterCount}, 完成: ${results.length}, 失败: ${failedChapters}`)
      logger.info(`[BatchScheduler] Token消耗: ${this.totalTokensUsed}, 耗时: ${totalDurationMs}ms`)

      return {
        results,
        totalChapters: chapterCount,
        completedChapters: results.length - failedChapters,
        failedChapters,
        totalTokenUsage: this.totalTokensUsed,
        totalDurationMs,
        cancelled,
      }

    } catch (error) {
      const totalDurationMs = Math.round(performance.now() - batchStartTime)
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error(`[BatchScheduler] 批量续写异常终止: ${errorMsg}`)

      this.emitProgress(options.onProgress, {
        type: 'error',
        chapterNumber: startChapter,
        progress: this.calculateProgress(results.length, chapterCount),
        error: errorMsg,
      })

      return {
        results,
        totalChapters: chapterCount,
        completedChapters: results.length - failedChapters,
        failedChapters,
        totalTokenUsage: this.totalTokensUsed,
        totalDurationMs,
        cancelled: false,
      }
    } finally {
      releaseProjectLock(projectId, 'batch-continue')
    }
  }

  /**
   * 暂停批量续写（当前章节完成后暂停）
   */
  pause(): void {
    if (!this.paused) {
      this.paused = true
      logger.info('[BatchScheduler] 批量续写已暂停')
    }
  }

  /**
   * 恢复批量续写
   */
  resume(): void {
    if (this.paused) {
      this.paused = false
      if (this.pauseResolver) {
        this.pauseResolver()
        this.pauseResolver = undefined
      }
      logger.info('[BatchScheduler] 批量续写已恢复')
    }
  }

  /**
   * 取消批量续写
   */
  cancel(): void {
    this.currentRunId++
    this.paused = false
    if (this.pauseResolver) {
      this.pauseResolver()
      this.pauseResolver = undefined
    }
    logger.info('[BatchScheduler] 批量续写已取消')
  }

  /**
   * 检查是否正在运行
   */
  isRunning(): boolean {
    return this.currentRunId > 0 && !this.paused
  }

  /**
   * 检查是否已暂停
   */
  isPaused(): boolean {
    return this.paused
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 等待暂停恢复（带安全超时）
   */
  private async waitIfPaused(runId: number): Promise<void> {
    if (!this.paused || this.isRunCancelled(runId)) {
      return
    }

    logger.info('[BatchScheduler] 等待恢复...')

    return new Promise<void>((resolve) => {
      this.pauseResolver = resolve

      // 安全超时：1秒后自动恢复（防止死锁）
      const safetyTimeout = setTimeout(() => {
        if (this.paused) {
          logger.warn('[BatchScheduler] 安全超时触发，自动恢复')
          this.paused = false
          this.pauseResolver = undefined
          resolve()
        }
      }, 1000)

      // 清理超时（如果正常恢复）
      const originalResolver = this.pauseResolver
      this.pauseResolver = () => {
        clearTimeout(safetyTimeout)
        originalResolver()
        resolve()
      }
    })
  }

  /**
   * 检查运行是否已取消
   */
  private isRunCancelled(runId: number): boolean {
    return runId !== this.currentRunId
  }

  /**
   * 检查预算限制
   */
  private checkBudget(chapterTokens: number): { allowed: boolean; reason?: string } {
    // 检查单章预算
    if (chapterTokens > this.budgetConfig.maxTokenPerChapter) {
      return {
        allowed: false,
        reason: `单章Token超限: ${chapterTokens} > ${this.budgetConfig.maxTokenPerChapter}`,
      }
    }

    // 检查总预算
    const projectedTotal = this.totalTokensUsed + chapterTokens
    if (projectedTotal > this.budgetConfig.maxTotalTokens) {
      return {
        allowed: false,
        reason: `总Token将超限: ${projectedTotal} > ${this.budgetConfig.maxTotalTokens}`,
      }
    }

    // 预警阈值
    const usageRatio = projectedTotal / this.budgetConfig.maxTotalTokens
    if (usageRatio >= this.budgetConfig.alertThreshold) {
      logger.warn(`[BatchScheduler] Token使用预警: ${(usageRatio * 100).toFixed(1)}%`)
    }

    return { allowed: true }
  }

  /**
   * 冷却等待
   */
  private async cooldown(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 计算进度百分比
   */
  private calculateProgress(completed: number, total: number): number {
    if (total === 0) return 0
    return Math.round((completed / total) * 100)
  }

  /**
   * 发送进度事件
   */
  private emitProgress(
    callback: ((event: PipelineProgressEvent) => void) | undefined,
    event: PipelineProgressEvent
  ): void {
    if (callback) {
      try {
        callback(event)
      } catch (error) {
        logger.error('[BatchScheduler] 进度回调异常:', error)
      }
    }
  }
}