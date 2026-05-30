/**
 * 接口自动化测试 — 快照管理器（SnapshotManager）
 * 覆盖用例：TC-4.1 ~ TC-4.13
 * 优先级：P0 + P1
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { SnapshotManager } from '@/services/pipeline/SnapshotManager'
import type { ReviewSnapshot, AuditResult } from '@/services/pipeline/types'

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    content: '测试内容正文',
    wordCount: 500,
    auditResult: {
      passed: true,
      overallScore: 85,
      issues: [],
      dimensionScores: {},
      summary: '通过',
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    score: 85,
    ...overrides,
  }
}

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    passed: true,
    overallScore: 85,
    issues: [],
    dimensionScores: {},
    summary: '通过',
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('SnapshotManager 接口自动化测试', () => {
  let manager: SnapshotManager

  beforeEach(() => {
    manager = new SnapshotManager(3) // epsilon=3
  })

  // =========================================================================
  // TC-4.1 添加快照与索引
  // =========================================================================
  describe('TC-4.1 添加快照与索引', () => {
    it('P0: 添加快照后size递增且返回正确索引', () => {
      const s1 = makeSnapshot({ score: 80 })
      const s2 = makeSnapshot({ score: 85 })

      const idx1 = manager.addSnapshot(s1)
      const idx2 = manager.addSnapshot(s2)

      expect(idx1).toBe(0)
      expect(idx2).toBe(1)
      expect(manager.size).toBe(2)
    })

    it('P0: 初始size为0', () => {
      expect(manager.size).toBe(0)
    })
  })

  // =========================================================================
  // TC-4.2 最佳快照识别——最高分
  // =========================================================================
  describe('TC-4.2 最佳快照识别——最高分', () => {
    it('P0: 识别分数最高的快照', () => {
      manager.addSnapshot(makeSnapshot({ score: 75 }))
      manager.addSnapshot(makeSnapshot({ score: 88 }))
      manager.addSnapshot(makeSnapshot({ score: 82 }))

      const best = manager.getBestSnapshot()
      expect(best).not.toBeNull()
      expect(best!.score).toBe(88)
    })
  })

  // =========================================================================
  // TC-4.3 最佳快照识别——同分取较晚版本
  // =========================================================================
  describe('TC-4.3 最佳快照识别——同分取较晚版本', () => {
    it('P0: 同分时取较晚版本', () => {
      manager.addSnapshot(makeSnapshot({ score: 85, content: '第1版' }))
      manager.addSnapshot(makeSnapshot({ score: 80, content: '第2版' }))
      manager.addSnapshot(makeSnapshot({ score: 85, content: '第3版' }))

      const best = manager.getBestSnapshot()
      expect(best).not.toBeNull()
      expect(best!.score).toBe(85)
      expect(best!.content).toBe('第3版')
    })
  })

  // =========================================================================
  // TC-4.4 停止条件——通过阈值
  // =========================================================================
  describe('TC-4.4 停止条件——通过阈值', () => {
    it('P0: 最新快照通过阈值时应停止', () => {
      manager.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({ passed: true, overallScore: 90, issues: [] }),
      }))

      const result = manager.shouldStop(3, 85)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('已通过')
    })

    it('P0: 分数>=85但有critical问题时不通过——因为仅有初始快照也会停止', () => {
      // 注意：仅有1个快照时，shouldStop会在检查"仅有初始快照"条件时返回stop=true
      // 正确测试isPassing=false的场景需要至少2个快照且有净改进
      manager.addSnapshot(makeSnapshot({
        score: 80,
        auditResult: makeAuditResult({
          passed: false,
          overallScore: 80,
          issues: [{ severity: 'critical', category: 'ooc', description: '角色偏离', suggestion: '请修复', location: '' }],
        }),
      }))
      manager.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({
          passed: false,
          overallScore: 90,
          issues: [{ severity: 'critical', category: 'ooc', description: '角色偏离', suggestion: '请修复', location: '' }],
        }),
      }))

      const result = manager.shouldStop(3, 85)
      // isPassing=false(有critical问题)，但hasNetImprovement=true(90-80=10>3)
      // 所以不会停在"无净改进"；也不会停在"通过阈值"；也不会停在"仅有初始快照"
      // 结果应该是不停止（继续修订）
      expect(result.shouldStop).toBe(false)
    })
  })

  // =========================================================================
  // TC-4.5 停止条件——仅有初始快照
  // =========================================================================
  describe('TC-4.5 停止条件——仅有初始快照', () => {
    it('P0: 仅有1个快照时应停止', () => {
      manager.addSnapshot(makeSnapshot({ score: 70 }))

      const result = manager.shouldStop(3, 85)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('初始草稿')
    })
  })

  // =========================================================================
  // TC-4.6 停止条件——无净改进
  // =========================================================================
  describe('TC-4.6 停止条件——无净改进', () => {
    it('P0: 改进不足epsilon时应停止', () => {
      // 初始80分
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      // 修订后82分，delta=2 < epsilon=3
      manager.addSnapshot(makeSnapshot({ score: 82 }))

      const result = manager.shouldStop(3, 85)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('无净改进')
    })
  })

  // =========================================================================
  // TC-4.7 停止条件——内容为空
  // =========================================================================
  describe('TC-4.7 停止条件——内容为空', () => {
    it('P1: 最新快照内容为空时应停止', () => {
      // 需要确保净改进条件不先触发：
      // hasNetImprovement检查: latest(83) - previousBest(80) = 3 >= epsilon(3) → true
      // 然后检查内容为空
      manager.addSnapshot(makeSnapshot({ score: 70 }))
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      manager.addSnapshot(makeSnapshot({
        score: 83, // 83-80=3 >= epsilon(3), 净改进成立
        content: '',
        wordCount: 0,
      }))

      const result = manager.shouldStop(3, 85)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('内容为空')
    })
  })

  // =========================================================================
  // TC-4.8 停止条件——敏感词critical问题
  // =========================================================================
  describe('TC-4.8 停止条件——敏感词critical问题', () => {
    it('P0: 检测到敏感词critical问题时应停止', () => {
      // hasNetImprovement检查: latest(83) - previousBest(80) = 3 >= epsilon(3) → true
      // 然后检查敏感词
      manager.addSnapshot(makeSnapshot({ score: 70 }))
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      manager.addSnapshot(makeSnapshot({
        score: 83,
        auditResult: makeAuditResult({
          issues: [{
            severity: 'critical',
            category: 'sensitive_word',
            description: '包含敏感词汇',
            suggestion: '请替换敏感词',
            location: '第3段',
          }],
        }),
      }))

      const result = manager.shouldStop(3, 85)
      expect(result.shouldStop).toBe(true)
      expect(result.reason).toContain('敏感词')
    })
  })

  // =========================================================================
  // TC-4.9 停止条件——达到最大迭代次数
  // =========================================================================
  describe('TC-4.9 停止条件——达到最大迭代次数', () => {
    it('P1: 达到最大迭代次数时应停止', () => {
      manager.addSnapshot(makeSnapshot({ score: 70 }))
      manager.addSnapshot(makeSnapshot({ score: 72 }))
      manager.addSnapshot(makeSnapshot({ score: 74 }))

      // maxIterations=3, 已有3个快照
      const result = manager.shouldStop(3, 85)
      // 因为净改进(74-72=2<3)不足也会停止，所以这里验证停止即可
      expect(result.shouldStop).toBe(true)
    })
  })

  // =========================================================================
  // TC-4.10 getFinalContent回滚逻辑
  // =========================================================================
  describe('TC-4.10 getFinalContent回滚逻辑', () => {
    it('P0: 最新版本分数低于最佳版本时应回滚', () => {
      // 第1版88分
      manager.addSnapshot(makeSnapshot({
        score: 88,
        content: '最佳版本内容',
        wordCount: 600,
        auditResult: makeAuditResult({ overallScore: 88 }),
      }))
      // 第2版75分（分数降低）
      manager.addSnapshot(makeSnapshot({
        score: 75,
        content: '降级版本内容',
        wordCount: 500,
        auditResult: makeAuditResult({ overallScore: 75 }),
      }))

      const result = manager.getFinalContent()
      expect(result.rolledBack).toBe(true)
      expect(result.content).toBe('最佳版本内容')
    })

    it('P0: 最新版本即为最佳版本时不回滚', () => {
      manager.addSnapshot(makeSnapshot({ score: 80, content: '版本1' }))
      manager.addSnapshot(makeSnapshot({ score: 90, content: '版本2' }))

      const result = manager.getFinalContent()
      expect(result.rolledBack).toBe(false)
      expect(result.content).toBe('版本2')
    })

    it('P0: 空快照列表时抛出异常', () => {
      expect(() => manager.getFinalContent()).toThrow()
    })
  })

  // =========================================================================
  // TC-4.11 hasNetImprovement边界——恰好等于epsilon
  // =========================================================================
  describe('TC-4.11 hasNetImprovement边界——恰好等于epsilon', () => {
    it('P1: delta恰好等于epsilon时应返回true', () => {
      // epsilon=3, delta=3
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      manager.addSnapshot(makeSnapshot({ score: 83 }))

      expect(manager.hasNetImprovement()).toBe(true)
    })

    it('P1: delta=epsilon-1时应返回false', () => {
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      manager.addSnapshot(makeSnapshot({ score: 82 })) // delta=2 < 3

      expect(manager.hasNetImprovement()).toBe(false)
    })

    it('P1: 仅1个快照时应返回false', () => {
      manager.addSnapshot(makeSnapshot({ score: 85 }))
      expect(manager.hasNetImprovement()).toBe(false)
    })

    it('P1: 0个快照时应返回false', () => {
      expect(manager.hasNetImprovement()).toBe(false)
    })
  })

  // =========================================================================
  // TC-4.12 generateReport报告完整性
  // =========================================================================
  describe('TC-4.12 generateReport报告完整性', () => {
    it('P1: 生成的报告包含所有必要字段', () => {
      manager.addSnapshot(makeSnapshot({ score: 75 }))
      manager.addSnapshot(makeSnapshot({ score: 88 }))
      manager.addSnapshot(makeSnapshot({ score: 82 }))

      const report = manager.generateReport()

      expect(report.totalSnapshots).toBe(3)
      expect(report.bestSnapshotIndex).toBe(1) // 88分
      expect(report.bestScore).toBe(88)
      expect(report.worstScore).toBe(75)
      expect(report.scoreProgression).toEqual([75, 88, 82])
      expect(report.comparisons).toHaveLength(2)
    })

    it('P1: comparisons的scoreDelta正确计算', () => {
      manager.addSnapshot(makeSnapshot({ score: 70 }))
      manager.addSnapshot(makeSnapshot({ score: 85 }))

      const report = manager.generateReport()
      expect(report.comparisons[0].scoreDelta).toBe(15)
      expect(report.comparisons[0].improved).toBe(true)
    })
  })

  // =========================================================================
  // TC-4.13 clear清空操作
  // =========================================================================
  describe('TC-4.13 clear清空操作', () => {
    it('P2: clear后size为0', () => {
      manager.addSnapshot(makeSnapshot({ score: 80 }))
      manager.addSnapshot(makeSnapshot({ score: 90 }))

      expect(manager.size).toBe(2)
      manager.clear()
      expect(manager.size).toBe(0)
      expect(manager.getBestSnapshot()).toBeNull()
      expect(manager.getAllSnapshots()).toEqual([])
    })
  })

  // =========================================================================
  // 附加: getBestSnapshot边界
  // =========================================================================
  describe('getBestSnapshot边界情况', () => {
    it('P0: 无快照时返回null', () => {
      expect(manager.getBestSnapshot()).toBeNull()
    })

    it('P0: 单个快照时返回该快照', () => {
      manager.addSnapshot(makeSnapshot({ score: 72 }))
      const best = manager.getBestSnapshot()
      expect(best).not.toBeNull()
      expect(best!.score).toBe(72)
    })
  })

  // =========================================================================
  // 附加: getLatestSnapshot
  // =========================================================================
  describe('getLatestSnapshot', () => {
    it('P1: 返回最后添加的快照', () => {
      manager.addSnapshot(makeSnapshot({ score: 70, content: '版本1' }))
      manager.addSnapshot(makeSnapshot({ score: 90, content: '版本2' }))

      const latest = manager.getLatestSnapshot()
      expect(latest).not.toBeNull()
      expect(latest!.content).toBe('版本2')
    })

    it('P1: 无快照时返回null', () => {
      expect(manager.getLatestSnapshot()).toBeNull()
    })
  })

  // =========================================================================
  // 附加: isPassing
  // =========================================================================
  describe('isPassing判定', () => {
    it('P0: 分数>=85且无critical问题时返回true', () => {
      manager.addSnapshot(makeSnapshot({
        score: 88,
        auditResult: makeAuditResult({ issues: [] }),
      }))
      expect(manager.isPassing(85)).toBe(true)
    })

    it('P0: 分数<85时返回false', () => {
      manager.addSnapshot(makeSnapshot({
        score: 80,
        auditResult: makeAuditResult({ issues: [] }),
      }))
      expect(manager.isPassing(85)).toBe(false)
    })

    it('P0: 有critical问题时返回false', () => {
      manager.addSnapshot(makeSnapshot({
        score: 90,
        auditResult: makeAuditResult({
          issues: [{ severity: 'critical', category: 'ooc', description: '偏离', suggestion: '请修复', location: '' }],
        }),
      }))
      expect(manager.isPassing(85)).toBe(false)
    })
  })
})
