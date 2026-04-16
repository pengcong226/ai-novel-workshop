<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="导入小说"
    width="800px"
    :close-on-click-modal="false"
  >
    <el-steps :active="currentStep" finish-status="success" align-center>
      <el-step title="上传文件" />
      <el-step title="配置选项" />
      <el-step title="处理中" />
      <el-step title="预览确认" />
    </el-steps>

    <div class="step-content">
      <!-- 步骤1: 上传文件 -->
      <div v-show="currentStep === 0" class="upload-section">
        <el-upload
          ref="uploadRef"
          drag
          :auto-upload="false"
          :limit="1"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
          accept=".txt,.md"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将文件拖到此处，或<em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 TXT 和 Markdown 格式，文件大小不超过 10MB
            </div>
          </template>
        </el-upload>

        <el-form v-if="selectedFile" :model="importForm" label-width="100px" style="margin-top: 20px">
          <el-form-item label="小说标题">
            <el-input v-model="importForm.title" placeholder="请输入小说标题" />
          </el-form-item>
          <el-form-item label="作者">
            <el-input v-model="importForm.author" placeholder="请输入作者名称" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤2: 配置选项 -->
      <div v-show="currentStep === 1" class="options-section">
        <el-form :model="importOptions" label-width="150px">
          <el-form-item label="自动检测章节">
            <el-switch v-model="importOptions.detectChapters" />
            <span class="option-hint">自动识别章节标题和结构</span>
          </el-form-item>

          <el-form-item label="提取人物">
            <el-switch v-model="importOptions.extractCharacters" />
            <span class="option-hint">从文本中提取人物信息</span>
          </el-form-item>

          <el-form-item label="分析人物关系">
            <el-switch v-model="importOptions.extractRelations" :disabled="!importOptions.extractCharacters" />
            <span class="option-hint">分析人物之间的关系</span>
          </el-form-item>

          <el-form-item label="提取世界设定">
            <el-switch v-model="importOptions.extractWorld" />
            <span class="option-hint">提取时代、地点、势力、力量体系</span>
          </el-form-item>

          <el-form-item label="生成结构化大纲">
            <el-switch v-model="importOptions.generateOutlineFromChapters" />
            <span class="option-hint">自动生成章节大纲和卷划分</span>
          </el-form-item>

          <el-form-item label="分析小说质量">
            <el-switch v-model="importOptions.analyzeQualityMetrics" />
            <span class="option-hint">评估情节、人物、节奏等维度</span>
          </el-form-item>

          <el-divider content-position="left">AI增强分析</el-divider>

          <el-alert
            title="AI分析模式"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 15px;"
          >
            <template #default>
              <p style="margin: 0; font-size: 13px;">
                使用AI模型进行智能分析，识别准确率更高。
                <br>
                请在 <strong>项目设置 → AI模型选择 → 导入识别模型</strong> 中配置模型
              </p>
            </template>
          </el-alert>

          <el-form-item label="启用AI分析">
            <el-switch v-model="importOptions.useAIAnalysis" />
          </el-form-item>

          <template v-if="importOptions.useAIAnalysis">
            <el-form-item v-if="!hasImportModel">
              <el-alert type="warning" :closable="false" show-icon>
                <template #title>
                  未配置导入识别模型
                </template>
                <div style="font-size: 13px;">
                  <p style="margin: 0 0 8px 0;">
                    请前往 <strong>项目设置</strong> 配置导入识别模型，或使用临时配置：
                  </p>
                  <el-button size="small" @click="showTempConfig = !showTempConfig">
                    {{ showTempConfig ? '隐藏' : '显示' }}临时配置
                  </el-button>
                </div>
              </el-alert>
            </el-form-item>

            <!-- 已配置模型时也显示切换选项 -->
            <el-form-item v-if="hasImportModel">
              <el-alert type="success" :closable="false" show-icon>
                <template #title>
                  已配置AI模型
                </template>
                <div style="font-size: 13px;">
                  <p style="margin: 0 0 8px 0;">
                    当前使用全局配置的模型。如需使用其他模型，可切换到临时配置：
                  </p>
                  <el-switch
                    v-model="useTempConfig"
                    active-text="使用临时配置"
                    inactive-text="使用全局配置"
                  />
                </div>
              </el-alert>
            </el-form-item>

            <!-- 临时LLM配置 -->
            <template v-if="(!hasImportModel && showTempConfig) || (hasImportModel && useTempConfig)">
              <el-divider content-position="left">临时LLM配置</el-divider>

              <el-form-item label="Provider">
                <el-select v-model="tempLLMConfig.provider" placeholder="选择Provider">
                  <el-option label="Anthropic (Claude)" value="anthropic" />
                  <el-option label="OpenAI (GPT)" value="openai" />
                  <el-option label="Custom (兼容API)" value="custom" />
                </el-select>
              </el-form-item>

              <el-form-item label="API Key">
                <el-input
                  v-model="tempLLMConfig.apiKey"
                  type="password"
                  placeholder="输入API密钥"
                  show-password
                />
              </el-form-item>

              <el-form-item label="模型名称">
                <el-input
                  v-model="tempLLMConfig.model"
                  placeholder="例如：claude-3-5-sonnet-20241022"
                />
                <div class="option-hint">
                  Claude推荐: claude-3-5-sonnet-20241022<br>
                  GPT推荐: gpt-4-turbo
                </div>
              </el-form-item>

              <el-form-item v-if="tempLLMConfig.provider === 'custom'" label="Base URL">
                <el-input
                  v-model="tempLLMConfig.baseURL"
                  placeholder="例如：https://api.example.com/v1"
                />
              </el-form-item>

              <el-form-item>
                <el-button type="primary" size="small" @click="saveTempConfig">
                  保存配置
                </el-button>
                <el-button size="small" @click="loadTempConfig">
                  加载配置
                </el-button>
                <el-button type="danger" size="small" @click="clearTempConfig">
                  清除配置
                </el-button>
              </el-form-item>
            </template>

            <el-form-item label="分析模式" v-if="hasImportModel || (showTempConfig && tempLLMConfig.apiKey && tempLLMConfig.model)">
              <el-radio-group v-model="llmAnalysisMode">
                <el-radio value="quick">
                  <span>快速模式</span>
                  <span style="font-size: 12px; color: #909399; margin-left: 8px;">
                    (~$0.19, 2-3分钟)
                  </span>
                </el-radio>
                <el-radio value="full">
                  <span>完整模式</span>
                  <span style="font-size: 12px; color: #909399; margin-left: 8px;">
                    (~$0.75, 5-10分钟)
                  </span>
                </el-radio>
              </el-radio-group>
              <div class="option-hint">
                快速模式：分析前20%章节，成本更低<br>
                完整模式：分析所有章节，结果更准确
              </div>
            </el-form-item>
          </template>

          <el-divider content-position="left">高级选项</el-divider>

          <el-form-item label="章节模式">
            <el-select v-model="selectedPatternName" placeholder="自动检测" clearable>
              <el-option label="自动检测" value="" />
              <el-option label="第X章" value="第X章" />
              <el-option label="第X章(无空格)" value="第X章(无空格)" />
              <el-option label="Chapter X" value="Chapter X" />
              <el-option label="数字编号" value="数字编号" />
              <el-option label="卷章节" value="卷章节" />
              <el-option label="【章节】" value="【章节】" />
            </el-select>
            <span class="option-hint">指定章节标题的格式，如果自动识别不准确请手动选择</span>
          </el-form-item>

          <el-form-item label="自定义模式">
            <el-input
              v-model="customPattern"
              placeholder="例如：第.*章.*（正则表达式）"
              clearable
            />
            <span class="option-hint">使用正则表达式自定义章节标题匹配规则</span>
          </el-form-item>

          <el-form-item label="最小出现次数">
            <el-input-number
              v-model="minOccurrence"
              :min="2"
              :max="20"
              :disabled="!customPattern"
            />
            <span class="option-hint">人物名称最少出现次数（过滤误识别）</span>
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤3: 处理中 -->
      <div v-show="currentStep === 2" class="processing-section">
        <!-- LLM分析进度 -->
        <AnalysisProgressComponent
          v-if="importOptions.useAIAnalysis && hasImportModel"
          :progress="llmAnalysisProgress || undefined"
          :status="llmAnalysisStatus"
          :token-usage="llmTokenUsage"
          :estimated-cost="llmEstimatedCost"
          @cancel="handleCancelLLMAnalysis"
        />

        <!-- 传统导入进度 -->
        <template v-else>
          <el-progress
            :percentage="progress.percentage"
            :status="progress.status"
            :stroke-width="20"
          />
          <div class="progress-message">{{ progress.message }}</div>
        </template>

        <el-card v-if="previewData" class="stats-card" shadow="never">
          <template #header>
            <span>处理结果统计</span>
          </template>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-statistic title="总字数" :value="previewData.stats?.totalWords || 0" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="章节数" :value="previewData.stats?.totalChapters || 0" />
            </el-col>
            <el-col :span="8">
              <el-statistic title="人物数" :value="previewData.characters?.length || 0" />
            </el-col>
          </el-row>
        </el-card>
      </div>

      <!-- 步骤4: 预览确认 -->
      <div v-show="currentStep === 3" class="preview-section">
        <!-- LLM分析结果的专用预览 -->
        <template v-if="importOptions.useAIAnalysis && llmResult">
          <el-tabs v-model="previewTab">
            <el-tab-pane label="章节列表" name="chapters">
              <ChapterPreviewComponent
                v-model="llmResult.chapters"
                @confirm="handleConfirmChapters"
                @regenerate="handleRegenerateChapters"
              />
            </el-tab-pane>

            <el-tab-pane label="人物列表" name="characters">
              <CharacterPreviewComponent
                v-model="llmResult.characters"
                :relationships="llmResult.relationships"
                @confirm="handleConfirmCharacters"
              />
            </el-tab-pane>

            <el-tab-pane label="基本信息" name="info">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="小说标题">
                  {{ importForm.title }}
                </el-descriptions-item>
                <el-descriptions-item label="作者">
                  {{ importForm.author }}
                </el-descriptions-item>
                <el-descriptions-item label="总字数">
                  {{ llmResult.stats.totalWords }}
                </el-descriptions-item>
                <el-descriptions-item label="章节数">
                  {{ llmResult.stats.totalChapters }}
                </el-descriptions-item>
                <el-descriptions-item label="人物数">
                  {{ llmResult.characters.length }}
                </el-descriptions-item>
                <el-descriptions-item label="平均章节字数">
                  {{ llmResult.stats.avgWordsPerChapter }}
                </el-descriptions-item>
                <el-descriptions-item label="分析模式">
                  <el-tag>{{ llmResult.mode === 'quick' ? '快速模式' : '完整模式' }}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="Token消耗">
                  {{ llmResult.stats.tokenUsage.input + llmResult.stats.tokenUsage.output }} tokens
                </el-descriptions-item>
              </el-descriptions>

              <!-- 世界观设定 -->
              <el-card v-if="llmResult.worldSetting" style="margin-top: 20px;" shadow="never">
                <template #header>
                  <span>世界观设定</span>
                </template>
                <el-descriptions :column="1" border>
                  <el-descriptions-item label="世界类型">
                    {{ llmResult.worldSetting.worldType }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="llmResult.worldSetting.era" label="时代背景">
                    {{ llmResult.worldSetting.era }}
                  </el-descriptions-item>
                  <el-descriptions-item v-if="llmResult.worldSetting.keyLocations?.length" label="主要地点">
                    <el-tag v-for="loc in llmResult.worldSetting.keyLocations" :key="loc" style="margin-right: 5px;">
                      {{ loc }}
                    </el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </el-card>
            </el-tab-pane>

            <el-tab-pane label="大纲" name="outline">
              <el-card v-if="llmResult.outline" shadow="never">
                <h3 style="margin-top: 0;">主线剧情</h3>
                <p>{{ llmResult.outline.mainPlot }}</p>

                <el-divider v-if="llmResult.outline.subPlots?.length" />

                <h3>支线剧情</h3>
                <el-collapse>
                  <el-collapse-item
                    v-for="(subplot, index) in llmResult.outline.subPlots"
                    :key="index"
                    :title="subplot.name"
                  >
                    <p>{{ subplot.description }}</p>
                    <p><strong>相关章节：</strong>{{ subplot.relatedChapters }}</p>
                  </el-collapse-item>
                </el-collapse>

                <el-divider v-if="llmResult.outline.keyEvents?.length" />

                <h3>关键事件</h3>
                <el-timeline>
                  <el-timeline-item
                    v-for="event in llmResult.outline.keyEvents"
                    :key="event.chapter"
                    :timestamp="`第${event.chapter}章`"
                  >
                    {{ event.event }}
                  </el-timeline-item>
                </el-timeline>
              </el-card>
            </el-tab-pane>
          </el-tabs>
        </template>

        <!-- 传统导入预览 -->
        <template v-else>
          <el-tabs v-model="previewTab">
            <el-tab-pane label="基本信息" name="info">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="小说标题">
                  {{ previewData?.title }}
                </el-descriptions-item>
                <el-descriptions-item label="作者">
                  {{ previewData?.author }}
                </el-descriptions-item>
                <el-descriptions-item label="总字数">
                  {{ previewData?.stats?.totalWords }}
                </el-descriptions-item>
                <el-descriptions-item label="章节数">
                  {{ previewData?.stats?.totalChapters }}
                </el-descriptions-item>
                <el-descriptions-item label="人物数">
                  {{ previewData?.characters?.length }}
                </el-descriptions-item>
                <el-descriptions-item label="平均章节字数">
                  {{ previewData?.stats?.avgWordsPerChapter }}
                </el-descriptions-item>
              </el-descriptions>
            </el-tab-pane>

          <el-tab-pane label="章节列表" name="chapters">
            <el-table :data="previewData?.chapters?.slice(0, 10)" max-height="400">
              <el-table-column prop="number" label="章节" width="80" />
              <el-table-column prop="title" label="标题" min-width="200" />
              <el-table-column prop="wordCount" label="字数" width="100" />
            </el-table>
            <div v-if="previewData?.chapters && previewData.chapters.length > 10" class="more-hint">
              仅显示前10章，共 {{ previewData.chapters?.length }} 章
            </div>
          </el-tab-pane>

          <el-tab-pane label="人物列表" name="characters">
            <el-table :data="previewData?.characters?.slice(0, 20)" max-height="400">
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column label="角色" width="100">
                <template #default="{ row }">
                  <el-tag :type="getRoleType(row.tags?.[0])" size="small">
                    {{ getRoleName(row.tags?.[0]) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
            </el-table>
            <div v-if="previewData?.characters && previewData.characters.length > 20" class="more-hint">
              仅显示前20位人物，共 {{ previewData.characters?.length }} 位
            </div>
          </el-tab-pane>

          <el-tab-pane label="章节结构" name="structure">
            <div v-if="detectedPattern" class="pattern-info">
              <el-alert
                :title="`检测到章节模式: ${detectedPattern}`"
                type="success"
                :closable="false"
                show-icon
              />
            </div>
            <el-timeline>
              <el-timeline-item
                v-for="volume in previewData?.outline?.volumes"
                :key="volume.number"
                :timestamp="`第${volume.startChapter}-${volume.endChapter}章`"
                placement="top"
              >
                <el-card>
                  <h4>{{ volume.title }}</h4>
                  <p v-if="volume.theme">主题: {{ volume.theme }}</p>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>
        </el-tabs>
      </template>
    </div>
    </div>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
      <el-button
        v-if="currentStep < 3"
        type="primary"
        :disabled="!canNext"
        @click="nextStep"
      >
        下一步
      </el-button>
      <el-button
        v-if="currentStep === 3"
        type="primary"
        :loading="importing"
        @click="handleImport"
      >
        确认导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import {
  importNovel,
  type ImportOptions,
  type ImportProgress
} from '@/utils/novelImporter'
import { detectChapterPattern } from '@/utils/chapterParser'
import type { Project, CharacterTag } from '@/types'
import { useProjectStore } from '@/stores/project'
import {
  analyzeNovelWithLLM,
  type LLMProviderConfig,
  type AnalysisMode,
  type LLMAnalysisResult,
  type AnalysisProgress,
  DEFAULT_QUICK_MODE_SAMPLING
} from '@/utils/llm'
import { v4 as uuidv4 } from 'uuid'
import { encryptApiKey, decryptApiKey } from '@/utils/crypto'
import { getLogger } from '@/utils/logger'
import type { AIAnalysisConfig } from '@/utils/aiAnalyzer'
import AnalysisProgressComponent from './novel-import/AnalysisProgress.vue'
import ChapterPreviewComponent from './novel-import/ChapterPreview.vue'
import CharacterPreviewComponent from './novel-import/CharacterPreview.vue'

const logger = getLogger('novel-import')

interface Props {
  modelValue: boolean
}

const _props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'imported', project: unknown): void
}>()

const currentStep = ref(0)
const selectedFile = ref<File | null>(null)
const importing = ref(false)
const previewTab = ref('info')
const detectedPattern = ref<string>('')

interface ImportResultData {
  project: Partial<Project> & { stats?: ImportStatsData; author?: string; worldSetting?: unknown }
  stats?: ImportStatsData
  qualityMetrics?: QualityMetricsData
  [key: string]: unknown
}

interface QualityMetricsData {
  overallScore: number
  dimensions: Record<string, number>
  [key: string]: unknown
}

interface ImportStatsData {
  totalWords: number
  totalChapters: number
  avgWordsPerChapter: number
  tokenUsage?: { input: number; output: number }
  [key: string]: unknown
}

interface PreviewData extends Partial<Project> {
  stats?: ImportStatsData
  author?: string
  worldSetting?: unknown
}

const uploadRef = ref()
const importResult = ref<any>(null)
const qualityMetrics = ref<QualityMetricsData | null>(null)

const importForm = ref({
  title: '',
  author: ''
})

const importOptions = ref<ImportOptions>({
  title: '',
  author: '',
  detectChapters: true,
  extractCharacters: true,
  extractRelations: true,
  extractWorld: true,
  generateOutlineFromChapters: true,
  analyzeQualityMetrics: true,
  useAIAnalysis: true,
  minCharacterOccurrence: 3
})

const selectedPatternName = ref('')
const customPattern = ref('')
const minOccurrence = ref(3)
const hasImportModel = ref(false)

// LLM分析相关状态
const llmAnalysisMode = ref<AnalysisMode>('quick')
const llmAnalysisStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
const llmAnalysisProgress = ref<AnalysisProgress | null>(null)
const llmTokenUsage = ref({ input: 0, output: 0 })
const llmEstimatedCost = ref(0)
const llmResult = ref<LLMAnalysisResult | null>(null)

// 临时LLM配置（当没有项目配置时使用）
const tempLLMConfig = ref({
  provider: 'anthropic' as 'anthropic' | 'openai' | 'custom',
  apiKey: '',
  baseURL: '',
  model: ''
})
const showTempConfig = ref(false)
const useTempConfig = ref(false)

const projectStore = useProjectStore()

const progress = ref({
  percentage: 0,
  status: '' as '' | 'success' | 'exception' | 'warning',
  message: '准备处理...'
})

const previewData = ref<PreviewData | null>(null)

// 是否可以进入下一步
const canNext = computed(() => {
  if (currentStep.value === 0) {
    return selectedFile.value && importForm.value.title
  }
  return true
})

// 监听文件变化，自动填充标题
watch(selectedFile, (file) => {
  if (file) {
    const fileName = file.name.replace(/\.[^/.]+$/, '')
    if (!importForm.value.title) {
      importForm.value.title = fileName
    }
  }
})



// 组件挂载时检查AI配置
onMounted(async () => {
  // 确保全局配置已加载
  if (!projectStore.globalConfig) {
    await projectStore.loadGlobalConfig()
  }
  checkImportModel()
  // 自动加载保存的临时配置
  loadTempConfig()
})

// 保存临时配置到localStorage
function saveTempConfig() {
  try {
    const encryptedConfig = {
      ...tempLLMConfig.value,
      apiKey: encryptApiKey(tempLLMConfig.value.apiKey)
    }
    localStorage.setItem('ai-novel-temp-llm-config', JSON.stringify(encryptedConfig))
    ElMessage.success('临时配置已保存')
  } catch (error) {
    ElMessage.error('保存配置失败')
    logger.error('保存临时配置失败:', error)
  }
}

// 从localStorage加载临时配置
function loadTempConfig() {
  try {
    const saved = localStorage.getItem('ai-novel-temp-llm-config')
    if (saved) {
      const config = JSON.parse(saved)
      tempLLMConfig.value = {
        provider: config.provider || 'anthropic',
        apiKey: decryptApiKey(config.apiKey) || '',
        baseURL: config.baseURL || '',
        model: config.model || ''
      }
      logger.info('已加载保存的临时配置')
    } else {
      ElMessage.info('没有保存的临时配置')
    }
  } catch (error) {
    ElMessage.error('加载配置失败')
    logger.error('加载临时配置失败:', error)
  }
}

// 清除保存的临时配置
function clearTempConfig() {
  try {
    localStorage.removeItem('ai-novel-temp-llm-config')
    tempLLMConfig.value = {
      provider: 'anthropic',
      apiKey: '',
      baseURL: '',
      model: ''
    }
    ElMessage.success('已清除临时配置')
  } catch (error) {
    ElMessage.error('清除配置失败')
    logger.error('清除临时配置失败:', error)
  }
}

// 检查导入识别模型配置
function checkImportModel() {
  try {
    logger.info('开始检查AI配置...')

    // 如果启用了临时配置，检查临时配置
    if (useTempConfig.value && tempLLMConfig.value.apiKey && tempLLMConfig.value.model) {
      hasImportModel.value = true
      logger.info('✓ 使用临时LLM配置')
      return
    }

    // 1. 优先检查当前项目配置
    const project = projectStore.currentProject
    logger.info(`当前项目: ${project?.title || 'null'}`)
    logger.info(`项目配置: ${project?.config ? '存在' : 'null'}`)
    logger.info(`导入模型ID: ${project?.config?.extractorModel || 'null'}`)

    if (project?.config?.extractorModel) {
      const config = project.config
      const modelId = config.extractorModel

      for (const provider of config.providers || []) {
        if (!provider.isEnabled) continue

        const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.id === modelId && m.isEnabled)
        if (model) {
          hasImportModel.value = true
          logger.info(`✓ 已配置项目AI模型: ${provider.name} - ${model.name}`)
          return
        }
      }
    }

    // 2. 检查全局配置
    const globalConfig = projectStore.globalConfig
    logger.info(`全局配置: ${globalConfig ? '存在' : 'null'}`)
    logger.info(`全局导入模型ID: ${globalConfig?.extractorModel || 'null'}`)
    logger.info(`全局providers数量: ${globalConfig?.providers?.length || 0}`)

    if (globalConfig) {
      // 如果有指定的导入模型，使用指定的
      if (globalConfig.extractorModel) {
        const modelId = globalConfig.extractorModel
        logger.info(`查找全局配置模型ID: ${modelId}`)

        for (const provider of globalConfig.providers || []) {
          logger.info(`检查provider: ${provider.name}, enabled: ${provider.isEnabled}`)
          if (!provider.isEnabled) continue

          const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.id === modelId && m.isEnabled)
          if (model) {
            hasImportModel.value = true
            logger.info(`✓ 已配置全局AI模型: ${provider.name} - ${model.name}`)
            return
          }
        }
      }

      // 如果没有指定导入模型，尝试使用第一个可用的模型
      logger.info('未指定导入模型，尝试使用第一个可用模型...')
      for (const provider of globalConfig.providers || []) {
        if (!provider.isEnabled) continue

        const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.isEnabled)
        if (model) {
          hasImportModel.value = true
          logger.info(`✓ 自动选择全局AI模型: ${provider.name} - ${model.name}`)
          return
        }
      }
    }

    // 3. 检查临时配置
    if (tempLLMConfig.value.apiKey && tempLLMConfig.value.model) {
      hasImportModel.value = true
      logger.info('✓ 使用临时LLM配置')
      return
    }

    hasImportModel.value = false
    logger.info('✗ 未配置AI模型')
  } catch (error) {
    logger.error('检查AI配置失败:', error)
    hasImportModel.value = false
  }
}

