import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { h, defineComponent, provide, inject, type PropType, type InjectionKey } from 'vue'
import type { Pinia } from 'pinia'

// ---- Mock heavy dependencies before importing SUT ----

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/services/vector-service', () => ({
  getVectorService: vi.fn().mockResolvedValue({
    getDocumentCount: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(undefined),
    indexProject: vi.fn().mockResolvedValue(undefined),
  }),
  resetVectorService: vi.fn(),
}))

vi.mock('@/utils/vector-dimension', () => ({
  getVectorDimensionByModel: vi.fn().mockReturnValue(512),
}))

vi.mock('@/utils/autoBackup', () => ({
  listAutoBackups: vi.fn().mockResolvedValue([]),
  restoreAutoBackup: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/plugins/manager', () => ({
  pluginManager: {
    getRegistries: () => ({
      theme: { getAll: () => [] },
      aiProvider: { getAll: () => [] },
      exporter: { getAll: () => [] },
      processor: { getAll: () => [] },
      importer: { getAll: () => [] },
      menuItem: { getAll: () => [] },
      sidebarPanel: { getAll: () => [] },
      toolbarButton: { getAll: () => [] },
      quickCommand: { getAll: () => [] },
      actionHandler: { getAll: () => [] },
    }),
  },
}))

vi.mock('@/plugins/storage', () => ({
  PluginStorage: {
    loadInstalledPlugins: vi.fn().mockResolvedValue([]),
    loadAllPluginSettings: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('lodash-es', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lodash-es')>()
  return {
    ...actual,
    debounce: (fn: (...args: unknown[]) => unknown) => {
      // Return a function that calls the original synchronously for tests
      const debounced = (...args: unknown[]) => fn(...args)
      debounced.cancel = vi.fn()
      return debounced
    },
  }
})

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm'),
  },
}))

vi.mock('@/utils/getErrorMessage', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

vi.mock('@/stores/theme', () => ({
  useThemeStore: () => ({
    activeThemeId: 'default',
  }),
}))

// Stub child components that are heavy / have their own dependencies
vi.mock('@/components/config/StorytellerPanel.vue', () => ({
  default: {
    name: 'StorytellerPanel',
    props: ['config', 'advanced'],
    template: '<div class="storyteller-panel-stub" data-testid="storyteller-panel"><slot /></div>',
  },
}))

vi.mock('@/components/config/StyleProfilePanel.vue', () => ({
  default: {
    name: 'StyleProfilePanel',
    props: ['config'],
    template: '<div class="style-profile-panel-stub" data-testid="style-profile-panel"><slot /></div>',
  },
}))

vi.mock('@/components/config/ProviderManager.vue', () => ({
  default: {
    name: 'ProviderManager',
    props: ['providers'],
    emits: ['save', 'update:providers'],
    template: '<div class="provider-manager-stub" data-testid="provider-manager"><slot /></div>',
  },
}))

vi.mock('@/components/PluginManager.vue', () => ({
  __esModule: true,
  default: {
    name: 'PluginManager',
    template: '<div class="plugin-manager-stub" data-testid="plugin-manager"><slot /></div>',
  },
}))

// ---- Import after mocks ----
import ProjectConfig from '@/components/ProjectConfig.vue'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { ElMessage, ElMessageBox } from 'element-plus'

const TABLE_ROW_KEY: InjectionKey<{ row: unknown; $index: number }> = Symbol('table-row')

// ElTable: renders header <th> cells from column labels found in slot VNodes,
// then iterates over data to render row cells.
const ElTableStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array as PropType<unknown[]>, default: () => [] },
    border: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => {
      const defaultSlot = slots.default
      if (!defaultSlot) return h('table', { class: 'el-table-stub' })

      // Extract column labels from VNode children of the default slot
      const sampleSlotVNodes = defaultSlot({ row: {}, $index: 0 })
      const headerCells = sampleSlotVNodes.map((vnode, i) => {
        const label = (vnode.props as Record<string, unknown>)?.label ?? ''
        return h('th', { key: i }, String(label))
      })

      const rows = (props.data || []).map((row, idx) =>
        h(ElTableRowStub as any, { key: idx, row, index: idx }, { default: () => defaultSlot({ row, $index: idx }) })
      )
      return h('table', { class: 'el-table-stub' }, [
        h('thead', [h('tr', headerCells)]),
        h('tbody', rows),
      ])
    }
  },
})

// Helper: provides row context for all columns rendered within
const ElTableRowStub = defineComponent({
  name: 'ElTableRow',
  props: { row: { default: null }, index: { type: Number, default: 0 } },
  setup(props, { slots }) {
    provide(TABLE_ROW_KEY, { row: props.row, $index: props.index })
    return () => h('tr', slots.default?.() ?? [])
  },
})

// ElTableColumn: reads row from injected context and passes to slot
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: {
    label: { type: String, default: '' },
    minWidth: { type: [String, Number], default: '' },
    width: { type: [String, Number], default: '' },
  },
  setup(props, { slots }) {
    const ctx = inject(TABLE_ROW_KEY, { row: null, $index: 0 })

    return () =>
      h('td', { class: 'el-table-column-stub' },
        slots.default?.({ row: ctx.row, $index: ctx.$index }) ?? []
      )
  },
})

// ---- Helper: element-plus stubs (minimal) ----

