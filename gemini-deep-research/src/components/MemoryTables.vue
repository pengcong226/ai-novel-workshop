<template>
  <div class="memory-tables-enhanced">
    <!-- 头部工具栏 -->
    <el-card class="header-card">
      <div class="header">
        <h2>表格记忆系统</h2>
        <div class="actions">
          <!-- 撤销/重做 -->
          <el-button-group>
            <el-tooltip content="撤销 (Ctrl+Z)" :disabled="!canUndo">
              <el-button :disabled="!canUndo" @click="undo">
                <el-icon><Back /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="重做 (Ctrl+Y)" :disabled="!canRedo">
              <el-button :disabled="!canRedo" @click="redo">
                <el-icon><Right /></el-icon>
              </el-button>
            </el-tooltip>
          </el-button-group>

          <el-divider direction="vertical" />

          <!-- 导入导出 -->
          <el-dropdown @command="handleExportCommand">
            <el-button>
              <el-icon><Download /></el-icon>
              导出
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="xlsx">导出为 Excel</el-dropdown-item>
                <el-dropdown-item command="csv">导出为 CSV</el-dropdown-item>
                <el-dropdown-item command="json">导出为 JSON</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-dropdown @command="handleImportCommand">
            <el-button>
              <el-icon><Upload /></el-icon>
              导入
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="file">从文件导入</el-dropdown-item>
                <el-dropdown-item command="template">从模板创建</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-divider direction="vertical" />

          <el-button type="primary" @click="showAIUpdateDialog = true">
            <el-icon><MagicStick /></el-icon>
            AI分析更新状态
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 表格标签页 -->
    <el-tabs v-model="activeSheet" class="content" @tab-click="handleSheetChange">
      <!-- 新建表格标签 -->
      <el-tab-pane name="__new__">
        <template #label>
          <el-button type="primary" size="small" @click="showNewSheetDialog">
            <el-icon><Plus /></el-icon>
            新建表格
          </el-button>
        </template>
      </el-tab-pane>

      <el-tab-pane
        v-for="sheet in memory.sheets"
        :key="sheet.uid"
        :label="sheet.name"
        :name="sheet.uid"
        lazy
      >
        <div class="sheet-container">
          <!-- 表格说明和控制 -->
          <div class="sheet-header">
            <el-alert
              v-if="sheet.note"
              :title="sheet.note"
              type="info"
              :closable="false"
              show-icon
            />
            <div class="sheet-controls">
              <el-button type="primary" size="small" @click="addRow">
                <el-icon><Plus /></el-icon>
                添加行
              </el-button>
              <el-button size="small" @click="showBatchEditDialog">
                <el-icon><Edit /></el-icon>
                批量编辑
              </el-button>
              <el-button size="small" @click="showChartDialog = true">
                <el-icon><TrendCharts /></el-icon>
                图表分析
              </el-button>
              <el-button size="small" @click="showEditRules = true">
                <el-icon><Document /></el-icon>
                编辑规则
              </el-button>
              <el-button size="small" @click="showSheetSettings = true">
                <el-icon><Setting /></el-icon>
                设置
              </el-button>
              <el-tag v-if="sheet.triggerSend" type="success" size="small">
                触发式更新 (深度: {{ sheet.triggerSendDeep }})
              </el-tag>
            </div>
          </div>

          <!-- 增强的表格 -->
          <div class="table-wrapper" v-loading="tableLoading">
            <el-table
              ref="tableRef"
              :data="tableData"
              border
              stripe
              highlight-current-row
              @selection-change="handleSelectionChange"
              @cell-dblclick="handleCellDblClick"
              @sort-change="handleSortChange"
              style="width: 100%"
              :max-height="600"
              row-key="rowKey"
            >
              <!-- 选择列 -->
              <el-table-column type="selection" width="55" fixed />

              <!-- 行号列 -->
              <el-table-column
                prop="rowIndex"
                label="#"
                width="60"
                fixed
                align="center"
              />

              <!-- 数据列 -->
              <el-table-column
                v-for="(col, index) in tableColumns"
                :key="index"
                :prop="`col_${index}`"
                :label="col.label"
                :sortable="'custom'"
                :min-width="col.width || 150"
                :resizable="true"
              >
                <template #header="scope">
                  <div class="column-header">
                    <span>{{ col.label }}</span>
                    <el-button
                      text
                      size="small"
                      @click.stop="editColumn(scope.$index)"
                      class="column-edit-btn"
                    >
                      <el-icon><Edit /></el-icon>
                    </el-button>
                  </div>
                </template>
                <template #default="scope">
                  <div
                    class="cell-content"
                    :class="{
                      'cell-error': hasError(scope.$index, index),
                      'cell-required': col.required
                    }"
                  >
                    <!-- 编辑模式 -->
                    <el-input
                      v-if="
                        editingCell &&
                        editingCell.rowIndex === scope.$index &&
                        editingCell.colIndex === index
                      "
                      v-model="editingCell.value"
                      size="small"
                      @blur="saveCellEdit"
                      @keyup.enter="saveCellEdit"
                      @keyup.esc="cancelCellEdit"
                      ref="editInput"
                    />
                    <!-- 显示模式 -->
                    <template v-else>
                      <span>{{ scope.row[`col_${index}`] }}</span>
                      <el-icon
                        v-if="hasError(scope.$index, index)"
                        class="error-icon"
                        :title="getError(scope.$index, index)"
                      >
                        <WarningFilled />
                      </el-icon>
                    </template>
                  </div>
                </template>
              </el-table-column>

              <!-- 操作列 -->
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="scope">
                  <el-button
                    text
                    type="primary"
                    size="small"
                    @click="editRow(scope.$index)"
                  >
                    编辑
                  </el-button>
                  <el-button
                    text
                    type="danger"
                    size="small"
                    @click="deleteRowConfirm(scope.$index)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <!-- 批量操作栏 -->
          <transition name="slide-up">
            <div v-if="selectedRows.length > 0" class="batch-actions">
              <span>已选择 {{ selectedRows.length }} 行</span>
              <el-button size="small" @click="batchDelete">
                批量删除
              </el-button>
              <el-button size="small" @click="batchCopy">
                批量复制
              </el-button>
              <el-button size="small" @click="clearSelection">
                取消选择
              </el-button>
            </div>
          </transition>

          <!-- CSV 预览 -->
          <el-collapse class="csv-preview">
            <el-collapse-item title="CSV 格式预览" name="csv">
              <pre>{{ getSheetCSV(sheet) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 编辑单元格对话框 -->
    <el-dialog
      v-model="editCellDialog"
      title="编辑单元格"
      width="500px"
    >
      <el-input
        v-model="editCellValue"
        type="textarea"
        :rows="3"
        placeholder="单元格内容"
      />
      <template #footer>
        <el-button @click="editCellDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCell">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑行对话框 -->
    <el-dialog
      v-model="editRowDialog"
      :title="editRowIndex === -1 ? '添加行' : '编辑行'"
      width="800px"
    >
      <el-form label-width="100px">
        <el-form-item
          v-for="(header, index) in currentSheet ? getHeaderRow(currentSheet) : []"
          :key="index"
          :label="header.value"
          :required="tableColumns[index]?.required"
        >
          <el-input
            v-model="editRowValues[index]"
            :placeholder="'请输入' + header.value"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editRowDialog = false">取消</el-button>
        <el-button type="primary" @click="saveRow">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量编辑对话框 -->
    <el-dialog
      v-model="batchEditDialog"
      title="批量编辑"
      width="600px"
    >
      <el-form label-width="120px">
        <el-form-item label="选择列">
          <el-select v-model="batchEditColumn" placeholder="选择要编辑的列">
            <el-option
              v-for="(col, index) in tableColumns"
              :key="index"
              :label="col.label"
              :value="index"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-radio-group v-model="batchEditType">
            <el-radio value="set">设置为</el-radio>
            <el-radio value="replace">替换</el-radio>
            <el-radio value="append">追加</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="查找内容" v-if="batchEditType === 'replace'">
          <el-input v-model="batchEditFind" placeholder="要查找的内容" />
        </el-form-item>
        <el-form-item :label="batchEditType === 'replace' ? '替换为' : '内容'">
          <el-input
            v-model="batchEditValue"
            type="textarea"
            :rows="3"
            placeholder="内容"
          />
        </el-form-item>
        <el-form-item label="应用范围">
          <el-radio-group v-model="batchEditScope">
            <el-radio value="selected">选中的行 ({{ selectedRows.length }} 行)</el-radio>
            <el-radio value="all">所有行</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchEditDialog = false">取消</el-button>
        <el-button type="primary" @click="applyBatchEdit">应用</el-button>
      </template>
    </el-dialog>

    <!-- 编辑规则对话框 -->
    <el-dialog
      v-model="showEditRules"
      title="表格编辑规则"
      width="600px"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      >
        <template #title>
          AI 可执行以下命令来更新表格
        </template>
      </el-alert>
      <pre class="rules-preview">{{ getEditRules(currentSheet) }}</pre>
    </el-dialog>

    <!-- 图表对话框 -->
    <el-dialog
      v-model="showChartDialog"
      title="数据可视化"
      width="900px"
      top="5vh"
    >
      <TableChart
        v-if="currentSheet"
        :columns="tableColumns.map(c => c.label)"
        :data="tableData.map(row => tableColumns.map((_, i) => row[`col_${i}`] || ''))"
      />
    </el-dialog>

    <!-- 表格设置对话框 -->
    <el-dialog
      v-model="showSheetSettings"
      title="表格设置"
      width="600px"
    >
      <el-form label-width="120px" v-if="currentSheet">
        <el-form-item label="表格名称">
          <el-input v-model="currentSheet.name" />
        </el-form-item>
        <el-form-item label="表格说明">
          <el-input
            v-model="currentSheet.note"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        <el-form-item label="触发式更新">
          <el-switch v-model="currentSheet.triggerSend" />
          <el-text size="small" type="info">
            启用后只发送与最近内容相关的行
          </el-text>
        </el-form-item>
        <el-form-item
          v-if="currentSheet.triggerSend"
          label="检查深度"
        >
          <el-input-number
            v-model="currentSheet.triggerSendDeep"
            :min="1"
            :max="20"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSheetSettings = false">取消</el-button>
        <el-button type="primary" @click="saveSheetSettings">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新建表格对话框 -->
    <el-dialog
      v-model="showNewSheetDialog"
      title="新建表格"
      width="600px"
    >
      <el-form label-width="120px">
        <el-form-item label="表格名称">
          <el-input v-model="newSheetName" placeholder="请输入表格名称" />
        </el-form-item>
        <el-form-item label="从模板创建">
          <el-select v-model="newSheetTemplate" placeholder="选择模板（可选）">
            <el-option label="空白表格" value="blank" />
            <el-option
              v-for="(template, key) in TABLE_TEMPLATES"
              :key="key"
              :label="template.name"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="newSheetTemplate && newSheetTemplate !== 'blank'" label="模板说明">
          <el-text type="info">{{ TABLE_TEMPLATES[newSheetTemplate]?.note }}</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewSheetDialog = false">取消</el-button>
        <el-button type="primary" @click="createNewSheet">创建</el-button>
      </template>
    </el-dialog>

    <!-- 导入文件对话框 -->
    <el-dialog
      v-model="importFileDialog"
      title="导入文件"
      width="500px"
    >
      <el-upload
        drag
        action="#"
        :auto-upload="false"
        :on-change="handleImportFile"
        accept=".xlsx,.xls,.csv,.json"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持 Excel (.xlsx, .xls)、CSV、JSON 文件
          </div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importFileDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmImport">确认导入</el-button>
      </template>
    </el-dialog>

    <!-- 编辑列名对话框 -->
    <el-dialog
      v-model="editColumnDialog"
      title="编辑列"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="列名">
          <el-input v-model="editColumnName" />
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="editColumnRequired" />
        </el-form-item>
        <el-form-item label="列宽">
          <el-input-number v-model="editColumnWidth" :min="100" :max="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editColumnDialog = false">取消</el-button>
        <el-button type="primary" @click="saveColumnEdit">保存</el-button>
        <el-button type="danger" @click="deleteColumn">删除列</el-button>
      </template>
    </el-dialog>

    <!-- AI 分析更新状态对话框 -->
    <el-dialog
      v-model="showAIUpdateDialog"
      title="从章节分析表格更新"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="章节范围">
          <el-input-number v-model="aiUpdateRange.start" :min="1" :max="project?.chapters?.length || 1" />
          <span style="margin: 0 10px;">至</span>
          <el-input-number v-model="aiUpdateRange.end" :min="aiUpdateRange.start" :max="project?.chapters?.length || 1" />
        </el-form-item>
        <el-form-item label="每批处理章数">
          <el-input-number v-model="aiUpdateBatchSize" :min="1" :max="10" />
          <div style="font-size: 12px; color: #909399; margin-left: 10px; line-height: 1.2; margin-top: 6px;">
            设置越大速度越快，但如果单章字数过多可能会导致AI遗漏细节或超出输入限制。推荐 3-5。
          </div>
        </el-form-item>
      </el-form>
      <div v-if="aiUpdating" style="margin-top: 20px; text-align: center; color: #409eff;">
        <el-icon class="is-loading" style="margin-right: 8px;"><Loading /></el-icon>
        正在让 AI 阅读第 {{ aiUpdateCurrentChapter }} 章并提取状态...
      </div>
      <template #footer>
        <el-button @click="showAIUpdateDialog = false" :disabled="aiUpdating">取消</el-button>
        <el-button type="primary" @click="runAIUpdate" :loading="aiUpdating">开始分析</el-button>
      </template>
    </el-dialog>

    <!-- 列管理对话框 -->
    <el-dialog
      v-model="showColumnManager"
      title="列管理"
      width="700px"
    >
      <el-table :data="columnManagerData" border>
        <el-table-column prop="name" label="列名">
          <template #default="scope">
            <el-input v-model="scope.row.name" size="small" />
          </template>
        </el-table-column>
        <el-table-column prop="required" label="必填" width="80">
          <template #default="scope">
            <el-switch v-model="scope.row.required" size="small" />
          </template>
        </el-table-column>
        <el-table-column prop="width" label="宽度" width="120">
          <template #default="scope">
            <el-input-number
              v-model="scope.row.width"
              size="small"
              :min="100"
              :max="500"
              :step="50"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="scope">
            <el-button
              text
              size="small"
              @click="moveColumn(scope.$index, -1)"
              :disabled="scope.$index === 0"
            >
              上移
            </el-button>
            <el-button
              text
              size="small"
              @click="moveColumn(scope.$index, 1)"
              :disabled="scope.$index === columnManagerData.length - 1"
            >
              下移
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 10px">
        <el-button size="small" @click="addColumn">
          <el-icon><Plus /></el-icon>
          添加列
        </el-button>
      </div>
      <template #footer>
        <el-button @click="showColumnManager = false">取消</el-button>
        <el-button type="primary" @click="applyColumnChanges">应用更改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download,
  Upload,
  Refresh,
  Plus,
  Edit,
  Document,
  Setting,
  Back,
  Right,
  ArrowDown,
  TrendCharts,
  WarningFilled,
  MagicStick,
  Loading
} from '@element-plus/icons-vue'
import {
  MemorySystem,
  Sheet,
  initNovelMemory,
  insertRow,
  updateRow,
  deleteRow,
  getSheetCSV,
  exportMemory as exportMemoryData,
  importMemory as importMemoryData,
  updateMemoryFromChapter
} from '@/utils/tableMemory'
import {
  exportMemoryToExcel,
  exportSheetToCSV,
  importFromExcel,
  importFromCSV,
  TABLE_TEMPLATES,
  createSheetFromTemplate
} from '@/utils/tableExporter'
import {
  createHistoryManager,
  HISTORY_ACTIONS,
  generateActionDescription
} from '@/utils/tableHistory'
import { mergeSystemPrompts } from '@/utils/systemPrompts'
import TableChart from './TableChart.vue'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)

