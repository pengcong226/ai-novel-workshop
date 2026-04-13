<template>
  <div class="character-development">
    <!-- 人物选择器 -->
    <el-card shadow="hover" class="selector-card">
      <div class="selector-header">
        <span class="title">选择人物</span>
        <el-select
          v-model="selectedCharacterId"
          placeholder="选择要查看成长轨迹的人物"
          filterable
          style="width: 300px"
        >
          <el-option
            v-for="char in charactersWithDevelopment"
            :key="char.id"
            :label="char.name"
            :value="char.id"
          >
            <span>{{ char.name }}</span>
            <el-tag size="small" style="margin-left: 10px">{{ char.development.length }} 个成长节点</el-tag>
          </el-option>
        </el-select>
      </div>
    </el-card>

    <template v-if="selectedCharacter">
      <!-- 人物基本信息 -->
      <el-card shadow="hover" class="info-card">
        <div class="character-info">
          <div class="info-main">
            <h3>{{ selectedCharacter.name }}</h3>
            <div class="info-tags">
              <el-tag :type="getGenderType(selectedCharacter.gender)">
                {{ getGenderText(selectedCharacter.gender) }}
              </el-tag>
              <el-tag v-for="tag in selectedCharacter.tags" :key="tag" :type="getTagType(tag)">
                {{ getTagLabel(tag) }}
              </el-tag>
            </div>
          </div>
          <div class="info-stats">
            <div class="stat-item">
              <span class="stat-value">{{ selectedCharacter.development.length }}</span>
              <span class="stat-label">成长节点</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ selectedCharacter.appearances.length }}</span>
              <span class="stat-label">出场章节</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 成长时间线 -->
      <el-card shadow="hover" class="timeline-card">
        <template #header>
          <div class="card-header">
            <span>成长轨迹</span>
            <el-button type="primary" size="small" @click="addDevelopmentNode">
              <el-icon><Plus /></el-icon>
              添加节点
            </el-button>
          </div>
        </template>

        <div v-if="sortedDevelopment.length === 0" class="empty-state">
          <el-empty description="暂无成长记录">
            <el-button type="primary" @click="addDevelopmentNode">添加第一个成长节点</el-button>
          </el-empty>
        </div>

        <div v-else class="timeline-container">
          <el-timeline>
            <el-timeline-item
              v-for="(dev, index) in sortedDevelopment"
              :key="index"
              :timestamp="`第 ${dev.chapter} 章`"
              :type="getTimelineType(index)"
              :hollow="true"
              size="large"
              placement="top"
            >
              <el-card shadow="hover" class="timeline-card-item">
                <div class="development-header">
                  <div class="development-title">
                    <el-tag type="primary" effect="plain">第 {{ dev.chapter }} 章</el-tag>
                    <h4>{{ dev.event }}</h4>
                  </div>
                  <div class="development-actions">
                    <el-button text type="primary" size="small" @click="editDevelopmentNode(dev, index)">
                      编辑
                    </el-button>
                    <el-button text type="danger" size="small" @click="deleteDevelopmentNode(index)">
                      删除
                    </el-button>
                    <el-button text type="primary" size="small" @click="goToChapter(dev.chapter)">
                      查看章节
                    </el-button>
                  </div>
                </div>

                <div class="development-content">
                  <div class="growth-section">
                    <div class="section-label">成长内容</div>
                    <p>{{ dev.growth }}</p>
                  </div>

                  <!-- 显示能力变化 -->
                  <div v-if="dev.abilityChanges && dev.abilityChanges.length > 0" class="changes-section">
                    <div class="section-label">能力变化</div>
                    <div class="ability-changes">
                      <el-tag
                        v-for="change in dev.abilityChanges"
                        :key="change.abilityId"
                        :type="change.type === 'gain' ? 'success' : change.type === 'improve' ? 'primary' : 'warning'"
                        style="margin-right: 8px; margin-bottom: 8px;"
                      >
                        {{ change.type === 'gain' ? '获得' : change.type === 'improve' ? '提升' : '变化' }}
                        {{ change.abilityName }}
                      </el-tag>
                    </div>
                  </div>

                  <!-- 显示关系变化 -->
                  <div v-if="dev.relationshipChanges && dev.relationshipChanges.length > 0" class="changes-section">
                    <div class="section-label">关系变化</div>
                    <div class="relationship-changes">
                      <div v-for="change in dev.relationshipChanges" :key="change.targetId" class="relationship-change">
                        <el-tag type="info">{{ getCharacterName(change.targetId) }}</el-tag>
                        <span class="change-arrow">→</span>
                        <el-tag :type="getRelationType(change.newType)">{{ getRelationLabel(change.newType) }}</el-tag>
                      </div>
                    </div>
                  </div>

                  <!-- 显示状态变化 -->
                  <div v-if="dev.stateChange" class="changes-section">
                    <div class="section-label">状态变化</div>
                    <div class="state-change">
                      <div v-if="dev.stateChange.oldLocation" class="state-item">
                        <span class="state-label">位置：</span>
                        <span class="state-old">{{ dev.stateChange.oldLocation }}</span>
                        <span class="change-arrow">→</span>
                        <span class="state-new">{{ dev.stateChange.newLocation }}</span>
                      </div>
                      <div v-if="dev.stateChange.oldStatus" class="state-item">
                        <span class="state-label">状态：</span>
                        <span class="state-old">{{ dev.stateChange.oldStatus }}</span>
                        <span class="change-arrow">→</span>
                        <span class="state-new">{{ dev.stateChange.newStatus }}</span>
                      </div>
                      <div v-if="dev.stateChange.oldFaction" class="state-item">
                        <span class="state-label">势力：</span>
                        <span class="state-old">{{ dev.stateChange.oldFaction }}</span>
                        <span class="change-arrow">→</span>
                        <span class="state-new">{{ dev.stateChange.newFaction }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-card>

      <!-- 成长统计 -->
      <el-card shadow="hover" class="stats-card">
        <template #header>
          <span>成长统计</span>
        </template>

        <el-row :gutter="20">
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ developmentByType.ability.length }}</div>
              <div class="stat-label">能力成长</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ developmentByType.relationship.length }}</div>
              <div class="stat-label">关系变化</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ developmentByType.state.length }}</div>
              <div class="stat-label">状态转变</div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>

    <!-- 编辑成长节点对话框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingNode ? '编辑成长节点' : '添加成长节点'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="nodeForm" label-width="100px">
        <el-form-item label="所在章节" required>
          <el-input-number v-model="nodeForm.chapter" :min="1" :max="maxChapter" />
        </el-form-item>

        <el-form-item label="事件名称" required>
          <el-input v-model="nodeForm.event" placeholder="事件简述" />
        </el-form-item>

        <el-form-item label="成长内容" required>
          <el-input
            v-model="nodeForm.growth"
            type="textarea"
            :rows="4"
            placeholder="描述这个事件带来的成长和变化"
          />
        </el-form-item>

        <el-form-item label="能力变化">
          <div class="ability-changes-editor">
            <div v-for="(change, index) in nodeForm.abilityChanges" :key="index" class="change-item">
              <el-select v-model="change.type" style="width: 100px; margin-right: 10px;">
                <el-option label="获得" value="gain" />
                <el-option label="提升" value="improve" />
                <el-option label="变化" value="change" />
              </el-select>
              <el-input v-model="change.abilityName" placeholder="能力名称" style="flex: 1; margin-right: 10px;" />
              <el-button type="danger" text @click="removeAbilityChange(index)">
                删除
              </el-button>
            </div>
            <el-button type="primary" text @click="addAbilityChange">
              <el-icon><Plus /></el-icon>
              添加能力变化
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="关系变化">
          <div class="relationship-changes-editor">
            <div v-for="(change, index) in nodeForm.relationshipChanges" :key="index" class="change-item">
              <el-select v-model="change.targetId" placeholder="选择人物" style="width: 150px; margin-right: 10px;">
                <el-option
                  v-for="char in otherCharacters"
                  :key="char.id"
                  :label="char.name"
                  :value="char.id"
                />
              </el-select>
              <el-select v-model="change.newType" placeholder="关系类型" style="width: 120px; margin-right: 10px;">
                <el-option label="家人" value="family" />
                <el-option label="朋友" value="friend" />
                <el-option label="敌人" value="enemy" />
                <el-option label="恋人" value="lover" />
                <el-option label="对手" value="rival" />
                <el-option label="其他" value="other" />
              </el-select>
              <el-button type="danger" text @click="removeRelationshipChange(index)">
                删除
              </el-button>
            </div>
            <el-button type="primary" text @click="addRelationshipChange">
              <el-icon><Plus /></el-icon>
              添加关系变化
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="状态变化">
          <div class="state-change-editor">
            <el-row :gutter="10">
              <el-col :span="8">
                <el-input v-model="stateChangeForm.oldLocation" placeholder="原位置" />
              </el-col>
              <el-col :span="8">
                <el-input v-model="stateChangeForm.newLocation" placeholder="新位置" />
              </el-col>
            </el-row>
            <el-row :gutter="10" style="margin-top: 10px;">
              <el-col :span="8">
                <el-input v-model="stateChangeForm.oldStatus" placeholder="原状态" />
              </el-col>
              <el-col :span="8">
                <el-input v-model="stateChangeForm.newStatus" placeholder="新状态" />
              </el-col>
            </el-row>
            <el-row :gutter="10" style="margin-top: 10px;">
              <el-col :span="8">
                <el-input v-model="stateChangeForm.oldFaction" placeholder="原势力" />
              </el-col>
              <el-col :span="8">
                <el-input v-model="stateChangeForm.newFaction" placeholder="新势力" />
              </el-col>
            </el-row>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNode" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { CharacterTag, CharacterDevelopment } from '@/types'

