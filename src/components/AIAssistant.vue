<template>
  <div class="ai-assistant">
    <div class="ai-float-button" @click="toggleChat">
      <el-badge :value="unreadCount" :hidden="unreadCount === 0">
        <el-icon :size="28">
          <ChatDotRound />
        </el-icon>
      </el-badge>
    </div>

    <el-drawer
      v-model="showChat"
      title="AI创作助手"
      direction="rtl"
      size="550px"
      :append-to-body="true"
    >
      <div class="chat-container">
        <AssistantShellTabs v-model="activeTab">
          <template #chat>
            <AssistantChatPanel
              ref="chatPanelRef"
              v-model:input="userInput"
              :messages="messages"
              :quick-commands="quickCommands"
              :is-typing="isTyping"
              @send="sendMessage"
              @clear="clearChat"
              @action="handleAction"
              @quick-command="sendQuickCommand"
            />
          </template>

          <template #suggestions>
            <AssistantSuggestionsPanel
              v-model:filter="suggestionFilter"
              :suggestions="filteredSuggestions"
              :selected-suggestions="selectedSuggestions"
              :format-time="formatTime"
              :get-type-tag-type="getTypeTagType"
              :get-type-label="getTypeLabel"
              :get-priority-tag-type="getPriorityTagType"
              :get-priority-label="getPriorityLabel"
              :get-status-label="getStatusLabel"
              @action="handleSuggestionAction"
              @mark-read="markSuggestionRead"
              @mark-adopted="markSuggestionAdopted"
              @mark-ignored="markSuggestionIgnored"
              @delete="deleteSuggestion"
              @batch-read="batchMarkRead"
              @batch-adopted="batchMarkAdopted"
              @batch-ignored="batchMarkIgnored"
            />
          </template>

          <template #statistics>
            <AssistantStatisticsPanel
              ref="statisticsPanelRef"
              :statistics="statistics"
              :high-priority-suggestions="highPrioritySuggestions"
              :format-time="formatTime"
            />
          </template>
        </AssistantShellTabs>
      </div>
    </el-drawer>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSuggestionsStore } from '@/stores/suggestions'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage, ElNotification } from 'element-plus'
import { ChatDotRound } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import type { Suggestion, SuggestionAction, SuggestionCategory, SuggestionPriority, SuggestionStatus } from '@/types/suggestions'
import type { AssistantAction, AssistantMessage } from '@/assistant/commands/assistantChat'
import {
  buildAssistantChatMessages,
  buildAssistantSystemPrompt,
  createInitialAssistantMessages,
  parseAssistantActionCommand,
  parseAssistantResponseActions,
} from '@/assistant/commands/assistantChat'
import AssistantChatPanel from '@/components/assistant/AssistantChatPanel.vue'
import AssistantShellTabs from '@/components/assistant/AssistantShellTabs.vue'
import AssistantStatisticsPanel from '@/components/assistant/AssistantStatisticsPanel.vue'
import AssistantSuggestionsPanel from '@/components/assistant/AssistantSuggestionsPanel.vue'
import { getLogger } from '@/utils/logger'

const logger = getLogger('components:AIAssistant')

const projectStore = useProjectStore()
const suggestionsStore = useSuggestionsStore()
const sandboxStore = useSandboxStore()
const project = computed(() => projectStore.currentProject)

const showChat = ref(false)
const activeTab = ref('chat')
const userInput = ref('')
const isTyping = ref(false)
const chatPanelRef = ref<InstanceType<typeof AssistantChatPanel> | null>(null)
const statisticsPanelRef = ref<InstanceType<typeof AssistantStatisticsPanel> | null>(null)

const suggestionFilter = ref<{
  status?: SuggestionStatus
  priority?: SuggestionPriority
  category?: SuggestionCategory
}>({})
const selectedSuggestions = ref<string[]>([])

let typeChart: echarts.ECharts | null = null
let priorityChart: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null
let pollingIntervalId: number | null = null

