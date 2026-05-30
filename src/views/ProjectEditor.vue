<template>
  <div
    class="project-editor editor-layout"
    :class="{
      'sidebar-collapsed': isSidebarCollapsed,
      'zen-mode': isZenMode,
      'has-right-sidebar': rightPanels.length > 0 && !isZenMode,
    }"
  >
    <aside v-show="!isZenMode" class="editor-sidebar glass-panel">
      <div class="sidebar-brand">
        <button
          class="brand-icon"
          type="button"
          :title="isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          :aria-label="isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          ✦
        </button>
        <span v-show="!isSidebarCollapsed" class="brand-title" :title="project?.title">
          {{ project?.title }}
        </span>
        <button v-show="!isSidebarCollapsed" class="icon-btn" type="button" title="沉浸专注模式" @click="isZenMode = true">
          <el-icon><Fold /></el-icon>
        </button>
      </div>

      <div v-show="!isSidebarCollapsed" class="sidebar-stats">
        <div class="stat">
          <span class="stat-value">{{ formatNumber(project?.currentWords || 0) }}</span>
          <span class="stat-label">字数</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ formatNumber(project?.targetWords || 0) }}</span>
          <span class="stat-label">目标</span>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="项目工作区导航">
        <!-- 核心功能 -->
        <span v-show="!isSidebarCollapsed" class="nav-group-label">核心功能</span>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'dashboard' }"
          type="button"
          title="写作仪表盘"
          @click="handleMenuSelect('dashboard')"
        >
          <el-icon class="nav-icon"><DataBoard /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">写作仪表盘</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'sandbox' }"
          type="button"
          title="多维设定沙盘"
          @click="handleMenuSelect('sandbox')"
        >
          <el-icon class="nav-icon"><DataBoard /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">设定沙盘</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'chapters' }"
          type="button"
          title="章节"
          @click="handleMenuSelect('chapters')"
        >
          <el-icon class="nav-icon"><Reading /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">章节</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'config' }"
          type="button"
          title="配置"
          @click="handleMenuSelect('config')"
        >
          <el-icon class="nav-icon"><Setting /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">配置</span>
        </button>

        <!-- Pipeline -->
        <div class="nav-divider"></div>
        <span v-show="!isSidebarCollapsed" class="nav-group-label">Pipeline</span>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'agents' }"
          type="button"
          title="Agent 控制台"
          @click="handleMenuSelect('agents')"
        >
          <el-icon class="nav-icon"><Connection /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">Agent 控制台</span>
          <el-tag v-show="!isSidebarCollapsed" size="small" type="success" class="nav-badge">Pipeline</el-tag>
        </button>

        <!-- 工具 -->
        <div class="nav-divider"></div>
        <span v-show="!isSidebarCollapsed" class="nav-group-label">工具</span>
        <button
          class="nav-item nav-group-toggle"
          type="button"
          title="展开/收起工具"
          @click="isToolsExpanded = !isToolsExpanded"
        >
          <el-icon class="nav-icon"><Grid /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">工具</span>
          <el-icon v-show="!isSidebarCollapsed" class="nav-arrow" :class="{ expanded: isToolsExpanded }"><ArrowDown /></el-icon>
        </button>
        <template v-if="isToolsExpanded">
          <button
            class="nav-item nav-sub-item"
            :class="{ active: activeMenu === 'summary' }"
            type="button"
            title="摘要管理"
            @click="handleMenuSelect('summary')"
          >
            <el-icon class="nav-icon"><DocumentCopy /></el-icon>
            <span v-show="!isSidebarCollapsed" class="nav-label">摘要管理</span>
          </button>
          <button
            class="nav-item nav-sub-item"
            :class="{ active: activeMenu === 'quality' }"
            type="button"
            title="质量报告"
            @click="handleMenuSelect('quality')"
          >
            <el-icon class="nav-icon"><DataAnalysis /></el-icon>
            <span v-show="!isSidebarCollapsed" class="nav-label">质量报告</span>
          </button>
          <button
            class="nav-item nav-sub-item"
            :class="{ active: activeMenu === 'token-usage' }"
            type="button"
            title="Token 用量"
            @click="handleMenuSelect('token-usage')"
          >
            <el-icon class="nav-icon"><TrendCharts /></el-icon>
            <span v-show="!isSidebarCollapsed" class="nav-label">Token 用量</span>
          </button>
          <button
            v-if="isDev"
            class="nav-item nav-sub-item"
            :class="{ active: activeMenu === '__dev_panel__' }"
            type="button"
            title="开发者面板"
            @click="handleMenuSelect('__dev_panel__')"
          >
            <el-icon class="nav-icon"><Tools /></el-icon>
            <span v-show="!isSidebarCollapsed" class="nav-label">开发者面板</span>
            <el-tag v-if="isMockEnabled && !isSidebarCollapsed" size="small" type="danger">MOCK</el-tag>
          </button>
        </template>

        <div v-if="pluginMenuItems.length > 0" class="nav-divider"></div>
        <button
          v-for="item in pluginMenuItems"
          :key="item.id"
          class="nav-item"
          type="button"
          :title="item.label"
          @click="handleMenuSelect(item.id)"
        >
          <el-icon class="nav-icon">
            <component :is="item.icon" v-if="item.icon" />
            <Grid v-else />
          </el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <div v-if="leftPanels.length > 0 && !isSidebarCollapsed" class="plugin-panels">
        <component
          v-for="panel in leftPanels"
          :key="panel.id"
          :is="panel.component"
        />
      </div>

      <div class="sidebar-footer">
        <span v-if="isSaving" v-show="!isSidebarCollapsed" class="save-status saving">保存中</span>
        <span v-else-if="isDirty" v-show="!isSidebarCollapsed" class="save-status dirty">未保存</span>
        <div class="footer-actions">
          <button class="footer-btn" type="button" title="快捷键" @click="showShortcutsDialog = true">⌨</button>
          <button class="footer-btn" type="button" :title="isDark ? '切换到明亮模式' : '切换到暗色模式'" @click="toggleTheme">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
          </button>
          <button class="footer-btn" type="button" title="返回项目列表" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
          </button>
        </div>
      </div>
    </aside>

    <main class="editor-main" :class="{ 'is-zen': isZenMode }">
      <el-button
        v-if="isZenMode"
        class="zen-exit-btn"
        type="primary"
        circle
        size="large"
        @click="isZenMode = false"
        title="退出沉浸模式"
      >
        <el-icon><Expand /></el-icon>
      </el-button>

      <div v-if="projectStore.loading" class="loading-container glass-panel">
        <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        <p>加载项目中...</p>
      </div>
      <section v-else-if="project && project.id" class="workspace-surface">
        <ErrorBoundary name="WritingDashboard" :show-retry="true" :show-detail="false">
          <WritingDashboard
            v-if="activeMenu === 'dashboard'"
            @open-chapters="handleDashboardAction"
            @create-chapter="handleDashboardAction"
            @continue-writing="handleDashboardAction"
            @batch-generate="handleDashboardAction"
            @open-config="handleMenuSelect('config')"
            @open-sandbox="handleMenuSelect('sandbox')"
            @open-agents="handleMenuSelect('agents')"
          />
        </ErrorBoundary>
        <ErrorBoundary name="SandboxLayout" :show-retry="true">
          <SandboxLayout v-if="activeMenu === 'sandbox'" />
        </ErrorBoundary>
        <ErrorBoundary name="Chapters" :show-retry="true">
          <Chapters v-if="activeMenu === 'chapters'" />
        </ErrorBoundary>
        <SummaryManager v-if="activeMenu === 'summary'" />
        <ErrorBoundary name="QualityReport" :show-retry="true">
          <QualityReport v-if="activeMenu === 'quality'" />
        </ErrorBoundary>
        <ErrorBoundary name="TokenUsagePanel" :show-retry="true">
          <TokenUsagePanel v-if="activeMenu === 'token-usage'" />
        </ErrorBoundary>
        <AgentConsole v-if="activeMenu === 'agents'" />
        <ErrorBoundary name="ProjectConfig" :show-retry="true">
          <ProjectConfig v-if="activeMenu === 'config'" />
        </ErrorBoundary>
        <DeveloperPanel v-if="activeMenu === '__dev_panel__'" />
      </section>
      <div v-else class="error-container glass-panel">
        <el-empty description="项目加载失败">
          <p>错误信息: {{ projectStore.error || '项目数据为空' }}</p>
          <p>项目ID: {{ route.params.id }}</p>
          <p>项目状态: {{ project ? '存在但无ID' : '不存在' }}</p>
          <el-button type="primary" @click="goBack">返回项目列表</el-button>
        </el-empty>
      </div>
    </main>

    <aside v-if="rightPanels.length > 0 && !isZenMode" class="editor-right-sidebar glass-panel">
      <component
        v-for="panel in rightPanels"
        :key="panel.id"
        :is="panel.component"
      />
    </aside>

    <AIAssistant />
    <SearchDialog />
    <KeyboardShortcutsDialog
      v-model="showShortcutsDialog"
      :shortcuts="shortcuts"
    />

    <!-- Pipeline 新手引导（自定义实现，替代 el-tour） -->
    <AppTour
      v-model="pipelineTourOpen"
      :steps="pipelineTourSteps"
      @finish="onPipelineTourFinish"
      @close="onPipelineTourClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, defineAsyncComponent, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { useAutoSave } from '@/composables/useAutoSave'
