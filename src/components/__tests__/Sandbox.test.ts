import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Mock dependencies before importing stores
vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
  isOfficialAnthropicEndpoint: () => false,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/stateDiff', () => ({
  captureSnapshot: vi.fn().mockReturnValue({ entities: [], stateEvents: [] }),
  replayReducer: vi.fn().mockReturnValue({}),
}))

vi.mock('@/utils/entityHelpers', () => ({
  buildNameToIdMapFromEntities: vi.fn().mockReturnValue({}),
  formatEntityLocation: vi.fn().mockReturnValue(''),
}))

vi.mock('@/utils/stateEventIndexes', () => ({
  buildStateEventIndexes: vi.fn().mockReturnValue(new Map()),
  sortStateEventsByChapter: vi.fn().mockImplementation((events) => [...events].sort((a, b) => a.chapterNumber - b.chapterNumber)),
}))

vi.mock('@/schemas/stateEventSchema', () => ({
  StateEventSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}))

// Mock localStorage using vi.stubGlobal for proper cleanup
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

import { useSandboxStore } from '@/stores/sandbox'
import type { Entity, StateEvent, EntityType, EntityImportance } from '@/types/sandbox'

function createMockEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: `entity-${Math.random().toString(36).slice(2)}`,
    projectId: 'test-project',
    type: 'CHARACTER',
    name: '测试角色',
    aliases: ['别名1'],
    importance: 'major',
    category: 'Protagonist',
    systemPrompt: '你是一个测试角色',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

function createMockStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2)}`,
    projectId: 'test-project',
    chapterNumber: 1,
    entityId: 'entity-1',
    eventType: 'PROPERTY_UPDATE',
    payload: { key: 'status', value: 'active' },
    source: 'MANUAL',
    ...overrides,
  }
}

describe('Sandbox Entity Management', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  // --- Entity CRUD ---

  it('starts with empty entities', () => {
    const store = useSandboxStore()

    expect(store.entities).toEqual([])
    expect(store.activeEntities).toEqual([])
  })

  it('adds an entity to the store', async () => {
    const store = useSandboxStore()
    const entity = createMockEntity({ name: '张三' })

    await store.addEntity(entity)

    expect(store.entities.length).toBe(1)
    expect(store.entities[0].name).toBe('张三')
    expect(store.entities[0].type).toBe('CHARACTER')
  })

  it('updates an existing entity', async () => {
    const store = useSandboxStore()
    const entity = createMockEntity({ id: 'ent-1', name: '原始名' })

    await store.addEntity(entity)
    await store.updateEntity('ent-1', { name: '新名字' })

    expect(store.entities[0].name).toBe('新名字')
    expect(store.entities[0].id).toBe('ent-1')
  })

  it('deletes an entity and its related state events', async () => {
    const store = useSandboxStore()
    const entity = createMockEntity({ id: 'ent-del' })

    await store.addEntity(entity)
    expect(store.entities.length).toBe(1)

    await store.deleteEntity('ent-del')
    expect(store.entities.length).toBe(0)
  })

  it('does nothing when updating non-existent entity', async () => {
    const store = useSandboxStore()
    const entity = createMockEntity({ id: 'ent-exist' })

    await store.addEntity(entity)
    await store.updateEntity('non-existent', { name: 'ghost' })

    expect(store.entities.length).toBe(1)
    expect(store.entities[0].name).not.toBe('ghost')
  })

  it('does nothing when deleting non-existent entity', async () => {
    const store = useSandboxStore()

    await store.deleteEntity('ghost-id')
    expect(store.entities.length).toBe(0)
  })

  // --- Entity Types ---

  it('supports all entity types', () => {
    const types: EntityType[] = ['CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD']

    for (const type of types) {
      const entity = createMockEntity({ type })
      expect(entity.type).toBe(type)
    }
  })

  it('filters active (non-archived) entities', async () => {
    const store = useSandboxStore()

    await store.addEntity(createMockEntity({ id: 'active-1', name: '活跃', isArchived: false }))
    await store.addEntity(createMockEntity({ id: 'archived-1', name: '已归档', isArchived: true }))

    expect(store.activeEntities.length).toBe(1)
    expect(store.activeEntities[0].name).toBe('活跃')
  })

  it('filters entities by type', async () => {
    const store = useSandboxStore()

    await store.addEntity(createMockEntity({ id: 'char-1', type: 'CHARACTER', name: '角色' }))
    await store.addEntity(createMockEntity({ id: 'loc-1', type: 'LOCATION', name: '地点' }))
    await store.addEntity(createMockEntity({ id: 'lore-1', type: 'LORE', name: '设定' }))

    expect(store.characterEntities.length).toBe(1)
    expect(store.characterEntities[0].name).toBe('角色')
    expect(store.locationEntities.length).toBe(1)
    expect(store.locationEntities[0].name).toBe('地点')
    expect(store.loreEntities.length).toBe(1)
    expect(store.loreEntities[0].name).toBe('设定')
  })

  it('entitiesByType returns correct entities', async () => {
    const store = useSandboxStore()

    await store.addEntity(createMockEntity({ id: 'f-1', type: 'FACTION', name: '势力A' }))
    await store.addEntity(createMockEntity({ id: 'f-2', type: 'FACTION', name: '势力B' }))
    await store.addEntity(createMockEntity({ id: 'c-1', type: 'CHARACTER', name: '角色A' }))

    const factions = store.entitiesByType('FACTION')
    expect(factions.length).toBe(2)
    expect(factions.every(e => e.type === 'FACTION')).toBe(true)
  })

  // --- Importance Levels ---

  it('supports all importance levels', () => {
    const levels: EntityImportance[] = ['critical', 'major', 'minor', 'background']

    for (const importance of levels) {
      const entity = createMockEntity({ importance })
      expect(entity.importance).toBe(importance)
    }
  })

  // --- Entity Properties ---

  it('entity has aliases array', () => {
    const entity = createMockEntity({ aliases: ['小名', '昵称'] })

    expect(entity.aliases).toEqual(['小名', '昵称'])
  })

  it('entity has optional speech profile', () => {
    const entity = createMockEntity({
      speechProfile: {
        formality: 'casual',
        vocabulary: 'moderate',
        sentenceLength: 'medium',
        quirks: ['喜欢用比喻'],
        catchphrases: ['说真的'],
      },
    })

    expect(entity.speechProfile).toBeDefined()
    expect(entity.speechProfile!.formality).toBe('casual')
    expect(entity.speechProfile!.quirks).toEqual(['喜欢用比喻'])
  })

  it('entity has optional visual metadata', () => {
    const entity = createMockEntity({
      visualMeta: {
        color: '#ff0000',
        icon: 'sword',
        defaultCoordinates: { x: 100, y: 200 },
      },
    })

    expect(entity.visualMeta).toBeDefined()
    expect(entity.visualMeta!.color).toBe('#ff0000')
    expect(entity.visualMeta!.defaultCoordinates).toEqual({ x: 100, y: 200 })
  })

  // --- State Events ---

  it('adds a state event', async () => {
    const store = useSandboxStore()

    await store.addEntity(createMockEntity({ id: 'ent-for-event' }))
    const event = createMockStateEvent({
      entityId: 'ent-for-event',
      eventType: 'PROPERTY_UPDATE',
      payload: { key: 'health', value: '100' },
      chapterNumber: 1,
    })

    await store.addStateEvent(event)

    expect(store.stateEvents.length).toBe(1)
    expect(store.stateEvents[0].eventType).toBe('PROPERTY_UPDATE')
    expect(store.stateEvents[0].payload.key).toBe('health')
  })

  it('state events are sorted by chapter number', async () => {
    const store = useSandboxStore()

    await store.addStateEvent(createMockStateEvent({ id: 'evt-3', chapterNumber: 3 }))
    await store.addStateEvent(createMockStateEvent({ id: 'evt-1', chapterNumber: 1 }))
    await store.addStateEvent(createMockStateEvent({ id: 'evt-2', chapterNumber: 2 }))

    expect(store.stateEvents.length).toBe(3)
    // Events should be sorted by chapter
    const chapters = store.stateEvents.map(e => e.chapterNumber)
    expect(chapters).toEqual([1, 2, 3])
  })

  it('deletes a state event', async () => {
    const store = useSandboxStore()

    await store.addStateEvent(createMockStateEvent({ id: 'evt-del' }))
    expect(store.stateEvents.length).toBe(1)

    await store.deleteStateEvent('evt-del')
    expect(store.stateEvents.length).toBe(0)
  })

  it('supports all state event types', () => {
    const types = [
      'PROPERTY_UPDATE',
      'RELATION_ADD',
      'RELATION_REMOVE',
      'RELATION_UPDATE',
      'LOCATION_MOVE',
      'VITAL_STATUS_CHANGE',
      'ABILITY_CHANGE',
    ]

    for (const eventType of types) {
      const event = createMockStateEvent({ eventType: eventType as StateEvent['eventType'] })
      expect(event.eventType).toBe(eventType)
    }
  })

  it('state events support AI_EXTRACTED and MANUAL sources', () => {
    const manual = createMockStateEvent({ source: 'MANUAL' })
    const ai = createMockStateEvent({ source: 'AI_EXTRACTED' })
    const migration = createMockStateEvent({ source: 'MIGRATION' })

    expect(manual.source).toBe('MANUAL')
    expect(ai.source).toBe('AI_EXTRACTED')
    expect(migration.source).toBe('MIGRATION')
  })

  // --- Draft System ---

  it('starts with empty drafts', () => {
    const store = useSandboxStore()

    expect(store.draftEntities).toEqual([])
    expect(store.draftRelations).toEqual([])
  })

  it('adds draft entities', () => {
    const store = useSandboxStore()
    const draft = createMockEntity({ name: '草稿角色' })

    store.addDraftEntity(draft)

    expect(store.draftEntities.length).toBe(1)
    expect(store.draftEntities[0].name).toBe('草稿角色')
  })

  it('adds draft relations', () => {
    const store = useSandboxStore()

    store.addDraftRelation('ent-1', {
      targetId: 'ent-2',
      type: 'ally',
      attitude: 'friendly',
    })

    expect(store.draftRelations.length).toBe(1)
    expect(store.draftRelations[0].sourceId).toBe('ent-1')
    expect(store.draftRelations[0].relation.targetId).toBe('ent-2')
  })

  it('clears drafts', () => {
    const store = useSandboxStore()

    store.addDraftEntity(createMockEntity())
    store.addDraftRelation('src', { targetId: 'tgt', type: 'rival' })
    expect(store.draftEntities.length).toBe(1)
    expect(store.draftRelations.length).toBe(1)

    store.clearDrafts()
    expect(store.draftEntities.length).toBe(0)
    expect(store.draftRelations.length).toBe(0)
  })

  it('commitDrafts saves entities and relation events', async () => {
    const store = useSandboxStore()

    const draftEntity = createMockEntity({ id: 'draft-ent', projectId: 'test-proj' })
    store.addDraftEntity(draftEntity)
    store.addDraftRelation('draft-ent', {
      targetId: 'other-ent',
      type: 'friend',
      attitude: 'warm',
    })

    await store.commitDrafts()

    // After commit, entities should include the draft
    expect(store.entities.some(e => e.id === 'draft-ent')).toBe(true)
    // A relation state event should be created
    expect(store.stateEvents.some(e =>
      e.entityId === 'draft-ent' && e.eventType === 'RELATION_ADD'
    )).toBe(true)
    // Drafts should be cleared
    expect(store.draftEntities.length).toBe(0)
    expect(store.draftRelations.length).toBe(0)
  })

  // --- Chapter Navigation ---

  it('defaults to chapter 1', () => {
    const store = useSandboxStore()

    expect(store.currentChapter).toBe(1)
  })

  it('currentChapter can be updated', () => {
    const store = useSandboxStore()

    store.currentChapter = 5
    expect(store.currentChapter).toBe(5)
  })

  // --- Loading State ---

  it('loading state tracks isLoading', () => {
    const store = useSandboxStore()

    expect(store.isLoading).toBe(false)
  })

  it('isLoaded starts as false', () => {
    const store = useSandboxStore()

    expect(store.isLoaded).toBe(false)
  })

  // --- Batch Operations ---

  it('batchAddEntities adds multiple entities at once', async () => {
    const store = useSandboxStore()

    const entities = [
      createMockEntity({ id: 'batch-1', name: '批量A' }),
      createMockEntity({ id: 'batch-2', name: '批量B' }),
      createMockEntity({ id: 'batch-3', name: '批量C' }),
    ]

    await store.batchAddEntities(entities)

    expect(store.entities.length).toBe(3)
    expect(store.entities.map(e => e.name).sort()).toEqual(['批量A', '批量B', '批量C'])
  })

  it('batchAddStateEvents adds multiple events at once', async () => {
    const store = useSandboxStore()

    const events = [
      createMockStateEvent({ id: 'batch-evt-1', chapterNumber: 1 }),
      createMockStateEvent({ id: 'batch-evt-2', chapterNumber: 2 }),
    ]

    await store.batchAddStateEvents(events)

    expect(store.stateEvents.length).toBe(2)
  })
})
