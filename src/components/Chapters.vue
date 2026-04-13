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

      <!-- 章节列表 -->
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
                <!-- 我们不再全量加载 content，所以预览优先使用 summary 或提供友好提示 -->
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
              <el-button size="small" @click="regenerateChapter(chapter)">
                重新生成
              </el-button>
              <el-button size="small" @click="viewCheckpoints(chapter)">
                检查点
              </el-button>

              <!-- 插件工具栏按钮 -->
              <el-button
                v-for="button in pluginToolbarButtons"
                :key="button.id"
                size="small"
                @click="button.handler({ chapter, content: chapter.content })"
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

    <!-- 章节编辑全屏沉浸工作台 (Immersive Dual-Pane Workflow) -->
    <el-dialog
      v-model="showEditDialog"
      fullscreen
      :show-close="false"
      class="immersive-editor-dialog"
      :close-on-click-modal="false"
    >
      <template #header="{ titleId, titleClass }">
        <div class="immersive-header">
          <div class="header-left">
            <el-button @click="showEditDialog = false" text circle class="back-btn"><el-icon><ArrowLeft /></el-icon></el-button>
            <span :id="titleId" :class="titleClass" class="header-chapter-num">{{ editingChapter ? `第${editingChapter.number}章` : '新建章节' }}</span>
          </div>
          <div class="header-center">
            <el-input v-model="chapterForm.title" placeholder="无尽航程的标题..." class="immersive-title-input" />
          </div>
          <div class="header-right">
             <span class="immersive-status" :style="{ color: saveStatusColor }">{{ saveStatusText }}</span>
             <el-button @click="saveCheckpoint" v-if="editingChapter" text>打点</el-button>
             <el-button type="primary" @click="saveChapter" :loading="saving" round>保存</el-button>
          </div>
        </div>
      </template>

      <!-- 双轨布局区 -->
      <div class="immersive-dual-pane">
        
        <!-- 左侧打字机区 (Notion-like) -->
        <div class="immersive-editor-area">
          <div class="immersive-toolbar">
            <el-button @click="generateContent" :loading="generating" type="primary" plain round size="small">
              <el-icon><MagicStick /></el-icon> AI连载
            </el-button>
            <el-checkbox v-model="autoUpdateSettings" size="small" style="margin: 0 10px;">后台静默提词</el-checkbox>
            <el-button @click="optimizeContent" text size="small">打磨文笔</el-button>
            <el-button @click="checkQuality" text size="small">防吃书预警</el-button>
            <span class="word-count">{{ chapterForm.content.length }} 墨</span>
          </div>
          
          <el-input
            v-model="chapterForm.content"
            type="textarea"
            :rows="30"
            placeholder="此刻，命运的齿轮开始转动..."
            @keydown="handleEditorKeydown"
            class="immersive-textarea"
          />
        </div>

        <!-- 右侧毛玻璃悬浮关联面板 (Glassmorphism Context) -->
        <GlassContextPanel
          v-model:activeTab="editActiveTab"
          v-model:chapterForm="chapterForm"
          :characters="activeContextCharacters"
          :worldbook="activeContextWorldbook"
        />

      </div>
    </el-dialog>

    <!-- 检查点对话框 -->
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

    <!-- 质量报告对话框 -->
    <el-dialog
      v-model="showQualityDialog"
      title="质量检查报告"
      width="70%"
      top="5vh"
    >
      <div v-if="currentQualityReport" class="quality-report-dialog">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="总体评分" :value="currentQualityReport.overallScore" :precision="1">
              <template #suffix>/ 10</template>
            </el-statistic>
          </el-col>
          <el-col :span="8">
            <el-statistic title="问题数量" :value="getTotalIssues(currentQualityReport)" />
          </el-col>
          <el-col :span="8">
            <el-statistic title="改进建议" :value="currentQualityReport.improvements.length" />
          </el-col>
        </el-row>

        <el-divider />

        <el-tabs v-model="qualityReportTab">
          <el-tab-pane label="维度评分" name="dimensions">
            <el-row :gutter="20">
              <el-col
                v-for="dim in currentQualityReport.dimensions"
                :key="dim.name"
                :span="12"
              >
                <el-card class="quality-dimension-card" shadow="hover">
                  <div class="dimension-header">
                    <span class="dimension-name">{{ dim.name }}</span>
                    <el-progress
                      :percentage="dim.score * 10"
                      :color="getScoreColor(dim.score)"
                      :format="() => dim.score.toFixed(1)"
                    />
                  </div>

                  <div v-if="dim.issues.length > 0" class="dimension-issues">
                    <el-tag
                      v-for="(issue, idx) in dim.issues.slice(0, 3)"
                      :key="idx"
                      :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                      size="small"
                      style="margin-right: 4px; margin-bottom: 4px;"
                    >
                      {{ issue.message }}
                    </el-tag>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="问题详情" name="issues">
            <el-timeline>
              <el-timeline-item
                v-for="(dim, dimIdx) in currentQualityReport.dimensions"
                :key="dimIdx"
                :type="dim.score < 6 ? 'danger' : dim.score < 8 ? 'warning' : 'success'"
                :title="dim.name"
              >
                <div v-if="dim.issues.length > 0">
                  <h4>{{ dim.name }} ({{ dim.score.toFixed(1) }}/10)</h4>
                  <ul>
                    <li v-for="(issue, issueIdx) in dim.issues" :key="Number(issueIdx)">
                      <el-tag
                        :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                        size="small"
                      >
                        {{ issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '提示' }}
                      </el-tag>
                      {{ issue.message }}
                    </li>
                  </ul>
                </div>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>

          <el-tab-pane label="改进建议" name="improvements">
            <el-timeline>
              <el-timeline-item
                v-for="(improvement, idx) in currentQualityReport.improvements"
                :key="idx"
                :type="Number(idx) < 3 ? 'primary' : 'info'"
              >
                {{ improvement }}
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="showQualityDialog = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 批量生成对话框 -->
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

        <!-- V4-P1-⑦: 断点审查 -->
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

    <!-- 导出设置对话框 -->
    <ExportSettings
      v-model="showExportSettings"
      :project="project"
      :chapters="chapters"
      :selected-chapter="exportChapter"
      :export-mode="exportMode"
      @exported="handleExportComplete"
    />

    <!-- 章节验证对话框 -->
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
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import GlassContextPanel from './GlassContextPanel.vue'
import { useContextRadar } from '@/composables/useContextRadar'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, Download, ArrowDown, CircleCheck, ArrowLeft } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Chapter, Checkpoint } from '@/types'
import ExportSettings from './ExportSettings.vue'
import { useChapterExport } from '@/composables/useChapterExport'
import type { ChatMessage } from '@/types/ai'

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