const memory = ref<MemorySystem>({
  sheets: [],
  lastUpdated: Date.now(),
  currentChapter: 1,
  currentLocation: '未知'
})

const activeSheet = ref('')
const tableRef = ref()
const tableLoading = ref(false)

// 历史管理
const historyManager = ref(createHistoryManager({ maxSize: 50 }))
const canUndo = ref(false)
const canRedo = ref(false)

// 编辑状态
const editCellDialog = ref(false)
const editRowDialog = ref(false)
const editRowIndex = ref(-1)
const editCellValue = ref('')
const editCellUid = ref('')
const editRowValues = ref<string[]>([])
const showEditRules = ref(false)
const showChartDialog = ref(false)
const showSheetSettings = ref(false)
const showNewSheetDialog = ref(false)
const showColumnManager = ref(false)

const showAIUpdateDialog = ref(false)
const aiUpdating = ref(false)
const aiUpdateRange = ref({ start: 1, end: 1 })
const aiUpdateCurrentChapter = ref('1')
const aiUpdateBatchSize = ref(3)

// 导入导出
const importFileDialog = ref(false)
const importFileData = ref<any>(null)
const importFileType = ref<'xlsx' | 'csv' | 'json'>('xlsx')

// 批量编辑
const batchEditDialog = ref(false)
const batchEditColumn = ref(0)
const batchEditType = ref<'set' | 'replace' | 'append'>('set')
const batchEditValue = ref('')
const batchEditFind = ref('')
const batchEditScope = ref<'selected' | 'all'>('selected')

