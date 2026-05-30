import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVectorStore } from './vector'

// ---- mock helpers (hoisted so vi.mock factories can reference them) ----

const mockVectorService = vi.hoisted(() => ({
  indexProject: vi.fn().mockResolvedValue(undefined),
  indexChapter: vi.fn().mockResolvedValue(undefined),
  deleteChapter: vi.fn().mockResolvedValue(undefined),
  deleteDocumentsForProject: vi.fn().mockResolvedValue(5),
  vectorSearch: vi.fn().mockResolvedValue([
    {
      id: 'doc-1',
      content: 'test content',
      metadata: { type: 'chapter', projectId: 'proj-1', timestamp: Date.now() },
      score: 0.9,
      source: 'vector',
    },
  ]),
  retrieveRelevantContext: vi.fn().mockResolvedValue([]),
  clear: vi.fn().mockResolvedValue(undefined),
  getDocumentCount: vi.fn().mockResolvedValue(10),
}))

const mockCreateVectorService = vi.hoisted(() => vi.fn().mockResolvedValue(mockVectorService))
const mockResetVectorService = vi.hoisted(() => vi.fn())

vi.mock('../services/vector-service', () => ({
  createVectorService: mockCreateVectorService,
  resetVectorService: mockResetVectorService,
  VectorService: class {},
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
  AIError: class AIError extends Error {
    code: string
    constructor(message: string, opts?: { code?: string; cause?: Error }) {
      super(message)
      this.code = opts?.code ?? 'AI_ERROR'
      this.name = 'AIError'
    }
    toJSON() {
      return { code: this.code, message: this.message }
    }
  },
  toAppError: vi.fn((e: unknown, fallback: string) => {
    if (e instanceof Error) return { code: 'APP_ERROR', message: e.message, toJSON: () => ({}) }
    return { code: 'APP_ERROR', message: fallback, toJSON: () => ({}) }
  }),
  ErrorCode: { AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR' },
}))

describe('vector store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Reset mock return values after clearAllMocks
    mockVectorService.indexProject.mockResolvedValue(undefined)
    mockVectorService.indexChapter.mockResolvedValue(undefined)
    mockVectorService.deleteChapter.mockResolvedValue(undefined)
    mockVectorService.deleteDocumentsForProject.mockResolvedValue(5)
    mockVectorService.vectorSearch.mockResolvedValue([
      {
        id: 'doc-1',
        content: 'test content',
        metadata: { type: 'chapter', projectId: 'proj-1', timestamp: Date.now() },
        score: 0.9,
        source: 'vector',
      },
    ])
    mockVectorService.retrieveRelevantContext.mockResolvedValue([])
    mockVectorService.clear.mockResolvedValue(undefined)
    mockVectorService.getDocumentCount.mockResolvedValue(10)
  })

  // ---- initial state ----

  it('starts with uninitialized state', () => {
    const store = useVectorStore()

    expect(store.isInitialized).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.service).toBeNull()
    expect(store.documentCount).toBe(0)
    expect(store.currentProjectId).toBeNull()
  })

  it('isReady is false when not initialized', () => {
    const store = useVectorStore()
    expect(store.isReady).toBe(false)
  })

  // ---- initialize ----

  it('initializes the vector service successfully', async () => {
    const store = useVectorStore()
    await store.initialize()

    expect(store.isInitialized).toBe(true)
    expect(store.service).toBe(mockVectorService)
    expect(store.error).toBeNull()
  })

  it('isReady becomes true after initialization', async () => {
    const store = useVectorStore()
    await store.initialize()

    expect(store.isReady).toBe(true)
  })

  it('skips re-initialization if already initialized', async () => {
    const store = useVectorStore()

    await store.initialize()
    await store.initialize()

    expect(mockCreateVectorService).toHaveBeenCalledTimes(1)
  })

  it('sets error and throws when initialization fails', async () => {
    mockCreateVectorService.mockRejectedValueOnce(new Error('init failed'))

    const store = useVectorStore()

    await expect(store.initialize()).rejects.toThrow()
    expect(store.error).toContain('Failed to initialize vector service')
    expect(store.isInitialized).toBe(false)
    expect(store.isLoading).toBe(false)
  })

  // ---- document operations ----

  it('indexes a project via the service', async () => {
    const store = useVectorStore()
    await store.initialize()

    const project = { id: 'proj-1', chapters: [] } as any
    await store.indexProject(project)

    expect(mockVectorService.indexProject).toHaveBeenCalledWith(project)
  })

  it('indexes a single chapter via the service', async () => {
    const store = useVectorStore()
    await store.initialize()

    const chapter = { id: 'ch-1', content: 'hello' } as any
    await store.indexChapter(chapter, 'proj-1', ['Alice'], ['Forest'])

    expect(mockVectorService.indexChapter).toHaveBeenCalledWith(chapter, 'proj-1', ['Alice'], ['Forest'])
  })

  it('deletes a chapter via the service', async () => {
    const store = useVectorStore()
    await store.initialize()

    await store.deleteChapter('ch-1')

    expect(mockVectorService.deleteChapter).toHaveBeenCalledWith('ch-1')
  })

  it('deletes all project documents and returns count', async () => {
    const store = useVectorStore()
    await store.initialize()

    const deleted = await store.deleteProjectDocuments('proj-1')

    expect(mockVectorService.deleteDocumentsForProject).toHaveBeenCalledWith('proj-1')
    expect(deleted).toBe(5)
  })

  // ---- search ----

  it('performs vector search and returns results', async () => {
    const store = useVectorStore()
    await store.initialize()

    const results = await store.vectorSearch('test query', { topK: 5 })

    expect(mockVectorService.vectorSearch).toHaveBeenCalledWith('test query', { topK: 5 })
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('test content')
  })

  it('delegates retrieveRelevantContext to the service', async () => {
    const store = useVectorStore()
    await store.initialize()

    const currentChapter = { id: 'ch-3', content: 'text' } as any
    const project = { id: 'proj-1' } as any
    await store.retrieveRelevantContext(currentChapter, project, ['Alice'])

    expect(mockVectorService.retrieveRelevantContext).toHaveBeenCalledWith(
      currentChapter,
      project,
      ['Alice'],
      undefined,
    )
  })

  // ---- clearAll / getDocumentCount ----

  it('clears all indexes and resets document count', async () => {
    const store = useVectorStore()
    await store.initialize()

    await store.clearAll()

    expect(mockVectorService.clear).toHaveBeenCalled()
    expect(store.documentCount).toBe(0)
  })

  it('fetches and caches document count', async () => {
    const store = useVectorStore()
    await store.initialize()

    const count = await store.getDocumentCount('proj-1')

    expect(mockVectorService.getDocumentCount).toHaveBeenCalledWith('proj-1')
    expect(count).toBe(10)
    expect(store.documentCount).toBe(10)
  })

  // ---- refreshStats ----

  it('refreshStats updates documentCount from service', async () => {
    const store = useVectorStore()
    await store.initialize()
    store.currentProjectId = 'proj-1'

    mockVectorService.getDocumentCount.mockResolvedValueOnce(42)
    await store.refreshStats()

    expect(store.documentCount).toBe(42)
  })

  it('refreshStats silently handles service errors', async () => {
    const store = useVectorStore()
    await store.initialize()

    mockVectorService.getDocumentCount.mockRejectedValueOnce(new Error('fail'))

    // Should not throw
    await store.refreshStats()
    expect(store.documentCount).toBe(0)
  })

  // ---- reset / $reset ----

  it('resets all state to initial values', async () => {
    const store = useVectorStore()
    await store.initialize()
    store.currentProjectId = 'proj-1'
    store.documentCount = 42

    store.reset()

    expect(store.service).toBeNull()
    expect(store.isInitialized).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.currentProjectId).toBeNull()
    expect(store.documentCount).toBe(0)
  })

  it('$reset delegates to reset', async () => {
    const store = useVectorStore()
    await store.initialize()

    store.$reset()

    expect(store.isInitialized).toBe(false)
    expect(store.service).toBeNull()
  })

  // ---- ensureInitialized auto-init ----

  it('auto-initializes when calling an operation on an uninitialized store', async () => {
    const store = useVectorStore()

    // Not initialized yet
    expect(store.isInitialized).toBe(false)

    const results = await store.vectorSearch('auto-init query')

    // Should have auto-initialized
    expect(store.isInitialized).toBe(true)
    expect(mockVectorService.vectorSearch).toHaveBeenCalled()
    expect(results).toHaveLength(1)
  })
})
