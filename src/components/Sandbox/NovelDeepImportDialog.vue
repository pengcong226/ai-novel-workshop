<template>
  <div class="novel-deep-import-dialog">
    <div class="dialog-header">
      <h4>深度小说导入</h4>
      <el-button size="small" type="danger" text @click="handleClose">退出</el-button>
    </div>

    <!-- Step Indicator -->
    <el-steps :active="currentStep" finish-status="success" simple class="step-indicator">
      <el-step title="上传" />
      <el-step title="配置" />
      <el-step title="提取" />
      <el-step title="确认" />
    </el-steps>

    <div v-if="currentStep >= 1 && sourceText" class="pattern-hint">
      分章模式：{{ selectedPatternName === 'auto' ? `自动（${detectedPatternName || '未检测到'}）` : selectedPatternName }}
    </div>

    <!-- Step Content -->
    <div class="step-content">
      <!-- Step 0: Upload -->
      <DeepImportUpload
        v-if="currentStep === 0"
        :initial-source-text="sourceText"
        :initial-mode="extractionMode"
        :initial-selected-pattern-name="selectedPatternName"
        @next="handleUploadNext"
      />

      <!-- Step 1: Config -->
      <DeepImportConfig
        v-else-if="currentStep === 1"
        :chapters="parsedChapters"
        :mode="extractionMode"
        :initial-persist-before-extraction="persistBeforeExtraction"
        @back="currentStep = 0"
        @start="handleStartExtraction"
      />

      <!-- Step 2: Progress -->
      <DeepImportProgress
        v-else-if="currentStep === 2"
        :chapters="activeChapters"
        :options="extractionOptions!"
        @next="currentStep = 3"
        @abort="handleAbort"
      />

      <!-- Step 3: Confirm -->
      <DeepImportConfirm
        v-else-if="currentStep === 3"
        @back="currentStep = 2"
        @reset="handleReset"
        @done="handleDone"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'
import type { ParsedChapter } from '@/utils/chapterParser'
import type { DeepImportOptions } from '@/types/deep-import'
import type { Chapter, ChapterOutline } from '@/types/index'
import { useDeepImportSession } from '@/composables/useDeepImportSession'
import { useProjectStore } from '@/stores/project'
import DeepImportUpload from './deep-import/DeepImportUpload.vue'
import DeepImportConfig from './deep-import/DeepImportConfig.vue'
import DeepImportProgress from './deep-import/DeepImportProgress.vue'
import DeepImportConfirm from './deep-import/DeepImportConfirm.vue'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'done'): void
}>()

const projectStore = useProjectStore()

const {
  currentStep,
  clearSession,
  setKeyChapters,
  abort: abortExtraction,
  isRunning,
} = useDeepImportSession()

const parsedChapters = ref<ParsedChapter[]>([])
const sourceText = ref('')
const selectedPatternName = ref('auto')
const detectedPatternName = ref<string | null>(null)
const extractionMode = ref<'full' | 'smart_sampling'>('full')
const extractionOptions = ref<DeepImportOptions | null>(null)
const persistBeforeExtraction = ref(false)

const activeChapters = computed(() => {
  if (!extractionOptions.value) return parsedChapters.value
  const range = extractionOptions.value.chapterRange
  if (!range) return parsedChapters.value
  return parsedChapters.value.filter(
    ch => ch.number >= range.start && ch.number <= range.end
  )
})

function handleUploadNext(payload: {
  chapters: ParsedChapter[]
  mode: 'full' | 'smart_sampling'
  sourceText: string
  selectedPatternName: string
  detectedPatternName: string | null
}) {
  parsedChapters.value = payload.chapters
  extractionMode.value = payload.mode
  sourceText.value = payload.sourceText
  selectedPatternName.value = payload.selectedPatternName
  detectedPatternName.value = payload.detectedPatternName
  currentStep.value = 1
}

function buildChapterOutline(title: string): ChapterOutline {
  return {
    chapterId: uuidv4(),
    title,
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    status: 'planned',
  }
}

async function persistChaptersBeforeExtraction(): Promise<void> {
  if (!projectStore.currentProject) {
    throw new Error('未打开项目，无法预存章节')
  }

  const existingChapterNumbers = new Set(
    projectStore.currentProject.chapters.map(ch => ch.number)
  )

  for (const parsed of activeChapters.value) {
    if (existingChapterNumbers.has(parsed.number)) continue

    const chapter: Chapter = {
      id: uuidv4(),
      number: parsed.number,
      title: parsed.title,
      content: parsed.content,
      wordCount: parsed.wordCount,
      outline: buildChapterOutline(parsed.title),
      status: 'draft',
      generatedBy: 'manual',
      generationTime: new Date(),
      checkpoints: [],
    }

    await projectStore.saveChapter(chapter)
    existingChapterNumbers.add(parsed.number)
  }
}

async function handleStartExtraction(
  options: DeepImportOptions,
  keys: number[] | undefined,
  persist: boolean
) {
  extractionOptions.value = options
  persistBeforeExtraction.value = persist
  setKeyChapters(keys)

  if (persistBeforeExtraction.value) {
    try {
      await persistChaptersBeforeExtraction()
      ElMessage.success('章节已预存到项目，开始提取流程')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      ElMessage.error(`章节预存失败：${message}`)
      return
    }
  }

  currentStep.value = 2
}

function handleAbort() {
  currentStep.value = 1
}

function handleReset() {
  clearSession()
  parsedChapters.value = []
  sourceText.value = ''
  selectedPatternName.value = 'auto'
  detectedPatternName.value = null
  extractionMode.value = 'full'
  extractionOptions.value = null
  persistBeforeExtraction.value = false
  setKeyChapters(undefined)
  currentStep.value = 0
}

function handleDone() {
  clearSession()
  setKeyChapters(undefined)
  emit('done')
}

function handleClose() {
  if (isRunning.value) {
    abortExtraction()
  }
  clearSession()
  setKeyChapters(undefined)
  emit('close')
}
</script>

<style scoped>
.novel-deep-import-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.dialog-header h4 {
  margin: 0;
  font-size: 16px;
}

.step-indicator {
  margin-bottom: 16px;
}

.pattern-hint {
  margin: 4px 0 12px;
  font-size: 12px;
  color: #909399;
}

.step-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}
</style>