// 列编辑
const editColumnDialog = ref(false)
const editColumnIndex = ref(-1)
const editColumnName = ref('')
const editColumnRequired = ref(false)
const editColumnWidth = ref(150)

// 新建表格
const newSheetName = ref('')
const newSheetTemplate = ref('blank')

// 选择状态
const selectedRows = ref<any[]>([])

// 内联编辑
const editingCell = ref<{
  rowIndex: number
  colIndex: number
  value: string
  originalValue: string
} | null>(null)

// 错误状态
const cellErrors = ref<Map<string, string>>(new Map())

// 排序状态
const sortState = ref<{ prop: string; order: 'ascending' | 'descending' } | null>(null)

// 列管理数据
const columnManagerData = ref<Array<{
  name: string
  required: boolean
  width: number
}>>([])

const currentSheet = computed(() => {
  return memory.value.sheets.find(s => s.uid === activeSheet.value)
})

// 表格列定义
const tableColumns = computed(() => {
  if (!currentSheet.value || currentSheet.value.hashSheet.length === 0) {
    return []
  }

  const headerRow = currentSheet.value.hashSheet[0]
  return headerRow.slice(1).map((uid, index) => {
    const cell = currentSheet.value!.cells.get(uid)
    return {
      label: cell?.value || `列${index + 1}`,
      prop: `col_${index}`,
      required: false,
      width: 150
    }
  })
})

