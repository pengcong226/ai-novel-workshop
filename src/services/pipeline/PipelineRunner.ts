/**
 * PipelineRunner — 流水线编排器
 *
 * 编排 10 个 Agent 的调用顺序，管理 audit-revise 循环，
 * 汇总 token 消耗，提供进度回调。
 *
 * Pipeline 阶段流程：
 *   prepare → plan → compose → write → normalize → audit → (revise → audit) → settle → analyze → promote-hooks
 */

import { getLogger } from '@/utils/logger'
import { trackGenerationStart, trackGenerationComplete, trackGenerationFail } from '@/utils/analytics'
import { ComposerAgent, buildLengthSpec as composerBuildLengthSpec } from '@/agents/ComposerAgent'
import { ContinuityAuditor, AUDIT_DIMENSIONS } from '@/agents/ContinuityAuditor'
import { ReviserAgent } from '@/agents/ReviserAgent'
import { LengthNormalizerAgent, countChars, buildLengthSpec } from '@/agents/LengthNormalizerAgent'
import { analyzeHookHealth, type HookHealthInput } from '@/utils/hookHealthAnalyzer'
import { buildWritingMethodologySection } from '@/utils/writingMethodology'
import { renderNarrativeControl } from '@/utils/narrativeControl'
import { withRetry, WRITER_RETRY_CONFIG, AUDITOR_RETRY_CONFIG } from '@/utils/llmRetry'
import { detectLongSpanFatigue } from '@/utils/longSpanFatigue'
import { analyzeTensionCurve, formatTensionCurveReport, type TensionCurveReport } from '@/utils/tensionCurvePlanner'
import { StateSettler } from '@/agents/StateSettler'
import { ChapterAnalyzer } from '@/agents/ChapterAnalyzer'
import { HookPromoter } from '@/agents/HookPromoter'
import { ChapterReviewCycle } from './ChapterReviewCycle'
import { DataAdapter } from './DataAdapter'
import type { ReviewCycleResult } from './ChapterReviewCycle'
import type { Project, ChapterOutline } from '@/types'
import type { ChatResponse } from '@/types/ai'
import type {
  PipelineConfig,
  WriteNextChapterOptions,
  ChapterPipelineResult,
  PlanChapterOutput,
  ComposeChapterOutput,
  ContextPackage,
  RuleStack,
  ChapterMemo,
  AuditResult,
  AuditIssue,
  LengthSpec,
  ReviewSnapshot,
  TokenUsage,
  TokenUsageSummary,
  HookEntry,
  AgentTraceEvent,
  PipelineStage,
} from './types'
import { emptyTokenUsageSummary } from './types'

const logger = getLogger('pipeline:runner')

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxAuditRetries: 1,
  passScoreThreshold: 85,
  netImprovementEpsilon: 3,
  temperatureBase: 0.7,
  temperatureRetryStep: 0.1,
  maxTemperature: 1.2,
  enableLengthNormalization: true,
  enableHookPromotion: true,
  enableLLMCompose: true,
}

// ============================================================================
// PipelineRunner
// ============================================================================

