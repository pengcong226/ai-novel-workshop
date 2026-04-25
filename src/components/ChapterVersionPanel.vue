<template>
  <el-drawer v-model="visible" title="章节版本历史" size="400px">
    <div v-if="loading" v-loading="true" style="height: 100px;" />
    <div v-else-if="snapshots.length === 0" class="empty-state">
      暂无历史版本
    </div>
    <div v-else class="version-list">
      <div
        v-for="snap in snapshots"
        :key="snap.id"
        class="version-item"
        :class="{ active: selectedId === snap.id }"
        @click="selectSnapshot(snap)"
      >
        <div class="version-header">
          <span class="version-time">{{ formatShortDateTime(snap.createdAt) }}</span>
          <el-tag size="small" :type="snap.source === 'manual' ? 'warning' : 'info'">
            {{ snap.source === 'manual' ? '手动' : '自动' }}
          </el-tag>
        </div>
        <div class="version-meta">
          {{ snap.wordCount }} 字 · {{ snap.title }}
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button
        type="primary"
        :disabled="!selectedId"
        @click="handleRestore"
      >
        恢复此版本
      </el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listSnapshots, getSnapshot, type ChapterSnapshot } from '@/utils/chapterVersioning'
import { formatShortDateTime } from '@/utils/formatDate'

const props = defineProps<{
  chapterId: string
}>()

const emit = defineEmits<{
  (e: 'restore', content: string, title: string): void
}>()

const visible = defineModel<boolean>({ default: false })
const loading = ref(false)
const snapshots = ref<ChapterSnapshot[]>([])
const selectedId = ref<string | null>(null)

watch(visible, async (v) => {
  if (v && props.chapterId) {
    loading.value = true
    selectedId.value = null
    try {
      snapshots.value = await listSnapshots(props.chapterId)
    } finally {
      loading.value = false
    }
  }
})

async function selectSnapshot(_snap: ChapterSnapshot) {
  selectedId.value = _snap.id
}

async function handleRestore() {
  if (!selectedId.value) return
  const snap = await getSnapshot(selectedId.value)
  if (!snap) return

  try {
    await ElMessageBox.confirm(
      `确定恢复到 ${formatShortDateTime(snap.createdAt)} 的版本？当前内容将被替换。`,
      '恢复确认',
      { type: 'warning' }
    )
    emit('restore', snap.content, snap.title)
    visible.value = false
    ElMessage.success('已恢复到选定版本')
  } catch {
    // cancelled
  }
}

</script>

<style scoped>
.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.version-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.version-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.version-time {
  font-weight: 500;
  font-size: 14px;
}

.version-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.empty-state {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
}
</style>