// 获取插件提供的工具栏按钮
const pluginToolbarButtons = computed(() => {
  return pluginStore.getToolbarButtons().filter(btn => btn.location === 'chapter-editor')
})

const showEditDialog = ref(false)
const editingChapter = ref<Chapter | null>(null)
const saving = ref(false)
const generating = ref(false)
const generationStatus = ref('')
const autoUpdateSettings = ref(true)
const editActiveTab = ref('basic')
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

import { generationScheduler } from '@/services/generation-scheduler'

const chapterForm = ref<Chapter>({
  id: '',
  number: 1,
  title: '',
  content: '',
  wordCount: 0,
  outline: {
    chapterId: '',
    title: '',
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned'
  },
  status: 'draft',
  generatedBy: 'ai',
  generationTime: new Date(),
  checkpoints: [],
  aiSuggestions: []
})

const chapterContentProxy = computed(() => chapterForm.value.content)
const { activeContextCharacters, activeContextWorldbook } = useContextRadar(project, chapterContentProxy, showEditDialog)

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



// 质量检查相关
const showQualityDialog = ref(false)
const currentQualityReport = ref<any>(null)
const qualityReportTab = ref('dimensions')

// 导出相关 (通过 Composables 挂载)
const {
  showExportSettings,
  exportMode,
  exportChapter,
  handleExportCommand,
  handleChapterExport,
  handleExportComplete
} = useChapterExport(project, chapters)

