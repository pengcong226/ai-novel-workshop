<template>
  <div class="content">
    <el-empty v-if="chapters.length === 0" description="还没有章节">
      <el-button type="primary" @click="$emit('addChapter')">创建第一章</el-button>
    </el-empty>

    <div v-else class="chapters-container" ref="scrollContainerRef" style="height: calc(100vh - 200px); overflow-y: auto;">
      <div class="chapters-list" :style="{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }">
        <div
          v-for="virtualRow in rowVirtualizer.getVirtualItems()"
          :key="virtualRow.index"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualRow.start}px)`
          }"
        >
          <template v-for="chapter in [chapters[virtualRow.index]]" :key="chapter?.id">
            <el-card
              v-if="chapter"
              class="chapter-card"
              :class="{ 'is-dragging': draggingChapterId === chapter.id, 'is-drag-over': dragOverChapterId === chapter.id }"
              @dragover.prevent="handleChapterDragOver(chapter.id, $event)"
              @drop="handleChapterDrop(chapter.id)"
            >
              <div class="chapter-header">
                <div class="chapter-info">
                  <button
                    class="drag-handle"
                    type="button"
                    draggable="true"
                    title="拖拽排序"
                    aria-label="拖拽排序"
                    @dragstart="handleChapterDragStart(chapter.id, $event)"
                    @dragend="handleChapterDragEnd"
                  >
                    &#8942;&#8942;
                  </button>
                  <span class="chapter-number">第{{ chapter.number }}章</span>
                  <span class="chapter-title">{{ chapter.title }}</span>
                  <el-tag :type="getChapterStatusType(chapter.status)" size="small">
                    {{ getChapterStatusText(chapter.status) }}
                  </el-tag>
                  <el-tag v-if="chapter.generatedBy === 'ai'" type="success" size="small">
                    AI生成
                  </el-tag>
                </div>
                <ChapterStats :chapter="chapter" />
              </div>

              <el-divider />

              <div class="chapter-content">
                <div class="content-preview">
                  {{ buildReadingPreview(chapter) }}
                </div>
              </div>

              <div class="chapter-actions">
                <el-button type="primary" size="small" @click="$emit('editChapter', chapter)">
                  编辑
                </el-button>
                <el-button size="small" @click="$emit('previewChapter', chapter)">
                  预览
                </el-button>
                <el-dropdown size="small" @command="(cmd: string) => $emit('chapterAction', cmd, chapter)">
                  <el-button size="small">
                    更多 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="export-md">
                        <el-icon><Document /></el-icon>导出 Markdown
                      </el-dropdown-item>
                      <el-dropdown-item command="export-pdf">
                        <el-icon><Document /></el-icon>导出 PDF
                      </el-dropdown-item>
                      <el-dropdown-item command="export-docx">
                        <el-icon><Document /></el-icon>导出 DOCX
                      </el-dropdown-item>
                      <el-dropdown-item command="export-txt">
                        <el-icon><Document /></el-icon>导出 TXT
                      </el-dropdown-item>
                      <el-dropdown-item command="regenerate">
                        <el-icon><RefreshRight /></el-icon>重新生成
                      </el-dropdown-item>
                      <el-dropdown-item command="checkpoints">
                        <el-icon><Clock /></el-icon>检查点
                      </el-dropdown-item>
                      <el-dropdown-item command="aigc-detect">
                        <el-icon><DataAnalysis /></el-icon>AI 检测
                      </el-dropdown-item>
                      <el-dropdown-item
                        v-for="button in pluginToolbarButtons"
                        :key="button.id"
                        :command="'plugin:' + button.id"
                      >
                        <el-icon v-if="button.icon"><component :is="button.icon" /></el-icon>
                        {{ button.label }}
                      </el-dropdown-item>
                      <el-dropdown-item divided command="delete" :style="{ color: 'var(--ds-danger)' }">
                        <el-icon><Delete /></el-icon>删除
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>

              <div v-if="chapter.qualityScore" class="quality-score">
                质量评分: {{ chapter.qualityScore }}/10
              </div>
            </el-card>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { Chapter } from '@/types'
import { ArrowDown, Clock, DataAnalysis, Delete, Document, RefreshRight } from '@element-plus/icons-vue'
import { buildReadingPreview } from '@/utils/readingPreview'
import { getChapterStatusType, getChapterStatusText } from '@/utils/formatters'
import ChapterStats from '@/components/ChapterStats.vue'

interface PluginToolbarButton {
  id: string
  icon?: unknown
  label: string
}

const props = defineProps<{
  chapters: Chapter[]
  pluginToolbarButtons: PluginToolbarButton[]
}>()

const emit = defineEmits<{
  addChapter: []
  editChapter: [chapter: Chapter]
  previewChapter: [chapter: Chapter]
  chapterAction: [command: string, chapter: Chapter]
  reorderChapters: [orderedIds: string[]]
}>()

// Virtual scroller — owned by this component
const scrollContainerRef = ref<HTMLElement | null>(null)
const rowVirtualizerOptions = computed(() => ({
  count: props.chapters.length,
  getScrollElement: () => scrollContainerRef.value,
  estimateSize: () => 180,
  overscan: 5,
}))
const rowVirtualizer = useVirtualizer(rowVirtualizerOptions)

// Drag-and-drop state — owned by this component
const draggingChapterId = ref<string | null>(null)
const dragOverChapterId = ref<string | null>(null)

function handleChapterDragStart(chapterId: string, event: DragEvent) {
  draggingChapterId.value = chapterId
  event.dataTransfer?.setData('text/plain', chapterId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleChapterDragOver(chapterId: string, event?: DragEvent) {
  if (!draggingChapterId.value || draggingChapterId.value === chapterId) {
    dragOverChapterId.value = null
    return
  }

  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverChapterId.value = chapterId
}

function handleChapterDragEnd() {
  draggingChapterId.value = null
  dragOverChapterId.value = null
}

function handleChapterDrop(targetChapterId: string) {
  const sourceChapterId = draggingChapterId.value
  handleChapterDragEnd()
  if (!sourceChapterId || sourceChapterId === targetChapterId) return

  const orderedIds = props.chapters.map(chapter => chapter.id)
  const sourceIndex = orderedIds.indexOf(sourceChapterId)
  const targetIndex = orderedIds.indexOf(targetChapterId)
  if (sourceIndex === -1 || targetIndex === -1) return

  orderedIds.splice(sourceIndex, 1)
  const insertionIndex = sourceIndex < targetIndex ? targetIndex : targetIndex + 1
  orderedIds.splice(insertionIndex, 0, sourceChapterId)

  emit('reorderChapters', orderedIds)
}
</script>

<style scoped>
.content {
  min-height: 400px;
}

.chapters-container {
  padding-right: var(--ds-space-1);
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
}

.chapter-card {
  position: relative;
  margin-bottom: 0;
  overflow: hidden;
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  transition:
    transform var(--ds-transition-fast),
    border-color var(--ds-transition-fast),
    box-shadow var(--ds-transition-fast);
}

.chapter-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.chapter-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--ds-accent) 28%, var(--ds-surface-border));
  box-shadow: var(--ds-shadow-md);
}

.chapter-card.is-dragging {
  opacity: 0.55;
}

.chapter-card.is-drag-over {
  box-shadow: 0 0 0 2px var(--ds-accent) inset;
}

.chapter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ds-space-4);
  margin-bottom: var(--ds-space-4);
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-width: 0;
}

.drag-handle {
  width: 30px;
  height: 30px;
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-sm);
  background:
    radial-gradient(circle, var(--ds-text-tertiary) 1px, transparent 1.5px) 5px 5px / 8px 8px,
    var(--ds-bg-secondary);
  color: transparent;
  cursor: grab;
  font-size: 0;
  line-height: 1;
  transition: all var(--ds-transition-fast);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  border-color: var(--ds-accent);
  background:
    radial-gradient(circle, var(--ds-accent) 1px, transparent 1.5px) 5px 5px / 8px 8px,
    var(--ds-accent-subtle);
}

.chapter-number {
  flex-shrink: 0;
  color: var(--ds-accent-text);
  font-size: var(--ds-text-lg);
  font-weight: 700;
}

.chapter-title {
  min-width: 0;
  overflow: hidden;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-content {
  margin-bottom: var(--ds-space-4);
}

.content-preview {
  color: var(--ds-text-secondary);
  line-height: 1.7;
}

.chapter-actions {
  display: flex;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-4);
  border-top: 1px solid var(--ds-surface-border);
  flex-wrap: wrap;
}

.quality-score {
  margin-top: var(--ds-space-3);
  padding: var(--ds-space-2) var(--ds-space-3);
  background: var(--ds-accent-subtle);
  border: 1px solid color-mix(in srgb, var(--ds-accent) 24%, transparent);
  border-radius: var(--ds-radius-sm);
  color: var(--ds-accent-text);
  font-size: var(--ds-text-sm);
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .chapter-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .chapter-actions {
    justify-content: flex-start;
  }
}
</style>
