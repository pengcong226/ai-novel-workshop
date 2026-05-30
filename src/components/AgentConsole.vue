<template>
  <div class="agent-console">
    <el-card class="console-card" :body-style="{ padding: '0' }">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="header-title">Agent 控制台</span>
            <el-tag size="small" :type="anyAgentRunning ? 'warning' : 'info'">
              {{ anyAgentRunning ? '运行中' : '就绪' }}
            </el-tag>
          </div>
          <div class="header-actions">
            <el-button
              size="small"
              :type="allAgentsEnabled ? 'warning' : 'success'"
              plain
              @click="toggleAllAgents"
            >
              {{ allAgentsEnabled ? '全部禁用' : '全部启用' }}
            </el-button>
          </div>
        </div>
      </template>

      <div class="console-body">
        <el-alert type="info" :closable="false" show-icon class="console-alert">
          <template #title>多 Agent 协作写作控制台</template>
          <div>可单独运行各个Agent，或通过下方快捷操作批量执行。生成前可运行规划师，生成后可按优先级运行哨兵、编辑审校、读者反馈和抽取器。</div>
        </el-alert>

        <!-- Agent Cards Grid -->
        <div class="agent-grid">
          <el-card
            v-for="agent in agentConfigs"
            :key="agent.role"
            shadow="never"
            class="agent-card"
            :class="{ running: agentRunningMap[agent.role] }"
          >
            <div class="agent-header">
              <div class="agent-title-row">
                <span class="agent-icon"><el-icon><component :is="agentIconMap[agent.role]" /></el-icon></span>
                <span class="agent-name">{{ agentLabels[agent.role] }}</span>
              </div>
              <el-switch
                v-model="agent.enabled"
                size="small"
                @change="onToggleAgent(agent)"
              />
            </div>

            <div class="agent-meta">
              <div class="meta-item">
                <span class="meta-label">阶段</span>
                <span class="meta-value">{{ phaseLabels[agent.phase] }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">优先级</span>
                <span class="meta-value">{{ agent.priority }}</span>
              </div>
              <div v-if="agent.batchOnly" class="meta-item">
                <span class="meta-label">模式</span>
                <el-tag size="small" type="warning">仅批量</el-tag>
              </div>
              <div v-if="agent.model" class="meta-item">
                <span class="meta-label">模型</span>
                <span class="meta-value model-name">{{ agent.model }}</span>
              </div>
            </div>

            <div class="agent-actions">
              <el-button
                size="small"
                type="primary"
                plain
                :disabled="!agent.enabled || agentRunningMap[agent.role] || !hasProject"
                :loading="agentRunningMap[agent.role]"
                @click="runSingleAgent(agent.role)"
              >
                单独运行
              </el-button>
              <el-button
                size="small"
                plain
                :disabled="!hasProject"
                @click="configureAgent(agent.role)"
              >
                配置
              </el-button>
            </div>
          </el-card>
        </div>

        <!-- Batch Actions -->
        <div class="batch-section">
          <div class="batch-title">快捷操作</div>
          <div class="batch-actions">
            <el-button
              type="primary"
              :disabled="!canRunPreGeneration || anyAgentRunning"
              :loading="preGenRunning"
              @click="runPhaseAgents('pre-generation')"
            >
              <el-icon><CaretRight /></el-icon>
              运行生成前 Agent
            </el-button>
            <el-button
              type="success"
              :disabled="!canRunPostGeneration || anyAgentRunning"
              :loading="postGenRunning"
              @click="runPhaseAgents('post-generation')"
            >
              <el-icon><CaretRight /></el-icon>
              运行生成后 Agent
            </el-button>
            <el-button
              :disabled="!anyAgentRunning"
              type="danger"
              plain
              @click="stopAllAgents"
            >
              <el-icon><CloseBold /></el-icon>
              停止全部
            </el-button>
          </div>
        </div>

        <!-- Execution Log -->
        <div v-if="executionLog.length > 0" class="log-section">
          <div class="log-header">
            <span class="log-title">执行日志</span>
            <el-button text size="small" @click="clearLog">清空</el-button>
          </div>
          <div class="log-list">
            <div
              v-for="(entry, idx) in executionLog"
              :key="idx"
              class="log-entry"
              :class="'log-' + entry.status"
            >
              <span class="log-time">{{ entry.time }}</span>
              <span class="log-role">{{ agentLabels[entry.role] }}</span>
              <span class="log-status">
                <el-icon v-if="entry.status === 'success'" class="status-icon success"><Select /></el-icon>
                <el-icon v-else-if="entry.status === 'failed'" class="status-icon failed"><CloseBold /></el-icon>
                <el-icon v-else-if="entry.status === 'running'" class="status-icon running"><Loading /></el-icon>
              </span>
              <span v-if="entry.status === 'success'" class="log-badge log-badge-success">完成</span>
              <span v-else-if="entry.status === 'failed'" class="log-badge log-badge-failed">失败</span>
              <span v-else-if="entry.status === 'running'" class="log-badge log-badge-running">执行中</span>
              <span class="log-message">{{ entry.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useProjectStore } from '@/stores/project'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { ElMessage } from 'element-plus'
import { CaretRight, CloseBold, Select, Loading, Compass, EditPen, View, Filter, Document, Management, Connection } from '@element-plus/icons-vue'
import type { AgentPhase, AgentRole, AgentConfig } from '@/agents/types'
import { ACTIVE_AGENT_ROLES } from '@/agents/types'
import { getLogger } from '@/utils/logger'
import { getFriendlyMessage } from '@/utils/errorHandler'

const logger = getLogger('components:AgentConsole')
const projectStore = useProjectStore()

const agentLabels: Partial<Record<AgentRole, string>> = {
  planner: '规划师',
  writer: '写手',
  sentinel: '哨兵',
  extractor: '抽取器',
  editor: '编辑审校',
  reader: '读者反馈',
  composer: '作曲',
  auditor: '审计',
  reviser: '修订',
  normalizer: '标准化',
}

const agentIconMap: Partial<Record<AgentRole, any>> = {
  planner: Compass,
  writer: EditPen,
  sentinel: View,
  extractor: Filter,
  editor: Document,
  reader: Management,
  composer: Connection,
  auditor: Select,
  reviser: EditPen,
  normalizer: Filter,
}

const phaseLabels: Partial<Record<AgentPhase, string>> = {
  'pre-generation': '生成前',
  generation: '生成中',
  'post-generation': '生成后',
  composition: '构思',
  audit: '审计',
  revise: '修订',
  settlement: '结算',
}

interface LogEntry {
  time: string
  role: AgentRole
  status: 'running' | 'success' | 'failed'
  message: string
}

const executionLog = ref<LogEntry[]>([])
const agentRunningMap = reactive<Record<string, boolean>>({})
const preGenRunning = ref(false)
const postGenRunning = ref(false)

const hasProject = computed(() => !!projectStore.currentProject)

const agentConfigs = computed<AgentConfig[]>(() =>
  normalizeProjectConfig(projectStore.currentProject?.config).agentConfigs ?? []
)

const anyAgentRunning = computed(() =>
  Object.values(agentRunningMap).some(Boolean) || preGenRunning.value || postGenRunning.value
)

const allAgentsEnabled = computed(() =>
  agentConfigs.value.length > 0 && agentConfigs.value.every(a => a.enabled)
)

const enabledAgents = computed(() =>
  agentConfigs.value.filter(a => a.enabled && ACTIVE_AGENT_ROLES.includes(a.role))
)

const canRunPreGeneration = computed(() =>
  hasProject.value && enabledAgents.value.some(a => a.phase === 'pre-generation')
)

const canRunPostGeneration = computed(() =>
  hasProject.value && enabledAgents.value.some(a => a.phase === 'post-generation')
)

function formatTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function addLog(role: AgentRole, status: LogEntry['status'], message: string) {
  executionLog.value.unshift({ time: formatTime(), role, status, message })
  // Keep log size manageable
  if (executionLog.value.length > 50) {
    executionLog.value = executionLog.value.slice(0, 50)
  }
}

async function onToggleAgent(agent: AgentConfig) {
  if (!projectStore.currentProject) return
  const config = projectStore.currentProject.config
  if (!config.agentConfigs) return

  const target = config.agentConfigs.find(a => a.role === agent.role)
  if (target) {
    target.enabled = agent.enabled
    await projectStore.saveCurrentProject()
    ElMessage.success(`${agentLabels[agent.role]}已${agent.enabled ? '启用' : '禁用'}`)
  }
}

async function toggleAllAgents() {
  if (!projectStore.currentProject) return
  const config = projectStore.currentProject.config
  if (!config.agentConfigs) return

  const nextEnabled = !allAgentsEnabled.value
  for (const agent of config.agentConfigs) {
    if (ACTIVE_AGENT_ROLES.includes(agent.role)) {
      agent.enabled = nextEnabled
    }
  }
  await projectStore.saveCurrentProject()
  ElMessage.success(nextEnabled ? '已启用全部Agent' : '已禁用全部Agent')
}

async function runSingleAgent(role: AgentRole) {
  if (!projectStore.currentProject) return
  agentRunningMap[role] = true
  addLog(role, 'running', '开始执行...')

  try {
    // Simulate agent execution (actual execution depends on AI service integration)
    await new Promise(resolve => setTimeout(resolve, 1500))
    addLog(role, 'success', '执行完成')
    ElMessage.success(`${agentLabels[role]}执行完成`)
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : '执行失败'
    const friendlyMsg = getFriendlyMessage(rawMsg)
    addLog(role, 'failed', friendlyMsg)
    ElMessage.error({ message: `${agentLabels[role]}执行失败：${friendlyMsg}`, duration: 5000 })
    logger.error(`Agent ${role} execution failed:`, error)
  } finally {
    agentRunningMap[role] = false
  }
}

async function runPhaseAgents(phase: AgentPhase) {
  const phaseAgentConfigs = enabledAgents.value.filter(a => a.phase === phase)
  if (phaseAgentConfigs.length === 0) {
    ElMessage.warning(`没有已启用的${phaseLabels[phase]}阶段Agent`)
    return
  }

  if (phase === 'pre-generation') preGenRunning.value = true
  else postGenRunning.value = true

  // Sort by priority
  const sorted = [...phaseAgentConfigs].sort((a, b) => a.priority - b.priority)

  for (const agent of sorted) {
    agentRunningMap[agent.role] = true
    addLog(agent.role, 'running', `${phaseLabels[phase]}阶段开始执行...`)
  }

  try {
    // Simulate batch execution
    await new Promise(resolve => setTimeout(resolve, 2000))

    for (const agent of sorted) {
      addLog(agent.role, 'success', '执行完成')
      agentRunningMap[agent.role] = false
    }
    ElMessage.success(`${phaseLabels[phase]}阶段Agent全部执行完成`)
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : '执行失败'
    const friendlyMsg = getFriendlyMessage(rawMsg)
    for (const agent of sorted) {
      addLog(agent.role, 'failed', friendlyMsg)
      agentRunningMap[agent.role] = false
    }
    logger.error(`Phase ${phase} agents execution failed:`, error)
  } finally {
    if (phase === 'pre-generation') preGenRunning.value = false
    else postGenRunning.value = false
  }
}

function stopAllAgents() {
  for (const key of Object.keys(agentRunningMap)) {
    agentRunningMap[key] = false
  }
  preGenRunning.value = false
  postGenRunning.value = false
  ElMessage.info('已停止全部Agent')
}

function configureAgent(role: AgentRole) {
  ElMessage.info(`配置${agentLabels[role]} - 请前往项目配置页面`)
}

function clearLog() {
  executionLog.value = []
}
</script>

<style scoped>
.agent-console {
  max-width: 1100px;
  margin: 0 auto;
}

.console-card {
  border-radius: var(--ds-radius-lg);
  border: 1px solid var(--ds-surface-border);
  background: var(--ds-surface);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-4) var(--ds-space-5);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

.header-title {
  font-size: var(--ds-text-lg);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.header-actions {
  display: flex;
  gap: var(--ds-space-2);
}

.console-body {
  padding: var(--ds-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
}

.console-alert {
  border-radius: var(--ds-radius-md);
}

/* Agent Grid */
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--ds-space-4);
}

.agent-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-surface-border);
  background: var(--ds-bg-primary);
  transition: all var(--ds-transition-normal);
}

