/**
 * Performance Monitoring Utilities
 *
 * Provides helpers for tracking render times, async operations,
 * Core Web Vitals (LCP, FID, CLS), and custom performance marks/measures.
 *
 * All functions are no-ops in non-browser environments.
 *
 * @example
 * ```ts
 * import { measureRender, measureAsync, getWebVitals, reportMetrics } from '@/utils/performance'
 *
 * // Track component render
 * const end = measureRender('ChapterEditor')
 * // ... render logic ...
 * end()
 *
 * // Track async operation
 * const result = await measureAsync('buildContext', () => buildChapterContext(...))
 *
 * // Get Web Vitals
 * const vitals = getWebVitals()
 *
 * // Report all metrics
 * reportMetrics()
 * ```
 *
 * @module utils/performance
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('performance')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceMetric {
  name: string
  startTime: number
  duration: number
  detail?: string
}

export interface WebVitals {
  /** Largest Contentful Paint (ms) */
  lcp: number | null
  /** First Input Delay (ms) */
  fid: number | null
  /** Cumulative Layout Shift (score) */
  cls: number | null
}

export interface PerformanceReport {
  /** Timestamp when the report was generated */
  timestamp: number
  /** Collected custom metrics */
  metrics: PerformanceMetric[]
  /** Core Web Vitals snapshot */
  webVitals: WebVitals
  /** Navigation timing summary (if available) */
  navigation?: {
    domContentLoaded: number
    loadComplete: number
    timeToFirstByte: number
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const metrics: PerformanceMetric[] = []
const MAX_METRICS = 500

/** Web Vitals observations cached by the long-lived PerformanceObservers. */
let lcpValue: number | null = null
let fidValue: number | null = null
let clsValue: number | null = 0
let observersInitialized = false

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

function isPerformanceSupported(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function'
}

// ---------------------------------------------------------------------------
// Core Web Vitals observers
// ---------------------------------------------------------------------------

function initWebVitalObservers(): void {
  if (observersInitialized || typeof PerformanceObserver === 'undefined') return
  observersInitialized = true

  try {
    // LCP
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries()
      if (entries.length > 0) {
        lcpValue = entries[entries.length - 1].startTime
      }
    })
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })

    // FID
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries()
      if (entries.length > 0) {
        const firstEntry = entries[0] as PerformanceEntry & { processingStart?: number }
        if (typeof firstEntry.processingStart === 'number') {
          fidValue = firstEntry.processingStart - firstEntry.startTime
        }
      }
    })
    fidObserver.observe({ type: 'first-input', buffered: true })

    // CLS
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
        if (layoutShift.hadRecentInput) continue
        if (typeof layoutShift.value === 'number') {
          clsValue = (clsValue ?? 0) + layoutShift.value
        }
      }
    })
    clsObserver.observe({ type: 'layout-shift', buffered: true })
  } catch {
    // Some browsers may not support all entry types; degrade gracefully
    logger.debug('Web Vitals observers could not be fully initialized')
  }
}

// Initialize eagerly so buffered entries are captured as early as possible
if (typeof window !== 'undefined') {
  initWebVitalObservers()
}

// ---------------------------------------------------------------------------
// measureRender — component render time tracking
// ---------------------------------------------------------------------------

/**
 * Start measuring a component render. Returns a function that ends the
 * measurement and records the duration.
 *
 * @param componentName - Human-readable component name
 * @returns A function to call at the end of the render
 */
export function measureRender(componentName: string): () => void {
  if (!isPerformanceSupported()) return noop

  const startMark = `render-${componentName}-start`
  const endMark = `render-${componentName}-end`
  const measureName = `render-${componentName}`

  performance.mark(startMark)

  return () => {
    try {
      performance.mark(endMark)
      performance.measure(measureName, startMark, endMark)

      const entries = performance.getEntriesByName(measureName, 'measure')
      const entry = entries[entries.length - 1]
      if (entry) {
        recordMetric({
          name: measureName,
          startTime: entry.startTime,
          duration: entry.duration,
          detail: componentName,
        })
      }

      // Clean up marks to avoid memory growth
      performance.clearMarks(startMark)
      performance.clearMarks(endMark)
      performance.clearMeasures(measureName)
    } catch {
      // Swallow — non-critical path
    }
  }
}

// ---------------------------------------------------------------------------
// measureAsync — async operation time tracking
// ---------------------------------------------------------------------------

