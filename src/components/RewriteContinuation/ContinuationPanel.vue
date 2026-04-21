<template>
  <el-dialog v-model="visible" title="续写小说" width="500px" @close="$emit('close')">
    <el-form label-width="120px" size="small">
      <el-form-item label="最后一章">
        <el-tag>{{ lastChapter }}</el-tag>
      </el-form-item>

      <el-form-item label="起始章节">
        <el-input-number v-model="options.startChapter" :min="lastChapter + 1" :max="9999" />
      </el-form-item>

      <el-form-item label="生成章数">
        <el-input-number v-model="options.count" :min="1" :max="50" />
      </el-form-item>

      <el-form-item label="提取情节事件">
        <el-switch v-model="options.extractPlotEvents" />
        <span class="form-hint">伏笔、转折、高潮等情节追踪</span>
      </el-form-item>

      <el-form-item label="防吃书验证">
        <el-switch v-model="options.enableAntiRetcon" />
      </el-form-item>

      <el-form-item label="自动保存">
        <el-switch v-model="options.autoSave" />
      </el-form-item>

      <el-form-item label="自动抽取设定">
        <el-switch v-model="options.autoExtract" />
        <span class="form-hint">每章生成后自动提取实体和状态事件</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleStart" :loading="isRunning">
        开始续写
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useRewriteContinuation } from '@/composables/useRewriteContinuation'
import type { ContinuationOptions } from '@/types/rewrite-continuation'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'started'): void
}>()

const visible = ref(true)
const projectStore = useProjectStore()
const { isRunning, startContinuation } = useRewriteContinuation()

const lastChapter = computed(() => {
  const chapters = projectStore.currentProject?.chapters || []
  if (chapters.length === 0) return 0
  return Math.max(...chapters.map(c => c.number))
})

const options = ref<ContinuationOptions>({
  startChapter: lastChapter.value + 1,
  count: 10,
  extractPlotEvents: true,
  enableAntiRetcon: true,
  autoSave: true,
  autoExtract: true
})

async function handleStart() {
  await startContinuation(options.value)
  visible.value = false
  emit('started')
}
</script>

<style scoped>
.form-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>