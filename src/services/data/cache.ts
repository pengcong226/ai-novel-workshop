/**
 * LRU Cache Layer
 *
 * Provides a generic, bounded Least-Recently-Used cache with per-entry
 * TTL support. Intended for wrapping frequently accessed entities
 * (projects, chapters) to avoid repeated persistence round-trips.
 *
 * @module services/data/cache
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('cache')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Statistics snapshot for observability. */
export interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
  capacity: number
  hitRate: number
}

interface CacheEntry<V> {
  value: V
  expiresAt: number | null   // null = no TTL, lives until eviction
  lastAccessed: number
}

// ---------------------------------------------------------------------------
// LRUCache
// ---------------------------------------------------------------------------

/**
 * Generic LRU cache with bounded capacity and optional per-entry TTL.
 *
 * - Capacity is enforced via LRU eviction (oldest-accessed entry removed first).
 * - TTL is checked on `get()`; expired entries are lazily evicted.
 * - All methods are synchronous and suitable for use inside reactive
 *   Vue/Pinia getters.
 */
export class LRUCache<K, V> {
  private readonly map = new Map<K, CacheEntry<V>>()
  private readonly capacity: number
  private readonly defaultTTL: number | null  // ms, null = no expiry

  // Stats counters
  private hits = 0
  private misses = 0
  private evictions = 0

  /**
   * @param capacity  Maximum number of entries. Must be >= 1.
   * @param defaultTTL  Default time-to-live in milliseconds.
   *                    Pass `null` or `0` for no expiry.
   */
  constructor(capacity: number, defaultTTL?: number | null) {
    if (capacity < 1) throw new Error('Cache capacity must be >= 1')
    this.capacity = capacity
    this.defaultTTL = defaultTTL && defaultTTL > 0 ? defaultTTL : null
  }

  // -- Public API ----------------------------------------------------------

  /** Current number of live entries (includes expired-but-not-yet-evicted). */
  get size(): number {
    return this.map.size
  }

  /**
   * Retrieve a cached value. Returns `undefined` on miss or TTL expiry.
   * Promotes the entry to most-recently-used on hit.
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }

    // Lazy TTL check
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      this.misses++
      logger.debug(`TTL expired for key: ${String(key)}`)
      return undefined
    }

    // Promote to most-recently-used
    entry.lastAccessed = Date.now()
    this.map.delete(key)
    this.map.set(key, entry)

    this.hits++
    return entry.value
  }

  /**
   * Store a value in the cache.
   *
   * If the key already exists it is updated (and promoted).
   * If the cache is full the least-recently-used entry is evicted first.
   *
   * @param key     Cache key.
   * @param value   Value to cache.
   * @param ttlMs   Optional per-entry TTL override in milliseconds.
   */
  set(key: K, value: V, ttlMs?: number): void {
    // If updating an existing key, delete first so re-insertion
    // maintains insertion order (most-recently-used).
    if (this.map.has(key)) {
      this.map.delete(key)
    }

    // Evict LRU entries until there is room
    while (this.map.size >= this.capacity) {
      this.evictLRU()
    }

    const effectiveTTL = ttlMs != null && ttlMs > 0 ? ttlMs : this.defaultTTL

    const entry: CacheEntry<V> = {
      value,
      expiresAt: effectiveTTL != null ? Date.now() + effectiveTTL : null,
      lastAccessed: Date.now(),
    }

    this.map.set(key, entry)
    logger.debug(`Cache set: ${String(key)} (size=${this.map.size}/${this.capacity})`)
  }

  /**
   * Remove a specific entry from the cache.
   * Returns `true` if the key existed, `false` otherwise.
   */
  delete(key: K): boolean {
    const existed = this.map.has(key)
    this.map.delete(key)
    if (existed) {
      logger.debug(`Cache delete: ${String(key)}`)
    }
    return existed
  }

  /** Check whether a (non-expired) entry exists for the given key. */
  has(key: K): boolean {
    const entry = this.map.get(key)
    if (!entry) return false

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return false
    }

    return true
  }

  /** Remove all entries and reset stats. */
  clear(): void {
    this.map.clear()
    this.hits = 0
    this.misses = 0
    this.evictions = 0
  }

  /**
   * Remove all entries whose key passes the predicate.
   * Useful for namespace-scoped invalidation (e.g. all chapters of a project).
   *
   * @returns Number of entries removed.
   */
  invalidate(predicate: (key: K) => boolean): number {
    let removed = 0
    for (const key of Array.from(this.map.keys())) {
      if (predicate(key)) {
        this.map.delete(key)
        removed++
      }
    }
    if (removed > 0) {
      logger.debug(`Cache invalidated ${removed} entries`)
    }
    return removed
  }

  /**
   * Evict all expired entries proactively.
   * Useful as a periodic cleanup hook; not required for correctness
   * since `get()` checks TTL lazily.
   */
  purgeExpired(): number {
    const now = Date.now()
    let purged = 0
    for (const [key, entry] of Array.from(this.map.entries())) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.map.delete(key)
        purged++
      }
    }
    if (purged > 0) {
      logger.debug(`Purged ${purged} expired cache entries`)
    }
    return purged
  }

  /**
   * Return a snapshot of cache performance metrics.
   * Counters are cumulative since the last `clear()`.
   */
  stats(): CacheStats {
    const total = this.hits + this.misses
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.map.size,
      capacity: this.capacity,
      hitRate: total > 0 ? this.hits / total : 0,
    }
  }

  /**
   * Iterate over live (non-expired) entries in MRU order.
   * Does not promote iterated entries.
   */
  *entries(): IterableIterator<[K, V]> {
    const now = Date.now()
    for (const [key, entry] of this.map) {
      if (entry.expiresAt !== null && now > entry.expiresAt) continue
      yield [key, entry.value]
    }
  }

  // -- Internals -----------------------------------------------------------

  /** Evict the least-recently-used entry (first entry in the Map). */
  private evictLRU(): void {
    const firstKey = this.map.keys().next().value
    if (firstKey !== undefined) {
      this.map.delete(firstKey)
      this.evictions++
      logger.debug(`LRU evicted: ${String(firstKey)}`)
    }
  }
}
