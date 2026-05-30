/**
 * 接口自动化测试 — 审计-修订循环（ChapterReviewCycle）
 * 覆盖用例：TC-3.1 ~ TC-3.11
 * 优先级：P0 + P1
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  auditorAuditMock,
  reviserReviseMock,
  aggregatorAggregateMock,
  snapshotManagerAddMock,
  snapshotManagerResetMock,
  snapshotManagerShouldStopMock,
  snapshotManagerGetFinalContentMock,
  snapshotManagerGenerateReportMock,
  snapshotManagerHasNetImprovementMock,
  runPostWriteValidationMock,
} = vi.hoisted(() => ({
  auditorAuditMock: vi.fn(),
  reviserReviseMock: vi.fn(),
  aggregatorAggregateMock: vi.fn(),
  snapshotManagerAddMock: vi.fn(),
  snapshotManagerResetMock: vi.fn(),
  snapshotManagerShouldStopMock: vi.fn(),
  snapshotManagerGetFinalContentMock: vi.fn(),
  snapshotManagerGenerateReportMock: vi.fn(),
  snapshotManagerHasNetImprovementMock: vi.fn(),
  runPostWriteValidationMock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// vi.mock() declarations
// ---------------------------------------------------------------------------

vi.mock('@/agents/ContinuityAuditor', () => ({
  ContinuityAuditor: vi.fn().mockImplementation(() => ({
    audit: auditorAuditMock,
  })),
  AUDIT_DIMENSIONS: [
    { id: 'ooc', name: 'OOC检查', severity: 'critical', weight: 10 },
    { id: 'timeline', name: '时间线', severity: 'critical', weight: 9 },
    { id: 'lore', name: '设定冲突', severity: 'critical', weight: 9 },
    { id: 'pacing', name: '节奏', severity: 'warning', weight: 6 },
    { id: 'style', name: '文风', severity: 'warning', weight: 5 },
  ],
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
  AuditResultAggregator: vi.fn().mockImplementation(() => ({
    aggregate: aggregatorAggregateMock,
  })),
}))

vi.mock('@/services/pipeline/SnapshotManager', () => ({
  SnapshotManager: vi.fn().mockImplementation(() => ({
    reset: snapshotManagerResetMock,
    addSnapshot: snapshotManagerAddMock,
    shouldStop: snapshotManagerShouldStopMock,
    getFinalContent: snapshotManagerGetFinalContentMock,
    getBestSnapshot: vi.fn().mockReturnValue(null),
    getLatestSnapshot: vi.fn().mockReturnValue(null),
    generateReport: snapshotManagerGenerateReportMock,
    hasNetImprovement: snapshotManagerHasNetImprovementMock,
    isPassing: vi.fn().mockReturnValue(false),
  })),
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

function makeAuditResult(overrides: Record<string, unknown> = {}) {
  return {
    passed: true,
    overallScore: 88,
    issues: [],
    dimensionScores: {},
    summary: '通过',
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    ...overrides,
  }
}

function makeAggregatedReport(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 88,
    passed: true,
    dimensionScores: {},
    criticalIssues: [],
    warningIssues: [],
    infoIssues: [],
    summary: '通过',
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterReviewCycle 接口自动化测试', () => {
  let ChapterReviewCycle: typeof import('@/services/pipeline/ChapterReviewCycle').ChapterReviewCycle

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/pipeline/ChapterReviewCycle')
    ChapterReviewCycle = mod.ChapterReviewCycle
  })

  // =========================================================================
  // TC-3.1 正常审计通过（首次即通过）
  // =========================================================================
  describe('TC-3.1 正常审计通过', () => {
    it('P0: 初始评分>=85且无critical问题时无修订迭代', async () => {
      runPostWriteValidationMock.mockResolvedValue({ issues: [] })
      auditorAuditMock.mockResolvedValue({
        auditResult: makeAuditResult(),
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })
      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport({
        overallScore: 90,
        passed: true,
      }))

      // 首个快照通过，应停止
      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: true, reason: '已通过' })
      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '测试章节内容',
        wordCount: 500,
        auditResult: makeAuditResult({ overallScore: 90 }),
        rolledBack: false,
        iteration: 0,
        aggregatedReport: makeAggregatedReport({ overallScore: 90 }),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 1,
        bestSnapshotIndex: 0,
        bestScore: 90,
        worstScore: 90,
        scoreProgression: [90],
        comparisons: [],
      })

      const cycle = new ChapterReviewCycle()
      const result = await cycle.execute({
        chapterContent: '测试章节内容',
        chapterNumber: 1,
      })

      expect(result.iterations).toBe(0)
      expect(result.rolledBack).toBe(false)
      expect(result.sensitiveWordBlocked).toBe(false)
      expect(result.finalContent).toBe('测试章节内容')
      expect(result.aggregatedReport.overallScore).toBe(90)
    })
  })

  // =========================================================================
  // TC-3.2 初始不通过→修订后通过
  // =========================================================================
  describe('TC-3.2 初始不通过→修订后通过', () => {
    it('P0: 初始评分<85，修订后>=85时最终通过', async () => {
      runPostWriteValidationMock.mockResolvedValue({ issues: [] })

      // 第一次审计：70分
      auditorAuditMock.mockResolvedValueOnce({
        auditResult: makeAuditResult({ overallScore: 70, passed: false }),
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })

      aggregatorAggregateMock.mockReturnValueOnce(makeAggregatedReport({
        overallScore: 70,
        passed: false,
      }))

      // 第一次不应停止（需要修订）—— 代码检查 stopCheck.shouldStop
      snapshotManagerShouldStopMock.mockReturnValueOnce({ shouldStop: false, reason: '需要修订' })

      // Reviser返回修订内容
      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订后的内容',
        tokenUsage: { inputTokens: 80, outputTokens: 120, totalTokens: 200 },
      })

      // 第二次审计：88分
      auditorAuditMock.mockResolvedValueOnce({
        auditResult: makeAuditResult({ overallScore: 88, passed: true }),
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })

      aggregatorAggregateMock.mockReturnValueOnce(makeAggregatedReport({
        overallScore: 88,
        passed: true,
      }))

      // 第二次应停止（已通过）
      snapshotManagerShouldStopMock.mockReturnValueOnce({ shouldStop: true, reason: '已通过' })

      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '修订后的内容',
        wordCount: 600,
        auditResult: makeAuditResult({ overallScore: 88 }),
        rolledBack: false,
        iteration: 1,
        aggregatedReport: makeAggregatedReport({ overallScore: 88 }),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 2,
        bestSnapshotIndex: 1,
        bestScore: 88,
        worstScore: 70,
        scoreProgression: [70, 88],
        comparisons: [{ from: 0, to: 1, scoreDelta: 18, improved: true }],
      })

      const cycle = new ChapterReviewCycle()
      const result = await cycle.execute({
        chapterContent: '初始内容',
        chapterNumber: 1,
      })

      expect(result.iterations).toBeGreaterThan(0)
      expect(result.finalContent).toBe('修订后的内容')
      expect(result.sensitiveWordBlocked).toBe(false)
    })
  })

  // =========================================================================
  // TC-3.3 多次修订均不通过——达到maxRetries上限
  // =========================================================================
  describe('TC-3.3 多次修订均不通过', () => {
    it('P0: 达到maxRetries后使用最优快照', async () => {
      runPostWriteValidationMock.mockResolvedValue({ issues: [] })

      auditorAuditMock.mockResolvedValue({
        auditResult: makeAuditResult({ overallScore: 72, passed: false }),
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })

      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport({
        overallScore: 72,
        passed: false,
      }))

      // 第1次不通过，需要修订
      snapshotManagerShouldStopMock.mockReturnValueOnce({ shouldStop: false, reason: '需要修订' })
      // 第2次仍不通过，但达到maxRetries
      snapshotManagerShouldStopMock.mockReturnValueOnce({ shouldStop: true, reason: '达到最大迭代次数' })

      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订后内容',
        tokenUsage: { inputTokens: 80, outputTokens: 120, totalTokens: 200 },
      })

      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '最优快照内容',
        wordCount: 500,
        auditResult: makeAuditResult({ overallScore: 72 }),
        rolledBack: true,
        iteration: 0,
        aggregatedReport: makeAggregatedReport({ overallScore: 72 }),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 2,
        bestSnapshotIndex: 0,
        bestScore: 72,
        worstScore: 70,
        scoreProgression: [72, 70],
        comparisons: [{ from: 0, to: 1, scoreDelta: -2, improved: false }],
      })

      const cycle = new ChapterReviewCycle({ maxRetries: 1 })
      const result = await cycle.execute({
        chapterContent: '初始内容',
        chapterNumber: 1,
      })

      expect(result.rolledBack).toBe(true)
      expect(result.finalContent).toBe('最优快照内容')
    })
  })

  // =========================================================================
  // TC-3.4 敏感词阻断——立即终止循环
  // =========================================================================
  describe('TC-3.4 敏感词阻断', () => {
    it('P0: 检测到敏感词时立即终止且不执行审计', async () => {
      runPostWriteValidationMock.mockResolvedValue({
        issues: [{
          severity: 'critical',
          category: 'sensitive_word',
          description: '包含敏感词汇',
          location: '第3段',
        }],
      })

      const cycle = new ChapterReviewCycle()
      const result = await cycle.execute({
        chapterContent: '包含敏感词的内容',
        chapterNumber: 1,
      })

      expect(result.sensitiveWordBlocked).toBe(true)
      expect(result.iterations).toBe(0)
      // 审计不应被调用
      expect(auditorAuditMock).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // TC-3.5 快照回滚——修订后评分低于初始版本
  // =========================================================================
  describe('TC-3.5 快照回滚', () => {
    it('P0: 修订后评分低于初始版本时回滚', async () => {
      runPostWriteValidationMock.mockResolvedValue({ issues: [] })

      auditorAuditMock.mockResolvedValue({
        auditResult: makeAuditResult({ overallScore: 75 }),
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })

      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport({ overallScore: 75 }))

      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: false, reason: '需要修订' })

      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订后内容',
        tokenUsage: { inputTokens: 80, outputTokens: 120, totalTokens: 200 },
      })

      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '初始版本（最佳）',
        wordCount: 500,
        auditResult: makeAuditResult({ overallScore: 80 }),
        rolledBack: true,
        iteration: 0,
        aggregatedReport: makeAggregatedReport({ overallScore: 80 }),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 2,
        bestSnapshotIndex: 0,
        bestScore: 80,
        worstScore: 75,
        scoreProgression: [80, 75],
        comparisons: [{ from: 0, to: 1, scoreDelta: -5, improved: false }],
      })

      const cycle = new ChapterReviewCycle()
      const result = await cycle.execute({
        chapterContent: '初始内容',
        chapterNumber: 1,
      })

      expect(result.rolledBack).toBe(true)
      expect(result.finalContent).toBe('初始版本（最佳）')
    })
  })

  // =========================================================================
  // TC-3.8 PostWriteValidator步骤完整性
  // =========================================================================
  describe('TC-3.8 PostWriteValidator执行', () => {
    it('P1: PostWriteValidator先于ContinuityAuditor执行', async () => {
      const callOrder: string[] = []

      runPostWriteValidationMock.mockImplementation(async () => {
        callOrder.push('postWriteValidator')
        return { issues: [] }
      })

      auditorAuditMock.mockImplementation(async () => {
        callOrder.push('auditor')
        return {
          auditResult: makeAuditResult(),
          tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
        }
      })

      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport())
      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: true, reason: '已通过' })
      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '内容',
        wordCount: 100,
        auditResult: makeAuditResult(),
        rolledBack: false,
        iteration: 0,
        aggregatedReport: makeAggregatedReport(),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 1, bestSnapshotIndex: 0, bestScore: 88,
        worstScore: 88, scoreProgression: [88], comparisons: [],
      })

      const cycle = new ChapterReviewCycle()
      await cycle.execute({ chapterContent: '内容', chapterNumber: 1 })

      // auditor在auditAndAggregate中被调用一次
      // 如果shouldStop正确返回{shouldStop:true}，则auditor只调用1次
      // 但如果shouldStop未生效，auditor会被调用2次（loop中再次审计）
      // 无论哪种情况，postWriteValidator必须在auditor之前
      expect(callOrder[0]).toBe('postWriteValidator')
      expect(callOrder[1]).toBe('auditor')
      expect(callOrder.length).toBeGreaterThanOrEqual(2)
    })
  })

  // =========================================================================
  // TC-3.11 空内容输入
  // =========================================================================
  describe('TC-3.11 空内容输入', () => {
    it('P1: 空内容不崩溃', async () => {
      runPostWriteValidationMock.mockResolvedValue({ issues: [] })
      reviserReviseMock.mockResolvedValue({
        revisedContent: '修订内容',
        tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      })
      auditorAuditMock.mockResolvedValue({
        auditResult: makeAuditResult({ overallScore: 50 }),
        tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      })
      aggregatorAggregateMock.mockReturnValue(makeAggregatedReport({ overallScore: 50 }))
      snapshotManagerShouldStopMock.mockReturnValue({ shouldStop: true, reason: '初始快照' })
      snapshotManagerGetFinalContentMock.mockReturnValue({
        content: '',
        wordCount: 0,
        auditResult: makeAuditResult({ overallScore: 50 }),
        rolledBack: false,
        iteration: 0,
        aggregatedReport: makeAggregatedReport({ overallScore: 50 }),
      })
      snapshotManagerGenerateReportMock.mockReturnValue({
        totalSnapshots: 1, bestSnapshotIndex: 0, bestScore: 50,
        worstScore: 50, scoreProgression: [50], comparisons: [],
      })

      const cycle = new ChapterReviewCycle()
      const result = await cycle.execute({
        chapterContent: '',
        chapterNumber: 1,
      })

      expect(result).toBeDefined()
      expect(result.sensitiveWordBlocked).toBe(false)
    })
  })
})
