/**
 * Unified Data Access Layer
 *
 * Re-exports the repository, cache, and sync primitives.
 *
 * @module services/data
 */

// Repository
export type {
  Entity,
  Repository,
  QueryOptions,
  QueryFilter,
  EntityType,
} from './repository'
export {
  IndexedDBRepository,
  TauriProjectRepository,
  TauriChapterRepository,
  TauriSnapshotRepository,
  TauriTemplateRepository,
  createRepository,
} from './repository'

// Cache
export { LRUCache } from './cache'
export type { CacheStats } from './cache'

// Sync
export { SyncManager } from './sync'
export type { SyncMode, SyncManagerOptions } from './sync'
