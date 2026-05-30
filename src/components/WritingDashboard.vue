<template>
  <div class="writing-dashboard">
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">写作仪表盘</p>
        <h1>{{ summary.title }}</h1>
        <p class="subtitle">集中查看项目进度、章节状态与最近写作动态。</p>
      </div>
      <div class="hero-actions">
        <el-button type="primary" size="large" round @click="emit('continue-writing')">
          <el-icon><CaretRight /></el-icon>一键续写
        </el-button>
        <el-button size="large" round @click="emit('open-sandbox')">
          <el-icon><MapLocation /></el-icon>设定沙盘
        </el-button>
      </div>
    </section>

    <el-alert
      v-if="!aiConfigured"
      title="尚未配置 AI 模型"
      description="请先在「配置」页面添加一个 AI 模型提供商（如 OpenAI、Anthropic、DeepSeek 等），才能使用 AI 生成、续写和审校功能。"
      type="warning"
      show-icon
      :closable="false"
      style="margin-bottom: var(--ds-space-4);"
    >
      <el-button type="primary" size="small" style="margin-top: 8px;" @click="emit('open-config')">前往配置</el-button>
    </el-alert>

    <!-- Pipeline 状态总览 -->
    <div class="pipeline-status-card">
      <div class="pipeline-status-row">
        <div class="pipeline-item">
          <div class="pipeline-dot" :class="aiConfigured ? 'dot-success' : 'dot-warning'"></div>
          <span class="pipeline-label">AI 模型</span>
          <el-tag size="small" :type="aiConfigured ? 'success' : 'warning'">{{ aiConfigured ? '已配置' : '未配置' }}</el-tag>
        </div>
        <div class="pipeline-item">
          <div class="pipeline-dot" :class="pipelineRunning ? 'dot-running' : 'dot-success'"></div>
          <span class="pipeline-label">Agent 流水线</span>
          <el-tag size="small" :type="pipelineRunning ? 'warning' : 'info'">{{ pipelineRunning ? '运行中' : enabledAgentCount + '/' + totalAgentCount + ' 已启用' }}</el-tag>
        </div>
        <div class="pipeline-item">
          <div class="pipeline-dot" :class="writeProgressDotClass"></div>
          <span class="pipeline-label">续写进度</span>
          <div class="pipeline-progress-wrap">
            <div class="pipeline-progress-bar">
              <div class="pipeline-progress-fill" :style="{ width: writeProgressPercent + '%' }"></div>
            </div>
            <span class="pipeline-progress-text">{{ summary.completedChapterCount }}/{{ summary.chapterCount }}</span>
          </div>
        </div>
        <div class="pipeline-item">
          <div class="pipeline-dot" :class="storageLevelClass"></div>
          <span class="pipeline-label">存储空间</span>
          <el-tag size="small" :type="storageLevelType">{{ storageText }}</el-tag>
        </div>
        <div class="pipeline-item pipeline-action">
          <el-button size="small" text type="primary" @click="emit('open-agents')">
            查看控制台
            <el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <el-row :gutter="16" class="metrics-row">
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">当前字数</div>
          <div class="metric-value">{{ formatNumber(summary.currentWords) }}</div>
          <div class="metric-foot">目标 {{ formatNumber(summary.targetWords) }} 字</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">完成进度</div>
          <div class="metric-value">{{ summary.progressPercent }}%</div>
          <el-progress :percentage="summary.progressPercent" :show-text="false" />
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">章节总数</div>
          <div class="metric-value">{{ summary.chapterCount }}</div>
          <div class="metric-foot">已修订/定稿 {{ summary.completedChapterCount }} 章</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="metric-card">
          <div class="metric-label">平均章长</div>
          <div class="metric-value">{{ formatNumber(summary.averageChapterWords) }}</div>
          <div class="metric-foot">字 / 章</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="dashboard-grid">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>章节状态</span>
              <el-tag type="info" size="small">{{ summary.chapterCount }} 章</el-tag>
            </div>
          </template>
          <div class="status-list">
            <div class="status-item">
              <span>草稿</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.draft)" :stroke-width="10" color="#909399" />
              <strong>{{ summary.statusCounts.draft }}</strong>
            </div>
            <div class="status-item">
              <span>已修订</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.revised)" :stroke-width="10" color="#e6a23c" />
              <strong>{{ summary.statusCounts.revised }}</strong>
            </div>
            <div class="status-item">
              <span>定稿</span>
              <el-progress :percentage="statusPercent(summary.statusCounts.final)" :stroke-width="10" color="#67c23a" />
              <strong>{{ summary.statusCounts.final }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>继续写作</span>
              <el-button text type="primary" @click="emit('continue-writing')">进入章节</el-button>
            </div>
          </template>
          <el-empty v-if="!summary.nextChapter" description="所有章节都已定稿" :image-size="80" />
          <div v-else class="next-chapter">
            <el-tag type="warning" size="small">下一章</el-tag>
            <h3>第{{ summary.nextChapter.number }}章 {{ summary.nextChapter.title }}</h3>
            <p>{{ getChapterPreview(summary.nextChapter) }}</p>
            <el-button type="primary" plain @click="emit('continue-writing')">继续写作</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 守护进程控制面板 -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span><el-icon><Monitor /></el-icon> 守护进程</span>
              <el-tag :type="daemonStatusType" size="small">{{ daemonStatusText }}</el-tag>
            </div>
          </template>
          <div class="daemon-panel">
            <div class="daemon-info">
              <div class="daemon-stat">
                <span class="daemon-stat-label">运行模式</span>
                <el-select v-model="daemonConfigRef.mode" size="small" style="width: 100px;" @change="onDaemonModeChange">
                  <el-option label="全自动" value="auto" />
                  <el-option label="半自动" value="semi" />
                  <el-option label="手动" value="manual" />
                </el-select>
              </div>
              <div class="daemon-stat">
                <span class="daemon-stat-label">今日章节</span>
                <span class="daemon-stat-value">{{ daemonStateRef.chaptersToday }} / {{ daemonConfigRef.maxChaptersPerDay }}</span>
              </div>
              <div class="daemon-stat">
                <span class="daemon-stat-label">今日Token</span>
                <span class="daemon-stat-value">{{ formatNumber(daemonStateRef.tokensToday) }}</span>
              </div>
              <div class="daemon-stat">
                <span class="daemon-stat-label">连续失败</span>
                <span class="daemon-stat-value" :class="{ 'text-danger': daemonStateRef.consecutiveFailures > 0 }">{{ daemonStateRef.consecutiveFailures }}</span>
              </div>
            </div>
            <div class="daemon-actions">
              <el-button
                v-if="daemonStateRef.status === 'idle' || daemonStateRef.status === 'stopped'"
                type="success" size="small" @click="startDaemon"
              >
                <el-icon><CaretRight /></el-icon> 启动
              </el-button>
              <el-button
                v-if="daemonStateRef.status === 'running'"
                type="warning" size="small" @click="pauseDaemon"
              >
                <el-icon><VideoPause /></el-icon> 暂停
              </el-button>
              <el-button
                v-if="daemonStateRef.status === 'paused'"
                type="success" size="small" @click="resumeDaemon"
              >
                <el-icon><CaretRight /></el-icon> 恢复
              </el-button>
              <el-button
                v-if="daemonStateRef.status === 'running' || daemonStateRef.status === 'paused'"
                type="danger" size="small" plain @click="stopDaemon"
              >
                <el-icon><CloseBold /></el-icon> 停止
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="dashboard-grid">
      <el-col :xs="24" :lg="8">
        <el-card shadow="never" class="dashboard-card">
          <template #header>
            <div class="card-header">
              <span>快捷操作</span>
            </div>
          </template>
          <div class="quick-actions">
            <el-button type="primary" @click="emit('continue-writing')">
              <el-icon><CaretRight /></el-icon>一键续写
            </el-button>
            <el-button plain @click="emit('create-chapter')">
              <el-icon><Plus /></el-icon>新建章节
            </el-button>
            <el-button type="warning" plain @click="emit('batch-generate')">
              <el-icon><Files /></el-icon>批量生成
            </el-button>
            <el-button plain @click="emit('open-chapters')">
              <el-icon><Reading /></el-icon>章节管理
            </el-button>
            <el-divider style="margin: 4px 0;" />
            <el-button plain @click="emit('open-sandbox')">
              <el-icon><MapLocation /></el-icon>设定沙盘
            </el-button>
            <el-button plain @click="emit('open-agents')">
              <el-icon><Connection /></el-icon>Agent 控制台
            </el-button>
            <el-button plain @click="emit('open-config')">
              <el-icon><Setting /></el-icon>模型配置
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="16">
        <el-card shadow="never" class="dashboard-card recent-card">
          <template #header>
            <div class="card-header">
              <span>最近章节</span>
              <span class="muted">按生成/更新时间排序</span>
            </div>
          </template>
          <el-empty v-if="summary.recentChapters.length === 0" description="暂无章节，先创建第一章吧">
            <el-button type="primary" @click="emit('create-chapter')">创建第一章</el-button>
          </el-empty>
          <div v-else class="recent-list">
            <div v-for="chapter in summary.recentChapters" :key="chapter.id" class="recent-item">
              <div>
                <div class="recent-title">第{{ chapter.number }}章 {{ chapter.title }}</div>
                <div class="recent-meta">
                  {{ formatNumber(chapter.wordCount) }} 字 · {{ formatDate(chapter.generationTime) }}
                </div>
              </div>
              <div class="recent-tags">
                <el-tag size="small" :type="getChapterStatusType(chapter.status)">{{ getChapterStatusText(chapter.status) }}</el-tag>
                <el-tag v-if="chapter.generatedBy === 'ai'" size="small" type="success">AI生成</el-tag>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted } from 'vue'
