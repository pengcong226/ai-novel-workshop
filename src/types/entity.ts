// src/types/entity.ts
// 图元时序架构的核心类型定义

export interface EntityNode {
  id: string
  type: 'CHARACTER' | 'FACTION' | 'ITEM' | 'LOCATION' | 'CONCEPT'
  name: string
  aliases: string[]
  isArchived: boolean
  keywords: string[]
  createdAtChapter: number
  importance: 'critical' | 'major' | 'minor' | 'background'
}

export interface CharacterV3 extends EntityNode {
  type: 'CHARACTER'

  coreIdentity: {
    gender: 'male' | 'female' | 'other'
    birthChapter: number
    fundamentalTraits: string
    deathChapter?: number
  }

  stateTimeline: CharacterStateSlice[]
  relationships: EntityRelation[]

  narrativeProfile: string
  lastNarrativeUpdate: number
}

export interface CharacterStateSlice {
  chapterIndex: number
  vitalStatus: 'alive' | 'dead' | 'missing' | 'unknown'
  physicalState: string
  location: string
  faction: string
  powerLevel: string
  currentGoal: string
  inventory: InventoryItem[]
  abilities: AbilityRecord[]
  trigger: string
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
  intensity: number
  sinceChapter: number
  description: string
}

export interface WorldEntityV3 extends EntityNode {
  stateVersions: {
    validFromChapter: number
    validUntilChapter: number | null
    description: string
    trigger: string
  }[]
  relatedEntityIds: string[]
}

export interface WorldNarrative {
  id: string
  narrativeState: string
  lastUpdatedChapter: number
}

export interface PlotNarrative {
  id: string
  narrativeNotes: string
  lastUpdatedChapter: number
}

export interface PlotBeat {
  id: string
  summary: string
  povCharacterId: string
  locationId: string
  sceneType: 'action' | 'dialogue' | 'introspection' | 'exposition' | 'transition'
  tokenBudget: number
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
