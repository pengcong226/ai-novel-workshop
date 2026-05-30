// 类型定义

import type { KnowledgeBase } from './knowledge-base'
import type { Preset } from './preset'
import type { TraceImportSession } from './conversation-trace'
import type { Worldbook } from './worldbook'
import type { PlotEventRecord } from './rewrite-continuation'
import type { AgentConfig } from '@/agents/types'

// V1 废弃类型重导出（保持向后兼容，新代码不应使用）
export type {
  WorldSetting,
  EraSetting,
  GeographySetting,
  PowerSystemSetting,
  Faction,
  WorldRule,
  Location,
  MapPosition,
  LocationType,
  MapRegion,
  MapRoute,
  CharacterLocation,
  MapData,
  PowerLevel,
  Skill,
  Item,
  CharacterTag,
  CharacterState,
  CharacterStateHistory,
  Character,
  Ability,
  Relationship,
  RelationshipEvolution,
  AbilityChange,
  RelationshipChange,
  StateChange,
  CharacterDevelopment,
  ShortTermMemory,
  MidTermMemory,
  LongTermMemory,
  ChapterSummary,
  KeyEvent,
} from './deprecated'

// Re-import types needed by interfaces in this file
import type { WorldSetting, Character } from './deprecated'

export type { Worldbook, WorldbookEntry, WorldbookGroup, WorldbookCondition } from './worldbook'
export type { Preset, PresetExample } from './preset'
export type { TraceImportSession } from './conversation-trace'

// 项目状态
export type ProjectStatus = 'draft' | 'writing' | 'completed'

// 项目
export interface Project {
  id: string
  title: string
  description: string
  genre: string
  targetWords: number
  currentWords: number
  status: ProjectStatus
  createdAt: Date
  updatedAt: Date

  /** 作者名称（可选） */
  author?: string

  // 设定
  /** @deprecated Use sandbox WORLD/FACTION/LOCATION entities instead. Cleared after V5 migration. */
  world?: WorldSetting

  /** @deprecated Use sandboxStore.entities.filter(e => e.type === 'CHARACTER') instead. Cleared after V5 migration. */
  characters?: Character[]
  outline: Outline

  // 章节
  chapters: Chapter[]

  // 配置
  config: ProjectConfig

  /** @deprecated Use sandboxStore.activeEntitiesState instead. Cleared after V5 migration. */
  memory?: string  // JSON 格式的记忆系统数据

  /** @deprecated Use sandboxStore.entities.filter(e => e.type === 'LORE') instead. Cleared after V5 migration. */
  worldbook?: Worldbook

  // 知识库
  knowledgeBase?: KnowledgeBase

  // 会话轨迹导入历史
  traceImportHistory?: TraceImportSession[]

  // 预设系统
  presets?: Preset[]

  // 情节事件 (Phase 3: 深度导入提取的伏笔/转折/高潮等)
  plotEvents?: PlotEventRecord[]

  // Pipeline 运行时注入字段（由 sandbox store 在执行前注入）
  /** @internal 由 PipelineRunner 在运行时从 sandboxStore.entities 注入 */
  _entities?: import('./sandbox').Entity[]
  /** @internal 由 PipelineRunner 在运行时从 sandboxStore.stateEvents 注入 */
  _stateEvents?: import('./sandbox').StateEvent[]
}

// 大纲
export interface Outline {
  /** 结构类型 */
  structure?: string
  template?: string
  changeHistory?: OutlineChangeImpact[]
  id: string

  // 总纲
  synopsis: string
  theme: string
  mainPlot: PlotLine
  subPlots: PlotLine[]

  // 卷大纲
  volumes: Volume[]

  // 章节大纲
  chapters: ChapterOutline[]

  // 伏笔
  foreshadowings: Foreshadowing[]
}

export type OutlineChangeType = 'chapter_completed' | 'chapter_updated' | 'outline_refined' | 'scene_reordered' | 'template_applied'

export interface OutlineChangeImpact {
  id: string
  type: OutlineChangeType
  chapterNumber?: number
  affectedChapterIds: string[]
  summary: string
  createdAt: number
}

