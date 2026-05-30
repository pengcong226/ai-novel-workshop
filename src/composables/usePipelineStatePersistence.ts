/**
 * Pipeline State Persistence Composable
 *
 * Persists Pipeline runtime state to IndexedDB so progress survives page
 * refreshes. State older than 30 minutes is automatically discarded.
 * Uses throttled writes (2s) with hash-based change detection to avoid
 * unnecessary I/O.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePipelineStatePersistence } from '@/composables/usePipelineStatePersistence'
 *
 * const {
 *   isPipelineRunning, isPipelinePaused,
 *   startPipeline, pushEvent, finishPipeline,
 *   restoreState, pipelineEvents,
 * } = usePipelineStatePersistence(() => project.value?.id)
 *
 * onMounted(async () => { await restoreState() })
 * </script>
 * ```
 */

import { ref, readonly, watch, onMounted, onUnmounted } from 'vue'
import { getLogger } from '@/utils/logger'

const logger = getLogger('composable:pipeline-persist')

const DB_NAME = 'AI_Novel_Workshop'
const STORE_NAME = 'pipeline-runtime-state'

export interface PipelineRuntimeState {
  projectId: string
  events: any[]
  currentEvent: any | null
  isRunning: boolean
  isPaused: boolean
  startChapter: number
  targetCount: number
  timestamp: number
}

/**
 * 打开 IndexedDB 并确保 pipeline-runtime-state store 存在
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      const db = request.result
      // 如果 store 不存在，升级版本以创建
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close()
        const upgradeReq = indexedDB.open(DB_NAME, db.version + 1)
        upgradeReq.onupgradeneeded = () => {
          const upgradedDb = upgradeReq.result
          if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
            upgradedDb.createObjectStore(STORE_NAME, { keyPath: 'projectId' })
          }
        }
        upgradeReq.onsuccess = () => resolve(upgradeReq.result)
        upgradeReq.onerror = () => reject(upgradeReq.error)
      } else {
        resolve(db)
      }
    }
  })
}

async function saveState(state: PipelineRuntimeState): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ ...state, timestamp: Date.now() })

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    logger.debug('[PipelinePersist] 状态已保存', { projectId: state.projectId, eventsCount: state.events.length })
  } catch (err) {
    logger.warn('[PipelinePersist] 保存状态失败:', err)
  }
}

async function loadState(projectId: string): Promise<PipelineRuntimeState | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(projectId)

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    logger.warn('[PipelinePersist] 加载状态失败:', err)
    return null
  }
}

async function clearState(projectId: string): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(projectId)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    logger.info('[PipelinePersist] 状态已清除', { projectId })
  } catch (err) {
    logger.warn('[PipelinePersist] 清除状态失败:', err)
  }
}

/**
 * 组合式函数：为 Pipeline 运行状态提供持久化能力
 *
 * @param projectId 当前项目ID
 */
export function usePipelineStatePersistence(projectId: () => string | undefined) {
  const pipelineEvents = ref<any[]>([])
  const currentPipelineEvent = ref<any>(null)
  const isPipelinePaused = ref(false)
  const isPipelineRunning = ref(false)
  const showPipelineProgress = ref(false)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let lastSavedHash = ''

  // Cleanup on unmount
  onUnmounted(() => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  })

  /**
   * 从 IndexedDB 恢复状态
   */
  async function restoreState(): Promise<boolean> {
    const pid = projectId()
    if (!pid) return false

    const state = await loadState(pid)
    if (!state || !state.isRunning) return false

    // 只恢复 30 分钟内的状态（避免过期数据）
    const age = Date.now() - state.timestamp
    if (age > 30 * 60 * 1000) {
      logger.info('[PipelinePersist] 状态过期，不恢复', { age: Math.round(age / 1000) + 's' })
      await clearState(pid)
      return false
    }

    logger.info('[PipelinePersist] 恢复 Pipeline 状态', {
      projectId: pid,
      eventsCount: state.events.length,
      lastStage: state.currentEvent?.stage,
    })

    pipelineEvents.value = state.events
    currentPipelineEvent.value = state.currentEvent
    isPipelinePaused.value = state.isPaused
    isPipelineRunning.value = state.isRunning
    showPipelineProgress.value = true

    return true
  }

  /**
   * 节流保存：避免高频写入
   */
  function throttledSave() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      const pid = projectId()
      if (!pid) return

      // 简单 hash 检查避免无变化写入
      const hash = JSON.stringify({
        len: pipelineEvents.value.length,
        running: isPipelineRunning.value,
        paused: isPipelinePaused.value,
        stage: currentPipelineEvent.value?.stage,
        chapter: currentPipelineEvent.value?.chapterNumber,
      })
      if (hash === lastSavedHash) return
      lastSavedHash = hash

      saveState({
        projectId: pid,
        events: pipelineEvents.value,
        currentEvent: currentPipelineEvent.value,
        isRunning: isPipelineRunning.value,
        isPaused: isPipelinePaused.value,
        startChapter: 0,
        targetCount: 0,
        timestamp: Date.now(),
      })
    }, 2000) // 2秒节流
  }

  /**
   * 添加事件并触发持久化
   */
  function pushEvent(event: any) {
    pipelineEvents.value.push(event)
    currentPipelineEvent.value = event
    throttledSave()
  }

  /**
   * Pipeline 启动时重置状态
   */
  function startPipeline() {
    pipelineEvents.value = []
    currentPipelineEvent.value = null
    isPipelinePaused.value = false
    isPipelineRunning.value = true
    showPipelineProgress.value = true
    lastSavedHash = ''
  }

  /**
   * Pipeline 结束时清除持久化状态
   */
  async function finishPipeline() {
    isPipelineRunning.value = false
    isPipelinePaused.value = false
    const pid = projectId()
    if (pid) {
      await clearState(pid)
    }
  }

  /**
   * Pipeline 暂停
   */
  function pausePipeline() {
    isPipelinePaused.value = true
    throttledSave()
  }

  /**
   * Pipeline 恢复
   */
  function resumePipeline() {
    isPipelinePaused.value = false
    throttledSave()
  }

  return {
    // State (read-only to prevent external mutation)
    pipelineEvents: readonly(pipelineEvents),
    currentPipelineEvent: readonly(currentPipelineEvent),
    isPipelinePaused: readonly(isPipelinePaused),
    isPipelineRunning: readonly(isPipelineRunning),
    showPipelineProgress: readonly(showPipelineProgress),
    // Methods
    restoreState,
    pushEvent,
    startPipeline,
    finishPipeline,
    pausePipeline,
    resumePipeline,
  }
}
