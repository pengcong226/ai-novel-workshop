<template>
  <el-dialog
    v-model="visible"
    fullscreen
    :show-close="false"
    class="immersive-editor-dialog"
    :close-on-click-modal="false"
  >
    <template #header="{ titleId, titleClass }">
      <div class="immersive-header">
        <div class="header-left">
          <el-button @click="visible = false" text circle class="back-btn"><el-icon><ArrowLeft /></el-icon></el-button>
          <span :id="titleId" :class="titleClass" class="header-chapter-num">{{ editingChapter ? `第${editingChapter.number}章` : '新建章节' }}</span>
        </div>
        <div class="header-center">
          <el-input v-model="chapterForm.title" placeholder="无尽航程的标题..." class="immersive-title-input" />
        </div>
        <div class="header-right">
          <span class="immersive-status" :style="{ color: saveStatusColor }">{{ saveStatusText }}</span>
          <el-button @click="saveCheckpoint" v-if="editingChapter" text>打点</el-button>
          <el-button @click="showVersionPanel = true" v-if="editingChapter" text>历史</el-button>
          <el-button type="primary" @click="saveChapter" :loading="saving" round>保存</el-button>
        </div>
      </div>
    </template>

    <div class="immersive-dual-pane">
      <div class="immersive-editor-area">
        <div class="immersive-toolbar">
          <el-button @click="generateContent" :loading="generating" type="primary" plain round size="small">
            <el-icon><MagicStick /></el-icon> AI连载
          </el-button>
          <el-checkbox v-model="autoUpdateSettings" size="small" style="margin: 0 10px;">后台静默提词</el-checkbox>
          <el-button @click="optimizeContent" text size="small">打磨文笔</el-button>
          <el-button @click="checkQuality" text size="small">防吃书预警</el-button>
          <el-button @click="runReviewAndShowPanel" :loading="reviewingChapter" text size="small">
            审校
            <el-badge :value="unresolvedReviewCount" :hidden="unresolvedReviewCount === 0" />
          </el-button>
          <el-button @click="showFindReplace = !showFindReplace" text size="small">
            <el-icon><Search /></el-icon> 查找替换
          </el-button>
          <span class="word-count">{{ editorWordCount }} 墨</span>
        </div>

        <div style="position: relative; flex: 1; display: flex; flex-direction: column;">
          <NovelEditor
            ref="novelEditorRef"
            v-model="chapterForm.content"
            placeholder="此刻，命运的齿轮开始转动..."
            :autofocus="true"
            :annotations="currentAnnotations"
            @word-count-change="editorWordCount = $event"
            @ai-action="handleParagraphAI"
          />

          <FindReplacePanel
            v-if="novelEditorInstance"
            v-model:visible="showFindReplace"
            :editor="novelEditorInstance"
            :show-replace="true"
          />
        </div>
      </div>

      <GlassContextPanel
        v-if="!showReviewPanel"
        v-model:activeTab="editActiveTab"
        v-model:chapterForm="chapterForm"
        :characters="activeContextCharacters"
        :worldbook="activeContextWorldbook"
      />

      <ReviewSidePanel
        v-else
        :visible="showReviewPanel"
        :project-id="props.projectId || project?.id"
        :chapter-id="chapterForm.id"
        :chapter-number="chapterForm.number"
        @navigate-to="navigateToReviewParagraph"
        @apply-fix="applyReviewFix"
        @dismiss="dismissReviewSuggestion"
      />
    </div>
  </el-dialog>

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

  <ChapterVersionPanel
    v-model="showVersionPanel"
    :chapter-id="editingChapter?.id || ''"
    @restore="handleVersionRestore"
  />

  <AIRewriteConfirm
    v-model:visible="showAIRewriteConfirm"
    :original-text="aiRewriteOriginal"
    :modified-text="aiRewriteModified"
    :action="aiRewriteAction"
    @accept="acceptAIRewrite"
    @regenerate="regenerateAIRewrite"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, MagicStick, Search } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Editor } from '@tiptap/vue-3'
