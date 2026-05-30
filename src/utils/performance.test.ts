import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  measureRender,
  measureAsync,
  measureSync,
  getWebVitals,
  getMetrics,
  clearMetrics,
  reportMetrics,
} from '@/utils/performance'

// Mock the logger to avoid console noise and capture calls
vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('performance utilities', () => {
  beforeEach(() => {
    clearMetrics()
    // Provide a minimal performance mock so isPerformanceSupported() returns true
    if (typeof globalThis.performance === 'undefined') {
      vi.stubGlobal('performance', {
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByName: vi.fn(() => [{ startTime: 10, duration: 5 }]),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
      })
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('measureRender', () => {
    it('returns a function', () => {
      const end = measureRender('TestComponent')
      expect(typeof end).toBe('function')
      end()
    })

    it('records a metric when the returned function is called', () => {
      const end = measureRender('ChapterEditor')
      end()

      const metrics = getMetrics()
      expect(metrics.length).toBeGreaterThanOrEqual(1)
      const found = metrics.find(m => m.name === 'render-ChapterEditor')
      expect(found).toBeDefined()
      expect(found!.detail).toBe('ChapterEditor')
    })
  })

  describe('measureAsync', () => {
    it('returns the result of the wrapped async function', async () => {
      const result = await measureAsync('test-op', async () => 42)
      expect(result).toBe(42)
    })

    it('records a metric after the async operation completes', async () => {
      await measureAsync('buildContext', async () => 'done')

      const metrics = getMetrics()
      expect(metrics.length).toBeGreaterThanOrEqual(1)
      const found = metrics.find(m => m.name === 'async-buildContext')
      expect(found).toBeDefined()
      expect(found!.detail).toBe('buildContext')
    })

    it('records the metric even when the async function rejects', async () => {
      await expect(
        measureAsync('fail-op', async () => {
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')

      const metrics = getMetrics()
      const found = metrics.find(m => m.name === 'async-fail-op')
      expect(found).toBeDefined()
    })
  })

  describe('measureSync', () => {
    it('returns the result of the wrapped synchronous function', () => {
      const result = measureSync('calc', () => 99)
      expect(result).toBe(99)
    })

    it('records a metric for the synchronous operation', () => {
      measureSync('parseJSON', () => JSON.parse('{"a":1}'))

      const metrics = getMetrics()
      const found = metrics.find(m => m.name === 'sync-parseJSON')
      expect(found).toBeDefined()
      expect(found!.detail).toBe('parseJSON')
    })
  })

  describe('getMetrics / clearMetrics', () => {
    it('clearMetrics empties the metrics list', () => {
      measureSync('op', () => 1)
      expect(getMetrics().length).toBeGreaterThan(0)

      clearMetrics()
      expect(getMetrics()).toEqual([])
    })

    it('getMetrics returns a shallow copy (mutating it does not affect internal state)', () => {
      measureSync('op', () => 1)
      const copy = getMetrics()
      copy.pop()

      expect(getMetrics().length).toBe(1)
    })
  })

  describe('getWebVitals', () => {
    it('returns an object with lcp, fid, and cls fields', () => {
      const vitals = getWebVitals()
      expect(vitals).toHaveProperty('lcp')
      expect(vitals).toHaveProperty('fid')
      expect(vitals).toHaveProperty('cls')
    })
  })

  describe('reportMetrics', () => {
    it('returns a report object with timestamp, metrics, and webVitals', () => {
      measureSync('op', () => 1)
      const report = reportMetrics()

      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('metrics')
      expect(report).toHaveProperty('webVitals')
      expect(typeof report.timestamp).toBe('number')
      expect(Array.isArray(report.metrics)).toBe(true)
    })

    it('includes navigation info when performance.timing is available', () => {
      vi.stubGlobal('performance', {
        mark: vi.fn(),
        measure: vi.fn(),
        getEntriesByName: vi.fn(() => [{ startTime: 0, duration: 0 }]),
        clearMarks: vi.fn(),
        clearMeasures: vi.fn(),
        timing: {
          navigationStart: 0,
          domContentLoadedEventEnd: 500,
          loadEventEnd: 800,
          responseStart: 100,
        },
      })

      const report = reportMetrics()
      expect(report.navigation).toBeDefined()
      expect(report.navigation!.domContentLoaded).toBe(500)
      expect(report.navigation!.loadComplete).toBe(800)
      expect(report.navigation!.timeToFirstByte).toBe(100)
    })
  })
})