// 扩展的成长节点类型
interface AbilityChange {
  abilityId: string
  abilityName: string
  type: 'gain' | 'improve' | 'change'
}

interface RelationshipChange {
  targetId: string
  newType: string
}

interface StateChange {
  oldLocation?: string
  newLocation?: string
  oldStatus?: string
  newStatus?: string
  oldFaction?: string
  newFaction?: string
}

interface ExtendedCharacterDevelopment extends CharacterDevelopment {
  abilityChanges?: AbilityChange[]
  relationshipChanges?: RelationshipChange[]
  stateChange?: StateChange
}

const projectStore = useProjectStore()
const router = useRouter()

const project = computed(() => projectStore.currentProject)
const characters = computed(() => project.value?.characters || [])
const chapters = computed(() => project.value?.chapters || [])

const selectedCharacterId = ref<string>('')
const showEditDialog = ref(false)
const editingNode = ref<ExtendedCharacterDevelopment | null>(null)
const editingIndex = ref<number>(-1)
const saving = ref(false)

// 标签配置
const TAG_CONFIG: Record<CharacterTag, { label: string; color: string }> = {
  protagonist: { label: '主角', color: '#409EFF' },
  supporting: { label: '配角', color: '#67C23A' },
  antagonist: { label: '反派', color: '#F56C6C' },
  minor: { label: '路人', color: '#909399' },
  other: { label: '其他', color: '#E6A23C' }
}

