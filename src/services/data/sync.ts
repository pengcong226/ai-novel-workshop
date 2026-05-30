/**
 * Data Sync Layer
 *
 * Coordinates reads and writes between an `LRUCache` and a `Repository`,
 * supporting two strategies:
 *
 * - **write-through**: every save is immediately persisted to the repository
 *   and the cache is updated in the same call.
 * - **write-behind**: saves update the cache immediately and are batched /
 *   deferred to the repository. Dirty entries are flushed by a debounce
 *   timer or an explicit `flush()` call.
 *
 * @module services/data/sync
 */

import { getLogger } from '@/utils/logger'
import type { Entity, QueryOptions, Repository } from './repository'
import { LRUCache } from './cache'

const logger = getLogger('sync')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncMode = 'write-through' | 'write-behind'

export interface SyncManagerOptions {
  /**
   * Repository to sync with. Must be pre-configured for the target entity
   * type (e.g. via `createRepository('chapter')`).
   */
  repository: Repository<Entity>

  /** Cache capacity. @default 200 */
  cacheCapacity?: number

  /** Default cache TTL in milliseconds. @default undefined (no expiry) */
  cacheTTL?: number

  /**
   * Sync strategy.
   * @default 'write-through'
   */
  mode?: SyncMode

  /**
   * Debounce interval in ms for flushing dirty entries in write-behind mode.
   * Ignored in write-through mode.
   * @default 2000
   */
  flushInterval?: number
}

// ---------------------------------------------------------------------------
// SyncManager
// ---------------------------------------------------------------------------

/**
 * Bidirectional sync coordinator between a cache and a persistence layer.
 *
 * Typical usage:
 * ```ts
 * const sync = new SyncManager({
 *   repository: createRepository('chapter'),
 *   cacheCapacity: 500,
 *   mode: 'write-through',
 * })
 *
 * // Reads go through cache first, falling back to repository
 * const chapter = await sync.get('ch-001')
 *
 * // Writes update both cache and repository (immediately or deferred)
 * await sync.save({ id: 'ch-001', content: '...' })
 * ```
 */
export class SyncManager {
  private readonly cache: LRUCache<string, Entity>
  private readonly repository: Repository<Entity>
  private readonly mode: SyncMode
  private readonly dirtyKeys: Set<string> = new Set()
  private readonly pendingWrites: Map<string, Entity> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly flushInterval: number
  private isFlushing = false

  constructor(options: SyncManagerOptions) {
    this.repository = options.repository
    this.cache = new LRUCache<string, Entity>(
      options.cacheCapacity ?? 200,
      options.cacheTTL,
    )
    this.mode = options.mode ?? 'write-through'
    this.flushInterval = options.flushInterval ?? 2000
  }

  // -- Public API ----------------------------------------------------------

  /**
   * Retrieve an entity by ID.
   *
   * 1. Check cache first (returns immediately on hit).
   * 2. On cache miss, fetch from repository.
   * 3. Populate cache on successful repository read.
   *
   * In write-behind mode, returns the pending (unsaved) value if one exists.
   */
  async get(id: string): Promise<Entity | null> {
    // Check for unsaved writes first (write-behind mode)
    const pending = this.pendingWrites.get(id)
    if (pending) return pending

    // Cache lookup
    const cached = this.cache.get(id)
    if (cached !== undefined) return cached

    // Repository fallback
    const entity = await this.repository.findById(id)
    if (entity !== null) {
      this.cache.set(id, entity)
    }

    return entity
  }

  /**
   * Query all entities matching optional filters.
   * Results are fetched from the repository and cached individually.
   */
  async getAll(options?: QueryOptions<Entity>): Promise<Entity[]> {
    const results = await this.repository.findAll(options)
    // Cache each result for subsequent single-entity lookups
    for (const entity of results) {
      if (!this.cache.has(entity.id)) {
        this.cache.set(entity.id, entity)
      }
    }
    return results
  }

  /**
   * Count entities matching optional filters.
   * Always delegates to the repository (counts are not cached).
   */
  async count(options?: { filters?: QueryOptions['filters'] }): Promise<number> {
    return this.repository.count(options)
  }

