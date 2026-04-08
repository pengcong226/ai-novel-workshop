<template>
  <div class="ai-assistant">
    <!-- AI助手浮动按钮 -->
    <div class="ai-float-button" @click="toggleChat">
      <el-badge :value="unreadCount" :hidden="unreadCount === 0">
        <el-icon :size="28">
          <ChatDotRound />
        </el-icon>
      </el-badge>
    </div>

    <!-- AI对话窗口 -->
    <el-drawer
      v-model="showChat"
      title="AI创作助手"
      direction="rtl"
      size="550px"
      :append-to-body="true"
    >
      <div class="chat-container">
        <!-- 标签页 -->
        <el-tabs v-model="activeTab" class="chat-tabs">
          <!-- 对话标签页 -->
          <el-tab-pane label="对话" name="chat">
            <!-- 消息列表 -->
            <div class="messages" ref="messagesRef">
              <div
                v-for="(msg, index) in messages"
                :key="index"
                :class="['message', msg.role]"
              >
                <div class="message-avatar">
                  <el-avatar :size="32" v-if="msg.role === 'assistant'">AI</el-avatar>
                  <el-avatar :size="32" v-else>我</el-avatar>
                </div>
                <div class="message-content">
                  <div class="message-text" v-html="formatMessage(msg.content)"></div>
                  <div v-if="msg.actions" class="message-actions">
                    <el-button
                      v-for="action in msg.actions"
                      :key="action.text"
                      size="small"
                      @click="handleAction(action)"
                    >
                      {{ action.text }}
                    </el-button>
                  </div>
                </div>
              </div>

              <div v-if="isTyping" class="message assistant">
                <div class="message-avatar">
                  <el-avatar :size="32">AI</el-avatar>
                </div>
                <div class="message-content">
                  <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 快捷指令 -->
            <div class="quick-actions">
              <el-button
                v-for="cmd in quickCommands"
                :key="cmd.text"
                size="small"
                @click="sendQuickCommand(cmd)"
              >
                {{ cmd.text }}
              </el-button>
            </div>

            <!-- 输入框 -->
            <div class="input-area">
              <el-input
                v-model="userInput"
                placeholder="描述你想要的设定，AI会帮你实现..."
                type="textarea"
                :rows="3"
                @keydown.enter.ctrl="sendMessage"
              />
              <div class="input-actions">
                <el-button @click="clearChat" text>清空对话</el-button>
                <el-button type="primary" @click="sendMessage" :loading="isTyping">
                  发送
                </el-button>
              </div>
            </div>
          </el-tab-pane>

          <!-- 建议标签页 -->
          <el-tab-pane label="建议" name="suggestions">
            <div class="suggestions-panel">
              <!-- 过滤器 -->
              <div class="suggestions-filter">
                <el-select v-model="suggestionFilter.status" placeholder="状态" size="small" clearable>
                  <el-option label="未读" value="unread" />
                  <el-option label="已读" value="read" />
                  <el-option label="已采纳" value="adopted" />
                  <el-option label="已忽略" value="ignored" />
                </el-select>
                <el-select v-model="suggestionFilter.priority" placeholder="优先级" size="small" clearable>
                  <el-option label="高" value="high" />
                  <el-option label="中" value="medium" />
                  <el-option label="低" value="low" />
                </el-select>
                <el-select v-model="suggestionFilter.category" placeholder="类型" size="small" clearable>
                  <el-option label="一致性" value="consistency" />
                  <el-option label="质量" value="quality" />
                  <el-option label="优化" value="optimization" />
                  <el-option label="问题" value="problem" />
                  <el-option label="提醒" value="reminder" />
                </el-select>
              </div>

              <!-- 建议列表 -->
              <div class="suggestions-list">
                <el-empty v-if="filteredSuggestions.length === 0" description="暂无建议" />

                <el-card
                  v-for="suggestion in filteredSuggestions"
                  :key="suggestion.id"
                  class="suggestion-card"
                  :class="[`priority-${suggestion.priority}`, `status-${suggestion.status}`]"
                  shadow="hover"
                >
                  <div class="suggestion-header">
                    <div class="suggestion-title">
                      <el-tag :type="getTypeTagType(suggestion.type)" size="small">
                        {{ getTypeLabel(suggestion.type) }}
                      </el-tag>
                      <el-tag :type="getPriorityTagType(suggestion.priority)" size="small">
                        {{ getPriorityLabel(suggestion.priority) }}
                      </el-tag>
                      <span class="title-text">{{ suggestion.title }}</span>
                    </div>
                    <el-dropdown trigger="click">
                      <el-icon class="more-icon"><MoreFilled /></el-icon>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="markSuggestionRead(suggestion.id)">
                            标记已读
                          </el-dropdown-item>
                          <el-dropdown-item @click="markSuggestionAdopted(suggestion.id)">
                            标记已采纳
                          </el-dropdown-item>
                          <el-dropdown-item @click="markSuggestionIgnored(suggestion.id)">
                            忽略
                          </el-dropdown-item>
                          <el-dropdown-item divided @click="deleteSuggestion(suggestion.id)">
                            删除
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>

                  <div class="suggestion-message">
                    {{ suggestion.message }}
                  </div>

                  <div v-if="suggestion.location.chapter" class="suggestion-location">
                    <el-tag size="small" type="info">
                      第{{ suggestion.location.chapter }}章
                    </el-tag>
                  </div>

                  <div v-if="suggestion.actions && suggestion.actions.length > 0" class="suggestion-actions">
                    <el-button
                      v-for="action in suggestion.actions"
                      :key="action.type"
                      size="small"
                      :type="action.type === 'auto_fix' ? 'primary' : 'default'"
                      @click="handleSuggestionAction(suggestion, action)"
                    >
                      {{ action.label }}
                    </el-button>
                  </div>

                  <div class="suggestion-footer">
                    <span class="suggestion-time">{{ formatTime(suggestion.createdAt) }}</span>
                    <span class="suggestion-status">{{ getStatusLabel(suggestion.status) }}</span>
                  </div>
                </el-card>
              </div>

              <!-- 批量操作 -->
              <div v-if="selectedSuggestions.length > 0" class="batch-actions">
                <span>已选 {{ selectedSuggestions.length }} 项</span>
                <el-button size="small" @click="batchMarkRead">标记已读</el-button>
                <el-button size="small" type="primary" @click="batchMarkAdopted">标记已采纳</el-button>
                <el-button size="small" type="info" @click="batchMarkIgnored">忽略</el-button>
              </div>
            </div>
          </el-tab-pane>

          <!-- 统计标签页 -->
          <el-tab-pane label="统计" name="statistics">
            <div class="statistics-panel">
              <!-- 概览 -->
              <el-row :gutter="16" class="stats-overview">
                <el-col :span="6">
                  <el-statistic title="总建议数" :value="statistics.total" />
                </el-col>
                <el-col :span="6">
                  <el-statistic title="未处理" :value="statistics.byStatus.unread" />
                </el-col>
                <el-col :span="6">
                  <el-statistic title="已采纳" :value="statistics.byStatus.adopted" />
                </el-col>
                <el-col :span="6">
                  <el-statistic title="采纳率" :value="statistics.adoptionRate" suffix="%" />
                </el-col>
              </el-row>

              <!-- 类型分布 -->
              <el-card class="stats-card" shadow="never">
                <template #header>
                  <span>建议类型分布</span>
                </template>
                <div ref="typeChartRef" class="chart-container"></div>
              </el-card>

              <!-- 优先级分布 -->
              <el-card class="stats-card" shadow="never">
                <template #header>
                  <span>优先级分布</span>
                </template>
                <div ref="priorityChartRef" class="chart-container"></div>
              </el-card>

              <!-- 采纳趋势 -->
              <el-card class="stats-card" shadow="never">
                <template #header>
                  <span>近7天采纳趋势</span>
                </template>
                <div ref="trendChartRef" class="chart-container"></div>
              </el-card>

              <!-- 高优先级建议 -->
              <el-card class="stats-card" shadow="never">
                <template #header>
                  <span>高优先级建议</span>
                </template>
                <el-timeline>
                  <el-timeline-item
                    v-for="s in highPrioritySuggestions"
                    :key="s.id"
                    :type="s.status === 'adopted' ? 'success' : s.status === 'ignored' ? 'info' : 'danger'"
                  >
                    <div class="timeline-suggestion">
                      <div class="timeline-title">{{ s.title }}</div>
                      <div class="timeline-message">{{ s.message }}</div>
                      <div class="timeline-time">{{ formatTime(s.createdAt) }}</div>
                    </div>
                  </el-timeline-item>
                </el-timeline>
                <el-empty v-if="highPrioritySuggestions.length === 0" description="暂无高优先级建议" />
              </el-card>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 主动建议通知 -->
    <el-notification
      v-if="showNotification"
      :title="notificationTitle"
      :message="notificationMessage"
      :type="notificationType"
      :duration="5000"
      @close="closeNotification"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSuggestionsStore } from '@/stores/suggestions'
