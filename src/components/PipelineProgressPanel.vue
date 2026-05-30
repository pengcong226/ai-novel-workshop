<template>
  <el-card v-if="visible" class="pipeline-progress-panel">
    <template #header>
      <div class="header">
        <span>流水线续写</span>
        <div class="header-actions">
          <el-tag size="small" :type="isRunning ? 'warning' : isPaused ? 'info' : 'success'">
            {{ isRunning ? '运行中' : isPaused ? '已暂停' : '完成' }}
          </el-tag>
          <el-button-group>
            <el-button size="small" @click="togglePause" :icon="isPaused ? VideoPlay : VideoPause">
              {{ isPaused ? '恢复' : '暂停' }}
            </el-button>
            <el-button size="small" type="danger" @click="emit('cancel')" :disabled="!isRunning">
              取消
            </el-button>
          </el-button-group>
        </div>
      </div>
    </template>

    <!-- 10-Stage Pipeline 可视化 -->
    <div class="pipeline-stages">
      <div
        v-for="(stage, idx) in PIPELINE_STAGES"
        :key="stage"
        class="stage-item"
        :class="getStageClass(stage, idx)"
      >
        <div class="stage-dot">
          <el-icon v-if="getStageStatus(stage) === 'completed'" class="stage-icon"><Check /></el-icon>
          <el-icon v-else-if="getStageStatus(stage) === 'running'" class="stage-icon rotating"><Loading /></el-icon>
          <el-icon v-else-if="getStageStatus(stage) === 'failed'" class="stage-icon"><CloseBold /></el-icon>
          <span v-else class="stage-number">{{ idx + 1 }}</span>
        </div>
        <span class="stage-label">{{ PIPELINE_STAGE_LABELS[stage] }}</span>
        <!-- 连接线 -->
        <div v-if="idx < PIPELINE_STAGES.length - 1" class="stage-connector" :class="{ 'connector-done': getStageStatus(stage) === 'completed' }"></div>
      </div>
    </div>

    <!-- Overall progress -->
    <el-progress :percentage="overallProgress" :stroke-width="20" :text-inside="true" style="margin-top: 16px;" />

    <!-- Current status -->
    <div class="status-row">
      <span>当前: 第{{ currentEvent?.chapterNumber || '-' }}章</span>
      <span>阶段: {{ stageLabel }}</span>
      <span>耗时: {{ elapsedTime }}</span>
    </div>

    <!-- Token usage -->
    <div class="token-row">
      <span>Token: {{ formatTokens(currentEvent?.totalTokenUsage || 0) }}</span>
    </div>

    <!-- Completed chapters list -->
    <div class="completed-chapters" v-if="completedChapters.length > 0">
      <div class="chapter-item" v-for="ch in completedChapters" :key="ch.chapterNumber">
        <el-icon v-if="ch.auditScore && ch.auditScore >= 85" class="chapter-status-icon status-good">
          <Check />
        </el-icon>
        <el-icon v-else class="chapter-status-icon status-warn">
          <Warning />
        </el-icon>
        <span>第{{ ch.chapterNumber }}章</span>
        <span class="chapter-meta">({{ ch.wordCount }}字, 评分{{ ch.auditScore }})</span>
      </div>
    </div>

    <!-- Current chapter in progress -->
    <div class="in-progress" v-if="currentEvent?.type === 'stage-start' || currentEvent?.type === 'chapter-start'">
      <el-icon class="rotating">
        <Loading />
      </el-icon>
      <span>第{{ currentEvent.chapterNumber }}章 ({{ stageLabel }}...)</span>
    </div>

    <!-- Error display -->
    <el-alert
      v-if="currentEvent?.type === 'error'"
      :title="getFriendlyMessage(currentEvent.error || '')"
      type="error"
      :closable="false"
      show-icon
    />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { VideoPlay, VideoPause, Check, Warning, Loading, CloseBold } from '@element-plus/icons-vue'
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from '@/services/pipeline/types'
import type { PipelineStage } from '@/services/pipeline/types'
import { getFriendlyMessage } from '@/utils/errorHandler'

export interface PipelineProgressEvent {
  type: 'stage-start' | 'stage-complete' | 'chapter-start' | 'chapter-complete' | 'batch-complete' | 'batch-paused' | 'batch-cancelled' | 'error'
  chapterNumber: number
  stage?: string
  stageDetail?: string
  progress: number
  chapterIndex?: number
  totalChapters?: number
  auditScore?: number
  wordCount?: number
  currentTokenUsage?: number
  totalTokenUsage?: number
  error?: string
}

const props = defineProps<{
  visible: boolean
  events: PipelineProgressEvent[]
  currentEvent: PipelineProgressEvent | null
  isPaused: boolean
  isRunning: boolean
}>()

const emit = defineEmits<{
  (e: 'pause'): void
  (e: 'resume'): void
  (e: 'cancel'): void
  (e: 'close'): void
}>()

// Elapsed time tracking
const startTime = ref<number>(Date.now())
const elapsedSeconds = ref<number>(0)
let timerInterval: ReturnType<typeof setInterval> | null = null

const stageLabelMap: Record<string, string> = {
  plan: '规划',
  compose: '组装上下文',
  write: '写作',
  normalize: '字数标准化',
  audit: '审计',
  revise: '修订',
  settle: '沉淀',
  analyze: '分析',
  prepare: '准备',
  'promote-hooks': '伏笔升级',
}

