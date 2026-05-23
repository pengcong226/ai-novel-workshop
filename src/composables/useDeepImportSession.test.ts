import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeepImportSession, ChapterExtractionResult, DeepImportOptions } from '@/types/deep-import'
import type { ParsedChapter } from '@/utils/chapterParser'
import { useDeepImportSession } from '@/composables/useDeepImportSession'

const {
  extractAllMock,
  checkResumableSessionMock,
  clearCachedSessionMock,
  pauseMock,
  resumeMock,
  emitProgressMock,
  bindProgressCallback,
} = vi.hoisted(() => {
  let progressCallback: ((payload: { phase: string }) => void) | undefined

  return {
    extractAllMock: vi.fn(),
    checkResumableSessionMock: vi.fn(async () => null),
    clearCachedSessionMock: vi.fn(),
    pauseMock: vi.fn(),
    resumeMock: vi.fn(),
    emitProgressMock: (payload: { phase: string }) => {
      progressCallback?.(payload)
    },
    bindProgressCallback: (cb?: (payload: { phase: string }) => void) => {
      progressCallback = cb
    },
  }
})



vi.mock('@/services/novel-extractor', () => {
  class NovelExtractor {
    constructor(_projectId: string, _options: unknown, onProgress?: (payload: { phase: string }) => void) {
      bindProgressCallback(onProgress)
    }

    estimateCost = vi.fn(() => ({
      estimatedChapters: 1,
      avgInputTokensPerChapter: 100,
      avgOutputTokensPerChapter: 50,
      costPerChapterUSD: 0.01,
      totalCostUSD: 0.01,
      estimatedTimeMinutes: 1,
    }))

    quickScanChapter = vi.fn(async () => ({
      isKeyChapter: true,
      reason: 'mock',
      mentionedEntities: [],
    }))

    abort = vi.fn()
    pause = pauseMock
    resume = resumeMock

    resolveToSandboxOps = vi.fn(() => ({
      newEntities: [],
      updatedEntities: [],
      stateEvents: [],
    }))

    extractAll = extractAllMock

    static checkResumableSession = checkResumableSessionMock
    static clearCachedSession = clearCachedSessionMock
  }

  return { NovelExtractor }
})

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 'project-1',
      plotEvents: [],
    },
    debouncedSaveCurrentProject: vi.fn(),
  }),
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({
    entities: [],
    buildNameToIdMap: vi.fn(() => ({})),
    addDraftEntity: vi.fn(),
    addDraftRelation: vi.fn(),
    commitDrafts: vi.fn(async () => {}),
    batchAddStateEvents: vi.fn(async () => {}),
    batchAddEntities: vi.fn(async () => {}),
    updateEntity: vi.fn(async () => {}),
  }),
}))

vi.mock('@/services/rewrite-continuation', () => ({
  RewriteContinuationService: {
    convertPlotEvents: vi.fn(() => []),
  },
}))

function chapterResult(chapterNumber: number, status: 'success' | 'error'): ChapterExtractionResult {
  return {
    chapterNumber,
    entities: { newEntities: [], entityUpdates: [], relations: [] },
    stateEvents: { events: [] },
    tokenUsage: { input: 0, output: 0 },
    costUSD: 0,
    extractedAt: Date.now(),
    status,
    errorMessage: status === 'error' ? 'mock error' : undefined,
  }
}

function buildSession(results: Array<[number, ChapterExtractionResult]>, isComplete = false): DeepImportSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    totalChapters: 2,
    extractedChapters: results.map(([chapterNumber]) => chapterNumber),
    results: new Map(results),
    nameToIdMap: {},
    totalTokenUsage: { input: 0, output: 0 },
    totalCostUSD: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: 'full',
    isComplete,
  }
}

const chapters: ParsedChapter[] = [
  {
    number: 1,
    title: '第一章',
    content: 'chapter-1',
    wordCount: 100,
    startIndex: 0,
    endIndex: 99,
  },
  {
    number: 2,
    title: '第二章',
    content: 'chapter-2',
    wordCount: 100,
    startIndex: 100,
    endIndex: 199,
  },
]

