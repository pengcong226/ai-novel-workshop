import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'

// ---------------------------------------------------------------------------
// Mocks (must precede component imports)
// ---------------------------------------------------------------------------

vi.mock('@/utils/logger', () => ({
  getLoggerManager: vi.fn(),
  getLogger: vi.fn(),
}))

vi.mock('@/utils/devFlags', () => ({
  getAIMockEnabled: vi.fn().mockReturnValue(false),
  setAIMockEnabled: vi.fn(),
}))

vi.mock('@/plugins/setup', () => ({
  getPluginSystemStatus: vi.fn().mockReturnValue({ plugins: 3, active: 2 }),
}))

const { mockElMessageSuccess, mockElMessageWarning } = vi.hoisted(() => ({
  mockElMessageSuccess: vi.fn(),
  mockElMessageWarning: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mockElMessageSuccess,
    warning: mockElMessageWarning,
  },
}))

// AnalyticsDashboard is defined via defineAsyncComponent in the component.
// Instead of vi.mock (which breaks async component resolution), we provide
// a global stub so vue-test-utils replaces it at render time.

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import DeveloperPanel from '@/components/DeveloperPanel.vue'
import { getLoggerManager } from '@/utils/logger'
import { getAIMockEnabled, setAIMockEnabled } from '@/utils/devFlags'
import { getPluginSystemStatus } from '@/plugins/setup'

// ---------------------------------------------------------------------------
// LoggerManager mock factory
// ---------------------------------------------------------------------------

function createMockLoggerManager() {
  return {
    getConfig: vi.fn().mockReturnValue({
      enabled: true,
      level: 'info',
      namespaces: ['*'],
    }),
    configure: vi.fn(),
    getLogs: vi.fn().mockReturnValue([]),
    clearLogs: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="el-card-stub"><slot /><slot name="header" /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'plain'],
  emits: ['click'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
}

const ElSwitchStub = {
  name: 'ElSwitch',
  props: ['modelValue', 'activeText', 'inactiveText'],
  emits: ['update:modelValue', 'change'],
  template:
    '<div class="el-switch-stub" :data-active="modelValue" @click="$emit(\'update:modelValue\', !modelValue); $emit(\'change\', !modelValue)"><slot /></div>',
}

const ElFormStub = {
  name: 'ElForm',
  props: ['labelWidth'],
  template: '<form class="el-form-stub"><slot /></form>',
}

const ElFormItemStub = {
  name: 'ElFormItem',
  props: ['label'],
  template: '<div class="el-form-item-stub"><label>{{ label }}</label><slot /></div>',
}

const ElSelectStub = {
  name: 'ElSelect',
  props: ['modelValue'],
  emits: ['update:modelValue', 'change'],
  template: '<select class="el-select-stub"><slot /></select>',
}

const ElOptionStub = {
  name: 'ElOption',
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>',
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder', 'size', 'clearable'],
  emits: ['update:modelValue', 'blur'],
  template:
    '<input class="el-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')" />',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const ElSpaceStub = {
  name: 'ElSpace',
  props: ['direction', 'alignment'],
  template: '<div class="el-space-stub"><slot /></div>',
}

const ElTextStub = {
  name: 'ElText',
  props: ['type', 'size'],
  template: '<span class="el-text-stub"><slot /></span>',
}

const AnalyticsDashboardStub = {
  name: 'AnalyticsDashboard',
  template: '<div class="analytics-dashboard-stub" />',
}