import { useGlobalSearch } from '@/composables/useGlobalSearch'
import { useThemeStore } from '@/stores/theme'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import { Reading, Setting, ArrowLeft, ArrowDown, Loading, DataAnalysis, DocumentCopy, Tools, Fold, Expand, DataBoard, Sunny, Moon, Grid, TrendCharts, Connection, House, Notebook, Compass, Cpu } from '@element-plus/icons-vue'
import { h } from 'vue'
import { getAIMockEnabled } from '@/utils/devFlags'
import { getLogger } from '@/utils/logger'
import { formatNumber } from '@/utils/formatters'
const AppTour = defineAsyncComponent(() => import('@/components/AppTour.vue'))
import ErrorBoundary from '@/components/ErrorBoundary.vue'
const logger = getLogger('views:ProjectEditor')

// 懒加载组件 - 按需加载，优化首屏性能
const WritingDashboard = defineAsyncComponent(() => import('@/components/WritingDashboard.vue'))
const SandboxLayout = defineAsyncComponent(() => import('@/components/Sandbox/SandboxLayout.vue'))
const Chapters = defineAsyncComponent(() => import('@/components/Chapters.vue'))
const ProjectConfig = defineAsyncComponent(() => import('@/components/ProjectConfig.vue'))
const QualityReport = defineAsyncComponent(() => import('@/components/QualityReport.vue'))
const TokenUsagePanel = defineAsyncComponent(() => import('@/components/TokenUsagePanel.vue'))
const AIAssistant = defineAsyncComponent(() => import('@/components/AIAssistant.vue'))
const SummaryManager = defineAsyncComponent(() => import('@/components/SummaryManager.vue'))
const DeveloperPanel = defineAsyncComponent(() => import('@/components/DeveloperPanel.vue'))
const AgentConsole = defineAsyncComponent(() => import('@/components/AgentConsole.vue'))
const SearchDialog = defineAsyncComponent(() => import('@/components/SearchDialog.vue'))
const KeyboardShortcutsDialog = defineAsyncComponent(() => import('@/components/KeyboardShortcutsDialog.vue'))
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const { isDirty, isSaving, save } = useAutoSave()
const themeStore = useThemeStore()
const tokenUsageStore = useTokenUsageStore()
const globalSearch = useGlobalSearch()
const { shortcuts, registerShortcuts } = useKeyboardShortcuts()
const isDark = computed(() => themeStore.activeThemeId === 'builtin-scifi-dark-theme')