import type { Chapter, Checkpoint } from '@/types'
import type { ChatMessage } from '@/types/ai'
import GlassContextPanel from './GlassContextPanel.vue'
import ChapterVersionPanel from './ChapterVersionPanel.vue'
import { AIRewriteConfirm, FindReplacePanel, NovelEditor, ReviewSidePanel } from './editor'
import type { AnnotationItem } from './editor'
import { useContextRadar } from '@/composables/useContextRadar'
import { useProjectStore } from '@/stores/project'
import { useSuggestionsStore } from '@/stores/suggestions'
import { executeParagraphAI, isParagraphAction } from '@/services/paragraph-ai'
import { generationScheduler } from '@/services/generation-scheduler'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { createSnapshot, pruneSnapshots } from '@/utils/chapterVersioning'
import { getLogger } from '@/utils/logger'
import { escapeXml } from '@/utils/escapeXml'
import { runReview } from '@/assistant/review/reviewRunner'
import { getErrorMessage } from '@/utils/getErrorMessage'

interface Props {
  modelValue: boolean
  chapter?: Chapter | null
  projectId?: string
  preserveProvidedContent?: boolean
}

interface QualityIssue {
  type: 'error' | 'warning' | 'info'
  message: string
}

interface QualityDimension {
  name: string
  score: number
  issues: QualityIssue[]
}

interface QualityReport {
  overallScore: number
  dimensions: QualityDimension[]
  improvements: string[]
}

interface NovelEditorExpose {
  getEditor: () => Editor | null
  scrollToParagraph: (paragraphIndex: number) => boolean
  applySuggestedFix: (payload: { originalSnippet: string; fixContent: string; paragraphIndex?: number }) => boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [chapter: Chapter]
}>()

const logger = getLogger('chapter-editor-dialog')
const projectStore = useProjectStore()
const suggestionsStore = useSuggestionsStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const editingChapter = ref<Chapter | null>(null)
const saving = ref(false)
const generating = ref(false)
const generationStatus = ref('')
const autoUpdateSettings = ref(true)
const editActiveTab = ref('basic')
const editorWordCount = ref(0)
const showFindReplace = ref(false)
const showReviewPanel = ref(false)
const reviewingChapter = ref(false)
const novelEditorRef = ref<NovelEditorExpose | null>(null)
const novelEditorInstance = computed(() => novelEditorRef.value?.getEditor() || null)
const showAIRewriteConfirm = ref(false)
const aiRewriteOriginal = ref('')
const aiRewriteModified = ref('')
const aiRewriteAction = ref('')
const aiRewriteSelectionRange = ref({ from: 0, to: 0, editorFrom: 0, editorTo: 0 })
const isParagraphAIProcessing = ref(false)
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const showVersionPanel = ref(false)
const showQualityDialog = ref(false)
const currentQualityReport = ref<QualityReport | null>(null)
const qualityReportTab = ref('dimensions')
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
let openSequence = 0
let isOpeningChapter = false

const chapterForm = ref<Chapter>(createEmptyChapter())
const chapterContentProxy = computed(() => chapterForm.value.content)
const { activeContextCharacters, activeContextWorldbook } = useContextRadar(project, chapterContentProxy, visible)

const currentReviewSuggestions = computed(() =>
  suggestionsStore.getSuggestionsByChapter(chapterForm.value.number, {
    projectId: project.value?.id,
    chapterId: chapterForm.value.id,
  }).filter(suggestion => suggestion.status !== 'adopted' && suggestion.status !== 'ignored')
)

const unresolvedReviewCount = computed(() => currentReviewSuggestions.value.length)

const currentAnnotations = computed<AnnotationItem[]>(() =>
  currentReviewSuggestions.value
    .filter(suggestion => suggestion.location.paragraphIndex !== undefined && suggestion.location.textSnippet)
    .map(suggestion => ({
      id: suggestion.id,
      paragraphIndex: suggestion.location.paragraphIndex!,
      textSnippet: suggestion.location.textSnippet!,
      severity: suggestion.priority,
      message: `${suggestion.title}: ${suggestion.message}`,
    }))
)

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

