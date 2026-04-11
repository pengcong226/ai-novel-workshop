export * from './entity'

// 类型定义

import type { KnowledgeBase } from './knowledge-base'
import type { Preset } from './preset'
import type { TraceImportSession } from './conversation-trace'
import type { Worldbook } from './worldbook'

export type { Worldbook, WorldbookEntry, WorldbookGroup, WorldbookCondition } from './worldbook'
export type { Preset, PresetExample } from './preset'
export type { TraceImportSession } from './conversation-trace'

// V3 图元时序类型体系
export type {
  EntityNode, CharacterV3, CharacterStateSlice, InventoryItem, AbilityRecord,
  EntityRelation, WorldEntityV3, WorldNarrative, PlotNarrative,
  ChapterPlanV3, PlotBeat
} from './entity'

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

  // 设定
  world: WorldSetting
  characters: Character[]
  outline: Outline

  // 章节
  chapters: Chapter[]

  // 配置
  config: ProjectConfig

  // 表格记忆系统
  memory?: string  // JSON 格式的记忆系统数据

  // 世界书系统（酒馆生态兼容）
  worldbook?: Worldbook

  // 知识库
  knowledgeBase?: KnowledgeBase

  // 会话轨迹导入历史
  traceImportHistory?: TraceImportSession[]

  // 预设系统
  presets?: Preset[]
}

// 世界观设定
export interface WorldSetting {
  id: string
  name: string
  era: EraSetting
  geography: GeographySetting
  powerSystem?: PowerSystemSetting
  factions: Faction[]
  rules: WorldRule[]

  aiGenerated: boolean
  generationPrompt?: string
}

export interface EraSetting {
  time: string
  techLevel: string
  socialForm: string
}

export interface GeographySetting {
  map?: string
  locations: Location[]
}

export interface PowerSystemSetting {
  name: string
  levels: PowerLevel[]
  skills: Skill[]
  items: Item[]
}

export interface Faction {
  id: string
  name: string
  type: string
  description: string
  relationships: string[]
}

export interface WorldRule {
  id: string
  name: string
  description: string
}

export interface Location {
  id: string
  name: string
  description: string
  importance: 'high' | 'medium' | 'low'
  // 地图相关字段
  position?: MapPosition
  type?: LocationType
  icon?: string
  color?: string
  connections?: string[] // 关联地点ID
  factionId?: string // 所属势力ID
}

export interface MapPosition {
  x: number
  y: number
}

export type LocationType =
  | 'city' // 城市
  | 'town' // 城镇
  | 'village' // 村庄
  | 'mountain' // 山脉
  | 'river' // 河流
  | 'lake' // 湖泊
  | 'forest' // 森林
  | 'desert' // 沙漠
  | 'ocean' // 海洋
  | 'island' // 岛屿
  | 'ruins' // 遗迹
  | 'dungeon' // 地下城
  | 'castle' // 城堡
  | 'temple' // 神庙
  | 'other' // 其他

export interface MapRegion {
  id: string
  name: string
  description: string
  color: string
  borderColor?: string
  points: MapPosition[] // 多边形顶点
  factionId?: string
}

export interface MapRoute {
  id: string
  name: string
  description: string
  points: MapPosition[]
  color: string
  type: 'road' | 'path' | 'river' | 'border' | 'custom'
}

export interface CharacterLocation {
  characterId: string
  locationId: string
  chapterNumber?: number
  timestamp?: Date
}

export interface MapData {
  width: number
  height: number
  background?: string
  gridEnabled: boolean
  gridSize: number
  locations: Location[]
  regions: MapRegion[]
  routes: MapRoute[]
  characterLocations: CharacterLocation[]
}

export interface PowerLevel {
  name: string
  description: string
}

export interface Skill {
  /** 技能等级 */
  level?: string
  id: string
  name: string
  description: string
}

export interface Item {
  id: string
  name: string
  description: string
  rarity: string
}

// 人物标签类型
export type CharacterTag = 'protagonist' | 'supporting' | 'antagonist' | 'minor' | 'other'

