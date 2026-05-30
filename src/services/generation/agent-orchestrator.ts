import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { useSandboxStore } from '@/stores/sandbox'
import { useTaskManager } from '@/stores/taskManager'
import { v4 as uuidv4 } from 'uuid'
import { SummaryDetail } from '@/types'
import type { Chapter, ChapterOutline } from '@/types'
import type { Entity, StateEvent, EntityType, EntityImportance } from '@/types/sandbox'
import { extractEntitiesWithAI, analyzeRelationships } from '@/utils/characterExtractor'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { getLogger } from '@/utils/logger'
import { AgentOrchestrator } from '@/agents/AgentOrchestrator'
import { PlannerAgent } from '@/agents/PlannerAgent'
import { EditorAgent } from '@/agents/EditorAgent'
import { ReaderAgent } from '@/agents/ReaderAgent'
import { SentinelAgent } from '@/agents/SentinelAgent'
import { ExtractorAgent } from '@/agents/ExtractorAgent'
import type { AgentConfig } from '@/agents/types'
import { hasHighImpactContent } from './types'

const logger = getLogger('generation:agent-orchestrator')

export function enqueuePostGenerationAgents(
  agentQueue: Promise<void>,
  isRunCancelled: (runId: number) => boolean,
  updateProjectSettings: (chapter: Chapter) => Promise<void>,
  chapter: Chapter,
  configs: AgentConfig[],
  runId: number
): Promise<void> {
  const chapterSnapshot = { ...chapter }

  return agentQueue
    .catch(() => undefined)
    .then(async () => {
      if (isRunCancelled(runId)) return

      const projectStore = useProjectStore()
      const project = projectStore.currentProject
      const normalizedConfig = normalizeProjectConfig(project?.config)
      if (!project || !normalizedConfig.enableAutoReview) return

      await runPostGenerationAgents(updateProjectSettings, chapterSnapshot, normalizedConfig.agentConfigs ?? configs)
    })
    .catch(error => logger.warn('Agent 后处理失败:', error))
}

export async function runPreGenerationAgents(chapter: Chapter, configs: AgentConfig[]): Promise<void> {
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

export async function runPostGenerationAgents(
  updateProjectSettings: (chapter: Chapter) => Promise<void>,
  chapter: Chapter,
  configs: AgentConfig[]
): Promise<void> {
  const projectStore = useProjectStore()
  const project = projectStore.currentProject
  if (!project) return

  const orchestrator = new AgentOrchestrator({
    agents: [
      new SentinelAgent(),
      new EditorAgent(),
      new ReaderAgent(),
      new ExtractorAgent({ extractChapter: chapter => updateProjectSettings(chapter) }),
    ],
    configs: configs.filter(config => ['sentinel', 'editor', 'reader', 'extractor'].includes(config.role)),
    logger,
    onTrace: event => logger.debug('[Agent]', event),
  })

  await orchestrator.runPhase('post-generation', {
    phase: 'post-generation',
    project,
    chapter,
  })
}

export async function updateProjectSettings(chapter: Chapter) {
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

export async function consultPlanner(
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

export async function runExtractionInBackground(chapter: Chapter) {
  const taskManager = useTaskManager()
  const task = taskManager.createTask({
    title: `设定抽取: 第${chapter.number}章`,
    description: '正在分析事件与人物关系...',
    cancellable: false
  })

  try {
    await updateProjectSettings(chapter)

    const projectStore = useProjectStore()
    await projectStore.saveCurrentProject()

    taskManager.completeTask(task.id, '抽取与记忆入库成功')
    taskManager.addToast(`第${chapter.number}章事件已成功载入系统记忆树`, 'success')
  } catch (err) {
    logger.error('设定提取失败:', err)
    taskManager.failTask(task.id, err instanceof Error ? err.message : String(err))
  }
}