export class PipelineRunner {
  private config: PipelineConfig
  private composer: ComposerAgent
  private auditor: ContinuityAuditor
  private reviser: ReviserAgent
  private normalizer: LengthNormalizerAgent
  private reviewCycle: ChapterReviewCycle
  private settler: StateSettler
  private analyzer: ChapterAnalyzer
  private hookPromoter: HookPromoter

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config }
    this.composer = new ComposerAgent()
    this.auditor = new ContinuityAuditor({ passScoreThreshold: this.config.passScoreThreshold })
    this.reviser = new ReviserAgent()
    this.normalizer = new LengthNormalizerAgent()
    this.reviewCycle = new ChapterReviewCycle({
      maxRetries: this.config.maxAuditRetries,
      passScoreThreshold: this.config.passScoreThreshold,
      netImprovementEpsilon: this.config.netImprovementEpsilon,
    })
    this.settler = new StateSettler()
    this.analyzer = new ChapterAnalyzer()
    this.hookPromoter = new HookPromoter()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config }
    // 同步更新 ReviewCycle 配置
    this.reviewCycle = new ChapterReviewCycle({
      maxRetries: this.config.maxAuditRetries,
      passScoreThreshold: this.config.passScoreThreshold,
      netImprovementEpsilon: this.config.netImprovementEpsilon,
    })
  }

  /**
   * 执行完整的单章写作流水线
   */
  async writeNextChapter(options: WriteNextChapterOptions): Promise<ChapterPipelineResult> {
    const startTime = performance.now()
    const stageTimings: Record<string, number> = {}
    const tokenUsage = emptyTokenUsageSummary()
    const { project, chapterNumber } = options

    logger.info(`[Pipeline] ====== 开始第${chapterNumber}章流水线 ======`)
    trackGenerationStart(chapterNumber)
    this.emitProgress('prepare', `准备第${chapterNumber}章写作`)

    try {
      // ================================================================
      // Phase 0: 准备输入
      // ================================================================
      const stageStart = performance.now()
      const hookPool = DataAdapter.extractHookPool(project)
      const recentSummaries = DataAdapter.extractRecentSummaries(project, chapterNumber)
      const chapterOutline = options.chapterOutline || DataAdapter.findChapterOutline(project, chapterNumber)
      const targetWordCount = options.wordCountOverride || project.config?.advancedSettings?.targetWordCount || 2000
      const lengthSpec = buildLengthSpec(targetWordCount)

      // 提取上一章尾段
      const previousEndingExcerpt = DataAdapter.extractPreviousEnding(project, chapterNumber)

      // 大纲自动翻页：当即将耗尽大纲时自动扩展
      const currentOutlineLength = project.outline?.chapters?.length || 0
      if (currentOutlineLength > 0 && chapterNumber >= currentOutlineLength - 4) {
        logger.info(`[Pipeline] 大纲即将耗尽（当前${chapterNumber}章/大纲${currentOutlineLength}章），触发自动翻页`)
        try {
          const { extendOutlineWithLLM } = await import('@/utils/llm/outlineGenerator')
          const newOutlines = await extendOutlineWithLLM(project, currentOutlineLength + 1, 20)
          if (newOutlines && newOutlines.length > 0) {
            project.outline.chapters.push(...newOutlines)
            logger.info(`[Pipeline] 大纲自动翻页成功！扩展了 ${newOutlines.length} 章`)
          }
        } catch (outlineError) {
          logger.error('[Pipeline] 大纲自动翻页失败:', outlineError)
        }
      }

      stageTimings['prepare'] = Math.round(performance.now() - stageStart)

      // ================================================================
      // Phase 1: Planner — 规划（复用现有 PlannerAgent 生成 memo）
      // ================================================================
      this.emitProgress('plan', `规划第${chapterNumber}章意图和备忘`)
      const planStart = performance.now()

      let planOutput: PlanChapterOutput
      try {
        planOutput = await this.executePlanPhase(
          project, chapterNumber, chapterOutline,
          previousEndingExcerpt, options.externalContext,
          hookPool, recentSummaries
        )
      } catch (planError) {
        logger.error('[Pipeline] Phase 1 规划阶段失败（不阻断流水线，使用默认计划）:', planError)
        this.emitTrace('planner', 'plan', 'failed',
          planError instanceof Error ? planError.message : String(planError))
        // 使用默认的最小计划，允许流水线继续
        planOutput = {
          intent: {
            chapter: chapterNumber,
            goal: chapterOutline?.goals?.join('；') || `推进第${chapterNumber}章剧情`,
            mustKeep: [],
            mustAvoid: ['泄露未来章节信息'],
            styleEmphasis: [],
          },
          memo: {
            goal: chapterOutline?.goals?.join('；') || `推进第${chapterNumber}章剧情`,
            currentTasks: '',
            payoffOrHold: '暂不掀牌',
            dailyTransitionFunction: '',
            threeQuestionCheck: '',
            chapterEndChanges: '',
            hardDonts: '不得泄露后续剧情',
            bodySkeleton: '',
          },
          intentMarkdown: `# 第${chapterNumber}章执行计划\n## 目标: 推进剧情`,
        }
      }

      stageTimings['plan'] = Math.round(performance.now() - planStart)
      this.emitTrace('planner', 'plan', 'completed', `Goal: ${planOutput.intent.goal}`)

      // ================================================================
      // Phase 2: Composer — 组装上下文
      // ================================================================
      this.emitProgress('compose', '组装上下文包')
      const composeStart = performance.now()

      let composeOutput: ComposeChapterOutput
      try {
        const composeInput = {
          project,
          chapterNumber,
          plan: planOutput,
          hookPool,
          chapterSummaries: recentSummaries.join('\n---\n'),
          characterMatrix: DataAdapter.extractCharacterMatrix(project),
          emotionalArcs: DataAdapter.extractEmotionalArcs(project),
          subplotBoard: DataAdapter.extractSubplotBoard(project),
          entityGraph: project._entities || [],
          stateEvents: project._stateEvents || [],
        }

        // 判断是否启用 LLM 语义裁剪：章节数 >= 20 且配置允许
        const totalChapters = project.chapters?.length || 0
        const useLLMCompose = this.config.enableLLMCompose !== false && totalChapters >= 20

        if (useLLMCompose) {
          logger.info(`[Pipeline] Phase 2 使用 LLM 语义裁剪模式（章节数: ${totalChapters}）`)
          composeOutput = await this.composer.composeWithLLM(composeInput)
        } else {
          logger.info(`[Pipeline] Phase 2 使用标准裁剪模式（章节数: ${totalChapters}）`)
          composeOutput = await this.composer.compose(composeInput)
        }

        // 填充最近章节正文
        composeOutput.contextPackage.recentChapters = DataAdapter.extractRecentChapters(project, chapterNumber)
      } catch (composeError) {
        logger.error('[Pipeline] Phase 2 组装上下文失败（不阻断流水线，使用最小上下文）:', composeError)
        this.emitTrace('composer', 'compose', 'failed',
          composeError instanceof Error ? composeError.message : String(composeError))
        // 使用最小上下文包，允许流水线继续
        composeOutput = {
          contextPackage: {
            chapter: chapterNumber,
            storyBible: '',
            currentState: '',
            hookSnapshot: '',
            chapterSummaries: recentSummaries.join('\n---\n'),
            characterMatrix: '',
            emotionalArcs: '',
            subplotBoard: '',
            volumeOutline: '',
            recentChapters: DataAdapter.extractRecentChapters(project, chapterNumber),
            selectedEntities: '',
          },
          ruleStack: {
            genreRules: [],
            bookRules: [],
            prohibitions: ['不得泄露后续剧情'],
            styleGuide: '',
          },
          trace: {
            selectedSections: [],
            trimmedSections: [],
            totalBudgetUsed: 0,
            totalBudgetAvailable: 0,
          },
        }
      }

      stageTimings['compose'] = Math.round(performance.now() - composeStart)
      this.emitTrace('composer', 'compose', 'completed',
        `Budget: ${composeOutput.trace.totalBudgetUsed}/${composeOutput.trace.totalBudgetAvailable}`)

      // ================================================================
      // Phase 3: Writer — 写作
      // ================================================================
      this.emitProgress('write', `撰写第${chapterNumber}章正文`)
      const writeStart = performance.now()

      let writeOutput: { content: string; title: string; wordCount: number; tokenUsage: TokenUsage }
      try {
        writeOutput = await this.executeWritePhase(
          project, chapterNumber, chapterOutline,
          composeOutput, planOutput, lengthSpec,
          options.temperatureOverride
        )
      } catch (writeError) {
        logger.error('[Pipeline] Phase 3 写作阶段失败:', writeError)
        this.emitTrace('writer', 'write', 'failed',
          writeError instanceof Error ? writeError.message : String(writeError))
        // 写作阶段失败是致命的，向上抛出由外层 catch 处理
        throw writeError
      }

      stageTimings['write'] = Math.round(performance.now() - writeStart)
      addTokenUsage(tokenUsage.writer, writeOutput.tokenUsage)
      this.emitTrace('writer', 'write', 'completed', `字数: ${writeOutput.wordCount}`)

      // ================================================================
      // Phase 4: LengthNormalizer — 字数标准化
      // ================================================================
      let currentContent = writeOutput.content
      let currentWordCount = writeOutput.wordCount

      if (this.config.enableLengthNormalization) {
        this.emitProgress('normalize', '检查字数范围')
        const normalizeStart = performance.now()

        const normalizeOutput = await this.normalizer.normalize({
          content: currentContent,
          lengthSpec,
          chapterIntent: planOutput.intent.goal,
        })

        if (normalizeOutput.applied) {
          currentContent = normalizeOutput.normalizedContent
          currentWordCount = normalizeOutput.finalCount
          logger.info(`[Pipeline] 字数标准化: ${writeOutput.wordCount} → ${currentWordCount}`)
        }

        stageTimings['normalize'] = Math.round(performance.now() - normalizeStart)
        addTokenUsage(tokenUsage.normalizer, normalizeOutput.tokenUsage)
      }

      // ================================================================
      // Phase 5 + 6: Audit → Revise 循环（使用 ChapterReviewCycle）
      // ================================================================
      this.emitProgress('audit', '执行质量审计（含写后校验）')
      const reviewStart = performance.now()

      const reviewResult: ReviewCycleResult = await this.reviewCycle.execute({
        chapterContent: currentContent,
        chapterNumber,
        contextPackage: composeOutput.contextPackage,
        ruleStack: composeOutput.ruleStack,
        memo: planOutput.memo,
        genre: project.genre,
        lengthSpec,
        enableSensitiveWordCheck: project.config?.enableSensitiveWordCheck,
        hooks: hookPool.map(h => ({
          id: h.id,
          content: h.content,
          status: h.status,
          chapterNumber: h.chapterNumber,
          lastAdvancedChapter: h.lastAdvancedChapter,
          advanceCount: h.advanceCount,
          payoffTiming: h.payoffTiming,
          dependsOn: h.dependsOn,
          coreHook: h.coreHook,
        })),
        chapters: (project.chapters || []).map((ch: any) => ({
          number: ch.number,
          title: ch.title,
          contentPreview: ch.content?.slice(0, 200),
        })),
      })

      stageTimings['audit'] = Math.round(performance.now() - reviewStart)
      if (reviewResult.tokenUsage) {
        addTokenUsage(tokenUsage.auditor, reviewResult.tokenUsage)
      }

      // 应用审阅结果
      let auditResult = reviewResult.auditResult
      const revised = reviewResult.iterations > 0
      currentContent = reviewResult.finalContent
      currentWordCount = reviewResult.finalWordCount
      const postReviseCount = currentWordCount

      if (reviewResult.rolledBack) {
        logger.info(`[Pipeline] 已回滚到最优快照版本`)
      }

      if (reviewResult.sensitiveWordBlocked) {
        logger.warn(`[Pipeline] 敏感词阻断，章节生成失败`)
      }

      logger.info(`[Pipeline] 审阅循环完成: ${reviewResult.iterations}轮迭代, 评分${auditResult.overallScore}, ` +
        `维度覆盖${Object.keys(reviewResult.aggregatedReport.dimensionScores).length}个`)

      this.emitTrace('auditor', 'audit', 'completed',
        `Score: ${auditResult.overallScore}, Passed: ${auditResult.passed}, Iterations: ${reviewResult.iterations}`)

      // ================================================================
      // Phase 7: StateSettler — 状态沉淀
      // ================================================================
      this.emitProgress('settle', `沉淀第${chapterNumber}章状态变更`)
      const settleStart = performance.now()

      try {
        const settleOutput = await this.settler.settle({
          project,
          chapterNumber,
          chapterContent: currentContent,
          stateChanges: [],  // Writer 产出的 stateChanges 在 reviewCycle 中已整合
        })

        stageTimings['settle'] = Math.round(performance.now() - settleStart)
        addTokenUsage(tokenUsage.settler, settleOutput.tokenUsage)

        logger.info(`[Pipeline] Phase 7 状态沉淀完成: 新增${settleOutput.newEntities.length}个实体, ` +
          `${settleOutput.newStateEvents.length}个事件, 摘要${settleOutput.chapterSummary.length}字`)

        this.emitTrace('settler', 'settle', 'completed',
          `Entities: ${settleOutput.newEntities.length}, Events: ${settleOutput.newStateEvents.length}`)
      } catch (settleError) {
        logger.error('[Pipeline] Phase 7 状态沉淀失败（不阻断流水线）:', settleError)
        stageTimings['settle'] = Math.round(performance.now() - settleStart)
        this.emitTrace('settler', 'settle', 'failed',
          settleError instanceof Error ? settleError.message : String(settleError))
      }

      // ================================================================
      // Phase 8: ChapterAnalyzer — 章节分析
      // ================================================================
      this.emitProgress('analyze', `分析第${chapterNumber}章结构`)
      const analyzeStart = performance.now()
      let analysisHookUpdates: Array<{ content: string; previousStatus: 'planted' | 'advanced' | 'resolved'; newStatus: 'planted' | 'advanced' | 'resolved' }> = []

      try {
        const analysisOutput = await this.analyzer.analyze({
          chapterNumber,
          chapterContent: currentContent,
          chapterTitle: chapterOutline?.title || `第${chapterNumber}章`,
        })

        stageTimings['analyze'] = Math.round(performance.now() - analyzeStart)
        addTokenUsage(tokenUsage.analyzer, analysisOutput.tokenUsage)

        // 保存 hookUpdates 供 Phase 9 使用
        analysisHookUpdates = analysisOutput.hookUpdates.map(u => ({
          content: u.content,
          previousStatus: u.previousStatus,
          newStatus: u.newStatus,
        }))

        logger.info(`[Pipeline] Phase 8 章节分析完成: 摘要${analysisOutput.chapterSummary.length}字, ` +
          `${analysisOutput.hookUpdates.length}个伏笔更新, 情感弧线: ${analysisOutput.emotionalArcUpdate.slice(0, 50)}`)

        this.emitTrace('analyzer', 'analyze', 'completed',
          `Summary: ${analysisOutput.chapterSummary.slice(0, 50)}..., Hooks: ${analysisOutput.hookUpdates.length}`)

        // Phase 8b: 长跨度疲劳检测
        try {
          const recentChapters = (project.chapters || [])
            .filter((ch: any) => ch.number <= chapterNumber)
            .map((ch: any) => ({
              chapterNumber: ch.number,
              title: ch.title,
              content: ch.content || '',
            }))
          const fatigueResult = detectLongSpanFatigue(recentChapters, chapterNumber)
          if (fatigueResult.issues.length > 0) {
            logger.info(`[Pipeline] 长跨度疲劳检测: 疲劳评分${fatigueResult.fatigueScore}, ${fatigueResult.issues.length}个问题`)
            for (const issue of fatigueResult.issues) {
              logger.warn(`[Pipeline] 疲劳检测: [${issue.severity}] ${issue.description}`)
            }
          }
        } catch (fatigueError) {
          logger.error('[Pipeline] 长跨度疲劳检测失败（不阻断流水线）:', fatigueError)
        }
      } catch (analyzeError) {
        logger.error('[Pipeline] Phase 8 章节分析失败（不阻断流水线）:', analyzeError)
        stageTimings['analyze'] = Math.round(performance.now() - analyzeStart)
        this.emitTrace('analyzer', 'analyze', 'failed',
          analyzeError instanceof Error ? analyzeError.message : String(analyzeError))
      }

      // ================================================================
      // Phase 8b: 跨章节张力曲线分析
      // ================================================================
      let tensionReport: TensionCurveReport | undefined

      try {
        const allChapters = [
          ...(project.chapters || []),
          { number: chapterNumber, title: chapterOutline?.title || `第${chapterNumber}章`, content: currentContent },
        ]
        tensionReport = analyzeTensionCurve(allChapters.map(ch => ({
          number: ch.number,
          title: ch.title,
          content: ch.content || '',
        })))

        if (tensionReport.issues.length > 0) {
          logger.info(`[Pipeline] 张力曲线分析: ${tensionReport.issues.length}个问题, 建议下一章张力${tensionReport.suggestedNextTension}`)
          for (const issue of tensionReport.issues) {
            logger.warn(`[Pipeline] 张力曲线: [${issue.severity}] ${issue.message}`)
          }
        } else {
          logger.info(`[Pipeline] 张力曲线分析: 节奏正常, 建议下一章张力${tensionReport.suggestedNextTension}`)
        }
      } catch (tensionError) {
        logger.error('[Pipeline] 张力曲线分析失败（不阻断流水线）:', tensionError)
      }

      // ================================================================
      // Phase 9: HookPromoter — 伏笔升级
      // ================================================================
      // 独立于 Phase 8 的 try/catch，Phase 8 失败时使用空 hookUpdates 继续执行
      if (this.config.enableHookPromotion) {
        this.emitProgress('promote-hooks', `检查第${chapterNumber}章伏笔升级`)
        const hookStart = performance.now()

        try {
          const phase9HookPool = DataAdapter.extractHookPool(project)
          const hookResult = this.hookPromoter.promote({
            hooks: phase9HookPool,
            currentChapter: chapterNumber,
            chapterHookUpdates: analysisHookUpdates,
          })

          stageTimings['promote-hooks'] = Math.round(performance.now() - hookStart)

          logger.info(`[Pipeline] Phase 9 伏笔检查完成: 升级${hookResult.promotedHooks.length}, ` +
            `需关注${hookResult.staleHooks.length}, 风险${hookResult.expiredRiskHooks.length}, 已回收${hookResult.resolvedHooks.length}`)

          this.emitTrace('hook-promoter', 'promote-hooks', 'completed',
            `Promoted: ${hookResult.promotedHooks.length}, Stale: ${hookResult.staleHooks.length}`)

          // Phase 9b: 伏笔健康分析
          try {
            const hookHealthInputs: HookHealthInput[] = phase9HookPool.map(h => ({
              hookId: h.id || h.content.slice(0, 30),
              content: h.content,
              status: h.status,
              startChapter: h.chapterNumber,
              lastAdvancedChapter: h.lastAdvancedChapter || h.chapterNumber,
              advanceCount: h.advanceCount || 1,
              payoffTiming: h.payoffTiming,
              dependsOn: h.dependsOn,
              coreHook: h.promoted,
            }))

            const newHooksCount = analysisHookUpdates.filter(u => u.newStatus === 'planted').length
            const resolvedHooksCount = analysisHookUpdates.filter(u => u.newStatus === 'resolved').length

            const hookHealth = analyzeHookHealth({
              hooks: hookHealthInputs,
              currentChapter: chapterNumber,
              targetChapters: project.config?.advancedSettings?.targetChapters,
              newHooksThisChapter: newHooksCount,
              resolvedHooksThisChapter: resolvedHooksCount,
            })

            if (hookHealth.issues.length > 0) {
              logger.info(`[Pipeline] 伏笔健康检查发现 ${hookHealth.issues.length} 个问题，健康评分: ${hookHealth.stats.healthScore}`)
              for (const issue of hookHealth.issues) {
                logger.warn(`[Pipeline] 伏笔健康: [${issue.severity}] ${issue.description}`)
              }
            }
          } catch (healthError) {
            logger.error('[Pipeline] 伏笔健康分析失败（不阻断流水线）:', healthError)
          }
        } catch (hookError) {
          logger.error('[Pipeline] Phase 9 伏笔升级检查失败（不阻断流水线）:', hookError)
          stageTimings['promote-hooks'] = Math.round(performance.now() - hookStart)
          this.emitTrace('hook-promoter', 'promote-hooks', 'failed',
            hookError instanceof Error ? hookError.message : String(hookError))
        }
      }

      // 计算汇总
      tokenUsage.total = sumTokenUsages(tokenUsage)

      const totalDuration = Math.round(performance.now() - startTime)
      const passed = auditResult.passed
      const status: ChapterPipelineResult['status'] = passed ? 'ready-for-review' : 'audit-failed'

      logger.info(`[Pipeline] ====== 第${chapterNumber}章流水线完成 ======`)
      logger.info(`[Pipeline] 评分: ${auditResult.overallScore}，字数: ${currentWordCount}，状态: ${status}，耗时: ${totalDuration}ms`)
      logger.info(`[Pipeline] Token消耗: ${tokenUsage.total.totalTokens} (input: ${tokenUsage.total.inputTokens}, output: ${tokenUsage.total.outputTokens})`)

      trackGenerationComplete({
        chapterNumber,
        durationMs: totalDuration,
        wordCount: currentWordCount,
        totalTokens: tokenUsage.total.totalTokens,
        revised,
        auditScore: auditResult.overallScore,
      })

      return {
        chapterNumber,
        title: chapterOutline?.title || `第${chapterNumber}章`,
        wordCount: currentWordCount,
        content: currentContent,
        auditResult,
        revised,
        postReviseCount,
        status,
        tokenUsage,
        durationMs: totalDuration,
        stageTimings,
      }
    } catch (error) {
      const totalDuration = Math.round(performance.now() - startTime)
      logger.error(`[Pipeline] 第${chapterNumber}章流水线失败:`, error)

      trackGenerationFail({
        chapterNumber,
        durationMs: totalDuration,
        errorCategory: error instanceof Error ? error.constructor.name : 'unknown',
      })

      // 返回失败结果
      return {
        chapterNumber,
        title: `第${chapterNumber}章`,
        wordCount: 0,
        content: '',
        auditResult: {
          passed: false,
          overallScore: 0,
          issues: [{
            severity: 'critical',
            category: 'pipeline',
            description: `流水线执行失败: ${error instanceof Error ? error.message : String(error)}`,
            suggestion: '请检查AI服务配置和网络连接',
          }],
          summary: '流水线执行失败',
          dimensionScores: {},
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        revised: false,
        postReviseCount: 0,
        status: 'audit-failed',
        tokenUsage,
        durationMs: totalDuration,
        stageTimings,
      }
    }
  }

  // ============================================================================
  // Phase 执行方法
  // ============================================================================

  /**
   * Phase 1: 规划阶段
   */
  private async executePlanPhase(
    project: Project,
    chapterNumber: number,
    chapterOutline: ChapterOutline | undefined,
    previousEndingExcerpt: string | undefined,
    externalContext: string | undefined,
    hookPool: HookEntry[],
    recentSummaries: string[],
  ): Promise<PlanChapterOutput> {
    // 构建 ChapterIntent（从大纲提取）
    const intent = {
      chapter: chapterNumber,
      goal: chapterOutline?.goals?.join('；') || `推进第${chapterNumber}章剧情`,
      mustKeep: [
        ...(chapterOutline?.foreshadowingToPlant || []).map(f => `埋设伏笔: ${f}`),
        ...(chapterOutline?.foreshadowingToResolve || []).map(f => `回收伏笔: ${f}`),
      ],
      mustAvoid: ['泄露未来章节信息', '引入未计划的新角色'],
      styleEmphasis: [],
      outlineReference: chapterOutline ? JSON.stringify(chapterOutline, null, 2) : undefined,
    }

    // 构建 ChapterMemo
    const memo: ChapterMemo = {
      goal: intent.goal,
      currentTasks: chapterOutline?.goals?.join('；') || '',
      payoffOrHold: chapterOutline?.foreshadowingToResolve?.join('；') || '暂不掀牌',
      dailyTransitionFunction: '',
      threeQuestionCheck: '',
      chapterEndChanges: '',
      hardDonts: '不得泄露后续剧情；不得出现OOC行为',
      bodySkeleton: chapterOutline?.scenes?.map(s => s.description).join(' → ') || '',
    }

    const intentMarkdown = [
      `# 第${chapterNumber}章执行计划`,
      `## 目标: ${intent.goal}`,
      intent.mustKeep.length > 0 ? `## 必须保留\n${intent.mustKeep.map(m => `- ${m}`).join('\n')}` : '',
      `## 禁止事项\n${intent.mustAvoid.map(a => `- ${a}`).join('\n')}`,
      externalContext ? `## 用户指导\n${externalContext}` : '',
    ].filter(Boolean).join('\n')

    return { intent, memo, intentMarkdown }
  }

  /**
   * Phase 3: 写作阶段
   * 通过 AI Store 调用 LLM 生成章节正文
   */
  private async executeWritePhase(
    project: Project,
    chapterNumber: number,
    chapterOutline: ChapterOutline | undefined,
    composeOutput: ComposeChapterOutput,
    planOutput: PlanChapterOutput,
    lengthSpec: LengthSpec,
    temperatureOverride?: number,
  ): Promise<{ content: string; title: string; wordCount: number; tokenUsage: TokenUsage }> {
    const { contextPackage, ruleStack } = composeOutput
    const { memo, intentMarkdown } = planOutput

    // 构建写作 prompt
    const systemParts: string[] = []
    systemParts.push('你是一位专业的网络小说写手。请根据以下信息撰写完整章节。')
    systemParts.push('')
    systemParts.push('## 写作规则')
    systemParts.push(`1. 目标字数：${lengthSpec.target}字（${lengthSpec.softMin}-${lengthSpec.softMax}）`)
    systemParts.push('2. 保持叙事连贯性')
    systemParts.push('3. 遵循章节备忘和大纲指引')
    systemParts.push('4. 不引入未计划的支线或角色')

    if (ruleStack.prohibitions.length > 0) {
      systemParts.push('')
      systemParts.push('## 禁止事项')
      for (const p of ruleStack.prohibitions) {
        systemParts.push(`- ${p}`)
      }
    }

    if (ruleStack.styleGuide) {
      systemParts.push('')
      systemParts.push(`## 文风指南\n${ruleStack.styleGuide}`)
    }

    // 注入写作方法论
    const methodology = buildWritingMethodologySection()
    systemParts.push('')
    systemParts.push(methodology)

    systemParts.push('')
    systemParts.push('直接输出章节正文（包含标题），不要添加任何解释或标记。')

    const userParts: string[] = []

    // 项目设定
    if (contextPackage.storyBible) {
      userParts.push(`## 项目设定\n${contextPackage.storyBible}`)
    }

    // 当前状态
    if (contextPackage.currentState) {
      userParts.push(`## 当前状态\n${contextPackage.currentState}`)
    }

    // 角色信息
    if (contextPackage.characterMatrix) {
      userParts.push(`## 角色信息\n${contextPackage.characterMatrix}`)
    }

    // 伏笔
    if (contextPackage.hookSnapshot) {
      userParts.push(`## 伏笔池\n${contextPackage.hookSnapshot}`)
    }

    // 章节摘要
    if (contextPackage.chapterSummaries) {
      userParts.push(`## 前文摘要\n${contextPackage.chapterSummaries}`)
    }

    // 最近章节
    if (contextPackage.recentChapters.length > 0) {
      userParts.push(`## 最近章节\n${contextPackage.recentChapters.join('\n\n---\n\n')}`)
    }

    // 大纲
    if (contextPackage.volumeOutline) {
      userParts.push(`## 大纲\n${contextPackage.volumeOutline}`)
    }

    // 章节计划
    userParts.push(`## 章节计划\n${intentMarkdown}`)

    // 章节备忘
    userParts.push(`## 章节备忘
- 目标: ${memo.goal}
- 当前任务: ${memo.currentTasks}
- 兑现/暂不掀: ${memo.payoffOrHold}
- 章尾变化: ${memo.chapterEndChanges}
- 绝对不要: ${memo.hardDonts}
- 骨架: ${memo.bodySkeleton}`)

    // 叙事控制块：将 memo 渲染为 7 段叙事结构指令
    try {
      const narrativeBlock = renderNarrativeControl(memo, chapterNumber)
      userParts.push(narrativeBlock)
    } catch (err) {
      logger.warn('[Pipeline] 叙事控制块渲染失败（不阻断写作）:', err)
    }

    // 用户方向指导
    // (externalContext 已融入 intentMarkdown)

    const aiStore = await this.getAIStore()
    if (!aiStore.checkInitialized()) {
      throw new Error('AI服务未初始化，请先配置模型提供商')
    }

    const temperature = temperatureOverride ?? this.config.temperatureBase

    const response: ChatResponse = await withRetry(
      () => aiStore.chat(
        [
          { role: 'system', content: systemParts.join('\n') },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced',
        },
        { maxTokens: 8000, temperature }
      ),
      'Writer',
      WRITER_RETRY_CONFIG,
    )

    const content = response.content || ''
    const wordCount = countChars(content)
    const title = chapterOutline?.title || `第${chapterNumber}章`

    const tokenUsage: TokenUsage = {
      inputTokens: response.usage?.inputTokens || 0,
      outputTokens: response.usage?.outputTokens || 0,
      totalTokens: response.usage?.totalTokens || 0,
    }

    return { content, title, wordCount, tokenUsage }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  private emitProgress(stage: string, detail: string): void {
    this.config.onStageProgress?.(stage, detail)
    logger.debug(`[Pipeline] Stage: ${stage} — ${detail}`)
  }

  private emitTrace(agent: string, stage: string, status: AgentTraceEvent['status'], detail?: string): void {
    this.config.onAgentTrace?.({
      agent,
      stage,
      status,
      detail,
      timestamp: Date.now(),
    })
  }

}

// ============================================================================
// TokenUsage 辅助函数
// ============================================================================

function addTokenUsage(target: TokenUsage, source: TokenUsage): void {
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
  target.totalTokens += source.totalTokens
}

function sumTokenUsages(summary: TokenUsageSummary): TokenUsage {
  const keys: Array<keyof TokenUsageSummary> = [
    'planner', 'composer', 'writer', 'normalizer', 'auditor', 'reviser', 'settler', 'analyzer',
  ]
  const total: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for (const key of keys) {
    addTokenUsage(total, summary[key])
  }
  return total
}
