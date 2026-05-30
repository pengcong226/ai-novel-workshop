/**
 * Integration tests for the V5 Sandbox data backbone.
 *
 * Tests the full data flow: entity CRUD -> state event projection -> delta
 * application -> rollback, using real store instances with createTestPinia
 * and the web-runtime (localStorage) persistence path.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted)
// ---------------------------------------------------------------------------

const { isWebRuntimeMock } = vi.hoisted(() => ({
  isWebRuntimeMock: vi.fn(() => true), // default: web runtime (localStorage)
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

// ---------------------------------------------------------------------------
// Imports (after mocks so they see the mocked modules)
// ---------------------------------------------------------------------------

import { createTestPinia } from '@/test/helpers'
import { useSandboxStore } from '@/stores/sandbox'
import type { Entity, StateEvent } from '@/types/sandbox'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uuidCounter = 0

function resetUuidCounter(): void {
  uuidCounter = 0
}

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('sandbox integration: entity CRUD -> state projection -> delta', () => {
  beforeEach(() => {
    createTestPinia()
    resetUuidCounter()
    isWebRuntimeMock.mockReturnValue(true)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // =========================================================================
  // Entity CRUD lifecycle
  // =========================================================================
  describe('entity CRUD lifecycle', () => {
    it('add -> update -> delete entity', async () => {
      const store = useSandboxStore()

      // Add
      const entity = makeEntity({ id: 'char-1', name: 'Alice' })
      await store.addEntity(entity)

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].name).toBe('Alice')

      // Update
      await store.updateEntity('char-1', { name: 'Alice Updated', importance: 'critical' })

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].name).toBe('Alice Updated')
      expect(store.entities[0].importance).toBe('critical')

      // Delete
      await store.deleteEntity('char-1')

      expect(store.entities).toHaveLength(0)
    })

    it('addEntity merges by ID (no duplicates)', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1', name: 'First' }))
      await store.addEntity(makeEntity({ id: 'char-1', name: 'Second' }))

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].name).toBe('Second')
    })

    it('deleteEntity cascades to related state events', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))
      await store.addEntity(makeEntity({ id: 'char-2', name: 'Villain' }))

      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'char-1', eventType: 'PROPERTY_UPDATE' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-2', entityId: 'char-2', eventType: 'PROPERTY_UPDATE' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-3', entityId: 'char-1', eventType: 'LOCATION_MOVE' }))

      expect(store.stateEvents).toHaveLength(3)

      // Delete char-1 -> should remove evt-1 and evt-3
      await store.deleteEntity('char-1')

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].id).toBe('char-2')
      expect(store.stateEvents).toHaveLength(1)
      expect(store.stateEvents[0].entityId).toBe('char-2')
    })

    it('updateEntity is a no-op for non-existent ID', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1' }))
      await store.updateEntity('nonexistent', { name: 'Ghost' })

      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].name).toBe('Test Character')
    })

    it('deleteEntity is a no-op for non-existent ID', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1' }))
      await store.deleteEntity('nonexistent')

      expect(store.entities).toHaveLength(1)
    })
  })

  // =========================================================================
  // State events and replay projection
  // =========================================================================
  describe('state event creation and projection', () => {
    it('addStateEvent updates entity state via activeEntitiesState', async () => {
      const store = useSandboxStore()
      store.currentChapter = 2 // project at chapter 2

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))

      // Apply property update at chapter 1
      await store.addStateEvent(makeStateEvent({
        id: 'evt-1',
        entityId: 'char-1',
        chapterNumber: 1,
        eventType: 'PROPERTY_UPDATE',
        payload: { key: 'level', value: '10' },
      }))

      // Apply vital status change at chapter 2
      await store.addStateEvent(makeStateEvent({
        id: 'evt-2',
        entityId: 'char-1',
        chapterNumber: 2,
        eventType: 'VITAL_STATUS_CHANGE',
        payload: { status: 'wounded' },
      }))

      const resolved = store.activeEntitiesState['char-1']
      expect(resolved).toBeDefined()
      expect(resolved.properties.level).toBe('10')
      expect(resolved.vitalStatus).toBe('wounded')
    })

    it('filters events beyond currentChapter', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))

      // Event at chapter 1 (should apply)
      await store.addStateEvent(makeStateEvent({
        id: 'evt-1',
        entityId: 'char-1',
        chapterNumber: 1,
        eventType: 'PROPERTY_UPDATE',
        payload: { key: 'level', value: '5' },
      }))

      // Event at chapter 3 (should NOT apply when currentChapter = 1)
      await store.addStateEvent(makeStateEvent({
        id: 'evt-2',
        entityId: 'char-1',
        chapterNumber: 3,
        eventType: 'PROPERTY_UPDATE',
        payload: { key: 'level', value: '100' },
      }))

      const resolved = store.activeEntitiesState['char-1']
      expect(resolved.properties.level).toBe('5')
    })

    it('RELATION_ADD establishes relations between entities', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))
      await store.addEntity(makeEntity({ id: 'char-2', name: 'Sidekick' }))

      await store.addStateEvent(makeStateEvent({
        id: 'evt-1',
        entityId: 'char-1',
        chapterNumber: 1,
        eventType: 'RELATION_ADD',
        payload: { targetId: 'char-2', relationType: 'ally', attitude: 'friendly' },
      }))

      const resolved = store.activeEntitiesState['char-1']
      expect(resolved.relations).toHaveLength(1)
      expect(resolved.relations[0].targetId).toBe('char-2')
      expect(resolved.relations[0].type).toBe('ally')
      expect(resolved.relations[0].attitude).toBe('friendly')
    })

    it('RELATION_REMOVE removes a previously added relation', async () => {
      const store = useSandboxStore()
      store.currentChapter = 2

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))
      await store.addEntity(makeEntity({ id: 'char-2', name: 'Sidekick' }))

      await store.addStateEvent(makeStateEvent({
        id: 'evt-add',
        entityId: 'char-1',
        chapterNumber: 1,
        eventType: 'RELATION_ADD',
        payload: { targetId: 'char-2', relationType: 'ally' },
      }))

      await store.addStateEvent(makeStateEvent({
        id: 'evt-remove',
        entityId: 'char-1',
        chapterNumber: 2,
        eventType: 'RELATION_REMOVE',
        payload: { targetId: 'char-2', relationType: 'ally' },
      }))

      const resolved = store.activeEntitiesState['char-1']
      expect(resolved.relations).toHaveLength(0)
    })

    it('LOCATION_MOVE sets entity location', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))

      await store.addStateEvent(makeStateEvent({
        id: 'evt-1',
        entityId: 'char-1',
        chapterNumber: 1,
        eventType: 'LOCATION_MOVE',
        payload: { coordinates: { x: 100, y: 200 } },
      }))

      const resolved = store.activeEntitiesState['char-1']
      expect(resolved.location).toEqual({ x: 100, y: 200 })
    })
  })

  // =========================================================================
  // Batch operations
  // =========================================================================
  describe('batch operations', () => {
    it('batchAddEntities adds multiple entities in one operation', async () => {
      const store = useSandboxStore()

      const entities = [
        makeEntity({ id: 'char-1', name: 'Alice' }),
        makeEntity({ id: 'char-2', name: 'Bob' }),
        makeEntity({ id: 'char-3', name: 'Charlie', type: 'FACTION' }),
      ]

      await store.batchAddEntities(entities)

      expect(store.entities).toHaveLength(3)
      expect(store.characterEntities).toHaveLength(2)
      expect(store.factionEntities).toHaveLength(1)
    })

    it('batchAddStateEvents adds multiple events', async () => {
      const store = useSandboxStore()
      store.currentChapter = 2

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))

      const events = [
        makeStateEvent({ id: 'evt-1', entityId: 'char-1', chapterNumber: 1, eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '5' } }),
        makeStateEvent({ id: 'evt-2', entityId: 'char-1', chapterNumber: 2, eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '10' } }),
      ]

      await store.batchAddStateEvents(events)

      expect(store.stateEvents).toHaveLength(2)
      expect(store.activeEntitiesState['char-1'].properties.level).toBe('10')
    })

    it('batchAddEntities merges with existing entities (deduplication)', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Alice V1' }))

      await store.batchAddEntities([
        makeEntity({ id: 'char-1', name: 'Alice V2' }),
        makeEntity({ id: 'char-2', name: 'Bob' }),
      ])

      expect(store.entities).toHaveLength(2)
      expect(store.entities.find(e => e.id === 'char-1')!.name).toBe('Alice V2')
    })

    it('batchAddEntities on empty array is a no-op', async () => {
      const store = useSandboxStore()
      await store.batchAddEntities([])
      expect(store.entities).toHaveLength(0)
    })
  })

  // =========================================================================
  // Delta application and rollback
  // =========================================================================
  describe('applyDelta and rollbackDelta', () => {
    it('applies entity additions via delta', async () => {
      const store = useSandboxStore()

      const result = store.applyDelta(PROJECT_ID, {
        entitiesToAdd: [
          makeEntity({ id: 'char-1', name: 'Hero' }),
          makeEntity({ id: 'char-2', name: 'Villain' }),
        ],
      })

      expect(result.success).toBe(true)
      expect(result.entitiesAdded).toBe(2)
      expect(store.entities).toHaveLength(2)
    })

    it('applies entity updates via delta', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero', importance: 'minor' }))

      const result = store.applyDelta(PROJECT_ID, {
        entitiesToUpdate: [
          { id: 'char-1', updates: { name: 'Super Hero', importance: 'critical' } },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.entitiesUpdated).toBe(1)
      expect(store.entities[0].name).toBe('Super Hero')
      expect(store.entities[0].importance).toBe('critical')
    })

    it('applies state events via delta', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero' }))

      const result = store.applyDelta(PROJECT_ID, {
        stateEventsToAdd: [
          makeStateEvent({ id: 'evt-1', entityId: 'char-1', chapterNumber: 1, eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '5' } }),
        ],
      })

      expect(result.success).toBe(true)
      expect(result.eventsAdded).toBe(1)
      expect(store.activeEntitiesState['char-1'].properties.level).toBe('5')
    })

    it('returns errors for entity updates on non-existent IDs', async () => {
      const store = useSandboxStore()

      const result = store.applyDelta(PROJECT_ID, {
        entitiesToUpdate: [
          { id: 'ghost', updates: { name: 'Ghost' } },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('ghost')
    })

    it('rejects delta with invalid state events', async () => {
      const store = useSandboxStore()

      const result = store.applyDelta(PROJECT_ID, {
        stateEventsToAdd: [
          // Invalid: missing required fields
          { id: '', projectId: PROJECT_ID, chapterNumber: 1, entityId: '', eventType: 'PROPERTY_UPDATE', payload: {}, source: 'MANUAL' } as StateEvent,
        ],
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.entitiesAdded).toBe(0)
      expect(result.eventsAdded).toBe(0)
    })

    it('combined delta: add entities, update entities, add state events', async () => {
      const store = useSandboxStore()
      store.currentChapter = 1

      await store.addEntity(makeEntity({ id: 'char-1', name: 'Hero', importance: 'minor' }))

      const result = store.applyDelta(PROJECT_ID, {
        entitiesToAdd: [makeEntity({ id: 'char-2', name: 'Ally' })],
        entitiesToUpdate: [{ id: 'char-1', updates: { importance: 'critical' } }],
        stateEventsToAdd: [
          makeStateEvent({ id: 'evt-1', entityId: 'char-1', chapterNumber: 1, eventType: 'RELATION_ADD', payload: { targetId: 'char-2', relationType: 'ally' } }),
        ],
      })

      expect(result.success).toBe(true)
      expect(result.entitiesAdded).toBe(1)
      expect(result.entitiesUpdated).toBe(1)
      expect(result.eventsAdded).toBe(1)
      expect(store.entities).toHaveLength(2)
      expect(store.entities.find(e => e.id === 'char-1')!.importance).toBe('critical')
      expect(store.activeEntitiesState['char-1'].relations).toHaveLength(1)
    })

    it('rollbackDelta restores previous state', async () => {
      const store = useSandboxStore()

      // Seed initial data
      await store.addEntity(makeEntity({ id: 'char-1', name: 'Original' }))

      // Apply delta
      const deltaResult = store.applyDelta(PROJECT_ID, {
        entitiesToAdd: [makeEntity({ id: 'char-2', name: 'New Guy' })],
        entitiesToUpdate: [{ id: 'char-1', updates: { name: 'Modified' } }],
      })

      expect(deltaResult.success).toBe(true)
      expect(store.entities).toHaveLength(2)
      expect(store.entities.find(e => e.id === 'char-1')!.name).toBe('Modified')

      // Rollback
      const rolledBack = store.rollbackDelta(deltaResult.rollbackToken)
      expect(rolledBack).toBe(true)

      // Verify restored state
      expect(store.entities).toHaveLength(1)
      expect(store.entities[0].id).toBe('char-1')
      expect(store.entities[0].name).toBe('Original')
    })

    it('rollbackDelta returns false for unknown token', () => {
      const store = useSandboxStore()
      expect(store.rollbackDelta('nonexistent-token')).toBe(false)
    })

    it('delta rollback token is captured in rollback map', async () => {
      const store = useSandboxStore()

      const result = store.applyDelta(PROJECT_ID, {
        entitiesToAdd: [makeEntity({ id: 'char-1', name: 'Hero' })],
      })

      expect(store.deltaRollbackMap.has(result.rollbackToken)).toBe(true)
    })
  })

  // =========================================================================
  // Entity type filtering and name-to-ID map
  // =========================================================================
  describe('entity type filtering and name-to-ID map', () => {
    it('characterEntities / loreEntities / locationEntities / factionEntities filter correctly', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
        makeEntity({ id: 'c2', type: 'CHARACTER', name: 'Sidekick' }),
        makeEntity({ id: 'l1', type: 'LORE', name: 'Ancient Law' }),
        makeEntity({ id: 'loc1', type: 'LOCATION', name: 'Castle' }),
        makeEntity({ id: 'f1', type: 'FACTION', name: 'Guild' }),
        makeEntity({ id: 'c-archived', type: 'CHARACTER', name: 'Dead Guy', isArchived: true }),
      ])

      expect(store.characterEntities).toHaveLength(2)
      expect(store.loreEntities).toHaveLength(1)
      expect(store.locationEntities).toHaveLength(1)
      expect(store.factionEntities).toHaveLength(1)
      // Archived entities should be excluded from all type-filtered views
      expect(store.activeEntities).toHaveLength(5)
    })

    it('nameToIdMap maps entity names to their IDs', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', name: 'Alice' }),
        makeEntity({ id: 'c2', name: 'Bob' }),
      ])

      const map = store.nameToIdMap
      expect(map['Alice']).toBe('c1')
      expect(map['Bob']).toBe('c2')
    })

    it('entitiesByType returns entities for a specific type', async () => {
      const store = useSandboxStore()

      await store.batchAddEntities([
        makeEntity({ id: 'c1', type: 'CHARACTER', name: 'Hero' }),
        makeEntity({ id: 'l1', type: 'LORE', name: 'Magic System' }),
      ])

      expect(store.entitiesByType('CHARACTER')).toHaveLength(1)
      expect(store.entitiesByType('LORE')).toHaveLength(1)
      expect(store.entitiesByType('ITEM')).toHaveLength(0)
    })
  })

  // =========================================================================
  // Draft workflow
  // =========================================================================
  describe('draft entities and relations', () => {
    it('addDraftEntity + commitDrafts persists drafts as real entities', async () => {
      const store = useSandboxStore()

      store.addDraftEntity(makeEntity({ id: 'draft-1', name: 'Draft Hero' }))
      store.addDraftRelation('draft-1', { targetId: 'some-id', type: 'ally' })

      expect(store.draftEntities).toHaveLength(1)
      expect(store.draftRelations).toHaveLength(1)

      await store.commitDrafts()

      // After commit, drafts should be cleared and entities persisted
      expect(store.draftEntities).toHaveLength(0)
      expect(store.draftRelations).toHaveLength(0)
      // Entities should now be in the store
      expect(store.entities.some(e => e.id === 'draft-1')).toBe(true)
    })

    it('clearDrafts empties both draft entities and relations', () => {
      const store = useSandboxStore()

      store.addDraftEntity(makeEntity({ id: 'd-1' }))
      store.addDraftRelation('d-1', { targetId: 'x', type: 'friend' })
      store.clearDrafts()

      expect(store.draftEntities).toHaveLength(0)
      expect(store.draftRelations).toHaveLength(0)
    })

    it('batchAddDraftEntities adds multiple drafts in one reassignment', () => {
      const store = useSandboxStore()

      store.batchAddDraftEntities([
        makeEntity({ id: 'd-1', name: 'Draft 1' }),
        makeEntity({ id: 'd-2', name: 'Draft 2' }),
      ])

      expect(store.draftEntities).toHaveLength(2)
    })
  })

  // =========================================================================
  // replaceProjectData
  // =========================================================================
  describe('replaceProjectData', () => {
    it('replaces all sandbox data atomically', async () => {
      const store = useSandboxStore()

      await store.addEntity(makeEntity({ id: 'old-1', name: 'Old Entity' }))

      const newEntities = [
        makeEntity({ id: 'new-1', name: 'New Entity 1' }),
        makeEntity({ id: 'new-2', name: 'New Entity 2' }),
      ]
      const newEvents = [
        makeStateEvent({ id: 'new-evt-1', entityId: 'new-1', chapterNumber: 1 }),
      ]

      await store.replaceProjectData(PROJECT_ID, newEntities, newEvents)

      expect(store.entities).toHaveLength(2)
      expect(store.entities.every(e => e.projectId === PROJECT_ID)).toBe(true)
      expect(store.stateEvents).toHaveLength(1)
      expect(store.isLoaded).toBe(true)
      expect(store.loadedProjectId).toBe(PROJECT_ID)
    })

    it('scopes all entities and events to the given projectId', async () => {
      const store = useSandboxStore()

      const entities = [makeEntity({ id: 'e-1', projectId: 'wrong-project' })]
      const events = [makeStateEvent({ id: 'evt-1', projectId: 'wrong-project', entityId: 'e-1' })]

      await store.replaceProjectData('correct-project', entities, events)

      expect(store.entities[0].projectId).toBe('correct-project')
      expect(store.stateEvents[0].projectId).toBe('correct-project')
    })
  })

  // =========================================================================
  // loadData from localStorage (web runtime)
  // =========================================================================
  describe('loadData persistence round-trip', () => {
    it('persists entities and state events in localStorage and reloads them', async () => {
      const store = useSandboxStore()

      // Write data
      await store.addEntity(makeEntity({ id: 'char-1', name: 'Persisted Hero' }))
      await store.addStateEvent(makeStateEvent({ id: 'evt-1', entityId: 'char-1', chapterNumber: 1, eventType: 'PROPERTY_UPDATE', payload: { key: 'level', value: '5' } }))

      // Create a fresh store instance (simulates reload)
      createTestPinia()
      const freshStore = useSandboxStore()

      await freshStore.loadData(PROJECT_ID)

      expect(freshStore.entities).toHaveLength(1)
      expect(freshStore.entities[0].name).toBe('Persisted Hero')
      expect(freshStore.stateEvents).toHaveLength(1)
      expect(freshStore.isLoaded).toBe(true)
      expect(freshStore.loadedProjectId).toBe(PROJECT_ID)
    })

    it('loadData with no stored data returns empty arrays but marks loaded', async () => {
      createTestPinia()
      const store = useSandboxStore()

      await store.loadData('nonexistent-project')

      expect(store.entities).toHaveLength(0)
      expect(store.stateEvents).toHaveLength(0)
      // localStorage falls back to '[]' for missing keys, so parseEntityArray
      // returns a valid (empty) array, meaning isLoaded becomes true.
      expect(store.isLoaded).toBe(true)
    })
  })
})
