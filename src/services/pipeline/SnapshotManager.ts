/**
 * 快照管理器 (Snapshot Manager)
 *
 * 管理章节在审计-修订周期中的内容版本快照。
 * 支持追踪最佳版本、判断改进趋势、决定何时停止迭代，
 * 以及在最佳版本与最新版本之间进行回滚选择。
 *
 * @module services/pipeline/SnapshotManager
 */

import type { ReviewSnapshot, AuditResult } from '@/services/pipeline/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('pipeline:snapshot-manager')

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 两个快照之间的比较结果
 */
export interface SnapshotComparison {
  /** 起始快照索引 */
  from: number
  /** 目标快照索引 */
  to: number
  /** 分数差值（正数表示提升） */
  scoreDelta: number
  /** 字数差值 */
  wordCountDelta: number
  /** 是否有改进 */
  improved: boolean
}

/**
 * 快照进度报告
 */
export interface SnapshotReport {
  /** 总快照数 */
  totalSnapshots: number
  /** 最佳快照索引 */
  bestSnapshotIndex: number
  /** 最佳分数 */
  bestScore: number
  /** 最低分数 */
  worstScore: number
  /** 按顺序排列的分数序列 */
  scoreProgression: number[]
  /** 每个快照与前一个的比较结果 */
  comparisons: SnapshotComparison[]
  /** 快照详情列表 */
  snapshots?: Array<{ iteration?: number; score: number; wordCount: number }>
}

// ============================================================================
// 快照管理器
// ============================================================================

/**
 * 快照管理器
 *
 * 管理单个章节在审计-修订周期中的所有 ReviewSnapshot 对象。
 * 核心职责：
 * 1. 追踪每次审计-修订迭代产生的快照
 * 2. 识别最佳版本（最高分，同分取较晚版本）
 * 3. 判断迭代是否应继续或停止
 * 4. 选择最终输出内容（可能回滚到最佳版本）
 */
export class SnapshotManager {
  /** 快照列表 */
  private snapshots: ReviewSnapshot[]

  /** 净改进阈值 epsilon，低于此值视为无实质改进 */
  private readonly netImprovementEpsilon: number

  /**
   * 创建快照管理器实例
   * @param epsilon - 净改进阈值，默认为 3 分。只有改进超过此阈值才视为有效改进
   */
  constructor(epsilon?: number) {
    this.snapshots = []
    this.netImprovementEpsilon = epsilon ?? 3
    logger.info(`快照管理器已初始化，净改进阈值: ${this.netImprovementEpsilon}`)
  }

  // --------------------------------------------------------------------------
  // 快照操作
  // --------------------------------------------------------------------------

  /**
   * 添加一个新快照
   *
   * @param snapshot - 要添加的审查快照
   * @returns 新快照在列表中的索引
   */
  addSnapshot(snapshot: ReviewSnapshot): number {
    this.snapshots.push(snapshot)
    const index = this.snapshots.length - 1
    logger.info(
      `添加快照 [${index}]：分数=${snapshot.score}, 字数=${snapshot.wordCount}, ` +
      `问题数=${snapshot.auditResult.issues.length}, 通过=${snapshot.auditResult.passed}`
    )
    return index
  }

  /**
   * 获取最佳快照（最高分，同分取较晚版本）
   *
   * @returns 最佳快照，如果没有任何快照则返回 null
   */
  getBestSnapshot(): ReviewSnapshot | null {
    if (this.snapshots.length === 0) {
      return null
    }

    let bestIndex = 0
    let bestScore = this.snapshots[0].score

    for (let i = 1; i < this.snapshots.length; i++) {
      const currentScore = this.snapshots[i].score
      // 同分时取较晚版本（>= 保证后面的优先）
      if (currentScore >= bestScore) {
        bestScore = currentScore
        bestIndex = i
      }
    }

    logger.debug(`最佳快照索引: [${bestIndex}], 分数: ${bestScore}`)
    return this.snapshots[bestIndex]
  }

  /**
   * 获取最佳快照的索引
   *
   * @returns 最佳快照索引，如果没有任何快照则返回 -1
   */
  private getBestSnapshotIndex(): number {
    if (this.snapshots.length === 0) {
      return -1
    }

    let bestIndex = 0
    let bestScore = this.snapshots[0].score

    for (let i = 1; i < this.snapshots.length; i++) {
      const currentScore = this.snapshots[i].score
      if (currentScore >= bestScore) {
        bestScore = currentScore
        bestIndex = i
      }
    }

    return bestIndex
  }

  /**
   * 获取最新快照
   *
   * @returns 最新的审查快照，如果没有任何快照则返回 null
   */
  getLatestSnapshot(): ReviewSnapshot | null {
    if (this.snapshots.length === 0) {
      return null
    }
    return this.snapshots[this.snapshots.length - 1]
  }