// 已完成的阶段集合（从events中提取）
const completedStages = computed(() => {
  const set = new Set<string>()
  for (const e of props.events) {
    if (e.type === 'stage-complete' && e.stage) {
      set.add(e.stage)
    }
  }
  return set
})

// 失败的阶段
const failedStages = computed(() => {
  const set = new Set<string>()
  for (const e of props.events) {
    if (e.type === 'error' && e.stage) {
      set.add(e.stage)
    }
  }
  return set
})

function getStageStatus(stage: PipelineStage): 'pending' | 'running' | 'completed' | 'failed' {
  if (completedStages.value.has(stage)) return 'completed'
  if (failedStages.value.has(stage)) return 'failed'
  if (props.currentEvent?.stage === stage && props.isRunning) return 'running'
  // 如果当前stage在该stage之前，说明还没到
  return 'pending'
}

function getStageClass(stage: PipelineStage, idx: number): string {
  const status = getStageStatus(stage)
  return `stage-${status}`
}

const overallProgress = computed(() => {
  return props.currentEvent?.progress || 0
})

const stageLabel = computed(() => {
  const stage = props.currentEvent?.stage
  if (!stage) return '-'
  return stageLabelMap[stage] || stage
})

const elapsedTime = computed(() => {
  const total = elapsedSeconds.value
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const completedChapters = computed(() => {
  return props.events.filter((e) => e.type === 'chapter-complete')
})

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1) + 'M'
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1) + 'K'
  }
  return String(n)
}

function togglePause() {
  if (props.isPaused) {
    emit('resume')
  } else {
    emit('pause')
  }
}

function startTimer() {
  startTime.value = Date.now()
  elapsedSeconds.value = 0
  if (timerInterval) {
    clearInterval(timerInterval)
  }
  timerInterval = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - startTime.value) / 1000)
  }, 1000)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

watch(
  () => props.isRunning,
  (running) => {
    if (running) {
      startTimer()
    } else {
      stopTimer()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (props.isRunning) {
    startTimer()
  }
})

onUnmounted(() => {
  stopTimer()
})
</script>

<style scoped>
.pipeline-progress-panel {
  max-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pipeline-progress-panel :deep(.el-card__body) {
  overflow-y: auto;
  flex: 1;
  max-height: 500px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 15px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

/* 10-Stage Pipeline 可视化 */
.pipeline-stages {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: var(--ds-space-3);
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  position: relative;
}

.stage-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 56px;
  position: relative;
}

.stage-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--ds-surface-border);
  background: var(--ds-bg-primary);
  transition: all var(--ds-transition-normal);
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-text-tertiary);
}

.stage-icon {
  font-size: 14px;
}

.stage-number {
  line-height: 1;
}

.stage-label {
  font-size: 10px;
  color: var(--ds-text-tertiary);
  text-align: center;
  line-height: 1.2;
  max-width: 64px;
  word-break: keep-all;
}

/* 阶段状态样式 */
.stage-pending .stage-dot {
  border-color: var(--ds-surface-border);
  color: var(--ds-text-tertiary);
}

.stage-pending .stage-label {
  color: var(--ds-text-tertiary);
}

.stage-running .stage-dot {
  border-color: var(--ds-accent);
  background: var(--ds-accent-subtle);
  color: var(--ds-accent-text);
  box-shadow: 0 0 8px color-mix(in srgb, var(--ds-accent) 30%, transparent);
  animation: stage-pulse 2s ease-in-out infinite;
}

.stage-running .stage-label {
  color: var(--ds-accent-text);
  font-weight: 600;
}

.stage-completed .stage-dot {
  border-color: var(--ds-success);
  background: color-mix(in srgb, var(--ds-success) 14%, transparent);
  color: var(--ds-success);
}

.stage-completed .stage-label {
  color: var(--ds-text-secondary);
}

.stage-failed .stage-dot {
  border-color: var(--ds-danger);
  background: color-mix(in srgb, var(--ds-danger) 14%, transparent);
  color: var(--ds-danger);
}

.stage-failed .stage-label {
  color: var(--ds-danger);
}

/* 连接线 */
.stage-connector {
  position: absolute;
  top: 14px;
  left: calc(50% + 16px);
  width: calc(100% - 32px);
  height: 2px;
  background: var(--ds-surface-border);
  z-index: 0;
}

.connector-done {
  background: var(--ds-success);
}

@keyframes stage-pulse {
  0%, 100% { box-shadow: 0 0 4px color-mix(in srgb, var(--ds-accent) 20%, transparent); }
  50% { box-shadow: 0 0 12px color-mix(in srgb, var(--ds-accent) 40%, transparent); }
}

.status-row {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
}

.token-row {
  margin-top: 8px;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
}

.completed-chapters {
  margin-top: 12px;
  border-top: 1px solid var(--ds-surface-border);
  padding-top: 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  border-radius: var(--ds-radius-sm);
  transition: background var(--ds-transition-fast);
}

.chapter-item:hover {
  background: var(--ds-bg-hover);
}

.chapter-status-icon {
  flex-shrink: 0;
}

.status-good {
  color: var(--ds-success);
}

.status-warn {
  color: var(--ds-warning);
}

.chapter-meta {
  color: var(--ds-text-tertiary);
}

.in-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--ds-accent-subtle);
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-accent-text);
}

.rotating {
  animation: rotate 1.5s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
