import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, isWebRuntimeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isWebRuntimeMock: vi.fn(() => false),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
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

import { createPinia, setActivePinia } from 'pinia'
import { useSandboxStore } from '@/stores/sandbox'
import type { Entity, StateEvent } from '@/types/sandbox'

const localStorageMock = vi.hoisted(() => {
  const store = new Map<string, string>()
  return {
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
  }
})

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

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
    isWebRuntimeMock.mockReturnValue(false)
    localStorage.clear()
  })

  it('does not call Tauri IPC in browser runtime', async () => {
    isWebRuntimeMock.mockReturnValue(true)
    const store = useSandboxStore()
    store.entities = [buildEntity({ id: 'existing-entity' })]
    store.stateEvents = [buildStateEvent({ id: 'existing-event' })]

    await store.loadData('project-1')

    expect(invokeMock).not.toHaveBeenCalled()
    expect(store.isLoaded).toBe(true)
    expect(store.entities).toHaveLength(0)
    expect(store.stateEvents).toHaveLength(0)
  })

  it('persists browser runtime batch writes without Tauri IPC', async () => {
    isWebRuntimeMock.mockReturnValue(true)
    const store = useSandboxStore()

    await store.loadData('project-1')
    await store.batchAddEntities([buildEntity()])
    await store.batchAddStateEvents([buildStateEvent()])

    expect(invokeMock).not.toHaveBeenCalled()
    expect(store.entities).toHaveLength(1)
    expect(store.stateEvents).toHaveLength(1)

    setActivePinia(createPinia())
    const reloadedStore = useSandboxStore()
    await reloadedStore.loadData('project-1')

    expect(reloadedStore.isLoaded).toBe(true)
    expect(reloadedStore.entities[0]?.id).toBe('entity-1')
    expect(reloadedStore.stateEvents[0]?.id).toBe('event-1')
  })
  it('does not mutate memory when browser persistence fails', async () => {
    isWebRuntimeMock.mockReturnValue(true)
    const store = useSandboxStore()
    const existing = buildEntity({ id: 'existing-entity' })
    store.entities = [existing]
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })

    await expect(store.batchAddEntities([buildEntity({ id: 'new-entity' })])).rejects.toThrow('quota exceeded')

    expect(store.entities).toEqual([existing])
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
