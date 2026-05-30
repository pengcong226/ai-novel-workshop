/**
 * V1 废弃类型定义
 *
 * 以下类型均来自 V1 架构，已被 V5 的 Entity & StateEvent 沙盒系统取代。
 * 为保持向后兼容，仍然从 @/types 统一导出，但新代码不应再使用这些类型。
 *
 * 迁移对照：
 * - WorldSetting        → Entity(type='WORLD') + Entity(type='FACTION') + Entity(type='LORE')
 * - Character           → Entity(type='CHARACTER') + StateEvent
 * - Faction             → Entity(type='FACTION')
 * - WorldRule           → Entity(type='LORE', category='world-rule')
 * - Location            → Entity(type='LOCATION')
 * - CharacterTag        → EntityImportance
 * - CharacterState      → sandboxStore.activeEntitiesState[id]
 * - CharacterStateHistory → StateEvent 历史记录
 * - CharacterDevelopment → StateEvent 序列
 */

import type { Worldbook } from './worldbook'

// ============================================================================
// 世界观设定（V1 废弃）
// ============================================================================

/** @deprecated Use Entity(type='WORLD') + Entity(type='FACTION') + Entity(type='LORE') in sandbox store instead */
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

/** @deprecated Use Entity(type='FACTION') in sandbox store instead */
export interface Faction {
  id: string
  name: string
  type: string
  description: string
  relationships: string[]
}

/** @deprecated Use Entity(type='LORE', category='world-rule') in sandbox store instead */
export interface WorldRule {
  id: string
  name: string
  description: string
}

/** @deprecated Use Entity(type='LOCATION') in sandbox store instead */
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

// ============================================================================
// 人物系统（V1 废弃）
// ============================================================================

/** @deprecated Use EntityImportance from @/types/sandbox instead */
export type CharacterTag = 'protagonist' | 'supporting' | 'antagonist' | 'minor' | 'other'

/** @deprecated Use sandboxStore.activeEntitiesState[id] for resolved state instead */
export interface CharacterState {
  location: string      // 当前位置
  status: string        // 当前状态（健康、受伤、修炼中等）
  faction: string       // 所属势力
  updatedAt: number     // 更新时间戳
  vitalStatus?: 'alive' | 'dead' | 'unknown' // V4-③ 记录生存状态
  physicalState?: string   // V4-③ 记录身体状况
  powerLevel?: string   // V4-④-D4 记录具体修为
}

export interface CharacterStateHistory {
  location: string
  status: string
  faction: string
  chapter: number       // 状态变更所在章节
  timestamp: Date       // 变更时间
  reason?: string       // 变更原因
}

/** @deprecated Use Entity(type='CHARACTER') + StateEvent in sandbox store instead */
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

// ============================================================================
// 记忆系统类型（V1 废弃）
// ============================================================================

export interface ShortTermMemory {
  recentChapters: import('./index').Chapter[]
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
