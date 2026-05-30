import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { isWebRuntimeMock } = vi.hoisted(() => ({
  isWebRuntimeMock: vi.fn(() => true),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: isWebRuntimeMock,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/errors', () => ({
  toAppError: (e: unknown, msg: string) => {
    const err = new Error(msg)
    ;(err as any).code = 'UNKNOWN'
    return err
  },
}))

// ── Fake IndexedDB ───────────────────────────────────────────────────────

/**
 * Minimal in-memory IndexedDB shim for testing the web runtime path.
 * Only implements the subset used by IndexedDBStorage.
 */

function createFakeIndexedDB() {
  const databases = new Map<string, { version: number; stores: Map<string, FakeObjectStore> }>()

  function open(name: string, version?: number) {
    const existing = databases.get(name)
    const _dbVersion = existing?.version ?? 1
    const request: any = {}

    // We need onsuccess, onerror, onupgradeneeded, result to be set
    // Simulate async open via microtask
    queueMicrotask(() => {
      if (!existing) {
        // New database - trigger upgradeneeded first
        const stores = new Map<string, FakeObjectStore>()
        databases.set(name, { version: version ?? 1, stores })

        const db = createFakeDB(stores, version ?? 1)
        if (request.onupgradeneeded) {
          request.result = db
          request.onupgradeneeded({ target: request })
        }
        request.result = db
      } else {
        // Existing database
        if (version && version > existing.version) {
          existing.version = version
          const db = createFakeDB(existing.stores, version)
          request.result = db
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: request })
          }
        } else {
          request.result = createFakeDB(existing.stores, existing.version)
        }
      }
      request.onsuccess?.({ target: request })
    })

    return request
  }

  function deleteDatabase(name: string) {
    databases.delete(name)
    const request: any = {}
    queueMicrotask(() => request.onsuccess?.())
    return request
  }

  return { open, deleteDatabase }
}

function createFakeDB(stores: Map<string, FakeObjectStore>, version: number) {
  return {
    version,
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    transaction(storeNames: string | string[], mode: string) {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames]
      return createFakeTransaction(names, stores, mode)
    },
    close() {},
    createObjectStore(name: string, opts?: { keyPath?: string }) {
      const store = new FakeObjectStore(opts?.keyPath || 'id')
      stores.set(name, store)
      return store
    },
  }
}

function createFakeTransaction(storeNames: string[], allStores: Map<string, FakeObjectStore>, _mode: string) {
  const txStores = new Map<string, FakeObjectStore>()
  for (const name of storeNames) {
    txStores.set(name, allStores.get(name)!)
  }
  const tx: any = {
    objectStore(name: string) {
      return txStores.get(name)!
    },
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    error: null as Error | null,
    abort() {
      tx.error = new Error('Transaction aborted')
      tx.onabort?.()
    },
  }
  // Auto-complete synchronously
  queueMicrotask(() => tx.oncomplete?.())
  return tx
}

class FakeObjectStore {
  private data = new Map<string, any>()
  private keyPath: string
  private indexes = new Map<string, string>()

  constructor(keyPath: string) {
    this.keyPath = keyPath
  }

  put(record: any) {
    const key = String(record[this.keyPath])
    this.data.set(key, { ...record })
    return createFakeRequest(undefined)
  }

  get(key: string) {
    return createFakeRequest(this.data.get(key) ?? undefined)
  }

  delete(key: string) {
    this.data.delete(key)
    return createFakeRequest(undefined)
  }

  getAll() {
    return createFakeRequest([...this.data.values()])
  }

  clear() {
    this.data.clear()
  }

  index(name: string) {
    const _indexKey = this.indexes.get(name) || name
    return {
      getAll: (_range?: any) => {
        const all = [...this.data.values()]
        return createFakeRequest(all)
      },
      openCursor: (_range?: any) => createFakeRequest(null),
    }
  }

  createIndex(name: string, keyPath: string, _options?: any) {
    this.indexes.set(name, keyPath)
  }
}

function createFakeRequest(result: any) {
  const req: any = { result, error: null, onsuccess: null, onerror: null }
  queueMicrotask(() => req.onsuccess?.({ target: req }))
  return req
}

// Install the fake IndexedDB globally
const fakeIDB = createFakeIndexedDB()

vi.stubGlobal('indexedDB', {
  open: (...args: any[]) => fakeIDB.open(...args),
  deleteDatabase: (...args: any[]) => fakeIDB.deleteDatabase(...args),
})

vi.stubGlobal('IDBKeyRange', {
  only: (key: any) => ({ type: 'only', lower: key, upper: key }),
})

