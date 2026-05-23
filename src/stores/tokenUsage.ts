import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChatResponse, TaskContext } from '@/types/ai'
import type { TokenUsageRecord, TokenUsageSource, TokenUsageTaskType } from '@/types/token-usage'
import { normalizeUsageTaskType } from '@/utils/tokenUsage'

const HISTORY_LIMIT = 1000
const STORAGE_PREFIX = 'token_usage:'

interface RecordUsageInput extends Omit<TokenUsageRecord, 'id' | 'timestamp'> {
  id?: string
  timestamp?: string
}

interface RecordFromChatResponseInput {
  projectId?: string
  source: TokenUsageSource
  context?: TaskContext
  response: ChatResponse
}

export const useTokenUsageStore = defineStore('tokenUsage', () => {
  const records = ref<TokenUsageRecord[]>([])

  const summary = computed(() => records.value)

  function recordUsage(input: RecordUsageInput): TokenUsageRecord | null {
    if (!input.projectId) return null

    const record: TokenUsageRecord = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      taskType: normalizeUsageTaskType(input.taskType),
    }

    records.value = [...records.value, record]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-HISTORY_LIMIT)

    persistProjectUsage(record.projectId)
    return record
  }

  function recordFromChatResponse(input: RecordFromChatResponseInput): TokenUsageRecord | null {
    if (!input.response.usage || !input.response.cost) return null

    const requestedBy = typeof input.context?.metadata?.requestedBy === 'string'
      ? input.context.metadata.requestedBy
      : undefined

    return recordUsage({
      projectId: input.projectId ?? '',
      source: input.source,
      taskType: normalizeUsageTaskType(input.context?.type) as TokenUsageTaskType,
      requestedBy,
      model: input.response.cost?.model || input.response.model,
      inputTokens: input.response.usage.inputTokens,
      outputTokens: input.response.usage.outputTokens,
      totalTokens: input.response.usage.totalTokens,
      inputCostUSD: input.response.cost.inputCostUSD,
      outputCostUSD: input.response.cost.outputCostUSD,
      totalUSD: input.response.cost.totalUSD,
      totalCNY: input.response.cost.totalCNY,
      latency: input.response.latency,
      finishReason: input.response.finishReason,
      status: 'success',
    })
  }

  function getProjectRecords(projectId: string): TokenUsageRecord[] {
    return records.value.filter(record => record.projectId === projectId)
  }

  function loadProjectUsage(projectId: string): void {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId))
      if (!raw) {
        records.value = records.value.filter(record => record.projectId !== projectId)
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        records.value = records.value.filter(record => record.projectId !== projectId)
        return
      }

      const loaded = parsed
        .map(parsePersistedRecord)
        .filter((record): record is TokenUsageRecord => record !== null)
        .filter(record => record.projectId === projectId)
        .slice(-HISTORY_LIMIT)

      records.value = [
        ...records.value.filter(record => record.projectId !== projectId),
        ...loaded,
      ]
    } catch {
      records.value = records.value.filter(record => record.projectId !== projectId)
    }
  }

  function persistProjectUsage(projectId: string): void {
    try {
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(getProjectRecords(projectId).slice(-HISTORY_LIMIT)))
    } catch {
      // localStorage may be unavailable in private or restricted browser contexts.
    }
  }

  function clearProjectUsage(projectId: string): void {
    records.value = records.value.filter(record => record.projectId !== projectId)
    try {
      localStorage.removeItem(getStorageKey(projectId))
    } catch {
      // localStorage may be unavailable in private or restricted browser contexts.
    }
  }

  function exportProjectUsage(projectId: string): string {
    return JSON.stringify(getProjectRecords(projectId), null, 2)
  }

  return {
    records,
    summary,
    recordUsage,
    recordFromChatResponse,
    getProjectRecords,
    loadProjectUsage,
    persistProjectUsage,
    clearProjectUsage,
    exportProjectUsage,
  }
})

function getStorageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`
}

function parsePersistedRecord(value: unknown): TokenUsageRecord | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TokenUsageRecord>
  if (!record.id || !record.projectId || !record.timestamp || !record.source || !record.model || !record.status) return null
  return {
    id: record.id,
    projectId: record.projectId,
    timestamp: record.timestamp,
    source: record.source,
    taskType: normalizeUsageTaskType(record.taskType),
    requestedBy: record.requestedBy,
    model: record.model,
    inputTokens: Number(record.inputTokens) || 0,
    outputTokens: Number(record.outputTokens) || 0,
    totalTokens: Number(record.totalTokens) || 0,
    inputCostUSD: Number(record.inputCostUSD) || 0,
    outputCostUSD: Number(record.outputCostUSD) || 0,
    totalUSD: Number(record.totalUSD) || 0,
    totalCNY: Number(record.totalCNY) || 0,
    latency: Number(record.latency) || 0,
    finishReason: record.finishReason,
    status: record.status,
  }
}
