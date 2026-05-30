/**
 * 审计结果聚合器 (AuditResultAggregator)
 *
 * 将 ContinuityAuditor 输出的 AuditResult 聚合为完整的审计报告。
 * 处理 LLM 可能缺失的维度评分，通过加权计算生成可靠的总体评分。
 *
 * @module services/pipeline/AuditResultAggregator
 */

import type { AuditResult, AuditIssue, TokenUsage } from '@/services/pipeline/types'
import { AUDIT_DIMENSIONS, type AuditDimension } from '@/agents/ContinuityAuditor'
import { getLogger } from '@/utils/logger'

const logger = getLogger('pipeline:audit-aggregator')

// ============================================================================
// 类型定义
// ============================================================================

/** 聚合后的审计报告 */
export interface AggregatedAuditReport {
  /** 加权总体评分，0-100 */
  overallScore: number
  /** 是否通过：overallScore >= 85 且无 critical 级别问题 */
  passed: boolean
  /** 全部 16 个维度的评分，均已填充 */
  dimensionScores: Record<string, number>
  /** 全部问题列表（兼容旧代码） */
  issues: AuditIssue[]
  /** critical 级别问题列表 */
  criticalIssues: AuditIssue[]
  /** warning 级别问题列表 */
  warningIssues: AuditIssue[]
  /** info 级别问题列表 */
  infoIssues: AuditIssue[]
  /** 人话可读的审计摘要 */
  summary: string
  /** Token 使用量 */
  tokenUsage: TokenUsage
}

/** 通过阈值：评分 >= 85 且无 critical 问题方可通过 */
const PASS_SCORE_THRESHOLD = 85

/** critical 维度 ID 列表——这些维度如果评分 < 60，总体分上限锁定为 70 */
const CRITICAL_DIMENSION_IDS = new Set([
  'ooc',
  'timeline',
  'lore',
  'power',
  'info-leak',
  'memo-deviation',
  'format',
])

// ============================================================================
// AuditResultAggregator
// ============================================================================

/**
 * 审计结果聚合器
 *
 * 核心职责：
 * 1. 接收可能不完整的 AuditResult（LLM 可能遗漏部分维度评分）
 * 2. 根据问题严重程度推断缺失维度的评分
 * 3. 以 AUDIT_DIMENSIONS 权重计算加权总分
 * 4. 对 critical 维度施加"硬封顶"保护
 * 5. 输出结构化的 AggregatedAuditReport
 */
export class AuditResultAggregator {
  /** 全部 16 个审计维度的 ID */
  private readonly dimensionIds: string[]

  constructor() {
    this.dimensionIds = AUDIT_DIMENSIONS.map((d) => d.id)
    logger.info(`[Aggregator] 初始化，共 ${this.dimensionIds.length} 个审计维度`)
  }

  // ==========================================================================
  // 公共方法
  // ==========================================================================

  /**
   * 将 AuditResult 聚合为完整的 AggregatedAuditReport。
   *
   * 处理流程：
   * 1. 按 severity 分类 issues
   * 2. 补全缺失的维度评分（基于 issues 推断）
   * 3. 计算加权总体评分
   * 4. 生成人话摘要
   *
   * @param result - ContinuityAuditor 输出的原始审计结果
   * @returns 聚合后的完整审计报告
   */
  aggregate(result: AuditResult, _context?: { chapterNumber?: number; lengthSpec?: any; ruleStack?: any }): AggregatedAuditReport {
    logger.info('[Aggregator] 开始聚合审计结果')

    // Step 1: 按 severity 分类 issues
    const criticalIssues = result.issues.filter((i) => i.severity === 'critical')
    const warningIssues = result.issues.filter((i) => i.severity === 'warning')
    const infoIssues = result.issues.filter((i) => i.severity === 'info')

    logger.info(
      `[Aggregator] 问题分布：critical=${criticalIssues.length}, warning=${warningIssues.length}, info=${infoIssues.length}`,
    )

    // Step 2: 补全维度评分
    const dimensionScores = this.fillDimensionScores(result.dimensionScores, result.issues)

    // Step 3: 计算加权总体评分
    const overallScore = this.calculateWeightedScore(dimensionScores)

    // Step 4: 判定是否通过
    const passed = overallScore >= PASS_SCORE_THRESHOLD && criticalIssues.length === 0

    // Step 5: 生成摘要
    const summary = this.generateSummary(
      overallScore,
      passed,
      criticalIssues.length,
      warningIssues.length,
      dimensionScores,
    )

    logger.info(
      `[Aggregator] 聚合完成：总分=${overallScore}, 通过=${passed}`,
    )

    return {
      overallScore,
      passed,
      dimensionScores,
      issues: result.issues,
      criticalIssues,
      warningIssues,
      infoIssues,
      summary,
      tokenUsage: result.tokenUsage,
    }
  }

  // ==========================================================================
  // 维度评分补全
  // ==========================================================================