function toggleTheme() {
  themeStore.activeThemeId = isDark.value ? 'builtin-classic-light-theme' : 'builtin-scifi-dark-theme'
}

const activeMenu = ref('dashboard')
const isDev = import.meta.env.DEV
const isMockEnabled = ref(false)
const isZenMode = ref(false)
const isSidebarCollapsed = ref(false)
const isToolsExpanded = ref(false)
const showShortcutsDialog = ref(false)

// Pipeline 新手引导
const PIPELINE_TOUR_KEY = 'ai-novel-workshop:pipeline-tour:completed'
const pipelineTourOpen = ref(false)
const _sidebarNavRef = ref<HTMLElement>()
const _agentsMenuRef = ref<HTMLElement>()

const pipelineTourSteps = computed(() => [
  {
    target: '.sidebar-nav',
    title: '欢迎使用 AI 小说工坊',
    description: '这是你的创作工作台。左侧导航可快速切换各功能区域，由10个专业AI Agent组成流水线，帮你完成从构思到成书的全过程。',
    icon: h(House, { style: 'color: var(--ds-accent); font-size: 18px;' }),
  },
  {
    target: '.sidebar-stats',
    title: '写作进度概览',
    description: '实时显示当前字数与目标字数。设定目标后，系统会自动追踪你的创作进度。',
    icon: h(TrendCharts, { style: 'color: var(--ds-success); font-size: 18px;' }),
  },
  {
    target: '.nav-item[title="写作仪表盘"]',
    title: '写作仪表盘',
    description: '项目的核心控制台。查看章节状态、续写进度、AI配置状态和快捷操作，一站掌握全局。',
    icon: h(DataBoard, { style: 'color: var(--ds-info); font-size: 18px;' }),
  },
  {
    target: '.nav-item[title="多维设定沙盘"]',
    title: '多维设定沙盘',
    description: '世界观、人物关系、势力图的可视化管理。AI会自动维护设定一致性，避免前后矛盾。',
    icon: h(Grid, { style: 'color: var(--ds-warning); font-size: 18px;' }),
  },
  {
    target: '.nav-item[title="章节"]',
    title: '章节管理',
    description: '管理所有章节的创作、编辑和审校。支持AI续写、批量生成、多格式导出。',
    icon: h(Notebook, { style: 'color: var(--ds-accent-text); font-size: 18px;' }),
  },
  {
    target: '.nav-item[title="配置"]',
    title: '模型配置',
    description: '配置AI模型提供商（OpenAI、Anthropic、DeepSeek等），是使用AI功能的前提。',
    icon: h(Cpu, { style: 'color: var(--ds-text-secondary); font-size: 18px;' }),
  },
  {
    target: '.nav-item[title="展开/收起工具"]',
    title: 'Agent 控制台',
    description: '展开工具菜单找到Agent控制台。10个Agent协同完成高质量创作。',
    icon: h(Compass, { style: 'color: var(--ds-accent); font-size: 18px;' }),
  },
])