// 获取项目配置的AI模型或临时配置
function getProjectAIConfig(): import('@/utils/aiAnalyzer').AIAnalysisConfig | null {
  try {
    // 0. 优先使用临时配置（如果启用）
    if (useTempConfig.value && tempLLMConfig.value.apiKey && tempLLMConfig.value.model) {
      logger.info('使用临时LLM配置')
      return {
        enabled: true,
        provider: tempLLMConfig.value.provider === 'anthropic' ? 'claude' : tempLLMConfig.value.provider,
        apiKey: tempLLMConfig.value.apiKey,
        baseURL: tempLLMConfig.value.baseURL,
        model: tempLLMConfig.value.model
      }
    }

    // 1. 优先使用当前项目配置
    const project = projectStore.currentProject
    if (project?.config?.extractorModel) {
      const config = project.config
      const modelId = config.extractorModel
      logger.info(`查找项目模型ID: ${modelId}`)

      for (const provider of config.providers || []) {
        if (!provider.isEnabled) continue

        const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.id === modelId && m.isEnabled)
        if (model) {
          logger.info(`找到项目模型: ${provider.name} - ${model.name}`)
          return {
            enabled: true,
            provider: provider.type === 'anthropic' ? 'claude' :
                      provider.type === 'openai' ? 'openai' : 'custom',
            apiKey: provider.apiKey,
            baseURL: provider.baseUrl,
            model: model.name
          }
        }
      }
    }

    // 2. 使用全局配置
    const globalConfig = projectStore.globalConfig
    if (globalConfig) {
      // 如果有指定的导入模型，使用指定的
      if (globalConfig.extractorModel) {
        const modelId = globalConfig.extractorModel
        logger.info(`查找全局配置模型ID: ${modelId}`)

        for (const provider of globalConfig.providers || []) {
          if (!provider.isEnabled) continue

          const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.id === modelId && m.isEnabled)
          if (model) {
            logger.info(`找到全局配置模型: ${provider.name} - ${model.name}`)
            return {
              enabled: true,
              provider: provider.type === 'anthropic' ? 'claude' :
                        provider.type === 'openai' ? 'openai' : 'custom',
              apiKey: provider.apiKey,
              baseURL: provider.baseUrl,
              model: model.name
            }
          }
        }
      }

      // 如果没有指定导入模型，尝试使用第一个可用的模型
      logger.info('尝试自动选择第一个可用模型...')
      for (const provider of globalConfig.providers || []) {
        if (!provider.isEnabled) continue

        const model = provider.models?.find((m: { id?: string, isEnabled?: boolean, name?: string }) => m.isEnabled)
        if (model) {
          logger.info(`自动选择全局AI模型: ${provider.name} - ${model.name}`)
          return {
            enabled: true,
            provider: provider.type === 'anthropic' ? 'claude' :
                      provider.type === 'openai' ? 'openai' : 'custom',
            apiKey: provider.apiKey,
            baseURL: provider.baseUrl,
            model: model.name
          }
        }
      }
    }

    // 3. 使用临时配置
    if (tempLLMConfig.value.apiKey && tempLLMConfig.value.model) {
      logger.info('使用临时LLM配置')
      return {
        enabled: true,
        provider: tempLLMConfig.value.provider === 'anthropic' ? 'claude' : tempLLMConfig.value.provider,
        apiKey: tempLLMConfig.value.apiKey,
        baseURL: tempLLMConfig.value.baseURL,
        model: tempLLMConfig.value.model
      }
    }

    logger.warn('未配置AI模型')
    return null
  } catch (error) {
    logger.error('获取AI配置失败:', error)
    return null
  }
}

