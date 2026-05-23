<template>
  <div class="chapter-preview">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="title">章节列表</span>
            <el-tag>共 {{ chapters.length }} 章</el-tag>
            <el-tag type="info">总字数: {{ formatNumber(totalWords) }}</el-tag>
          </div>
          <div class="header-right">
            <el-button size="small" @click="handleRegenerate">
              <el-icon><Refresh /></el-icon>
              重新检测
            </el-button>
            <el-button size="small" type="primary" @click="handleConfirm">
              <el-icon><Select /></el-icon>
              确认章节
            </el-button>
          </div>
        </div>
      </template>

      <!-- 批量操作 -->
      <div class="batch-operations">
        <el-button-group>
          <el-button size="small" @click="handleMergeSelected" :disabled="selectedChapters.length < 2">
            <el-icon><Connection /></el-icon>
            合并选中
          </el-button>
          <el-button size="small" @click="handleDeleteSelected" :disabled="selectedChapters.length === 0">
            <el-icon><Delete /></el-icon>
            删除选中
          </el-button>
        </el-button-group>
        <el-checkbox v-model="showContent" style="margin-left: 20px;">显示内容预览</el-checkbox>
      </div>

      <!-- 章节列表 -->
      <el-table
        :data="paginatedChapters"
        @selection-change="handleSelectionChange"
        style="width: 100%"
        max-height="600"
      >
        <el-table-column type="selection" width="55" />

        <el-table-column label="章节号" prop="number" width="100" sortable>
          <template #default="{ row }">
            <el-input-number
              v-model="row.number"
              :min="1"
              size="small"
              @change="handleChapterChange"
            />
          </template>
        </el-table-column>

        <el-table-column label="标题" prop="title">
          <template #default="{ row }">
            <el-input v-model="row.title" size="small" @change="handleChapterChange" />
          </template>
        </el-table-column>

        <el-table-column label="字数" prop="wordCount" width="120" sortable>
          <template #default="{ row }">
            {{ formatNumber(row.wordCount || 0) }}
          </template>
        </el-table-column>

        <el-table-column label="位置" width="150">
          <template #default="{ row }">
            <span class="position-info">
              {{ row.startPosition }} - {{ row.endPosition }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              @click="handleEditChapter(row)"
            >
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button
              size="small"
              text
              type="danger"
              @click="handleDeleteChapter(row)"
            >
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 内容预览 -->
      <el-collapse v-if="showContent" style="margin-top: 20px;">
        <el-collapse-item
          v-for="chapter in paginatedChapters"
          :key="chapter.number"
          :title="`第${chapter.number}章 ${chapter.title}`"
        >
          <div class="content-preview">
            {{ chapter.content?.slice(0, 500) || '无内容' }}
            <div v-if="(chapter.content?.length || 0) > 500" class="more-indicator">
              ... (还有 {{ chapter.content!.length - 500 }} 字)
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="chapters.length"
          layout="total, prev, pager, next, jumper"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑章节" width="600px">
      <el-form :model="editingChapter" label-width="100px">
        <el-form-item label="章节号">
          <el-input-number v-model="editingChapter.number" :min="1" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editingChapter.title" />
        </el-form-item>
        <el-form-item label="起始位置">
          <el-input-number v-model="editingChapter.startPosition" :min="0" />
        </el-form-item>
        <el-form-item label="结束位置">
          <el-input-number v-model="editingChapter.endPosition" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Select, Connection, Delete, Edit } from '@element-plus/icons-vue'
import type { LLMChapter } from '@/utils/llm/types'

interface Props {
  modelValue: LLMChapter[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [chapters: LLMChapter[]]
  confirm: [chapters: LLMChapter[]]
  regenerate: []
}>()

const chapters = ref<LLMChapter[]>([...props.modelValue])
const selectedChapters = ref<LLMChapter[]>([])
const showContent = ref(false)
const currentPage = ref(1)
const pageSize = 20
const editDialogVisible = ref(false)
const editingChapter = ref<LLMChapter>({
  number: 0,
  title: '',
  startPosition: 0,
  endPosition: 0,
  content: '',
  wordCount: 0
})

// 监听props变化
watch(() => props.modelValue, (newChapters) => {
  chapters.value = [...newChapters]
})

// 总字数
const totalWords = computed(() => {
  return chapters.value.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
})

// 分页章节
const paginatedChapters = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return chapters.value.slice(start, end)
})

