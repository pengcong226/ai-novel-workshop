<template>
  <el-dialog
    v-model="visible"
    :show-close="false"
    width="520px"
    class="search-dialog"
    @opened="onOpened"
  >
    <el-input
      ref="inputRef"
      v-model="query"
      placeholder="搜索章节、人物、设定..."
      size="large"
      clearable
      @keydown.down.prevent="selectNext"
      @keydown.up.prevent="selectPrev"
      @keydown.enter.prevent="activateSelected"
      @keydown.escape="close"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
    </el-input>

    <div v-if="query && results.length === 0" class="no-results">
      未找到匹配内容
    </div>

    <div v-else-if="results.length > 0" class="result-list">
      <div
        v-for="(r, i) in results"
        :key="r.id + r.type"
        class="result-item"
        :class="{ active: i === selectedIndex }"
        @click="activate(r)"
        @mouseenter="selectedIndex = i"
      >
        <el-tag size="small" :type="tagType(r.type)" class="result-tag">{{ typeLabel(r.type) }}</el-tag>
        <span class="result-title">{{ r.title }}</span>
        <span class="result-snippet">{{ r.snippet }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useGlobalSearch, type SearchResult } from '@/composables/useGlobalSearch'
import { SEARCH_ENTITY_TYPE_LABELS, SEARCH_ENTITY_TYPE_TAG, type SearchEntityType } from '@/utils/eventTypeLabels'

const { query, visible, results, close } = useGlobalSearch()
const inputRef = ref()
const selectedIndex = ref(0)

watch(query, () => { selectedIndex.value = 0 })

function onOpened() {
  inputRef.value?.focus()
}

function selectNext() {
  if (selectedIndex.value < results.value.length - 1) selectedIndex.value++
}

function selectPrev() {
  if (selectedIndex.value > 0) selectedIndex.value--
}

function activateSelected() {
  const r = results.value[selectedIndex.value]
  if (r) activate(r)
}

function activate(_r: SearchResult) {
  close()
}

function typeLabel(type: string) { return SEARCH_ENTITY_TYPE_LABELS[type as SearchEntityType] || type }
function tagType(type: string) { return SEARCH_ENTITY_TYPE_TAG[type as SearchEntityType] || 'info' }
</script>

<style scoped>
.search-dialog :deep(.el-dialog__header) { display: none; }
.search-dialog :deep(.el-dialog__body) { padding: 12px; }

.result-list {
  max-height: 360px;
  overflow-y: auto;
  margin-top: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.result-item.active {
  background: var(--el-fill-color);
}

.result-item:hover {
  background: var(--el-fill-color-light);
}

.result-tag {
  flex-shrink: 0;
}

.result-title {
  font-weight: 500;
  white-space: nowrap;
}

.result-snippet {
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-results {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 30px 0;
  font-size: 14px;
}
</style>