export interface OutlineTemplatePhase {
  id: string
  name: string
  description: string
  chapterRatio: number
  goals: string[]
  keyBeats: string[]
}

export interface OutlineTemplate {
  id: string
  name: string
  structure: string
  description: string
  phases: OutlineTemplatePhase[]
  suitableGenres: string[]
  defaultChapterCount: number
}

export interface PlotLine {
  id: string
  name: string
  description: string
  startChapter?: number
  endChapter?: number
}

export interface Volume {
  /** 章节范围（兼容别名） */
  chapterRange?: { start: number; end: number }
  id: string
  number: number
  title: string
  theme: string
  startChapter: number
  endChapter: number
  mainEvents: string[]
  anchors?: Array<{
    id: string;
    targetChapterNumber: number;
    description: string;
    isResolved: boolean;
  }>;
  chapters?: ChapterOutline[];
}

export interface ChapterOutline {
  chapterId: string
  title: string

  scenes: Scene[]
  characters: string[]
  location: string

  goals: string[]
  conflicts: string[]
  resolutions: string[]

  foreshadowingToPlant?: string[]
  foreshadowingToResolve?: string[]

  generationPrompt?: string
  status: 'planned' | 'writing' | 'completed' | 'outdated'
  draftedAt?: number
  lastSyncedAt?: number
  aiRefinedAt?: number
  notes?: string
}

export interface Scene {
  id: string
  description: string
  characters: string[]
  location: string
  emotionalTone?: string
  purpose?: string
  wordCountHint?: number
  order: number
}

export interface Foreshadowing {
  id: string
  description: string
  plantChapter: number
  resolveChapter?: number
  status: 'planted' | 'resolved' | 'abandoned'
}

// 章节摘要详细度
export enum SummaryDetail {
  FULL = 'full',           // 完整内容（最近3章）
  DETAILED = 'detailed',   // 详细摘要（500字，4-10章前）
  BRIEF = 'brief',         // 简要摘要（200字，11-30章前）
  MINIMAL = 'minimal'      // 极简摘要（100字，30章前）
}

// 章节摘要数据
export interface ChapterSummaryData {
  id: string
  chapterNumber: number
  title: string
  summary: string              // 摘要内容
  keyEvents: string[]          // 关键事件
  characters: string[]         // 出场人物
  locations: string[]          // 场景地点
  plotProgression: string      // 剧情推进描述
  emotionalTone?: string       // 情感基调
  conflicts?: string[]         // 冲突
  resolutions?: string[]       // 解决方案
  wordCount: number            // 原文字数
  summaryWordCount: number     // 摘要字数
  tokenCount: number           // token数估算
  createdAt: Date              // 创建时间
  updatedAt: Date              // 更新时间
  detail: SummaryDetail        // 摘要详细度
  sourceHash?: string          // 正文哈希
  summaryVersion?: number      // 摘要版本
}

// 章节
export interface Chapter {
  id: string
  number: number
  title: string

  content: string
  wordCount: number

  outline: ChapterOutline
  status: 'draft' | 'revised' | 'final'

  generatedBy: 'ai' | 'manual' | 'hybrid'
  modelUsed?: string
  generationTime: Date

  // 摘要数据
  summary?: string  // 简单文本摘要（向后兼容）
  summaryData?: ChapterSummaryData  // 详细摘要数据

  checkpoints: Checkpoint[]

  aiSuggestions?: string[]
  qualityScore?: number

  /** 章节序号索引（兼容导出器） */
  index?: number
}

export interface Checkpoint {
  id: string
  timestamp: Date
  content: string
  description?: string
}

// 模型提供商配置
export interface ModelProvider {
  id: string
  name: string              // 提供商名称（如：OpenAI、Anthropic、自定义）
  type: 'openai' | 'anthropic' | 'custom'
  baseUrl: string           // API基础URL
  apiKey: string            // API密钥
  models: ModelInfo[]       // 可用模型列表
  isEnabled: boolean        // 是否启用
  lastSyncTime?: Date       // 最后同步时间
  isSyncing?: boolean       // 是否正在同步
}