// 文件选择处理
function handleFileChange(file: UploadFile) {
  if (file.raw) {
    // 检查文件大小
    if (file.raw.size > 10 * 1024 * 1024) {
      ElMessage.error('文件大小不能超过 10MB')
      uploadRef.value?.clearFiles()
      return
    }

    // 检查文件格式
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'md'].includes(ext || '')) {
      ElMessage.error('只支持 TXT 和 Markdown 格式')
      uploadRef.value?.clearFiles()
      return
    }

    selectedFile.value = file.raw
  }
}

function handleFileRemove() {
  selectedFile.value = null
}

// 上一步
function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

// 下一步
async function nextStep() {
  if (currentStep.value === 0) {
    // 进入配置选项
    importOptions.value.title = importForm.value.title
    importOptions.value.author = importForm.value.author
    currentStep.value = 1
  } else if (currentStep.value === 1) {
    // 开始处理
    currentStep.value = 2
    await processImport()
  } else if (currentStep.value === 2) {
    // 进入预览
    currentStep.value = 3
  }
}

// 处理导入
async function processImport() {
  if (!selectedFile.value) return

  // 判断是否使用LLM分析
  const useLLM = importOptions.value.useAIAnalysis && hasImportModel.value

  try {
    // 读取文件内容
    const text = await selectedFile.value.text()

    if (useLLM) {
      // 使用LLM分析
      await processWithLLM(text)
    } else {
      // 使用传统导入
      await processTraditional()
    }
  } catch (error) {
    const errorMsg = useLLM
      ? `LLM分析失败: ${(error as Error).message}`
      : `导入失败: ${(error as Error).message}`
    ElMessage.error(errorMsg)

    if (useLLM) {
      llmAnalysisStatus.value = 'error'
    } else {
      progress.value.status = 'exception'
      progress.value.message = errorMsg
    }
  }
}

