import {
  AuditResult,
  AuditIssue,
  AuditChapterInput,
  TokenUsage,
  ContextPackage,
  RuleStack,
  ChapterMemo,
  LengthSpec,
} from '@/services/pipeline/types'
import { SnapshotManager, SnapshotReport } from '@/services/pipeline/SnapshotManager'
import { AuditResultAggregator, AggregatedAuditReport } from '@/services/pipeline/AuditResultAggregator'
import { ContinuityAuditor } from '@/agents/ContinuityAuditor'
import { ReviserAgent } from '@/agents/ReviserAgent'
import { runPostWriteValidation } from '@/agents/PostWriteValidator'
import { getLogger } from '@/utils/logger'

const logger = getLogger('ChapterReviewCycle')

export interface ReviewCycleInput {
  chapterContent: string
  chapterNumber: number
  contextPackage?: ContextPackage
  ruleStack?: RuleStack
  memo?: ChapterMemo
  genre?: string
  lengthSpec?: LengthSpec
  /** 伏笔池数据，传递给审计员进行伏笔健康诊断 */
  hooks?: AuditChapterInput['hooks']
  /** 已有章节列表，传递给审计员进行节奏分析 */
  chapters?: AuditChapterInput['chapters']
  /** 是否启用敏感词检测（默认 true） */
  enableSensitiveWordCheck?: boolean
}

export interface ReviewCycleResult {
  finalContent: string
  finalWordCount: number
  auditResult: AuditResult
  aggregatedReport: AggregatedAuditReport
  iterations: number
  rolledBack: boolean
  snapshotReport: SnapshotReport
  postWriteIssues: AuditIssue[]
  sensitiveWordBlocked: boolean
  tokenUsage: TokenUsage
}

export class ChapterReviewCycle {
  private auditor: ContinuityAuditor
  private reviser: ReviserAgent
  private aggregator: AuditResultAggregator
  private snapshotManager: SnapshotManager

  private maxRetries: number
  private passScoreThreshold: number
  private netImprovementEpsilon: number

  constructor(options?: {
    maxRetries?: number
    passScoreThreshold?: number
    netImprovementEpsilon?: number
  }) {
    this.auditor = new ContinuityAuditor()
    this.reviser = new ReviserAgent()
    this.aggregator = new AuditResultAggregator()
    this.snapshotManager = new SnapshotManager()

    this.maxRetries = options?.maxRetries ?? 1
    this.passScoreThreshold = options?.passScoreThreshold ?? 85
    this.netImprovementEpsilon = options?.netImprovementEpsilon ?? 3

    logger.info('ChapterReviewCycle 初始化完成', {
      maxRetries: this.maxRetries,
      passScoreThreshold: this.passScoreThreshold,
      netImprovementEpsilon: this.netImprovementEpsilon,
    })
  }

  /**
   * 执行完整的审计-修订循环
   */
  async execute(input: ReviewCycleInput): Promise<ReviewCycleResult> {
    const { chapterContent, chapterNumber } = input

    logger.info(`开始执行第 ${chapterNumber} 章审计-修订循环`, {
      contentLength: chapterContent.length,
      wordCount: chapterContent.length,
    })

    // 初始化 token 用量追踪
    let totalTokenUsage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }

    // 初始化快照管理器
    this.snapshotManager.reset()

    // 步骤 1: 运行 PostWriteValidator（确定性检查，包含敏感词检测）
    logger.info('步骤 1: 运行 PostWriteValidator（确定性检查）')
    const postWriteResult = await runPostWriteValidation({
      content: chapterContent,
      chapterNumber,
      ruleStack: input.ruleStack,
      genre: input.genre,
      lengthSpec: input.lengthSpec,
      enableSensitiveWordCheck: input.enableSensitiveWordCheck,
    })

    const postWriteIssues = postWriteResult.issues || []

    // 步骤 2: 检查是否有敏感词关键问题
    const sensitiveWordBlocked = postWriteIssues.some(
      (issue) => issue.severity === 'critical' && (issue.category === 'sensitive_word' || issue.category === '敏感词')
    )

    if (sensitiveWordBlocked) {
      logger.warn('检测到敏感词关键问题，立即终止审计-修订循环', {
        sensitiveWordIssues: postWriteIssues.filter(
          (i) => i.category === 'sensitive_word' || i.category === '敏感词'
        ),
      })

      return this.buildBlockedResult(chapterContent, postWriteIssues, totalTokenUsage)
    }

    // 步骤 3: 运行 ContinuityAuditor（LLM 审计）并聚合结果
    logger.info('步骤 3: 运行 ContinuityAuditor（LLM 审计）')
    const { auditResult: initialAudit, aggregated: initialAggregated, tokenUsage: auditTokens } =
      await this.auditAndAggregate(chapterContent, input)

