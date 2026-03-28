<template>
  <el-dialog
    v-model="visible"
    title="统一导入"
    width="600px"
    :close-on-click-modal="false"
  >
    <el-form :model="importOptions" label-width="140px">
      <!-- 文件上传 -->
      <el-form-item label="选择文件">
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          accept=".png,.json"
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
              支持 PNG 图片和 JSON 文件，可包含角色卡、世界书或两者兼具
            </div>
          </template>
        </el-upload>
      </el-form-item>

      <!-- 导入选项 -->
      <el-divider>导入选项</el-divider>

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

      <!-- 世界书高级选项 -->
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

      <el-form-item v-if="importOptions.importWorldbook" label="自动分类">
        <el-switch v-model="importOptions.worldbookOptions.autoCategorize" />
      </el-form-item>

      <el-form-item v-if="importOptions.importWorldbook" label="启用所有条目">
        <el-switch v-model="importOptions.worldbookOptions.enableAllEntries" />
      </el-form-item>
    </el-form>

    <!-- 导入进度 -->
    <el-progress
      v-if="importing"
      :percentage="importProgress.percentage"
      :format="importProgress.format"
      :status="importProgress.status"
    />

    <!-- 导入结果 -->
    <el-alert
      v-if="importResult"
      :title="importResult.success ? '导入成功' : '导入失败'"
      :type="importResult.success ? 'success' : 'error'"
      :closable="false"
      show-icon
      class="import-result"
    >
      <template #default>
        <div v-if="importResult.success">
          <p v-if="importResult.characterCard?.imported">
            ✅ 角色卡: {{ importResult.characterCard.name }}
            <span v-if="importResult.characterCard.hasWorldbook">(包含世界书)</span>
            <span v-if="importResult.characterCard.hasRegexScripts">(包含正则脚本)</span>
            <span v-if="importResult.characterCard.hasPrompts">(包含提示词)</span>
          </p>
          <p v-if="importResult.worldbook?.imported">
            ✅ 世界书: {{ importResult.worldbook.entriesCount }} 条条目
          </p>
          <p v-if="importResult.regexScripts?.imported">
            ✅ 正则脚本: {{ importResult.regexScripts.count }} 个脚本
          </p>
          <p v-if="importResult.prompts?.imported">
            ✅ 提示词: {{ importResult.prompts.count }} 个提示词
          </p>
          <p v-if="importResult.aiSettings?.imported">
            ✅ AI设置已导入
          </p>
        </div>
        <div v-else>
          <p v-for="(error, index) in importResult.errors" :key="index">
            ❌ {{ error }}
          </p>
        </div>
      </template>
    </el-alert>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          :disabled="!selectedFile || importing"
          :loading="importing"
          @click="handleImport"
        >
          {{ importing ? '导入中...' : '开始导入' }}
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import type { UnifiedImportOptions, UnifiedImportResult } from '@/services/unified-importer'
import { importFromFile } from '@/services/unified-importer'

const visible = defineModel<boolean>('visible', { required: true })

const uploadRef = ref()
const selectedFile = ref<File | null>(null)
const importing = ref(false)
const importResult = ref<UnifiedImportResult | null>(null)

const importOptions = reactive<UnifiedImportOptions>({
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
    enableAllEntries: false
  }
})

const importProgress = reactive({
  percentage: 0,
  status: '' as '' | 'success' | 'warning' | 'exception',
  format: (percentage: number) => `${percentage}%`
})

const handleFileChange = (file: UploadFile) => {
  if (file.raw) {
    selectedFile.value = file.raw
    importResult.value = null
  }
}

const handleFileRemove = () => {
  selectedFile.value = null
  importResult.value = null
}

const handleImport = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请选择文件')
    return
  }

  importing.value = true
  importProgress.percentage = 0
  importProgress.status = ''
  importResult.value = null

  try {
    // 模拟进度
    const progressInterval = setInterval(() => {
      if (importProgress.percentage < 90) {
        importProgress.percentage += 10
      }
    }, 100)

    const result = await importFromFile(selectedFile.value, importOptions)

    clearInterval(progressInterval)
    importProgress.percentage = 100

    if (result.success) {
      importProgress.status = 'success'
      importResult.value = result
      ElMessage.success('导入成功')
    } else {
      importProgress.status = 'exception'
      importResult.value = result
      ElMessage.error('导入失败')
    }
  } catch (error) {
    importProgress.status = 'exception'
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入失败: ${errorMsg}`)
  } finally {
    importing.value = false
  }
}

const handleClose = () => {
  visible.value = false
  selectedFile.value = null
  importResult.value = null
  importProgress.percentage = 0
  importProgress.status = ''
  if (uploadRef.value) {
    uploadRef.value.clearFiles()
  }
}
</script>

<style scoped>
.import-result {
  margin-top: 16px;
}

.import-result p {
  margin: 8px 0;
  font-size: 14px;
}

:deep(.el-upload-dragger) {
  padding: 40px;
}
</style>
