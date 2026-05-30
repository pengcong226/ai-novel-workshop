/**
 * Audit Log Composable
 *
 * Provides a global append-only audit log for tracking AI decisions,
 * conflicts, memory updates, and general application events.
 * The log is module-scoped (shared across components) and capped at 500 entries.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAuditLog } from '@/composables/useAuditLog'
 *
 * const { logs, addLog, getLogsByChapter } = useAuditLog()
 *
 * // Log an AI decision
 * addLog({ type: 'ai_decision', title: '角色状态更新', description: '检测到新冲突' })
 *
 * // Filter by chapter
 * const chapterLogs = getLogsByChapter(1)
 * </script>
 * ```
 */

import { ref, readonly } from 'vue'
import { generateId } from '@/utils/generateId'

export type AuditLogType = 'info' | 'warning' | 'success' | 'error' | 'ai_decision' | 'conflict_resolved' | 'memory_updated'

export interface AuditLogEntry {
  id: string
  timestamp: Date
  type: AuditLogType
  title: string
  description: string
  chapterNumber?: number
  metadata?: Record<string, unknown>
}

/** Module-scope global audit log (capped at 500 entries). */
const logs = ref<AuditLogEntry[]>([])

export function useAuditLog() {
  /**
   * Append a new entry to the audit log.
   * @returns the ID of the newly created entry
   */
  function addLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): string {
    const newLog: AuditLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date()
    }
    logs.value.unshift(newLog) // prepend latest

    // Cap at 500 logs to prevent memory leak
    if (logs.value.length > 500) {
      logs.value.pop()
    }

    return newLog.id
  }

  /**
   * Filter audit log entries by chapter number.
   */
  function getLogsByChapter(chapterNumber: number): AuditLogEntry[] {
    return logs.value.filter(log => log.chapterNumber === chapterNumber)
  }

  /**
   * Clear all audit log entries.
   */
  function clearLogs(): void {
    logs.value = []
  }

  return {
    /** Read-only view of the audit log (prevents external mutation) */
    logs: readonly(logs),
    addLog,
    getLogsByChapter,
    clearLogs
  }
}
