<template>
  <div class="sandbox-layout">
    <div class="sidebar" ref="sidebarRef">
      <ErrorBoundary name="SandboxEntityTree" :show-retry="true">
        <EntityTree @select="handleEntitySelect" />
      </ErrorBoundary>
    </div>
    <div class="main-view" ref="mainViewRef">
      <div style="margin-bottom: 10px;" ref="actionBarRef">
        <el-button type="warning" plain icon="ri-magic-line" @click="sandboxStore.isWizardMode = true">批量世界生成向导</el-button>
        <el-button type="primary" plain @click="showDeepImport = true">深度小说导入</el-button>
      </div>
      <ChapterScrubber
        v-model="sandboxStore.currentChapter"
        :total-chapters="totalChapters"
        ref="scrubberRef"
      />
      <ErrorBoundary name="SandboxMainView" :show-retry="true" :show-detail="true">
        <el-tabs v-model="activeTab" ref="tabsRef">
          <el-tab-pane label="文档视图" name="doc"><SandboxDocument /></el-tab-pane>
          <el-tab-pane label="命运织布机" name="timeline"><PlotLoomBoard /></el-tab-pane>
          <el-tab-pane label="关系图" name="graph"><SandboxGraph /></el-tab-pane>
          <el-tab-pane label="势力图" name="map"><SandboxMap /></el-tab-pane>
        </el-tabs>
      </ErrorBoundary>
    </div>
    <div class="right-sidebar" ref="chatRef">
      <ErrorBoundary name="SandboxRightPanel" :show-retry="true">
        <NovelDeepImportDialog v-if="showDeepImport" @close="showDeepImport = false" @done="handleDeepImportDone" />
        <WorldGenWizard v-else-if="sandboxStore.isWizardMode" @close="sandboxStore.isWizardMode = false" />
        <AutomatonChat v-else />
      </ErrorBoundary>
    </div>

    <!-- 上下文引导（自定义实现，替代 el-tour） -->
    <AppTour
      v-model="tourOpen"
      :steps="tourSteps"
      @finish="onTourFinish"
      @close="onTourClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, defineAsyncComponent } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import ChapterScrubber from './ChapterScrubber.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { getLogger } from '@/utils/logger'
import AppTour from '@/components/AppTour.vue'

const logger = getLogger('SandboxLayout')

const EntityTree = defineAsyncComponent(() => import('./EntityTree.vue'))
const SandboxDocument = defineAsyncComponent(() => import('./SandboxDocument.vue'))
const PlotLoomBoard = defineAsyncComponent(() => import('./PlotLoomBoard.vue'))
const SandboxGraph = defineAsyncComponent(() => import('./SandboxGraph.vue'))
const SandboxMap = defineAsyncComponent(() => import('./SandboxMap.vue'))
const AutomatonChat = defineAsyncComponent(() => import('./AutomatonChat.vue'))
const WorldGenWizard = defineAsyncComponent(() => import('./WorldGenWizard.vue'))
const NovelDeepImportDialog = defineAsyncComponent(() => import('./NovelDeepImportDialog.vue'))

const activeTab = ref('doc')

// 监听 tab 切换，如果 Tour 正在显示则关闭（el-tour mask 点击不触发 close）
watch(activeTab, () => {
  if (tourOpen.value) {
    markTourCompleted()
    tourOpen.value = false
  }
})

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const showDeepImport = ref(false)

// 引导 Tour
const TOUR_COMPLETED_KEY = 'ai-novel-workshop:sandbox-tour:completed'
const sidebarRef = ref<HTMLElement>()
const actionBarRef = ref<HTMLElement>()
const scrubberRef = ref<HTMLElement>()
const tabsRef = ref<HTMLElement>()
const chatRef = ref<HTMLElement>()
const tourOpen = ref(false)

const tourSteps = [
  {
    target: sidebarRef,
    title: '实体库',
    description: '这里按类型展示所有小说实体（人物、势力、地点等）。点击可查看详情，支持搜索和创建新实体。',
  },
  {
    target: actionBarRef,
    title: '快捷工具',
    description: '批量世界生成向导可一键创建世界观；深度小说导入可从已有文本中提取实体。',
  },
  {
    target: scrubberRef,
    title: '章节进度条',
    description: '拖动滑块切换当前章节视角，所有实体状态将根据该章节的时间线自动推演。',
  },
  {
    target: tabsRef,
    title: '多维视图',
    description: '文档视图查看实体详情，命运织布机管理大纲，关系图和势力图提供可视化分析。',
  },
  {
    target: chatRef,
    title: 'AI 助手',
    description: '右侧面板是AI协作区域。你可以在这里与AI对话，进行世界观生成、实体提取等操作。',
  },
]

function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true')
    sessionStorage.setItem(TOUR_COMPLETED_KEY, 'true')
  } catch {
    // ignore
  }
}

function isTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true'
      || sessionStorage.getItem(TOUR_COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

function onTourFinish() {
  markTourCompleted()
}

function onTourClose() {
  markTourCompleted()
}

// 当 tour 从打开变为关闭时（无论通过何种方式），标记为已完成
watch(tourOpen, (newVal) => {
  if (!newVal) {
    markTourCompleted()
  }
})

const totalChapters = computed(() => {
  return projectStore.currentProject?.chapters.length || 1
})

function handleEntitySelect(entityId: string) {
  if (activeTab.value !== 'doc') {
    activeTab.value = 'doc'
  }
}

function handleDeepImportDone() {
  showDeepImport.value = false
  if (projectStore.currentProject) {
    sandboxStore.isLoaded = false
    sandboxStore.loadData(projectStore.currentProject.id)
  }
}

let lastLoadedProjectId = ''

onMounted(() => {
  if (projectStore.currentProject) {
    lastLoadedProjectId = projectStore.currentProject.id
    sandboxStore.loadData(projectStore.currentProject.id)
  }

  // 首次进入自动触发引导
  if (!isTourDone()) {
    // 延迟确保 DOM 和子组件完全就绪
    setTimeout(() => {
      if (!isTourDone()) {
        if (!sidebarRef.value) {
          logger.warn('[Tour] 沙盘 Tour 目标元素未就绪，跳过显示')
          markTourCompleted()
          return
        }
        tourOpen.value = true
      }
    }, 1000)
  }
})

// 组件卸载时，如果 tour 仍在打开状态，持久化完成状态
onBeforeUnmount(() => {
  if (tourOpen.value) {
    markTourCompleted()
    tourOpen.value = false
  }
})

watch(() => projectStore.currentProject, (newProj) => {
  if (newProj && newProj.id !== lastLoadedProjectId) {
    lastLoadedProjectId = newProj.id
    sandboxStore.isLoaded = false
    sandboxStore.loadData(newProj.id)
  }
})
</script>

<style scoped>
.sandbox-layout {
  display: flex;
  height: 100%;
  gap: var(--ds-space-4);
}
.sidebar {
  width: 250px;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}
.main-view {
  flex: 1;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.right-sidebar {
  width: 300px;
  background: var(--ds-surface);
  padding: var(--ds-space-4);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}

/* breakpoint: xl (1024px) */
@media (max-width: 1024px) {
  .sandbox-layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
  }
  .right-sidebar {
    width: 100%;
  }
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .main-view {
    padding: var(--ds-space-3);
  }
}
</style>