import type { Chapter } from '@/types'
import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { buildWritingDashboard, getDashboardChapterPreview } from '@/utils/writingDashboard'
import { formatNumber, formatDate, getChapterStatusText, getChapterStatusType } from '@/utils/formatters'
import { Plus, CaretRight, Files, Reading, MapLocation, Connection, Setting, ArrowRight, Monitor, VideoPause, CloseBold } from '@element-plus/icons-vue'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { ACTIVE_AGENT_ROLES } from '@/agents/types'
import { ElMessage } from 'element-plus'

const emit = defineEmits<{
  'open-chapters': []
  'create-chapter': []
  'continue-writing': []
  'batch-generate': []
  'open-config': []
  'open-sandbox': []
  'open-agents': []
}>()

const projectStore = useProjectStore()
const aiStore = useAIStore()
const summary = computed(() => buildWritingDashboard(projectStore.currentProject))
const aiConfigured = computed(() => {
  const config = projectStore.currentProject?.config || projectStore.globalConfig
  return !!(config?.providers && config.providers.length > 0 && config.providers.some((p: { isEnabled: boolean; models?: Array<{ isEnabled: boolean }> }) => p.isEnabled && p.models?.some((m: { isEnabled: boolean }) => m.isEnabled)))
})

const agentConfigs = computed(() =>
  normalizeProjectConfig(projectStore.currentProject?.config).agentConfigs ?? []
)
const enabledAgentCount = computed(() =>
  agentConfigs.value.filter(a => a.enabled && ACTIVE_AGENT_ROLES.includes(a.role)).length
)
const totalAgentCount = computed(() =>
  agentConfigs.value.filter(a => ACTIVE_AGENT_ROLES.includes(a.role)).length
)
const hasChapters = computed(() => summary.value.chapterCount > 0)
const pipelineRunning = computed(() => ((aiStore as unknown) as Record<string, unknown>).pipelineRunning as boolean || false)
const writeProgressPercent = computed(() => {
  if (summary.value.chapterCount === 0) return 0
  return Math.round((summary.value.completedChapterCount / summary.value.chapterCount) * 100)
})
const writeProgressDotClass = computed(() => {
  if (summary.value.chapterCount === 0) return 'dot-idle'
  if (writeProgressPercent.value >= 100) return 'dot-success'
  if (writeProgressPercent.value > 0) return 'dot-progress'
  return 'dot-idle'
})

