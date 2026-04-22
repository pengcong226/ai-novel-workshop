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
import { STATE_EVENT_TYPE_LABELS, STATE_EVENT_TYPE_TAG_TYPE, type ElementTagType } from '@/utils/eventTypeLabels'
import EvidenceHighlight from './EvidenceHighlight.vue'

defineProps<{
  events: ExtractedStateEvent[]
  chapterNumber?: number
}>()

function eventTypeLabel(type: string): string {
  return STATE_EVENT_TYPE_LABELS[type as keyof typeof STATE_EVENT_TYPE_LABELS] || type
}

function eventTypeColor(type: string): ElementTagType {
  return STATE_EVENT_TYPE_TAG_TYPE[type as keyof typeof STATE_EVENT_TYPE_TAG_TYPE] || ''
}

function eventTypeTagType(type: string): ElementTagType {
  return STATE_EVENT_TYPE_TAG_TYPE[type as keyof typeof STATE_EVENT_TYPE_TAG_TYPE] || ''
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
