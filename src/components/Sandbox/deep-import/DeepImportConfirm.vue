<template>
  <div class="deep-import-confirm">
    <el-descriptions :column="2" border title="提取结果摘要">
      <el-descriptions-item label="总章节数">{{ session?.totalChapters ?? 0 }}</el-descriptions-item>
      <el-descriptions-item label="已提取章节">{{ session?.extractedChapters.length ?? 0 }}</el-descriptions-item>
      <el-descriptions-item label="新实体数">{{ totalEntitiesCount }}</el-descriptions-item>
      <el-descriptions-item label="状态事件数">{{ totalStateEventsCount }}</el-descriptions-item>
      <el-descriptions-item label="总Token">{{ totalTokens.toLocaleString() }}</el-descriptions-item>
      <el-descriptions-item label="总费用">${{ totalCostUSD.toFixed(4) }}</el-descriptions-item>
    </el-descriptions>

    <!-- Review Tabs -->
    <el-tabs v-model="reviewTab" class="review-tabs">
      <el-tab-pane label="实体审阅" name="entities">
        <EntityReviewTable :entities="allExtractedEntities" />
      </el-tab-pane>
      <el-tab-pane label="状态事件" name="events">
        <StateEventTimeline :events="allExtractedStateEvents" />
      </el-tab-pane>
    </el-tabs>

    <!-- Error chapters -->
    <div v-if="errorChapters.length > 0" class="error-section">
      <el-divider>失败章节</el-divider>
      <div class="error-actions">
        <el-button
          size="small"
          type="warning"
          :loading="isRetryingAll"
          :disabled="isRunning"
          @click="handleRetryAll"
        >
          重试全部失败章节
        </el-button>
      </div>
      <div class="error-list">
        <div v-for="ch in errorChapters" :key="ch.chapterNumber" class="error-item">
          <span>第{{ ch.chapterNumber }}章: {{ ch.errorMessage }}</span>
          <el-button
            size="small"
            type="warning"
            :loading="retryingChapter === ch.chapterNumber"
            :disabled="isRunning"
            @click="handleRetry(ch.chapterNumber)"
          >
            重试
          </el-button>
        </div>
      </div>
    </div>

    <!-- Commit Options -->
    <el-divider>提交方式</el-divider>
    <el-radio-group v-model="commitMode">
      <el-radio value="draft">
        <strong>草稿模式</strong>
        <span class="mode-desc">先添加为草稿，可继续编辑后再批量提交</span>
      </el-radio>
      <el-radio value="direct">
        <strong>直接提交</strong>
        <span class="mode-desc">立即写入数据库，一步到位</span>
      </el-radio>
    </el-radio-group>

    <div class="confirm-actions">
      <el-button @click="$emit('back')">返回</el-button>
      <el-button @click="$emit('reset')">重新开始</el-button>
      <el-button
        type="primary"
        :loading="isCommitting"
        @click="handleCommit"
      >
        {{ commitMode === 'draft' ? '提交为草稿' : '直接提交' }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDeepImportSession } from '@/composables/useDeepImportSession'
import EntityReviewTable from './EntityReviewTable.vue'
import StateEventTimeline from './StateEventTimeline.vue'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'reset'): void
  (e: 'done'): void
}>()

const {
  session, allExtractedEntities, allExtractedStateEvents,
  totalEntitiesCount, totalStateEventsCount, totalCostUSD,
  commitDrafts, commitDirect, retryChapter, retryFailedChapters,
  isRunning
} = useDeepImportSession()

const reviewTab = ref('entities')
const commitMode = ref<'draft' | 'direct'>('direct')
const isCommitting = ref(false)
const retryingChapter = ref<number | null>(null)
const isRetryingAll = ref(false)

const totalTokens = computed(() => {
  if (!session.value) return 0
  return session.value.totalTokenUsage.input + session.value.totalTokenUsage.output
})

const errorChapters = computed(() => {
  if (!session.value) return []
  const errors: Array<{ chapterNumber: number; errorMessage?: string }> = []
  for (const [num, result] of session.value.results) {
    if (result.status === 'error') {
      errors.push({ chapterNumber: num, errorMessage: result.errorMessage })
    }
  }
  return errors
})

async function handleCommit() {
  isCommitting.value = true
  try {
    if (commitMode.value === 'draft') {
      await commitDrafts()
    } else {
      await commitDirect()
    }
    emit('done')
  } finally {
    isCommitting.value = false
  }
}

async function handleRetry(chapterNumber: number) {
  retryingChapter.value = chapterNumber
  try {
    await retryChapter(chapterNumber)
  } finally {
    retryingChapter.value = null
  }
}

async function handleRetryAll() {
  isRetryingAll.value = true
  try {
    await retryFailedChapters()
  } finally {
    isRetryingAll.value = false
  }
}
</script>

<style scoped>
.deep-import-confirm {
  padding: 16px 0;
}

.review-tabs {
  margin-top: 16px;
}

.mode-desc {
  display: block;
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.error-section {
  margin-top: 16px;
}

.error-actions {
  margin-bottom: 8px;
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.error-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  font-size: 12px;
  color: #f56c6c;
}

.confirm-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