function createEmptyChapter(): Chapter {
  return {
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
}

function resetForm() {
  chapterForm.value = createEmptyChapter()
  editingChapter.value = null
  editActiveTab.value = 'basic'
  showReviewPanel.value = false
  saveStatus.value = 'idle'
}

async function openChapter(chapter: Chapter | null | undefined) {
  const sequence = ++openSequence
  clearAutoSaveTimer()
  showReviewPanel.value = false
  saveStatus.value = 'idle'
  isOpeningChapter = true

  if (!chapter) {
    resetForm()
    isOpeningChapter = false
    return
  }

  editingChapter.value = chapter
  const form = structuredClone(chapter)

  let aborted = false
  if (!props.preserveProvidedContent && chapter.id) {
    try {
      const fullChapter = await projectStore.loadChapter(chapter.id)
      aborted = sequence !== openSequence || !visible.value || props.chapter?.id !== chapter.id
      if (!aborted) {
        form.content = fullChapter?.content || form.content || ''
      }
    } catch (error) {
      aborted = sequence !== openSequence || !visible.value || props.chapter?.id !== chapter.id
      if (!aborted) {
        logger.error('加载章节正文失败', error)
        form.content = form.content || ''
      }
    }
  }

  if (aborted || sequence !== openSequence || !visible.value) {
    if (sequence === openSequence) isOpeningChapter = false
    return
  }
  chapterForm.value = form
  setTimeout(() => {
    if (sequence === openSequence) {
      isOpeningChapter = false
    }
  })
}

function clearAutoSaveTimer() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

async function persistChapterDraftSilently() {
  if (!project.value || !visible.value) {
    return
  }

  const draftData = structuredClone(chapterForm.value)
  draftData.id = draftData.id || uuidv4()
  draftData.wordCount = draftData.content.length
  chapterForm.value.id = draftData.id

  await projectStore.saveChapter(draftData)
}

function scheduleAutoSave() {
  if (!visible.value || saving.value || generating.value) {
    return
  }

  if (!project.value || (!chapterForm.value.title.trim() && !chapterForm.value.content.trim())) {
    return
  }

  clearAutoSaveTimer()
  saveStatus.value = 'saving'
  autoSaveTimer = setTimeout(async () => {
    try {
      await persistChapterDraftSilently()
      saveStatus.value = 'saved'
    } catch (error) {
      logger.error('自动保存失败', error)
      saveStatus.value = 'error'
    }
  }, 3000)
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (!visible.value) return

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void saveChapter()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    showFindReplace.value = true
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
    event.preventDefault()
    showFindReplace.value = true
  }
}

async function handleParagraphAI(payload: { command: string; selectedText: string; from: number; to: number; editorFrom: number; editorTo: number }) {
  const { command, selectedText, from, to, editorFrom, editorTo } = payload
  if (!selectedText.trim()) return

  aiRewriteOriginal.value = selectedText
  aiRewriteAction.value = command
  aiRewriteSelectionRange.value = { from, to, editorFrom, editorTo }

  const [action, styleTarget] = command.split(':') as [string, string | undefined]
  if (!isParagraphAction(action)) {
    ElMessage.warning('不支持的 AI 操作')
    return
  }

  try {
    isParagraphAIProcessing.value = true
    ElMessage.info('AI 正在处理...')
    const result = await executeParagraphAI({
      action,
      text: selectedText,
      styleTarget,
      context: {
        chapterTitle: chapterForm.value.title,
        chapterNumber: chapterForm.value.number,
        beforeText: chapterForm.value.content.slice(0, from).slice(-500),
        afterText: chapterForm.value.content.slice(to, to + 500),
      }
    })
    aiRewriteModified.value = result.result
    showAIRewriteConfirm.value = true
  } catch (error) {
    logger.error('AI 段落操作失败', error)
    ElMessage.error('AI 操作失败：' + getErrorMessage(error))
  } finally {
    isParagraphAIProcessing.value = false
  }
}

function editorTextToHTML(text: string): string {
  return escapeXml(text).replace(/\n/g, '<br>')
}

