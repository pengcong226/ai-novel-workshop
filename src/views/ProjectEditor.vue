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
          :class="{ active: activeMenu === 'summary' }"
          type="button"
          title="摘要管理"
          @click="handleMenuSelect('summary')"
        >
          <el-icon class="nav-icon"><DocumentCopy /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">摘要管理</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'quality' }"
          type="button"
          title="质量报告"
          @click="handleMenuSelect('quality')"
        >
          <el-icon class="nav-icon"><DataAnalysis /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">质量报告</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'token-usage' }"
          type="button"
          title="Token 用量"
          @click="handleMenuSelect('token-usage')"
        >
          <el-icon class="nav-icon"><TrendCharts /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">Token 用量</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeMenu === 'agents' }"
          type="button"
          title="Agent 控制台"
          @click="handleMenuSelect('agents')"
        >
          <el-icon class="nav-icon"><Grid /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">Agent 控制台</span>
        </button>
        <button
          v-if="isDev"
          class="nav-item"
          :class="{ active: activeMenu === '__dev_panel__' }"
          type="button"
          title="开发者面板"
          @click="handleMenuSelect('__dev_panel__')"
        >
          <el-icon class="nav-icon"><Tools /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">开发者面板</span>
          <el-tag v-if="isMockEnabled && !isSidebarCollapsed" size="small" type="danger">MOCK</el-tag>
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
        <div v-show="!isSidebarCollapsed" class="save-status-wrap">
          <span v-if="isSaving" class="save-status saving">保存中</span>
          <span v-else-if="isDirty" class="save-status dirty">未保存</span>
        </div>
        <button class="footer-btn" type="button" title="快捷键" @click="showShortcutsDialog = true">⌨</button>
        <button class="footer-btn" type="button" :title="isDark ? '切换到明亮模式' : '切换到暗色模式'" @click="toggleTheme">
          <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>
        <button class="footer-btn" type="button" title="返回项目列表" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </button>
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
        <WritingDashboard
          v-if="activeMenu === 'dashboard'"
          @open-chapters="handleDashboardAction"
          @create-chapter="handleDashboardAction"
          @continue-writing="handleDashboardAction"
          @batch-generate="handleDashboardAction"
        />
        <SandboxLayout v-else-if="activeMenu === 'sandbox'" />
        <Chapters v-else-if="activeMenu === 'chapters'" />
        <SummaryManager v-else-if="activeMenu === 'summary'" />
        <QualityReport v-else-if="activeMenu === 'quality'" />
        <TokenUsagePanel v-else-if="activeMenu === 'token-usage'" />
        <AgentConsole v-else-if="activeMenu === 'agents'" />
        <ProjectConfig v-else-if="activeMenu === 'config'" />
        <DeveloperPanel v-else-if="activeMenu === '__dev_panel__'" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { useAutoSave } from '@/composables/useAutoSave'
import { useGlobalSearch } from '@/composables/useGlobalSearch'
import { useThemeStore } from '@/stores/theme'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import { Reading, Setting, ArrowLeft, Loading, DataAnalysis, DocumentCopy, Tools, Fold, Expand, DataBoard, Sunny, Moon, Grid, TrendCharts } from '@element-plus/icons-vue'
import { getAIMockEnabled } from '@/utils/devFlags'
import { getLogger } from '@/utils/logger'
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
import SearchDialog from '@/components/SearchDialog.vue'
import KeyboardShortcutsDialog from '@/components/KeyboardShortcutsDialog.vue'
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
const showShortcutsDialog = ref(false)

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
})

function handleMenuSelect(index: string) {
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

function formatNumber(num?: number | null) {
  if (num === undefined || num === null || isNaN(num)) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toString()
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
  justify-content: center;
  font-size: 16px;
}

.nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-divider {
  height: 1px;
  margin: var(--ds-space-3) var(--ds-space-2);
  background: var(--ds-surface-border);
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
  justify-content: center;
  gap: var(--ds-space-1);
  padding-top: var(--ds-space-3);
  border-top: 1px solid var(--ds-surface-border);
  margin-top: var(--ds-space-3);
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
  z-index: 999;
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

.sidebar-collapsed .nav-item {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

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
