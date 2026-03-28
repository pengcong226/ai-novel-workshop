<template>
  <div class="regex-script-manager">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        添加脚本
      </el-button>
      <el-button @click="handleImport">
        <el-icon><Upload /></el-icon>
        导入
      </el-button>
      <el-button @click="handleExport" :disabled="scripts.length === 0">
        <el-icon><Download /></el-icon>
        导出
      </el-button>
    </div>

    <!-- 脚本列表 -->
    <el-table
      :data="scripts"
      style="width: 100%; margin-top: 16px"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" />

      <el-table-column prop="scriptName" label="脚本名称" min-width="150">
        <template #default="{ row }">
          <div class="script-name">
            <el-icon v-if="row.disabled" color="#909399"><Hide /></el-icon>
            <el-icon v-else color="#67C23A"><View /></el-icon>
            <span>{{ row.scriptName }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="正则表达式" min-width="200">
        <template #default="{ row }">
          <el-text line-clamp="1" class="regex-text">
            {{ row.findRegex }}
          </el-text>
        </template>
      </el-table-column>

      <el-table-column label="替换内容" min-width="150">
        <template #default="{ row }">
          <el-text line-clamp="1">
            {{ row.replaceString || '(空)' }}
          </el-text>
        </template>
      </el-table-column>

      <el-table-column label="触发位置" width="120">
        <template #default="{ row }">
          <el-tag
            v-for="placement in row.placement"
            :key="placement"
            size="small"
            class="placement-tag"
          >
            {{ getPlacementName(placement) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch
            v-model="row.disabled"
            :active-value="false"
            :inactive-value="true"
            @change="handleToggle(row)"
          />
        </template>
      </el-table-column>

      <el-table-column label="操作" width="120" fixed="right">
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
            type="danger"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 批量操作 -->
    <div v-if="selectedScripts.length > 0" class="batch-actions">
      <el-button @click="handleBatchEnable(true)">
        批量启用 ({{ selectedScripts.length }})
      </el-button>
      <el-button @click="handleBatchEnable(false)">
        批量禁用 ({{ selectedScripts.length }})
      </el-button>
      <el-button type="danger" @click="handleBatchDelete">
        批量删除 ({{ selectedScripts.length }})
      </el-button>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editMode === 'add' ? '添加正则脚本' : '编辑正则脚本'"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="editForm"
        :rules="formRules"
        label-width="120px"
      >
        <el-form-item label="脚本名称" prop="scriptName">
          <el-input
            v-model="editForm.scriptName"
            placeholder="给脚本起个名字"
          />
        </el-form-item>

        <el-form-item label="正则表达式" prop="findRegex">
          <el-input
            v-model="editForm.findRegex"
            type="textarea"
            :rows="3"
            placeholder="输入正则表达式，如：/<[^>]+>/g"
          />
          <el-text size="small" type="info">
            支持 /pattern/flags 格式或纯 pattern 格式
          </el-text>
        </el-form-item>

        <el-form-item label="替换内容" prop="replaceString">
          <el-input
            v-model="editForm.replaceString"
            type="textarea"
            :rows="2"
            placeholder="替换成的文本（可为空）"
          />
        </el-form-item>

        <el-form-item label="触发位置" prop="placement">
          <el-checkbox-group v-model="editForm.placement">
            <el-checkbox :label="0">用户输入</el-checkbox>
            <el-checkbox :label="1">AI消息开始</el-checkbox>
            <el-checkbox :label="2">AI消息结束</el-checkbox>
            <el-checkbox :label="3">斜杠命令</el-checkbox>
            <el-checkbox :label="4">查找输出</el-checkbox>
            <el-checkbox :label="5">推理输出</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="深度限制">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-input-number
                v-model="editForm.minDepth"
                placeholder="最小深度"
                :min="0"
                style="width: 100%"
              />
            </el-col>
            <el-col :span="12">
              <el-input-number
                v-model="editForm.maxDepth"
                placeholder="最大深度"
                :min="0"
                style="width: 100%"
              />
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="其他选项">
          <el-checkbox v-model="editForm.runOnEdit">
            编辑时运行
          </el-checkbox>
          <el-checkbox v-model="editForm.markdownOnly">
            仅Markdown
          </el-checkbox>
          <el-checkbox v-model="editForm.promptOnly">
            仅提示词
          </el-checkbox>
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="editForm.comment"
            type="textarea"
            :rows="2"
            placeholder="脚本的说明或备注"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Download, View, Hide } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useCharacterCardStore } from '@/stores/character-card'
import type { RegexScript } from '@/types/character-card'
import { RegexScriptPlacement } from '@/types/regex-script'

const characterCardStore = useCharacterCardStore()

const scripts = computed(() => characterCardStore.regexScripts)
const selectedScripts = ref<RegexScript[]>([])
const editDialogVisible = ref(false)
const editMode = ref<'add' | 'edit'>('add')
const formRef = ref<FormInstance>()

const editForm = ref<Partial<RegexScript>>({
  scriptName: '',
  findRegex: '',
  replaceString: '',
  placement: [2],
  disabled: false,
  runOnEdit: false,
  minDepth: null,
  maxDepth: null,
  markdownOnly: false,
  promptOnly: false
})

const formRules: FormRules = {
  scriptName: [
    { required: true, message: '请输入脚本名称', trigger: 'blur' }
  ],
  findRegex: [
    { required: true, message: '请输入正则表达式', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        try {
          // 验证正则表达式
          if (value.startsWith('/') && value.match(/\/[gimsuy]*$/)) {
            const match = value.match(/^\/(.*)\/([gimsuy]*)$/)
            if (match) {
              new RegExp(match[1], match[2])
            }
          } else {
            new RegExp(value)
          }
          callback()
        } catch (e) {
          callback(new Error('无效的正则表达式'))
        }
      },
      trigger: 'blur'
    }
  ],
  placement: [
    { required: true, message: '请选择至少一个触发位置', trigger: 'change' }
  ]
}

