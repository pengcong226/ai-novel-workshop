<template>
  <div class="summary-manager">
    <el-card class="header-card">
      <div class="header">
        <h2>摘要管理</h2>
        <div class="actions">
          <el-button type="primary" @click="generateAllSummaries" :loading="generating">
            <el-icon><MagicStick /></el-icon>
            生成所有摘要
          </el-button>
          <el-button @click="refreshSummaries">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <el-empty v-if="chapters.length === 0" description="还没有章节">
        <el-button type="primary" @click="$emit('createChapter')">创建章节</el-button>
      </el-empty>

      <div v-else class="summary-list">
        <el-card
          v-for="chapter in chaptersWithSummary"
          :key="chapter.id"
          class="summary-card"
        >
          <div class="summary-header">
            <div class="chapter-info">
              <span class="chapter-number">第{{ chapter.number }}章</span>
              <span class="chapter-title">{{ chapter.title }}</span>
              <el-tag
                :type="getSummaryStatusType(chapter)"
                size="small"
              >
                {{ getSummaryStatusText(chapter) }}
              </el-tag>
            </div>
            <div class="summary-stats" v-if="chapter.summaryData">
              <span class="stat">{{ chapter.summaryData.summaryWordCount }}字</span>
              <span class="stat">{{ chapter.summaryData.tokenCount }} tokens</span>
              <span class="stat">{{ getDetailText(chapter.summaryData.detail) }}</span>
            </div>
          </div>

          <el-divider />

          <div v-if="chapter.summaryData" class="summary-content">
            <div class="summary-text">
              {{ chapter.summaryData.summary }}
            </div>

            <div class="summary-details">
              <div v-if="chapter.summaryData.keyEvents.length > 0" class="detail-item">
                <strong>关键事件：</strong>
                {{ chapter.summaryData.keyEvents.join('、') }}
              </div>
              <div v-if="chapter.summaryData.characters.length > 0" class="detail-item">
                <strong>出场人物：</strong>
                {{ chapter.summaryData.characters.join('、') }}
              </div>
              <div v-if="chapter.summaryData.locations.length > 0" class="detail-item">
                <strong>场景地点：</strong>
                {{ chapter.summaryData.locations.join('、') }}
              </div>
              <div v-if="chapter.summaryData.plotProgression" class="detail-item">
                <strong>剧情推进：</strong>
                {{ chapter.summaryData.plotProgression }}
              </div>
            </div>

            <div class="quality-check" v-if="getQualityCheck(chapter)">
              <el-tag :type="getQualityCheck(chapter)!.isValid ? 'success' : 'warning'" size="small">
                质量评分: {{ getQualityCheck(chapter)!.score }}/10
              </el-tag>
              <span class="quality-text">
                完整度: {{ (getQualityCheck(chapter)!.completeness * 100).toFixed(0) }}% |
                连贯性: {{ (getQualityCheck(chapter)!.coherence * 100).toFixed(0) }}% |
                简洁性: {{ (getQualityCheck(chapter)!.conciseness * 100).toFixed(0) }}%
              </span>
            </div>

            <div class="summary-actions">
              <el-button size="small" @click="editSummary(chapter)">
                编辑
              </el-button>
              <el-button size="small" @click="regenerateSummary(chapter)" :loading="chapter.regenerating">
                重新生成
              </el-button>
            </div>
          </div>

          <div v-else class="no-summary">
            <p>还没有生成摘要</p>
            <el-button type="primary" size="small" @click="generateSummaryForChapter(chapter)">
              生成摘要
            </el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 编辑摘要对话框 -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑摘要"
      width="70%"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="摘要内容">
          <el-input
            v-model="editForm.summary"
            type="textarea"
            :rows="8"
            placeholder="摘要内容"
          />
        </el-form-item>

        <el-form-item label="关键事件">
          <el-input
            v-model="keyEventsText"
            placeholder="用顿号分隔，如：事件1、事件2、事件3"
          />
        </el-form-item>

        <el-form-item label="出场人物">
          <el-input
            v-model="charactersText"
            placeholder="用顿号分隔，如：人物1、人物2"
          />
        </el-form-item>

        <el-form-item label="场景地点">
          <el-input
            v-model="locationsText"
            placeholder="用顿号分隔，如：地点1、地点2"
          />
        </el-form-item>

        <el-form-item label="剧情推进">
          <el-input
            v-model="editForm.plotProgression"
            type="textarea"
            :rows="3"
            placeholder="剧情推进描述"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSummary">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量生成进度对话框 -->
    <el-dialog
      v-model="showProgressDialog"
      title="批量生成摘要"
      width="500px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <div class="progress-content">
        <el-progress :percentage="progress" :format="() => `${progress}%`" />
        <div class="progress-text">
          正在生成第 {{ currentChapter }} / {{ totalChapters }} 章的摘要
        </div>
        <div class="progress-chapter" v-if="currentChapterTitle">
          {{ currentChapterTitle }}
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage } from 'element-plus'
import { MagicStick, Refresh } from '@element-plus/icons-vue'
import { Chapter, ChapterSummaryData, SummaryDetail } from '@/types'
import {
  generateChapterSummary,
  batchGenerateSummaries,
  checkSummaryQuality,
  type SummaryQualityCheck
} from '@/utils/summarizer'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

