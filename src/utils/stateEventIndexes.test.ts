import { describe, expect, it } from 'vitest'
import {
  areStateEventsSortedByChapter,
  buildStateEventIndexes,
  compareStateEventsByChapter,
  sortStateEventsByChapter
} from '@/utils/stateEventIndexes'
import type { StateEvent } from '@/types/sandbox'

describe('stateEventIndexes', () => {
  it('sorts events by chapter without mutating input', () => {
    const events = [
      { id: '3', projectId: 'p', chapterNumber: 3, entityId: 'a', eventType: 'VITAL_STATUS_CHANGE', payload: {}, source: 'MANUAL' },
      { id: '1', projectId: 'p', chapterNumber: 1, entityId: 'a', eventType: 'PROPERTY_UPDATE', payload: {}, source: 'MANUAL' },
      { id: '2', projectId: 'p', chapterNumber: 2, entityId: 'b', eventType: 'ABILITY_CHANGE', payload: {}, source: 'MANUAL' }
    ] satisfies StateEvent[]

    const sorted = sortStateEventsByChapter(events)

    expect(sorted.map(event => event.id)).toEqual(['1', '2', '3'])
    expect(events.map(event => event.id)).toEqual(['3', '1', '2'])
    expect(areStateEventsSortedByChapter(events)).toBe(false)
    expect(areStateEventsSortedByChapter(sorted)).toBe(true)
    expect(compareStateEventsByChapter(sorted[0], sorted[1])).toBeLessThan(0)
  })

  it('returns empty indexes for empty input', () => {
    const indexes = buildStateEventIndexes([])

    expect(indexes.eventsByEntity.size).toBe(0)
    expect(indexes.countsByEntity.size).toBe(0)
    expect(indexes.chapterNumbersByEntity.size).toBe(0)
    expect(indexes.entityIdsByChapterNumber.size).toBe(0)
  })

  it('groups events according to chronological store order', () => {
    const events = [
      { id: '3', projectId: 'p', chapterNumber: 2, entityId: 'a', eventType: 'VITAL_STATUS_CHANGE', payload: {}, source: 'MANUAL' },
      { id: '2', projectId: 'p', chapterNumber: 1, entityId: 'b', eventType: 'PROPERTY_UPDATE', payload: {}, source: 'MANUAL' },
      { id: '1', projectId: 'p', chapterNumber: 1, entityId: 'a', eventType: 'PROPERTY_UPDATE', payload: {}, source: 'MANUAL' }
    ] satisfies StateEvent[]

    const indexes = buildStateEventIndexes(sortStateEventsByChapter(events))

    expect(indexes.eventsByEntity.get('a')?.map(event => event.id)).toEqual(['1', '3'])
    expect(indexes.eventsByEntity.get('b')?.map(event => event.id)).toEqual(['2'])
  })

  it('builds counts and unique chapter/entity sets', () => {
    const events: StateEvent[] = [
      { id: '1', projectId: 'p', chapterNumber: 2, entityId: 'a', eventType: 'PROPERTY_UPDATE', payload: {}, source: 'MANUAL' },
      { id: '2', projectId: 'p', chapterNumber: 2, entityId: 'a', eventType: 'ABILITY_CHANGE', payload: {}, source: 'MANUAL' },
      { id: '3', projectId: 'p', chapterNumber: 3, entityId: 'b', eventType: 'RELATION_ADD', payload: {}, source: 'MANUAL' },
      { id: '4', projectId: 'p', chapterNumber: 3, entityId: 'a', eventType: 'LOCATION_MOVE', payload: {}, source: 'MANUAL' }
    ]

    const indexes = buildStateEventIndexes(events)

    expect(indexes.countsByEntity.get('a')).toBe(3)
    expect(indexes.countsByEntity.get('b')).toBe(1)
    expect([...indexes.chapterNumbersByEntity.get('a') || []]).toEqual([2, 3])
    expect([...indexes.entityIdsByChapterNumber.get(3) || []]).toEqual(['b', 'a'])
  })
})
