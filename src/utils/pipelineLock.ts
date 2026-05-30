/**
 * Pipeline 并发保护锁
 *
 * 防止一键续写和 Daemon 自动续写同时操作同一项目。
 * 使用项目级别的互斥锁，锁冲突时返回友好的提示信息。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:pipeline-lock')

interface LockInfo {
  projectId: string
  owner: string       // 持有者标识（如 'batch-continue' / 'daemon'）
  acquiredAt: number
  chapterNumber?: number
}

/** 全局锁表：projectId → LockInfo */
const lockTable = new Map<string, LockInfo>()

/**
 * 尝试获取项目锁
 *
 * @param projectId 项目ID
 * @param owner 持有者标识
 * @param chapterNumber 当前章节号（可选，用于日志）
 * @returns true 如果成功获取锁；false 如果已被其他持有者锁定
 */
export function acquireProjectLock(
  projectId: string,
  owner: string,
  chapterNumber?: number,
): boolean {
  const existing = lockTable.get(projectId)

  if (existing && existing.owner !== owner) {
    const elapsed = Math.round((Date.now() - existing.acquiredAt) / 1000)
    logger.warn(
      `[PipelineLock] 锁冲突: 项目 ${projectId} 已被 ${existing.owner} 锁定 ${elapsed}s，` +
      `${owner} 无法获取锁`
    )
    return false
  }

  lockTable.set(projectId, {
    projectId,
    owner,
    acquiredAt: Date.now(),
    chapterNumber,
  })

  logger.info(`[PipelineLock] 获取锁: 项目 ${projectId} → ${owner}`)
  return true
}

/**
 * 释放项目锁
 */
export function releaseProjectLock(projectId: string, owner: string): void {
  const existing = lockTable.get(projectId)
  if (existing && existing.owner === owner) {
    lockTable.delete(projectId)
    logger.info(`[PipelineLock] 释放锁: 项目 ${projectId} ← ${owner}`)
  }
}

/**
 * 检查项目是否已被锁定
 */
export function isProjectLocked(projectId: string): boolean {
  return lockTable.has(projectId)
}

/**
 * 获取当前锁持有者信息
 */
export function getLockInfo(projectId: string): LockInfo | undefined {
  return lockTable.get(projectId)
}

/**
 * 获取锁冲突时的友好提示消息
 */
export function getLockConflictMessage(projectId: string): string {
  const info = lockTable.get(projectId)
  if (!info) return ''

  const elapsed = Math.round((Date.now() - info.acquiredAt) / 1000)
  const ownerLabel = info.owner === 'batch-continue' ? '一键续写' :
                     info.owner === 'daemon' ? '守护进程自动续写' : info.owner

  return `${ownerLabel}正在进行中（已运行 ${elapsed}秒），请等待当前任务完成后再试`
}

/**
 * 强制释放所有锁（用于异常恢复）
 */
export function forceReleaseAll(): void {
  const count = lockTable.size
  lockTable.clear()
  if (count > 0) {
    logger.warn(`[PipelineLock] 强制释放所有锁（共 ${count} 个）`)
  }
}

/**
 * 检查并清理超时锁（默认 30 分钟超时）
 */
export function cleanupStaleLocks(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now()
  let cleaned = 0

  for (const [projectId, info] of lockTable.entries()) {
    if (now - info.acquiredAt > maxAgeMs) {
      lockTable.delete(projectId)
      cleaned++
      logger.warn(`[PipelineLock] 清理超时锁: 项目 ${projectId}（持有者: ${info.owner}，超时: ${Math.round((now - info.acquiredAt) / 1000)}s）`)
    }
  }

  return cleaned
}
