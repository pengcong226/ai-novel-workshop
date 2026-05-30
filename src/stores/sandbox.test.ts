import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { isWebRuntimeMock } = vi.hoisted(() => ({
  isWebRuntimeMock: vi.fn(() => true),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: isWebRuntimeMock,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/performance', () => ({
  measureSync: (_label: string, fn: () => unknown) => fn(),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}))

// ── Imports ──────────────────────────────────────────────────────────────

import { createTestPinia } from '@/test/helpers'
import { useSandboxStore } from '@/stores/sandbox'
import type { Entity, StateEvent } from '@/types/sandbox'

let uuidCounter = 0
const PROJECT_ID = 'test-project-1'

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${uuidCounter + 1}`,
    projectId: PROJECT_ID,
    type: 'CHARACTER',
    name: 'Test Character',
    aliases: [],
    importance: 'major',
    category: 'character',
    systemPrompt: 'A character for testing',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: `event-${uuidCounter + 1}`,
    projectId: PROJECT_ID,
    chapterNumber: 1,
    entityId: 'entity-1',
    eventType: 'PROPERTY_UPDATE',
    payload: { key: 'status', value: 'active' },
    source: 'MANUAL',
    ...overrides,
  }
}

describe('sandbox store (unit)', () => {
  beforeEach(() => {
    createTestPinia()
    uuidCounter = 0
    isWebRuntimeMock.mockReturnValue(true)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty entities and state events', () => {
      const store = useSandboxStore()

      expect(store.entities).toEqual([])
      expect(store.stateEvents).toEqual([])
      expect(store.pendingStateEvents).toEqual([])
      expect(store.isLoading).toBe(false)
      expect(store.isLoaded).toBe(false)
      expect(store.loadedProjectId).toBeNull()
    })

    it('currentChapter defaults to 1', () => {
      const store = useSandboxStore()

      expect(store.currentChapter).toBe(1)
    })

    it('isWizardMode defaults to false', () => {
      const store = useSandboxStore()

      expect(store.isWizardMode).toBe(false)
    })
  })

  // ── Computed entity views ────────────────────────────────────────────────

  describe('computed entity views', () => {
    it('activeEntities excludes archived entities', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'a1', name: 'Active', isArchived: false }),
        makeEntity({ id: 'a2', name: 'Archived', isArchived: true }),
        makeEntity({ id: 'a3', name: 'Also Active', isArchived: false }),
      ])

      expect(store.activeEntities).toHaveLength(2)
      expect(store.activeEntities.map(e => e.name)).toEqual(
        expect.arrayContaining(['Active', 'Also Active'])
      )
    })

    it('characterEntities returns only CHARACTER type (non-archived)', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
        makeEntity({ id: 'c2', type: 'CHARACTER', name: 'Sidekick', isArchived: true }),
        makeEntity({ id: 'l1', type: 'LORE', name: 'Magic' }),
        makeEntity({ id: 'f1', type: 'FACTION', name: 'Guild' }),
      ])

      expect(store.characterEntities).toHaveLength(1)
      expect(store.characterEntities[0].name).toBe('Hero')
    })

    it('loreEntities returns only LORE type', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'l1', type: 'LORE', name: 'Ancient Law' }),
        makeEntity({ id: 'l2', type: 'LORE', name: 'Magic System' }),
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
      ])

      expect(store.loreEntities).toHaveLength(2)
    })

    it('locationEntities returns only LOCATION type', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'loc1', type: 'LOCATION', name: 'Castle' }),
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
      ])

      expect(store.locationEntities).toHaveLength(1)
      expect(store.locationEntities[0].name).toBe('Castle')
    })

    it('factionEntities returns only FACTION type', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'f1', type: 'FACTION', name: 'Guild' }),
        makeEntity({ id: 'f2', type: 'FACTION', name: 'Order' }),
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
      ])

      expect(store.factionEntities).toHaveLength(2)
    })

    it('entitiesByType returns entities for a given type', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
        makeEntity({ id: 'i1', type: 'ITEM', name: 'Sword' }),
        makeEntity({ id: 'i2', type: 'ITEM', name: 'Shield' }),
      ])

      expect(store.entitiesByType('CHARACTER')).toHaveLength(1)
      expect(store.entitiesByType('ITEM')).toHaveLength(2)
      expect(store.entitiesByType('CONCEPT')).toHaveLength(0)
    })
  })

  // ── nameToIdMap ──────────────────────────────────────────────────────────

  describe('nameToIdMap', () => {
    it('maps entity names to IDs', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', name: 'Alice' }),
        makeEntity({ id: 'c2', name: 'Bob' }),
      ])

      const map = store.nameToIdMap
      expect(map['Alice']).toBe('c1')
      expect(map['Bob']).toBe('c2')
    })

    it('updates when entities change', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'c1', name: 'Alice' }))
      expect(store.nameToIdMap['Alice']).toBe('c1')

      await store.updateEntity('c1', { name: 'Alicia' })
      expect(store.nameToIdMap['Alice']).toBeUndefined()
      expect(store.nameToIdMap['Alicia']).toBe('c1')
    })
  })

  // ── Draft workflow ───────────────────────────────────────────────────────

  describe('draft management', () => {
    it('addDraftEntity appends to draftEntities', () => {
      const store = useSandboxStore()

      store.addDraftEntity(makeEntity({ id: 'd1', name: 'Draft 1' }))
      store.addDraftEntity(makeEntity({ id: 'd2', name: 'Draft 2' }))

      expect(store.draftEntities).toHaveLength(2)
      expect(store.draftEntities[0].name).toBe('Draft 1')
      expect(store.draftEntities[1].name).toBe('Draft 2')
    })

    it('batchAddDraftEntities adds multiple drafts in one reassignment', () => {
      const store = useSandboxStore()

      store.batchAddDraftEntities([
        makeEntity({ id: 'd1', name: 'Draft 1' }),
        makeEntity({ id: 'd2', name: 'Draft 2' }),
        makeEntity({ id: 'd3', name: 'Draft 3' }),
      ])

      expect(store.draftEntities).toHaveLength(3)
    })

    it('batchAddDraftEntities is a no-op for empty array', () => {
      const store = useSandboxStore()

      store.batchAddDraftEntities([])

      expect(store.draftEntities).toHaveLength(0)
    })

    it('addDraftRelation appends to draftRelations', () => {
      const store = useSandboxStore()

      store.addDraftRelation('d1', { targetId: 'd2', type: 'ally' })
      store.addDraftRelation('d1', { targetId: 'd3', type: 'enemy', attitude: 'hostile' })

      expect(store.draftRelations).toHaveLength(2)
      expect(store.draftRelations[0].sourceId).toBe('d1')
      expect(store.draftRelations[0].relation.type).toBe('ally')
    })

    it('batchAddDraftRelations adds multiple relations in one reassignment', () => {
      const store = useSandboxStore()

      store.batchAddDraftRelations([
        { sourceId: 'd1', relation: { targetId: 'd2', type: 'ally' } },
        { sourceId: 'd1', relation: { targetId: 'd3', type: 'rival' } },
      ])

      expect(store.draftRelations).toHaveLength(2)
    })

    it('clearDrafts empties both draft entities and relations', () => {
      const store = useSandboxStore()

      store.addDraftEntity(makeEntity({ id: 'd1' }))
      store.addDraftRelation('d1', { targetId: 'x', type: 'friend' })

      store.clearDrafts()

      expect(store.draftEntities).toHaveLength(0)
      expect(store.draftRelations).toHaveLength(0)
    })
  })

  // ── deleteStateEvent ─────────────────────────────────────────────────────

  describe('deleteStateEvent', () => {
    it('removes a state event by ID', async () => {
      const store = useSandboxStore()

      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'e1', chapterNumber: 1 }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-2', entityId: 'e1', chapterNumber: 2 }))

      await store.deleteStateEvent('evt-1')

      expect(store.stateEvents).toHaveLength(1)
      expect(store.stateEvents[0].id).toBe('evt-2')
    })

    it('is a no-op for non-existent event ID', async () => {
      const store = useSandboxStore()

      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'e1' }))

      await store.deleteStateEvent('nonexistent')

      expect(store.stateEvents).toHaveLength(1)
    })
  })

  // ── deleteStateEventsByChapterRange ──────────────────────────────────────

  describe('deleteStateEventsByChapterRange', () => {
    it('deletes events within the specified chapter range', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'e1' }))

      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'e1', chapterNumber: 1 }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-2', entityId: 'e1', chapterNumber: 2 }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-3', entityId: 'e1', chapterNumber: 3 }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-4', entityId: 'e1', chapterNumber: 5 }))

      await store.deleteStateEventsByChapterRange(2, 3)

      expect(store.stateEvents).toHaveLength(2)
      expect(store.stateEvents.map(e => e.id)).toEqual(
        expect.arrayContaining(['evt-1', 'evt-4'])
      )
    })
  })

  // ── deleteEntitiesByIds ──────────────────────────────────────────────────

  describe('deleteEntitiesByIds', () => {
    it('deletes multiple entities and their related state events', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'e1', name: 'Keep' }))
      await store.addEntity(makeEntity({ id: 'e2', name: 'Remove 1' }))
      await store.addEntity(makeEntity({ id: 'e3', name: 'Remove 2' }))

      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'e1' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-2', entityId: 'e2' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-3', entityId: 'e3' }))

      await store.deleteEntitiesByIds(['e2', 'e3'])

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].name).toBe('Keep')
      expect(store.stateEvents).toHaveLength(1)
      expect(store.stateEvents[0].entityId).toBe('e1')
    })

    it('is a no-op for empty ID array', async () => {
      const store = useSandboxStore()
      await store.addEntity(makeEntity({ id: 'e1' }))

      await store.deleteEntitiesByIds([])

      expect(store.entities).toHaveLength(1)
    })

    it('ignores non-existent IDs', async () => {
      const store = useSandboxStore()
      await store.addEntity(makeEntity({ id: 'e1' }))

      await store.deleteEntitiesByIds(['ghost-1', 'ghost-2'])

      expect(store.entities).toHaveLength(1)
    })

    it('deduplicates input IDs', async () => {
      const store = useSandboxStore()
      await store.addEntity(makeEntity({ id: 'e1' }))

      await store.deleteEntitiesByIds(['e1', 'e1', 'e1'])

      expect(store.entities).toHaveLength(0)
    })
  })

  // ── replaceProjectData ───────────────────────────────────────────────────

  describe('replaceProjectData', () => {
    it('replaces all data atomically', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'old-1', name: 'Old' }))

      const newEntities = [
        makeEntity({ id: 'new-1', name: 'New 1' }),
        makeEntity({ id: 'new-2', name: 'New 2' }),
      ]
      const newEvents = [
        makeStateEvent({ id: 'new-evt-1', entityId: 'new-1', chapterNumber: 1 }),
      ]

      await store.replaceProjectData(PROJECT_ID, newEntities, newEvents)

      expect(store.entities).toHaveLength(2)
      expect(store.stateEvents).toHaveLength(1)
      expect(store.isLoaded).toBe(true)
      expect(store.loadedProjectId).toBe(PROJECT_ID)
    })

    it('scopes entities to the given projectId', async () => {
      const store = useSandboxStore()

      const entities = [makeEntity({ id: 'e-1', projectId: 'wrong-project' })]
      const events = [makeStateEvent({ id: 'evt-1', projectId: 'wrong-project', entityId: 'e-1' })]

      await store.replaceProjectData('correct-project', entities, events)

      expect(store.entities[0].projectId).toBe('correct-project')
      expect(store.stateEvents[0].projectId).toBe('correct-project')
    })

    it('clears pendingStateEvents after replacement', async () => {
      const store = useSandboxStore()
      store.pendingStateEvents = [makeStateEvent({ id: 'pending-1' })] as any

      await store.replaceProjectData(PROJECT_ID, [], [])

      expect(store.pendingStateEvents).toEqual([])
    })
  })

  // ── getStateSnapshotAt ───────────────────────────────────────────────────

  describe('getStateSnapshotAt', () => {
    it('returns an array of entity state snapshots', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'c1', name: 'Hero' }))
      await store.addStateEvent(makeStateEvent({
        id: 'evt-1', entityId: 'c1', chapterNumber: 1,
        eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '5' },
      }))

      const snapshot = store.getStateSnapshotAt(1)

      expect(Array.isArray(snapshot)).toBe(true)
      expect(snapshot).toHaveLength(1)
    })

    it('returns empty array when no entities exist', () => {
      const store = useSandboxStore()

      const snapshot = store.getStateSnapshotAt(1)

      expect(snapshot).toEqual([])
    })
  })

  // ── buildNameToIdMap ─────────────────────────────────────────────────────

  describe('buildNameToIdMap', () => {
    it('returns the same value as the nameToIdMap computed', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', name: 'Alice' }),
        makeEntity({ id: 'c2', name: 'Bob' }),
      ])

      const map = store.buildNameToIdMap()

      expect(map).toEqual(store.nameToIdMap)
      expect(map['Alice']).toBe('c1')
    })
  })

  // ── activeEntitiesState (projection) ─────────────────────────────────────

  describe('activeEntitiesState projection', () => {
    it('returns empty record when no entities exist', () => {
      const store = useSandboxStore()

      expect(store.activeEntitiesState).toEqual({})
    })

    it('resolves entity with default values when no events exist', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'c1', name: 'Hero' }))

      const resolved = store.activeEntitiesState['c1']
      expect(resolved).toBeDefined()
      expect(resolved.name).toBe('Hero')
      expect(resolved.properties).toEqual({})
      expect(resolved.relations).toEqual([])
      expect(resolved.vitalStatus).toBeDefined()
    })

    it('merges properties from multiple PROPERTY_UPDATE events', async () => {
      const store = useSandboxStore()
      store.currentChapter = 3

      await store.addEntity(makeEntity({ id: 'c1' }))

      await store.addStateEvent(makeStateEvent({
        id: 'e1', entityId: 'c1', chapterNumber: 1,
        eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '5' },
      }))
      await store.addStateEvent(makeStateEvent({
        id: 'e2', entityId: 'c1', chapterNumber: 2,
        eventType: 'PROPERTY_UPDATE', payload: { key: 'status', value: 'wounded' },
      }))

      const resolved = store.activeEntitiesState['c1']
      expect(resolved.properties.level).toBe('5')
      expect(resolved.properties.status).toBe('wounded')
    })

    it('VITAL_STATUS_CHANGE updates entity vital status', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'c1' }))

      await store.addStateEvent(makeStateEvent({
        id: 'e1', entityId: 'c1', chapterNumber: 1,
        eventType: 'VITAL_STATUS_CHANGE', payload: { status: 'deceased' },
      }))

      expect(store.activeEntitiesState['c1'].vitalStatus).toBe('deceased')
    })

    it('LOCATION_MOVE sets entity location', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'c1' }))

      await store.addStateEvent(makeStateEvent({
        id: 'e1', entityId: 'c1', chapterNumber: 1,
        eventType: 'LOCATION_MOVE', payload: { coordinates: { x: 50, y: 100 } },
      }))

      const resolved = store.activeEntitiesState['c1']
      expect(resolved.location).toEqual({ x: 50, y: 100 })
    })
  })

  // ── $reset ───────────────────────────────────────────────────────────────

  describe('$reset', () => {
    it('resets all state to defaults', async () => {
      const store = useSandboxStore()
      store.isWizardMode = true
      store.currentChapter = 5

      await store.addEntity(makeEntity({ id: 'e1' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-1' }))
      store.addDraftEntity(makeEntity({ id: 'd1' }))

      store.$reset()

      expect(store.entities).toEqual([])
      expect(store.stateEvents).toEqual([])
      expect(store.pendingStateEvents).toEqual([])
      expect(store.isLoading).toBe(false)
      expect(store.isLoaded).toBe(false)
      expect(store.loadedProjectId).toBeNull()
      expect(store.currentChapter).toBe(1)
      expect(store.draftEntities).toEqual([])
      expect(store.draftRelations).toEqual([])
      expect(store.isWizardMode).toBe(false)
      expect(store.deltaRollbackMap.size).toBe(0)
    })
  })
})
