<template>
  <main class="editor-main" :class="{ 'is-zen': isZenMode }">
    <el-button
      v-if="isZenMode"
      class="zen-exit-btn"
      type="primary"
      circle
      size="large"
      @click="$emit('update:isZenMode', false)"
      title="退出沉浸模式"
    >
      <el-icon><Expand /></el-icon>
    </el-button>

    <div v-if="loading" class="loading-container glass-panel">
      <el-icon class="is-loading" :size="40"><Loading /></el-icon>
      <p>加载项目中...</p>
    </div>
    <section v-else-if="project && project.id" class="workspace-surface">
      <ErrorBoundary name="WritingDashboard" :show-retry="true" :show-detail="false">
        <WritingDashboard
          v-if="activeMenu === 'dashboard'"
          @open-chapters="$emit('dashboardAction')"
          @create-chapter="$emit('dashboardAction')"
          @continue-writing="$emit('dashboardAction')"
          @batch-generate="$emit('dashboardAction')"
          @open-config="$emit('menuSelect', 'config')"
          @open-sandbox="$emit('menuSelect', 'sandbox')"
          @open-agents="$emit('menuSelect', 'agents')"
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
        <p>错误信息: {{ error || '项目数据为空' }}</p>
        <p>项目ID: {{ projectId }}</p>
        <p>项目状态: {{ project ? '存在但无ID' : '不存在' }}</p>
        <el-button type="primary" @click="$emit('goBack')">返回项目列表</el-button>
      </el-empty>
    </div>
  </main>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Expand, Loading } from '@element-plus/icons-vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

const WritingDashboard = defineAsyncComponent(() => import('@/components/WritingDashboard.vue'))
const SandboxLayout = defineAsyncComponent(() => import('@/components/Sandbox/SandboxLayout.vue'))
const Chapters = defineAsyncComponent(() => import('@/components/Chapters.vue'))
const ProjectConfig = defineAsyncComponent(() => import('@/components/ProjectConfig.vue'))
const QualityReport = defineAsyncComponent(() => import('@/components/QualityReport.vue'))
const TokenUsagePanel = defineAsyncComponent(() => import('@/components/TokenUsagePanel.vue'))
const SummaryManager = defineAsyncComponent(() => import('@/components/SummaryManager.vue'))
const DeveloperPanel = defineAsyncComponent(() => import('@/components/DeveloperPanel.vue'))
const AgentConsole = defineAsyncComponent(() => import('@/components/AgentConsole.vue'))

defineProps<{
  isZenMode: boolean
  loading: boolean
  error: string | null
  project: { id?: string } | null | undefined
  projectId: string
  activeMenu: string
}>()

defineEmits<{
  'update:isZenMode': [value: boolean]
  'menuSelect': [index: string]
  'dashboardAction': []
  'goBack': []
}>()
</script>

<style scoped>
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

/* breakpoint: lg (900px) */
@media (max-width: 900px) {
  .editor-main {
    padding: var(--ds-space-4);
  }
}
</style>
