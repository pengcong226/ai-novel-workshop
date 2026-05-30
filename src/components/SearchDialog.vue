<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    width="560px"
    append-to-body
    class="search-dialog"
    @opened="onOpened"
    @closed="onClosed"
  >
    <!-- Search Input -->
    <div class="search-input-wrapper">
      <el-icon class="search-icon"><Search /></el-icon>
      <input
        ref="inputRef"
        v-model="query"
        class="search-input"
        placeholder="搜索章节、人物、设定..."
        @keydown.down.prevent="moveSelection(1)"
        @keydown.up.prevent="moveSelection(-1)"
        @keydown.enter.prevent="selectActive"
        @keydown.escape.prevent="close"
      />
      <kbd class="search-hint">Esc</kbd>
    </div>

    <!-- Recent Searches -->
    <div v-if="!query.trim() && recentSearches.length > 0" class="search-section">
      <div class="search-section-header">
        <span>最近搜索</span>
        <button class="clear-recent-btn" @click="clearAllRecent">清除</button>
      </div>
      <div
        v-for="(term, idx) in recentSearches"
        :key="term"
        class="search-item recent-item"
        :class="{ 'search-item--active': selectedIndex === idx }"
        @click="applyRecent(term)"
        @mouseenter="selectedIndex = idx"
      >
        <el-icon class="item-icon"><Clock /></el-icon>
        <span class="item-title">{{ term }}</span>
        <button
          class="remove-recent-btn"
          @click.stop="deleteRecent(term)"
          title="删除"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- Empty query hint -->
    <div v-if="!query.trim() && recentSearches.length === 0" class="search-empty-hint">
      <el-icon><Search /></el-icon>
      <span>输入关键词开始搜索</span>
    </div>

    <!-- Search Results grouped by type -->
    <div v-if="query.trim()" class="search-results">
      <div v-if="groupedResults.length === 0" class="search-no-results">
        <el-icon><WarningFilled /></el-icon>
        <span>未找到匹配「{{ query.trim() }}」的结果</span>
      </div>

      <div
        v-for="group in groupedResults"
        :key="group.type"
        class="search-section"
      >
        <div class="search-section-header">
          <el-tag :type="entityTagType(group.type)" size="small" disable-transitions>
            {{ entityLabel(group.type) }}
          </el-tag>
          <span class="result-count">{{ group.items.length }} 项</span>
        </div>
        <div
          v-for="item in group.items"
          :key="item.id"
          class="search-item"
          :class="{ 'search-item--active': selectedIndex === item._globalIndex }"
          @click="handleActivate(item)"
          @mouseenter="selectedIndex = item._globalIndex"
        >
          <div class="item-content">
            <div class="item-title" v-html="highlightMatch(item.title)"></div>
            <div v-if="item.snippet" class="item-snippet" v-html="highlightMatch(item.snippet)"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="search-footer">
      <span class="footer-hint"><kbd>&uarr;</kbd><kbd>&darr;</kbd> 导航</span>
      <span class="footer-hint"><kbd>Enter</kbd> 选择</span>
      <span class="footer-hint"><kbd>Esc</kbd> 关闭</span>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Search, Clock, Close, WarningFilled } from '@element-plus/icons-vue'
import { useGlobalSearch, type SearchResult } from '@/composables/useGlobalSearch'
import {
  SEARCH_ENTITY_TYPE_LABELS,
  SEARCH_ENTITY_TYPE_TAG,
  type SearchEntityType,
} from '@/utils/eventTypeLabels'
import { highlightText } from '@/utils/searchEngine'

const {
  query,
  visible,
  results,
  recentSearches,
  commitRecent: _commitRecent,
  deleteRecent,
  open,
  close,
  activate,
} = useGlobalSearch()

const inputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)

// ---- Grouped results with flat global index ----

interface IndexedResult extends SearchResult {
  _globalIndex: number
}