const globalStubs = {
  ElCard: ElCardStub,
  ElButton: ElButtonStub,
  ElSwitch: ElSwitchStub,
  ElForm: ElFormStub,
  ElFormItem: ElFormItemStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElInput: ElInputStub,
  ElTag: ElTagStub,
  ElSpace: ElSpaceStub,
  ElText: ElTextStub,
  AnalyticsDashboard: AnalyticsDashboardStub,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeveloperPanel', () => {
  let mockLoggerManager: ReturnType<typeof createMockLoggerManager>

  beforeEach(() => {
    vi.clearAllMocks()
    createTestPinia()

    mockLoggerManager = createMockLoggerManager()
    vi.mocked(getLoggerManager).mockReturnValue(mockLoggerManager as any)
  })

  function mountPanel() {
    return mount(DeveloperPanel, {
      global: { stubs: globalStubs },
    })
  }

  // -----------------------------------------------------------------
  // 1. Panel renders in dev mode with title
  // -----------------------------------------------------------------

  it('renders the panel with developer title when in DEV mode', async () => {
    vi.stubGlobal('import', { meta: { env: { DEV: true } } })

    // Override the module-level isDev constant via dynamic import.
    // Since isDev is read at module load time, we test the rendered output.
    // The component uses `v-if="isDev"` - when DEV is false the div is hidden.
    // For a reliable test, we mount and check the DOM.
    const wrapper = mountPanel()
    await nextTick()

    // When running tests, import.meta.env.DEV is typically true (vitest).
    // Check if the panel wrapper exists.
    const panel = wrapper.find('.dev-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.find('h2').text()).toBe('开发者面板')
  })

  // -----------------------------------------------------------------
  // 2. Renders log configuration card
  // -----------------------------------------------------------------

  it('renders log configuration card with switch, select, and namespace input', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    // First card is "日志配置"
    const logCard = cards[0]
    expect(logCard.text()).toContain('日志配置')

    // Should have form items for log switch, level, and namespace
    const formItems = logCard.findAll('.el-form-item-stub')
    expect(formItems.length).toBeGreaterThanOrEqual(3)

    const labels = formItems.map(f => f.find('label').text())
    expect(labels).toContain('日志开关')
    expect(labels).toContain('日志级别')
    expect(labels).toContain('命名空间')
  })

  // -----------------------------------------------------------------
  // 3. Renders AI Mock debug card with toggle switch
  // -----------------------------------------------------------------

  it('renders AI Mock debug card with mock toggle switch', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const mockCard = cards[1]
    expect(mockCard.text()).toContain('AI Mock 调试')

    const switchEl = mockCard.find('.el-switch-stub')
    expect(switchEl.exists()).toBe(true)
    expect(switchEl.attributes('data-active')).toBe('false')
  })

  // -----------------------------------------------------------------
  // 4. Shows MOCK ON indicator when mock is enabled
  // -----------------------------------------------------------------

  it('shows MOCK ON indicator tag when mock is initially enabled', async () => {
    vi.mocked(getAIMockEnabled).mockReturnValue(true)

    const wrapper = mountPanel()
    await nextTick()

    const tag = wrapper.find('.mock-indicator')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('MOCK ON')
  })

  it('does not show MOCK ON indicator when mock is disabled', async () => {
    vi.mocked(getAIMockEnabled).mockReturnValue(false)

    const wrapper = mountPanel()
    await nextTick()

    const tag = wrapper.find('.mock-indicator')
    expect(tag.exists()).toBe(false)
  })

  // -----------------------------------------------------------------
  // 5. Mock toggle calls setAIMockEnabled and shows success message
  // -----------------------------------------------------------------

  it('calls setAIMockEnabled and shows message when mock toggle is clicked', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const mockCard = cards[1]
    const switchEl = mockCard.find('.el-switch-stub')

    // Toggle the switch ON
    await switchEl.trigger('click')
    await nextTick()

    expect(setAIMockEnabled).toHaveBeenCalledWith(true)
    expect(mockElMessageSuccess).toHaveBeenCalledWith('已开启 AI Mock 模式')
  })

  it('calls setAIMockEnabled(false) and shows message when toggling mock off', async () => {
    vi.mocked(getAIMockEnabled).mockReturnValue(true)

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const mockCard = cards[1]
    const switchEl = mockCard.find('.el-switch-stub')

    // The initial state is true (from getAIMockEnabled mock)
    // Toggle the switch (it emits change with the new value = false)
    await switchEl.trigger('click')
    await nextTick()

    expect(setAIMockEnabled).toHaveBeenCalledWith(false)
    expect(mockElMessageSuccess).toHaveBeenCalledWith('已关闭 AI Mock 模式')
  })

  // -----------------------------------------------------------------
  // 6. System debug card renders plugin status and conflict test button
  // -----------------------------------------------------------------

  it('renders system debug card with plugin status and conflict test buttons', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const sysCard = cards[2]
    expect(sysCard.text()).toContain('系统调试')

    const buttons = sysCard.findAll('.el-button-stub')
    const buttonTexts = buttons.map(b => b.text())
    expect(buttonTexts).toContain('刷新插件状态')
    expect(buttonTexts).toContain('运行冲突检测测试')
  })

  // -----------------------------------------------------------------
  // 7. Refresh plugin status calls getPluginSystemStatus and displays result
  // -----------------------------------------------------------------

  it('refreshes plugin status when button is clicked and displays the result', async () => {
    vi.mocked(getPluginSystemStatus).mockReturnValue({
      registries: 5,
      activePlugins: 3,
    })

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const sysCard = cards[2]
    const buttons = sysCard.findAll('.el-button-stub')
    const refreshButton = buttons.find(b => b.text() === '刷新插件状态')

    await refreshButton!.trigger('click')
    await nextTick()

    expect(getPluginSystemStatus).toHaveBeenCalled()

    const statusPreview = sysCard.find('.status-preview')
    expect(statusPreview.exists()).toBe(true)
    expect(statusPreview.text()).toContain('registries')
    expect(statusPreview.text()).toContain('activePlugins')
  })

  // -----------------------------------------------------------------
  // 8. Run conflict test shows warning when global function is missing
  // -----------------------------------------------------------------

  it('shows warning when conflict detection test function is not mounted', async () => {
    // Ensure the global function is not defined
    delete (window as any).runConflictDetectionTest

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const sysCard = cards[2]
    const buttons = sysCard.findAll('.el-button-stub')
    const conflictButton = buttons.find(b => b.text() === '运行冲突检测测试')

    await conflictButton!.trigger('click')
    await nextTick()

    expect(mockElMessageWarning).toHaveBeenCalledWith(
      'runConflictDetectionTest 未挂载（请确认测试脚本已加载）',
    )
  })

  // -----------------------------------------------------------------
  // 9. Run conflict test calls global function and shows success
  // -----------------------------------------------------------------

  it('calls runConflictDetectionTest and shows success when mounted on window', async () => {
    const mockTester = vi.fn().mockResolvedValue(undefined)
    ;(window as any).runConflictDetectionTest = mockTester

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const sysCard = cards[2]
    const buttons = sysCard.findAll('.el-button-stub')
    const conflictButton = buttons.find(b => b.text() === '运行冲突检测测试')

    await conflictButton!.trigger('click')
    await nextTick()

    expect(mockTester).toHaveBeenCalled()
    expect(mockElMessageSuccess).toHaveBeenCalledWith('已在控制台触发冲突检测测试')

    // Cleanup
    delete (window as any).runConflictDetectionTest
  })

  // -----------------------------------------------------------------
  // 10. Log list card displays log entries with level tag and namespace
  // -----------------------------------------------------------------

  it('renders log entries with level tag, namespace, and message', async () => {
    const mockLogs = [
      {
        time: '2026-05-31T10:00:00.000Z',
        timestamp: 1748688000000,
        level: 'info',
        namespace: 'app:startup',
        message: 'Application started',
        args: [],
      },
      {
        time: '2026-05-31T10:00:01.000Z',
        timestamp: 1748688001000,
        level: 'error',
        namespace: 'ai:stream',
        message: 'Connection failed',
        args: [],
      },
    ]
    mockLoggerManager.getLogs.mockReturnValue(mockLogs)

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    // Last card is the log buffer
    const logCard = cards[cards.length - 1]
    expect(logCard.text()).toContain('日志缓冲')

    // The component calls .slice().reverse() on getLogs output,
    // so the first log in the array appears last in the rendered list.
    const logItems = logCard.findAll('.log-item')
    expect(logItems.length).toBe(2)

    // After reversing: info log is rendered last, error log first
    const firstMeta = logItems[0].find('.log-meta')
    expect(firstMeta.find('.el-tag-stub').text()).toBe('error')
    expect(firstMeta.find('.ns').text()).toBe('ai:stream')
    expect(logItems[0].find('.log-message').text()).toBe('Connection failed')

    const secondMeta = logItems[1].find('.log-meta')
    expect(secondMeta.find('.el-tag-stub').text()).toBe('info')
    expect(secondMeta.find('.ns').text()).toBe('app:startup')
  })

  // -----------------------------------------------------------------
  // 11. AnalyticsDashboard async component is rendered
  // -----------------------------------------------------------------

  it('renders the AnalyticsDashboard component', async () => {
    const wrapper = mountPanel()
    await nextTick()

    expect(wrapper.find('.analytics-dashboard-stub').exists()).toBe(true)
  })

  // -----------------------------------------------------------------
  // 12. Refresh and clear logs buttons call logger manager methods
  // -----------------------------------------------------------------

  it('calls clearLogs and refreshes when clear button is clicked', async () => {
    mockLoggerManager.getLogs.mockReturnValue([
      {
        time: '2026-05-31T10:00:00.000Z',
        timestamp: 1748688000000,
        level: 'info',
        namespace: 'test',
        message: 'test log',
        args: [],
      },
    ])

    const wrapper = mountPanel()
    await nextTick()

    // Find the log configuration card (first card)
    const cards = wrapper.findAll('.el-card-stub')
    const logCard = cards[0]
    const buttons = logCard.findAll('.el-button-stub')

    // Click "清空日志"
    const clearButton = buttons.find(b => b.text() === '清空日志')
    expect(clearButton).toBeDefined()

    await clearButton!.trigger('click')
    await nextTick()

    expect(mockLoggerManager.clearLogs).toHaveBeenCalled()
    // After clearing, getLogs is called again (refreshLogs)
    expect(mockLoggerManager.getLogs).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------
  // 13. Log filter narrows displayed log entries
  // -----------------------------------------------------------------

  it('filters log entries based on log filter input', async () => {
    const mockLogs = [
      {
        time: '2026-05-31T10:00:00.000Z',
        timestamp: 1748688000000,
        level: 'info',
        namespace: 'app:start',
        message: 'App started',
        args: [],
      },
      {
        time: '2026-05-31T10:00:01.000Z',
        timestamp: 1748688001000,
        level: 'error',
        namespace: 'ai:stream',
        message: 'Stream failed',
        args: [],
      },
    ]
    mockLoggerManager.getLogs.mockReturnValue(mockLogs)

    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const logCard = cards[cards.length - 1]

    // Initially both logs are shown
    let logItems = logCard.findAll('.log-item')
    expect(logItems.length).toBe(2)

    // The .log-filter class falls through to the ElInput stub's root element
    const filterInput = logCard.find('.log-filter')
    expect(filterInput.exists()).toBe(true)
    await filterInput.setValue('error')
    await nextTick()

    // Only the error log should remain
    logItems = logCard.findAll('.log-item')
    expect(logItems.length).toBe(1)
    expect(logItems[0].find('.el-tag-stub').text()).toBe('error')
  })

  // -----------------------------------------------------------------
  // 14. Logger config change calls configure on the manager
  // -----------------------------------------------------------------

  it('calls loggerManager.configure when log switch is toggled', async () => {
    const wrapper = mountPanel()
    await nextTick()

    const cards = wrapper.findAll('.el-card-stub')
    const logCard = cards[0]
    const switches = logCard.findAll('.el-switch-stub')

    // The log enable switch is the first switch in the log card
    const logSwitch = switches[0]
    await logSwitch.trigger('click')
    await nextTick()

    expect(mockLoggerManager.configure).toHaveBeenCalled()
  })
})
