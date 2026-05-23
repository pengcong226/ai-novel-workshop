<template>
  <div class="character-state-tracker">
    <!-- 状态概览 -->
    <el-card shadow="hover" class="overview-card">
      <template #header>
        <div class="card-header">
          <span>人物状态概览</span>
          <el-button type="primary" size="small" @click="refreshStates">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <div v-if="charactersWithState.length === 0" class="empty-state">
        <el-empty description="暂无人物状态数据">
          <el-button type="primary" @click="initializeStates">初始化状态</el-button>
        </el-empty>
      </div>

      <div v-else class="states-grid">
        <el-card
          v-for="char in charactersWithState"
          :key="char.id"
          class="state-card"
          shadow="hover"
          @click="showStateDetail(char)"
        >
          <div class="state-header">
            <div class="character-info">
              <span class="name">{{ char.name }}</span>
              <el-tag :type="getTagType(char.importance)" size="small">{{ getTagLabel(char.importance) }}</el-tag>
            </div>
            <el-tag :type="getStatusType(char.currentState?.status)">
              {{ char.currentState?.status || '未知' }}
            </el-tag>
          </div>

          <div class="state-content">
            <div class="state-item" v-if="char.currentState?.location">
              <el-icon><Location /></el-icon>
              <span>{{ char.currentState.location }}</span>
            </div>
            <div class="state-item" v-if="char.currentState?.faction">
              <el-icon><Flag /></el-icon>
              <span>{{ char.currentState.faction }}</span>
            </div>
            <div class="state-item">
              <el-icon><Document /></el-icon>
              <span>{{ char.stateHistory?.length || 0 }} 条变更记录</span>
            </div>
          </div>

          <div class="state-footer">
            <span class="update-time">
              更新于 {{ formatTime(char.currentState?.updatedAt) }}
            </span>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 位置分布 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover" class="location-card">
          <template #header>
            <span>位置分布</span>
          </template>

          <div v-if="locationStats.length === 0" class="empty-section">
            <el-empty description="暂无位置数据" :image-size="60" />
          </div>

          <div v-else class="location-list">
            <div
              v-for="loc in locationStats"
              :key="loc.location"
              class="location-item"
            >
              <div class="location-info">
                <span class="location-name">{{ loc.location || '未知位置' }}</span>
                <el-tag size="small">{{ loc.count }} 人</el-tag>
              </div>
              <div class="location-characters">
                <el-tag
                  v-for="char in loc.characters.slice(0, 5)"
                  :key="char.id"
                  size="small"
                  style="margin-right: 5px; margin-bottom: 5px;"
                >
                  {{ char.name }}
                </el-tag>
                <el-tag v-if="loc.characters.length > 5" size="small" type="info">
                  +{{ loc.characters.length - 5 }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="hover" class="faction-card">
          <template #header>
            <span>势力分布</span>
          </template>

          <div v-if="factionStats.length === 0" class="empty-section">
            <el-empty description="暂无势力数据" :image-size="60" />
          </div>

          <div v-else class="faction-list">
            <div
              v-for="fac in factionStats"
              :key="fac.faction"
              class="faction-item"
            >
              <div class="faction-info">
                <span class="faction-name">{{ fac.faction || '未知势力' }}</span>
                <el-tag size="small">{{ fac.count }} 人</el-tag>
              </div>
              <div class="faction-characters">
                <el-tag
                  v-for="char in fac.characters.slice(0, 5)"
                  :key="char.id"
                  size="small"
                  style="margin-right: 5px; margin-bottom: 5px;"
                >
                  {{ char.name }}
                </el-tag>
                <el-tag v-if="fac.characters.length > 5" size="small" type="info">
                  +{{ fac.characters.length - 5 }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 状态变更历史 -->
    <el-card shadow="hover" class="history-card">
      <template #header>
        <div class="card-header">
          <span>状态变更历史</span>
          <div class="header-actions">
            <el-select v-model="historyFilter.character" placeholder="筛选人物" clearable style="width: 150px; margin-right: 10px;">
              <el-option
                v-for="char in characterEntities"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
            <el-select v-model="historyFilter.type" placeholder="筛选类型" clearable style="width: 120px;">
              <el-option
                v-for="option in HISTORY_CATEGORY_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
        </div>
      </template>

      <div v-if="filteredHistory.length === 0" class="empty-section">
        <el-empty description="暂无状态变更历史" :image-size="60" />
      </div>

      <div v-else class="history-timeline">
        <el-timeline>
          <el-timeline-item
            v-for="(record, index) in filteredHistory"
            :key="index"
            :timestamp="formatTime(record.timestamp)"
            placement="top"
            :type="getHistoryType(record.type)"
          >
            <el-card shadow="hover" class="history-item">
              <div class="history-header">
                <el-tag>{{ record.characterName }}</el-tag>
                <el-tag :type="getHistoryType(record.type)" size="small">
                  {{ getHistoryTypeLabel(record.type) }}
                </el-tag>
              </div>
              <div class="history-content">
                <div v-if="record.type === 'location'">
                  <span class="old-value">{{ record.oldValue || '未知' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '未知' }}</span>
                </div>
                <div v-else-if="record.type === 'status'">
                  <span class="old-value">{{ record.oldValue || '未知' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '未知' }}</span>
                </div>
                <div v-else-if="record.type === 'faction'">
                  <span class="old-value">{{ record.oldValue || '无' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '无' }}</span>
                </div>
                <div v-if="record.chapter" class="chapter-info">
                  第 {{ record.chapter }} 章
                </div>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-card>

    <!-- 状态详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      :title="(selectedEntityRaw?.name || '') + ' - 状态详情'"
      width="600px"
    >
      <div v-if="selectedEntity" class="state-detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="当前位置">
            {{ selectedEntity.properties.location || (selectedEntity.location ? `(${selectedEntity.location.x}, ${selectedEntity.location.y})` : '未知') }}
          </el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="getStatusType(selectedEntity.vitalStatus || selectedEntity.properties.status)">
              {{ selectedEntity.vitalStatus || selectedEntity.properties.status || '未知' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="所属势力">
            {{ selectedEntity.properties.faction || '无' }}
          </el-descriptions-item>
          <el-descriptions-item label="能力">
            <el-tag v-for="ability in selectedEntity.abilities" :key="ability.name" size="small" style="margin-right: 5px;">
              {{ ability.name }} ({{ ability.status }})
            </el-tag>
            <span v-if="selectedEntity.abilities.length === 0">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="关系">
            <el-tag v-for="rel in selectedEntity.relations" :key="rel.targetId" size="small" style="margin-right: 5px;">
              {{ sandboxStore.entities.find(e => e.id === rel.targetId)?.name || rel.targetId }} - {{ rel.type }}
            </el-tag>
            <span v-if="selectedEntity.relations.length === 0">无</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="state-history-section">
          <h4>变更历史</h4>
          <el-timeline v-if="selectedEntityRaw && selectedEntityEvents.length">
            <el-timeline-item
              v-for="(event, index) in selectedEntityEventsReversed"
              :key="index"
              :timestamp="`第 ${event.chapterNumber} 章`"
              placement="top"
              :type="STATE_EVENT_TYPE_TIMELINE_TYPE[event.eventType]"
            >
              <el-card shadow="hover">
                <div>{{ event.eventType }}: {{ event.payload.key || '' }} {{ event.payload.value || event.payload.status || '' }}</div>
                <div v-if="event.payload.targetId">目标: {{ sandboxStore.entities.find(e => e.id === event.payload.targetId)?.name || event.payload.targetId }}</div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无变更历史" :image-size="60" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore, type ResolvedEntity } from '@/stores/sandbox'
import { ElMessage } from 'element-plus'
import { Refresh, Location, Flag, Document, Right } from '@element-plus/icons-vue'
import type { Entity, EntityImportance, StateEvent } from '@/types/sandbox'
import {
  HISTORY_CATEGORY_LABELS,
  HISTORY_CATEGORY_TAG_TYPE,
  STATE_EVENT_TYPE_TIMELINE_TYPE,
  IMPORTANCE_TAG_CONFIG,
  type HistoryCategory,
  type ElementTagType
} from '@/utils/eventTypeLabels'

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()

const project = computed(() => projectStore.currentProject)
const characterEntities = computed(() => sandboxStore.characterEntities)

// 对话框
const showDetailDialog = ref(false)
const selectedEntity = ref<ResolvedEntity | null>(null)
const selectedEntityRaw = ref<Entity | null>(null)

// 历史筛选
const historyFilter = ref({
  character: '',
  type: ''
})

const HISTORY_CATEGORY_OPTIONS: Array<{ value: HistoryCategory; label: string }> = (
  Object.entries(HISTORY_CATEGORY_LABELS) as Array<[HistoryCategory, string]>
).map(([value, label]) => ({ value, label }))

// 辅助：获取实体的 ResolvedEntity
function getResolved(entityId: string): ResolvedEntity | undefined {
  return sandboxStore.activeEntitiesState[entityId]
}

const stateEventIndexes = sandboxStore.stateEventIndexes

// 辅助：获取实体的状态事件
function getEntityEvents(entityId: string): StateEvent[] {
  return stateEventIndexes.eventsByEntity.get(entityId) || []
}

const selectedEntityEvents = computed<StateEvent[]>(() => {
  if (!selectedEntityRaw.value) return []
  return getEntityEvents(selectedEntityRaw.value.id)
})

const selectedEntityEventsReversed = computed<StateEvent[]>(() => [...selectedEntityEvents.value].reverse())

// 有状态的人物 — entities that have state events or resolved state
const charactersWithState = computed(() => {
  return characterEntities.value.filter(e => {
    const resolved = getResolved(e.id)
    const events = getEntityEvents(e.id)
    return events.length > 0 || (resolved && Object.keys(resolved.properties).length > 0)
  }).map(e => {
    const resolved = getResolved(e.id)
    return {
      id: e.id,
      name: e.name,
      importance: e.importance,
      currentState: resolved ? {
        status: resolved.properties.status || resolved.vitalStatus || '',
        location: typeof resolved.location === 'string' ? resolved.location : (resolved.location ? `(${resolved.location.x}, ${resolved.location.y})` : ''),
        faction: resolved.properties.faction || '',
        updatedAt: e.createdAt
      } : null,
      stateHistory: getEntityEvents(e.id)
    }
  })
})

// 位置统计 — derive from ResolvedEntity.properties.location or LOCATION_MOVE events
const locationStats = computed(() => {
  const locationMap = new Map<string, { count: number; characters: Entity[] }>()

  characterEntities.value.forEach(entity => {
    const resolved = getResolved(entity.id)
    const location = resolved?.properties.location || ''
    if (location) {
      const existing = locationMap.get(location) || { count: 0, characters: [] }
      existing.count++
      existing.characters.push(entity)
      locationMap.set(location, existing)
    }
  })

  return Array.from(locationMap.entries())
    .map(([location, data]) => ({
      location,
      count: data.count,
      characters: data.characters
    }))
    .sort((a, b) => b.count - a.count)
})

// 势力统计 — derive from ResolvedEntity.properties.faction
const factionStats = computed(() => {
  const factionMap = new Map<string, { count: number; characters: Entity[] }>()

  characterEntities.value.forEach(entity => {
    const resolved = getResolved(entity.id)
    const faction = resolved?.properties.faction || ''
    if (faction) {
      const existing = factionMap.get(faction) || { count: 0, characters: [] }
      existing.count++
      existing.characters.push(entity)
      factionMap.set(faction, existing)
    }
  })

  return Array.from(factionMap.entries())
    .map(([faction, data]) => ({
      faction,
      count: data.count,
      characters: data.characters
    }))
    .sort((a, b) => b.count - a.count)
})

// 合并所有状态历史 — derive from StateEvents
const allHistory = computed(() => {
  const history: Array<{
    characterId: string
    characterName: string
    type: HistoryCategory
    oldValue: string
    newValue: string
    timestamp: Date
    chapter?: number
  }> = []

  characterEntities.value.forEach(entity => {
    const events = getEntityEvents(entity.id)

    // Track property changes through events
    const propertySnapshot: Record<string, string> = {}
    const locationHistory: string[] = []

    events.forEach(event => {
      switch (event.eventType) {
        case 'LOCATION_MOVE': {
          const newLocation = event.payload.coordinates
            ? `(${event.payload.coordinates.x}, ${event.payload.coordinates.y})`
            : event.payload.value || ''
          const oldLocation = locationHistory.length > 0 ? locationHistory[locationHistory.length - 1] : ''
          if (newLocation && newLocation !== oldLocation) {
            history.push({
              characterId: entity.id,
              characterName: entity.name,
              type: 'location',
              oldValue: oldLocation,
              newValue: newLocation,
              timestamp: new Date(entity.createdAt + event.chapterNumber * 1000),
              chapter: event.chapterNumber
            })
            locationHistory.push(newLocation)
          }
          break
        }
        case 'PROPERTY_UPDATE': {
          const key = event.payload.key
          const newValue = event.payload.value || ''
          if (key === 'status' || key === 'faction') {
            const oldValue = propertySnapshot[key] || ''
            if (newValue !== oldValue) {
              history.push({
                characterId: entity.id,
                characterName: entity.name,
                type: key as 'status' | 'faction',
                oldValue,
                newValue,
                timestamp: new Date(entity.createdAt + event.chapterNumber * 1000),
                chapter: event.chapterNumber
              })
            }
          }
          if (key) propertySnapshot[key] = newValue
          break
        }
        case 'VITAL_STATUS_CHANGE': {
          const oldStatus = propertySnapshot['status'] || ''
          const newStatus = event.payload.status || ''
          if (newStatus && newStatus !== oldStatus) {
            history.push({
              characterId: entity.id,
              characterName: entity.name,
              type: 'status',
              oldValue: oldStatus,
              newValue: newStatus,
              timestamp: new Date(entity.createdAt + event.chapterNumber * 1000),
              chapter: event.chapterNumber
            })
            propertySnapshot['status'] = newStatus
          }
          break
        }
      }
    })
  })

  // 按章节号倒序排列
  return history.sort((a, b) => (b.chapter || 0) - (a.chapter || 0))
})

// 过滤后的历史
const filteredHistory = computed(() => {
  let result = allHistory.value

  if (historyFilter.value.character) {
    result = result.filter(h => h.characterId === historyFilter.value.character)
  }

  if (historyFilter.value.type) {
    result = result.filter(h => h.type === historyFilter.value.type)
  }

  return result.slice(0, 50) // 限制显示数量
})

// 方法 — V5 EntityImportance
function getTagType(importance?: EntityImportance): string {
  if (!importance) return 'info'
  const types: Record<EntityImportance, string> = {
    critical: 'primary',
    major: 'success',
    minor: 'info',
    background: 'warning'
  }
  return types[importance] || 'info'
}

function getTagLabel(importance?: EntityImportance): string {
  if (!importance) return '未知'
  return IMPORTANCE_TAG_CONFIG[importance]?.label || importance
}

function getStatusType(status?: string): string {
  if (!status) return 'info'
  const statusLower = status.toLowerCase()

  if (statusLower.includes('健康') || statusLower.includes('正常') || statusLower.includes('alive')) return 'success'
  if (statusLower.includes('受伤') || statusLower.includes('生病')) return 'warning'
  if (statusLower.includes('危险') || statusLower.includes('重伤') || statusLower.includes('dead') || statusLower.includes('死亡')) return 'danger'
  return 'info'
}

function getHistoryType(type: HistoryCategory): ElementTagType {
  return HISTORY_CATEGORY_TAG_TYPE[type] || 'info'
}

function getHistoryTypeLabel(type: HistoryCategory): string {
  return HISTORY_CATEGORY_LABELS[type] || type
}

function formatTime(timestamp?: Date | string | number): string {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function showStateDetail(char: typeof charactersWithState.value[0]) {
  const resolved = getResolved(char.id)
  selectedEntity.value = resolved || null
  selectedEntityRaw.value = characterEntities.value.find(e => e.id === char.id) || null
  showDetailDialog.value = true
}

function refreshStates() {
  ElMessage.success('状态已刷新')
}

async function initializeStates() {
  if (!project.value) return

  try {
    ElMessage.success('状态数据已从 Sandbox Store 加载')
  } catch (error) {
    ElMessage.error('初始化状态失败')
  }
}
</script>

<style scoped>
.character-state-tracker {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.overview-card,
.location-card,
.faction-card,
.history-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
}

.empty-state {
  padding: 40px 0;
}

.empty-section {
  padding: 20px 0;
}

.states-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
}

.state-card {
  cursor: pointer;
  transition: all 0.3s;
}

.state-card:hover {
  transform: translateY(-3px);
}

.state-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.character-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.character-info .name {
  font-size: 16px;
  font-weight: 600;
}

.state-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.state-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.state-footer {
  padding-top: 10px;
  border-top: 1px solid #E4E7ED;
}

.update-time {
  font-size: 12px;
  color: #909399;
}

.location-list,
.faction-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.location-item,
.faction-item {
  padding: 10px;
  background: #F5F7FA;
  border-radius: 8px;
}

.location-info,
.faction-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.location-name,
.faction-name {
  font-weight: 600;
  color: #303133;
}

.location-characters,
.faction-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.history-timeline {
  max-height: 500px;
  overflow-y: auto;
}

.history-item {
  margin-bottom: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-content {
  font-size: 14px;
}

.history-content .old-value {
  color: #909399;
}

.history-content .arrow {
  margin: 0 10px;
  color: #909399;
}

.history-content .new-value {
  color: #409EFF;
  font-weight: 600;
}

.chapter-info {
  margin-top: 5px;
  font-size: 12px;
  color: #909399;
}

.state-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.state-history-section h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #303133;
}
</style>