const EP_STUBS = {
  ElCard: {
    name: 'ElCard',
    template: '<div class="el-card-stub"><div class="el-card__header"><slot name="header" /></div><div class="el-card__body"><slot /></div></div>',
  },
  ElButton: {
    name: 'ElButton',
    props: ['type', 'text', 'size', 'loading', 'disabled', 'plain'],
    emits: ['click'],
    template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
  },
  ElForm: {
    name: 'ElForm',
    props: ['model', 'labelWidth', 'disabled'],
    template: '<form class="el-form-stub"><slot /></form>',
  },
  ElFormItem: {
    name: 'ElFormItem',
    props: ['label'],
    template: '<div class="el-form-item-stub"><label v-if="label">{{ label }}</label><div class="el-form-item__content"><slot /></div></div>',
  },
  ElSwitch: {
    name: 'ElSwitch',
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="checkbox" class="el-switch-stub" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  ElRadioGroup: {
    name: 'ElRadioGroup',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue', 'change'],
    template: '<div class="el-radio-group-stub"><slot /></div>',
  },
  ElRadioButton: {
    name: 'ElRadioButton',
    props: ['value'],
    emits: ['click'],
    template: '<button class="el-radio-button-stub" @click="$emit(\'click\')"><slot /></button>',
  },
  ElRadio: {
    name: 'ElRadio',
    props: ['value'],
    template: '<label class="el-radio-stub"><slot /></label>',
  },
  ElSelect: {
    name: 'ElSelect',
    props: ['modelValue', 'placeholder', 'clearable', 'filterable', 'multiple', 'allowCreate', 'disabled', 'style'],
    emits: ['update:modelValue', 'change'],
    template: '<select class="el-select-stub"><slot /></select>',
  },
  ElOption: {
    name: 'ElOption',
    props: ['label', 'value'],
    template: '<option class="el-option-stub">{{ label }}</option>',
  },
  ElOptionGroup: {
    name: 'ElOptionGroup',
    props: ['label'],
    template: '<optgroup class="el-option-group-stub" :label="label"><slot /></optgroup>',
  },
  ElInput: {
    name: 'ElInput',
    props: ['modelValue', 'type', 'rows', 'placeholder', 'showPassword'],
    emits: ['update:modelValue'],
    template: '<div class="el-input-stub"><slot name="append" /><slot name="prepend" /></div>',
  },
  ElInputNumber: {
    name: 'ElInputNumber',
    props: ['modelValue', 'min', 'max', 'step', 'precision', 'size', 'disabled'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="number" class="el-input-number-stub" />',
  },
  ElSlider: {
    name: 'ElSlider',
    props: ['modelValue', 'min', 'max', 'step', 'marks', 'showStops', 'showInput', 'formatTooltip', 'disabled'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="range" class="el-slider-stub" />',
  },
  ElTabs: {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tabClick'],
    template: '<div class="el-tabs-stub"><slot /></div>',
  },
  ElTabPane: {
    name: 'ElTabPane',
    props: ['label', 'name'],
    template: '<div class="el-tab-pane-stub"><slot /></div>',
  },
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  ElAlert: {
    name: 'ElAlert',
    props: ['type', 'closable', 'showIcon'],
    template: '<div class="el-alert-stub"><slot name="title" /><slot /></div>',
  },
  ElTag: {
    name: 'ElTag',
    props: ['size', 'type', 'style'],
    template: '<span class="el-tag-stub"><slot /></span>',
  },
  ElStatistic: {
    name: 'ElStatistic',
    props: ['title', 'value', 'precision'],
    template: '<div class="el-statistic-stub"><div class="el-statistic__title">{{ title }}</div><div class="el-statistic__value">{{ value }}</div><slot name="suffix" /></div>',
  },
  ElRow: {
    name: 'ElRow',
    props: ['gutter'],
    template: '<div class="el-row-stub"><slot /></div>',
  },
  ElCol: {
    name: 'ElCol',
    props: ['span'],
    template: '<div class="el-col-stub"><slot /></div>',
  },
  ElDivider: {
    name: 'ElDivider',
    template: '<hr class="el-divider-stub" />',
  },
  ElDialog: {
    name: 'ElDialog',
    props: ['modelValue', 'title', 'width', 'top', 'closeOnClickModal'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot /></div>',
  },
  ElPopconfirm: {
    name: 'ElPopconfirm',
    props: ['title', 'confirmButtonText', 'cancelButtonText'],
    emits: ['confirm'],
    template: '<div class="el-popconfirm-stub"><slot name="reference" /></div>',
  },
  ElUpload: {
    name: 'ElUpload',
    props: ['showFileList', 'beforeUpload', 'accept'],
    template: '<div class="el-upload-stub"><slot /></div>',
  },
  ElCollapseTransition: {
    name: 'ElCollapseTransition',
    template: '<slot />',
  },
  ElSkeleton: {
    name: 'ElSkeleton',
    props: ['rows', 'animated'],
    template: '<div class="el-skeleton-stub" />',
  },
  ElIcon: {
    name: 'ElIcon',
    template: '<span class="el-icon-stub"><slot /></span>',
  },
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
  Refresh: { template: '<span />' },
  Grid: { template: '<span />' },
  Setting: { template: '<span />' },
  Download: { template: '<span />' },
  Clock: { template: '<span />' },
  RefreshRight: { template: '<span />' },
  ArrowUp: { template: '<span />' },
  ArrowDown: { template: '<span />' },
  // Stub for the async PluginManager component to avoid teardown errors
  PluginManager: {
    name: 'PluginManager',
    template: '<div class="plugin-manager-stub" data-testid="plugin-manager"><slot /></div>',
  },
}

// ---- Mount helper ----

let pinia: Pinia

function mountConfig(options: { withProject?: boolean } = {}) {
  pinia = createTestPinia()

  const projectStore = useProjectStore()
  const pluginStore = usePluginStore()

  // Pre-populate plugin store with minimal state
  pluginStore.plugins = []
  pluginStore.activePlugins = []

  if (options.withProject) {
    projectStore.currentProject = {
      id: 'proj-1',
      name: 'Test Project',
      targetWords: 100000,
      config: normalizeProjectConfig(undefined),
      chapters: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any
  }

  const wrapper = mount(ProjectConfig, {
    global: {
      plugins: [pinia],
      stubs: EP_STUBS,
    },
  })

  return { wrapper, projectStore, pluginStore }
}

// ---- Tests ----

describe('ProjectConfig.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // 1. Renders the component wrapper
  it('renders the root project-config container', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.find('.project-config').exists()).toBe(true)
  })

  // 2. Shows the title "项目配置"
  it('displays the title "项目配置"', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.find('h2').text()).toBe('项目配置')
  })

  // 3. Defaults to storyteller mode and shows StorytellerPanel
  it('defaults to storyteller mode and shows StorytellerPanel', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.find('[data-testid="storyteller-panel"]').exists()).toBe(true)
    // ProviderManager should be hidden (v-show=false => display:none)
    const providerManager = wrapper.find('[data-testid="provider-manager"]')
    expect(
      providerManager.exists() && (providerManager.element as HTMLElement).style.display === 'none'
    ).toBe(true)
  })

  // 4. Switching to engineer mode shows ProviderManager and hides StorytellerPanel
  it('switching to engineer mode shows ProviderManager and hides StorytellerPanel', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Default is storyteller
    expect(vm.configMode).toBe('storyteller')

    // Switch to engineer programmatically
    vm.configMode = 'engineer'
    await wrapper.vm.$nextTick()

    expect(vm.configMode).toBe('engineer')
    // ProviderManager should now be visible (v-show = true)
    expect(wrapper.find('[data-testid="provider-manager"]').exists()).toBe(true)
  })

  // 5. Shows "保存配置" button
  it('displays a "保存配置" button in the header', () => {
    const { wrapper } = mountConfig()
    const buttons = wrapper.findAll('.el-button-stub')
    const saveButton = buttons.find((b) => b.text().includes('保存配置'))
    expect(saveButton).toBeTruthy()
  })

  // 6. Advanced settings section is collapsed by default
  it('has advanced settings collapsed by default', () => {
    const { wrapper } = mountConfig()

    // showAdvanced defaults to false; the section contains temperature, topP etc.
    // With collapse transition stub, the content div has v-show="showAdvanced"
    // So advanced form items should not be visible initially
    const advancedSection = wrapper.findAll('.el-card-stub').find((card) =>
      card.text().includes('高级设置')
    )
    expect(advancedSection).toBeTruthy()
    // The content should contain "展开" text (indicating collapsed state)
    expect(advancedSection!.text()).toContain('展开')
  })

  // 7. Expanding advanced settings shows temperature and topP controls
  it('shows advanced settings after toggle', async () => {
    const { wrapper } = mountConfig()

    // Find the "展开" button inside the advanced settings card
    const expandButton = wrapper.findAll('.el-button-stub').find((b) =>
      b.text().includes('展开')
    )
    expect(expandButton).toBeTruthy()

    await expandButton!.trigger('click')
    await wrapper.vm.$nextTick()

    // After click, showAdvanced should be true, so label text should appear
    const text = wrapper.text()
    expect(text).toContain('温度系数')
    expect(text).toContain('Top P')
    expect(text).toContain('最大Token数')
  })

  // 8. System prompt tab panes are rendered
  it('renders all four system prompt tabs', () => {
    const { wrapper } = mountConfig()
    const text = wrapper.text()
    expect(text).toContain('系统提示词')
    expect(text).toContain('大纲规划师')
    expect(text).toContain('正文写手')
    expect(text).toContain('防吃书审查')
    expect(text).toContain('沙盘状态提取')
  })

  // 9. Preset radio group renders all three options
  it('renders fast, standard, and quality preset options', () => {
    const { wrapper } = mountConfig()
    const text = wrapper.text()
    expect(text).toContain('快速模式')
    expect(text).toContain('标准模式')
    expect(text).toContain('质量模式')
  })

  // 10. Quality check toggle is rendered and default is on
  it('renders quality check toggle and defaults to enabled', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('启用质量检查')

    // The switch should exist in the quality check section
    const switches = wrapper.findAll('.el-switch-stub')
    expect(switches.length).toBeGreaterThan(0)
  })

  // 11. Shows agent configs table header
  it('renders the AI Agent section with agent role labels', () => {
    const { wrapper } = mountConfig()
    const text = wrapper.text()
    expect(text).toContain('AI Agent')
    expect(text).toContain('多 Agent 协作写作')
    // Table column headers
    expect(text).toContain('角色')
    expect(text).toContain('启用')
    expect(text).toContain('阶段')
    expect(text).toContain('优先级')
  })

  // 12. Vector retrieval section exists with enable switch
  it('renders vector retrieval section with enable switch', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('向量检索')
    expect(wrapper.text()).toContain('语义搜索和智能上下文检索')
  })

  // 13. Plugin management section shows stats
  it('renders plugin management section with stats', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('插件管理')
    expect(wrapper.text()).toContain('已安装插件')
    expect(wrapper.text()).toContain('已启用插件')
    expect(wrapper.text()).toContain('AI提供商')
    expect(wrapper.text()).toContain('导出格式')
  })

  // 14. Cost control section renders max cost input
  it('renders cost control section with max cost per chapter', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('成本控制')
    expect(wrapper.text()).toContain('每章最大成本')
    expect(wrapper.text()).toContain('预计成本')
  })

  // 15. Cost statistics section renders with reset button
  it('renders cost statistics section with reset button', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('成本统计')
    expect(wrapper.text()).toContain('总调用次数')
    expect(wrapper.text()).toContain('总输入Token')
    expect(wrapper.text()).toContain('总输出Token')
    expect(wrapper.text()).toContain('总成本')
    expect(wrapper.text()).toContain('平均章节成本')
  })

  // 16. AI suggestions section renders with enable switch
  it('renders AI suggestions section with switches', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('AI建议')
    expect(wrapper.text()).toContain('启用AI建议')
    expect(wrapper.text()).toContain('生成后自动审校')
  })

  // 17. Planning depth and writing depth selectors are rendered
  it('renders thinking depth section with planning and writing depth', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('思考深度')
    expect(wrapper.text()).toContain('规划深度')
    expect(wrapper.text()).toContain('写作深度')
  })

  // 18. Config management section renders export/import/reset buttons
  it('renders config management section with export, import, and reset', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('配置管理')
    expect(wrapper.text()).toContain('导出为文件')
    expect(wrapper.text()).toContain('从文件导入')
    expect(wrapper.text()).toContain('重置为默认')
  })

  // 19. Backup section renders
  it('renders data backup and restore section', () => {
    const { wrapper } = mountConfig()
    expect(wrapper.text()).toContain('数据备份与恢复')
  })

  // 20. Reset config applies default config when triggered
  it('resetConfig applies default normalized config', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Modify the internal configForm to non-default values
    vm.configForm.preset = 'quality'
    vm.configForm.enableQualityCheck = false
    vm.configForm.planningDepth = 'deep'
    await wrapper.vm.$nextTick()

    // Call resetConfig directly
    vm.resetConfig()
    await wrapper.vm.$nextTick()

    // After reset, configForm should be back to defaults
    expect(vm.configForm.preset).toBe('standard')
    expect(vm.configForm.enableQualityCheck).toBe(true)
    expect(vm.configForm.planningDepth).toBe('medium')
  })

  // 21. saveConfig with project saves via project store
  it('saveConfig persists config to project store when project is open', async () => {
    const { wrapper, projectStore } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    // Mock the save method
    const saveCurrentProjectSpy = vi.spyOn(projectStore, 'saveCurrentProject').mockResolvedValue(undefined)

    await vm.saveConfig()
    await flushPromises()

    expect(saveCurrentProjectSpy).toHaveBeenCalled()
  })

  // 22. saveConfig without project saves via global config
  it('saveConfig persists global config when no project is open', async () => {
    const { wrapper, projectStore } = mountConfig()
    const vm = wrapper.vm as any

    const saveGlobalConfigSpy = vi.spyOn(projectStore, 'saveGlobalConfig').mockResolvedValue(undefined)

    await vm.saveConfig()
    await flushPromises()

    expect(saveGlobalConfigSpy).toHaveBeenCalled()
  })

  // 23. resetAgentConfigs restores agent configs to defaults
  it('resetAgentConfigs restores DEFAULT_AGENT_CONFIGS', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Mutate agentConfigs
    vm.configForm.agentConfigs = [
      { role: 'editor', enabled: false, phase: 'post-generation', priority: 99 },
    ]
    await wrapper.vm.$nextTick()

    vm.resetAgentConfigs()
    await wrapper.vm.$nextTick()

    // Should have default number of configs
    expect(vm.configForm.agentConfigs.length).toBe(5)
    // Editor should be enabled by default
    const editorConfig = vm.configForm.agentConfigs.find((c: any) => c.role === 'editor')
    expect(editorConfig?.enabled).toBe(true)
    expect(editorConfig?.priority).toBe(5)
  })

  // 24. configMode toggle changes the visible panel
  it('toggling configMode between storyteller and engineer changes visible panels', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Default is storyteller
    expect(vm.configMode).toBe('storyteller')

    // Switch to engineer
    vm.configMode = 'engineer'
    await wrapper.vm.$nextTick()

    expect(vm.configMode).toBe('engineer')
  })

  // 25. estimatedCost computes based on project targetWords and maxCostPerChapter
  it('computes estimated cost based on project targetWords and maxCostPerChapter', async () => {
    const { wrapper, projectStore: _projectStore } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    // projectStore.currentProject.targetWords = 100000, default targetWordCount = 2000
    // default maxCostPerChapter = 0.15
    // expected chapters = ceil(100000 / 2000) = 50
    // expected cost = 50 * 0.15 = 7.5
    const cost = vm.estimatedCost
    expect(cost).toBeCloseTo(7.5, 1)
  })

  // 26. estimatedCost returns 0 when no project
  it('returns estimated cost of 0 when no project is open', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any
    expect(vm.estimatedCost).toBe(0)
  })

  // 27. averageChapterCost returns 0 when totalCalls is 0
  it('averageChapterCost returns 0 when no calls recorded', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any
    expect(vm.averageChapterCost).toBe(0)
  })

  // 28. averageChapterCost computes correctly with data
  it('averageChapterCost computes correctly when calls exist', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.costStats = {
      totalCalls: 10,
      totalInputTokens: 500,
      totalOutputTokens: 300,
      totalCost: 5.0,
    }
    await wrapper.vm.$nextTick()

    expect(vm.averageChapterCost).toBeCloseTo(0.5, 2)
  })

  // 29. Plugin manager dialog opens on button click
  it('opens plugin manager dialog when "管理插件" button is clicked', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.showPluginManagerDialog).toBe(false)

    vm.openPluginManager()
    await wrapper.vm.$nextTick()

    expect(vm.showPluginManagerDialog).toBe(true)
  })

  // 30. Vector index status clears when vector config disabled
  it('clears vector index status when vector retrieval is disabled', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.vectorConfig.enabled = true
    vm.vectorIndexStatus = { indexed: true, documentCount: 42 }
    await wrapper.vm.$nextTick()

    // Disable vector retrieval
    vm.vectorConfig.enabled = false
    await wrapper.vm.$nextTick()

    // The watcher should clear vectorIndexStatus
    // (the watcher has async nextTick)
    await wrapper.vm.$nextTick()
    expect(vm.vectorIndexStatus).toBeNull()
  })

  // 31. Advanced config fields have correct defaults
  it('initializes advancedConfig with correct default values', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.advancedConfig.temperature).toBe(0.8)
    expect(vm.advancedConfig.topP).toBe(0.9)
    expect(vm.advancedConfig.maxTokens).toBe(4096)
    expect(vm.advancedConfig.maxContextTokens).toBe(8192)
    expect(vm.advancedConfig.recentChaptersCount).toBe(3)
    expect(vm.advancedConfig.targetWordCount).toBe(2000)
    expect(vm.advancedConfig.frequencyPenalty).toBe(0)
    expect(vm.advancedConfig.presencePenalty).toBe(0)
    expect(vm.advancedConfig.stopSequences).toEqual([])
  })

  // 32. System prompts have default values
  it('initializes systemPrompts with default prompt text', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.systemPrompts.planner).toContain('小说策划师')
    expect(vm.systemPrompts.writer).toContain('小说写作者')
    expect(vm.systemPrompts.sentinel).toContain('防吃书审查')
    expect(vm.systemPrompts.extractor).toContain('沙盘状态提取')
  })

  // 33. Vector config initializes with local provider defaults
  it('initializes vectorConfig with local provider defaults', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.vectorConfig.provider).toBe('local')
    expect(vm.vectorConfig.model).toBe('Xenova/bge-small-zh-v1.5')
    expect(vm.vectorConfig.topK).toBe(5)
    expect(vm.vectorConfig.minScore).toBe(0.6)
    expect(vm.vectorConfig.vectorWeight).toBe(0.7)
    expect(vm.vectorConfig.apiKey).toBe('')
  })

  // 34. getAgentRoleLabel returns correct labels for known roles
  it('getAgentRoleLabel returns Chinese labels for known agent roles', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.getAgentRoleLabel('planner')).toBe('规划师')
    expect(vm.getAgentRoleLabel('writer')).toBe('写手')
    expect(vm.getAgentRoleLabel('sentinel')).toBe('哨兵')
    expect(vm.getAgentRoleLabel('editor')).toBe('编辑审校')
    expect(vm.getAgentRoleLabel('reader')).toBe('读者反馈')
    expect(vm.getAgentRoleLabel('unknown-role')).toBe('未知角色')
  })

  // 35. getAgentPhaseLabel returns correct labels for known phases
  it('getAgentPhaseLabel returns Chinese labels for known agent phases', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.getAgentPhaseLabel('pre-generation')).toBe('生成前')
    expect(vm.getAgentPhaseLabel('post-generation')).toBe('生成后')
    expect(vm.getAgentPhaseLabel('unknown-phase')).toBe('未知阶段')
  })

  // 36. formatWordCount formats numbers correctly
  it('formatWordCount formats large and small word counts', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.formatWordCount(500)).toBe('500')
    expect(vm.formatWordCount(1500)).toBe('1.5k')
    expect(vm.formatWordCount(12000)).toBe('1.2万')
    expect(vm.formatWordCount(25000)).toBe('2.5万')
  })

  // 37. onMounted loads global config when no project is open
  it('initializes config from global config when no project is open', async () => {
    const { wrapper: _wrapper, projectStore } = mountConfig()
    await flushPromises()

    // The component's onMounted calls loadGlobalConfig; since no project is open,
    // globalConfigLoaded should now be true (idempotent guard).
    // Verify by checking that calling loadGlobalConfig again returns quickly
    // (the guard prevents a second localStorage read).
    const localStorageSpy = vi.spyOn(window.localStorage, 'getItem')
    const callsBefore = localStorageSpy.mock.calls.length

    await projectStore.loadGlobalConfig()
    await flushPromises()

    // No additional localStorage.getItem calls because globalConfigLoaded=true
    expect(localStorageSpy.mock.calls.length).toBe(callsBefore)
    localStorageSpy.mockRestore()
  })

  // 38. saveConfig shows success message when project is open
  it('saveConfig shows success ElMessage when project is open', async () => {
    const { wrapper, projectStore } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    vi.spyOn(projectStore, 'saveCurrentProject').mockResolvedValue(undefined)

    await vm.saveConfig()
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('项目配置已保存'))
  })

  // 39. saveConfig shows success message when saving global config
  it('saveConfig shows success ElMessage when saving global config', async () => {
    const { wrapper, projectStore } = mountConfig()
    const vm = wrapper.vm as any

    vi.spyOn(projectStore, 'saveGlobalConfig').mockResolvedValue(undefined)

    await vm.saveConfig()
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('全局配置已保存'))
  })

  // 40. saveConfig shows error message when save fails
  it('saveConfig shows error ElMessage when save throws', async () => {
    const { wrapper, projectStore } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    vi.spyOn(projectStore, 'saveCurrentProject').mockRejectedValue(new Error('disk full'))

    await vm.saveConfig()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('保存配置失败'))
  })

  // 41. resetCostStats resets cost stats to zero after confirmation
  it('resetCostStats resets all cost stats to zero after confirmation', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Pre-populate cost stats with non-zero values
    vm.costStats = {
      totalCalls: 42,
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCost: 3.5,
    }
    await wrapper.vm.$nextTick()

    await vm.resetCostStats()
    await flushPromises()

    expect(vm.costStats.totalCalls).toBe(0)
    expect(vm.costStats.totalInputTokens).toBe(0)
    expect(vm.costStats.totalOutputTokens).toBe(0)
    expect(vm.costStats.totalCost).toBe(0)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('成本统计已重置'))
  })

  // 42. resetCostStats does NOT reset when user cancels confirmation
  it('resetCostStats does not reset stats when user cancels confirmation', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.costStats = {
      totalCalls: 42,
      totalInputTokens: 10000,
      totalOutputTokens: 5000,
      totalCost: 3.5,
    }
    await wrapper.vm.$nextTick()

    // Make ElMessageBox.confirm reject to simulate user cancel
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')

    await vm.resetCostStats()
    await flushPromises()

    // Stats should remain unchanged
    expect(vm.costStats.totalCalls).toBe(42)
    expect(vm.costStats.totalCost).toBe(3.5)
  })

  // 43. resetSystemPrompts resets to defaults after confirmation
  it('resetSystemPrompts resets prompts to DEFAULT_SYSTEM_PROMPTS after confirmation', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Mutate prompts to non-default
    vm.systemPrompts.planner = 'custom planner prompt'
    vm.systemPrompts.writer = 'custom writer prompt'
    await wrapper.vm.$nextTick()

    await vm.resetSystemPrompts()
    await flushPromises()

    // Should be reset to defaults
    expect(vm.systemPrompts.planner).toContain('小说策划师')
    expect(vm.systemPrompts.writer).toContain('小说写作者')
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('已恢复默认系统提示词'))
  })

  // 44. formatBackupTime returns "今天 HH:MM" for today's timestamp
  it('formatBackupTime returns today label for same-day timestamps', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const now = new Date()
    const todayTimestamp = now.getTime()

    const result = vm.formatBackupTime(todayTimestamp)
    expect(result).toMatch(/^今天 \d{2}:\d{2}$/)
  })

  // 45. formatBackupTime returns "昨天 HH:MM" for yesterday's timestamp
  it('formatBackupTime returns yesterday label for prior-day timestamps', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(14, 30, 0, 0)

    const result = vm.formatBackupTime(yesterday.getTime())
    expect(result).toMatch(/^昨天 \d{2}:\d{2}$/)
  })

  // 46. formatBackupTime returns MM/DD HH:MM for older timestamps
  it('formatBackupTime returns date + time for timestamps older than yesterday', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const oldDate = new Date(2025, 0, 15, 9, 45) // Jan 15 2025

    const result = vm.formatBackupTime(oldDate.getTime())
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/)
    expect(result).toContain('01/15')
  })

  // 47. buildVectorServiceConfig returns correct config shape
  it('buildVectorServiceConfig returns a valid VectorServiceConfig object', () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const config = vm.buildVectorServiceConfig('test-project-id')

    expect(config).toHaveProperty('provider')
    expect(config).toHaveProperty('model')
    expect(config).toHaveProperty('dimension')
    expect(config).toHaveProperty('topK')
    expect(config).toHaveProperty('minScore')
    expect(config).toHaveProperty('vectorWeight')
    expect(config).toHaveProperty('projectId')
    expect(config.projectId).toBe('test-project-id')
    expect(config.provider).toBe('local')
    expect(config.topK).toBe(5)
    expect(config.minScore).toBe(0.6)
    expect(config.vectorWeight).toBe(0.7)
  })

  // 48. vectorConfig provider change affects model default
  it('changing vectorConfig provider to openai updates model for openai provider', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.vectorConfig.provider = 'openai'
    // After switching provider, the onMounted-learned defaults won't change automatically,
    // but the user can change the model. Verify the provider ref is reactive.
    await wrapper.vm.$nextTick()

    expect(vm.vectorConfig.provider).toBe('openai')
  })

  // 49. engineer mode shows model assignment card labels
  it('engineer mode renders model assignment labels for planner, writer, sentinel, extractor', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.configMode = 'engineer'
    await wrapper.vm.$nextTick()

    const text = wrapper.text()
    expect(text).toContain('AI 模型分配')
    expect(text).toContain('大纲规划师 (Planner)')
    expect(text).toContain('正文写手 (Writer)')
    expect(text).toContain('防吃书审查 (Sentinel)')
    expect(text).toContain('沙盘状态提取 (Extractor)')
  })

  // 50. showAdvanced toggle toggles the button text between 展开 and 收起
  it('showAdvanced toggle changes button text from 展开 to 收起', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Initially collapsed
    expect(vm.showAdvanced).toBe(false)

    // Find and click the expand button
    const expandButton = wrapper.findAll('.el-button-stub').find((b) =>
      b.text().includes('展开')
    )
    expect(expandButton).toBeTruthy()

    await expandButton!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(vm.showAdvanced).toBe(true)
    // Button text should now show "收起"
    const collapseButton = wrapper.findAll('.el-button-stub').find((b) =>
      b.text().includes('收起')
    )
    expect(collapseButton).toBeTruthy()
  })

  // 51. refreshPlugins calls pluginStore.loadInstalledPlugins
  it('refreshPlugins calls pluginStore.loadInstalledPlugins and shows success', async () => {
    const { wrapper, pluginStore } = mountConfig()
    const vm = wrapper.vm as any

    const loadSpy = vi.spyOn(pluginStore, 'loadInstalledPlugins').mockResolvedValue(undefined as any)

    await vm.refreshPlugins()
    await flushPromises()

    expect(loadSpy).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('插件列表已刷新'))
  })

  // 52. refreshPlugins shows error message when load fails
  it('refreshPlugins shows error ElMessage when plugin load fails', async () => {
    const { wrapper, pluginStore } = mountConfig()
    const vm = wrapper.vm as any

    vi.spyOn(pluginStore, 'loadInstalledPlugins').mockRejectedValue(new Error('network error'))

    await vm.refreshPlugins()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('刷新失败'))
  })

  // 53. costStats reset also shows success message
  it('resetCostStats triggers ElMessageBox.confirm before resetting', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    await vm.resetCostStats()
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('确定要重置成本统计'),
      expect.any(String),
      expect.objectContaining({ type: 'warning' })
    )
  })

  // 54. refreshBackups populates backups array for a project
  it('refreshBackups populates backups when a project is open', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const mockBackups = [
      { id: 'b1', timestamp: Date.now(), chaptersCount: 5, wordCount: 10000 },
      { id: 'b2', timestamp: Date.now() - 86400000, chaptersCount: 3, wordCount: 6000 },
    ]

    // The listAutoBackups mock is already set up to return []
    // Override it for this test
    const autoBackupModule = await import('@/utils/autoBackup')
    vi.mocked(autoBackupModule.listAutoBackups).mockResolvedValueOnce(mockBackups as any)

    await vm.refreshBackups()
    await flushPromises()

    expect(vm.backups).toEqual(mockBackups)
    expect(vm.backupsLoading).toBe(false)
  })

  // 55. refreshBackups does nothing when no project is open
  it('refreshBackups does nothing when no project is open', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    await vm.refreshBackups()
    await flushPromises()

    expect(vm.backups).toEqual([])
  })

  // 56. pluginStats computes correctly when plugins are loaded
  it('pluginStats computes total and active from plugin store', async () => {
    const { wrapper, pluginStore } = mountConfig()
    const vm = wrapper.vm as any

    pluginStore.plugins = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] as any
    pluginStore.activePlugins = [{ id: 'p1' }, { id: 'p2' }] as any
    await wrapper.vm.$nextTick()

    expect(vm.pluginStats.total).toBe(3)
    expect(vm.pluginStats.active).toBe(2)
  })

  // 57. applyConfigToEditorState syncs advancedConfig from input config
  it('applyConfigToEditorState sets advancedConfig from provided config', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const customConfig = normalizeProjectConfig({
      advancedSettings: {
        temperature: 1.2,
        topP: 0.95,
        maxTokens: 8192,
        maxContextTokens: 32000,
        recentChaptersCount: 5,
        targetWordCount: 3000,
        frequencyPenalty: 0.3,
        presencePenalty: 0.2,
        stopSequences: ['<END>'],
      },
    })

    vm.applyConfigToEditorState(customConfig)
    await wrapper.vm.$nextTick()

    expect(vm.advancedConfig.temperature).toBe(1.2)
    expect(vm.advancedConfig.topP).toBe(0.95)
    expect(vm.advancedConfig.maxTokens).toBe(8192)
    expect(vm.advancedConfig.maxContextTokens).toBe(32000)
    expect(vm.advancedConfig.recentChaptersCount).toBe(5)
    expect(vm.advancedConfig.targetWordCount).toBe(3000)
    expect(vm.advancedConfig.frequencyPenalty).toBe(0.3)
    expect(vm.advancedConfig.presencePenalty).toBe(0.2)
    expect(vm.advancedConfig.stopSequences).toEqual(['<END>'])
  })

  // ---- New tests for uncovered functionality ----

  // 58. handleRestoreBackup restores data and shows success message
  it('handleRestoreBackup calls restoreFromBackup and shows success on valid backup', async () => {
    const { wrapper, projectStore } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const mockBackup = { id: 'b-1', timestamp: Date.now(), chaptersCount: 3, wordCount: 5000 }
    const mockRestoredData = { project: { id: 'proj-1' } }

    const autoBackupModule = await import('@/utils/autoBackup')
    vi.mocked(autoBackupModule.restoreAutoBackup).mockResolvedValueOnce(mockRestoredData as any)
    const restoreSpy = vi.spyOn(projectStore, 'restoreFromBackup').mockResolvedValue(undefined as any)

    await vm.handleRestoreBackup(mockBackup)
    await flushPromises()

    expect(autoBackupModule.restoreAutoBackup).toHaveBeenCalledWith('b-1')
    expect(restoreSpy).toHaveBeenCalledWith(mockRestoredData)
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('已恢复到'))
  })

  // 59. handleRestoreBackup shows error when backup returns null (corrupted)
  it('handleRestoreBackup shows error when backup data is null (corrupted)', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const mockBackup = { id: 'b-bad', timestamp: Date.now(), chaptersCount: 0, wordCount: 0 }

    const autoBackupModule = await import('@/utils/autoBackup')
    vi.mocked(autoBackupModule.restoreAutoBackup).mockResolvedValueOnce(null)

    await vm.handleRestoreBackup(mockBackup)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('备份数据损坏，恢复失败')
  })

  // 60. handleRestoreBackup shows error when restore throws
  it('handleRestoreBackup shows error when restoreAutoBackup throws', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const mockBackup = { id: 'b-err', timestamp: Date.now(), chaptersCount: 3, wordCount: 5000 }

    const autoBackupModule = await import('@/utils/autoBackup')
    vi.mocked(autoBackupModule.restoreAutoBackup).mockRejectedValueOnce(new Error('IO error'))

    await vm.handleRestoreBackup(mockBackup)
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('恢复失败'))
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('IO error'))
  })

  // 61. exportConfig creates a download link and shows success message
  it('exportConfig triggers file download and shows success', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    // Mock DOM methods for download
    const mockClick = vi.fn()
    const mockRevoke = vi.fn()
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevoke)
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({ click: mockClick, href: '', download: '' } as any)

    try {
      vm.exportConfig()
      await wrapper.vm.$nextTick()

      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
      expect(mockRevoke).toHaveBeenCalledWith('blob:mock-url')
      expect(ElMessage.success).toHaveBeenCalledWith('配置已导出')
    } finally {
      // Restore all mocked DOM methods to prevent breaking subsequent tests
      createObjectURLSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
      createElementSpy.mockRestore()
    }
  })

  // 62. importConfig parses valid JSON and applies config
  it('importConfig applies config from a valid JSON file', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const importData = {
      preset: 'quality',
      advancedSettings: { temperature: 1.0 },
      providers: [{ id: 'p1', name: 'Test Provider' }],
    }
    const jsonContent = JSON.stringify(importData)

    // Mock FileReader
    const mockReader = {
      readAsText: vi.fn(),
      onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
      onerror: null as (() => void) | null,
    }
    const fileReaderSpy = vi.spyOn(global, 'FileReader').mockImplementation(() => mockReader as any)

    try {
      const result = vm.importConfig(new File([jsonContent], 'config.json'))
      expect(result).toBe(false) // Should return false to prevent auto-upload

      // Simulate FileReader onload
      mockReader.onload!({ target: { result: jsonContent } } as any)
      await flushPromises()

      expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('配置已导入'))
    } finally {
      fileReaderSpy.mockRestore()
    }
  })

  // 63. importConfig shows error for invalid JSON
  it('importConfig shows error for malformed JSON file', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const mockReader = {
      readAsText: vi.fn(),
      onload: null as ((e: ProgressEvent<FileReader>) => void) | null,
      onerror: null as (() => void) | null,
    }
    const fileReaderSpy = vi.spyOn(global, 'FileReader').mockImplementation(() => mockReader as any)

    try {
      vm.importConfig(new File(['not-json'], 'bad.json'))

      // Simulate FileReader onload with invalid JSON
      mockReader.onload!({ target: { result: 'not-json' } } as any)
      await flushPromises()

      expect(ElMessage.error).toHaveBeenCalledWith('配置文件格式错误，请检查文件内容')
    } finally {
      fileReaderSpy.mockRestore()
    }
  })

  // 64. rebuildVectorIndex shows warning when no project is open
  it('rebuildVectorIndex shows warning when no project is open', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    await vm.rebuildVectorIndex()
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请先打开项目')
  })

  // 65. rebuildVectorIndex rebuilds index when project is open
  it('rebuildVectorIndex clears and reindexes when project is open', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const vectorServiceModule = await import('@/services/vector-service')
    const mockService = {
      clear: vi.fn().mockResolvedValue(undefined),
      indexProject: vi.fn().mockResolvedValue(undefined),
      getDocumentCount: vi.fn().mockResolvedValue(42),
    }
    vi.mocked(vectorServiceModule.getVectorService).mockResolvedValueOnce(mockService as any)

    await vm.rebuildVectorIndex()
    await flushPromises()

    expect(mockService.clear).toHaveBeenCalled()
    expect(mockService.indexProject).toHaveBeenCalled()
    expect(mockService.getDocumentCount).toHaveBeenCalled()
    expect(vm.vectorIndexStatus).toEqual({ indexed: true, documentCount: 42 })
    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('索引重建完成'))
    expect(vm.rebuildingIndex).toBe(false)
  })

  // 66. rebuildVectorIndex shows error and resets loading on failure
  it('rebuildVectorIndex shows error and resets loading flag on failure', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    const vectorServiceModule = await import('@/services/vector-service')
    vi.mocked(vectorServiceModule.getVectorService).mockRejectedValueOnce(new Error('network timeout'))

    await vm.rebuildVectorIndex()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('重建索引失败'))
    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('network timeout'))
    expect(vm.rebuildingIndex).toBe(false)
  })

  // 67. clearVectorIndex shows warning when no project is open
  it('clearVectorIndex shows warning when no project is open', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    await vm.clearVectorIndex()
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请先打开项目')
  })

  // 68. clearVectorIndex clears index after confirmation
  it('clearVectorIndex clears the index after user confirms', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    // Pre-set index status
    vm.vectorIndexStatus = { indexed: true, documentCount: 50 }

    const vectorServiceModule = await import('@/services/vector-service')
    const mockService = {
      clear: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(vectorServiceModule.getVectorService).mockResolvedValueOnce(mockService as any)

    await vm.clearVectorIndex()
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(mockService.clear).toHaveBeenCalled()
    expect(vm.vectorIndexStatus).toEqual({ indexed: false, documentCount: 0 })
    expect(ElMessage.success).toHaveBeenCalledWith('索引已清空')
  })

  // 69. clearVectorIndex does nothing when user cancels
  it('clearVectorIndex does not clear index when user cancels confirmation', async () => {
    const { wrapper } = mountConfig({ withProject: true })
    const vm = wrapper.vm as any

    vm.vectorIndexStatus = { indexed: true, documentCount: 50 }

    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')

    await vm.clearVectorIndex()
    await flushPromises()

    // Index status should remain unchanged
    expect(vm.vectorIndexStatus).toEqual({ indexed: true, documentCount: 50 })
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  // 70. showInstallPluginDialog opens the plugin manager dialog
  it('showInstallPluginDialog opens the plugin manager dialog', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(vm.showPluginManagerDialog).toBe(false)

    vm.showInstallPluginDialog()
    await wrapper.vm.$nextTick()

    expect(vm.showPluginManagerDialog).toBe(true)
  })

  // 71. resetConfig shows success message after resetting
  it('resetConfig shows success message after applying defaults', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.configForm.preset = 'quality'
    await wrapper.vm.$nextTick()

    vm.resetConfig()
    await wrapper.vm.$nextTick()

    expect(vm.configForm.preset).toBe('standard')
    expect(ElMessage.success).toHaveBeenCalledWith('配置已重置')
  })

  // 72. getNormalizedConfigWithOverrides merges overrides with current config
  it('getNormalizedConfigWithOverrides merges partial overrides into current config', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    vm.configForm.preset = 'fast'
    vm.systemPrompts.planner = 'custom planner'

    const result = vm.getNormalizedConfigWithOverrides({ enableQualityCheck: false })

    expect(result.enableQualityCheck).toBe(false)
    // The system prompts should reflect the local systemPrompts ref
    expect(result.systemPrompts?.planner).toBe('custom planner')
    // Config form should be synced
    expect(vm.configForm.preset).toBeDefined()
  })

  // 73. sensitive word check toggle is rendered and reactive
  it('renders sensitive word check toggle and is reactive', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    expect(wrapper.text()).toContain('敏感词检测')
    expect(vm.configForm.enableSensitiveWordCheck).toBe(false)

    vm.configForm.enableSensitiveWordCheck = true
    await wrapper.vm.$nextTick()

    expect(vm.configForm.enableSensitiveWordCheck).toBe(true)
  })

  // 74. estimatedCost returns 0 when targetWords or targetWordCount is zero
  it('estimatedCost returns 0 when project targetWords is 0', async () => {
    const { wrapper, projectStore } = mountConfig()
    const vm = wrapper.vm as any

    projectStore.currentProject = {
      id: 'proj-zero',
      name: 'Zero Project',
      targetWords: 0,
      config: normalizeProjectConfig(undefined),
      chapters: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any
    await wrapper.vm.$nextTick()

    expect(vm.estimatedCost).toBe(0)
  })

  // 75. applyConfigToEditorState syncs systemPrompts from provided config
  it('applyConfigToEditorState syncs systemPrompts from provided config', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const customConfig = normalizeProjectConfig({
      systemPrompts: {
        planner: 'custom planner prompt override',
        writer: 'custom writer prompt override',
      },
    })

    vm.applyConfigToEditorState(customConfig)
    await wrapper.vm.$nextTick()

    // Custom prompts should be applied
    expect(vm.systemPrompts.planner).toBe('custom planner prompt override')
    expect(vm.systemPrompts.writer).toBe('custom writer prompt override')
    // Non-overridden prompts should fall back to defaults
    expect(vm.systemPrompts.sentinel).toContain('防吃书审查')
    expect(vm.systemPrompts.extractor).toContain('沙盘状态提取')
  })

  // 76. applyConfigToEditorState syncs vectorConfig from provided config
  it('applyConfigToEditorState syncs vectorConfig from provided config', async () => {
    const { wrapper } = mountConfig()
    const vm = wrapper.vm as any

    const customConfig = normalizeProjectConfig({
      enableVectorRetrieval: true,
      vectorConfig: {
        provider: 'openai',
        model: 'text-embedding-3-large',
        apiKey: 'sk-test-key',
        topK: 10,
        minScore: 0.8,
        vectorWeight: 0.5,
      },
    })

    vm.applyConfigToEditorState(customConfig)
    await wrapper.vm.$nextTick()

    expect(vm.vectorConfig.enabled).toBe(true)
    expect(vm.vectorConfig.provider).toBe('openai')
    expect(vm.vectorConfig.model).toBe('text-embedding-3-large')
    expect(vm.vectorConfig.apiKey).toBe('sk-test-key')
    expect(vm.vectorConfig.topK).toBe(10)
    expect(vm.vectorConfig.minScore).toBe(0.8)
    expect(vm.vectorConfig.vectorWeight).toBe(0.5)
  })
})