// 章节验证相关
const validating = ref(false)
const showValidationDialog = ref(false)
const validationIssues = ref<string[]>([])

// 验证章节
async function validateChapters() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有章节可验证')
    return
  }

  validating.value = true
  validationIssues.value = []

  try {
    // 检查章节号连续性
    for (let i = 1; i < chapters.value.length; i++) {
      if (chapters.value[i].number !== chapters.value[i - 1].number + 1) {
        validationIssues.value.push(
          `章节号不连续：第${chapters.value[i - 1].number}章之后是第${chapters.value[i].number}章`
        )
      }
    }

    // 检查内容连续性
    for (const chapter of chapters.value) {
      if (chapter.content.length < 100) {
        validationIssues.value.push(`第${chapter.number}章内容过短（少于100字符）`)
      }
    }

    // 检查标题重复
    const titles = chapters.value.map(ch => ch.title)
    const duplicates = titles.filter((title, index) => titles.indexOf(title) !== index)
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

// 监听project加载
watch(project, (newProject) => {
  if (newProject) {
    console.log('[Chapters] 项目加载完成')
  }
}, { immediate: true })

const saveStatusText = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '保存中...'
    case 'saved':
      return '已自动保存'
    case 'error':
      return '保存失败'
    default:
      return '未保存'
  }
})

const saveStatusColor = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '#409eff'
    case 'saved':
      return '#67c23a'
    case 'error':
      return '#f56c6c'
    default:
      return '#909399'
  }
})

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

function syncChapterDraftToProject() {
  if (!project.value || !showEditDialog.value) {
    return
  }

  const draftData = structuredClone(chapterForm.value)
  draftData.id = draftData.id || uuidv4()
  draftData.wordCount = draftData.content.length
  chapterForm.value.id = draftData.id

  const existingIndex = project.value.chapters.findIndex(c => c.id === draftData.id)
  if (existingIndex >= 0) {
    project.value.chapters[existingIndex] = draftData
  } else {
    project.value.chapters.push(draftData)
  }

  project.value.currentWords = project.value.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
}

function scheduleAutoSave() {
  if (!showEditDialog.value || saving.value || generating.value) {
    return
  }

  if (!project.value || (!chapterForm.value.title.trim() && !chapterForm.value.content.trim())) {
    return
  }

  clearAutoSaveTimer()
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(async () => {
    try {
      syncChapterDraftToProject()
      await projectStore.debouncedSaveCurrentProject()
      saveStatus.value = 'saved'
    } catch (error) {
      console.error('自动保存失败:', error)
      saveStatus.value = 'error'
    }
  }, 3000)
}

function handleEditorKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveChapter()
  }
}

watch(
  () => [showEditDialog.value, chapterForm.value.title, chapterForm.value.content, chapterForm.value.number],
  ([visible]) => {
    if (!visible) {
      clearAutoSaveTimer()
      return
    }

    saveStatus.value = 'idle'
    scheduleAutoSave()
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleEditorKeydown)
})

onUnmounted(() => {
  clearAutoSaveTimer()
  window.removeEventListener('keydown', handleEditorKeydown)
})

function resetForm() {
  chapterForm.value = {
    id: uuidv4(),
    number: chapters.value.length + 1,
    title: '',
    content: '',
    wordCount: 0,
    outline: {
      chapterId: '',
      title: '',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'planned'
    },
    status: 'draft',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    aiSuggestions: []
  }
  editingChapter.value = null
  editActiveTab.value = 'basic'
}

function addChapter() {
  resetForm()
  showEditDialog.value = true
}

async function editChapter(chapter: any) {
  editingChapter.value = chapter
  
  // 先将浅层的 chapter 对象克隆一份
  const form = structuredClone(chapter)
  
  // 核心！触发 SQLite 惰性加载：真正将几十KB的文本拉入内存
  try {
    const fullChapter = await projectStore.loadChapter(chapter.id)
    if (fullChapter && fullChapter.content) {
      form.content = fullChapter.content
    } else {
      form.content = form.content || ''
    }
  } catch (err) {
    console.error('加载章节正文失败:', err)
    form.content = form.content || ''
  }
  
  chapterForm.value = form
  showEditDialog.value = true
}