// 使用LLM分析
async function processWithLLM(text: string) {
  llmAnalysisStatus.value = 'running'
  llmAnalysisProgress.value = null
  llmTokenUsage.value = { input: 0, output: 0 }
  llmEstimatedCost.value = 0

  try {
    // 获取LLM配置
    const aiConfig = getProjectAIConfig()
    if (!aiConfig || !aiConfig.apiKey) {
      throw new Error('未配置AI模型或API密钥')
    }

    // 构建LLM配置
    const llmConfig: LLMProviderConfig = {
      provider: (aiConfig.provider === 'claude' ? 'anthropic' : aiConfig.provider) as LLMProviderConfig['provider'],
      model: aiConfig.model || '',
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseURL,
      maxTokens: 65536,
      temperature: 0.7,
      pricing: { input: 0, output: 0 }
    }

    // 执行LLM分析
    llmResult.value = await analyzeNovelWithLLM(
      text,
      llmAnalysisMode.value,
      llmConfig,
      DEFAULT_QUICK_MODE_SAMPLING,
      (progress: AnalysisProgress) => {
        llmAnalysisProgress.value = progress

        if (progress.tokenUsage) {
          llmTokenUsage.value = progress.tokenUsage
        }

        if (progress.estimatedCost) {
          llmEstimatedCost.value = progress.estimatedCost
        }
      }
    )

    llmAnalysisStatus.value = 'completed'

    // 转换LLM结果为预览数据
    previewData.value = {
      title: importForm.value.title,
      author: importForm.value.author,
      chapters: llmResult.value.chapters.map((ch: any) => ({
        id: uuidv4(),
        number: ch.number,
        title: ch.title,
        content: ch.content || '',
        wordCount: ch.wordCount || 0,
        status: 'completed' as const,
        outline: {
          chapterId: uuidv4(),
          title: ch.title,
          scenes: [],
          status: 'completed' as const
        }
      }) as any),
      characters: llmResult.value.characters.map(char => ({
        id: uuidv4(),
        name: char.name,
        aliases: [],
        gender: 'other' as const,
        age: 20,
        appearance: '',
        personality: char.personality || [],
        values: [],
        background: '',
        motivation: '',
        abilities: [],
        powerLevel: '',
        relationships: [],
        appearances: [],
        development: [],
        tags: [char.role] as CharacterTag[],
        currentState: {
          location: '',
          status: '',
          faction: '',
          updatedAt: Date.now()
        },
        stateHistory: [],
        aiGenerated: true
      })),
      stats: {
        totalWords: llmResult.value.stats.totalWords,
        totalChapters: llmResult.value.stats.totalChapters,
        avgWordsPerChapter: llmResult.value.stats.avgWordsPerChapter
      },
      worldSetting: llmResult.value.worldSetting,
      outline: {
        id: uuidv4(),
        synopsis: llmResult.value.outline.mainPlot || '',
        theme: '',
        mainPlot: {
          id: uuidv4(),
          name: '主线',
          description: llmResult.value.outline.mainPlot || ''
        },
        subPlots: (llmResult.value.outline.subPlots || []).map((plot: any, index: number) => ({
          id: uuidv4(),
          name: `支线${index + 1}`,
          description: typeof plot === 'string' ? plot : plot.description || plot.name || ''
        })),
        volumes: [],
        chapters: llmResult.value.chapters.map((ch: any) => ({
          chapterId: ch.id || uuidv4(),
          title: ch.title || `第${ch.number}章`,
          scenes: [],
          characters: [],
          location: '',
          goals: [],
          conflicts: [],
          resolutions: [],
          status: 'planned' as const
        })),
        foreshadowings: (llmResult.value.outline.keyEvents || []).map((event: any) => ({
          id: uuidv4(),
          description: typeof event === 'string' ? event : event.event || '',
          plantChapter: typeof event === 'object' && event.chapter ? event.chapter : 1,
          status: 'planted' as const
        }))
      }
    }

    // 保存完整结果用于导入
    importResult.value = {
      project: previewData.value,
      stats: llmResult.value.stats
    }

    // 自动进入下一步
    currentStep.value = 3
  } catch (error) {
    llmAnalysisStatus.value = 'error'
    throw error
  }
}

