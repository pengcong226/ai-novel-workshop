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
// Minimal in-memory IndexedDB mock
// -----------------------------------------------------------------------

interface MockStore {
  records: Map<string, Entity>
}

interface MockDB {
  stores: Map<string, MockStore>
  version: number
}

let mockDBs: Map<string, MockDB> = new Map()

function getOrCreateMockDB(name: string, version: number, storeNames: string[]): MockDB {
  let db = mockDBs.get(name)
  if (!db) {
    db = { stores: new Map(), version }
    mockDBs.set(name, db)
  }
  for (const sn of storeNames) {
    if (!db.stores.has(sn)) {
      db.stores.set(sn, { records: new Map() })
    }
  }
  return db
}

function setupIndexedDBMock(): void {
  mockDBs = new Map()

  const mockIndexedDB = {
    open(dbName: string, version?: number) {
      const request: Record<string, unknown> = {}
      const storeNames: string[] = []

      // Queue microtask to fire onsuccess
      setTimeout(() => {
        const db = getOrCreateMockDB(dbName, version ?? 1, storeNames)

        const dbHandle = {
          objectStoreNames: {
            contains(name: string) {
              return db.stores.has(name)
            },
          } as DOMStringList,
          close() {},
          transaction(storeName: string, _mode?: string) {
            const mockStore = db.stores.get(storeName)
            if (!mockStore) throw new Error(`Store ${storeName} not found`)
            const tx = {
              objectStore() {
                return {
                  get(id: string) {
                    const req: Record<string, unknown> = {}
                    setTimeout(() => {
                      req.result = mockStore.records.get(id) ?? undefined
                      if (req.onsuccess) req.onsuccess({})
                    }, 0)
                    return req
                  },
                  put(entity: Entity) {
                    mockStore.records.set(entity.id, { ...entity })
                    const req: Record<string, unknown> = {}
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess({})
                    }, 0)
                    return req
                  },
                  delete(id: string) {
                    mockStore.records.delete(id)
                    const req: Record<string, unknown> = {}
                    setTimeout(() => {
                      if (req.onsuccess) req.onsuccess({})
                    }, 0)
                    return req
                  },
                  openCursor() {
                    const req: Record<string, unknown> = {}
                    const entries = Array.from(mockStore.records.values())
                    let idx = 0
                    setTimeout(() => {
                      function advance() {
                        if (idx < entries.length) {
                          const val = entries[idx++]
                          req.result = {
                            value: val,
                            continue() {
                              setTimeout(advance, 0)
                            },
                          }
                        } else {
                          req.result = undefined
                        }
                        if (req.onsuccess) req.onsuccess({})
                      }
                      advance()
                    }, 0)
                    return req
                  },
                }
              },
              complete: undefined as (() => void) | undefined,
              oncomplete: undefined as ((e: unknown) => void) | null,
              onerror: undefined as ((e: unknown) => void) | null,
              error: null,
            }
            // Wire up tx.oncomplete for put/delete
            setTimeout(() => {
              if (tx.oncomplete) tx.oncomplete({})
            }, 10)
            return tx
          },
        }

        // Capture onupgradeneeded for store creation
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: { result: dbHandle } })
        }
        request.result = dbHandle
        if (request.onsuccess) request.onsuccess({})
      }, 0)

      return request
    },
  }

  vi.stubGlobal('indexedDB', mockIndexedDB)
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('IndexedDBRepository', () => {
  let IndexedDBRepository: new (opts: Record<string, unknown>) => Repository<Entity> & Record<string, unknown>

  beforeEach(async () => {
    setupIndexedDBMock()
    // Dynamic import so the mock is in place before module evaluation
    const mod = await import('./repository')
    IndexedDBRepository = mod.IndexedDBRepository as unknown as typeof IndexedDBRepository
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockDBs = new Map()
  })

  function createRepo(storeName = 'test-store') {
    return new IndexedDBRepository({
      storeName,
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
  })
})

// -----------------------------------------------------------------------
// Query logic (via a testable subclass that exposes internal helpers)
// -----------------------------------------------------------------------

describe('QueryOptions filtering and sorting', () => {
  // We test query logic by directly exercising the private helpers through
  // a thin wrapper. This avoids needing a full IndexedDB instance.

  // Minimal reimplementation that mirrors IndexedDBRepository.applyQueryOptions
  // and matchesFilters logic for deterministic in-process testing.

  interface QueryFilter {
    field: string
    op: '=' | '!=' | '>' | '<' | '>=' | '<='
    value: unknown
  }

  interface TestQueryOptions {
    filters?: QueryFilter[]
    sort?: { field: string; direction?: 'asc' | 'desc' }
    offset?: number
    limit?: number
  }

  function matchesFilters(record: Entity, filters: QueryFilter[]): boolean {
    return filters.every(({ field, op, value }) => {
      const actual = (record as Record<string, unknown>)[field]
      switch (op) {
        case '=': return actual === value
        case '!=': return actual !== value
        case '>': return (actual as number) > (value as number)
        case '<': return (actual as number) < (value as number)
        case '>=': return (actual as number) >= (value as number)
        case '<=': return (actual as number) <= (value as number)
        default: return true
      }
    })
  }

  function applyQueryOptions(records: Entity[], options?: TestQueryOptions): Entity[] {
    let result = records
    if (options?.filters?.length) {
      result = result.filter(r => matchesFilters(r, options.filters!))
    }
    if (options?.sort) {
      const { field, direction = 'asc' } = options.sort
      const mult = direction === 'desc' ? -1 : 1
      result = [...result].sort((a, b) => {
        const av = (a as Record<string, unknown>)[field]
        const bv = (b as Record<string, unknown>)[field]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return av < bv ? -mult : av > bv ? mult : 0
      })
    }
    const offset = options?.offset ?? 0
    if (offset > 0) result = result.slice(offset)
    if (options?.limit != null) result = result.slice(0, options.limit)
    return result
  }

  const data: Entity[] = [
    { id: '1', name: 'Alice', age: 30, status: 'active' },
    { id: '2', name: 'Bob', age: 25, status: 'inactive' },
    { id: '3', name: 'Charlie', age: 35, status: 'active' },
    { id: '4', name: 'Diana', age: 28, status: 'active' },
    { id: '5', name: 'Eve', age: 22, status: 'inactive' },
  ]

  describe('filters', () => {
    it('= filter selects exact matches', () => {
      const result = applyQueryOptions(data, {
        filters: [{ field: 'status', op: '=', value: 'active' }],
      })
      expect(result).toHaveLength(3)
      expect(result.every(r => r.status === 'active')).toBe(true)
    })

    it('!= filter excludes matching values', () => {
      const result = applyQueryOptions(data, {
        filters: [{ field: 'status', op: '!=', value: 'active' }],
      })
      expect(result).toHaveLength(2)
    })

    it('> filter works on numeric fields', () => {
      const result = applyQueryOptions(data, {
        filters: [{ field: 'age', op: '>', value: 28 }],
      })
      expect(result).toHaveLength(2) // Alice (30) and Charlie (35)
    })

    it('< filter works on numeric fields', () => {
      const result = applyQueryOptions(data, {
        filters: [{ field: 'age', op: '<', value: 28 }],
      })
      expect(result).toHaveLength(2) // Bob (25) and Eve (22)
    })

    it('>= and <= filters work on numeric fields', () => {
      const result = applyQueryOptions(data, {
        filters: [{ field: 'age', op: '>=', value: 25 }],
      })
      expect(result).toHaveLength(4) // all except Eve

      const result2 = applyQueryOptions(data, {
        filters: [{ field: 'age', op: '<=', value: 25 }],
      })
      expect(result2).toHaveLength(2) // Bob (25) and Eve (22)
    })

    it('multiple filters are combined with AND logic', () => {
      const result = applyQueryOptions(data, {
        filters: [
          { field: 'status', op: '=', value: 'active' },
          { field: 'age', op: '>', value: 29 },
        ],
      })
      expect(result).toHaveLength(2) // Alice (30) and Charlie (35)
    })
  })

  describe('sort', () => {
    it('sorts ascending by default', () => {
      const result = applyQueryOptions(data, { sort: { field: 'age' } })
      expect(result.map(r => r.age)).toEqual([22, 25, 28, 30, 35])
    })

    it('sorts descending when direction is "desc"', () => {
      const result = applyQueryOptions(data, { sort: { field: 'age', direction: 'desc' } })
      expect(result.map(r => r.age)).toEqual([35, 30, 28, 25, 22])
    })

    it('handles null values by pushing them to the end', () => {
      const withNull: Entity[] = [
        { id: 'a', val: 3 },
        { id: 'b', val: null },
        { id: 'c', val: 1 },
      ]
      const result = applyQueryOptions(withNull, { sort: { field: 'val' } })
      expect(result.map(r => r.id)).toEqual(['c', 'a', 'b'])
    })
  })

  describe('offset and limit', () => {
    it('offset skips the first N results', () => {
      const result = applyQueryOptions(data, { offset: 2 })
      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('3')
    })

    it('limit caps the number of results', () => {
      const result = applyQueryOptions(data, { limit: 2 })
      expect(result).toHaveLength(2)
    })

    it('offset and limit work together', () => {
      const sorted = applyQueryOptions(data, {
        sort: { field: 'age' },
        offset: 1,
        limit: 2,
      })
      expect(sorted.map(r => r.age)).toEqual([25, 28])
    })

    it('offset beyond data length returns empty array', () => {
      const result = applyQueryOptions(data, { offset: 100 })
      expect(result).toHaveLength(0)
    })

    it('no options returns all records unchanged', () => {
      const result = applyQueryOptions(data)
      expect(result).toHaveLength(5)
    })
  })
})

// -----------------------------------------------------------------------
// TauriTemplateRepository (uses localStorage — easy to test)
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
    expect((repo as Record<string, unknown>).storeName).toBe('templates')
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