import { ElMessage, ElNotification } from 'element-plus'
import { ChatDotRound, MoreFilled } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import DOMPurify from 'dompurify'
import type { Suggestion, SuggestionStatus, SuggestionAction } from '@/types/suggestions'

const projectStore = useProjectStore()
const suggestionsStore = useSuggestionsStore()
const project = computed(() => projectStore.currentProject)

const showChat = ref(false)
const activeTab = ref('chat')
const userInput = ref('')
const isTyping = ref(false)
const messagesRef = ref<HTMLElement | null>(null)

// 建议相关
const suggestionFilter = ref<{
  status?: SuggestionStatus
  priority?: string
  category?: string
}>({})
const selectedSuggestions = ref<string[]>([])

// 图表引用
const typeChartRef = ref<HTMLElement | null>(null)
const priorityChartRef = ref<HTMLElement |HTMLElement | null>(null)
const trendChartRef = ref<HTMLElement | null>(null)
let typeChart: echarts.ECharts | null = null
let priorityChart: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null

// 通知相关
const showNotification = ref(false)
const notificationTitle = ref('')
const notificationMessage = ref('')
const notificationType = ref<'success' | 'warning' | 'info' | 'error'>('info')

// 计算属性
const unreadCount = computed(() => suggestionsStore.unreadCount)