/**
 * Measure the wall-clock time of an async operation (Promise-returning function).
 *
 * @param label - Human-readable label for this measurement
 * @param fn    - The async function to wrap
 * @returns The result of `fn()`
 */
export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isPerformanceSupported()) return fn()

  const startMark = `async-${label}-start`
  const endMark = `async-${label}-end`
  const measureName = `async-${label}`

  performance.mark(startMark)

  try {
    const result = await fn()
    return result
  } finally {
    try {
      performance.mark(endMark)
      performance.measure(measureName, startMark, endMark)

      const entries = performance.getEntriesByName(measureName, 'measure')
      const entry = entries[entries.length - 1]
      if (entry) {
        recordMetric({
          name: measureName,
          startTime: entry.startTime,
          duration: entry.duration,
          detail: label,
        })
      }

      performance.clearMarks(startMark)
      performance.clearMarks(endMark)
      performance.clearMeasures(measureName)
    } catch {
      // Swallow — non-critical path
    }
  }
}

// ---------------------------------------------------------------------------
// measureSync — synchronous operation time tracking
// ---------------------------------------------------------------------------

/**
 * Measure the wall-clock time of a synchronous operation.
 *
 * @param label - Human-readable label
 * @param fn    - The synchronous function to wrap
 * @returns The result of `fn()`
 */
export function measureSync<T>(label: string, fn: () => T): T {
  if (!isPerformanceSupported()) return fn()

  const startMark = `sync-${label}-start`
  const endMark = `sync-${label}-end`
  const measureName = `sync-${label}`

  performance.mark(startMark)

  try {
    return fn()
  } finally {
    try {
      performance.mark(endMark)
      performance.measure(measureName, startMark, endMark)

      const entries = performance.getEntriesByName(measureName, 'measure')
      const entry = entries[entries.length - 1]
      if (entry) {
        recordMetric({
          name: measureName,
          startTime: entry.startTime,
          duration: entry.duration,
          detail: label,
        })
      }

      performance.clearMarks(startMark)
      performance.clearMarks(endMark)
      performance.clearMeasures(measureName)
    } catch {
      // Swallow
    }
  }
}

// ---------------------------------------------------------------------------
// getWebVitals
// ---------------------------------------------------------------------------

/**
 * Snapshot the current Core Web Vitals values.
 * Returns `null` for any metric that has not yet been observed.
 */
export function getWebVitals(): WebVitals {
  return {
    lcp: lcpValue,
    fid: fidValue,
    cls: clsValue,
  }
}

// ---------------------------------------------------------------------------
// getMetrics / clearMetrics
// ---------------------------------------------------------------------------

/**
 * Return a shallow copy of all collected custom metrics.
 */
export function getMetrics(): PerformanceMetric[] {
  return [...metrics]
}

/**
 * Clear all collected custom metrics.
 */
export function clearMetrics(): void {
  metrics.length = 0
}

// ---------------------------------------------------------------------------
// reportMetrics
// ---------------------------------------------------------------------------

/**
 * Build a full performance report and log it.
 * In production, the report object could be sent to an analytics endpoint.
 */
export function reportMetrics(): PerformanceReport {
  const report: PerformanceReport = {
    timestamp: Date.now(),
    metrics: getMetrics(),
    webVitals: getWebVitals(),
  }

  if (typeof performance !== 'undefined' && performance.timing) {
    const t = performance.timing
    report.navigation = {
      domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
      loadComplete: t.loadEventEnd - t.navigationStart,
      timeToFirstByte: t.responseStart - t.navigationStart,
    }
  }

  logger.info('[Performance Report]', {
    metricCount: report.metrics.length,
    webVitals: report.webVitals,
    navigation: report.navigation,
  })

  // Log slow metrics (>= 100ms)
  const slowMetrics = report.metrics.filter(m => m.duration >= 100)
  if (slowMetrics.length > 0) {
    logger.warn(
      `[Slow Metrics] ${slowMetrics.length} operations >= 100ms`,
      slowMetrics.map(m => ({ name: m.name, duration: `${m.duration.toFixed(1)}ms` })),
    )
  }

  return report
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function recordMetric(metric: PerformanceMetric): void {
  if (metrics.length >= MAX_METRICS) {
    // Drop oldest half to avoid unbounded growth
    metrics.splice(0, Math.floor(MAX_METRICS / 2))
  }
  metrics.push(metric)
}

function noop(): void {
  // intentional no-op
}