async function saveChapter() {
  if (!chapterForm.value.title.trim()) {
    ElMessage.warning('请输入章节标题')
    return
  }

  saving.value = true
  saveStatus.value = 'saving'
  try {
    if (!project.value) return

    // 将 reactive 对象转换为普通对象
    const chapterData = structuredClone(chapterForm.value)
    chapterData.wordCount = chapterData.content?.length || 0

    if (!editingChapter.value) {
      chapterData.id = chapterData.id || uuidv4()
    }

    // 调用惰性代理层的单章保存接口，彻底避免 OOM 并发重构
    await projectStore.saveChapter(chapterData)

    ElMessage.success('保存成功')
    saveStatus.value = 'saved'
    showEditDialog.value = false
    resetForm()

    // 后台运行设定提取
    if (autoUpdateSettings.value) {
      generationScheduler.runExtractionInBackground(chapterData)
    }

    // 触发章节保存事件（用于AI建议系统）
    const chapterSaveEvent = new CustomEvent('chapter-save', {
      detail: { chapter: chapterData }
    })
    window.dispatchEvent(chapterSaveEvent)
  } catch (error) {
    saveStatus.value = 'error'
    ElMessage.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    saving.value = false
  }
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
    
    // 调用单独删除底层接口
    await projectStore.deleteChapter(chapter.id)
    
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

function buildGenerationOptions(advancedSettings?: {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}) {
  const maxTokens = advancedSettings?.maxTokens ?? 4000
  const temperature = advancedSettings?.temperature ?? 0.7
  const stopSequences = (advancedSettings?.stopSequences || []).filter(Boolean)

  return {
    maxTokens,
    temperature,
    ...(stopSequences.length > 0 ? { stopSequences } : {})
  }
}

async function runQualityCheckSilently(targetChapter: Chapter, notify: boolean = true) {
  if (!project.value || !project.value.config?.enableQualityCheck) {
    return
  }

  try {
    const { createQualityChecker } = await import('@/utils/qualityChecker')
    const checker = createQualityChecker(
      project.value.world,
      project.value.characters,
      project.value.outline,
      project.value.config
    )

    const report = await checker.checkChapter(targetChapter)
    targetChapter.qualityScore = report.overallScore

    const mergedSuggestions = [
      ...(targetChapter.aiSuggestions || []),
      ...report.improvements
    ]
    targetChapter.aiSuggestions = [...new Set(mergedSuggestions)]

    const threshold = project.value.config.qualityThreshold || 7
    if (notify && report.overallScore < threshold) {
      ElMessage.warning(`自动质量检查：${report.overallScore.toFixed(1)}/10，低于阈值 ${threshold}`)
    }
  } catch (error) {
    console.warn('自动质量检查失败:', error)
  }
}

async function generateContent() {
  generating.value = true
  generationStatus.value = '正在准备生成环境...'
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (aiStore.checkInitialized()) {
      generationStatus.value = '正在加载项目数据...'
      const projectStore = await import('@/stores/project').then(m => m.useProjectStore())
      const project = projectStore.currentProject

      if (!project) {
        ElMessage.warning('请先打开或创建项目')
        return
      }

      // 使用酒馆风格的上下文构建器
      generationStatus.value = '正在构建AI记忆与上下文...'
      const { buildChapterContext, contextToPromptPayload } = await import('@/utils/contextBuilder')

      console.log('[章节生成] 使用上下文构建器构建记忆...')

      // 构建上下文
      const context = await buildChapterContext(project, chapterForm.value)

      console.log('[章节生成] 上下文构建完成:')
      console.log(`  - 总Token数: ${context.totalTokens}`)
      console.log(`  - 警告: ${context.warnings.length > 0 ? context.warnings.join(', ') : '无'}`)
      console.log(`  - Author Note 长度: ${context.authorsNote.length}`)
      console.log(`  - 最近章节: ${context.recentChapters ? '有' : '无'}`)

      // V3-fix: 使用 system/user 角色分离（与批量生成路径一致）
      generationStatus.value = '正在组合提示词...'
      const targetWords = project.config?.advancedSettings?.targetWordCount || 2000
      const promptPayload = contextToPromptPayload(context, chapterForm.value.title || '未命名章节', targetWords)

      if (context.warnings.length > 0) {
        ElMessage.warning(`上下文提示: ${context.warnings[0]}`)
      }

      const messages: ChatMessage[] = [
        { role: 'system', content: promptPayload.systemMessage },
        { role: 'user', content: promptPayload.userMessage }
      ]
      const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }

      console.log('[章节生成] 开始调用AI服务...')
      generationStatus.value = `前文长度 ${context.totalTokens} Tokens。正在请求AI...`
      const generationOptions = buildGenerationOptions(project.config?.advancedSettings)
      
      // 改为流式输出，大幅提升 UX
      chapterForm.value.content = ''

      let response
      try {
        response = await aiStore.chatStream(
          messages,
          (event) => {
            if (event.type === 'chunk' && event.chunk) {
              chapterForm.value.content += event.chunk
              // 实时更新字数状态
              generationStatus.value = `正在生成中... (${chapterForm.value.content.length}字)`
            }
          },
          aiContext,
          generationOptions
        )
      } catch (streamError) {
        console.warn('[章节生成] 流式生成失败，回退普通模式:', streamError)
        generationStatus.value = '流式中断，正在切换普通模式重试...'
        response = await aiStore.chat(messages, aiContext, generationOptions)
      }
      
      console.log('[章节生成] AI响应完成长度:', response.content.length)

      generationStatus.value = '正在解析返回数据...'
      chapterForm.value.content = response.content.trim()
      chapterForm.value.generatedBy = 'ai'

      // 执行 post-generation 插件管道
      const { usePluginStore } = await import('@/stores/plugin')
      const pluginStore = usePluginStore()
      const processorRegistry = pluginStore.getRegistries().processor
      generationStatus.value = '执行生成后处理...'
      try {
        const postResult = await processorRegistry.processPipeline(
          'post-generation',
          { chapter: chapterForm.value, project },
          { project, chapter: chapterForm.value, config: project.config }
        )
        if (postResult && (postResult as any).chapter && (postResult as any).chapter.content) {
          chapterForm.value.content = (postResult as any).chapter.content
        }
      } catch (err) {
        console.error('执行 post-generation 管道失败:', err)
      }

      chapterForm.value.wordCount = chapterForm.value.content.length
      const generatedChapter = structuredClone(chapterForm.value) as Chapter
      await runQualityCheckSilently(generatedChapter)
      chapterForm.value.qualityScore = generatedChapter.qualityScore
      chapterForm.value.aiSuggestions = generatedChapter.aiSuggestions

      ElMessage.success('AI生成章节成功！')
    } else {
      generationStatus.value = 'AI服务未配置，生成示例内容...'
      await generateDefaultContent()
    }
  } catch (error) {
    console.error('[章节生成] 失败:', error)
    ElMessage.error('生成失败：' + (error as Error).message)
    await generateDefaultContent()
  } finally {
    generating.value = false
    generationStatus.value = ''
  }
}

