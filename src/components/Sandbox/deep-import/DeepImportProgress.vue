<template>
  <div class="deep-import-progress">
    <!-- Overall Progress -->
    <div class="overall-progress">
      <el-progress
        :percentage="progress?.percentage ?? 0"
        :stroke-width="12"
        :format="() => `${progress?.currentChapter ?? 0}/${progress?.totalChapters ?? 0}`"
      />
      <div class="progress-info">
        <span v-if="progress">{{ batchAwareMessage }}</span>
        <span v-if="session" class="cost-info">
          Token: {{ (session.totalTokenUsage.input + session.totalTokenUsage.output).toLocaleString() }} |
          费用: ${{ session.totalCostUSD.toFixed(4) }}
        </span>
      </div>
    </div>

    <!-- Chapter Progress List -->
    <div class="chapter-progress-list">
      <ExtractionProgressBar
        v-for="ch in chapterStatuses"
        :key="ch.chapterNumber"
        :chapter-number="ch.chapterNumber"
        :chapter-title="ch.title"
        :status="ch.status"
        :percentage="ch.percentage"
        :entity-count="ch.entityCount"
        :event-count="ch.eventCount"
        :cost-u-s-d="ch.costUSD"
        :error-message="ch.errorMessage"
      />
    </div>

    <!-- Review Panel (shown at checkpoints) -->
    <div v-if="showReviewPanel" class="review-panel">
      <el-divider>检查点审阅</el-divider>
      <el-tabs v-model="reviewTab">
        <el-tab-pane label="实体审阅" name="entities">
          <EntityReviewTable :entities="reviewEntities" />
        </el-tab-pane>
        <el-tab-pane label="状态事件" name="events">
          <StateEventTimeline :events="reviewEvents" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Control Buttons -->
    <div class="progress-controls">
      <el-button
        v-if="!hasStarted"
        type="primary"
        :loading="isStarting"
        :disabled="isRunning"
        @click="handleStart"
      >
        开始提取
      </el-button>
      <el-button v-if="isRunning && !isPaused" type="warning" @click="pause">暂停</el-button>
      <el-button v-if="isPaused" type="success" @click="resume">继续</el-button>
      <el-button
        v-if="failedChapterCount > 0"
        type="warning"
        :loading="isRetryingFailed"
        :disabled="isRunning"
        @click="handleRetryFailed"
      >
        重试失败章节 ({{ failedChapterCount }})
      </el-button>
      <el-button type="danger" plain @click="abort">终止</el-button>
      <el-button v-if="showReviewPanel && isPaused" type="primary" @click="resume">
        继续提取
      </el-button>
      <el-button v-if="session?.isComplete" type="success" @click="next">
        查看结果
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeepImportSession } from '@/composables/useDeepImportSession'
import type { ParsedChapter } from '@/utils/chapterParser'
import type { DeepImportOptions, ChapterExtractionResult } from '@/types/deep-import'
import ExtractionProgressBar from './ExtractionProgressBar.vue'
import EntityReviewTable from './EntityReviewTable.vue'
import StateEventTimeline from './StateEventTimeline.vue'

const props = defineProps<{
  chapters: ParsedChapter[]
  options: DeepImportOptions
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'abort'): void
}>()

const {
  session, isRunning, isPaused, progress,
  start, pause, resume, abort: doAbort,
  retryFailedChapters
} = useDeepImportSession()

const reviewTab = ref('entities')
const hasStarted = ref(false)
const isStarting = ref(false)
const isRetryingFailed = ref(false)

const batchAwareMessage = computed(() => {
  if (!progress.value) return ''
  const p = progress.value
  if (p.batchChapterRange && p.totalBatches && p.totalBatches > 1) {
    const { start, end } = p.batchChapterRange
    const batchInfo = start === end
      ? `第${start}章`
      : `第${start}-${end}章`
    return `${batchInfo} (批次${p.currentBatch}/${p.totalBatches}) — ${p.message}`
  }
  return p.message
})

interface ChapterStatus {
  chapterNumber: number
  title: string
  status: 'success' | 'error' | 'skipped' | 'extracting' | 'pending'
  percentage: number
  entityCount: number
  eventCount: number
  costUSD: number
  errorMessage?: string
}

const chapterStatuses = computed<ChapterStatus[]>(() => {
  if (!session.value) {
    return props.chapters.map(ch => ({
      chapterNumber: ch.number,
      title: ch.title,
      status: 'pending' as const,
      percentage: 0,
      entityCount: 0,
      eventCount: 0,
      costUSD: 0
    }))
  }

  return props.chapters.map(ch => {
    const result = session.value!.results.get(ch.number)
    const isCurrentChapter = progress.value?.currentChapter === ch.number
    const isInCurrentBatch = isRunning.value && progress.value?.batchChapterRange
      ? ch.number >= progress.value.batchChapterRange.start && ch.number <= progress.value.batchChapterRange.end
      : isCurrentChapter && isRunning.value

    if (result) {
      return {
        chapterNumber: ch.number,
        title: ch.title,
        status: result.status,
        percentage: 100,
        entityCount: result.entities.newEntities.length,
        eventCount: result.stateEvents.events.length,
        costUSD: result.costUSD,
        errorMessage: result.errorMessage
      }
    }

    return {
      chapterNumber: ch.number,
      title: ch.title,
      status: isInCurrentBatch ? 'extracting' as const : 'pending' as const,
      percentage: isInCurrentBatch ? 50 : 0,
      entityCount: 0,
      eventCount: 0,
      costUSD: 0
    }
  })
})

const showReviewPanel = computed(() => {
  if (!session.value || !isPaused.value) return false
  return session.value.extractedChapters.length > 0
})

const recentResults = computed(() => {
  if (!session.value) return []
  const chapters = session.value.extractedChapters.slice(-5)
  const results: ChapterExtractionResult[] = []
  for (const chNum of chapters) {
    const result = session.value!.results.get(chNum)
    if (result?.status === 'success') {
      results.push(result)
    }
  }
  return results
})

const reviewEntities = computed(() => {
  const entities: ChapterExtractionResult['entities']['newEntities'] = []
  for (const result of recentResults.value) {
    entities.push(...result.entities.newEntities)
  }
  return entities
})

const reviewEvents = computed(() => {
  const events: ChapterExtractionResult['stateEvents']['events'] = []
  for (const result of recentResults.value) {
    events.push(...result.stateEvents.events)
  }
  return events
})

const failedChapterCount = computed(() => {
  if (!session.value) return 0
  let count = 0
  for (const result of session.value.results.values()) {
    if (result.status === 'error') count++
  }
  return count
})

async function handleRetryFailed() {
  if (failedChapterCount.value === 0 || isRunning.value) return
  isRetryingFailed.value = true
  try {
    await retryFailedChapters()
  } finally {
    isRetryingFailed.value = false
  }
}

async function handleStart() {
  if (hasStarted.value || isRunning.value) return
  isStarting.value = true
  try {
    await start(props.chapters, props.options)
    hasStarted.value = true
  } finally {
    isStarting.value = false
  }
}

function abort() {
  doAbort()
  emit('abort')
}

function next() {
  emit('next')
}
</script>

<style scoped>
.deep-import-progress {
  padding: 16px 0;
}

.overall-progress {
  margin-bottom: 16px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.cost-info {
  color: #e6a23c;
}

.chapter-progress-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.review-panel {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
  background: #fafafa;
}

.progress-controls {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