const statistics = computed(() => suggestionsStore.statistics)

const filteredSuggestions = computed(() => {
  const filter: any = {}
  if (suggestionFilter.value.status) filter.status = suggestionFilter.value.status
  if (suggestionFilter.value.priority) filter.priority = suggestionFilter.value.priority
  if (suggestionFilter.value.category) filter.category = suggestionFilter.value.category
  return suggestionsStore.filterSuggestions(filter)
})

const highPrioritySuggestions = computed(() =>
  suggestionsStore.suggestions
    .filter(s => s.priority === 'high')
    .slice(0, 5)
)

interface Action {
  text: string
  command: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  actions?: Action[]
}

const messages = ref<Message[]>([])

const quickCommands = computed(() => {
  const commands = [
    { text: '总结设定', command: '请总结并梳理一下我们目前小说中的整体设定和世界观。' },
    { text: '优化世界观', command: '帮我审视一下目前的设定，指出有什么漏洞，并提供具体的优化建议。' },
    { text: '设计配角', command: '请根据目前的故事背景，帮我设计并创建一个有意思的新配角。' },
    { text: '推演剧情', command: '根据目前的主线和进度，推演一下接下来的剧情走向。' }
  ]
  return commands
})

// 初始化
onMounted(() => {
  initMessages()
  suggestionsStore.init()
  setupEventListeners()
  startSuggestionPolling()
})

