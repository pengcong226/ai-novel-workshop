<template>
  <div class="deep-import-config">
    <el-form label-width="120px" size="small">
      <el-form-item label="提取模式">
        <el-tag :type="mode === 'full' ? '' : 'warning'">
          {{ mode === 'full' ? '全量提取' : '智能采样' }}
        </el-tag>
      </el-form-item>

      <el-form-item label="章节范围">
        <el-col :span="10">
          <el-input-number v-model="chapterStart" :min="chapterMin" :max="chapterMax" controls-position="right" />
        </el-col>
        <el-col :span="2" style="text-align: center;">—</el-col>
        <el-col :span="10">
          <el-input-number v-model="chapterEnd" :min="chapterStart" :max="chapterMax" controls-position="right" />
        </el-col>
      </el-form-item>

      <el-form-item label="检查点间隔">
        <el-input-number v-model="checkpointInterval" :min="0" :max="50" :step="5" controls-position="right" />
        <span class="form-hint">每N章暂停一次供审阅（0=不暂停）</span>
      </el-form-item>

      <el-form-item label="最大费用(USD)">
        <el-input-number v-model="maxCostUSD" :min="0.5" :max="100" :step="0.5" :precision="2" controls-position="right" />
      </el-form-item>

      <el-form-item label="提取前预存章节">
        <el-switch v-model="persistBeforeExtraction" />
        <span class="form-hint">开启后将先写入项目章节，再进入提取流程</span>
      </el-form-item>

      <el-form-item label="每批章节数">
        <el-input-number v-model="batchSize" :min="1" :max="50" controls-position="right" />
        <span class="form-hint">1=逐章提取（最稳定），5-10=批量提取（更快更省，需1M上下文模型）</span>
        <el-tag v-if="contextWarning" type="warning" size="small" style="margin-left: 8px;">
          ⚠️ 估计超出部分模型上下文限制
        </el-tag>
      </el-form-item>
    </el-form>

    <!-- Smart Sampling: Quick Scan Section -->
    <div v-if="mode === 'smart_sampling'" class="quick-scan-section">
      <el-divider>智能采样</el-divider>
      <el-button
        type="primary"
        :loading="isScanning"
        @click="runQuickScan"
        :disabled="isScanning"
      >
        {{ isScanning ? '扫描中...' : '开始快速扫描' }}
      </el-button>

      <div v-if="scanResults.length > 0" class="scan-results">
        <p>检测到 <strong>{{ keyChapterCount }}</strong> 个关键章节，{{ nonKeyChapterCount }} 个非关键章节</p>
        <div class="chapter-grid">
          <div
            v-for="result in scanResults"
            :key="result.chapterNumber"
            :class="['scan-chapter', { 'is-key': result.isKeyChapter, 'is-selected': selectedChapters.has(result.chapterNumber) }]"
            @click="toggleChapter(result.chapterNumber)"
          >
            <div class="ch-num">{{ result.chapterNumber }}</div>
            <div class="ch-reason">{{ result.reason }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Cost Estimate -->
    <el-divider>费用预估</el-divider>
    <el-descriptions v-if="estimate" :column="2" border size="small">
      <el-descriptions-item label="处理章节数">{{ estimate.estimatedChapters }}</el-descriptions-item>
      <el-descriptions-item label="每章输入Token">{{ estimate.avgInputTokensPerChapter.toLocaleString() }}</el-descriptions-item>
      <el-descriptions-item label="每章输出Token">{{ estimate.avgOutputTokensPerChapter.toLocaleString() }}</el-descriptions-item>
      <el-descriptions-item label="每章费用">${{ estimate.costPerChapterUSD.toFixed(4) }}</el-descriptions-item>
      <el-descriptions-item label="总费用">${{ estimate.totalCostUSD.toFixed(2) }}</el-descriptions-item>
      <el-descriptions-item label="预估时间">{{ estimate.estimatedTimeMinutes }}分钟</el-descriptions-item>
    </el-descriptions>
    <el-button v-else type="info" plain size="small" @click="calcEstimate" :loading="isEstimating">
      计算费用预估
    </el-button>

    <div class="config-actions">
      <el-button @click="$emit('back')">上一步</el-button>
      <el-button type="primary" @click="handleStart" :disabled="!canStart">
        {{ startButtonLabel }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ParsedChapter } from '@/utils/chapterParser'
import type { DeepImportOptions, DeepImportEstimate } from '@/types/deep-import'
import { useDeepImportSession } from '@/composables/useDeepImportSession'

const props = withDefaults(defineProps<{
  chapters: ParsedChapter[]
  mode: 'full' | 'smart_sampling'
  initialPersistBeforeExtraction?: boolean
}>(), {
  initialPersistBeforeExtraction: false,
})

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'start', options: DeepImportOptions, keyChapters: number[] | undefined, persistBeforeExtraction: boolean): void
}>()

