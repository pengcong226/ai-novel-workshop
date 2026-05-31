/**
 * State Diff Benchmarks
 *
 * Measures performance of the event-sourcing reducer, snapshot capture,
 * and state diff computation at various entity/event scales.
 *
 * Run:  npx vitest bench src/utils/__benchmarks__/stateDiff.bench.ts
 */

import { bench, describe } from 'vitest'
import { replayReducer, captureSnapshot, computeStateDiff } from '@/utils/stateDiff'
import type { Entity, StateEvent, EntityType, StateEventType } from '@/types/sandbox'
import type { EntityStateSnapshot } from '@/types/rewrite-continuation'

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

const ENTITY_TYPES: EntityType[] = [
  'CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD',
]
const EVENT_TYPES: StateEventType[] = [
  'PROPERTY_UPDATE',
  'RELATION_ADD',
  'RELATION_REMOVE',
  'RELATION_UPDATE',
  'LOCATION_MOVE',
  'VITAL_STATUS_CHANGE',
  'ABILITY_CHANGE',
]

function makeEntities(count: number): Entity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `entity-${i}`,
    projectId: 'project-1',
    type: ENTITY_TYPES[i % ENTITY_TYPES.length]!,
    name: `实体${i}`,
    aliases: [`别名${i}A`, `别名${i}B`],
    importance: 'major' as const,
    category: '',
    systemPrompt: '',
    isArchived: false,
    createdAt: 1,
  }))
}