const generating = ref(false)
const showEditDialog = ref(false)
const showProgressDialog = ref(false)
const progress = ref(0)
const currentChapter = ref(0)
const totalChapters = ref(0)
const currentChapterTitle = ref('')

const editingChapter = ref<Chapter | null>(null)
const editForm = ref<{
  summary: string
  keyEvents: string[]
  characters: string[]
  locations: string[]
  plotProgression: string
}>({
  summary: '',
  keyEvents: [],
  characters: [],
  locations: [],
  plotProgression: ''
})

const keyEventsText = computed({
  get: () => editForm.value.keyEvents.join('、'),
  set: (val: string) => {
    editForm.value.keyEvents = val.split('、').filter(s => s.trim())
  }
})

const charactersText = computed({
  get: () => editForm.value.characters.join('、'),
  set: (val: string) => {
    editForm.value.characters = val.split('、').filter(s => s.trim())
  }
})

const locationsText = computed({
  get: () => editForm.value.locations.join('、'),
  set: (val: string) => {
    editForm.value.locations = val.split('、').filter(s => s.trim())
  }
})

// 章节带有摘要状态
const chaptersWithSummary = computed(() => {
  return chapters.value.map(ch => ({
    ...ch,
    regenerating: false
  }))
})

// 质量检查缓存
const qualityChecks = ref<Map<string, SummaryQualityCheck>>(new Map())

function getQualityCheck(chapter: Chapter): SummaryQualityCheck | null {
  if (!chapter.summaryData) return null

  const cacheKey = chapter.id
  if (!qualityChecks.value.has(cacheKey)) {
    const check = checkSummaryQuality(chapter.summaryData as any)
    qualityChecks.value.set(cacheKey, check)
  }

  return qualityChecks.value.get(cacheKey) || null
}

function getSummaryStatusType(chapter: Chapter): string {
  if (chapter.summaryData) {
    const check = getQualityCheck(chapter)
    if (check && check.isValid) return 'success'
    if (check && !check.isValid) return 'warning'
    return 'success'
  }
  return 'info'
}

function getSummaryStatusText(chapter: Chapter): string {
  if (chapter.summaryData) return '已生成'
  return '未生成'
}

function getDetailText(detail: SummaryDetail): string {
  const texts: Record<SummaryDetail, string> = {
    [SummaryDetail.FULL]: '完整内容',
    [SummaryDetail.DETAILED]: '详细摘要',
    [SummaryDetail.BRIEF]: '简要摘要',
    [SummaryDetail.MINIMAL]: '极简摘要'
  }
  return texts[detail] || detail
}

async function generateSummaryForChapter(chapter: Chapter & { regenerating?: boolean }) {
  try {
    if (chapter.regenerating !== undefined) {
      chapter.regenerating = true
    }

    ElMessage.info(`正在生成第${chapter.number}章的摘要...`)

    const summaryData = await generateChapterSummary(chapter)

    // 更新章节数据
    if (project.value) {
      const index = project.value.chapters.findIndex(c => c.id === chapter.id)
      if (index !== -1) {
        project.value.chapters[index].summaryData = summaryData
        project.value.chapters[index].summary = summaryData.summary
        await projectStore.saveCurrentProject()
      }
    }

    ElMessage.success(`第${chapter.number}章摘要生成成功`)
  } catch (error) {
    ElMessage.error('生成失败：' + (error as Error).message)
  } finally {
    if (chapter.regenerating !== undefined) {
      chapter.regenerating = false
    }
  }
}

