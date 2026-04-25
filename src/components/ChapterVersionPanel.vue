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
        <div class="version-actions">
          <el-button size="small" text type="danger" @click.stop="handleDelete(snap.id)">
            删除
          </el-button>
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
import { listSnapshots, getSnapshot, deleteSnapshot, type ChapterSnapshot } from '@/utils/chapterVersioning'
import { formatShortDateTime } from '@/utils/formatDate'
import { getLogger } from '@/utils/logger'
import { getErrorMessage } from '@/utils/getErrorMessage'

const props = defineProps<{
  projectId: string
  chapterId: string
}>()

const emit = defineEmits<{
  (e: 'restore', content: string, title: string): void
}>()

const logger = getLogger('chapter-version-panel')

const visible = defineModel<boolean>({ default: false })
const loading = ref(false)
const snapshots = ref<ChapterSnapshot[]>([])
const selectedId = ref<string | null>(null)

async function loadSnapshots() {
  if (!props.chapterId || !props.projectId) {
    snapshots.value = []
    selectedId.value = null
    return
  }
  loading.value = true
  selectedId.value = null
  try {
    snapshots.value = await listSnapshots(props.chapterId, props.projectId)
  } finally {
    loading.value = false
  }
}

watch(visible, async (v) => {
  if (v) {
    await loadSnapshots()
  }
})

watch(() => [props.projectId, props.chapterId], async () => {
  snapshots.value = []
  selectedId.value = null
  if (visible.value) {
    await loadSnapshots()
  }
})

async function selectSnapshot(_snap: ChapterSnapshot) {
  selectedId.value = _snap.id
}

async function handleRestore() {
  if (!selectedId.value) return
  const snap = await getSnapshot(selectedId.value, props.projectId, props.chapterId)
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

async function handleDelete(snapshotId: string) {
  try {
    await ElMessageBox.confirm('确定删除这个历史版本？此操作不可撤销。', '删除确认', { type: 'warning' })
  } catch {
    return
  }

  try {
    await deleteSnapshot(snapshotId, props.projectId, props.chapterId)
    if (selectedId.value === snapshotId) {
      selectedId.value = null
    }
    await loadSnapshots()
    ElMessage.success('历史版本已删除')
  } catch (error) {
    logger.error('删除章节历史版本失败', error)
    ElMessage.error('删除失败：' + getErrorMessage(error))
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

.version-actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
}

.empty-state {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
}
</style>
