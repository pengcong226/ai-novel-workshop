import { describe, expect, it } from 'vitest'
import { formatDateTime, formatDate, formatShortDateTime } from '@/utils/formatDate'

describe('formatDate utilities', () => {
  // Fixed date: 2024-03-05 09:07 local
  const fixedDate = new Date(2024, 2, 5, 9, 7, 0) // month is 0-indexed
  const fixedTs = fixedDate.getTime()

  describe('formatDateTime', () => {
    it('formats a Date object', () => {
      expect(formatDateTime(fixedDate)).toBe('2024-03-05 09:07')
    })

    it('formats a numeric timestamp', () => {
      expect(formatDateTime(fixedTs)).toBe('2024-03-05 09:07')
    })

    it('pads single-digit month and day', () => {
      const d = new Date(2024, 0, 1, 0, 0) // Jan 1
      expect(formatDateTime(d)).toBe('2024-01-01 00:00')
    })

    it('handles noon correctly', () => {
      const d = new Date(2024, 5, 15, 12, 30)
      expect(formatDateTime(d)).toBe('2024-06-15 12:30')
    })
  })

  describe('formatDate', () => {
    it('returns date without time from a Date object', () => {
      expect(formatDate(fixedDate)).toBe('2024-03-05')
    })

    it('returns date without time from a numeric timestamp', () => {
      expect(formatDate(fixedTs)).toBe('2024-03-05')
    })

    it('pads single-digit month', () => {
      const d = new Date(2024, 0, 15)
      expect(formatDate(d)).toBe('2024-01-15')
    })

    it('pads single-digit day', () => {
      const d = new Date(2024, 9, 3)
      expect(formatDate(d)).toBe('2024-10-03')
    })
  })

  describe('formatShortDateTime', () => {
    it('omits year from a Date object', () => {
      expect(formatShortDateTime(fixedDate)).toBe('03-05 09:07')
    })

    it('omits year from a numeric timestamp', () => {
      expect(formatShortDateTime(fixedTs)).toBe('03-05 09:07')
    })

    it('pads single-digit month and day', () => {
      const d = new Date(2024, 0, 1, 8, 5)
      expect(formatShortDateTime(d)).toBe('01-01 08:05')
    })

    it('handles end-of-day time', () => {
      const d = new Date(2024, 11, 31, 23, 59)
      expect(formatShortDateTime(d)).toBe('12-31 23:59')
    })
  })
})
