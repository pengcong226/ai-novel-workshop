import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  formatNumber,
  formatPercentage,
  formatDateTime,
  formatDate,
  formatShortDateTime,
  formatRelativeTime,
  formatTime,
  getChapterStatusType,
  getChapterStatusText,
  getTaskStatusText,
} from '@/utils/formatters'

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------
describe('formatNumber', () => {
  it('returns "0" for undefined', () => {
    expect(formatNumber(undefined)).toBe('0')
  })

  it('returns "0" for null', () => {
    expect(formatNumber(null)).toBe('0')
  })

  it('returns "0" for NaN', () => {
    expect(formatNumber(NaN)).toBe('0')
  })

  it('returns "0" for Infinity', () => {
    expect(formatNumber(Infinity)).toBe('0')
  })

  it('returns the number as-is when below 10 000', () => {
    expect(formatNumber(9999)).toBe('9999')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(42)).toBe('42')
  })

  it('formats values >= 10 000 in 万 units with one decimal', () => {
    expect(formatNumber(10000)).toBe('1.0万')
    expect(formatNumber(23456)).toBe('2.3万')
    expect(formatNumber(1234567)).toBe('123.5万')
  })

  it('handles negative numbers below 10 000', () => {
    expect(formatNumber(-500)).toBe('-500')
  })

  it('handles zero correctly', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// formatPercentage
// ---------------------------------------------------------------------------
describe('formatPercentage', () => {
  it('returns 0 when total is 0', () => {
    expect(formatPercentage(5, 0)).toBe(0)
  })

  it('returns 0 when total is falsy (null-like)', () => {
    expect(formatPercentage(5, 0)).toBe(0)
  })

  it('calculates percentage correctly', () => {
    expect(formatPercentage(1, 4)).toBe(25)
    expect(formatPercentage(3, 4)).toBe(75)
  })

  it('rounds to nearest integer', () => {
    expect(formatPercentage(1, 3)).toBe(33) // 33.33.. -> 33
    expect(formatPercentage(2, 3)).toBe(67) // 66.66.. -> 67
  })

  it('caps at 100 even when value exceeds total', () => {
    expect(formatPercentage(150, 100)).toBe(100)
    expect(formatPercentage(200, 50)).toBe(100)
  })

  it('returns 100 when value equals total', () => {
    expect(formatPercentage(10, 10)).toBe(100)
  })

  it('returns 0 when value is 0', () => {
    expect(formatPercentage(0, 100)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
  it('formats a Date object to YYYY-MM-DD HH:mm', () => {
    const d = new Date(2024, 0, 5, 9, 3) // 2024-01-05 09:03
    expect(formatDateTime(d)).toBe('2024-01-05 09:03')
  })

  it('formats a unix timestamp (ms) correctly', () => {
    const ts = new Date(2023, 11, 25, 14, 30).getTime()
    expect(formatDateTime(ts)).toBe('2023-12-25 14:30')
  })

  it('pads single-digit month, day, hour, and minute', () => {
    const d = new Date(2024, 0, 1, 0, 0) // 2024-01-01 00:00
    expect(formatDateTime(d)).toBe('2024-01-01 00:00')
  })

  it('handles end-of-day time', () => {
    const d = new Date(2024, 11, 31, 23, 59)
    expect(formatDateTime(d)).toBe('2024-12-31 23:59')
  })
})

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a Date object to YYYY-MM-DD', () => {
    const d = new Date(2024, 5, 15) // 2024-06-15
    expect(formatDate(d)).toBe('2024-06-15')
  })

  it('formats a unix timestamp (ms)', () => {
    const ts = new Date(2023, 0, 1).getTime()
    expect(formatDate(ts)).toBe('2023-01-01')
  })

  it('pads single-digit months and days', () => {
    const d = new Date(2024, 2, 5) // 2024-03-05
    expect(formatDate(d)).toBe('2024-03-05')
  })

  it('returns "未记录" for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('未记录')
  })

  it('returns "未记录" for invalid timestamp', () => {
    expect(formatDate(NaN)).toBe('未记录')
  })
})