// 选择变化
function handleSelectionChange(selection: LLMChapter[]) {
  selectedChapters.value = selection
}

// 章节变化
function handleChapterChange() {
  emit('update:modelValue', chapters.value)
}

// 编辑章节
function handleEditChapter(chapter: LLMChapter) {
  editingChapter.value = { ...chapter }
  editDialogVisible.value = true
}

// 保存编辑
function handleSaveEdit() {
  const index = chapters.value.findIndex(ch => ch.number === editingChapter.value.number)
  if (index !== -1) {
    // 重新计算字数
    editingChapter.value.wordCount = countWords(editingChapter.value.content || '')
    chapters.value[index] = { ...editingChapter.value }
    emit('update:modelValue', chapters.value)
  }
  editDialogVisible.value = false
  ElMessage.success('章节已更新')
}

// 删除章节
async function handleDeleteChapter(chapter: LLMChapter) {
  try {
    await ElMessageBox.confirm(
      `确定要删除第${chapter.number}章"${chapter.title}"吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const index = chapters.value.findIndex(ch => ch.number === chapter.number)
    if (index !== -1) {
      chapters.value.splice(index, 1)
      emit('update:modelValue', chapters.value)
      ElMessage.success('章节已删除')
    }
  } catch {
    // 用户取消
  }
}

// 合并选中
async function handleMergeSelected() {
  if (selectedChapters.value.length < 2) {
    ElMessage.warning('请至少选择2个章节进行合并')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要合并选中的${selectedChapters.value.length}个章节吗？`,
      '确认合并',
      {
        confirmButtonText: '合并',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    // 按章节号排序
    const sorted = [...selectedChapters.value].sort((a, b) => a.number - b.number)

    // 创建合并后的章节
    const merged: LLMChapter = {
      number: sorted[0].number,
      title: `${sorted[0].title}（合并）`,
      startPosition: sorted[0].startPosition,
      endPosition: sorted[sorted.length - 1].endPosition,
      content: sorted.map(ch => ch.content).join('\n\n'),
      wordCount: sorted.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
    }

    // 删除原章节，插入合并章节
    const indices = sorted.map(ch => chapters.value.findIndex(c => c.number === ch.number))
    const minIndex = Math.min(...indices)

    indices.sort((a, b) => b - a).forEach(i => chapters.value.splice(i, 1))
    chapters.value.splice(minIndex, 0, merged)

    selectedChapters.value = []
    emit('update:modelValue', chapters.value)
    ElMessage.success('章节已合并')
  } catch {
    // 用户取消
  }
}

// 删除选中
async function handleDeleteSelected() {
  if (selectedChapters.value.length === 0) {
    ElMessage.warning('请先选择要删除的章节')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的${selectedChapters.value.length}个章节吗？`,
      '确认删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    selectedChapters.value.forEach(ch => {
      const index = chapters.value.findIndex(c => c.number === ch.number)
      if (index !== -1) {
        chapters.value.splice(index, 1)
      }
    })

    selectedChapters.value = []
    emit('update:modelValue', chapters.value)
    ElMessage.success('章节已删除')
  } catch {
    // 用户取消
  }
}

// 重新检测
function handleRegenerate() {
  emit('regenerate')
}

// 确认章节
function handleConfirm() {
  emit('confirm', chapters.value)
}

// 分页变化
function handlePageChange(page: number) {
  currentPage.value = page
}

// 统计字数
function countWords(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const numbers = (text.match(/\d+/g) || []).length
  return chineseChars + englishWords + numbers
}

// 格式化数字
function formatNumber(num: number): string {
  return num.toLocaleString()
}
</script>

<style scoped>
.chapter-preview {
  width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  gap: 10px;
}

.batch-operations {
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.position-info {
  font-size: 12px;
  color: #909399;
}

.content-preview {
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
  white-space: pre-wrap;
}

.more-indicator {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  font-style: italic;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
</style>
