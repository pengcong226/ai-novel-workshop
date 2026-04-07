<template>
  <div class="characters">
    <el-card class="header-card">
      <div class="header">
        <h2>人物设定</h2>
        <div class="actions">
          <el-button @click="showExtractDialog = true">
            <el-icon><Document /></el-icon>
            从章节提取
          </el-button>
          <el-button type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>
            新建人物
          </el-button>
          <el-button @click="generateCharacter">
            <el-icon><MagicStick /></el-icon>
            AI生成人物
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 标签页导航 -->
    <el-tabs v-model="activeMainTab" class="main-tabs">
      <el-tab-pane label="人物管理" name="management">
        <div class="content">
          <el-empty v-if="characters.length === 0" description="还没有添加人物">
            <el-button type="primary" @click="showCreateDialog = true">创建第一个人物</el-button>
          </el-empty>

          <div v-else class="characters-grid">
            <el-card
              v-for="character in filteredCharacters"
              :key="character.id"
              class="character-card"
              shadow="hover"
              @click="editCharacter(character)"
            >
              <div class="character-header">
                <div class="character-name">
                  {{ character.name }}
                  <el-tag v-if="character.tags && character.tags.length" :type="getTagType(character.tags[0])" size="small" style="margin-left: 8px;">
                    {{ getTagLabel(character.tags[0]) }}
                  </el-tag>
                </div>
                <el-tag :type="getGenderType(character.gender)">
                  {{ getGenderText(character.gender) }}
                </el-tag>
              </div>

              <div class="character-info">
                <div class="info-row">
                  <span class="label">年龄：</span>
                  <span>{{ character.age }}岁</span>
                </div>
                <div class="info-row">
                  <span class="label">性格：</span>
                  <span>{{ Array.isArray(character.personality) ? character.personality.join('、') : character.personality || '无' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">能力：</span>
                  <span>{{ Array.isArray(character.abilities) ? character.abilities.map(a => a.name).join('、') : '无' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">出场：</span>
                  <span>{{ (character.appearances || []).length }}章</span>
                </div>
                <div v-if="character.currentState" class="info-row">
                  <span class="label">状态：</span>
                  <span>{{ character.currentState.status }}</span>
                </div>
              </div>

              <div class="character-actions">
                <el-button text type="primary" @click.stop="editCharacter(character)">编辑</el-button>
                <el-button text type="danger" @click.stop="confirmDelete(character)">删除</el-button>
              </div>
            </el-card>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="人物统计" name="statistics">
        <CharacterStatistics />
      </el-tab-pane>

      <el-tab-pane label="成长轨迹" name="development">
        <CharacterDevelopment />
      </el-tab-pane>

      <el-tab-pane label="状态追踪" name="state">
        <CharacterStateTracker />
      </el-tab-pane>
    </el-tabs>

    <!-- 筛选栏 -->
    <el-card v-if="activeMainTab === 'management' && characters.length > 0" class="filter-card">
      <div class="filters">
        <div class="filter-item">
          <span class="filter-label">标签筛选：</span>
          <el-select v-model="filterTag" placeholder="全部" clearable style="width: 150px">
            <el-option label="主角" value="protagonist" />
            <el-option label="配角" value="supporting" />
            <el-option label="反派" value="antagonist" />
            <el-option label="路人" value="minor" />
            <el-option label="其他" value="other" />
          </el-select>
        </div>
        <div class="filter-item">
          <span class="filter-label">搜索：</span>
          <el-input v-model="searchKeyword" placeholder="搜索人物名称" clearable style="width: 200px">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
    </el-card>

    <!-- 创建/编辑人物对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingCharacter ? '编辑人物' : '创建人物'"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="characterForm" label-width="100px">
            <el-form-item label="姓名" required>
              <el-input v-model="characterForm.name" placeholder="人物姓名" />
            </el-form-item>

            <el-form-item label="别名">
              <el-select
                v-model="characterForm.aliases"
                multiple
                filterable
                allow-create
                placeholder="人物的别名、绰号等"
              />
            </el-form-item>

            <el-form-item label="性别">
              <el-radio-group v-model="characterForm.gender">
                <el-radio value="male">男</el-radio>
                <el-radio value="female">女</el-radio>
                <el-radio value="other">其他</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="年龄">
              <el-input-number v-model="characterForm.age" :min="0" :max="1000" />
            </el-form-item>

            <el-form-item label="外貌">
              <el-input
                v-model="characterForm.appearance"
                type="textarea"
                :rows="4"
                placeholder="详细描述人物的外貌特征"
              />
            </el-form-item>

            <el-form-item label="人物标签">
              <el-select v-model="characterForm.tags" multiple placeholder="选择人物标签">
                <el-option label="主角" value="protagonist">
                  <span style="color: #409EFF">主角</span>
                </el-option>
                <el-option label="配角" value="supporting">
                  <span style="color: #67C23A">配角</span>
                </el-option>
                <el-option label="反派" value="antagonist">
                  <span style="color: #F56C6C">反派</span>
                </el-option>
                <el-option label="路人" value="minor">
                  <span style="color: #909399">路人</span>
                </el-option>
                <el-option label="其他" value="other">
                  <span style="color: #E6A23C">其他</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="性格背景" name="personality">
          <el-form :model="characterForm" label-width="100px">
            <el-form-item label="性格特点">
              <el-select
                v-model="characterForm.personality"
                multiple
                filterable
                allow-create
                placeholder="添加性格特点"
              >
                <el-option label="勇敢" value="勇敢" />
                <el-option label="聪明" value="聪明" />
                <el-option label="善良" value="善良" />
                <el-option label="狡诈" value="狡诈" />
                <el-option label="冷酷" value="冷酷" />
                <el-option label="热情" value="热情" />
              </el-select>
            </el-form-item>

            <el-form-item label="价值观">
              <el-select
                v-model="characterForm.values"
                multiple
                filterable
                allow-create
                placeholder="人物的价值观、信念"
              />
            </el-form-item>

            <el-form-item label="背景故事">
              <el-input
                v-model="characterForm.background"
                type="textarea"
                :rows="6"
                placeholder="人物的背景故事、经历"
              />
            </el-form-item>

            <el-form-item label="行动动机">
              <el-input
                v-model="characterForm.motivation"
                type="textarea"
                :rows="4"
                placeholder="人物的核心动机、目标"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="能力设定" name="abilities">
          <el-form :model="characterForm" label-width="100px">
            <el-form-item label="力量等级">
              <el-input v-model="characterForm.powerLevel" placeholder="人物的力量等级" />
            </el-form-item>

            <el-form-item label="能力列表">
              <div class="abilities-list">
                <el-card
                  v-for="(ability, index) in characterForm.abilities"
                  :key="index"
                  class="ability-item"
                >
                  <div class="ability-content">
                    <el-input
                      v-model="ability.name"
                      placeholder="能力名称"
                      style="width: 150px; margin-right: 10px;"
                    />
                    <el-input
                      v-model="ability.description"
                      placeholder="能力描述"
                      style="flex: 1; margin-right: 10px;"
                    />
                    <el-input
                      v-model="ability.level"
                      placeholder="等级"
                      style="width: 100px; margin-right: 10px;"
                    />
                    <el-button type="danger" text @click="removeAbility(index)">
                      删除
                    </el-button>
                  </div>
                </el-card>
              </div>

              <el-button type="primary" text @click="addAbility">
                <el-icon><Plus /></el-icon>
                添加能力
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="人际关系" name="relationships">
          <el-form :model="characterForm" label-width="100px">
            <div class="relationships-list">
              <el-card
                v-for="(relationship, index) in characterForm.relationships"
                :key="index"
                class="relationship-item"
              >
                <el-form-item label="关系对象">
                  <el-select v-model="relationship.targetId" placeholder="选择人物">
                    <el-option
                      v-for="char in otherCharacters"
                      :key="char.id"
                      :label="char.name"
                      :value="char.id"
                    />
                  </el-select>
                </el-form-item>

                <el-form-item label="关系类型">
                  <el-select v-model="relationship.type">
                    <el-option label="家人" value="family" />
                    <el-option label="朋友" value="friend" />
                    <el-option label="敌人" value="enemy" />
                    <el-option label="恋人" value="lover" />
                    <el-option label="对手" value="rival" />
                    <el-option label="其他" value="other" />
                  </el-select>
                </el-form-item>

                <el-form-item label="关系描述">
                  <el-input v-model="relationship.description" type="textarea" :rows="2" />
                </el-form-item>

                <el-button type="danger" @click="removeRelationship(index)">
                  删除关系
                </el-button>
              </el-card>
            </div>

            <el-button type="primary" text @click="addRelationship">
              <el-icon><Plus /></el-icon>
              添加关系
            </el-button>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="当前状态" name="state">
          <el-form :model="characterForm" label-width="100px" v-if="characterForm.currentState">
            <el-form-item label="当前位置">
              <el-input v-model="characterForm.currentState.location" placeholder="人物当前位置" />
            </el-form-item>

            <el-form-item label="当前状态">
              <el-input v-model="characterForm.currentState.status" placeholder="如：健康、受伤、修炼中" />
            </el-form-item>

            <el-form-item label="所属势力">
              <el-select v-model="characterForm.currentState.faction" placeholder="选择势力" filterable allow-create>
                <el-option
                  v-for="faction in factions"
                  :key="faction.id"
                  :label="faction.name"
                  :value="faction.name"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="状态历史">
              <div v-if="characterForm.stateHistory && characterForm.stateHistory.length > 0" class="state-history">
                <el-timeline>
                  <el-timeline-item
                    v-for="(history, index) in characterForm.stateHistory"
                    :key="index"
                    :timestamp="formatTimestamp(history.timestamp)"
                    placement="top"
                  >
                    <el-card shadow="hover">
                      <div v-if="history.location">
                        <strong>位置：</strong>{{ history.location }}
                      </div>
                      <div v-if="history.status">
                        <strong>状态：</strong>{{ history.status }}
                      </div>
                      <div v-if="history.faction">
                        <strong>势力：</strong>{{ history.faction }}
                      </div>
                      <div v-if="history.chapter">
                        <strong>章节：</strong>第 {{ history.chapter }} 章
                      </div>
                    </el-card>
                  </el-timeline-item>
                </el-timeline>
              </div>
              <el-empty v-else description="暂无状态历史记录" :image-size="60" />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCharacter" :loading="saving">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 从章节提取对话框 -->
    <el-dialog
      v-model="showExtractDialog"
      title="从章节提取人物"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item label="提取范围">
          <el-input-number v-model="extractRange.start" :min="1" :max="project?.chapters?.length || 1" />
          <span style="margin: 0 10px;">至</span>
          <el-input-number v-model="extractRange.end" :min="extractRange.start" :max="project?.chapters?.length || 1" />
        </el-form-item>
        <el-form-item label="每批处理章数">
          <el-input-number v-model="extractBatchSize" :min="1" :max="10" />
          <div style="font-size: 12px; color: #909399; margin-left: 10px; line-height: 1.2; margin-top: 6px;">
            设置越大速度越快，但可能会超出大模型上下文限制，推荐 3-5。
          </div>
        </el-form-item>
      </el-form>

      <div v-if="extractingCharacters" style="margin-top: 20px; text-align: center; color: #409eff;">
        <el-icon class="is-loading" style="margin-right: 8px;"><Loading /></el-icon>
        正在扫描提取中 (当前处理：第 {{ extractCurrentChapter }} 章)，请稍候...
      </div>

      <template #footer>
        <el-button @click="showExtractDialog = false">取消</el-button>
        <el-button type="primary" @click="extractFromChaptersRange" :loading="extractingCharacters">
          开始提取
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, Search, Document, Loading } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Character, CharacterTag, CharacterStateHistory } from '@/types'
import CharacterStatistics from './CharacterStatistics.vue'
import CharacterDevelopment from './CharacterDevelopment.vue'
import CharacterStateTracker from './CharacterStateTracker.vue'
import { extractCharactersFromChapters, convertToCharacters, analyzeRelationships } from '@/utils/characterExtractor'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)

const characters = computed(() => project.value?.characters || [])
const factions = computed(() => project.value?.world.factions || [])

const activeMainTab = ref('management')
const showCreateDialog = ref(false)
const showExtractDialog = ref(false)
const extractRange = ref({ start: 1, end: 1 })
const extractBatchSize = ref(3)
const extractCurrentChapter = ref('1')
const extractingCharacters = ref(false)
const editingCharacter = ref<Character | null>(null)
const saving = ref(false)
const activeTab = ref('basic')
const generating = ref(false)

// 筛选条件
const filterTag = ref<CharacterTag | ''>('')
const searchKeyword = ref('')

// 监听project加载
watch(project, (newProject) => {
  if (newProject) {
    console.log('[Characters] 项目加载完成')
  }
}, { immediate: true })

const characterForm = ref<Character>({
  id: '',
  name: '',
  aliases: [],
  gender: 'male',
  age: 20,
  appearance: '',
  personality: [],
  values: [],
  background: '',
  motivation: '',
  abilities: [],
  powerLevel: '',
  relationships: [],
  appearances: [],
  development: [],
  tags: [],
  currentState: {
    location: '',
    status: '',
    faction: '',
    updatedAt: Date.now()
  },
  stateHistory: [],
  aiGenerated: false
})

const otherCharacters = computed(() => {
  return characters.value.filter(c => c.id !== characterForm.value.id)
})

// 过滤后的人物列表
const filteredCharacters = computed(() => {
  let result = characters.value

  // 标签筛选
  if (filterTag.value) {
    result = result.filter(c => c.tags?.includes(filterTag.value as CharacterTag))
  }

  // 关键词搜索
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(c =>
      c.name.toLowerCase().includes(keyword) ||
      (c.aliases || []).some(a => a.toLowerCase().includes(keyword))
    )
  }

  return result
})

