/**
 * Web Vitals Tracking Utility
 *
 * Registers callbacks for Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
 * using the `web-vitals` library. Values are stored in a shared map
 * and subscribers are notified on each update.
 *
 * Safe to call in SSR / non-browser contexts — all registration is
 * guarded by a `typeof window` check.
 *
 * @module utils/webVitals
 */

import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import type { MetricType } from 'web-vitals'

/** Supported metric names. */
export type VitalName = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'

/** Single metric snapshot exposed to consumers. */
export interface VitalMetric {
  name: VitalName
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  delta: number
  id: string
  navigationType: string
  updatedAt: number
}

export type VitalUpdateListener = (metric: VitalMetric) => void

/* ------------------------------------------------------------------ */
/*  Internal state                                                     */
/* ------------------------------------------------------------------ */

const metrics = new Map<VitalName, VitalMetric>()
const listeners = new Set<VitalUpdateListener>()
let registered = false

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toVitalMetric(raw: MetricType): VitalMetric {
  return {
    name: raw.name as VitalName,
    value: raw.value,
    rating: raw.rating,
    delta: raw.delta,
    id: raw.id,
    navigationType: raw.navigationType,
    updatedAt: Date.now(),
  }
}

function handleMetric(raw: MetricType): void {
  const vital = toVitalMetric(raw)
  metrics.set(vital.name, vital)
  for (const listener of listeners) {
    try {
      listener(vital)
    } catch {
      /* swallow listener errors — do not break other listeners */
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Register all Web Vitals observers.
 * Idempotent — calling multiple times has no additional effect.
 * No-op in non-browser environments.
 */
export function registerWebVitals(): void {
  if (registered || typeof window === 'undefined') return
  registered = true

  onLCP(handleMetric, { reportAllChanges: true })
  onCLS(handleMetric, { reportAllChanges: true })
  onINP(handleMetric, { reportAllChanges: true })
  onFCP(handleMetric, { reportAllChanges: true })
  onTTFB(handleMetric, { reportAllChanges: true })
}

/**
 * Return a shallow copy of all collected metrics so far.
 */
export function getVitalsSnapshot(): Record<VitalName, VitalMetric | undefined> {
  return {
    LCP: metrics.get('LCP'),
    CLS: metrics.get('CLS'),
    INP: metrics.get('INP'),
    FCP: metrics.get('FCP'),
    TTFB: metrics.get('TTFB'),
  }
}

/**
 * Subscribe to metric updates. Returns an unsubscribe function.
 */
export function onVitalUpdate(listener: VitalUpdateListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Reset all internal state — intended for tests only.
 */
export function resetVitalsForTest(): void {
  metrics.clear()
  listeners.clear()
  registered = false
}
