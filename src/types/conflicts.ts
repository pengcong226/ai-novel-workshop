/**
 * 冲突检测系统类型定义
 */

/**
 * 冲突严重程度
 */
export type ConflictSeverity = 'critical' | 'warning' | 'info'

/**
 * 冲突类型
 */
export type ConflictType =
  | 'character_personality'      // 人物性格不一致
  | 'character_ability'          // 人物能力矛盾
  | 'character_appearance'       // 人物外貌不一致
  | 'timeline_sequence'          // 时间线顺序矛盾
  | 'timeline_duration'          // 时间跨度不合理
  | 'timeline_age'               // 人物年龄错误
  | 'world_rule'                 // 世界观规则冲突
  | 'world_setting'              // 世界观设定矛盾
  | 'plot_logic'                 // 情节逻辑漏洞
  | 'relationship'               // 人物关系矛盾
  | 'location'                   // 地点位置矛盾
  | 'item'                       // 物品属性矛盾
  | 'foreshadowing'              // 伏笔未揭示
  | 'custom'                     // 自定义冲突

/**
 * 冲突状态
 */
export type ConflictStatus = 'active' | 'ignored' | 'resolved'

/**
 * 冲突位置
 */
export interface ConflictLocation {
  /** 章节ID */
  chapterId?: string
  /** 章节号 */
  chapterNumber?: number
  /** 段落索引 */
  paragraphIndex?: number
  /** 原文片段 */
  textSnippet?: string
  /** 开始位置 */
  startPosition?: number
  /** 结束位置 */
  endPosition?: number
}

/**
 * 冲突证据
 */
export interface ConflictEvidence {
  /** 证据类型 */
  type: 'text' | 'setting' | 'character' | 'timeline'
  /** 证据描述 */
  description: string
  /** 证据来源位置 */
  location: ConflictLocation
  /** 原始文本 */
  originalText?: string
  /** 章节号 */
  chapterNumber?: number
}

/**
 * 冲突修复建议
 */
export interface ConflictFixSuggestion {
  /** 建议ID */
  id: string
  /** 建议类型 */
  type: 'auto' | 'manual'
  /** 建议描述 */
  description: string
  /** 自动修复方案（如果可以自动修复） */
  autoFix?: {
    targetChapterId?: string
    targetLocation?: ConflictLocation
    newText: string
  }
  /** 置信度 (0-1) */
  confidence: number
}

/**
 * 冲突报告
 */
export interface ConflictReport {
  /** 冲突ID */
  id: string
  /** 冲突类型 */
  type: ConflictType
  /** 严重程度 */
  severity: ConflictSeverity
  /** 状态 */
  status: ConflictStatus
  /** 标题 */
  title: string
  /** 描述 */
  description: string
  /** 冲突证据列表 */
  evidences: ConflictEvidence[]
  /** 修复建议 */
  suggestions: ConflictFixSuggestion[]
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 相关人物ID列表 */
  relatedCharacterIds?: string[]
  /** 相关章节号列表 */
  relatedChapters?: number[]
  /** 标签 */
  tags?: string[]
  /** 备注 */
  notes?: string
}

/**
 * 冲突检测配置
 */
export interface ConflictDetectionConfig {
  /** 是否启用人物设定冲突检测 */
  enableCharacterConflicts: boolean
  /** 是否启用时间线冲突检测 */
  enableTimelineConflicts: boolean
  /** 是否启用世界观冲突检测 */
  enableWorldConflicts: boolean
  /** 是否启用情节逻辑检测 */
  enablePlotLogicConflicts: boolean
  /** 是否启用伏笔检测 */
  enableForeshadowingConflicts: boolean
  /** 人物性格变化阈值 (0-1, 越小越严格) */
  personalityChangeThreshold: number
  /** 时间跨度容忍度（天） */
  timeDurationTolerance: number
  /** 年龄误差容忍度（岁） */
  ageErrorTolerance: number
  /** 最小置信度阈值 (0-1) */
  minConfidenceThreshold: number
  /** 是否忽略已标记的冲突 */
  ignoreMarkedConflicts: boolean
  /** 检测的章节范围 */
  chapterRange?: {
    start: number
    end: number
  }
}

/**
 * 冲突检测结果
 */
export interface ConflictDetectionResult {
  /** 检测时间 */
  detectedAt: Date
  /** 检测耗时（毫秒） */
  duration: number
  /** 检测配置 */
  config: ConflictDetectionConfig
  /** 检测到的冲突 */
  conflicts: ConflictReport[]
  /** 统计信息 */
  statistics: {
    total: number
    critical: number
    warning: number
    info: number
    byType: Record<ConflictType, number>
    byChapter: Record<number, number>
  }
  /** 警告信息 */
  warnings: string[]
}

/**
 * 冲突检测规则
 */
export interface ConflictDetectionRule {
  /** 规则ID */
  id: string
  /** 规则名称 */
  name: string
  /** 规则描述 */
  description: string
  /** 冲突类型 */
  conflictType: ConflictType
  /** 严重程度 */
  severity: ConflictSeverity
  /** 是否启用 */
  enabled: boolean
  /** 检测函数名称 */
  detectorFunction: string
  /** 优先级 */
  priority: number
}

/**
 * 人物冲突数据
 */
export interface CharacterConflictData {
  /** 人物ID */
  characterId: string
  /** 人物名称 */
  characterName: string
  /** 冲突类型 */
  conflictType: 'personality' | 'ability' | 'appearance' | 'relationship'
  /** 第一次出现的描述 */
  firstAppearance: {
    chapterNumber: number
    text: string
    description: string
  }
  /** 第二次出现的描述（冲突点） */
  secondAppearance: {
    chapterNumber: number
    text: string
    description: string
  }
  /** 差异描述 */
  difference: string
}

/**
 * 时间线冲突数据
 */
export interface TimelineConflictData {
  /** 冲突类型 */
  conflictType: 'sequence' | 'duration' | 'age'
  /** 涉及的事件或人物 */
  involvedEntities: string[]
  /** 时间点1 */
  timePoint1: {
    chapterNumber: number
    description: string
    timestamp?: Date
  }
  /** 时间点2 */
  timePoint2: {
    chapterNumber: number
    description: string
    timestamp?: Date
  }
  /** 矛盾说明 */
  contradiction: string
}

/**
 * 世界观冲突数据
 */
export interface WorldConflictData {
  /** 冲突类型 */
  conflictType: 'rule' | 'setting' | 'location' | 'item'
  /** 规则或设定名称 */
  ruleName?: string
  /** 第一次描述 */
  firstDescription: {
    chapterNumber?: number
    text: string
  }
  /** 第二次描述（冲突点） */
  secondDescription: {
    chapterNumber?: number
    text: string
  }
  /** 矛盾说明 */
  contradiction: string
}

/**
 * 情节逻辑冲突数据
 */
export interface PlotLogicConflictData {
  /** 冲突类型 */
  conflictType: 'causality' | 'motivation' | 'behavior' | 'ability'
  /** 事件描述 */
  event: string
  /** 涉及章节 */
  chapters: number[]
  /** 逻辑问题 */
  logicIssue: string
  /** 可能的原因 */
  possibleCauses: string[]
}

/**
 * 冲突导出格式
 */
export interface ConflictExportData {
  /** 导出时间 */
  exportedAt: Date
  /** 项目名称 */
  projectName: string
  /** 检测结果 */
  result: ConflictDetectionResult
  /** 导出格式 */
  format: 'json' | 'markdown' | 'html'
}
