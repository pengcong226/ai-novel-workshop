<template>
  <div v-if="isDev" class="analytics-dashboard">
    <div class="dashboard-header">
      <h2>Analytics Dashboard</h2>
      <el-tag type="info" size="small">Dev Only</el-tag>
    </div>

    <div class="dashboard-content">
      <!-- Session Info -->
      <el-card shadow="never" class="card">
        <template #header>
          <div class="card-header-row">
            <span>Session</span>
            <el-button size="small" @click="refresh">Refresh</el-button>
          </div>
        </template>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="Session ID">{{ sessionInfo.id }}</el-descriptions-item>
          <el-descriptions-item label="Started">{{ formatTime(sessionInfo.startedAt) }}</el-descriptions-item>
          <el-descriptions-item label="Session Events">{{ sessionInfo.eventCount }}</el-descriptions-item>
          <el-descriptions-item label="Total Events">{{ eventCount }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- Category Breakdown -->
      <el-card shadow="never" class="card">
        <template #header>Events by Category</template>
        <div class="category-grid">
          <div
            v-for="(count, cat) in countsByCategory"
            :key="cat"
            class="category-item"
          >
            <span class="category-label">{{ cat }}</span>
            <span class="category-count">{{ count }}</span>
          </div>
        </div>
      </el-card>

      <!-- Action Breakdown -->
      <el-card shadow="never" class="card">
        <template #header>Events by Action</template>
        <div v-if="actionEntries.length > 0" class="action-list">
          <div
            v-for="[action, count] in actionEntries"
            :key="action"
            class="action-row"
          >
            <span class="action-name">{{ action }}</span>
            <span class="action-count">{{ count }}</span>
          </div>
        </div>
        <div v-else class="empty-state">No events recorded</div>
      </el-card>

      <!-- Recent Events -->
      <el-card shadow="never" class="card">
        <template #header>
          <div class="card-header-row">
            <span>Recent Events ({{ filteredEvents.length }})</span>
            <el-input
              v-model="filterText"
              size="small"
              placeholder="Filter by category/action"
              clearable
              class="filter-input"
            />
          </div>
        </template>
        <div v-if="filteredEvents.length > 0" class="event-list">
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="event-item"
          >
            <div class="event-meta">
              <el-tag :type="categoryTagType(event.category)" size="small">
                {{ event.category }}
              </el-tag>
              <span class="event-action">{{ event.action }}</span>
              <span class="event-time">{{ formatTime(event.timestamp) }}</span>
            </div>
            <div v-if="hasProperties(event.properties)" class="event-props">
              <code>{{ formatProps(event.properties) }}</code>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">No events to display</div>
      </el-card>

      <!-- Actions -->
      <el-card shadow="never" class="card">
        <template #header>Actions</template>
        <el-space>
          <el-button size="small" type="danger" plain @click="handleClear">
            Clear All Data
          </el-button>
          <el-button size="small" @click="handleExport">
            Export JSON
          </el-button>
        </el-space>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAnalytics } from '@/composables/useAnalytics'
import type { EventCategory, AnalyticsEvent } from '@/utils/analytics'

const isDev = import.meta.env.DEV

const {
  snapshot,
  eventCount,
  countsByCategory,
  recentEvents,
  refreshSnapshot,
  clearAll,
  exportAll,
} = useAnalytics()

const filterText = ref('')

const sessionInfo = computed(() => {
  const s = snapshot.value
  return {
    id: s?.session.id ?? '-',
    startedAt: s?.session.startedAt ?? '-',
    eventCount: s?.session.eventCount ?? 0,
  }
})

const actionEntries = computed((): [string, number][] => {
  const s = snapshot.value
  if (!s?.countsByAction) return []
  return Object.entries(s.countsByAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
})

const filteredEvents = computed((): AnalyticsEvent[] => {
  const keyword = filterText.value.trim().toLowerCase()
  const events = recentEvents.value.slice(0, 100)
  if (!keyword) return events
  return events.filter((e) => {
    const text = `${e.category} ${e.action}`.toLowerCase()
    return text.includes(keyword)
  })
})

function refresh(): void {
  refreshSnapshot()
}

function formatTime(iso: string): string {
  if (iso === '-') return '-'
  const date = new Date(iso)
  return `${date.toLocaleTimeString()}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function hasProperties(props: Record<string, string | number | boolean>): boolean {
  return Object.keys(props).length > 0
}

function formatProps(props: Record<string, string | number | boolean>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}=${v}`)
    .join(' | ')
}

function categoryTagType(category: EventCategory): 'success' | 'warning' | 'info' | 'danger' {
  switch (category) {
    case 'navigation': return 'success'
    case 'ai': return 'warning'
    case 'editor': return 'info'
    case 'sandbox': return 'danger'
    default: return 'info'
  }
}

function handleClear(): void {
  clearAll()
  ElMessage.success('Analytics data cleared')
}

function handleExport(): void {
  const json = exportAll()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('Analytics exported')
}

onMounted(() => {
  refreshSnapshot()
})
</script>

<style scoped>
.analytics-dashboard {
  max-width: 1200px;
  margin: 0 auto;
}

.dashboard-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.dashboard-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--ds-text-primary);
}

.dashboard-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  border: 1px solid var(--ds-surface-border);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.filter-input {
  width: 220px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--ds-surface-border);
  border-radius: 8px;
  background: var(--ds-surface);
}

.category-label {
  font-size: 12px;
  color: var(--ds-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.category-count {
  font-size: 24px;
  font-weight: 700;
  color: var(--ds-text-primary);
  margin-top: 4px;
}

.action-list {
  max-height: 240px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--ds-bg-tertiary);
}

.action-name {
  font-size: 13px;
  font-family: monospace;
  color: var(--ds-text-primary);
}

.action-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--ds-text-secondary);
}

.event-list {
  max-height: 400px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-item {
  border: 1px solid var(--ds-surface-border);
  border-radius: 6px;
  padding: 8px;
  background: var(--ds-surface);
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-action {
  font-size: 13px;
  font-family: monospace;
  color: var(--ds-text-primary);
}

.event-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--ds-text-tertiary);
  font-family: monospace;
}

.event-props {
  margin-top: 4px;
  font-size: 11px;
  color: var(--ds-text-secondary);
}

.event-props code {
  font-size: 11px;
  background: var(--ds-bg-tertiary);
  padding: 2px 4px;
  border-radius: 3px;
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--ds-text-tertiary);
  font-size: 13px;
}
</style>
