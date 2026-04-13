<template>
  <el-dialog
    :model-value="true"
    title="导入世界书"
    width="80%"
    :close-on-click-modal="false"
    @close="$emit('cancel')"
  >
    <el-steps :active="currentStep" finish-status="success">
      <el-step title="上传文件" />
      <el-step title="预览与确认" />
      <el-step title="完成" />
    </el-steps>

    <!-- 步骤1：上传文件 -->
    <div v-if="currentStep === 0" class="upload-section">
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        :on-exceed="handleExceed"
        :on-error="handleUploadError"
        :before-upload="beforeUpload"
        :file-list="fileList"
        :limit="10"
        :max-size="10 * 1024 * 1024"
        accept=".png,.json,.jsonl"
        drag
        multiple
        :show-file-list="true"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持PNG（SillyTavern角色卡）、JSON、JSONL格式，单个文件最大10MB，最多10个文件
          </div>
        </template>
      </el-upload>

      <div class="import-options">
        <h3>导入选项</h3>
        <el-form label-width="140px">
          <el-form-item label="冲突解决策略">
            <el-select v-model="importOptions.conflictResolution">
              <el-option label="保留两者（重命名）" value="keep_both" />
              <el-option label="覆盖现有条目" value="overwrite" />
              <el-option label="跳过重复条目" value="skip" />
            </el-select>
          </el-form-item>

          <el-form-item label="自动创建分组">
            <el-switch v-model="importOptions.createGroups" />
          </el-form-item>

          <el-form-item label="验证条目">
            <el-switch v-model="importOptions.validate" />
          </el-form-item>

          <el-form-item label="去重">
            <el-switch v-model="importOptions.deduplicate" />
          </el-form-item>

          <el-form-item label="目标分组">
            <el-select v-model="importOptions.targetGroup" clearable placeholder="可选">
              <el-option
                v-for="group in worldbookStore.groups"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <!-- 步骤2：预览与确认 -->
    <div v-if="currentStep === 1" class="preview-section">
      <el-alert
        v-if="previewResult.errors.length > 0"
        type="warning"
        :closable="false"
        class="preview-alert"
      >
        <template #title>
          发现 {{ previewResult.errors.length }} 个错误
        </template>
        <ul>
          <li v-for="(error, index) in previewResult.errors" :key="index + '-' + error.substring(0, 20)">
            {{ error }}
          </li>
        </ul>
      </el-alert>

      <el-alert
        v-if="previewResult.conflicts.length > 0"
        type="info"
        :closable="false"
        class="preview-alert"
      >
        <template #title>
          发现 {{ previewResult.conflicts.length }} 个冲突
        </template>
        <ul>
          <li v-for="(conflict, index) in previewResult.conflicts" :key="index + '-' + conflict.entry.title">
            {{ conflict.entry.title }} - {{ conflict.reason }}
          </li>
        </ul>
      </el-alert>

      <el-table :data="previewResult.entries" style="width: 100%">
        <el-table-column prop="title" label="标题" min-width="180">
          <template #default="{ row }">
            <div class="entry-title">
              <el-icon v-if="row.duplicate"><WarningFilled /></el-icon>
              <span>{{ row.title || '无标题' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="关键词" min-width="200">
          <template #default="{ row }">
            <div class="keywords-preview">
              <el-tag
                v-for="(key, index) in row.keys.slice(0, 3)"
                :key="index"
                size="small"
                class="keyword-tag"
              >
                {{ key }}
              </el-tag>
              <el-tag v-if="row.keys.length > 3" size="small" type="info">
                +{{ row.keys.length - 3 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="source" label="来源" width="150">
          <template #default="{ row }">
            <el-tag size="small">{{ row.source }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.duplicate ? 'warning' : 'success'"
              size="small"
            >
              {{ row.duplicate ? '重复' : '新增' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="内容预览" min-width="200">
          <template #default="{ row }">
            <div class="content-preview">
              {{ row.content.substring(0, 100) }}...
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="preview-summary">
        <el-tag>总计: {{ previewResult.entries.length }}</el-tag>
        <el-tag type="success">新增: {{ previewResult.entries.filter(e => !e.duplicate).length }}</el-tag>
        <el-tag type="warning">重复: {{ previewResult.entries.filter(e => e.duplicate).length }}</el-tag>
      </div>
    </div>

    <!-- 步骤3：完成 -->
    <div v-if="currentStep === 2" class="complete-section">
      <el-result
        icon="success"
        title="导入完成"
        :sub-title="`成功导入 ${importResult.success} 个条目`"
      >
        <template #extra>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="总数">
              {{ importResult.total }}
            </el-descriptions-item>
            <el-descriptions-item label="成功">
              {{ importResult.success }}
            </el-descriptions-item>
            <el-descriptions-item label="跳过">
              {{ importResult.skipped }}
            </el-descriptions-item>
            <el-descriptions-item label="错误">
              {{ importResult.errors }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </el-result>
    </div>

    <template #footer>
      <el-button v-if="currentStep > 0" @click="prevStep">上一步</el-button>
      <el-button v-if="currentStep < 2" @click="$emit('cancel')">取消</el-button>
      <el-button
        v-if="currentStep === 0"
        type="primary"
        @click="handlePreview"
        :disabled="fileList.length === 0"
      >
        下一步
      </el-button>
      <el-button
        v-if="currentStep === 1"
        type="primary"
        @click="handleImport"
        :disabled="previewResult.entries.length === 0"
      >
        开始导入
      </el-button>
      <el-button
        v-if="currentStep === 2"
        type="primary"
        @click="$emit('imported')"
      >
        完成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, WarningFilled } from '@element-plus/icons-vue'
import type { UploadFile, UploadFiles } from 'element-plus'
import { useWorldbookStore } from '@/stores/worldbook'
import { importWorldbook } from '@/services/worldbook-importer'
import type { WorldbookEntry, WorldbookImportOptions } from '@/types/worldbook'
import { getLogger } from '@/utils/logger'

const logger = getLogger('worldbook-import')

const emit = defineEmits<{
  imported: []
  cancel: []
}>()

const worldbookStore = useWorldbookStore()

const currentStep = ref(0)
const fileList = ref<UploadFile[]>([])
const uploadRef = ref()

const importOptions = ref<WorldbookImportOptions>({
  conflictResolution: 'keep_both',
  createGroups: true,
  validate: true,
  deduplicate: true,
  targetGroup: undefined
})

interface PreviewEntry extends WorldbookEntry {
  source: string
  duplicate: boolean
}

interface PreviewResult {
  entries: PreviewEntry[]
  conflicts: Array<{ entry: WorldbookEntry; reason: string }>
  errors: string[]
}

const previewResult = ref<PreviewResult>({
  entries: [],
  conflicts: [],
  errors: []
})

interface ImportResult {
  total: number
  success: number
  skipped: number
  errors: number
}

const importResult = ref<ImportResult>({
  total: 0,
  success: 0,
  skipped: 0,
  errors: 0
})

function handleFileChange(file: UploadFile, files: UploadFiles) {
  logger.debug('文件变化:', {
    file: file.name,
    size: file.size,
    type: file.raw?.type,
    filesCount: files.length
  })

  // 检查文件对象是否有效
  if (!file.raw) {
    logger.error('文件对象无效:', file)
    ElMessage.error(`文件 ${file.name} 无效，请重新选择`)
    return
  }

  fileList.value = files
}

function handleFileRemove(_file: UploadFile, files: UploadFiles) {
  fileList.value = files
}

function handleExceed(files: File[]) {
  ElMessage.warning(`最多只能上传10个文件，当前选择了${files.length}个文件`)
}

function handleUploadError(error: Error, file: UploadFile) {
  const errorMsg = error instanceof Error ? error.message : String(error)
  ElMessage.error(`文件 ${file.name} 上传失败: ${errorMsg}`)
}

function beforeUpload(file: File) {
  // 检查文件大小
  const maxSize = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSize) {
    ElMessage.error(`文件 ${file.name} 超过10MB限制`)
    return false
  }

  // 检查文件格式
  const allowedTypes = ['.png', '.json', '.jsonl']
  const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!allowedTypes.includes(fileExt)) {
    ElMessage.error(`不支持的文件格式: ${fileExt}，仅支持 PNG、JSON、JSONL`)
    return false
  }

  return true
}

async function handlePreview() {
  logger.info('开始预览，文件列表:', fileList.value)

  if (fileList.value.length === 0) {
    ElMessage.warning('请选择至少一个文件')
    return
  }

  try {
    const allEntries: PreviewEntry[] = []
    const errors: string[] = []

    for (const file of fileList.value) {
      logger.debug('处理文件:', {
        name: file.name,
        size: file.size,
        type: file.raw?.type,
        hasRaw: !!file.raw
      })

      try {
        logger.debug('调用 importWorldbook...')
        const result = await importWorldbook(file.raw as File, importOptions.value)

        logger.info('导入结果:', {
          success: result.success,
          entriesCount: result.entries?.length || 0,
          errors: result.errors
        })

        // 确保 entries 存在
        const entries = result.entries || []
        const previewEntries: PreviewEntry[] = entries.map(entry => ({
          ...entry,
          source: file.name,
          duplicate: worldbookStore.entries.some(e =>
            e.title === entry.title ||
            ((e.keys || []).length > 0 && (entry.keys || []).length > 0 && (e.keys || []).some(k => (entry.keys || []).includes(k)))
          )
        }))

        allEntries.push(...previewEntries)

        if (!result.success && result.errors) {
          // 从 WorldbookImportError 对象中提取错误消息
          const errorMessages = result.errors.map(err =>
            typeof err === 'string' ? err : err.message || String(err)
          )
          errors.push(`${file.name}: ${errorMessages.join(', ')}`)
          logger.error('导入失败:', errorMessages)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push(`${file.name}: ${errorMsg}`)
        logger.error('导入文件失败:', error)
      }
    }

    previewResult.value = {
      entries: allEntries,
      conflicts: allEntries
        .filter(e => e.duplicate)
        .map(e => ({
          entry: e,
          reason: '标题或关键词重复'
        })),
      errors
    }

    logger.info('预览结果:', {
      entriesCount: allEntries.length,
      errorsCount: errors.length,
      conflictsCount: previewResult.value.conflicts.length
    })

    currentStep.value = 1
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`预览失败: ${errorMsg}`)
    logger.error('预览失败:', error)
  }
}

async function handleImport() {
  try {
    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (const entry of previewResult.value.entries) {
      if (entry.duplicate) {
        if (importOptions.value.conflictResolution === 'skip') {
          skipCount++
          continue
        } else if (importOptions.value.conflictResolution === 'overwrite') {
          const existing = worldbookStore.entries.find(e => e.title === entry.title)
          if (existing && existing.uid !== undefined) {
            await worldbookStore.updateEntry(existing.uid, entry)
            successCount++
            continue
          }
        }
      }

      try {
        await worldbookStore.addEntry(entry)
        successCount++
      } catch (error) {
        errorCount++
        logger.error('添加条目失败:', error)
      }
    }

    importResult.value = {
      total: previewResult.value.entries.length,
      success: successCount,
      skipped: skipCount,
      errors: errorCount
    }

    currentStep.value = 2
    ElMessage.success('导入完成')
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入失败: ${errorMsg}`)
    logger.error('导入失败:', error)
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}
</script>

<style scoped lang="scss">
.upload-section {
  margin-top: 20px;
}

.import-options {
  margin-top: 30px;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;

  h3 {
    margin-top: 0;
    margin-bottom: 15px;
  }
}

.preview-section {
  margin-top: 20px;
}

.preview-alert {
  margin-bottom: 15px;

  ul {
    margin: 10px 0 0 0;
    padding-left: 20px;
  }
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 5px;
}

.keywords-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.keyword-tag {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-preview {
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
}

.preview-summary {
  margin-top: 15px;
  display: flex;
  gap: 10px;
}

.complete-section {
  margin-top: 20px;
}
</style>
