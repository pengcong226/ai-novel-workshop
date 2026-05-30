import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReviewSnapshot, AuditIssue } from '@/services/pipeline/types'

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

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

function makeAuditResult(overrides: Record<string, any> = {}) {
  return {
    passed: true,
    overallScore: 88,
    issues: [] as AuditIssue[],
    summary: '质量良好',
    dimensionScores: { plot: 90, character: 85 },
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    content: '章节内容',
    wordCount: 2000,
    auditResult: makeAuditResult(),
    score: 88,
    ...overrides,
  }
}

function makeCriticalIssue(category = 'sensitive_word'): AuditIssue {
  return {
    severity: 'critical',
    category,
    description: '包含敏感词汇',
    suggestion: '请删除',
  }
}

function makeWarningIssue(): AuditIssue {
  return {
    severity: 'warning',
    category: 'pacing',
    description: '节奏稍慢',
    suggestion: '建议加快节奏',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SnapshotManager', () => {
  let SnapshotManager: typeof import('@/services/pipeline/SnapshotManager').SnapshotManager

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/pipeline/SnapshotManager')
    SnapshotManager = mod.SnapshotManager
  })

  // =========================================================================
  // Constructor
  // =========================================================================
  describe('constructor', () => {
    it('should start with zero snapshots', () => {
      const mgr = new SnapshotManager()
      expect(mgr.size).toBe(0)
      expect(mgr.getAllSnapshots()).toEqual([])
    })

    it('should accept custom epsilon', () => {
      // Epsilon only affects hasNetImprovement threshold; no getter to verify directly.
      // We verify via hasNetImprovement behavior below.
      const mgr = new SnapshotManager(10)
      expect(mgr.size).toBe(0)
    })
  })

  // =========================================================================
  // addSnapshot
  // =========================================================================
  describe('addSnapshot', () => {
    it('should add snapshot and return its index', () => {
      const mgr = new SnapshotManager()

      const idx0 = mgr.addSnapshot(makeSnapshot({ score: 80 }))
      const idx1 = mgr.addSnapshot(makeSnapshot({ score: 90 }))

      expect(idx0).toBe(0)
      expect(idx1).toBe(1)
      expect(mgr.size).toBe(2)
    })

    it('should expose snapshots via getAllSnapshots in insertion order', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ content: 'first' }))
      mgr.addSnapshot(makeSnapshot({ content: 'second' }))

      const all = mgr.getAllSnapshots()
      expect(all[0].content).toBe('first')
      expect(all[1].content).toBe('second')
    })

    it('should return a shallow copy from getAllSnapshots', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot())

      const copy = mgr.getAllSnapshots()
      copy.pop()
      expect(mgr.size).toBe(1) // original unaffected
    })
  })

  // =========================================================================
  // getBestSnapshot
  // =========================================================================
  describe('getBestSnapshot', () => {
    it('should return null when no snapshots exist', () => {
      const mgr = new SnapshotManager()
      expect(mgr.getBestSnapshot()).toBeNull()
    })

    it('should return the single snapshot when only one exists', () => {
      const mgr = new SnapshotManager()
      const snap = makeSnapshot({ score: 75, content: 'draft' })
      mgr.addSnapshot(snap)

      const best = mgr.getBestSnapshot()
      expect(best?.score).toBe(75)
      expect(best?.content).toBe('draft')
    })

    it('should return snapshot with highest score', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70, content: 'v1' }))
      mgr.addSnapshot(makeSnapshot({ score: 92, content: 'v2' }))
      mgr.addSnapshot(makeSnapshot({ score: 85, content: 'v3' }))

      const best = mgr.getBestSnapshot()
      expect(best?.score).toBe(92)
      expect(best?.content).toBe('v2')
    })

    it('should prefer the latest snapshot when scores are tied', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 88, content: 'early' }))
      mgr.addSnapshot(makeSnapshot({ score: 88, content: 'later' }))

      const best = mgr.getBestSnapshot()
      expect(best?.content).toBe('later')
    })
  })

  // =========================================================================
  // getLatestSnapshot
  // =========================================================================
  describe('getLatestSnapshot', () => {
    it('should return null when no snapshots exist', () => {
      const mgr = new SnapshotManager()
      expect(mgr.getLatestSnapshot()).toBeNull()
    })

    it('should always return the last added snapshot', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ content: 'first' }))
      mgr.addSnapshot(makeSnapshot({ content: 'second' }))
      mgr.addSnapshot(makeSnapshot({ content: 'third' }))

      expect(mgr.getLatestSnapshot()?.content).toBe('third')
    })
  })

  // =========================================================================
  // hasNetImprovement
  // =========================================================================
  describe('hasNetImprovement', () => {
    it('should return false with zero snapshots', () => {
      const mgr = new SnapshotManager()
      expect(mgr.hasNetImprovement()).toBe(false)
    })

    it('should return false with only one snapshot', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      expect(mgr.hasNetImprovement()).toBe(false)
    })

    it('should return true when latest score exceeds previous best by epsilon', () => {
      const mgr = new SnapshotManager(3) // epsilon = 3
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 84 })) // delta = 4 >= 3

      expect(mgr.hasNetImprovement()).toBe(true)
    })

    it('should return false when latest score improvement is below epsilon', () => {
      const mgr = new SnapshotManager(3)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 82 })) // delta = 2 < 3

      expect(mgr.hasNetImprovement()).toBe(false)
    })

    it('should compare against the best of all previous snapshots, not just the immediate predecessor', () => {
      const mgr = new SnapshotManager(3)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 90 })) // best previous = 90
      mgr.addSnapshot(makeSnapshot({ score: 92 })) // delta = 2 < 3

      expect(mgr.hasNetImprovement()).toBe(false)
    })

    it('should return true when improvement exactly equals epsilon', () => {
      const mgr = new SnapshotManager(5)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 85 })) // delta = 5 == epsilon

      expect(mgr.hasNetImprovement()).toBe(true)
    })

    it('should return false when latest score is lower than previous best', () => {
      const mgr = new SnapshotManager(3)
      mgr.addSnapshot(makeSnapshot({ score: 90 }))
      mgr.addSnapshot(makeSnapshot({ score: 85 })) // delta = -5

      expect(mgr.hasNetImprovement()).toBe(false)
    })
  })

  // =========================================================================
  // isPassing
  // =========================================================================
  describe('isPassing', () => {
    it('should return false when no snapshots exist', () => {
      const mgr = new SnapshotManager()
      expect(mgr.isPassing(85)).toBe(false)
    })

    it('should return true when score >= threshold and no critical issues', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({ passed: true, issues: [] }),
      }))

      expect(mgr.isPassing(85)).toBe(true)
    })

    it('should return false when score < threshold', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 70,
        auditResult: makeAuditResult({ passed: false, issues: [] }),
      }))

      expect(mgr.isPassing(85)).toBe(false)
    })

    it('should return false when critical issues exist even with high score', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 95,
        auditResult: makeAuditResult({
          passed: false,
          overallScore: 95,
          issues: [makeCriticalIssue('sensitive_word')],
        }),
      }))

      expect(mgr.isPassing(85)).toBe(false)
    })

    it('should return true when only warning issues exist with passing score', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 88,
        auditResult: makeAuditResult({
          passed: true,
          issues: [makeWarningIssue()],
        }),
      }))

      expect(mgr.isPassing(85)).toBe(true)
    })

    it('should return true when score exactly equals threshold', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 85,
        auditResult: makeAuditResult({ passed: true, issues: [] }),
      }))

      expect(mgr.isPassing(85)).toBe(true)
    })
  })

  // =========================================================================
  // shouldStop
  // =========================================================================
  describe('shouldStop', () => {
    const defaultOpts = { maxIterations: 5, passScoreThreshold: 85 }

    it('should return shouldStop=false when no snapshots exist', () => {
      const mgr = new SnapshotManager()
      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(false)
    })

    it('should stop when latest snapshot passes (score >= threshold, no critical)', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({ passed: true, issues: [] }),
      }))

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('已通过')
    })

    it('should stop when only one snapshot exists (initial draft)', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70 }))

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('初始草稿')
    })

    it('should stop when no net improvement', () => {
      const mgr = new SnapshotManager(3)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 81 })) // delta = 1 < 3

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('无净改进')
    })

    it('should stop when latest content is empty', () => {
      const mgr = new SnapshotManager(1) // small epsilon so improvement check passes
      mgr.addSnapshot(makeSnapshot({ score: 80, content: 'old content' }))
      mgr.addSnapshot(makeSnapshot({
        score: 82, // below threshold 85 so isPassing returns false
        content: '',
        auditResult: makeAuditResult({ passed: false, issues: [] }),
      }))

      // isPassing(85) = false (82 < 85), hasNetImprovement = true (82 - 80 >= 1)
      // Content empty -> hits condition 4
      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('内容为空')
    })

    it('should stop when latest content is whitespace-only', () => {
      const mgr = new SnapshotManager(1)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({
        score: 82, // below threshold so isPassing returns false
        content: '   \n\t  ',
        auditResult: makeAuditResult({ passed: false, issues: [] }),
      }))

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('内容为空')
    })

    it('should stop when sensitive word critical issue detected', () => {
      const mgr = new SnapshotManager(1)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({
        score: 95,
        content: 'valid content with sensitive words',
        auditResult: makeAuditResult({
          passed: false,
          issues: [makeCriticalIssue('sensitive_word')],
        }),
      }))

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('敏感词')
    })

    it('should stop when sensitive keyword is in issue description', () => {
      const mgr = new SnapshotManager(1)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({
        score: 95,
        content: 'valid content',
        auditResult: makeAuditResult({
          passed: false,
          issues: [{
            severity: 'critical',
            category: 'content',
            description: '发现敏感词违规',
            suggestion: '修改',
          }],
        }),
      }))

      const result = mgr.shouldStop(defaultOpts)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('敏感词')
    })

    it('should stop when max iterations reached', () => {
      const mgr = new SnapshotManager(1) // tiny epsilon so improvement passes
      // Add 5 snapshots (maxIterations = 5)
      for (let i = 0; i < 5; i++) {
        mgr.addSnapshot(makeSnapshot({
          score: 70 + i * 5, // 70, 75, 80, 85, 90
          content: `content v${i}`,
          auditResult: makeAuditResult({
            passed: false,
            overallScore: 70 + i * 5,
            issues: [makeWarningIssue()],
          }),
        }))
      }

      const result = mgr.shouldStop({ maxIterations: 5, passScoreThreshold: 95 })
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('最大迭代次数')
    })

    it('should return shouldStop=false when iterations remain and improvement exists', () => {
      const mgr = new SnapshotManager(3)
      mgr.addSnapshot(makeSnapshot({ score: 70 }))
      mgr.addSnapshot(makeSnapshot({
        score: 80,
        content: 'improved content',
        auditResult: makeAuditResult({
          passed: false,
          overallScore: 80,
          issues: [makeWarningIssue()],
        }),
      }))

      const result = mgr.shouldStop({ maxIterations: 10, passScoreThreshold: 85 })
      expect(result.shouldStop).toBe(false)
      expect(result.reason).toContain('继续迭代')
    })

    it('should accept legacy positional arguments', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({ passed: true, issues: [] }),
      }))

      // Legacy: shouldStop(maxIterations, passScoreThreshold?)
      const result = mgr.shouldStop(5)
      expect(result.shouldStop).toBe(true)
    })

    it('should not stop for non-sensitive critical issues when improvement and content exist', () => {
      const mgr = new SnapshotManager(1)
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({
        score: 95,
        content: 'valid content',
        auditResult: makeAuditResult({
          passed: false,
          issues: [{
            severity: 'critical',
            category: 'plot_hole',
            description: '情节逻辑漏洞',
            suggestion: '修复情节矛盾',
          }],
        }),
      }))

      // Condition 1 (isPassing): false (critical issue present)
      // Condition 2 (single): false (2 snapshots)
      // Condition 3 (no improvement): false (95 - 80 = 15 >= 1)
      // Condition 4 (empty content): false
      // Condition 5 (sensitive): false (category='plot_hole', desc doesn't contain '敏感词')
      // Condition 6 (max iter): false (2 < 10)
      const result = mgr.shouldStop({ maxIterations: 10, passScoreThreshold: 85 })
      expect(result.shouldStop).toBe(false)
    })
  })

  // =========================================================================
  // getFinalContent
  // =========================================================================
  describe('getFinalContent', () => {
    it('should throw when no snapshots exist', () => {
      const mgr = new SnapshotManager()
      expect(() => mgr.getFinalContent()).toThrow('快照列表为空')
    })

    it('should return latest content when latest has the highest score', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70, content: 'draft v1' }))
      mgr.addSnapshot(makeSnapshot({ score: 90, content: 'revised v2' }))

      const result = mgr.getFinalContent()
      expect(result.content).toBe('revised v2')
      expect(result.rolledBack).toBe(false)
    })

    it('should rollback to best snapshot when best score is higher than latest', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 90, content: 'best version', iteration: 0 }))
      mgr.addSnapshot(makeSnapshot({ score: 70, content: 'degraded version', iteration: 1 }))

      const result = mgr.getFinalContent()
      expect(result.content).toBe('best version')
      expect(result.rolledBack).toBe(true)
      expect(result.iteration).toBe(0)
    })

    it('should use latest when scores are equal (best === latest index)', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 85, content: 'v1' }))
      mgr.addSnapshot(makeSnapshot({ score: 85, content: 'v2' }))
      // Best = index 1 (tie-breaking prefers later), latest = index 1
      // bestIndex === latestIndex => no rollback

      const result = mgr.getFinalContent()
      expect(result.content).toBe('v2')
      expect(result.rolledBack).toBe(false)
    })

    it('should return wordCount and auditResult from the selected snapshot', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 90,
        content: 'best',
        wordCount: 3000,
        auditResult: makeAuditResult({ overallScore: 90 }),
      }))
      mgr.addSnapshot(makeSnapshot({
        score: 70,
        content: 'worst',
        wordCount: 2500,
        auditResult: makeAuditResult({ overallScore: 70 }),
      }))

      const result = mgr.getFinalContent()
      expect(result.wordCount).toBe(3000)
      expect(result.auditResult.overallScore).toBe(90)
    })

    it('should include aggregatedReport when rolling back', () => {
      const report = { overallScore: 90, dimensionScores: {}, issues: [], summary: 'good' }
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({
        score: 90,
        content: 'best',
        aggregatedReport: report as any,
      }))
      mgr.addSnapshot(makeSnapshot({ score: 70, content: 'degraded' }))

      const result = mgr.getFinalContent()
      expect(result.rolledBack).toBe(true)
      expect(result.aggregatedReport).toEqual(report)
    })

    it('should use latest when best is the latest snapshot itself', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70, content: 'v1' }))
      mgr.addSnapshot(makeSnapshot({ score: 80, content: 'v2' }))
      mgr.addSnapshot(makeSnapshot({ score: 95, content: 'v3' }))

      const result = mgr.getFinalContent()
      // best = index 2, latest = index 2 -> no rollback
      expect(result.content).toBe('v3')
      expect(result.rolledBack).toBe(false)
    })
  })

  // =========================================================================
  // generateReport
  // =========================================================================
  describe('generateReport', () => {
    it('should return zero values when no snapshots', () => {
      const mgr = new SnapshotManager()
      const report = mgr.generateReport()

      expect(report.totalSnapshots).toBe(0)
      expect(report.bestSnapshotIndex).toBe(-1)
      expect(report.bestScore).toBe(0)
      expect(report.worstScore).toBe(0)
      expect(report.scoreProgression).toEqual([])
      expect(report.comparisons).toEqual([])
    })

    it('should compute correct score progression', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70 }))
      mgr.addSnapshot(makeSnapshot({ score: 85 }))
      mgr.addSnapshot(makeSnapshot({ score: 90 }))

      const report = mgr.generateReport()
      expect(report.scoreProgression).toEqual([70, 85, 90])
    })

    it('should identify best and worst scores', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 85 }))
      mgr.addSnapshot(makeSnapshot({ score: 60 }))
      mgr.addSnapshot(makeSnapshot({ score: 95 }))

      const report = mgr.generateReport()
      expect(report.bestScore).toBe(95)
      expect(report.worstScore).toBe(60)
    })

    it('should generate pairwise comparisons with correct deltas', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 70, wordCount: 2000 }))
      mgr.addSnapshot(makeSnapshot({ score: 80, wordCount: 2500 }))
      mgr.addSnapshot(makeSnapshot({ score: 75, wordCount: 2200 }))

      const report = mgr.generateReport()
      expect(report.comparisons).toHaveLength(2)

      expect(report.comparisons[0]).toEqual({
        from: 0,
        to: 1,
        scoreDelta: 10,
        wordCountDelta: 500,
        improved: true,
      })
      expect(report.comparisons[1]).toEqual({
        from: 1,
        to: 2,
        scoreDelta: -5,
        wordCountDelta: -300,
        improved: false,
      })
    })

    it('should include snapshots detail list', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 80, wordCount: 1500, iteration: 0 }))
      mgr.addSnapshot(makeSnapshot({ score: 90, wordCount: 2000, iteration: 1 }))

      const report = mgr.generateReport()
      expect(report.snapshots).toHaveLength(2)
      expect(report.snapshots![0]).toEqual({ iteration: 0, score: 80, wordCount: 1500 })
      expect(report.snapshots![1]).toEqual({ iteration: 1, score: 90, wordCount: 2000 })
    })

    it('should default iteration to array index when not set', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 80 })) // iteration not set

      const report = mgr.generateReport()
      expect(report.snapshots![0].iteration).toBe(0)
    })
  })

  // =========================================================================
  // clear / reset
  // =========================================================================
  describe('clear and reset', () => {
    it('should remove all snapshots on clear', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot())
      mgr.addSnapshot(makeSnapshot())
      expect(mgr.size).toBe(2)

      mgr.clear()
      expect(mgr.size).toBe(0)
      expect(mgr.getLatestSnapshot()).toBeNull()
      expect(mgr.getBestSnapshot()).toBeNull()
    })

    it('should remove all snapshots on reset', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot())
      mgr.addSnapshot(makeSnapshot())

      mgr.reset()
      expect(mgr.size).toBe(0)
    })

    it('should be safe to call clear/reset on empty manager', () => {
      const mgr = new SnapshotManager()
      expect(() => mgr.clear()).not.toThrow()
      expect(() => mgr.reset()).not.toThrow()
      expect(mgr.size).toBe(0)
    })
  })

  // =========================================================================
  // size
  // =========================================================================
  describe('size', () => {
    it('should reflect the number of added snapshots', () => {
      const mgr = new SnapshotManager()
      expect(mgr.size).toBe(0)
      mgr.addSnapshot(makeSnapshot())
      expect(mgr.size).toBe(1)
      mgr.addSnapshot(makeSnapshot())
      expect(mgr.size).toBe(2)
      mgr.clear()
      expect(mgr.size).toBe(0)
    })
  })

  // =========================================================================
  // Custom epsilon behavior
  // =========================================================================
  describe('custom epsilon', () => {
    it('should use default epsilon of 3 when not specified', () => {
      const mgr = new SnapshotManager()
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 82 })) // delta = 2 < 3

      expect(mgr.hasNetImprovement()).toBe(false)
    })

    it('should use custom epsilon for net improvement check', () => {
      const mgr = new SnapshotManager(1) // epsilon = 1
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({ score: 82 })) // delta = 2 >= 1

      expect(mgr.hasNetImprovement()).toBe(true)
    })

    it('should use custom epsilon in shouldStop no-improvement check', () => {
      const mgr = new SnapshotManager(10) // large epsilon
      mgr.addSnapshot(makeSnapshot({ score: 80 }))
      mgr.addSnapshot(makeSnapshot({
        score: 88, // delta = 8 < 10
        content: 'some content',
        auditResult: makeAuditResult({
          passed: false,
          issues: [makeWarningIssue()],
        }),
      }))

      const result = mgr.shouldStop({ maxIterations: 5, passScoreThreshold: 95 })
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('无净改进')
    })
  })
})