// ---------------------------------------------------------------------------
// formatShortDateTime
// ---------------------------------------------------------------------------
describe('formatShortDateTime', () => {
  it('formats to MM-DD HH:mm (no year)', () => {
    const d = new Date(2024, 7, 12, 15, 45) // Aug 12 15:45
    expect(formatShortDateTime(d)).toBe('08-12 15:45')
  })

  it('pads single-digit month and day', () => {
    const d = new Date(2024, 0, 3, 8, 5) // Jan 03 08:05
    expect(formatShortDateTime(d)).toBe('01-03 08:05')
  })

  it('accepts a numeric timestamp', () => {
    const ts = new Date(2024, 9, 1, 12, 0).getTime()
    expect(formatShortDateTime(ts)).toBe('10-01 12:00')
  })
})

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0)) // 2024-06-15 12:00
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "今天更新" for today', () => {
    const today = new Date(2024, 5, 15, 10, 0)
    expect(formatRelativeTime(today)).toBe('今天更新')
  })

  it('returns "昨天更新" for yesterday', () => {
    const yesterday = new Date(2024, 5, 14, 10, 0)
    expect(formatRelativeTime(yesterday)).toBe('昨天更新')
  })

  it('returns N 天前 for 2-29 days ago', () => {
    const fiveDaysAgo = new Date(2024, 5, 10, 10, 0)
    expect(formatRelativeTime(fiveDaysAgo)).toBe('5 天前')
  })

  it('falls back to formatted date for 30+ days', () => {
    const longAgo = new Date(2024, 4, 1, 10, 0) // May 1
    expect(formatRelativeTime(longAgo)).toBe('2024-05-01')
  })

  it('accepts a date string input', () => {
    const yesterday = '2024-06-14T10:00:00'
    expect(formatRelativeTime(yesterday)).toBe('昨天更新')
  })
})

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe('formatTime', () => {
  it('formats hours, minutes, seconds with leading zeros', () => {
    const d = new Date(2024, 0, 1, 3, 5, 9)
    expect(formatTime(d)).toBe('03:05:09')
  })

  it('handles noon and midnight', () => {
    const noon = new Date(2024, 0, 1, 12, 0, 0)
    expect(formatTime(noon)).toBe('12:00:00')

    const midnight = new Date(2024, 0, 1, 0, 0, 0)
    expect(formatTime(midnight)).toBe('00:00:00')
  })

  it('handles end-of-second 59', () => {
    const d = new Date(2024, 0, 1, 23, 59, 59)
    expect(formatTime(d)).toBe('23:59:59')
  })
})

// ---------------------------------------------------------------------------
// getChapterStatusType
// ---------------------------------------------------------------------------
describe('getChapterStatusType', () => {
  it('returns "info" for draft', () => {
    expect(getChapterStatusType('draft')).toBe('info')
  })

  it('returns "warning" for writing', () => {
    expect(getChapterStatusType('writing')).toBe('warning')
  })

  it('returns "warning" for revised', () => {
    expect(getChapterStatusType('revised')).toBe('warning')
  })

  it('returns "success" for final', () => {
    expect(getChapterStatusType('final')).toBe('success')
  })

  it('returns "success" for completed', () => {
    expect(getChapterStatusType('completed')).toBe('success')
  })

  it('returns "info" for unknown status', () => {
    expect(getChapterStatusType('unknown')).toBe('info')
    expect(getChapterStatusType('')).toBe('info')
  })
})

// ---------------------------------------------------------------------------
// getChapterStatusText
// ---------------------------------------------------------------------------
describe('getChapterStatusText', () => {
  it('maps draft to 草稿', () => {
    expect(getChapterStatusText('draft')).toBe('草稿')
  })

  it('maps writing to 写作中', () => {
    expect(getChapterStatusText('writing')).toBe('写作中')
  })

  it('maps revised to 已修订', () => {
    expect(getChapterStatusText('revised')).toBe('已修订')
  })

  it('maps final to 定稿', () => {
    expect(getChapterStatusText('final')).toBe('定稿')
  })

  it('maps completed to 已完成', () => {
    expect(getChapterStatusText('completed')).toBe('已完成')
  })

  it('returns the raw status for unknown values', () => {
    expect(getChapterStatusText('archived')).toBe('archived')
    expect(getChapterStatusText('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getTaskStatusText
// ---------------------------------------------------------------------------
describe('getTaskStatusText', () => {
  it('maps pending to 等待中', () => {
    expect(getTaskStatusText('pending')).toBe('等待中')
  })

  it('maps running to 进行中', () => {
    expect(getTaskStatusText('running')).toBe('进行中')
  })

  it('maps success to 完成', () => {
    expect(getTaskStatusText('success')).toBe('完成')
  })

  it('maps error to 失败', () => {
    expect(getTaskStatusText('error')).toBe('失败')
  })

  it('maps cancelled to 已取消', () => {
    expect(getTaskStatusText('cancelled')).toBe('已取消')
  })

  it('returns the raw status for unknown values', () => {
    expect(getTaskStatusText('unknown')).toBe('unknown')
    expect(getTaskStatusText('')).toBe('')
  })
})
