/**
 * 世界书动态注入引擎
 * @module services/worldbook-injector
 *
 * 提供世界书条目的智能匹配、条件评估和内容注入功能
 * 支持关键词触发、章节范围检测、条件表达式评估和优先级排序
 */

import type { Worldbook, WorldbookEntry, WorldbookGroup } from '@/types/worldbook'
import type { Entity } from '@/types/sandbox'
import { getLogger } from '@/utils/logger'

const logger = getLogger('worldbook:injector')

// ============================================================================
// ReDoS 防护
// ============================================================================

/** 危险嵌套量词模式检测（如 (a+)+, (a*)*, (a+)* 等） */
const DANGEROUS_NESTED_QUANTIFIER = /\((?:[^()]*\+|[^()]*\*)[^()]*\)[+*]/

/**
 * 创建安全的正则表达式，防止 ReDoS（正则表达式拒绝服务）攻击
 *
 * 防护措施：
 * - 限制模式长度不超过 200 字符
 * - 阻止嵌套量词（如 ((a+)+)、(a*)*）
 * - 阻止对反向引用使用量词
 * - 将无上限重复 {n,} 替换为 {n,10}
 *
 * @param pattern - 正则表达式模式字符串
 * @param flags - 可选的正则表达式标志
 * @returns 安全的 RegExp 对象，若模式不安全则返回 null
 */