function markPipelineTourCompleted() {
  try {
    localStorage.setItem(PIPELINE_TOUR_KEY, 'true')
    sessionStorage.setItem(PIPELINE_TOUR_KEY, 'true')
  } catch {
    // ignore
  }
}

function isPipelineTourDone(): boolean {
  try {
    return localStorage.getItem(PIPELINE_TOUR_KEY) === 'true'
      || sessionStorage.getItem(PIPELINE_TOUR_KEY) === 'true'
  } catch {
    return false
  }
}

function onPipelineTourFinish() {
  markPipelineTourCompleted()
}

function onPipelineTourClose() {
  markPipelineTourCompleted()
}

// 当 tour 从打开变为关闭时（无论通过何种方式），标记为已完成
watch(pipelineTourOpen, (newVal) => {
  if (!newVal) {
    markPipelineTourCompleted()
  }
})

const project = computed(() => projectStore.currentProject)

registerShortcuts([
  {
    id: 'workspace.save',
    label: '保存项目',
    keys: ['mod', 's'],
    scope: 'workspace',
    allowInInputs: true,
    disabled: () => isSaving.value,
    handler: () => save(),
  },
  {
    id: 'workspace.search',
    label: '打开全局搜索',
    keys: ['mod', 'k'],
    scope: 'workspace',
    handler: () => globalSearch.open(),
  },
  {
    id: 'workspace.shortcuts',
    label: '查看快捷键',
    keys: ['mod', '/'],
    scope: 'workspace',
    allowInInputs: true,
    handler: () => { showShortcutsDialog.value = true },
  },
  {
    id: 'workspace.toggle-zen',
    label: '切换沉浸模式',
    keys: ['mod', 'shift', 'z'],
    scope: 'workspace',
    handler: () => { isZenMode.value = !isZenMode.value },
  },
  {
    id: 'workspace.open-dashboard',
    label: '切换到写作仪表盘',
    keys: ['alt', '1'],
    scope: 'workspace',
    handler: () => handleMenuSelect('dashboard'),
  },
  {
    id: 'workspace.open-sandbox',
    label: '切换到设定沙盘',
    keys: ['alt', '2'],
    scope: 'workspace',
    handler: () => handleMenuSelect('sandbox'),
  },
  {
    id: 'workspace.open-chapters',
    label: '切换到章节',
    keys: ['alt', '3'],
    scope: 'workspace',
    handler: () => handleMenuSelect('chapters'),
  },
  {
    id: 'workspace.open-summary',
    label: '切换到摘要管理',
    keys: ['alt', '4'],
    scope: 'workspace',
    handler: () => handleMenuSelect('summary'),
  },
  {
    id: 'workspace.open-quality',
    label: '切换到质量报告',
    keys: ['alt', '5'],
    scope: 'workspace',
    handler: () => handleMenuSelect('quality'),
  },
  {
    id: 'workspace.open-token-usage',
    label: '切换到 Token 用量',
    keys: ['alt', '6'],
    scope: 'workspace',
    handler: () => handleMenuSelect('token-usage'),
  },
  {
    id: 'workspace.open-config',
    label: '切换到配置',
    keys: ['alt', '7'],
    scope: 'workspace',
    handler: () => handleMenuSelect('config'),
  },
])