// ========== 存储空间监控 ==========
const storageEstimate = ref<{ usageFormatted: string; quotaFormatted: string; usageRatio: number; level: string } | null>(null)
const storageText = computed(() => {
  if (!storageEstimate.value) return '检测中...'
  return `${storageEstimate.value.usageFormatted} / ${storageEstimate.value.quotaFormatted}`
})
const storageLevelClass = computed(() => {
  if (!storageEstimate.value) return 'dot-idle'
  if (storageEstimate.value.level === 'critical') return 'dot-warning'
  if (storageEstimate.value.level === 'warning') return 'dot-progress'
  return 'dot-success'
})
const storageLevelType = computed(() => {
  if (!storageEstimate.value) return 'info'
  if (storageEstimate.value.level === 'critical') return 'danger'
  if (storageEstimate.value.level === 'warning') return 'warning'
  return 'success'
})

onMounted(async () => {
  try {
    const { estimateStorageUsage } = await import('@/utils/storageEstimator')
    storageEstimate.value = await estimateStorageUsage()
  } catch { /* 静默 */ }
})

// ========== 守护进程控制面板 ==========
const daemonConfigRef = reactive({
  mode: 'manual' as 'auto' | 'semi' | 'manual',
  maxChaptersPerDay: 50,
})

const daemonStateRef = reactive({
  status: 'idle' as 'idle' | 'running' | 'paused' | 'stopped' | 'error',
  chaptersToday: 0,
  tokensToday: 0,
  consecutiveFailures: 0,
})