const messages = ref<AssistantMessage[]>([])

const quickCommands = computed<AssistantAction[]>(() => [
  { text: '总结设定', command: '请总结并梳理一下我们目前小说中的整体设定和世界观。' },
  { text: '优化世界观', command: '帮我审视一下目前的设定，指出有什么漏洞，并提供具体的优化建议。' },
  { text: '设计配角', command: '请根据目前的故事背景，帮我设计并创建一个有意思的新配角。' },
  { text: '推演剧情', command: '根据目前的主线和进度，推演一下接下来的剧情走向。' }
])

const unreadCount = computed(() => suggestionsStore.unreadCount)
const statistics = computed(() => suggestionsStore.statistics)
const filteredSuggestions = computed(() => suggestionsStore.filterSuggestions({
  ...(suggestionFilter.value.status ? { status: suggestionFilter.value.status } : {}),
  ...(suggestionFilter.value.priority ? { priority: suggestionFilter.value.priority } : {}),
  ...(suggestionFilter.value.category ? { category: suggestionFilter.value.category } : {}),
}))
const highPrioritySuggestions = computed(() => suggestionsStore.suggestions.filter(s => s.priority === 'high').slice(0, 5))

onMounted(() => {
  initMessages()
  suggestionsStore.init()
  setupEventListeners()
  startSuggestionPolling()
})

onUnmounted(() => {
  removeEventListeners()
  if (pollingIntervalId !== null) {
    clearInterval(pollingIntervalId)
    pollingIntervalId = null
  }
  disposeCharts()
})

watch(activeTab, (newTab) => {
  if (newTab === 'statistics') {
    nextTick(() => initCharts())
  }
})

function initMessages(): void {
  messages.value = createInitialAssistantMessages(project.value?.title)
}

function setupEventListeners(): void {
  window.addEventListener('chapter-save', handleChapterSave)
  window.addEventListener('character-update', handleCharacterUpdate)
  window.addEventListener('outline-change', handleOutlineChange)
}

function removeEventListeners(): void {
  window.removeEventListener('chapter-save', handleChapterSave)
  window.removeEventListener('character-update', handleCharacterUpdate)
  window.removeEventListener('outline-change', handleOutlineChange)
}

async function handleChapterSave(event: Event): Promise<void> {
  const customEvent = event as CustomEvent
  const { chapter } = customEvent.detail
  await suggestionsStore.triggerCheck('chapter_save', { chapter })

  if (chapter.wordCount > 0 && chapter.qualityScore && chapter.qualityScore < 7) {
    suggestionsStore.addSuggestion({
      type: 'improvement',
      category: 'quality',
      priority: chapter.qualityScore < 5 ? 'high' : 'medium',
      title: '章节质量待提升',
      message: `第${chapter.number}章质量评分为${chapter.qualityScore.toFixed(1)}，建议优化内容以提升质量。`,
      location: { chapter: chapter.number },
      actions: [
        { type: 'navigate', label: '查看章节', navigateTarget: `/chapters/${chapter.number}` }
      ]
    })
  }
}

async function handleCharacterUpdate(event: Event): Promise<void> {
  const customEvent = event as CustomEvent
  const { character } = customEvent.detail
  await suggestionsStore.triggerCheck('character_update', { character })
}

async function handleOutlineChange(event: Event): Promise<void> {
  const customEvent = event as CustomEvent
  const { outline } = customEvent.detail
  await suggestionsStore.triggerCheck('outline_change', { outline })
}

function startSuggestionPolling(): void {
  pollingIntervalId = window.setInterval(() => {
    const suggestion = suggestionsStore.getNextPendingSuggestion()
    if (suggestion && !suggestion.pushed) {
      showSuggestionNotification(suggestion)
      suggestionsStore.markAsPushed(suggestion.id)
    }
  }, 30000)
}