  // --------------------------------------------------------------------------
  // 判断逻辑
  // --------------------------------------------------------------------------

  /**
   * 检查最新修订是否相对之前的最佳版本有净改进
   *
   * 判断逻辑：最新快照的分数是否比前一个最佳快照高出至少 epsilon 分。
   * 如果只有一个快照（初始草稿），则视为无净改进。
   *
   * @returns 如果有净改进返回 true，否则返回 false
   */
  hasNetImprovement(): boolean {
    if (this.snapshots.length <= 1) {
      // 只有一个快照（初始草稿），无法比较
      return false
    }

    const latestIndex = this.snapshots.length - 1
    const latestScore = this.snapshots[latestIndex].score

    // 计算前一个最佳快照（不包括最新快照）
    let previousBestScore = this.snapshots[0].score
    for (let i = 1; i < latestIndex; i++) {
      if (this.snapshots[i].score >= previousBestScore) {
        previousBestScore = this.snapshots[i].score
      }
    }

    const delta = latestScore - previousBestScore
    const improved = delta >= this.netImprovementEpsilon

    logger.info(
      `净改进检查：最新分数=${latestScore}, 之前最佳=${previousBestScore}, ` +
      `差值=${delta}, 阈值=${this.netImprovementEpsilon}, 有改进=${improved}`
    )

    return improved
  }

  /**
   * 检查最新快照是否通过（分数 >= 阈值 且无 critical 级别问题）
   *
   * @param passScoreThreshold - 通过分数阈值
   * @returns 如果通过返回 true，否则返回 false
   */
  isPassing(passScoreThreshold: number): boolean {
    const latest = this.getLatestSnapshot()
    if (!latest) {
      return false
    }

    const hasCriticalIssues = latest.auditResult.issues.some(
      (issue) => issue.severity === 'critical'
    )
    const scorePasses = latest.score >= passScoreThreshold

    if (!scorePasses) {
      logger.info(`未通过：分数 ${latest.score} < 阈值 ${passScoreThreshold}`)
    }
    if (hasCriticalIssues) {
      logger.info(`未通过：存在 ${latest.auditResult.issues.filter((i) => i.severity === 'critical').length} 个 critical 级别问题`)
    }

    return scorePasses && !hasCriticalIssues
  }

  /**
   * 判断审查迭代周期是否应停止
   *
   * 停止条件（满足任一即停止）：
   * 1. 最新快照已通过（分数 >= 阈值 且无 critical 问题）
   * 2. 仅有 1 个快照（初始草稿，无需迭代）
   * 3. 最新迭代无净改进
   * 4. 内容为空
   * 5. 检测到敏感词 critical 级别问题
   *
   * @param options - 停止条件配置对象，或位置参数（兼容旧接口）
   * @returns 包含是否停止及原因的对象
   */
  shouldStop(
    options: number | {
      currentIteration?: number
      maxIterations: number
      passScoreThreshold: number
      netImprovementEpsilon?: number
    },
    passScoreThresholdArg?: number
  ): { shouldStop: boolean; reason: string } {
    // 兼容两种调用方式：位置参数和对象参数
    let maxIterations: number
    let passScoreThreshold: number
    if (typeof options === 'number') {
      maxIterations = options
      passScoreThreshold = passScoreThresholdArg ?? 85
    } else {
      maxIterations = options.maxIterations
      passScoreThreshold = options.passScoreThreshold
    }
    const latest = this.getLatestSnapshot()

    // 无快照时不应由本方法决定，返回不停止
    if (!latest) {
      return { shouldStop: false, reason: '尚无快照' }
    }

    // 条件 1：最新快照已通过
    if (this.isPassing(passScoreThreshold)) {
      return {
        shouldStop: true,
        reason: `最新快照已通过：分数=${latest.score} >= ${passScoreThreshold}，无 critical 问题`,
      }
    }

    // 条件 2：仅有 1 个快照（初始草稿）
    if (this.snapshots.length === 1) {
      return {
        shouldStop: true,
        reason: '仅有初始草稿快照，无修订迭代',
      }
    }

    // 条件 3：最新迭代无净改进
    if (!this.hasNetImprovement()) {
      return {
        shouldStop: true,
        reason: `最新迭代无净改进（阈值=${this.netImprovementEpsilon}），停止迭代`,
      }
    }

    // 条件 4：内容为空
    if (!latest.content || latest.content.trim().length === 0) {
      return {
        shouldStop: true,
        reason: '最新快照内容为空，停止迭代',
      }
    }

    // 条件 5：敏感词 critical 级别问题
    const sensitiveWordIssues = latest.auditResult.issues.filter(
      (issue) =>
        issue.severity === 'critical' &&
        (issue.category === 'sensitive_word' ||
          issue.category === 'sensitive' ||
          issue.description.includes('敏感词'))
    )
    if (sensitiveWordIssues.length > 0) {
      return {
        shouldStop: true,
        reason: `检测到敏感词 critical 问题（${sensitiveWordIssues.length} 项），停止迭代`,
      }
    }

    // 检查是否超过最大迭代次数
    if (this.snapshots.length >= maxIterations) {
      return {
        shouldStop: true,
        reason: `已达到最大迭代次数 ${maxIterations}，停止迭代`,
      }
    }

    return { shouldStop: false, reason: '继续迭代' }
  }

