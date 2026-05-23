import type { EntityImportance, StateEventType } from '@/types/sandbox'

export const RELATION_EVENT_TYPES: StateEventType[] = ['RELATION_ADD', 'RELATION_REMOVE', 'RELATION_UPDATE']
export const STATE_CATEGORY_EVENT_TYPES: StateEventType[] = ['VITAL_STATUS_CHANGE', 'LOCATION_MOVE', 'PROPERTY_UPDATE']

export type HistoryCategory = 'location' | 'status' | 'faction'

export type AbilityStatus = 'active' | 'sealed' | 'lost'

export const ABILITY_STATUS_TAG_TYPE: Record<AbilityStatus, ElementTagType> = {
  active: 'success',
  sealed: 'warning',
  lost: 'danger'
}

export const ABILITY_STATUS_LABELS: Record<AbilityStatus, string> = {
  active: '获得',
  sealed: '封印',
  lost: '失去'
}

export type RelationType = 'family' | 'friend' | 'enemy' | 'lover' | 'rival' | 'other'

export const RELATION_TYPE_TAG_TYPE: Record<RelationType, ElementTagType> = {
  family: 'success',
  friend: 'primary',
  enemy: 'danger',
  lover: 'warning',
  rival: 'info',
  other: ''
}

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  family: '家人',
  friend: '朋友',
  enemy: '敌人',
  lover: '恋人',
  rival: '对手',
  other: '其他'
}

export const ABILITY_STATUS_OPTIONS: Array<{ value: AbilityStatus; label: string }> = (
  Object.entries(ABILITY_STATUS_LABELS) as Array<[AbilityStatus, string]>
).map(([value, label]) => ({ value, label }))

export const RELATION_TYPE_OPTIONS: Array<{ value: RelationType; label: string }> = (
  Object.entries(RELATION_TYPE_LABELS) as Array<[RelationType, string]>
).map(([value, label]) => ({ value, label }))

export const RELATION_TYPE_CONFIG: Record<RelationType, { label: string; color: string; strength: number }> = {
  family: { label: '家人', color: '#67C23A', strength: 5 },
  friend: { label: '朋友', color: '#409EFF', strength: 4 },
  enemy: { label: '敌人', color: '#F56C6C', strength: 5 },
  lover: { label: '恋人', color: '#E6A23C', strength: 5 },
  rival: { label: '对手', color: '#909399', strength: 3 },
  other: { label: '其他', color: '#C0C4CC', strength: 2 }
}

export const IMPORTANCE_LABELS: Record<EntityImportance, string> = {
  critical: '关键人物',
  major: '主要人物',
  minor: '次要人物',
  background: '背景人物'
}

export const IMPORTANCE_AI_LABELS: Record<EntityImportance, string> = {
  critical: '主角',
  major: '重要角色',
  minor: '配角',
  background: '背景角色'
}

export const IMPORTANCE_TAG_TYPE: Record<EntityImportance, ElementTagType> = {
  critical: 'danger',
  major: 'primary',
  minor: 'success',
  background: 'info'
}

export const IMPORTANCE_TAG_CONFIG: Record<EntityImportance, { label: string; color: string }> = {
  critical: { label: '核心人物', color: '#409EFF' },
  major: { label: '重要人物', color: '#67C23A' },
  minor: { label: '次要人物', color: '#909399' },
  background: { label: '背景人物', color: '#E6A23C' }
}

export const IMPORTANCE_EL_TAG_TYPE: Record<EntityImportance, ElementTagType> = {
  critical: 'primary',
  major: 'success',
  minor: 'info',
  background: 'warning'
}

export const HISTORY_CATEGORY_LABELS: Record<HistoryCategory, string> = {
  location: '位置变更',
  status: '状态变更',
  faction: '势力变更'
}

export const HISTORY_CATEGORY_TAG_TYPE: Record<HistoryCategory, ElementTagType> = {
  location: 'primary',
  status: 'warning',
  faction: 'success'
}

export const STATE_EVENT_TYPE_LABELS: Record<StateEventType, string> = {
  PROPERTY_UPDATE: '属性变化',
  VITAL_STATUS_CHANGE: '生命事件',
  ABILITY_CHANGE: '能力变化',
  RELATION_ADD: '关系建立',
  RELATION_REMOVE: '关系解除',
  RELATION_UPDATE: '关系更新',
  LOCATION_MOVE: '位置迁移'
}

export type ElementTagType = '' | 'success' | 'warning' | 'danger' | 'info' | 'primary'

export const STATE_EVENT_TYPE_TAG_TYPE: Record<StateEventType, ElementTagType> = {
  PROPERTY_UPDATE: '',
  RELATION_ADD: 'success',
  RELATION_REMOVE: 'danger',
  RELATION_UPDATE: 'warning',
  VITAL_STATUS_CHANGE: 'danger',
  ABILITY_CHANGE: '',
  LOCATION_MOVE: 'info'
}

export const STATE_EVENT_TYPE_TIMELINE_TYPE: Record<StateEventType, ElementTagType> = {
  PROPERTY_UPDATE: 'info',
  RELATION_ADD: 'success',
  RELATION_REMOVE: 'danger',
  RELATION_UPDATE: 'warning',
  VITAL_STATUS_CHANGE: 'danger',
  ABILITY_CHANGE: 'primary',
  LOCATION_MOVE: 'info'
}

export type SearchEntityType = 'chapter' | 'character' | 'lore' | 'location' | 'faction' | 'outline'

export const SEARCH_ENTITY_TYPE_LABELS: Record<SearchEntityType, string> = {
  chapter: '章节', character: '人物', lore: '知识',
  location: '地点', faction: '势力', outline: '大纲'
}

export const SEARCH_ENTITY_TYPE_TAG: Record<SearchEntityType, ElementTagType> = {
  chapter: 'info', character: 'success', lore: 'warning',
  location: '', faction: 'danger', outline: 'primary'
}