function createSafeRegex(pattern: string, flags?: string): RegExp | null {
  // 限制模式长度
  if (pattern.length > 200) {
    logger.warn(`Regex pattern exceeds maximum length of 200: ${pattern.length} chars`)
    return null
  }

  // 检测危险嵌套量词
  if (DANGEROUS_NESTED_QUANTIFIER.test(pattern)) {
    logger.warn(`Regex pattern contains dangerous nested quantifiers: ${pattern}`)
    return null
  }

  // 阻止对反向引用使用量词（如 \1+, \2*）
  if (/\\\d+[+*]/.test(pattern)) {
    logger.warn(`Regex pattern contains quantified backreference: ${pattern}`)
    return null
  }

  // 将无上限重复 {n,} 替换为 {n,10}（仅当 n < 10 时）
  const sanitized = pattern.replace(/\{(\d+),\}/g, (match, n: string) => {
    const num = parseInt(n, 10)
    return num < 10 ? `{${num},10}` : match
  })

  try {
    return new RegExp(sanitized, flags)
  } catch {
    logger.warn(`Invalid regex pattern: ${pattern}`)
    return null
  }
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 世界书条件表达式
 * 支持复杂的条件逻辑组合
 */
export interface WorldbookCondition {
  /** 条件类型 */
  type: 'and' | 'or' | 'not' | 'comparison' | 'exists' | 'regex' | 'custom'

  /** 条件字段（用于 comparison 类型） */
  field?: string

  /** 操作符（用于 comparison 类型） */
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches'

  /** 比较值 */
  value?: unknown

  /** 子条件（用于 and/or/not 类型） */
  conditions?: WorldbookCondition[]

  /** 自定义条件函数名（用于 custom 类型） */
  customFunction?: string

  /** 正则表达式模式（用于 regex 类型） */
  pattern?: string

  /** 正则标志 */
  flags?: string
}

/**
 * 注入上下文
 * 包含当前章节生成所需的所有上下文信息
 */
export interface InjectionContext {
  /** 项目ID */
  projectId: string

  /** 当前章节号 */
  currentChapter: number

  /** 当前生成的内容（用于递归扫描） */
  currentContent: string

  /** 项目中的角色列表 */
  characters: Entity[]

  /** 最近的事件列表 */
  recentEvents: string[]

  /** 世界状态 */
  worldState: Record<string, unknown>

  /** 章节上下文 */
  chapterContext?: {
    /** 章节标题 */
    title?: string
    /** 场景地点 */
    location?: string
    /** 出场角色ID */
    characterIds?: string[]
    /** 章节目标 */
    goals?: string[]
  }

  /** 用户输入的提示 */
  userPrompt?: string

  /** 已经注入的内容（用于避免重复） */
  injectedEntries?: Set<string>

  /** Token 预算限制 */
  tokenBudget?: number

  /** 当前已使用 Token */
  usedTokens?: number
}

/**
 * 注入日志条目
 * 记录注入过程中的决策信息
 */
export interface InjectionLogEntry {
  /** 条目ID */
  entryId: string

  /** 条目名称 */
  entryName?: string

  /** 触发时间 */
  timestamp: number

  /** 触发原因 */
  triggerReason: 'keyword' | 'condition' | 'manual' | 'recursive'

  /** 匹配的关键词 */
  matchedKeywords?: string[]

  /** 匹配的条件 */
  matchedConditions?: string[]

  /** 评估结果 */
  evaluationResult: {
    /** 是否匹配关键词 */
    keywordMatched: boolean
    /** 是否在章节范围内 */
    chapterInRange: boolean
    /** 条件是否满足 */
    conditionSatisfied: boolean
    /** 是否被过滤 */
    filtered: boolean
    /** 过滤原因 */
    filterReason?: string
  }

  /** 最终是否注入 */
  injected: boolean

  /** 注入位置 */
  injectionPosition?: 'before_char' | 'after_char' | 'before_example' | 'after_example'

  /** 注入顺序 */
  injectionOrder: number

  /** 使用的 Token 数 */
  tokenCount?: number

  /** 备注 */
  notes?: string
}

/**
 * 注入结果
 */
export interface InjectionResult {
  /** 触发的条目列表 */
  entries: WorldbookEntry[]

  /** 总 Token 数 */
  totalTokens: number

  /** 注入的内容字符串 */
  injectedContent: string

  /** 注入日志 */
  injectionLog: InjectionLogEntry[]

  /** 分组信息 */
  groups?: WorldbookGroup[]

  /** 统计信息 */
  stats: {
    /** 扫描的条目总数 */
    totalEntries: number
    /** 匹配关键词的条目数 */
    keywordMatched: number
    /** 章节范围内条目数 */
    chapterInRange: number
    /** 条件满足条目数 */
    conditionSatisfied: number
    /** 最终注入条目数 */
    injected: number
    /** 因 Token 预算被跳过的条目数 */
    skippedDueToBudget: number
    /** 因优先级被过滤的条目数 */
    filteredByPriority: number
  }
}

/**
 * 条件评估器
 */
type ConditionEvaluator = (
  condition: WorldbookCondition,
  context: InjectionContext
) => boolean

/**
 * Token 计数器
 */
type TokenCounter = (text: string) => number

// ============================================================================
// 常量定义
// ============================================================================

/** 默认 Token 预算 */
const DEFAULT_TOKEN_BUDGET = 2000

/** 默认注入顺序 */
const DEFAULT_INSERTION_ORDER = 100

/** 默认优先级 */
const DEFAULT_PRIORITY = 10

/** 条目位置权重（用于排序） */
const POSITION_WEIGHTS: Record<string, number> = {
  before_char: 0,
  after_char: 100,
  before_example: 200,
  after_example: 300
}

// ============================================================================
// 主要类：WorldbookInjector
// ============================================================================

/**
 * 世界书注入引擎
 *
 * 负责根据上下文动态匹配和注入世界书条目内容
 * 支持多种触发条件和复杂的条件表达式评估
 *
 * @example
 * ```typescript
 * const injector = new WorldbookInjector(worldbook, {
 *   tokenCounter: (text) => countTokens(text)
 * })
 *
 * const result = injector.inject({
 *   projectId: 'proj-001',
 *   currentChapter: 5,
 *   currentContent: '主角遇到了林清雪...',
 *   characters: [...],
 *   recentEvents: ['事件1', '事件2'],
 *   worldState: { currentLocation: '青云宗' }
 * })
 *
 * console.log(result.injectedContent)
 * console.log(result.injectionLog)
 * ```
 */
export class WorldbookInjector {
  // ===========================================================================
  // 私有属性
  // ===========================================================================

  private worldbook: Worldbook | null = null
  private groups: Map<string, WorldbookGroup>
  private tokenCounter: TokenCounter
  private customConditionEvaluators: Map<string, ConditionEvaluator>

  // ===========================================================================
  // 构造函数
  // ===========================================================================

  /**
   * 创建世界书注入器实例
   *
   * @param worldbook - 世界书数据
   * @param options - 配置选项
   */
  constructor(
    worldbook?: Worldbook,
    options?: {
      /** Token 计数器函数 */
      tokenCounter?: TokenCounter
      /** 分组数据 */
      groups?: WorldbookGroup[]
      /** 自定义条件评估器 */
      customEvaluators?: Map<string, ConditionEvaluator>
    }
  ) {
    if (worldbook) {
      this.worldbook = worldbook
    }
    this.groups = new Map()
    this.tokenCounter = options?.tokenCounter || this.defaultTokenCounter
    this.customConditionEvaluators = options?.customEvaluators || new Map()

    // 初始化分组
    if (options?.groups) {
      options.groups.forEach(group => {
        this.groups.set(group.id, group)
      })
    }
  }

  // ===========================================================================
  // 公共方法
  // ===========================================================================

  /**
   * 设置世界书
   */
  setWorldbook(worldbook: Worldbook): void {
    this.worldbook = worldbook
    logger.info('世界书已设置', {
      entryCount: worldbook.entries.length,
      groupCount: worldbook.groups?.length || 0
    })
  }

  /**
   * 获取世界书
   */
  getWorldbook(): Worldbook | null {
    return this.worldbook
  }

  /**
   * 执行注入逻辑
   *
   * @param context - 注入上下文
   * @returns 注入结果
   */
  inject(context: InjectionContext): InjectionResult {
    if (!this.worldbook) {
      logger.warn('世界书未设置，无法注入')
      return {
        entries: [],
        totalTokens: 0,
        injectedContent: '',
        injectionLog: [],
        stats: {
          totalEntries: 0,
          keywordMatched: 0,
          chapterInRange: 0,
          conditionSatisfied: 0,
          injected: 0,
          skippedDueToBudget: 0,
          filteredByPriority: 0
        }
      }
    }

    const startTime = Date.now()
    const injectionLog: InjectionLogEntry[] = []

    // 初始化统计信息
    const stats = {
      totalEntries: this.worldbook.entries.length,
      keywordMatched: 0,
      chapterInRange: 0,
      conditionSatisfied: 0,
      injected: 0,
      skippedDueToBudget: 0,
      filteredByPriority: 0
    }

    // 1. 收集所有触发的条目
    const triggeredEntries = this.collectTriggeredEntries(context, injectionLog, stats)

    // 2. 按优先级和顺序排序
    const sortedEntries = this.sortEntries(triggeredEntries)

    // 3. 应用 Token 预算控制
    const { entries: budgetedEntries, skipped } = this.applyTokenBudget(
      sortedEntries,
      context.tokenBudget || DEFAULT_TOKEN_BUDGET,
      context.usedTokens || 0
    )
    stats.injected = budgetedEntries.length
    stats.skippedDueToBudget = skipped

    // 4. 生成注入内容
    const { injectedContent, totalTokens } = this.generateInjectedContent(budgetedEntries)

    // 5. 更新日志中的注入状态
    budgetedEntries.forEach((entry, index) => {
      const logEntry = injectionLog.find(log => log.entryId === String(entry.uid))
      if (logEntry) {
        logEntry.injected = true
        logEntry.injectionOrder = index
        logEntry.tokenCount = this.tokenCounter(entry.content)
      }
    })

    logger.info('世界书注入完成', {
      matchedCount: triggeredEntries.length,
      injectedCount: budgetedEntries.length,
      totalTokens,
      duration: Date.now() - startTime
    })

    return {
      entries: budgetedEntries,
      totalTokens,
      injectedContent,
      injectionLog,
      groups: Array.from(this.groups.values()),
      stats
    }
  }

  // ===========================================================================
  // 私有方法：注入流程核心逻辑
  // ===========================================================================

  /**
   * 收集所有触发的条目
   *
   * @param context - 注入上下文
   * @param injectionLog - 注入日志
   * @param stats - 统计信息
   * @returns 触发的条目列表
   */
  private collectTriggeredEntries(
    context: InjectionContext,
    injectionLog: InjectionLogEntry[],
    stats: InjectionResult['stats']
  ): WorldbookEntry[] {
    if (!this.worldbook) {
      return []
    }

    const triggered: WorldbookEntry[] = []
    const injectedEntries = context.injectedEntries || new Set<string>()

    for (const entry of this.worldbook.entries) {
      // 跳过已注入的条目
      if (entry.uid && injectedEntries.has(String(entry.uid))) {
        continue
      }

      // 跳过禁用的条目
      if (entry.enabled === false) {
        continue
      }

      const logEntry: InjectionLogEntry = {
        entryId: entry.uid ? String(entry.uid) : `entry-${Date.now()}`,
        entryName: entry.name || (entry.keys || []).join(', '),
        timestamp: Date.now(),
        triggerReason: 'keyword',
        evaluationResult: {
          keywordMatched: false,
          chapterInRange: false,
          conditionSatisfied: false,
          filtered: false
        },
        injected: false,
        injectionOrder: 0
      }

      // 1. 检查关键词匹配
      const keywordMatched = this.checkKeywordMatch(entry, context)
      logEntry.evaluationResult.keywordMatched = keywordMatched

      if (keywordMatched) {
        stats.keywordMatched++
        logEntry.matchedKeywords = (entry.keys || []).filter(key =>
          this.matchesKeyword(key, context)
        )
      }

      // 2. 检查章节范围
      const chapterInRange = this.checkChapterRange(entry, context.currentChapter)
      logEntry.evaluationResult.chapterInRange = chapterInRange

      if (chapterInRange) {
        stats.chapterInRange++
      }

      // 3. 检查条件表达式
      const conditionSatisfied = this.checkConditions(entry, context)
      logEntry.evaluationResult.conditionSatisfied = conditionSatisfied

      if (conditionSatisfied) {
        stats.conditionSatisfied++
      }

      // 4. 决定是否触发
      const isTriggered = keywordMatched && chapterInRange && conditionSatisfied

      if (isTriggered) {
        triggered.push(entry)
      }

      injectionLog.push(logEntry)
    }

    return triggered
  }

  /**
   * 检查关键词匹配
   *
   * @param entry - 世界书条目
   * @param context - 注入上下文
   * @returns 是否匹配
   */
  private checkKeywordMatch(entry: WorldbookEntry, context: InjectionContext): boolean {
    const { keys, secondary_keys, selective } = entry

    // 如果启用了选择性匹配
    if (selective) {
      // 需要同时匹配主关键词和次要关键词
      const hasPrimary = (keys || []).some(key => this.matchesKeyword(key, context))

      if (!hasPrimary) {
        return false
      }

      // 如果有次要关键词，至少要匹配一个
      if (secondary_keys && secondary_keys.length > 0) {
        return secondary_keys.some(key => this.matchesKeyword(key, context))
      }

      return true
    }

    // 标准匹配：匹配任意关键词
    return (keys || []).some(key => this.matchesKeyword(key, context))
  }

  /**
   * 匹配单个关键词
   *
   * @param keyword - 关键词
   * @param context - 注入上下文
   * @returns 是否匹配
   */
  private matchesKeyword(keyword: string, context: InjectionContext): boolean {
    const { currentContent, userPrompt, chapterContext, characters, recentEvents } = context

    // 构建搜索文本
    const searchSources = [
      currentContent,
      userPrompt || '',
      chapterContext?.title || '',
      chapterContext?.location || '',
      ...(recentEvents || [])
    ]

    // 添加角色信息
    if (chapterContext?.characterIds) {
      const contextCharacters = characters.filter(c =>
        chapterContext.characterIds!.includes(c.id)
      )
      searchSources.push(...contextCharacters.map(c => c.name))
      searchSources.push(...contextCharacters.map(c => c.systemPrompt))
    }

    const searchText = searchSources.join(' ')

    // 根据条目配置决定匹配方式
    // 默认进行全词匹配（忽略大小写）
    const caseSensitive = false // 可以从条目配置中读取

    if (caseSensitive) {
      return searchText.includes(keyword)
    } else {
      const lowerText = searchText.toLowerCase()
      const lowerKeyword = keyword.toLowerCase()
      return lowerText.includes(lowerKeyword)
    }
  }

  /**
   * 检查章节范围
   *
   * @param entry - 世界书条目
   * @param currentChapter - 当前章节
   * @returns 是否在范围内
   */
  private checkChapterRange(entry: WorldbookEntry, currentChapter: number): boolean {
    // 从扩展字段中读取章节范围
    const extensions = entry.extensions || {}
    const startChapter = extensions.startChapter as number | undefined
    const endChapter = extensions.endChapter as number | undefined

    // 如果没有指定章节范围，默认在范围内
    if (startChapter === undefined && endChapter === undefined) {
      return true
    }

    // 检查起始章节
    if (startChapter !== undefined && currentChapter < startChapter) {
      return false
    }

    // 检查结束章节
    if (endChapter !== undefined && currentChapter > endChapter) {
      return false
    }

    return true
  }

  /**
   * 检查条件表达式
   *
   * @param entry - 世界书条目
   * @param context - 注入上下文
   * @returns 条件是否满足
   */
  private checkConditions(entry: WorldbookEntry, context: InjectionContext): boolean {
    const extensions = entry.extensions || {}
    const condition = extensions.condition as WorldbookCondition | undefined

    // 如果没有条件，默认通过
    if (!condition) {
      return true
    }

    // 评估条件表达式
    return this.evaluateCondition(condition, context)
  }

  /**
   * 评估条件表达式
   *
   * @param condition - 条件表达式
   * @param context - 注入上下文
   * @returns 条件是否满足
   */
  private evaluateCondition(
    condition: WorldbookCondition,
    context: InjectionContext
  ): boolean {
    switch (condition.type) {
      case 'and':
        return (condition.conditions || []).every(c =>
          this.evaluateCondition(c, context)
        )

      case 'or':
        return (condition.conditions || []).some(c =>
          this.evaluateCondition(c, context)
        )

      case 'not':
        return !this.evaluateCondition(condition.conditions![0], context)

      case 'comparison':
        return this.evaluateComparison(condition, context)

      case 'exists':
        return this.evaluateExists(condition, context)

      case 'regex':
        return this.evaluateRegex(condition, context)

      case 'custom':
        return this.evaluateCustom(condition, context)

      default:
        logger.warn(`Unknown condition type: ${condition.type}`)
        return false
    }
  }

  /**
   * 评估比较条件
   */
  private evaluateComparison(
    condition: WorldbookCondition,
    context: InjectionContext
  ): boolean {
    const { field, operator, value } = condition

    if (!field || operator === undefined || value === undefined) {
      return false
    }

    // 获取字段值
    const fieldValue = this.getFieldValue(field, context)

    // 执行比较
    switch (operator) {
      case 'eq':
        return fieldValue === value
      case 'ne':
        return fieldValue !== value
      case 'gt':
        return (fieldValue as number) > (value as number)
      case 'gte':
        return (fieldValue as number) >= (value as number)
      case 'lt':
        return (fieldValue as number) < (value as number)
      case 'lte':
        return (fieldValue as number) <= (value as number)
      case 'contains':
        return String(fieldValue).includes(String(value))
      case 'matches': {
        const safeResult = createSafeRegex(String(value))
        return safeResult ? safeResult.test(String(fieldValue)) : false
      }
      default:
        return false
    }
  }

  /**
   * 评估存在性条件
   */
  private evaluateExists(
    condition: WorldbookCondition,
    context: InjectionContext
  ): boolean {
    const { field } = condition

    if (!field) {
      return false
    }

    const fieldValue = this.getFieldValue(field, context)

    if (Array.isArray(fieldValue)) {
      return fieldValue.length > 0
    }

    return fieldValue !== undefined && fieldValue !== null
  }

  /**
   * 评估正则条件
   */
  private evaluateRegex(
    condition: WorldbookCondition,
    context: InjectionContext
  ): boolean {
    const { field, pattern, flags } = condition

    if (!field || !pattern) {
      return false
    }

    const fieldValue = String(this.getFieldValue(field, context))

    try {
      const regex = createSafeRegex(pattern, flags)
      if (!regex) {
        logger.warn(`Unsafe regex pattern blocked: ${pattern}`)
        return false
      }
      return regex.test(fieldValue)
    } catch (error) {
      logger.error(`Invalid regex pattern: ${pattern}`, error)
      return false
    }
  }

  /**
   * 评估自定义条件
   */
  private evaluateCustom(
    condition: WorldbookCondition,
    context: InjectionContext
  ): boolean {
    const { customFunction } = condition

    if (!customFunction) {
      return false
    }

    const evaluator = this.customConditionEvaluators.get(customFunction)

    if (!evaluator) {
      logger.warn(`Custom condition evaluator not found: ${customFunction}`)
      return false
    }

    return evaluator(condition, context)
  }

  /**
   * 获取字段值
   *
   * @param field - 字段路径（支持点号分隔）
   * @param context - 注入上下文
   * @returns 字段值
   */
  private getFieldValue(field: string, context: InjectionContext): unknown {
    const parts = field.split('.')
    let value: unknown = context

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }

    return value
  }

  /**
   * 按分组过滤条目
   */
  private filterByGroups(
    entries: WorldbookEntry[],
    groups: WorldbookGroup[]
  ): WorldbookEntry[] {
    // 获取启用的组
    const enabledGroups = groups.filter(g => g.enabled)

    // 获取所有启用组的条目ID
    const enabledEntryIds = new Set<string>()
    enabledGroups.forEach(g => {
      (g.entryIds || []).forEach(id => enabledEntryIds.add(String(id)))
    })

    // 过滤条目：保留属于启用组的条目或没有组的条目
    return entries.filter(entry => {
      // 如果条目没有组，保留
      if (!entry.group) {
        return true
      }

      // 如果条目属于启用的组，保留
      return enabledEntryIds.has(String(entry.uid) || entry.group || '')
    })
  }

  /**
   * 排序条目
   *
   * @param entries - 条目列表
   * @returns 排序后的条目列表
   */
  private sortEntries(entries: WorldbookEntry[]): WorldbookEntry[] {
    return [...entries].sort((a, b) => {
      // 1. 按位置排序
      const positionA = a.position || 'before_char'
      const positionB = b.position || 'before_char'
      const weightA = POSITION_WEIGHTS[positionA] || 0
      const weightB = POSITION_WEIGHTS[positionB] || 0

      if (weightA !== weightB) {
        return weightA - weightB
      }

      // 2. 按优先级排序（数字越大越靠前）
      const priorityA = a.priority ?? DEFAULT_PRIORITY
      const priorityB = b.priority ?? DEFAULT_PRIORITY

      if (priorityA !== priorityB) {
        return priorityB - priorityA
      }

      // 3. 按插入顺序排序（数字越小越靠前）
      const orderA = a.insertion_order ?? DEFAULT_INSERTION_ORDER
      const orderB = b.insertion_order ?? DEFAULT_INSERTION_ORDER

      return orderA - orderB
    })
  }

  /**
   * 应用 Token 预算控制
   *
   * @param entries - 条目列表
   * @param budget - Token 预算
   * @param usedTokens - 已使用的 Token
   * @returns 预算内的条目列表和跳过的数量
   */
  private applyTokenBudget(
    entries: WorldbookEntry[],
    budget: number,
    usedTokens: number
  ): { entries: WorldbookEntry[]; skipped: number } {
    const remainingBudget = budget - usedTokens
    const selected: WorldbookEntry[] = []
    let currentTokens = 0
    let skipped = 0

    for (const entry of entries) {
      const entryTokens = this.tokenCounter(entry.content)

      // 检查是否超出预算
      if (currentTokens + entryTokens > remainingBudget) {
        skipped++
        continue
      }

      selected.push(entry)
      currentTokens += entryTokens
    }

    return { entries: selected, skipped }
  }

  /**
   * 生成注入内容
   *
   * @param entries - 条目列表
   * @returns 注入内容和总 Token 数
   */
  private generateInjectedContent(
    entries: WorldbookEntry[]
  ): { injectedContent: string; totalTokens: number } {
    const parts: string[] = []
    let totalTokens = 0

    // 按位置分组
    const grouped = this.groupByPosition(entries)

    // 生成各部分内容
    const positions: Array<'before_char' | 'after_char' | 'before_example' | 'after_example'> = [
      'before_char',
      'after_char',
      'before_example',
      'after_example'
    ]

    for (const position of positions) {
      const entriesAtPosition = grouped[position] || []

      if (entriesAtPosition.length > 0) {
        const content = entriesAtPosition
          .map(e => e.content)
          .join('\n\n')

        parts.push(`[${position}]\n${content}`)
        totalTokens += this.tokenCounter(content)
      }
    }

    return {
      injectedContent: parts.join('\n\n---\n\n'),
      totalTokens
    }
  }

  /**
   * 按位置分组
   *
   * @param entries - 条目列表
   * @returns 分组后的条目
   */
  private groupByPosition(
    entries: WorldbookEntry[]
  ): Record<string, WorldbookEntry[]> {
    const grouped: Record<string, WorldbookEntry[]> = {}

    for (const entry of entries) {
      const position = entry.position || 'before_char'

      if (!grouped[position]) {
        grouped[position] = []
      }

      grouped[position].push(entry)
    }

    return grouped
  }

  /**
   * 默认 Token 计数器
   * 简单估算：平均每个字符约 0.5 tokens
   *
   * @param text - 文本内容
   * @returns Token 数量
   */
  private defaultTokenCounter(text: string): number {
    if (!text) {
      return 0
    }

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length

    // 统计英文单词
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length

    // 估算 token 数
    const tokens = Math.ceil(chineseChars * 0.6 + englishWords * 1.3)

    return tokens
  }

  /**
   * 更新世界书数据
   *
   * @param worldbook - 新的世界书数据
   */
  updateWorldbook(worldbook: Worldbook): void {
    this.worldbook = worldbook
    logger.info('世界书已更新', {
      entryCount: worldbook.entries.length
    })
  }

  /**
   * 添加或更新分组
   *
   * @param group - 分组数据
   */
  setGroup(group: WorldbookGroup): void {
    this.groups.set(group.id, group)
  }

  /**
   * 移除分组
   *
   * @param groupId - 分组ID
   */
  removeGroup(groupId: string): boolean {
    return this.groups.delete(groupId)
  }

  /**
   * 注册自定义条件评估器
   *
   * @param name - 条件名称
   * @param evaluator - 评估函数
   */
  registerConditionEvaluator(name: string, evaluator: ConditionEvaluator): void {
    this.customConditionEvaluators.set(name, evaluator)
  }

  /**
   * 查找特定条目
   */
  findEntry(entryId: string): WorldbookEntry | undefined {
    return this.worldbook?.entries.find(e => String(e.uid) === entryId)
  }

  /**
   * 按关键词查找条目
   */
  findEntriesByKeyword(keyword: string): WorldbookEntry[] {
    if (!this.worldbook) {
      return []
    }

    const lowerKeyword = keyword.toLowerCase()

    return this.worldbook.entries.filter(entry =>
      entry.keys && entry.keys.some(key =>
        entry.case_sensitive
          ? key.includes(keyword)
          : key.toLowerCase().includes(lowerKeyword)
      )
    )
  }

  /**
   * 按类型查找条目
   */
  findEntriesByType(type: WorldbookEntry['type']): WorldbookEntry[] {
    if (!this.worldbook) {
      return []
    }

    return this.worldbook.entries.filter(entry => entry.type === type)
  }

  /**
   * 按分类查找条目
   */
  findEntriesByCategory(category: string): WorldbookEntry[] {
    if (!this.worldbook) {
      return []
    }

    return this.worldbook.entries.filter(entry => entry.category === category)
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalEntries: number
    enabledEntries: number
    groups: number
    byType: Record<string, number>
    byCategory: Record<string, number>
  } {
    if (!this.worldbook) {
      return {
        totalEntries: 0,
        enabledEntries: 0,
        groups: 0,
        byType: {},
        byCategory: {}
      }
    }

    const entries = this.worldbook.entries

    const stats = {
      totalEntries: entries.length,
      enabledEntries: entries.filter(e => e.enabled !== false).length,
      groups: this.worldbook.groups?.length || 0,
      byType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>
    }

    // 按类型统计
    entries.forEach(entry => {
      const type = entry.type || 'custom'
      stats.byType[type] = (stats.byType[type] || 0) + 1
    })

    // 按分类统计
    entries.forEach(entry => {
      if (entry.category) {
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1
      }
    })

    return stats
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建世界书注入器实例
 *
 * @param worldbook - 世界书数据
 * @param options - 配置选项
 * @returns 注入器实例
 */
export function createInjector(
  worldbook?: Worldbook,
  options?: {
    tokenCounter?: TokenCounter
    groups?: WorldbookGroup[]
    customEvaluators?: Map<string, ConditionEvaluator>
  }
): WorldbookInjector {
  return new WorldbookInjector(worldbook, options)
}

/**
 * 创建世界书注入器实例（别名）
 */
export const createWorldbookInjector = createInjector

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 合并多个世界书
 *
 * @param worldbooks - 世界书列表
 * @param options - 合并选项
 * @returns 合并后的世界书
 */
export function mergeWorldbooks(
  worldbooks: Worldbook[],
  options?: {
    /** 是否去重 */
    deduplicate?: boolean
    /** 是否更新时间戳 */
    updateTimestamps?: boolean
    /** 自定义合并函数 */
    mergeFunction?: (existing: WorldbookEntry, incoming: WorldbookEntry) => WorldbookEntry
  }
): Worldbook {
  const merged: Worldbook = {
    entries: [],
    name: 'Merged Worldbook',
    description: `Merged from ${worldbooks.length} worldbooks`
  }

  const entryMap = new Map<string, WorldbookEntry>()

  for (const worldbook of worldbooks) {
    for (const entry of worldbook.entries) {
      const key = entry.uid ? String(entry.uid) : (entry.keys || []).join(',')

      if (options?.deduplicate && entryMap.has(key)) {
        const existing = entryMap.get(key)!
        if (options?.mergeFunction) {
          entryMap.set(key, options.mergeFunction(existing, entry))
        } else {
          // 默认：保留较新的条目
          const existingTime = existing.updated_at || existing.created_at || 0
          const entryTime = entry.updated_at || entry.created_at || 0

          if (entryTime >= existingTime) {
            entryMap.set(key, entry)
          }
        }
      } else {
        entryMap.set(key, entry)
      }
    }
  }

  merged.entries = Array.from(entryMap.values())

  if (options?.updateTimestamps) {
    const now = Date.now()
    merged.entries.forEach(entry => {
      entry.updated_at = now
    })
  }

  return merged
}

/**
 * 过滤世界书条目
 *
 * @param worldbook - 世界书数据
 * @param predicate - 过滤条件
 * @returns 过滤后的世界书
 */
export function filterWorldbook(
  worldbook: Worldbook,
  predicate: (entry: WorldbookEntry) => boolean
): Worldbook {
  return {
    ...worldbook,
    entries: worldbook.entries.filter(predicate)
  }
}

/**
 * 导出世界书为 JSON
 *
 * @param worldbook - 世界书数据
 * @param pretty - 是否美化输出
 * @returns JSON 字符串
 */
export function exportWorldbookToJson(
  worldbook: Worldbook,
  pretty: boolean = true
): string {
  return JSON.stringify(worldbook, null, pretty ? 2 : undefined)
}

/**
 * 从 JSON 导入世界书
 *
 * @param json - JSON 字符串
 * @returns 世界书数据
 */
export function importWorldbookFromJson(json: string): Worldbook {
  return JSON.parse(json) as Worldbook
}
