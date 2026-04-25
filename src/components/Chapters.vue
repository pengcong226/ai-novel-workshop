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
                  导出全部 (Markdown)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllPdf">
                  导出全部 (PDF)
                </el-dropdown-item>
                <el-dropdown-item command="exportAllJson">
                  导出全部 (JSON)
                </el-dropdown-item>
                <el-dropdown-item divided command="exportSettings">
                  导出设置...
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button type="primary" @click="startBatchGeneration">
            <el-icon><MagicStick /></el-icon>
            批量生成
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

    <div class="content">
      <el-empty v-if="chapters.length === 0" description="还没有章节">
        <el-button type="primary" @click="addChapter">创建第一章</el-button>
      </el-empty>

      <div v-else class="chapters-container" ref="scrollContainerRef" style="height: calc(100vh - 200px); overflow-y: auto;">
        <div class="chapters-list" :style="{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }">
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
            <template v-for="chapter in [chapters[virtualRow.index]]" :key="chapter?.id">
              <el-card
                v-if="chapter"
                class="chapter-card"
                :class="{ 'is-dragging': draggingChapterId === chapter.id, 'is-drag-over': dragOverChapterId === chapter.id }"
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
                    <el-tag :type="getStatusType(chapter.status)" size="small">
                      {{ getStatusText(chapter.status) }}
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
                  <el-button size="small" @click="previewChapter(chapter)">
                    预览
                  </el-button>
                  <el-button type="primary" size="small" @click="editChapter(chapter)">
                    编辑
                  </el-button>
                  <el-dropdown size="small" @command="(cmd: string) => handleChapterExport(chapter, cmd)">
                    <el-button size="small">
                      导出 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="markdown">Markdown</el-dropdown-item>
                        <el-dropdown-item command="pdf">PDF</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <el-button size="small" @click="regenerateChapter">
                    重新生成
                  </el-button>
                  <el-button size="small" @click="viewCheckpoints(chapter)">
                    检查点
                  </el-button>

                  <el-button
                    v-for="button in pluginToolbarButtons"
                    :key="button.id"
                    size="small"
                    @click="void handlePluginToolbarClick(chapter, button.handler)"
                  >
                    <el-icon v-if="button.icon">
                      <component :is="button.icon" />
                    </el-icon>
                    {{ button.label }}
                  </el-button>

                  <el-button type="danger" size="small" @click="confirmDeleteChapter(chapter)">
                    删除
                  </el-button>
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

    <ChapterEditorDialog
      v-if="showEditDialog || editingChapter"
      :model-value="showEditDialog"
      :chapter="editingChapter"
      :project-id="project?.id"
      :preserve-provided-content="preserveEditorContent"
      @update:model-value="handleEditorVisibility"
      @saved="onChapterSaved"
    />

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
          <span style="margin-left: 10px; font-size: 12px; color: #909399;">生成后自动更新人物/关系图/表格记忆</span>
        </el-form-item>

        <el-form-item label="断点审查">
          <el-switch v-model="batchForm.enableCheckpoint" />
          <el-input-number v-if="batchForm.enableCheckpoint" v-model="batchForm.checkpointInterval" :min="1" :max="10" style="margin-left: 10px;" />
          <span style="margin-left: 10px; font-size: 12px; color: #909399;">每N章暂停等待确认，防止跑偏</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showBatchDialog = false">取消</el-button>
        <el-button type="primary" @click="executeBatchGeneration">
          开始生成并在后台运行
        </el-button>
      </template>
    </el-dialog>

    <ExportSettings
      v-model="showExportSettings"
      :project="project"
      :chapters="chapters"
      :selected-chapter="exportChapter"
      :export-mode="exportMode"
      @exported="handleExportComplete"
    />

    <ContinuationPanel
      v-if="showContinuationPanel"
      @close="showContinuationPanel = false"
      @started="showContinuationPanel = false"
    />

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

      <div v-else class="validation-issues">
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

        <div style="margin-top: 20px; color: #909399; font-size: 13px;">
          <el-icon><InfoFilled /></el-icon>
          这些问题通常不影响阅读，可在后续编辑中逐步修正
        </div>
      </div>

      <template #footer>
        <el-button @click="showValidationDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, CircleCheck, Download, InfoFilled, MagicStick, Plus } from '@element-plus/icons-vue'
