import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { useSandboxStore } from '@/stores/sandbox'
import { useTaskManager } from '@/stores/taskManager'
import { v4 as uuidv4 } from 'uuid'
import { SummaryDetail } from '@/types'
import type { Chapter, ChapterOutline } from '@/types'
import type { Entity, StateEvent, EntityType, EntityImportance } from '@/types/sandbox'
import type { ExtractedPlotEvent, ExtractPlotEventsOutput } from '@/types/deep-import'
import { buildChapterContext, contextToPromptPayload } from '@/utils/contextBuilder'
import { extendOutlineWithLLM } from '@/utils/llm/outlineGenerator'
import { extractEntitiesWithAI, analyzeRelationships } from '@/utils/characterExtractor'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { syncCompletedChapter } from '@/services/outline-sync'
import type { ChatMessage } from '@/types/ai'
import { useAuditLog } from '@/composables/useAuditLog'
import { getLogger } from '@/utils/logger'
import { AgentOrchestrator } from '@/agents/AgentOrchestrator'
import { PlannerAgent } from '@/agents/PlannerAgent'
import { EditorAgent } from '@/agents/EditorAgent'
import { ReaderAgent } from '@/agents/ReaderAgent'
import type { AgentConfig } from '@/agents/types'

const logger = getLogger('generation:scheduler')

const HIGH_IMPACT_KEYWORDS = [
  '死', '伤', '去', '到', '回', '破', '境', '阶',
  '层', '宗', '门', '帮', '派', '遇', '得', '失',
  '战', '斗', '杀', '救', '突破', '晋升', '陨落',
  '死亡', '觉醒', '背叛', '加入', '离开', '获得',
  '失去', '重伤', '痊愈', '结盟', '决裂', '封印', '解封'
]

const HIGH_IMPACT_REGEX = new RegExp(HIGH_IMPACT_KEYWORDS.join('|'))

function hasHighImpactContent(text: string): boolean {
  return HIGH_IMPACT_REGEX.test(text)
}

export interface BatchGenerationOptions {
  startChapter: number
  count: number
  autoSave: boolean
  autoUpdateSettings: boolean
  enableCheckpoint?: boolean
  checkpointInterval?: number
  extraction?: {
    extractPlotEvents?: boolean
    enableAntiRetcon?: boolean
  }
  rewrite?: {
    directionPrompt?: string
  }
  callbacks?: {
    onCheckpointConfirm?: (chaptersGenerated: number) => Promise<boolean>
    onBatchComplete?: (chaptersGenerated: number) => void
  }
}

function buildGenerationOptions(advancedSettings?: {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}) {
  const maxTokens = advancedSettings?.maxTokens ?? 4000
  const temperature = advancedSettings?.temperature ?? 0.7
  const stopSequences = (advancedSettings?.stopSequences || []).filter(Boolean)

  return {
    maxTokens,
    temperature,
    ...(stopSequences.length > 0 ? { stopSequences } : {})
  }
}

export class GenerationScheduler {
  
  private isBatchCancelled = false
  private generationRunId = 0
  private agentQueue: Promise<void> = Promise.resolve()

  public cancelBatchGeneration() {
    this.isBatchCancelled = true
    this.generationRunId += 1
  }

  private enqueuePostGenerationAgents(chapter: Chapter, configs: AgentConfig[], runId: number): void {
    const chapterSnapshot = { ...chapter }

    this.agentQueue = this.agentQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.isBatchCancelled || runId !== this.generationRunId) return

        const projectStore = useProjectStore()
        const project = projectStore.currentProject
        const normalizedConfig = normalizeProjectConfig(project?.config)
        if (!project || !normalizedConfig.enableAutoReview) return

