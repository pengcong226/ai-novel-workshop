/**
 * Generic Repository Pattern - Unified Data Access Layer
 *
 * Provides a `Repository<T>` interface with CRUD operations, plus
 * `IndexedDBRepository<T>` (browser) and Tauri-specific implementations
 * (desktop). Runtime detection selects the correct backend automatically.
 *
 * @module services/data/repository
 */

import { getLogger } from '@/utils/logger'
import { isWebRuntime } from '@/utils/anthropic-guard'

const logger = getLogger('repository')

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Query filter predicate */
export interface QueryFilter {
  field: string
  op: '=' | '!=' | '>' | '<' | '>=' | '<='
  value: unknown
}

/** Options for findAll queries */
export interface QueryOptions<T = Record<string, unknown>> {
  filters?: QueryFilter[]
  sort?: { field: keyof T & string; direction?: 'asc' | 'desc' }
  offset?: number
  limit?: number
}

/**
 * Generic synchronous-keyed entity.
 * Every persisted record must carry a string `id`.
 */
export interface Entity {
  id: string
  [key: string]: unknown
}

/**
 * Generic repository interface.
 *
 * All implementations must support the full CRUD surface plus basic
 * querying. Backend-specific extras (indexes, aggregate queries) are
 * exposed on concrete classes, not on this interface.
 */
export interface Repository<T extends Entity> {
  findById(id: string): Promise<T | null>
  findAll(options?: QueryOptions<T>): Promise<T[]>
  count(options?: Pick<QueryOptions<T>, 'filters'>): Promise<number>
  create(entity: T): Promise<T>
  update(id: string, partial: Partial<Omit<T, 'id'>>): Promise<T>
  delete(id: string): Promise<void>
}

// ---------------------------------------------------------------------------
// IndexedDB Implementation
// ---------------------------------------------------------------------------

export interface IndexedDBRepositoryOptions {
  /** IndexedDB database name */
  dbName?: string
  /** IndexedDB version (increment to trigger onupgradeneeded) */
  dbVersion?: number
  /** Object store name */
  storeName: string
  /**
   * Additional stores that must exist before the repository can operate.
   * Used by Tauri-specific subclasses that share a single DB instance.
   */
  requiredStores?: string[]
  /**
   * Index definitions applied during store creation.
   * Each entry is `[indexName, keyPath, unique?]`.
   */
  indexes?: Array<[string, string, boolean?]>
}

/**
 * Generic IndexedDB-backed repository.
 *
 * Opening the database is lazy — `init()` is called automatically on the
 * first operation that needs the handle.
 */
export class IndexedDBRepository<T extends Entity> implements Repository<T> {
  private db: IDBDatabase | null = null
  protected readonly dbName: string
  protected readonly dbVersion: number
  protected readonly storeName: string
  private readonly requiredStores: string[]
  private readonly indexDefs: Array<[string, string, boolean?]>

  constructor(options: IndexedDBRepositoryOptions) {
    this.dbName = options.dbName ?? 'AI_Novel_Workshop'
    this.dbVersion = options.dbVersion ?? 4
    this.storeName = options.storeName
    this.requiredStores = options.requiredStores ?? [options.storeName]
    this.indexDefs = options.indexes ?? []
  }

  // -- Lifecycle -----------------------------------------------------------

