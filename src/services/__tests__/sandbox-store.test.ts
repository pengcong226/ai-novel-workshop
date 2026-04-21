import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { createPinia, setActivePinia } from 'pinia'
import { useSandboxStore } from '@/stores/sandbox'
import type { Entity, StateEvent } from '@/types/sandbox'

function buildEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    projectId: 'project-1',
    type: 'CHARACTER',
    name: '主角',
    aliases: ['阿主'],
    importance: 'major',
    category: '人物',
    systemPrompt: '描述',
    isArchived: false,
    createdAt: 1710000000000,
    ...overrides,
  }
}

function buildStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: 'event-1',
    projectId: 'project-1',
    chapterNumber: 1,
    entityId: 'entity-1',
    eventType: 'PROPERTY_UPDATE',
    payload: { key: '境界', value: '筑基' },
    source: 'AI_EXTRACTED',
    ...overrides,
  }
}

describe('sandbox.loadData validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  it('sets isLoaded=true when entities and stateEvents are both valid', async () => {
    const store = useSandboxStore()

    invokeMock
      .mockResolvedValueOnce(JSON.stringify([buildEntity()]))
      .mockResolvedValueOnce(JSON.stringify([buildStateEvent()]))

    await store.loadData('project-1')

    expect(store.isLoaded).toBe(true)
    expect(store.entities).toHaveLength(1)
    expect(store.stateEvents).toHaveLength(1)
  })

  it('clears stale state and marks isLoaded=false when entities JSON is malformed', async () => {
    const store = useSandboxStore()
    store.entities = [buildEntity({ id: 'existing-entity' })]
    store.stateEvents = [buildStateEvent({ id: 'existing-event' })]

    invokeMock
      .mockResolvedValueOnce('[{]')
      .mockResolvedValueOnce(JSON.stringify([buildStateEvent()]))

    await store.loadData('project-1')

    expect(store.isLoaded).toBe(false)
    expect(store.entities).toHaveLength(0)
    expect(store.stateEvents).toHaveLength(0)
  })

  it('marks isLoaded=false when parsed entities are structurally invalid', async () => {
    const store = useSandboxStore()

    invokeMock
      .mockResolvedValueOnce(JSON.stringify([{ id: 123 }]))
      .mockResolvedValueOnce(JSON.stringify([buildStateEvent()]))

    await store.loadData('project-1')

    expect(store.isLoaded).toBe(false)
    expect(store.entities).toHaveLength(0)
    expect(store.stateEvents).toHaveLength(0)
  })

  it('injects fallback projectId when backend payload omits projectId', async () => {
    const store = useSandboxStore()

    invokeMock
      .mockResolvedValueOnce(JSON.stringify([{
        id: 'entity-2',
        type: 'CHARACTER',
        name: '配角',
        aliases: [],
        importance: 'minor',
        category: '人物',
        systemPrompt: '配角描述',
        isArchived: false,
        createdAt: 1710000000001,
      }]))
      .mockResolvedValueOnce(JSON.stringify([{
        id: 'event-2',
        chapterNumber: 2,
        entityId: 'entity-2',
        eventType: 'PROPERTY_UPDATE',
        payload: { key: '境界', value: '金丹' },
        source: 'AI_EXTRACTED',
      }]))

    await store.loadData('project-1')

    expect(store.isLoaded).toBe(true)
    expect(store.entities[0]?.projectId).toBe('project-1')
    expect(store.stateEvents[0]?.projectId).toBe('project-1')
  })

  it('marks isLoaded=false when stateEvents are structurally invalid', async () => {
    const store = useSandboxStore()

    invokeMock
      .mockResolvedValueOnce(JSON.stringify([buildEntity()]))
      .mockResolvedValueOnce(JSON.stringify([{ id: 'event-1', chapterNumber: '1' }]))

    await store.loadData('project-1')

    expect(store.isLoaded).toBe(false)
    expect(store.entities).toHaveLength(0)
    expect(store.stateEvents).toHaveLength(0)
  })
})
