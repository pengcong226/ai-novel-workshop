import { describe, expect, it } from 'vitest'
import type { TokenUsageRecord } from '@/types/token-usage'
import {
  calculateBudgetUsage,
  filterTokenUsageRecords,
  formatCurrencyCNY,
  formatCurrencyUSD,
  formatTokenCount,
  normalizeUsageTaskType,
  summarizeTokenUsage,
  summarizeUsageByModel,
  summarizeUsageByTaskType,
} from '@/utils/tokenUsage'

const baseRecord: TokenUsageRecord = {
  id: 'usage-1',
  projectId: 'project-1',
  timestamp: '2026-04-25T08:00:00.000Z',
  source: 'chat',
  taskType: 'chapter',
  requestedBy: 'test',
  model: 'claude-sonnet-4-6',
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
  inputCostUSD: 0.003,
  outputCostUSD: 0.0075,
  totalUSD: 0.0105,
  totalCNY: 0.0756,
  latency: 1200,
  finishReason: 'stop',
  status: 'success',
}

function record(overrides: Partial<TokenUsageRecord>): TokenUsageRecord {
  return { ...baseRecord, ...overrides }
}

describe('token usage utilities', () => {
  it('summarizes empty usage as zero totals', () => {
    expect(summarizeTokenUsage([])).toMatchObject({
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalUSD: 0,
      totalCNY: 0,
      averageLatency: 0,
    })
  })

  it('summarizes totals and average latency', () => {
    const summary = summarizeTokenUsage([
      baseRecord,
      record({ id: 'usage-2', inputTokens: 200, outputTokens: 100, totalTokens: 300, totalUSD: 0.02, totalCNY: 0.144, latency: 800 }),
    ])

    expect(summary.requestCount).toBe(2)
    expect(summary.totalTokens).toBe(1800)
    expect(summary.totalUSD).toBeCloseTo(0.0305)
    expect(summary.averageLatency).toBe(1000)
  })

  it('groups usage by model and task type deterministically', () => {
    const records = [
      baseRecord,
      record({ id: 'usage-2', model: 'gpt-4.1', taskType: 'assistant', totalTokens: 300, totalUSD: 0.02 }),
      record({ id: 'usage-3', model: 'claude-sonnet-4-6', taskType: 'chapter', totalTokens: 700, totalUSD: 0.01 }),
    ]

    expect(summarizeUsageByModel(records).map(item => [item.key, item.requestCount, item.totalTokens])).toEqual([
      ['claude-sonnet-4-6', 2, 2200],
      ['gpt-4.1', 1, 300],
    ])
    expect(summarizeUsageByTaskType(records).map(item => [item.key, item.requestCount, item.totalTokens])).toEqual([
      ['chapter', 2, 2200],
      ['assistant', 1, 300],
    ])
  })

  it('filters records by project, range, model, and task type', () => {
    const records = [
      baseRecord,
      record({ id: 'usage-2', projectId: 'project-2', timestamp: '2026-04-25T09:00:00.000Z' }),
      record({ id: 'usage-3', timestamp: '2026-04-24T23:59:59.000Z', model: 'gpt-4.1', taskType: 'assistant' }),
    ]

    const filtered = filterTokenUsageRecords(records, {
      projectId: 'project-1',
      startTime: '2026-04-25T00:00:00.000Z',
      endTime: '2026-04-25T23:59:59.999Z',
      model: 'claude-sonnet-4-6',
      taskType: 'chapter',
    })

    expect(filtered.map(item => item.id)).toEqual(['usage-1'])
  })

  it('normalizes known, assistant, and invalid task types', () => {
    expect(normalizeUsageTaskType('chapter')).toBe('chapter')
    expect(normalizeUsageTaskType('assistant')).toBe('assistant')
    expect(normalizeUsageTaskType('not-real')).toBe('unknown')
    expect(normalizeUsageTaskType(undefined)).toBe('unknown')
  })

  it('calculates daily and monthly budget progress with clamping', () => {
    const usage = calculateBudgetUsage([
      baseRecord,
      record({ id: 'usage-2', timestamp: '2026-04-01T00:00:00.000Z', totalUSD: 1.2 }),
      record({ id: 'usage-3', timestamp: '2026-03-31T23:00:00.000Z', totalUSD: 2 }),
    ], {
      chapterLimitUSD: 0.15,
      dailyLimitUSD: 1,
      monthlyLimitUSD: 1,
      alertThreshold: 0.8,
    }, new Date('2026-04-25T12:00:00.000Z'))

    expect(usage.today.spentUSD).toBeCloseTo(0.0105)
    expect(usage.today.percent).toBeCloseTo(1.05)
    expect(usage.month.spentUSD).toBeCloseTo(1.2105)
    expect(usage.month.percent).toBe(100)
    expect(usage.month.isOverBudget).toBe(true)
  })

  it('formats token counts and currencies for display', () => {
    expect(formatTokenCount(999)).toBe('999')
    expect(formatTokenCount(12_300)).toBe('12.3K')
    expect(formatTokenCount(1_250_000)).toBe('1.3M')
    expect(formatCurrencyUSD(0.0105)).toBe('$0.0105')
    expect(formatCurrencyCNY(0.0756)).toBe('¥0.0756')
  })
})
