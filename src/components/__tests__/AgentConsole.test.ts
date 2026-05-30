import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { createMockProject, resetMockIdCounter } from '@/test/mocks'
import type { AgentConfig } from '@/agents/types'
import AgentConsole from '@/components/AgentConsole.vue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSaveCurrentProject = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/project', () => ({
  useProjectStore: vi.fn(() => ({
    currentProject: mockCurrentProject,
    saveCurrentProject: mockSaveCurrentProject,
  })),
}))

let mockCurrentProject: ReturnType<typeof createMockProject> | null = null

vi.mock('@/utils/project-config-normalizer', () => ({
  normalizeProjectConfig: vi.fn((config: any) => ({
    agentConfigs: config?.agentConfigs ?? DEFAULT_MOCK_AGENT_CONFIGS,
  })),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('@/utils/errorHandler', () => ({
  getFriendlyMessage: vi.fn((msg: string) => `friendly: ${msg}`),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const DEFAULT_MOCK_AGENT_CONFIGS: AgentConfig[] = [
  { role: 'planner', enabled: true, phase: 'pre-generation', priority: 1, model: 'gpt-4' },
  { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 2 },
  { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
  { role: 'reader', enabled: false, phase: 'post-generation', priority: 6, batchOnly: true },
  { role: 'extractor', enabled: false, phase: 'post-generation', priority: 10 },
]

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  props: ['bodyStyle', 'shadow'],
  template: '<div class="stub-card"><slot name="header" /><slot /></div>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="stub-tag"><slot /></span>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'plain', 'disabled', 'loading', 'text'],
  emits: ['click'],
  template: '<button class="stub-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const ElSwitchStub = {
  name: 'ElSwitch',
  props: ['modelValue', 'size'],
  emits: ['change', 'update:modelValue'],
  template: '<input type="checkbox" class="stub-switch" :checked="modelValue" @change="$emit(\'update:modelValue\', !$event.target.checked); $emit(\'change\', !$event.target.checked)" />',
}

const ElAlertStub = {
  name: 'ElAlert',
  props: ['type', 'closable', 'showIcon'],
  template: '<div class="stub-alert"><slot name="title" /><slot /></div>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="stub-icon"><slot /></span>',
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

function mountAgentConsole(projectOverrides: Record<string, any> = {}) {
  const baseProject = createMockProject({
    config: {
      ...createMockProject().config,
      agentConfigs: DEFAULT_MOCK_AGENT_CONFIGS.map(c => ({ ...c })),
    },
    ...projectOverrides,
  })
  mockCurrentProject = baseProject

  return mount(AgentConsole, {
    global: {
      stubs: {
        ElCard: ElCardStub,
        ElTag: ElTagStub,
        ElButton: ElButtonStub,
        ElSwitch: ElSwitchStub,
        ElAlert: ElAlertStub,
        ElIcon: ElIconStub,
        CaretRight: { template: '<span />' },
        CloseBold: { template: '<span />' },
        Select: { template: '<span />' },
        Loading: { template: '<span />' },
        Compass: { template: '<span />' },
        EditPen: { template: '<span />' },
        View: { template: '<span />' },
        Filter: { template: '<span />' },
        Document: { template: '<span />' },
        Management: { template: '<span />' },
        Connection: { template: '<span />' },
      },
    },
  })
}

function mountWithoutProject() {
  mockCurrentProject = null
  return mount(AgentConsole, {
    global: {
      stubs: {
        ElCard: ElCardStub,
        ElTag: ElTagStub,
        ElButton: ElButtonStub,
        ElSwitch: ElSwitchStub,
        ElAlert: ElAlertStub,
        ElIcon: ElIconStub,
        CaretRight: { template: '<span />' },
        CloseBold: { template: '<span />' },
        Select: { template: '<span />' },
        Loading: { template: '<span />' },
        Compass: { template: '<span />' },
        EditPen: { template: '<span />' },
        View: { template: '<span />' },
        Filter: { template: '<span />' },
        Document: { template: '<span />' },
        Management: { template: '<span />' },
        Connection: { template: '<span />' },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentConsole', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Rendering: header and status ----

  it('renders the console header with title and "ready" status tag when no agent is running', () => {
    const wrapper = mountAgentConsole()

    expect(wrapper.find('.header-title').text()).toBe('Agent 控制台')
    expect(wrapper.find('.stub-tag').text()).toContain('就绪')
  })

  // ---- Rendering: agent cards ----

  it('renders one agent card per agent config with correct labels', () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    expect(agentCards).toHaveLength(DEFAULT_MOCK_AGENT_CONFIGS.length)

    const names = agentCards.map(card => card.find('.agent-name').text())
    expect(names).toEqual(['规划师', '哨兵', '编辑审校', '读者反馈', '抽取器'])
  })

  it('displays phase label and priority for each agent card', () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const firstCard = agentCards[0]

    const metaItems = firstCard.findAll('.meta-item')
    const metaTexts = metaItems.map(item => item.text())
    expect(metaTexts.some(t => t.includes('阶段'))).toBe(true)
    expect(metaTexts.some(t => t.includes('生成前'))).toBe(true)
    expect(metaTexts.some(t => t.includes('优先级'))).toBe(true)
    expect(metaTexts.some(t => t.includes('1'))).toBe(true)
  })

  it('displays model name when agent has a model configured', () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const plannerCard = agentCards[0]
    const metaItems = plannerCard.findAll('.meta-item')

    const modelItem = metaItems.find(item => item.text().includes('模型'))
    expect(modelItem).toBeTruthy()
    expect(modelItem!.text()).toContain('gpt-4')
  })

  it('displays "only batch" tag for batchOnly agents', () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const readerCard = agentCards[3]
    const metaItems = readerCard.findAll('.meta-item')

    const batchItem = metaItems.find(item => item.text().includes('仅批量'))
    expect(batchItem).toBeTruthy()
  })

  // ---- Rendering: batch actions section ----

  it('renders the batch actions section with pre-generation and post-generation buttons', () => {
    const wrapper = mountAgentConsole()

    const batchSection = wrapper.find('.batch-section')
    expect(batchSection.exists()).toBe(true)
    expect(batchSection.find('.batch-title').text()).toBe('快捷操作')

    const buttons = batchSection.findAll('.stub-button')
    const buttonTexts = buttons.map(b => b.text())
    expect(buttonTexts.some(t => t.includes('运行生成前 Agent'))).toBe(true)
    expect(buttonTexts.some(t => t.includes('运行生成后 Agent'))).toBe(true)
    expect(buttonTexts.some(t => t.includes('停止全部'))).toBe(true)
  })

  // ---- Rendering: no project state ----

  it('disables agent run buttons when no project is loaded', () => {
    const wrapper = mountWithoutProject()

    const runButtons = wrapper.findAll('.agent-actions .stub-button')
    expect(runButtons.length).toBeGreaterThan(0)

    const firstRunButton = runButtons[0]
    expect(firstRunButton.attributes('disabled')).toBeDefined()
  })

  // ---- Interaction: toggle all agents ----

  it('toggles all agents enabled state when "toggle all" button is clicked', async () => {
    const wrapper = mountAgentConsole()

    const toggleBtn = wrapper.find('.header-actions .stub-button')
    // Not all agents are enabled in the mock (reader and extractor are disabled)
    expect(toggleBtn.text()).toBe('全部启用')

    await toggleBtn.trigger('click')
    await flushPromises()

    expect(mockSaveCurrentProject).toHaveBeenCalled()
  })

  // ---- Interaction: run single agent ----

  it('runs a single agent and adds a success log entry after execution', async () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const plannerRunBtn = agentCards[0].findAll('.stub-button')[0]

    await plannerRunBtn.trigger('click')
    await flushPromises()

    // Advance past the simulated 1500ms execution
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()

    const logEntries = wrapper.findAll('.log-entry')
    expect(logEntries.length).toBeGreaterThanOrEqual(2)

    // First unshift entry is the last one added (success), rendered at top
    const successEntry = logEntries[0]
    expect(successEntry.text()).toContain('执行完成')
    expect(successEntry.classes()).toContain('log-success')
  })

  // ---- Interaction: run phase agents ----

  it('runs all enabled post-generation agents when batch button is clicked', async () => {
    const wrapper = mountAgentConsole()

    const batchButtons = wrapper.findAll('.batch-section .stub-button')
    const postGenBtn = batchButtons[1]

    await postGenBtn.trigger('click')
    await flushPromises()

    // Advance past the simulated 2000ms batch execution
    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()

    const logEntries = wrapper.findAll('.log-entry')
    expect(logEntries.length).toBeGreaterThan(0)

    // All log entries should be success after completion
    const successEntries = logEntries.filter(e => e.classes().includes('log-success'))
    expect(successEntries.length).toBeGreaterThanOrEqual(2)
  })

  // ---- Interaction: stop all agents ----

  it('stops all running agents and updates status tag', async () => {
    const wrapper = mountAgentConsole()

    // Start an agent
    const agentCards = wrapper.findAll('.agent-card')
    const plannerRunBtn = agentCards[0].findAll('.stub-button')[0]
    await plannerRunBtn.trigger('click')
    await flushPromises()

    // Stop all
    const batchButtons = wrapper.findAll('.batch-section .stub-button')
    const stopBtn = batchButtons[2]
    await stopBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-tag').text()).toContain('就绪')
  })

  // ---- Interaction: clear log ----

  it('clears execution log when clear button is clicked', async () => {
    const wrapper = mountAgentConsole()

    // Run an agent to generate log entries
    const agentCards = wrapper.findAll('.agent-card')
    const plannerRunBtn = agentCards[0].findAll('.stub-button')[0]
    await plannerRunBtn.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.log-entry').length).toBeGreaterThan(0)

    // Click clear
    const clearBtn = wrapper.find('.log-header .stub-button')
    await clearBtn.trigger('click')
    await flushPromises()

    expect(wrapper.find('.log-section').exists()).toBe(false)
  })

  // ---- Rendering: log entries with correct status badges ----

  it('displays log entries with correct status badges for running state', async () => {
    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const plannerRunBtn = agentCards[0].findAll('.stub-button')[0]
    await plannerRunBtn.trigger('click')
    await flushPromises()

    const logEntries = wrapper.findAll('.log-entry')
    const runningEntry = logEntries.find(e => e.classes().includes('log-running'))
    expect(runningEntry).toBeTruthy()
    expect(runningEntry!.find('.log-badge-running').text()).toBe('执行中')
  })

  // ---- Error handling ----

  it('logs a failed entry with friendly message when agent execution fails', async () => {
    // Make setTimeout throw synchronously inside the Promise executor,
    // which causes the Promise to reject and hits the catch block.
    const originalSetTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms === 1500) {
        throw new Error('network timeout')
      }
      return originalSetTimeout(fn, ms ?? 0) as any
    })

    const wrapper = mountAgentConsole()

    const agentCards = wrapper.findAll('.agent-card')
    const plannerRunBtn = agentCards[0].findAll('.stub-button')[0]
    await plannerRunBtn.trigger('click')

    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()

    const logEntries = wrapper.findAll('.log-entry')
    const failedEntry = logEntries.find(e => e.classes().includes('log-failed'))
    expect(failedEntry).toBeTruthy()
    expect(failedEntry!.text()).toContain('friendly: network timeout')
    expect(failedEntry!.find('.log-badge-failed').text()).toBe('失败')

    vi.restoreAllMocks()
  })
})
