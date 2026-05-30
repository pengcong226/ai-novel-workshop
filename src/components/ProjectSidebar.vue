<template>
  <aside v-show="!isZenMode" class="editor-sidebar glass-panel">
    <div class="sidebar-brand">
      <button
        class="brand-icon"
        type="button"
        :title="isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        :aria-label="isSidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="$emit('update:isSidebarCollapsed', !isSidebarCollapsed)"
      >
        &#10022;
      </button>
      <span v-show="!isSidebarCollapsed" class="brand-title" :title="project?.title">
        {{ project?.title }}
      </span>
      <button v-show="!isSidebarCollapsed" class="icon-btn" type="button" title="沉浸专注模式" @click="$emit('update:isZenMode', true)">
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
        v-for="item in coreMenuItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: activeMenu === item.id }"
        type="button"
        :title="item.title"
        :aria-current="activeMenu === item.id ? 'page' : undefined"
        @click="$emit('menuSelect', item.id)"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span v-show="!isSidebarCollapsed" class="nav-label">{{ item.label }}</span>
      </button>

      <!-- Pipeline -->
      <div class="nav-divider"></div>
      <span v-show="!isSidebarCollapsed" class="nav-group-label">Pipeline</span>
      <button
        class="nav-item"
        :class="{ active: activeMenu === 'agents' }"
        type="button"
        title="Agent 控制台"
        :aria-current="activeMenu === 'agents' ? 'page' : undefined"
        @click="$emit('menuSelect', 'agents')"
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
        :aria-expanded="isToolsExpanded"
        @click="$emit('update:isToolsExpanded', !isToolsExpanded)"
      >
        <el-icon class="nav-icon"><Grid /></el-icon>
        <span v-show="!isSidebarCollapsed" class="nav-label">工具</span>
        <el-icon v-show="!isSidebarCollapsed" class="nav-arrow" :class="{ expanded: isToolsExpanded }"><ArrowDown /></el-icon>
      </button>
      <template v-if="isToolsExpanded">
        <button
          v-for="item in toolMenuItems"
          :key="item.id"
          class="nav-item nav-sub-item"
          :class="{ active: activeMenu === item.id }"
          type="button"
          :title="item.title"
          :aria-current="activeMenu === item.id ? 'page' : undefined"
          @click="$emit('menuSelect', item.id)"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span v-show="!isSidebarCollapsed" class="nav-label">{{ item.label }}</span>
          <el-tag v-if="item.badge && !isSidebarCollapsed" size="small" type="danger">{{ item.badge }}</el-tag>
        </button>
      </template>

      <div v-if="pluginMenuItems.length > 0" class="nav-divider"></div>
      <button
        v-for="item in pluginMenuItems"
        :key="item.id"
        class="nav-item"
        type="button"
        :title="item.label"
        @click="$emit('menuSelect', item.id)"
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
        <button class="footer-btn" type="button" title="快捷键" @click="$emit('update:showShortcutsDialog', true)">&#9000;</button>
        <button class="footer-btn" type="button" :title="isDark ? '切换到明亮模式' : '切换到暗色模式'" @click="$emit('toggleTheme')">
          <el-icon><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>
        <button class="footer-btn" type="button" title="返回项目列表" @click="$emit('goBack')">
          <el-icon><ArrowLeft /></el-icon>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowDown, ArrowLeft, DataAnalysis, DataBoard, DocumentCopy,
  Fold, Grid, Moon, Reading, Setting, Sunny, TrendCharts,
  Connection, Tools
} from '@element-plus/icons-vue'
import { formatNumber } from '@/utils/formatters'

interface PluginMenuItem {
  id: string
  label: string
  icon?: unknown
  handler: () => void
  when?: () => boolean
}

interface SidebarPanel {
  id: string
  component: unknown
  position: string
}

const props = defineProps<{
  project: { title?: string; currentWords?: number; targetWords?: number } | null | undefined
  isSidebarCollapsed: boolean
  isZenMode: boolean
  isDark: boolean
  activeMenu: string
  isToolsExpanded: boolean
  isDev: boolean
  isMockEnabled: boolean
  pluginMenuItems: PluginMenuItem[]
  leftPanels: SidebarPanel[]
  isSaving: boolean
  isDirty: boolean
  showShortcutsDialog: boolean
}>()

defineEmits<{
  'update:isSidebarCollapsed': [value: boolean]
  'update:isZenMode': [value: boolean]
  'update:isToolsExpanded': [value: boolean]
  'update:showShortcutsDialog': [value: boolean]
  menuSelect: [index: string]
  toggleTheme: []
  goBack: []
}>()

const coreMenuItems = computed(() => [
  { id: 'dashboard', title: '写作仪表盘', label: '写作仪表盘', icon: DataBoard },
  { id: 'sandbox', title: '多维设定沙盘', label: '设定沙盘', icon: DataBoard },
  { id: 'chapters', title: '章节', label: '章节', icon: Reading },
  { id: 'config', title: '配置', label: '配置', icon: Setting },
])

const toolMenuItems = computed(() => {
  const items = [
    { id: 'summary', title: '摘要管理', label: '摘要管理', icon: DocumentCopy, badge: '' },
    { id: 'quality', title: '质量报告', label: '质量报告', icon: DataAnalysis, badge: '' },
    { id: 'token-usage', title: 'Token 用量', label: 'Token 用量', icon: TrendCharts, badge: '' },
  ]
  if (props.isDev) {
    items.push({
      id: '__dev_panel__',
      title: '开发者面板',
      label: '开发者面板',
      icon: Tools,
      badge: props.isMockEnabled ? 'MOCK' : '',
    })
  }
  return items
})
</script>

<style scoped>
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
</style>