  protected async init(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        logger.error(`IndexedDB open failed for ${this.storeName}:`, request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        const db = request.result

        // Verify all required stores exist
        const missing = this.requiredStores.filter(
          name => !db.objectStoreNames.contains(name),
        )
        if (missing.length > 0) {
          db.close()
          reject(
            new Error(
              `IndexedDB store(s) missing: ${missing.join(', ')}. ` +
                'Increment dbVersion or call storage.init() first.',
            ),
          )
          return
        }

        this.db = db
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        this.ensureStore(db)
      }
    })
  }

  /** Create the object store (and indexes) if it doesn't already exist. */
  private ensureStore(db: IDBDatabase): void {
    if (db.objectStoreNames.contains(this.storeName)) return

    const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
    for (const [name, keyPath, unique] of this.indexDefs) {
      store.createIndex(name, keyPath, { unique: unique ?? false })
    }
  }

  protected async getStore(mode: IDBTransactionMode = 'readonly'): Promise<{
    store: IDBObjectStore
    tx: IDBTransaction
  }> {
    const db = await this.init()
    const tx = db.transaction(this.storeName, mode)
    const store = tx.objectStore(this.storeName)
    return { store, tx }
  }

  // -- Repository<T> implementation ----------------------------------------

  async findById(id: string): Promise<T | null> {
    const { store } = await this.getStore()

    return new Promise<T | null>((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve((request.result as T) ?? null)
      request.onerror = () => reject(request.error)
    })
  }

  async findAll(options?: QueryOptions<T>): Promise<T[]> {
    const all = await this.getAllRaw()
    return this.applyQueryOptions(all, options)
  }

  async count(options?: Pick<QueryOptions<T>, 'filters'>): Promise<number> {
    const all = await this.getAllRaw()
    const filtered = options?.filters
      ? all.filter(record => this.matchesFilters(record, options.filters!))
      : all
    return filtered.length
  }

  async create(entity: T): Promise<T> {
    const existing = await this.findById(entity.id)
    if (existing !== null) {
      throw new Error(
        `Entity with id "${entity.id}" already exists in ${this.storeName}`,
      )
    }

    const { store, tx } = await this.getStore('readwrite')

    return new Promise<T>((resolve, reject) => {
      store.put(entity)
      tx.oncomplete = () => resolve(entity)
      tx.onerror = () => reject(tx.error)
    })
  }

  async update(id: string, partial: Partial<Omit<T, 'id'>>): Promise<T> {
    const existing = await this.findById(id)
    if (existing === null) {
      throw new Error(`Entity "${id}" not found in ${this.storeName}`)
    }

    const updated = { ...existing, ...partial, id } as T
    const { store, tx } = await this.getStore('readwrite')

    return new Promise<T>((resolve, reject) => {
      store.put(updated)
      tx.oncomplete = () => resolve(updated)
      tx.onerror = () => reject(tx.error)
    })
  }

  async delete(id: string): Promise<void> {
    const { store, tx } = await this.getStore('readwrite')

    return new Promise<void>((resolve, reject) => {
      store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  // -- Internal helpers ----------------------------------------------------

  private async getAllRaw(): Promise<T[]> {
    const { store } = await this.getStore()

    return new Promise<T[]>((resolve, reject) => {
      const results: T[] = []
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (cursor) {
          results.push(cursor.value as T)
          cursor.continue()
        } else {
          resolve(results)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  private applyQueryOptions(records: T[], options?: QueryOptions<T>): T[] {
    let result = records

    // Filter
    if (options?.filters?.length) {
      result = result.filter(record => this.matchesFilters(record, options.filters!))
    }

    // Sort
    if (options?.sort) {
      const { field, direction = 'asc' } = options.sort
      const mult = direction === 'desc' ? -1 : 1
      result = [...result].sort((a, b) => {
        const av = a[field]
        const bv = b[field]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return av < bv ? -mult : av > bv ? mult : 0
      })
    }

    // Offset + Limit
    const offset = options?.offset ?? 0
    if (offset > 0) result = result.slice(offset)
    if (options?.limit != null) result = result.slice(0, options.limit)

    return result
  }

  private matchesFilters(record: T, filters: QueryFilter[]): boolean {
    return filters.every(({ field, op, value }) => {
      const actual = (record as Record<string, unknown>)[field]
      switch (op) {
        case '=':
          return actual === value
        case '!=':
          return actual !== value
        case '>':
          return (actual as number) > (value as number)
        case '<':
          return (actual as number) < (value as number)
        case '>=':
          return (actual as number) >= (value as number)
        case '<=':
          return (actual as number) <= (value as number)
        default:
          return true
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Tauri Implementations
// ---------------------------------------------------------------------------

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

async function tauriInvokeJson<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const raw = await tauriInvoke<string>(command, args)
  return JSON.parse(raw) as T
}

// -- TauriProjectRepository ------------------------------------------------

export class TauriProjectRepository implements Repository<Entity> {
  async findById(id: string): Promise<Entity | null> {
    try {
      const project = await tauriInvokeJson<Entity>('load_project_skeleton', { id })
      const chapters = await tauriInvokeJson<Entity[]>('load_chapters_metadata', { projectId: id })
      project.chapters = chapters.sort(
        (a: Entity, b: Entity) => ((a.number as number) || 0) - ((b.number as number) || 0),
      )
      return project
    } catch {
      return null
    }
  }

  async findAll(): Promise<Entity[]> {
    const raw = await tauriInvoke<string>('load_projects_list')
    try {
      return JSON.parse(raw) as Entity[]
    } catch {
      return []
    }
  }

  async count(): Promise<number> {
    const projects = await this.findAll()
    return projects.length
  }

  async create(entity: Entity): Promise<Entity> {
    return this.saveEntity(entity)
  }

  async update(_id: string, partial: Partial<Omit<Entity, 'id'>>): Promise<Entity> {
    if (!partial.id) throw new Error('update() requires an entity with id')
    return this.saveEntity(partial as Entity)
  }

  async delete(id: string): Promise<void> {
    try {
      await tauriInvoke('delete_project', { id })
    } catch (error: unknown) {
      logger.error('Tauri delete project failed:', error)
      throw new Error(
        `桌面端删除项目失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async saveEntity(entity: Entity): Promise<Entity> {
    const copy = { ...entity }
    const chapters = (copy.chapters as Entity[] | undefined) ?? []
    const characters = (copy.characters as unknown[] | undefined) ?? []
    const worldbookEntries =
      ((copy.worldbook as { entries?: unknown[] } | undefined)?.entries) ?? []

    delete copy.chapters
    delete copy.characters
    if (copy.worldbook && typeof copy.worldbook === 'object') {
      delete (copy.worldbook as Record<string, unknown>).entries
    }

    try {
      const isFullPackage = chapters.length > 0 && chapters[0]!.content !== undefined

      if (isFullPackage) {
        await tauriInvoke('save_project_with_chapters', {
          id: entity.id,
          projectData: JSON.stringify(copy),
          chaptersData: chapters.map((c: Entity) => JSON.stringify(c)),
          charactersData: characters.map((c: unknown) => JSON.stringify(c)),
          worldbookData: worldbookEntries.map((w: unknown) => JSON.stringify(w)),
        })
      } else {
        await tauriInvoke('save_project', {
          id: entity.id,
          data: JSON.stringify(copy),
          characters: characters.map((c: unknown) => JSON.stringify(c)),
          worldbook: worldbookEntries.map((w: unknown) => JSON.stringify(w)),
        })
      }
    } catch (error: unknown) {
      logger.error('Tauri save project failed:', error)
      throw new Error(
        `桌面端保存项目失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    return entity
  }
}

// -- TauriChapterRepository ------------------------------------------------

export class TauriChapterRepository implements Repository<Entity> {
  async findById(id: string): Promise<Entity | null> {
    try {
      return await tauriInvokeJson<Entity>('load_chapter', {
        projectId: (id as unknown as { projectId?: string }).projectId ?? '',
        chapterId: id,
      })
    } catch {
      return null
    }
  }

  /**
   * Load a single chapter by project-scoped identifiers.
   * This is the preferred lookup method for chapter entities.
   */
  async findByProjectAndId(projectId: string, chapterId: string): Promise<Entity | null> {
    try {
      return await tauriInvokeJson<Entity>('load_chapter', { projectId, chapterId })
    } catch {
      return null
    }
  }

  async findAll(): Promise<Entity[]> {
    logger.warn(
      'TauriChapterRepository.findAll() without projectId is inefficient; prefer findByProjectId()',
    )
    return []
  }

  /** Load all chapters belonging to a specific project. */
  async findByProjectId(projectId: string): Promise<Entity[]> {
    try {
      return await tauriInvokeJson<Entity[]>('load_chapters_metadata', { projectId })
    } catch {
      return []
    }
  }

  async count(): Promise<number> {
    return 0
  }

  async create(entity: Entity): Promise<Entity> {
    return this.save(entity)
  }

  async update(_id: string, partial: Partial<Omit<Entity, 'id'>>): Promise<Entity> {
    if (!partial.id) throw new Error('update() requires an entity with id')
    return this.save(partial as Entity)
  }

  async delete(id: string): Promise<void> {
    // projectId is required by the Tauri backend
    const projectId = (id as unknown as { projectId?: string }).projectId
    if (!projectId) {
      throw new Error('TauriChapterRepository.delete() requires projectId on the entity')
    }
    try {
      await tauriInvoke('delete_single_chapter', { projectId, chapterId: id })
    } catch (error: unknown) {
      logger.error('Tauri delete chapter failed:', error)
      throw new Error(
        `桌面端删除章节失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async save(entity: Entity): Promise<Entity> {
    const projectId = entity.projectId as string | undefined
    if (!projectId) throw new Error('Chapter entity must include projectId')
    try {
      await tauriInvoke('save_chapter', {
        projectId,
        chapterId: entity.id,
        data: JSON.stringify(entity),
      })
      return entity
    } catch (error: unknown) {
      logger.error('Tauri save chapter failed:', error)
      throw new Error(
        `桌面端保存章节失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// -- TauriSnapshotRepository -----------------------------------------------

export class TauriSnapshotRepository implements Repository<Entity> {
  async findById(_id: string): Promise<Entity | null> {
    // Snapshot lookup requires projectId + chapterId scoping;
    // prefer findByScopedId() for correctness.
    logger.warn(
      'TauriSnapshotRepository.findById() without project/chapter scope is imprecise; prefer findByScopedId()',
    )
    return null
  }

  async findByScopedId(
    snapshotId: string,
    projectId: string,
    chapterId: string,
  ): Promise<Entity | null> {
    try {
      const raw = await tauriInvoke<string | null>('get_chapter_snapshot', {
        snapshotId,
        projectId,
        chapterId,
      })
      return raw ? (JSON.parse(raw) as Entity) : null
    } catch {
      return null
    }
  }

  async findAll(): Promise<Entity[]> {
    return []
  }

  async findByChapterId(chapterId: string, projectId: string): Promise<Entity[]> {
    try {
      return await tauriInvokeJson<Entity[]>('list_chapter_snapshots', { chapterId, projectId })
    } catch {
      return []
    }
  }

  async count(): Promise<number> {
    return 0
  }

  async create(entity: Entity): Promise<Entity> {
    try {
      await tauriInvoke('save_chapter_snapshot', {
        snapshotId: entity.id,
        projectId: entity.projectId,
        chapterId: entity.chapterId,
        data: JSON.stringify(entity),
        createdAt: entity.createdAt,
      })
      return entity
    } catch (error: unknown) {
      logger.error('Tauri save snapshot failed:', error)
      throw new Error(
        `桌面端保存快照失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async update(_id: string, partial: Partial<Omit<Entity, 'id'>>): Promise<Entity> {
    if (!partial.id) throw new Error('update() requires an entity with id')
    return this.create(partial as Entity)
  }

  async delete(_id: string): Promise<void> {
    logger.warn('TauriSnapshotRepository.delete() requires projectId and chapterId; use deleteScoped()')
    throw new Error('Use deleteScoped(snapshotId, projectId, chapterId) instead')
  }

  async deleteScoped(snapshotId: string, projectId: string, chapterId: string): Promise<void> {
    try {
      await tauriInvoke('delete_chapter_snapshot', { snapshotId, projectId, chapterId })
    } catch (error: unknown) {
      logger.error('Tauri delete snapshot failed:', error)
      throw new Error(
        `桌面端删除快照失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async prune(chapterId: string, projectId: string, keepCount: number): Promise<number> {
    try {
      return await tauriInvoke<number>('prune_chapter_snapshots', {
        chapterId,
        projectId,
        keepCount,
      })
    } catch (error: unknown) {
      logger.error('Tauri prune snapshots failed:', error)
      throw new Error(
        `桌面端清理快照失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// -- TauriTemplateRepository -----------------------------------------------

export class TauriTemplateRepository implements Repository<Entity> {
  private readonly storageKey = 'ai-novel-templates'

  async findById(id: string): Promise<Entity | null> {
    const all = this.loadFromLocalStorage()
    return all.find(t => t.id === id) ?? null
  }

  async findAll(): Promise<Entity[]> {
    return this.loadFromLocalStorage()
  }

  async count(): Promise<number> {
    return this.loadFromLocalStorage().length
  }

  async create(entity: Entity): Promise<Entity> {
    const all = this.loadFromLocalStorage()
    if (all.some(t => t.id === entity.id)) {
      throw new Error(`Template "${entity.id}" already exists`)
    }
    all.push(entity)
    this.saveToLocalStorage(all)
    return entity
  }

  async update(id: string, partial: Partial<Omit<Entity, 'id'>>): Promise<Entity> {
    const all = this.loadFromLocalStorage()
    const idx = all.findIndex(t => t.id === id)
    if (idx === -1) throw new Error(`Template "${id}" not found`)
    const updated = { ...all[idx], ...partial, id } as Entity
    all[idx] = updated
    this.saveToLocalStorage(all)
    return updated
  }

  async delete(id: string): Promise<void> {
    const all = this.loadFromLocalStorage().filter(t => t.id !== id)
    this.saveToLocalStorage(all)
  }

  private loadFromLocalStorage(): Entity[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      return raw ? (JSON.parse(raw) as Entity[]) : []
    } catch {
      return []
    }
  }

  private saveToLocalStorage(templates: Entity[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(templates))
    } catch {
      // Ignore write failures
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type EntityType = 'project' | 'chapter' | 'snapshot' | 'template'

/**
 * Create a repository instance for the given entity type.
 * In web mode an `IndexedDBRepository` is returned; in Tauri desktop mode
 * the appropriate Tauri-specific implementation is returned instead.
 */
export function createRepository(entityType: EntityType): Repository<Entity> {
  const isTauri = !isWebRuntime()

  if (isTauri) {
    switch (entityType) {
      case 'project':
        return new TauriProjectRepository()
      case 'chapter':
        return new TauriChapterRepository()
      case 'snapshot':
        return new TauriSnapshotRepository()
      case 'template':
        return new TauriTemplateRepository()
    }
  }

  // Web mode — IndexedDB
  switch (entityType) {
    case 'project':
      return new IndexedDBRepository<Entity>({
        storeName: 'projects',
        requiredStores: ['projects'],
      })
    case 'chapter':
      return new IndexedDBRepository<Entity>({
        storeName: 'chapters',
        requiredStores: ['chapters'],
        indexes: [
          ['projectId', 'projectId', false],
          ['number', 'number', false],
        ],
      })
    case 'snapshot':
      return new IndexedDBRepository<Entity>({
        storeName: 'chapter-snapshots',
        requiredStores: ['chapter-snapshots'],
        indexes: [
          ['chapterId', 'chapterId', false],
          ['projectId', 'projectId', false],
        ],
      })
    case 'template':
      return new IndexedDBRepository<Entity>({
        storeName: 'templates',
        requiredStores: ['templates'],
      })
  }
}
