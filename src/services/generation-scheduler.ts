import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { useSandboxStore } from '@/stores/sandbox'
import { useTaskManager } from '@/stores/taskManager'
import { v4 as uuidv4 } from 'uuid'
import { SummaryDetail } from '@/types'
import type { Chapter, ChapterOutline, Project } from '@/types'
import type { Entity, StateEvent, EntityType, EntityImportance } from '@/types/sandbox'
import { buildChapterContext, contextToPromptPayload } from '@/utils/contextBuilder'
import { extendOutlineWithLLM } from '@/utils/llm/outlineGenerator'
import { extractEntitiesWithAI, analyzeRelationships } from '@/utils/characterExtractor'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import type { ChatMessage } from '@/types/ai'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuditLog } from '@/composables/useAuditLog'
import { getLogger } from '@/utils/logger'

const logger = getLogger('generation:scheduler')

export interface BatchGenerationOptions {
  startChapter: number
  count: number
  autoSave: boolean
  autoUpdateSettings: boolean
  enableCheckpoint?: boolean
  checkpointInterval?: number
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

  public cancelBatchGeneration() {
    this.isBatchCancelled = true
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

  private async updateProjectSettings(chapter: Chapter) {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()
    const project = projectStore.currentProject
    if (!project) return

    if (!project.config?.enableZeroTouchExtraction) return

    // 1. 全量提取实体（人物、词条、分水岭事件）
    const entities = await extractEntitiesWithAI(chapter.content)

    // 2. 无缝入库新角色 → V5 sandbox store
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
          await sandboxStore.addEntity(entity)
        }
      }

      // 增量分析并更新关系图 → V5 StateEvents
      const allText = project.chapters.map(c => c.content).join('\n\n')
      const extChars = sandboxStore.entities
        .filter(e => e.type === 'CHARACTER')
        .map(e => ({ name: e.name, aliases: e.aliases, description: '', firstAppearance: '', role: 'other' as const, confidence: 1, occurrences: 1 }))
      const relations = analyzeRelationships(allText, extChars)