const groupedResults = computed(() => {
  const groups = new Map<string, IndexedResult[]>()
  let globalIdx = 0

  for (const r of results.value) {
    const type = r.type || 'other'
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type)!.push({ ...r, _globalIndex: globalIdx })
    globalIdx++
  }

  const order: SearchEntityType[] = ['chapter', 'character', 'lore', 'location', 'faction', 'outline']
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = order.indexOf(a as SearchEntityType)
      const bi = order.indexOf(b as SearchEntityType)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    .map(([type, items]) => ({ type, items }))
})

const totalResultCount = computed(() => results.value.length)

// ---- Keyboard navigation ----

function moveSelection(delta: number): void {
  const max = query.value.trim()
    ? totalResultCount.value
    : recentSearches.value.length

  if (max === 0) return
  selectedIndex.value = (selectedIndex.value + delta + max) % max
}

function selectActive(): void {
  if (query.value.trim()) {
    const flat = groupedResults.value.flatMap(g => g.items)
    const item = flat.find(r => r._globalIndex === selectedIndex.value)
    if (item) {
      handleActivate(item)
    }
  } else {
    const term = recentSearches.value[selectedIndex.value]
    if (term) {
      applyRecent(term)
    }
  }
}

function handleActivate(result: SearchResult): void {
  activate(result)
}

// ---- Recent searches ----

function applyRecent(term: string): void {
  query.value = term
}

function clearAllRecent(): void {
  for (const term of [...recentSearches.value]) {
    deleteRecent(term)
  }
}

// ---- Highlight ----

function highlightMatch(text: string): string {
  const q = query.value.trim()
  if (!q) return escapeHtml(text)

  const lower = text.toLowerCase()
  const qLower = q.toLowerCase()
  const indices: [number, number][] = []
  let idx = 0
  while ((idx = lower.indexOf(qLower, idx)) !== -1) {
    indices.push([idx, idx + q.length])
    idx += 1
  }
  return indices.length > 0 ? highlightText(text, indices) : escapeHtml(text)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---- Entity type helpers ----

function entityLabel(type: string): string {
  return SEARCH_ENTITY_TYPE_LABELS[type as SearchEntityType] || type
}

function entityTagType(type: string): string {
  return SEARCH_ENTITY_TYPE_TAG[type as SearchEntityType] || 'info'
}

// ---- Lifecycle ----

function onOpened(): void {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function onClosed(): void {
  selectedIndex.value = 0
}

watch(query, () => {
  selectedIndex.value = 0
})

defineExpose({ open })
</script>

<style scoped>
.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  border-radius: 8px 8px 0 0;
}

.search-icon {
  font-size: 18px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  background: transparent;
  color: var(--el-text-color-primary);
  line-height: 1.5;
}

.search-input::placeholder {
  color: var(--el-text-color-placeholder);
}

.search-hint {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

/* Sections */
.search-section {
  padding: 8px 0;
}

.search-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result-count {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.clear-recent-btn {
  border: none;
  background: none;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  padding: 0;
}

.clear-recent-btn:hover {
  color: var(--el-color-primary);
}

/* Search items */
.search-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.search-item:hover,
.search-item--active {
  background: var(--el-fill-color-light);
}

.search-item--active {
  background: var(--el-color-primary-light-9);
}

.item-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-item .item-title {
  flex: 1;
}

.item-snippet {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-title :deep(mark),
.item-snippet :deep(mark) {
  background: var(--el-color-warning-light-7);
  color: var(--el-color-warning-dark-2);
  border-radius: 2px;
  padding: 0 1px;
}

.remove-recent-btn {
  border: none;
  background: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
  opacity: 0;
  transition: opacity 0.15s;
}

.recent-item:hover .remove-recent-btn {
  opacity: 1;
}

.remove-recent-btn:hover {
  color: var(--el-color-danger);
}

/* Empty / No results */
.search-empty-hint,
.search-no-results {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}

/* Footer */
.search-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 4px;
}

.footer-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  font-size: 11px;
  font-family: inherit;
  line-height: 1.4;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 3px;
  color: var(--el-text-color-secondary);
}
</style>

<style>
/* Override el-dialog for tighter command-palette feel */
.search-dialog .el-dialog__header {
  display: none;
}

.search-dialog .el-dialog__body {
  padding: 0;
  max-height: 480px;
  overflow-y: auto;
}
</style>
