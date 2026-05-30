<template>
  <div :class="['loading-skeleton', `loading-skeleton--${variant}`]" :style="containerStyle">
    <!-- Card variant: project card skeleton -->
    <template v-if="variant === 'card'">
      <div v-for="n in count" :key="n" class="skel-card">
        <div class="skel-card__accent skeleton"></div>
        <div class="skel-card__body">
          <div class="skel-row skel-row--title skeleton"></div>
          <div class="skel-row skel-row--tags">
            <span class="skel-tag skeleton"></span>
            <span class="skel-tag skeleton"></span>
            <span class="skel-tag skel-tag--date skeleton"></span>
          </div>
          <div class="skel-row skel-row--text skeleton"></div>
          <div class="skel-row skel-row--text skel-row--text-short skeleton"></div>
          <div class="skel-row skel-row--progress">
            <div class="skel-progress-label skeleton"></div>
            <div class="skel-progress-bar skeleton"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- List variant: chapter list skeleton -->
    <template v-else-if="variant === 'list'">
      <div v-for="n in count" :key="n" class="skel-list-item">
        <div class="skel-list-item__accent"></div>
        <div class="skel-list-item__body">
          <div class="skel-row skel-row--list-header">
            <span class="skel-handle skeleton"></span>
            <span class="skel-chapter-num skeleton"></span>
            <span class="skel-chapter-title skeleton"></span>
            <span class="skel-tag skeleton"></span>
          </div>
          <div class="skel-divider"></div>
          <div class="skel-row skel-row--text skeleton"></div>
          <div class="skel-row skel-row--text skel-row--text-short skeleton"></div>
          <div class="skel-row skel-row--actions">
            <span class="skel-btn skeleton"></span>
            <span class="skel-btn skeleton"></span>
            <span class="skel-btn skel-btn--wide skeleton"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- Editor variant: editor area skeleton -->
    <template v-else-if="variant === 'editor'">
      <div class="skel-editor">
        <div class="skel-editor__toolbar">
          <span v-for="n in 6" :key="n" class="skel-tool-btn skeleton"></span>
        </div>
        <div class="skel-editor__content">
          <div v-for="n in count" :key="n" class="skel-row skel-row--editor-line skeleton" :style="{ width: editorLineWidth(n) }"></div>
        </div>
      </div>
    </template>

    <!-- Tree variant: entity tree skeleton -->
    <template v-else-if="variant === 'tree'">
      <div class="skel-tree">
        <div class="skel-row skel-row--title skel-row--title-sm skeleton"></div>
        <div class="skel-row skel-row--search skeleton"></div>
        <div v-for="n in count" :key="n" class="skel-tree-group">
          <div class="skel-tree-group__header">
            <span class="skel-tree-icon skeleton"></span>
            <span class="skel-tree-label skeleton"></span>
            <span class="skel-tree-count skeleton"></span>
          </div>
          <div v-for="m in groupItems" :key="m" class="skel-tree-item">
            <span class="skel-tree-dot skeleton"></span>
            <span class="skel-tree-name skeleton"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- Text variant: multiline text block -->
    <template v-else-if="variant === 'text'">
      <div v-for="n in count" :key="n" class="skel-row skel-row--text skeleton" :style="{ width: textLineWidth(n) }"></div>
    </template>

    <!-- Compact variant: small inline element -->
    <template v-else-if="variant === 'compact'">
      <div v-for="n in count" :key="n" class="skel-row skel-row--compact skeleton"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface LoadingSkeletonProps {
  variant?: 'card' | 'list' | 'editor' | 'tree' | 'text' | 'compact'
  count?: number
  groupItems?: number
  width?: string
}

const props = withDefaults(defineProps<LoadingSkeletonProps>(), {
  variant: 'card',
  count: 3,
  groupItems: 2,
  width: '100%',
})

const containerStyle = computed(() => ({
  width: props.width,
}))

/**
 * Vary editor line widths for a natural look.
 */
