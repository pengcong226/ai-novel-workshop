/**
 * 世界书类型定义 - 完全兼容 SillyTavern 格式
 * @module types/worldbook
 *
 * 基于 SillyTavern Character Book 格式
 * 参考: https://docs.sillytavern.app/extensions/character-book/
 */

// ============================================================================
// SillyTavern 核心类型
// ============================================================================

/**
 * 世界书条目 - SillyTavern 核心字段 + AI小说工坊扩展
 *
 * 核心字段完全兼容 SillyTavern Character Book 格式
 */
export interface WorldbookEntry {
  // ============ SillyTavern 核心字段 ============

  /** 条目唯一标识 (SillyTavern使用数字UID) */
  uid: number

  /** 主关键词列表 - 触发条目的关键词 */
  key: string[]

  /** 次要关键词列表 - 辅助触发条件 */
  keysecondary?: string[]

  /** 条目内容 - 被注入的知识内容 */
  content: string

  /** 备注/注释 - 创建者备注 */
  comment?: string

  /** 是否常量条目 - 常量条目始终激活,无需关键词触发 */
  constant?: boolean

  /** 是否选择性激活 - 使用高级条件逻辑 */
  selective?: boolean

  /** 插入顺序 - 控制条目注入的优先级,数字越大优先级越高 */
  order?: number

  /** 插入位置 - 控制条目在提示词中的位置 */
  position?: 'before_char' | 'after_char' | 'before_example' | 'after_example'

  /** 是否禁用 - 禁用的条目不会被激活 */
  disable?: boolean

  /** 是否排除递归 - 防止此条目被其他条目递归触发 */
  excludeRecursion?: boolean

  /** 激活概率 (0-100) - 控制条目触发的概率 */
  probability?: number

  /** 扫描深度 - 控制扫描历史消息的深度 */
  depth?: number

  /** 是否使用概率 - 是否启用概率触发 */
  useProbability?: boolean

  /** 显示索引 - UI排序用 */
  displayIndex?: number

  /** 扩展字段 - SillyTavern兼容的自定义扩展数据 */
  extensions?: Record<string, unknown>

  // ============ AI小说工坊扩展字段 ============

  /** AI小说工坊特有扩展 */
  novelWorkshop?: NovelWorkshopWorldbookExtensions
}

/**
 * AI小说工坊 - 世界书条目扩展字段
 *
 * 在保持SillyTavern兼容性的基础上,提供AI小说工坊特有的增强功能
 */
export interface NovelWorkshopWorldbookExtensions {
  // ============ 组织与分类 ============

  /** 分类标签 - 用于组织条目 */
  category?: string

  /** 标签列表 - 用于更灵活的分类和搜索 */
  tags?: string[]

  // ============ 时间追踪 ============

  /** 创建时间 */
  createdAt?: Date

  /** 更新时间 */
  updatedAt?: Date

  // ============ 来源追踪 ============

  /** 来源类型 */
  sourceType?: 'manual' | 'ai_generated' | 'imported' | 'merged'

  // ============ 关联关系 ============

  /** 关联人物ID列表 - 与哪些角色相关 */
  relatedCharacters?: string[]

  /** 关联地点ID列表 - 与哪些地点相关 */
  relatedLocations?: string[]

  // ============ 适用范围 ============

  /** 适用章节范围 - 限制条目在特定章节范围生效 */
  chapterRange?: {
    /** 起始章节 (包含) */
    start?: number
    /** 结束章节 (包含) */
    end?: number
  }

  // ============ 高级条件 ============

  /** 条件表达式 - 更复杂的激活条件逻辑 */
  conditions?: WorldbookCondition[]

  // ============ 可视化 ============

  /** 可视化数据 - 用于地图、关系图等可视化 */
  visualData?: {
    /** 地图位置 */
    mapPosition?: {
      x: number
      y: number
    }
    /** 图标 */
    icon?: string
    /** 颜色 */
    color?: string
  }

  // ============ 统计信息 ============

  /** 统计信息 - 使用情况追踪 */
  statistics?: {
    /** 激活次数 */
    activationCount?: number
    /** 最后激活的章节 */
    lastActivatedChapter?: number
    /** Token使用统计 */
    tokenUsage?: number
  }

  // ============ AI生成元数据 ============

  /** AI生成相关元数据 */
  aiGenerated?: {
    /** 是否由AI生成 */
    generated?: boolean
    /** 生成模型 */
    model?: string
    /** 生成时间 */
    timestamp?: Date
    /** 生成提示词 */
    prompt?: string
    /** 置信度 (0-1) */
    confidence?: number
  }
}

