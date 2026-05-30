import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SyncManager } from './sync'
import type { Entity, Repository, QueryOptions } from './repository'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** In-memory mock repository satisfying the Repository<Entity> interface. */
function createMockRepository(): Repository<Entity> & { store: Map<string, Entity> } {
  const store = new Map<string, Entity>()

  return {
    store,
    async findById(id: string) {
      return store.get(id) ?? null
    },
    async findAll(_options?: QueryOptions<Entity>) {
      return Array.from(store.values())
    },
    async count() {
      return store.size
    },
    async create(entity: Entity) {
      if (store.has(entity.id)) throw new Error(`Duplicate: ${entity.id}`)
      store.set(entity.id, { ...entity })
      return entity
    },
    async update(id: string, partial: Partial<Omit<Entity, 'id'>>) {
      const existing = store.get(id)
      if (!existing) throw new Error(`Not found: ${id}`)
      const updated = { ...existing, ...partial, id }
      store.set(id, updated)
      return updated
    },
    async delete(id: string) {
      store.delete(id)
    },
  }
}

function makeEntity(id: string, extra: Record<string, unknown> = {}): Entity {
  return { id, ...extra }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('SyncManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------
  // Write-through mode
  // -----------------------------------------------------------------

  describe('write-through mode', () => {
    let repo: ReturnType<typeof createMockRepository>
    let sync: SyncManager

    beforeEach(() => {
      repo = createMockRepository()
      sync = new SyncManager({ repository: repo, mode: 'write-through' })
    })

    it('saves entity to both repository and cache', async () => {
      const entity = makeEntity('e1', { name: 'Test' })
      const saved = await sync.save(entity)

      expect(saved.id).toBe('e1')
      expect(repo.store.has('e1')).toBe(true)
    })

    it('get returns entity from cache after save (no repo call)', async () => {
      const entity = makeEntity('e1', { val: 42 })
      await sync.save(entity)

      // Remove from repo to prove cache is serving the read
      repo.store.delete('e1')
      const result = await sync.get('e1')
      expect(result).not.toBeNull()
      expect(result!.val).toBe(42)
    })

    it('get falls back to repository on cache miss', async () => {
      repo.store.set('r1', makeEntity('r1', { from: 'repo' }))
      const result = await sync.get('r1')
      expect(result).not.toBeNull()
      expect(result!.from).toBe('repo')
    })

    it('get returns null when entity does not exist anywhere', async () => {
      const result = await sync.get('nonexistent')
      expect(result).toBeNull()
    })

    it('delete removes from both cache and repository', async () => {
      const entity = makeEntity('d1')
      await sync.save(entity)
      await sync.delete('d1')

      expect(repo.store.has('d1')).toBe(false)
      expect(await sync.get('d1')).toBeNull()
    })

    it('update replaces entity in repository', async () => {
      await sync.save(makeEntity('u1', { v: 1 }))
      await sync.save(makeEntity('u1', { v: 2 }))

      expect(repo.store.get('u1')!.v).toBe(2)
    })

    it('flush is a no-op in write-through mode', async () => {
      await sync.save(makeEntity('f1'))
      const flushed = await sync.flush()
      expect(flushed).toBe(0)
    })
  })

  // -----------------------------------------------------------------
  // Write-behind mode
  // -----------------------------------------------------------------

  describe('write-behind mode', () => {
    let repo: ReturnType<typeof createMockRepository>
    let sync: SyncManager

    beforeEach(() => {
      repo = createMockRepository()
      sync = new SyncManager({
        repository: repo,
        mode: 'write-behind',
        flushInterval: 5000,
      })
    })

    it('save buffers the write without touching the repository immediately', async () => {
      await sync.save(makeEntity('wb1', { v: 1 }))

      // Repository should NOT have the entity yet
      expect(repo.store.has('wb1')).toBe(false)

      // But get() should return it from pending writes
      const result = await sync.get('wb1')
      expect(result).not.toBeNull()
      expect(result!.v).toBe(1)
    })

    it('flush persists all dirty entries to the repository', async () => {
      await sync.save(makeEntity('wb1'))
      await sync.save(makeEntity('wb2'))

      const flushed = await sync.flush()
      expect(flushed).toBe(2)
      expect(repo.store.has('wb1')).toBe(true)
      expect(repo.store.has('wb2')).toBe(true)
    })

    it('delete of a pending-create entry removes it from buffer without repo call', async () => {
      await sync.save(makeEntity('wb-del'))
      await sync.delete('wb-del')

      const flushed = await sync.flush()
      expect(flushed).toBe(0)
      expect(repo.store.has('wb-del')).toBe(false)
    })

    it('delete of a repo-persisted entity defers the delete until flush', async () => {
      repo.store.set('old', makeEntity('old'))

      // Direct delete (entity exists in repo, not in pending writes)
      await sync.delete('old')

      // Still in repo until flush
      expect(repo.store.has('old')).toBe(true)

      await sync.flush()
      expect(repo.store.has('old')).toBe(false)
    })

    it('deferred flush via timer fires after flushInterval', async () => {
      await sync.save(makeEntity('timer1'))

      // Advance past flush interval
      vi.advanceTimersByTime(5001)

      // Let the microtask queue run
      await vi.runAllTimersAsync()

      expect(repo.store.has('timer1')).toBe(true)
    })

    it('dispose flushes pending writes', async () => {
      await sync.save(makeEntity('disp1'))
      await sync.save(makeEntity('disp2'))

      await sync.dispose()
      expect(repo.store.has('disp1')).toBe(true)
      expect(repo.store.has('disp2')).toBe(true)
    })
  })

  // -----------------------------------------------------------------
  // getAll / count
  // -----------------------------------------------------------------

  describe('getAll and count', () => {
    it('getAll fetches from repository and caches each result', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo, mode: 'write-through' })

      repo.store.set('a', makeEntity('a', { n: 1 }))
      repo.store.set('b', makeEntity('b', { n: 2 }))

      const all = await sync.getAll()
      expect(all).toHaveLength(2)

      // Now remove from repo; cache should still serve individual gets
      repo.store.clear()
      expect(await sync.get('a')).not.toBeNull()
    })

    it('count delegates to the repository', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      repo.store.set('x', makeEntity('x'))
      expect(await sync.count()).toBe(1)
    })
  })

  // -----------------------------------------------------------------
  // Cache-level operations
  // -----------------------------------------------------------------

  describe('cache operations', () => {
    it('invalidate removes matching cache entries', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      await sync.save(makeEntity('ch:1'))
      await sync.save(makeEntity('ch:2'))
      await sync.save(makeEntity('proj:1'))

      const removed = sync.invalidate(key => key.startsWith('ch:'))
      expect(removed).toBe(2)
    })

    it('invalidatePrefix removes entries by prefix', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      await sync.save(makeEntity('ch-001'))
      await sync.save(makeEntity('ch-002'))
      await sync.save(makeEntity('proj-001'))

      const removed = sync.invalidatePrefix('ch-')
      expect(removed).toBe(2)

      // proj-001 should still be cached
      const stats = sync.cacheStats()
      expect(stats.size).toBe(1)
    })

    it('clearCache empties the cache without affecting the repository', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      await sync.save(makeEntity('c1'))
      sync.clearCache()

      const stats = sync.cacheStats()
      expect(stats.size).toBe(0)
      expect(repo.store.has('c1')).toBe(true)
    })

    it('cacheStats reports hit/miss counts', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      await sync.save(makeEntity('s1'))
      await sync.get('s1') // cache hit
      await sync.get('nope') // miss -> repo miss

      const stats = sync.cacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBeGreaterThanOrEqual(1)
    })
  })

  // -----------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------

  describe('edge cases', () => {
    it('defaults to write-through mode when mode is not specified', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      await sync.save(makeEntity('def1'))
      // Should have persisted immediately
      expect(repo.store.has('def1')).toBe(true)
    })

    it('uses default cache capacity of 200', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo })

      const stats = sync.cacheStats()
      expect(stats.capacity).toBe(200)
    })

    it('constructor respects custom cacheCapacity', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({ repository: repo, cacheCapacity: 10 })

      const stats = sync.cacheStats()
      expect(stats.capacity).toBe(10)
    })

    it('concurrent flush guard prevents overlapping flushes', async () => {
      const repo = createMockRepository()
      const sync = new SyncManager({
        repository: repo,
        mode: 'write-behind',
        flushInterval: 1000,
      })

      await sync.save(makeEntity('g1'))
      await sync.save(makeEntity('g2'))

      // Start two flushes concurrently
      const [r1, r2] = await Promise.all([sync.flush(), sync.flush()])

      // One should flush, the other should be a no-op (return 0)
      expect(r1 + r2).toBe(2)
      expect(repo.store.has('g1')).toBe(true)
      expect(repo.store.has('g2')).toBe(true)
    })
  })
})
