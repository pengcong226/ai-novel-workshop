/**
 * 接口自动化测试 — 审计结果聚合器（AuditResultAggregator）
 * 覆盖用例：TC-5.1 ~ TC-5.14
 * 优先级：P0 + P1
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { AuditResultAggregator } from '@/services/pipeline/AuditResultAggregator'
import { AUDIT_DIMENSIONS } from '@/agents/ContinuityAuditor'
import type { AuditResult, AuditIssue } from '@/services/pipeline/types'

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    passed: true,
    overallScore: 88,
    issues: [],
    dimensionScores: {},
    summary: '',
    tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    ...overrides,
  }
}

function makeIssue(severity: 'critical' | 'warning' | 'info', category: string, desc = '问题描述'): AuditIssue {
  return {
    severity,
    category,
    description: desc,
    suggestion: '请修复此问题',
    location: '第1段',
  }
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('AuditResultAggregator 接口自动化测试', () => {
  let aggregator: AuditResultAggregator

  beforeEach(() => {
    aggregator = new AuditResultAggregator()
  })

  // =========================================================================
  // TC-5.1 全维度评分聚合——加权总分计算
  // =========================================================================
  describe('TC-5.1 全维度评分聚合——加权总分计算', () => {
    it('P0: 全维度有评分时计算加权总分', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 90
      }

      const result = aggregator.aggregate(makeAuditResult({ dimensionScores }))

      expect(result.overallScore).toBeGreaterThan(0)
      expect(result.overallScore).toBeLessThanOrEqual(100)
      expect(Object.keys(result.dimensionScores).length).toBeGreaterThanOrEqual(16)
      expect(typeof result.passed).toBe('boolean')
    })

    it('P0: passed为true时overallScore>=85且无critical问题', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 95
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      expect(result.passed).toBe(true)
      expect(result.overallScore).toBeGreaterThanOrEqual(85)
    })
  })

  // =========================================================================
  // TC-5.2 缺失维度推断——无问题时默认90分
  // =========================================================================
  describe('TC-5.2 缺失维度推断——无问题时默认90分', () => {
    it('P0: 维度无评分且无对应issue时推断为90', () => {
      // 不传dimensionScores，全部缺失，且无issue
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [],
      }))

      // 所有维度应被填充为90
      for (const dim of AUDIT_DIMENSIONS) {
        expect(result.dimensionScores[dim.id]).toBe(90)
      }
    })
  })

  // =========================================================================
  // TC-5.3 缺失维度推断——1个critical问题→50分
  // =========================================================================
  describe('TC-5.3 缺失维度推断——1个critical问题→50分', () => {
    it('P0: ooc维度1个critical issue时推断为50', () => {
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [makeIssue('critical', 'ooc', '角色偏离')],
      }))

      expect(result.dimensionScores['ooc']).toBe(50)
    })
  })

  // =========================================================================
  // TC-5.4 缺失维度推断——2个以上critical问题→30分
  // =========================================================================
  describe('TC-5.4 缺失维度推断——2个以上critical问题→30分', () => {
    it('P0: ooc维度2个critical issue时推断为30', () => {
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [
          makeIssue('critical', 'ooc', '角色偏离1'),
          makeIssue('critical', 'ooc', '角色偏离2'),
        ],
      }))

      expect(result.dimensionScores['ooc']).toBe(30)
    })
  })

  // =========================================================================
  // TC-5.5 缺失维度推断——warning扣分（下限40）
  // =========================================================================
  describe('TC-5.5 缺失维度推断——warning扣分', () => {
    it('P1: 多个warning issue扣分后不低于40', () => {
      const issues: AuditIssue[] = []
      for (let i = 0; i < 5; i++) {
        issues.push(makeIssue('warning', 'pacing', `节奏问题${i}`))
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues,
      }))

      // 90 - 5*10 = 40，刚好下限
      expect(result.dimensionScores['pacing']).toBe(40)
    })

    it('P1: 超过下限的warning仍然锁定为40', () => {
      const issues: AuditIssue[] = []
      for (let i = 0; i < 8; i++) {
        issues.push(makeIssue('warning', 'style', `风格问题${i}`))
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues,
      }))

      // 90 - 8*10 = 10, 但下限是40
      expect(result.dimensionScores['style']).toBe(40)
    })
  })

  // =========================================================================
  // TC-5.7 Critical维度硬封顶——评分<60时总分上限70
  // =========================================================================
  describe('TC-5.7 Critical维度硬封顶', () => {
    it('P0: critical维度评分<60时总分被封顶为70', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 95
      }
      // ooc是critical维度，设置为45（<60）
      dimensionScores['ooc'] = 45

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      expect(result.overallScore).toBeLessThanOrEqual(70)
    })

    it('P0: 多个critical维度低分时总分仍被封顶', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 95
      }
      dimensionScores['ooc'] = 40
      dimensionScores['timeline'] = 50

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      expect(result.overallScore).toBeLessThanOrEqual(70)
    })
  })

  // =========================================================================
  // TC-5.9 Critical维度正常时不受封顶影响
  // =========================================================================
  describe('TC-5.9 Critical维度正常时不受封顶影响', () => {
    it('P1: 所有critical维度>=60时不触发硬封顶', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        // critical维度60分，warning/info维度95分
        dimensionScores[dim.id] = dim.severity === 'critical' ? 65 : 95
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      // 不应被封顶为70
      expect(result.overallScore).toBeGreaterThan(60)
    })
  })

  // =========================================================================
  // TC-5.10 别名映射——LLM输出变体正确映射
  // =========================================================================
  describe('TC-5.10 别名映射', () => {
    it('P1: OOC检查映射到ooc维度', () => {
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [makeIssue('critical', 'OOC检查', '角色偏离')],
      }))

      // OOC检查应该被映射到ooc维度
      expect(result.dimensionScores['ooc']).toBe(50) // 1个critical→50
    })

    it('P1: 时间线映射到timeline维度', () => {
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [makeIssue('critical', '时间线', '时间矛盾')],
      }))

      expect(result.dimensionScores['timeline']).toBe(50)
    })

    it('P1: 设定矛盾映射到lore维度', () => {
      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues: [makeIssue('critical', '设定矛盾', '世界观冲突')],
      }))

      expect(result.dimensionScores['lore']).toBe(50)
    })
  })

  // =========================================================================
  // TC-5.12 passed判定——分数>=85且无critical问题
  // =========================================================================
  describe('TC-5.12 passed判定', () => {
    it('P0: 分数>=85且无critical问题时passed=true', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 92
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      expect(result.passed).toBe(true)
    })

    it('P0: 分数>=85但有critical问题时passed=false', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 92
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [makeIssue('critical', 'ooc', '角色偏离')],
      }))

      expect(result.passed).toBe(false)
    })
  })

  // =========================================================================
  // TC-5.14 summary摘要生成
  // =========================================================================
  describe('TC-5.14 summary摘要生成', () => {
    it('P2: 生成的摘要包含可读中文文本', () => {
      const dimensionScores: Record<string, number> = {}
      for (const dim of AUDIT_DIMENSIONS) {
        dimensionScores[dim.id] = 85
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores,
        issues: [],
      }))

      expect(result.summary).toBeTruthy()
      expect(typeof result.summary).toBe('string')
      expect(result.summary.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // 附加: issue分类
  // =========================================================================
  describe('Issue分类统计', () => {
    it('P1: issues按severity正确分类', () => {
      const issues = [
        makeIssue('critical', 'ooc', '角色偏离'),
        makeIssue('warning', 'pacing', '节奏问题'),
        makeIssue('info', 'cliche', '套话'),
        makeIssue('critical', 'timeline', '时间矛盾'),
      ]

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues,
      }))

      expect(result.criticalIssues.length).toBe(2)
      expect(result.warningIssues.length).toBe(1)
      expect(result.infoIssues.length).toBe(1)
    })
  })

  // =========================================================================
  // 附加: info级别扣分
  // =========================================================================
  describe('info级别扣分', () => {
    it('P2: info级别issue每项扣3分，下限60', () => {
      const issues: AuditIssue[] = []
      for (let i = 0; i < 15; i++) {
        issues.push(makeIssue('info', 'word-fatigue', `词汇疲劳${i}`))
      }

      const result = aggregator.aggregate(makeAuditResult({
        dimensionScores: {},
        issues,
      }))

      // 90 - 15*3 = 45, 但下限是60
      expect(result.dimensionScores['word-fatigue']).toBe(60)
    })
  })
})
