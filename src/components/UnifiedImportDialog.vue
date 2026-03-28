<template>
  <el-dialog
    v-model="visible"
    title="统一导入"
    width="760px"
    :close-on-click-modal="false"
  >
    <el-steps :active="currentStep" finish-status="success" simple class="mb-4">
      <el-step title="文件与选项" />
      <el-step title="解析预览" />
      <el-step title="抽取预览" />
      <el-step title="冲突审核" />
      <el-step title="应用结果" />
    </el-steps>

    <div v-if="currentStep === 0">
      <el-form :model="importOptions" label-width="140px">
        <el-form-item label="选择文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept=".png,.json,.jsonl,.ndjson"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              拖拽文件到此处或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持 PNG / JSON / JSONL（会话轨迹）导入
              </div>
            </template>
          </el-upload>
        </el-form-item>

        <el-divider>通用导入选项</el-divider>

        <el-form-item label="导入角色卡">
          <el-switch v-model="importOptions.importCharacterCard" />
        </el-form-item>

        <el-form-item label="导入世界书">
          <el-switch v-model="importOptions.importWorldbook" />
        </el-form-item>

        <el-form-item label="导入正则脚本">
          <el-switch v-model="importOptions.importRegexScripts" />
        </el-form-item>

        <el-form-item label="导入提示词">
          <el-switch v-model="importOptions.importPrompts" />
        </el-form-item>

        <el-form-item label="导入AI设置">
          <el-switch v-model="importOptions.importAISettings" />
        </el-form-item>

        <el-divider v-if="importOptions.importWorldbook">世界书选项</el-divider>

        <el-form-item v-if="importOptions.importWorldbook" label="冲突处理">
          <el-select v-model="importOptions.worldbookOptions.conflictResolution">
            <el-option label="保留两者" value="keep_both" />
            <el-option label="覆盖" value="overwrite" />
            <el-option label="跳过" value="skip" />
            <el-option label="合并" value="merge" />
            <el-option label="重命名" value="rename" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="importOptions.importWorldbook" label="去重">
          <el-switch v-model="importOptions.worldbookOptions.deduplicate" />
        </el-form-item>

        <el-form-item v-if="importOptions.importWorldbook" label="启用所有条目">
          <el-switch v-model="importOptions.worldbookOptions.enableAllEntries" />
        </el-form-item>

        <template v-if="isTraceFile">
          <el-divider>会话轨迹(JSONL)选项</el-divider>

          <el-form-item label="默认解析角色">
            <el-checkbox-group v-model="traceRoleSelection">
              <el-checkbox label="user">用户</el-checkbox>
              <el-checkbox label="assistant">助手</el-checkbox>
              <el-checkbox label="system">系统</el-checkbox>
              <el-checkbox label="tool">工具</el-checkbox>
            </el-checkbox-group>
          </el-form-item>

          <el-form-item label="正则预处理">
            <el-switch v-model="importOptions.conversationTraceOptions.useRegexPreprocess" />
          </el-form-item>
        </template>
      </el-form>
    </div>

    <div v-else-if="currentStep === 1" class="step-panel">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="解析预览（默认仅 user + assistant）"
      />
      <div class="metrics mt-3">
        <el-tag>已解析消息: {{ importResult?.conversationTrace?.parsedMessages || 0 }}</el-tag>
        <el-tag type="warning">提取候选: {{ importResult?.conversationTrace?.extractedArtifacts || 0 }}</el-tag>
        <el-tag type="danger">审核项: {{ importResult?.conversationTrace?.reviewItems || 0 }}</el-tag>
      </div>
      <el-table :data="previewMessages" style="width: 100%" class="mt-3" height="260">
        <el-table-column prop="sourceLine" label="行" width="70" />
        <el-table-column prop="role" label="角色" width="110" />
        <el-table-column label="内容预览">
          <template #default="{ row }">
            <span>{{ row.content }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="previewMessages.length === 0" description="暂无消息预览，继续查看抽取结果" />
    </div>

    <div v-else-if="currentStep === 2" class="step-panel">
      <el-alert
        type="success"
        :closable="false"
        show-icon
        title="抽取结果预览"
      />
      <el-table :data="artifactRows" style="width: 100%" class="mt-3" height="300">
        <el-table-column prop="type" label="类型" width="150" />
        <el-table-column prop="title" label="标题" min-width="220" />
        <el-table-column prop="confidence" label="置信度" width="120">
          <template #default="{ row }">
            {{ Math.round((row.confidence || 0) * 100) }}%
          </template>
        </el-table-column>
        <el-table-column prop="sourceLine" label="来源行" width="100" />
      </el-table>
    </div>

    <div v-else-if="currentStep === 3" class="step-panel">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="冲突审核（默认人工审核优先）"
      />

      <el-table :data="reviewItems" style="width: 100%" class="mt-3" height="320">
        <el-table-column prop="artifact.type" label="类型" width="130" />
        <el-table-column prop="artifact.title" label="标题" min-width="200" />
        <el-table-column label="冲突数" width="90">
          <template #default="{ row }">{{ row.conflicts.length }}</template>
        </el-table-column>
        <el-table-column label="处理动作" width="160">
          <template #default="{ row }">
            <el-select v-model="row.action" size="small">
              <el-option label="应用" value="apply" />
              <el-option label="跳过" value="skip" />
              <el-option label="合并" value="merge" />
            </el-select>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-else class="step-panel">
      <el-alert
        :title="importResult?.success ? '导入处理完成' : '导入失败'"
        :type="importResult?.success ? 'success' : 'error'"
        :closable="false"
        show-icon
      />

      <div class="mt-3" v-if="importResult?.conversationTrace">
        <p>会话轨迹解析: {{ importResult.conversationTrace.parsedMessages }}</p>
        <p>抽取候选: {{ importResult.conversationTrace.extractedArtifacts }}</p>
        <p>审核项: {{ importResult.conversationTrace.reviewItems }}</p>
        <p v-if="importResult.conversationTrace.applied">
          已应用: {{ importResult.conversationTrace.applied.applied }}，
          合并: {{ importResult.conversationTrace.applied.merged }}，
          跳过: {{ importResult.conversationTrace.applied.skipped }}
        </p>
      </div>

      <div class="mt-3" v-if="importResult?.worldbook?.imported">
        <p>世界书导入: {{ importResult.worldbook.entriesCount }} 条</p>
      </div>

      <div class="mt-3" v-if="importResult?.characterCard?.imported">
        <p>角色卡导入: {{ importResult.characterCard.name }}</p>
      </div>

      <div class="mt-3" v-if="importResult?.errors?.length">
        <p v-for="(error, index) in importResult.errors" :key="index">❌ {{ error }}</p>
      </div>

      <div class="mt-3" v-if="importResult?.warnings?.length">
        <p v-for="(warning, index) in importResult.warnings" :key="index">⚠️ {{ warning }}</p>
      </div>
    </div>

    <el-progress
      v-if="importing"
      :percentage="importProgress.percentage"
      :format="importProgress.format"
      :status="importProgress.status"
      class="mt-3"
    />

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>

        <el-button
          v-if="currentStep > 0 && currentStep < 4 && isTraceFile"
          @click="handlePrevStep"
          :disabled="importing"
        >
          上一步
        </el-button>

        <el-button
          v-if="currentStep === 0"
          type="primary"
          :disabled="!selectedFile || importing"
          :loading="importing"
          @click="handleStart"
        >
          {{ importing ? '处理中...' : (isTraceFile ? '开始分析' : '开始导入') }}
        </el-button>

        <el-button
          v-else-if="currentStep === 1 && isTraceFile"
          type="primary"
          :disabled="importing"
          @click="currentStep = 2"
        >
          下一步
        </el-button>

        <el-button
          v-else-if="currentStep === 2 && isTraceFile"
          type="primary"
          :disabled="importing"
          @click="currentStep = 3"
        >
          下一步
        </el-button>

        <el-button
          v-else-if="currentStep === 3 && isTraceFile"
          type="primary"
          :loading="importing"
          @click="handleApplyReview"
        >
          应用审核结果
        </el-button>

        <el-button v-else type="primary" @click="handleClose">
          完成
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import type { TraceReviewItem } from '@/types/conversation-trace'
import type { UnifiedImportOptions, UnifiedImportResult } from '@/services/unified-importer'
import { importFromFile } from '@/services/unified-importer'

type DialogImportOptions = Omit<UnifiedImportOptions, 'worldbookOptions' | 'conversationTraceOptions'> & {
  worldbookOptions: NonNullable<UnifiedImportOptions['worldbookOptions']>
  conversationTraceOptions: NonNullable<UnifiedImportOptions['conversationTraceOptions']>
}

const visible = defineModel<boolean>('visible', { required: true })

const emit = defineEmits<{
  imported: [result: UnifiedImportResult]
}>()

const uploadRef = ref()
const selectedFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<UnifiedImportResult | null>(null)
const currentStep = ref(0)
const reviewItems = ref<TraceReviewItem[]>([])
const previewMessages = ref<Array<{ sourceLine: number; role: string; content: string }>>([])

const importOptions = reactive<DialogImportOptions>({
  importCharacterCard: true,
  importWorldbook: true,
  importRegexScripts: true,
  importPrompts: true,
  importAISettings: true,
  characterCardOptions: {},
  worldbookOptions: {
    conflictResolution: 'keep_both',
    deduplicate: true,
    autoCategorize: false,
    enableAllEntries: false,
  },
  conversationTraceOptions: {
    includeRoles: ['user', 'assistant'],
    includeEmptyContent: false,
    useRegexPreprocess: false,
    autoApplyNoConflict: false,
    applyReviewed: false,
  },
})

const importProgress = reactive({
  percentage: 0,
  status: '' as '' | 'success' | 'warning' | 'exception',
  format: (percentage: number) => `${percentage}%`,
})

const isTraceFile = computed(() => {
  const file = selectedFile.value
  if (!file) return false
  const name = file.name.toLowerCase()
  return name.endsWith('.jsonl') || name.endsWith('.ndjson')
})

const traceRoleSelection = computed({
  get: () => importOptions.conversationTraceOptions.includeRoles,
  set: (roles: Array<'user' | 'assistant' | 'system' | 'tool' | 'other'>) => {
    importOptions.conversationTraceOptions.includeRoles = roles
  },
})

const artifactRows = computed(() => {
  return reviewItems.value.map(item => ({
    id: item.id,
    type: item.artifact.type,
    title: item.artifact.title,
    confidence: item.artifact.confidence,
    sourceLine: item.artifact.source[0]?.line || '-',
  }))
})

function cloneReviewItems(items: TraceReviewItem[]): TraceReviewItem[] {
  return JSON.parse(JSON.stringify(items)) as TraceReviewItem[]
}

const handleFileChange = (file: UploadFile) => {
  if (file.raw) {
    selectedFile.value = file.raw
    importResult.value = null
    reviewItems.value = []
    previewMessages.value = []
    currentStep.value = 0
  }
}

const handleFileRemove = () => {
  selectedFile.value = null
  importResult.value = null
  reviewItems.value = []
  previewMessages.value = []
  currentStep.value = 0
}

function resetProgress() {
  importProgress.percentage = 0
  importProgress.status = ''
}

async function runImport(payload: UnifiedImportOptions): Promise<UnifiedImportResult> {
  if (!selectedFile.value) {
    throw new Error('请选择文件')
  }

  importing.value = true
  resetProgress()

  const progressInterval = setInterval(() => {
    if (importProgress.percentage < 90) {
      importProgress.percentage += 10
    }
  }, 120)

  try {
    const result = await importFromFile(selectedFile.value, payload)
    importProgress.percentage = 100
    importProgress.status = result.success ? 'success' : 'exception'
    return result
  } finally {
    clearInterval(progressInterval)
    importing.value = false
  }
}

async function handleStart() {
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  try {
    const payload: UnifiedImportOptions = {
      ...importOptions,
      conversationTraceOptions: {
        ...importOptions.conversationTraceOptions,
        applyReviewed: false,
        autoApplyNoConflict: false,
      },
    }

    const result = await runImport(payload)
    importResult.value = result

    if (!result.success) {
      currentStep.value = 4
      ElMessage.error('导入失败')
      emit('imported', result)
      return
    }

    if (isTraceFile.value) {
      reviewItems.value = cloneReviewItems(result.reviewItems || [])
      previewMessages.value = (result.reviewItems || []).slice(0, 20).map(item => ({
        sourceLine: item.artifact.source[0]?.line || 0,
        role: item.artifact.source[0]?.role || 'other',
        content: item.artifact.source[0]?.snippet || item.artifact.title,
      }))
      currentStep.value = 1
      ElMessage.success('分析完成，请继续审核')
      return
    }

    currentStep.value = 4
    ElMessage.success('导入成功')
    emit('imported', result)
  } catch (error) {
    importProgress.status = 'exception'
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入失败: ${errorMsg}`)
  }
}

function handlePrevStep() {
  if (currentStep.value > 0) {
    currentStep.value -= 1
  }
}

async function handleApplyReview() {
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  try {
    const payload: UnifiedImportOptions = {
      ...importOptions,
      conversationTraceOptions: {
        ...importOptions.conversationTraceOptions,
        applyReviewed: true,
        reviewItems: reviewItems.value,
      },
    }

    const result = await runImport(payload)
    importResult.value = result
    currentStep.value = 4

    if (result.success) {
      ElMessage.success('审核结果已应用')
    } else {
      ElMessage.error('应用失败')
    }

    emit('imported', result)
  } catch (error) {
    importProgress.status = 'exception'
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`应用失败: ${errorMsg}`)
  }
}

const handleClose = () => {
  visible.value = false
  selectedFile.value = null
  importResult.value = null
  reviewItems.value = []
  previewMessages.value = []
  currentStep.value = 0
  resetProgress()
  if (uploadRef.value) {
    uploadRef.value.clearFiles()
  }
}
</script>

<style scoped>
.mb-4 {
  margin-bottom: 16px;
}

.mt-3 {
  margin-top: 16px;
}

.step-panel {
  min-height: 320px;
}

.metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

:deep(.el-upload-dragger) {
  padding: 40px;
}
</style>
