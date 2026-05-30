<template>
  <el-dialog
    v-model="visible"
    title="一键续写"
    width="520px"
    :close-on-click-modal="false"
    @close="close"
  >
    <el-form label-width="120px" size="default">
      <el-form-item label="续写章数">
        <div class="chapter-count-row">
          <el-slider
            v-model="options.chapterCount"
            :min="1"
            :max="100"
            :step="1"
            show-input
            class="chapter-slider"
          />
        </div>
      </el-form-item>

      <el-form-item label="方向指导">
        <el-input
          v-model="options.directionPrompt"
          type="textarea"
          :rows="4"
          placeholder="可选：描述续写方向、剧情走向、角色发展等..."
        />
      </el-form-item>

      <el-form-item label="自动保存">
        <el-switch v-model="options.autoSave" />
        <span class="option-hint">续写完成后自动保存章节</span>
      </el-form-item>

      <el-form-item label="断点审查">
        <div class="checkpoint-row">
          <el-switch v-model="enableCheckpoint" />
          <template v-if="enableCheckpoint">
            <span class="checkpoint-label">每</span>
            <el-input-number
              v-model="options.checkpointInterval"
              :min="1"
              :max="50"
              size="small"
              class="checkpoint-input"
            />
            <span class="checkpoint-label">章暂停审查</span>
          </template>
          <span v-else class="option-hint">关闭后将连续续写所有章节</span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="handleStart">开始续写</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

export interface ContinueWritingOptions {
  chapterCount: number
  directionPrompt: string
  checkpointInterval: number
  autoSave: boolean
}

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start', options: ContinueWritingOptions): void
}>()

const visible = ref(true)

const enableCheckpoint = ref(false)

const options = ref<ContinueWritingOptions>({
  chapterCount: 10,
  directionPrompt: '',
  checkpointInterval: 5,
  autoSave: true,
})

watch(visible, (val) => {
  if (!val) {
    emit('close')
  }
})

function close() {
  visible.value = false
}

function handleStart() {
  if (options.value.chapterCount < 1) {
    ElMessage.warning('续写章数至少为 1')
    return
  }

  const result: ContinueWritingOptions = {
    chapterCount: options.value.chapterCount,
    directionPrompt: options.value.directionPrompt,
    checkpointInterval: enableCheckpoint.value ? options.value.checkpointInterval : 0,
    autoSave: options.value.autoSave,
  }

  emit('start', result)
  close()
}
</script>

<style scoped>
.chapter-count-row {
  width: 100%;
}

.chapter-slider {
  width: 100%;
}

.option-hint {
  display: inline-block;
  font-size: 12px;
  color: var(--ds-text-tertiary, var(--el-text-color-secondary));
  margin-left: 12px;
}

.checkpoint-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.checkpoint-label {
  font-size: 13px;
  color: var(--ds-text-secondary, var(--el-text-color-regular));
}

.checkpoint-input {
  width: 120px;
}
</style>
