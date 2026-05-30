/**
 * 统一格式化工具函数
 * 消除各组件中重复定义的 formatNumber / formatDate / getStatusType 等函数
 */

// ============ 数字格式化 ============

/** 将数字格式化为万字显示，null/undefined/NaN 安全 */
export function formatNumber(num?: number | null): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '0'
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`
  return num.toString()
}

/** 百分比格式化 */
export function formatPercentage(value: number, total: number): number {
  if (!total) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

// ============ 日期格式化 ============

export function formatDateTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDate(ts: number | Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '未记录'
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatShortDateTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelativeTime(date: Date | string): string {
  const timestamp = new Date(date).getTime()
  const diffDays = Math.floor((Date.now() - timestamp) / 86400000)
  if (diffDays <= 0) return '今天更新'
  if (diffDays === 1) return '昨天更新'
  if (diffDays < 30) return `${diffDays} 天前`
  return formatDate(date)
}

export function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

// ============ 章节状态格式化 ============

type TagType = 'info' | 'warning' | 'success' | 'danger' | ''

/** 章节状态 → Element Plus Tag 类型 */
export function getChapterStatusType(status: string): TagType {
  const types: Record<string, TagType> = {
    draft: 'info',
    writing: 'warning',
    revised: 'warning',
    final: 'success',
    completed: 'success',
  }
  return types[status] || 'info'
}

/** 章节状态 → 中文标签 */
export function getChapterStatusText(status: string): string {
  const texts: Record<string, string> = {
    draft: '草稿',
    writing: '写作中',
    revised: '已修订',
    final: '定稿',
    completed: '已完成',
  }
  return texts[status] || status
}

// ============ 任务状态格式化 ============

/** 任务状态 → 中文标签 */
export function getTaskStatusText(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    running: '进行中',
    success: '完成',
    error: '失败',
    cancelled: '已取消',
  }
  return labels[status] || status
}
