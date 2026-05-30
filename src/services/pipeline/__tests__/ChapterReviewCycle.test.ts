import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  auditorAuditMock,
  reviserReviseMock,
  aggregatorAggregateMock,
  aggregatorCtorMock,
  snapshotManagerAddMock,
  snapshotManagerResetMock,
  snapshotManagerShouldStopMock,
  snapshotManagerGetFinalContentMock,
  snapshotManagerGenerateReportMock,
  snapshotManagerCtorMock,
  runPostWriteValidationMock,
} = vi.hoisted(() => ({
  auditorAuditMock: vi.fn(),
  reviserReviseMock: vi.fn(),
  aggregatorAggregateMock: vi.fn(),
  aggregatorCtorMock: vi.fn(),
  snapshotManagerAddMock: vi.fn(),
  snapshotManagerResetMock: vi.fn(),
  snapshotManagerShouldStopMock: vi.fn(),
  snapshotManagerGetFinalContentMock: vi.fn(),
  snapshotManagerGenerateReportMock: vi.fn(),
  snapshotManagerCtorMock: vi.fn(),
  runPostWriteValidationMock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// vi.mock() declarations
// ---------------------------------------------------------------------------

vi.mock('@/agents/ContinuityAuditor', () => ({
  ContinuityAuditor: vi.fn().mockImplementation(() => ({
    audit: auditorAuditMock,
  })),
  AUDIT_DIMENSIONS: ['plot', 'character', 'world', 'style', 'pacing'],
}))

vi.mock('@/agents/ReviserAgent', () => ({
  ReviserAgent: vi.fn().mockImplementation(() => ({
    revise: reviserReviseMock,
  })),
}))

vi.mock('@/agents/PostWriteValidator', () => ({
  runPostWriteValidation: runPostWriteValidationMock,
}))

vi.mock('@/services/pipeline/AuditResultAggregator', () => ({
  AuditResultAggregator: vi.fn().mockImplementation(() => {
    aggregatorCtorMock()
    return {
      aggregate: aggregatorAggregateMock,
    }
  }),
}))

vi.mock('@/services/pipeline/SnapshotManager', () => ({
  SnapshotManager: vi.fn().mockImplementation(() => {
    snapshotManagerCtorMock()
    return {
      reset: snapshotManagerResetMock,
      addSnapshot: snapshotManagerAddMock,
      shouldStop: snapshotManagerShouldStopMock,
      getFinalContent: snapshotManagerGetFinalContentMock,
      generateReport: snapshotManagerGenerateReportMock,
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

function makePostWriteResult(overrides: Record<string, unknown> = {}) {
  return {
    issues: [],
    ...overrides,
  }
}

function makeAuditResult(overrides: Record<string, unknown> = {}) {
  return {
    passed: true,
    overallScore: 88,
    issues: [],
    summary: '质量良好',
    dimensionScores: { plot: 90, character: 85 },
    // Use promptTokens/completionTokens to match actual ChapterReviewCycle source
    tokenUsage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
    ...overrides,
  }
}

function makeAggregatedReport(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 88,
    dimensionScores: { plot: 90, character: 85 },
    issues: [],
    summary: '质量良好',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterReviewCycle', () => {
  let ChapterReviewCycle: typeof import('@/services/pipeline/ChapterReviewCycle').ChapterReviewCycle

  beforeEach(async () => {
    vi.clearAllMocks()

    // Default mock setups
    runPostWriteValidationMock.mockResolvedValue(makePostWriteResult())
    auditorAuditMock.mockResolvedValue(makeAuditResult())
    aggregatorAggregateMock.mockReturnValue(makeAggregatedReport())
    snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: false, reason: '' })
    reviserReviseMock.mockResolvedValue({
      revisedContent: '修订后的内容',
      tokenUsage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
    })
    snapshotManagerGetFinalContentMock.mockReturnValue({
      content: '最终内容',
      score: 88,
      iteration: 0,
      auditResult: makeAuditResult(),
      aggregatedReport: makeAggregatedReport(),
    })
    snapshotManagerGenerateReportMock.mockReturnValue({ snapshots: [] })

    const mod = await import('@/services/pipeline/ChapterReviewCycle')
    ChapterReviewCycle = mod.ChapterReviewCycle
  })

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should set default values when no options provided', () => {
      new ChapterReviewCycle()

      expect(snapshotManagerCtorMock).toHaveBeenCalled()
      expect(aggregatorCtorMock).toHaveBeenCalled()
    })

    it('should accept custom options', () => {
      new ChapterReviewCycle({
        maxRetries: 5,
        passScoreThreshold: 95,
        netImprovementEpsilon: 10,
      })

      expect(snapshotManagerCtorMock).toHaveBeenCalled()
    })

    it('should use defaults for partial options', () => {
      new ChapterReviewCycle({ maxRetries: 3 })

      expect(snapshotManagerCtorMock).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // execute — basic flow
  // -----------------------------------------------------------------------
  describe('execute', () => {
    it('should run PostWriteValidator first', async () => {
      const cycle = new ChapterReviewCycle()

      await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 1,
      })

      expect(runPostWriteValidationMock).toHaveBeenCalledTimes(1)
      // ChapterReviewCycle passes {content, chapterNumber, ruleStack, genre, lengthSpec}
      expect(runPostWriteValidationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '测试章节内容',
          chapterNumber: 1,
        })
      )
    })

    it('should return ReviewCycleResult with correct fields', async () => {
      const cycle = new ChapterReviewCycle()

      const result = await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 1,
      })

      expect(result).toHaveProperty('finalContent')
      expect(result).toHaveProperty('finalWordCount')
      expect(result).toHaveProperty('auditResult')
      expect(result).toHaveProperty('aggregatedReport')
      expect(result).toHaveProperty('iterations')
      expect(result).toHaveProperty('rolledBack')
      expect(result).toHaveProperty('snapshotReport')
      expect(result).toHaveProperty('postWriteIssues')
      expect(result).toHaveProperty('sensitiveWordBlocked')
      expect(result).toHaveProperty('tokenUsage')
    })

    it('should call auditor after PostWriteValidator', async () => {
      // Make shouldStop return true after first audit to avoid revision loop
      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: true, reason: 'pass threshold met' })

      const cycle = new ChapterReviewCycle()

      await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 2,
      })

      expect(auditorAuditMock).toHaveBeenCalledTimes(1)
      expect(auditorAuditMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterContent: '测试章节内容',
          chapterNumber: 2,
        })
      )
    })

    it('should reset snapshot manager at start', async () => {
      const cycle = new ChapterReviewCycle()

      await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 1,
      })

      expect(snapshotManagerResetMock).toHaveBeenCalled()
    })

    it('should add initial snapshot after first audit', async () => {
      const cycle = new ChapterReviewCycle()

      await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 1,
      })

      expect(snapshotManagerAddMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '测试章节内容',
          score: 88,
          iteration: 0,
        })
      )
    })
  })

  // -----------------------------------------------------------------------
  // Sensitive word blocking
  // -----------------------------------------------------------------------
  describe('sensitive word blocking', () => {
    it('should return immediately when sensitive word critical issue detected', async () => {
      runPostWriteValidationMock.mockResolvedValue(
        makePostWriteResult({
          issues: [
            {
              severity: 'critical',
              category: 'sensitive_word',
              description: '包含违禁词汇',
              suggestion: '请删除违禁词汇',
            },
          ],
        })
      )

      const cycle = new ChapterReviewCycle()

      const result = await cycle.execute({
        chapterContent: '包含违禁词汇的内容',
        chapterNumber: 1,
      })

      expect(result.sensitiveWordBlocked).toBe(true)
      expect(result.iterations).toBe(0)
      expect(result.finalContent).toBe('包含违禁词汇的内容')
      expect(result.aggregatedReport.summary).toContain('敏感词')
      // Should NOT have called the auditor
      expect(auditorAuditMock).not.toHaveBeenCalled()
    })

    it('should not block when postWrite issues are non-critical', async () => {
      runPostWriteValidationMock.mockResolvedValue(
        makePostWriteResult({
          issues: [
            {
              severity: 'warning',
              category: 'sensitive_word',
              description: '疑似敏感词汇',
              suggestion: '请检查',
            },
          ],
        })
      )

      const cycle = new ChapterReviewCycle()

      const result = await cycle.execute({
        chapterContent: '正常内容',
        chapterNumber: 1,
      })

      expect(result.sensitiveWordBlocked).toBe(false)
      expect(auditorAuditMock).toHaveBeenCalled()
    })

    it('should not block when postWrite issues are critical but not sensitive_word category', async () => {
      runPostWriteValidationMock.mockResolvedValue(
        makePostWriteResult({
          issues: [
            {
              severity: 'critical',
              category: 'length_violation',
              description: '字数不足',
              suggestion: '请增加内容',
            },
          ],
        })
      )

      const cycle = new ChapterReviewCycle()

      const result = await cycle.execute({
        chapterContent: '短内容',
        chapterNumber: 1,
      })

      expect(result.sensitiveWordBlocked).toBe(false)
      expect(auditorAuditMock).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Rollback to best snapshot
  // -----------------------------------------------------------------------
  describe('rollback to best snapshot', () => {
    it('should use finalContent from snapshot manager (potentially rolled back)', async () => {
      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '最优快照版本内容',
        score: 92,
        iteration: 0,
        auditResult: makeAuditResult({ overallScore: 92 }),
        aggregatedReport: makeAggregatedReport({ overallScore: 92 }),
      })

      const cycle = new ChapterReviewCycle({ maxRetries: 2 })

      const result = await cycle.execute({
        chapterContent: '原始内容',
        chapterNumber: 1,
      })

      expect(result.finalContent).toBe('最优快照版本内容')
      expect(result.auditResult.overallScore).toBe(92)
    })

    it('should indicate rolledBack when snapshot iteration differs from iterations count', async () => {
      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '原始版本（更好）',
        score: 90,
        iteration: 0,
        auditResult: makeAuditResult({ overallScore: 90 }),
        aggregatedReport: makeAggregatedReport({ overallScore: 90 }),
      })

      // Mock shouldStop to allow one revision loop then stop
      snapshotManagerShouldStopMock
        .mockReturnValueOnce({ shouldStop: false, reason: '' })
        .mockReturnValueOnce({ shouldStop: true, reason: 'no improvement' })

      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订后的内容',
        tokenUsage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      })

      auditorAuditMock
        .mockResolvedValueOnce(makeAuditResult({ overallScore: 80, tokenUsage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 } }))
        .mockResolvedValueOnce(makeAuditResult({ overallScore: 78, tokenUsage: { promptTokens: 250, completionTokens: 350, totalTokens: 600 } }))

      aggregatorAggregateMock
        .mockReturnValueOnce(makeAggregatedReport({ overallScore: 80 }))
        .mockReturnValueOnce(makeAggregatedReport({ overallScore: 78 }))

      const cycle = new ChapterReviewCycle({ maxRetries: 2, netImprovementEpsilon: 5 })

      const result = await cycle.execute({
        chapterContent: '原始内容',
        chapterNumber: 1,
      })

      // iterations > 0 but final snapshot is from iteration 0 => rolledBack
      expect(result.iterations).toBe(1)
      expect(result.rolledBack).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Revision loop
  // -----------------------------------------------------------------------
  describe('revision loop', () => {
    it('should run revision when initial score is below pass threshold', async () => {
      auditorAuditMock.mockResolvedValue(makeAuditResult({ overallScore: 70 }))
      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport({ overallScore: 70 }))

      snapshotManagerShouldStopMock
        .mockReturnValueOnce({ shouldStop: false, reason: '' })  // after initial audit
        .mockReturnValueOnce({ shouldStop: true, reason: 'pass threshold met' })  // after first revision

      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订后的内容',
        tokenUsage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      })

      const cycle = new ChapterReviewCycle({ maxRetries: 3, passScoreThreshold: 85 })

      await cycle.execute({
        chapterContent: '测试内容',
        chapterNumber: 1,
      })

      expect(reviserReviseMock).toHaveBeenCalledTimes(1)
      // Two snapshots: initial + one revision
      expect(snapshotManagerAddMock).toHaveBeenCalledTimes(2)
    })

    it('should stop immediately when initial score meets pass threshold', async () => {
      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: true, reason: 'pass threshold met' })

      const cycle = new ChapterReviewCycle({ maxRetries: 3 })

      await cycle.execute({
        chapterContent: '高质量内容',
        chapterNumber: 1,
      })

      // No revision should occur
      expect(reviserReviseMock).not.toHaveBeenCalled()
      expect(snapshotManagerAddMock).toHaveBeenCalledTimes(1)  // Only the initial snapshot
    })
  })

  // -----------------------------------------------------------------------
  // Token usage tracking
  // -----------------------------------------------------------------------
  describe('token usage', () => {
    it('should aggregate token usage from auditor and reviser', async () => {
      auditorAuditMock
        .mockResolvedValueOnce(makeAuditResult({
          tokenUsage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
        }))
        .mockResolvedValueOnce(makeAuditResult({
          tokenUsage: { promptTokens: 250, completionTokens: 350, totalTokens: 600 },
        }))

      snapshotManagerShouldStopMock
        .mockReturnValueOnce({ shouldStop: false, reason: '' })
        .mockReturnValueOnce({ shouldStop: true, reason: 'done' })

      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订内容',
        tokenUsage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
      })

      const cycle = new ChapterReviewCycle({ maxRetries: 2 })

      const result = await cycle.execute({
        chapterContent: '测试内容',
        chapterNumber: 1,
      })

      // Total = initial audit(500) + revision(250) + re-audit(600) = 1350
      expect(result.tokenUsage.totalTokens).toBe(1350)
      expect(result.tokenUsage.inputTokens).toBe(550)
      expect(result.tokenUsage.outputTokens).toBe(800)
    })
  })
})