// 表单数据
const nodeForm = ref<ExtendedCharacterDevelopment>({
  chapter: 1,
  event: '',
  growth: '',
  abilityChanges: [],
  relationshipChanges: [],
  stateChange: {}
})

// 状态变化表单（独立管理避免undefined问题）
const stateChangeForm = ref<StateChange>({
  oldLocation: '',
  newLocation: '',
  oldStatus: '',
  newStatus: '',
  oldFaction: '',
  newFaction: ''
})

// 计算属性
const selectedCharacter = computed(() =>
  characters.value.find(c => c.id === selectedCharacterId.value)
)

const charactersWithDevelopment = computed(() =>
  characters.value.map(c => ({
    ...c,
    development: c.development || []
  })).sort((a, b) => b.development.length - a.development.length)
)

const otherCharacters = computed(() =>
  characters.value.filter(c => c.id !== selectedCharacterId.value)
)

const maxChapter = computed(() =>
  chapters.value.length > 0 ? Math.max(...chapters.value.map(c => c.number)) : 1
)

const sortedDevelopment = computed(() => {
  if (!selectedCharacter.value) return []
  return [...(selectedCharacter.value.development || [])].sort((a, b) => a.chapter - b.chapter)
})

const developmentByType = computed(() => {
  if (!selectedCharacter.value) return { ability: [], relationship: [], state: [] }

  const dev = selectedCharacter.value.development || []
  return {
    ability: dev.filter(d => {
      const ext = d as ExtendedCharacterDevelopment
      return ext.abilityChanges && ext.abilityChanges.length > 0
    }),
    relationship: dev.filter(d => {
      const ext = d as ExtendedCharacterDevelopment
      return ext.relationshipChanges && ext.relationshipChanges.length > 0
    }),
    state: dev.filter(d => {
      const ext = d as ExtendedCharacterDevelopment
      if (!ext.stateChange) return false
      return Object.values(ext.stateChange).some(v => v !== undefined && v !== '')
    })
  }
})

