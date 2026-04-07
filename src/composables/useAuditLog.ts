import { ref } from 'vue'

export type AuditLogType = 'info' | 'warning' | 'success' | 'error' | 'ai_decision' | 'conflict_resolved' | 'memory_updated'

export interface AuditLogEntry {
  id: string
  timestamp: Date
  type: AuditLogType
  title: string
  description: string
  chapterNumber?: number
  metadata?: Record<string, any>
}

// Global state for audit logs
const logs = ref<AuditLogEntry[]>([])

export function useAuditLog() {
  function addLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
    const newLog: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date()
    }
    logs.value.unshift(newLog) // prepend latest
    
    // cap at 500 logs to prevent memory leak
    if (logs.value.length > 500) {
      logs.value.pop()
    }
    
    return newLog.id
  }

  function getLogsByChapter(chapterNumber: number) {
    return logs.value.filter(log => log.chapterNumber === chapterNumber)
  }

  function clearLogs() {
    logs.value = []
  }

  return {
    logs,
    addLog,
    getLogsByChapter,
    clearLogs
  }
}