        await this.runPostGenerationAgents(chapterSnapshot, normalizedConfig.agentConfigs ?? configs)
      })
      .catch(error => logger.warn('Agent 后处理失败:', error))
  }

  public async runExtractionInBackground(chapter: Chapter) {
    const taskManager = useTaskManager()
    const task = taskManager.createTask({
      title: `设定抽取: 第${chapter.number}章`,
      description: '正在分析事件与人物关系...',
      cancellable: false
    })

    try {
      await this.updateProjectSettings(chapter)
      
      const projectStore = useProjectStore()
      await projectStore.saveCurrentProject()
      
      taskManager.completeTask(task.id, '抽取与记忆入库成功')
      taskManager.addToast(`第${chapter.number}章事件已成功载入系统记忆树 🌲`, 'success')
    } catch (err) {
      logger.error('设定提取失败:', err)
      taskManager.failTask(task.id, err instanceof Error ? err.message : String(err))
    }
  }

  private async runPreGenerationAgents(chapter: Chapter, configs: AgentConfig[]): Promise<void> {
    const plannerConfigs = configs.filter(config => config.role === 'planner' && config.enabled && config.phase === 'pre-generation')
    if (plannerConfigs.length === 0) return

    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    if (!project) return

    const orchestrator = new AgentOrchestrator({
      agents: [new PlannerAgent()],
      configs: plannerConfigs,
      logger,
      onTrace: event => logger.debug('[Agent]', event),
    })

    const result = await orchestrator.runPhase('pre-generation', {
      phase: 'pre-generation',
      project,
      chapter,
      outline: chapter.outline,
    })

    for (const agentResult of result.results) {
      if (agentResult.role !== 'planner' || agentResult.status !== 'success') continue
      const refinedOutline = agentResult.data as Partial<ChapterOutline> | undefined
      if (!refinedOutline || typeof refinedOutline !== 'object') continue
      Object.assign(chapter.outline, refinedOutline)
      chapter.title = chapter.outline.title || chapter.title
    }
  }

  private async runPostGenerationAgents(chapter: Chapter, configs: AgentConfig[]): Promise<void> {
    const projectStore = useProjectStore()
    const project = projectStore.currentProject
    if (!project) return

    const orchestrator = new AgentOrchestrator({
      agents: [new EditorAgent(), new ReaderAgent()],
      configs: configs.filter(config => config.role === 'editor' || config.role === 'reader'),
      logger,
      onTrace: event => logger.debug('[Agent]', event),
    })

    await orchestrator.runPhase('post-generation', {
      phase: 'post-generation',
      project,
      chapter,
    })
  }

  private async updateProjectSettings(chapter: Chapter) {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()
    const project = projectStore.currentProject
    if (!project) return

    if (!project.config?.enableZeroTouchExtraction) return

    const { safeParseAIJson: parseAIJson } = await import('@/utils/safeParseAIJson')

    // 1. 全量提取实体（人物、词条、分水岭事件）
    const entities = await extractEntitiesWithAI(chapter.content)

    // 2. 无缝入库新角色 → V5 sandbox store
    const newEntities: Entity[] = []
    const newStateEvents: StateEvent[] = []
    if (entities && entities.characters.length > 0) {
      for (const nc of entities.characters) {
        const existing = sandboxStore.entities.find(e => e.type === 'CHARACTER' && e.name === nc.name)
        if (!existing) {
          const importanceMap: Record<string, EntityImportance> = {
            protagonist: 'critical',
            antagonist: 'critical',
            supporting: 'major',
            minor: 'minor',
            other: 'background'
          }
          const entity: Entity = {
            id: uuidv4(),
            projectId: project.id,
            type: 'CHARACTER' as EntityType,
            name: nc.name,
            aliases: [],
            importance: importanceMap[nc.role] || 'major',
            category: '角色',
            systemPrompt: nc.description,
            isArchived: false,
            createdAt: Date.now()
          }
          newEntities.push(entity)
        }
      }

      // 增量分析并更新关系图 → V5 StateEvents (use last 10 chapters for performance)
      const recentChapters = project.chapters.slice(-10)
      const allText = recentChapters.map(c => c.content).join('\n\n')
      const extChars = sandboxStore.entities
        .filter(e => e.type === 'CHARACTER')
        .map(e => ({ name: e.name, aliases: e.aliases, description: '', firstAppearance: '', role: 'other' as const, confidence: 1, occurrences: 1 }))
      const relations = analyzeRelationships(allText, extChars)

      for (const rel of relations) {
        const sourceEntity = sandboxStore.entities.find(e => e.type === 'CHARACTER' && e.name === rel.from)
          || newEntities.find(e => e.type === 'CHARACTER' && e.name === rel.from)
        const targetEntity = sandboxStore.entities.find(e => e.type === 'CHARACTER' && e.name === rel.to)
          || newEntities.find(e => e.type === 'CHARACTER' && e.name === rel.to)
        if (sourceEntity && targetEntity) {
          const existingRel = sandboxStore.stateEvents.find(
            e => e.entityId === sourceEntity.id && e.eventType === 'RELATION_ADD' && e.payload.targetId === targetEntity.id
          )
          if (!existingRel) {
            const event: StateEvent = {
              id: uuidv4(),
              projectId: project.id,
              chapterNumber: chapter.number,
              entityId: sourceEntity.id,
              eventType: 'RELATION_ADD',
              payload: {
                targetId: targetEntity.id,
                relationType: rel.type || 'other',
                attitude: '共现关系'
              },
              source: 'AI_EXTRACTED'
            }
            newStateEvents.push(event)
          }
        }
      }
    }

    // 3. 零触感录入世界体系 → V5 sandbox store (LORE entities)
    if (entities && entities.worldbook.length > 0) {
      for (const wb of entities.worldbook) {
        const existing = sandboxStore.entities.find(
          e => e.type === 'LORE' && e.name === wb.keyword
        )
        if (!existing) {
          const loreEntity: Entity = {
            id: uuidv4(),
            projectId: project.id,
            type: 'LORE' as EntityType,
            name: wb.keyword,
            aliases: [],
            importance: 'minor',
            category: wb.category || '设定',
            systemPrompt: wb.content,
            isArchived: false,
            createdAt: Date.now()
          }
          newEntities.push(loreEntity)
        }
      }
    }

    // 批量持久化所有新增实体和事件
    if (newEntities.length > 0) {
      await sandboxStore.batchAddEntities(newEntities)
    }
    if (newStateEvents.length > 0) {
      await sandboxStore.batchAddStateEvents(newStateEvents)
    }

    // 4. 重大历史转折点打标 (记录到章节关键事件中)
    if (entities && entities.events.length > 0) {
      const highImpactEvents = entities.events.filter(e => e.importance >= 4).map(e => `[影响力 ${e.importance}/10] ` + e.description)
      if (highImpactEvents.length > 0) {
        if (!chapter.summaryData) {
          chapter.summaryData = {
            id: uuidv4(),
            chapterNumber: chapter.number,
            title: chapter.title,
            summary: chapter.title,
            keyEvents: [],
            characters: [],
            locations: [],
            plotProgression: '',
            wordCount: chapter.wordCount,
            summaryWordCount: 0,
            tokenCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            detail: SummaryDetail.MINIMAL
          }
        }
        if (chapter.summaryData) {
          chapter.summaryData.keyEvents = [
            ...(chapter.summaryData.keyEvents || []),
            ...highImpactEvents
          ]
        }
      }
    }

    // 5. V5 状态追踪：基于高影响事件提取 StateEvents
    const hasAction = hasHighImpactContent(chapter.content)

    if (hasAction && project.config?.enableZeroTouchExtraction) {
      const aiStore = useAIStore()
      if (aiStore.checkInitialized()) {
        const prompts = mergeSystemPrompts(project.config?.systemPrompts)

        const entityNames = sandboxStore.entities
          .filter(e => e.type === 'CHARACTER')
          .map(e => e.name)
          .join('、')

        if (entityNames) {
          const extractPrompt = `分析以下章节内容，提取涉及角色【${entityNames}】的状态变化。

请严格按 JSON Schema 输出，包含以下事件类型：
- PROPERTY_UPDATE: 属性变化（如修为提升、受伤等）
- RELATION_ADD: 新增关系
- RELATION_UPDATE: 关系态度变化
- LOCATION_MOVE: 位置转移
- VITAL_STATUS_CHANGE: 生死状态变化
- ABILITY_CHANGE: 能力变化

章节内容：
${chapter.content.substring(0, 8000)}

如果没有变化，返回空数组。`

          try {
            const res = await aiStore.chat(
              [
                { role: 'system', content: prompts.extractor },
                { role: 'user', content: extractPrompt }
              ],
              { type: 'check', complexity: 'low', priority: 'speed' },
              {
                maxTokens: 1000,
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'extract_state_events',
                    strict: true,
                    schema: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        events: {
                          type: 'array',
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                              entityName: { type: 'string' },
                              eventType: { type: 'string', enum: ['PROPERTY_UPDATE', 'RELATION_ADD', 'RELATION_UPDATE', 'LOCATION_MOVE', 'VITAL_STATUS_CHANGE', 'ABILITY_CHANGE'] },
                              key: { type: 'string' },
                              value: { type: 'string' },
                              targetName: { type: 'string' },
                              relationType: { type: 'string' },
                              attitude: { type: 'string' },
                              status: { type: 'string' },
                              abilityName: { type: 'string' },
                              abilityStatus: { type: 'string' }
                            },
                            required: ['entityName', 'eventType']
                          }
                        }
                      },
                      required: ['events']
                    }
                  }
                }
              }
            )

            const parsed = parseAIJson<{ events?: Array<Record<string, unknown>> }>(res.content)
            const extractedEvents = (parsed?.events || []) as Array<{ entityName: string; targetName?: string; eventType: string; description: string; key?: string; value?: string; relationType?: string; attitude?: string; status?: string; abilityName?: string; abilityStatus?: string }>

            const stateEventsToSave: StateEvent[] = []
            for (const evt of extractedEvents) {
              const entity = sandboxStore.entities.find(e => e.name === evt.entityName)
              if (!entity) continue

              const targetEntity = evt.targetName
                ? sandboxStore.entities.find(e => e.name === evt.targetName)
                : undefined

              const stateEvent: StateEvent = {
                id: uuidv4(),
                projectId: project.id,
                chapterNumber: chapter.number,
                entityId: entity.id,
                eventType: evt.eventType as StateEvent['eventType'],
                payload: {
                  key: evt.key,
                  value: evt.value,
                  targetId: targetEntity?.id,
                  relationType: evt.relationType,
                  attitude: evt.attitude,
                  status: evt.status,
                  abilityName: evt.abilityName,
                  abilityStatus: evt.abilityStatus
                },
                source: 'AI_EXTRACTED'
              }
              stateEventsToSave.push(stateEvent)
            }
            if (stateEventsToSave.length > 0) {
              await sandboxStore.batchAddStateEvents(stateEventsToSave)
            }
          } catch (err) {
            logger.warn('V5 状态提取失败', err)
          }
        }
      }
    }
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

    this.generationRunId += 1
    const generationRunId = this.generationRunId
    this.isBatchCancelled = false

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
        if (this.isBatchCancelled) {
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

        await this.runPreGenerationAgents(chapterData, normalizedProjectConfig.agentConfigs ?? [])

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

                const plotBeatReview = await this.consultPlanner(
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
            logger.warn('质量检查失败:', e)
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
          this.enqueuePostGenerationAgents(
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
                      } catch { return [] }
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

            await this.runExtractionInBackground(chapterData)
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

      if (!this.isBatchCancelled) {
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

  /**
   * V4-D3: 规划师审查 — 当哨兵驳回章节时，检查 PlotBeat 本身是否有逻辑矛盾
   * 如果大纲有问题则返回修正后的大纲，否则让写手自行修补
   */
  private async consultPlanner(
    outline: ChapterOutline,
    violations: string[]
  ): Promise<{ needsRevision: boolean; reason?: string; revisedOutline?: Partial<ChapterOutline> }> {
    try {
      const aiStore = useAIStore()
      if (!aiStore.checkInitialized()) return { needsRevision: false }

      const outlineJson = JSON.stringify({
        title: outline.title,
        scenes: outline.scenes,
        characters: outline.characters,
        goals: outline.goals,
        conflicts: outline.conflicts,
      }, null, 2)

      const prompt = `你是叙事规划顾问。哨兵模型检测到以下逻辑冲突：
${violations.map((v, i) => `${i + 1}. ${v}`).join('\n')}

当前章节计划：
${outlineJson}

请判断：这些冲突是写手的执行问题（写手没按计划写），还是计划本身存在逻辑矛盾（计划要求了不可能的事）？

输出严格 JSON：
{
  "needsRevision": true或false,
  "reason": "简要说明判断依据",
  "revisedOutline": { "goals": [...], "conflicts": [...], "scenes": [...] }  // 仅当needsRevision为true时提供
}`

      const res = await aiStore.chat(
        [{ role: 'user', content: prompt }],
        { type: 'outline', complexity: 'medium', priority: 'quality' },
        { maxTokens: 1500 }
      )

      const { safeParseAIJson: parseAIJson } = await import('@/utils/safeParseAIJson')
      const parsed = parseAIJson<{ needsRevision: boolean; reason?: string; revisedOutline?: Partial<ChapterOutline> }>(res.content)
      return parsed || { needsRevision: false }
    } catch (err) {
      logger.warn('规划师审查调用失败，降级为写手直接修补:', err)
      return { needsRevision: false }
    }
  }
}

export const generationScheduler = new GenerationScheduler()