async function generateDefaultContent() {
  chapterForm.value.content = `这是示例章节内容。

主角站在山顶，望着远方的云海。风吹过他的脸庞，带来一丝凉意。

"终于到了这一步。"他喃喃自语。

身后的老者缓缓开口："修行之路漫长，这只是开始。"

主角转过身，眼神坚定："我知道，但我已经准备好了。"

老者点点头，露出欣慰的笑容："那就去吧，不要让我们失望。"

主角深吸一口气，纵身一跃，向着云海深处飞去...

---
这是示例内容。要使用AI生成，请在配置中添加API密钥。`

  chapterForm.value.generatedBy = 'manual'
  ElMessage.success('已生成示例章节内容。要使用AI生成，请在配置中添加API密钥。')
}

function optimizeContent() {
  ElMessage.info('内容优化功能开发中...')
}

async function checkQuality() {
  if (!chapterForm.value.content || chapterForm.value.content.trim().length === 0) {
    ElMessage.warning('请先生成章节内容')
    return
  }

  if (!project.value) {
    ElMessage.warning('项目未加载')
    return
  }

  try {
    ElMessage.info('正在进行质量检查...')

    // 1. 传统质量检查
    const { createQualityChecker } = await import('@/utils/qualityChecker')

    const checker = createQualityChecker(
      project.value.world,
      project.value.characters,
      project.value.outline,
      project.value.config
    )

    // 创建临时章节对象
    const tempChapter = {
      ...chapterForm.value,
      number: chapterForm.value.number || chapters.value.length + 1
    } as Chapter

    const report = await checker.checkChapter(tempChapter)

    // 2. 冲突检测（针对当前章节）
    const { ConflictDetector } = await import('@/utils/conflictDetector')
    const detector = new ConflictDetector(project.value)
    const conflictResult = await detector.detect()

    // 筛选与当前章节相关的冲突
    const relevantConflicts = conflictResult.conflicts.filter(c =>
      !c.relatedChapters || c.relatedChapters.includes(chapterForm.value.number)
    )

    // 3. 综合评分（质量分 - 冲突扣分）
    const conflictPenalty = relevantConflicts.reduce((sum, c) => {
      return sum + (c.severity === 'critical' ? 1.0 : c.severity === 'warning' ? 0.5 : 0.2)
    }, 0)
    const finalScore = Math.max(0, Math.min(10, report.overallScore - conflictPenalty))
    chapterForm.value.qualityScore = finalScore

    // 4. 生成综合建议
    const allSuggestions: string[] = []

    // 添加质量检查建议
    report.improvements.forEach(improvement => {
      allSuggestions.push(improvement)
    })

    // 添加冲突修复建议
    relevantConflicts.forEach(conflict => {
      allSuggestions.push(`[冲突] ${conflict.title}: ${conflict.suggestions.map(s => s.description).join('; ')}`)
    })

    // 去重
    chapterForm.value.aiSuggestions = [...new Set(allSuggestions)]

    // 5. 显示结果
    const issuesCount = report.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
    const conflictsCount = relevantConflicts.length

    ElMessage.success(
      `质量检查完成！评分：${finalScore.toFixed(1)}/10，发现 ${issuesCount} 个质量问题，${conflictsCount} 个冲突`
    )

    // 显示详细报告
    showQualityReportDialog(report)
  } catch (error) {
    console.error('质量检查失败:', error)
    ElMessage.error('质量检查失败：' + (error as Error).message)
  }
}