// 表格数据
const tableData = computed(() => {
  if (!currentSheet.value || currentSheet.value.hashSheet.length <= 1) {
    return []
  }

  const dataRows = currentSheet.value.hashSheet.slice(1)

  // 应用排序
  if (sortState.value) {
    const { prop, order } = sortState.value
    const colIndex = parseInt(prop.replace('col_', ''))

    dataRows.sort((a, b) => {
      const aVal = currentSheet.value!.cells.get(a[colIndex + 1])?.value || ''
      const bVal = currentSheet.value!.cells.get(b[colIndex + 1])?.value || ''

      if (order === 'ascending') {
        return aVal.localeCompare(bVal, 'zh-CN')
      } else {
        return bVal.localeCompare(aVal, 'zh-CN')
      }
    })
  }

  return dataRows.map((row, index) => {
    const rowData: Record<string, any> = {
      rowKey: row[0],
      rowIndex: index + 1
    }

    row.slice(1).forEach((cellUid, colIndex) => {
      const cell = currentSheet.value!.cells.get(cellUid)
      rowData[`col_${colIndex}`] = cell?.value || ''
    })

    return rowData
  })
})

onMounted(() => {
  loadMemory()
  setupKeyboardShortcuts()
})

watch(project, () => {
  loadMemory()
}, { deep: true })

// 更新撤销/重做状态
watch([() => historyManager.value], () => {
  const stats = historyManager.value.getStats()
  canUndo.value = stats.canUndo
  canRedo.value = stats.canRedo
}, { deep: true })

function loadMemory() {
  if (project.value?.memory) {
    try {
      memory.value = importMemoryData(project.value.memory)
      if (memory.value.sheets.length > 0) {
        activeSheet.value = memory.value.sheets[0].uid
      }
    } catch (error) {
      console.error('加载记忆系统失败:', error)
      initMemory()
    }
  } else {
    initMemory()
  }
}

function initMemory() {
  if (project.value) {
    memory.value = initNovelMemory(project.value)
    if (memory.value.sheets.length > 0) {
      activeSheet.value = memory.value.sheets[0].uid
    }
    saveMemory()
  }
}

function saveMemory() {
  if (project.value) {
    project.value.memory = exportMemoryData(memory.value)
    projectStore.saveCurrentProject()
  }
}

