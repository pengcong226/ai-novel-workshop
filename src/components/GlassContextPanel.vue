<template>
  <div class="immersive-insight-panel">
    <el-tabs v-model="internalTab" class="insight-tabs">
      <el-tab-pane label="深渊雷达" name="context">
        <transition-group name="el-fade-in-linear" tag="div" class="context-cards-container">
          <div v-for="char in characters" :key="'char-'+char.id" class="glass-card context-card">
            <div class="card-title"><el-tag size="small" type="success">人物</el-tag> {{ char.name }}</div>
            <div class="card-desc">{{ char.background || '暂时没有传记信息' }}</div>
          </div>
          <div v-for="wb in worldbook" :key="'wb-'+wb.uid" class="glass-card context-card">
            <div class="card-title"><el-tag size="small" type="warning">设定</el-tag> {{ wb.key[0] }}</div>
            <div class="card-desc">{{ wb.content }}</div>
          </div>
        </transition-group>
        <el-empty v-if="characters.length === 0 && worldbook.length === 0" description="打字时右侧将浮现人物羁绊与世界词条" />
      </el-tab-pane>
      
      <el-tab-pane label="控制台" name="basic">
        <el-form :model="internalChapterForm" label-position="top">
          <el-form-item label="章节序号">
            <el-input-number v-model="internalChapterForm.number" :min="1" />
          </el-form-item>
          <el-form-item label="算力驱动模式">
            <el-radio-group v-model="internalChapterForm.generatedBy">
              <el-radio value="ai">纯AI</el-radio>
              <el-radio value="manual">手写</el-radio>
              <el-radio value="hybrid">人机共创</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="大纲参谋" name="suggestions">
        <div v-if="internalChapterForm.aiSuggestions && internalChapterForm.aiSuggestions.length > 0" class="suggestions-list">
          <el-card v-for="(suggestion, index) in internalChapterForm.aiSuggestions" :key="index" class="suggestion-item">
            {{ suggestion }}
          </el-card>
        </div>
        <el-empty v-else description="暂无智脑批注" />
      </el-tab-pane>

      <el-tab-pane label="审计记录" name="audit">
        <el-timeline v-if="chapterLogs.length > 0" class="audit-timeline">
          <el-timeline-item
            v-for="log in chapterLogs"
            :key="log.id"
            :type="getLogTypeColor(log.type)"
            :timestamp="formatTime(log.timestamp)"
            placement="top"
          >
            <el-card class="audit-card" shadow="hover">
              <h4 class="audit-title">{{ log.title }}</h4>
              <p class="audit-desc">{{ log.description }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="本章暂无 AI 后台活动记录" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  activeTab: string
  characters: any[]
  worldbook: any[]
  chapterForm: any
}>()

const emit = defineEmits(['update:activeTab', 'update:chapterForm'])

const internalTab = computed({
  get: () => props.activeTab,
  set: (val) => emit('update:activeTab', val)
})

const internalChapterForm = computed({
  get: () => props.chapterForm,
  set: (val) => emit('update:chapterForm', val)
})

import { useAuditLog } from '@/composables/useAuditLog'
const { getLogsByChapter } = useAuditLog()

const chapterLogs = computed(() => {
  if (!internalChapterForm.value?.number) return []
  return getLogsByChapter(internalChapterForm.value.number)
})

function getLogTypeColor(type: string): "primary" | "success" | "warning" | "danger" | "info" {
  switch (type) {
    case 'error': return 'danger'
    case 'warning': return 'warning'
    case 'ai_decision': return 'primary'
    case 'memory_updated': return 'success'
    case 'success': return 'success'
    default: return 'info'
  }
}

function formatTime(d: Date) {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}
</script>

<style scoped>
/* 原 Chapters.vue 中的 insight-panel 样式将由外围包裹或下沉到这里 */
.immersive-insight-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.insight-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

.context-cards-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.context-card {
  padding: 12px;
}

.glass-card {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}
.glass-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-desc {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-item {
  font-size: 14px;
  line-height: 1.6;
}

.audit-timeline {
  padding: 10px;
}

.audit-card {
  --el-card-padding: 10px;
  background: rgba(255, 255, 255, 0.7);
}

.audit-title {
  margin: 0 0 5px 0;
  font-size: 14px;
  font-weight: bold;
}

.audit-desc {
  margin: 0;
  font-size: 12px;
  color: #606266;
}
</style>