  /**
   * Save (create or update) an entity.
   *
   * - **write-through**: persists immediately and updates cache.
   * - **write-behind**: updates cache immediately, marks as dirty,
   *   and schedules a deferred flush.
   */
  async save(entity: Entity): Promise<Entity> {
    if (this.mode === 'write-behind') {
      this.cache.set(entity.id, entity)
      this.dirtyKeys.add(entity.id)
      this.pendingWrites.set(entity.id, entity)
      this.scheduleFlush()
      logger.debug(`Write-behind buffered: ${entity.id}`)
      return entity
    }

    // Write-through
    const existing = await this.repository.findById(entity.id)
    let saved: Entity
    if (existing) {
      saved = await this.repository.update(entity.id, entity)
    } else {
      saved = await this.repository.create(entity)
    }

    this.cache.set(saved.id, saved)
    logger.debug(`Write-through saved: ${saved.id}`)
    return saved
  }

  /**
   * Delete an entity by ID.
   *
   * Removes from cache immediately. In write-behind mode, defers the
   * repository delete until the next flush.
   */
  async delete(id: string): Promise<void> {
    this.cache.delete(id)

    if (this.mode === 'write-behind') {
      // If the entity was pending creation, just remove it from the buffer
      if (this.pendingWrites.has(id)) {
        this.pendingWrites.delete(id)
        this.dirtyKeys.delete(id)
        logger.debug(`Write-behind removed pending: ${id}`)
        return
      }
      // Otherwise mark for deferred deletion
      this.dirtyKeys.add(id)
      this.pendingWrites.set(id, { id, __deleted: true } as Entity)
      this.scheduleFlush()
      logger.debug(`Write-behind buffered delete: ${id}`)
      return
    }

    // Write-through
    await this.repository.delete(id)
    logger.debug(`Write-through deleted: ${id}`)
  }

  /**
   * Explicitly flush all dirty entries in write-behind mode.
   * No-op in write-through mode.
   *
   * @returns Number of entries flushed.
   */
  async flush(): Promise<number> {
    if (this.mode !== 'write-behind' || this.dirtyKeys.size === 0) {
      return 0
    }

    return this.flushDirtyEntries()
  }

  /**
   * Invalidate cache entries matching a predicate.
   * Does not affect the persistence layer.
   */
  invalidate(predicate: (key: string) => boolean): number {
    return this.cache.invalidate(predicate)
  }

  /**
   * Invalidate all cache entries for a given namespace prefix.
   * Common pattern: `sync.invalidatePrefix('ch-')` to clear all chapters.
   */
  invalidatePrefix(prefix: string): number {
    return this.cache.invalidate(key => key.startsWith(prefix))
  }

  /** Clear the entire cache. Does not affect the persistence layer. */
  clearCache(): void {
    this.cache.clear()
  }

  /** Cache performance stats. */
  cacheStats() {
    return this.cache.stats()
  }

  /**
   * Clean up resources.
   * Flushes pending writes and cancels any scheduled flush timer.
   */
  async dispose(): Promise<void> {
    if (this.flushTimer != null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.mode === 'write-behind' && this.dirtyKeys.size > 0) {
      logger.info(`Dispose: flushing ${this.dirtyKeys.size} pending writes`)
      await this.flushDirtyEntries()
    }
  }

  // -- Internals -----------------------------------------------------------

  private scheduleFlush(): void {
    if (this.flushTimer != null) return   // already scheduled

    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null
      if (this.dirtyKeys.size === 0) return

      try {
        await this.flushDirtyEntries()
      } catch (error: unknown) {
        logger.error('Deferred flush failed:', error)
      }
    }, this.flushInterval)
  }

  /**
   * Flush all pending writes to the repository in a single batch.
   *
   * Errors during individual entity saves are logged but do not abort the
   * entire batch; successfully saved entries are removed from the dirty set.
   */
  private async flushDirtyEntries(): Promise<number> {
    if (this.isFlushing) return 0
    this.isFlushing = true

    const keysToFlush = Array.from(this.dirtyKeys)
    let flushed = 0

    try {
      for (const key of keysToFlush) {
        const entity = this.pendingWrites.get(key)
        if (!entity) continue

        try {
          const isDeleted = (entity as Record<string, unknown>).__deleted === true

          if (isDeleted) {
            await this.repository.delete(key)
          } else {
            const existing = await this.repository.findById(key)
            if (existing) {
              await this.repository.update(key, entity)
            } else {
              await this.repository.create(entity)
            }
          }

          this.dirtyKeys.delete(key)
          this.pendingWrites.delete(key)
          flushed++
        } catch (error: unknown) {
          logger.error(`Flush failed for entity ${key}:`, error)
          // Leave in dirty set for retry on next flush
        }
      }
    } finally {
      this.isFlushing = false
    }

    if (flushed > 0) {
      logger.info(`Flushed ${flushed}/${keysToFlush.length} dirty entries to repository`)
    }

    return flushed
  }
}
