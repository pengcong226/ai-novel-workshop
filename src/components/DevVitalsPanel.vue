<template>
  <div v-if="isVisible" class="dev-vitals-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="isCollapsed = !isCollapsed">
      <span class="panel-title">Web Vitals</span>
      <span class="panel-toggle">{{ isCollapsed ? '+' : '-' }}</span>
    </div>

    <div v-show="!isCollapsed" class="panel-body">
      <div
        v-for="metric in metricRows"
        :key="metric.name"
        class="metric-row"
      >
        <span class="metric-name">{{ metric.name }}</span>
        <span class="metric-value" :class="metric.ratingClass">
          {{ metric.displayValue }}
        </span>
        <span class="metric-rating" :class="metric.ratingClass">
          {{ metric.ratingLabel }}
        </span>
      </div>

      <div v-if="metricRows.length === 0" class="metric-empty">
        Waiting for metrics...
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useWebVitals } from '@/composables/useWebVitals'
import type { VitalMetric } from '@/utils/webVitals'

const { vitals } = useWebVitals()

const isVisible = ref(import.meta.env.DEV)
const isCollapsed = ref(false)

interface MetricRow {
  name: string
  displayValue: string
  ratingLabel: string
  ratingClass: string
}

function formatValue(name: string, value: number): string {
  if (name === 'CLS') return value.toFixed(4)
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
  return `${Math.round(value)}ms`
}

function ratingClass(rating: VitalMetric['rating']): string {
  return `rating-${rating}`
}

function ratingLabel(rating: VitalMetric['rating']): string {
  switch (rating) {
    case 'good': return 'Good'
    case 'needs-improvement': return 'NI'
    case 'poor': return 'Poor'
    default: return ''
  }
}

const metricRows = computed<MetricRow[]>(() => {
  const result: MetricRow[] = []
  const entries = vitals.value
  for (const [name, metric] of Object.entries(entries)) {
    if (!metric) continue
    result.push({
      name,
      displayValue: formatValue(name, metric.value),
      ratingClass: ratingClass(metric.rating),
      ratingLabel: ratingLabel(metric.rating),
    })
  }
  return result
})
</script>

<style scoped>
.dev-vitals-panel {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 10000;
  min-width: 180px;
  background: color-mix(in srgb, var(--ds-bg-elevated, #1e1e1e) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--ds-border, #333) 60%, transparent);
  border-radius: var(--ds-radius-md, 8px);
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--ds-text-primary, #e0e0e0);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  user-select: none;
}

.dev-vitals-panel.collapsed .panel-body {
  display: none;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
  background: color-mix(in srgb, var(--ds-bg-elevated, #2a2a2a) 80%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ds-border, #333) 40%, transparent);
}

.panel-title {
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.panel-toggle {
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
}

.panel-body {
  padding: 4px 0;
}

.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 10px;
  gap: 8px;
}

.metric-row:hover {
  background: color-mix(in srgb, var(--ds-accent, #5b8dd9) 8%, transparent);
}

.metric-name {
  font-weight: 600;
  opacity: 0.7;
  min-width: 32px;
}

.metric-value {
  flex: 1;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.metric-rating {
  min-width: 24px;
  text-align: center;
  font-weight: 700;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
}

.rating-good {
  color: #22c55e;
}

.rating-needs-improvement {
  color: #eab308;
}

.rating-poor {
  color: #ef4444;
}

.metric-empty {
  padding: 8px 10px;
  opacity: 0.5;
  text-align: center;
}
</style>
