<template>
  <div class="extraction-progress-bar">
    <div class="progress-header">
      <span class="chapter-label">
        {{ status === 'success' ? '✓' : status === 'error' ? '✗' : status === 'skipped' ? '—' : '...' }}
        第{{ chapterNumber }}章
      </span>
      <span v-if="chapterTitle" class="chapter-title">{{ chapterTitle }}</span>
      <el-tag v-if="status === 'success'" type="success" size="small">完成</el-tag>
      <el-tag v-else-if="status === 'error'" type="danger" size="small">失败</el-tag>
      <el-tag v-else-if="status === 'skipped'" type="info" size="small">跳过</el-tag>
      <el-tag v-else-if="status === 'extracting'" type="warning" size="small">提取中</el-tag>
    </div>
    <el-progress
      v-if="status === 'extracting'"
      :percentage="percentage"
      :stroke-width="4"
      :show-text="false"
      status="warning"
    />
    <div v-if="status === 'success'" class="stats">
      <span>{{ entityCount }} 实体</span>
      <span>{{ eventCount }} 状态事件</span>
      <span>${{ (costUSD ?? 0).toFixed(4) }}</span>
    </div>
    <div v-if="status === 'error' && errorMessage" class="error-msg">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  chapterNumber: number
  chapterTitle?: string
  status: 'success' | 'error' | 'skipped' | 'extracting' | 'pending'
  percentage?: number
  entityCount?: number
  eventCount?: number
  costUSD?: number
  errorMessage?: string
}>()
</script>

<style scoped>
.extraction-progress-bar {
  padding: 8px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  margin-bottom: 4px;
  background: #fafafa;
}

.extraction-progress-bar[status="success"] {
  background: #f0f9eb;
  border-color: #e1f3d8;
}

.extraction-progress-bar[status="error"] {
  background: #fef0f0;
  border-color: #fde2e2;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.chapter-label {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
}

.chapter-title {
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #67c23a;
  margin-top: 4px;
}

.error-msg {
  font-size: 11px;
  color: #f56c6c;
  margin-top: 4px;
}
</style>