function makeStateEvents(
  entityCount: number,
  eventsPerEntity: number,
  chapterCount: number,
): StateEvent[] {
  const events: StateEvent[] = []
  let idCounter = 0

  for (let e = 0; e < entityCount; e++) {
    const entityId = `entity-${e}`
    for (let j = 0; j < eventsPerEntity; j++) {
      const chapterNumber = (j % chapterCount) + 1
      const eventType = EVENT_TYPES[idCounter % EVENT_TYPES.length]!

      let payload: StateEvent['payload'] = {}

      switch (eventType) {
        case 'PROPERTY_UPDATE':
          payload = { key: `prop-${idCounter % 10}`, value: `value-${idCounter}` }
          break
        case 'RELATION_ADD':
          payload = {
            targetId: `entity-${(e + 1 + (idCounter % entityCount)) % entityCount}`,
            relationType: 'ally',
            attitude: 'trust',
          }
          break
        case 'RELATION_REMOVE':
          payload = {
            targetId: `entity-${(e + 2 + (idCounter % entityCount)) % entityCount}`,
            relationType: 'enemy',
          }
          break
        case 'RELATION_UPDATE':
          payload = {
            targetId: `entity-${(e + 1 + (idCounter % entityCount)) % entityCount}`,
            attitude: 'suspicious',
          }
          break
        case 'LOCATION_MOVE':
          payload = { value: `location-${idCounter % 20}` }
          break
        case 'VITAL_STATUS_CHANGE':
          payload = { status: idCounter % 7 === 0 ? 'dead' : 'alive' }
          break
        case 'ABILITY_CHANGE':
          payload = {
            abilityName: `ability-${idCounter % 5}`,
            abilityStatus: 'active',
          }
          break
      }

      events.push({
        id: `evt-${idCounter++}`,
        projectId: 'project-1',
        chapterNumber,
        entityId,
        eventType,
        payload,
        source: 'AI_EXTRACTED',
      })
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// replayReducer benchmarks
// ---------------------------------------------------------------------------

describe('replayReducer', () => {
  // Small scale: 10 entities, 5 events each, 3 chapters
  {
    const entities = makeEntities(10)
    const events = makeStateEvents(10, 5, 3)
    bench('10 entities x 5 events x 3 chapters', () => {
      replayReducer(entities, events, 3)
    })
  }

  // Medium scale: 50 entities, 10 events each, 10 chapters
  {
    const entities = makeEntities(50)
    const events = makeStateEvents(50, 10, 10)
    bench('50 entities x 10 events x 10 chapters', () => {
      replayReducer(entities, events, 10)
    })
  }

  // Large scale: 200 entities, 20 events each, 50 chapters
  {
    const entities = makeEntities(200)
    const events = makeStateEvents(200, 20, 50)
    bench('200 entities x 20 events x 50 chapters', () => {
      replayReducer(entities, events, 50)
    })
  }

  // Extra large: 500 entities, 50 events each, 100 chapters
  {
    const entities = makeEntities(500)
    const events = makeStateEvents(500, 50, 100)
    bench('500 entities x 50 events x 100 chapters', () => {
      replayReducer(entities, events, 100)
    })
  }
})

// ---------------------------------------------------------------------------
// captureSnapshot benchmarks
// ---------------------------------------------------------------------------

describe('captureSnapshot', () => {
  {
    const entities = makeEntities(50)
    const events = makeStateEvents(50, 10, 10)
    bench('50 entities x 10 events — snapshot at ch 10', () => {
      captureSnapshot(entities, events, 10)
    })
  }

  {
    const entities = makeEntities(200)
    const events = makeStateEvents(200, 20, 50)
    bench('200 entities x 20 events — snapshot at ch 50', () => {
      captureSnapshot(entities, events, 50)
    })
  }

  {
    const entities = makeEntities(500)
    const events = makeStateEvents(500, 50, 100)
    bench('500 entities x 50 events — snapshot at ch 100', () => {
      captureSnapshot(entities, events, 100)
    })
  }
})

// ---------------------------------------------------------------------------
// computeStateDiff benchmarks
// ---------------------------------------------------------------------------

// Build two snapshots with controlled differences for diff benchmarks.

function buildDiffFixtures(
  entityCount: number,
  changedFraction: number, // 0.0 – 1.0
): { before: EntityStateSnapshot[]; after: EntityStateSnapshot[] } {
  const changedCount = Math.floor(entityCount * changedFraction)
  const changedIds = new Set(
    Array.from({ length: changedCount }, (_, i) => `entity-${i}`)
  )

  const makeSnapshot = (mutate: boolean): EntityStateSnapshot[] =>
    Array.from({ length: entityCount }, (_, i) => {
      const id = `entity-${i}`
      const isChanged = mutate && changedIds.has(id)

      return {
        entityId: id,
        entityName: `实体${i}`,
        entityType: 'CHARACTER' as EntityType,
        properties: {
          mood: isChanged ? '愤怒' : '平静',
          strength: isChanged ? '100' : '50',
          status: isChanged && i % 5 === 0 ? 'dead' : 'alive',
        },
        relations: [
          {
            targetId: `entity-${(i + 1) % entityCount}`,
            targetName: `实体${(i + 1) % entityCount}`,
            type: 'ally',
            attitude: isChanged ? 'hostile' : 'friendly',
          },
        ],
        location: isChanged ? '战场' : '古堡',
        vitalStatus: isChanged && i % 7 === 0 ? 'dead' : 'alive',
        abilities: [
          {
            name: `能力${i % 5}`,
            status: (isChanged ? 'sealed' : 'active') as 'sealed' | 'active',
          },
        ],
      }
    })

  return {
    before: makeSnapshot(false),
    after: makeSnapshot(true),
  }
}

describe('computeStateDiff', () => {
  // Small diff: 50 entities, 10% changed
  {
    const { before, after } = buildDiffFixtures(50, 0.1)
    bench('50 entities — 10% changed', () => {
      computeStateDiff(before, after)
    })
  }

  // Medium diff: 200 entities, 25% changed
  {
    const { before, after } = buildDiffFixtures(200, 0.25)
    bench('200 entities — 25% changed', () => {
      computeStateDiff(before, after)
    })
  }

  // Large diff: 500 entities, 50% changed
  {
    const { before, after } = buildDiffFixtures(500, 0.5)
    bench('500 entities — 50% changed', () => {
      computeStateDiff(before, after)
    })
  }

  // Worst case: 500 entities, 100% changed
  {
    const { before, after } = buildDiffFixtures(500, 1.0)
    bench('500 entities — 100% changed', () => {
      computeStateDiff(before, after)
    })
  }

  // No changes (should still scan all entities)
  {
    const { before, after } = buildDiffFixtures(500, 0)
    bench('500 entities — 0% changed (no-op baseline)', () => {
      computeStateDiff(before, after)
    })
  }
})
