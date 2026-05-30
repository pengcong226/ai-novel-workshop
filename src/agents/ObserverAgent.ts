import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import type { EntityType } from '@/types/sandbox'
import type { TokenUsage } from '@/services/pipeline/types'

const logger = getLogger('agent:observer')

/** 10类可提取的事实类别 */
export type FactCategory =
  | 'character'       // 角色信息
  | 'relationship'    // 关系变化
  | 'location'        // 地点信息
  | 'item'            // 物品信息
  | 'state_change'    // 状态变化
  | 'hook'            // 伏笔
  | 'emotion'         // 情感变化
  | 'timeline'        // 时间线事件
  | 'numeric'         // 数值信息
  | 'speech_pattern'  // 角色语言风格

/** 实体类型到EntityType的映射关系 */
const CATEGORY_ENTITY_TYPE_MAP: Partial<Record<FactCategory, EntityType>> = {
  character: 'CHARACTER',
  relationship: 'CHARACTER',
  location: 'LOCATION',
  item: 'ITEM',
  hook: 'LORE',
}

/** 单条观察到的事实 */
export interface ObservedFact {
  /** 事实类别 */
  category: FactCategory
  /** 相关实体名称 */
  entityName: string
  /** 实体类型（仅当isNewEntity为true时有值） */
  entityType?: EntityType
  /** 是否为新出现的实体 */
  isNewEntity: boolean
  /** 事实描述 */
  description: string
  /** 置信度，0-1之间 */
  confidence: number
  /** 章节号 */
  chapterNumber: number
  /** 原文引用（20-50字） */
  rawText: string
  /** 附加元数据 */
  metadata?: Record<string, unknown>
}

/** ObserverAgent的输入参数 */
export interface ObserverInput {
  /** 章节正文内容 */
  chapterContent: string
  /** 章节号 */
  chapterNumber: number
  /** 已有实体名称列表 */
  existingEntityNames: string[]
  /** 小说体裁（可选） */
  genre?: string
}

/** ObserverAgent的输出结果 */
export interface ObserverOutput {
  /** 提取到的事实列表 */
  facts: ObservedFact[]
  /** 实体名到出现次数的映射 */
  entityMentions: Map<string, number>
  /** Token使用统计 */
  tokenUsage: TokenUsage
}

/** LLM返回的单条事实结构 */
interface ParsedFact {
  category: string
  entityName: string
  entityType?: string
  isNewEntity?: boolean
  description: string
  confidence?: number
  rawText: string
  metadata?: Record<string, unknown>
}

/** LLM返回的JSON结构 */
interface ParsedResponse {
  facts: ParsedFact[]
  newEntities?: Array<{ name: string; type: string }>
}

/** 所有支持的事实类别 */
const ALL_CATEGORIES: FactCategory[] = [
  'character',
  'relationship',
  'location',
  'item',
  'state_change',
  'hook',
  'emotion',
  'timeline',
  'numeric',
  'speech_pattern',
]

/** 类别中文描述映射 */
const CATEGORY_DESCRIPTIONS: Record<FactCategory, string> = {
  character: '角色外貌、性格、能力、身份、背景',
  relationship: '角色间关系、态度、互动',
  location: '地点描述、位置变化、地理设定',
  item: '重要物品、法宝、武器、道具',
  state_change: '角色状态变化（实力、伤势、修为等）',
  hook: '伏笔（新埋设/推进/回收）',
  emotion: '角色情感变化、心理状态',
  timeline: '时间标记、事件先后顺序',
  numeric: '数值信息（年龄、距离、数量、等级）',
  speech_pattern: '角色语言风格特征（正式度、词汇水平、句式长度、口头禅、语言习惯）',
}

/**
 * 过度提取Agent（ObserverAgent）
 *
 * 从小说章节正文中提取9类事实信息，遵循"宁多勿漏"原则。
 * 设计为高召回、低精确的提取策略，确保不遗漏任何潜在重要信息。
 */
