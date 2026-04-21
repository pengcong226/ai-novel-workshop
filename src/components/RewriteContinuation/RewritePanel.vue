<template>
  <el-dialog v-model="visible" title="改写章节" width="600px" @close="$emit('close')">
    <el-form label-width="120px" size="small">
      <el-form-item label="改写范围">
        <el-col :span="10">
          <el-input-number v-model="rangeStart" :min="1" :max="rangeEnd" controls-position="right" />
        </el-col>
        <el-col :span="2" style="text-align: center;">—</el-col>
        <el-col :span="10">
          <el-input-number v-model="rangeEnd" :min="rangeStart" :max="totalChapters" controls-position="right" />
        </el-col>
      </el-form-item>

      <el-form-item label="改写说明">
        <span class="range-info">将重写第{{ rangeStart }}-{{ rangeEnd }}章 (共{{ rangeEnd - rangeStart + 1 }}章)</span>
      </el-form-item>

      <el-form-item label="新方向">
        <el-input
          v-model="newDirectionPrompt"
          type="textarea"
          :rows="4"
          placeholder="例如：将主角的反派设定改为卧底，第三章的战斗改为智斗，保留关键伏笔..."
        />
      </el-form-item>

      <el-form-item label="基线快照">
        <div v-if="baselineEntities.length > 0" class="snapshot-preview">
          <el-tag v-for="e in baselineEntities.slice(0, 10)" :key="e.entityId" size="small" style="margin: 2px;">
            {{ e.entityName }}
          </el-tag>
          <span v-if="baselineEntities.length > 10" class="more-tag">
            +{{ baselineEntities.length - 10 }} 更多
          </span>
        </div>
        <span v-else class="form-hint">设置范围后显示该章节的实体状态</span>
      </el-form-item>

      <el-form-item label="提取情节事件">
        <el-switch v-model="extractPlotEvents" />
      </el-form-item>

      <el-form-item label="防吃书验证">
        <el-switch v-model="enableAntiRetcon" />
      </el-form-item>

      <el-form-item label="自动保存">
        <el-switch v-model="autoSave" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="warning" @click="handleStart" :loading="isRunning">
        开始改写
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'
import { useRewriteContinuation } from '@/composables/useRewriteContinuation'
import type { EntityStateSnapshot } from '@/types/rewrite-continuation'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'started'): void
}>()

const visible = ref(true)
const sandboxStore = useSandboxStore()
const projectStore = useProjectStore()
const { isRunning, startRewrite } = useRewriteContinuation()

const totalChapters = computed(() => {
  return projectStore.currentProject?.chapters.length || 0
})

const rangeStart = ref(1)
const rangeEnd = ref(totalChapters.value)
const newDirectionPrompt = ref('')
const extractPlotEvents = ref(true)
const enableAntiRetcon = ref(true)
const autoSave = ref(true)

const baselineEntities = ref<EntityStateSnapshot[]>([])

watch([rangeStart], () => {
  if (rangeStart.value > 1) {
    baselineEntities.value = sandboxStore.getStateSnapshotAt(rangeStart.value - 1)
  } else {
    baselineEntities.value = sandboxStore.getStateSnapshotAt(1)
  }
}, { immediate: true })

async function handleStart() {
  if (!newDirectionPrompt.value.trim()) {
    return
  }

  await startRewrite({
    range: { start: rangeStart.value, end: rangeEnd.value },
    newDirectionPrompt: newDirectionPrompt.value,
    extractPlotEvents: extractPlotEvents.value,
    enableAntiRetcon: enableAntiRetcon.value,
    autoSave: autoSave.value
  })

  visible.value = false
  emit('started')
}
</script>

<style scoped>
.range-info {
  font-size: 12px;
  color: #e6a23c;
  font-weight: 500;
}

.snapshot-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.more-tag {
  font-size: 11px;
  color: #909399;
  margin-left: 4px;
}

.form-hint {
  color: #909399;
  font-size: 12px;
}
</style>