// 质量报告对话框

function showQualityReportDialog(report: any) {
  currentQualityReport.value = report
  showQualityDialog.value = true
}

function saveCheckpoint() {
  if (!editingChapter.value) return

  const checkpoint: Checkpoint = {
    id: uuidv4(),
    timestamp: new Date(),
    content: chapterForm.value.content,
    description: '手动保存'
  }

  chapterForm.value.checkpoints.push(checkpoint)
  ElMessage.success('检查点已保存')
}

function viewCheckpoints(chapter: Chapter) {
  selectedChapter.value = chapter
  showCheckpointsDialog.value = true
}

function restoreCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  chapterForm.value = structuredClone(selectedChapter.value)
  chapterForm.value.content = checkpoint.content
  showCheckpointsDialog.value = false
  showEditDialog.value = true
}

async function deleteCheckpoint(checkpoint: Checkpoint) {
  if (!selectedChapter.value) return

  selectedChapter.value.checkpoints = selectedChapter.value.checkpoints.filter(
    c => c.id !== checkpoint.id
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
      checkpointInterval: batchForm.value.checkpointInterval
    })
  } catch (error) {
    console.error('[批量生成] 失败:', error)
    ElMessage.error('批量生成失败：' + (error as Error).message)
  }
}

function regenerateChapter(_chapter: Chapter) {
  ElMessage.info('重新生成功能开发中...')
}

