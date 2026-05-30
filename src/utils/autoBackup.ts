/**
 * Auto Backup（自动定期备份）
 *
 * 每次项目保存时检查距上次自动备份是否超过阈值（默认 30 分钟），
 * 超过则自动创建备份快照存储到 IndexedDB 专用 store。
 * 保留最近 10 个自动备份，超过的自动清理。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:auto-backup')

const DB_NAME = 'AI_Novel_Workshop'
const STORE_NAME = 'auto-backups'
const BACKUP_INTERVAL_MS = 30 * 60 * 1000 // 30 分钟
const MAX_BACKUPS = 10

export interface AutoBackup {
  id: string            // `${projectId}_${timestamp}`
  projectId: string
  timestamp: number
  title: string
  chaptersCount: number
  wordCount: number
  /** 完整的项目数据快照（JSON 序列化） */
  data: string
}

// 上次备份时间缓存
const lastBackupTime = new Map<string, number>()

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close()
        const upgradeReq = indexedDB.open(DB_NAME, db.version + 1)
        upgradeReq.onupgradeneeded = () => {
          const upgradedDb = upgradeReq.result
          if (!upgradedDb.objectStoreNames.contains(STORE_NAME)) {
            upgradedDb.createObjectStore(STORE_NAME, { keyPath: 'id' })
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

/**
 * 检查是否需要自动备份，如果需要则执行
 */
export async function maybeAutoBackup(project: any): Promise<boolean> {
  if (!project?.id) return false

  const now = Date.now()
  const lastTime = lastBackupTime.get(project.id) || 0

  if (now - lastTime < BACKUP_INTERVAL_MS) {
    return false
  }

  try {
    const data = JSON.parse(JSON.stringify(project))
    const backup: AutoBackup = {
      id: `${project.id}_${now}`,
      projectId: project.id,
      timestamp: now,
      title: project.title || '未命名项目',
      chaptersCount: (project.chapters || []).length,
      wordCount: project.currentWords || 0,
      data: JSON.stringify(data),
    }

    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(backup)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    lastBackupTime.set(project.id, now)
    logger.info(`[AutoBackup] 自动备份完成: ${backup.title} (${backup.chaptersCount}章, ${backup.wordCount}字)`)

    // 清理旧备份
    await pruneOldBackups(project.id)

    return true
  } catch (err) {
    logger.warn('[AutoBackup] 自动备份失败（不阻断主流程）:', err)
    return false
  }
}

/**
 * 获取项目的自动备份列表
 */
export async function listAutoBackups(projectId: string): Promise<AutoBackup[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const all = (request.result || []) as AutoBackup[]
        const filtered = all
          .filter(b => b.projectId === projectId)
          .sort((a, b) => b.timestamp - a.timestamp)
        resolve(filtered)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    logger.warn('[AutoBackup] 加载备份列表失败:', err)
    return []
  }
}

/**
 * 恢复指定的自动备份
 */
export async function restoreAutoBackup(backupId: string): Promise<any | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(backupId)

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const backup = request.result as AutoBackup | undefined
        if (!backup) {
          resolve(null)
          return
        }
        try {
          const project = JSON.parse(backup.data)
          logger.info(`[AutoBackup] 恢复备份: ${backup.title} (${new Date(backup.timestamp).toLocaleString()})`)
          resolve(project)
        } catch {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    logger.warn('[AutoBackup] 恢复备份失败:', err)
    return null
  }
}

/**
 * 清理旧备份，保留最近 MAX_BACKUPS 个
 */
async function pruneOldBackups(projectId: string): Promise<void> {
  try {
    const backups = await listAutoBackups(projectId)
    if (backups.length <= MAX_BACKUPS) return

    const toDelete = backups.slice(MAX_BACKUPS)
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    for (const backup of toDelete) {
      store.delete(backup.id)
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })

    logger.info(`[AutoBackup] 清理了 ${toDelete.length} 个旧备份`)
  } catch (err) {
    logger.warn('[AutoBackup] 清理旧备份失败:', err)
  }
}
