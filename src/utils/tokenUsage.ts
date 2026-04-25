import type { BudgetConfig } from '@/types/ai'
import type { GroupedTokenUsageSummary, TokenUsageFilters, TokenUsageRecord, TokenUsageSummary, TokenUsageTaskType } from '@/types/token-usage'

const VALID_TASK_TYPES = new Set<TokenUsageTaskType>([
  'worldbuilding',
  'character',
  'outline',
  'chapter',
  'check',
  'state_extraction',
  'memory_update',
  'assistant',
  'unknown',
])

export function normalizeUsageTaskType(value: unknown): TokenUsageTaskType {
  if (typeof value !== 'string') return 'unknown'
  return VALID_TASK_TYPES.has(value as TokenUsageTaskType) ? value as TokenUsageTaskType : 'unknown'
}

export function filterTokenUsageRecords(records: TokenUsageRecord[], filters: TokenUsageFilters = {}): TokenUsageRecord[] {
  return records.filter(record => {
    if (filters.projectId && record.projectId !== filters.projectId) return false
    if (filters.model && record.model !== filters.model) return false
    if (filters.taskType && record.taskType !== filters.taskType) return false
    if (filters.startTime && record.timestamp < filters.startTime) return false
    if (filters.endTime && record.timestamp > filters.endTime) return false
    return true
  })
}

export function summarizeTokenUsage(records: TokenUsageRecord[]): TokenUsageSummary {
  const summary = records.reduce<TokenUsageSummary>((total, record) => ({
    requestCount: total.requestCount + 1,
    inputTokens: total.inputTokens + record.inputTokens,
    outputTokens: total.outputTokens + record.outputTokens,
    totalTokens: total.totalTokens + record.totalTokens,
    inputCostUSD: total.inputCostUSD + record.inputCostUSD,
    outputCostUSD: total.outputCostUSD + record.outputCostUSD,
    totalUSD: total.totalUSD + record.totalUSD,
    totalCNY: total.totalCNY + record.totalCNY,
    averageLatency: total.averageLatency + record.latency,
  }), createEmptySummary())

  if (summary.requestCount === 0) return summary
  return {
    ...summary,
    averageLatency: Math.round(summary.averageLatency / summary.requestCount),
  }
}

export function summarizeUsageByModel(records: TokenUsageRecord[]): GroupedTokenUsageSummary[] {
  return summarizeUsageBy(records, record => record.model)
}

export function summarizeUsageByTaskType(records: TokenUsageRecord[]): GroupedTokenUsageSummary[] {
  return summarizeUsageBy(records, record => record.taskType)
}

export function calculateBudgetUsage(records: TokenUsageRecord[], budget: BudgetConfig, now = new Date()) {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const today = summarizeTokenUsage(filterTokenUsageRecords(records, { startTime: todayStart.toISOString(), endTime: now.toISOString() }))
  const month = summarizeTokenUsage(filterTokenUsageRecords(records, { startTime: monthStart.toISOString(), endTime: now.toISOString() }))

  return {
    today: buildBudgetPeriod(today.totalUSD, budget.dailyLimitUSD ?? 0),
    month: buildBudgetPeriod(month.totalUSD, budget.monthlyLimitUSD ?? 0),
    chapterLimitUSD: budget.chapterLimitUSD ?? 0,
    alertThreshold: budget.alertThreshold ?? 0.8,
  }
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toLocaleString('en-US')
}

export function formatCurrencyUSD(value: number): string {
  return `$${formatCost(value)}`
}

export function formatCurrencyCNY(value: number): string {
  return `¥${formatCost(value)}`
}

function summarizeUsageBy(records: TokenUsageRecord[], getKey: (record: TokenUsageRecord) => string): GroupedTokenUsageSummary[] {
  const groups = new Map<string, TokenUsageRecord[]>()
  for (const record of records) {
    const key = getKey(record)
    groups.set(key, [...(groups.get(key) ?? []), record])
  }

  return [...groups.entries()]
    .map(([key, groupRecords]) => ({ key, ...summarizeTokenUsage(groupRecords) }))
    .sort((left, right) => right.totalTokens - left.totalTokens || left.key.localeCompare(right.key))
}

function createEmptySummary(): TokenUsageSummary {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCostUSD: 0,
    outputCostUSD: 0,
    totalUSD: 0,
    totalCNY: 0,
    averageLatency: 0,
  }
}

function buildBudgetPeriod(spentUSD: number, limitUSD: number) {
  const percent = limitUSD > 0 ? Math.min(100, (spentUSD / limitUSD) * 100) : 0
  return {
    spentUSD,
    limitUSD,
    percent,
    isOverBudget: limitUSD > 0 && spentUSD >= limitUSD,
  }
}

function formatCost(value: number): string {
  if (value < 1) return value.toFixed(4)
  return value.toFixed(2)
}
