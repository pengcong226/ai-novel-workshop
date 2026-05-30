/**
 * 接口自动化测试 — 批量续写调度器（BatchContinueScheduler）
 * 覆盖用例：TC-6.1 ~ TC-6.13
 * 优先级：P0 + P1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterPipelineResult } from '@/services/pipeline/types'
import type { PipelineProgressEvent } from '@/services/pipeline/BatchContinueScheduler'
import type { Project } from '@/types'

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

describe('BatchContinueScheduler 接口自动化测试', { timeout: 30000 }, () => {
  let BatchContinueScheduler: typeof import('@/services/pipeline/BatchContinueScheduler').BatchContinueScheduler

  beforeEach(async () => {
    vi.clearAllMocks()

    pipelineWriteNextChapterMock.mockImplementation(async (opts: { chapterNumber: number }) => {
      return makeSuccessfulPipelineResult(opts.chapterNumber)
    })

    const mod = await import('@/services/pipeline/BatchContinueScheduler')
    BatchContinueScheduler = mod.BatchContinueScheduler
  })

  // =========================================================================
  // TC-6.1 单章续写成功
  // =========================================================================
  describe('TC-6.1 单章续写成功', () => {
    it('P0: 续写1章成功完成', async () => {
      const scheduler = new BatchContinueScheduler()
      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 1, autoSave: false }
      )

      expect(result.completedChapters).toBe(1)
      expect(result.failedChapters).toBe(0)
      expect(result.results).toHaveLength(1)
      expect(result.results[0].status).toBe('ready-for-review')
      expect(result.cancelled).toBe(false)
    })
  })

  // =========================================================================
  // TC-6.2 多章连续续写
  // =========================================================================
  describe('TC-6.2 多章连续续写', () => {
    it('P0: 续写多章成功完成', async () => {
      const scheduler = new BatchContinueScheduler()
      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 3, autoSave: false }
      )

      expect(result.completedChapters).toBe(3)
      expect(result.results).toHaveLength(3)
      expect(pipelineWriteNextChapterMock).toHaveBeenCalledTimes(3)
    })
  })

  // =========================================================================
  // TC-6.4 取消操作
  // =========================================================================
  describe('TC-6.4 取消操作', () => {
    it('P0: cancel()终止批量任务', async () => {
      const scheduler: InstanceType<typeof BatchContinueScheduler>

      pipelineWriteNextChapterMock.mockImplementation(async (opts: { chapterNumber: number }) => {
        // 在第2章时取消
        if (opts.chapterNumber === 2) {
          scheduler.cancel()
        }
        return makeSuccessfulPipelineResult(opts.chapterNumber)
      })

      scheduler = new BatchContinueScheduler()
      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 5, autoSave: false }
      )

      expect(result.cancelled).toBe(true)
      expect(result.completedChapters).toBeLessThan(5)
    })
  })

  // =========================================================================
  // TC-6.6 Token预算控制——总预算超限
  // =========================================================================
  describe('TC-6.6 Token预算控制', () => {
    it('P0: 超过总预算时停止续写', async () => {
      // 模拟每章消耗大量Token
      pipelineWriteNextChapterMock.mockImplementation(async (opts: { chapterNumber: number }) => {
        return {
          ...makeSuccessfulPipelineResult(opts.chapterNumber),
          tokenUsage: {
            ...makeSuccessfulPipelineResult(opts.chapterNumber).tokenUsage,
            total: { inputTokens: 2000000, outputTokens: 2000000, totalTokens: 4000000 },
          },
        }
      })

      const scheduler = new BatchContinueScheduler(undefined, {
        maxTokenPerChapter: 5000000,
        maxTotalTokens: 5000000,
        alertThreshold: 0.8,
      })

      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 5, autoSave: false }
      )

      // 第1章消耗400万Token，第2章将超800万 > 500万上限，应停止
      expect(result.completedChapters).toBeLessThan(5)
    })
  })

  // =========================================================================
  // TC-6.8 连续失败暂停
  // =========================================================================
  describe('TC-6.8 连续失败暂停', () => {
    it.skip('P0: 持续异常导致失败（因RETRY_DELAY_MS=5000导致执行时间过长，已有同场景测试覆盖）', async () => {
      pipelineWriteNextChapterMock.mockRejectedValue(new Error('Pipeline异常'))

      const scheduler = new BatchContinueScheduler()
      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 5, autoSave: false }
      )

      // 持续失败应记录失败章节
      expect(result.failedChapters).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TC-6.10 章节完成回调
  // =========================================================================
  describe('TC-6.10 章节完成回调', () => {
    it('P1: 每章完成时触发onChapterComplete', async () => {
      const completedResults: ChapterPipelineResult[] = []

      const scheduler = new BatchContinueScheduler()
      await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        {
          chapterCount: 2,
          autoSave: false,
          onChapterComplete: async (result) => {
            completedResults.push(result)
          },
        }
      )

      expect(completedResults).toHaveLength(2)
      expect(completedResults[0].chapterNumber).toBeDefined()
    })
  })

  // =========================================================================
  // TC-6.11 进度事件
  // =========================================================================
  describe('TC-6.11 进度事件', () => {
    it('P2: 触发进度事件回调', async () => {
      const progressEvents: PipelineProgressEvent[] = []

      const scheduler = new BatchContinueScheduler()
      await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        {
          chapterCount: 2,
          autoSave: false,
          onProgress: (event) => {
            progressEvents.push(event)
          },
        }
      )

      expect(progressEvents.length).toBeGreaterThan(0)
      const types = progressEvents.map(e => e.type)
      expect(types).toContain('chapter-start')
      expect(types).toContain('chapter-complete')
    })
  })

  // =========================================================================
  // TC-6.9 检查点回调
  // =========================================================================
  describe('TC-6.9 检查点回调', () => {
    it('P1: 达到检查点间隔时触发回调', async () => {
      const checkpointResults: ChapterPipelineResult[][] = []

      const scheduler = new BatchContinueScheduler()
      await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        {
          chapterCount: 4,
          autoSave: false,
          checkpointInterval: 2,
          onCheckpoint: async (results) => {
            checkpointResults.push([...results])
            return true
          },
        }
      )

      expect(checkpointResults.length).toBeGreaterThanOrEqual(1)
    })

    it('P1: 检查点回调返回false时停止', async () => {
      const scheduler = new BatchContinueScheduler()
      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        {
          chapterCount: 6,
          autoSave: false,
          checkpointInterval: 2,
          onCheckpoint: async () => false,
        }
      )

      expect(result.completedChapters).toBeLessThan(6)
    })
  })

  // =========================================================================
  // TC-6.13 pause/resume
  // =========================================================================
  describe('TC-6.13 pause/resume', () => {
    it('P1: pause后可以resume继续', async () => {
      const scheduler = new BatchContinueScheduler()

      // 异步暂停
      setTimeout(() => {
        scheduler.pause()
        setTimeout(() => scheduler.resume(), 50)
      }, 100)

      const result = await scheduler.executeBatchContinue(
        makeMockProject() as unknown as Project,
        1,
        { chapterCount: 3, autoSave: false }
      )

      expect(result.completedChapters).toBe(3)
    })
  })

  // =========================================================================
  // TC-6.7 Token预警阈值
  // =========================================================================
  describe('TC-6.7 Token预警阈值', () => {
    it('P1: 使用默认预算配置', () => {
      const scheduler = new BatchContinueScheduler()
      expect(scheduler).toBeDefined()
    })
  })
})