// 获取插件提供的菜单项
const pluginMenuItems = computed(() => {
  const items = pluginStore.getMenuItems()
  return items.filter(item => {
    // 如果有when条件，检查是否应该显示
    if (item.when) {
      try {
        return item.when()
      } catch (error) {
        logger.error(`菜单项 ${item.id} 的 when 条件执行失败:`, error)
        return false
      }
    }
    return true
  })
})

// 获取插件提供的侧边栏面板
const pluginSidebarPanels = computed(() => {
  return pluginStore.getSidebarPanels()
})

// 左侧面板
const leftPanels = computed(() => {
  return pluginSidebarPanels.value.filter(panel => panel.position === 'left')
})

// 右侧面板
const rightPanels = computed(() => {
  return pluginSidebarPanels.value.filter(panel => panel.position === 'right')
})

onMounted(async () => {
  const projectId = route.params.id as string
  await projectStore.openProject(projectId)
  tokenUsageStore.loadProjectUsage(projectId)

  // 加载已安装插件
  await pluginStore.loadInstalledPlugins()
  isMockEnabled.value = getAIMockEnabled()

  // 首次进入自动触发 Pipeline 新手引导
  if (!isPipelineTourDone()) {
    // 延迟确保 DOM 和异步组件就绪
    nextTick(() => {
      setTimeout(() => {
        if (!isPipelineTourDone()) {
          const firstTarget = document.querySelector('.sidebar-nav')
          if (!firstTarget) {
            logger.warn('[Tour] 目标元素未就绪，跳过 Tour 显示')
            markPipelineTourCompleted()
            return
          }
          pipelineTourOpen.value = true
        }
      }, 1000)
    })
  }
})