onUnmounted(() => {
  removeEventListeners()
  if (typeChart) typeChart.dispose()
  if (priorityChart) priorityChart.dispose()
  if (trendChart) trendChart.dispose()
})

// 监听标签页切换
watch(activeTab, (newTab) => {
  if (newTab === 'statistics') {
    nextTick(() => {
      initCharts()
    })
  }
})

function initMessages() {
  messages.value = [
    {
      role: 'assistant',
      content: `你好！我是AI创作助手。我了解你的项目《${project.value?.title || '未命名'}》，可以帮你：\n\n` +
        '**设定世界观** - 描述你想要的世界，我来创建\n' +
        '**设计人物** - 告诉我角色特点，我来完善\n' +
        '**规划大纲** - 说明故事走向，我来生成\n' +
        '**调整配置** - 解释设置项，优化参数\n\n' +
        '直接告诉我你想做什么，我会帮你实现！',
      actions: [
        { text: '查看当前设定', command: '查看当前设定' }
      ]
    }
  ]
}

// 设置事件监听
function setupEventListeners() {
  // 监听章节保存事件
  window.addEventListener('chapter-save', handleChapterSave as EventListener)
  // 监听人物更新事件
  window.addEventListener('character-update', handleCharacterUpdate as EventListener)
  // 监听大纲变更事件
  window.addEventListener('outline-change', handleOutlineChange as EventListener)
}

function removeEventListeners() {
  window.removeEventListener('chapter-save', handleChapterSave as EventListener)
  window.removeEventListener('character-update', handleCharacterUpdate as EventListener)
  window.removeEventListener('outline-change', handleOutlineChange as EventListener)
}