// ── Imports ──────────────────────────────────────────────────────────────

import { useStorage } from './storage'

// ── Tests ────────────────────────────────────────────────────────────────

describe('storage store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    isWebRuntimeMock.mockReturnValue(true)
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('isInitialized starts as false', () => {
      const store = useStorage()

      expect(store.isInitialized).toBe(false)
    })
  })

  // ── Template storage ─────────────────────────────────────────────────────

  describe('template storage', () => {
    it('loadTemplates returns empty array when nothing stored', async () => {
      const store = useStorage()

      const templates = await store.loadTemplates()

      expect(templates).toEqual([])
    })

    it('saveTemplates and loadTemplates round-trip', async () => {
      const store = useStorage()

      const templates = [
        { id: 't1', name: 'Template 1', body: 'hello' },
        { id: 't2', name: 'Template 2', body: 'world' },
      ]
      await store.saveTemplates(templates)

      const loaded = await store.loadTemplates()
      expect(loaded).toHaveLength(2)
      expect(loaded[0].name).toBe('Template 1')
      expect(loaded[1].name).toBe('Template 2')
    })

    it('deleteTemplate removes a template by ID', async () => {
      const store = useStorage()

      await store.saveTemplates([
        { id: 't1', name: 'Keep' },
        { id: 't2', name: 'Remove' },
      ])

      await store.deleteTemplate('t2')

      const loaded = await store.loadTemplates()
      expect(loaded).toHaveLength(1)
      expect(loaded[0].name).toBe('Keep')
    })

    it('deleteTemplate for non-existent ID does not corrupt data', async () => {
      const store = useStorage()

      await store.saveTemplates([{ id: 't1', name: 'Keep' }])
      await store.deleteTemplate('nonexistent')

      const loaded = await store.loadTemplates()
      expect(loaded).toHaveLength(1)
    })
  })

  // ── Project storage ──────────────────────────────────────────────────────

  describe('project storage', () => {
    it('saveProject and loadProject round-trip', async () => {
      const store = useStorage()

      await store.saveProject({
        id: 'proj-1',
        title: 'Test Project',
        genre: 'fantasy',
        chapters: [],
      } as any)

      const loaded = await store.loadProject('proj-1')

      expect(loaded).not.toBeNull()
      expect((loaded as any).id).toBe('proj-1')
      expect((loaded as any).title).toBe('Test Project')
    })

    it('loadProject returns null for non-existent ID', async () => {
      const store = useStorage()

      const loaded = await store.loadProject('nonexistent')

      expect(loaded).toBeNull()
    })

    it('deleteProject removes project and related data', async () => {
      const store = useStorage()

      await store.saveProject({
        id: 'proj-1',
        title: 'To Delete',
        chapters: [],
      } as any)

      await store.deleteProject('proj-1')

      const loaded = await store.loadProject('proj-1')
      expect(loaded).toBeNull()
    })

    it('loadProjects returns saved project list', async () => {
      const store = useStorage()

      await store.saveProjects([
        { id: 'p1', title: 'Project 1' },
        { id: 'p2', title: 'Project 2' },
      ])

      const list = await store.loadProjects()

      expect(list).toHaveLength(2)
    })
  })

  // ── Chapter storage ──────────────────────────────────────────────────────

  describe('chapter storage', () => {
    it('saveChapter and loadChapter round-trip', async () => {
      const store = useStorage()

      await store.saveProject({
        id: 'proj-1',
        title: 'Project',
        chapters: [],
      } as any)

      await store.saveChapter({
        id: 'ch-1',
        projectId: 'proj-1',
        number: 1,
        title: 'Chapter 1',
        content: 'Once upon a time...',
        wordCount: 100,
      } as any, 'proj-1')

      const loaded = await store.loadChapter('proj-1', 'ch-1')

      expect(loaded).not.toBeNull()
      expect((loaded as any).title).toBe('Chapter 1')
      expect((loaded as any).content).toBe('Once upon a time...')
    })

    it('loadChapter returns null for non-existent chapter', async () => {
      const store = useStorage()

      const loaded = await store.loadChapter('proj-1', 'nonexistent')

      expect(loaded).toBeNull()
    })

    it('saveChapter rejects empty ID', async () => {
      const store = useStorage()

      await expect(
        store.saveChapter({ id: '', projectId: 'proj-1' } as any, 'proj-1')
      ).rejects.toThrow('章节标识无效')
    })

    it('deleteChapter requires projectId', async () => {
      const store = useStorage()

      await expect(
        store.deleteChapter('ch-1')
      ).rejects.toThrow('删除章节需要 projectId')
    })
  })

  // ── Chapter snapshot validation ──────────────────────────────────────────

  describe('chapter snapshot validation', () => {
    it('rejects snapshot with empty id', async () => {
      const store = useStorage()

      await expect(
        store.saveChapterSnapshot({
          id: '',
          projectId: 'proj-1',
          chapterId: 'ch-1',
          title: 'Snapshot',
          content: 'content',
          wordCount: 100,
          createdAt: Date.now(),
          source: 'auto',
        } as any)
      ).rejects.toThrow('章节快照标识无效')
    })

    it('rejects snapshot with NaN wordCount', async () => {
      const store = useStorage()

      await expect(
        store.saveChapterSnapshot({
          id: 'snap-1',
          projectId: 'proj-1',
          chapterId: 'ch-1',
          title: 'Snapshot',
          content: 'content',
          wordCount: NaN,
          createdAt: Date.now(),
          source: 'auto',
        } as any)
      ).rejects.toThrow('章节快照字数无效')
    })

    it('rejects snapshot with negative wordCount', async () => {
      const store = useStorage()

      await expect(
        store.saveChapterSnapshot({
          id: 'snap-1',
          projectId: 'proj-1',
          chapterId: 'ch-1',
          title: 'Snapshot',
          content: 'content',
          wordCount: -5,
          createdAt: Date.now(),
          source: 'auto',
        } as any)
      ).rejects.toThrow('章节快照字数无效')
    })

    it('rejects snapshot with invalid source', async () => {
      const store = useStorage()

      await expect(
        store.saveChapterSnapshot({
          id: 'snap-1',
          projectId: 'proj-1',
          chapterId: 'ch-1',
          title: 'Snapshot',
          content: 'content',
          wordCount: 100,
          createdAt: Date.now(),
          source: 'invalid-source',
        } as any)
      ).rejects.toThrow('章节快照来源无效')
    })

    it('rejects snapshot with NaN createdAt', async () => {
      const store = useStorage()

      await expect(
        store.saveChapterSnapshot({
          id: 'snap-1',
          projectId: 'proj-1',
          chapterId: 'ch-1',
          title: 'Snapshot',
          content: 'content',
          wordCount: 100,
          createdAt: NaN,
          source: 'auto',
        } as any)
      ).rejects.toThrow('章节快照时间无效')
    })
  })

  // ── pruneChapterSnapshots validation ─────────────────────────────────────

  describe('pruneChapterSnapshots', () => {
    it('rejects negative keepCount', async () => {
      const store = useStorage()

      await expect(
        store.pruneChapterSnapshots('ch-1', 'proj-1', -1)
      ).rejects.toThrow('章节快照保留数量无效')
    })

    it('rejects non-integer keepCount', async () => {
      const store = useStorage()

      await expect(
        store.pruneChapterSnapshots('ch-1', 'proj-1', 1.5)
      ).rejects.toThrow('章节快照保留数量无效')
    })
  })

  // ── Public API surface ───────────────────────────────────────────────────

  describe('public API surface', () => {
    it('exposes all expected methods', () => {
      const store = useStorage()

      expect(typeof store.init).toBe('function')
      expect(typeof store.loadProjects).toBe('function')
      expect(typeof store.saveProjects).toBe('function')
      expect(typeof store.loadProject).toBe('function')
      expect(typeof store.loadFullProject).toBe('function')
      expect(typeof store.saveProject).toBe('function')
      expect(typeof store.deleteProject).toBe('function')
      expect(typeof store.loadChapters).toBe('function')
      expect(typeof store.loadChaptersMeta).toBe('function')
      expect(typeof store.loadChapter).toBe('function')
      expect(typeof store.loadChaptersPaginated).toBe('function')
      expect(typeof store.saveChapter).toBe('function')
      expect(typeof store.reorderChapters).toBe('function')
      expect(typeof store.deleteChapter).toBe('function')
      expect(typeof store.saveChapterSnapshot).toBe('function')
      expect(typeof store.listChapterSnapshots).toBe('function')
      expect(typeof store.getChapterSnapshot).toBe('function')
      expect(typeof store.deleteChapterSnapshot).toBe('function')
      expect(typeof store.pruneChapterSnapshots).toBe('function')
      expect(typeof store.loadTemplates).toBe('function')
      expect(typeof store.saveTemplates).toBe('function')
      expect(typeof store.deleteTemplate).toBe('function')
    })
  })
})