export class ObserverAgent {
  private aiStore: any = null

  /**
   * 获取AIStore实例（延迟加载）
   */
  private async getAIStore(): Promise<any> {
    if (!this.aiStore) {
      try {
        const { useAIStore } = await import('@/stores/ai')
        this.aiStore = useAIStore()
      } catch (err) {
        logger.error('加载AIStore失败', { error: err })
        throw new Error('AIStore不可用，请检查服务配置')
      }
    }
    return this.aiStore
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(genre?: string): string {
    const categoryList = ALL_CATEGORIES.map(
      (cat) => `- ${cat}: ${CATEGORY_DESCRIPTIONS[cat]}`
    ).join('\n')

    return `你是一位专业的小说文本分析Agent，擅长从章节正文中提取关键事实信息。
你的核心原则是"宁多勿漏"——当不确定某条信息是否重要时，倾向于提取而非忽略。

${genre ? `当前小说体裁：${genre}\n` : ''}
## 你需要提取的10类事实

${categoryList}

### speech_pattern 特殊说明
当提取 speech_pattern 类别时，metadata 必须包含以下字段：
\`\`\`json
{
  "speechTraits": {
    "formality": "formal/casual/mixed",
    "vocabulary": "simple/moderate/literary",
    "sentenceLength": "short/medium/long",
    "quirks": ["语言习惯1", "语言习惯2"],
    "catchphrases": ["口头禅1"]
  }
}
\`\`\`
请从角色的对话中分析其语言风格特征。

## 输出格式要求

请严格以JSON格式输出，结构如下：
\`\`\`json
{
  "facts": [
    {
      "category": "character",
      "entityName": "实体名称",
      "entityType": "CHARACTER",
      "isNewEntity": true,
      "description": "事实描述",
      "confidence": 0.9,
      "rawText": "原文20-50字的引用",
      "metadata": {}
    }
  ],
  "newEntities": [
    { "name": "新实体名称", "type": "CHARACTER" }
  ]
}
\`\`\`

## 字段说明

- category: 必须是上述10类之一
- entityName: 相关实体名称（人名、地名、物品名等）
- entityType: 仅当isNewEntity为true时需要填写，可选值：CHARACTER/FACTION/LOCATION/LORE/ITEM/CONCEPT/WORLD
- isNewEntity: 是否为本章首次出现的实体
- description: 对该事实的简明描述
- confidence: 置信度，0到1之间的浮点数，0.5以下表示较不确定但仍值得记录
- rawText: 从原文中摘取的20-50字原始片段，必须忠实于原文
- metadata: 可选的附加信息对象

## 提取规则

1. 每条事实必须关联到至少一个具体实体
2. 原文引用(rawText)必须精确，不得篡改原文
3. 置信度低于0.3的事实也应提取（宁多勿漏）
4. 同一段文字可能包含多条不同类别的事实，全部提取
5. newEntities列表用于标记本章新出现的实体，便于后续创建
6. 如果某个类别在本章没有对应信息，该类别不出现在结果中即可`
  }

  /**
   * 构建用户提示词
   */
  private buildUserPrompt(chapterContent: string, existingEntityNames: string[]): string {
    const entityList =
      existingEntityNames.length > 0
        ? existingEntityNames.join('、')
        : '（暂无已有实体）'

    return `请分析以下章节内容，提取所有9类事实信息。

## 已有实体列表
${entityList}

## 章节正文

${chapterContent}

请严格按照JSON格式输出提取结果。记住"宁多勿漏"原则。`
  }

  /**
   * 执行过度提取：从章节正文中提取9类事实
   *
   * 设计原则：宁多勿漏，高召回低精确
   *
   * @param input - 提取输入参数
   * @returns 提取结果，包含事实列表、实体提及统计和token使用量
   */
  async observe(input: ObserverInput): Promise<ObserverOutput> {
    const { chapterContent, chapterNumber, existingEntityNames, genre } = input

    logger.info('开始章节事实提取', {
      chapterNumber,
      contentLength: chapterContent.length,
      existingEntityCount: existingEntityNames.length,
      genre: genre ?? '未指定',
    })

    const aiStore = await this.getAIStore()
    const systemPrompt = this.buildSystemPrompt(genre)
    const userPrompt = this.buildUserPrompt(chapterContent, existingEntityNames)

    let llmResponse: string
    let tokenUsage: TokenUsage

    try {
      const result = await aiStore.chat({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.3,
      })

      llmResponse = typeof result === 'string' ? result : result.content ?? ''
      tokenUsage = {
        inputTokens: result.usage?.inputTokens ?? result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? result.usage?.completionTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
      }
    } catch (err) {
      logger.error('LLM调用失败', { chapterNumber, error: err })
      throw new Error(`章节${chapterNumber}事实提取失败：LLM调用异常`)
    }

    logger.debug('LLM原始响应', {
      chapterNumber,
      responseLength: llmResponse.length,
      tokenUsage,
    })

    // 解析LLM返回的JSON
    const parsed = safeParseAIJson<ParsedResponse>(llmResponse)
    if (!parsed || !Array.isArray(parsed.facts)) {
      logger.error('LLM响应解析失败或格式不正确', {
        chapterNumber,
        responseSnippet: llmResponse.substring(0, 500),
      })
      return {
        facts: [],
        entityMentions: new Map(),
        tokenUsage,
      }
    }

    // 构建ObservedFact数组
    const facts = this.parseFacts(parsed, chapterNumber)

    // 合并newEntities中的新实体信息
    this.mergeNewEntities(parsed, facts, chapterNumber)

    // 统计实体提及次数
    const entityMentions = this.countEntityMentions(
      chapterContent,
      existingEntityNames
    )

    // 将新提取到的实体也计入提及次数
    for (const fact of facts) {
      if (fact.isNewEntity && !entityMentions.has(fact.entityName)) {
        entityMentions.set(fact.entityName, 1)
      }
    }

    logger.info('章节事实提取完成', {
      chapterNumber,
      totalFacts: facts.length,
      factsByCategory: this.groupFactsByCategory(facts),
      newEntityCount: facts.filter((f) => f.isNewEntity).length,
      tokenUsage,
    })

    return { facts, entityMentions, tokenUsage }
  }

  /**
   * 统计实体在文本中的出现次数（确定性方法，不依赖LLM）
   *
   * @param content - 章节正文
   * @param entityNames - 待统计的实体名称列表
   * @returns 实体名到出现次数的映射
   */
  countEntityMentions(content: string, entityNames: string[]): Map<string, number> {
    const result = new Map<string, number>()

    if (!content || entityNames.length === 0) {
      return result
    }

    for (const name of entityNames) {
      if (!name) continue
      // 使用全局正则匹配，计算实体名在文本中出现的次数
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'g')
      const matches = content.match(regex)
      if (matches && matches.length > 0) {
        result.set(name, matches.length)
      }
    }

    logger.debug('实体提及统计完成', {
      totalEntities: entityNames.length,
      mentionedEntities: result.size,
    })

    return result
  }

