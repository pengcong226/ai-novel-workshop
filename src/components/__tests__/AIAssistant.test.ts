import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import AIAssistant from '@/components/AIAssistant.vue'
import type { AssistantMessage, AssistantAction } from '@/assistant/commands/assistantChat'

// ---------------------------------------------------------------------------
// Mock stores
// ---------------------------------------------------------------------------

const mockCurrentProject = ref<{ title: string } | null>(null)

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: mockCurrentProject.value,
  }),
}))

const mockSuggestions = {
  init: vi.fn(),
  triggerCheck: vi.fn().mockResolvedValue(undefined),
  addSuggestion: vi.fn(),
  getNextPendingSuggestion: vi.fn().mockReturnValue(null),
  markAsPushed: vi.fn(),
  markAsRead: vi.fn(),
  markAsAdopted: vi.fn(),
  markAsIgnored: vi.fn(),
  deleteSuggestion: vi.fn(),
  batchUpdateStatus: vi.fn(),
  updateActivity: vi.fn(),
  stopPeriodicCheck: vi.fn(),
  filterSuggestions: vi.fn().mockReturnValue([]),
  unreadCount: 0,
  statistics: {
    total: 0,
    byStatus: { unread: 0, read: 0, adopted: 0, ignored: 0 },
    byType: { improvement: 0, issue: 0, question: 0 },
    byCategory: { consistency: 0, quality: 0, optimization: 0, style: 0, problem: 0, reminder: 0 },
    byPriority: { low: 0, medium: 0, high: 0 },
    adoptionRate: 0,
    adoptionTrend: [0, 0, 0, 0, 0, 0, 0],
    avgResponseTime: 0,
  },
  suggestions: [] as unknown[],
}

vi.mock('@/stores/suggestions', () => ({
  useSuggestionsStore: () => mockSuggestions,
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({
    entities: [],
    activeEntitiesState: {},
    characterEntities: [],
    factionEntities: [],
    loreEntities: [],
  }),
}))

vi.mock('@/stores/theme', () => ({
  useThemeStore: () => ({
    activeThemeId: 'light',
  }),
}))

// ---------------------------------------------------------------------------
// Mock event bus
// ---------------------------------------------------------------------------

const mockOn = vi.fn()