// 记录历史
function recordHistory(action: string, description: string, sheetUid?: string) {
  historyManager.value.record(action, description, memory.value, sheetUid)
  const stats = historyManager.value.getStats()
  canUndo.value = stats.canUndo
  canRedo.value = stats.canRedo
}

// 撤销
function undo() {
  const result = historyManager.value.undo(memory.value)
  if (result) {
    memory.value = result
    saveMemory()
    ElMessage.success('已撤销')
  }
  const stats = historyManager.value.getStats()
  canUndo.value = stats.canUndo
  canRedo.value = stats.canRedo
}

// 重做
function redo() {
  const result = historyManager.value.redo(memory.value)
  if (result) {
    memory.value = result
    saveMemory()
    ElMessage.success('已重做')
  }
  const stats = historyManager.value.getStats()
  canUndo.value = stats.canUndo
  canRedo.value = stats.canRedo
}

// 键盘快捷键
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault()
        undo()
      } else if (e.key === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 's') {
        e.preventDefault()
        saveMemory()
        ElMessage.success('已保存')
      }
    }
  })
}

function getHeaderRow(sheet: Sheet) {
  if (!sheet || !sheet.hashSheet || sheet.hashSheet.length === 0) {
    return []
  }
  return sheet.hashSheet[0].map(uid => sheet.cells.get(uid)).filter(c => c) as any[]
}

function handleSheetChange() {
  // 切换表格时清除选择和排序
  selectedRows.value = []
  sortState.value = null
}

function handleSelectionChange(selection: any[]) {
  selectedRows.value = selection
}

function handleSortChange({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) {
  if (order) {
    sortState.value = { prop, order }
  } else {
    sortState.value = null
  }
}

// 内联编辑
function handleCellDblClick(row: any, column: any) {
  const colIndex = parseInt(column.property?.replace('col_', '') ?? '-1')
  if (colIndex < 0) return

  const rowIndex = row.rowIndex - 1

  editingCell.value = {
    rowIndex,
    colIndex,
    value: row[column.property] || '',
    originalValue: row[column.property] || ''
  }

  // 聚焦输入框
  nextTick(() => {
    const input = document.querySelector('.cell-content input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function saveCellEdit() {
  if (!editingCell.value || !currentSheet.value) return

  const { rowIndex, colIndex, value } = editingCell.value
  const row = currentSheet.value.hashSheet[rowIndex + 1]
  if (!row) return

  const cellUid = row[colIndex + 1]
  const cell = currentSheet.value.cells.get(cellUid)
  if (cell) {
    cell.value = value

    recordHistory(
      HISTORY_ACTIONS.CELL_EDIT,
      generateActionDescription(HISTORY_ACTIONS.CELL_EDIT, {
        row: rowIndex + 1,
        col: colIndex + 1
      }),
      currentSheet.value.uid
    )

    saveMemory()
    validateCell(rowIndex, colIndex, value)
  }

  editingCell.value = null
}

function cancelCellEdit() {
  editingCell.value = null
}

// 数据验证
function validateCell(rowIndex: number, colIndex: number, value: string): boolean {
  const key = `${rowIndex}-${colIndex}`
  const column = tableColumns.value[colIndex]

  if (column?.required && !value.trim()) {
    cellErrors.value.set(key, `${column.label} 不能为空`)
    return false
  }

  cellErrors.value.delete(key)
  return true
}

function hasError(rowIndex: number, colIndex: number): boolean {
  const key = `${rowIndex}-${colIndex}`
  return cellErrors.value.has(key)
}

function getError(rowIndex: number, colIndex: number): string {
  const key = `${rowIndex}-${colIndex}`
  return cellErrors.value.get(key) || ''
}

// 编辑行
function editRow(rowIndex: number) {
  if (!currentSheet.value) return

  editRowIndex.value = rowIndex

  if (rowIndex === -1) {
    const colCount = currentSheet.value.hashSheet[0].length - 1
    editRowValues.value = Array(colCount).fill('')
  } else {
    const row = currentSheet.value.hashSheet[rowIndex + 1]
    editRowValues.value = row.slice(1).map(uid => {
      const cell = currentSheet.value.cells.get(uid)
      return cell?.value || ''
    })
  }

  editRowDialog.value = true
}

function addRow() {
  editRow(-1)
}

function saveRow() {
  if (!currentSheet.value) return

  if (editRowIndex.value === -1) {
    insertRow(currentSheet.value, editRowValues.value)
    recordHistory(
      HISTORY_ACTIONS.ROW_ADD,
      generateActionDescription(HISTORY_ACTIONS.ROW_ADD, { row: currentSheet.value.hashSheet.length })
    )
    ElMessage.success('行已添加')
  } else {
    updateRow(currentSheet.value, editRowIndex.value + 1, editRowValues.value)
    recordHistory(
      HISTORY_ACTIONS.ROW_EDIT,
      generateActionDescription(HISTORY_ACTIONS.ROW_EDIT, { row: editRowIndex.value + 1 })
    )
    ElMessage.success('行已更新')
  }

  saveMemory()
  editRowDialog.value = false
}

function deleteRowConfirm(rowIndex: number) {
  ElMessageBox.confirm(
    `确定要删除第 ${rowIndex + 1} 行吗？`,
    '删除确认',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    if (currentSheet.value) {
      deleteRow(currentSheet.value, rowIndex + 1)
      recordHistory(
        HISTORY_ACTIONS.ROW_DELETE,
        generateActionDescription(HISTORY_ACTIONS.ROW_DELETE, { row: rowIndex + 1 })
      )
      saveMemory()
      ElMessage.success('行已删除')
    }
  }).catch(() => {})
}

// 批量操作
function showBatchEditDialog() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning('请先选择要编辑的行')
    return
  }
  batchEditDialog.value = true
}

function applyBatchEdit() {
  if (!currentSheet.value) return

  const rowsToEdit = batchEditScope.value === 'selected'
    ? selectedRows.value.map(row => row.rowIndex - 1)
    : Array.from({ length: tableData.value.length }, (_, i) => i)

  rowsToEdit.forEach(rowIndex => {
    const row = currentSheet.value!.hashSheet[rowIndex + 1]
    if (!row) return

    const cellUid = row[batchEditColumn.value + 1]
    const cell = currentSheet.value!.cells.get(cellUid)
    if (!cell) return

    switch (batchEditType.value) {
      case 'set':
        cell.value = batchEditValue.value
        break
      case 'replace':
        cell.value = cell.value.replace(
          new RegExp(batchEditFind.value, 'g'),
          batchEditValue.value
        )
        break
      case 'append':
        cell.value += batchEditValue.value
        break
    }
  })

  recordHistory(
    HISTORY_ACTIONS.BATCH_EDIT,
    generateActionDescription(HISTORY_ACTIONS.BATCH_EDIT, { count: rowsToEdit.length })
  )

  saveMemory()
  ElMessage.success(`已批量编辑 ${rowsToEdit.length} 行`)
  batchEditDialog.value = false
  clearSelection()
}

function batchDelete() {
  ElMessageBox.confirm(
    `确定要删除选中的 ${selectedRows.value.length} 行吗？`,
    '批量删除确认',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    if (!currentSheet.value) return

    // 从后往前删除，避免索引变化
    const indices = selectedRows.value
      .map(row => row.rowIndex)
      .sort((a, b) => b - a)

    indices.forEach(index => {
      deleteRow(currentSheet.value!, index)
    })

    recordHistory(
      HISTORY_ACTIONS.ROW_DELETE,
      `批量删除 ${indices.length} 行`
    )

    saveMemory()
    ElMessage.success(`已删除 ${indices.length} 行`)
    clearSelection()
  }).catch(() => {})
}