  /**
   * 从LLM解析结果构建ObservedFact数组
   *
   * @param parsed - LLM返回并解析后的JSON对象
   * @param chapterNumber - 章节号
   * @returns ObservedFact数组
   */
  private parseFacts(parsed: ParsedResponse, chapterNumber: number): ObservedFact[] {
    const facts: ObservedFact[] = []

    for (const item of parsed.facts) {
      // 验证必填字段
      if (!item.category || !item.entityName || !item.description) {
        logger.warn('跳过无效事实条目（缺少必填字段）', {
          item: JSON.stringify(item).substring(0, 200),
        })
        continue
      }

      // 验证类别是否合法
      if (!ALL_CATEGORIES.includes(item.category as FactCategory)) {
        logger.warn('跳过未知事实类别', {
          category: item.category,
          entityName: item.entityName,
        })
        continue
      }

      const category = item.category as FactCategory
      const isNewEntity = item.isNewEntity === true
      const confidence = this.clampConfidence(item.confidence ?? 0.5)
      const entityType = this.resolveEntityType(category, item.entityType, isNewEntity)

      const fact: ObservedFact = {
        category,
        entityName: item.entityName.trim(),
        entityType,
        isNewEntity,
        description: item.description.trim(),
        confidence,
        chapterNumber,
        rawText: item.rawText?.trim() ?? '',
        metadata: item.metadata,
      }

      // 校验rawText长度
      if (fact.rawText.length > 0 && (fact.rawText.length < 10 || fact.rawText.length > 200)) {
        logger.debug('rawText长度不在理想范围', {
          entityName: fact.entityName,
          rawTextLength: fact.rawText.length,
        })
      }

      facts.push(fact)
    }

    return facts
  }