  // --------------------------------------------------------------------------
  // 内容选择
  // --------------------------------------------------------------------------

  /**
   * 获取最终输出内容
   *
   * 选择策略：
   * - 如果最佳快照与最新快照不同，且最佳快照分数更高，则回滚到最佳版本
   * - 否则使用最新版本
   *
   * @returns 最终内容信息，包含是否发生了回滚
   */
  getFinalContent(): {
    content: string
    wordCount: number
    auditResult: AuditResult
    rolledBack: boolean
    iteration?: number
    aggregatedReport?: import('./AuditResultAggregator').AggregatedAuditReport
  } {
    const latest = this.getLatestSnapshot()
    const best = this.getBestSnapshot()

    if (!latest || !best) {
      logger.warn('无法获取最终内容：快照列表为空')
      throw new Error('快照列表为空，无法获取最终内容')
    }

    const bestIndex = this.getBestSnapshotIndex()
    const latestIndex = this.snapshots.length - 1

    // 最佳快照与最新快照不同，且最佳快照分数更高 -> 回滚
    if (bestIndex !== latestIndex && best.score > latest.score) {
      logger.info(
        `回滚到最佳版本 [${bestIndex}]：` +
        `最佳分数=${best.score} > 最新分数=${latest.score}，` +
        `字数: ${latest.wordCount} -> ${best.wordCount}`
      )
      return {
        content: best.content,
        wordCount: best.wordCount,
        auditResult: best.auditResult,
        rolledBack: true,
        iteration: best.iteration,
        aggregatedReport: best.aggregatedReport,
      }
    }

    // 使用最新版本
    logger.info(
      `使用最新版本 [${latestIndex}]：` +
      `分数=${latest.score}, 字数=${latest.wordCount}`
    )
    return {
      content: latest.content,
      wordCount: latest.wordCount,
      auditResult: latest.auditResult,
      rolledBack: false,
    }
  }

  // --------------------------------------------------------------------------
  // 报告与调试
  // --------------------------------------------------------------------------

  /**
   * 生成完整的快照进度报告
   *
   * @returns 包含所有快照统计信息和逐对比较的报告
   */
  generateReport(): SnapshotReport {
    const bestIndex = this.getBestSnapshotIndex()
    const scores = this.snapshots.map((s) => s.score)
    const bestScore = scores.length > 0 ? Math.max(...scores) : 0
    const worstScore = scores.length > 0 ? Math.min(...scores) : 0

    // 生成逐对比较：每个快照与前一个的比较
    const comparisons: SnapshotComparison[] = []
    for (let i = 1; i < this.snapshots.length; i++) {
      const prev = this.snapshots[i - 1]
      const curr = this.snapshots[i]
      comparisons.push({
        from: i - 1,
        to: i,
        scoreDelta: curr.score - prev.score,
        wordCountDelta: curr.wordCount - prev.wordCount,
        improved: curr.score > prev.score,
      })
    }

    const report: SnapshotReport = {
      totalSnapshots: this.snapshots.length,
      bestSnapshotIndex: bestIndex,
      bestScore,
      worstScore,
      scoreProgression: scores,
      comparisons,
      snapshots: this.snapshots.map((s, i) => ({
        iteration: s.iteration ?? i,
        score: s.score,
        wordCount: s.wordCount,
      })),
    }

    logger.info(
      `快照报告：共 ${report.totalSnapshots} 个快照，` +
      `最佳=[${bestIndex}](${bestScore}分), 最低=${worstScore}分, ` +
      `分数趋势: [${scores.join(' -> ')}]`
    )

    return report
  }

  /**
   * 获取所有快照（用于调试/日志）
   *
   * @returns 快照数组的浅拷贝
   */
  getAllSnapshots(): ReviewSnapshot[] {
    return [...this.snapshots]
  }

  /**
   * 清空所有快照
   */
  clear(): void {
    const count = this.snapshots.length
    this.snapshots = []
    logger.info(`已清空 ${count} 个快照`)
  }

  /**
   * 重置快照管理器（清空所有快照，兼容 ChapterReviewCycle 调用）
   */
  reset(): void {
    this.clear()
  }

  /**
   * 获取当前快照数量
   */
  get size(): number {
    return this.snapshots.length
  }
}
