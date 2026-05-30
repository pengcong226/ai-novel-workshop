import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useKnowledgeStore } from './knowledge'
import { KnowledgeCategory } from '@/types/knowledge-base'

// ---- mock helpers ----

const mockProjectStore = {
  currentProject: null as any,
  saveCurrentProject: vi.fn().mockResolvedValue(undefined),
  debouncedSaveCurrentProject: vi.fn(),
}

const mockStorage = {
  loadProject: vi.fn().mockResolvedValue(null),
  saveProject: vi.fn().mockResolvedValue(undefined),
}

vi.mock('./project', () => ({
  useProjectStore: () => mockProjectStore,
}))

vi.mock('./storage', () => ({
  useStorage: () => mockStorage,
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
    constructor(msg: string, opts?: { code?: string }) {
      super(msg)
      this.code = opts?.code ?? 'STORAGE_ERROR'
      this.name = 'StorageError'
    }
  },
  ErrorCode: {
    STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
    STORAGE_WRITE_FAILED: 'STORAGE_WRITE_FAILED',
  },
}))

// ---- helpers ----

function makeKnowledgeEntry(uid: number, overrides: Record<string, any> = {}) {
  return {
    uid,
    key: [`key-${uid}`],
    keysecondary: [],
    content: `content-${uid}`,
    comment: `comment-${uid}`,
    constant: false,
    disable: false,
    selective: false,
    order: 0,
    position: 'before_char' as const,
    depth: 4,
    category: KnowledgeCategory.CUSTOM,
    tags: [],
    usageCount: 0,
    metadata: {
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02'),
    },
    ...overrides,
  }
}