/**
 * 世界书条件表达式
 *
 * 支持复杂的条件逻辑,用于精确控制条目激活
 */
export interface WorldbookCondition {
  /** 条件类型 */
  type:
    | 'and'         // 与逻辑 - 所有子条件都满足
    | 'or'          // 或逻辑 - 任一子条件满足
    | 'not'         // 非逻辑 - 取反
    | 'chapter'     // 章节条件
    | 'character'   // 角色条件
    | 'location'    // 地点条件
    | 'variable'    // 变量条件
    | 'time'        // 时间条件

  /** 条件值 - 根据type不同而变化 */
  value: string | number | boolean | WorldbookCondition[]

  /** 目标字段 - 用于变量条件 */
  target?: string

  /** 比较运算符 */
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches' | 'in'
}

// ============================================================================
// 完整世界书
// ============================================================================

/**
 * 完整世界书
 *
 * 包含所有条目和元数据的世界书数据结构
 */
export interface Worldbook {
  /** 世界书名称 */
  name?: string

  /** 条目列表 */
  entries: WorldbookEntry[]

  /** 元数据 */
  metadata?: WorldbookMetadata
}

/**
 * 世界书元数据
 */
export interface WorldbookMetadata {
  // ============ 基础信息 ============

  /** 来源平台 */
  source?: 'sillytavern' | 'tavernai' | 'character_card_v3' | 'novel_workshop'

  /** 格式版本 */
  format?: 'v1' | 'v2' | 'v3'

  /** 创建时间 */
  createdAt?: Date

  /** 更新时间 */
  updatedAt?: Date

  // ============ 统计信息 ============

  /** 总条目数 */
  totalEntries?: number

  /** 描述 */
  description?: string

  /** 标签 */
  tags?: string[]

  // ============ 来源追踪 ============

  /** 如果是从角色卡提取的,记录来源 */
  extracted_from_character?: {
    /** 角色名 */
    character_name: string
    /** 角色卡文件名 */
    character_file: string
    /** 提取时间 */
    extracted_at: Date
  }

  // ============ 配置 ============

  /** 扫描深度 */
  scan_depth?: number

  /** Token预算 */
  token_budget?: number

  /** 递归扫描深度 */
  recursive_scan_depth?: number

  /** 扩展字段 */
  extensions?: Record<string, unknown>
}

/**
 * @deprecated 使用 Worldbook 替代
 */
export type WorldbookData = Worldbook

/**
 * 世界书导入选项
 */
export interface WorldbookImportOptions {
  // ============ 格式设置 ============

  /** 来源格式 */
  format?: 'sillytavern' | 'tavernai' | 'character_card_v3' | 'json' | 'yaml' | 'markdown'

  // ============ ID 生成 ============

  /** 是否自动生成ID */
  autoGenerateIds?: boolean

  /** 是否保留原始ID */
  preserveIds?: boolean

  // ============ 冲突处理 ============

  /** 是否覆盖已存在的条目 */
  overwrite?: boolean

  /** 是否合并重复条目 */
  mergeDuplicates?: boolean

  /** 重复条目处理策略 */
  duplicateStrategy?: 'skip' | 'overwrite' | 'merge' | 'rename'

  /** 冲突解决策略 */
  conflictResolution?: 'keep_both' | 'overwrite' | 'skip' | 'merge' | 'rename'

  // ============ 数据处理 ============

  /** 是否验证数据完整性 */
  validate?: boolean

  /** 是否去重 */
  deduplicate?: boolean

  /** 是否自动分类 */
  autoCategorize?: boolean

  /** 是否推断分类 */
  inferCategories?: boolean

  /** 是否提取AI元数据 */
  extractAiMetadata?: boolean

  /** 是否启用所有条目 */
  enableAllEntries?: boolean

  /** 是否创建分组 */
  createGroups?: boolean

  /** 默认分类名称 */
  defaultCategory?: string

  /** 目标分组ID */
  targetGroup?: string

  /** 字段映射 (自定义导入映射) */
  fieldMapping?: Record<string, string>

  // ============ 过滤与转换 ============

  /** 条目过滤函数 */
  filter?: (entry: WorldbookEntry) => boolean

  /** 条目转换函数 */
  transform?: (entry: WorldbookEntry) => WorldbookEntry

  // ============ 进度回调 ============

  /** 进度回调函数 */
  onProgress?: (current: number, total: number, message: string) => void
}

/**
 * 世界书导入结果
 */
export interface WorldbookImportResult {
  /** 是否成功 */
  success: boolean