const daemonStatusType = computed(() => {
  switch (daemonStateRef.status) {
    case 'running': return 'success'
    case 'paused': return 'warning'
    case 'error': return 'danger'
    case 'stopped': return 'info'
    default: return 'info'
  }
})

const daemonStatusText = computed(() => {
  switch (daemonStateRef.status) {
    case 'running': return '运行中'
    case 'paused': return '已暂停'
    case 'error': return '异常'
    case 'stopped': return '已停止'
    default: return '空闲'
  }
})

function onDaemonModeChange(mode: string) {
  daemonConfigRef.mode = mode as 'auto' | 'semi' | 'manual'
  ElMessage.info(`守护进程模式已切换为: ${mode === 'auto' ? '全自动' : mode === 'semi' ? '半自动' : '手动'}`)
}

async function startDaemon() {
  try {
    const daemonService = (aiStore as Record<string, unknown>).getDaemonService
      ? ((aiStore as Record<string, unknown>).getDaemonService as () => { start: () => Promise<void>; pause: () => void; resume: () => void; stop: () => void } | null)()
      : null
    if (daemonService) {
      await daemonService.start()
      daemonStateRef.status = 'running'
      ElMessage.success('守护进程已启动')
    } else {
      ElMessage.warning('守护服务未初始化，请先配置AI模型')
    }
  } catch (e) {
    ElMessage.error('启动失败: ' + (e instanceof Error ? e.message : String(e)))
  }
}

function pauseDaemon() {
  try {
    const daemonService = (aiStore as Record<string, unknown>).getDaemonService
      ? ((aiStore as Record<string, unknown>).getDaemonService as () => { start: () => Promise<void>; pause: () => void; resume: () => void; stop: () => void } | null)()
      : null
    if (daemonService) {
      daemonService.pause()
      daemonStateRef.status = 'paused'
      ElMessage.info('守护进程已暂停')
    }
  } catch {
    ElMessage.error('暂停失败')
  }
}

function resumeDaemon() {
  try {
    const daemonService = (aiStore as Record<string, unknown>).getDaemonService
      ? ((aiStore as Record<string, unknown>).getDaemonService as () => { start: () => Promise<void>; pause: () => void; resume: () => void; stop: () => void } | null)()
      : null
    if (daemonService) {
      daemonService.resume()
      daemonStateRef.status = 'running'
      ElMessage.success('守护进程已恢复')
    }
  } catch {
    ElMessage.error('恢复失败')
  }
}

function stopDaemon() {
  try {
    const daemonService = (aiStore as Record<string, unknown>).getDaemonService
      ? ((aiStore as Record<string, unknown>).getDaemonService as () => { start: () => Promise<void>; pause: () => void; resume: () => void; stop: () => void } | null)()
      : null
    if (daemonService) {
      daemonService.stop()
      daemonStateRef.status = 'stopped'
      ElMessage.info('守护进程已停止')
    }
  } catch {
    ElMessage.error('停止失败')
  }
}

function statusPercent(count: number): number {
  if (summary.value.chapterCount === 0) return 0
  return Math.round((count / summary.value.chapterCount) * 100)
}

function getChapterPreview(chapter: Chapter): string {
  return getDashboardChapterPreview(chapter)
}
</script>

<style scoped>
.writing-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
}

.dashboard-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-5);
  padding: var(--ds-space-8);
  border-radius: var(--ds-radius-xl);
  background:
    linear-gradient(135deg, var(--ds-accent-subtle), transparent),
    var(--ds-surface);
  border: 1px solid var(--ds-surface-border);
  box-shadow: var(--ds-shadow-md);
}

