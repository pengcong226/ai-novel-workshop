/**
 * Smoke test for the shared test infrastructure.
 *
 * Verifies that setup.ts mocks, mock factories, and test helpers
 * all work correctly together.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockProject,
  createMockChapter,
  createMockChapterOutline,
  createMockCheckpoint,
  createMockEntity,
  createMockStateEvent,
  createMockOutline,
  createMockProjectConfig,
  createMockChapters,
  createMockEntities,
  createMockSandboxStore,
  createMockStorage,
  resetMockIdCounter,
} from './mocks'
import {
  createTestPinia,
  flushPromises,
  waitForNextTick,
  waitFor,
} from './helpers'
import { getTauriInvokeMock } from './setup'

// ---------------------------------------------------------------------------
// setup.ts – browser API mocks
// ---------------------------------------------------------------------------
describe('setup.ts – global mocks', () => {
  it('provides localStorage mock', () => {
    expect(localStorage).toBeDefined()
    expect(typeof localStorage.getItem).toBe('function')
    expect(typeof localStorage.setItem).toBe('function')

    localStorage.setItem('test-key', 'test-value')
    expect(localStorage.getItem('test-key')).toBe('test-value')

    localStorage.removeItem('test-key')
    expect(localStorage.getItem('test-key')).toBeNull()

    localStorage.clear()
  })

  it('provides sessionStorage mock', () => {
    expect(sessionStorage).toBeDefined()
    sessionStorage.setItem('k', 'v')
    expect(sessionStorage.getItem('k')).toBe('v')
    sessionStorage.clear()
  })

  it('provides matchMedia mock', () => {
    expect(typeof matchMedia).toBe('function')
    const mql = matchMedia('(min-width: 800px)')
    expect(mql.matches).toBe(false)
    expect(mql.media).toBe('(min-width: 800px)')
  })

  it('provides ResizeObserver mock', () => {
    expect(ResizeObserver).toBeDefined()
    const ro = new ResizeObserver(() => {})
    expect(typeof ro.observe).toBe('function')
    expect(typeof ro.disconnect).toBe('function')
  })

  it('provides IntersectionObserver mock', () => {
    expect(IntersectionObserver).toBeDefined()
    const io = new IntersectionObserver(() => {})
    expect(typeof io.observe).toBe('function')
    expect(typeof io.disconnect).toBe('function')
  })

  it('provides Tauri IPC mock', () => {
    expect((window as Record<string, unknown>).__TAURI_INTERNALS__).toBeDefined()
    const internals = (window as Record<string, { invoke: Function }>).__TAURI_INTERNALS__
    expect(typeof internals.invoke).toBe('function')
  })

  it('provides getTauriInvokeMock helper', () => {
    const mock = getTauriInvokeMock()
    expect(mock).toBeDefined()
    expect(typeof mock.mockResolvedValueOnce).toBe('function')
  })

  it('provides URL.createObjectURL / revokeObjectURL', () => {
    expect(typeof URL.createObjectURL).toBe('function')
    expect(typeof URL.revokeObjectURL).toBe('function')
  })

  it('provides navigator.clipboard mock', () => {
    expect(navigator.clipboard).toBeDefined()
    expect(typeof navigator.clipboard.writeText).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// mocks.ts – factory functions
// ---------------------------------------------------------------------------
describe('mocks.ts – mock factories', () => {
  beforeEach(() => {
    resetMockIdCounter()
  })

  it('createMockProject returns a valid Project', () => {
    const p = createMockProject()
    expect(p.id).toBeTruthy()
    expect(p.title).toBe('Test Project')
    expect(p.chapters).toEqual([])
    expect(p.config).toBeDefined()
    expect(p.outline).toBeDefined()
  })

  it('createMockProject accepts overrides', () => {
    const p = createMockProject({ title: 'Custom Title', status: 'writing' })
    expect(p.title).toBe('Custom Title')
    expect(p.status).toBe('writing')
  })

  it('createMockChapter returns a valid Chapter', () => {
    const ch = createMockChapter({ number: 5 })
    expect(ch.number).toBe(5)
    expect(ch.title).toBe('Chapter 5')
    expect(ch.content).toContain('5')
    expect(ch.outline).toBeDefined()
    expect(ch.checkpoints).toEqual([])
  })

  it('createMockChapterOutline returns a valid ChapterOutline', () => {
    const co = createMockChapterOutline()
    expect(co.chapterId).toBeTruthy()
    expect(co.status).toBe('planned')
  })

  it('createMockCheckpoint returns a valid Checkpoint', () => {
    const ck = createMockCheckpoint()
    expect(ck.id).toBeTruthy()
    expect(ck.timestamp).toBeInstanceOf(Date)
  })

  it('createMockOutline returns a valid Outline', () => {
    const o = createMockOutline()
    expect(o.id).toBeTruthy()
    expect(o.synopsis).toBe('A test synopsis')
    expect(o.mainPlot).toBeDefined()
  })

  it('createMockProjectConfig returns a valid ProjectConfig', () => {
    const c = createMockProjectConfig()
    expect(c.preset).toBe('standard')
    expect(c.writerModel).toBe('gpt-4')
    expect(c.enableQualityCheck).toBe(false)
  })

  it('createMockEntity returns a valid Entity', () => {
    const e = createMockEntity({ type: 'FACTION', name: 'Empire' })
    expect(e.type).toBe('FACTION')
    expect(e.name).toBe('Empire')
    expect(e.isArchived).toBe(false)
  })

  it('createMockStateEvent returns a valid StateEvent', () => {
    const ev = createMockStateEvent({ chapterNumber: 3 })
    expect(ev.chapterNumber).toBe(3)
    expect(ev.eventType).toBe('PROPERTY_UPDATE')
    expect(ev.source).toBe('MANUAL')
  })

  it('createMockChapters creates N sequential chapters', () => {
    const chapters = createMockChapters(3, 10)
    expect(chapters).toHaveLength(3)
    expect(chapters[0].number).toBe(10)
    expect(chapters[1].number).toBe(11)
    expect(chapters[2].number).toBe(12)
  })

  it('createMockEntities creates N entities of a type', () => {
    const entities = createMockEntities(4, 'LOCATION')
    expect(entities).toHaveLength(4)
    entities.forEach((e) => expect(e.type).toBe('LOCATION'))
  })

  it('createMockSandboxStore returns a callable mock store', () => {
    const store = createMockSandboxStore()
    expect(store.entities).toEqual([])
    expect(store.loadData).toBeDefined()
    expect(typeof store.loadData).toBe('function')
  })

  it('createMockStorage returns a callable mock storage', () => {
    const storage = createMockStorage()
    expect(storage.loadProject).toBeDefined()
    expect(typeof storage.saveProject).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// helpers.ts – timing and Pinia helpers
// ---------------------------------------------------------------------------
describe('helpers.ts – test helpers', () => {
  it('createTestPinia returns an activated Pinia instance', () => {
    const pinia = createTestPinia()
    expect(pinia).toBeDefined()
    expect(pinia.install).toBeDefined()
  })

  it('flushPromises resolves pending micro-tasks', async () => {
    let resolved = false
    Promise.resolve().then(() => { resolved = true })
    expect(resolved).toBe(false)
    await flushPromises()
    expect(resolved).toBe(true)
  })

  it('waitForNextTick resolves after Vue nextTick', async () => {
    let ticked = false
    Promise.resolve().then(() => { ticked = true })
    await waitForNextTick()
    expect(ticked).toBe(true)
  })

  it('waitFor throws on timeout', async () => {
    await expect(
      waitFor(() => false, { timeout: 50, interval: 10 }),
    ).rejects.toThrow('waitFor: condition not met within 50ms')
  })

  it('waitFor resolves when condition becomes true', async () => {
    let flag = false
    setTimeout(() => { flag = true }, 20)
    await waitFor(() => flag, { timeout: 200 })
    expect(flag).toBe(true)
  })
})
