/**
 * Web Vitals Reactive Composable
 *
 * Exposes Core Web Vitals as Vue reactive refs. The composable registers
 * the underlying `web-vitals` observers on first call (module-scope
 * singleton pattern) and tears down the listener subscription on
 * component unmount.
 *
 * In non-browser environments all refs stay at their initial values
 * and no observers are created.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useWebVitals } from '@/composables/useWebVitals'
 *
 * const { vitals, lcp, cls, inp, fcp, ttfb } = useWebVitals()
 * </script>
 *
 * <template>
 *   <pre>{{ vitals }}</pre>
 * </template>
 * ```
 */

import { computed, onUnmounted, ref, type Ref } from 'vue'
import {
  registerWebVitals,
  getVitalsSnapshot,
  onVitalUpdate,
  type VitalMetric,
  type VitalName,
} from '@/utils/webVitals'

/* ------------------------------------------------------------------ */
/*  Module-scope reactive state (shared across all component instances) */
/* ------------------------------------------------------------------ */

const lcpRef = ref<VitalMetric>()
const clsRef = ref<VitalMetric>()
const inpRef = ref<VitalMetric>()
const fcpRef = ref<VitalMetric>()
const ttfbRef = ref<VitalMetric>()

const refMap: Record<VitalName, Ref<VitalMetric | undefined>> = {
  LCP: lcpRef,
  CLS: clsRef,
  INP: inpRef,
  FCP: fcpRef,
  TTFB: ttfbRef,
}

/* ------------------------------------------------------------------ */
/*  Composable                                                         */
/* ------------------------------------------------------------------ */

export function useWebVitals() {
  // Ensure observers are registered (idempotent)
  registerWebVitals()

  // Hydrate refs from any metrics already collected
  const snapshot = getVitalsSnapshot()
  for (const [name, metric] of Object.entries(snapshot) as [VitalName, VitalMetric | undefined][]) {
    if (metric && !refMap[name].value) {
      refMap[name].value = metric
    }
  }

  // Subscribe to future updates
  const unsubscribe = onVitalUpdate((metric) => {
    const target = refMap[metric.name]
    if (target) {
      target.value = metric
    }
  })

  onUnmounted(() => {
    unsubscribe()
  })

  /** Flat record of all vitals for convenient iteration / display. */
  const vitals = computed(() => ({
    LCP: lcpRef.value,
    CLS: clsRef.value,
    INP: inpRef.value,
    FCP: fcpRef.value,
    TTFB: ttfbRef.value,
  }))

  return {
    vitals,
    lcp: computed(() => lcpRef.value),
    cls: computed(() => clsRef.value),
    inp: computed(() => inpRef.value),
    fcp: computed(() => fcpRef.value),
    ttfb: computed(() => ttfbRef.value),
  }
}
