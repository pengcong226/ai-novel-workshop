import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LRUCache } from './cache'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe('LRUCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------

  describe('constructor', () => {
    it('throws when capacity < 1', () => {
      expect(() => new LRUCache(0)).toThrow('Cache capacity must be >= 1')
      expect(() => new LRUCache(-5)).toThrow('Cache capacity must be >= 1')
    })

    it('accepts capacity >= 1', () => {
      expect(() => new LRUCache(1)).not.toThrow()
      expect(() => new LRUCache(100)).not.toThrow()
    })

    it('treats 0 or null defaultTTL as no-expiry', () => {
      const cache = new LRUCache<string, number>(5, 0)
      cache.set('a', 1)
      vi.advanceTimersByTime(1_000_000)
      expect(cache.get('a')).toBe(1)
    })
  })

  // -------------------------------------------------------------------
  // Basic get / set
  // -------------------------------------------------------------------

  describe('get and set', () => {
    let cache: LRUCache<string, string>

    beforeEach(() => {
      cache = new LRUCache<string, string>(3)
    })

    it('returns undefined for a missing key (cache miss)', () => {
      expect(cache.get('missing')).toBeUndefined()
    })

    it('stores and retrieves a value (cache hit)', () => {
      cache.set('k', 'v')
      expect(cache.get('k')).toBe('v')
    })

    it('overwrites an existing key without growing size', () => {
      cache.set('k', 'first')
      cache.set('k', 'second')
      expect(cache.get('k')).toBe('second')
      expect(cache.size).toBe(1)
    })

    it('reports correct size', () => {
      expect(cache.size).toBe(0)
      cache.set('a', '1')
      cache.set('b', '2')
      expect(cache.size).toBe(2)
    })
  })

  // -------------------------------------------------------------------
  // LRU eviction
  // -------------------------------------------------------------------

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry when capacity is reached', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)

      // Cache is full; inserting 'd' should evict 'a'
      cache.set('d', 4)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })

    it('promotes accessed entries so they are not evicted next', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)

      // Access 'a' to promote it
      cache.get('a')

      // Inserting 'd' should now evict 'b' (least recently used)
      cache.set('d', 4)
      expect(cache.get('a')).toBe(1) // promoted
      expect(cache.get('b')).toBeUndefined() // evicted
    })

    it('evicts multiple entries when inserting into a near-full cache after deletes', () => {
      const cache = new LRUCache<string, number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.delete('a')
      cache.set('c', 3)
      cache.set('d', 4) // should evict 'b'
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })
  })

  // -------------------------------------------------------------------
  // TTL
  // -------------------------------------------------------------------

  describe('TTL', () => {
    it('lazily evicts expired entries on get()', () => {
      const cache = new LRUCache<string, string>(10, 1000) // 1 second TTL
      cache.set('expiring', 'value')
      expect(cache.get('expiring')).toBe('value')

      vi.advanceTimersByTime(1001)
      expect(cache.get('expiring')).toBeUndefined()
    })

    it('uses per-entry TTL override over default TTL', () => {
      const cache = new LRUCache<string, string>(10, 10_000) // 10s default
      cache.set('short', 'val', 500) // override 500ms

      vi.advanceTimersByTime(600)
      expect(cache.get('short')).toBeUndefined()
    })

    it('entries without TTL do not expire', () => {
      const cache = new LRUCache<string, string>(5) // no default TTL
      cache.set('forever', 'val')
      vi.advanceTimersByTime(1_000_000)
      expect(cache.get('forever')).toBe('val')
    })

    it('has() returns false for expired entries', () => {
      const cache = new LRUCache<string, string>(5, 100)
      cache.set('k', 'v')
      expect(cache.has('k')).toBe(true)
      vi.advanceTimersByTime(101)
      expect(cache.has('k')).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // delete / has
  // -------------------------------------------------------------------

  describe('delete and has', () => {
    it('delete returns true when key existed', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      expect(cache.delete('a')).toBe(true)
      expect(cache.get('a')).toBeUndefined()
    })

    it('delete returns false when key did not exist', () => {
      const cache = new LRUCache<string, number>(5)
      expect(cache.delete('nope')).toBe(false)
    })

    it('has returns true for present non-expired key', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('k', 42)
      expect(cache.has('k')).toBe(true)
    })

    it('has returns false for missing key', () => {
      const cache = new LRUCache<string, number>(5)
      expect(cache.has('missing')).toBe(false)
    })
  })

  // -------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------

  describe('clear', () => {
    it('removes all entries and resets stats', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.get('a') // hit
      cache.get('x') // miss

      cache.clear()

      expect(cache.size).toBe(0)
      const stats = cache.stats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.evictions).toBe(0)
    })
  })

  // -------------------------------------------------------------------
  // invalidate
  // -------------------------------------------------------------------

  describe('invalidate', () => {
    it('removes entries matching the predicate', () => {
      const cache = new LRUCache<string, number>(10)
      cache.set('ch:1:a', 1)
      cache.set('ch:2:b', 2)
      cache.set('proj:1', 99)

      const removed = cache.invalidate(key => key.startsWith('ch:'))
      expect(removed).toBe(2)
      expect(cache.get('ch:1:a')).toBeUndefined()
      expect(cache.get('proj:1')).toBe(99)
    })

    it('returns 0 when nothing matches', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      expect(cache.invalidate(() => false)).toBe(0)
    })
  })

  // -------------------------------------------------------------------
  // purgeExpired
  // -------------------------------------------------------------------

  describe('purgeExpired', () => {
    it('proactively removes all expired entries', () => {
      const cache = new LRUCache<string, number>(10, 500)
      cache.set('a', 1)
      cache.set('b', 2)

      vi.advanceTimersByTime(600)

      // Add a non-expired entry via per-entry override
      cache.set('c', 3, 10_000)

      const purged = cache.purgeExpired()
      expect(purged).toBe(2)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(3)
    })

    it('returns 0 when nothing is expired', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      expect(cache.purgeExpired()).toBe(0)
    })
  })

  // -------------------------------------------------------------------
  // stats
  // -------------------------------------------------------------------

  describe('stats', () => {
    it('tracks hits, misses, and hitRate correctly', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      cache.get('a') // hit
      cache.get('a') // hit
      cache.get('b') // miss

      const stats = cache.stats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(2 / 3)
      expect(stats.size).toBe(1)
      expect(stats.capacity).toBe(5)
    })

    it('returns 0 hitRate when no operations have occurred', () => {
      const cache = new LRUCache<string, number>(5)
      expect(cache.stats().hitRate).toBe(0)
    })

    it('counts evictions', () => {
      const cache = new LRUCache<string, number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3) // evicts 'a'
      expect(cache.stats().evictions).toBe(1)
    })
  })

  // -------------------------------------------------------------------
  // entries iterator
  // -------------------------------------------------------------------

  describe('entries', () => {
    it('yields live (non-expired) entries in MRU order', () => {
      const cache = new LRUCache<string, number>(5)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3)

      const entries = Array.from(cache.entries())
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ])
    })

    it('skips expired entries', () => {
      const cache = new LRUCache<string, number>(5, 500)
      cache.set('expired', 1)
      cache.set('alive', 2, 10_000)

      vi.advanceTimersByTime(600)

      const entries = Array.from(cache.entries())
      expect(entries).toEqual([['alive', 2]])
    })
  })
})