// 组件卸载时，如果 tour 仍在打开状态，持久化完成状态
// 同时清理 project store 的事件监听器和定时器
onBeforeUnmount(() => {
  if (pipelineTourOpen.value) {
    markPipelineTourCompleted()
    pipelineTourOpen.value = false
  }
  projectStore.cleanup()
})

function handleMenuSelect(index: string) {
  // 切换导航时，如果 Tour 仍在显示，关闭它
  if (pipelineTourOpen.value) {
    markPipelineTourCompleted()
    pipelineTourOpen.value = false
  }

  if (index === '__dev_panel__') {
    activeMenu.value = index
    isMockEnabled.value = getAIMockEnabled()
    return
  }

  // 检查是否是插件菜单项
  const pluginItem = pluginMenuItems.value.find(item => item.id === index)
  if (pluginItem) {
    // 执行插件菜单项处理
    pluginItem.handler()
  } else {
    // 内置菜单项
    activeMenu.value = index
  }
}

function handleDashboardAction() {
  activeMenu.value = 'chapters'
}

function goBack() {
  router.push('/')
}

</script>

<style scoped>
.project-editor {
  height: 100vh;
  overflow: hidden;
  color: var(--ds-text-primary);
}

.editor-layout {
  display: grid;
  grid-template-columns: var(--ds-sidebar-width) minmax(0, 1fr);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--ds-accent) 12%, transparent), transparent 34%),
    var(--ds-bg-primary);
  transition: grid-template-columns var(--ds-transition-slow);
}

.editor-layout.has-right-sidebar {
  grid-template-columns: var(--ds-sidebar-width) minmax(0, 1fr) 300px;
}

.editor-layout.sidebar-collapsed {
  grid-template-columns: var(--ds-sidebar-collapsed-width) minmax(0, 1fr);
}

.editor-layout.sidebar-collapsed.has-right-sidebar {
  grid-template-columns: var(--ds-sidebar-collapsed-width) minmax(0, 1fr) 300px;
}

.editor-layout.zen-mode {
  grid-template-columns: minmax(0, 1fr);
}

.editor-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: var(--ds-space-3) 0 var(--ds-space-3) var(--ds-space-3);
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
  padding: var(--ds-space-3);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-2);
  margin-bottom: var(--ds-space-4);
}

.brand-icon,
.icon-btn,
.footer-btn {
  border: none;
  cursor: pointer;
  transition: all var(--ds-transition-fast);
}

.brand-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-accent-subtle);
  color: var(--ds-accent-text);
  border-radius: var(--ds-radius-sm);
  font-size: 18px;
  flex-shrink: 0;
}

.brand-icon:hover {
  background: var(--ds-accent);
  color: white;
}

.brand-title {
  min-width: 0;
  flex: 1;
  font-weight: 600;
  font-size: var(--ds-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon-btn,
.footer-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--ds-text-secondary);
  border-radius: var(--ds-radius-sm);
}

.icon-btn:hover,
.footer-btn:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.sidebar-stats {
  display: flex;
  gap: var(--ds-space-4);
  padding: var(--ds-space-3) var(--ds-space-4);
  margin-bottom: var(--ds-space-4);
  background: var(--ds-bg-hover);
  border-radius: var(--ds-radius-sm);
}

.stat-value {
  display: block;
  font-weight: 600;
  font-size: var(--ds-text-md);
}

.stat-label {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  width: 100%;
  min-height: 38px;
  padding: var(--ds-space-2) var(--ds-space-3);
  border: none;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-text-secondary);
  cursor: pointer;
  font-size: var(--ds-text-sm);
  text-align: left;
  white-space: nowrap;
  transition: all var(--ds-transition-fast);
}

.nav-item:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.nav-item.active {
  background: var(--ds-accent-subtle);
  color: var(--ds-accent-text);
  font-weight: 500;
}

.nav-icon {
  flex-shrink: 0;
  width: 24px;
}

.nav-group-toggle {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-xs);
  letter-spacing: 0.05em;
}