// 方法
function getGenderType(gender: string): string {
  const types: Record<string, string> = {
    male: 'primary',
    female: 'danger',
    other: 'info'
  }
  return types[gender] || 'info'
}

function getGenderText(gender: string): string {
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
  return TAG_CONFIG[tag]?.label || tag
}

function getTimelineType(index: number): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const types: ('primary' | 'success' | 'warning' | 'danger' | 'info')[] = ['primary', 'success', 'warning', 'danger', 'info']
  return types[index % types.length]
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || id
}

function getRelationType(type: string): string {
  const types: Record<string, string> = {
    family: 'success',
    friend: 'primary',
    enemy: 'danger',
    lover: 'warning',
    rival: 'info',
    other: ''
  }
  return types[type] || ''
}

function getRelationLabel(type: string): string {
  const labels: Record<string, string> = {
    family: '家人',
    friend: '朋友',
    enemy: '敌人',
    lover: '恋人',
    rival: '对手',
    other: '其他'
  }
  return labels[type] || type
}

function addDevelopmentNode() {
  editingNode.value = null
  editingIndex.value = -1
  nodeForm.value = {
    chapter: 1,
    event: '',
    growth: '',
    abilityChanges: [],
    relationshipChanges: [],
    stateChange: {}
  }
  stateChangeForm.value = {
    oldLocation: '',
    newLocation: '',
    oldStatus: '',
    newStatus: '',
    oldFaction: '',
    newFaction: ''
  }
  showEditDialog.value = true
}

function editDevelopmentNode(node: ExtendedCharacterDevelopment, index: number) {
  editingNode.value = node
  editingIndex.value = index
  nodeForm.value = {
    ...node,
    abilityChanges: node.abilityChanges ? structuredClone(node.abilityChanges) : [],
    relationshipChanges: node.relationshipChanges ? structuredClone(node.relationshipChanges) : [],
    stateChange: node.stateChange ? structuredClone(node.stateChange) : {}
  }
  stateChangeForm.value = {
    oldLocation: node.stateChange?.oldLocation || '',
    newLocation: node.stateChange?.newLocation || '',
    oldStatus: node.stateChange?.oldStatus || '',
    newStatus: node.stateChange?.newStatus || '',
    oldFaction: node.stateChange?.oldFaction || '',
    newFaction: node.stateChange?.newFaction || ''
  }
  showEditDialog.value = true
}