      for (const rel of relations) {
        const sourceEntity = sandboxStore.entities.find(e => e.type === 'CHARACTER' && e.name === rel.from)
        const targetEntity = sandboxStore.entities.find(e => e.type === 'CHARACTER' && e.name === rel.to)
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
            await sandboxStore.addStateEvent(event)
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
          await sandboxStore.addEntity(loreEntity)
        }
      }
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
    const HIGH_IMPACT_KEYWORDS = [
      '死', '伤', '去', '到', '回', '破', '境', '阶',
      '层', '宗', '门', '帮', '派', '遇', '得', '失',
      '战', '斗', '杀', '救', '突破', '晋升', '陨落',
      '死亡', '觉醒', '背叛', '加入', '离开', '获得',
      '失去', '重伤', '痊愈', '结盟', '决裂', '封印', '解封'
    ]
    const hasAction = HIGH_IMPACT_KEYWORDS.some(kw => chapter.content.includes(kw))

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

            const parsed = JSON.parse(res.content)
            const extractedEvents = parsed.events || []

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
              await sandboxStore.addStateEvent(stateEvent)
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

    const currentProject = projectStore.currentProject
    if (!currentProject || !aiStore.checkInitialized()) {
      throw new Error('系统未初始化或项目未加载')
    }

    this.isBatchCancelled = false

    const batchTask = taskManager.createTask({
      title: '批量章节生成',
      description: '初始化生成环境...',
      cancellable: true,
      onCancel: () => this.cancelBatchGeneration()
    })

    try {
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
          try {
            taskManager.updateTask(batchTask.id, { description: `已完成 ${i} 章生成，等待人工审查...` })
            await ElMessageBox.confirm(
              `已连续生成 ${i} 章，是否继续生成接下来的章节？\n您可以趁此时检查前文质量，若有跑偏请手动修正。`,
              '断点审查',
              {
                confirmButtonText: '继续生成',
                cancelButtonText: '终止批量',
                type: 'info'
              }
            )
            taskManager.updateTask(batchTask.id, { description: `审查放行，继续生成第 ${chapterNumber} 章...` })
          } catch {
            this.cancelBatchGeneration()
            taskManager.failTask(batchTask.id, '于检查点处由用户手动终止')
            break
          }
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
        const existingChapter = currentProject.chapters.find(c => c.number === chapterNumber)
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

        // 构建上下文
        taskManager.updateTask(batchTask.id, { description: `正在编织第 ${chapterNumber} 章记忆矩阵...` })
        const context = await buildChapterContext(currentProject, chapterData)
        
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
          if (currentProject.config?.enableLogicValidator) {
            const { validateChapterLogic } = await import('@/utils/llm/antiRetconValidator')
            taskManager.updateTask(batchTask.id, { description: `正在启动哨兵模型，侦测吃书与逻辑矛盾...` })
            
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
                  chapterData.outline, violationDescs, currentProject
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

                  const revisedContext = await buildChapterContext(currentProject, chapterData)
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
        const { usePluginStore } = await import('@/stores/plugin')
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
            const { createQualityChecker } = await import('@/utils/qualityChecker')
            const checker = createQualityChecker(currentProject.world, currentProject.characters, currentProject.outline, currentProject.config)
            const report = await checker.checkChapter(chapterData)
            chapterData.qualityScore = report.overallScore
          } catch(e) {}
        }

        // 保存更新 (调用单章代理保存接口以释放内存并实时落盘)
        if (options.autoSave) {
          await projectStore.saveChapter(chapterData)
        } else {
          // 如果没有开启 autoSave，就只是放在内存里骨架里（这里需要当心内容丢失）
          // 但是如果是批量生成通常都会存的，保险起见我们还是走持久化防泄漏
          await projectStore.saveChapter(chapterData)
        }

        // V4 Adaptation: 自动使用新的 Review 工作流产生交互建议
        if (currentProject.config?.enableQualityCheck) {
          try {
            taskManager.updateTask(batchTask.id, { description: `正在生成多角色审校建议（第 ${chapterNumber} 章）...` })
            const { builtinCommandRegistry } = await import('@/assistant/commands/builtinCommands')
            // 使用 consistency (默认) 或 editor 角色生成动作卡片
            await builtinCommandRegistry.executeCommand('review', ['consistency'])
          } catch(e) {
            logger.warn('自动审校产生建议失败:', e)
          }
        }

        if (options.autoUpdateSettings) {
          // V4-P1-⑥: 语义边界切片触发 - 仅在高影响事件时进行完整状态提取
          const HIGH_IMPACT_KEYWORDS = [
            '突破', '晋升', '陨落', '死亡', '觉醒', '背叛', '加入', '离开',
            '获得', '失去', '重伤', '痊愈', '结盟', '决裂', '封印', '解封'
          ]
          const hasHighImpact = HIGH_IMPACT_KEYWORDS.some(kw => chapterData.content.includes(kw))

          if (hasHighImpact || chapterNumber % 5 === 0) {
            // V4-D2: 同步等待状态提取完成，确保第 N+1 章能看到第 N 章的状态变更
            taskManager.updateTask(batchTask.id, { description: `正在同步角色状态（第 ${chapterNumber} 章）...` })

            // V5 Tool Calling: Extract state events and dispatch to sandboxStore
            try {
              taskManager.updateTask(batchTask.id, { description: `正在抽取底层实体图谱状态...` })
              const sandboxStore = useSandboxStore()

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
                const parsed = JSON.parse(extractionRes.content)
                const extractedEvents = parsed.events || parsed.tool_calls?.[0]?.function?.arguments
                  ? JSON.parse(parsed.tool_calls[0].function.arguments).events
                  : []

                for (const evt of extractedEvents) {
                  const entity = sandboxStore.entities.find(e => e.name === evt.entityName)
                  if (!entity) continue

                  const stateEvent: StateEvent = {
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
                  }
                  await sandboxStore.addStateEvent(stateEvent)
                }
                logger.debug(`[V5 State Extraction] Dispatched ${extractedEvents.length} events for chapter ${chapterNumber}`)
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

        // Delay between chunks to respect API limits
        if (i < options.count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      if (!this.isBatchCancelled) {
        taskManager.completeTask(batchTask.id, `成功生成 ${options.count} 个章节`)
        ElMessage.success(`批量生成游历完成！产出 ${options.count} 章纯度百分百的内容。`)
      }
    } catch (error) {
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
    violations: string[],
    _project: Project
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

      const { safeParseAIJson } = await import('@/utils/safeParseAIJson')
      const parsed = safeParseAIJson<{ needsRevision: boolean; reason?: string; revisedOutline?: Partial<ChapterOutline> }>(res.content)
      return parsed || { needsRevision: false }
    } catch (err) {
      logger.warn('规划师审查调用失败，降级为写手直接修补:', err)
      return { needsRevision: false }
    }
  }
}

export const generationScheduler = new GenerationScheduler()