  /** 导入的条目数 */
  importedCount: number

  /** 跳过的条目数 */
  skippedCount: number

  /** 错误列表 */
  errors?: WorldbookImportError[]

  /** 警告列表 */
  warnings?: string[]

  /** 导入的条目 */
  entries?: WorldbookEntry[]

  /** 导入统计 */
  statistics?: {
    /** 总数 */
    total: number
    /** 导入成功 */
    imported: number
    /** 跳过 */
    skipped: number
    /** 重复 */
    duplicates: number
    /** 无效 */
    invalid: number
  }
}

/**
 * 世界书导入错误
 */
export interface WorldbookImportError {
  /** 条目索引 */
  index?: number

  /** 条目UID */
  uid?: number

  /** 错误类型 */
  type: 'validation' | 'duplicate' | 'invalid_format' | 'missing_field' | 'unknown'

  /** 错误消息 */
  message: string

  /** 原始数据 */
  rawData?: unknown
}

/**
 * 世界书冲突处理策略
 */
export type ConflictResolution = 'skip' | 'overwrite' | 'merge' | 'rename'

/**
 * 世界书合并选项
 */
export interface WorldbookMergeOptions {
  /** 冲突处理策略 */
  conflictResolution?: ConflictResolution

  /** 是否保留原始ID */
  preserveIds?: boolean

  /** 合并时是否更新时间戳 */
  updateTimestamps?: boolean

  /** 自定义合并函数 */
  mergeFunction?: (existing: WorldbookEntry, incoming: WorldbookEntry) => WorldbookEntry
}

/**
 * 世界书导出选项
 */
export interface WorldbookExportOptions {
  // ============ 格式设置 ============

  /** 导出格式 */
  format: 'sillytavern' | 'tavernai' | 'json' | 'yaml' | 'markdown'

  // ============ 内容控制 ============

  /** 是否包含AI小说工坊扩展字段 */
  includeExtensions?: boolean

  /** 是否包含统计信息 */
  includeStatistics?: boolean

  /** 是否包含AI生成元数据 */
  includeAiMetadata?: boolean

  /** 是否按分组导出 */
  groupByCategory?: boolean

  /** 是否只导出启用的条目 */
  enabledOnly?: boolean

  /** 是否包含禁用的条目 */
  includeDisabled?: boolean

  // ============ 排序与格式化 ============

  /** 排序方式 */
  sortBy?: 'uid' | 'order' | 'alphabetical' | 'category' | 'created_at'

  /** Markdown导出时的模板 */
  markdownTemplate?: 'detailed' | 'compact' | 'reference'

  /** 是否美化输出 (JSON/YAML) */
  pretty?: boolean

  // ============ 过滤 ============

  /** 条目过滤函数 */
  filter?: (entry: WorldbookEntry) => boolean
}

/**
 * 世界书导出结果
 */
export interface WorldbookExportResult {
  /** 是否成功 */
  success: boolean

  /** 导出的数据 */
  data?: string | Blob

  /** 导出的条目数 */
  exportedCount: number

  /** 文件名建议 */
  suggestedFilename?: string

  /** MIME类型 */
  mimeType?: string

  /** 错误消息 */
  error?: string
}

// ============================================================================
// Character Card V3 内嵌世界书
// ============================================================================

/**
 * Character Card V3 内嵌世界书 (Character Book)
 *
 * SillyTavern Character Card V3 格式中嵌入的世界书
 */
export interface CharacterBook {
  /** 条目列表 */
  entries: WorldbookEntry[]

  /** 世界书名称 */
  name?: string

  /** 描述 */
  description?: string

  /** 扫描深度 */
  scan_depth?: number

  /** Token预算 */
  token_budget?: number

  /** 递归扫描深度 */
  recursive_scan_depth?: number

  /** 扩展字段 */
  extensions?: Record<string, unknown>
}

// ============================================================================
// 世界书条目模板
// ============================================================================

/**
 * 世界书条目模板
 *
 * 预定义的条目模板,用于快速创建常见类型的条目
 */
export interface WorldbookEntryTemplate {
  /** 模板ID */
  id: string

  /** 模板名称 */
  name: string

  /** 模板描述 */
  description?: string

  /** 模板分类 */
  category: string

  /** 预设字段值 */
  preset: Partial<WorldbookEntry>

  /** 标签 */
  tags?: string[]

  /** 使用次数统计 */
  usageCount?: number

  /** 创建时间 */
  createdAt: Date

  /** 更新时间 */
  updatedAt: Date
}

// ============================================================================
// 世界书分组
// ============================================================================