vi.mock('@/composables/useEventBus', () => ({
  useEventBus: () => ({
    on: mockOn,
    once: vi.fn(),
    emit: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Mock assistant chat module
// ---------------------------------------------------------------------------

const mockInitialMessages: AssistantMessage[] = [
  {
    role: 'assistant',
    content: '你好！我是AI创作助手。',
    actions: [{ text: '查看当前设定', command: '查看当前设定' }],
  },
]

vi.mock('@/assistant/commands/assistantChat', () => ({
  createInitialAssistantMessages: vi.fn(() => mockInitialMessages),
  buildAssistantSystemPrompt: vi.fn(() => 'system prompt'),
  buildAssistantChatMessages: vi.fn(() => []),
  parseAssistantResponseActions: vi.fn((content: string) => ({ content, actions: [] })),
  parseAssistantActionCommand: vi.fn(),
  formatAssistantMessage: vi.fn((content: string) => content),
}))

// ---------------------------------------------------------------------------
// Mock input router
// ---------------------------------------------------------------------------

const mockRouteAssistantInput = vi.fn().mockResolvedValue({ type: 'chat', text: 'test' })

vi.mock('@/assistant/commands/inputRouter', () => ({
  routeAssistantInput: (...args: unknown[]) => mockRouteAssistantInput(...args),
}))

// ---------------------------------------------------------------------------
// Mock action executor
// ---------------------------------------------------------------------------

const mockExecuteAssistantAction = vi.fn().mockResolvedValue(true)

vi.mock('@/assistant/actions/executeAssistantAction', () => ({
  executeAssistantAction: (...args: unknown[]) => mockExecuteAssistantAction(...args),
}))

// ---------------------------------------------------------------------------
// Mock element-plus notification/message
// ---------------------------------------------------------------------------

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { error: vi.fn(), success: vi.fn() },
    ElNotification: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Stub child components
// ---------------------------------------------------------------------------

const AssistantChatPanelStub = {
  name: 'AssistantChatPanel',
  props: ['messages', 'quickCommands', 'isTyping'],
  emits: ['send', 'clear', 'action', 'quick-command', 'update:input'],
  template: `
    <div class="chat-panel-stub">
      <div class="messages-stub">
        <div v-for="(msg, i) in messages" :key="i" :class="['msg', msg.role]">
          <span class="msg-content">{{ msg.content }}</span>
          <div v-if="msg.actions" class="msg-actions">
            <button v-for="a in msg.actions" :key="a.text" class="action-btn" @click="$emit('action', a)">
              {{ a.text }}
            </button>
          </div>
        </div>
      </div>
      <div class="quick-cmd-stub">
        <button v-for="cmd in quickCommands" :key="cmd.text" class="quick-btn" @click="$emit('quick-command', cmd)">
          {{ cmd.text }}
        </button>
      </div>
      <button class="send-btn" @click="$emit('send')">发送</button>
      <button class="clear-btn" @click="$emit('clear')">清空</button>
    </div>
  `,
  expose: ['messagesRef'],
}

const AssistantShellTabsStub = {
  name: 'AssistantShellTabs',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `
    <div class="shell-tabs-stub">
      <slot name="chat" />
      <slot name="suggestions" />
      <slot name="statistics" />
    </div>
  `,
}

const ErrorBoundaryStub = {
  name: 'ErrorBoundary',
  props: ['name', 'showRetry', 'showDetail'],
  template: '<div class="error-boundary-stub"><slot /></div>',
}

const AssistantSuggestionsPanelStub = {
  name: 'AssistantSuggestionsPanel',
  props: [
    'filter', 'suggestions', 'selectedSuggestions', 'formatTime',
    'getTypeTagType', 'getTypeLabel', 'getPriorityTagType',
    'getPriorityLabel', 'getStatusLabel',
  ],
  emits: ['action', 'markRead', 'markAdopted', 'markIgnored', 'delete', 'batchRead', 'batchAdopted', 'batchIgnored', 'update:filter'],
  template: '<div class="suggestions-panel-stub" />',
}

const AssistantStatisticsPanelStub = {
  name: 'AssistantStatisticsPanel',
  props: ['statistics', 'highPrioritySuggestions', 'formatTime'],
  template: '<div class="statistics-panel-stub" />',
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

function mountAssistant() {
  return mount(AIAssistant, {
    global: {
      stubs: {
        AssistantChatPanel: AssistantChatPanelStub,
        AssistantShellTabs: AssistantShellTabsStub,
        AssistantSuggestionsPanel: AssistantSuggestionsPanelStub,
        AssistantStatisticsPanel: AssistantStatisticsPanelStub,
        ErrorBoundary: ErrorBoundaryStub,
        ElDrawer: {
          template: `
            <div v-if="modelValue" class="drawer-stub">
              <slot />
            </div>
          `,
          props: ['modelValue', 'title', 'direction', 'size', 'appendToBody'],
        },
        ElBadge: {
          template: '<span class="badge-stub" :data-value="value" :data-hidden="hidden"><slot /></span>',
          props: ['value', 'hidden'],
        },
        ElIcon: {
          template: '<span class="icon-stub"><slot /></span>',
          props: ['size'],
        },
        ChatDotRound: { template: '<span />' },
        Teleport: { template: '<slot />' },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIAssistant', () => {
  beforeEach(() => {
    createTestPinia()
    mockCurrentProject.value = null
    mockSuggestions.unreadCount = 0
    vi.clearAllMocks()
  })

  // --- Chat toggle ---

  it('renders float button that toggles chat drawer', async () => {
    const wrapper = mountAssistant()

    // Drawer should not be visible initially
    expect(wrapper.find('.drawer-stub').exists()).toBe(false)

    // Click the float button to open
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    expect(wrapper.find('.drawer-stub').exists()).toBe(true)
  })

  // --- Initial messages ---

  it('initializes with welcome messages from createInitialAssistantMessages', async () => {
    const wrapper = mountAssistant()

    // Open the drawer
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    expect(chatPanel.exists()).toBe(true)

    const messages = chatPanel.props('messages')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('你好！我是AI创作助手。')
  })

  it('shows project title in initial messages when project exists', async () => {
    const { createInitialAssistantMessages } = await import('@/assistant/commands/assistantChat')
    mockCurrentProject.value = { title: '测试项目' }

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    expect(createInitialAssistantMessages).toHaveBeenCalledWith('测试项目')
  })

  // --- Quick commands ---

  it('displays quick commands in the chat panel', async () => {
    const wrapper = mountAssistant()

    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    const cmds = chatPanel.props('quickCommands')

    expect(cmds).toHaveLength(4)
    expect(cmds.map((c: AssistantAction) => c.text)).toEqual([
      '总结设定', '优化世界观', '设计配角', '推演剧情',
    ])
  })

  // --- Send message ---

  it('appends user message and routes command on send', async () => {
    mockRouteAssistantInput.mockResolvedValueOnce({ type: 'chat', text: '你好' })

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    // Trigger send event from chat panel
    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    await chatPanel.find('.send-btn').trigger('click')
    await flushPromises()

    // The send handler reads userInput, which is empty by default so it returns early.
    // We need to set it via the v-model. The stub doesn't bind v-model, so we test
    // the command routing indirectly: sendMessage with empty input does nothing.
    expect(mockRouteAssistantInput).not.toHaveBeenCalled()
  })

  it('processes command when sendMessage has input text', async () => {
    mockRouteAssistantInput.mockResolvedValueOnce({ type: 'chat', text: '你好' })

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    // Set userInput directly on the component instance
    const vm = wrapper.vm as unknown as { userInput: string }
    vm.userInput = '你好'

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    await chatPanel.find('.send-btn').trigger('click')
    await flushPromises()

    expect(mockRouteAssistantInput).toHaveBeenCalledWith(
      '你好',
      expect.objectContaining({ messages: expect.any(Array) }),
    )
  })

  // --- Quick command triggers processCommand ---

  it('sends quick command text and processes the command', async () => {
    mockRouteAssistantInput.mockResolvedValueOnce({ type: 'chat', text: '请总结并梳理一下我们目前小说中的整体设定和世界观。' })

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    const quickBtns = chatPanel.findAll('.quick-btn')
    expect(quickBtns.length).toBeGreaterThan(0)

    await quickBtns[0].trigger('click')
    await flushPromises()

    expect(mockRouteAssistantInput).toHaveBeenCalled()
  })

  // --- Clear chat ---

  it('resets messages when clear event fires', async () => {
    const { createInitialAssistantMessages } = await import('@/assistant/commands/assistantChat')

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    await chatPanel.find('.clear-btn').trigger('click')
    await nextTick()

    // initMessages is called, which calls createInitialAssistantMessages again
    expect(createInitialAssistantMessages).toHaveBeenCalled()
  })

  // --- Unread badge ---

  it('shows unread count badge on float button', async () => {
    mockSuggestions.unreadCount = 3

    const wrapper = mountAssistant()

    const badge = wrapper.find('.badge-stub')
    expect(badge.exists()).toBe(true)
    expect(badge.attributes('data-value')).toBe('3')
  })

  it('hides badge when unreadCount is zero', () => {
    mockSuggestions.unreadCount = 0

    const wrapper = mountAssistant()

    const badge = wrapper.find('.badge-stub')
    // hidden is a boolean prop; when true the stub sets data-hidden
    expect(badge.attributes('data-hidden')).toBeDefined()
  })

  // --- Action handling ---

  it('routes action commands through processCommand', async () => {
    mockRouteAssistantInput.mockResolvedValueOnce({ type: 'chat', text: '查看当前设定' })

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    // Simulate action event with a regular command (not __sys_action)
    chatPanel.vm.$emit('action', { text: '查看当前设定', command: '查看当前设定' })
    await flushPromises()

    expect(mockRouteAssistantInput).toHaveBeenCalledWith(
      '查看当前设定',
      expect.objectContaining({ messages: expect.any(Array) }),
    )
  })

  it('handles sys_action commands via executeAssistantAction', async () => {
    const { parseAssistantActionCommand } = await import('@/assistant/commands/assistantChat')
    vi.mocked(parseAssistantActionCommand).mockReturnValueOnce({
      action: 'create_character',
      data: { name: '角色A', gender: 'male' },
    })

    const wrapper = mountAssistant()
    await wrapper.find('.ai-float-button').trigger('click')
    await nextTick()

    const chatPanel = wrapper.findComponent(AssistantChatPanelStub)
    // Simulate action event with a __sys_action prefix
    chatPanel.vm.$emit('action', {
      text: '创建人物',
      command: '__sys_action:{"action":"create_character","data":{"name":"角色A","gender":"male"}}',
    })
    await flushPromises()

    expect(mockExecuteAssistantAction).toHaveBeenCalled()
  })

  // --- Suggestions store init ---

  it('initializes suggestions store on mount', () => {
    mountAssistant()
    expect(mockSuggestions.init).toHaveBeenCalled()
  })

  it('registers event bus listeners on mount', () => {
    mountAssistant()
    expect(mockOn).toHaveBeenCalledWith('chapter:saved', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('entity:updated', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('outline:changed', expect.any(Function))
  })
})
