<template>
  <div v-if="visible" class="find-replace-panel">
    <div class="find-row">
      <el-input
        ref="findInputRef"
        v-model="findText"
        placeholder="查找..."
        size="small"
        clearable
        @keydown.enter.prevent="findNext"
        @keydown.escape="close"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span class="match-count">{{ matchInfo }}</span>
      <el-button size="small" text @click="findPrev" :disabled="matches.length === 0">
        <el-icon><ArrowUp /></el-icon>
      </el-button>
      <el-button size="small" text @click="findNext" :disabled="matches.length === 0">
        <el-icon><ArrowDown /></el-icon>
      </el-button>
      <el-checkbox v-model="caseSensitive" size="small" label="Aa" />
      <el-button size="small" text circle @click="close">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>
    <div v-if="showReplace" class="replace-row">
      <el-input
        v-model="replaceText"
        placeholder="替换为..."
        size="small"
        clearable
        @keydown.enter.prevent="replaceCurrent"
      />
      <el-button size="small" @click="replaceCurrent" :disabled="matches.length === 0">
        替换
      </el-button>
      <el-button size="small" @click="replaceAll" :disabled="matches.length === 0">
        全部替换
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { Search, ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import { escapeXml } from '@/utils/escapeXml'

interface MatchPosition {
  from: number
  to: number
}

interface SearchIndex {
  text: string
  positions: number[]
}

const props = defineProps<{
  editor: Editor
  visible: boolean
  showReplace?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const findText = ref('')
const replaceText = ref('')
const caseSensitive = ref(false)
const currentMatchIndex = ref(-1)
const matches = ref<MatchPosition[]>([])
const findInputRef = ref()

const matchInfo = computed(() => {
  if (!findText.value || matches.value.length === 0) return ''
  return `${currentMatchIndex.value + 1}/${matches.value.length}`
})

function buildSearchIndex(): SearchIndex {
  const textParts: string[] = []
  const positions: number[] = []

  props.editor.state.doc.descendants((node, nodePos) => {
    if (!node.isText || !node.text) return
    for (let i = 0; i < node.text.length; i++) {
      textParts.push(node.text[i])
      positions.push(nodePos + i)
    }
  })

  return { text: textParts.join(''), positions }
}

function findMatches() {
  matches.value = []
  currentMatchIndex.value = -1

  if (!findText.value || !props.editor) return

  const index = buildSearchIndex()
  const query = caseSensitive.value ? findText.value : findText.value.toLowerCase()
  const searchText = caseSensitive.value ? index.text : index.text.toLowerCase()
  let searchStart = 0

  while (searchStart < searchText.length) {
    const idx = searchText.indexOf(query, searchStart)
    if (idx === -1) break
    const startPos = index.positions[idx]
    const endPos = index.positions[idx + findText.value.length - 1] + 1
    matches.value.push({ from: startPos, to: endPos })
    searchStart = idx + 1
  }

  if (matches.value.length > 0) {
    currentMatchIndex.value = 0
    highlightCurrent()
  }
}

function highlightCurrent() {
  if (currentMatchIndex.value < 0 || currentMatchIndex.value >= matches.value.length) return
  const match = matches.value[currentMatchIndex.value]
  props.editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run()
}

function findNext() {
  if (matches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length
  highlightCurrent()
}

function findPrev() {
  if (matches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length
  highlightCurrent()
}

function editorTextToHTML(text: string): string {
  return escapeXml(text).replace(/\n/g, '<br>')
}

function replaceCurrent() {
  if (currentMatchIndex.value < 0 || matches.value.length === 0) return
  const match = matches.value[currentMatchIndex.value]
  props.editor.chain().focus().insertContentAt(
    { from: match.from, to: match.to },
    editorTextToHTML(replaceText.value)
  ).run()
  findMatches()
}

function replaceAll() {
  if (matches.value.length === 0) return
  const reversed = [...matches.value].reverse()
  const replacement = editorTextToHTML(replaceText.value)
  for (const match of reversed) {
    props.editor.chain().insertContentAt(
      { from: match.from, to: match.to },
      replacement
    ).run()
  }
  findMatches()
}

function close() {
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    nextTick(() => findInputRef.value?.focus())
  } else {
    findText.value = ''
    replaceText.value = ''
    matches.value = []
    currentMatchIndex.value = -1
  }
})

watch([findText, caseSensitive], () => {
  findMatches()
})
</script>

<style scoped>
.find-replace-panel {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: absolute;
  top: 50px;
  right: 15%;
  z-index: 50;
  min-width: 400px;
}

.find-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.find-row .el-input {
  flex: 1;
}

.match-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 40px;
  text-align: center;
}

.replace-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.replace-row .el-input {
  flex: 1;
}
</style>
