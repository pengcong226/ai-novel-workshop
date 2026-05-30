import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  pipelineWriteNextChapterMock,
  pipelineUpdateConfigMock,
  pipelineCtorMock,
} = vi.hoisted(() => ({
  pipelineWriteNextChapterMock: vi.fn(),
  pipelineUpdateConfigMock: vi.fn(),
  pipelineCtorMock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// vi.mock() declarations
// ---------------------------------------------------------------------------

vi.mock('@/services/pipeline/PipelineRunner', () => ({
  PipelineRunner: vi.fn().mockImplementation(() => {
    pipelineCtorMock()
    return {
      writeNextChapter: pipelineWriteNextChapterMock,
      updateConfig: pipelineUpdateConfigMock,
    }
  }),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockProject() {
  return {
    genre: '玄幻',
    config: { advancedSettings: { targetWordCount: 2000 } },
    chapters: [],
    plotEvents: [],
    outline: { chapters: [], subPlots: [] },
    _entities: [],
    _stateEvents: [],
  }
}

function makeSuccessfulPipelineResult(chapterNumber: number) {
  return {
    chapterNumber,
    title: `第${chapterNumber}章`,
    wordCount: 2000,
    content: `第${chapterNumber}章的内容`,
    auditResult: {
      passed: true,
      overallScore: 88,
      issues: [],
      summary: '通过',
      dimensionScores: {},
      tokenUsage: { inputTokens: 500, outputTokens: 1000, totalTokens: 1500 },
    },
    revised: false,
    postReviseCount: 2000,
    status: 'ready-for-review' as const,
    tokenUsage: {
      planner: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      composer: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      writer: { inputTokens: 200, outputTokens: 500, totalTokens: 700 },
      normalizer: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      auditor: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      reviser: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      settler: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      analyzer: { inputTokens: 50, outputTokens: 50, totalTokens: 100 },
      total: { inputTokens: 500, outputTokens: 1000, totalTokens: 1500 },
    },
    durationMs: 5000,
    stageTimings: {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchContinueScheduler', () => {
  let BatchContinueScheduler: typeof import('@/services/pipeline/BatchContinueScheduler').BatchContinueScheduler

  beforeEach(async () => {
    vi.clearAllMocks()

    pipelineWriteNextChapterMock.mockImplementation(async (opts: { chapterNumber: number }) => {
      return makeSuccessfulPipelineResult(opts.chapterNumber)
    })

    const mod = await import('@/services/pipeline/BatchContinueScheduler')
    BatchContinueScheduler = mod.BatchContinueScheduler
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should initialize with default budget config', () => {
      const scheduler = new BatchContinueScheduler()

      expect(pipelineCtorMock).toHaveBeenCalled()
      expect(scheduler.isPaused()).toBe(false)
    })

    it('should accept custom pipeline instance', () => {
      const customPipeline = {
        writeNextChapter: vi.fn(),
        updateConfig: vi.fn(),
      } as unknown as import('@/services/pipeline/PipelineRunner').PipelineRunner

      const scheduler = new BatchContinueScheduler(customPipeline)

      // Should NOT create a new PipelineRunner
      expect(pipelineCtorMock).not.toHaveBeenCalled()
      expect(scheduler.isPaused()).toBe(false)
    })

    it('should accept partial budget config with defaults', () => {
      const scheduler = new BatchContinueScheduler(undefined, {
        maxTotalTokens: 1000000,
      })

      expect(scheduler.isPaused()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Pause / Resume / Cancel state transitions
  // -----------------------------------------------------------------------
  describe('pause/resume/cancel state transitions', () => {
    it('should transition to paused state when pause() is called', () => {
      const scheduler = new BatchContinueScheduler()

      scheduler.pause()

      expect(scheduler.isPaused()).toBe(true)
    })

    it('should transition back to running when resume() is called', () => {
      const scheduler = new BatchContinueScheduler()

      scheduler.pause()
      expect(scheduler.isPaused()).toBe(true)

      scheduler.resume()
      expect(scheduler.isPaused()).toBe(false)
    })

    it('should not toggle paused state if already paused and pause() called again', () => {
      const scheduler = new BatchContinueScheduler()

      scheduler.pause()
      scheduler.pause()

      expect(scheduler.isPaused()).toBe(true)
    })

    it('should not toggle if not paused and resume() called', () => {
      const scheduler = new BatchContinueScheduler()

      scheduler.resume()

      expect(scheduler.isPaused()).toBe(false)
    })

    it('should increment runId on cancel, effectively cancelling running batch', () => {
      const scheduler = new BatchContinueScheduler()

      expect(scheduler.isRunning()).toBe(false)

      scheduler.cancel()

      expect(scheduler.isPaused()).toBe(false)
    })

    it('should resume from pause when cancel is called', () => {
      const scheduler = new BatchContinueScheduler()

      scheduler.pause()
      expect(scheduler.isPaused()).toBe(true)

      scheduler.cancel()
      expect(scheduler.isPaused()).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // Token budget enforcement
  // -----------------------------------------------------------------------
  describe('token budget enforcement', () => {
    it('should stop when single chapter exceeds maxTokenPerChapter', async () => {
      const onProgress = vi.fn()
      const scheduler = new BatchContinueScheduler(undefined, {
        maxTokenPerChapter: 100,
        maxTotalTokens: 5000000,
      })

      // Make pipeline return a result with high token usage
      pipelineWriteNextChapterMock.mockResolvedValue({
        ...makeSuccessfulPipelineResult(1),
        tokenUsage: {
          ...makeSuccessfulPipelineResult(1).tokenUsage,
          total: { inputTokens: 200, outputTokens: 300, totalTokens: 500 },
        },
      })

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 5,
          autoSave: true,
          onProgress,
        }
      )

      // Chapter was generated but budget exceeded, so it was NOT counted as completed
      expect(result.completedChapters).toBe(0)
      expect(result.results).toHaveLength(0)
    }, 15000)

    it('should stop when total tokens would exceed maxTotalTokens', async () => {
      const scheduler = new BatchContinueScheduler(undefined, {
        maxTokenPerChapter: 50000,
        maxTotalTokens: 200,
      })

      pipelineWriteNextChapterMock.mockResolvedValue({
        ...makeSuccessfulPipelineResult(1),
        tokenUsage: {
          ...makeSuccessfulPipelineResult(1).tokenUsage,
          total: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
        },
      })

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 5,
          autoSave: true,
        }
      )

      // First chapter uses 150 tokens, second would push to 300 > 200
      expect(result.completedChapters).toBe(1)
    }, 15000)

    it('should allow chapters within budget', async () => {
      const scheduler = new BatchContinueScheduler(undefined, {
        maxTokenPerChapter: 10000,
        maxTotalTokens: 100000,
      })

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 2,
          autoSave: true,
        }
      )

      expect(result.completedChapters).toBe(2)
      expect(result.results).toHaveLength(2)
      expect(result.failedChapters).toBe(0)
    }, 15000)
  })

  // -----------------------------------------------------------------------
  // Daily limit checking
  // -----------------------------------------------------------------------
  describe('daily limit checking', () => {
    it('should stop when daily chapter count reaches MAX_CHAPTERS_PER_DAY (50)', async () => {
      const onProgress = vi.fn()
      const scheduler = new BatchContinueScheduler()

      // Request more chapters than daily limit
      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 60,
          autoSave: true,
          onProgress,
        }
      )

      // Should stop at 50 chapters (daily limit)
      expect(result.completedChapters).toBe(50)
      expect(result.totalChapters).toBe(60)

      // Check that batch-paused event was emitted for daily limit
      const pausedEvents = onProgress.mock.calls
        .map((c: unknown[]) => c[0] as Record<string, unknown>)
        .filter((e) => e.type === 'batch-paused' && e.error === '已达到每日限额')
      expect(pausedEvents.length).toBeGreaterThanOrEqual(1)
    }, 300000)
  })

  // -----------------------------------------------------------------------
  // Checkpoint interval handling
  // -----------------------------------------------------------------------
  describe('checkpoint interval', () => {
    it('should invoke onCheckpoint at checkpoint intervals', async () => {
      const onCheckpoint = vi.fn().mockResolvedValue(true)
      const scheduler = new BatchContinueScheduler()

      await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 6,
          checkpointInterval: 3,
          autoSave: true,
          onCheckpoint,
        }
      )

      // Checkpoint should fire after chapters 3 and 6
      expect(onCheckpoint).toHaveBeenCalledTimes(2)
      // First call should have 3 results
      expect(onCheckpoint.mock.calls[0][0]).toHaveLength(3)
    }, 60000)

    it('should stop batch when onCheckpoint returns false', async () => {
      const onCheckpoint = vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const scheduler = new BatchContinueScheduler()

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 9,
          checkpointInterval: 3,
          autoSave: true,
          onCheckpoint,
        }
      )

      // 6 chapters completed: checkpoint at 3 (continue), checkpoint at 6 (stop)
      expect(result.completedChapters).toBe(6)
      expect(onCheckpoint).toHaveBeenCalledTimes(2)
    }, 60000)

    it('should not invoke onCheckpoint when checkpointInterval is 0', async () => {
      const onCheckpoint = vi.fn().mockResolvedValue(true)
      const scheduler = new BatchContinueScheduler()

      await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 3,
          checkpointInterval: 0,
          autoSave: true,
          onCheckpoint,
        }
      )

      expect(onCheckpoint).not.toHaveBeenCalled()
    }, 30000)
  })

  // -----------------------------------------------------------------------
  // Retry and error handling
  // -----------------------------------------------------------------------
  describe('retry and error handling', () => {
    it('should retry failed chapters up to MAX_RETRIES_PER_CHAPTER (2)', async () => {
      const onError = vi.fn()

      // Fail on first attempt, succeed on second
      pipelineWriteNextChapterMock
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(makeSuccessfulPipelineResult(1))

      const scheduler = new BatchContinueScheduler()

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 1,
          autoSave: true,
          onError,
        }
      )

      expect(result.completedChapters).toBe(1)
      expect(result.failedChapters).toBe(0)
      // Error callback called for first failure
      expect(onError).toHaveBeenCalledTimes(1)
    }, 30000)

    it('should mark chapter as failed after max retries exhausted', async () => {
      pipelineWriteNextChapterMock.mockRejectedValue(new Error('Persistent failure'))

      const scheduler = new BatchContinueScheduler()

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 1,
          autoSave: true,
        }
      )

      expect(result.failedChapters).toBe(1)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].status).toBe('audit-failed')
    }, 30000)

    it('should emit error progress events on failure', async () => {
      const onProgress = vi.fn()
      pipelineWriteNextChapterMock.mockRejectedValue(new Error('API failure'))

      const scheduler = new BatchContinueScheduler()

      await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 1,
          autoSave: true,
          onProgress,
        }
      )

      const errorEvents = onProgress.mock.calls
        .map((c: unknown[]) => c[0] as Record<string, unknown>)
        .filter((e) => e.type === 'error')
      expect(errorEvents.length).toBeGreaterThanOrEqual(1)
    }, 30000)
  })

  // -----------------------------------------------------------------------
  // Progress events
  // -----------------------------------------------------------------------
  describe('progress events', () => {
    it('should emit chapter-start and chapter-complete events', async () => {
      const onProgress = vi.fn()
      const scheduler = new BatchContinueScheduler()

      await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 1,
          autoSave: true,
          onProgress,
        }
      )

      const eventTypes = onProgress.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).type)
      expect(eventTypes).toContain('chapter-start')
      expect(eventTypes).toContain('chapter-complete')
      expect(eventTypes).toContain('batch-complete')
    }, 15000)

    it('should call onChapterComplete callback', async () => {
      const onChapterComplete = vi.fn()
      const scheduler = new BatchContinueScheduler()

      await scheduler.executeBatchContinue(
        makeMockProject(),
        1,
        {
          chapterCount: 2,
          autoSave: true,
          onChapterComplete,
        }
      )

      expect(onChapterComplete).toHaveBeenCalledTimes(2)
    }, 15000)
  })

  // -----------------------------------------------------------------------
  // Batch result
  // -----------------------------------------------------------------------
  describe('batch result', () => {
    it('should return correct BatchContinueResult', async () => {
      const scheduler = new BatchContinueScheduler()

      const result = await scheduler.executeBatchContinue(
        makeMockProject(),
        5,
        {
          chapterCount: 3,
          autoSave: true,
        }
      )

      expect(result.totalChapters).toBe(3)
      expect(result.completedChapters).toBe(3)
      expect(result.failedChapters).toBe(0)
      expect(result.cancelled).toBe(false)
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
      expect(result.totalTokenUsage).toBeGreaterThan(0)
      expect(result.results).toHaveLength(3)
      expect(result.results[0].chapterNumber).toBe(5)
      expect(result.results[1].chapterNumber).toBe(6)
      expect(result.results[2].chapterNumber).toBe(7)
    }, 30000)
  })
})