onMounted(() => {
  // 初始化
})

function resetForm() {
  characterForm.value = {
    id: '',
    name: '',
    aliases: [],
    gender: 'male',
    age: 20,
    appearance: '',
    personality: [],
    values: [],
    background: '',
    motivation: '',
    abilities: [],
    powerLevel: '',
    relationships: [],
    appearances: [],
    development: [],
    tags: [],
    currentState: {
      location: '',
      status: '',
      faction: '',
      updatedAt: Date.now()
    },
    stateHistory: [],
    aiGenerated: false
  }
  editingCharacter.value = null
  activeTab.value = 'basic'
}

function editCharacter(character: Character) {
  editingCharacter.value = character
  characterForm.value = JSON.parse(JSON.stringify({
    ...character,
    aliases: character.aliases || [],
    personality: character.personality || [],
    values: character.values || [],
    abilities: character.abilities || [],
    relationships: character.relationships || [],
    appearances: character.appearances || [],
    development: character.development || [],
    tags: character.tags || [],
    currentState: character.currentState || {
      location: '',
      status: '',
      faction: '',
      updatedAt: Date.now()
    },
    stateHistory: character.stateHistory || []
  }))
  showCreateDialog.value = true
}

async function saveCharacter() {
  if (!characterForm.value.name.trim()) {
    ElMessage.warning('请输入人物姓名')
    return
  }

  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  saving.value = true
  try {
    // 将 reactive 对象转换为普通对象
    const characterData = JSON.parse(JSON.stringify(characterForm.value))

    // 检查状态变化，添加历史记录
    if (editingCharacter.value && characterData.currentState) {
      const oldState = editingCharacter.value.currentState
      const newState = characterData.currentState

      // 如果状态有变化，添加历史记录
      if (oldState && (
        oldState.location !== newState.location ||
        oldState.status !== newState.status ||
        oldState.faction !== newState.faction
      )) {
        const historyEntry: CharacterStateHistory = {
          location: oldState.location || '',
          status: oldState.status || '',
          faction: oldState.faction || '',
          chapter: project.value.chapters.length + 1,
          timestamp: new Date(),
          reason: '状态变更'
        }
        characterData.stateHistory = characterData.stateHistory || []
        characterData.stateHistory.unshift(historyEntry)
      }
    }

    // 更新状态时间戳
    if (characterData.currentState) {
      characterData.currentState.updatedAt = Date.now()
    }

    if (editingCharacter.value) {
      // 更新
      const index = project.value.characters.findIndex(c => c.id === characterData.id)
      if (index !== -1) {
        project.value.characters[index] = characterData
      }
    } else {
      // 创建
      characterData.id = uuidv4()
      project.value.characters.push(characterData)
    }

    await projectStore.saveCurrentProject()
    ElMessage.success('人物已保存')
    showCreateDialog.value = false
    resetForm()

    // 触发人物更新事件（用于AI建议系统）
    const characterUpdateEvent = new CustomEvent('character-update', {
      detail: { character: characterData }
    })
    window.dispatchEvent(characterUpdateEvent)
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  } finally {
    saving.value = false
  }
}

