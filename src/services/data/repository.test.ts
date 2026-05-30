import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type { Entity, Repository } from './repository'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// -----------------------------------------------------------------------
// IndexedDBRepository tests (using fake-indexeddb polyfill)
// -----------------------------------------------------------------------

describe('IndexedDBRepository', () => {
  let IndexedDBRepository: new (opts: Record<string, unknown>) => Repository<Entity> & Record<string, unknown>
  let dbCounter = 0

  beforeEach(async () => {
    // Install fake-indexeddb polyfill (overrides globalThis.indexedDB)
    // @ts-ignore - fake-indexeddb has no type declarations
    await import('fake-indexeddb/auto')

    const mod = await import('./repository')
    IndexedDBRepository = mod.IndexedDBRepository as unknown as typeof IndexedDBRepository
    dbCounter++
  })

  function createRepo(storeName = `test-store-${dbCounter}`) {
    return new IndexedDBRepository({
      storeName,
      dbName: `test-db-${dbCounter}-${Math.random().toString(36).slice(2)}`,
      dbVersion: 1,
      requiredStores: [storeName],
    })
  }

  // -----------------------------------------------------------------
  // Basic CRUD
  // -----------------------------------------------------------------

  describe('CRUD', () => {
    it('create stores an entity and findById retrieves it', async () => {
      const repo = createRepo()
      const entity = { id: 'e1', name: 'test' }
      await repo.create(entity)

      const found = await repo.findById('e1')
      expect(found).not.toBeNull()
      expect(found!.id).toBe('e1')
      expect(found!.name).toBe('test')
    })

    it('create throws if entity with same id already exists', async () => {
      const repo = createRepo()
      await repo.create({ id: 'dup', v: 1 })
      await expect(repo.create({ id: 'dup', v: 2 })).rejects.toThrow(/already exists/)
    })

    it('findById returns null for missing entity', async () => {
      const repo = createRepo()
      const result = await repo.findById('missing')
      expect(result).toBeNull()
    })

    it('update merges partial fields into existing entity', async () => {
      const repo = createRepo()
      await repo.create({ id: 'u1', a: 1, b: 'old' })
      const updated = await repo.update('u1', { b: 'new', c: true })

      expect(updated.id).toBe('u1')
      expect(updated.b).toBe('new')
      expect(updated.c).toBe(true)
      expect(updated.a).toBe(1)
    })

    it('update throws if entity does not exist', async () => {
      const repo = createRepo()
      await expect(repo.update('nope', { x: 1 })).rejects.toThrow(/not found/)
    })

    it('delete removes the entity', async () => {
      const repo = createRepo()
      await repo.create({ id: 'd1' })
      await repo.delete('d1')
      expect(await repo.findById('d1')).toBeNull()
    })

    it('findAll returns all stored entities', async () => {
      const repo = createRepo()
      await repo.create({ id: 'a', n: 1 })
      await repo.create({ id: 'b', n: 2 })
      await repo.create({ id: 'c', n: 3 })

      const all = await repo.findAll()
      expect(all).toHaveLength(3)
    })

    it('count returns the correct number of entities', async () => {
      const repo = createRepo()
      await repo.create({ id: 'x' })
      await repo.create({ id: 'y' })
      expect(await repo.count()).toBe(2)
    })

    it('findAll with filters returns matching entities', async () => {
      const repo = createRepo()
      await repo.create({ id: 'a', status: 'active' })
      await repo.create({ id: 'b', status: 'inactive' })
      await repo.create({ id: 'c', status: 'active' })

      const active = await repo.findAll({
        filters: [{ field: 'status', op: '=', value: 'active' }],
      })
      expect(active).toHaveLength(2)
    })

    it('findAll with sort returns entities in order', async () => {
      const repo = createRepo()
      await repo.create({ id: 'a', age: 30 })
      await repo.create({ id: 'b', age: 20 })
      await repo.create({ id: 'c', age: 25 })

      const sorted = await repo.findAll({ sort: { field: 'age' } })
      expect(sorted.map(r => r.age)).toEqual([20, 25, 30])
    })

    it('findAll with limit returns capped results', async () => {
      const repo = createRepo()
      await repo.create({ id: 'a' })
      await repo.create({ id: 'b' })
      await repo.create({ id: 'c' })

      const limited = await repo.findAll({ limit: 2 })
      expect(limited).toHaveLength(2)
    })

    it('count with filters returns filtered count', async () => {
      const repo = createRepo()
      await repo.create({ id: 'a', active: true })
      await repo.create({ id: 'b', active: false })
      await repo.create({ id: 'c', active: true })

      const count = await repo.count({
        filters: [{ field: 'active', op: '=', value: true }],
      })
      expect(count).toBe(2)
    })
  })
})

// -----------------------------------------------------------------------
// TauriTemplateRepository (uses localStorage -- easy to test)
// -----------------------------------------------------------------------

