import { getLogger } from '@/utils/logger'

const logger = getLogger('断点管理器')

export interface CheckpointState {
  projectId: string
  startChapter: number
  targetCount: number
  completedChapters: number[]     // 已完成的章节号列表
  lastCompletedChapter: number
  directionPrompt?: string
  checkpointInterval?: number
  autoSave: boolean
  timestamp: number
  totalTokensUsed: number
}

const DB_NAME = 'ai-novel-workshop'
const DB_VERSION = 1
const STORE_NAME = 'pipeline-checkpoints'
const STORAGE_KEY = 'ai-novel-workshop:pipeline-checkpoints'

/**
 * checkpointManager — 使用 IndexedDB 持久化断点状态
 *
 * 从 localStorage 迁移到 IndexedDB，兼容 Web Worker 环境。
 * 提供 localStorage fallback 以确保渐进迁移的兼容性。
 */
export class CheckpointManager {
  private static dbPromise: Promise<IDBDatabase> | null = null

  /**
   * 获取 IndexedDB 实例（懒初始化）
   */
  private static getDB(): Promise<IDBDatabase> {
    if (!CheckpointManager.dbPromise) {
      CheckpointManager.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB not available'))
          return
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
          logger.warn('IndexedDB 打开失败，回退到 localStorage')
          reject(request.error)
        }

        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'projectId' })
          }
        }

        request.onsuccess = () => {
          resolve(request.result)
        }
      })
    }
    return CheckpointManager.dbPromise
  }

  /**
   * 保存项目的批量写作断点。
   * 优先使用 IndexedDB，失败时回退到 localStorage。
   */
  static async saveCheckpoint(state: CheckpointState): Promise<void> {
    const stateWithTimestamp = { ...state, timestamp: Date.now() }

    try {
      const db = await CheckpointManager.getDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(stateWithTimestamp)

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      logger.info(`断点已保存(IDB): 项目=${state.projectId}, 已完成章节数=${state.completedChapters.length}`)
    } catch {
      // Fallback to localStorage
      CheckpointManager.saveToLocalStorage(stateWithTimestamp)
    }
  }

  /**
   * 加载指定项目的断点。如果不存在则返回 null。
   */
  static async loadCheckpoint(projectId: string): Promise<CheckpointState | null> {
    try {
      const db = await CheckpointManager.getDB()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(projectId)

      const checkpoint = await new Promise<CheckpointState | null>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })

      if (!checkpoint) {
        logger.debug(`未找到项目断点(IDB): ${projectId}`)
        return null
      }

      // 校验数据完整性
      if (
        typeof checkpoint.projectId !== 'string' ||
        typeof checkpoint.startChapter !== 'number' ||
        typeof checkpoint.targetCount !== 'number' ||
        !Array.isArray(checkpoint.completedChapters)
      ) {
        logger.warn(`项目断点数据已损坏，已清除: ${projectId}`)
        await CheckpointManager.clearCheckpoint(projectId)
        return null
      }

      logger.info(
        `断点已加载(IDB): 项目=${projectId}, 已完成=${checkpoint.completedChapters.length}/${checkpoint.targetCount}`
      )
      return checkpoint
    } catch {
      // Fallback to localStorage
      return CheckpointManager.loadFromLocalStorage(projectId)
    }
  }

  /**
   * 清除指定项目的断点（例如批量写作成功完成后调用）。
   */
  static async clearCheckpoint(projectId: string): Promise<void> {
    try {
      const db = await CheckpointManager.getDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(projectId)

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      logger.info(`断点已清除(IDB): ${projectId}`)
    } catch {
      // Also clear from localStorage fallback
      CheckpointManager.clearFromLocalStorage(projectId)
    }
  }

  /**
   * 标记指定章节为已完成并更新断点。
   */
  static async markChapterComplete(projectId: string, chapterNumber: number, tokensUsed: number): Promise<void> {
    const checkpoint = await CheckpointManager.loadCheckpoint(projectId)
    if (!checkpoint) {
      logger.warn(`无法标记章节完成: 项目 ${projectId} 不存在断点`)
      return
    }

    // 避免重复记录
    if (!checkpoint.completedChapters.includes(chapterNumber)) {
      checkpoint.completedChapters.push(chapterNumber)
    }

    checkpoint.lastCompletedChapter = chapterNumber
    checkpoint.totalTokensUsed += tokensUsed

    await CheckpointManager.saveCheckpoint(checkpoint)
    logger.info(
      `章节 ${chapterNumber} 已标记完成: 项目=${projectId}, 进度=${checkpoint.completedChapters.length}/${checkpoint.targetCount}`
    )
  }

  /**
   * 检查项目是否存在可恢复的断点。
   */
  static async hasResumableCheckpoint(projectId: string): Promise<boolean> {
    const checkpoint = await CheckpointManager.loadCheckpoint(projectId)
    if (!checkpoint) return false
    const resumable = checkpoint.completedChapters.length < checkpoint.targetCount
    if (resumable) {
      logger.info(`发现可恢复断点: 项目=${projectId}, 剩余=${checkpoint.targetCount - checkpoint.completedChapters.length} 章`)
    }
    return resumable
  }

  /**
   * 获取断点中剩余未完成的章节数。
   */
  static async getRemainingCount(projectId: string): Promise<number> {
    const checkpoint = await CheckpointManager.loadCheckpoint(projectId)
    if (!checkpoint) return 0
    return Math.max(0, checkpoint.targetCount - checkpoint.completedChapters.length)
  }

  /**
   * 清除所有断点（用于系统清理）。
   */
  static async clearAll(): Promise<void> {
    try {
      const db = await CheckpointManager.getDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      logger.info('所有断点已清除(IDB)')
    } catch {
      // Fallback
      try {
        window.localStorage.removeItem(STORAGE_KEY)
        logger.info('所有断点已清除(localStorage fallback)')
      } catch (error) {
        logger.error('清除所有断点失败', error)
      }
    }
  }

  // ============================================================================
  // localStorage fallback methods（渐进迁移兼容）
  // ============================================================================

  private static saveToLocalStorage(state: CheckpointState): void {
    try {
      const allCheckpoints = CheckpointManager.loadAllFromLocalStorage()
      allCheckpoints[state.projectId] = state
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allCheckpoints))
      logger.info(`断点已保存(localStorage fallback): 项目=${state.projectId}`)
    } catch (error) {
      logger.error(`保存断点失败: 项目=${state.projectId}`, error)
    }
  }

  private static loadFromLocalStorage(projectId: string): CheckpointState | null {
    try {
      const allCheckpoints = CheckpointManager.loadAllFromLocalStorage()
      const checkpoint = allCheckpoints[projectId]
      if (!checkpoint) return null

      // 校验数据完整性
      if (
        typeof checkpoint.projectId !== 'string' ||
        typeof checkpoint.startChapter !== 'number' ||
        typeof checkpoint.targetCount !== 'number' ||
        !Array.isArray(checkpoint.completedChapters)
      ) {
        logger.warn(`项目断点数据已损坏(localStorage): ${projectId}`)
        CheckpointManager.clearFromLocalStorage(projectId)
        return null
      }

      logger.info(`断点已加载(localStorage fallback): 项目=${projectId}`)
      return checkpoint
    } catch (error) {
      logger.error(`加载断点失败(localStorage): 项目=${projectId}`, error)
      return null
    }
  }

  private static clearFromLocalStorage(projectId: string): void {
    try {
      const allCheckpoints = CheckpointManager.loadAllFromLocalStorage()
      delete allCheckpoints[projectId]
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allCheckpoints))
    } catch (error) {
      logger.error(`清除断点失败(localStorage): 项目=${projectId}`, error)
    }
  }

  private static loadAllFromLocalStorage(): Record<string, CheckpointState> {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      return JSON.parse(raw) as Record<string, CheckpointState>
    } catch (error) {
      logger.error('读取 localStorage 断点数据失败，返回空数据', error)
      return {}
    }
  }
}
