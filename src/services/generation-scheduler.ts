import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { useSandboxStore } from '@/stores/sandbox'
import { useTaskManager } from '@/stores/taskManager'
import { v4 as uuidv4 } from 'uuid'
import type { Chapter } from '@/types'
import { generateId } from '@/utils/generateId'
import type { StateEvent } from '@/types/sandbox'
import type { ExtractedPlotEvent, ExtractPlotEventsOutput } from '@/types/deep-import'
import { buildChapterContext, contextToPromptPayload } from '@/utils/contextBuilder'
import { extendOutlineWithLLM } from '@/utils/llm/outlineGenerator'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { syncCompletedChapter } from '@/services/outline-sync'
import type { ChatMessage } from '@/types/ai'
import { useAuditLog } from '@/composables/useAuditLog'
import { getLogger } from '@/utils/logger'
import { AIError, toAppError, ErrorCode } from '@/utils/errors'
import type { AgentConfig } from '@/agents/types'
import { measureAsync } from '@/utils/performance'
import {
  BatchGenerationOptions,
  buildGenerationOptions,
  hasHighImpactContent
} from './generation/types'
import { PipelineRunner } from './pipeline/PipelineRunner'
import type { PipelineConfig, ChapterPipelineResult, WriteNextChapterOptions } from './pipeline/types'
import {
  enqueuePostGenerationAgents,
  runPreGenerationAgents,
  updateProjectSettings,
  consultPlanner,
  runExtractionInBackground
} from './generation/agent-orchestrator'

const logger = getLogger('generation:scheduler')

export class GenerationScheduler {

  // 使用 generationRunId 作为唯一运行标识，替代共享的 isBatchCancelled 标志
  // 每次新生成或取消都递增 runId，旧运行通过 runId 不匹配自动失效
  private currentRunId = 0
  private agentQueue: Promise<void> = Promise.resolve()

  // Pipeline 相关 — 默认启用，旧路径保留为 fallback
  private pipeline: PipelineRunner | null = null
  private usePipeline = true  // 默认启用 Pipeline

  constructor() {
    // 构造时自动初始化 Pipeline
    this.pipeline = new PipelineRunner()
    logger.info('[GenerationScheduler] Pipeline 模式默认已启用')
  }

  /**
   * 配置 Pipeline 参数
   */
  public enablePipeline(config?: Partial<PipelineConfig>): void {
    this.pipeline = new PipelineRunner(config)
    this.usePipeline = true
    logger.info('[GenerationScheduler] Pipeline 模式已启用（重新配置）')
  }

  /**
   * 禁用 Pipeline 模式（回退到原有逻辑）
   */
  public disablePipeline(): void {
    this.usePipeline = false
    this.pipeline = null
    logger.info('[GenerationScheduler] Pipeline 模式已禁用，回退到传统模式')
  }

  /**
   * 获取 Pipeline 实例
   */
  public getPipeline(): PipelineRunner | null {
    return this.pipeline
  }

  /**
   * 是否启用了 Pipeline 模式
   */
  public isPipelineEnabled(): boolean {
    return this.usePipeline && this.pipeline !== null
  }

  /**
   * 通过 Pipeline 执行单章写作
   */
  public async writeChapterWithPipeline(options: WriteNextChapterOptions): Promise<ChapterPipelineResult> {
    if (!this.pipeline) {
      throw new Error('Pipeline 未启用，请先调用 enablePipeline()')
    }
    return measureAsync("generation:writeChapterWithPipeline", () => this.pipeline!.writeNextChapter(options))
  }

