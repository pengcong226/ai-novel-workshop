<template>
  <div class="project-editor">
    <el-container>
      <!-- 左侧导航 -->
      <transition name="el-zoom-in-left">
        <el-aside v-show="!isZenMode" width="250px" class="sidebar">
          <div class="project-info">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h2>{{ project?.title }}</h2>
              <el-button @click="isZenMode = true" text circle title="沉浸专注模式">
                <el-icon><Fold /></el-icon>
              </el-button>
            </div>
            <div class="stats">
              <div class="stat-item">
                <span class="label">字数</span>
                <span class="value">{{ formatNumber(project?.currentWords || 0) }}</span>
              </div>
            <div class="stat-item">
              <span class="label">目标</span>
              <span class="value">{{ formatNumber(project?.targetWords || 0) }}</span>
            </div>
          </div>
        </div>

        <el-menu
          :default-active="activeMenu"
          @select="handleMenuSelect"
          class="sidebar-menu"
        >
          <!-- 内置菜单项 -->
          <el-menu-item index="dashboard">
            <el-icon><DataBoard /></el-icon>
            <span>写作仪表盘</span>
          </el-menu-item>

          <el-menu-item index="sandbox">
            <el-icon><DataBoard /></el-icon>
            <span>多维设定沙盘</span>
          </el-menu-item>

          <el-menu-item index="chapters">
            <el-icon><Reading /></el-icon>
            <span>章节</span>
          </el-menu-item>
          <el-menu-item index="summary">
            <el-icon><DocumentCopy /></el-icon>
            <span>摘要管理</span>
          </el-menu-item>
          <el-menu-item index="quality">
            <el-icon><DataAnalysis /></el-icon>
            <span>质量报告</span>
          </el-menu-item>
          <el-menu-item index="token-usage">
            <el-icon><TrendCharts /></el-icon>
            <span>Token 用量</span>
          </el-menu-item>
          <el-menu-item index="agents">
            <el-icon><Grid /></el-icon>
            <span>Agent 控制台</span>
          </el-menu-item>
          <el-menu-item v-if="isDev" index="__dev_panel__">
            <el-icon><Tools /></el-icon>
            <span>开发者面板</span>
            <el-tag v-if="isMockEnabled" size="small" type="danger" style="margin-left: 8px;">MOCK</el-tag>
          </el-menu-item>
          <el-menu-item index="config">
            <el-icon><Setting /></el-icon>
            <span>配置</span>
          </el-menu-item>

          <!-- 插件菜单项 -->
          <el-divider v-if="pluginMenuItems.length > 0" />
          <el-menu-item
            v-for="item in pluginMenuItems"
            :key="item.id"
            :index="item.id"
          >
            <el-icon>
              <component :is="item.icon" v-if="item.icon" />
            </el-icon>
            <span>{{ item.label }}</span>
          </el-menu-item>
        </el-menu>

        <!-- 插件左侧边栏面板 -->
        <template v-if="leftPanels.length > 0">
          <el-divider />
          <div class="plugin-panels">
            <component
              v-for="panel in leftPanels"
              :key="panel.id"
              :is="panel.component"
            />
          </div>
        </template>

        <div class="sidebar-footer">
          <div v-if="isSaving" class="save-status saving">保存中...</div>
          <div v-else-if="isDirty" class="save-status dirty">未保存</div>
          <el-button @click="showShortcutsDialog = true" text title="快捷键">
            快捷键
          </el-button>
          <el-button @click="toggleTheme" text :title="isDark ? '切换到明亮模式' : '切换到暗色模式'">
            <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
          </el-button>
          <el-button @click="goBack" text>
            <el-icon><ArrowLeft /></el-icon>
            返回项目列表
          </el-button>
        </div>
      </el-aside>
      </transition>

      <!-- 主内容区 -->
      <el-main class="main-content" :class="{ 'is-zen': isZenMode }">
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

        <div v-if="projectStore.loading" class="loading-container">
          <el-icon class="is-loading" :size="40"><Loading /></el-icon>
          <p>加载项目中...</p>
        </div>
        <template v-else-if="project && project.id">
          <!-- 内置组件 -->
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

          <!-- 插件组件可以在这里渲染 -->
          <DeveloperPanel v-else-if="activeMenu === '__dev_panel__'" />

          <template v-else>
            <!-- 如果当前选中的是插件菜单项，这里可以渲染对应的内容 -->
          </template>
        </template>
        <div v-else class="error-container">
          <el-empty description="项目加载失败">
            <p style="color: #909399; margin: 10px 0;">错误信息: {{ projectStore.error || '项目数据为空' }}</p>
            <p style="color: #909399; margin: 10px 0;">项目ID: {{ route.params.id }}</p>
            <p style="color: #909399; margin: 10px 0;">项目状态: {{ project ? '存在但无ID' : '不存在' }}</p>
            <el-button type="primary" @click="goBack">返回项目列表</el-button>
          </el-empty>
        </div>
      </el-main>

      <!-- 插件右侧边栏面板 -->
      <el-aside
        v-if="rightPanels.length > 0"
        width="300px"
        class="right-sidebar"
      >
        <component
          v-for="panel in rightPanels"
          :key="panel.id"
          :is="panel.component"
        />
      </el-aside>
    </el-container>

    <!-- AI助手 -->
    <AIAssistant />

    <!-- 全局搜索 -->
    <SearchDialog />

    <!-- 快捷键说明 -->
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
}

.el-container {
  height: 100%;
}

.sidebar {
  background: white;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
}

.project-info {
  padding: 20px;
  border-bottom: 1px solid #e4e7ed;
}

.project-info h2 {
  margin: 0 0 15px 0;
  font-size: 18px;
  color: #303133;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-item .label {
  font-size: 12px;
  color: #909399;
}

.stat-item .value {
  font-size: 16px;
  font-weight: 600;
  color: #409eff;
}

.sidebar-menu {
  border: none;
  flex: 1;
}

.sidebar-footer {
  padding: 10px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.save-status.saving {
  color: #409eff;
  background: #ecf5ff;
}

.save-status.dirty {
  color: #e6a23c;
  background: #fdf6ec;
}

.main-content {
  background: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
  position: relative;
}

.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}

.loading-container p {
  margin-top: 20px;
  font-size: 16px;
  color: #909399;
}

.right-sidebar {
  background: white;
  border-left: 1px solid #e4e7ed;
  overflow-y: auto;
}

.plugin-panels {
  padding: 10px;
}

.el-divider {
  margin: 10px 0;
}

.main-content.is-zen {
  padding: 0;
  transition: all 0.3s ease;
}

.zen-exit-btn {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0.3;
  transition: opacity 0.3s;
}

.zen-exit-btn:hover {
  opacity: 1;
}
</style>
