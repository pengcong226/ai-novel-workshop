<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="AI 修改对比"
    width="700px"
    :close-on-click-modal="false"
  >
    <div class="action-label">{{ actionLabel }}</div>
    <div class="diff-container">
      <div class="diff-pane">
        <div class="diff-pane-header">原文</div>
        <div class="diff-content">
          <span
            v-for="(seg, i) in originalSegments"
            :key="i"
            :class="{ 'seg-removed': seg.diff }"
          >{{ seg.text }}</span>
        </div>
      </div>
      <div class="diff-divider" />
      <div class="diff-pane">
        <div class="diff-pane-header">AI 修改</div>
        <div class="diff-content">
          <span
            v-for="(seg, i) in modifiedSegments"
            :key="i"
            :class="{ 'seg-added': seg.diff }"
          >{{ seg.text }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="emit('update:visible', false)">放弃</el-button>
      <el-button @click="emit('regenerate')">重新生成</el-button>
      <el-button type="primary" @click="emit('accept')">采纳</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface DiffSegment {
  text: string
  diff: boolean
}

const props = defineProps<{
  visible: boolean
  originalText: string
  modifiedText: string
  action: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'accept': []
  'reject': []
  'regenerate': []
}>()

const ACTION_LABELS: Record<string, string> = {
  rewrite: 'AI 重写',
  expand: 'AI 扩写',
  compress: 'AI 缩写',
}

const actionLabel = computed(() => {
  if (props.action.startsWith('style:')) {
    return `风格改写 → ${props.action.slice(6)}`
  }
  return ACTION_LABELS[props.action] || props.action
})

function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？\n])/).filter(s => s.length > 0)
}

function computeDiff(original: string, modified: string): { originalSegments: DiffSegment[]; modifiedSegments: DiffSegment[] } {
  const origSentences = splitSentences(original)
  const modSentences = splitSentences(modified)

  const origSet = new Set(origSentences)
  const modSet = new Set(modSentences)

  const originalSegments: DiffSegment[] = origSentences.map(s => ({
    text: s,
    diff: !modSet.has(s),
  }))

  const modifiedSegments: DiffSegment[] = modSentences.map(s => ({
    text: s,
    diff: !origSet.has(s),
  }))

  return { originalSegments, modifiedSegments }
}

const originalSegments = computed(() => computeDiff(props.originalText, props.modifiedText).originalSegments)
const modifiedSegments = computed(() => computeDiff(props.originalText, props.modifiedText).modifiedSegments)
</script>

<style scoped>
.action-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.diff-container {
  display: flex;
  gap: 0;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
  max-height: 400px;
}

.diff-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diff-pane-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.diff-content {
  padding: 12px;
  font-size: 14px;
  line-height: 1.8;
  overflow-y: auto;
  flex: 1;
  white-space: pre-wrap;
  font-family: 'Songti SC', 'Noto Serif SC', STSong, serif;
}

.diff-divider {
  width: 1px;
  background: var(--el-border-color-light);
}

.seg-removed {
  background: rgba(245, 108, 108, 0.2);
  text-decoration: line-through;
  border-radius: 2px;
}

.seg-added {
  background: rgba(103, 194, 58, 0.2);
  border-radius: 2px;
}
</style>
