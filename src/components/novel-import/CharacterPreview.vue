<template>
  <div class="character-preview">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="title">人物列表</span>
            <el-tag>共 {{ characters.length }} 人</el-tag>
          </div>
          <div class="header-right">
            <el-button size="small" @click="handleAddCharacter">
              <el-icon><Plus /></el-icon>
              添加人物
            </el-button>
            <el-button size="small" type="primary" @click="handleConfirm">
              <el-icon><Select /></el-icon>
              确认人物
            </el-button>
          </div>
        </div>
      </template>

      <!-- 过滤器 -->
      <div class="filters">
        <el-select v-model="roleFilter" placeholder="角色筛选" clearable style="width: 150px;">
          <el-option label="主角" value="protagonist" />
          <el-option label="配角" value="supporting" />
          <el-option label="反派" value="antagonist" />
          <el-option label="路人" value="minor" />
        </el-select>
        <el-input
          v-model="searchQuery"
          placeholder="搜索人物名称"
          clearable
          style="width: 300px;"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <!-- 人物表格 -->
      <el-table :data="filteredCharacters" style="width: 100%" max-height="500">
        <el-table-column label="姓名" prop="name" width="150">
          <template #default="{ row }">
            <el-input v-model="row.name" size="small" @change="handleChange" />
          </template>
        </el-table-column>

        <el-table-column label="角色定位" prop="role" width="140">
          <template #default="{ row }">
            <el-select v-model="row.role" size="small" @change="handleChange">
              <el-option label="主角" value="protagonist">
                <el-tag type="success" size="small">主角</el-tag>
              </el-option>
              <el-option label="配角" value="supporting">
                <el-tag type="primary" size="small">配角</el-tag>
              </el-option>
              <el-option label="反派" value="antagonist">
                <el-tag type="danger" size="small">反派</el-tag>
              </el-option>
              <el-option label="路人" value="minor">
                <el-tag type="info" size="small">路人</el-tag>
              </el-option>
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="性格特征" prop="personality" min-width="200">
          <template #default="{ row }">
            <el-tag
              v-for="(trait, index) in row.personality"
              :key="index"
              closable
              @close="removeTrait(row, index)"
              style="margin-right: 5px;"
            >
              {{ trait }}
            </el-tag>
            <el-input
              v-model="newTrait[row.name]"
              size="small"
              placeholder="添加特征"
              @keyup.enter="addTrait(row)"
              style="width: 100px; margin-left: 5px;"
            />
          </template>
        </el-table-column>

        <el-table-column label="首次出现" prop="firstAppearance" width="120">
          <template #default="{ row }">
            <el-input v-model="row.firstAppearance" size="small" @change="handleChange" />
          </template>
        </el-table-column>

        <el-table-column label="置信度" width="100">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round(row.confidence * 100)"
              :color="getConfidenceColor(row.confidence)"
              :show-text="false"
            />
          </template>
        </el-table-column>

        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              type="danger"
              @click="handleDeleteCharacter(row)"
            >
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 关系预览 -->
      <el-divider />
      <div class="relationships-section">
        <h3>人物关系</h3>
        <el-tag v-for="(rel, index) in relationships" :key="index" style="margin: 5px;">
          {{ rel.from }} → {{ rel.relation }} → {{ rel.to }}
        </el-tag>
        <el-empty v-if="relationships.length === 0" description="暂无人物关系" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Select, Search, Delete } from '@element-plus/icons-vue'
import type { LLMCharacter, LLMRelationship } from '@/utils/llm/types'

interface Props {
  modelValue: LLMCharacter[]
  relationships?: LLMRelationship[]
}

const props = withDefaults(defineProps<Props>(), {
  relationships: () => []
})

const emit = defineEmits<{
  'update:modelValue': [characters: LLMCharacter[]]
  confirm: [characters: LLMCharacter[]]
}>()

const characters = ref<LLMCharacter[]>([...props.modelValue])
const roleFilter = ref('')
const searchQuery = ref('')
const newTrait = ref<Record<string, string>>({})

watch(() => props.modelValue, (newChars) => {
  characters.value = [...newChars]
}, { deep: true })

const filteredCharacters = computed(() => {
  let result = characters.value

  if (roleFilter.value) {
    result = result.filter(ch => ch.role === roleFilter.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(ch => ch.name.toLowerCase().includes(query))
  }

  return result
})

function handleChange() {
  emit('update:modelValue', characters.value)
}

function addTrait(character: LLMCharacter) {
  const trait = newTrait.value[character.name]?.trim()
  if (trait && !character.personality.includes(trait)) {
    character.personality.push(trait)
    newTrait.value[character.name] = ''
    handleChange()
  }
}

function removeTrait(character: LLMCharacter, index: number) {
  character.personality.splice(index, 1)
  handleChange()
}

async function handleDeleteCharacter(character: LLMCharacter) {
  try {
    await ElMessageBox.confirm(
      `确定要删除人物"${character.name}"吗？`,
      '确认删除',
      { type: 'warning' }
    )

    const index = characters.value.findIndex(ch => ch.name === character.name)
    if (index !== -1) {
      characters.value.splice(index, 1)
      handleChange()
      ElMessage.success('人物已删除')
    }
  } catch {}
}

function handleAddCharacter() {
  const newChar: LLMCharacter = {
    name: '新人物',
    role: 'supporting',
    personality: [],
    firstAppearance: '',
    description: '',
    confidence: 1,
    verified: true
  }
  characters.value.push(newChar)
  handleChange()
  ElMessage.success('已添加新人物')
}

function handleConfirm() {
  emit('confirm', characters.value)
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#67C23A'
  if (confidence >= 0.7) return '#E6A23C'
  return '#F56C6C'
}
</script>

<style scoped>
.character-preview {
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

.filters {
  margin-bottom: 20px;
  display: flex;
  gap: 15px;
}

.relationships-section {
  margin-top: 20px;
}

.relationships-section h3 {
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: 600;
}
</style>
