/**
 * Mock 数据清理工具
 *
 * 清空 IndexedDB 和 localStorage 中的开发/测试 mock 数据，
 * 保留必要的全局配置（global-config）。
 *
 * 仅在首次交付时执行一次，执行后标记完成。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:cleanup-mock-data')
const CLEANUP_DONE_KEY = 'ai-novel-workshop:mock-data-cleanup:v1'

/**
 * 执行 mock 数据清理
 * @returns 是否执行了清理
 */
export async function cleanupMockData(): Promise<boolean> {
  // 检查是否已经执行过清理
  if (localStorage.getItem(CLEANUP_DONE_KEY) === 'done') {
    logger.info('Mock 数据清理已完成，跳过')
    return false
  }

  logger.info('开始清理 Mock 数据...')

  try {
    // 1. 保留的 localStorage 键
    const preserveKeys = new Set([
      'global-config',           // 全局 AI 配置
      'ai-novel-workshop:pipeline-tour:completed', // Tour 完成标记
    ])

    // 2. 清理 localStorage（保留指定键）
    const keysToPreserve: Record<string, string | null> = {}
    for (const key of preserveKeys) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        keysToPreserve[key] = value
      }
    }

    // 清空所有 localStorage
    localStorage.clear()

    // 恢复保留的键
    for (const [key, value] of Object.entries(keysToPreserve)) {
      if (value !== null) {
        localStorage.setItem(key, value)
      }
    }

    logger.info('localStorage 已清理（保留全局配置）')

    // 3. 清理 IndexedDB
    const databases = await indexedDB.databases()
    for (const db of databases) {
      if (db.name) {
        logger.info(`删除 IndexedDB: ${db.name}`)
        await deleteDatabase(db.name)
      }
    }

    logger.info('IndexedDB 已清理')

    // 4. 标记清理完成
    localStorage.setItem(CLEANUP_DONE_KEY, 'done')

    logger.info('Mock 数据清理完成')
    return true
  } catch (error) {
    logger.error('Mock 数据清理失败:', error)
    // 即使失败也标记完成，避免重复执行
    localStorage.setItem(CLEANUP_DONE_KEY, 'done')
    return false
  }
}

/**
 * 删除 IndexedDB 数据库
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => {
      logger.warn(`IndexedDB ${name} 删除被阻塞，可能仍有连接`)
      resolve()
    }
  })
}