function batchCopy() {
  if (!currentSheet.value || selectedRows.value.length === 0) return

  const text = selectedRows.value.map(row => {
    return tableColumns.value
      .map((_, i) => row[`col_${i}`] || '')
      .join('\t')
  }).join('\n')

  navigator.clipboard.writeText(text)
    .then(() => ElMessage.success('已复制到剪贴板'))
    .catch(() => ElMessage.error('复制失败'))
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

// 列编辑
function editColumn(colIndex: number) {
  if (!currentSheet.value) return

  const column = tableColumns.value[colIndex]
  editColumnIndex.value = colIndex
  editColumnName.value = column.label
  editColumnRequired.value = column.required
  editColumnWidth.value = column.width
  editColumnDialog.value = true
}

function saveColumnEdit() {
  if (!currentSheet.value || editColumnIndex.value < 0) return

  const cellUid = currentSheet.value.hashSheet[0][editColumnIndex.value + 1]
  const cell = currentSheet.value.cells.get(cellUid)
  if (cell) {
    const oldName = cell.value
    cell.value = editColumnName.value

    if (oldName !== editColumnName.value) {
      recordHistory(
        HISTORY_ACTIONS.COLUMN_RENAME,
        generateActionDescription(HISTORY_ACTIONS.COLUMN_RENAME, {
          oldName,
          newName: editColumnName.value
        })
      )
    }

    saveMemory()
    ElMessage.success('列已更新')
  }

  editColumnDialog.value = false
}

function deleteColumn() {
  if (!currentSheet.value || editColumnIndex.value < 0) return

  ElMessageBox.confirm(
    '删除列将同时删除该列的所有数据，确定继续吗？',
    '删除列确认',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    const colIndex = editColumnIndex.value + 1

    // 删除所有行中该列的 cells
    currentSheet.value!.hashSheet.forEach(row => {
      const cellUid = row[colIndex]
      currentSheet.value!.cells.delete(cellUid)
    })

    // 从 hashSheet 中删除该列
    currentSheet.value!.hashSheet = currentSheet.value!.hashSheet.map(row => {
      const newRow = [...row]
      newRow.splice(colIndex, 1)
      return newRow
    })

    recordHistory(
      HISTORY_ACTIONS.COLUMN_DELETE,
      generateActionDescription(HISTORY_ACTIONS.COLUMN_DELETE, { name: editColumnName.value })
    )

    saveMemory()
    ElMessage.success('列已删除')
    editColumnDialog.value = false
  }).catch(() => {})
}

function addColumn() {
  columnManagerData.value.push({
    name: `新列${columnManagerData.value.length + 1}`,
    required: false,
    width: 150
  })
}

function moveColumn(index: number, direction: number) {
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= columnManagerData.value.length) return

  const temp = columnManagerData.value[index]
  columnManagerData.value[index] = columnManagerData.value[newIndex]
  columnManagerData.value[newIndex] = temp
}

