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
              >
                <div class="chapter-header">
                  <div class="chapter-info">
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
                    {{ chapter.summaryData?.summary || chapter.summary || getContentPreview(chapter.content) || '由于防爆栈机制已启动，正文以惰性加载，请点击编辑查看。' }}
                  </div>
                </div>

                <div class="chapter-actions">
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
import { computed, ref, watch } from 'vue'
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
import ExportSettings from './ExportSettings.vue'
import ChapterEditorDialog from './ChapterEditorDialog.vue'
import ContinuationPanel from './RewriteContinuation/ContinuationPanel.vue'
import RewritePanel from './RewriteContinuation/RewritePanel.vue'
import StateDiffViewer from './RewriteContinuation/StateDiffViewer.vue'

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

function handleEditorVisibility(value: boolean) {
  showEditDialog.value = value
  if (!value) {
    preserveEditorContent.value = false
    editingChapter.value = null
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
  if (!content) return '暂无内容'
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
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

.chapters-virtual-container {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  will-change: transform;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chapter-card {
  margin-bottom: 0;
}

.chapter-header {
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

.chapter-stats {
  display: flex;
  gap: 20px;
  color: #909399;
  font-size: 14px;
}

.chapter-content {
  margin-bottom: 15px;
}

.content-preview {
  color: #606266;
  line-height: 1.6;
}

.chapter-actions {
  display: flex;
  gap: 10px;
  padding-top: 15px;
  border-top: 1px solid #e4e7ed;
}

.quality-score {
  margin-top: 10px;
  padding: 8px 12px;
  background: #f0f9ff;
  border-radius: 4px;
  font-size: 14px;
  color: #409eff;
}

.checkpoints-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.checkpoint-item {
  margin-bottom: 0;
}

.checkpoint-header {
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: 600;
}

.checkpoint-time {
  color: #909399;
  font-size: 14px;
}

.checkpoint-desc {
  color: #606266;
  font-size: 14px;
}

.checkpoint-content {
  margin: 15px 0;
  color: #606266;
  line-height: 1.6;
}

.checkpoint-actions {
  display: flex;
  gap: 10px;
}

.batch-progress {
  margin-top: 20px;
}

.progress-text {
  margin-top: 10px;
  text-align: center;
  color: #909399;
}
</style>