function acceptAIRewrite() {
  const editor = novelEditorInstance.value
  const { from, to, editorFrom, editorTo } = aiRewriteSelectionRange.value
  if (editor) {
    const currentText = editor.state.doc.textBetween(editorFrom, editorTo, '\n\n')
    if (currentText !== aiRewriteOriginal.value) {
      ElMessage.warning('原文已变化，请重新选择后再执行 AI 操作')
      showAIRewriteConfirm.value = false
      return
    }
    editor.chain().focus().insertContentAt({ from: editorFrom, to: editorTo }, editorTextToHTML(aiRewriteModified.value)).run()
  } else {
    const content = chapterForm.value.content
    if (content.slice(from, to) !== aiRewriteOriginal.value) {
      ElMessage.warning('原文已变化，请重新选择后再执行 AI 操作')
      showAIRewriteConfirm.value = false
      return
    }
    chapterForm.value.content = content.slice(0, from) + aiRewriteModified.value + content.slice(to)
  }
  showAIRewriteConfirm.value = false
  scheduleAutoSave()
}

async function regenerateAIRewrite() {
  showAIRewriteConfirm.value = false
  await handleParagraphAI({
    command: aiRewriteAction.value,
    selectedText: aiRewriteOriginal.value,
    from: aiRewriteSelectionRange.value.from,
    to: aiRewriteSelectionRange.value.to,
    editorFrom: aiRewriteSelectionRange.value.editorFrom,
    editorTo: aiRewriteSelectionRange.value.editorTo,
  })
}

async function saveChapter() {
  if (!chapterForm.value.title.trim()) {
    ElMessage.warning('请输入章节标题')
    return
  }

  clearAutoSaveTimer()
  saving.value = true
  saveStatus.value = 'saving'
  try {
    if (!project.value) return

    const chapterData = structuredClone(chapterForm.value)
    chapterData.wordCount = chapterData.content?.length || 0

    if (!editingChapter.value) {
      chapterData.id = chapterData.id || uuidv4()
    }

    await projectStore.saveChapter(chapterData)

    ElMessage.success('保存成功')
    saveStatus.value = 'saved'
    visible.value = false
    emit('saved', chapterData)

    createSnapshot(chapterData, project.value.id, 'auto').catch(error =>
      logger.warn('快照保存失败', error)
    )
    pruneSnapshots(chapterData.id, 20).catch(error =>
      logger.warn('快照清理失败', error)
    )

    resetForm()

    if (autoUpdateSettings.value) {
      generationScheduler.runExtractionInBackground(chapterData).catch(error =>
        logger.warn('后台设定提取失败', error)
      )
    }

    const chapterSaveEvent = new CustomEvent('chapter-save', {
      detail: { chapter: chapterData }
    })
    window.dispatchEvent(chapterSaveEvent)
  } catch (error) {
    saveStatus.value = 'error'
    ElMessage.error(`保存失败：${getErrorMessage(error)}`)
  } finally {
    saving.value = false
  }
}