.eyebrow {
  margin: 0 0 var(--ds-space-2);
  color: var(--ds-accent-text);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.dashboard-hero h1 {
  margin: 0;
  font-size: var(--ds-text-2xl);
  color: var(--ds-text-primary);
}

.subtitle,
.muted,
.metric-foot,
.recent-meta,
.next-chapter p {
  color: var(--ds-text-tertiary);
}

.subtitle {
  margin: var(--ds-space-2) 0 0;
}

.metrics-row,
.dashboard-grid {
  row-gap: var(--ds-space-4);
}

/* Pipeline 状态总览 */
.pipeline-status-card {
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-3) var(--ds-space-4);
  background: var(--ds-surface);
  position: relative;
  overflow: hidden;
}

.pipeline-status-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(to bottom, var(--ds-success), var(--ds-accent));
}

.pipeline-status-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-6);
  flex-wrap: wrap;
}

.pipeline-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

.pipeline-label {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
}

.pipeline-action {
  margin-left: auto;
}

.pipeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-success {
  background: var(--ds-success);
  box-shadow: 0 0 6px color-mix(in srgb, var(--ds-success) 40%, transparent);
}

.dot-warning {
  background: var(--ds-warning);
  animation: pulse 2s ease-in-out infinite;
}

.dot-idle {
  background: var(--ds-text-tertiary);
}

.dot-running {
  background: var(--ds-accent);
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 8px color-mix(in srgb, var(--ds-accent) 40%, transparent);
}

.dot-progress {
  background: var(--ds-info);
  box-shadow: 0 0 6px color-mix(in srgb, var(--ds-info) 40%, transparent);
}

/* 续写进度条 */
.pipeline-progress-wrap {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

.pipeline-progress-bar {
  width: 60px;
  height: 6px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-bg-tertiary);
  overflow: hidden;
}

.pipeline-progress-fill {
  height: 100%;
  border-radius: var(--ds-radius-full);
  background: linear-gradient(90deg, var(--ds-info), var(--ds-accent));
  transition: width var(--ds-transition-slow);
}

.pipeline-progress-text {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
}

.metric-card,
.dashboard-card {
  position: relative;
  height: 100%;
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
}

.metric-card::before,
.dashboard-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.metric-label {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
}

.metric-value {
  margin: var(--ds-space-2) 0;
  font-size: 30px;
  font-weight: 700;
  color: var(--ds-text-primary);
}

.card-header,
.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-3);
}

.status-list,
.quick-actions,
.recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
}

.status-item {
  display: grid;
  grid-template-columns: 56px 1fr 32px;
  align-items: center;
  gap: var(--ds-space-3);
}

.next-chapter h3 {
  margin: var(--ds-space-3) 0 var(--ds-space-2);
  color: var(--ds-text-primary);
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-2);
}

.quick-actions .el-button {
  justify-content: center;
  margin-left: 0;
}

.quick-actions .el-divider {
  grid-column: 1 / -1;
}

.hero-actions {
  display: flex;
  gap: var(--ds-space-3);
  flex-shrink: 0;
}

.recent-card {
  min-height: 240px;
}

.recent-item {
  padding: var(--ds-space-3) 0;
  border-bottom: 1px solid var(--ds-surface-border);
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-title {
  font-weight: 600;
  color: var(--ds-text-primary);
}

.recent-tags {
  display: flex;
  gap: var(--ds-space-2);
  flex-shrink: 0;
}

/* 守护进程面板样式 */
.daemon-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-3);
}

.daemon-info {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}

.daemon-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
}

.daemon-stat-label {
  color: var(--el-text-color-secondary);
}

.daemon-stat-value {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.daemon-stat-value.text-danger {
  color: var(--el-color-danger);
}

.daemon-actions {
  display: flex;
  gap: var(--ds-space-2);
  padding-top: var(--ds-space-1);
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .dashboard-hero,
  .recent-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-actions {
    flex-wrap: wrap;
  }

  .pipeline-status-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ds-space-3);
  }

  .pipeline-action {
    grid-column: 1 / -1;
    margin-left: 0;
  }

  .quick-actions {
    grid-template-columns: 1fr;
  }

  .metric-value {
    font-size: 22px;
  }
}
</style>
