/**
 * Performance Tracking Composable
 *
 * Provides per-component performance instrumentation for Vue 3 components.
 * Tracks mount time, update time, and optional custom measurements.
 *
 * This is a **per-instance composable** — each component gets its own
 * measurement scope. Use it in `<script setup>` for automatic lifecycle hooks.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePerformance } from '@/composables/usePerformance'
 *
 * const { markMeasure, getReport } = usePerformance('ChapterEditor')
 * // mount time is tracked automatically
 *
 * // Track a custom operation inside the component
 * function handleSave() {
 *   markMeasure('save', () => { /* save logic *\/ })
 * }
 * </script>
 * ```
 *
 * @module composables/usePerformance
 */

import { onMounted, onUpdated, onBeforeUnmount, ref, readonly, type Ref } from 'vue'
import { measureRender, measureSync, measureAsync, type PerformanceMetric } from '@/utils/performance'
import { getLogger } from '@/utils/logger'

const logger = getLogger('performance:composable')

export interface UsePerformanceReturn {
  /** Total time the component took to mount (ms). Populated after mount. */
  mountTime: Readonly<Ref<number | null>>
  /** Total time the component took in its last update (ms). */
  updateTime: Readonly<Ref<number | null>>
  /** Number of times the component has been updated. */
  updateCount: Readonly<Ref<number>>

  /** Measure a synchronous operation scoped to this component. */
  markMeasure<T>(label: string, fn: () => T): T
  /** Measure an async operation scoped to this component. */
  markMeasureAsync<T>(label: string, fn: () => Promise<T>): Promise<T>
  /** Return all custom measurements taken in this component's scope. */
  getReport(): ComponentPerformanceReport
}

export interface ComponentPerformanceReport {
  componentName: string
  mountTime: number | null
  lastUpdateTime: number | null
  updateCount: number
  measurements: PerformanceMetric[]
}

/**
 * Track performance metrics for a Vue component.
 *
 * @param componentName - Human-readable name used in marks and reports
 */
export function usePerformance(componentName: string): UsePerformanceReturn {
  const mountTime: Ref<number | null> = ref(null)
  const updateTime: Ref<number | null> = ref(null)
  const updateCount = ref(0)
  const measurements: PerformanceMetric[] = []

  // Track mount time
  const mountEnd: (() => void) | null = null

  onMounted(() => {
    // measureRender already placed the start mark at call time;
    // we need to close it now. We re-measure by capturing the
    // interval from the start mark that was created just before onMounted.
    if (typeof performance !== 'undefined') {
      const mark = `render-${componentName}-mount-start`
      const endMark = `render-${componentName}-mount-end`
      const measureName = `render-${componentName}-mount`

      performance.mark(endMark)
      performance.measure(measureName, mark, endMark)

      const entries = performance.getEntriesByName(measureName, 'measure')
      const entry = entries[entries.length - 1]
      if (entry) {
        mountTime.value = entry.duration
        measurements.push({
          name: `${componentName}:mount`,
          startTime: entry.startTime,
          duration: entry.duration,
        })
      }

      performance.clearMarks(mark)
      performance.clearMarks(endMark)
      performance.clearMeasures(measureName)
    }

    logger.debug(`[${componentName}] mounted in ${mountTime.value?.toFixed(1) ?? '?'}ms`)
  })

  // Track update time
  onUpdated(() => {
    updateCount.value += 1

    const end = measureRender(`${componentName}-update-${updateCount.value}`)
    // We can't measure "inside" onUpdated easily since it fires after the update.
    // Instead, capture the delta since the last update marker.
    if (typeof performance !== 'undefined') {
      const mark = `render-${componentName}-update-${updateCount.value}-start`
      const endMark = `render-${componentName}-update-${updateCount.value}-end`
      const measureName = `render-${componentName}-update-${updateCount.value}`

      performance.mark(endMark)
      performance.measure(measureName, mark, endMark)

      const entries = performance.getEntriesByName(measureName, 'measure')
      const entry = entries[entries.length - 1]
      if (entry) {
        updateTime.value = entry.duration
        measurements.push({
          name: `${componentName}:update-${updateCount.value}`,
          startTime: entry.startTime,
          duration: entry.duration,
        })
      }

      performance.clearMarks(mark)
      performance.clearMarks(endMark)
      performance.clearMeasures(measureName)
    }

    // Clean up the end() from measureRender since we already measured above
    end()
  })

  // Clean up on unmount
  onBeforeUnmount(() => {
    if (typeof performance !== 'undefined') {
      // Clear any residual marks
      performance.clearMarks(`render-${componentName}-`)
    }
    // Release collected measurements to free memory
    measurements.length = 0
    logger.debug(`[${componentName}] unmounted after ${updateCount.value} updates`)
  })

  function markMeasure<T>(label: string, fn: () => T): T {
    const fullName = `${componentName}:${label}`
    const result = measureSync(fullName, fn)

    // Also record in our local scope
    const entries = performance.getEntriesByName(`sync-${fullName}`, 'measure')
    const entry = entries[entries.length - 1]
    if (entry) {
      measurements.push({
        name: fullName,
        startTime: entry.startTime,
        duration: entry.duration,
      })
    }

    return result
  }

  async function markMeasureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const fullName = `${componentName}:${label}`
    const result = await measureAsync(fullName, fn)

    // Also record in our local scope
    const entries = performance.getEntriesByName(`async-${fullName}`, 'measure')
    const entry = entries[entries.length - 1]
    if (entry) {
      measurements.push({
        name: fullName,
        startTime: entry.startTime,
        duration: entry.duration,
      })
    }

    return result
  }

  function getReport(): ComponentPerformanceReport {
    return {
      componentName,
      mountTime: mountTime.value,
      lastUpdateTime: updateTime.value,
      updateCount: updateCount.value,
      measurements: [...measurements],
    }
  }

  return {
    mountTime: readonly(mountTime),
    updateTime: readonly(updateTime),
    updateCount: readonly(updateCount),
    markMeasure,
    markMeasureAsync,
    getReport,
  }
}
