// AI建议系统类型定义

/**
 * 建议类型
 */
export type SuggestionType = 'improvement' | 'issue' | 'question'

/**
 * 建议优先级
 */
export type SuggestionPriority = 'low' | 'medium' | 'high'

/**
 * 建议状态
 */
export type SuggestionStatus = 'unread' | 'read' | 'adopted' | 'ignored'

/**
 * 建议子类型（用于分类显示）
 */
export type SuggestionCategory =
  | 'consistency'      // 一致性建议
  | 'quality'          // 质量建议
  | 'optimization'     // 优化建议
  | 'style'            // 风格建议
  | 'problem'          // 问题建议
  | 'reminder'         // 提醒建议

/**
 * 建议位置信息
 */
export interface SuggestionLocation {
  /** 相关项目ID */
  projectId?: string
  /** 相关章节号 */
  chapter?: number
  /** 相关章节ID */
  chapterId?: string
  /** 相关字段 */
  field?: string
  /** 人物ID */
  characterId?: string
  /** 地点ID */
  locationId?: string
  /** 其他标识 */
  targetId?: string
  /** 问题所在段落索引（从 0 开始） */
  paragraphIndex?: number
  /** 问题文本片段 */
  textSnippet?: string
  /** AI 建议的修复文本 */
  suggestedFix?: string
}

/**
 * 建议动作
 */
export interface SuggestionAction {
  /** 动作类型 */
  type: 'navigate' | 'auto_fix' | 'view_detail' | 'dismiss' | 'generate' | 'apply_fix'
  /** 动作标签 */
  label: string
  /** 自动修复命令（可选） */
  autoFixCommand?: string
  /** 导航目标（可选） */
  navigateTarget?: string
  /** 修复文本（apply_fix 类型使用） */
  fixContent?: string
  /** 原文片段（apply_fix 类型使用） */
  originalSnippet?: string
}

/**
 * 建议接口
 */
