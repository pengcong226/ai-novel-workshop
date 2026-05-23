/**
 * 知识库类型定义
 * @module types/knowledge-base
 *
 * 基于SillyTavern Character Book格式的知识库系统
 */

import type { WorldbookEntry } from './worldbook'

/**
 * 知识库分类
 */
export enum KnowledgeCategory {
  /** API文档 */
  API_DOCUMENTATION = 'api_documentation',

  /** 使用教程 */
  TUTORIAL = 'tutorial',

  /** 最佳实践 */
  BEST_PRACTICE = 'best_practice',

  /** 常见问题 */
  FAQ = 'faq',

  /** 代码示例 */
  CODE_EXAMPLE = 'code_example',

  /** 系统提示 */
  SYSTEM_PROMPT = 'system_prompt',

  /** 工具说明 */
  TOOL_DOCUMENTATION = 'tool_documentation',

  /** 自定义 */
  CUSTOM = 'custom'
}

/**
 * 知识库条目（扩展WorldbookEntry）
 */
export interface KnowledgeEntry extends WorldbookEntry {
  // ============ 知识库特有字段 ============

  /** 分类 */
  category: KnowledgeCategory

  /** 标签 */
  tags: string[]

  /** 来源 */
  source?: string

  /** 作者 */
  author?: string

  /** 版本 */
  version?: string

  /** 相关条目UID列表 */
  relatedEntries?: number[]

  /** 使用次数 */
  usageCount?: number

  /** 最后使用时间 */
  lastUsedAt?: Date

  /** 有效期（天） */
  expiryDays?: number

  /** 过期时间 */
  expiresAt?: Date

  /** 优先级（用于排序） */
  priority?: number

  /** 是否收藏 */
  isFavorite?: boolean

  /** 备注 */
  notes?: string

  /** 扩展元数据 */
  metadata?: KnowledgeMetadata
}

/**
 * 知识库元数据
 */
export interface KnowledgeMetadata {
  /** 创建时间 */
  createdAt: Date

  /** 更新时间 */
  updatedAt: Date

  /** 创建者 */
  createdBy?: string

  /** 最后编辑者 */
  lastEditedBy?: string

  /** 审核状态 */
  reviewStatus?: 'draft' | 'pending' | 'approved' | 'rejected'

  /** 审核者 */
  reviewedBy?: string

  /** 审核时间 */
  reviewedAt?: Date

  /** 审核备注 */
  reviewNotes?: string

  /** 难度等级 */
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'expert'

  /** 预计阅读时间（分钟） */
  estimatedReadTime?: number

  /** 关键词（用于搜索） */
  searchKeywords?: string[]

  /** 外部链接 */
  externalLinks?: Array<{
    title: string
    url: string
    type: 'documentation' | 'example' | 'reference' | 'other'
  }>

  /** 附件 */
  attachments?: Array<{
    name: string
    url: string
    type: string
    size: number
  }>
}

/**
 * 知识库集合
 */
export interface KnowledgeBase {
  /** 知识库ID */
  id: string

  /** 名称 */
  name: string

  /** 描述 */
  description?: string

  /** 版本 */
  version?: string

  /** 作者 */
  author?: string

  /** 条目 */
  entries: KnowledgeEntry[]

  /** 分类 */
  categories: KnowledgeCategoryDefinition[]

  /** 标签 */
  tags: string[]

  /** 创建时间 */
  createdAt: Date

  /** 更新时间 */
  updatedAt: Date

  /** 元数据 */
  metadata?: {
    /** 总条目数 */
    totalEntries: number

    /** 已启用条目数 */
    enabledEntries: number

    /** 总使用次数 */
    totalUsage: number

    /** 最后使用时间 */
    lastUsedAt?: Date

    /** 数据来源 */
    source?: string

    /** 导入历史 */
    importHistory?: Array<{
      date: Date
      source: string
      count: number
    }>
  }
}

/**
 * 分类定义
 */
export interface KnowledgeCategoryDefinition {
  /** 分类ID */
  id: KnowledgeCategory

  /** 名称 */
  name: string

  /** 描述 */
  description?: string

  /** 图标 */
  icon?: string

  /** 颜色 */
  color?: string

  /** 排序 */
  order?: number

  /** 父分类 */
  parentId?: KnowledgeCategory
}

/**
 * 知识库导入选项
 */
export interface KnowledgeImportOptions {
  /** 是否覆盖已存在条目 */
  overwrite?: boolean

  /** 是否合并相同条目 */
  merge?: boolean

  /** 是否验证条目 */
  validate?: boolean

  /** 是否自动分类 */
  autoCategorize?: boolean

  /** 是否提取标签 */
  extractTags?: boolean

  /** 默认分类 */
  defaultCategory?: KnowledgeCategory

  /** 默认禁用状态 */
  defaultDisabled?: boolean

  /** 是否设置为常量 */
  setAsConstant?: boolean

  /** 是否清理内容 */
  cleanContent?: boolean
}

/**
 * 知识库导出选项
 */
export interface KnowledgeExportOptions {
  /** 格式 */
  format: 'json' | 'jsonl' | 'markdown' | 'csv'

  /** 是否仅导出启用的条目 */
  enabledOnly?: boolean

  /** 是否包含元数据 */
  includeMetadata?: boolean

  /** 是否包含统计 */
  includeStatistics?: boolean

  /** 分类过滤 */
  categoryFilter?: KnowledgeCategory[]

  /** 标签过滤 */
  tagFilter?: string[]

  /** 是否美化输出 */
  pretty?: boolean
}

/**
 * 知识库搜索选项
 */
export interface KnowledgeSearchOptions {
  /** 搜索查询 */
  query: string

  /** 搜索范围 */
  scope?: Array<'content' | 'comment' | 'tags' | 'source'>

  /** 分类过滤 */
  categories?: KnowledgeCategory[]

  /** 标签过滤 */
  tags?: string[]

  /** 是否仅启用条目 */
  enabledOnly?: boolean

  /** 是否仅收藏条目 */
  favoritesOnly?: boolean

  /** 排序方式 */
  sortBy?: 'relevance' | 'createdAt' | 'updatedAt' | 'usageCount' | 'priority'

  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc'

  /** 分页：偏移 */
  offset?: number

  /** 分页：限制 */
  limit?: number
}

/**
 * 知识库搜索结果
 */
export interface KnowledgeSearchResult {
  /** 条目 */
  entry: KnowledgeEntry

  /** 相关性分数 */
  score: number

  /** 匹配位置 */
  matches: Array<{
    field: string
    position: number
    length: number
    snippet: string
  }>
}

/**
 * 知识库统计
 */
export interface KnowledgeStatistics {
  /** 总条目数 */
  totalEntries: number

  /** 已启用条目数 */
  enabledEntries: number

  /** 已禁用条目数 */
  disabledEntries: number

  /** 常量条目数 */
  constantEntries: number

  /** 各分类条目数 */
  entriesByCategory: Record<KnowledgeCategory, number>

  /** 各标签条目数 */
  entriesByTag: Record<string, number>

  /** 总使用次数 */
  totalUsage: number

  /** 平均使用次数 */
  averageUsage: number

  /** 最常用条目 */
  mostUsedEntries: Array<{
    uid: number
    comment: string
    usageCount: number
  }>

  /** 最近更新条目 */
  recentlyUpdated: Array<{
    uid: number
    comment: string
    updatedAt: Date
  }>

  /** 即将过期条目 */
  expiringEntries: Array<{
    uid: number
    comment: string
    expiresAt: Date
  }>
}
