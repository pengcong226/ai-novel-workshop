<template>
  <div class="deep-import-upload">
    <el-upload
      ref="uploadRef"
      drag
      :auto-upload="false"
      :limit="1"
      accept=".txt,.md"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
      class="upload-area"
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽文件到此处，或<em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip">支持 TXT / Markdown 格式的小说文本</div>
      </template>
    </el-upload>

    <div v-if="parseResult" class="parse-result">
      <el-descriptions :column="2" border size="small" title="文本解析结果">
        <el-descriptions-item label="自动检测模式">{{ parseResult.detectedPattern?.name || '未检测到' }}</el-descriptions-item>
        <el-descriptions-item label="当前使用模式">{{ parseResult.pattern?.name || '未检测到' }}</el-descriptions-item>
        <el-descriptions-item label="总章节数">{{ parseResult.stats.totalChapters }}</el-descriptions-item>
        <el-descriptions-item label="总字数">{{ parseResult.stats.totalWords.toLocaleString() }}</el-descriptions-item>
        <el-descriptions-item label="平均每章字数">{{ parseResult.stats.avgWordsPerChapter.toLocaleString() }}</el-descriptions-item>
      </el-descriptions>

      <div class="pattern-select">
        <span class="mode-label">分章规则：</span>
        <el-select v-model="selectedPatternName" style="width: 240px" @change="handlePatternChange">
          <el-option label="自动检测（推荐）" value="auto" />
          <el-option
            v-for="option in chapterPatternOptions"
            :key="option.name"
            :label="option.name"
            :value="option.name"
          />
        </el-select>
      </div>

      <div class="mode-select">
        <span class="mode-label">提取模式：</span>
        <el-radio-group v-model="extractionMode">
          <el-radio value="full">全量提取（每章深度解析）</el-radio>
          <el-radio value="smart_sampling">智能采样（先快速扫描，再深度提取关键章节）</el-radio>
        </el-radio-group>
      </div>

      <el-collapse v-if="parseResult.chapters.length > 0">
        <el-collapse-item :title="`章节预览（共${parseResult.chapters.length}章）`">
          <div class="chapter-list">
            <div v-for="ch in parseResult.chapters.slice(0, 20)" :key="ch.number" class="chapter-item">
              <span class="ch-number">第{{ ch.number }}章</span>
              <span class="ch-title">{{ ch.title }}</span>
              <span class="ch-words">{{ ch.wordCount.toLocaleString() }}字</span>
            </div>
            <div v-if="parseResult.chapters.length > 20" class="chapter-more">
              ... 还有 {{ parseResult.chapters.length - 20 }} 章
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="upload-actions">
        <el-button type="primary" @click="handleNext" :disabled="!parseResult">下一步</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile, UploadInstance } from 'element-plus'
import {
  detectChapterPattern,
  getChapterPatternOptions,
  getChapterPatterns,
  parseChapters,
} from '@/utils/chapterParser'
import type {
  ParsedChapter,
  ChapterPattern,
} from '@/utils/chapterParser'

const props = withDefaults(defineProps<{
  initialSourceText?: string
  initialMode?: 'full' | 'smart_sampling'
  selectedPatternName: string
}>(), {
  initialMode: 'full',
})

const emit = defineEmits<{
  (e: 'update:selectedPatternName', value: string): void
  (e: 'next', payload: {
    chapters: ParsedChapter[]
    mode: 'full' | 'smart_sampling'
    sourceText: string
    selectedPatternName: string
    detectedPatternName: string | null
  }): void
}>()

interface UploadParseResult {
  chapters: ParsedChapter[]
  pattern: ChapterPattern | null
  detectedPattern: ChapterPattern | null
  stats: { totalWords: number; totalChapters: number; avgWordsPerChapter: number }
}

const uploadRef = ref<UploadInstance>()
const extractionMode = ref<'full' | 'smart_sampling'>(props.initialMode)
const sourceText = ref(props.initialSourceText || '')

const selectedPatternName = computed({
  get: () => props.selectedPatternName,
  set: (val: string) => emit('update:selectedPatternName', val)
})

const parseResult = ref<UploadParseResult | null>(null)
const chapterPatterns = getChapterPatterns()
const chapterPatternOptions = getChapterPatternOptions()
let parsedChapters: ParsedChapter[] = []

function findPatternByName(name: string): ChapterPattern | null {
  return chapterPatterns.find(pattern => pattern.name === name) || null
}

function buildStats(chapters: ParsedChapter[]) {
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
  return {
    totalWords,
    totalChapters: chapters.length,
    avgWordsPerChapter: Math.round(totalWords / chapters.length) || 0,
  }
}

function reparseWithCurrentPattern() {
  if (!sourceText.value) return

  const detectedPattern = detectChapterPattern(sourceText.value)
  const selectedPattern = selectedPatternName.value === 'auto'
    ? detectedPattern
    : findPatternByName(selectedPatternName.value)

  const chapters = parseChapters(sourceText.value, selectedPattern)
  parsedChapters = chapters

  parseResult.value = {
    chapters,
    pattern: selectedPattern,
    detectedPattern,
    stats: buildStats(chapters),
  }
}

function handlePatternChange() {
  reparseWithCurrentPattern()
}

function handleFileChange(file: UploadFile) {
  if (!file.raw) return

  const reader = new FileReader()
  reader.onload = (event) => {
    const text = event.target?.result as string
    if (!text) return

    sourceText.value = text
    selectedPatternName.value = 'auto'
    reparseWithCurrentPattern()
  }
  reader.readAsText(file.raw, 'utf-8')
}

function handleExceed() {
  uploadRef.value?.clearFiles()
}

function handleNext() {
  if (parsedChapters.length > 0 && sourceText.value) {
    emit('next', {
      chapters: parsedChapters,
      mode: extractionMode.value,
      sourceText: sourceText.value,
      selectedPatternName: selectedPatternName.value,
      detectedPatternName: parseResult.value?.detectedPattern?.name || null,
    })
  }
}

if (sourceText.value) {
  reparseWithCurrentPattern()
}
</script>

<style scoped>
.deep-import-upload {
  padding: 16px 0;
}

.upload-area {
  margin-bottom: 16px;
}

.parse-result {
  margin-top: 16px;
}

.pattern-select,
.mode-select {
  margin: 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-label {
  font-weight: 500;
  white-space: nowrap;
}

.chapter-list {
  max-height: 300px;
  overflow-y: auto;
}

.chapter-item {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid #f2f3f5;
}

.ch-number {
  color: #409eff;
  font-weight: 500;
  min-width: 60px;
}

.ch-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #303133;
}

.ch-words {
  color: #909399;
  min-width: 60px;
  text-align: right;
}

.chapter-more {
  padding: 8px 0;
  color: #909399;
  font-size: 12px;
  text-align: center;
}

.upload-actions {
  margin-top: 16px;
  text-align: right;
}
</style>