function showSuggestionNotification(suggestion: Suggestion): void {
  ElNotification({
    title: suggestion.title,
    message: suggestion.message,
    type: suggestion.priority === 'high' ? 'warning' : 'info',
    duration: 5000,
  })

  messages.value.push({
    role: 'assistant',
    content: `**建议**：${suggestion.title}\n\n${suggestion.message}`,
    actions: suggestion.actions?.map(action => ({
      text: action.label,
      command: action.type
    }))
  })
}

function toggleChat(): void {
  showChat.value = !showChat.value
  if (showChat.value) {
    suggestionsStore.updateActivity()
  }
}

async function sendMessage(): Promise<void> {
  const text = userInput.value.trim()
  if (!text) return

  messages.value.push({ role: 'user', content: text })
  userInput.value = ''

  await nextTick()
  scrollToBottom()
  void processCommand(text)
}

function addAssistantMessage(content: string, actions?: AssistantAction[]): void {
  messages.value.push({ role: 'assistant', content, actions })
}

async function processCommand(command: string): Promise<void> {
  isTyping.value = true

  try {
    const { routeAssistantInput } = await import('@/assistant/commands/inputRouter')
    const result = await routeAssistantInput(command, { messages: messages.value })

    if (result.type === 'command') {
      if (result.output) addAssistantMessage(result.output)
      return
    }

    if (result.type === 'error') {
      addAssistantMessage('执行命令失败：' + result.error)
      return
    }

    command = result.text

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.checkInitialized()) {
      addAssistantMessage('请先在配置中添加并启用 AI 模型提供商。')
      return
    }

    const systemPrompt = buildAssistantSystemPrompt(project.value, sandboxStore)
    const apiMessages = buildAssistantChatMessages(messages.value, command, systemPrompt)
    const context = { type: 'assistant' as const, complexity: 'medium' as const, priority: 'balanced' as const }
    const maxTokens = project.value?.config?.advancedSettings?.maxTokens || 4000
    const response = await aiStore.chat(apiMessages, context, { maxTokens })
    const parsedResponse = parseAssistantResponseActions(response.content)

    addAssistantMessage(parsedResponse.content, parsedResponse.actions)
  } catch (error) {
    logger.error('[AI助手] 失败:', error)
    addAssistantMessage('抱歉，处理时出现了错误：' + (error instanceof Error ? error.message : String(error)))
  } finally {
    isTyping.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function handleAction(action: AssistantAction): Promise<void> {
  if (action.command.startsWith('__sys_action:')) {
    const actionEnv = parseAssistantActionCommand(action.command)
    if (!actionEnv) {
      ElMessage.error('动作内容无效')
      return
    }

    try {
      const { executeAssistantAction } = await import('@/assistant/actions/executeAssistantAction')
      const success = await executeAssistantAction(actionEnv)

      if (success) {
        messages.value.push({ role: 'assistant', content: '✅ 已经成功执行动作！' })
        scrollToBottom()
      } else {
        ElMessage.error('执行动作失败')
      }
    } catch {
      ElMessage.error('执行动作失败')
    }
    return
  }

  void processCommand(action.command)
}

function sendQuickCommand(cmd: AssistantAction): void {
  messages.value.push({ role: 'user', content: cmd.text })
  void processCommand(cmd.command)
}

function clearChat(): void {
  initMessages()
}

function scrollToBottom(): void {
  const messagesEl = chatPanelRef.value?.messagesRef
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight
  }
}

function getTypeTagType(type: string): 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    improvement: 'success',
    issue: 'danger',
    question: 'info'
  }
  return types[type] || 'info'
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    improvement: '建议',
    issue: '问题',
    question: '询问'
  }
  return labels[type] || type
}

function getPriorityTagType(priority: string): 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return types[priority] || 'info'
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低'
  }
  return labels[priority] || priority
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    unread: '未读',
    read: '已读',
    adopted: '已采纳',
    ignored: '已忽略'
  }
  return labels[status] || status
}