async function generateAllSummaries() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有章节需要生成摘要')
    return
  }

  generating.value = true
  showProgressDialog.value = true
  progress.value = 0
  currentChapter.value = 0
  totalChapters.value = chapters.value.length

  try {
    // 过滤出需要生成摘要的章节（最近3章之后）
    const chaptersToSummarize = chapters.value.filter(ch => {
      const maxChapter = Math.max(...chapters.value.map(c => c.number))
      return ch.number < maxChapter - 3
    })

    if (chaptersToSummarize.length === 0) {
      ElMessage.info('最近的3章不需要生成摘要')
      showProgressDialog.value = false
      return
    }

    const summaries = await batchGenerateSummaries(
      chaptersToSummarize,
      (current, total, chapter) => {
        currentChapter.value = current
        currentChapterTitle.value = `第${chapter.number}章 ${chapter.title}`
        progress.value = Math.round((current / total) * 100)
      }
    )

    // 更新章节数据
    summaries.forEach((summaryData, index) => {
      const chapter = chaptersToSummarize[index]
      if (project.value) {
        const idx = project.value.chapters.findIndex(c => c.id === chapter.id)
        if (idx !== -1) {
          project.value.chapters[idx].summaryData = summaryData
          project.value.chapters[idx].summary = summaryData.summary
        }
      }
    })

    await projectStore.saveCurrentProject()

    ElMessage.success(`成功生成 ${summaries.length} 个摘要`)
    showProgressDialog.value = false
  } catch (error) {
    ElMessage.error('批量生成失败：' + (error as Error).message)
    showProgressDialog.value = false
  } finally {
    generating.value = false
  }
}

function editSummary(chapter: Chapter) {
  editingChapter.value = chapter
  editForm.value = {
    summary: chapter.summaryData?.summary || '',
    keyEvents: chapter.summaryData?.keyEvents || [],
    characters: chapter.summaryData?.characters || [],
    locations: chapter.summaryData?.locations || [],
    plotProgression: chapter.summaryData?.plotProgression || ''
  }
  showEditDialog.value = true
}

async function saveSummary() {
  if (!editingChapter.value || !project.value) return

  const index = project.value.chapters.findIndex(c => c.id === editingChapter.value!.id)
  if (index === -1) return

  // 更新摘要数据
  const summaryData: ChapterSummaryData = {
    id: `summary-${editingChapter.value.id}`,
    chapterNumber: editingChapter.value.number,
    title: editingChapter.value.title,
    summary: editForm.value.summary,
    keyEvents: editForm.value.keyEvents,
    characters: editForm.value.characters,
    locations: editForm.value.locations,
    plotProgression: editForm.value.plotProgression,
    wordCount: editingChapter.value.wordCount,
    summaryWordCount: editForm.value.summary.length,
    tokenCount: Math.ceil(editForm.value.summary.length * 1.5),
    createdAt: editingChapter.value.summaryData?.createdAt || new Date(),
    updatedAt: new Date(),
    detail: editingChapter.value.summaryData?.detail || SummaryDetail.BRIEF
  }

  project.value.chapters[index].summaryData = summaryData
  project.value.chapters[index].summary = editForm.value.summary

  await projectStore.saveCurrentProject()

  ElMessage.success('摘要已保存')
  showEditDialog.value = false
}

async function regenerateSummary(chapter: Chapter & { regenerating?: boolean }) {
  await generateSummaryForChapter(chapter)
}

function refreshSummaries() {
  qualityChecks.value.clear()
  ElMessage.success('已刷新')
}

onMounted(() => {
  // 初始化
})
</script>

<style scoped>
.summary-manager {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
}

.content {
  min-height: 400px;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.summary-card {
  margin-bottom: 0;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.chapter-number {
  font-size: 18px;
  font-weight: 600;
  color: #409eff;
}

.chapter-title {
  font-size: 18px;
  font-weight: 600;
}

.summary-stats {
  display: flex;
  gap: 20px;
  color: #909399;
  font-size: 14px;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.summary-text {
  color: #606266;
  line-height: 1.8;
  padding: 15px;
  background: #f5f7fa;
  border-radius: 4px;
}

.summary-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-item {
  color: #606266;
  font-size: 14px;
}

.detail-item strong {
  color: #303133;
  margin-right: 8px;
}

.quality-check {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  background: #f0f9ff;
  border-radius: 4px;
}

.quality-text {
  font-size: 12px;
  color: #909399;
}

.summary-actions {
  display: flex;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e4e7ed;
}

.no-summary {
  text-align: center;
  padding: 30px;
  color: #909399;
}

.no-summary p {
  margin-bottom: 15px;
}

.progress-content {
  padding: 20px;
  text-align: center;
}

.progress-text {
  margin-top: 15px;
  color: #606266;
  font-size: 14px;
}

.progress-chapter {
  margin-top: 10px;
  color: #909399;
  font-size: 12px;
}
</style>
