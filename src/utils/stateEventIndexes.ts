import type { StateEvent } from '@/types/sandbox'

export interface StateEventIndexes {
  eventsByEntity: Map<string, StateEvent[]>
  countsByEntity: Map<string, number>
  chapterNumbersByEntity: Map<string, Set<number>>
  entityIdsByChapterNumber: Map<number, Set<string>>
}

export function compareStateEventsByChapter(a: StateEvent, b: StateEvent): number {
  return a.chapterNumber - b.chapterNumber
}

export function sortStateEventsByChapter(events: StateEvent[]): StateEvent[] {
  return [...events].sort(compareStateEventsByChapter)
}

export function areStateEventsSortedByChapter(events: StateEvent[]): boolean {
  for (let i = 1; i < events.length; i++) {
    if (compareStateEventsByChapter(events[i - 1], events[i]) > 0) {
      return false
    }
  }
  return true
}

export function buildStateEventIndexes(events: StateEvent[]): StateEventIndexes {
  const eventsByEntity = new Map<string, StateEvent[]>()
  const countsByEntity = new Map<string, number>()
  const chapterNumbersByEntity = new Map<string, Set<number>>()
  const entityIdsByChapterNumber = new Map<number, Set<string>>()

  for (const event of events) {
    const entityEvents = eventsByEntity.get(event.entityId)
    if (entityEvents) {
      entityEvents.push(event)
    } else {
      eventsByEntity.set(event.entityId, [event])
    }

    countsByEntity.set(event.entityId, (countsByEntity.get(event.entityId) || 0) + 1)

    const entityChapters = chapterNumbersByEntity.get(event.entityId)
    if (entityChapters) {
      entityChapters.add(event.chapterNumber)
    } else {
      chapterNumbersByEntity.set(event.entityId, new Set([event.chapterNumber]))
    }

    const chapterEntityIds = entityIdsByChapterNumber.get(event.chapterNumber)
    if (chapterEntityIds) {
      chapterEntityIds.add(event.entityId)
    } else {
      entityIdsByChapterNumber.set(event.chapterNumber, new Set([event.entityId]))
    }
  }

  return {
    eventsByEntity,
    countsByEntity,
    chapterNumbersByEntity,
    entityIdsByChapterNumber
  }
}