// 人物状态
export interface CharacterState {
  location: string      // 当前位置
  status: string        // 当前状态（健康、受伤、修炼中等）
  faction: string       // 所属势力
  updatedAt: number     // 更新时间戳
  vitalStatus?: 'alive' | 'dead' | 'unknown' | string // V4-③ 记录生存状态
  physicalState?: string   // V4-③ 记录身体状况
  powerLevel?: string   // V4-④-D4 记录具体修为
}

// 人物状态历史记录
export interface CharacterStateHistory {
  location: string
  status: string
  faction: string
  chapter: number       // 状态变更所在章节
  timestamp: Date       // 变更时间
  reason?: string       // 变更原因
}

// 人物
export interface Character {
  id: string
  name: string
  aliases: string[]

  // 状态与归档 (V4-③)
  isArchived?: boolean
  
  // 基本信息
  gender: 'male' | 'female' | 'other'
  age: number
  appearance: string

  // 性格
  personality: string[]
  values: string[]

  // 背景
  background: string
  motivation: string

  // 能力
  abilities: Ability[]
  powerLevel?: string

  // 关系
  relationships: Relationship[]

  // 出场记录
  appearances: {
    chapterId: string
    scenes: string[]
  }[]

  // 成长轨迹
  development: CharacterDevelopment[]

  // 人物标签
  tags: CharacterTag[]

  // 当前状态
  currentState?: CharacterState

  // 状态变更历史
  stateHistory: CharacterStateHistory[]

  aiGenerated: boolean
}

export interface Ability {
  id: string
  name: string
  description: string
  level: string
}

export interface Relationship {
  targetId: string
  type: 'family' | 'friend' | 'enemy' | 'lover' | 'rival' | 'other'
  description: string
  startChapter?: number
  evolution: RelationshipEvolution[]
}

export interface RelationshipEvolution {
  chapter: number
  change: string
}

// 能力变化
export interface AbilityChange {
  abilityId: string
  abilityName: string
  type: 'gain' | 'improve' | 'change'
}

// 关系变化
export interface RelationshipChange {
  targetId: string
  newType: string
}

// 状态变化
export interface StateChange {
  oldLocation?: string
  newLocation?: string
  oldStatus?: string
  newStatus?: string
  oldFaction?: string
  newFaction?: string
}

export interface CharacterDevelopment {
  chapter: number
  event: string
  growth: string
  // 扩展字段
  abilityChanges?: AbilityChange[]
  relationshipChanges?: RelationshipChange[]
  stateChange?: StateChange
}

// 大纲
export interface Outline {
  /** 结构类型 */
  structure?: string
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
  status: 'planned' | 'writing' | 'completed'
}

export interface Scene {
  id: string
  description: string
  characters: string[]
  location: string
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

  // 系统提示词配置
  systemPrompts?: SystemPrompts

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
}

// 记忆系统类型
export interface ShortTermMemory {
  recentChapters: Chapter[]
  maxTokens: number
}

export interface MidTermMemory {
  chapterSummaries: ChapterSummary[]
  maxTokens: number
}

export interface LongTermMemory {
  worldSetting: WorldSetting
  characters: Map<string, Character>
  keyEvents: KeyEvent[]
  maxTokens: number
}

export interface ChapterSummary {
  chapterId: string
  summary: string
  keyEvents: string[]
  characters: string[]
}

export interface KeyEvent {
  chapterId: string
  eventDescription: string
  importance: number
  tags: string[]
}

// 兼容旧版生成类型（避免与当前主类型冲突）
export interface LegacyModelProvider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'local' | 'custom'
  apiKey: string
  baseUrl: string
  models: LegacyModel[]
}

export interface LegacyModel {
  id: string
  name: string
  type: 'planning' | 'writing' | 'checking'
  cost: number
  performance: number
}

export interface LegacyGenerationRequest {
  type: 'world' | 'character' | 'outline' | 'chapter'
  prompt: string
  context: any
  model: string
  preset: 'fast' | 'standard' | 'quality'
}

export interface LegacyGenerationResponse {
  content: string
  model: string
  tokens: number
  cost: number
  quality?: number
}

// UI状态
export interface AppState {
  currentProject: Project | null
  projects: Project[]

  // UI状态
  isGenerating: boolean
  generationProgress: number

  // 错误处理
  error: string | null
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