describe('knowledge store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockProjectStore.currentProject = null
    mockProjectStore.saveCurrentProject.mockResolvedValue(undefined)
    mockProjectStore.debouncedSaveCurrentProject.mockReset()
    mockStorage.loadProject.mockResolvedValue(null)
    mockStorage.saveProject.mockResolvedValue(undefined)
  })

  // ---- initial state ----

  it('starts with empty entries and no error', () => {
    const store = useKnowledgeStore()

    expect(store.entries).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.projectId).toBeNull()
  })

  it('computes zero counts for all getters on empty store', () => {
    const store = useKnowledgeStore()

    expect(store.totalEntries).toBe(0)
    expect(store.enabledEntries).toBe(0)
    expect(store.disabledEntries).toBe(0)
    expect(store.constantEntries).toBe(0)
    expect(store.allTags).toEqual([])
    expect(store.mostUsedEntries).toEqual([])
    expect(store.recentlyUpdated).toEqual([])
  })

  // ---- addEntry ----

  it('adds an entry with auto-incrementing UID', async () => {
    const store = useKnowledgeStore()
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: [] } }

    const entry = await store.addEntry({ content: 'world lore', key: ['lore'] })

    expect(entry.uid).toBe(1)
    expect(entry.content).toBe('world lore')
    expect(entry.category).toBe(KnowledgeCategory.CUSTOM)
    expect(store.totalEntries).toBe(1)
  })

  it('assigns incremental UID based on existing entries', async () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1), makeKnowledgeEntry(5)]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: store.entries } }

    const entry = await store.addEntry({ content: 'new' })

    expect(entry.uid).toBe(6)
  })

  it('respects provided category and tags on add', async () => {
    const store = useKnowledgeStore()
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: [] } }

    const entry = await store.addEntry({
      category: KnowledgeCategory.FAQ,
      tags: ['important', 'magic'],
      content: 'faq content',
    })

    expect(entry.category).toBe(KnowledgeCategory.FAQ)
    expect(entry.tags).toEqual(['important', 'magic'])
  })

  // ---- updateEntry ----

  it('updates an existing entry', async () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1, { content: 'old' })]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: store.entries } }

    const updated = await store.updateEntry(1, { content: 'new', tags: ['updated'] })

    expect(updated.content).toBe('new')
    expect(updated.tags).toEqual(['updated'])
    expect(store.entries[0].content).toBe('new')
  })

  it('throws when updating a non-existent entry', async () => {
    const store = useKnowledgeStore()
    store.projectId = 'proj-1'

    await expect(store.updateEntry(999, { content: 'x' })).rejects.toThrow('条目不存在: 999')
  })

  // ---- deleteEntry ----

  it('deletes an entry by UID', async () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1), makeKnowledgeEntry(2), makeKnowledgeEntry(3)]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: store.entries } }

    await store.deleteEntry(2)

    expect(store.totalEntries).toBe(2)
    expect(store.getEntry(2)).toBeUndefined()
  })

  it('throws when deleting a non-existent entry', async () => {
    const store = useKnowledgeStore()
    store.projectId = 'proj-1'

    await expect(store.deleteEntry(999)).rejects.toThrow('条目不存在: 999')
  })

  // ---- deleteEntries (batch) ----

  it('batch deletes entries by UIDs', async () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1),
      makeKnowledgeEntry(2),
      makeKnowledgeEntry(3),
      makeKnowledgeEntry(4),
    ]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: store.entries } }

    await store.deleteEntries([1, 3])

    expect(store.totalEntries).toBe(2)
    expect(store.entries.map(e => e.uid)).toEqual([2, 4])
  })

  // ---- getEntry / getEntriesByCategory / getEntriesByTag ----

  it('retrieves a single entry by UID', () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1), makeKnowledgeEntry(2)]

    expect(store.getEntry(1)!.uid).toBe(1)
    expect(store.getEntry(999)).toBeUndefined()
  })

  it('filters entries by category', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { category: KnowledgeCategory.FAQ }),
      makeKnowledgeEntry(2, { category: KnowledgeCategory.CUSTOM }),
      makeKnowledgeEntry(3, { category: KnowledgeCategory.FAQ }),
    ]

    const faqEntries = store.getEntriesByCategory(KnowledgeCategory.FAQ)
    expect(faqEntries).toHaveLength(2)
  })

  it('filters entries by tag', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { tags: ['magic', 'combat'] }),
      makeKnowledgeEntry(2, { tags: ['magic'] }),
      makeKnowledgeEntry(3, { tags: ['world'] }),
    ]

    const magicEntries = store.getEntriesByTag('magic')
    expect(magicEntries).toHaveLength(2)
  })

  // ---- searchEntries ----

  it('searches entries by content text', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { content: 'Dragon fire is powerful' }),
      makeKnowledgeEntry(2, { content: 'Water magic heals' }),
      makeKnowledgeEntry(3, { content: 'The dragon breathes flame' }),
    ]

    const results = store.searchEntries('dragon')
    expect(results).toHaveLength(2)
  })

  it('searches entries by comment', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { comment: 'Important lore entry' }),
      makeKnowledgeEntry(2, { comment: 'Minor detail' }),
    ]

    const results = store.searchEntries('Important', { scope: ['comment'] })
    expect(results).toHaveLength(1)
  })

  it('search entries with category filter', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { content: 'dragon lore', category: KnowledgeCategory.CUSTOM }),
      makeKnowledgeEntry(2, { content: 'dragon FAQ', category: KnowledgeCategory.FAQ }),
    ]

    const results = store.searchEntries('dragon', { categories: [KnowledgeCategory.FAQ] })
    expect(results).toHaveLength(1)
    expect(results[0].category).toBe(KnowledgeCategory.FAQ)
  })

  it('search entries with tag filter', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { content: 'item one', tags: ['important'] }),
      makeKnowledgeEntry(2, { content: 'item two', tags: ['minor'] }),
    ]

    const results = store.searchEntries('item', { tags: ['important'] })
    expect(results).toHaveLength(1)
  })

  it('search entries with enabledOnly filter', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { content: 'visible', disable: false }),
      makeKnowledgeEntry(2, { content: 'visible too', disable: true }),
    ]

    const results = store.searchEntries('visible', { enabledOnly: true })
    expect(results).toHaveLength(1)
  })

  // ---- incrementUsage ----

  it('increments usage count for an entry', async () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1, { usageCount: 0 })]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: store.entries } }

    await store.incrementUsage(1)
    await store.incrementUsage(1)

    expect(store.entries[0].usageCount).toBe(2)
    expect(store.entries[0].lastUsedAt).toBeInstanceOf(Date)
  })

  it('does nothing when incrementing usage for non-existent entry', async () => {
    const store = useKnowledgeStore()
    store.projectId = 'proj-1'

    await store.incrementUsage(999)
    // No error thrown
    expect(store.totalEntries).toBe(0)
  })

  // ---- clearKnowledge ----

  it('clears all entries', async () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1), makeKnowledgeEntry(2)]
    store.projectId = 'proj-1'
    mockProjectStore.currentProject = { id: 'proj-1', knowledgeBase: { entries: [] } }

    await store.clearKnowledge()

    expect(store.totalEntries).toBe(0)
  })

  // ---- exportKnowledge ----

  it('exports knowledge as formatted JSON string', () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1, { usageCount: 5 })]

    const json = store.exportKnowledge()
    const parsed = JSON.parse(json)

    expect(parsed.entries).toHaveLength(1)
    expect(parsed.metadata.totalEntries).toBe(1)
    expect(parsed.metadata.totalUsage).toBe(5)
  })

  // ---- computed: entriesByCategory ----

  it('groups entries by category in entriesByCategory', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { category: KnowledgeCategory.FAQ }),
      makeKnowledgeEntry(2, { category: KnowledgeCategory.CUSTOM }),
      makeKnowledgeEntry(3, { category: KnowledgeCategory.FAQ }),
    ]

    const byCat = store.entriesByCategory
    expect(byCat.get(KnowledgeCategory.FAQ)).toHaveLength(2)
    expect(byCat.get(KnowledgeCategory.CUSTOM)).toHaveLength(1)
  })

  // ---- computed: entriesByTag ----

  it('groups entries by tag in entriesByTag', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { tags: ['magic', 'lore'] }),
      makeKnowledgeEntry(2, { tags: ['magic'] }),
    ]

    const byTag = store.entriesByTag
    expect(byTag.get('magic')).toHaveLength(2)
    expect(byTag.get('lore')).toHaveLength(1)
  })

  // ---- computed: allTags ----

  it('returns sorted unique tags', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { tags: ['zebra', 'alpha'] }),
      makeKnowledgeEntry(2, { tags: ['alpha', 'beta'] }),
    ]

    expect(store.allTags).toEqual(['alpha', 'beta', 'zebra'])
  })

  // ---- computed: enabledEntries / disabledEntries / constantEntries ----

  it('counts enabled, disabled, and constant entries correctly', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { disable: false, constant: true }),
      makeKnowledgeEntry(2, { disable: true, constant: false }),
      makeKnowledgeEntry(3, { disable: false, constant: false }),
    ]

    expect(store.enabledEntries).toBe(2)
    expect(store.disabledEntries).toBe(1)
    expect(store.constantEntries).toBe(1)
  })

  // ---- computed: mostUsedEntries ----

  it('returns top entries sorted by usageCount descending', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { usageCount: 5 }),
      makeKnowledgeEntry(2, { usageCount: 20 }),
      makeKnowledgeEntry(3, { usageCount: 10 }),
      makeKnowledgeEntry(4, { usageCount: 0 }),
    ]

    const mostUsed = store.mostUsedEntries
    expect(mostUsed[0].usageCount).toBe(20)
    expect(mostUsed[1].usageCount).toBe(10)
    expect(mostUsed[2].usageCount).toBe(5)
    // Entry with usageCount 0 should be filtered out
    expect(mostUsed).toHaveLength(3)
  })

  // ---- computed: recentlyUpdated ----

  it('returns top entries sorted by updatedAt descending', () => {
    const store = useKnowledgeStore()
    store.entries = [
      makeKnowledgeEntry(1, { metadata: { createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-10') } }),
      makeKnowledgeEntry(2, { metadata: { createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-20') } }),
      makeKnowledgeEntry(3, { metadata: { createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-15') } }),
    ]

    const recent = store.recentlyUpdated
    expect(recent[0].uid).toBe(2)
    expect(recent[1].uid).toBe(3)
    expect(recent[2].uid).toBe(1)
  })

  // ---- $reset ----

  it('$reset clears all state', () => {
    const store = useKnowledgeStore()
    store.entries = [makeKnowledgeEntry(1)]
    store.projectId = 'proj-1'
    store.error = 'some error'

    store.$reset()

    expect(store.entries).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.projectId).toBeNull()
  })
})
