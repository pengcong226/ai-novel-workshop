<template>
  <el-dialog
    v-model="visible"
    title="快捷键"
    width="560px"
    append-to-body
  >
    <div class="shortcut-dialog">
      <div
        v-for="group in groupedShortcuts"
        :key="group.scope"
        class="shortcut-group"
      >
        <h3>{{ scopeLabels[group.scope] }}</h3>
        <div
          v-for="shortcut in group.items"
          :key="shortcut.id"
          class="shortcut-row"
        >
          <div>
            <div class="shortcut-label">{{ shortcut.label }}</div>
            <div v-if="shortcut.description" class="shortcut-description">{{ shortcut.description }}</div>
          </div>
          <kbd>{{ formatShortcut(shortcut.keys) }}</kbd>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KeyboardShortcut, ShortcutScope } from '@/composables/useKeyboardShortcuts'
import { formatShortcut } from '@/composables/useKeyboardShortcuts'

const props = defineProps<{
  modelValue: boolean
  shortcuts: KeyboardShortcut[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const scopeLabels: Record<ShortcutScope, string> = {
  global: '全局',
  workspace: '工作区',
  'chapter-editor': '章节编辑器',
}

const scopeOrder: ShortcutScope[] = ['global', 'workspace', 'chapter-editor']

const groupedShortcuts = computed(() => scopeOrder
  .map(scope => ({
    scope,
    items: props.shortcuts.filter(shortcut => shortcut.scope === scope),
  }))
  .filter(group => group.items.length > 0)
)
</script>

<style scoped>
.shortcut-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.shortcut-group h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}
.shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.shortcut-row:last-child {
  border-bottom: none;
}
.shortcut-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.shortcut-description {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
kbd {
  min-width: 84px;
  padding: 4px 8px;
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-align: center;
}
</style>