  /**
   * 通过 Pipeline 执行批量续写（保留中断/恢复能力）
   */
  public async executeBatchWithPipeline(
    batchOptions: BatchGenerationOptions,
    pipelineConfig?: Partial<PipelineConfig>
  ): Promise<ChapterPipelineResult[]> {
    const projectStore = useProjectStore()
    const aiStore = useAIStore()
    const taskManager = useTaskManager()

    const currentProject = projectStore.currentProject
    if (!currentProject || !aiStore.checkInitialized()) {
      throw new Error('系统未初始化或项目未加载')
    }

    // 确保 Pipeline 已初始化
    if (!this.pipeline) {
      this.pipeline = new PipelineRunner(pipelineConfig)
    } else if (pipelineConfig) {
      this.pipeline.updateConfig(pipelineConfig)
    }

    this.currentRunId += 1
    const runId = this.currentRunId

    const batchTask = taskManager.createTask({
      title: 'Pipeline 批量续写',
      description: '初始化 Pipeline...',
      cancellable: true,
      onCancel: () => this.cancelBatchGeneration(),
    })

    const results: ChapterPipelineResult[] = []

    try {
      for (let i = 0; i < batchOptions.count; i++) {
        // 中断检查
        if (this.isRunCancelled(runId)) {
          taskManager.failTask(batchTask.id, '已被用户手动终止')
          break
        }

        const chapterNumber = batchOptions.startChapter + i
        const progress = Math.round((i / batchOptions.count) * 100)

        taskManager.updateTask(batchTask.id, {
          progress,
          description: `Pipeline: 正在处理第 ${chapterNumber} 章 (${i + 1}/${batchOptions.count})`,
        })

        // 断点审查
        if (batchOptions.enableCheckpoint && batchOptions.checkpointInterval && i > 0 && i % batchOptions.checkpointInterval === 0) {
          taskManager.updateTask(batchTask.id, { description: `已完成 ${i} 章，等待人工审查...` })
          const shouldContinue = batchOptions.callbacks?.onCheckpointConfirm
            ? await batchOptions.callbacks.onCheckpointConfirm(i)
            : true
          if (!shouldContinue) {
            this.cancelBatchGeneration()
            taskManager.failTask(batchTask.id, '于检查点处由用户手动终止')
            break
          }
        }

        // 大纲自动翻页
        const currentOutlineLength = currentProject.outline.chapters.length
        if (currentOutlineLength > 0 && chapterNumber >= currentOutlineLength - 4) {
          try {
            const { extendOutlineWithLLM } = await import('@/utils/llm/outlineGenerator')
            const newOutlines = await extendOutlineWithLLM(currentProject, currentOutlineLength + 1, 20)
            if (newOutlines && newOutlines.length > 0) {
              currentProject.outline.chapters.push(...newOutlines)
              await projectStore.saveCurrentProject()
            }
          } catch (err) {
            logger.error('Pipeline: 大纲翻页失败:', err)
          }
        }

        // 设置进度回调
        if (this.pipeline) {
          this.pipeline.updateConfig({
            ...pipelineConfig,
            onStageProgress: (stage, detail) => {
              taskManager.updateTask(batchTask.id, {
                description: `[${chapterNumber}章] ${stage}: ${detail}`,
              })
            },
          })
        }

        // 执行 Pipeline (per-chapter error recovery)
        let result: ChapterPipelineResult | null = null
        try {
          result = await this.pipeline!.writeNextChapter({
            project: currentProject,
            chapterNumber,
            externalContext: batchOptions.rewrite?.directionPrompt,
          })
        } catch (chapterErr) {
          const errMsg = chapterErr instanceof Error ? chapterErr.message : String(chapterErr)
          logger.error('Pipeline: 第 ' + chapterNumber + ' 章生成失败，跳过并继续', chapterErr)
          taskManager.addToast('第 ' + chapterNumber + ' 章生成失败: ' + errMsg + '，已跳过', 'error')
          continue
        }
        if (!result) continue
        results.push(result)

        // 保存章节
        if (result.content && batchOptions.autoSave) {
          const chapter: Chapter = {
            id: generateId(),
            number: chapterNumber,
            title: result.title,
            content: result.content,
            wordCount: result.wordCount,
            summary: '',
            outline: currentProject.outline.chapters[chapterNumber - 1] || {
              chapterId: generateId(),
              title: result.title,
              scenes: [],
              characters: [],
              location: '',
              goals: [],
              conflicts: [],
              resolutions: [],
              foreshadowingToPlant: [],
              foreshadowingToResolve: [],
              status: 'completed',
            },
            status: 'draft',
            generatedBy: 'ai' as const,
            generationTime: new Date(),
            checkpoints: [],
            aiSuggestions: [],
            qualityScore: result.auditResult.overallScore,
          }
          await projectStore.saveChapter(chapter)
        }

        // 章间冷却
        if (i < batchOptions.count - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      if (!this.isRunCancelled(runId)) {
        taskManager.completeTask(batchTask.id, `Pipeline 完成 ${results.length} 个章节`)
        batchOptions.callbacks?.onBatchComplete?.(results.length)
      }
    } catch (error) {
      logger.error('Pipeline 批量续写失败:', error)
      taskManager.failTask(batchTask.id, error instanceof Error ? error.message : String(error))
    }

    return results
  }

  public cancelBatchGeneration() {
    this.currentRunId += 1
  }

  /**
   * 检查当前运行是否已被取消或被新运行取代
   */
  private isRunCancelled(runId: number): boolean {
    return runId !== this.currentRunId
  }

  public async executeBatchGeneration(options: BatchGenerationOptions) {
    const projectStore = useProjectStore()
    const aiStore = useAIStore()
    const taskManager = useTaskManager()
    const sandboxStore = useSandboxStore()

    const currentProject = projectStore.currentProject
    if (!currentProject || !aiStore.checkInitialized()) {
      throw new Error('系统未初始化或项目未加载')
    }

    this.currentRunId += 1
    const generationRunId = this.currentRunId

    // Pre-resolve dynamic imports used inside the loop to avoid repeated module loading
    const [{ validateChapterLogic }, { usePluginStore }, { createQualityChecker }, { RewriteContinuationService }, { EXTRACT_PLOT_EVENTS_SCHEMA, PLOT_EXTRACTION_SYSTEM }, { safeParseAIJson }] = await Promise.all([
      import('@/utils/llm/antiRetconValidator'),
      import('@/stores/plugin'),
      import('@/utils/qualityChecker'),
      import('@/services/rewrite-continuation'),
      import('@/services/deep-import-schemas'),
      import('@/utils/safeParseAIJson')
    ])

    const batchTask = taskManager.createTask({
      title: '批量章节生成',
      description: '初始化生成环境...',
      cancellable: true,
      onCancel: () => this.cancelBatchGeneration()
    })

    const stagedChaptersForFinalSave: Chapter[] = []
    let isFlushing = false

    const flushStagedChapters = async () => {
      if (options.autoSave || stagedChaptersForFinalSave.length === 0 || isFlushing) {
        return
      }

      isFlushing = true
      const flushedIds = new Set<string>()

      try {
        for (const stagedChapter of stagedChaptersForFinalSave) {
          try {
            await projectStore.saveChapter(stagedChapter)
            flushedIds.add(stagedChapter.id)
          } catch (e) {
            logger.error(`补偿保存章节 ${stagedChapter.number} 失败:`, e)
          }
        }

        await projectStore.saveCurrentProject()

        // Remove successfully flushed chapters; keep failed ones for potential retry
        for (let i = stagedChaptersForFinalSave.length - 1; i >= 0; i--) {
          if (flushedIds.has(stagedChaptersForFinalSave[i].id)) {
            stagedChaptersForFinalSave.splice(i, 1)
          }
        }
      } finally {
        isFlushing = false
      }
    }

    try {
      const shouldRunAntiRetcon = options.extraction?.enableAntiRetcon ?? currentProject.config?.enableLogicValidator ?? false

      // Build chapter number index for O(1) lookups in batch loop
      const chapterByNumber = new Map(currentProject.chapters.map(c => [c.number, c]))
      const normalizedProjectConfig = normalizeProjectConfig(currentProject.config)
      const vectorConfig = normalizedProjectConfig.enableVectorRetrieval
        ? normalizedProjectConfig.vectorConfig
        : undefined
      const contextWindow = normalizedProjectConfig.advancedSettings?.maxContextTokens ?? 128000

      for (let i = 0; i < options.count; i++) {
        if (this.isRunCancelled(generationRunId)) {
          taskManager.failTask(batchTask.id, '已被用户手动终止')
          break
        }

        const chapterNumber = options.startChapter + i
        const progress = Math.round((i / options.count) * 100)

        taskManager.updateTask(batchTask.id, {
          progress,
          description: `正在处理第 ${chapterNumber} 章 (${i+1}/${options.count})`
        })

        // V4-P1-⑦: 断点审查 (每 N 章暂停要求人工确认)
        if (options.enableCheckpoint && options.checkpointInterval && i > 0 && i % options.checkpointInterval === 0) {
            taskManager.updateTask(batchTask.id, { description: `已完成 ${i} 章生成，等待人工审查...` })
            const shouldContinue = options.callbacks?.onCheckpointConfirm
              ? await options.callbacks.onCheckpointConfirm(i)
              : true
            if (!shouldContinue) {
              this.cancelBatchGeneration()
              taskManager.failTask(batchTask.id, '于检查点处由用户手动终止')
              break
            }
            taskManager.updateTask(batchTask.id, { description: `审查放行，继续生成第 ${chapterNumber} 章...` })
        }

        // ================= 滚动大纲生成检测 =================
        const currentOutlineLength = currentProject.outline.chapters.length
        if (currentOutlineLength > 0 && chapterNumber >= currentOutlineLength - 4) {
          taskManager.updateTask(batchTask.id, { description: `即将耗尽大纲, AI 正在续写 ${currentOutlineLength + 1} 到 ${currentOutlineLength + 20} 段大纲` })
          try {
            const newOutlines = await extendOutlineWithLLM(currentProject, currentOutlineLength + 1, 20)
            if (newOutlines && newOutlines.length > 0) {
              currentProject.outline.chapters.push(...newOutlines)
              const lastVolume = currentProject.outline.volumes[currentProject.outline.volumes.length - 1]
              if (lastVolume) lastVolume.endChapter += newOutlines.length
              await projectStore.saveCurrentProject()
              taskManager.addToast(`大纲自动翻页成功！扩展了 ${newOutlines.length} 章路线`, 'success')
            }
          } catch (err) {
            logger.error('大纲续写失败:', err)
            taskManager.addToast('大纲自动翻页失败，将强行生成', 'warning')
          }
        }
        // ===================================================

        // 获取或构建当前章结构
        const existingChapter = chapterByNumber.get(chapterNumber)
        const chapterData: Chapter = existingChapter ? {
          ...existingChapter,
          content: '',
          wordCount: 0,
          generatedBy: 'ai' as const,
          generationTime: new Date()
        } : {
          id: uuidv4(),
          number: chapterNumber,
          title: `第${chapterNumber}章`,
          content: '',
          wordCount: 0,
          summary: '',
          outline: {
            chapterId: uuidv4(),
            title: `第${chapterNumber}章`,
            scenes: [],
            characters: [],
            location: '',
            goals: [],
            conflicts: [],
            resolutions: [],
            foreshadowingToPlant: [],
            foreshadowingToResolve: [],
            status: 'planned'
          },
          status: 'draft',
          generatedBy: 'ai' as const,
          generationTime: new Date(),
          checkpoints: [],
          aiSuggestions: []
        }

        await runPreGenerationAgents(chapterData, normalizedProjectConfig.agentConfigs ?? [])

        // 构建上下文
        taskManager.updateTask(batchTask.id, { description: `正在编织第 ${chapterNumber} 章记忆矩阵...` })

        const context = await buildChapterContext(
          currentProject,
          chapterData,
          vectorConfig,
          contextWindow,
          options.rewrite?.directionPrompt
        )

        const targetWords = currentProject.config?.advancedSettings?.targetWordCount || 2000
        const promptPayload = contextToPromptPayload(context, chapterData.title, targetWords)

        if (context.warnings.length > 0) {
          taskManager.addToast(`第 ${chapterNumber} 章上下文截断: ${context.warnings[0]}`, 'warning')
        }

        const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }
        const generationOptions = buildGenerationOptions(currentProject.config?.advancedSettings)

        let finalContent = ''
        const maxRetries = 3

        // V3-fix: messages 放在循环外，让重试时的对话修复上下文不被丢弃
        const messages: ChatMessage[] = [
          { role: 'system', content: promptPayload.systemMessage },
          { role: 'user', content: promptPayload.userMessage }
        ]

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          taskManager.updateTask(batchTask.id, { description: `[${context.totalTokens} Tokens] 核心推理中${attempt > 1 ? ` (第${attempt}次修正重试)` : ''}...` })

          chapterData.content = ''
          let response
          try {
            response = await aiStore.chatStream(
              messages,
              (event) => {
                if (event.type === 'chunk' && event.chunk) {
                  chapterData.content += event.chunk
                }
              },
              aiContext,
              generationOptions
            )
          } catch (streamError) {
            logger.warn(`第 ${chapterNumber} 章流式失败，回退普通模式:`, streamError)
            taskManager.updateTask(batchTask.id, { description: `流式被降级，重连执行后备通道...` })
            response = await aiStore.chat(messages, aiContext, generationOptions)
          }

          finalContent = response.content.trim()

          // ================= 吃书预警与修复拦截层 =================
          if (shouldRunAntiRetcon) {
            const vResult = await validateChapterLogic(currentProject, chapterData.outline, finalContent)

            if (!vResult.passed) {
              const warnMsg = `第 ${chapterNumber} 章触发吃书警告: ${vResult.reason}`
              taskManager.addToast(warnMsg, 'warning')
              logger.warn(warnMsg)

              if (attempt < maxRetries) {
                // V4-D3：先询问规划师，检查 PlotBeat 本身是否有矛盾
                const violationDescs = (vResult.violations || []).map(v =>
                  typeof v === 'string' ? v : `[${v.category}] ${v.description}`
                )

                // V4-P2-⑧: 记录哨兵警告日志
                const { addLog } = useAuditLog()
                addLog({
                  type: 'warning',
                  title: '触发防吃书哨兵',
                  description: warnMsg,
                  chapterNumber,
                  metadata: { violations: vResult.violations }
                })

                const plotBeatReview = await consultPlanner(
                  chapterData.outline, violationDescs
                )

                if (plotBeatReview.needsRevision && plotBeatReview.revisedOutline) {
                  // PlotBeat 有问题 → 先修大纲再让写手重写
                  taskManager.updateTask(batchTask.id, { description: `规划师已修正大纲，正在重新生成第 ${chapterNumber} 章...` })
                  Object.assign(chapterData.outline, plotBeatReview.revisedOutline)

                  addLog({
                    type: 'ai_decision',
                    title: '规划师介入：修正预设大纲',
                    description: `写入模型未能收束逻辑，经过规划师审查后修正了第 ${chapterNumber} 章大纲。原因：${plotBeatReview.reason}`,
                    chapterNumber,
                    metadata: { outline: plotBeatReview.revisedOutline }
                  })

                  const revisedContext = await buildChapterContext(
                    currentProject,
                    chapterData,
                    vectorConfig,
                    contextWindow,
                    options.rewrite?.directionPrompt
                  )
                  const revisedPayload = contextToPromptPayload(revisedContext, chapterData.title, targetWords)
                  messages.length = 0
                  messages.push(
                    { role: 'system', content: revisedPayload.systemMessage },
                    { role: 'user', content: revisedPayload.userMessage }
                  )
                } else {
                  // PlotBeat 没问题 → 正常走写手局部修补
                  addLog({
                    type: 'ai_decision',
                    title: '写手局部修补',
                    description: `规划师判定大纲正常，指令写手进行局部修复。修复建议：${vResult.suggestedFixPrompt}`,
                    chapterNumber
                  })

                  messages.push(
                    { role: 'assistant', content: finalContent },
                    { role: 'user', content: `【校验系统检测到一致性错误】\n驳回理由：${vResult.reason}\n\n修复指令：${vResult.suggestedFixPrompt}\n\n请仅修正上述错误，输出修正后的完整章节正文。保留无问题的部分不变。` }
                  )
                }
                continue
              } else {
                taskManager.addToast(`第 ${chapterNumber} 章反复冲突，已达到容错上限，强制放行`, 'error')
              }
            }
          }

          break
        }

        chapterData.content = finalContent
        chapterData.wordCount = chapterData.content.length

        // Plugins and Post Processing
        const pluginStore = usePluginStore()
        const processorRegistry = pluginStore.getRegistries().processor
        try {
          const postResult = await processorRegistry.processPipeline(
            'post-generation',
            { chapter: chapterData, project: currentProject },
            { project: currentProject, chapter: chapterData, config: currentProject.config }
          )
          const resultChapter = (postResult as Record<string, unknown> | null)?.chapter as Record<string, unknown> | undefined
          if (resultChapter && typeof resultChapter.content === 'string') {
            chapterData.content = resultChapter.content
            chapterData.wordCount = chapterData.content.length
          }
        } catch (err: unknown) { logger.error(err instanceof Error ? err.message : 'Post-generation pipeline failed') }

        // Quality Check
        if (currentProject.config?.enableQualityCheck) {
          try {
            const loreEntities = Object.values(sandboxStore.activeEntitiesState).filter(e => e.type === 'LORE')
            const characterEntities = Object.values(sandboxStore.activeEntitiesState).filter(e => e.type === 'CHARACTER')
            const checker = createQualityChecker(loreEntities, characterEntities, currentProject.outline, currentProject.config)
            const report = await checker.checkChapter(chapterData)
            chapterData.qualityScore = report.overallScore
          } catch(e) {
            const err = toAppError(e, '质量检查失败');
            logger.warn(`[${err.code}] 质量检查失败:`, err.message);
          }
        }

        // 保存更新
        if (options.autoSave) {
          await projectStore.saveChapter(chapterData)
        } else {
          const existingIndex = currentProject.chapters.findIndex(ch => ch.number === chapterNumber)
          if (existingIndex >= 0) {
            currentProject.chapters[existingIndex] = chapterData
            chapterByNumber.set(chapterNumber, chapterData)
          } else {
            currentProject.chapters.push(chapterData)
          }

          const stagedIndex = stagedChaptersForFinalSave.findIndex(ch => ch.id === chapterData.id)
          if (stagedIndex >= 0) {
            stagedChaptersForFinalSave[stagedIndex] = chapterData
          } else {
            stagedChaptersForFinalSave.push(chapterData)
          }
        }

        const outlineSyncResults = syncCompletedChapter(currentProject, chapterData)
        if (outlineSyncResults.length > 0 && options.autoSave) {
          await projectStore.saveCurrentProject()
        }

        // Update currentChapter so next chapter's context sees latest state
        sandboxStore.currentChapter = chapterNumber

        const hasHighImpact = hasHighImpactContent(chapterData.content)

        if (normalizedProjectConfig.enableAutoReview) {
          this.agentQueue = enqueuePostGenerationAgents(
            this.agentQueue,
            this.isRunCancelled.bind(this),
            updateProjectSettings,
            chapterData,
            normalizedProjectConfig.agentConfigs ?? [],
            generationRunId
          )
        }

        if (options.autoUpdateSettings) {
          // V4-P1-⑥: 语义边界切片触发 - 仅在高影响事件时进行完整状态提取

          if (hasHighImpact || chapterNumber % 5 === 0) {
            // V4-D2: 同步等待状态提取完成，确保第 N+1 章能看到第 N 章的状态变更
            taskManager.updateTask(batchTask.id, { description: `正在同步角色状态（第 ${chapterNumber} 章）...` })

            // V5 Tool Calling: Extract state events and dispatch to sandboxStore
            try {
              taskManager.updateTask(batchTask.id, { description: `正在抽取底层实体图谱状态...` })

              const entityNames = sandboxStore.entities
                .filter(e => e.type === 'CHARACTER')
                .map(e => e.name)
                .join('、')

              const extractionPrompt = `从以下章节中提取涉及角色【${entityNames}】的状态变化。
如果角色间的心理态度或亲密度发生重大变化，请输出 RELATION_UPDATE 事件并提供简短的 'attitude' 描述（20字以内）。
章节内容：
${chapterData.content}

如果没有变化，返回空数组。`;

              const schemaPayload = {
                name: "update_entity_state",
                description: "Extract state changes from the generated chapter text",
                strict: true,
                parameters: {
                  type: "object",
                  properties: {
                    events: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          entityName: { type: "string" },
                          eventType: { type: "string", enum: ['PROPERTY_UPDATE', 'RELATION_ADD', 'RELATION_UPDATE', 'LOCATION_MOVE', 'VITAL_STATUS_CHANGE', 'ABILITY_CHANGE'] },
                          details: { type: "string" },
                          attitude: { type: "string", description: "Only used for RELATION_UPDATE to describe psychological attitude/affinity, max 20 chars" }
                        },
                        required: ["entityName", "eventType", "details"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["events"],
                  additionalProperties: false
                }
              };

              const extractionRes = await aiStore.chat(
                [
                  { role: 'system', content: 'You are a state extraction engine for a novel database. Only output valid JSON conforming to the tool schema.' },
                  { role: 'user', content: extractionPrompt }
                ],
                { type: 'check', complexity: 'medium', priority: 'speed' },
                {
                  maxTokens: 1000,
                  tools: [schemaPayload],
                  toolChoice: { type: "function", function: { name: "update_entity_state" } }
                }
              );

              // Parse and dispatch extraction results to sandboxStore
              try {
                const parsed = safeParseAIJson<{ events?: Array<Record<string, unknown>> }>(extractionRes.content)
                const extractedEvents = Array.isArray(parsed?.events)
                  ? (parsed!.events as Array<{ entityName: string; targetName?: string; eventType: string; description: string }>)
                  : (() => {
                      try {
                        const raw = JSON.parse(extractionRes.content)
                        const args = raw?.tool_calls?.[0]?.function?.arguments
                        if (!args) return []
                        const toolParsed = JSON.parse(args)
                        return Array.isArray(toolParsed.events) ? toolParsed.events : []
                      } catch { logger.debug('Agent parse failed, returning empty'); return [] }
                    })()

                const stateEventsToPersist: StateEvent[] = []
                for (const evt of extractedEvents) {
                  const entity = sandboxStore.entities.find(e => e.name === evt.entityName)
                  if (!entity) continue

                  stateEventsToPersist.push({
                    id: uuidv4(),
                    projectId: currentProject.id,
                    chapterNumber,
                    entityId: entity.id,
                    eventType: evt.eventType,
                    payload: {
                      value: evt.details,
                      attitude: evt.attitude
                    },
                    source: 'AI_EXTRACTED'
                  })
                }

                if (stateEventsToPersist.length > 0) {
                  await sandboxStore.batchAddStateEvents(stateEventsToPersist)
                }

                logger.debug(`[V5 State Extraction] Dispatched ${stateEventsToPersist.length} events for chapter ${chapterNumber}`)
              } catch (parseErr) {
                logger.warn('V5 状态提取结果解析失败', parseErr)
              }
            } catch (err) {
              logger.warn('状态抽取失败', err);
            }

            await runExtractionInBackground(chapterData)
          } else {
            logger.debug(`[状态追踪] 第${chapterNumber}章无高影响事件，跳过状态提取`)
          }
        }

        // Plot event extraction when enabled (continuation/rewrite workflow)
        if (options.extraction?.extractPlotEvents) {
          try {
            taskManager.updateTask(batchTask.id, { description: `正在提取第 ${chapterNumber} 章情节事件...` })

            const plotRes = await aiStore.chat(
              [
                { role: 'system', content: PLOT_EXTRACTION_SYSTEM },
                { role: 'user', content: `章节标题：${chapterData.title}\n章节编号：${chapterNumber}\n\n${chapterData.content}` }
              ],
              { type: 'check', complexity: 'low', priority: 'speed' },
              {
                maxTokens: 800,
                response_format: {
                  type: 'json_schema',
                  json_schema: EXTRACT_PLOT_EVENTS_SCHEMA
                }
              }
            )

            const plotParsed = safeParseAIJson<ExtractPlotEventsOutput>(plotRes.content)
            if (plotParsed && plotParsed.plotEvents.length > 0) {
              const nameToIdMap = sandboxStore.buildNameToIdMap()

              const records = RewriteContinuationService.convertPlotEvents(
                plotParsed.plotEvents as ExtractedPlotEvent[],
                currentProject.id,
                chapterNumber,
                nameToIdMap
              )

              if (!currentProject.plotEvents) currentProject.plotEvents = []
              currentProject.plotEvents.push(...records)
              logger.debug(`[Plot Events] Extracted ${records.length} plot events for chapter ${chapterNumber}`)
            }
          } catch (err) {
            logger.warn('Plot event extraction failed:', err)
          }
        }

        // Delay between chunks to respect API limits
        if (i < options.count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      await flushStagedChapters()

      if (!this.isRunCancelled(generationRunId)) {
        taskManager.completeTask(batchTask.id, `成功生成 ${options.count} 个章节`)
        options.callbacks?.onBatchComplete?.(options.count)
      }
    } catch (error) {
      if (!options.autoSave) {
        try {
          await flushStagedChapters()
        } catch (flushError) {
          logger.error('批量生成失败后补偿保存失败:', flushError)
        }
      }
      logger.error('批量生成失败:', error)
      taskManager.failTask(batchTask.id, error instanceof Error ? error.message : String(error))
    }
  }
}

export const generationScheduler = new GenerationScheduler()

// Re-export types for backward compatibility
export type { BatchGenerationOptions } from './generation/types'
export { hasHighImpactContent, buildGenerationOptions, HIGH_IMPACT_KEYWORDS } from './generation/types'