  /**
   * 合并newEntities列表中的新实体信息到facts中
   *
   * 如果newEntities中存在尚未在facts中记录的新实体，为其创建一条character类事实
   */
  private mergeNewEntities(
    parsed: ParsedResponse,
    facts: ObservedFact[],
    chapterNumber: number
  ): void {
    if (!parsed.newEntities || !Array.isArray(parsed.newEntities)) {
      return
    }

    const existingEntityNames = new Set(facts.map((f) => f.entityName))

    for (const newEntity of parsed.newEntities) {
      if (!newEntity.name || existingEntityNames.has(newEntity.name)) {
        continue
      }

      const entityType = this.normalizeEntityType(newEntity.type)

      const fact: ObservedFact = {
        category: 'character',
        entityName: newEntity.name.trim(),
        entityType,
        isNewEntity: true,
        description: `新出现的实体：${newEntity.name}`,
        confidence: 0.6,
        chapterNumber,
        rawText: '',
        metadata: { source: 'newEntities' },
      }

      facts.push(fact)
      existingEntityNames.add(newEntity.name)

      logger.debug('从newEntities补充新实体', {
        entityName: newEntity.name,
        entityType,
      })
    }
  }

  /**
   * 解析实体类型
   *
   * 优先使用LLM返回的entityType，否则根据category推断
   */
  private resolveEntityType(
    category: FactCategory,
    llmEntityType?: string,
    isNewEntity?: boolean
  ): EntityType | undefined {
    if (!isNewEntity) {
      return undefined
    }

    // 如果LLM提供了entityType，优先使用
    if (llmEntityType) {
      return this.normalizeEntityType(llmEntityType)
    }

    // 根据category推断entityType
    return CATEGORY_ENTITY_TYPE_MAP[category]
  }

  /**
   * 规范化实体类型字符串为EntityType枚举值
   */
  private normalizeEntityType(type: string): EntityType | undefined {
    const normalized = type.toUpperCase().trim()
    const validTypes: EntityType[] = [
      'CHARACTER',
      'FACTION',
      'LOCATION',
      'LORE',
      'ITEM',
      'CONCEPT',
      'WORLD',
    ]

    if (validTypes.includes(normalized as EntityType)) {
      return normalized as EntityType
    }

    logger.warn('无法识别的实体类型，跳过', { type })
    return undefined
  }

  /**
   * 将置信度限制在[0, 1]范围内
   */
  private clampConfidence(value: number): number {
    if (typeof value !== 'number' || isNaN(value)) {
      return 0.5
    }
    return Math.max(0, Math.min(1, value))
  }

  /**
   * 按类别统计事实分布
   */
  private groupFactsByCategory(facts: ObservedFact[]): Record<string, number> {
    const groups: Record<string, number> = {}
    for (const cat of ALL_CATEGORIES) {
      groups[cat] = 0
    }
    for (const fact of facts) {
      groups[fact.category] = (groups[fact.category] ?? 0) + 1
    }
    return groups
  }
}
