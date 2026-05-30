/**
 * Storage Estimator（存储空间监控）
 *
 * 使用 navigator.storage.estimate() API 检查 IndexedDB 使用量。
 * 接近上限时弹出警告，防止静默写入失败。
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:storage-estimator')

export interface StorageEstimate {
  /** 已使用字节数 */
  usage: number
  /** 总配额字节数 */
  quota: number
  /** 使用率 (0-1) */
  usageRatio: number
  /** 可读的已使用大小 */
  usageFormatted: string
  /** 可读的配额大小 */
  quotaFormatted: string
  /** 警告级别 */
  level: 'normal' | 'warning' | 'critical'
}

/** 使用率超过 80% 时警告 */
const WARNING_THRESHOLD = 0.8

/** 使用率超过 95% 时严重警告 */
const CRITICAL_THRESHOLD = 0.95

/**
 * 获取存储使用情况
 */
export async function estimateStorageUsage(): Promise<StorageEstimate | null> {
  try {
    if (!navigator?.storage?.estimate) {
      logger.warn('[StorageEstimator] navigator.storage.estimate 不可用')
      return null
    }

    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0
    const usageRatio = quota > 0 ? usage / quota : 0

    let level: StorageEstimate['level'] = 'normal'
    if (usageRatio >= CRITICAL_THRESHOLD) {
      level = 'critical'
    } else if (usageRatio >= WARNING_THRESHOLD) {
      level = 'warning'
    }

    const result: StorageEstimate = {
      usage,
      quota,
      usageRatio,
      usageFormatted: formatBytes(usage),
      quotaFormatted: formatBytes(quota),
      level,
    }

    if (level !== 'normal') {
      logger.warn(
        `[StorageEstimator] 存储使用率 ${level === 'critical' ? '严重' : '偏高'}: ` +
        `${result.usageFormatted} / ${result.quotaFormatted} (${(usageRatio * 100).toFixed(1)}%)`
      )
    }

    return result
  } catch (err) {
    logger.error('[StorageEstimator] 存储估算失败:', err)
    return null
  }
}

/**
 * 检查存储是否接近上限并返回警告信息
 * @returns 警告信息，如果不需要警告则返回 null
 */
export async function checkStorageWarning(): Promise<string | null> {
  const estimate = await estimateStorageUsage()
  if (!estimate) return null

  if (estimate.level === 'critical') {
    return `⚠️ 存储空间严重不足（已使用 ${estimate.usageFormatted} / ${estimate.quotaFormatted}），建议立即清理数据或导出备份`
  }

  if (estimate.level === 'warning') {
    return `存储空间使用率偏高（已使用 ${estimate.usageFormatted} / ${estimate.quotaFormatted}），建议清理不需要的章节快照`
  }

  return null
}

/**
 * 格式化字节数为可读字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(1)} ${units[i]}`
}
