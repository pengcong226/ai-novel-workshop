import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// vi.hoisted: declare mocks before vi.mock is hoisted
const { mockSearch, mockAddDocuments, mockClear, mockPush } = vi.hoisted(() => ({
  mockSearch: vi.fn().mockReturnValue([]),
  mockAddDocuments: vi.fn(),
  mockClear: vi.fn(),
  mockPush: vi.fn(),
}))

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock project store
const mockCurrentProject = {
  id: 'proj-1',
  chapters: [
    { id: 'ch-1', number: 1, title: '开端', content: '故事从这里开始' },
    { id: 'ch-2', number: 2, title: '', content: '第二章内容' },
  ],
  outline: {
    mainPlot: { name: '主线剧情', description: '主角的冒险旅程' },
  },
}

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: mockCurrentProject,
  }),
}))

// Mock sandbox store
vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({
    activeEntities: [
      { id: 'e1', name: 'Alice', type: 'CHARACTER', systemPrompt: 'A brave hero' },
    ],
    activeEntitiesState: {
      e1: { properties: { trait: '勇敢' } },
    },
  }),
}))

// Mock search engine
vi.mock('@/utils/searchEngine', () => ({
  SearchEngine: vi.fn().mockImplementation(() => ({
    search: mockSearch,
    addDocuments: mockAddDocuments,
    clear: mockClear,
  })),
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock eventTypeLabels
vi.mock('@/utils/eventTypeLabels', () => ({}))

// Must import AFTER mocks are set up
import { useGlobalSearch } from './useGlobalSearch'

function mountGlobalSearch() {
  let result!: ReturnType<typeof useGlobalSearch>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useGlobalSearch()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Do NOT call vi.restoreAllMocks() here — it strips SearchEngine's mockImplementation.
  })

  it('initializes with empty query', () => {
    const { query } = mountGlobalSearch()
    expect(query.value).toBe('')
  })

  it('initializes visible as false', () => {
    const { visible } = mountGlobalSearch()
    expect(visible.value).toBe(false)
  })

  it('open() sets visible to true and clears query/results', () => {
    const { open, visible, query, results } = mountGlobalSearch()

    open()
    expect(visible.value).toBe(true)
    expect(query.value).toBe('')
    expect(results.value).toEqual([])
  })

  it('close() sets visible to false and clears query/results', () => {
    const { open, close, visible, query, results } = mountGlobalSearch()

    open()
    query.value = 'test'
    close()

    expect(visible.value).toBe(false)
    expect(query.value).toBe('')
    expect(results.value).toEqual([])
  })

  it('open() triggers indexing of project data', () => {
    const { open } = mountGlobalSearch()

    open()
    expect(mockAddDocuments).toHaveBeenCalled()
    // Should have been called for chapters + entities + outline
    expect(mockAddDocuments.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('debounced search produces results via watch', async () => {
    mockSearch.mockReturnValue([
      {
        id: 'chapter:ch-1',
        type: 'chapter',
        score: 10,
        matches: [{ field: 'content', value: '故事从这里开始', score: 10, indices: [] }],
      },
    ])

    const { query, results } = mountGlobalSearch()
    query.value = '故事'
    await nextTick()
    await vi.advanceTimersByTimeAsync(250)

    expect(results.value.length).toBeGreaterThanOrEqual(1)
    expect(results.value[0].title).toBe('开端')
  })

  it('empty query clears results immediately', async () => {
    const { query, results } = mountGlobalSearch()

    query.value = 'test'
    await nextTick()
    query.value = ''
    await nextTick()

    expect(results.value).toEqual([])
  })

  it('commitRecent adds term to recent searches', () => {
    const { commitRecent, recentSearches } = mountGlobalSearch()

    commitRecent('test query')
    expect(recentSearches.value).toContain('test query')
  })

  it('commitRecent deduplicates existing terms', () => {
    const { commitRecent, recentSearches } = mountGlobalSearch()

    commitRecent('dup')
    commitRecent('dup')
    expect(recentSearches.value.filter(t => t === 'dup')).toHaveLength(1)
  })

  it('commitRecent limits to 8 items', () => {
    const { commitRecent, recentSearches } = mountGlobalSearch()

    for (let i = 0; i < 10; i++) {
      commitRecent(`query-${i}`)
    }
    expect(recentSearches.value.length).toBeLessThanOrEqual(8)
  })

  it('deleteRecent removes a term', () => {
    const { commitRecent, deleteRecent, recentSearches } = mountGlobalSearch()

    commitRecent('to-delete')
    expect(recentSearches.value).toContain('to-delete')

    deleteRecent('to-delete')
    expect(recentSearches.value).not.toContain('to-delete')
  })

  it('activate() closes dialog', () => {
    const { open, activate, visible } = mountGlobalSearch()

    open()
    activate({ type: 'chapter', id: 'chapter:ch-1', title: '开端', snippet: '...' })

    expect(visible.value).toBe(false)
  })

  it('activate() with chapter result navigates to chapters hash', () => {
    const { open, activate } = mountGlobalSearch()

    open()
    activate({ type: 'chapter', id: 'chapter:ch-1', title: '开端', snippet: '...' })

    expect(mockPush).toHaveBeenCalledWith({ hash: '#chapters' })
  })

  it('returns read-only results and recentSearches refs', () => {
    const { results, recentSearches } = mountGlobalSearch()

    expect(results).toBeDefined()
    expect(recentSearches).toBeDefined()
  })
})