// 使用传统导入
async function processTraditional() {
  progress.value = {
    percentage: 0,
    status: '',
    message: '正在解析文件...'
  }

  // 检测章节模式
  const reader = new FileReader()
  reader.onload = async (e) => {
    const text = e.target?.result as string
    const pattern = detectChapterPattern(text)
    if (pattern) {
      detectedPattern.value = pattern.name
    }
  }
  reader.readAsText(selectedFile.value!)

  // 执行导入
  const aiConfigBase = importOptions.value.useAIAnalysis ? getProjectAIConfig() : undefined
  const aiConfig: AIAnalysisConfig | undefined = aiConfigBase ? {
    enabled: true,
    provider: aiConfigBase.provider as 'claude' | 'openai' | 'local' | 'custom',
    apiKey: aiConfigBase.apiKey,
    baseURL: aiConfigBase.baseURL,
    model: aiConfigBase.model
  } : undefined

  const result = await importNovel(
    selectedFile.value!,
    {
      ...importOptions.value,
      aiConfig
    },
    (p: ImportProgress) => {
      progress.value = {
        percentage: p.current,
        status: p.stage === 'complete' ? 'success' : '',
        message: p.message
      }
    }
  )

  // 保存完整的导入结果
  importResult.value = result
  previewData.value = result.project
  qualityMetrics.value = result.qualityMetrics || null

  progress.value.status = 'success'
  progress.value.message = '处理完成!'

  // 自动进入下一步
  currentStep.value = 3
}

