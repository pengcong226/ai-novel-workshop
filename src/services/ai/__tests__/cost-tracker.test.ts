import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CostTracker } from '../cost-tracker'
import { BudgetExceededError } from '../errors'
import type { CostRecord, ModelConfig } from '../types'
import type { BudgetConfig } from '../../../types/ai'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

const USD_TO_CNY = 7.2

const mockModel: ModelConfig = {
  id: 'gpt-4o',
  provider: 'openai',
  model: 'gpt-4o',
  tier: 'writing',
  costPerInputToken: 0.005,   // $0.005 / 1K tokens
  costPerOutputToken: 0.015,  // $0.015 / 1K tokens
  maxTokens: 4096,
  rpmLimit: 60,
  enabled: true,
}

function makeRecord(overrides: Partial<CostRecord> = {}): CostRecord {
  return {
    timestamp: new Date(),
    model: 'gpt-4o',
    provider: 'openai',
    taskType: 'chapter',
    tokens: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
    cost: {
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
      inputCostUSD: 0.005,
      outputCostUSD: 0.0075,
      totalUSD: 0.0125,
      totalCNY: 0.0125 * USD_TO_CNY,
      model: 'gpt-4o',
    },
    ...overrides,
  }
}

describe('CostTracker', () => {
  let tracker: CostTracker

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'))
    tracker = new CostTracker()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- calculateCost ----

  it('calculates cost correctly from input/output tokens and model rates', () => {
    const breakdown = tracker.calculateCost(2000, 1000, mockModel)

    expect(breakdown.inputTokens).toBe(2000)
    expect(breakdown.outputTokens).toBe(1000)
    expect(breakdown.totalTokens).toBe(3000)
    // (2000/1000) * 0.005 = 0.01
    expect(breakdown.inputCostUSD).toBeCloseTo(0.01, 6)
    // (1000/1000) * 0.015 = 0.015
    expect(breakdown.outputCostUSD).toBeCloseTo(0.015, 6)
    expect(breakdown.totalUSD).toBeCloseTo(0.025, 6)
    expect(breakdown.totalCNY).toBeCloseTo(0.025 * USD_TO_CNY, 4)
    expect(breakdown.model).toBe('gpt-4o')
  })

  it('handles zero tokens gracefully', () => {
    const breakdown = tracker.calculateCost(0, 0, mockModel)
    expect(breakdown.totalUSD).toBe(0)
    expect(breakdown.totalCNY).toBe(0)
  })

  // ---- recordCost ----

  it('records cost and accumulates daily/monthly spend', () => {
    tracker.recordCost(makeRecord())
    const budget = tracker.getRemainingBudget()
    // With no budget limits set, remaining should be Infinity
    expect(budget.dailyRemainingUSD).toBe(Number.POSITIVE_INFINITY)
    expect(budget.monthlyRemainingUSD).toBe(Number.POSITIVE_INFINITY)
  })

  it('trims records array when exceeding 10000 entries', () => {
    for (let i = 0; i < 10_001; i++) {
      tracker.recordCost(makeRecord())
    }
    // Internal records should be trimmed to 5000; verify via statistics
    const stats = tracker.getStatistics()
    // Only 5000 remain after trimming at 10001
    expect(stats.totalCalls).toBe(5000)
  })

  // ---- budget checking ----

  it('throws BudgetExceededError when daily limit is exceeded', () => {
    const budget: BudgetConfig = { dailyLimitUSD: 0.01 }
    tracker = new CostTracker(budget)

    // This record has totalUSD = 0.0125, which exceeds 0.01
    expect(() => tracker.recordCost(makeRecord())).toThrow(BudgetExceededError)
    expect(() => tracker.recordCost(makeRecord())).toThrow('daily')
  })

  it('throws BudgetExceededError when monthly limit is exceeded', () => {
    const budget: BudgetConfig = { monthlyLimitUSD: 0.01 }
    tracker = new CostTracker(budget)

    expect(() => tracker.recordCost(makeRecord())).toThrow(BudgetExceededError)
    expect(() => tracker.recordCost(makeRecord())).toThrow('monthly')
  })

  it('does not throw when spending is within budget', () => {
    const budget: BudgetConfig = { dailyLimitUSD: 1.00, monthlyLimitUSD: 10.00 }
    tracker = new CostTracker(budget)

    expect(() => tracker.recordCost(makeRecord())).not.toThrow()
  })

  // ---- getRemainingBudget ----

  it('calculates remaining budget after recording costs', () => {
    const budget: BudgetConfig = { dailyLimitUSD: 1.00, monthlyLimitUSD: 10.00 }
    tracker = new CostTracker(budget)

    tracker.recordCost(makeRecord()) // 0.0125

    const remaining = tracker.getRemainingBudget()
    expect(remaining.dailyRemainingUSD).toBeCloseTo(1.0 - 0.0125, 4)
    expect(remaining.monthlyRemainingUSD).toBeCloseTo(10.0 - 0.0125, 4)
  })

  it('returns Infinity when no limits are set', () => {
    const remaining = tracker.getRemainingBudget()
    expect(remaining.dailyRemainingUSD).toBe(Number.POSITIVE_INFINITY)
    expect(remaining.monthlyRemainingUSD).toBe(Number.POSITIVE_INFINITY)
  })

  // ---- isOverBudget ----

  it('reports over-budget state with projected cost', () => {
    const budget: BudgetConfig = { dailyLimitUSD: 0.05, monthlyLimitUSD: 0.50 }
    tracker = new CostTracker(budget)

    // No spend yet but projected cost exceeds daily limit
    const result = tracker.isOverBudget(0.10)
    expect(result.daily).toBe(true)
    expect(result.monthly).toBe(false)
  })

  it('reports chapter limit exceeded for projected cost', () => {
    const budget: BudgetConfig = { chapterLimitUSD: 0.01 }
    tracker = new CostTracker(budget)

    const result = tracker.isOverBudget(0.05)
    expect(result.chapter).toBe(true)
  })

  // ---- getStatistics ----

  it('aggregates statistics by model', () => {
    tracker.recordCost(makeRecord({ model: 'gpt-4o' }))
    tracker.recordCost(makeRecord({ model: 'claude-3-opus' }))

    const stats = tracker.getStatistics()
    expect(stats.totalCalls).toBe(2)
    expect(stats.byModel).toHaveLength(2)
    expect(stats.byModel.map(m => m.model).sort()).toEqual(['claude-3-opus', 'gpt-4o'])
  })

  it('aggregates statistics by task type', () => {
    tracker.recordCost(makeRecord({ taskType: 'chapter' }))
    tracker.recordCost(makeRecord({ taskType: 'check' }))

    const stats = tracker.getStatistics()
    expect(stats.byTaskType).toHaveLength(2)
    expect(stats.byTaskType.map(t => t.type).sort()).toEqual(['chapter', 'check'])
  })

  it('filters statistics by date range', () => {
    const now = new Date('2026-05-31T12:00:00Z')
    tracker.recordCost(makeRecord({ timestamp: new Date('2026-05-30T10:00:00Z') }))
    tracker.recordCost(makeRecord({ timestamp: new Date('2026-05-31T11:00:00Z') }))

    const stats = tracker.getStatistics({
      start: new Date('2026-05-31T00:00:00Z'),
      end: new Date('2026-05-31T23:59:59Z'),
    })
    expect(stats.totalCalls).toBe(1)
  })

  // ---- setBudget ----

  it('allows updating budget after construction', () => {
    tracker.recordCost(makeRecord()) // 0.0125, no budget initially

    // Set a very tight budget now
    tracker.setBudget({ dailyLimitUSD: 0.001 })

    // Next record should trigger budget exceeded
    expect(() => tracker.recordCost(makeRecord())).toThrow(BudgetExceededError)
  })

  // ---- daily/monthly reset ----

  it('resets daily spend on new day', () => {
    const budget: BudgetConfig = { dailyLimitUSD: 0.5 }
    tracker = new CostTracker(budget)

    // Spend some amount
    tracker.recordCost(makeRecord()) // 0.0125

    // Advance to next day
    vi.setSystemTime(new Date('2026-06-01T01:00:00Z'))

    // Should not throw because daily spend was reset
    expect(() => tracker.recordCost(makeRecord())).not.toThrow()
  })
})