async function confirmDelete(character: Character) {
  try {
    await ElMessageBox.confirm(
      `确定要删除人物"${character.name}"吗？`,
      '删除人物',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    if (!project.value) return
    project.value.characters = project.value.characters.filter(c => c.id !== character.id)
    await projectStore.saveCurrentProject()
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

async function generateCharacter() {
  generating.value = true
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (aiStore.checkInitialized()) {
      const prompt = `请创建一个小说人物。可以是任何类型（玄幻、都市、科幻等）。

请以JSON格式返回人物信息：
{
  "name": "人物姓名",
  "aliases": ["别名1", "别名2"],
  "gender": "male/female/other",
  "age": 年龄数字,
  "appearance": "外貌描述",
  "personality": ["性格特征1", "性格特征2", "性格特征3"],
  "values": ["价值观1", "价值观2"],
  "background": "背景故事",
  "motivation": "人物动机",
  "abilities": [
    { "name": "能力名称", "description": "能力描述", "level": "等级" }
  ],
  "relationships": [],
  "appearances": [],
  "development": [],
  "tags": ["protagonist"],
  "currentState": { "location": "", "status": "", "faction": "" },
  "stateHistory": []
}

请只返回JSON，不要包含其他说明文字。`

      const messages = [{ role: 'user' as const, content: prompt }]
      const context = { type: 'worldbuilding' as const, complexity: 'medium' as const, priority: 'balanced' as const }

      console.log('[人物生成] 开始调用AI服务...')
      const response = await aiStore.chat(messages, context, { maxTokens: 5000 })
      console.log('[人物生成] AI响应:', response)

      const content = response.content.trim()
      let jsonStr = content
      const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) jsonStr = jsonMatch[1]
      else if (jsonStr.includes('```')) jsonStr = jsonStr.replace(/```\w*\n?/g, '').trim()

      const parsed = JSON.parse(jsonStr)
      const character: Character = {
        id: uuidv4(),
        ...parsed,
        aiGenerated: true
      }

      resetForm()
      characterForm.value = character
      showCreateDialog.value = true
      ElMessage.success('AI生成人物成功！')
    } else {
      await generateDefaultCharacter()
    }
  } catch (error) {
    console.error('[人物生成] 失败:', error)
    ElMessage.error('生成失败：' + (error as Error).message)
    await generateDefaultCharacter()
  } finally {
    generating.value = false
  }
}

async function generateDefaultCharacter() {
  const exampleCharacter: Character = {
    id: uuidv4(),
    name: '李明',
    aliases: ['小明', '明哥'],
    gender: 'male',
    age: 25,
    appearance: '身材中等，相貌英俊，眼神坚毅',
    personality: ['勇敢', '聪明', '善良'],
    values: ['正义', '友情', '成长'],
    background: '出身平凡，但天赋异禀，从小立志成为最强修炼者',
    motivation: '寻找失踪的父亲，揭开身世之谜',
    abilities: [
      { id: uuidv4(), name: '灵气操控', description: '能够感知和控制周围的灵气', level: '中级' }
    ],
    powerLevel: '中级',
    relationships: [],
    appearances: [],
    development: [],
    tags: ['protagonist'],
    currentState: {
      location: '青云宗',
      status: '修炼中',
      faction: '青云宗',
      updatedAt: Date.now()
    },
    stateHistory: [],
    aiGenerated: false
  }

  resetForm()
  characterForm.value = exampleCharacter
  showCreateDialog.value = true
  ElMessage.success('已生成示例人物数据。要使用AI生成，请在配置中添加API密钥。')
}

function addAbility() {
  characterForm.value.abilities.push({
    id: uuidv4(),
    name: '',
    description: '',
    level: ''
  })
}

function removeAbility(index: number) {
  characterForm.value.abilities.splice(index, 1)
}

function addRelationship() {
  characterForm.value.relationships.push({
    targetId: '',
    type: 'other',
    description: '',
    evolution: []
  })
}

function removeRelationship(index: number) {
  characterForm.value.relationships.splice(index, 1)
}

async function extractFromChaptersRange() {
  if (!project.value) return;
  const start = extractRange.value.start;
  const end = extractRange.value.end;
  
  if (start > end) {
    ElMessage.warning('起始章节不能大于结束章节');
    return;
  }
  
  const chaptersToExtract = project.value.chapters.filter(c => c.number >= start && c.number <= end);
  if (chaptersToExtract.length === 0) {
    ElMessage.warning('选定范围内没有找到章节');
    return;
  }
  
  extractingCharacters.value = true;
  let added = 0;

  try {
    for (let i = 0; i < chaptersToExtract.length; i += extractBatchSize.value) {
      const batchChapters = chaptersToExtract.slice(i, i + extractBatchSize.value);
      const startNum = batchChapters[0].number;
      const endNum = batchChapters[batchChapters.length - 1].number;
      extractCurrentChapter.value = startNum === endNum ? `${startNum}` : `${startNum}-${endNum}`;

      const charResult = await extractCharactersFromChapters(
        batchChapters.map(c => ({ title: c.title, content: c.content }))
      );
      
      if (charResult && charResult.characters.length > 0) {
        const newChars = convertToCharacters(charResult.characters);
        
        newChars.forEach(nc => {
          const existing = project.value!.characters.find(c => c.name === nc.name);
          if (!existing) {
            project.value!.characters.push({
              id: uuidv4(),
              ...nc,
              aiGenerated: true
            } as any);
            added++;
          }
        });
      }
    }
    
    if (added > 0) {
      // 提取完成后统一更新一次关系图
      extractCurrentChapter.value = '更新关系图';
      const allText = chaptersToExtract.map(c => c.content).join('\n\n');
      const extChars = project.value.characters.map(c => ({ name: c.name } as any));
      const relations = analyzeRelationships(allText, extChars);
      
      relations.forEach(rel => {
        const sourceChar = project.value!.characters.find(c => c.name === rel.from);
        const targetChar = project.value!.characters.find(c => c.name === rel.to);
        if (sourceChar && targetChar) {
          const existingRel = sourceChar.relationships.find(r => r.targetId === targetChar.id);
          if (!existingRel) {
            sourceChar.relationships.push({
              targetId: targetChar.id,
              type: 'other',
              description: '共现关系',
              evolution: []
            });
          }
        }
      });
      
      await projectStore.saveCurrentProject();
      ElMessage.success(`成功提取并合并了 ${added} 个新人物，并更新了关系图`);
    } else {
      ElMessage.info('未在选定章节中发现新人物');
    }
    showExtractDialog.value = false;
  } catch (error) {
    console.error('手动提取人物失败', error);
    ElMessage.error('提取失败：' + (error as Error).message);
  } finally {
    extractingCharacters.value = false;
  }
}

function getGenderType(gender: string) {
  const types: Record<string, string> = {
    male: 'primary',
    female: 'danger',
    other: 'info'
  }
  return types[gender] || 'info'
}

function getGenderText(gender: string) {
  const texts: Record<string, string> = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return texts[gender] || gender
}

function getTagType(tag: CharacterTag): string {
  const types: Record<CharacterTag, string> = {
    protagonist: 'primary',
    supporting: 'success',
    antagonist: 'danger',
    minor: 'info',
    other: 'warning'
  }
  return types[tag] || 'info'
}

function getTagLabel(tag: CharacterTag): string {
  const labels: Record<CharacterTag, string> = {
    protagonist: '主角',
    supporting: '配角',
    antagonist: '反派',
    minor: '路人',
    other: '其他'
  }
  return labels[tag] || tag
}

function formatTimestamp(timestamp: Date | string | number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}
</script>

<style scoped>
.characters {
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
}

.main-tabs {
  margin-bottom: 20px;
}

.filter-card {
  margin-bottom: 20px;
}

.filters {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
}

.content {
  min-height: 400px;
}

.characters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.character-card {
  cursor: pointer;
  transition: all 0.3s;
}

.character-card:hover {
  transform: translateY(-5px);
}

.character-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.character-name {
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.character-info {
  margin-bottom: 15px;
}

.info-row {
  margin-bottom: 8px;
  font-size: 14px;
}

.info-row .label {
  color: #909399;
  margin-right: 5px;
}

.character-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e4e7ed;
}

.abilities-list,
.relationships-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.ability-item,
.relationship-item {
  margin-bottom: 0;
}

.ability-content {
  display: flex;
  align-items: center;
}

.state-history {
  max-height: 300px;
  overflow-y: auto;
}
</style>
