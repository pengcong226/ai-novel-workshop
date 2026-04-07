/**
 * V3 图元时序架构的核心类型定义
 *
 * 设计理念：
 * - EntityNode 统一基类：所有角色、势力、物品、地点继承同一图元
 * - CharacterStateSlice 时序切片：角色状态随章节演进，不覆盖旧条目
 * - 三层分离：刚性骨架（结构化）+ 叙事血肉（自然语言）+ 动态记忆（向量检索）
 *
 * 学术依据：
 * - ConStory-Bench (2026): 事实/时间错误最密集 → 需结构化层锁定
 * - DOME (2025): 时序知识图谱 → 每条事实绑定 chapterIndex
 * - GAM (2026): 正交图谱存储 → 统一 EntityNode 基类
 */

// ===== 统一实体图元基类 =====

export interface EntityNode {
  id: string
  type: 'CHARACTER' | 'FACTION' | 'ITEM' | 'LOCATION' | 'CONCEPT'
  name: string
  aliases: string[]
  isArchived: boolean     // 逻辑销毁标记，不物理删除
  keywords: string[]      // 关键词索引，用于检索触发
  createdAtChapter: number
  importance: 'critical' | 'major' | 'minor' | 'background'
}

// ===== 角色模型（刚性骨架 + 时序切片 + 叙事血肉）=====

export interface CharacterV3 extends EntityNode {
  type: 'CHARACTER'

  // 不可变核心身份
  coreIdentity: {
    gender: 'male' | 'female' | 'other'
    birthChapter: number
    fundamentalTraits: string   // 绝对底层设定（如"人类、无法使用魔法"）
    deathChapter?: number
  }

  // 时序状态切片数组（追加式，不覆盖）
  stateTimeline: CharacterStateSlice[]

  // 关系图谱骨架
  relationships: EntityRelation[]

  // 叙事血肉：AI维护的自然语言档案
  narrativeProfile: string        // ~300-500字
  lastNarrativeUpdate: number
}

export interface CharacterStateSlice {
  chapterIndex: number            // 此状态生效的章节
  vitalStatus: 'alive' | 'dead' | 'missing' | 'unknown'
  physicalState: string           // 如"健康"、"断臂"、"中毒"
  location: string
  faction: string
  powerLevel: string
  currentGoal: string
  inventory: InventoryItem[]
  abilities: AbilityRecord[]
  trigger: string                 // 触发此状态变更的事件描述
}

export interface InventoryItem {
  itemId: string
  itemName: string
  status: 'possessed' | 'lost' | 'destroyed' | 'given_away'
  sinceChapter: number
}

export interface AbilityRecord {
  name: string
  status: 'active' | 'sealed' | 'lost'
  acquiredChapter: number
}

export interface EntityRelation {
  targetId: string
  targetName: string
  type: 'family' | 'friend' | 'enemy' | 'lover' | 'rival' |
        'master' | 'subordinate' | 'ally' | 'other'
  intensity: number               // 0-100
  sinceChapter: number
  description: string
}

// ===== 世界实体模型（带版本控制）=====

export interface WorldEntityV3 extends EntityNode {
  stateVersions: {
    validFromChapter: number
    validUntilChapter: number | null   // null = 当前有效
    description: string
    trigger: string
  }[]
  relatedEntityIds: string[]
}

// ===== 叙事层文档 =====

export interface WorldNarrative {
  id: string
  narrativeState: string          // ~500-1000字世界宏观状态
  lastUpdatedChapter: number
}

export interface PlotNarrative {
  id: string
  narrativeNotes: string          // 伏笔追踪、未解之谜
  lastUpdatedChapter: number
}

// ===== 动态层级大纲（DOME inspired）=====

export interface HierarchicalOutline {
  volumes: VolumePlan[]
}

export interface VolumePlan {
  id: string
  title: string
  theme: string
  chapters: ChapterPlanV3[]
}

export interface ChapterPlanV3 {
  id: string
  title: string
  plotBeats: PlotBeat[]
  involvedEntityIds: string[]
  resolvedConflicts: string[]
  introducedEntityIds: string[]
  status: 'planned' | 'writing' | 'completed'
}

export interface PlotBeat {
  id: string
  summary: string
  povCharacterId: string
  locationId: string
  sceneType: 'action' | 'dialogue' | 'introspection' | 'exposition' | 'transition'
  tokenBudget: number
}

// ===== 增量状态更新类型 =====

export interface StateShift {
  entityId: string
  entityName: string
  field: string
  oldValue: string
  newValue: string
  evidence: string    // 原文中的引文支撑
}

export interface NarrativeDiff {
  entityId: string
  additions: string[]
  removals: string[]
}

export interface StateUpdateResult {
  appliedShifts: StateShift[]
  rejectedShifts: StateShift[]
  narrativeDiffs: NarrativeDiff[]
}
