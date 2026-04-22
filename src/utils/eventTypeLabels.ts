import type { StateEventType } from '@/types/sandbox'

export const STATE_EVENT_TYPE_LABELS: Record<StateEventType, string> = {
  PROPERTY_UPDATE: '属性变化',
  VITAL_STATUS_CHANGE: '生命事件',
  ABILITY_CHANGE: '能力变化',
  RELATION_ADD: '关系建立',
  RELATION_REMOVE: '关系解除',
  RELATION_UPDATE: '关系更新',
  LOCATION_MOVE: '位置迁移'
}

export type ElementTagType = '' | 'success' | 'warning' | 'danger' | 'info'

export const STATE_EVENT_TYPE_TAG_TYPE: Record<StateEventType, ElementTagType> = {
  PROPERTY_UPDATE: '',
  RELATION_ADD: 'success',
  RELATION_REMOVE: 'danger',
  RELATION_UPDATE: 'warning',
  VITAL_STATUS_CHANGE: 'danger',
  ABILITY_CHANGE: '',
  LOCATION_MOVE: 'info'
}
