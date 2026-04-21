<template>
  <div class="chapter-scrubber">
    <span class="scrubber-label">第 {{ modelValue }} 章</span>
    <el-slider
      :model-value="modelValue"
      :min="1"
      :max="totalChapters"
      :step="1"
      :show-tooltip="true"
      :format-tooltip="(val: number) => `第${val}章`"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <span class="scrubber-info">
      {{ entityCount }} 实体 / {{ eventCount }} 事件
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSandboxStore } from '@/stores/sandbox'

const props = defineProps<{
  modelValue: number
  totalChapters: number
}>()

defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const sandboxStore = useSandboxStore()

const entityCount = computed(() => {
  const state = sandboxStore.activeEntitiesState
  return Object.keys(state).length
})

const eventCount = computed(() => {
  return sandboxStore.stateEvents.filter(
    e => e.chapterNumber === props.modelValue
  ).length
})
</script>

<style scoped>
.chapter-scrubber {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}

.scrubber-label {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  min-width: 60px;
}

.chapter-scrubber .el-slider {
  flex: 1;
}

.scrubber-info {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}
</style>