// 模型信息
export interface ModelInfo {
  id: string                // 模型ID
  name: string              // 模型显示名称
  type: 'planning' | 'writing' | 'checking' | 'all'  // 模型类型
  maxTokens: number         // 最大token数
  costPerInputToken: number // 输入成本
  costPerOutputToken: number // 输出成本
  isEnabled: boolean        // 是否启用
}

// 项目配置
export interface StyleProfile {
  id: string
  name: string
  description: string
  genre?: string
  tone: TemplateTone
  narrativePerspective: NarrativePerspective
  pacing: '舒缓' | '均衡' | '紧凑'
  vocabulary: '通俗' | '典雅' | '专业' | '诗性'
  sentenceStyle: '短句利落' | '长句铺陈' | '长短结合'
  dialogueStyle: DialogueStyle
  descriptionLevel: DescriptionLevel
  avoidList: string[]
  examplePhrases: string[]
  customInstructions: string
  metadata?: {
    presetId?: string
    source?: 'preset' | 'template' | 'ai-extracted' | 'custom'
    updatedAt?: number
  }
}

export interface ProjectConfig {
  // 生成预设
  preset: 'fast' | 'standard' | 'quality'

  // 模型提供商配置
  providers: ModelProvider[]

  // 模型选择（使用模型ID）
  plannerModel: string
  writerModel: string
  sentinelModel: string
  extractorModel: string

  // 作者名称
  authorName?: string

  // 系统提示词配置
  systemPrompts?: SystemPrompts

  // 写作风格配置
  styleProfile?: StyleProfile

  // 思考深度
  planningDepth: 'shallow' | 'medium' | 'deep'
  writingDepth: 'fast' | 'standard' | 'detailed'

  // 质量检查
  enableQualityCheck: boolean
  qualityThreshold: number

  // 成本控制
  maxCostPerChapter: number

  // AI建议
  enableAISuggestions: boolean
  enableAutoReview?: boolean
  agentConfigs?: AgentConfig[]

  // 敏感词检测
  enableSensitiveWordCheck?: boolean   // 启用敏感词检测（默认开启）

  // LLM 辅助上下文裁剪（长篇模式）
  enableLLMCompose?: boolean          // 章节数≥20时启用LLM语义裁剪（默认true）

  // 自动化工作流与哨兵
  enableLogicValidator?: boolean      // 查杀落笔吃书
  enableZeroTouchExtraction?: boolean // 背后零触感提取实体

  // 向量检索（RAG）
  enableVectorRetrieval: boolean  // 默认true
  vectorConfig?: VectorServiceConfig

  // 高级设置
  advancedSettings?: AdvancedSettings
}

// 系统提示词配置
export interface SystemPrompts {
  planner: string
  writer: string
  sentinel: string
  extractor: string
}

// 高级设置
export interface AdvancedSettings {
  temperature: number
  topP: number
  maxTokens: number
  frequencyPenalty: number
  presencePenalty: number
  stopSequences: string[]
  maxContextTokens?: number      // 最大上下文长度 (例如: 128000)
  recentChaptersCount?: number   // 携带的前文章节数量 (例如: 5)
  targetWordCount?: number       // 预期单章生成的字数 (例如: 2000)
  targetChapters?: number        // 预期总章节数 (例如: 100)
}

// ============================================================================
// 向量服务相关类型
// ============================================================================

/**
 * 文档类型（用于向量存储）
 */
export type VectorDocumentType = 'setting' | 'character' | 'plot' | 'event' | 'chapter' | 'rule'

/**
 * 向量文档元数据
 */
export interface VectorDocumentMetadata {
  /** 文档类型 */
  type: VectorDocumentType
  /** 项目ID */
  projectId: string
  /** 章节号（可选） */
  chapterNumber?: number
  /** 时间戳 */
  timestamp: number
  /** 额外字段 */
  [key: string]: any
}

/**
 * 向量检索结果
 */