import type { Chapter, Checkpoint } from '@/types'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { generationScheduler } from '@/services/generation-scheduler'
import { useChapterExport } from '@/composables/useChapterExport'
import { useRewriteContinuation } from '@/composables/useRewriteContinuation'
import { getLogger } from '@/utils/logger'
import { buildReadingPreview, truncateReadingPreviewText } from '@/utils/readingPreview'
const ExportSettings = defineAsyncComponent(() => import('./ExportSettings.vue'))
const ChapterEditorDialog = defineAsyncComponent(() => import('./ChapterEditorDialog.vue'))
const ChapterReadingPreview = defineAsyncComponent(() => import('./ChapterReadingPreview.vue'))
const ContinuationPanel = defineAsyncComponent(() => import('./RewriteContinuation/ContinuationPanel.vue'))
const RewritePanel = defineAsyncComponent(() => import('./RewriteContinuation/RewritePanel.vue'))
const StateDiffViewer = defineAsyncComponent(() => import('./RewriteContinuation/StateDiffViewer.vue'))

const logger = getLogger('chapters')
const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

const scrollContainerRef = ref<HTMLElement | null>(null)
const rowVirtualizerOptions = computed(() => ({
  count: chapters.value.length,
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
const { diffReport, acceptRewrite, rejectRewrite } = useRewriteContinuation()

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
    ElMessage.error('验证失败：' + (error as Error).message)
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
    ElMessage.error('章节排序失败：' + (error instanceof Error ? error.message : String(error)))
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
    ElMessage.error('批量生成失败：' + (error as Error).message)
  }
}

function regenerateChapter() {
  ElMessage.info('重新生成功能开发中...')
}

function getStatusType(status: string) {
  const types: Record<string, 'info' | 'warning' | 'success'> = {
    draft: 'info',
    revised: 'warning',
    final: 'success'
  }
  return types[status] || 'info'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    draft: '草稿',
    revised: '已修订',
    final: '定稿'
  }
  return texts[status] || status
}

function getContentPreview(content: string, maxLength: number = 100) {
  return truncateReadingPreviewText(content, maxLength, '暂无内容')
}

function formatDate(date: Date | string) {
  const formattedDate = new Date(date)
  return `${formattedDate.getFullYear()}-${String(formattedDate.getMonth() + 1).padStart(2, '0')}-${String(formattedDate.getDate()).padStart(2, '0')} ${String(formattedDate.getHours()).padStart(2, '0')}:${String(formattedDate.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.chapters {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: var(--ds-space-5);
  border-radius: var(--ds-radius-lg);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-4);
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
  justify-content: flex-end;
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
  border-radius: var(--ds-radius-lg);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  transition:
    transform var(--ds-transition-normal),
    opacity var(--ds-transition-normal),
    border-color var(--ds-transition-normal),
    box-shadow var(--ds-transition-normal);
}

.chapter-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.chapter-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--ds-accent) 28%, var(--ds-surface-border));
  box-shadow: var(--ds-shadow-md);
}

.chapter-card.is-dragging {
  opacity: 0.55;
}

.chapter-card.is-drag-over {
  box-shadow: 0 0 0 2px var(--ds-accent) inset;
}

.chapter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-4);
  margin-bottom: var(--ds-space-4);
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-width: 0;
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
  gap: var(--ds-space-4);
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  flex-shrink: 0;
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

@media (max-width: 768px) {
  .header,
  .chapter-header,
  .chapter-stats {
    align-items: flex-start;
    flex-direction: column;
  }

  .actions,
  .chapter-actions {
    justify-content: flex-start;
  }
}
</style>
