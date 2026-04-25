import type { ChatResponse, TaskType } from './ai'

export type TokenUsageTaskType = TaskType | 'assistant' | 'unknown'
export type TokenUsageSource = 'chat' | 'chatStream' | 'mockChat' | 'mockStream'
export type TokenUsageStatus = 'success' | 'error'

export interface TokenUsageRecord {
  id: string
  projectId: string
  timestamp: string
  source: TokenUsageSource
  taskType: TokenUsageTaskType
  requestedBy?: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCostUSD: number
  outputCostUSD: number
  totalUSD: number
  totalCNY: number
  latency: number
  finishReason?: ChatResponse['finishReason']
  status: TokenUsageStatus
}

export interface TokenUsageFilters {
  projectId?: string
  startTime?: string
  endTime?: string
  model?: string
  taskType?: TokenUsageTaskType
}

export interface TokenUsageSummary {
  requestCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCostUSD: number
  outputCostUSD: number
  totalUSD: number
  totalCNY: number
  averageLatency: number
}

export interface GroupedTokenUsageSummary extends TokenUsageSummary {
  key: string
}

export interface BudgetPeriodUsage {
  spentUSD: number
  limitUSD: number
  percent: number
  isOverBudget: boolean
}

export interface BudgetUsageSummary {
  today: BudgetPeriodUsage
  month: BudgetPeriodUsage
  chapterLimitUSD: number
  alertThreshold: number
}