.nav-group-toggle:hover {
  color: var(--ds-text-primary);
}

.nav-arrow {
  margin-left: auto;
  font-size: 12px;
  transition: transform var(--ds-transition-fast);
}

.nav-arrow.expanded {
  transform: rotate(180deg);
}

.nav-sub-item {
  padding-left: calc(var(--ds-space-3) + 12px);
  font-size: var(--ds-text-xs);
}

.nav-icon {
  flex-shrink: 0;
  width: 24px;
  justify-content: center;
  font-size: 16px;
}

.nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-badge {
  margin-left: auto;
  flex-shrink: 0;
}

.nav-divider {
  height: 1px;
  margin: var(--ds-space-3) var(--ds-space-2);
  background: var(--ds-surface-border);
}

.nav-group-label {
  display: block;
  padding: var(--ds-space-1) var(--ds-space-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-text-tertiary);
  user-select: none;
}

.plugin-panels {
  margin-top: var(--ds-space-3);
  padding-top: var(--ds-space-3);
  border-top: 1px solid var(--ds-surface-border);
  overflow-y: auto;
  max-height: 240px;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-3);
  border-top: 1px solid var(--ds-surface-border);
  margin-top: var(--ds-space-3);
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: var(--ds-space-1);
  margin-left: auto;
}

.save-status-wrap {
  flex: 1;
  min-width: 0;
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-space-1);
  font-size: var(--ds-text-xs);
  padding: 2px var(--ds-space-2);
  border-radius: var(--ds-radius-full);
}

.save-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.save-status.saving {
  color: var(--ds-info);
  background: color-mix(in srgb, var(--ds-info) 14%, transparent);
}

.save-status.saving::before {
  background: var(--ds-info);
  animation: pulse 1.2s infinite;
}

.save-status.dirty {
  color: var(--ds-warning);
  background: color-mix(in srgb, var(--ds-warning) 14%, transparent);
}

.save-status.dirty::before {
  background: var(--ds-warning);
}

.editor-main {
  min-width: 0;
  overflow-y: auto;
  padding: var(--ds-space-6);
  position: relative;
}

.workspace-surface {
  min-height: 100%;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 420px;
  padding: var(--ds-space-8);
  color: var(--ds-text-secondary);
}

.loading-container p,
.error-container p {
  margin: var(--ds-space-2) 0;
  color: var(--ds-text-secondary);
}

.editor-right-sidebar {
  min-width: 0;
  margin: var(--ds-space-3) var(--ds-space-3) var(--ds-space-3) 0;
  border-radius: var(--ds-radius-lg);
  overflow-y: auto;
  padding: var(--ds-space-3);
}

.editor-main.is-zen {
  padding: 0;
  transition: all var(--ds-transition-slow);
}

.editor-main.is-zen .workspace-surface {
  height: 100%;
}

.zen-exit-btn {
  position: absolute;
  top: var(--ds-space-5);
  left: var(--ds-space-5);
  z-index: var(--ds-z-overlay);
  box-shadow: var(--ds-shadow-lg);
  opacity: 0.35;
  transition: opacity var(--ds-transition-normal);
}

.zen-exit-btn:hover {
  opacity: 1;
}

.sidebar-collapsed .editor-sidebar {
  align-items: center;
}

.sidebar-collapsed .sidebar-brand,
.sidebar-collapsed .sidebar-footer {
  width: 100%;
  padding-left: 0;
  padding-right: 0;
}

.sidebar-collapsed .sidebar-footer {
  justify-content: center;
}

.sidebar-collapsed .footer-actions {
  margin-left: 0;
}

.sidebar-collapsed .nav-item {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

/* breakpoint: lg (900px) */
@media (max-width: 900px) {
  .editor-layout,
  .editor-layout.has-right-sidebar {
    grid-template-columns: var(--ds-sidebar-collapsed-width) minmax(0, 1fr);
  }

  .editor-right-sidebar {
    display: none;
  }

  .editor-main {
    padding: var(--ds-space-4);
  }
}

</style>