.agent-card:hover {
  border-color: var(--ds-accent);
  box-shadow: var(--ds-shadow-md);
}

.agent-card.running {
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 1px var(--ds-accent), var(--ds-shadow-glow);
}

.agent-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
  opacity: 0;
  transition: opacity var(--ds-transition-fast);
}

.agent-card.running::before {
  opacity: 1;
  background: var(--ds-accent);
  animation: pulse-bar 1.5s ease-in-out infinite;
}

@keyframes pulse-bar {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ds-space-3);
}

.agent-title-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
}

.agent-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-accent-subtle);
  color: var(--ds-accent-text);
  flex-shrink: 0;
}

.agent-icon .el-icon {
  font-size: 16px;
}

.agent-name {
  font-weight: 600;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
}

.agent-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ds-space-2);
  margin-bottom: var(--ds-space-4);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-1);
  font-size: var(--ds-text-xs);
}

.meta-label {
  color: var(--ds-text-tertiary);
}

.meta-value {
  color: var(--ds-text-secondary);
}

.model-name {
  font-family: var(--ds-font-mono);
  font-size: 11px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-actions {
  display: flex;
  gap: var(--ds-space-2);
}

/* Batch Section */
.batch-section {
  padding: var(--ds-space-4);
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}

.batch-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-bottom: var(--ds-space-3);
}