function formatTime(date: Date): string {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`

  return `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function markSuggestionRead(id: string): void {
  suggestionsStore.markAsRead(id)
}

function markSuggestionAdopted(id: string): void {
  suggestionsStore.markAsAdopted(id)
}

function markSuggestionIgnored(id: string): void {
  suggestionsStore.markAsIgnored(id)
}

function deleteSuggestion(id: string): void {
  suggestionsStore.deleteSuggestion(id)
}

function handleSuggestionAction(suggestion: Suggestion, action: SuggestionAction): void {
  switch (action.type) {
    case 'navigate':
      if (action.navigateTarget) window.location.hash = action.navigateTarget
      break
    case 'auto_fix':
      if (action.autoFixCommand) void processCommand(action.autoFixCommand)
      break
    case 'dismiss':
      markSuggestionIgnored(suggestion.id)
      break
    case 'apply_fix':
    case 'generate':
    case 'view_detail':
      break
  }

  if (suggestion.status === 'unread') {
    suggestionsStore.markAsRead(suggestion.id)
  }
}

function batchMarkRead(): void {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'read')
  selectedSuggestions.value = []
}

function batchMarkAdopted(): void {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'adopted')
  selectedSuggestions.value = []
}

function batchMarkIgnored(): void {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'ignored')
  selectedSuggestions.value = []
}

function initCharts(): void {
  initTypeChart()
  initPriorityChart()
  initTrendChart()
}

function disposeCharts(): void {
  if (typeChart) typeChart.dispose()
  if (priorityChart) priorityChart.dispose()
  if (trendChart) trendChart.dispose()
  typeChart = null
  priorityChart = null
  trendChart = null
}

function initTypeChart(): void {
  const chartRef = statisticsPanelRef.value?.typeChartRef
  if (!chartRef) return

  if (typeChart) typeChart.dispose()
  typeChart = echarts.init(chartRef)
  typeChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [{
      name: '建议类型',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      labelLine: { show: false },
      data: [
        { value: statistics.value.byCategory.consistency, name: '一致性' },
        { value: statistics.value.byCategory.quality, name: '质量' },
        { value: statistics.value.byCategory.optimization, name: '优化' },
        { value: statistics.value.byCategory.problem, name: '问题' },
        { value: statistics.value.byCategory.reminder, name: '提醒' }
      ]
    }]
  })
}

function initPriorityChart(): void {
  const chartRef = statisticsPanelRef.value?.priorityChartRef
  if (!chartRef) return

  if (priorityChart) priorityChart.dispose()
  priorityChart = echarts.init(chartRef)
  priorityChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [{
      name: '优先级',
      type: 'pie',
      radius: '60%',
      data: [
        { value: statistics.value.byPriority.high, name: '高', itemStyle: { color: '#f56c6c' } },
        { value: statistics.value.byPriority.medium, name: '中', itemStyle: { color: '#e6a23c' } },
        { value: statistics.value.byPriority.low, name: '低', itemStyle: { color: '#409eff' } }
      ],
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
    }]
  })
}

function initTrendChart(): void {
  const chartRef = statisticsPanelRef.value?.trendChartRef
  if (!chartRef) return

  if (trendChart) trendChart.dispose()
  trendChart = echarts.init(chartRef)
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ['6天前', '5天前', '4天前', '3天前', '2天前', '昨天', '今天'] },
    yAxis: { type: 'value' },
    series: [{
      name: '采纳数',
      type: 'line',
      data: statistics.value.adoptionTrend,
      smooth: true,
      itemStyle: { color: '#67c23a' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
          ]
        }
      }
    }]
  })
}
</script>

<style scoped>
.ai-assistant {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 9999;
}

.ai-float-button {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s;
}

.ai-float-button:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.6);
}

.ai-float-button .el-icon {
  color: white;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
}

:deep(.chat-tabs) {
  height: 100%;
}

:deep(.chat-tabs .el-tabs__content) {
  height: calc(100% - 50px);
  overflow: hidden;
}

:deep(.chat-tabs .el-tab-pane) {
  height: 100%;
}
</style>