    totalTokenUsage = this.mergeTokenUsage(totalTokenUsage, auditTokens)

    // 步骤 4: 创建初始快照
    const initialScore = initialAggregated.overallScore
    logger.info('步骤 4: 创建初始快照', { score: initialScore })

    this.snapshotManager.addSnapshot({
      content: chapterContent,
      wordCount: chapterContent.length,
      score: initialScore,
      iteration: 0,
      auditResult: initialAudit,
      aggregatedReport: initialAggregated,
    })

    // 步骤 5: 检查停止条件
    const stopCheck = this.snapshotManager.shouldStop({
      currentIteration: 0,
      maxIterations: this.maxRetries + 1,
      passScoreThreshold: this.passScoreThreshold,
      netImprovementEpsilon: this.netImprovementEpsilon,
    })

    if (stopCheck.shouldStop) {
      logger.info(`步骤 5: 初始快照满足停止条件 - ${stopCheck.reason}`)
      return this.buildResult(input, postWriteIssues, 0, totalTokenUsage)
    }

    // 步骤 6: 审计-修订循环
    logger.info('步骤 6: 开始审计-修订循环', { maxRetries: this.maxRetries })

    let currentContent = chapterContent
    let currentAudit = initialAudit
    let currentAggregated = initialAggregated
    let iterations = 0

    for (let i = 1; i <= this.maxRetries; i++) {
      logger.info(`开始第 ${i} 次修订循环`, {
        currentScore: currentAggregated.overallScore,
        passThreshold: this.passScoreThreshold,
      })

      // 7a: 运行 ReviserAgent（修订，温度为 0 保守模式）
      const { revisedContent, tokenUsage: reviseTokens, verificationResult } = await this.reviser.revise({
        content: currentContent,
        issues: currentAudit.issues,
        mode: 'auto',
        contextPackage: input.contextPackage,
        ruleStack: input.ruleStack,
        memo: input.memo,
        chapterNumber: input.chapterNumber,
        lengthSpec: input.lengthSpec,
      })

      totalTokenUsage = this.mergeTokenUsage(totalTokenUsage, reviseTokens)

      // 记录验证结果
      if (verificationResult) {
        logger.info(`修订验证结果: ${verificationResult.fixedIssueIds.length} 个已修复, ${verificationResult.remainingIssues.length} 个未完全修复`)
      }

      // 7b: 重新审计
      const { auditResult: reAudit, aggregated: reAggregated, tokenUsage: reAuditTokens } =
        await this.auditAndAggregate(revisedContent, input)

      totalTokenUsage = this.mergeTokenUsage(totalTokenUsage, reAuditTokens)

      // 7b+: 将未修复的问题提升优先级，合并到下次修订的问题列表中
      if (verificationResult && verificationResult.remainingIssues.length > 0) {
        const boostedIssues = verificationResult.remainingIssues.map(issue => ({
          ...issue,
          severity: issue.severity === 'info' ? 'warning' as const : issue.severity === 'warning' ? 'critical' as const : 'critical' as const,
          description: `[未修复] ${issue.description}`,
        }))

        // 合并：去重后将未修复问题添加到审计结果中
        const existingDescs = new Set(reAudit.issues.map(iss => iss.description))
        const newIssues = boostedIssues.filter(iss => !existingDescs.has(iss.description))
        if (newIssues.length > 0) {
          reAudit.issues = [...reAudit.issues, ...newIssues]
          logger.info(`将 ${newIssues.length} 个未修复问题提升优先级并合并到下次修订列表`)
        }
      }

      // 7c: 创建快照
      const newScore = reAggregated.overallScore
      logger.info(`第 ${i} 次修订完成，创建快照`, {
        previousScore: currentAggregated.overallScore,
        newScore,
        improvement: newScore - currentAggregated.overallScore,
      })

      this.snapshotManager.addSnapshot({
        content: revisedContent,
        wordCount: revisedContent.length,
        score: newScore,
        iteration: i,
        auditResult: reAudit,
        aggregatedReport: reAggregated,
      })

      // 更新当前内容
      currentContent = revisedContent
      currentAudit = reAudit
      currentAggregated = reAggregated
      iterations = i

      // 6d: 检查停止条件
      const loopStopCheck = this.snapshotManager.shouldStop({
        currentIteration: i,
        maxIterations: this.maxRetries + 1,
        passScoreThreshold: this.passScoreThreshold,
        netImprovementEpsilon: this.netImprovementEpsilon,
      })

      if (loopStopCheck.shouldStop) {
        logger.info(`第 ${i} 次修订后满足停止条件 - ${loopStopCheck.reason}`)
        break
      }
    }

