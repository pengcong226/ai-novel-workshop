<template>
  <div class="state-event-timeline">
    <el-timeline>
      <el-timeline-item
        v-for="(event, index) in events"
        :key="index"
        :timestamp="chapterNumber != null ? `第${chapterNumber}章` : undefined"
        placement="top"
        :type="eventTypeColor(event.eventType)"
      >
        <div class="event-card">
          <div class="event-header">
            <el-tag size="small" :type="eventTypeTagType(event.eventType)">
              {{ eventTypeLabel(event.eventType) }}
            </el-tag>
            <span class="entity-name">{{ event.entityName }}</span>
          </div>
          <div class="event-detail">
            <template v-if="event.eventType === 'PROPERTY_UPDATE'">
              <span class="prop-key">{{ event.key }}</span> → <span class="prop-value">{{ event.value }}</span>
            </template>
            <template v-else-if="event.eventType === 'RELATION_ADD'">
              → {{ event.targetName }} ({{ event.relationType }}, {{ event.attitude || '-' }})
            </template>
            <template v-else-if="event.eventType === 'RELATION_REMOVE'">
              ✗ {{ event.targetName }} ({{ event.relationType || '-' }})
            </template>
            <template v-else-if="event.eventType === 'RELATION_UPDATE'">
              {{ event.targetName }} 态度 → {{ event.attitude }}
            </template>
            <template v-else-if="event.eventType === 'VITAL_STATUS_CHANGE'">
              状态 → {{ event.status }}
            </template>
            <template v-else-if="event.eventType === 'ABILITY_CHANGE'">
              {{ event.abilityName }} → {{ event.abilityStatus }}
            </template>
            <template v-else-if="event.eventType === 'LOCATION_MOVE'">
              移动至 {{ event.locationDescription }}
            </template>
          </div>
          <EvidenceHighlight v-if="event.evidence" :evidence="event.evidence" />
        </div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-if="events.length === 0" description="暂无状态事件" :image-size="60" />
  </div>
</template>

<script setup lang="ts">
import type { ExtractedStateEvent } from '@/types/deep-import'
import EvidenceHighlight from './EvidenceHighlight.vue'

defineProps<{
  events: ExtractedStateEvent[]
  chapterNumber?: number
}>()

function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    PROPERTY_UPDATE: '属性更新',
    RELATION_ADD: '关系建立',
    RELATION_REMOVE: '关系解除',
    RELATION_UPDATE: '关系变化',
    VITAL_STATUS_CHANGE: '生死状态',
    ABILITY_CHANGE: '能力变化',
    LOCATION_MOVE: '位置移动'
  }
  return map[type] || type
}

function eventTypeColor(type: string): string {
  const map: Record<string, string> = {
    PROPERTY_UPDATE: '',
    RELATION_ADD: 'success',
    RELATION_REMOVE: 'danger',
    RELATION_UPDATE: 'warning',
    VITAL_STATUS_CHANGE: 'danger',
    ABILITY_CHANGE: 'primary',
    LOCATION_MOVE: 'info'
  }
  return map[type] || ''
}

function eventTypeTagType(type: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    PROPERTY_UPDATE: '',
    RELATION_ADD: 'success',
    RELATION_REMOVE: 'danger',
    RELATION_UPDATE: 'warning',
    VITAL_STATUS_CHANGE: 'danger',
    ABILITY_CHANGE: '',
    LOCATION_MOVE: 'info'
  }
  return map[type] || ''
}
</script>

<style scoped>
.state-event-timeline {
  max-height: 500px;
  overflow-y: auto;
  padding-right: 8px;
}

.event-card {
  padding: 4px 0;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.entity-name {
  font-weight: 500;
  font-size: 13px;
}

.event-detail {
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
}

.prop-key {
  color: #409eff;
  font-weight: 500;
}

.prop-value {
  color: #67c23a;
}
</style>
