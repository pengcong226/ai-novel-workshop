<template>
  <div class="character-state-tracker">
    <!-- 状态概览 -->
    <el-card shadow="hover" class="overview-card">
      <template #header>
        <div class="card-header">
          <span>人物状态概览</span>
          <el-button type="primary" size="small" @click="refreshStates">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>

      <div v-if="charactersWithState.length === 0" class="empty-state">
        <el-empty description="暂无人物状态数据">
          <el-button type="primary" @click="initializeStates">初始化状态</el-button>
        </el-empty>
      </div>

      <div v-else class="states-grid">
        <el-card
          v-for="char in charactersWithState"
          :key="char.id"
          class="state-card"
          shadow="hover"
          @click="showStateDetail(char)"
        >
          <div class="state-header">
            <div class="character-info">
              <span class="name">{{ char.name }}</span>
              <el-tag :type="getTagType(char.tags?.[0])" size="small">{{ getTagLabel(char.tags?.[0]) }}</el-tag>
            </div>
            <el-tag :type="getStatusType(char.currentState?.status)">
              {{ char.currentState?.status || '未知' }}
            </el-tag>
          </div>

          <div class="state-content">
            <div class="state-item" v-if="char.currentState?.location">
              <el-icon><Location /></el-icon>
              <span>{{ char.currentState.location }}</span>
            </div>
            <div class="state-item" v-if="char.currentState?.faction">
              <el-icon><Flag /></el-icon>
              <span>{{ char.currentState.faction }}</span>
            </div>
            <div class="state-item">
              <el-icon><Document /></el-icon>
              <span>{{ char.stateHistory?.length || 0 }} 条变更记录</span>
            </div>
          </div>

          <div class="state-footer">
            <span class="update-time">
              更新于 {{ formatTime(char.currentState?.updatedAt) }}
            </span>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 位置分布 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover" class="location-card">
          <template #header>
            <span>位置分布</span>
          </template>

          <div v-if="locationStats.length === 0" class="empty-section">
            <el-empty description="暂无位置数据" :image-size="60" />
          </div>

          <div v-else class="location-list">
            <div
              v-for="loc in locationStats"
              :key="loc.location"
              class="location-item"
            >
              <div class="location-info">
                <span class="location-name">{{ loc.location || '未知位置' }}</span>
                <el-tag size="small">{{ loc.count }} 人</el-tag>
              </div>
              <div class="location-characters">
                <el-tag
                  v-for="char in loc.characters.slice(0, 5)"
                  :key="char.id"
                  size="small"
                  style="margin-right: 5px; margin-bottom: 5px;"
                >
                  {{ char.name }}
                </el-tag>
                <el-tag v-if="loc.characters.length > 5" size="small" type="info">
                  +{{ loc.characters.length - 5 }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="hover" class="faction-card">
          <template #header>
            <span>势力分布</span>
          </template>

          <div v-if="factionStats.length === 0" class="empty-section">
            <el-empty description="暂无势力数据" :image-size="60" />
          </div>

          <div v-else class="faction-list">
            <div
              v-for="fac in factionStats"
              :key="fac.faction"
              class="faction-item"
            >
              <div class="faction-info">
                <span class="faction-name">{{ fac.faction || '未知势力' }}</span>
                <el-tag size="small">{{ fac.count }} 人</el-tag>
              </div>
              <div class="faction-characters">
                <el-tag
                  v-for="char in fac.characters.slice(0, 5)"
                  :key="char.id"
                  size="small"
                  style="margin-right: 5px; margin-bottom: 5px;"
                >
                  {{ char.name }}
                </el-tag>
                <el-tag v-if="fac.characters.length > 5" size="small" type="info">
                  +{{ fac.characters.length - 5 }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 状态变更历史 -->
    <el-card shadow="hover" class="history-card">
      <template #header>
        <div class="card-header">
          <span>状态变更历史</span>
          <div class="header-actions">
            <el-select v-model="historyFilter.character" placeholder="筛选人物" clearable style="width: 150px; margin-right: 10px;">
              <el-option
                v-for="char in characters"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
            <el-select v-model="historyFilter.type" placeholder="筛选类型" clearable style="width: 120px;">
              <el-option label="位置变更" value="location" />
              <el-option label="状态变更" value="status" />
              <el-option label="势力变更" value="faction" />
            </el-select>
          </div>
        </div>
      </template>

      <div v-if="filteredHistory.length === 0" class="empty-section">
        <el-empty description="暂无状态变更历史" :image-size="60" />
      </div>

      <div v-else class="history-timeline">
        <el-timeline>
          <el-timeline-item
            v-for="(record, index) in filteredHistory"
            :key="index"
            :timestamp="formatTime(record.timestamp)"
            placement="top"
            :type="getHistoryType(record.type)"
          >
            <el-card shadow="hover" class="history-item">
              <div class="history-header">
                <el-tag>{{ record.characterName }}</el-tag>
                <el-tag :type="getHistoryType(record.type)" size="small">
                  {{ getHistoryTypeLabel(record.type) }}
                </el-tag>
              </div>
              <div class="history-content">
                <div v-if="record.type === 'location'">
                  <span class="old-value">{{ record.oldValue || '未知' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '未知' }}</span>
                </div>
                <div v-else-if="record.type === 'status'">
                  <span class="old-value">{{ record.oldValue || '未知' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '未知' }}</span>
                </div>
                <div v-else-if="record.type === 'faction'">
                  <span class="old-value">{{ record.oldValue || '无' }}</span>
                  <el-icon class="arrow"><Right /></el-icon>
                  <span class="new-value">{{ record.newValue || '无' }}</span>
                </div>
                <div v-if="record.chapter" class="chapter-info">
                  第 {{ record.chapter }} 章
                </div>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-card>

    <!-- 状态详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      :title="selectedCharacter?.name + ' - 状态详情'"
      width="600px"
    >
      <div v-if="selectedCharacter" class="state-detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="当前位置">
            {{ selectedCharacter.currentState?.location || '未知' }}
          </el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="getStatusType(selectedCharacter.currentState?.status)">
              {{ selectedCharacter.currentState?.status || '未知' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="所属势力">
            {{ selectedCharacter.currentState?.faction || '无' }}
          </el-descriptions-item>
          <el-descriptions-item label="最后更新">
            {{ formatTime(selectedCharacter.currentState?.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="state-history-section">
          <h4>变更历史</h4>
          <el-timeline v-if="selectedCharacter.stateHistory?.length">
            <el-timeline-item
              v-for="(history, index) in selectedCharacter.stateHistory"
              :key="index"
              :timestamp="formatTime(history.timestamp)"
              placement="top"
            >
              <el-card shadow="hover">
                <div v-if="history.location">位置：{{ history.location }}</div>
                <div v-if="history.status">状态：{{ history.status }}</div>
                <div v-if="history.faction">势力：{{ history.faction }}</div>
                <div v-if="history.chapter">章节：第 {{ history.chapter }} 章</div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无变更历史" :image-size="60" />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage } from 'element-plus'
import { Refresh, Location, Flag, Document, Right } from '@element-plus/icons-vue'
import type { Character, CharacterTag } from '@/types'

const projectStore = useProjectStore()

const project = computed(() => projectStore.currentProject)
const characters = computed(() => project.value?.characters || [])

// 对话框
const showDetailDialog = ref(false)
const selectedCharacter = ref<Character | null>(null)

// 历史筛选
const historyFilter = ref({
  character: '',
  type: ''
})

// 标签配置
const TAG_LABELS: Record<CharacterTag, string> = {
  protagonist: '主角',
  supporting: '配角',
  antagonist: '反派',
  minor: '路人',
  other: '其他'
}

// 有状态的人物
const charactersWithState = computed(() =>
  characters.value.filter(c => c.currentState || c.stateHistory?.length)
)

// 位置统计
const locationStats = computed(() => {
  const locationMap = new Map<string, { count: number; characters: Character[] }>()

  characters.value.forEach(char => {
    const location = char.currentState?.location || ''
    if (location) {
      const existing = locationMap.get(location) || { count: 0, characters: [] }
      existing.count++
      existing.characters.push(char)
      locationMap.set(location, existing)
    }
  })

  return Array.from(locationMap.entries())
    .map(([location, data]) => ({
      location,
      count: data.count,
      characters: data.characters
    }))
    .sort((a, b) => b.count - a.count)
})

// 势力统计
const factionStats = computed(() => {
  const factionMap = new Map<string, { count: number; characters: Character[] }>()

  characters.value.forEach(char => {
    const faction = char.currentState?.faction || ''
    if (faction) {
      const existing = factionMap.get(faction) || { count: 0, characters: [] }
      existing.count++
      existing.characters.push(char)
      factionMap.set(faction, existing)
    }
  })

  return Array.from(factionMap.entries())
    .map(([faction, data]) => ({
      faction,
      count: data.count,
      characters: data.characters
    }))
    .sort((a, b) => b.count - a.count)
})

// 合并所有状态历史
const allHistory = computed(() => {
  const history: Array<{
    characterId: string
    characterName: string
    type: 'location' | 'status' | 'faction'
    oldValue: string
    newValue: string
    timestamp: Date
    chapter?: number
  }> = []

  characters.value.forEach(char => {
    if (!char.stateHistory) return

    // 从历史记录中提取变更
    char.stateHistory.forEach((record, index) => {
      const prevRecord = char.stateHistory?.[index + 1]

      if (record.location && prevRecord?.location !== record.location) {
        history.push({
          characterId: char.id,
          characterName: char.name,
          type: 'location',
          oldValue: prevRecord?.location || '',
          newValue: record.location,
          timestamp: new Date(record.timestamp),
          chapter: record.chapter
        })
      }

      if (record.status && prevRecord?.status !== record.status) {
        history.push({
          characterId: char.id,
          characterName: char.name,
          type: 'status',
          oldValue: prevRecord?.status || '',
          newValue: record.status,
          timestamp: new Date(record.timestamp),
          chapter: record.chapter
        })
      }

      if (record.faction && prevRecord?.faction !== record.faction) {
        history.push({
          characterId: char.id,
          characterName: char.name,
          type: 'faction',
          oldValue: prevRecord?.faction || '',
          newValue: record.faction,
          timestamp: new Date(record.timestamp),
          chapter: record.chapter
        })
      }
    })
  })

  // 按时间倒序排列
  return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
})

// 过滤后的历史
const filteredHistory = computed(() => {
  let result = allHistory.value

  if (historyFilter.value.character) {
    result = result.filter(h => h.characterId === historyFilter.value.character)
  }

  if (historyFilter.value.type) {
    result = result.filter(h => h.type === historyFilter.value.type)
  }

  return result.slice(0, 50) // 限制显示数量
})

// 方法
function getTagType(tag?: CharacterTag): string {
  if (!tag) return 'info'
  const types: Record<CharacterTag, string> = {
    protagonist: 'primary',
    supporting: 'success',
    antagonist: 'danger',
    minor: 'info',
    other: 'warning'
  }
  return types[tag] || 'info'
}

function getTagLabel(tag?: CharacterTag): string {
  if (!tag) return '未知'
  return TAG_LABELS[tag] || tag
}

function getStatusType(status?: string): string {
  if (!status) return 'info'
  const statusLower = status.toLowerCase()

  if (statusLower.includes('健康') || statusLower.includes('正常')) return 'success'
  if (statusLower.includes('受伤') || statusLower.includes('生病')) return 'warning'
  if (statusLower.includes('危险') || statusLower.includes('重伤')) return 'danger'
  return 'info'
}

function getHistoryType(type: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    location: 'primary',
    status: 'warning',
    faction: 'success'
  }
  return types[type] || 'info'
}

function getHistoryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    location: '位置变更',
    status: '状态变更',
    faction: '势力变更'
  }
  return labels[type] || type
}

function formatTime(timestamp?: Date | string | number): string {
  if (!timestamp) return '未知'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function showStateDetail(char: Character) {
  selectedCharacter.value = char
  showDetailDialog.value = true
}

function refreshStates() {
  ElMessage.success('状态已刷新')
}

async function initializeStates() {
  if (!project.value) return

  try {
    characters.value.forEach(char => {
      if (!char.currentState) {
        char.currentState = {
          location: '',
          status: '',
          faction: '',
          updatedAt: Date.now()
        }
      }
      if (!char.stateHistory) {
        char.stateHistory = []
      }
    })

    await projectStore.saveCurrentProject()
    ElMessage.success('状态初始化完成')
  } catch (error) {
    console.error('初始化状态失败:', error)
    ElMessage.error('初始化状态失败')
  }
}
</script>

<style scoped>
.character-state-tracker {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.overview-card,
.location-card,
.faction-card,
.history-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
}

.empty-state {
  padding: 40px 0;
}

.empty-section {
  padding: 20px 0;
}

.states-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 15px;
}

.state-card {
  cursor: pointer;
  transition: all 0.3s;
}

.state-card:hover {
  transform: translateY(-3px);
}

.state-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.character-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.character-info .name {
  font-size: 16px;
  font-weight: 600;
}

.state-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 15px;
}

.state-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
}

.state-footer {
  padding-top: 10px;
  border-top: 1px solid #E4E7ED;
}

.update-time {
  font-size: 12px;
  color: #909399;
}

.location-list,
.faction-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 400px;
  overflow-y: auto;
}

.location-item,
.faction-item {
  padding: 10px;
  background: #F5F7FA;
  border-radius: 8px;
}

.location-info,
.faction-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.location-name,
.faction-name {
  font-weight: 600;
  color: #303133;
}

.location-characters,
.faction-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.history-timeline {
  max-height: 500px;
  overflow-y: auto;
}

.history-item {
  margin-bottom: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-content {
  font-size: 14px;
}

.history-content .old-value {
  color: #909399;
}

.history-content .arrow {
  margin: 0 10px;
  color: #909399;
}

.history-content .new-value {
  color: #409EFF;
  font-weight: 600;
}

.chapter-info {
  margin-top: 5px;
  font-size: 12px;
  color: #909399;
}

.state-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.state-history-section h4 {
  margin: 0 0 15px 0;
  font-size: 16px;
  color: #303133;
}
</style>