    // 步骤 7: 选择最佳快照并返回最终结果
    logger.info('步骤 7: 选择最佳快照')
    return this.buildResult(input, postWriteIssues, iterations, totalTokenUsage)
  }

  /**
   * 运行单次审计 + 聚合步骤
   */
  private async auditAndAggregate(
    content: string,
    input: ReviewCycleInput
  ): Promise<{
    auditResult: AuditResult
    aggregated: AggregatedAuditReport
    tokenUsage: TokenUsage
  }> {
    logger.info('运行 ContinuityAuditor 审计')

    const auditResult = await this.auditor.audit({
      chapterContent: content,
      chapterNumber: input.chapterNumber,
      contextPackage: input.contextPackage,
      ruleStack: input.ruleStack,
      memo: input.memo,
      genre: input.genre,
      hooks: input.hooks,
      chapters: input.chapters,
    })

    const aggregated = this.aggregator.aggregate(auditResult, {
      chapterNumber: input.chapterNumber,
      lengthSpec: input.lengthSpec,
      ruleStack: input.ruleStack,
    })

    const tokenUsage: TokenUsage = {
      inputTokens: auditResult.tokenUsage?.inputTokens || auditResult.tokenUsage?.promptTokens || 0,
      outputTokens: auditResult.tokenUsage?.outputTokens || auditResult.tokenUsage?.completionTokens || 0,
      totalTokens: auditResult.tokenUsage?.totalTokens || 0,
    }

    return { auditResult, aggregated, tokenUsage }
  }

  /**
   * 合并 token 用量
   */
  private mergeTokenUsage(current: TokenUsage, additional: TokenUsage): TokenUsage {
    return {
      inputTokens: (current.inputTokens || current.promptTokens || 0) + (additional.inputTokens || additional.promptTokens || 0),
      outputTokens: (current.outputTokens || current.completionTokens || 0) + (additional.outputTokens || additional.completionTokens || 0),
      totalTokens: (current.totalTokens || 0) + (additional.totalTokens || 0),
    }
  }

  /**
   * 构建敏感词阻止结果
   */
  private buildBlockedResult(
    content: string,
    postWriteIssues: AuditIssue[],
    tokenUsage: TokenUsage
  ): ReviewCycleResult {
    const snapshotReport = this.snapshotManager.generateReport()

    return {
      finalContent: content,
      finalWordCount: content.length,
      auditResult: {
        passed: false,
        issues: [],
        dimensionScores: {},
        overallScore: 0,
        summary: '因敏感词问题被阻止',
        tokenUsage,
      },
      aggregatedReport: {
        passed: false,
        overallScore: 0,
        dimensionScores: {},
        issues: postWriteIssues,
        criticalIssues: postWriteIssues.filter(i => i.severity === 'critical'),
        warningIssues: postWriteIssues.filter(i => i.severity === 'warning'),
        infoIssues: postWriteIssues.filter(i => i.severity === 'info'),
        summary: '因敏感词问题被阻止',
        tokenUsage,
      },
      iterations: 0,
      rolledBack: false,
      snapshotReport,
      postWriteIssues,
      sensitiveWordBlocked: true,
      tokenUsage,
    }
  }

  /**
   * 构建最终结果
   */
  private buildResult(
    input: ReviewCycleInput,
    postWriteIssues: AuditIssue[],
    iterations: number,
    tokenUsage: TokenUsage
  ): ReviewCycleResult {
    const finalSnapshot = this.snapshotManager.getFinalContent()
    const snapshotReport = this.snapshotManager.generateReport()

    const finalContent = finalSnapshot.content || input.chapterContent
    const finalAuditResult = finalSnapshot.auditResult || {
      passed: false,
      issues: [],
      dimensionScores: {},
      overallScore: 0,
      summary: '',
      tokenUsage,
    }
    // 优先从 getFinalContent 附加属性中获取聚合报告（兼容快照回滚场景）
    const finalAggregated = finalSnapshot.aggregatedReport || {
      passed: false,
      overallScore: 0,
      dimensionScores: {},
      issues: [],
      criticalIssues: [],
      warningIssues: [],
      infoIssues: [],
      summary: '',
      tokenUsage,
    }

    const rolledBack = finalSnapshot.rolledBack ?? finalSnapshot.iteration !== iterations

    logger.info('审计-修订循环完成', {
      iterations,
      rolledBack,
      finalScore: finalAggregated.overallScore,
      snapshotIterations: snapshotReport.snapshots?.map((s: any) => s.iteration),
    })

    return {
      finalContent,
      finalWordCount: finalContent.length,
      auditResult: finalAuditResult,
      aggregatedReport: finalAggregated,
      iterations,
      rolledBack,
      snapshotReport,
      postWriteIssues,
      sensitiveWordBlocked: false,
      tokenUsage,
    }
  }
}
