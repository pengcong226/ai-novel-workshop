import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorldbookStore } from './worldbook'

// ---- mock helpers ----

const mockStorage = {
  loadProject: vi.fn().mockResolvedValue(null),
  saveProject: vi.fn().mockResolvedValue(undefined),
}

const mockSandboxStore = {
  entities: [] as any[],
  addEntity: vi.fn().mockResolvedValue(undefined),
  updateEntity: vi.fn().mockResolvedValue(undefined),
  deleteEntity: vi.fn().mockResolvedValue(undefined),
}

const mockProjectStore = {
  currentProject: null as any,
  debouncedSaveCurrentProject: vi.fn(),
}

const mockInjectorInstance = {
  inject: vi.fn().mockReturnValue({ entries: [], tokens: 0 }),
  getStats: vi.fn().mockReturnValue({ totalEntries: 0, enabledEntries: 0 }),
}

const mockAiAssistantInstance = {
  generateEntrySuggestion: vi.fn().mockResolvedValue({ suggestions: [] }),
  optimizeEntry: vi.fn().mockResolvedValue({}),
  analyzeWorldbook: vi.fn().mockResolvedValue({}),
}

vi.mock('./storage', () => ({
  useStorage: () => mockStorage,
}))

vi.mock('./sandbox', () => ({
  useSandboxStore: () => mockSandboxStore,
}))

vi.mock('./project', () => ({
  useProjectStore: () => mockProjectStore,
}))

vi.mock('@/services/worldbook-injector', () => ({
  WorldbookInjector: vi.fn().mockImplementation(() => mockInjectorInstance),
}))

vi.mock('@/services/worldbook-ai', () => ({
  WorldbookAIAssistant: vi.fn().mockImplementation(() => mockAiAssistantInstance),
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'gen-id-001'),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'uuid-' + Math.random().toString(36).slice(2, 8)),
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
  StorageError: class StorageError extends Error {
    code: string
    constructor(msg: string, opts?: { code?: string; cause?: Error }) {
      super(msg)
      this.code = opts?.code ?? 'STORAGE_ERROR'
      this.name = 'StorageError'
    }
    toJSON() {
      return { code: this.code, message: this.message }
    }
  },
  toAppError: (e: unknown, fallback: string) => {
    if (e instanceof Error)
      return { code: 'APP_ERROR', message: e.message, toJSON: () => ({}) }
    return { code: 'APP_ERROR', message: fallback, toJSON: () => ({}) }
  },
  ErrorCode: {
    STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
    STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
  },
}))

// ---- helpers ----

function makeWorldbook(overrides: Record<string, any> = {}) {
  return {
    entries: [] as any[],
    metadata: {
      source: 'novel_workshop',
      format: 'v3',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalEntries: 0,
      groups: [] as any[],
      ...overrides.metadata,
    },
    ...overrides,
  }
}

function makeEntry(uid: number, overrides: Record<string, any> = {}) {
  return {
    uid,
    key: [`key-${uid}`],
    content: `content-${uid}`,
    comment: `comment-${uid}`,
    disable: false,
    constant: false,
    novelWorkshop: { createdAt: new Date(), updatedAt: new Date() },
    ...overrides,
  }
}

