<template>
  <div class="prompt-editor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        添加提示词
      </el-button>
    </div>

    <!-- 提示词列表 -->
    <div class="prompt-list">
      <el-card
        v-for="(prompt, index) in prompts"
        :key="prompt.identifier"
        class="prompt-card"
        :class="{ disabled: prompt.enabled === false }"
      >
        <div class="prompt-header">
          <div class="prompt-title">
            <el-switch
              v-model="prompt.enabled"
              @change="handleToggle(prompt)"
            />
            <span class="name">{{ prompt.name || prompt.identifier }}</span>
            <el-tag v-if="prompt.system_prompt" size="small" type="danger">
              系统提示词
            </el-tag>
          </div>
          <div class="prompt-actions">
            <el-button link type="primary" @click="handleEdit(index)">
              编辑
            </el-button>
            <el-button link type="danger" @click="handleDelete(index)">
              删除
            </el-button>
          </div>
        </div>

        <div class="prompt-info">
          <el-text size="small" type="info">
            <span v-if="prompt.position">
              位置: {{ getPositionName(prompt.position) }}
            </span>
            <span v-if="prompt.role" class="ml-2">
              角色: {{ prompt.role }}
            </span>
            <span v-if="prompt.depth !== undefined" class="ml-2">
              深度: {{ prompt.depth }}
            </span>
          </el-text>
        </div>

        <div class="prompt-content">
          <el-text line-clamp="3">
            {{ prompt.content || '(无内容)' }}
          </el-text>
        </div>
      </el-card>

      <el-empty v-if="prompts.length === 0" description="暂无提示词" />
    </div>

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="editIndex === -1 ? '添加提示词' : '编辑提示词'"
      width="700px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="editForm"
        :rules="formRules"
        label-width="120px"
      >
        <el-form-item label="标识符" prop="identifier">
          <el-input
            v-model="editForm.identifier"
            placeholder="唯一标识符，如：main, worldInfoBefore"
          />
        </el-form-item>

        <el-form-item label="名称" prop="name">
          <el-input
            v-model="editForm.name"
            placeholder="显示名称（可选）"
          />
        </el-form-item>

        <el-form-item label="内容" prop="content">
          <el-input
            v-model="editForm.content"
            type="textarea"
            :rows="8"
            placeholder="提示词内容"
          />
        </el-form-item>

        <el-form-item label="系统提示词">
          <el-switch v-model="editForm.system_prompt" />
        </el-form-item>

        <el-form-item label="位置">
          <el-select v-model="editForm.position" placeholder="选择位置">
            <el-option label="角色前" value="before_char" />
            <el-option label="角色后" value="after_char" />
            <el-option label="示例前" value="before_example" />
            <el-option label="示例后" value="after_example" />
          </el-select>
        </el-form-item>

        <el-form-item label="角色">
          <el-select v-model="editForm.role" placeholder="选择角色">
            <el-option label="系统" value="system" />
            <el-option label="用户" value="user" />
            <el-option label="助手" value="assistant" />
          </el-select>
        </el-form-item>

        <el-form-item label="深度">
          <el-input-number
            v-model="editForm.depth"
            :min="0"
            placeholder="插入深度"
          />
        </el-form-item>

        <el-form-item label="注入行为">
          <el-select v-model="editForm.injection_behavior" placeholder="选择注入行为">
            <el-option label="前置" value="prepend" />
            <el-option label="后置" value="append" />
          </el-select>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="editForm.enabled" />
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
import { Plus } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useCharacterCardStore } from '@/stores/character-card'
import type { PromptConfig } from '@/types/character-card'

const characterCardStore = useCharacterCardStore()

const prompts = computed(() => characterCardStore.prompts)

const editDialogVisible = ref(false)
const editIndex = ref(-1)
const formRef = ref<FormInstance>()

const editForm = ref<Partial<PromptConfig>>({
  identifier: '',
  name: '',
  content: '',
  system_prompt: false,
  position: 'after_char',
  role: 'system',
  depth: undefined,
  injection_behavior: 'prepend',
  enabled: true
})

const formRules: FormRules = {
  identifier: [
    { required: true, message: '请输入标识符', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入提示词内容', trigger: 'blur' }
  ]
}

// 获取位置名称
const getPositionName = (position: string): string => {
  const names: Record<string, string> = {
    'before_char': '角色前',
    'after_char': '角色后',
    'before_example': '示例前',
    'after_example': '示例后'
  }
  return names[position] || position
}

// 添加提示词
const handleAdd = () => {
  editIndex.value = -1
  editForm.value = {
    identifier: `prompt_${Date.now()}`,
    name: '',
    content: '',
    system_prompt: false,
    position: 'after_char',
    role: 'system',
    depth: undefined,
    injection_behavior: 'prepend',
    enabled: true
  }
  editDialogVisible.value = true
}

// 编辑提示词
const handleEdit = (index: number) => {
  editIndex.value = index
  editForm.value = { ...prompts.value[index] }
  editDialogVisible.value = true
}

// 保存提示词
const handleSave = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    if (editIndex.value === -1) {
      // 添加
      characterCardStore.prompts.push(editForm.value as PromptConfig)
      ElMessage.success('提示词添加成功')
    } else {
      // 更新
      characterCardStore.prompts[editIndex.value] = editForm.value as PromptConfig
      ElMessage.success('提示词更新成功')
    }

    editDialogVisible.value = false
  } catch {
    // 验证失败
  }
}

// 删除提示词
const handleDelete = async (index: number) => {
  try {
    await ElMessageBox.confirm(
      '确定要删除这个提示词吗？',
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    characterCardStore.prompts.splice(index, 1)
    ElMessage.success('提示词已删除')
  } catch {
    // 用户取消
  }
}

// 切换启用状态
const handleToggle = (prompt: PromptConfig) => {
  // 直接修改数组中的元素，Vue会自动响应
}
</script>

<style scoped>
.prompt-editor {
  padding: 16px 0;
}

.toolbar {
  margin-bottom: 16px;
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-card {
  position: relative;
}

.prompt-card.disabled {
  opacity: 0.5;
}

.prompt-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.prompt-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prompt-title .name {
  font-weight: 600;
  font-size: 16px;
}

.prompt-info {
  margin-bottom: 8px;
}

.prompt-content {
  padding: 8px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.ml-2 {
  margin-left: 8px;
}
</style>