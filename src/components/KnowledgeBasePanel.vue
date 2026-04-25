<template>
  <div class="knowledge-base-panel">
    <div class="kb-header">
      <h2>知识库管理</h2>
      <div class="kb-stats">
        <el-tag>总条目: {{ totalEntries }}</el-tag>
        <el-tag type="success">已启用: {{ enabledEntries }}</el-tag>
        <el-tag type="warning">常量: {{ constantEntries }}</el-tag>
      </div>
    </div>

    <div class="kb-toolbar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索知识..."
        prefix-icon="Search"
        clearable
        style="width: 300px"
      />

      <el-select v-model="filterCategory" placeholder="按分类筛选" clearable style="width: 200px">
        <el-option
          v-for="cat in categories"
          :key="cat.id"
          :label="cat.name"
          :value="cat.id"
        />
      </el-select>

      <el-select v-model="sortBy" placeholder="排序方式" style="width: 180px">
        <el-option label="UID" value="uid" />
        <el-option label="标题" value="comment" />
        <el-option label="使用次数" value="usageCount" />
        <el-option label="更新时间" value="updatedAt" />
      </el-select>

      <el-button-group>
        <el-button @click="handleImport">导入</el-button>
        <el-button @click="handleExport">导出</el-button>
        <el-button type="primary" @click="handleCreate">新建条目</el-button>
      </el-button-group>
    </div>

    <div class="kb-content">
      <el-table
        :data="filteredEntries"
        style="width: 100%"
        @row-click="handleRowClick"
      >
        <el-table-column prop="uid" label="UID" width="80" sortable />

        <el-table-column prop="comment" label="标题/分类" min-width="200">
          <template #default="{ row }">
            <div class="entry-title">
              <el-icon v-if="row.disable"><Hide /></el-icon>
              <el-icon v-if="row.constant"><Star /></el-icon>
              <span>{{ row.comment || '无标题' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="分类" width="150">
          <template #default="{ row }">
            <el-tag size="small" :type="getCategoryColor(row.category)">
              {{ getCategoryLabel(row.category) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="标签" min-width="200">
          <template #default="{ row }">
            <div class="tags-cell">
              <el-tag
                v-for="(tag, index) in (row.tags || []).slice(0, 3)"
                :key="index"
                size="small"
                class="tag-item"
              >
                {{ tag }}
              </el-tag>
              <el-tag v-if="(row.tags || []).length > 3" size="small" type="info">
                +{{ (row.tags || []).length - 3 }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.disable ? 'danger' : 'success'" size="small">
              {{ row.disable ? '禁用' : '启用' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="使用" width="80">
          <template #default="{ row }">
            <span class="usage-count">{{ row.usageCount || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="内容预览" min-width="200">
          <template #default="{ row }">
            <div class="content-preview">
              {{ row.content?.substring(0, 100) || '无内容' }}...
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="handleEdit(row)">
              编辑
            </el-button>
            <el-button link type="primary" @click.stop="handleCopy(row)">
              复制
            </el-button>
            <el-button link type="danger" @click.stop="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 知识条目详情抽屉 -->
    <el-drawer
      v-model="detailDrawerVisible"
      :title="currentEntry?.comment || '知识条目详情'"
      size="60%"
    >
      <div v-if="currentEntry" class="entry-detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="UID">
            {{ currentEntry.uid }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentEntry.disable ? 'danger' : 'success'">
              {{ currentEntry.disable ? '禁用' : '启用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="常量">
            <el-tag :type="currentEntry.constant ? 'warning' : 'info'">
              {{ currentEntry.constant ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="分类">
            <el-tag>{{ getCategoryLabel(currentEntry.category) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标签" :span="2">
            <el-tag
              v-for="tag in currentEntry.tags"
              :key="tag"
              size="small"
              style="margin-right: 5px"
            >
              {{ tag }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="使用次数">
            {{ currentEntry.usageCount || 0 }}
          </el-descriptions-item>
          <el-descriptions-item label="最后使用">
            {{ currentEntry.lastUsedAt || '从未使用' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-divider>内容</el-divider>

        <div class="entry-content">
          <pre>{{ currentEntry.content }}</pre>
        </div>
      </div>
    </el-drawer>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="导入知识库"
      width="600px"
    >
      <el-upload
        :auto-upload="false"
        :on-change="handleFileChange"
        :file-list="importFileList"
        accept=".json"
        drag
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持SillyTavern Character Book格式的JSON文件
          </div>
        </template>
      </el-upload>

      <el-form label-width="140px" style="margin-top: 20px">
        <el-form-item label="自动分类">
          <el-switch v-model="importOptions.autoCategorize" />
        </el-form-item>
        <el-form-item label="提取标签">
          <el-switch v-model="importOptions.extractTags" />
        </el-form-item>
        <el-form-item label="设为常量">
          <el-switch v-model="importOptions.setAsConstant" />
        </el-form-item>
        <el-form-item label="默认禁用">
          <el-switch v-model="importOptions.defaultDisabled" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="executeImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Hide, Star, UploadFilled } from '@element-plus/icons-vue'
import { createKnowledgeBaseManager } from '@/services/knowledge-base'
import type { KnowledgeEntry, KnowledgeCategory } from '@/types/knowledge-base'
import { getLogger } from '@/utils/logger'
const logger = getLogger('components:KnowledgeBasePanel')

const kbManager = createKnowledgeBaseManager()

const searchQuery = ref('')
const filterCategory = ref<string>()
const sortBy = ref('uid')
const detailDrawerVisible = ref(false)
const importDialogVisible = ref(false)
const importFileList = ref<any[]>([])
const currentEntry = ref<KnowledgeEntry | null>(null)
const entries = ref<KnowledgeEntry[]>([])

const importOptions = ref({
  autoCategorize: true,
  extractTags: true,
  setAsConstant: true,
  defaultDisabled: true
})

const categories = [
  { id: 'api_documentation', name: 'API文档', color: 'primary' },
  { id: 'tutorial', name: '教程', color: 'success' },
  { id: 'best_practice', name: '最佳实践', color: 'warning' },
  { id: 'faq', name: '常见问题', color: 'danger' },
  { id: 'code_example', name: '代码示例', color: 'info' },
  { id: 'system_prompt', name: '系统提示', color: '' },
  { id: 'tool_documentation', name: '工具文档', color: '' },
  { id: 'custom', name: '自定义', color: '' }
]

const totalEntries = computed(() => entries.value.length)
const enabledEntries = computed(() => entries.value.filter(e => !e.disable).length)
const constantEntries = computed(() => entries.value.filter(e => e.constant).length)

const filteredEntries = computed(() => {
  let result = [...entries.value]

  // 搜索
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(e =>
      e.comment?.toLowerCase().includes(query) ||
      e.content?.toLowerCase().includes(query) ||
      e.tags?.some(t => t.toLowerCase().includes(query))
    )
  }

  // 分类过滤
  if (filterCategory.value) {
    result = result.filter(e => e.category === filterCategory.value)
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'uid':
        return a.uid - b.uid
      case 'comment':
        return (a.comment || '').localeCompare(b.comment || '')
      case 'usageCount':
        return (b.usageCount || 0) - (a.usageCount || 0)
      case 'updatedAt':
        return (b.metadata?.updatedAt?.getTime() || 0) -
               (a.metadata?.updatedAt?.getTime() || 0)
      default:
        return 0
    }
  })

  return result
})

function getCategoryColor(category: KnowledgeCategory): string {
  const cat = categories.find(c => c.id === category)
  return cat?.color || ''
}

function getCategoryLabel(category: KnowledgeCategory): string {
  const cat = categories.find(c => c.id === category)
  return cat?.name || category
}

function handleRowClick(row: KnowledgeEntry) {
  currentEntry.value = row
  detailDrawerVisible.value = true
}

function handleImport() {
  importDialogVisible.value = true
}

function handleFileChange(file: any) {
  importFileList.value = [file]
}

async function executeImport() {
  if (importFileList.value.length === 0) {
    ElMessage.warning('请选择文件')
    return
  }

  const file = importFileList.value[0].raw

  try {
    const result = await kbManager.importKnowledgeBase(file, importOptions.value)

    if (result.knowledgeBase) {
      entries.value = result.knowledgeBase.entries
      ElMessage.success(`成功导入 ${result.imported.length} 个条目`)

      if (result.skipped.length > 0) {
        ElMessage.warning(`跳过 ${result.skipped.length} 个条目`)
      }

      if (result.errors.length > 0) {
        logger.error('导入错误:', result.errors)
      }
    }

    importDialogVisible.value = false
    importFileList.value = []
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ElMessage.error(`导入失败: ${errorMsg}`)
  }
}

function handleExport() {
  ElMessage.info('导出功能开发中')
}

function handleCreate() {
  ElMessage.info('创建功能开发中')
}

function handleEdit(entry: KnowledgeEntry) {
  currentEntry.value = entry
  detailDrawerVisible.value = true
}

async function handleCopy(entry: KnowledgeEntry) {
  const duplicated: KnowledgeEntry = {
    ...entry,
    uid: Date.now() % 1000000,
    comment: `${entry.comment} (副本)`,
    metadata: {
      ...entry.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  entries.value.push(duplicated)
  ElMessage.success('条目已复制')
}

async function handleDelete(entry: KnowledgeEntry) {
  try {
    await ElMessageBox.confirm(
      `确定删除条目 "${entry.comment}" 吗？`,
      '确认删除',
      { type: 'warning' }
    )

    const index = entries.value.findIndex(e => e.uid === entry.uid)
    if (index !== -1) {
      entries.value.splice(index, 1)
      ElMessage.success('条目已删除')
    }
  } catch {
    // 用户取消
  }
}

onMounted(() => {
  // 加载知识库
})
</script>

<style scoped lang="scss">
.knowledge-base-panel {
  padding: 20px;
}

.kb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h2 {
    margin: 0;
  }

  .kb-stats {
    display: flex;
    gap: 10px;
  }
}

.kb-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.kb-content {
  background: white;
  border-radius: 4px;
  padding: 20px;
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 5px;
}

.tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-item {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-count {
  font-family: monospace;
  color: #606266;
}

.content-preview {
  color: #606266;
  font-size: 12px;
  line-height: 1.5;
}

.entry-detail {
  padding: 20px;
}

.entry-content {
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  max-height: 600px;
  overflow-y: auto;

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
  }
}
</style>