// 获取触发位置名称
const getPlacementName = (placement: number): string => {
  const names = {
    [RegexScriptPlacement.USER_INPUT]: '用户输入',
    [RegexScriptPlacement.AI_MESSAGE_START]: 'AI开始',
    [RegexScriptPlacement.AI_MESSAGE_END]: 'AI结束',
    [RegexScriptPlacement.SLASH_COMMAND]: '命令',
    [RegexScriptPlacement.FIND_OUTPUT]: '查找',
    [RegexScriptPlacement.REASONING_OUTPUT]: '推理'
  }
  return names[placement as RegexScriptPlacement] || '未知'
}

// 处理选择
const handleSelectionChange = (selection: RegexScript[]) => {
  selectedScripts.value = selection
}

// 添加脚本
const handleAdd = () => {
  editMode.value = 'add'
  editForm.value = {
    scriptName: '',
    findRegex: '',
    replaceString: '',
    placement: [2],
    disabled: false,
    runOnEdit: false,
    minDepth: null,
    maxDepth: null,
    markdownOnly: false,
    promptOnly: false
  }
  editDialogVisible.value = true
}

// 编辑脚本
const handleEdit = (script: RegexScript) => {
  editMode.value = 'edit'
  editForm.value = { ...script }
  editDialogVisible.value = true
}

// 保存脚本
const handleSave = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    if (editMode.value === 'add') {
      characterCardStore.addRegexScript(editForm.value)
      ElMessage.success('脚本添加成功')
    } else {
      characterCardStore.updateRegexScript(editForm.value.id!, editForm.value)
      ElMessage.success('脚本更新成功')
    }

    editDialogVisible.value = false
  } catch {
    // 验证失败
  }
}

// 删除脚本
const handleDelete = async (script: RegexScript) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除脚本 "${script.scriptName}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    characterCardStore.deleteRegexScript(script.id)
    ElMessage.success('脚本已删除')
  } catch {
    // 用户取消
  }
}

// 切换启用状态
const handleToggle = (script: RegexScript) => {
  characterCardStore.updateRegexScript(script.id, { disabled: script.disabled })
}

// 批量启用/禁用
const handleBatchEnable = (enable: boolean) => {
  selectedScripts.value.forEach(script => {
    characterCardStore.updateRegexScript(script.id, { disabled: !enable })
  })
  ElMessage.success(`已${enable ? '启用' : '禁用'} ${selectedScripts.value.length} 个脚本`)
}

// 批量删除
const handleBatchDelete = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedScripts.value.length} 个脚本吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    selectedScripts.value.forEach(script => {
      characterCardStore.deleteRegexScript(script.id)
    })
    ElMessage.success('脚本已删除')
  } catch {
    // 用户取消
  }
}

// 导入（待实现）
const handleImport = () => {
  ElMessage.info('导入功能开发中')
}

// 导出（待实现）
const handleExport = () => {
  ElMessage.info('导出功能开发中')
}
</script>

<style scoped>
.regex-script-manager {
  padding: 16px 0;
}

.toolbar {
  display: flex;
  gap: 8px;
}

.script-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.regex-text {
  font-family: monospace;
}

.placement-tag {
  margin: 2px;
}

.batch-actions {
  margin-top: 16px;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  display: flex;
  gap: 8px;
}
</style>