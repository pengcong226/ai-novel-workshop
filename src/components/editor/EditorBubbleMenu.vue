<template>
  <BubbleMenu :editor="editor" :tippy-options="{ duration: 150 }" class="bubble-menu-wrapper">
    <div class="bubble-menu">
      <div class="bubble-menu-row">
        <button
          :class="{ 'is-active': editor.isActive('bold') }"
          @click="editor.chain().focus().toggleBold().run()"
          title="加粗"
        >
          <strong>B</strong>
        </button>
        <button
          :class="{ 'is-active': editor.isActive('italic') }"
          @click="editor.chain().focus().toggleItalic().run()"
          title="斜体"
        >
          <em>I</em>
        </button>
        <button
          :class="{ 'is-active': editor.isActive('underline') }"
          @click="editor.chain().focus().toggleUnderline().run()"
          title="下划线"
        >
          <u>U</u>
        </button>
        <button
          :class="{ 'is-active': editor.isActive('highlight') }"
          @click="editor.chain().focus().toggleHighlight().run()"
          title="高亮"
        >
          <mark>H</mark>
        </button>
      </div>
      <div class="bubble-menu-divider" />
      <div class="bubble-menu-row">
        <el-dropdown @command="handleAICommand" trigger="click" size="small">
          <button class="ai-btn" title="AI 操作">
            <el-icon><MagicStick /></el-icon> AI
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="rewrite">AI 重写</el-dropdown-item>
              <el-dropdown-item command="expand">AI 扩写</el-dropdown-item>
              <el-dropdown-item command="compress">AI 缩写</el-dropdown-item>
              <el-dropdown-item divided disabled>改变风格</el-dropdown-item>
              <el-dropdown-item command="style:古风">→ 古风</el-dropdown-item>
              <el-dropdown-item command="style:轻松">→ 轻松</el-dropdown-item>
              <el-dropdown-item command="style:严肃">→ 严肃</el-dropdown-item>
              <el-dropdown-item command="style:幽默">→ 幽默</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </BubbleMenu>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { MagicStick } from '@element-plus/icons-vue'

const props = defineProps<{
  editor: Editor
}>()

const emit = defineEmits<{
  'ai-action': [payload: { command: string; selectedText: string; from: number; to: number; editorFrom: number; editorTo: number }]
}>()

function handleAICommand(command: string) {
  const { from, to } = props.editor.state.selection
  const selectedText = props.editor.state.doc.textBetween(from, to, '\n\n')
  if (!selectedText) return
  const plainFrom = props.editor.state.doc.textBetween(0, from, '\n\n').length
  emit('ai-action', {
    command,
    selectedText,
    from: plainFrom,
    to: plainFrom + selectedText.length,
    editorFrom: from,
    editorTo: to,
  })
}
</script>

<style scoped>
.bubble-menu-wrapper {
  z-index: 100;
}

.bubble-menu {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 2px;
}

.bubble-menu-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bubble-menu-divider {
  width: 1px;
  height: 20px;
  background: var(--el-border-color-light);
  margin: 0 2px;
}

.bubble-menu button {
  border: none;
  background: transparent;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--el-text-color-primary);
  transition: background-color 0.15s;
}

.bubble-menu button:hover {
  background: var(--el-fill-color);
}

.bubble-menu button.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.bubble-menu .ai-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
}
</style>
