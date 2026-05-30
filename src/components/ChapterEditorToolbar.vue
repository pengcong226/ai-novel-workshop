<template>
  <div class="immersive-toolbar">
    <el-button
      @click="$emit('generate')"
      :loading="generating"
      type="primary"
      plain
      round
      size="small"
      aria-label="AI连载生成"
    >
      <el-icon><MagicStick /></el-icon> AI连载
    </el-button>
    <el-checkbox
      :model-value="autoUpdateSettings"
      @update:model-value="$emit('update:autoUpdateSettings', $event)"
      size="small"
      style="margin: 0 10px;"
    >
      后台静默提词
    </el-checkbox>
    <el-button @click="$emit('optimize')" text size="small" aria-label="打磨文笔">打磨文笔</el-button>
    <el-button @click="$emit('checkQuality')" text size="small" aria-label="防吃书预警">防吃书预警</el-button>
    <el-button @click="$emit('review')" :loading="reviewing" text size="small" aria-label="运行审校">
      审校
      <el-badge :value="unresolvedReviewCount" :hidden="unresolvedReviewCount === 0" />
    </el-button>
    <el-button @click="$emit('toggleFindReplace')" text size="small" aria-label="查找替换">
      <el-icon><Search /></el-icon> 查找替换
    </el-button>
    <span class="word-count" aria-live="polite" aria-label="字数统计">{{ wordCount }} 墨</span>
  </div>
</template>

<script setup lang="ts">
import { MagicStick, Search } from '@element-plus/icons-vue'

defineProps<{
  generating: boolean
  autoUpdateSettings: boolean
  reviewing: boolean
  unresolvedReviewCount: number
  wordCount: number
}>()

defineEmits<{
  'generate': []
  'update:autoUpdateSettings': [value: boolean]
  'optimize': []
  'checkQuality': []
  'review': []
  'toggleFindReplace': []
}>()
</script>

<style scoped>
.immersive-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-height: 54px;
  padding: var(--ds-space-2) 0;
  opacity: 0.72;
  transition: opacity var(--ds-transition-normal);
  flex-wrap: wrap;
}

.immersive-toolbar:hover {
  opacity: 1;
}

.word-count {
  margin-left: auto;
  color: var(--ds-text-tertiary);
  font-family: var(--ds-font-mono);
  font-size: var(--ds-text-sm);
}
</style>
