<template>
  <div class="worldbook-panel">
    <div class="worldbook-header">
      <h2>世界书管理</h2>
      <div class="worldbook-stats">
        <el-tag>总条目: {{ worldbookStore.entryCount }}</el-tag>
        <el-tag type="success">已启用: {{ worldbookStore.enabledEntryCount }}</el-tag>
        <el-tag type="warning">Token预算: {{ totalTokenBudget }}</el-tag>
      </div>
    </div>

    <div class="worldbook-toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索条目..."
        prefix-icon="Search"
        clearable
        style="width: 300px"
      />

      <el-select v-model="filterGroup" placeholder="按分组筛选" clearable style="width: 200px">
        <el-option
          v-for="group in worldbookStore.groups"
          :key="group.id"
          :label="group.name"
          :value="group.id"
        />
      </el-select>

      <el-select v-model="filterEnabled" placeholder="启用状态" clearable style="width: 150px">
        <el-option label="已启用" :value="true" />
        <el-option label="已禁用" :value="false" />
      </el-select>

      <el-select v-model="sortBy" placeholder="排序方式" style="width: 180px">
        <el-option label="插入顺序" value="insertion_order" />
        <el-option label="优先级" value="priority" />
        <el-option label="标题" value="title" />
        <el-option label="创建时间" value="created_at" />
        <el-option label="更新时间" value="updated_at" />
      </el-select>

      <el-button-group>
        <el-button @click="handleImport">导入</el-button>
        <el-button @click="handleExport">导出</el-button>
        <el-button type="primary" @click="handleCreate">新建条目</el-button>
      </el-button-group>
    </div>

    <div class="worldbook-content">
      <el-table
        :data="filteredEntries"
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />

        <el-table-column prop="insertion_order" label="顺序" width="70" sortable />

        <el-table-column prop="priority" label="优先级" width="90" sortable>
          <template #default="{ row }">
            <el-tag :type="getPriorityTagType(row.priority)">
              {{ row.priority }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="title" label="标题" min-width="180">
          <template #default="{ row }">
            <div class="entry-title">
              <el-icon v-if="!row.enabled"><Hide /></el-icon>
              <span>{{ row.title || '无标题' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="关键词" min-width="200">
          <template #default="{ row }">
            <div class="keywords-cell">
              <el-tag
                v-for="(key, index) in (row.keys || []).slice(0, 3)"
                :key="index"
                size="small"
                class="keyword-tag"
              >
                {{ key }}
              </el-tag>
              <el-tag v-if="(row.keys || []).length > 3" size="small" type="info">
                +{{ (row.keys || []).length - 3 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="group" label="分组" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.group" size="small">
              {{ getGroupName(row.group) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Token" width="90">
          <template #default="{ row }">
            <span class="token-count">{{ estimateTokenCount(row) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="primary"
              @click="handleDuplicate(row)"
            >
              复制
            </el-button>
            <el-button
              link
              type="danger"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="batch-actions" v-if="selectedEntries.length > 0">
        <el-button @click="handleBatchEnable">批量启用</el-button>
        <el-button @click="handleBatchDisable">批量禁用</el-button>
        <el-button type="danger" @click="handleBatchDelete">批量删除</el-button>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <WorldbookEntryEditor
      v-if="editDialogVisible"
      :entry="editingEntry"
      :mode="editorMode"
      @save="handleSave"
      @cancel="editDialogVisible = false"
    />

    <!-- 导入对话框 -->
    <UnifiedImportDialog
      v-model:visible="importDialogVisible"
      @imported="handleImportComplete"
    />

    <!-- 导出对话框 -->
    <WorldbookExportDialog
      v-if="exportDialogVisible"
      :selected-count="selectedEntries.length"
      @exported="handleExportComplete"
      @cancel="exportDialogVisible = false"
    />

    <!-- 分组管理对话框 -->
    <el-dialog
      v-model="groupDialogVisible"
      title="分组管理"
      width="600px"
    >
      <div class="group-list">
        <div
          v-for="group in worldbookStore.groups"
          :key="group.id"
          class="group-item"
        >
          <el-input v-model="group.name" placeholder="分组名称" />
          <el-color-picker v-model="group.color" />
          <el-button
            link
            type="danger"
            @click="handleDeleteGroup(group.id)"
          >
            删除
          </el-button>
        </div>
      </div>
      <el-button @click="handleCreateGroup">新建分组</el-button>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Hide } from '@element-plus/icons-vue'
import { useWorldbookStore } from '@/stores/worldbook'
import WorldbookEntryEditor from './WorldbookEntryEditor.vue'
import UnifiedImportDialog from './UnifiedImportDialog.vue'
import WorldbookExportDialog from './WorldbookExportDialog.vue'
import type { WorldbookEntry } from '@/types/worldbook'

const worldbookStore = useWorldbookStore()

// 搜索和筛选
const searchQuery = ref('')
const filterGroup = ref<string>()
const filterEnabled = ref<boolean>()
const sortBy = ref<string>('insertion_order')

// 选择
const selectedEntries = ref<WorldbookEntry[]>([])

// 对话框
const editDialogVisible = ref(false)
const importDialogVisible = ref(false)
const exportDialogVisible = ref(false)
const groupDialogVisible = ref(false)
const editingEntry = ref<WorldbookEntry | null>(null)
const editorMode = ref<'create' | 'edit'>('create')

// 计算属性
const totalTokenBudget = computed(() => {
  return worldbookStore.entries
    .filter(e => e.enabled)
    .reduce((sum, e) => sum + estimateTokenCount(e), 0)
})

const filteredEntries = computed(() => {
  let entries = [...worldbookStore.entries]

  // 搜索
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    entries = entries.filter(e =>
      e.title.toLowerCase().includes(query) ||
      e.content.toLowerCase().includes(query) ||
      e.keys.some(k => k.toLowerCase().includes(query))
    )
  }

  // 分组筛选
  if (filterGroup.value) {
    entries = entries.filter(e => e.group === filterGroup.value)
  }

  // 启用状态筛选
  if (filterEnabled.value !== undefined) {
    entries = entries.filter(e => e.enabled === filterEnabled.value)
  }

  // 排序
  entries.sort((a, b) => {
    switch (sortBy.value) {
      case 'insertion_order':
        return a.insertion_order - b.insertion_order
      case 'priority':
        return b.priority - a.priority
      case 'title':
        return a.title.localeCompare(b.title)
      case 'created_at':
        return b.created_at - a.created_at
      case 'updated_at':
        return b.updated_at - a.updated_at
      default:
        return 0
    }
  })

  return entries
})

// 方法
function estimateTokenCount(entry: WorldbookEntry): number {
  // 简单估算：中文约 1.5 字符/token，英文约 0.25 词/token
  const content = entry.content
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
  return Math.ceil(chineseChars / 1.5 + englishWords / 4)
}

function getPriorityTagType(priority: number): 'danger' | 'warning' | 'info' {
  if (priority >= 80) return 'danger'
  if (priority >= 50) return 'warning'
  return 'info'
}

function getGroupName(groupId: string): string {
  const group = worldbookStore.groups.find(g => g.id === groupId)
  return group?.name || ''
}

function handleSelectionChange(selection: WorldbookEntry[]) {
  selectedEntries.value = selection
}

function handleCreate() {
  editingEntry.value = null
  editorMode.value = 'create'
  editDialogVisible.value = true
}

function handleEdit(entry: WorldbookEntry) {
  editingEntry.value = { ...entry }
  editorMode.value = 'edit'
  editDialogVisible.value = true
}

async function handleDuplicate(entry: WorldbookEntry) {
  const duplicated: WorldbookEntry = {
    ...entry,
    id: crypto.randomUUID(),
    title: `${entry.title} (副本)`,
    created_at: Date.now(),
    updated_at: Date.now()
  }
  await worldbookStore.addEntry(duplicated)
  ElMessage.success('条目已复制')
}

async function handleDelete(entry: WorldbookEntry) {
  try {
    await ElMessageBox.confirm(`确定删除条目 "${entry.title}" 吗？`, '确认删除', {
      type: 'warning'
    })
    await worldbookStore.deleteEntry(entry.uid)
    ElMessage.success('条目已删除')
  } catch {
    // 用户取消
  }
}

async function handleSave(entry: WorldbookEntry) {
  if (editorMode.value === 'create') {
    await worldbookStore.addEntry(entry)
    ElMessage.success('条目已创建')
  } else {
    await worldbookStore.updateEntry(entry.uid, entry)
    ElMessage.success('条目已更新')
  }
  editDialogVisible.value = false
}

function handleImport() {
  importDialogVisible.value = true
}

function handleExport() {
  exportDialogVisible.value = true
}

function handleImportComplete(result: any) {
  importDialogVisible.value = false
  if (result.success) {
    let msg = '导入成功！'
    if (result.worldbook?.imported) {
      msg += `\n世界书: ${result.worldbook.entriesCount}条`
    }
    if (result.characterCard?.imported) {
      msg += `\n角色: ${result.characterCard.name}`
    }
    if (result.regexScripts?.imported) {
      msg += `\n正则脚本: ${result.regexScripts.count}个`
    }
    if (result.prompts?.imported) {
      msg += `\n提示词: ${result.prompts.count}个`
    }
    ElMessage.success(msg)
  } else {
    ElMessage.error(result.errors?.join('\n') || '导入失败')
  }
}

function handleExportComplete() {
  exportDialogVisible.value = false
  ElMessage.success('导出成功')
}

async function handleBatchEnable() {
  for (const entry of selectedEntries.value) {
    await worldbookStore.updateEntry(entry.uid, { enabled: true })
  }
  ElMessage.success(`已启用 ${selectedEntries.value.length} 个条目`)
}

async function handleBatchDisable() {
  for (const entry of selectedEntries.value) {
    await worldbookStore.updateEntry(entry.uid, { enabled: false })
  }
  ElMessage.success(`已禁用 ${selectedEntries.value.length} 个条目`)
}

async function handleBatchDelete() {
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selectedEntries.value.length} 个条目吗？`, '批量删除', {
      type: 'warning'
    })
    for (const entry of selectedEntries.value) {
      await worldbookStore.deleteEntry(entry.uid)
    }
    ElMessage.success(`已删除 ${selectedEntries.value.length} 个条目`)
  } catch {
    // 用户取消
  }
}

function handleCreateGroup() {
  worldbookStore.createGroup('新分组', '#409EFF')
}

function handleDeleteGroup(groupId: string) {
  worldbookStore.deleteGroup(groupId)
}

onMounted(() => {
  worldbookStore.loadWorldbook()
})
</script>

<style scoped lang="scss">
.worldbook-panel {
  padding: 20px;
}

.worldbook-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h2 {
    margin: 0;
  }

  .worldbook-stats {
    display: flex;
    gap: 10px;
  }
}

.worldbook-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.worldbook-content {
  background: white;
  border-radius: 4px;
  padding: 20px;
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 5px;
}

.keywords-cell {
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

.token-count {
  font-family: monospace;
  color: #606266;
}

.batch-actions {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dcdfe6;
  display: flex;
  gap: 10px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.group-item {
  display: flex;
  gap: 10px;
  align-items: center;
}
</style>
