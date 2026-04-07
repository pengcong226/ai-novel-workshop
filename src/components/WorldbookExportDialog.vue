<template>
  <el-dialog
    :model-value="true"
    title="导出世界书"
    width="600px"
    :close-on-click-modal="false"
    @close="$emit('cancel')"
  >
    <el-form label-width="120px">
      <el-form-item label="导出格式">
        <el-radio-group v-model="exportFormat">
          <el-radio value="json">JSON</el-radio>
          <el-radio value="jsonl">JSONL</el-radio>
          <el-radio value="png">PNG图片</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="包含条目">
        <el-radio-group v-model="exportScope">
          <el-radio value="all">全部条目 ({{ worldbookStore.entryCount }})</el-radio>
          <el-radio value="enabled">仅启用的条目 ({{ worldbookStore.enabledEntryCount }})</el-radio>
          <el-radio value="selected">选中的条目 ({{ selectedCount }})</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="exportFormat === 'json'" label="格式化输出">
        <el-switch v-model="prettyPrint" />
        <span style="margin-left: 10px; color: #909399;">
          启用后JSON会格式化输出，便于阅读
        </span>
      </el-form-item>

      <el-form-item v-if="exportFormat === 'png'" label="图片设置">
        <div>
          <el-input-number
            v-model="imageWidth"
            :min="256"
            :max="2048"
            :step="256"
            placeholder="宽度"
          />
          <span style="margin: 0 10px">×</span>
          <el-input-number
            v-model="imageHeight"
            :min="256"
            :max="2048"
            :step="256"
            placeholder="高度"
          />
          <div style="margin-top: 10px;">
            <el-input v-model="backgroundColor" placeholder="背景颜色">
              <template #prepend>
                <el-color-picker v-model="backgroundColor" />
              </template>
            </el-input>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="文件名">
        <el-input
          v-model="fileName"
          placeholder="世界书文件名"
        >
          <template #append>
            .{{ exportFormat }}
          </template>
        </el-input>
      </el-form-item>

      <el-alert
        v-if="exportFormat === 'png'"
        type="info"
        :closable="false"
        style="margin-top: 10px"
      >
        <template #title>
          PNG格式说明
        </template>
        <div style="margin-top: 5px;">
          PNG格式会生成一张包含世界书元数据的图片，可以导入到SillyTavern中。
          推荐使用512×512或1024×1024的尺寸。
        </div>
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" @click="handleExport" :loading="exporting">
        导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref} from 'vue'
import { ElMessage } from 'element-plus'
import { useWorldbookStore } from '@/stores/worldbook'
import {
  exportWorldbookAsJson,
  exportWorldbookAsJsonl
} from '@/services/worldbook-exporter'
import { createWorldbookPng, downloadPng } from '@/services/worldbook-png-writer'
import type { WorldbookEntry } from '@/types/worldbook'

interface Props {
  selectedCount?: number
}

const _props = withDefaults(defineProps<Props>(), {
  selectedCount: 0
})

const emit = defineEmits<{
  cancel: []
  exported: []
}>()

const worldbookStore = useWorldbookStore()

const exportFormat = ref<'json' | 'jsonl' | 'png'>('json')
const exportScope = ref<'all' | 'enabled' | 'selected'>('all')
const prettyPrint = ref(true)
const imageWidth = ref(512)
const imageHeight = ref(512)
const backgroundColor = ref('#667eea')
const fileName = ref('我的世界书')
const exporting = ref(false)

async function handleExport() {
  if (!fileName.value.trim()) {
    ElMessage.warning('请输入文件名')
    return
  }

  exporting.value = true

  try {
    // 获取要导出的条目
    let entries: WorldbookEntry[] = []

    if (exportScope.value === 'all') {
      entries = worldbookStore.entries
    } else if (exportScope.value === 'enabled') {
      entries = worldbookStore.enabledEntries
    } else if (exportScope.value === 'selected') {
      // 需要从父组件传递选中的条目
      ElMessage.warning('导出选中条目功能需要在主界面选择条目')
      return
    }

    if (entries.length === 0) {
      ElMessage.warning('没有可导出的条目')
      return
    }

    const worldbook: any = {
      entries,
      name: fileName.value,
      description: '从AI小说工坊导出的世界书',
      metadata: {
        source: 'novel_workshop' as const,
        format: 'v3',
        createdAt: new Date(),
        updatedAt: new Date(),
        totalEntries: entries.length
      }
    }

    if (exportFormat.value === 'png') {
      // 导出PNG
      const blob = await createWorldbookPng(worldbook, {
        width: imageWidth.value,
        height: imageHeight.value,
        backgroundColor: backgroundColor.value
      })

      downloadPng(blob, `${fileName.value}.png`)
      ElMessage.success(`成功导出 ${entries.length} 个条目到PNG`)
    } else if (exportFormat.value === 'json') {
      // 导出JSON
      const result = await exportWorldbookAsJson(worldbook, {
        pretty: prettyPrint.value
      })

      const blob = new Blob([result.data as string], { type: 'application/json' })

      // 下载文件
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName.value}.json`
      a.click()
      URL.revokeObjectURL(url)

      ElMessage.success(`成功导出 ${entries.length} 个条目`)
    } else if (exportFormat.value === 'jsonl') {
      // 导出JSONL
      const result = await exportWorldbookAsJsonl(worldbook)

      const blob = new Blob([result], { type: 'application/jsonl' })

      // 下载文件
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName.value}.jsonl`
      a.click()
      URL.revokeObjectURL(url)

      ElMessage.success(`成功导出 ${entries.length} 个条目`)
    }

    emit('exported')
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导出失败: ${errorMsg}`)
    console.error('导出失败:', error)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped lang="scss">
.el-form-item {
  margin-bottom: 20px;
}
</style>