async function saveNode() {
  if (!selectedCharacter.value) return

  if (!nodeForm.value.event.trim()) {
    ElMessage.warning('请输入事件名称')
    return
  }

  if (!nodeForm.value.growth.trim()) {
    ElMessage.warning('请输入成长内容')
    return
  }

  saving.value = true
  try {
    const development = selectedCharacter.value.development || []

    // 构建状态变化对象
    const stateChange: StateChange = {
      oldLocation: stateChangeForm.value.oldLocation || undefined,
      newLocation: stateChangeForm.value.newLocation || undefined,
      oldStatus: stateChangeForm.value.oldStatus || undefined,
      newStatus: stateChangeForm.value.newStatus || undefined,
      oldFaction: stateChangeForm.value.oldFaction || undefined,
      newFaction: stateChangeForm.value.newFaction || undefined
    }

    // 检查是否有有效的状态变化
    const hasStateChange = Object.values(stateChange).some(v => v !== undefined && v !== '')

    const node: ExtendedCharacterDevelopment = {
      chapter: nodeForm.value.chapter,
      event: nodeForm.value.event,
      growth: nodeForm.value.growth,
      abilityChanges: (nodeForm.value.abilityChanges || []).filter(c => c.abilityName.trim()),
      relationshipChanges: (nodeForm.value.relationshipChanges || []).filter(c => c.targetId && c.newType),
      stateChange: hasStateChange ? stateChange : undefined
    }

    if (editingIndex.value >= 0) {
      development[editingIndex.value] = node
    } else {
      development.push(node)
    }

    selectedCharacter.value.development = development
    await projectStore.saveCurrentProject()

    ElMessage.success('保存成功')
    showEditDialog.value = false
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteDevelopmentNode(index: number) {
  if (!selectedCharacter.value) return

  try {
    await ElMessageBox.confirm('确定要删除这个成长节点吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    selectedCharacter.value.development.splice(index, 1)
    await projectStore.saveCurrentProject()
    ElMessage.success('删除成功')
  } catch {
    // 用户取消
  }
}

function addAbilityChange() {
  if (!nodeForm.value.abilityChanges) {
    nodeForm.value.abilityChanges = []
  }
  nodeForm.value.abilityChanges.push({
    abilityId: uuidv4(),
    abilityName: '',
    type: 'gain'
  })
}

function addRelationshipChange() {
  if (!nodeForm.value.relationshipChanges) {
    nodeForm.value.relationshipChanges = []
  }
  nodeForm.value.relationshipChanges.push({
    targetId: '',
    newType: 'other'
  })
}

function removeAbilityChange(index: number) {
  if (nodeForm.value.abilityChanges) {
    nodeForm.value.abilityChanges.splice(index, 1)
  }
}

function removeRelationshipChange(index: number) {
  if (nodeForm.value.relationshipChanges) {
    nodeForm.value.relationshipChanges.splice(index, 1)
  }
}

function goToChapter(chapterNumber: number) {
  if (project.value) {
    router.push(`/project/${project.value.id}/chapters?chapter=${chapterNumber}`)
  }
}

// 自动选择第一个有人物成长数据的人物
watch(charactersWithDevelopment, (newChars) => {
  if (!selectedCharacterId.value && newChars.length > 0) {
    // 优先选择有成长数据的人物
    const withDev = newChars.find(c => c.development.length > 0)
    selectedCharacterId.value = withDev?.id || newChars[0].id
  }
}, { immediate: true })
</script>

<style scoped>
.character-development {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.selector-card {
  margin-bottom: 0;
}

.selector-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.selector-header .title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.info-card {
  margin-bottom: 0;
}

.character-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-main h3 {
  margin: 0 0 10px 0;
  font-size: 20px;
}

.info-tags {
  display: flex;
  gap: 8px;
}

.info-stats {
  display: flex;
  gap: 30px;
}

.stat-item {
  text-align: center;
}

.stat-item .stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #409EFF;
}

.stat-item .stat-label {
  font-size: 12px;
  color: #909399;
}

.timeline-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-state {
  padding: 40px 0;
}

.timeline-container {
  padding: 20px 0;
}

.timeline-card-item {
  margin-bottom: 0;
}

.development-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.development-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.development-title h4 {
  margin: 0;
  font-size: 16px;
}

.development-actions {
  display: flex;
  gap: 5px;
}

.development-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 8px;
}

.growth-section p {
  margin: 0;
  line-height: 1.6;
  color: #606266;
}

.changes-section {
  padding-top: 10px;
  border-top: 1px dashed #E4E7ED;
}

.ability-changes,
.relationship-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.relationship-change {
  display: flex;
  align-items: center;
  gap: 8px;
}

.change-arrow {
  color: #909399;
}

.state-change {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-item {
  display: flex;
  align-items: center;
}

.state-label {
  width: 50px;
  color: #909399;
  font-size: 13px;
}

.state-old {
  color: #909399;
}

.state-new {
  color: #409EFF;
  font-weight: 600;
}

.stats-card {
  margin-bottom: 0;
}

.stat-box {
  text-align: center;
  padding: 20px;
  background: #F5F7FA;
  border-radius: 8px;
}

.stat-box .stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409EFF;
}

.stat-box .stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
}

.ability-changes-editor,
.relationship-changes-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.change-item {
  display: flex;
  align-items: center;
}

.state-change-editor {
  width: 100%;
}
</style>