const baseOptions: DeepImportOptions = {
  mode: 'full',
  extractPlotEvents: false,
  checkpointInterval: 0,
  maxCostUSD: 10,
  batchSize: 1,
}

describe('useDeepImportSession retry flow', () => {
  beforeEach(() => {
    extractAllMock.mockReset()
    checkResumableSessionMock.mockReset()
    checkResumableSessionMock.mockResolvedValue(null)
    clearCachedSessionMock.mockReset()

    const composable = useDeepImportSession()
    composable.clearSession()
  })

  it('passes deduplicated key chapters into extraction start', async () => {
    extractAllMock.mockResolvedValue(
      buildSession([
        [1, chapterResult(1, 'success')],
        [2, chapterResult(2, 'success')],
      ], true)
    )

    const composable = useDeepImportSession()
    composable.setKeyChapters([2, 1, 2])

    await composable.start(chapters, { ...baseOptions, mode: 'smart_sampling' })

    expect(extractAllMock).toHaveBeenCalledTimes(1)
    expect(extractAllMock.mock.calls[0]?.[3]).toEqual([1, 2])
  })

  it('retries only failed chapters when retryFailedChapters is called', async () => {
    extractAllMock
      .mockResolvedValueOnce(
        buildSession([
          [1, chapterResult(1, 'success')],
          [2, chapterResult(2, 'error')],
        ])
      )
      .mockResolvedValueOnce(
        buildSession([
          [1, chapterResult(1, 'success')],
          [2, chapterResult(2, 'success')],
        ], true)
      )

    const composable = useDeepImportSession()
    await composable.start(chapters, baseOptions)
    await composable.retryFailedChapters()

    expect(extractAllMock).toHaveBeenCalledTimes(2)
    const retryChapters = extractAllMock.mock.calls[1]?.[0]
    expect(retryChapters.map((ch: { number: number }) => ch.number)).toEqual([2])
    expect(composable.session.value?.results.get(2)?.status).toBe('success')
  })

  it('delegates pause and resume to extractor when running', async () => {
    let resolveExtract!: (value: DeepImportSession) => void
    const extractionDone = new Promise<DeepImportSession>(resolve => {
      resolveExtract = resolve
    })
    extractAllMock.mockReturnValue(extractionDone)

    const composable = useDeepImportSession()
    const startPromise = composable.start(chapters, baseOptions)

    await Promise.resolve()

    composable.pause()
    composable.resume()

    expect(pauseMock).toHaveBeenCalledTimes(1)
    expect(resumeMock).toHaveBeenCalledTimes(1)

    resolveExtract(buildSession([
      [1, chapterResult(1, 'success')],
      [2, chapterResult(2, 'success')],
    ], true))
    await startPromise
  })

  it('marks session paused when checkpoint progress arrives', async () => {
    let resolveExtract!: (value: DeepImportSession) => void
    const extractionDone = new Promise<DeepImportSession>(resolve => {
      resolveExtract = resolve
    })
    extractAllMock.mockReturnValue(extractionDone)

    const composable = useDeepImportSession()
    const startPromise = composable.start(chapters, { ...baseOptions, checkpointInterval: 1 })

    await Promise.resolve()
    emitProgressMock({ phase: 'review_checkpoint' })

    expect(composable.isPaused.value).toBe(true)

    resolveExtract(buildSession([
      [1, chapterResult(1, 'success')],
      [2, chapterResult(2, 'success')],
    ], true))
    await startPromise
  })

  it('retries a single chapter by chapter number', async () => {
    extractAllMock
      .mockResolvedValueOnce(
        buildSession([
          [1, chapterResult(1, 'success')],
          [2, chapterResult(2, 'error')],
        ])
      )
      .mockResolvedValueOnce(
        buildSession([
          [1, chapterResult(1, 'success')],
          [2, chapterResult(2, 'success')],
        ], true)
      )

    const composable = useDeepImportSession()
    await composable.start(chapters, baseOptions)
    await composable.retryChapter(2)

    expect(extractAllMock).toHaveBeenCalledTimes(2)
    const retried = extractAllMock.mock.calls[1]?.[0]
    expect(retried.map((ch: { number: number }) => ch.number)).toEqual([2])
    expect(composable.session.value?.results.get(2)?.status).toBe('success')
  })
})
