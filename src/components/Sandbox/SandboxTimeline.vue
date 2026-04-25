<template>
  <div class="sandbox-timeline-container">
    <div class="volume-header">
      <div class="volume-title">当前大纲时间线 (状态流)</div>
      <div class="volume-desc">在这里可以基于宏观剧情线推演后续章节大纲，或正式写入正文以同步底层物理实体状态。</div>
    </div>

    <!-- Empty State -->
    <el-empty v-if="!projectStore.currentProject || chapters.length === 0" description="大纲为空，请点击底部推演生成" />

    <el-timeline v-else class="custom-timeline">
      <el-timeline-item
        v-for="chapter in chapters"
        :key="chapter.chapterId"
        :type="getNodeType(chapter)"
        :color="getNodeColor(chapter)"
      >
        <div class="outline-node" :class="getNodeClass(chapter)">
          <div class="outline-header">
            <div class="outline-title">{{ chapter.title || '未命名章节' }}</div>
            <div class="outline-status" :style="{ color: getNodeColor(chapter) }">
              <i :class="getStatusIcon(chapter)"></i> {{ getStatusText(chapter) }}
            </div>
          </div>

          <!-- Body Text (Synopsis / Outline) -->
          <div class="outline-text">
            {{ chapter.generationPrompt || chapter.scenes?.[0]?.description || '暂无详细描述...' }}
          </div>

          <!-- Action Area (Only for Active Node) -->
          <div v-if="isActiveNode(chapter)" class="active-action-area">
            <div class="timeline-actions">
              <el-button type="success" plain @click="executeChapter(chapter)" :loading="isGenerating">
                <el-icon><EditPen /></el-icon> AI 生成正文并全盘同步状态
              </el-button>
              <el-button @click="writeManually(chapter)">
                <el-icon><Document /></el-icon> 手动撰写
              </el-button>
            </div>

            <!-- Automated State Sync Alert (Simulated / Extracted) -->
            <div v-if="hasExtractedStates(chapter)" class="automated-state-changes">
              <div class="state-change-header">
                <el-icon><DataLine /></el-icon> 正文落地，已触发底层引擎全盘同步
              </div>
              <div class="state-change-item" v-for="(event, idx) in getExtractedStates(chapter)" :key="idx">
                <div class="state-entity">[{{ event.entityName }}]</div>
                <div>{{ event.description }} <span class="state-diff">{{ event.value }}</span></div>
              </div>
            </div>
          </div>

          <!-- Predicted States (For Pending Nodes) -->
          <div v-if="isPendingNode(chapter) && hasPredictedStates(chapter)" class="predicted-states">
            <el-icon><View /></el-icon> 预测状态: {{ getPredictedStates(chapter) }} (暂不修改物理实体)
          </div>
        </div>
      </el-timeline-item>
    </el-timeline>

    <!-- Bottom Actions -->
    <div class="bottom-actions" v-if="projectStore.currentProject">
      <el-button type="warning" plain @click="simulateBatchPlanning" :loading="isGenerating">
        <el-icon><MagicStick /></el-icon> AI 批量推演后续 5 章大纲
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage } from 'element-plus'
import { EditPen, Document, DataLine, View, MagicStick } from '@element-plus/icons-vue'
import type { ChapterOutline } from '@/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('sandbox:timeline')

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()

const isGenerating = ref(false)
const generationTimers = new Set<ReturnType<typeof setTimeout>>()

onUnmounted(() => {
  for (const timer of generationTimers) {
    clearTimeout(timer)
  }
  generationTimers.clear()
})

// Source of truth: project's outline chapters
const chapters = computed(() => projectStore.currentProject?.outline?.chapters || [])

// -----------------------
// Node State Computing
// -----------------------

// Determine the single active node (the first 'planned' node)
const activeNodeId = computed(() => {
  const firstPlanned = chapters.value.find(ch => ch.status === 'planned' || ch.status === 'writing')
  return firstPlanned ? firstPlanned.chapterId : null
})

const chapterNumberById = computed(() => {
  return new Map(chapters.value.map((chapter, index) => [chapter.chapterId, index + 1]))
})

function getChapterNumber(chapter: ChapterOutline): number | null {
  return chapterNumberById.value.get(chapter.chapterId) ?? null
}

function isActiveNode(chapter: ChapterOutline) {
  return chapter.chapterId === activeNodeId.value
}

function isCompletedNode(chapter: ChapterOutline) {
  return chapter.status === 'completed'
}

function isPendingNode(chapter: ChapterOutline) {
  return chapter.status === 'planned' && chapter.chapterId !== activeNodeId.value
}

function getNodeClass(chapter: ChapterOutline) {
  if (isCompletedNode(chapter)) return 'completed'
  if (isActiveNode(chapter)) return 'active'
  return 'pending'
}

function getNodeColor(chapter: ChapterOutline) {
  if (isCompletedNode(chapter)) return 'var(--text-muted)'
  if (isActiveNode(chapter)) return 'var(--accent-primary)'
  return 'var(--accent-warning)'
}

function getStatusIcon(chapter: ChapterOutline) {
  if (isCompletedNode(chapter)) return 'ri-check-double-line'
  if (isActiveNode(chapter)) return 'ri-edit-line'
  return 'ri-time-line'
}

function getStatusText(chapter: ChapterOutline) {
  if (isCompletedNode(chapter)) return '完稿入库'
  if (isActiveNode(chapter)) return '当前进度'
  return '计划中 (预测)'
}