function applyColumnChanges() {
  // 这里需要实现列管理的应用逻辑
  showColumnManager.value = false
  ElMessage.success('列设置已更新')
}

// 编辑单元格（对话框方式）- 保留用于单独编辑功能
function openEditCellDialog(rowIndex: number, colIndex: number) {
  if (!currentSheet.value) return

  const row = currentSheet.value.hashSheet[rowIndex + 1]
  if (!row) return

  const cellUid = row[colIndex + 1]
  const cell = currentSheet.value.cells.get(cellUid)

  editCellUid.value = cellUid
  editCellValue.value = cell?.value || ''
  editCellDialog.value = true
}

function saveCell() {
  if (!currentSheet.value || !editCellUid.value) return

  const cell = currentSheet.value.cells.get(editCellUid.value)
  if (cell) {
    cell.value = editCellValue.value
    saveMemory()
    ElMessage.success('单元格已更新')
  }

  editCellDialog.value = false
}

async function runAIUpdate() {
  if (!project.value) return;

  const start = aiUpdateRange.value.start;
  const end = aiUpdateRange.value.end;

  if (start > end) {
    ElMessage.warning('起始章节不能大于结束章节');
    return;
  }

  const chaptersToExtract = project.value.chapters.filter(c => c.number >= start && c.number <= end);
  if (chaptersToExtract.length === 0) {
    ElMessage.warning('选定范围内没有找到章节');
    return;
  }

  aiUpdating.value = true;
  try {
    const { useAIStore } = await import('@/stores/ai');
    const aiStore = useAIStore();
    if (!aiStore.checkInitialized()) {
      ElMessage.warning('请先配置AI模型提供商');
      return;
    }

    const prompts = mergeSystemPrompts(project.value.config?.systemPrompts);
    let updatedCount = 0;

    for (let i = 0; i < chaptersToExtract.length; i += aiUpdateBatchSize.value) {
      const batchChapters = chaptersToExtract.slice(i, i + aiUpdateBatchSize.value);
      const startNum = batchChapters[0].number;
      const endNum = batchChapters[batchChapters.length - 1].number;
      aiUpdateCurrentChapter.value = startNum === endNum ? `${startNum}` : `${startNum}-${endNum}`;
      
      const batchContent = batchChapters.map(c => `第${c.number}章 ${c.title}\n${c.content || ''}`).join('\n\n');
      
      const aiExtractFunction = async (content: string, mem: any) => {
        const tablesText = mem.sheets.filter((s: any) => s.enable && s.tochat).map((s: any) => {
          return `表名: ${s.name}\n列: ${s.hashSheet[0].map((id: string) => s.cells.get(id)?.value || '').join(',')}`;
        }).join('\n\n');
        
        if (!tablesText) return [];

        const prompt = `分析以下小说章节内容，如果有需要更新到表格的状态变化、新物品、新人物等，请输出更新命令。

【严格输出格式】
每行必须是一条独立的命令，且必须以 "表名:" 开头！不要输出任何其他废话和Markdown标记！
正确示例：
角色状态:updateRow(1, "林风", "剑修", "山洞", "重伤", "铁剑")
物品列表:insertRow("生锈铁剑", "普通", "在山洞中捡到")

当前存在的表格结构：
${tablesText}

章节内容：
${batchContent}`;
        
        const messages = [{ role: 'system' as const, content: prompts.memory }, { role: 'user' as const, content: prompt }];
        
        try {
          const maxTokens = project.value?.config?.advancedSettings?.maxTokens || 4000;
          const res = await aiStore.chat(messages, { type: 'memory', complexity: 'low', priority: 'speed' }, { maxTokens });
          const lines = res.content.split('\n').filter(line => line.trim().length > 0 && line.includes(':'));
          updatedCount += lines.length;
          return lines;
        } catch (err) {
          console.warn('提取记忆表更新命令失败', err);
          return [];
        }
      };

      // 这里传入的 chapter 参数只用于更新 currentChapter 字段，随意传一个即可
      memory.value = await updateMemoryFromChapter(memory.value, batchChapters[batchChapters.length - 1], aiExtractFunction);
    }

    saveMemory();
    recordHistory(HISTORY_ACTIONS.SHEET_EDIT, `通过AI批量更新状态，执行了 ${updatedCount} 条命令`);
    ElMessage.success(`AI分析完成，总计生成了 ${updatedCount} 条更新指令`);
    showAIUpdateDialog.value = false;
  } catch (error) {
    console.error('AI更新失败', error);
    ElMessage.error('更新失败：' + (error as Error).message);
  } finally {
    aiUpdating.value = false;
  }
}

// 导入导出
function handleExportCommand(command: string) {
  switch (command) {
    case 'xlsx':
      exportMemoryToExcel(memory.value)
      ElMessage.success('已导出为 Excel')
      break
    case 'csv':
      if (currentSheet.value) {
        exportSheetToCSV(currentSheet.value)
        ElMessage.success('已导出为 CSV')
      }
      break
    case 'json':
      const json = exportMemoryData(memory.value)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memory-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('已导出为 JSON')
      break
  }
}

function handleImportCommand(command: string) {
  switch (command) {
    case 'file':
      importFileDialog.value = true
      break
    case 'template':
      showNewSheetDialog.value = true
      break
  }
}