const session = useDeepImportSession()

const chapterNumbers = computed(() => props.chapters.map(ch => ch.number).sort((a, b) => a - b))
const chapterMin = computed(() => chapterNumbers.value[0] ?? 1)
const chapterMax = computed(() => chapterNumbers.value[chapterNumbers.value.length - 1] ?? 1)
const chapterStart = ref(chapterMin.value)
const chapterEnd = ref(chapterMax.value)
const checkpointInterval = ref(10)
const maxCostUSD = ref(10)
const batchSize = ref(1)
const persistBeforeExtraction = ref(props.initialPersistBeforeExtraction)

const isScanning = ref(false)
const scanResults = ref<Array<{ chapterNumber: number; isKeyChapter: boolean; reason: string; mentionedEntities: string[] }>>([])
const selectedChapters = ref<Set<number>>(new Set())
const estimate = ref<DeepImportEstimate | null>(null)
const isEstimating = ref(false)

const keyChapterCount = computed(() => scanResults.value.filter(r => r.isKeyChapter).length)
const nonKeyChapterCount = computed(() => scanResults.value.filter(r => !r.isKeyChapter).length)

const canStart = computed(() => {
  if (props.mode === 'smart_sampling') {
    if (scanResults.value.length === 0) return false
    if (selectedChapters.value.size === 0) return false
  }
  return true
})

const startButtonLabel = computed(() => {
  if (props.mode === 'smart_sampling' && scanResults.value.length === 0) return '请先扫描'
  if (props.mode === 'smart_sampling' && selectedChapters.value.size === 0) return '请至少选择1章'
  return '开始提取'
})

const contextWarning = computed(() => {
  if (!estimate.value || batchSize.value <= 1) return false
  return batchSize.value * estimate.value.avgInputTokensPerChapter > 500000
})

function toggleChapter(chapterNumber: number) {
  if (selectedChapters.value.has(chapterNumber)) {
    selectedChapters.value.delete(chapterNumber)
  } else {
    selectedChapters.value.add(chapterNumber)
  }
  // Trigger reactivity
  selectedChapters.value = new Set(selectedChapters.value)
}

async function runQuickScan() {
  isScanning.value = true
  try {
    const rangeChapters = props.chapters.filter(
      ch => ch.number >= chapterStart.value && ch.number <= chapterEnd.value
    )
    const results = await session.quickScan(rangeChapters, (chapterNumber, isKey) => {
      if (isKey) selectedChapters.value.add(chapterNumber)
    })
    scanResults.value = results
    // Auto-select key chapters
    selectedChapters.value = new Set(
      results.filter(r => r.isKeyChapter).map(r => r.chapterNumber)
    )
  } finally {
    isScanning.value = false
  }
}

async function calcEstimate() {
  isEstimating.value = true
  try {
    const rangeChapters = props.chapters.filter(
      ch => ch.number >= chapterStart.value && ch.number <= chapterEnd.value
    )
    estimate.value = session.estimateCost(rangeChapters, buildOptions())
  } finally {
    isEstimating.value = false
  }
}

function buildOptions(): DeepImportOptions {
  return {
    mode: props.mode,
    extractPlotEvents: false,
    checkpointInterval: checkpointInterval.value,
    maxCostUSD: maxCostUSD.value,
    batchSize: batchSize.value,
    chapterRange: { start: chapterStart.value, end: chapterEnd.value }
  }
}

function handleStart() {
  const keyChapters = props.mode === 'smart_sampling'
    ? Array.from(selectedChapters.value)
    : undefined
  emit('start', buildOptions(), keyChapters, persistBeforeExtraction.value)
}
</script>

<style scoped>
.deep-import-config {
  padding: 16px 0;
}

.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}

.quick-scan-section {
  margin-top: 8px;
}

.scan-results {
  margin-top: 12px;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
  margin-top: 8px;
}

.scan-chapter {
  padding: 6px 8px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.scan-chapter:hover {
  border-color: #409eff;
}

.scan-chapter.is-key {
  background: #fdf6ec;
  border-color: #e6a23c;
}

.scan-chapter.is-selected {
  background: #ecf5ff;
  border-color: #409eff;
}

.ch-num {
  font-weight: 500;
  margin-bottom: 2px;
}

.ch-reason {
  color: #909399;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
