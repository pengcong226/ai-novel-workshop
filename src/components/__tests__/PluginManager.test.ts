import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia, flushPromises } from '@/test/helpers'
import type { PluginManifest } from '@/plugins/types'

// ---------------------------------------------------------------------------
// Mocks (must precede component imports)
// ---------------------------------------------------------------------------

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
}))

const { mockElMessageSuccess, mockElMessageError, mockElMessageWarning, mockConfirm } = vi.hoisted(() => ({
  mockElMessageSuccess: vi.fn(),
  mockElMessageError: vi.fn(),
  mockElMessageWarning: vi.fn(),
  mockConfirm: vi.fn().mockResolvedValue('confirm'),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mockElMessageSuccess,
    error: mockElMessageError,
    warning: mockElMessageWarning,
  },
  ElMessageBox: {
    confirm: mockConfirm,
  },
}))

vi.mock('@/plugins/loader', () => ({
  PluginLoader: {
    loadFromUrl: vi.fn(),
    loadFromFile: vi.fn(),
    checkCompatibility: vi.fn().mockReturnValue({ compatible: true, issues: [] }),
  },
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { usePluginStore } from '@/stores/plugin'
import PluginManager from '@/components/PluginManager.vue'
import { PluginLoader } from '@/plugins/loader'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createPlugin(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin-1',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'Test Author',
    description: 'A test plugin for unit tests',
    icon: '📦',
    permissions: ['storage', 'network'],
    configuration: {
      apiKey: {
        type: 'string',
        default: '',
        description: 'API Key',
      },
      enabled: {
        type: 'boolean',
        default: true,
        description: 'Feature Toggle',
      },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="el-card-stub"><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'disabled', 'loading', 'plain'],
  emits: ['click'],
  template: '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="el-tabs-stub"><slot /></div>',
}

const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  template: '<div class="el-tab-pane-stub" :data-label="label" :data-name="name"><slot /></div>',
}

const ElSwitchStub = {
  name: 'ElSwitch',
  props: ['modelValue', 'activeText', 'inactiveText', 'loading'],
  emits: ['update:modelValue', 'change'],
  template: '<div class="el-switch-stub" :data-active="modelValue" @click="$emit(\'update:modelValue\', !modelValue); $emit(\'change\', !modelValue)"><slot /></div>',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width'],
  emits: ['update:modelValue'],
  template: '<div class="el-dialog-stub" v-if="modelValue" :data-title="title"><slot /><slot name="footer" /></div>',
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

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-stub" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const ElInputNumberStub = {
  name: 'ElInputNumber',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-number-stub" type="number" :value="modelValue" />',
}

const ElSelectStub = {
  name: 'ElSelect',
  props: ['modelValue', 'multiple'],
  emits: ['update:modelValue'],
  template: '<select class="el-select-stub" :multiple="multiple"><slot /></select>',
}

const ElOptionStub = {
  name: 'ElOption',
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['size', 'type'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p><slot /></div>',
}

const ElDividerStub = {
  name: 'ElDivider',
  template: '<hr class="el-divider-stub" />',
}

const ElCollapseStub = {
  name: 'ElCollapse',
  props: ['modelValue'],
  template: '<div class="el-collapse-stub"><slot /></div>',
}

const ElCollapseItemStub = {
  name: 'ElCollapseItem',
  props: ['title', 'name'],
  template: '<div class="el-collapse-item-stub" :data-title="title"><slot /></div>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const ElUploadStub = {
  name: 'ElUpload',
  props: ['drag', 'autoUpload', 'accept', 'onChange'],
  template: '<div class="el-upload-stub"><slot /></div>',
}

// Icon stubs (used inside templates)
const IconStub = {
  template: '<span class="icon-stub"></span>',
}

const globalStubs = {
  ElCard: ElCardStub,
  ElButton: ElButtonStub,
  ElTabs: ElTabsStub,
  ElTabPane: ElTabPaneStub,
  ElSwitch: ElSwitchStub,
  ElDialog: ElDialogStub,
  ElForm: ElFormStub,
  ElFormItem: ElFormItemStub,
  ElInput: ElInputStub,
  ElInputNumber: ElInputNumberStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElTag: ElTagStub,
  ElEmpty: ElEmptyStub,
  ElDivider: ElDividerStub,
  ElCollapse: ElCollapseStub,
  ElCollapseItem: ElCollapseItemStub,
  ElIcon: ElIconStub,
  ElUpload: ElUploadStub,
  Download: IconStub,
  Refresh: IconStub,
  Setting: IconStub,
  Delete: IconStub,
  Cpu: IconStub,
  Upload: IconStub,
  Operation: IconStub,
  Menu: IconStub,
  Grid: IconStub,
  Position: IconStub,
  UploadFilled: IconStub,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginManager', () => {
  let pluginStore: ReturnType<typeof usePluginStore>

  beforeEach(() => {
    vi.clearAllMocks()
    createTestPinia()
    pluginStore = usePluginStore()
  })

  function mountManager() {
    return mount(PluginManager, {
      global: { stubs: globalStubs },
    })
  }

  // ---------------------------------------------------------------
  // 1. Empty state renders when no plugins are installed
  // ---------------------------------------------------------------

  it('shows empty state when no plugins are installed', async () => {
    const wrapper = mountManager()
    await nextTick()

    const empty = wrapper.find('.el-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('还没有安装插件')
  })

  // ---------------------------------------------------------------
  // 2. Renders installed plugin list with name, version, author
  // ---------------------------------------------------------------

  it('renders installed plugins with name, version, and author', async () => {
    pluginStore.plugins = [
      createPlugin({ id: 'p1', name: 'Alpha Plugin', version: '2.1.0', author: 'Alice' }),
      createPlugin({ id: 'p2', name: 'Beta Plugin', version: '0.5.0', author: 'Bob' }),
    ]

    const wrapper = mountManager()
    await nextTick()

    const pluginCards = wrapper.findAll('.plugin-card')
    expect(pluginCards).toHaveLength(2)

    const firstCard = pluginCards[0]
    expect(firstCard.text()).toContain('Alpha Plugin')
    expect(firstCard.text()).toContain('v2.1.0')
    expect(firstCard.text()).toContain('Alice')

    const secondCard = pluginCards[1]
    expect(secondCard.text()).toContain('Beta Plugin')
    expect(secondCard.text()).toContain('v0.5.0')
    expect(secondCard.text()).toContain('Bob')
  })

  // ---------------------------------------------------------------
  // 3. Shows plugin permissions as tags
  // ---------------------------------------------------------------

  it('displays plugin permissions as translated tags', async () => {
    pluginStore.plugins = [
      createPlugin({ id: 'p1', permissions: ['storage', 'network', 'ai-api'] }),
    ]

    const wrapper = mountManager()
    await nextTick()

    const tags = wrapper.findAll('.plugin-card .el-tag-stub')
    const tagTexts = tags.map(t => t.text())
    expect(tagTexts).toContain('存储访问')
    expect(tagTexts).toContain('网络请求')
    expect(tagTexts).toContain('AI API')
  })

  // ---------------------------------------------------------------
  // 4. Enable/disable toggle calls store methods
  // ---------------------------------------------------------------

  it('calls activatePlugin when toggling an inactive plugin to active', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = [] // inactive

    const activateSpy = vi.spyOn(pluginStore, 'activatePlugin').mockResolvedValue(undefined)

    const wrapper = mountManager()
    await nextTick()

    const toggle = wrapper.find('.plugin-card .el-switch-stub')
    expect(toggle.exists()).toBe(true)
    expect(toggle.attributes('data-active')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()

    expect(activateSpy).toHaveBeenCalledWith('p1')
    expect(mockElMessageSuccess).toHaveBeenCalledWith('插件 Test Plugin 已启用')
  })

  it('calls deactivatePlugin when toggling an active plugin to inactive', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = ['p1'] // active

    const deactivateSpy = vi.spyOn(pluginStore, 'deactivatePlugin').mockResolvedValue(undefined)

    const wrapper = mountManager()
    await nextTick()

    const toggle = wrapper.find('.plugin-card .el-switch-stub')
    expect(toggle.attributes('data-active')).toBe('true')

    await toggle.trigger('click')
    await flushPromises()

    expect(deactivateSpy).toHaveBeenCalledWith('p1')
    expect(mockElMessageSuccess).toHaveBeenCalledWith('插件 Test Plugin 已停用')
  })

  // ---------------------------------------------------------------
  // 5. Toggle error shows error message and reverts state
  // ---------------------------------------------------------------

  it('shows error message when toggle fails and reverts plugin state', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = []

    vi.spyOn(pluginStore, 'activatePlugin').mockRejectedValue(new Error('Network error'))

    const wrapper = mountManager()
    await nextTick()

    const toggle = wrapper.find('.plugin-card .el-switch-stub')
    await toggle.trigger('click')
    await flushPromises()

    expect(mockElMessageError).toHaveBeenCalledWith('操作失败: Network error')
  })

  // ---------------------------------------------------------------
  // 6. Plugin settings dialog opens and populates with settings
  // ---------------------------------------------------------------

  it('opens settings dialog with plugin configuration fields', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = ['p1']
    pluginStore.pluginSettings = { p1: { apiKey: 'test-key' } }

    const wrapper = mountManager()
    await nextTick()

    // Click the settings button
    const buttons = wrapper.findAll('.plugin-card .el-button-stub')
    const settingsButton = buttons.find(b => b.text().includes('设置'))
    expect(settingsButton).toBeDefined()

    await settingsButton!.trigger('click')
    await nextTick()

    // Dialog should appear with the plugin name in title
    const dialog = wrapper.find('.el-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-title')).toContain('Test Plugin')

    // Should have form items for each config field
    const formItems = dialog.findAll('.el-form-item-stub')
    expect(formItems.length).toBeGreaterThanOrEqual(2)

    const labels = formItems.map(f => f.find('label').text())
    expect(labels).toContain('API Key')
    expect(labels).toContain('Feature Toggle')
  })

  // ---------------------------------------------------------------
  // 7. Install from URL shows warning for empty URL
  // ---------------------------------------------------------------

  it('shows warning when install URL is empty', async () => {
    const wrapper = mountManager()
    await nextTick()

    // Open install dialog
    const headerButtons = wrapper.findAll('.header-card .el-button-stub')
    const installButton = headerButtons.find(b => b.text().includes('安装插件'))
    expect(installButton).toBeDefined()

    await installButton!.trigger('click')
    await nextTick()

    // The dialog should now be visible
    const dialog = wrapper.find('.el-dialog-stub')
    expect(dialog.exists()).toBe(true)

    // Find the install button inside the dialog and click it (URL is empty)
    const dialogButtons = dialog.findAll('.el-button-stub')
    const submitButton = dialogButtons.find(b => b.text().trim() === '安装')
    expect(submitButton).toBeDefined()

    await submitButton!.trigger('click')
    await nextTick()

    expect(mockElMessageWarning).toHaveBeenCalledWith('请输入插件URL')
  })

  // ---------------------------------------------------------------
  // 8. Install from URL calls PluginLoader and store
  // ---------------------------------------------------------------

  it('installs plugin from URL successfully', async () => {
    const manifest = createPlugin({ id: 'loaded-plugin', name: 'Loaded Plugin' })
    vi.mocked(PluginLoader.loadFromUrl).mockResolvedValue({
      success: true,
      manifest,
      module: {},
    })

    vi.spyOn(pluginStore, 'installPlugin').mockResolvedValue(undefined)
    vi.spyOn(pluginStore, 'loadInstalledPlugins').mockResolvedValue(undefined)

    const wrapper = mountManager()
    await nextTick()

    // Open install dialog
    const headerButtons = wrapper.findAll('.header-card .el-button-stub')
    const installButton = headerButtons.find(b => b.text().includes('安装插件'))
    await installButton!.trigger('click')
    await nextTick()

    // Type a URL into the input
    const urlInput = wrapper.find('.el-dialog-stub .el-input-stub')
    await urlInput.setValue('https://example.com/manifest.json')

    // Click install
    const dialog = wrapper.find('.el-dialog-stub')
    const dialogButtons = dialog.findAll('.el-button-stub')
    const submitButton = dialogButtons.find(b => b.text().trim() === '安装')
    await submitButton!.trigger('click')
    await nextTick()

    // Wait for async operations
    await flushPromises()

    expect(PluginLoader.loadFromUrl).toHaveBeenCalledWith('https://example.com/manifest.json')
    expect(pluginStore.installPlugin).toHaveBeenCalled()
    expect(mockElMessageSuccess).toHaveBeenCalledWith('插件 Loaded Plugin 安装成功')
  })

  // ---------------------------------------------------------------
  // 9. Install from URL handles load failure
  // ---------------------------------------------------------------

  it('shows error when PluginLoader.loadFromUrl fails', async () => {
    vi.mocked(PluginLoader.loadFromUrl).mockResolvedValue({
      success: false,
      error: 'Manifest not found',
    })

    const wrapper = mountManager()
    await nextTick()

    const headerButtons = wrapper.findAll('.header-card .el-button-stub')
    const installButton = headerButtons.find(b => b.text().includes('安装插件'))
    await installButton!.trigger('click')
    await nextTick()

    const urlInput = wrapper.find('.el-dialog-stub .el-input-stub')
    await urlInput.setValue('https://example.com/bad-manifest.json')

    const dialog = wrapper.find('.el-dialog-stub')
    const submitButton = dialog.findAll('.el-button-stub').find(b => b.text().trim() === '安装')
    await submitButton!.trigger('click')
    await flushPromises()

    expect(mockElMessageError).toHaveBeenCalledWith('Manifest not found')
  })

  // ---------------------------------------------------------------
  // 10. Uninstall plugin calls store after confirmation
  // ---------------------------------------------------------------

  it('uninstalls plugin after user confirms', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = ['p1']

    vi.spyOn(pluginStore, 'uninstallPlugin').mockResolvedValue(undefined)
    mockConfirm.mockResolvedValue('confirm' as any)

    const wrapper = mountManager()
    await nextTick()

    const buttons = wrapper.findAll('.plugin-card .el-button-stub')
    const uninstallButton = buttons.find(b => b.text().includes('卸载'))
    expect(uninstallButton).toBeDefined()

    await uninstallButton!.trigger('click')
    await flushPromises()

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Test Plugin'),
      '卸载插件',
      expect.objectContaining({ type: 'warning' }),
    )

    expect(pluginStore.uninstallPlugin).toHaveBeenCalledWith('p1')
    expect(mockElMessageSuccess).toHaveBeenCalledWith('插件 Test Plugin 已卸载')
  })

  // ---------------------------------------------------------------
  // 11. Uninstall cancelled does not call store
  // ---------------------------------------------------------------

  it('does not uninstall plugin when user cancels confirmation', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = []

    const uninstallSpy = vi.spyOn(pluginStore, 'uninstallPlugin')
    mockConfirm.mockRejectedValue('cancel')

    const wrapper = mountManager()
    await nextTick()

    const buttons = wrapper.findAll('.plugin-card .el-button-stub')
    const uninstallButton = buttons.find(b => b.text().includes('卸载'))
    await uninstallButton!.trigger('click')
    await flushPromises()

    expect(uninstallSpy).not.toHaveBeenCalled()
    expect(mockElMessageError).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------
  // 12. Refresh button calls loadInstalledPlugins
  // ---------------------------------------------------------------

  it('calls loadInstalledPlugins and shows success when refresh is clicked', async () => {
    const loadSpy = vi.spyOn(pluginStore, 'loadInstalledPlugins').mockResolvedValue(undefined)

    const wrapper = mountManager()
    await nextTick()

    const headerButtons = wrapper.findAll('.header-card .el-button-stub')
    const refreshButton = headerButtons.find(b => b.text().includes('刷新'))
    expect(refreshButton).toBeDefined()

    await refreshButton!.trigger('click')
    await flushPromises()

    expect(loadSpy).toHaveBeenCalled()
    expect(mockElMessageSuccess).toHaveBeenCalledWith('插件列表已刷新')
  })

  // ---------------------------------------------------------------
  // 13. Tab switching renders different content
  // ---------------------------------------------------------------

  it('renders all three tab panes for installed, extensions, and commands', async () => {
    pluginStore.plugins = [createPlugin()]

    const wrapper = mountManager()
    await nextTick()

    const tabPanes = wrapper.findAll('.el-tab-pane-stub')
    const names = tabPanes.map(t => t.attributes('data-name'))
    expect(names).toContain('installed')
    expect(names).toContain('extensions')
    expect(names).toContain('commands')
  })

  // ---------------------------------------------------------------
  // 14. Active plugin gets is-active class
  // ---------------------------------------------------------------

  it('adds is-active class to cards of active plugins', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = ['p1']

    const wrapper = mountManager()
    await nextTick()

    const pluginCard = wrapper.find('.plugin-card')
    expect(pluginCard.classes()).toContain('is-active')
  })

  it('does not add is-active class to cards of inactive plugins', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1' })]
    pluginStore.activePlugins = []

    const wrapper = mountManager()
    await nextTick()

    const pluginCard = wrapper.find('.plugin-card')
    expect(pluginCard.classes()).not.toContain('is-active')
  })

  // ---------------------------------------------------------------
  // 15. Plugin with no configuration shows empty state in settings
  // ---------------------------------------------------------------

  it('shows empty state in settings dialog when plugin has no configuration', async () => {
    pluginStore.plugins = [createPlugin({ id: 'p1', configuration: undefined })]
    pluginStore.activePlugins = ['p1']

    const wrapper = mountManager()
    await nextTick()

    const buttons = wrapper.findAll('.plugin-card .el-button-stub')
    const settingsButton = buttons.find(b => b.text().includes('设置'))
    await settingsButton!.trigger('click')
    await nextTick()

    const dialog = wrapper.find('.el-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('此插件没有可配置项')
  })
})
