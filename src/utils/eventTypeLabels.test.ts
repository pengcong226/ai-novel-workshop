import { describe, expect, it } from 'vitest'
import {
  HISTORY_CATEGORY_LABELS,
  HISTORY_CATEGORY_TAG_TYPE,
  RELATION_EVENT_TYPES,
  STATE_CATEGORY_EVENT_TYPES,
  STATE_EVENT_TYPE_TIMELINE_TYPE
} from '@/utils/eventTypeLabels'

describe('eventTypeLabels', () => {
  it('exports shared event-type groups', () => {
    expect(RELATION_EVENT_TYPES).toEqual(['RELATION_ADD', 'RELATION_REMOVE', 'RELATION_UPDATE'])
    expect(STATE_CATEGORY_EVENT_TYPES).toEqual(['VITAL_STATUS_CHANGE', 'LOCATION_MOVE', 'PROPERTY_UPDATE'])
  })

  it('keeps history labels and tag types aligned', () => {
    expect(HISTORY_CATEGORY_LABELS.location).toBe('位置变更')
    expect(HISTORY_CATEGORY_LABELS.status).toBe('状态变更')
    expect(HISTORY_CATEGORY_LABELS.faction).toBe('势力变更')

    expect(HISTORY_CATEGORY_TAG_TYPE.location).toBe('primary')
    expect(HISTORY_CATEGORY_TAG_TYPE.status).toBe('warning')
    expect(HISTORY_CATEGORY_TAG_TYPE.faction).toBe('success')
  })

  it('uses valid non-empty timeline colors for rendered events', () => {
    expect(STATE_EVENT_TYPE_TIMELINE_TYPE.PROPERTY_UPDATE).toBe('info')
    expect(STATE_EVENT_TYPE_TIMELINE_TYPE.ABILITY_CHANGE).toBe('primary')
    expect(STATE_EVENT_TYPE_TIMELINE_TYPE.VITAL_STATUS_CHANGE).toBe('danger')
  })
})
