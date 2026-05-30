/**
 * Token usage tracking store.
 *
 * Records per-request token consumption and cost, persists per-project
 * usage history to localStorage, and provides project-scoped summaries.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useTokenUsageStore } from '@/stores/tokenUsage'
 * import { storeToRefs } from 'pinia'
 * const { records, summary } = storeToRefs(useTokenUsageStore())
 * ```
 *
 * @module stores/tokenUsage
 */

import { computed, ref, type Ref, type ComputedRef } from 'vue'
import { defineStore } from 'pinia'
import type { ChatResponse, TaskContext } from '@/types/ai'
import type { TokenUsageRecord, TokenUsageSource, TokenUsageTaskType } from '@/types/token-usage'
import { normalizeUsageTaskType } from '@/utils/tokenUsage'
import { generateId } from '@/utils/generateId'
import { getLogger } from '@/utils/logger'

const HISTORY_LIMIT = 1000
const STORAGE_PREFIX = 'token_usage:'
const logger = getLogger('tokenUsage:store')

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
  const records: Ref<TokenUsageRecord[]> = ref([])

  /** Full list of all usage records (all projects). */
  const summary: ComputedRef<TokenUsageRecord[]> = computed(
    (): TokenUsageRecord[] => records.value
  )

  /**
   * Record a token usage entry. Returns null if projectId is missing.
   * Automatically trims to HISTORY_LIMIT and persists to localStorage.
   *
   * @param input - Usage data (id and timestamp are auto-generated if absent)
   * @returns The created record, or null if skipped
   */
  function recordUsage(input: RecordUsageInput): TokenUsageRecord | null {
    if (!input.projectId) return null

    const record: TokenUsageRecord = {
      ...input,
      id: input.id ?? generateId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      taskType: normalizeUsageTaskType(input.taskType),
    }

    records.value = [...records.value, record]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-HISTORY_LIMIT)

    persistProjectUsage(record.projectId)
    return record
  }

  /**
   * Record token usage from a ChatResponse object, extracting usage
   * and cost data automatically.
   *
   * @param input - Chat response context with project/source info
   * @returns The created record, or null if usage/cost data is missing
   */
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

  /**
   * Get all usage records for a specific project.
   * @param projectId - Project to filter by
   * @returns Array of matching records
   */
  function getProjectRecords(projectId: string): TokenUsageRecord[] {
    return records.value.filter(record => record.projectId === projectId)
  }

  /**
   * Load persisted usage records for a project from localStorage.
   * @param projectId - Project to load
   */
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
      logger.debug('tokenUsage: storage load failed, clearing project records')
      records.value = records.value.filter(record => record.projectId !== projectId)
    }
  }

  /**
   * Persist usage records for a project to localStorage.
   * @param projectId - Project to persist
   */
  function persistProjectUsage(projectId: string): void {
    try {
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(getProjectRecords(projectId).slice(-HISTORY_LIMIT)))
    } catch {
      logger.debug('tokenUsage: storage write failed (private/restricted browser context)')
    }
  }

  /**
   * Remove all usage records for a project from memory and localStorage.
   * @param projectId - Project to clear
   */
  function clearProjectUsage(projectId: string): void {
    records.value = records.value.filter(record => record.projectId !== projectId)
    try {
      localStorage.removeItem(getStorageKey(projectId))
    } catch {
      logger.debug('tokenUsage: storage remove failed (private/restricted browser context)')
    }
  }

  /**
   * Export all usage records for a project as a JSON string.
   * @param projectId - Project to export
   * @returns Formatted JSON string
   */
  function exportProjectUsage(projectId: string): string {
    return JSON.stringify(getProjectRecords(projectId), null, 2)
  }

  /**
   * Reset the store to its initial state, clearing all records.
   */
  function $reset(): void {
    records.value = []
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
    $reset,
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