function handleVersionRestore(content: string, title: string) {
  chapterForm.value.content = content
  chapterForm.value.title = title
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
    const { useSandboxStore } = await import('@/stores/sandbox')
    const sandboxStore = useSandboxStore()
    const loreEntities = Object.values(sandboxStore.activeEntitiesState).filter(entity => entity.type === 'LORE')
    const characterEntities = Object.values(sandboxStore.activeEntitiesState).filter(entity => entity.type === 'CHARACTER')
    const checker = createQualityChecker(
      loreEntities,
      characterEntities,
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
    logger.warn('自动质量检查失败', error)
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
      const currentProject = projectStore.currentProject

      if (!currentProject) {
        ElMessage.warning('请先打开或创建项目')
        return
      }

      generationStatus.value = '正在构建AI记忆与上下文...'
      const { buildChapterContext, contextToPromptPayload } = await import('@/utils/contextBuilder')

      logger.info('使用上下文构建器构建记忆')

      const normalizedProjectConfig = normalizeProjectConfig(currentProject.config)
      const vectorConfig = normalizedProjectConfig.enableVectorRetrieval
        ? normalizedProjectConfig.vectorConfig
        : undefined
      const contextWindow = normalizedProjectConfig.advancedSettings?.maxContextTokens ?? 128000
      const context = await buildChapterContext(currentProject, chapterForm.value, vectorConfig, contextWindow)

      logger.info('上下文构建完成', {
        totalTokens: context.totalTokens,
        warnings: context.warnings,
        authorsNoteLength: context.authorsNote.length,
        hasRecentChapters: !!context.recentChapters
      })

      generationStatus.value = '正在组合提示词...'
      const targetWords = currentProject.config?.advancedSettings?.targetWordCount || 2000
      const promptPayload = contextToPromptPayload(context, chapterForm.value.title || '未命名章节', targetWords)

      if (context.warnings.length > 0) {
        ElMessage.warning(`上下文提示: ${context.warnings[0]}`)
      }

      const messages: ChatMessage[] = [
        { role: 'system', content: promptPayload.systemMessage },
        { role: 'user', content: promptPayload.userMessage }
      ]
      const aiContext = { type: 'chapter' as const, complexity: 'high' as const, priority: 'quality' as const }

      logger.info('开始调用AI服务')
      generationStatus.value = `前文长度 ${context.totalTokens} Tokens。正在请求AI...`
      const generationOptions = buildGenerationOptions(currentProject.config?.advancedSettings)

      chapterForm.value.content = ''

      let response
      try {
        response = await aiStore.chatStream(
          messages,
          (event) => {
            if (event.type === 'chunk' && event.chunk) {
              chapterForm.value.content += event.chunk
              generationStatus.value = `正在生成中... (${chapterForm.value.content.length}字)`
            }
          },
          aiContext,
          generationOptions
        )
      } catch (streamError) {
        logger.warn('流式生成失败，回退普通模式', streamError)
        generationStatus.value = '流式中断，正在切换普通模式重试...'
        response = await aiStore.chat(messages, aiContext, generationOptions)
      }

      logger.info('AI响应完成', { length: response.content.length })

      generationStatus.value = '正在解析返回数据...'
      chapterForm.value.content = response.content.trim()
      chapterForm.value.generatedBy = 'ai'

      const { usePluginStore } = await import('@/stores/plugin')
      const pluginStore = usePluginStore()
      const processorRegistry = pluginStore.getRegistries().processor
      generationStatus.value = '执行生成后处理...'
      try {
        const postResult = await processorRegistry.processPipeline(
          'post-generation',
          { chapter: chapterForm.value, project: currentProject },
          { project: currentProject, chapter: chapterForm.value, config: currentProject.config }
        )
        if (postResult && typeof postResult === 'object' && 'chapter' in postResult) {
          const processedChapter = postResult.chapter as Partial<Chapter>
          if (processedChapter.content) {
            chapterForm.value.content = processedChapter.content
          }
        }
      } catch (error) {
        logger.error('执行 post-generation 管道失败', error)
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
    logger.error('章节生成失败', error)
    ElMessage.error('生成失败：' + getErrorMessage(error))
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

async function runReviewAndShowPanel() {
  if (!project.value) {
    ElMessage.warning('项目未加载')
    return
  }
  if (!chapterForm.value.content.trim()) {
    ElMessage.warning('请先填写章节内容')
    return
  }

  try {
    reviewingChapter.value = true
    showReviewPanel.value = true
    const result = await runReview({
      profile: 'consistency',
      project: project.value,
      chapter: {
        id: chapterForm.value.id,
        number: chapterForm.value.number,
        title: chapterForm.value.title,
        content: chapterForm.value.content,
      },
    })

    if (result.suggestionsAdded > 0) {
      ElMessage.success(`审校完成，生成 ${result.suggestionsAdded} 条建议`)
    } else {
      ElMessage.success('审校完成，未发现明显问题')
    }
  } catch (error) {
    logger.error('审校失败', error)
    ElMessage.error('审校失败：' + getErrorMessage(error))
  } finally {
    reviewingChapter.value = false
  }
}

function navigateToReviewParagraph(paragraphIndex: number) {
  if (!novelEditorRef.value?.scrollToParagraph(paragraphIndex)) {
    ElMessage.warning('无法定位到对应段落')
  }
}

function applyReviewFix(payload: { suggestionId: string; paragraphIndex?: number; originalSnippet: string; fixContent: string }) {
  const applied = novelEditorRef.value?.applySuggestedFix({
    paragraphIndex: payload.paragraphIndex,
    originalSnippet: payload.originalSnippet,
    fixContent: payload.fixContent,
  })

  if (!applied) {
    ElMessage.warning('无法定位到原文片段，可能内容已被修改')
    return
  }

  suggestionsStore.markAsAdopted(payload.suggestionId)
  scheduleAutoSave()
  ElMessage.success('修复已采纳')
}

function dismissReviewSuggestion(suggestionId: string) {
  suggestionsStore.markAsIgnored(suggestionId)
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

    const { createQualityChecker } = await import('@/utils/qualityChecker')
    const { useSandboxStore } = await import('@/stores/sandbox')
    const sandboxStore = useSandboxStore()
    const resolved = Object.values(sandboxStore.activeEntitiesState)
    const loreEntities = resolved.filter(entity => entity.type === 'LORE')
    const characterEntities = resolved.filter(entity => entity.type === 'CHARACTER')

    const checker = createQualityChecker(
      loreEntities,
      characterEntities,
      project.value.outline,
      project.value.config
    )

    const tempChapter = {
      ...chapterForm.value,
      number: chapterForm.value.number || chapters.value.length + 1
    } as Chapter

    const report = await checker.checkChapter(tempChapter)

    const { ConflictDetector } = await import('@/utils/conflictDetector')
    const detector = new ConflictDetector({
      entities: resolved,
      chapters: chapters.value,
      outline: project.value.outline
    })
    const conflictResult = await detector.detect()

    const relevantConflicts = conflictResult.conflicts.filter(conflict =>
      !conflict.relatedChapters || conflict.relatedChapters.includes(chapterForm.value.number)
    )

    const conflictPenalty = relevantConflicts.reduce((sum, conflict) => {
      return sum + (conflict.severity === 'critical' ? 1.0 : conflict.severity === 'warning' ? 0.5 : 0.2)
    }, 0)
    const finalScore = Math.max(0, Math.min(10, report.overallScore - conflictPenalty))
    chapterForm.value.qualityScore = finalScore

    const allSuggestions = [
      ...report.improvements,
      ...relevantConflicts.map(conflict => `[冲突] ${conflict.title}: ${conflict.suggestions.map(suggestion => suggestion.description).join('; ')}`)
    ]

    chapterForm.value.aiSuggestions = [...new Set(allSuggestions)]

    const issuesCount = report.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
    const conflictsCount = relevantConflicts.length

    ElMessage.success(
      `质量检查完成！评分：${finalScore.toFixed(1)}/10，发现 ${issuesCount} 个质量问题，${conflictsCount} 个冲突`
    )

    showQualityReportDialog(report)
  } catch (error) {
    logger.error('质量检查失败', error)
    ElMessage.error('质量检查失败：' + getErrorMessage(error))
  }
}

function showQualityReportDialog(report: QualityReport) {
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
  scheduleAutoSave()
  ElMessage.success('检查点已保存')
}

function getTotalIssues(report: QualityReport) {
  return report.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
}

function getScoreColor(score: number) {
  if (score >= 8) return '#67c23a'
  if (score >= 6) return '#e6a23c'
  return '#f56c6c'
}

watch(
  () => props.modelValue,
  (isVisible) => {
    if (isVisible) {
      void openChapter(props.chapter)
    } else {
      clearAutoSaveTimer()
    }
  },
  { immediate: true }
)

watch(
  () => props.chapter,
  (chapter) => {
    if (visible.value) {
      void openChapter(chapter)
    }
  }
)

watch(
  () => [visible.value, chapterForm.value.title, chapterForm.value.content, chapterForm.value.number],
  ([isVisible]) => {
    if (!isVisible) {
      clearAutoSaveTimer()
      return
    }

    if (isOpeningChapter) {
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
  window.removeEventListener('keydown', handleEditorKeydown)
  clearAutoSaveTimer()
})
</script>

<style scoped>
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
</style>