// 事件处理器
async function handleChapterSave(event: Event) {
  const customEvent = event as CustomEvent
  const { chapter } = customEvent.detail
  await suggestionsStore.triggerCheck('chapter_save', { chapter })

  // 检查是否需要生成建议
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

async function handleCharacterUpdate(event: Event) {
  const customEvent = event as CustomEvent
  const { character } = customEvent.detail
  await suggestionsStore.triggerCheck('character_update', { character })
}

async function handleOutlineChange(event: Event) {
  const customEvent = event as CustomEvent
  const { outline } = customEvent.detail
  await suggestionsStore.triggerCheck('outline_change', { outline })
}

// 开始建议轮询
function startSuggestionPolling() {
  // 每30秒检查一次待推送的建议
  setInterval(() => {
    const suggestion = suggestionsStore.getNextPendingSuggestion()
    if (suggestion && !suggestion.pushed) {
      showSuggestionNotification(suggestion)
      suggestionsStore.markAsPushed(suggestion.id)
    }
  }, 30000)
}

// 显示建议通知
function showSuggestionNotification(suggestion: Suggestion) {
  notificationTitle.value = suggestion.title
  notificationMessage.value = suggestion.message
  notificationType.value = suggestion.priority === 'high' ? 'warning' : 'info'
  showNotification.value = true

  // 同时在聊天中添加消息
  messages.value.push({
    role: 'assistant',
    content: `**建议**：${suggestion.title}\n\n${suggestion.message}`,
    actions: suggestion.actions?.map(a => ({
      text: a.label,
      command: a.type
    }))
  })

  if (!showChat.value) {
    // 可以在这里添加桌面通知
  }
}

function closeNotification() {
  showNotification.value = false
}

function toggleChat() {
  showChat.value = !showChat.value
  if (showChat.value) {
    suggestionsStore.updateActivity()
  }
}

function formatMessage(content: string): string {
  // Sanitize HTML to prevent XSS attacks
  const html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
  return DOMPurify.sanitize(html)
}

async function sendMessage() {
  const text = userInput.value.trim()
  if (!text) return

  messages.value.push({ role: 'user', content: text })
  userInput.value = ''

  await nextTick()
  scrollToBottom()

  isTyping.value = true

  setTimeout(() => {
    processCommand(text)
  }, 1000)
}

// 核心功能与交互方法
function addAssistantMessage(content: string, actions?: Action[]) {
  messages.value.push({
    role: 'assistant',
    content,
    actions
  })
}

async function processCommand(command: string) {
  isTyping.value = true

  try {
    const { routeAssistantInput } = await import('@/assistant/commands/inputRouter')
    const result = await routeAssistantInput(command, { messages: messages.value })

    if (result.type === 'command') {
      if (result.output) {
        addAssistantMessage(result.output)
      }
      return
    } else if (result.type === 'error') {
      addAssistantMessage('执行命令失败：' + result.error)
      return
    }

    // Result type is chat
    command = result.text

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.checkInitialized()) {
      addAssistantMessage('请先在配置中添加并启用 AI 模型提供商。')
      return
    }

    const projectStore = await import('@/stores/project').then(m => m.useProjectStore())
    const project = projectStore.currentProject

    // 1. 构建深度的系统上下文提示词
    let systemPrompt = `你是《AI小说工坊》的高级创作助手和专业网文编辑。
你的任务是陪伴作者，为他们解答设定问题、构思剧情、设计人物。`

    if (project) {
      systemPrompt += `\n\n【当前项目环境】
项目名称：${project.title}
体裁：${project.genre}
进度：${project.chapters?.length || 0}章 / 目标 ${project.targetWords} 字
`
      if (project.world && project.world.name) {
        systemPrompt += `\n[世界观]
世界名称：${project.world.name}
时代：${project.world.era?.time || '未知'}，科技：${project.world.era?.techLevel || '未知'}
势力：${(project.world.factions || []).map(f => f.name).join('、')}
规则：${(project.world.rules || []).slice(0,3).map(r => r.name).join('、')}`
      }

      if (project.characters && project.characters.length > 0) {
        systemPrompt += `\n\n[核心人物]`
        project.characters.slice(0, 5).forEach(c => {
          systemPrompt += `\n- ${c.name} (${c.tags?.[0] || '角色'}): ${c.appearance || ''} ${c.background || ''}`
        })
      }
      
      if (project.outline) {
        systemPrompt += `\n\n[主线剧情]
${project.outline.mainPlot?.name || '主线'}: ${project.outline.mainPlot?.description || '暂无'}
`
      }
    }

    systemPrompt += `\n\n【动作指令要求】
如果你想为用户创建一个新人物，请在你的回复末尾附带以下严格的 JSON 格式块（务必使用 \`\`\`json 包裹）：
\`\`\`json
{
  "action": "create_character",
  "data": {
    "name": "人物名",
    "gender": "male|female|other",
    "age": 20,
    "appearance": "外貌描写",
    "background": "背景故事"
  }
}
\`\`\`
除了创建人物，如果你只是聊天或者给建议，正常用 Markdown 回复即可，不要输出任何动作 JSON。`

    // 2. 构建多轮对话记忆
    // 截取最近的 10 条对话历史，并将最后一条用户消息的内容替换为实际指令(如果它们不同)
    const chatHistory = messages.value
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map((m, index, arr) => ({
        role: m.role,
        content: index === arr.length - 1 && m.role === 'user' ? command : m.content
      }))

    // 为了防止把按钮文本等内部格式发给 AI，只传纯文本
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...chatHistory
    ]

    const context = { type: 'assistant' as any, complexity: 'medium' as const, priority: 'balanced' as const }
    const maxTokens = project?.config?.advancedSettings?.maxTokens || 4000
    
    const response = await aiStore.chat(apiMessages, context, { maxTokens })
    
    // 3. 解析 AI 意图 (Action Parsing)
    let rawContent = response.content.trim()
    const actions: Action[] = []

    const { parseActionEnvelope } = await import('@/assistant/actions/actionEnvelope')
    const { parsed, rawMatch } = parseActionEnvelope(rawContent)

    if (parsed) {
      if (parsed.action === 'create_character' && parsed.data) {
        // 把提取到的 JSON 从聊天界面隐藏
        rawContent = rawContent.replace(rawMatch, '').trim()
        // 附带一个可操作的 UI 按钮
        actions.push({
          text: `✨ 一键将【${parsed.data.name}】加入人物设定`,
          command: `__sys_create_char:${JSON.stringify(parsed.data)}`
        })
      }
    }

    addAssistantMessage(rawContent, actions.length > 0 ? actions : undefined)

  } catch (error) {
    console.error('[AI助手] 失败:', error)
    addAssistantMessage('抱歉，处理时出现了错误：' + (error as Error).message)
  } finally {
    isTyping.value = false
    await nextTick()
    scrollToBottom()
  }
}