.batch-actions {
  display: flex;
  gap: var(--ds-space-3);
  flex-wrap: wrap;
}

/* Log Section */
.log-section {
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-3) var(--ds-space-4);
  background: var(--ds-bg-primary);
  border-bottom: 1px solid var(--ds-surface-border);
}

.log-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.log-list {
  max-height: 200px;
  overflow-y: auto;
  padding: var(--ds-space-2);
}

.log-entry {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-1) var(--ds-space-2);
  font-size: var(--ds-text-xs);
  border-radius: var(--ds-radius-sm);
}

.log-entry:hover {
  background: var(--ds-bg-hover);
}

.log-time {
  color: var(--ds-text-tertiary);
  font-family: var(--ds-font-mono);
  flex-shrink: 0;
}

.log-role {
  color: var(--ds-text-secondary);
  font-weight: 500;
  min-width: 56px;
  flex-shrink: 0;
}

.log-status {
  flex-shrink: 0;
}

.status-icon.success {
  color: var(--ds-success);
}

.status-icon.failed {
  color: var(--ds-danger);
}

.status-icon.running {
  color: var(--ds-accent);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.log-message {
  color: var(--ds-text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-success .log-message {
  color: var(--ds-success);
}

.log-failed .log-message {
  color: var(--ds-danger);
}

.log-running .log-message {
  color: var(--ds-accent);
}

.log-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--ds-radius-full);
  flex-shrink: 0;
}

.log-badge-success {
  background: color-mix(in srgb, var(--ds-success) 14%, transparent);
  color: var(--ds-success);
}

.log-badge-failed {
  background: color-mix(in srgb, var(--ds-danger) 14%, transparent);
  color: var(--ds-danger);
}

.log-badge-running {
  background: color-mix(in srgb, var(--ds-accent) 14%, transparent);
  color: var(--ds-accent);
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .agent-grid {
    grid-template-columns: 1fr;
  }

  .batch-actions {
    flex-direction: column;
  }

  .batch-actions .el-button {
    width: 100%;
  }

  .agent-meta {
    grid-template-columns: 1fr;
  }

  .agent-card {
    padding: var(--ds-space-3);
  }
}
</style>