export interface Suggestion {
  /** 建议ID */
  id: string
  /** 建议类型 */
  type: SuggestionType
  /** 建议子类型 */
  category: SuggestionCategory
  /** 优先级 */
  priority: SuggestionPriority
  /** 建议标题 */
  title: string
  /** 建议消息内容 */
  message: string
  /** 详细描述 */
  details?: string
  /** 位置信息 */
  location: SuggestionLocation
  /** 建议状态 */
  status: SuggestionStatus
  /** 可执行动作 */
  actions?: SuggestionAction[]
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 过期时间（可选，用于自动清理） */
  expiresAt?: Date
  /** 是否已推送 */
  pushed: boolean
  /** 关联的建议ID（用于相似建议合并） */
  relatedSuggestions?: string[]
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 建议触发事件类型
 */
export type SuggestionTriggerEvent =
  | 'chapter_save'          // 章节保存
  | 'chapter_complete'      // 章节完成
  | 'character_update'      // 人物更新
  | 'character_create'      // 人物创建
  | 'outline_change'        // 大纲变更
  | 'world_update'          // 世界观更新
  | 'quality_check'         // 质量检查完成
  | 'conflict_detect'       // 冲突检测
  | 'idle'                  // 长时间未使用
  | 'project_open'          // 项目打开
  | 'suggestion_dismiss'    // 建议被忽略

/**
 * 建议规则配置
 */
export interface SuggestionRule {
  /** 规则ID */
  id: string
  /** 规则名称 */
  name: string
  /** 触发事件 */
  trigger: SuggestionTriggerEvent | SuggestionTriggerEvent[]
  /** 是否启用 */
  enabled: boolean
  /** 冷却时间（毫秒） */
  cooldown: number
  /** 上次触发时间 */
  lastTriggered?: Date
  /** 优先级调整 */
  priorityBoost?: number
}

/**
 * 建议统计数据
 */
export interface SuggestionStatistics {
  /** 总建议数 */
  total: number
  /** 各状态数量 */
  byStatus: Record<SuggestionStatus, number>
  /** 各类型数量 */
  byType: Record<SuggestionType, number>
  /** 各子类型数量 */
  byCategory: Record<SuggestionCategory, number>
  /** 各优先级数量 */
  byPriority: Record<SuggestionPriority, number>
  /** 采纳率 */
  adoptionRate: number
  /** 近7天采纳趋势 */
  adoptionTrend: number[]
  /** 平均处理时间（毫秒） */
  avgResponseTime: number
}

/**
 * 建议过滤器
 */
export interface SuggestionFilter {
  /** 按状态过滤 */
  status?: SuggestionStatus | SuggestionStatus[]
  /** 按类型过滤 */
  type?: SuggestionType | SuggestionType[]
  /** 按子类型过滤 */
  category?: SuggestionCategory | SuggestionCategory[]
  /** 按优先级过滤 */
  priority?: SuggestionPriority | SuggestionPriority[]
  /** 按项目过滤 */
  projectId?: string
  /** 按章节过滤 */
  chapter?: number
  /** 按章节ID过滤 */
  chapterId?: string
  /** 搜索关键词 */
  keyword?: string
  /** 时间范围 */
  dateRange?: {
    start: Date
    end: Date
  }
}

/**
 * 建议队列配置
 */
export interface SuggestionQueueConfig {
  /** 最大队列长度 */
  maxLength: number
  /** 去重相似度阈值（0-1） */
  similarityThreshold: number
  /** 自动过期时间（毫秒） */
  autoExpireTime: number
  /** 高优先级显示间隔（毫秒） */
  highPriorityInterval: number
  /** 中优先级显示间隔（毫秒） */
  mediumPriorityInterval: number
  /** 低优先级显示间隔（毫秒） */
  lowPriorityInterval: number
  /** 空闲提醒阈值（毫秒） */
  idleThreshold: number
}

/**
 * 建议队列项
 */
export interface SuggestionQueueItem {
  /** 建议ID */
  id: string
  /** 优先级分数（计算后） */
  score: number
  /** 入队时间 */
  queuedAt: Date
  /** 下次可推送时间 */
  nextPushTime: Date
  /** 推送次数 */
  pushCount: number
}

/**
 * 默认建议队列配置
 */
export const DEFAULT_QUEUE_CONFIG: SuggestionQueueConfig = {
  maxLength: 50,
  similarityThreshold: 0.8,
  autoExpireTime: 7 * 24 * 60 * 60 * 1000, // 7天
  highPriorityInterval: 5 * 60 * 1000,      // 5分钟
  mediumPriorityInterval: 30 * 60 * 1000,   // 30分钟
  lowPriorityInterval: 2 * 60 * 60 * 1000,  // 2小时
  idleThreshold: 30 * 60 * 1000             // 30分钟
}

/**
 * 预定义建议模板
 */
export const SUGGESTION_TEMPLATES = {
  // 一致性建议
  characterNameInconsistent: {
    category: 'consistency' as const,
    type: 'issue' as const,
    priority: 'high' as const,
    title: '人物名字不一致',
    messageTemplate: '检测到人物"{name}"在不同位置使用了不同的名字：{aliases}。建议统一使用标准名称。',
    actionLabel: '查看详情'
  },
  timelineConflict: {
    category: 'consistency' as const,
    type: 'issue' as const,
    priority: 'high' as const,
    title: '时间线冲突',
    messageTemplate: '第{chapter}章存在时间线冲突：{details}',
    actionLabel: '修复时间线'
  },
  settingContradiction: {
    category: 'consistency' as const,
    type: 'issue' as const,
    priority: 'medium' as const,
    title: '设定矛盾',
    messageTemplate: '检测到世界观设定矛盾：{details}',
    actionLabel: '查看详情'
  },

  // 质量建议
  plotSlowPacing: {
    category: 'quality' as const,
    type: 'improvement' as const,
    priority: 'medium' as const,
    title: '情节节奏偏慢',
    messageTemplate: '第{chapter}章情节节奏偏慢，建议增加冲突或转折点。',
    actionLabel: '查看建议'
  },
  characterUnderdeveloped: {
    category: 'quality' as const,
    type: 'improvement' as const,
    priority: 'medium' as const,
    title: '人物刻画不足',
    messageTemplate: '人物"{name}"刻画不够丰满，建议增加心理描写或背景故事。',
    actionLabel: '优化人物'
  },
  dialogueUnnatural: {
    category: 'quality' as const,
    type: 'improvement' as const,
    priority: 'low' as const,
    title: '对话不自然',
    messageTemplate: '第{chapter}章部分对话不够自然，建议优化对话风格。',
    actionLabel: '查看位置'
  },
  repetitiveDescription: {
    category: 'quality' as const,
    type: 'improvement' as const,
    priority: 'low' as const,
    title: '描写重复',
    messageTemplate: '检测到重复的描写内容：{details}',
    actionLabel: '查看详情'
  },

  // 优化建议
  chapterStructureOptimize: {
    category: 'optimization' as const,
    type: 'improvement' as const,
    priority: 'low' as const,
    title: '章节结构优化',
    messageTemplate: '第{chapter}章结构可以优化，建议调整场景分配。',
    actionLabel: '查看建议'
  },
  foreshadowSetup: {
    category: 'optimization' as const,
    type: 'question' as const,
    priority: 'medium' as const,
    title: '伏笔埋设建议',
    messageTemplate: '建议在第{chapter}章埋设伏笔：{details}',
    actionLabel: '查看详情'
  },
  characterAppearance: {
    category: 'optimization' as const,
    type: 'question' as const,
    priority: 'low' as const,
    title: '人物出场安排',
    messageTemplate: '人物"{name}"已{chapters}章未出场，建议安排出场或说明去向。',
    actionLabel: '查看详情'
  },

  // 问题建议
  foreshadowUnresolved: {
    category: 'problem' as const,
    type: 'issue' as const,
    priority: 'high' as const,
    title: '伏笔未回收',
    messageTemplate: '检测到未回收的伏笔：{details}',
    actionLabel: '查看详情'
  },
  suspenseIssue: {
    category: 'problem' as const,
    type: 'issue' as const,
    priority: 'medium' as const,
    title: '悬念设置不当',
    messageTemplate: '第{chapter}章悬念设置可能存在问题：{details}',
    actionLabel: '查看建议'
  },
  plotHole: {
    category: 'problem' as const,
    type: 'issue' as const,
    priority: 'high' as const,
    title: '剧情漏洞',
    messageTemplate: '检测到剧情漏洞：{details}',
    actionLabel: '查看详情'
  },

  // 提醒建议
  idleReminder: {
    category: 'reminder' as const,
    type: 'question' as const,
    priority: 'low' as const,
    title: '创作提醒',
    messageTemplate: '距离上次创作已过去{time}，继续加油吧！',
    actionLabel: '开始创作'
  },
  dailySuggestion: {
    category: 'reminder' as const,
    type: 'question' as const,
    priority: 'low' as const,
    title: '每日建议',
    messageTemplate: '今日创作建议：{suggestion}',
    actionLabel: '查看详情'
  }
}

/**
 * 建议模板参数类型
 */
export type SuggestionTemplateKey = keyof typeof SUGGESTION_TEMPLATES

/**
 * 建议模板参数
 */
export interface SuggestionTemplateParams {
  name?: string
  chapter?: number
  aliases?: string
  details?: string
  time?: string
  suggestion?: string
  chapters?: number
  [key: string]: string | number | undefined
}