// 确认导入
async function handleImport() {
  if (!previewData.value && !llmResult.value) return

  importing.value = true

  try {
    // 如果是LLM分析，构建完整的结果
    if (llmResult.value) {
      const llmImportResult = {
        project: {
          title: importForm.value.title,
          author: importForm.value.author,
          chapters: llmResult.value.chapters,
          characters: llmResult.value.characters.map(char => ({
            id: uuidv4(),
            name: char.name,
            aliases: [],
            gender: 'other' as const,
            age: 20,
            appearance: '',
            personality: char.personality || [],
            values: [],
            background: '',
            motivation: '',
            abilities: [],
            powerLevel: '',
            relationships: [],
            appearances: [],
            development: [],
            tags: [char.role] as CharacterTag[],
            currentState: {
              location: '',
              status: '',
              faction: '',
              updatedAt: Date.now()
            },
            stateHistory: [],
            aiGenerated: true
          })),
          stats: llmResult.value.stats,
          worldSetting: llmResult.value.worldSetting,
          outline: {
            id: uuidv4(),
            synopsis: llmResult.value.outline.mainPlot || '',
            theme: '',
            mainPlot: {
              id: uuidv4(),
              name: '主线',
              description: llmResult.value.outline.mainPlot || ''
            },
            subPlots: (llmResult.value.outline.subPlots || []).map((plot: any, index: number) => ({
              id: uuidv4(),
              name: `支线${index + 1}`,
              description: typeof plot === 'string' ? plot : plot.description || plot.name || ''
            })),
            volumes: [],
            chapters: llmResult.value.chapters.map((ch: any) => ({
              chapterId: ch.id || uuidv4(),
              title: ch.title || `第${ch.number}章`,
              scenes: [],
              characters: [],
              location: '',
              goals: [],
              conflicts: [],
              resolutions: [],
              status: 'planned' as const
            })),
            foreshadowings: (llmResult.value.outline.keyEvents || []).map((event: any) => ({
              id: uuidv4(),
              description: typeof event === 'string' ? event : event.event || '',
              plantChapter: typeof event === 'object' && event.chapter ? event.chapter : 1,
              status: 'planted' as const
            }))
          }
        },
        stats: llmResult.value.stats
      }
      emit('imported', llmImportResult as any)
    } else {
      emit('imported', importResult.value.project || importResult.value)
    }
    emit('update:modelValue', false)
    ElMessage.success('导入成功!')
  } catch (error) {
    ElMessage.error('导入失败')
  } finally {
    importing.value = false
  }
}