/**
 * 世界书分组
 *
 * 用于组织和分类世界书条目
 */
export interface WorldbookGroup {
  /** 分组ID */
  id: string

  /** 分组名称 */
  name: string

  /** 分组描述 */
  description?: string

  /** 分组颜色 (十六进制颜色码) */
  color?: string

  /** 分组图标 (图标名称或URL) */
  icon?: string

  /** 分组排序 (数字越小越靠前) */
  order: number

  /** 是否折叠 */
  collapsed?: boolean

  /** 分组内的条目UID列表 */
  entries: number[]

  /** 子分组ID列表 (支持分组嵌套) */
  subgroups?: string[]
}

// ============================================================================
// 世界书验证相关
// ============================================================================

/**
 * 世界书验证结果
 */
export interface WorldbookValidationResult {
  /** 是否有效 */
  valid: boolean

  /** 错误列表 */
  errors: WorldbookValidationError[]

  /** 警告列表 */
  warnings: WorldbookValidationWarning[]

  /** 统计信息 */
  statistics: {
    /** 总条目数 */
    totalEntries: number
    /** 启用条目数 */
    enabledEntries: number
    /** 常量条目数 */
    constantEntries: number
    /** 重复关键词数 */
    duplicateKeys: number
    /** 平均内容长度 */
    averageContentLength: number
  }
}

/**
 * 世界书验证错误
 */
export interface WorldbookValidationError {
  /** 条目UID */
  uid?: number

  /** 字段名 */
  field: string

  /** 错误类型 */
  type: 'missing_required' | 'invalid_type' | 'invalid_value' | 'duplicate' | 'conflict'

  /** 错误消息 */
  message: string

  /** 建议修复方案 */
  suggestion?: string
}

/**
 * 世界书验证警告
 */
export interface WorldbookValidationWarning {
  /** 条目UID */
  uid?: number

  /** 字段名 */
  field?: string

  /** 警告类型 */
  type:
    | 'empty_content'
    | 'long_content'
    | 'many_keys'
    | 'low_probability'
    | 'recursive_excluded'
    | 'unused_entry'

  /** 警告消息 */
  message: string

  /** 建议 */
  suggestion?: string
}

// ============================================================================
// 世界书搜索与过滤
// ============================================================================

/**
 * 世界书搜索选项
 */
export interface WorldbookSearchOptions {
  /** 搜索关键词 */
  query?: string

  /** 搜索字段 */
  fields?: Array<'key' | 'content' | 'comment'>

  /** 是否区分大小写 */
  caseSensitive?: boolean

  /** 是否使用正则表达式 */
  useRegex?: boolean

  /** 分类过滤 */
  category?: string

  /** 标签过滤 */
  tags?: string[]

  /** 是否只搜索启用的条目 */
  enabledOnly?: boolean

  /** 是否只搜索常量条目 */
  constantOnly?: boolean

  /** 章节范围过滤 */
  chapterRange?: {
    start?: number
    end?: number
  }
}

/**
 * 世界书搜索结果
 */
export interface WorldbookSearchResult {
  /** 匹配的条目 */
  entries: WorldbookEntry[]

  /** 匹配统计 */
  statistics: {
    total: number
    matched: number
    byCategory: Record<string, number>
  }

  /** 高亮信息 */
  highlights?: Array<{
    uid: number
    field: string
    snippet: string
    matches: Array<{
      start: number
      end: number
    }>
  }>
}

// ============================================================================
// 世界书激活上下文 (用于章节生成)
// ============================================================================

/**
 * 世界书激活上下文
 *
 * 用于章节生成时判断哪些条目应该被激活
 */
export interface WorldbookActivationContext {
  /** 当前章节号 */
  chapterNumber: number

  /** 当前场景文本 */
  sceneText: string

  /** 出场人物ID列表 */
  activeCharacters: string[]

  /** 当前地点ID列表 */
  currentLocations: string[]

  /** 变量状态 */
  variables?: Record<string, unknown>

  /** Token预算 */
  tokenBudget?: number

  /** 已使用的Token数 */
  usedTokens?: number
}

/**
 * 世界书激活结果
 */
export interface WorldbookActivationResult {
  /** 激活的条目 */
  activatedEntries: Array<{
    entry: WorldbookEntry
    matchedKeys: string[]
    position: 'before_char' | 'after_char'
    tokens: number
  }>

  /** 总Token数 */
  totalTokens: number

  /** 激活统计 */
  statistics: {
    totalEntries: number
    activatedEntries: number
    constantEntries: number
    selectiveEntries: number
  }
}
