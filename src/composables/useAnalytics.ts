/**
 * Vue composable for analytics tracking.
 *
 * Provides reactive access to analytics events and convenience methods
 * for common tracking patterns. Integrates with the core analytics module.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useAnalytics } from '@/composables/useAnalytics'
 *
 * const { track, trackPanelOpen, trackFeature, snapshot, recentEvents } = useAnalytics()
 * </script>
 * ```
 *
 * @module composables/useAnalytics
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  trackEvent,
  trackPageView,
  trackPanelAction,
  trackGenerationStart,
  trackGenerationComplete,
  trackGenerationFail,
  trackProjectCreate,
  trackFeatureUse,
  trackError,
  trackExport,
  getAnalyticsSnapshot,
  onAnalyticsEvent,
  initAnalytics,
  clearAnalytics,
  exportAnalytics,
  type EventCategory,
  type EventAction,
  type AnalyticsEvent,
  type AnalyticsSnapshot,
} from '@/utils/analytics'

// Module-scope reactive state (shared across component instances)
const snapshotRef = ref<AnalyticsSnapshot | null>(null)
const latestEventRef = ref<AnalyticsEvent | null>(null)
const eventCountRef = ref(0)

/** Whether the composable has been initialized at least once. */
let initialized = false

/**
 * Analytics composable.
 *
 * Returns reactive analytics state and tracking convenience methods.
 */
export function useAnalytics() {
  // Ensure analytics session is initialized
  if (!initialized) {
    initAnalytics()
    initialized = true
  }

  // Subscribe to new events for reactive updates
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    // Hydrate from persisted data
    snapshotRef.value = getAnalyticsSnapshot()
    eventCountRef.value = snapshotRef.value.totalEvents

    unsubscribe = onAnalyticsEvent((event) => {
      latestEventRef.value = event
      eventCountRef.value++
      // Debounced snapshot refresh (lightweight: just bump count, full snapshot on demand)
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  /** Refresh the full analytics snapshot on demand. */
  function refreshSnapshot(): void {
    snapshotRef.value = getAnalyticsSnapshot()
    eventCountRef.value = snapshotRef.value.totalEvents
  }

  /** Reactive snapshot (null until first mount). */
  const snapshot = computed(() => snapshotRef.value)

  /** Latest tracked event. */
  const latestEvent = computed(() => latestEventRef.value)

  /** Total event count (incrementally maintained). */
  const eventCount = computed(() => eventCountRef.value)

  /** Recent events from the snapshot (newest first, max 2000). */
  const recentEvents = computed(() => snapshotRef.value?.events ?? [])

  /** Counts by category. */
  const countsByCategory = computed(() => snapshotRef.value?.countsByCategory ?? {
    navigation: 0,
    ai: 0,
    editor: 0,
    sandbox: 0,
  })

  // --- Convenience wrappers ---

  /** Track a generic event. */
  function track(category: EventCategory, action: EventAction, properties: Record<string, string | number | boolean> = {}): void {
    trackEvent(category, action, properties)
    eventCountRef.value++
  }

  /** Track a page view. */
  function trackPage(name: string): void {
    trackPageView(name)
    eventCountRef.value++
  }

  /** Track panel open. */
  function trackPanelOpen(panelName: string): void {
    trackPanelAction(panelName, 'panel_open')
    eventCountRef.value++
  }

  /** Track panel close. */
  function trackPanelClose(panelName: string): void {
    trackPanelAction(panelName, 'panel_close')
    eventCountRef.value++
  }

  /** Track chapter generation start. */
  function trackGenStart(chapterNumber: number): void {
    trackGenerationStart(chapterNumber)
    eventCountRef.value++
  }

  /** Track chapter generation complete. */
  function trackGenComplete(data: {
    chapterNumber: number
    durationMs: number
    wordCount: number
    totalTokens: number
    revised: boolean
    auditScore: number
  }): void {
    trackGenerationComplete(data)
    eventCountRef.value++
  }

  /** Track chapter generation failure. */
  function trackGenFail(data: {
    chapterNumber: number
    durationMs: number
    errorCategory: string
  }): void {
    trackGenerationFail(data)
    eventCountRef.value++
  }

  /** Track project creation. */
  function trackProject(data: { genre: string; targetWords: number }): void {
    trackProjectCreate(data)
    eventCountRef.value++
  }

  /** Track feature usage. */
  function trackFeature(featureName: string, detail?: string): void {
    trackFeatureUse(featureName, detail)
    eventCountRef.value++
  }

  /** Track error. */
  function trackErr(category: EventCategory, errorCategory: string, recoverable: boolean): void {
    trackError(category, errorCategory, recoverable)
    eventCountRef.value++
  }

  /** Track export action. */
  function trackExportAction(format: string): void {
    trackExport(format)
    eventCountRef.value++
  }

  /** Clear all analytics data. */
  function clearAll(): void {
    clearAnalytics()
    eventCountRef.value = 0
    snapshotRef.value = getAnalyticsSnapshot()
    latestEventRef.value = null
  }

  /** Export all analytics data as JSON string. */
  function exportAll(): string {
    return exportAnalytics()
  }

  return {
    // Reactive state
    snapshot,
    latestEvent,
    eventCount,
    recentEvents,
    countsByCategory,
    refreshSnapshot,

    // Tracking methods
    track,
    trackPage,
    trackPanelOpen,
    trackPanelClose,
    trackGenStart,
    trackGenComplete,
    trackGenFail,
    trackProject,
    trackFeature,
    trackErr,
    trackExportAction,

    // Management
    clearAll,
    exportAll,
  }
}