describe('TauriTemplateRepository', () => {
  let TauriTemplateRepository: new () => Repository<Entity>
  let storage: Map<string, string>

  beforeEach(async () => {
    storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
      get length() { return storage.size },
      key: (i: number) => Array.from(storage.keys())[i] ?? null,
    })

    const mod = await import('./repository')
    TauriTemplateRepository = mod.TauriTemplateRepository as unknown as typeof TauriTemplateRepository
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('create stores template in localStorage', async () => {
    const repo = new TauriTemplateRepository()
    const tpl = { id: 't1', title: 'My Template' }
    const created = await repo.create(tpl)

    expect(created.id).toBe('t1')
    const raw = JSON.parse(storage.get('ai-novel-templates')!)
    expect(raw).toHaveLength(1)
    expect(raw[0].title).toBe('My Template')
  })

  it('create throws on duplicate id', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: 'dup', v: 1 })
    await expect(repo.create({ id: 'dup', v: 2 })).rejects.toThrow(/already exists/)
  })

  it('findById returns the matching template', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: 'a', name: 'Alpha' })
    await repo.create({ id: 'b', name: 'Beta' })

    const found = await repo.findById('b')
    expect(found).not.toBeNull()
    expect(found!.name).toBe('Beta')
  })

  it('findById returns null for missing id', async () => {
    const repo = new TauriTemplateRepository()
    expect(await repo.findById('nope')).toBeNull()
  })

  it('findAll returns all templates', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: '1' })
    await repo.create({ id: '2' })
    await repo.create({ id: '3' })

    const all = await repo.findAll()
    expect(all).toHaveLength(3)
  })

  it('count returns the number of templates', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: 'x' })
    await repo.create({ id: 'y' })
    expect(await repo.count()).toBe(2)
  })

  it('update merges partial fields into existing template', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: 'u1', title: 'old', extra: 'keep' })

    const updated = await repo.update('u1', { title: 'new' })
    expect(updated.title).toBe('new')
    expect(updated.extra).toBe('keep')
  })

  it('update throws if template not found', async () => {
    const repo = new TauriTemplateRepository()
    await expect(repo.update('missing', { x: 1 })).rejects.toThrow(/not found/)
  })

  it('delete removes the template', async () => {
    const repo = new TauriTemplateRepository()
    await repo.create({ id: 'd1' })
    await repo.create({ id: 'd2' })

    await repo.delete('d1')
    const all = await repo.findAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('d2')
  })

  it('handles corrupt localStorage data gracefully', async () => {
    storage.set('ai-novel-templates', 'NOT-VALID-JSON{{{')
    const repo = new TauriTemplateRepository()
    const all = await repo.findAll()
    expect(all).toEqual([])
  })
})

// -----------------------------------------------------------------------
// createRepository factory
// -----------------------------------------------------------------------

describe('createRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns IndexedDBRepository in web mode', async () => {
    const { isWebRuntime } = await import('@/utils/anthropic-guard')
    vi.mocked(isWebRuntime).mockReturnValue(true)

    const { createRepository } = await import('./repository')
    const repo = createRepository('template')

    // IndexedDBRepository instances have dbName / storeName properties
    expect((repo as unknown as Record<string, unknown>).storeName).toBe('templates')
  })

  it('returns TauriProjectRepository in Tauri mode for project type', async () => {
    const { isWebRuntime } = await import('@/utils/anthropic-guard')
    vi.mocked(isWebRuntime).mockReturnValue(false)

    const { createRepository, TauriProjectRepository } = await import('./repository')
    const repo = createRepository('project')
    expect(repo).toBeInstanceOf(TauriProjectRepository)
  })

  it('returns TauriChapterRepository in Tauri mode for chapter type', async () => {
    const { isWebRuntime } = await import('@/utils/anthropic-guard')
    vi.mocked(isWebRuntime).mockReturnValue(false)

    const { createRepository, TauriChapterRepository } = await import('./repository')
    const repo = createRepository('chapter')
    expect(repo).toBeInstanceOf(TauriChapterRepository)
  })

  it('returns TauriSnapshotRepository in Tauri mode for snapshot type', async () => {
    const { isWebRuntime } = await import('@/utils/anthropic-guard')
    vi.mocked(isWebRuntime).mockReturnValue(false)

    const { createRepository, TauriSnapshotRepository } = await import('./repository')
    const repo = createRepository('snapshot')
    expect(repo).toBeInstanceOf(TauriSnapshotRepository)
  })

  it('returns TauriTemplateRepository in Tauri mode for template type', async () => {
    const { isWebRuntime } = await import('@/utils/anthropic-guard')
    vi.mocked(isWebRuntime).mockReturnValue(false)

    const { createRepository, TauriTemplateRepository } = await import('./repository')
    const repo = createRepository('template')
    expect(repo).toBeInstanceOf(TauriTemplateRepository)
  })
})