async function handleAction(action: Action) {
  if (action.command.startsWith('__sys_create_char:')) {
    try {
      const charData = JSON.parse(action.command.substring(18))
      const projectStore = useProjectStore()
      if (projectStore.currentProject) {
        projectStore.currentProject.characters.push({
          id: crypto.randomUUID(),
          name: charData.name || '新角色',
          aliases: [],
          gender: charData.gender || 'other',
          age: charData.age || 20,
          appearance: charData.appearance || '',
          personality: [],
          values: [],
          background: charData.background || '',
          motivation: '',
          abilities: [],
          relationships: [],
          appearances: [],
          development: [],
          tags: ['supporting'],
          stateHistory: [],
          aiGenerated: true
        } as any)
        await projectStore.saveCurrentProject()
        
        // 自动发一条消息确认
        messages.value.push({
          role: 'assistant',
          content: `✅ 已经成功将人物 **${charData.name}** 添加到项目的人物库中！您可以去“人物设定”页面查看并进一步修改。`
        })
        scrollToBottom()
      }
    } catch (e) {
      ElMessage.error('应用人物失败')
    }
    return
  }
  
  // 普通快捷指令
  processCommand(action.command)
}

function sendQuickCommand(cmd: Action) {
  messages.value.push({ role: 'user', content: cmd.text })
  processCommand(cmd.command)
}

function clearChat() {
  initMessages()
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// 建议相关方法
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

function markSuggestionRead(id: string) {
  suggestionsStore.markAsRead(id)
}

function markSuggestionAdopted(id: string) {
  suggestionsStore.markAsAdopted(id)
}

function markSuggestionIgnored(id: string) {
  suggestionsStore.markAsIgnored(id)
}

function deleteSuggestion(id: string) {
  suggestionsStore.deleteSuggestion(id)
}

function handleSuggestionAction(suggestion: Suggestion, action: SuggestionAction) {
  switch (action.type) {
    case 'navigate':
      if (action.navigateTarget) {
        // 导航到目标页面
        window.location.hash = action.navigateTarget
      }
      break
    case 'auto_fix':
      if (action.autoFixCommand) {
        processCommand(action.autoFixCommand)
      }
      break
    case 'generate':
      // 触发生成
      break
    case 'view_detail':
      // 查看详情
      break
    case 'dismiss':
      markSuggestionIgnored(suggestion.id)
      break
  }

  // 标记为已读
  if (suggestion.status === 'unread') {
    suggestionsStore.markAsRead(suggestion.id)
  }
}

function batchMarkRead() {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'read')
  selectedSuggestions.value = []
}

function batchMarkAdopted() {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'adopted')
  selectedSuggestions.value = []
}

function batchMarkIgnored() {
  suggestionsStore.batchUpdateStatus(selectedSuggestions.value, 'ignored')
  selectedSuggestions.value = []
}

// 图表初始化
function initCharts() {
  initTypeChart()
  initPriorityChart()
  initTrendChart()
}