  /**
   * 补全所有 16 个维度的评分。
   *
   * 如果 LLM 已返回某个维度的评分则直接采用，否则根据该维度对应类别的
   * issues 数量与严重程度推断一个合理的默认分数。
   *
   * @param llmScores - LLM 返回的维度评分（可能不完整）
   * @param issues - 审计发现的全部问题
   * @returns 包含全部 16 个维度的完整评分表
   */
  private fillDimensionScores(
    llmScores: Record<string, number>,
    issues: AuditIssue[],
  ): Record<string, number> {
    const filled: Record<string, number> = {}

    for (const dim of AUDIT_DIMENSIONS) {
      // 优先使用 LLM 返回的评分（需确保是 0-100 的有效数值）
      const llmScore = llmScores[dim.id]
      if (typeof llmScore === 'number' && llmScore >= 0 && llmScore <= 100) {
        filled[dim.id] = Math.round(llmScore)
        continue
      }

      // LLM 未返回该维度评分，根据 issues 推断
      const dimensionIssues = this.getIssuesForDimension(dim, issues)
      filled[dim.id] = this.inferDimensionScore(dim.id, dimensionIssues)
    }

    logger.info('[Aggregator] 维度评分补全完成')
    return filled
  }

  /**
   * 获取属于指定维度的 issues 列表。
   *
   * 匹配规则：issue.category 与维度名称（name）完全匹配，或与维度 ID 对应的
   * 常见别名匹配。
   *
   * @param dimension - 审计维度定义
   * @param allIssues - 全部 issues
   * @returns 该维度对应的 issues
   */
  private getIssuesForDimension(
    dimension: AuditDimension,
    allIssues: AuditIssue[],
  ): AuditIssue[] {
    return allIssues.filter((issue) => {
      // 精确匹配维度名称
      if (issue.category === dimension.name) return true
      // 精确匹配维度 ID
      if (issue.category === dimension.id) return true
      // 处理 LLM 可能使用的别名映射
      const alias = CATEGORY_ALIAS_MAP[dimension.id]
      if (alias && alias.has(issue.category)) return true
      return false
    })
  }

  // ==========================================================================
  // 维度评分推断
  // ==========================================================================

  /**
   * 根据某个维度的 issues 推断评分。
   *
   * 推断规则：
   * - 0 个 critical issues → 基准 90
   * - 1 个 critical → 50
   * - 2+ 个 critical → 30
   * - 每个 warning issue 减 10 分（最低 40）
   * - 每个 info issue 减 3 分（最低 60）
   *
   * @param dimensionId - 维度 ID（仅用于日志）
   * @param issues - 该维度下的全部 issues
   * @returns 推断的评分（0-100）
   */
  private inferDimensionScore(dimensionId: string, issues: AuditIssue[]): number {
    if (issues.length === 0) {
      logger.debug(`[Aggregator] 维度 ${dimensionId} 无对应问题，评分 90`)
      return 90
    }

    const criticalCount = issues.filter((i) => i.severity === 'critical').length
    const warningCount = issues.filter((i) => i.severity === 'warning').length
    const infoCount = issues.filter((i) => i.severity === 'info').length

    // Critical 基准分
    let score: number
    if (criticalCount === 0) {
      score = 90
    } else if (criticalCount === 1) {
      score = 50
    } else {
      score = 30
    }

    // Warning 扣分（最低 40）
    if (warningCount > 0) {
      score = Math.max(40, score - warningCount * 10)
    }

    // Info 扣分（最低 60，但不能高于当前分）
    if (infoCount > 0) {
      const infoFloor = 60
      const infoDeducted = score - infoCount * 3
      // 如果当前分数本身已低于 60，info 扣分不再设最低 60 的保底
      score = Math.max(score < infoFloor ? score : infoFloor, infoDeducted)
    }

    // 确保在 0-100 范围内
    score = Math.max(0, Math.min(100, Math.round(score)))

    logger.debug(
      `[Aggregator] 维度 ${dimensionId} 推断评分：score=${score}, critical=${criticalCount}, warning=${warningCount}, info=${infoCount}`,
    )

    return score
  }

  // ==========================================================================
  // 加权总分计算
  // ==========================================================================

  /**
   * 根据各维度评分和权重计算加权总体评分。
   *
   * 特殊规则：如果任意 critical 维度（ooc/timeline/lore/power/info-leak/
   * memo-deviation/format）的评分 < 60，则总体分上限锁定为 70（不可通过）。
   *
   * @param dimensionScores - 全部 16 个维度的评分
   * @returns 加权总体评分（0-100）
   */
  private calculateWeightedScore(dimensionScores: Record<string, number>): number {
    let totalWeight = 0
    let weightedSum = 0

    for (const dim of AUDIT_DIMENSIONS) {
      const score = dimensionScores[dim.id] ?? 70 // 兜底值
      weightedSum += score * dim.weight
      totalWeight += dim.weight
    }

    let overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 70

    // 检查 critical 维度是否有低于 60 分的
    let hasCriticalLowScore = false
    for (const critId of CRITICAL_DIMENSION_IDS) {
      const score = dimensionScores[critId]
      if (typeof score === 'number' && score < 60) {
        hasCriticalLowScore = true
        logger.warn(
          `[Aggregator] critical 维度 ${critId} 评分过低（${score} < 60），总体分锁定上限为 70`,
        )
        break
      }
    }

    if (hasCriticalLowScore && overallScore > 70) {
      overallScore = 70
      logger.warn('[Aggregator] 总体分已从加权值锁定为 70（critical 维度保护）')
    }

    return overallScore
  }