async function handleImportFile(file: any) {
  const fileName = file.name.toLowerCase()

  if (fileName.endsWith('.json')) {
    importFileType.value = 'json'
    const reader = new FileReader()
    reader.onload = (e) => {
      importFileData.value = e.target?.result
    }
    reader.readAsText(file.raw)
  } else if (fileName.endsWith('.csv')) {
    importFileType.value = 'csv'
    const result = await importFromCSV(file.raw)
    importFileData.value = result
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    importFileType.value = 'xlsx'
    const result = await importFromExcel(file.raw)
    importFileData.value = result
  }

  return false
}

function confirmImport() {
  if (!importFileData.value) {
    ElMessage.warning('请选择文件')
    return
  }

  try {
    if (importFileType.value === 'json') {
      memory.value = importMemoryData(importFileData.value as string)
    } else {
      const result = importFileData.value as any
      if (result.success && result.sheets.length > 0) {
        memory.value.sheets.push(...result.sheets)
      } else {
        throw new Error(result.errors?.join(', ') || '导入失败')
      }
    }

    recordHistory(HISTORY_ACTIONS.IMPORT, '导入表格数据')
    saveMemory()
    ElMessage.success('导入成功')
    importFileDialog.value = false
    importFileData.value = null
  } catch (error: any) {
    ElMessage.error(`导入失败: ${error.message || error}`)
  }
}

// 新建表格
function createNewSheet() {
  if (!newSheetName.value.trim()) {
    ElMessage.warning('请输入表格名称')
    return
  }

  try {
    let newSheet: Sheet

    if (newSheetTemplate.value && newSheetTemplate.value !== 'blank') {
      newSheet = createSheetFromTemplate(newSheetTemplate.value, newSheetName.value)
    } else {
      newSheet = {
        uid: `sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: newSheetName.value,
        type: 'custom',
        domain: 'chat',
        enable: true,
        required: false,
        tochat: true,
        hashSheet: [['rowIndex'].map((_, i) => `cell-sheet-${Date.now()}-0-${i}`)],
        cells: new Map([['rowIndex', 'rowIndex']].map(([, i]) => [
          `cell-sheet-${Date.now()}-0-${i}`,
          { uid: `cell-sheet-${Date.now()}-0-${i}`, value: '#' }
        ])),
        note: '',
        initNode: '',
        insertNode: '',
        updateNode: '',
        deleteNode: '',
        triggerSend: false,
        triggerSendDeep: 5
      }
    }

    memory.value.sheets.push(newSheet)
    activeSheet.value = newSheet.uid

    recordHistory(
      HISTORY_ACTIONS.SHEET_CREATE,
      generateActionDescription(HISTORY_ACTIONS.SHEET_CREATE, { name: newSheetName.value })
    )

    saveMemory()
    ElMessage.success('表格已创建')
    showNewSheetDialog.value = false
    newSheetName.value = ''
    newSheetTemplate.value = 'blank'
  } catch (error: any) {
    ElMessage.error(`创建失败: ${error.message || error}`)
  }
}

function saveSheetSettings() {
  saveMemory()
  ElMessage.success('设置已保存')
  showSheetSettings.value = false
}

function getEditRules(sheet: Sheet | undefined) {
  if (!sheet) return ''

  const colCount = sheet.hashSheet[0].length - 1
  let rules = '【可用命令】\n\n'
  rules += `// 更新行\n`
  rules += `updateRow(行号, "${Array(colCount).fill('值').join('", "')}")\n\n`
  rules += `// 插入行\n`
  rules += `insertRow("${Array(colCount).fill('值').join('", "')}")\n\n`
  rules += `// 删除行\n`
  rules += `deleteRow(行号)\n\n`

  if (sheet.hashSheet.length > 1) {
    const exampleRow = sheet.hashSheet[1]
    const exampleValues = exampleRow.slice(1).map(uid => {
      const cell = sheet.cells.get(uid)
      return cell?.value || '值'
    })
    rules += `【示例】\n`
    rules += `updateRow(1, "${exampleValues.join('", "')}")\n`
  }

  return rules
}

function syncFromProject() {
  if (!project.value) {
    ElMessage.warning('请先打开项目')
    return
  }

  ElMessageBox.confirm(
    '从项目同步会重新初始化表格，现有数据将被覆盖。确定继续吗？',
    '同步确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    initMemory()
    ElMessage.success('已从项目同步')
  }).catch(() => {})
}
</script>

<style scoped>
.memory-tables-enhanced {
  max-width: 1400px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.content {
  min-height: 400px;
}

.sheet-container {
  padding: 20px 0;
}

.sheet-header {
  margin-bottom: 20px;
}

.sheet-controls {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  align-items: center;
}

.table-wrapper {
  margin-bottom: 20px;
  overflow-x: auto;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.column-edit-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.column-header:hover .column-edit-btn {
  opacity: 1;
}

.cell-content {
  position: relative;
  min-height: 20px;
  padding: 4px;
}

.cell-content.cell-error {
  background-color: #fef0f0;
  border: 1px solid #f56c6c;
  border-radius: 4px;
}

.cell-content.cell-required::after {
  content: '*';
  color: #f56c6c;
  margin-left: 4px;
}

.error-icon {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  color: #f56c6c;
}

.batch-actions {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.csv-preview {
  margin-top: 20px;
}

.csv-preview pre {
  background-color: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  overflow-x: auto;
}

.rules-preview {
  background-color: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