function editorLineWidth(lineNumber: number): string {
  const widths = ['92%', '88%', '78%', '95%', '70%', '85%', '90%', '65%']
  return widths[(lineNumber - 1) % widths.length]
}

/**
 * Vary text line widths for a natural look.
 */
function textLineWidth(lineNumber: number): string {
  const widths = ['100%', '90%', '75%', '95%', '60%']
  return widths[(lineNumber - 1) % widths.length]
}
</script>

<style scoped>
/* ========== Base ========== */
.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
}

/* ========== Card skeleton ========== */
.skel-card {
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.skel-card__accent {
  height: 4px;
  border-radius: 0;
}

.skel-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  padding: var(--ds-space-5);
}

/* ========== List (chapter) skeleton ========== */
.skel-list-item {
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  overflow: hidden;
  position: relative;
}

.skel-list-item__accent {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-bg-tertiary);
}

.skel-list-item__body {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  padding: var(--ds-space-4) var(--ds-space-4) var(--ds-space-4) var(--ds-space-5);
}

.skel-divider {
  height: 1px;
  background: var(--ds-surface-border);
}

/* ========== Editor skeleton ========== */
.skel-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
}

.skel-editor__toolbar {
  display: flex;
  gap: var(--ds-space-2);
  padding: var(--ds-space-3);
  background: var(--ds-bg-secondary);
  border-radius: var(--ds-radius-md);
}

.skel-tool-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--ds-radius-sm);
}

.skel-editor__content {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
  padding: var(--ds-space-4);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  min-height: 240px;
}

/* ========== Tree skeleton ========== */
.skel-tree {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
}

.skel-tree-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-1);
}

.skel-tree-group__header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) 0;
}

.skel-tree-icon {
  width: 18px;
  height: 18px;
  border-radius: var(--ds-radius-sm);
}

.skel-tree-label {
  width: 60px;
  height: 14px;
  border-radius: var(--ds-radius-sm);
}

.skel-tree-count {
  width: 24px;
  height: 14px;
  border-radius: var(--ds-radius-sm);
  margin-left: auto;
}

.skel-tree-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) var(--ds-space-2) var(--ds-space-1) var(--ds-space-4);
}

.skel-tree-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.skel-tree-name {
  width: 80px;
  height: 13px;
  border-radius: var(--ds-radius-sm);
}

/* ========== Row shapes ========== */
.skel-row {
  border-radius: var(--ds-radius-sm);
}

.skel-row--title {
  width: 55%;
  height: 20px;
}

.skel-row--title-sm {
  width: 40%;
  height: 16px;
}

.skel-row--text {
  width: 100%;
  height: 12px;
}

.skel-row--text-short {
  width: 65%;
}

.skel-row--search {
  width: 100%;
  height: 32px;
  border-radius: var(--ds-radius-sm);
}

.skel-row--editor-line {
  height: 14px;
}

.skel-row--compact {
  width: 100%;
  height: 10px;
}

.skel-row--tags {
  display: flex;
  gap: var(--ds-space-2);
  align-items: center;
}

.skel-tag {
  display: inline-block;
  width: 48px;
  height: 20px;
  border-radius: var(--ds-radius-full);
}

.skel-tag--date {
  width: 64px;
  margin-left: auto;
}

.skel-row--progress {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
  margin-top: var(--ds-space-2);
}

.skel-progress-label {
  width: 50%;
  height: 12px;
  border-radius: var(--ds-radius-sm);
}

.skel-progress-bar {
  width: 100%;
  height: 4px;
  border-radius: var(--ds-radius-full);
}

.skel-row--list-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

.skel-handle {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
}

.skel-chapter-num {
  width: 56px;
  height: 18px;
}

.skel-chapter-title {
  width: 120px;
  height: 18px;
}

.skel-row--actions {
  display: flex;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-3);
  border-top: 1px solid var(--ds-surface-border);
}

.skel-btn {
  width: 56px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
}

.skel-btn--wide {
  width: 80px;
}
</style>
