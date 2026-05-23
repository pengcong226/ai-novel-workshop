<template>
  <div class="suggestions-panel">
    <div class="suggestions-filter">
      <el-select v-model="filter.status" placeholder="状态" size="small" clearable>
        <el-option label="未读" value="unread" />
        <el-option label="已读" value="read" />
        <el-option label="已采纳" value="adopted" />
        <el-option label="已忽略" value="ignored" />
      </el-select>
      <el-select v-model="filter.priority" placeholder="优先级" size="small" clearable>
        <el-option label="高" value="high" />
        <el-option label="中" value="medium" />
        <el-option label="低" value="low" />
      </el-select>
      <el-select v-model="filter.category" placeholder="类型" size="small" clearable>
        <el-option label="一致性" value="consistency" />
        <el-option label="质量" value="quality" />
        <el-option label="优化" value="optimization" />
        <el-option label="问题" value="problem" />
        <el-option label="提醒" value="reminder" />
      </el-select>
    </div>

    <div class="suggestions-list">
      <el-empty v-if="suggestions.length === 0" description="暂无建议" />

      <el-card
        v-for="suggestion in suggestions"
        :key="suggestion.id"
        class="suggestion-card"
        :class="[`priority-${suggestion.priority}`, `status-${suggestion.status}`]"
        shadow="hover"
      >
        <div class="suggestion-header">
          <div class="suggestion-title">
            <el-tag :type="getTypeTagType(suggestion.type)" size="small">
              {{ getTypeLabel(suggestion.type) }}
            </el-tag>
            <el-tag :type="getPriorityTagType(suggestion.priority)" size="small">
              {{ getPriorityLabel(suggestion.priority) }}
            </el-tag>
            <span class="title-text">{{ suggestion.title }}</span>
          </div>
          <el-dropdown trigger="click">
            <el-icon class="more-icon"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="emit('mark-read', suggestion.id)">标记已读</el-dropdown-item>
                <el-dropdown-item @click="emit('mark-adopted', suggestion.id)">标记已采纳</el-dropdown-item>
                <el-dropdown-item @click="emit('mark-ignored', suggestion.id)">忽略</el-dropdown-item>
                <el-dropdown-item divided @click="emit('delete', suggestion.id)">删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <div class="suggestion-message">{{ suggestion.message }}</div>

        <div v-if="suggestion.location.chapter" class="suggestion-location">
          <el-tag size="small" type="info">第{{ suggestion.location.chapter }}章</el-tag>
        </div>

        <div v-if="suggestion.actions && suggestion.actions.length > 0" class="suggestion-actions">
          <el-button
            v-for="action in suggestion.actions"
            :key="action.type"
            size="small"
            :type="action.type === 'auto_fix' ? 'primary' : 'default'"
            @click="emit('action', suggestion, action)"
          >
            {{ action.label }}
          </el-button>
        </div>

        <div class="suggestion-footer">
          <span class="suggestion-time">{{ formatTime(suggestion.createdAt) }}</span>
          <span class="suggestion-status">{{ getStatusLabel(suggestion.status) }}</span>
        </div>
      </el-card>
    </div>

    <div v-if="selectedSuggestions.length > 0" class="batch-actions">
      <span>已选 {{ selectedSuggestions.length }} 项</span>
      <el-button size="small" @click="emit('batch-read')">标记已读</el-button>
      <el-button size="small" type="primary" @click="emit('batch-adopted')">标记已采纳</el-button>
      <el-button size="small" type="info" @click="emit('batch-ignored')">忽略</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MoreFilled } from '@element-plus/icons-vue'
import type { Suggestion, SuggestionAction, SuggestionCategory, SuggestionPriority, SuggestionStatus } from '@/types/suggestions'

interface SuggestionFilterModel {
  status?: SuggestionStatus
  priority?: SuggestionPriority
  category?: SuggestionCategory
}

interface Props {
  suggestions: Suggestion[]
  selectedSuggestions: string[]
  formatTime: (date: Date) => string
  getTypeTagType: (type: string) => 'success' | 'warning' | 'info' | 'danger'
  getTypeLabel: (type: string) => string
  getPriorityTagType: (priority: string) => 'success' | 'warning' | 'info' | 'danger'
  getPriorityLabel: (priority: string) => string
  getStatusLabel: (status: string) => string
}

const filter = defineModel<SuggestionFilterModel>('filter', { required: true })
defineProps<Props>()
const emit = defineEmits<{
  action: [suggestion: Suggestion, action: SuggestionAction]
  'mark-read': [id: string]
  'mark-adopted': [id: string]
  'mark-ignored': [id: string]
  delete: [id: string]
  'batch-read': []
  'batch-adopted': []
  'batch-ignored': []
}>()
</script>

<style scoped>
.suggestions-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.suggestions-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 0 4px;
}

.suggestions-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 4px;
}

.suggestion-card {
  cursor: pointer;
  transition: all 0.3s;
}

.suggestion-card.priority-high {
  border-left: 3px solid #f56c6c;
}

.suggestion-card.priority-medium {
  border-left: 3px solid #e6a23c;
}

.suggestion-card.priority-low {
  border-left: 3px solid #409eff;
}

.suggestion-card.status-adopted {
  opacity: 0.7;
}

.suggestion-card.status-ignored {
  opacity: 0.5;
}

.suggestion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.suggestion-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text {
  font-weight: 600;
  font-size: 14px;
}

.more-icon {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.more-icon:hover {
  background: #f0f2f5;
}

.suggestion-message {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 8px;
}

.suggestion-location {
  margin-bottom: 8px;
}

.suggestion-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-top: 12px;
}
</style>
