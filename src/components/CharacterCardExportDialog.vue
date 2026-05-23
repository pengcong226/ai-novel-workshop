<template>
  <el-dialog
    v-model="visible"
    title="导出角色卡"
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form :model="exportOptions" label-width="120px">
      <el-form-item label="导出格式">
        <el-select v-model="exportOptions.format" placeholder="选择格式">
          <el-option label="SillyTavern格式" value="sillytavern" />
          <el-option label="Character Card V3" value="v3" />
          <el-option label="Character Card V2" value="v2" />
          <el-option label="Character Card V1 (Legacy)" value="v1" />
          <el-option label="PNG图片" value="png" />
        </el-select>
      </el-form-item>

      <el-divider>导出内容</el-divider>

      <el-form-item label="角色信息">
        <el-switch v-model="exportOptions.includeCharacter" />
        <el-text size="small" type="info">
          包含名称、描述、性格、场景等基本信息
        </el-text>
      </el-form-item>

      <el-form-item label="世界书">
        <el-switch v-model="exportOptions.includeWorldbook" />
        <el-text size="small" type="info">
          包含所有世界书条目
        </el-text>
      </el-form-item>

      <el-form-item label="正则脚本">
        <el-switch v-model="exportOptions.includeRegexScripts" />
        <el-text size="small" type="info">
          包含所有正则脚本
        </el-text>
      </el-form-item>

      <el-form-item label="提示词">
        <el-switch v-model="exportOptions.includePrompts" />
        <el-text size="small" type="info">
          包含所有提示词配置
        </el-text>
      </el-form-item>

      <el-form-item label="AI设置">
        <el-switch v-model="exportOptions.includeAISettings" />
        <el-text size="small" type="info">
          包含Temperature、Top P等AI参数
        </el-text>
      </el-form-item>

      <!-- PNG选项 -->
      <template v-if="exportOptions.format === 'png'">
        <el-divider>PNG选项</el-divider>

        <el-form-item label="图片宽度">
          <el-input-number
            v-model="exportOptions.imageOptions.width"
            :min="128"
            :max="2048"
            :step="64"
          />
        </el-form-item>

        <el-form-item label="图片高度">
          <el-input-number
            v-model="exportOptions.imageOptions.height"
            :min="128"
            :max="2048"
            :step="64"
          />
        </el-form-item>

        <el-form-item label="背景颜色">
          <el-color-picker v-model="exportOptions.imageOptions.backgroundColor" />
        </el-form-item>
      </template>

      <!-- 统计信息 -->
      <el-divider>导出统计</el-divider>

      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="角色名">
          {{ characterCardStore.characterName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="世界书条目">
          {{ characterCardStore.worldbookCount }}
        </el-descriptions-item>
        <el-descriptions-item label="正则脚本">
          {{ characterCardStore.regexScriptCount }}
        </el-descriptions-item>
        <el-descriptions-item label="提示词">
          {{ characterCardStore.promptCount }}
        </el-descriptions-item>
      </el-descriptions>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="exporting"
        @click="handleExport"
      >
        {{ exporting ? '导出中...' : '导出' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useCharacterCardStore } from '@/stores/character-card'
import type { CharacterCardExportOptions } from '@/types/character-card'

const visible = defineModel<boolean>('visible', { required: true })

const characterCardStore = useCharacterCardStore()

const exporting = ref(false)

const exportOptions = reactive<Omit<CharacterCardExportOptions, 'format'> & {
  format: 'sillytavern' | 'v1' | 'v2' | 'v3' | 'png' | string
  includeCharacter: boolean
  imageOptions: {
    width: number
    height: number
    backgroundColor: string
  }
}>({
  format: 'sillytavern',
  includeCharacter: true,
  includeWorldbook: true,
  includeRegexScripts: true,
  includePrompts: true,
  includeAISettings: true,
  imageOptions: {
    width: 512,
    height: 512,
    backgroundColor: '#667eea'
  }
})

// 监听includeCharacter变化，自动调整其他选项
watch(() => exportOptions.includeCharacter, (value) => {
  if (!value) {
    // 如果不包含角色信息，默认也不包含其他内容
    exportOptions.includeWorldbook = false
    exportOptions.includeRegexScripts = false
    exportOptions.includePrompts = false
    exportOptions.includeAISettings = false
  }
})

// 导出
const handleExport = async () => {
  exporting.value = true

  try {
    const filename = characterCardStore.characterName || 'character'

    await characterCardStore.downloadCharacterCard(filename, exportOptions as any)

    ElMessage.success('角色卡导出成功')
    handleClose()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '导出失败'
    ElMessage.error(errorMsg)
  } finally {
    exporting.value = false
  }
}

// 关闭对话框
const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
:deep(.el-text) {
  display: block;
  margin-top: 4px;
}
</style>