/**
 * StateSettler（状态沉淀器）
 *
 * 根据 Writer 的 StateChange 清单和正文内容，更新项目的 Entity 和 StateEvent。
 * 参考 InkOS 的 Observer→Settler 两阶段流程。
 *
 * Phase 7 of Pipeline: 在审计-修订循环完成后执行
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { ObserverAgent } from './ObserverAgent'
import type { ObservedFact } from './ObserverAgent'
import { StateEventSchema } from '@/schemas/stateEventSchema'
import type { Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'
import type { StateChange, TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('agent:settler')

// ============================================================================
// 类型定义
// ============================================================================

export interface SettleStateInput {
  project: Project
  chapterNumber: number
  chapterContent: string
  stateChanges: StateChange[]
  observerFacts?: ObservedFact[]  // NEW: pre-computed Observer output
}

export interface SettleStateOutput {
  newEntities: Partial<Entity>[]
  updatedEntities: Array<{ id: string; updates: Partial<Entity> }>
  newStateEvents: Partial<StateEvent>[]
  chapterSummary: string
  tokenUsage: TokenUsage
}

// ============================================================================
// LLM 提取 Prompt
// ============================================================================

const EXTRACT_SYSTEM_PROMPT = `你是一位小说设定提取专家。从章节正文中提取所有实体状态变化。

## 提取类别
1. 新出现的角色/地点/组织/物品
2. 已有角色的状态变化（实力、身份、位置、情感）
3. 角色间关系变化（结盟、决裂、好感、敌意）
4. 重要事件记录
5. 伏笔（已埋设/已推进/已回收）

## 输出格式
严格返回 JSON：
{
  "newEntities": [
    { "name": "名称", "type": "CHARACTER|LOCATION|FACTION|ITEM", "description": "简要描述" }
  ],
  "stateChanges": [
    { "entityName": "角色名", "changeType": "status|relation|location|event", "description": "变化描述" }
  ],
  "hooks": [
    { "content": "伏笔内容", "status": "planted|advanced|resolved", "chapterNumber": N }
  ],
  "chapterSummary": "200字以内的章节摘要"
}

如果没有变化，对应字段返回空数组。`

// ============================================================================
// StateSettler 主类
// ============================================================================

export class StateSettler {
  private aiStore: any = null
  private observer: ObserverAgent = new ObserverAgent()

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 执行状态沉淀
   * 优先使用 Writer 产出的 stateChanges，然后用 LLM 做二次验证补充
   */
  async settle(input: SettleStateInput): Promise<SettleStateOutput> {
    const startTime = performance.now()
    logger.info(`[Settler] 开始第${input.chapterNumber}章状态沉淀`)

    const emptyUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    const result: SettleStateOutput = {
      newEntities: [],
      updatedEntities: [],
      newStateEvents: [],
      chapterSummary: '',
      tokenUsage: emptyUsage,
    }

    // 1. 获取 Observer 事实（如果未预提供则运行 ObserverAgent）
    let observerFacts = input.observerFacts
    if (!observerFacts) {
      try {
        logger.info(`[Settler] 未提供 Observer 事实，自动运行 ObserverAgent`)
        const existingEntities = this.getEntityNames(input.project)
        const observerOutput = await this.observer.observe({
          chapterContent: input.chapterContent,
          chapterNumber: input.chapterNumber,
          existingEntityNames: existingEntities,
        })
        observerFacts = observerOutput.facts
        // 累加 Observer 的 token 用量
        result.tokenUsage = {
          inputTokens: result.tokenUsage.inputTokens + (observerOutput.tokenUsage.inputTokens ?? 0),
          outputTokens: result.tokenUsage.outputTokens + (observerOutput.tokenUsage.outputTokens ?? 0),
          totalTokens: result.tokenUsage.totalTokens + (observerOutput.tokenUsage.totalTokens ?? 0),
        }
        logger.info(`[Settler] ObserverAgent 提取完成: ${observerFacts.length} 条事实`)
      } catch (error) {
        logger.error('[Settler] ObserverAgent 执行失败，将仅使用 Writer stateChanges:', error)
        observerFacts = []
      }
    } else {
      logger.info(`[Settler] 使用预提供的 Observer 事实: ${observerFacts.length} 条`)
    }

    // 2. 将 Observer 事实转化为 StateEvent 并做 schema 校验
    const observerEventCount = result.newStateEvents.length
    this.applyObserverFacts(observerFacts, result, input.chapterNumber, input.project.id)
    const observerEventsAdded = result.newStateEvents.length - observerEventCount
    logger.info(`[Settler] Observer 事实转化: ${observerFacts.length} 条事实 -> ${observerEventsAdded} 个 StateEvent`)

    // 3. 先消费 Writer 产出的 stateChanges（快速路径，无 LLM 调用）
    this.applyStateChanges(input.stateChanges, result, input.project.id)

    // 4. 用 LLM 从正文中提取补充状态变化（二次验证）
    try {
      const aiStore = await this.getAIStore()
      if (!aiStore.checkInitialized()) {
        logger.warn('[Settler] AI未初始化，仅使用Writer提供的stateChanges')
        result.chapterSummary = `第${input.chapterNumber}章（摘要待生成）`
        return result
      }

      const existingEntities = this.getEntityNames(input.project)
      const userPrompt = `## 已有实体
${existingEntities.join('、') || '（暂无）'}

## 章节正文
${input.chapterContent}

## Writer已提取的状态变化
${input.stateChanges.length > 0
  ? input.stateChanges.map(c => `- [${c.type}] ${c.description}`).join('\n')
  : '（Writer未提供状态变化）'}

## Observer已提取的事实
${observerFacts.length > 0
  ? observerFacts.map(f => `- [${f.category}] ${f.entityName}: ${f.description}`).join('\n')
  : '（Observer未提供事实）'}`

      const response = await aiStore.chat(
        [
          { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        {
          type: 'state_extraction',
          complexity: 'medium',
          priority: 'balanced',
        },
        { maxTokens: 3000 }
      )

      result.tokenUsage = {
        inputTokens: result.tokenUsage.inputTokens + (response.usage?.inputTokens || 0),
        outputTokens: result.tokenUsage.outputTokens + (response.usage?.outputTokens || 0),
        totalTokens: result.tokenUsage.totalTokens + (response.usage?.totalTokens || 0),
      }

      const parsed = safeParseAIJson<{
        newEntities: Array<{ name: string; type: string; description: string }>
        stateChanges: Array<{ entityName: string; changeType: string; description: string }>
        hooks: Array<{ content: string; status: string; chapterNumber: number }>
        chapterSummary: string
      }>(response.content)

      if (parsed) {
        // 合并 LLM 提取的新实体
        if (Array.isArray(parsed.newEntities)) {
          for (const entity of parsed.newEntities) {
            if (entity.name && entity.type) {
              result.newEntities.push({
                name: entity.name,
                type: entity.type as Entity['type'],
                description: entity.description || '',
              })
            }
          }
        }

        // 合并 LLM 提取的状态变更作为 StateEvent
        if (Array.isArray(parsed.stateChanges)) {
          for (const change of parsed.stateChanges) {
            if (change.entityName && change.description) {
              result.newStateEvents.push({
                type: change.changeType === 'relation' ? 'RELATION_UPDATE' : 'STATE_CHANGE',
                entityName: change.entityName,
                description: change.description,
                chapterNumber: input.chapterNumber,
                projectId: input.project.id,
                timestamp: Date.now(),
              } as Partial<StateEvent>)
            }
          }
        }

        // 章节摘要
        if (parsed.chapterSummary) {
          result.chapterSummary = parsed.chapterSummary
        }

        logger.info(`[Settler] LLM提取: ${result.newEntities.length}个新实体, ${result.newStateEvents.length}个状态事件`)
      }
    } catch (error) {
      logger.error('[Settler] LLM状态提取失败:', error)
    }

    // 兜底校验：确保所有 StateEvent 都有正确的 projectId
    for (const event of result.newStateEvents) {
      if (!event.projectId || event.projectId === '__pending__') {
        event.projectId = input.project.id
      }
    }

    const elapsed = Math.round(performance.now() - startTime)
    logger.info(`[Settler] 状态沉淀完成，耗时 ${elapsed}ms，Observer事实: ${observerFacts.length}条，新增事件: ${result.newStateEvents.length}个`)

    return result
  }

  /**
   * 将 Observer 输出的 facts 转化为 StateEvent 并做 schema 校验
   */
  private applyObserverFacts(facts: ObservedFact[], result: SettleStateOutput, chapterNumber: number, projectId: string): void {
    let validatedCount = 0
    let skippedCount = 0

    for (const fact of facts) {
      let event: Partial<StateEvent> | null = null

      switch (fact.category) {
        case 'character':
          if (fact.isNewEntity) {
            // 新角色实体
            result.newEntities.push({
              name: fact.entityName,
              type: (fact.entityType as Entity['type']) || 'CHARACTER',
              description: fact.description,
            })
            event = null // 实体由 newEntities 处理
          } else {
            // 已有角色的属性更新
            event = {
              eventType: 'PROPERTY_UPDATE',
              entityId: fact.entityName,
              chapterNumber,
              source: 'AI_EXTRACTED',
              payload: {
                key: fact.metadata?.propertyKey as string || 'status',
                value: fact.description,
              },
              description: fact.description,
            } as Partial<StateEvent>
          }
          break

        case 'relationship':
          event = {
            eventType: 'RELATION_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              targetId: (fact.metadata?.targetEntity as string) || fact.entityName,
              relationType: (fact.metadata?.relationType as string) || 'relation',
              attitude: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'location':
          event = {
            eventType: 'LOCATION_MOVE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              value: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'item':
          // 物品作为新实体
          if (fact.isNewEntity) {
            result.newEntities.push({
              name: fact.entityName,
              type: (fact.entityType as Entity['type']) || 'ITEM',
              description: fact.description,
            })
          }
          // 同时记录物品状态事件
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: 'item_info',
              value: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'state_change':
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: (fact.metadata?.stateKey as string) || 'state',
              value: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'hook':
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: 'hook',
              value: JSON.stringify({
                content: fact.description,
                status: (fact.metadata?.hookStatus as string) || 'planted',
                chapterNumber,
              }),
            },
            description: `[伏笔] ${fact.description}`,
          } as Partial<StateEvent>
          break

        case 'emotion':
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: 'emotion',
              value: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'timeline':
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: 'timeline',
              value: fact.description,
            },
            description: `[时间线] ${fact.description}`,
          } as Partial<StateEvent>
          break

        case 'numeric':
          event = {
            eventType: 'PROPERTY_UPDATE',
            entityId: fact.entityName,
            chapterNumber,
            source: 'AI_EXTRACTED',
            payload: {
              key: (fact.metadata?.numericKey as string) || 'numeric',
              value: fact.description,
            },
            description: fact.description,
          } as Partial<StateEvent>
          break

        case 'speech_pattern':
          // 语言风格档案不创建 StateEvent，而是作为实体扩展属性存储
          // 通过 metadata.speechTraits 存储，供 dialogueAnalyzer 使用
          logger.info(`[Settler] 提取到角色语言风格: ${fact.entityName}`, {
            speechTraits: fact.metadata?.speechTraits,
          })
          // 不设置 event，跳过 StateEvent 创建
          validatedCount++
          continue

        default:
          logger.warn(`[Settler] 未知的 Observer 事实类别: ${fact.category}`, { entityName: fact.entityName })
          skippedCount++
          continue
      }

      // 如果有事件需要创建，进行 schema 校验
      if (event) {
        // 确保必要字段存在
        if (!event.id) {
          event.id = `observer_${chapterNumber}_${fact.category}_${validatedCount}`
        }
        if (!event.projectId) {
          event.projectId = projectId
        }
        if (!event.source) {
          event.source = 'AI_EXTRACTED'
        }
        if (!event.chapterNumber) {
          event.chapterNumber = chapterNumber
        }

        // 使用 StateEventSchema 校验
        const validationResult = StateEventSchema.validate(event)
        if (validationResult.valid) {
          result.newStateEvents.push(event)
          validatedCount++
          if (validationResult.warnings.length > 0) {
            logger.debug(`[Settler] Observer 事件校验通过（有警告）`, {
              category: fact.category,
              entityName: fact.entityName,
              warnings: validationResult.warnings,
            })
          }
        } else {
          logger.warn(`[Settler] Observer 事件校验失败，已跳过`, {
            category: fact.category,
            entityName: fact.entityName,
            errors: validationResult.errors,
            description: fact.description,
          })
          skippedCount++
        }
      }
    }

    logger.info(`[Settler] Observer 事实处理统计: 总计 ${facts.length} 条，校验通过 ${validatedCount} 个事件，跳过 ${skippedCount} 条`)
  }

  /**
   * 将 Writer 产出的 stateChanges 应用到结果
   */
  private applyStateChanges(stateChanges: StateChange[], result: SettleStateOutput, projectId: string): void {
    for (const change of stateChanges) {
      switch (change.type) {
        case 'entity_add':
          result.newEntities.push({
            name: change.description,
            type: 'CHARACTER',
            description: change.description,
          })
          break
        case 'entity_update':
          if (change.entityId) {
            result.updatedEntities.push({
              id: change.entityId,
              updates: { description: change.description } as Partial<Entity>,
            })
          }
          break
        case 'relation_change':
        case 'location_change':
        case 'event_record':
        case 'hook_planted':
        case 'hook_resolved':
          result.newStateEvents.push({
            type: change.type.toUpperCase(),
            entityId: change.entityId,
            description: change.description,
            chapterNumber: change.chapterNumber,
            projectId,
            timestamp: Date.now(),
          } as Partial<StateEvent>)
          break
      }
    }
  }

  /**
   * 从项目中提取已有实体名称列表
   */
  private getEntityNames(project: Project): string[] {
    const entities = project._entities
    if (!entities) return []
    return entities.map(e => `${e.name}(${e.type})`)
  }
}