// 确认章节（LLM分析）
function handleConfirmChapters(chapters: any[]) {
  if (llmResult.value) {
    llmResult.value.chapters = chapters
  }
  ElMessage.success('章节已确认')
}

// 确认人物（LLM分析）
function handleConfirmCharacters(characters: any[]) {
  if (llmResult.value) {
    llmResult.value.characters = characters
  }
  ElMessage.success('人物已确认')
}

// 重新生成章节（LLM分析）
async function handleRegenerateChapters() {
  ElMessage.info('重新检测章节功能开发中...')
}

// 取消LLM分析
function handleCancelLLMAnalysis() {
  llmAnalysisStatus.value = 'idle'
  llmAnalysisProgress.value = null
  llmTokenUsage.value = { input: 0, output: 0 }
  llmEstimatedCost.value = 0
  ElMessage.warning('分析已取消')
}

// 取消
function handleCancel() {
  emit('update:modelValue', false)
  resetForm()
}

// 重置表单
function resetForm() {
  currentStep.value = 0
  selectedFile.value = null
  previewData.value = null
  progress.value = {
    percentage: 0,
    status: '',
    message: '准备处理...'
  }
  importForm.value = {
    title: '',
    author: ''
  }
  // 重置LLM相关状态
  llmAnalysisStatus.value = 'idle'
  llmAnalysisProgress.value = null
  llmTokenUsage.value = { input: 0, output: 0 }
  llmEstimatedCost.value = 0
  llmResult.value = null
}

// 获取角色类型
function getRoleType(role: string): string {
  const types: Record<string, string> = {
    protagonist: 'primary',
    supporting: 'success',
    antagonist: 'danger',
    minor: 'info',
    other: 'warning'
  }
  return types[role] || 'info'
}

// 获取角色名称
function getRoleName(role: string): string {
  const names: Record<string, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
    minor: '路人',
    other: '其他'
  }
  return names[role] || '未知'
}
</script>

<style scoped>
.step-content {
  margin-top: 30px;
  min-height: 300px;
}

.upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.options-section {
  max-width: 600px;
  margin: 0 auto;
}

.option-hint {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.processing-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.progress-message {
  font-size: 14px;
  color: #606266;
}

.stats-card {
  width: 100%;
  max-width: 600px;
  margin-top: 20px;
}

.preview-section {
  min-height: 400px;
}

.more-hint {
  text-align: center;
  padding: 10px;
  color: #909399;
  font-size: 14px;
}

.pattern-info {
  margin-bottom: 20px;
}

:deep(.el-upload-dragger) {
  width: 500px;
}
</style>
