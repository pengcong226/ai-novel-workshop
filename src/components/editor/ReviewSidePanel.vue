<template>
  <aside v-if="visible" class="review-side-panel">
    <div class="panel-header">
      <div>
        <h3>审校批注</h3>
        <p>共 {{ chapterSuggestions.length }} 条建议，{{ unresolvedSuggestions.length }} 条未处理</p>
      </div>
      <el-tag type="primary" effect="plain">第 {{ chapterNumber }} 章</el-tag>
    </div>

    <el-empty v-if="chapterSuggestions.length === 0" description="暂无审校建议" />

    <div v-else class="suggestion-list">
      <el-card
        v-for="suggestion in sortedSuggestions"
        :key="suggestion.id"
        class="suggestion-card"
        shadow="never"
        :class="`priority-${suggestion.priority}`"
      >
        <div class="suggestion-head">
          <el-tag :type="priorityTagType(suggestion.priority)" size="small">
            {{ priorityLabel(suggestion.priority) }}
          </el-tag>
          <el-tag size="small" effect="plain">{{ suggestion.category }}</el-tag>
          <el-tag v-if="suggestion.status !== 'unread' && suggestion.status !== 'read'" size="small" type="info">
            {{ statusLabel(suggestion.status) }}
          </el-tag>
        </div>

        <h4>{{ suggestion.title }}</h4>
        <p class="message">{{ suggestion.message }}</p>

        <div v-if="suggestion.location.paragraphIndex !== undefined" class="paragraph-line">
          段落 P{{ suggestion.location.paragraphIndex }}
        </div>

        <blockquote v-if="suggestion.location.textSnippet" class="snippet">
          {{ suggestion.location.textSnippet }}
        </blockquote>

        <div v-if="suggestion.location.suggestedFix" class="fix-block">
          <span>建议修改：</span>
          <p>{{ suggestion.location.suggestedFix }}</p>
        </div>

        <div class="actions">
          <el-button
            size="small"
            :disabled="suggestion.location.paragraphIndex === undefined"
            @click="emitNavigate(suggestion)"
          >
            跳转
          </el-button>
          <el-button
            size="small"
            type="primary"
            plain
            :disabled="!canApplyFix(suggestion)"
            @click="emitApplyFix(suggestion)"
          >
            采纳修复
          </el-button>
          <el-button size="small" text @click="emit('dismiss', suggestion.id)">
            忽略
          </el-button>
        </div>
      </el-card>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TagProps } from 'element-plus'
import { useSuggestionsStore } from '@/stores/suggestions'
import type { Suggestion, SuggestionPriority, SuggestionStatus } from '@/types/suggestions'

const props = defineProps<{
  visible: boolean
  projectId?: string
  chapterId?: string
  chapterNumber: number
}>()

const emit = defineEmits<{
  'navigate-to': [paragraphIndex: number]
  'apply-fix': [payload: { suggestionId: string; paragraphIndex?: number; originalSnippet: string; fixContent: string }]
  dismiss: [suggestionId: string]
}>()

const suggestionsStore = useSuggestionsStore()

const chapterSuggestions = computed(() =>
  suggestionsStore.getSuggestionsByChapter(props.chapterNumber, {
    projectId: props.projectId,
    chapterId: props.chapterId,
  })
)

const unresolvedSuggestions = computed(() =>
  chapterSuggestions.value.filter(suggestion => suggestion.status !== 'adopted' && suggestion.status !== 'ignored')
)

const sortedSuggestions = computed(() => {
  const priorityRank: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2 }
  return [...chapterSuggestions.value].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
})

function canApplyFix(suggestion: Suggestion): boolean {
  return Boolean(suggestion.location.textSnippet && suggestion.location.suggestedFix && suggestion.status !== 'adopted' && suggestion.status !== 'ignored')
}

function emitNavigate(suggestion: Suggestion): void {
  if (suggestion.location.paragraphIndex === undefined) return
  emit('navigate-to', suggestion.location.paragraphIndex)
}

function emitApplyFix(suggestion: Suggestion): void {
  const originalSnippet = suggestion.location.textSnippet
  const fixContent = suggestion.location.suggestedFix
  if (!originalSnippet || !fixContent) return

  emit('apply-fix', {
    suggestionId: suggestion.id,
    paragraphIndex: suggestion.location.paragraphIndex,
    originalSnippet,
    fixContent,
  })
}

function priorityTagType(priority: SuggestionPriority): TagProps['type'] {
  if (priority === 'high') return 'danger'
  if (priority === 'medium') return 'warning'
  return 'info'
}

function priorityLabel(priority: SuggestionPriority): string {
  if (priority === 'high') return '高优先级'
  if (priority === 'medium') return '中优先级'
  return '低优先级'
}

function statusLabel(status: SuggestionStatus): string {
  if (status === 'adopted') return '已采纳'
  if (status === 'ignored') return '已忽略'
  if (status === 'read') return '已读'
  return '未读'
}
</script>

<style scoped>
.review-side-panel {
  width: 360px;
  height: 100%;
  padding: 20px;
  overflow-y: auto;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color-overlay);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0 0 4px;
}

.panel-header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-card {
  border-left: 3px solid var(--el-border-color);
}

.suggestion-card.priority-high {
  border-left-color: var(--el-color-danger);
}

.suggestion-card.priority-medium {
  border-left-color: var(--el-color-warning);
}

.suggestion-card.priority-low {
  border-left-color: var(--el-color-info);
}

.suggestion-head,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.suggestion-card h4 {
  margin: 10px 0 6px;
}

.message {
  margin: 0 0 10px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.paragraph-line {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.snippet {
  margin: 8px 0;
  padding: 8px 10px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-border-color);
}

.fix-block {
  margin: 8px 0 12px;
  padding: 8px 10px;
  background: var(--el-color-success-light-9);
  border-radius: 6px;
  font-size: 13px;
}

.fix-block span {
  color: var(--el-color-success);
  font-weight: 600;
}

.fix-block p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
</style>