  // ==========================================================================
  // 摘要生成
  // ==========================================================================

  /**
   * 生成人话可读的审计摘要文本。
   *
   * @param overallScore - 总体评分
   * @param passed - 是否通过
   * @param criticalCount - critical 问题数量
   * @param warningCount - warning 问题数量
   * @param dimensionScores - 维度评分表
   * @returns 中文可读摘要
   */
  private generateSummary(
    overallScore: number,
    passed: boolean,
    criticalCount: number,
    warningCount: number,
    dimensionScores: Record<string, number>,
  ): string {
    const parts: string[] = []

    // 总体判定
    if (passed) {
      parts.push(`审计通过，综合评分 ${overallScore} 分。`)
    } else {
      const reasons: string[] = []
      if (overallScore < PASS_SCORE_THRESHOLD) {
        reasons.push(`评分 ${overallScore} 未达 ${PASS_SCORE_THRESHOLD} 分线`)
      }
      if (criticalCount > 0) {
        reasons.push(`存在 ${criticalCount} 个严重问题`)
      }
      parts.push(`审计未通过：${reasons.join('；')}。`)
    }

    // 问题摘要
    if (criticalCount > 0 || warningCount > 0) {
      const issueSummary: string[] = []
      if (criticalCount > 0) {
        issueSummary.push(`${criticalCount} 个严重`)
      }
      if (warningCount > 0) {
        issueSummary.push(`${warningCount} 个警告`)
      }
      parts.push(`共发现 ${issueSummary.join('、')} 问题。`)
    }

    // 最低分维度提示
    const sortedDims = AUDIT_DIMENSIONS
      .map((d) => ({ id: d.id, name: d.name, score: dimensionScores[d.id] ?? 70 }))
      .sort((a, b) => a.score - b.score)

    const weakDims = sortedDims.filter((d) => d.score < 70)
    if (weakDims.length > 0) {
      const weakList = weakDims
        .slice(0, 3)
        .map((d) => `${d.name}(${d.score}分)`)
        .join('、')
      const suffix = weakDims.length > 3 ? '等' : ''
      parts.push(`薄弱环节：${weakList}${suffix}。`)
    }

    // 最佳维度展示
    const strongDims = sortedDims.filter((d) => d.score >= 90).reverse()
    if (strongDims.length > 0) {
      const strongList = strongDims
        .slice(0, 3)
        .map((d) => `${d.name}(${d.score}分)`)
        .join('、')
      parts.push(`表现优秀：${strongList}。`)
    }

    return parts.join('')
  }
}

// ============================================================================
// 别名映射表
// ============================================================================

/**
 * LLM 可能返回的 category 名称与标准维度 ID 之间的别名映射。
 * 用于处理 LLM 输出中 category 字段使用不同命名风格的情况。
 */
const CATEGORY_ALIAS_MAP: Record<string, Set<string>> = {
  ooc: new Set(['OOC检查', 'OOC', '角色一致性', '角色偏离', '角色OOC']),
  timeline: new Set(['时间线检查', '时间线', '时间矛盾', '时间线冲突']),
  lore: new Set(['设定冲突', '设定矛盾', '世界观冲突', '设定违背']),
  power: new Set(['战力崩坏', '战力体系', '力量体系', '战斗力']),
  numbers: new Set(['数值检查', '数值矛盾', '数值不一致']),
  hooks: new Set(['伏笔检查', '伏笔', '伏笔管理', '伏笔推进']),
  pacing: new Set(['节奏检查', '节奏', '叙事节奏']),
  style: new Set(['文风检查', '文风', '风格一致性']),
  'info-leak': new Set(['信息越界', '信息泄露', '越界信息', '信息泄漏']),
  'word-fatigue': new Set(['词汇疲劳', '词汇重复', '高频词', '用词疲劳']),
  'sidekick-dumb': new Set(['配角降智', '配角智商', '降智处理']),
  cliche: new Set(['套话密度', '套话', 'AI标记词', '陈词滥调']),
  'paragraph-length': new Set(['段落等长', '段落长度', '段落均匀度']),
  pov: new Set(['视角一致性', '视角', 'POV', '叙述视角']),
  'memo-deviation': new Set(['章节备忘偏离', '备忘偏离', '章节偏离', 'Memo偏离', 'memo偏离']),
  format: new Set(['格式违规', '格式', '章节格式', '格式问题']),
}