function getNodeType(chapter: ChapterOutline): 'info' | 'primary' | 'warning' {
  if (isCompletedNode(chapter)) return 'info'
  if (isActiveNode(chapter)) return 'primary'
  return 'warning'
}

// -----------------------
// Action Handlers
// -----------------------

async function simulateBatchPlanning() {
  if (!projectStore.currentProject) return
  isGenerating.value = true
  try {
    const currentLength = projectStore.currentProject.outline.chapters.length
    // We would normally call extendOutlineWithLLM here
    ElMessage.info('触发批量大纲推演...')
    // Simulating API call
    const timer = setTimeout(() => {
      generationTimers.delete(timer)
      const newOutline: ChapterOutline = {
        chapterId: Math.random().toString(),
        title: `第${currentLength + 1}章：未命名`,
        scenes: [{ id: '1', description: 'AI预测的后续情节...', characters: [], location: '', order: 0 }],
        characters: [],
        location: '',
        goals: [],
        conflicts: [],
        resolutions: [],
        status: 'planned'
      }
      projectStore.currentProject!.outline.chapters.push(newOutline)
      projectStore.saveCurrentProject()
      isGenerating.value = false
      ElMessage.success('大纲推演完成')
    }, 1500)
    generationTimers.add(timer)
  } catch (e) {
    logger.error('批量大纲推演失败:', e)
    isGenerating.value = false
  }
}

async function executeChapter(chapter: ChapterOutline) {
  if (!projectStore.currentProject) return

  isGenerating.value = true
  ElMessage.info(`正在生成并同步 ${chapter.title}...`)

  const timer = setTimeout(async () => {
    generationTimers.delete(timer)
    try {
      const chapterNumber = getChapterNumber(chapter)
      if (!chapterNumber) {
        ElMessage.error('无法定位章节序号')
        return
      }

      chapter.status = 'completed'
      await sandboxStore.addStateEvent({
        id: Math.random().toString(),
        projectId: projectStore.currentProject!.id,
        chapterNumber,
        entityId: 'mock-entity-1',
        eventType: 'PROPERTY_UPDATE',
        payload: { key: 'status', value: '同步完成' },
        source: 'AI_EXTRACTED'
      })
      await projectStore.saveCurrentProject()
      sandboxStore.currentChapter = chapterNumber
      ElMessage.success('正文生成与状态同步完成！')
    } catch (e) {
      logger.error('章节执行失败:', e)
    } finally {
      isGenerating.value = false
    }
  }, 2000)
  generationTimers.add(timer)
}

function writeManually(_chapter: ChapterOutline) {
  ElMessage.info('切换到手动章节编辑器')
}

// -----------------------
// Mock Data Helpers (Replace with real computed getters later)
// -----------------------

function hasExtractedStates(chapter: ChapterOutline) {
  // Mock true for completed nodes for demo purposes
  return isCompletedNode(chapter) && Math.random() > 0.5
}

function getExtractedStates(_chapter: ChapterOutline) {
  return [
    { entityName: '系统', description: '状态同步:', value: '完成' }
  ]
}

function hasPredictedStates(_chapter: ChapterOutline) {
  // Only show randomly on pending nodes
  return Math.random() > 0.5
}

function getPredictedStates(_chapter: ChapterOutline) {
  return "可能产生物品或状态变更"
}
</script>

<style scoped>
.sandbox-timeline-container {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.volume-header {
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.1), transparent);
  border-left: 4px solid var(--accent-primary);
  padding: 16px;
  border-radius: 0 8px 8px 0;
  margin-bottom: 24px;
}

.volume-title { font-size: 18px; color: #fff; font-weight: bold; margin-bottom: 8px;}
.volume-desc { color: var(--text-muted); font-size: 13px; line-height: 1.5;}

.custom-timeline {
  padding-left: 20px;
}

.outline-node {
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s;
}

/* Pending (Future) Nodes */
.outline-node.pending {
  border-style: dashed;
  opacity: 0.8;
  border-color: var(--text-muted);
}

/* Active (Writing) Node */
.outline-node.active {
  border-color: var(--accent-primary);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
  background: rgba(20,20,30,0.8);
}

/* Completed Node */
.outline-node.completed {
  border-color: rgba(255,255,255,0.1);
}

.outline-header { display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center;}
.outline-title { font-weight: bold; color: var(--accent-glow); font-size: 15px;}
.outline-text { color: var(--text-main); font-size: 14px; line-height: 1.6; margin-bottom: 12px; }

.outline-node.completed .outline-title { color: var(--text-main); }
.outline-node.pending .outline-title { color: var(--accent-warning); }

.predicted-states {
  background: rgba(245, 158, 11, 0.05);
  border: 1px dashed var(--accent-warning);
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 10px;
}

.automated-state-changes {
  background: rgba(16, 185, 129, 0.05);
  border: 1px dashed var(--accent-success);
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  margin-top: 12px;
}
.state-change-header { color: var(--accent-success); display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-weight: bold;}
.state-change-item { display: flex; gap: 12px; margin-bottom: 4px; color: var(--text-muted); }
.state-entity { color: #fff; width: 60px; }
.state-diff { color: var(--accent-success); }

.timeline-actions {
  display: flex; gap: 12px; margin-top: 10px; padding: 16px;
  background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px dashed var(--border-color); justify-content: center;
}

.bottom-actions {
  margin-top: 24px;
  margin-left: 24px;
  display: flex;
  justify-content: center;
}
</style>