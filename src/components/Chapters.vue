<template>
  <div class="chapters">
    <el-card class="header-card">
      <div class="header">
        <h2>章节管理</h2>
        <div class="actions">
          <el-button @click="validateChapters" :loading="validating">
            <el-icon><CircleCheck /></el-icon>
            验证章节
          </el-button>
          <el-dropdown @command="handleExportCommand" style="margin-right: 10px;">
            <el-button>
              <el-icon><Download /></el-icon>
              导出
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="exportAllMarkdown">
                  <el-icon><Document /></el-icon>
                  导出全部 (Markdown)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllPdf">
                  <el-icon><Document /></el-icon>
                  导出全部 (PDF)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllDocx">
                  <el-icon><Document /></el-icon>
                  导出全部 (DOCX)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllTxt">
                  <el-icon><Document /></el-icon>
                  导出全部 (TXT)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllEpub">
                  <el-icon><Reading /></el-icon>
                  导出全部 (EPUB)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllJson">
                  <el-icon><DataBoard /></el-icon>
                  导出全部 (JSON)
                </el-dropdown-item>
                <el-dropdown-item divided command="exportSettings">
                  <el-icon><Setting /></el-icon>
                  导出设置...
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" @click="startBatchGeneration">
            <el-icon><MagicStick /></el-icon>
            批量生成
          </el-button>
          <el-button type="success" @click="showWriteNextDialog = true">
            <el-icon><MagicStick /></el-icon>
            一键续写
          </el-button>
          <el-button type="success" plain @click="showContinuationPanel = true">续写</el-button>
          <el-button type="warning" plain @click="showRewritePanel = true">改写</el-button>
          <el-button @click="addChapter">
            <el-icon><Plus /></el-icon>
            新建章节
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Search and filters -->
    <div v-if="chapters.length > 0" class="chapter-search-bar" role="search" aria-label="章节搜索与筛选">
      <el-input v-model="chapterSearchQuery" placeholder="搜索章节标题或内容..." clearable size="default" class="chapter-search-input">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-select v-model="chapterStatusFilter" placeholder="状态筛选" clearable size="default" style="width: 140px;">
        <el-option label="草稿" value="draft" />
        <el-option label="修订" value="revised" />
        <el-option label="定稿" value="final" />
      </el-select>
      <el-select v-model="chapterWordCountFilter" placeholder="字数筛选" clearable size="default" style="width: 140px;">
        <el-option label="1000字以下" value="lt1000" />
        <el-option label="1000-5000字" value="1000-5000" />
        <el-option label="5000-10000字" value="5000-10000" />
        <el-option label="10000字以上" value="gt10000" />
      </el-select>
      <el-select v-model="chapterQualityFilter" placeholder="质量筛选" clearable size="default" style="width: 140px;">
        <el-option label="优秀 (8-10分)" value="high" />
        <el-option label="良好 (5-7分)" value="medium" />
        <el-option label="待改进 (0-4分)" value="low" />
      </el-select>
      <span class="filter-count" v-if="isChapterFilterActive" role="status" aria-live="polite">
        {{ filteredChapters.length }} / {{ chapters.length }} 章
      </span>
    </div>

    <div class="content">
      <LoadingSkeleton v-if="chaptersLoading" variant="list" :count="4" />

      <el-empty v-else-if="chapters.length === 0" description="还没有章节">
        <el-button type="primary" @click="addChapter">创建第一章</el-button>
      </el-empty>

      <el-empty v-else-if="filteredChapters.length === 0" description="没有匹配的章节">
        <el-button @click="clearChapterFilters">清除筛选</el-button>
      </el-empty>

      <div v-else class="chapters-container" ref="scrollContainerRef" style="height: calc(100vh - 280px); overflow-y: auto;" role="region" aria-label="章节列表" aria-live="polite" aria-atomic="false">
        <div class="chapters-list" :style="{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }" role="list">
          <div
            v-for="virtualRow in rowVirtualizer.getVirtualItems()"
            :key="virtualRow.index"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`
            }"
          >
            <template v-for="chapter in [filteredChapters[virtualRow.index]]" :key="chapter?.id">
              <el-card
                v-if="chapter"
                class="chapter-card"
                :class="{ 'is-dragging': draggingChapterId === chapter.id, 'is-drag-over': dragOverChapterId === chapter.id }"
                role="listitem"
                :aria-label="`第${chapter.number}章 ${chapter.title}，${chapter.wordCount}字，${getChapterStatusText(chapter.status)}`"
                @dragover.prevent="handleChapterDragOver(chapter.id, $event)"
                @drop="handleChapterDrop(chapter.id)"
              >
                <div class="chapter-header">
                  <div class="chapter-info">
                    <button
                      class="drag-handle"
                      type="button"
                      draggable="true"
                      title="拖拽排序"
                      aria-label="拖拽排序"
                      @dragstart="handleChapterDragStart(chapter.id, $event)"
                      @dragend="handleChapterDragEnd"
                    >
                      ⋮⋮
                    </button>
                    <span class="chapter-number">第{{ chapter.number }}章</span>
                    <span class="chapter-title">{{ chapter.title }}</span>
                    <el-tag :type="getChapterStatusType(chapter.status)" size="small">
                      {{ getChapterStatusText(chapter.status) }}
                    </el-tag>
                    <el-tag v-if="chapter.generatedBy === 'ai'" type="success" size="small">
                      AI生成
                    </el-tag>
                  </div>
                  <div class="chapter-stats">
                    <span class="stat">{{ chapter.wordCount }}字</span>
                    <span class="stat">{{ formatDate(chapter.generationTime) }}</span>
                  </div>
                </div>

                <el-divider />

                <div class="chapter-content">
                  <div class="content-preview">
                    {{ buildReadingPreview(chapter) }}
                  </div>
                </div>

                <div class="chapter-actions">
                  <el-button type="primary" size="small" @click="editChapter(chapter)">
                    编辑
                  </el-button>
                  <el-button size="small" @click="previewChapter(chapter)">
                    预览
                  </el-button>
                  <el-dropdown size="small" @command="(cmd: string) => handleChapterAction(cmd, chapter)">
                    <el-button size="small">
                      更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="export-md">
                          <el-icon><Document /></el-icon>导出 Markdown
                        </el-dropdown-item>
                        <el-dropdown-item command="export-pdf">
                          <el-icon><Document /></el-icon>导出 PDF
                        </el-dropdown-item>
                        <el-dropdown-item command="export-docx">
                          <el-icon><Document /></el-icon>导出 DOCX
                        </el-dropdown-item>
                        <el-dropdown-item command="export-txt">
                          <el-icon><Document /></el-icon>导出 TXT
                        </el-dropdown-item>
                        <el-dropdown-item command="regenerate">
                          <el-icon><RefreshRight /></el-icon>重新生成
                        </el-dropdown-item>
                        <el-dropdown-item command="checkpoints">
                          <el-icon><Clock /></el-icon>检查点
                        </el-dropdown-item>
                        <el-dropdown-item command="aigc-detect">
                          <el-icon><DataAnalysis /></el-icon>AI 检测
                        </el-dropdown-item>
                        <el-dropdown-item
                          v-for="button in pluginToolbarButtons"
                          :key="button.id"
                          :command="'plugin:' + button.id"
                        >
                          <el-icon v-if="button.icon"><component :is="button.icon" /></el-icon>
                          {{ button.label }}
                        </el-dropdown-item>
                        <el-dropdown-item divided command="delete" :style="{ color: 'var(--ds-danger)' }">
                          <el-icon><Delete /></el-icon>删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>

                <div v-if="chapter.qualityScore" class="quality-score">
                  质量评分: {{ chapter.qualityScore }}/10
                </div>
              </el-card>
            </template>
          </div>
        </div>
      </div>
    </div>

    <ErrorBoundary name="ChapterEditorDialog" :show-retry="true" :show-detail="true">
      <ChapterEditorDialog
        v-if="showEditDialog || editingChapter"
        :model-value="showEditDialog"
        :chapter="editingChapter"
        :project-id="project?.id"
        :preserve-provided-content="preserveEditorContent"
        @update:model-value="handleEditorVisibility"
        @saved="onChapterSaved"
      />
    </ErrorBoundary>

    <el-dialog
      v-model="showPreviewDialog"
      :title="previewDialogTitle"
      width="80%"
      top="4vh"
      class="reading-preview-dialog"
      destroy-on-close
    >
      <div v-loading="previewLoading" class="reading-preview-container">
        <ChapterReadingPreview v-if="previewingChapter" :chapter="previewingChapter" />
      </div>
      <template #footer>
        <el-button @click="closePreviewDialog">关闭</el-button>
        <el-button v-if="previewingChapter" type="primary" @click="editPreviewingChapter">编辑此章</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showCheckpointsDialog"
      title="章节检查点"
      width="70%"
    >
      <div v-if="selectedChapter && selectedChapter.checkpoints.length > 0" class="checkpoints-list">
        <el-card
          v-for="(checkpoint, index) in selectedChapter.checkpoints"
          :key="checkpoint.id"
          class="checkpoint-item"
        >
          <div class="checkpoint-header">
            <span>检查点 {{ index + 1 }}</span>
            <span class="checkpoint-time">{{ formatDate(checkpoint.timestamp) }}</span>
            <span v-if="checkpoint.description" class="checkpoint-desc">{{ checkpoint.description }}</span>
          </div>
          <el-divider />
          <div class="checkpoint-content">
            {{ getContentPreview(checkpoint.content, 200) }}
          </div>
          <div class="checkpoint-actions">
            <el-button size="small" @click="restoreCheckpoint(checkpoint)">恢复到此版本</el-button>
            <el-button type="danger" size="small" @click="deleteCheckpoint(checkpoint)">删除</el-button>
          </div>
        </el-card>
      </div>
      <el-empty v-else description="还没有检查点" />
    </el-dialog>

    <el-dialog
      v-model="showBatchDialog"
      title="批量生成章节"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="batchForm" label-width="120px">
        <el-form-item label="起始章节">
          <el-input-number v-model="batchForm.startChapter" :min="1" />
        </el-form-item>

        <el-form-item label="生成数量">
          <el-input-number v-model="batchForm.count" :min="1" :max="100" />
        </el-form-item>

        <el-form-item label="生成模式">
          <el-radio-group v-model="batchForm.mode">
            <el-radio value="realtime">实时生成</el-radio>
            <el-radio value="batch">批量生成</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="自动保存">
          <el-switch v-model="batchForm.autoSave" />
        </el-form-item>

        <el-form-item label="提取设定">
          <el-switch v-model="batchForm.autoUpdateSettings" />
          <span style="margin-left: 10px; font-size: 12px; color: var(--ds-text-tertiary);">生成后自动更新人物/关系图/表格记忆</span>
        </el-form-item>

        <el-form-item label="断点审查">
          <el-switch v-model="batchForm.enableCheckpoint" />
          <el-input-number v-if="batchForm.enableCheckpoint" v-model="batchForm.checkpointInterval" :min="1" :max="10" style="margin-left: 10px;" />
          <span style="margin-left: 10px; font-size: 12px; color: var(--ds-text-tertiary);">每N章暂停等待确认，防止跑偏</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBatchDialog = false">取消</el-button>
        <el-button type="primary" @click="executeBatchGeneration">
          开始生成并在后台运行
        </el-button>
      </template>
    </el-dialog>

    <ErrorBoundary name="ExportSettings" :show-retry="true">
      <ExportSettings
        v-model="showExportSettings"
        :project="project"
        :chapters="chapters"
        :selected-chapter="exportChapter"
        :export-mode="exportMode"
        @exported="handleExportComplete"
      />
    </ErrorBoundary>

    <ContinuationPanel
      v-if="showContinuationPanel"
      @close="showContinuationPanel = false"
      @started="showContinuationPanel = false"
    />

    <WriteNextDialog
      v-if="showWriteNextDialog"
      @close="showWriteNextDialog = false"
      @start="handleWriteNextStart"
    />

    <ErrorBoundary name="PipelineProgressPanel" :show-retry="true">
      <PipelineProgressPanel
        :visible="showPipelineProgress"
        :events="pipelineEvents"
        :current-event="currentPipelineEvent"
        :is-paused="isPipelinePaused"
        :is-running="isPipelineRunning"
        @pause="handlePipelinePause"
        @resume="handlePipelineResume"
        @cancel="handlePipelineCancel"
        @close="showPipelineProgress = false"
      />
    </ErrorBoundary>

    <RewritePanel
      v-if="showRewritePanel"
      @close="showRewritePanel = false"
      @started="showRewritePanel = false"
    />

    <StateDiffViewer
      v-if="diffReport"
      :report="diffReport"
      @accept="acceptRewrite"
      @reject="rejectRewrite"
    />

    <el-dialog
      v-model="showValidationDialog"
      title="章节验证结果"
      width="600px"
    >
      <div v-if="validationIssues.length === 0" class="validation-success">
        <el-result
          icon="success"
          title="验证通过"
          sub-title="所有章节结构正常，未发现问题"
        />
      </div>

      <div v-else class="validation-issues" role="alert" aria-live="assertive">
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;"
        >
          <template #title>
            发现 {{ validationIssues.length }} 个问题
          </template>
        </el-alert>

        <el-card shadow="never" style="max-height: 400px; overflow-y: auto;">
          <div v-for="(issue, index) in validationIssues" :key="index" style="margin-bottom: 10px;">
            <el-tag type="warning" size="small">{{ index + 1 }}</el-tag>
            <span style="margin-left: 10px;">{{ issue }}</span>
          </div>
        </el-card>

        <div style="margin-top: 20px; color: var(--ds-text-tertiary); font-size: 13px;">
          <el-icon><InfoFilled /></el-icon>
          这些问题通常不影响阅读，可在后续编辑中逐步修正
        </div>
      </div>

      <template #footer>
        <el-button @click="showValidationDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- AIGC 检测结果对话框 -->
    <el-dialog
      v-model="showAIGCDialog"
      title="AI 生成检测结果"
      width="420px"
    >
      <div v-if="aigcDetecting" style="text-align: center; padding: 30px 0;">
        <el-icon :size="32" class="is-loading"><Loading /></el-icon>
        <p style="margin-top: 12px; color: var(--ds-text-secondary);">正在分析章节内容...</p>
      </div>
      <div v-else-if="aigcResult" style="text-align: center;">
        <el-progress
          type="dashboard"
          :percentage="aigcResult.overallScore"
          :color="aigcResult.overallScore >= 70 ? '#67c23a' : aigcResult.overallScore >= 40 ? '#e6a23c' : '#f56c6c'"
          :width="160"
        >
          <template #default="{ percentage }">
            <span style="font-size: 28px; font-weight: bold;">{{ percentage }}%</span>
            <br/>
            <span style="font-size: 12px; color: var(--ds-text-secondary);">人类写作概率</span>
          </template>
        </el-progress>
        <p style="margin-top: 16px; color: var(--ds-text-secondary);">
          AI 生成概率: {{ (aigcResult.aiProbability * 100).toFixed(1) }}%
        </p>
        <p style="font-size: 12px; color: var(--ds-text-tertiary); margin-top: 8px;">
          使用本地启发式检测（仅供参考）
        </p>
      </div>
      <template #footer>
        <el-button @click="showAIGCDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, onMounted } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, CircleCheck, Clock, DataBoard, Delete, Document, Download, InfoFilled, MagicStick, Plus, Reading, RefreshRight, Search, Setting } from '@element-plus/icons-vue'
import type { Chapter, Checkpoint } from '@/types'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { generationScheduler } from '@/services/generation-scheduler'
import { useChapterExport } from '@/composables/useChapterExport'
import { useRewriteContinuation } from '@/composables/useRewriteContinuation'
import { usePipelineStatePersistence } from '@/composables/usePipelineStatePersistence'
import { acquireProjectLock, releaseProjectLock, getLockConflictMessage } from '@/utils/pipelineLock'
import { getLogger } from '@/utils/logger'
import { buildReadingPreview, truncateReadingPreviewText } from '@/utils/readingPreview'
import { getChapterStatusType, getChapterStatusText, formatDate } from '@/utils/formatters'
import { getFriendlyMessage } from '@/utils/errorHandler'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { measureSync } from '@/utils/performance';
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
const ExportSettings = defineAsyncComponent(() => import('./ExportSettings.vue'))
const ChapterEditorDialog = defineAsyncComponent(() => import('./ChapterEditorDialog.vue'))
const ChapterReadingPreview = defineAsyncComponent(() => import('./ChapterReadingPreview.vue'))
const ContinuationPanel = defineAsyncComponent(() => import('./RewriteContinuation/ContinuationPanel.vue'))
const RewritePanel = defineAsyncComponent(() => import('./RewriteContinuation/RewritePanel.vue'))
const StateDiffViewer = defineAsyncComponent(() => import('./RewriteContinuation/StateDiffViewer.vue'))
const WriteNextDialog = defineAsyncComponent(() => import('./WriteNextDialog.vue'))
const PipelineProgressPanel = defineAsyncComponent(() => import('./PipelineProgressPanel.vue'))

const logger = getLogger('chapters')
const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

// Chapter search and filters
const chapterSearchQuery = ref('')
const chapterStatusFilter = ref('')
const chapterWordCountFilter = ref('')
const chapterQualityFilter = ref('')

// Loading state for chapter list skeleton
const chaptersLoading = ref(true)
let loadingResolved = false

watch(
  () => ({ loading: projectStore.loading, project: project.value, chapters: chapters.value }),
  ({ loading, project: proj, chapters: chs }) => {
    if (!loadingResolved && (!loading || (proj && chs.length >= 0))) {
      loadingResolved = true
      chaptersLoading.value = false
    }
  },
  { immediate: true }
)

const filteredChapters = computed(() => {
  return measureSync('Chapters:filteredChapters', () => {
  let result = chapters.value
  const q = chapterSearchQuery.value.trim().toLowerCase()
  if (q) {
    result = result.filter(ch =>
      (ch.title?.toLowerCase().includes(q)) ||
      (ch.content?.toLowerCase().includes(q)) ||
      (ch.summary?.toLowerCase().includes(q))
    )
  }
  if (chapterStatusFilter.value) {
    result = result.filter(ch => ch.status === chapterStatusFilter.value)
  }
  if (chapterWordCountFilter.value) {
    result = result.filter(ch => {
      const wc = ch.wordCount || 0
      switch (chapterWordCountFilter.value) {
        case 'lt1000': return wc < 1000
        case '1000-5000': return wc >= 1000 && wc < 5000
        case '5000-10000': return wc >= 5000 && wc < 10000
        case 'gt10000': return wc >= 10000
        default: return true
      }
    })
  }
  if (chapterQualityFilter.value) {
    result = result.filter(ch => {
      const qs = ch.qualityScore ?? 0
      switch (chapterQualityFilter.value) {
        case 'high': return qs >= 8
        case 'medium': return qs >= 5 && qs < 8
        case 'low': return qs < 5
        default: return true
      }
    })
  }
  return result
  }) // measureSync
})

const isChapterFilterActive = computed(() =>
  chapterSearchQuery.value.trim() !== '' ||
  chapterStatusFilter.value !== '' ||
  chapterWordCountFilter.value !== '' ||
  chapterQualityFilter.value !== ''
)

function clearChapterFilters() {
  chapterSearchQuery.value = ''
  chapterStatusFilter.value = ''
  chapterWordCountFilter.value = ''
  chapterQualityFilter.value = ''
}

const scrollContainerRef = ref<HTMLElement | null>(null)
const rowVirtualizerOptions = computed(() => ({
  count: filteredChapters.value.length,
  getScrollElement: () => scrollContainerRef.value,
  estimateSize: () => 180,
  overscan: 5,
}))
const rowVirtualizer = useVirtualizer(rowVirtualizerOptions)

const pluginToolbarButtons = computed(() => {
  return pluginStore.getToolbarButtons().filter(button => button.location === 'chapter-editor')
})

const showEditDialog = ref(false)
const editingChapter = ref<Chapter | null>(null)
const preserveEditorContent = ref(false)
const showPreviewDialog = ref(false)
const previewingChapter = ref<Chapter | null>(null)
const previewLoading = ref(false)
let previewRequestId = 0
const previewDialogTitle = computed(() => {
  if (!previewingChapter.value) return '阅读预览'
  return `阅读预览：第${previewingChapter.value.number}章 ${previewingChapter.value.title || '未命名章节'}`
})
const showCheckpointsDialog = ref(false)
const selectedChapter = ref<Chapter | null>(null)
const showBatchDialog = ref(false)
const batchForm = ref({
  startChapter: 1,
  count: 10,
  mode: 'realtime',
  autoSave: true,
  autoUpdateSettings: true,
  enableCheckpoint: false,
  checkpointInterval: 5
})

const showContinuationPanel = ref(false)
const showRewritePanel = ref(false)
const { diffReport: readonlyDiffReport, acceptRewrite, rejectRewrite } = useRewriteContinuation()
const diffReport = computed(() => readonlyDiffReport.value as import('@/types/rewrite-continuation').StateDiffReport | null)

// 一键续写（Pipeline）相关状态（含 IndexedDB 持久化）
const showWriteNextDialog = ref(false)
const pipelineBatchScheduler = ref<any>(null)

const {
  pipelineEvents: readonlyPipelineEvents,
  currentPipelineEvent,
  isPipelinePaused,
  isPipelineRunning,
  showPipelineProgress,
  restoreState: restorePipelineState,
  pushEvent,
  startPipeline,
  finishPipeline,
  pausePipeline,
  resumePipeline,
} = usePipelineStatePersistence(() => project.value?.id)

const pipelineEvents = computed(() => [...readonlyPipelineEvents.value])

// 页面加载时尝试恢复 Pipeline 运行状态
onMounted(async () => {
  try {
    const restored = await restorePipelineState()
    if (restored) {
      logger.info('[Chapters] Pipeline 运行状态已从 IndexedDB 恢复')
    }
  } catch (err) {
    logger.warn('[Chapters] Pipeline 状态恢复失败:', err)
  }
})

const {
  showExportSettings,
  exportMode,
  exportChapter,
  handleExportCommand,
  handleChapterExport,
  handleExportComplete
} = useChapterExport(project, chapters)

const validating = ref(false)
const showValidationDialog = ref(false)
const validationIssues = ref<string[]>([])
const draggingChapterId = ref<string | null>(null)
const dragOverChapterId = ref<string | null>(null)

function getChapterToolbarContent(chapter: Chapter): string {
  return chapter.summaryData?.summary || chapter.summary || ''
}

async function handlePluginToolbarClick(chapter: Chapter, handler: (payload: { chapter: Chapter; content: string }) => void | Promise<void>) {
  let content = getChapterToolbarContent(chapter)

  try {
    const fullChapter = await projectStore.loadChapter(chapter.id)
    if (fullChapter?.content) {
      content = fullChapter.content
    }
  } catch (error) {
    logger.warn('加载插件工具栏章节正文失败', { chapterId: chapter.id, error })
  }

  await handler({ chapter, content })
}

async function validateChapters() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有章节可验证')
    return
  }

  validating.value = true
  validationIssues.value = []

  try {
    for (let index = 1; index < chapters.value.length; index++) {
      if (chapters.value[index].number !== chapters.value[index - 1].number + 1) {
        validationIssues.value.push(
          `章节号不连续：第${chapters.value[index - 1].number}章之后是第${chapters.value[index].number}章`
        )
      }
    }

    for (const chapter of chapters.value) {
      const chapterWordCount = chapter.wordCount ?? chapter.content?.length ?? 0
      if (chapterWordCount < 100) {
        validationIssues.value.push(`第${chapter.number}章内容过短（少于100字符）`)
      }
    }

    const titles = chapters.value.map((chapter: Chapter) => chapter.title)
    const duplicates = titles.filter((title: string, index: number) => titles.indexOf(title) !== index)
    if (duplicates.length > 0) {
      validationIssues.value.push(`发现重复的章节标题：${[...new Set(duplicates)].join('、')}`)
    }

    showValidationDialog.value = true

    if (validationIssues.value.length === 0) {
      ElMessage.success('章节验证通过，未发现问题')
    } else {
      ElMessage.warning(`发现${validationIssues.value.length}个问题`)
    }
  } catch (error) {
    ElMessage.error('验证失败：' + getFriendlyMessage(getErrorMessage(error)))
  } finally {
    validating.value = false
  }
}

watch(project, (newProject) => {
  if (newProject) {
    logger.info('项目加载完成')
  }
}, { immediate: true })

function addChapter() {
  preserveEditorContent.value = false
  editingChapter.value = null
  showEditDialog.value = true
}

function editChapter(chapter: Chapter) {
  preserveEditorContent.value = false
  editingChapter.value = chapter
  showEditDialog.value = true
}

async function previewChapter(chapter: Chapter) {
  const requestId = ++previewRequestId
  showPreviewDialog.value = true
  previewingChapter.value = chapter
  previewLoading.value = true

  try {
    const fullChapter = await projectStore.loadChapter(chapter.id)
    if (requestId === previewRequestId) {
      previewingChapter.value = fullChapter ? { ...chapter, ...fullChapter } : chapter
    }
  } catch (error) {
    if (requestId === previewRequestId) {
      logger.warn('加载章节预览正文失败', { chapterId: chapter.id, error })
      ElMessage.warning('章节正文加载失败，正在显示摘要预览')
    }
  } finally {
    if (requestId === previewRequestId) {
      previewLoading.value = false
    }
  }
}

function closePreviewDialog() {
  previewRequestId++
  previewLoading.value = false
  previewingChapter.value = null
  showPreviewDialog.value = false
}

function editPreviewingChapter() {
  if (!previewingChapter.value) return
  const chapter = previewingChapter.value
  closePreviewDialog()
  preserveEditorContent.value = Boolean(chapter.content)
  editingChapter.value = chapter
  showEditDialog.value = true
}

function handleEditorVisibility(value: boolean) {
  showEditDialog.value = value
  if (!value) {
    preserveEditorContent.value = false
    editingChapter.value = null
  }
}

function handleChapterDragStart(chapterId: string, event: DragEvent) {
  draggingChapterId.value = chapterId
  event.dataTransfer?.setData('text/plain', chapterId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleChapterDragOver(chapterId: string, event?: DragEvent) {
  if (!draggingChapterId.value || draggingChapterId.value === chapterId) {
    dragOverChapterId.value = null
    return
  }

  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverChapterId.value = chapterId
}

function handleChapterDragEnd() {
  draggingChapterId.value = null
  dragOverChapterId.value = null
}

async function handleChapterDrop(targetChapterId: string) {
  const sourceChapterId = draggingChapterId.value
  handleChapterDragEnd()
  if (!sourceChapterId || sourceChapterId === targetChapterId) return

  const orderedIds = chapters.value.map(chapter => chapter.id)
  const sourceIndex = orderedIds.indexOf(sourceChapterId)
  const targetIndex = orderedIds.indexOf(targetChapterId)
  if (sourceIndex === -1 || targetIndex === -1) return

  orderedIds.splice(sourceIndex, 1)
  const insertionIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1
  orderedIds.splice(insertionIndex, 0, sourceChapterId)

  try {
    await projectStore.reorderChapters(orderedIds)
    ElMessage.success('章节排序已保存')
  } catch (error) {
    logger.error('章节排序失败', error)
    ElMessage.error('章节排序失败：' + getFriendlyMessage(error instanceof Error ? error.message : String(error)))
  }
}

function onChapterSaved() {
  preserveEditorContent.value = false
  editingChapter.value = null
}

async function confirmDeleteChapter(chapter: Chapter) {
  try {
    await ElMessageBox.confirm(
      `确定要删除第${chapter.number}章"${chapter.title}"吗？`,
      '删除章节',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!project.value) return

    await projectStore.deleteChapter(chapter.id)

    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

function viewCheckpoints(chapter: Chapter) {
  selectedChapter.value = chapter
  showCheckpointsDialog.value = true
}

function restoreCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  preserveEditorContent.value = true
  editingChapter.value = {
    ...structuredClone(selectedChapter.value),
    content: checkpoint.content,
  }
  showCheckpointsDialog.value = false
  showEditDialog.value = true
}

async function deleteCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  selectedChapter.value.checkpoints = selectedChapter.value.checkpoints.filter(
    item => item.id !== checkpoint.id
  )
  await projectStore.saveCurrentProject()
  ElMessage.success('检查点已删除')
}

function startBatchGeneration() {
  batchForm.value.startChapter = chapters.value.length + 1
  showBatchDialog.value = true
}

async function executeBatchGeneration() {
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  showBatchDialog.value = false
  ElMessage.success('🚀 已在任务中心开启批量生成')

  try {
    await generationScheduler.executeBatchGeneration({
      startChapter: batchForm.value.startChapter,
      count: batchForm.value.count,
      autoSave: batchForm.value.autoSave,
      autoUpdateSettings: batchForm.value.autoUpdateSettings,
      enableCheckpoint: batchForm.value.enableCheckpoint,
      checkpointInterval: batchForm.value.checkpointInterval,
      callbacks: {
        onCheckpointConfirm: async (chaptersGenerated) => {
          try {
            await ElMessageBox.confirm(
              `已连续生成 ${chaptersGenerated} 章，是否继续生成接下来的章节？\n您可以趁此时检查前文质量，若有跑偏请手动修正。`,
              '断点审查',
              { confirmButtonText: '继续生成', cancelButtonText: '终止批量', type: 'info' }
            )
            return true
          } catch {
            return false
          }
        },
        onBatchComplete: (chaptersGenerated) => {
          ElMessage.success(`批量生成游历完成！产出 ${chaptersGenerated} 章纯度百分百的内容。`)
        }
      }
    })
  } catch (error) {
    logger.error('批量生成失败', error)
    ElMessage.error('批量生成失败：' + getFriendlyMessage(getErrorMessage(error)))
  }
}

// ============================================================================
// 一键续写（Pipeline 批量续写）
// ============================================================================

async function handleWriteNextStart(options: {
  chapterCount: number
  directionPrompt: string
  checkpointInterval: number
  autoSave: boolean
}) {
  showWriteNextDialog.value = false
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  // 并发保护：检查项目锁
  if (!acquireProjectLock(project.value.id, 'batch-continue')) {
    ElMessage.warning(getLockConflictMessage(project.value.id))
    return
  }

  ElMessage.success('🚀 一键续写已启动，可在进度面板中查看实时状态')

  // 重置进度状态（通过 composable 管理，自动持久化）
  startPipeline()

  try {
    const { BatchContinueScheduler } = await import('@/services/pipeline/BatchContinueScheduler')
    const { PipelineRunner } = await import('@/services/pipeline/PipelineRunner')

    const aiStore = await import('@/stores/ai').then(m => m.useAIStore())
    const pipelineConfig = aiStore.getPipelineConfig()

    const pipeline = new PipelineRunner(pipelineConfig)
    const scheduler = new BatchContinueScheduler(pipeline)
    pipelineBatchScheduler.value = scheduler

    const startChapter = chapters.value.length > 0
      ? Math.max(...chapters.value.map(c => c.number)) + 1
      : 1

    const result = await scheduler.executeBatchContinue(
      project.value,
      startChapter,
      {
        chapterCount: options.chapterCount,
        directionPrompt: options.directionPrompt || undefined,
        checkpointInterval: options.checkpointInterval || undefined,
        autoSave: options.autoSave,
        onChapterComplete: async (chapterResult, _index) => {
          if (options.autoSave && chapterResult.content) {
            const chapter: Chapter = {
              id: `pipeline-${chapterResult.chapterNumber}-${Date.now()}`,
              number: chapterResult.chapterNumber,
              title: chapterResult.title,
              content: chapterResult.content,
              wordCount: chapterResult.wordCount,
              summary: '',
              outline: project.value!.outline.chapters[chapterResult.chapterNumber - 1] || {
                chapterId: `outline-${chapterResult.chapterNumber}`,
                title: chapterResult.title,
                scenes: [],
                characters: [],
                location: '',
                goals: [],
                conflicts: [],
                resolutions: [],
                foreshadowingToPlant: [],
                foreshadowingToResolve: [],
                status: 'completed',
              },
              status: 'draft',
              generatedBy: 'ai' as const,
              generationTime: new Date(),
              checkpoints: [],
              aiSuggestions: [],
              qualityScore: chapterResult.auditResult.overallScore,
            }
            await projectStore.saveChapter(chapter)
          }
        },
        onCheckpoint: async (completedResults) => {
          try {
            await ElMessageBox.confirm(
              `已完成 ${completedResults.length} 章，是否继续续写？\n您可以趁此时检查前文质量。`,
              '断点审查',
              { confirmButtonText: '继续续写', cancelButtonText: '终止续写', type: 'info' }
            )
            return true
          } catch {
            return false
          }
        },
        onProgress: (event) => {
          pushEvent(event)

          if (event.type === 'batch-paused') {
            pausePipeline()
          } else if (event.type === 'chapter-complete') {
            resumePipeline()
          }
        },
        onError: (chapterNumber, error) => {
          logger.error(`一键续写第${chapterNumber}章失败:`, error)
        },
      },
      pipelineConfig,
    )

    await finishPipeline()
    if (project.value) releaseProjectLock(project.value.id, 'batch-continue')
    ElMessage.success(`一键续写完成！产出 ${result.completedChapters} 章，失败 ${result.failedChapters} 章`)
  } catch (error) {
    logger.error('一键续写失败', error)
    await finishPipeline()
    if (project.value) releaseProjectLock(project.value.id, 'batch-continue')
    ElMessage.error('一键续写失败：' + getFriendlyMessage(getErrorMessage(error)))
  }
}

function handlePipelinePause() {
  pipelineBatchScheduler.value?.pause()
  pausePipeline()
}

function handlePipelineResume() {
  pipelineBatchScheduler.value?.resume()
  resumePipeline()
}

function handlePipelineCancel() {
  pipelineBatchScheduler.value?.cancel()
  finishPipeline()
  ElMessage.info('一键续写已取消')
}

async function regenerateChapter() {
  try {
    await ElMessageBox.confirm(
      '重新生成将覆盖当前章节内容，是否继续？',
      '确认重新生成',
      {
        confirmButtonText: '确认重新生成',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    ElMessage.info('重新生成功能开发中...')
  } catch {
    // 用户取消
  }
}

function handleChapterAction(cmd: string, chapter: Chapter) {
  if (cmd === 'export-md') {
    handleChapterExport(chapter, 'markdown')
  } else if (cmd === 'export-pdf') {
    handleChapterExport(chapter, 'pdf')
  } else if (cmd === 'export-docx') {
    handleChapterExport(chapter, 'docx')
  } else if (cmd === 'export-txt') {
    handleChapterExport(chapter, 'txt')
  } else if (cmd === 'regenerate') {
    regenerateChapter()
  } else if (cmd === 'checkpoints') {
    viewCheckpoints(chapter)
  } else if (cmd === 'aigc-detect') {
    handleAIGCDetect(chapter)
  } else if (cmd === 'delete') {
    confirmDeleteChapter(chapter)
  } else if (cmd.startsWith('plugin:')) {
    const buttonId = cmd.replace('plugin:', '')
    const button = pluginToolbarButtons.value.find(b => b.id === buttonId)
    if (button) handlePluginToolbarClick(chapter, button.handler)
  }
}

function getContentPreview(content: string, maxLength: number = 100) {
  return truncateReadingPreviewText(content, maxLength, '暂无内容')
}

// AIGC 检测
const aigcDetecting = ref(false)
const aigcResult = ref<{ overallScore: number; aiProbability: number } | null>(null)
const showAIGCDialog = ref(false)

async function handleAIGCDetect(chapter: Chapter) {
  if (!chapter.content || chapter.content.trim().length === 0) {
    ElMessage.warning('章节内容为空，无法进行AI检测')
    return
  }
  aigcDetecting.value = true
  showAIGCDialog.value = true
  aigcResult.value = null

  try {
    const { AIGCDetector } = await import('@/services/AIGCDetector')
    const detector = new AIGCDetector({ provider: 'local' })
    const result = await detector.detect(chapter.content)
    aigcResult.value = { overallScore: result.overallScore, aiProbability: result.aiProbability }
  } catch (error) {
    logger.error('AIGC检测失败:', error)
    ElMessage.error('AI检测失败，请稍后重试')
    showAIGCDialog.value = false
  } finally {
    aigcDetecting.value = false
  }
}
</script>

<style scoped lang="scss">
@use "@/styles/responsive" as *;

.chapters {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: var(--ds-space-5);
  border-radius: var(--ds-radius-lg);
}

.chapter-search-bar {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-4);
  padding: var(--ds-space-3);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  flex-wrap: wrap;
}
.chapter-search-input {
  flex: 1;
  min-width: 100%;

  @include tablet {
    min-width: 200px;
  }
}
.filter-count {
  font-size: 12px;
  color: var(--ds-text-tertiary);
  white-space: nowrap;
  padding: 0 var(--ds-space-2);
}

.header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ds-space-3);

  @include tablet {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}

.header h2 {
  margin: 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
}

.actions {
  display: flex;
  gap: var(--ds-space-2);
  flex-wrap: wrap;
  width: 100%;

  @include tablet {
    width: auto;
    justify-content: flex-end;
  }
}

.content {
  min-height: 400px;
}

.chapters-virtual-container,
.chapters-container {
  padding-right: var(--ds-space-1);
}

.chapters-virtual-container {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  will-change: transform;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
}

.chapter-card {
  position: relative;
  margin-bottom: 0;
  overflow: hidden;
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  transition:
    border-color var(--ds-transition-fast),
    box-shadow var(--ds-transition-fast);
  will-change: border-color, box-shadow;
}

.chapter-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.chapter-card:hover {
  @include can-hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--ds-accent) 28%, var(--ds-surface-border));
    box-shadow: var(--ds-shadow-md);
  }
}

.chapter-card.is-dragging {
  opacity: 0.55;
}

.chapter-card.is-drag-over {
  box-shadow: 0 0 0 2px var(--ds-accent) inset;
}

.chapter-card:focus-visible {
  outline: 2px solid var(--ds-accent);
  outline-offset: 2px;
}

.chapter-header {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  margin-bottom: var(--ds-space-4);

  @include tablet {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  min-width: 0;
  flex-wrap: wrap;

  @include tablet {
    gap: var(--ds-space-3);
    flex-wrap: nowrap;
  }
}

.drag-handle {
  width: 30px;
  height: 30px;
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-sm);
  background:
    radial-gradient(circle, var(--ds-text-tertiary) 1px, transparent 1.5px) 5px 5px / 8px 8px,
    var(--ds-bg-secondary);
  color: transparent;
  cursor: grab;
  font-size: 0;
  line-height: 1;
  transition: all var(--ds-transition-fast);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  border-color: var(--ds-accent);
  background:
    radial-gradient(circle, var(--ds-accent) 1px, transparent 1.5px) 5px 5px / 8px 8px,
    var(--ds-accent-subtle);
}

.chapter-number {
  flex-shrink: 0;
  color: var(--ds-accent-text);
  font-size: var(--ds-text-lg);
  font-weight: 700;
}

.chapter-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-stats {
  display: flex;
  gap: var(--ds-space-3);
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  flex-shrink: 0;

  @include tablet {
    gap: var(--ds-space-4);
  }
}

.chapter-content {
  margin-bottom: var(--ds-space-4);
}

.content-preview {
  color: var(--ds-text-secondary);
  line-height: 1.7;
}

.chapter-actions {
  display: flex;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-surface-border);
  flex-wrap: wrap;
}

.quality-score {
  margin-top: var(--ds-space-3);
  padding: var(--ds-space-2) var(--ds-space-3);
  background: var(--ds-accent-subtle);
  border: 1px solid color-mix(in srgb, var(--ds-accent) 24%, transparent);
  border-radius: var(--ds-radius-sm);
  color: var(--ds-accent-text);
  font-size: var(--ds-text-sm);
}

.reading-preview-container {
  min-height: 360px;
  max-height: 70vh;
  overflow-y: auto;
}

:deep(.reading-preview-dialog .el-dialog__body) {
  padding: var(--ds-space-3) var(--ds-space-5) 0;
}

.checkpoints-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
}

.checkpoint-item {
  margin-bottom: 0;
  border-radius: var(--ds-radius-md);
}

.checkpoint-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  color: var(--ds-text-primary);
  font-weight: 600;
  flex-wrap: wrap;
}

.checkpoint-time {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
}

.checkpoint-desc {
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
}

.checkpoint-content {
  margin: var(--ds-space-4) 0;
  color: var(--ds-text-secondary);
  line-height: 1.7;
}

.checkpoint-actions {
  display: flex;
  gap: var(--ds-space-2);
}

.batch-progress {
  margin-top: var(--ds-space-5);
}

.progress-text {
  margin-top: var(--ds-space-3);
  text-align: center;
  color: var(--ds-text-tertiary);
}

:deep(.el-dialog) {
  @include below-mobile {
    --el-dialog-width: 92vw;
    width: 92vw !important;
    max-width: 92vw !important;
    margin: 4vh auto;
  }
}
</style>