function initTypeChart() {
  if (!typeChartRef.value) return

  if (typeChart) typeChart.dispose()
  typeChart = echarts.init(typeChartRef.value)

  const data = [
    { value: statistics.value.byCategory.consistency, name: '一致性' },
    { value: statistics.value.byCategory.quality, name: '质量' },
    { value: statistics.value.byCategory.optimization, name: '优化' },
    { value: statistics.value.byCategory.problem, name: '问题' },
    { value: statistics.value.byCategory.reminder, name: '提醒' }
  ]

  const option = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [{
      name: '建议类型',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold' }
      },
      labelLine: { show: false },
      data
    }]
  }

  typeChart.setOption(option)
}

function initPriorityChart() {
  if (!priorityChartRef.value) return

  if (priorityChart) priorityChart.dispose()
  priorityChart = echarts.init(priorityChartRef.value)

  const data = [
    { value: statistics.value.byPriority.high, name: '高', itemStyle: { color: '#f56c6c' } },
    { value: statistics.value.byPriority.medium, name: '中', itemStyle: { color: '#e6a23c' } },
    { value: statistics.value.byPriority.low, name: '低', itemStyle: { color: '#409eff' } }
  ]

  const option = {
    tooltip: { trigger: 'item' },
    legend: { bottom: '5%', left: 'center' },
    series: [{
      name: '优先级',
      type: 'pie',
      radius: '60%',
      data,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }

  priorityChart.setOption(option)
}

function initTrendChart() {
  if (!trendChartRef.value) return

  if (trendChart) trendChart.dispose()
  trendChart = echarts.init(trendChartRef.value)

  const days = ['6天前', '5天前', '4天前', '3天前', '2天前', '昨天', '今天']

  const option = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: days
    },
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
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
          ]
        }
      }
    }]
  }

  trendChart.setOption(option)
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

.chat-tabs {
  height: 100%;
}

.chat-tabs :deep(.el-tabs__content) {
  height: calc(100% - 50px);
  overflow: hidden;
}

.chat-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.message-content {
  flex: 1;
  max-width: 80%;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  word-wrap: break-word;
}

.message.user .message-text {
  background: #409eff;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-text {
  background: #f0f2f5;
  color: #333;
  border-bottom-left-radius: 4px;
}

.message-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f0f2f5;
  border-radius: 12px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #999;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

.quick-actions {
  padding: 12px 20px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.input-area {
  padding: 16px 20px;
  border-top: 1px solid #e4e7ed;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
}

/* 建议面板样式 */
.suggestions-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.suggestions-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding: 0 4px;
}

.suggestions-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 4px;
}

.suggestion-card {
  cursor: pointer;
  transition: all 0.3s;
}

.suggestion-card.priority-high {
  border-left: 3px solid #f56c6c;
}

.suggestion-card.priority-medium {
  border-left: 3px solid #e6a23c;
}

.suggestion-card.priority-low {
  border-left: 3px solid #409eff;
}

.suggestion-card.status-adopted {
  opacity: 0.7;
}

.suggestion-card.status-ignored {
  opacity: 0.5;
}

.suggestion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.suggestion-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-text {
  font-weight: 600;
  font-size: 14px;
}

.more-icon {
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.more-icon:hover {
  background: #f0f2f5;
}

.suggestion-message {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 8px;
}

.suggestion-location {
  margin-bottom: 8px;
}

.suggestion-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.suggestion-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #909399;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-top: 12px;
}

/* 统计面板样式 */
.statistics-panel {
  height: 100%;
  overflow-y: auto;
  padding: 0 4px;
}

.stats-overview {
  margin-bottom: 20px;
}

.stats-card {
  margin-bottom: 16px;
}

.chart-container {
  height: 200px;
}

.timeline-suggestion {
  padding: 4px 0;
}

.timeline-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.timeline-message {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}

.timeline-time {
  font-size: 12px;
  color: #909399;
}
</style>