describe('worldbook store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockStorage.loadProject.mockResolvedValue(null)
    mockStorage.saveProject.mockResolvedValue(undefined)
    mockSandboxStore.entities = []
    mockProjectStore.currentProject = null
  })

  // ---- initial state ----

  it('starts with null worldbook and no errors', () => {
    const store = useWorldbookStore()

    expect(store.worldbook).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.projectId).toBeNull()
    expect(store.bridgeError).toBeNull()
  })

  // ---- computed properties on empty worldbook ----

  it('computed properties return empty defaults when worldbook is null', () => {
    const store = useWorldbookStore()

    expect(store.entries).toEqual([])
    expect(store.groups).toEqual([])
    expect(store.enabledEntries).toEqual([])
    expect(store.constantEntries).toEqual([])
    expect(store.entryCount).toBe(0)
    expect(store.enabledEntryCount).toBe(0)
    expect(store.groupCount).toBe(0)
  })

  // ---- loadWorldbook ----

  it('loads a worldbook from storage for a given project ID', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1)]
    mockStorage.loadProject.mockResolvedValueOnce({ worldbook: wb, config: {} })

    const store = useWorldbookStore()
    await store.loadWorldbook('proj-1')

    expect(store.worldbook).toEqual(wb)
    expect(store.projectId).toBe('proj-1')
    expect(store.entryCount).toBe(1)
    expect(store.loading).toBe(false)
  })

  it('creates a default worldbook if project has none', async () => {
    const projectData = { config: {} }
    mockStorage.loadProject.mockResolvedValueOnce(projectData)

    const store = useWorldbookStore()
    await store.loadWorldbook('proj-1')

    expect(store.worldbook).toBeDefined()
    expect(store.worldbook!.entries).toEqual([])
    expect(mockStorage.saveProject).toHaveBeenCalled()
  })

  it('sets error and throws when project does not exist', async () => {
    mockStorage.loadProject.mockResolvedValueOnce(null)

    const store = useWorldbookStore()

    await expect(store.loadWorldbook('missing-proj')).rejects.toThrow()
    expect(store.error).toBeDefined()
  })

  it('uses current project ID from project store when no ID passed', async () => {
    mockProjectStore.currentProject = { id: 'cur-proj' }
    const wb = makeWorldbook()
    mockStorage.loadProject.mockResolvedValueOnce({ worldbook: wb, config: {} })

    const store = useWorldbookStore()
    await store.loadWorldbook()

    expect(store.projectId).toBe('cur-proj')
  })

  // ---- entry CRUD ----

  it('adds an entry and assigns auto-incrementing UID', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1)]

    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    // Mock saveWorldbook path: project store matches
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const added = await store.addEntry({ content: 'new content', key: ['new-key'] })

    expect(added.uid).toBe(2)
    expect(added.content).toBe('new content')
    expect(wb.entries).toHaveLength(2)
  })

  it('throws when adding entry to uninitialized worldbook', async () => {
    const store = useWorldbookStore()
    await expect(store.addEntry({ content: 'x' })).rejects.toThrow('世界书未初始化')
  })

  it('updates an existing entry', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1, { content: 'old' })]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const updated = await store.updateEntry(1, { content: 'updated' })

    expect(updated.content).toBe('updated')
    expect(wb.entries[0].content).toBe('updated')
  })

  it('throws when updating a non-existent entry', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'

    await expect(store.updateEntry(999, { content: 'x' })).rejects.toThrow('条目不存在: 999')
  })

  it('deletes an entry by UID', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1), makeEntry(2), makeEntry(3)]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    await store.deleteEntry(2)

    expect(wb.entries).toHaveLength(2)
    expect(wb.entries.find((e: any) => e.uid === 2)).toBeUndefined()
  })

  it('throws when deleting a non-existent entry', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'

    await expect(store.deleteEntry(999)).rejects.toThrow('条目不存在: 999')
  })

  // ---- deleteEntries (batch) ----

  it('batch deletes entries by UIDs', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4)]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    await store.deleteEntries([1, 3])

    expect(wb.entries).toHaveLength(2)
    expect(wb.entries.map((e: any) => e.uid)).toEqual([2, 4])
  })

  // ---- toggleEntries ----

  it('toggles enabled state for multiple entries', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1, { disable: true }), makeEntry(2, { disable: true })]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    await store.toggleEntries([1, 2], true)

    expect(wb.entries[0].disable).toBe(false)
    expect(wb.entries[1].disable).toBe(false)
  })

  // ---- group CRUD ----

  it('adds a group to the worldbook', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const group = await store.addGroup('My Group', 'A test group')

    expect(group.name).toBe('My Group')
    expect(group.description).toBe('A test group')
    expect(group.enabled).toBe(true)
    expect(store.groupCount).toBe(1)
  })

  it('updates a group', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const group = await store.addGroup('Original')
    const updated = await store.updateGroup(group.id, { name: 'Renamed' })

    expect(updated.name).toBe('Renamed')
  })

  it('deletes a group', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const group = await store.addGroup('To Delete')
    await store.deleteGroup(group.id)

    expect(store.groupCount).toBe(0)
  })

  it('throws when deleting a non-existent group', async () => {
    const wb = makeWorldbook()
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'

    await expect(store.deleteGroup('non-existent')).rejects.toThrow('分组不存在: non-existent')
  })

  // ---- exportWorldbook ----

  it('exports worldbook as JSON string', () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1)]
    const store = useWorldbookStore()
    store.worldbook = wb as any

    const json = store.exportWorldbook()
    const parsed = JSON.parse(json)

    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0].uid).toBe(1)
  })

  it('throws when exporting an uninitialized worldbook', () => {
    const store = useWorldbookStore()
    expect(() => store.exportWorldbook()).toThrow('世界书未初始化')
  })

  // ---- importWorldbook ----

  it('imports a worldbook from JSON (replace mode)', async () => {
    const store = useWorldbookStore()
    store.worldbook = makeWorldbook() as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: store.worldbook }

    const imported = makeWorldbook()
    imported.entries = [makeEntry(100)]

    await store.importWorldbook(JSON.stringify(imported))

    expect(store.worldbook!.entries).toHaveLength(1)
    expect(store.worldbook!.entries[0].uid).toBe(100)
  })

  it('imports a worldbook in merge mode', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1)]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', worldbook: wb }

    const imported = makeWorldbook()
    imported.entries = [makeEntry(2)]

    await store.importWorldbook(JSON.stringify(imported), true)

    expect(store.worldbook!.entries).toHaveLength(2)
  })

  // ---- computed: entriesByType / entriesByCategory ----

  it('groups entries by novelWorkshop.entryType', () => {
    const wb = makeWorldbook()
    wb.entries = [
      makeEntry(1, { novelWorkshop: { entryType: 'character' } }),
      makeEntry(2, { novelWorkshop: { entryType: 'location' } }),
      makeEntry(3, { novelWorkshop: { entryType: 'character' } }),
    ]
    const store = useWorldbookStore()
    store.worldbook = wb as any

    const byType = store.entriesByType
    expect(byType.get('character')).toHaveLength(2)
    expect(byType.get('location')).toHaveLength(1)
  })

  it('groups entries by novelWorkshop.category with default "未分类"', () => {
    const wb = makeWorldbook()
    wb.entries = [
      makeEntry(1, { novelWorkshop: { category: 'magic' } }),
      makeEntry(2), // no category => "未分类"
    ]
    const store = useWorldbookStore()
    store.worldbook = wb as any

    const byCategory = store.entriesByCategory
    expect(byCategory.get('magic')).toHaveLength(1)
    expect(byCategory.get('未分类')).toHaveLength(1)
  })

  // ---- $reset ----

  it('$reset clears all state', async () => {
    const wb = makeWorldbook()
    wb.entries = [makeEntry(1)]
    const store = useWorldbookStore()
    store.worldbook = wb as any
    store.projectId = 'proj-1'

    store.$reset()

    expect(store.worldbook).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.projectId).toBeNull()
    expect(store.bridgeError).toBeNull()
  })
})