export interface VectorSearchResult {
  /** 文档ID */
  id: string
  /** 文档内容 */
  content: string
  /** 元数据 */
  metadata: VectorDocumentMetadata
  /** 相似度得分 (0-1) */
  score: number
  /** 检索来源 */
  source: 'vector' | 'keyword' | 'hybrid'
}

/**
 * 向量服务配置
 */
export interface VectorServiceConfig {
  /** 嵌入模型提供商 */
  provider: 'local' | 'openai'
  /** 模型名称 */
  model?: string
  /** 向量维度 */
  dimension?: number
  /** API密钥（OpenAI需要） */
  apiKey?: string
  /** 基础URL */
  baseUrl?: string
  /** 项目ID */
  projectId?: string
  /** 检索返回条数 */
  topK?: number
  /** 相似度阈值 */
  minScore?: number
  /** 向量检索权重（用于重排加权） */
  vectorWeight?: number
  /** 外部导入索引最大条数 */
  maxExternalArtifactsToIndex?: number
  /** 外部导入单条内容最大长度 */
  maxExternalArtifactContentLength?: number
}

// ============================================================================
// 冲突检测相关类型（从 conflicts.ts 导出）
// ============================================================================

export * from './conflicts'

// ============================================================================
// 模板系统相关类型
// ============================================================================

/**
 * 模板分类
 */
export type TemplateCategory = 'fantasy' | 'urban' | 'scifi' | 'wuxia' | 'history' | 'other'

/**
 * 风格基调
 */
export type TemplateTone = '轻松' | '严肃' | '幽默' | '黑暗'

/**
 * 叙事视角
 */
export type NarrativePerspective = '第一人称' | '第三人称'

/**
 * 对话风格
 */
export type DialogueStyle = '简洁' | '华丽' | '幽默' | '严肃'

/**
 * 描写详细度
 */
export type DescriptionLevel = '详细' | '适中' | '简洁'

/**
 * 卷模板
 */
export interface VolumeTemplate {
  number: number
  title: string
  theme: string
  chapterRange: {
    start: number
    end: number
  }
  mainEvents: string[]
  plotPoints: string[]
}

/**
 * 大纲模板
 */
export interface PlotTemplate {
  structure: string // "三幕结构" | "英雄之旅" | "起承转合"
  volumes: VolumeTemplate[]
  totalChapters: number
  description: string
}

/**
 * 风格模板
 */
export interface StyleTemplate {
  tone: TemplateTone
  narrativePerspective: NarrativePerspective
  dialogueStyle: DialogueStyle
  descriptionLevel: DescriptionLevel
  writingStyle?: string // 自定义风格描述
}

/**
 * 人物模板
 */
export interface CharacterTemplate {
  role: 'protagonist' | 'supporting' | 'antagonist'
  name?: string
  template: Partial<Character>
  description: string
}

/**
 * 提示词模板
 */
export interface PromptTemplates {
  worldGeneration: string
  characterGeneration: string
  chapterGeneration: string
  outlineGeneration?: string
}

/**
 * 小说模板
 */
export interface NovelTemplate {
  /** 世界观数据 */
  world?: any
  /** 角色数据 */
  characters?: any[]
  /** 大纲数据 */
  outline?: any
  meta: {
    id: string
    name: string
    version: string
    author: string
    description: string
    tags: string[]
    category: TemplateCategory
    createdAt: Date
    updatedAt: Date
    rating?: number
    downloads?: number
  }

  // 世界观模板
  worldTemplate: Partial<WorldSetting>

  // 人物模板
  characterTemplates: CharacterTemplate[]

  // 大纲模板
  plotTemplate: PlotTemplate

  // 风格模板
  styleTemplate: StyleTemplate

  // 提示词模板
  promptTemplates: PromptTemplates

  // 配置模板
  configTemplate?: Partial<ProjectConfig>

  // 示例章节
  exampleChapters?: {
    title: string
    content: string
  }[]
}

// ============================================================================
// AI建议系统相关类型
// ============================================================================

export * from './suggestions'

// ============================================================================
// 世界书相关类型
// ============================================================================

export * from './worldbook'

// ============================================================================
// 会话轨迹导入类型
// ============================================================================

export * from './conversation-trace'
