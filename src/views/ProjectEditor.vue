<template>
  <div class="project-editor">
    <el-container>
      <!-- 左侧导航 -->
      <el-aside width="250px" class="sidebar">
        <div class="project-info">
          <h2>{{ project?.title }}</h2>
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
          <el-menu-item index="world">
            <el-icon><Promotion /></el-icon>
            <span>世界观设定</span>
          </el-menu-item>

          <el-menu-item index="map">
            <el-icon><Location /></el-icon>
            <span>世界地图</span>
          </el-menu-item>
          <el-menu-item index="characters">
            <el-icon><User /></el-icon>
            <span>人物设定</span>
          </el-menu-item>
          <el-menu-item index="relationships">
            <el-icon><Connection /></el-icon>
            <span>人物关系图</span>
          </el-menu-item>
          <el-menu-item index="outline">
            <el-icon><Document /></el-icon>
            <span>大纲</span>
          </el-menu-item>
          <el-menu-item index="chapters">
            <el-icon><Reading /></el-icon>
            <span>章节</span>
          </el-menu-item>
          <el-menu-item index="summary">
            <el-icon><DocumentCopy /></el-icon>
            <span>摘要管理</span>
          </el-menu-item>
          <el-menu-item index="memory">
            <el-icon><Memo /></el-icon>
            <span>表格记忆</span>
          </el-menu-item>
          <el-menu-item index="timeline">
            <el-icon><Clock /></el-icon>
            <span>时间线</span>
          </el-menu-item>
          <el-menu-item index="quality">
            <el-icon><DataAnalysis /></el-icon>
            <span>质量报告</span>
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
          <el-button @click="goBack" text>
            <el-icon><ArrowLeft /></el-icon>
            返回项目列表
          </el-button>
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <div v-if="projectStore.loading" class="loading-container">
          <el-icon class="is-loading" :size="40"><Loading /></el-icon>
          <p>加载项目中...</p>
        </div>
        <template v-else-if="project && project.id">
          <!-- 内置组件 -->
          <WorldSetting v-if="activeMenu === 'world'" />
          <WorldMap v-else-if="activeMenu === 'map'" />
          <Characters v-else-if="activeMenu === 'characters'" />
          <RelationshipGraph v-else-if="activeMenu === 'relationships'" />
          <Outline v-else-if="activeMenu === 'outline'" />
          <Chapters v-else-if="activeMenu === 'chapters'" />
          <SummaryManager v-else-if="activeMenu === 'summary'" />
          <MemoryTables v-else-if="activeMenu === 'memory'" />
          <TimelineEditor v-else-if="activeMenu === 'timeline'" />
          <QualityReport v-else-if="activeMenu === 'quality'" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { Promotion, User, Document, Reading, Setting, ArrowLeft, Loading, Memo, Connection, Clock, DataAnalysis, DocumentCopy, Location, Tools } from '@element-plus/icons-vue'
import { getAIMockEnabled } from '@/utils/devFlags'

// 懒加载组件 - 按需加载，优化首屏性能
const WorldSetting = defineAsyncComponent(() => import('@/components/WorldSetting.vue'))
const WorldMap = defineAsyncComponent(() => import('@/components/WorldMap.vue'))
const Characters = defineAsyncComponent(() => import('@/components/Characters.vue'))
const RelationshipGraph = defineAsyncComponent(() => import('@/components/RelationshipGraph.vue'))
const Outline = defineAsyncComponent(() => import('@/components/Outline.vue'))
const Chapters = defineAsyncComponent(() => import('@/components/Chapters.vue'))
const ProjectConfig = defineAsyncComponent(() => import('@/components/ProjectConfig.vue'))
const MemoryTables = defineAsyncComponent(() => import('@/components/MemoryTables.vue'))
const TimelineEditor = defineAsyncComponent(() => import('@/components/TimelineEditor.vue'))
const QualityReport = defineAsyncComponent(() => import('@/components/QualityReport.vue'))
const AIAssistant = defineAsyncComponent(() => import('@/components/AIAssistant.vue'))
const SummaryManager = defineAsyncComponent(() => import('@/components/SummaryManager.vue'))
const DeveloperPanel = defineAsyncComponent(() => import('@/components/DeveloperPanel.vue'))

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const pluginStore = usePluginStore()

const activeMenu = ref('world')
const isDev = import.meta.env.DEV
const isMockEnabled = ref(false)

const project = computed(() => projectStore.currentProject)

// 获取插件提供的菜单项
const pluginMenuItems = computed(() => {
  const items = pluginStore.getMenuItems()
  return items.filter(item => {
    // 如果有when条件，检查是否应该显示
    if (item.when) {
      try {
        return item.when()
      } catch (error) {
        console.error(`菜单项 ${item.id} 的 when 条件执行失败:`, error)
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
}

.main-content {
  background: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
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
</style>