function getStatusType(status: string) {
  const types: Record<string, any> = {
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
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getTotalIssues(report: any) {
  return report.dimensions.reduce((sum: number, dim: any) => sum + dim.issues.length, 0)
}

function getScoreColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

// 导出逻辑已重构至 src/composables/useChapterExport.ts
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

/* 虚拟滚动容器 */
.chapters-virtual-container {
  max-height: calc(100vh - 300px);
  overflow-y: auto;
  will-change: transform; /* 性能优化：提示浏览器该元素会变化 */
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

.editor-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.word-count {
  margin-left: auto;
  color: #909399;
  font-size: 14px;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.suggestion-item {
  margin-bottom: 0;
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

.quality-report-dialog {
  min-height: 400px;
}

.quality-dimension-card {
  margin-bottom: 15px;
}

.quality-dimension-card .dimension-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.quality-dimension-card .dimension-name {
  font-weight: 600;
  font-size: 14px;
}

.quality-dimension-card .dimension-issues {
  margin-top: 10px;
}

.dimension-issues {
  margin-top: 10px;
}

/* --------------- 沉浸式双轨编辑器 (Immersive Zen Editor) CSS --------------- */
:deep(.immersive-editor-dialog) {
  --el-dialog-padding-primary: 0;
  background-color: var(--el-bg-color-page);
}
:deep(.immersive-editor-dialog .el-dialog__header) {
  padding: 0;
  margin: 0;
}
:deep(.immersive-editor-dialog .el-dialog__body) {
  padding: 0;
  height: calc(100vh - 60px); 
  overflow: hidden;
  background: radial-gradient(circle at center, #ffffff 0%, #f4f6f9 100%);
}
html.dark :deep(.immersive-editor-dialog .el-dialog__body) {
  background: radial-gradient(circle at center, #1a1a1a 0%, #0d0d0d 100%);
}

.immersive-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
html.dark .immersive-header {
  background: rgba(30, 30, 30, 0.7);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 250px;
}
.header-chapter-num {
  font-weight: 600;
  color: var(--el-text-color-primary);
  opacity: 0.8;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}
:deep(.immersive-title-input .el-input__wrapper) {
  box-shadow: none !important;
  background: transparent;
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  width: 400px;
}
:deep(.immersive-title-input .el-input__inner) {
  text-align: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
  width: 250px;
  justify-content: flex-end;
}
.immersive-status {
  font-size: 13px;
  font-weight: 500;
}

.immersive-dual-pane {
  display: flex;
  height: 100%;
  width: 100%;
}

.immersive-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 15%;
  position: relative;
}

.immersive-toolbar {
  display: flex;
  align-items: center;
  height: 50px;
  padding: 0 10;
  opacity: 0.6;
  transition: opacity 0.3s;
}
.immersive-toolbar:hover {
  opacity: 1;
}
.word-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

:deep(.immersive-textarea .el-textarea__inner) {
  box-shadow: none !important;
  background: transparent !important;
  font-size: 18px;
  line-height: 2;
  font-family: 'Songti SC', 'Noto Serif SC', STSong, serif;
  color: var(--el-text-color-primary);
  padding: 20px 0;
  resize: none;
  height: 100%;
}
html.dark :deep(.immersive-textarea .el-textarea__inner) {
  color: #e0e0e0;
}
:deep(.immersive-textarea .el-textarea__inner:focus) {
  box-shadow: none !important;
}

.immersive-insight-panel {
  width: 320px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(0,0,0,0.05);
  box-shadow: -10px 0 20px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
}
html.dark .immersive-insight-panel {
  background: rgba(20, 20, 20, 0.4);
  border-left: 1px solid rgba(255,255,255,0.05);
}

:deep(.insight-tabs .el-tabs__header) {
  margin: 0;
  padding: 0 20px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
:deep(.insight-tabs .el-tabs__content) {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.context-cards-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.glass-card {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  padding: 15px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

html.dark .glass-card {
  background: rgba(40, 40, 40, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.glass-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.card-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}
</style>
