import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import ProjectWorkspace from '@/components/ProjectWorkspace.vue'

// ---------------------------------------------------------------------------
// Stub components used by defineAsyncComponent
// ---------------------------------------------------------------------------

const WritingDashboardStub = {
  name: 'WritingDashboard',
  emits: [
    'openChapters', 'createChapter', 'continueWriting', 'batchGenerate',
    'openConfig', 'openSandbox', 'openAgents',
    // kebab-case variants emitted by the parent template
    'open-chapters', 'create-chapter', 'continue-writing', 'batch-generate',
    'open-config', 'open-sandbox', 'open-agents',
  ],
  template: '<div class="stub-writing-dashboard">Dashboard</div>',
}

const SandboxLayoutStub = {
  name: 'SandboxLayout',
  template: '<div class="stub-sandbox-layout">Sandbox</div>',
}

const ChaptersStub = {
  name: 'Chapters',
  template: '<div class="stub-chapters">Chapters</div>',
}

const SummaryManagerStub = {
  name: 'SummaryManager',
  template: '<div class="stub-summary-manager">Summary</div>',
}

const QualityReportStub = {
  name: 'QualityReport',
  template: '<div class="stub-quality-report">Quality</div>',
}

const TokenUsagePanelStub = {
  name: 'TokenUsagePanel',
  template: '<div class="stub-token-usage-panel">TokenUsage</div>',
}

const AgentConsoleStub = {
  name: 'AgentConsole',
  template: '<div class="stub-agent-console">Agents</div>',
}

const ProjectConfigStub = {
  name: 'ProjectConfig',
  template: '<div class="stub-project-config">Config</div>',
}

const DeveloperPanelStub = {
  name: 'DeveloperPanel',
  template: '<div class="stub-developer-panel">DevPanel</div>',
}

const ErrorBoundaryStub = {
  name: 'ErrorBoundary',
  props: ['name', 'showRetry', 'showDetail'],
  template: '<slot />',
}

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const defaultProps = {
  isZenMode: false,
  loading: false,
  error: null as string | null,
  project: { id: 'proj-1' } as { id?: string } | null | undefined,
  projectId: 'proj-1',
  activeMenu: 'dashboard',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountWorkspace(overrides: Record<string, any> = {}) {
  const props = { ...defaultProps, ...overrides }

  return mount(ProjectWorkspace, {
    props: props as any,
    global: {
      stubs: {
        WritingDashboard: WritingDashboardStub,
        SandboxLayout: SandboxLayoutStub,
        Chapters: ChaptersStub,
        SummaryManager: SummaryManagerStub,
        QualityReport: QualityReportStub,
        TokenUsagePanel: TokenUsagePanelStub,
        AgentConsole: AgentConsoleStub,
        ProjectConfig: ProjectConfigStub,
        DeveloperPanel: DeveloperPanelStub,
        ErrorBoundary: ErrorBoundaryStub,
        'el-button': {
          template: '<button @click="$emit(\'click\')"><slot /></button>',
          props: ['type', 'circle', 'size', 'title'],
          emits: ['click'],
        },
        'el-icon': { template: '<span><slot /></span>', props: ['size'] },
        'el-empty': {
          template: '<div class="el-empty-stub"><span>{{ description }}</span><slot /></div>',
          props: ['description'],
        },
        Expand: { template: '<span>Expand</span>' },
        Loading: { template: '<span>Loading</span>' },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectWorkspace', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // ----- Loading state -----

  it('shows loading container when loading is true', () => {
    const wrapper = mountWorkspace({ loading: true })

    const loadingContainer = wrapper.find('.loading-container')
    expect(loadingContainer.exists()).toBe(true)
    expect(loadingContainer.text()).toContain('加载项目中...')
  })

  it('does not show workspace surface or error when loading', () => {
    const wrapper = mountWorkspace({ loading: true })

    expect(wrapper.find('.workspace-surface').exists()).toBe(false)
    expect(wrapper.find('.error-container').exists()).toBe(false)
  })

  // ----- Error state -----

  it('shows error container when project is null', () => {
    const wrapper = mountWorkspace({ project: null, error: '加载失败' })

    const errorContainer = wrapper.find('.error-container')
    expect(errorContainer.exists()).toBe(true)
    expect(errorContainer.text()).toContain('项目加载失败')
  })

  it('shows error container when project has no id', () => {
    const wrapper = mountWorkspace({ project: { id: undefined }, error: null })

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.find('.error-container').text()).toContain('项目数据为空')
  })

  it('shows error details including projectId and error message', () => {
    const wrapper = mountWorkspace({
      project: null,
      error: 'Network timeout',
      projectId: 'proj-42',
    })

    const errorContainer = wrapper.find('.error-container')
    expect(errorContainer.text()).toContain('Network timeout')
    expect(errorContainer.text()).toContain('proj-42')
  })

  it('emits goBack when the back button is clicked in error state', async () => {
    const wrapper = mountWorkspace({ project: null })

    const errorContainer = wrapper.find('.error-container')
    const backButton = errorContainer.find('button')
    expect(backButton.exists()).toBe(true)

    await backButton.trigger('click')

    expect(wrapper.emitted('goBack')).toBeTruthy()
  })

  // ----- Workspace surface -----

  it('renders workspace surface when project has an id and not loading', () => {
    const wrapper = mountWorkspace()

    expect(wrapper.find('.workspace-surface').exists()).toBe(true)
    expect(wrapper.find('.loading-container').exists()).toBe(false)
    expect(wrapper.find('.error-container').exists()).toBe(false)
  })

  // ----- Panel switching -----

  const panels: Array<{ menu: string; stubClass: string; name: string }> = [
    { menu: 'dashboard', stubClass: '.stub-writing-dashboard', name: 'WritingDashboard' },
    { menu: 'sandbox', stubClass: '.stub-sandbox-layout', name: 'SandboxLayout' },
    { menu: 'chapters', stubClass: '.stub-chapters', name: 'Chapters' },
    { menu: 'summary', stubClass: '.stub-summary-manager', name: 'SummaryManager' },
    { menu: 'quality', stubClass: '.stub-quality-report', name: 'QualityReport' },
    { menu: 'token-usage', stubClass: '.stub-token-usage-panel', name: 'TokenUsagePanel' },
    { menu: 'agents', stubClass: '.stub-agent-console', name: 'AgentConsole' },
    { menu: 'config', stubClass: '.stub-project-config', name: 'ProjectConfig' },
    { menu: '__dev_panel__', stubClass: '.stub-developer-panel', name: 'DeveloperPanel' },
  ]

  it.each(panels)('renders $name when activeMenu is "$menu"', ({ menu, stubClass }) => {
    const wrapper = mountWorkspace({ activeMenu: menu })

    expect(wrapper.find(stubClass).exists()).toBe(true)
  })

  it('renders only the active panel and hides others', () => {
    const wrapper = mountWorkspace({ activeMenu: 'chapters' })

    expect(wrapper.find('.stub-chapters').exists()).toBe(true)
    expect(wrapper.find('.stub-writing-dashboard').exists()).toBe(false)
    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(false)
    expect(wrapper.find('.stub-summary-manager').exists()).toBe(false)
    expect(wrapper.find('.stub-quality-report').exists()).toBe(false)
    expect(wrapper.find('.stub-token-usage-panel').exists()).toBe(false)
    expect(wrapper.find('.stub-agent-console').exists()).toBe(false)
    expect(wrapper.find('.stub-project-config').exists()).toBe(false)
    expect(wrapper.find('.stub-developer-panel').exists()).toBe(false)
  })

  // ----- Panel navigation via re-render (simulates menuSelect from parent) -----

  it('switches panel when activeMenu prop changes', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    expect(wrapper.find('.stub-writing-dashboard').exists()).toBe(true)
    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(false)

    await wrapper.setProps({ activeMenu: 'sandbox' })
    await nextTick()

    expect(wrapper.find('.stub-writing-dashboard').exists()).toBe(false)
    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(true)
  })

  // ----- Zen mode -----

  it('does not show zen exit button when not in zen mode', () => {
    const wrapper = mountWorkspace({ isZenMode: false })

    expect(wrapper.find('.zen-exit-btn').exists()).toBe(false)
  })

  it('shows zen exit button when isZenMode is true', () => {
    const wrapper = mountWorkspace({ isZenMode: true })

    expect(wrapper.find('.zen-exit-btn').exists()).toBe(true)
  })

  it('emits update:isZenMode with false when zen exit button is clicked', async () => {
    const wrapper = mountWorkspace({ isZenMode: true })

    const zenButton = wrapper.find('.zen-exit-btn')
    await zenButton.trigger('click')

    expect(wrapper.emitted('update:isZenMode')).toBeTruthy()
    expect(wrapper.emitted('update:isZenMode')![0]).toEqual([false])
  })

  it('applies is-zen class on the main element when in zen mode', () => {
    const wrapper = mountWorkspace({ isZenMode: true })

    expect(wrapper.find('.editor-main.is-zen').exists()).toBe(true)
  })

  it('does not apply is-zen class when not in zen mode', () => {
    const wrapper = mountWorkspace({ isZenMode: false })

    expect(wrapper.find('.editor-main.is-zen').exists()).toBe(false)
    expect(wrapper.find('.editor-main').exists()).toBe(true)
  })

  // ----- Error state shows project status -----

  it('shows "不存在" when project object is null in error state', () => {
    const wrapper = mountWorkspace({ project: null, error: null })

    expect(wrapper.find('.error-container').text()).toContain('不存在')
  })

  it('shows "存在但无ID" when project exists but has no id', () => {
    const wrapper = mountWorkspace({ project: { id: undefined }, error: null })

    expect(wrapper.find('.error-container').text()).toContain('存在但无ID')
  })

  // ----- ErrorBoundary wrapping -----

  it('wraps WritingDashboard in ErrorBoundary', () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    // The ErrorBoundary stub renders a passthrough <slot />, so the dashboard
    // appears directly inside .workspace-surface. Verify the stub is used.
    expect(wrapper.find('.stub-writing-dashboard').exists()).toBe(true)
  })

  it('wraps SandboxLayout in ErrorBoundary', () => {
    const wrapper = mountWorkspace({ activeMenu: 'sandbox' })

    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(true)
  })

  it('does NOT wrap SummaryManager in ErrorBoundary', () => {
    // SummaryManager has no ErrorBoundary in the template, so it renders directly.
    const wrapper = mountWorkspace({ activeMenu: 'summary' })

    expect(wrapper.find('.stub-summary-manager').exists()).toBe(true)
  })

  // ----- Unknown / unrecognized menu value -----

  it('renders workspace surface with no panel when activeMenu is unknown', () => {
    const wrapper = mountWorkspace({ activeMenu: 'nonexistent-panel' })

    expect(wrapper.find('.workspace-surface').exists()).toBe(true)
    expect(wrapper.find('.stub-writing-dashboard').exists()).toBe(false)
    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(false)
    expect(wrapper.find('.stub-chapters').exists()).toBe(false)
    expect(wrapper.find('.stub-summary-manager').exists()).toBe(false)
    expect(wrapper.find('.stub-quality-report').exists()).toBe(false)
    expect(wrapper.find('.stub-token-usage-panel').exists()).toBe(false)
    expect(wrapper.find('.stub-agent-console').exists()).toBe(false)
    expect(wrapper.find('.stub-project-config').exists()).toBe(false)
    expect(wrapper.find('.stub-developer-panel').exists()).toBe(false)
  })

  // ----- Dashboard event bubbling -----

  it('emits dashboardAction when WritingDashboard emits open-chapters', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('open-chapters')

    expect(wrapper.emitted('dashboardAction')).toHaveLength(1)
  })

  it('emits dashboardAction when WritingDashboard emits create-chapter', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('create-chapter')

    expect(wrapper.emitted('dashboardAction')).toHaveLength(1)
  })

  it('emits dashboardAction when WritingDashboard emits continue-writing', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('continue-writing')

    expect(wrapper.emitted('dashboardAction')).toHaveLength(1)
  })

  it('emits dashboardAction when WritingDashboard emits batch-generate', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('batch-generate')

    expect(wrapper.emitted('dashboardAction')).toHaveLength(1)
  })

  it('emits menuSelect with "config" when WritingDashboard emits open-config', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('open-config')

    expect(wrapper.emitted('menuSelect')).toHaveLength(1)
    expect(wrapper.emitted('menuSelect')![0]).toEqual(['config'])
  })

  it('emits menuSelect with "sandbox" when WritingDashboard emits open-sandbox', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('open-sandbox')

    expect(wrapper.emitted('menuSelect')).toHaveLength(1)
    expect(wrapper.emitted('menuSelect')![0]).toEqual(['sandbox'])
  })

  it('emits menuSelect with "agents" when WritingDashboard emits open-agents', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    const dashboard = wrapper.findComponent({ name: 'WritingDashboard' })
    await dashboard.vm.$emit('open-agents')

    expect(wrapper.emitted('menuSelect')).toHaveLength(1)
    expect(wrapper.emitted('menuSelect')![0]).toEqual(['agents'])
  })

  // ----- Loading + zen mode interaction -----

  it('shows loading state even when zen mode is active', () => {
    const wrapper = mountWorkspace({ loading: true, isZenMode: true })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
    expect(wrapper.find('.editor-main').classes()).toContain('is-zen')
    // Zen exit button is independent of loading state
    expect(wrapper.find('.zen-exit-btn').exists()).toBe(true)
  })

  // ----- Error + zen mode interaction -----

  it('shows error state even when zen mode is active', () => {
    const wrapper = mountWorkspace({ project: null, isZenMode: true })

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.find('.editor-main').classes()).toContain('is-zen')
  })

  // ----- Dynamic panel switching (prop change) -----

  it('switches from sandbox to config when activeMenu prop changes', async () => {
    const wrapper = mountWorkspace({ activeMenu: 'sandbox' })

    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(true)
    expect(wrapper.find('.stub-project-config').exists()).toBe(false)

    await wrapper.setProps({ activeMenu: 'config' })
    await nextTick()

    expect(wrapper.find('.stub-sandbox-layout').exists()).toBe(false)
    expect(wrapper.find('.stub-project-config').exists()).toBe(true)
  })

  it('switches from error to workspace when project is set', async () => {
    const wrapper = mountWorkspace({ project: null })

    expect(wrapper.find('.error-container').exists()).toBe(true)
    expect(wrapper.find('.workspace-surface').exists()).toBe(false)

    await wrapper.setProps({ project: { id: 'proj-new' } })
    await nextTick()

    expect(wrapper.find('.error-container').exists()).toBe(false)
    expect(wrapper.find('.workspace-surface').exists()).toBe(true)
  })

  it('switches from workspace to loading when loading becomes true', async () => {
    const wrapper = mountWorkspace({ loading: false })

    expect(wrapper.find('.workspace-surface').exists()).toBe(true)

    await wrapper.setProps({ loading: true })
    await nextTick()

    expect(wrapper.find('.workspace-surface').exists()).toBe(false)
    expect(wrapper.find('.loading-container').exists()).toBe(true)
  })

  // ----- Zen mode toggle via prop change -----

  it('toggles zen mode on when isZenMode prop changes to true', async () => {
    const wrapper = mountWorkspace({ isZenMode: false })

    expect(wrapper.find('.editor-main').classes()).not.toContain('is-zen')
    expect(wrapper.find('.zen-exit-btn').exists()).toBe(false)

    await wrapper.setProps({ isZenMode: true })
    await nextTick()

    expect(wrapper.find('.editor-main').classes()).toContain('is-zen')
    expect(wrapper.find('.zen-exit-btn').exists()).toBe(true)
  })

  // ----- DeveloperPanel only renders in __dev_panel__ -----

  it('does not render DeveloperPanel for non-dev menu values', () => {
    const wrapper = mountWorkspace({ activeMenu: 'dashboard' })

    expect(wrapper.find('.stub-developer-panel').exists()).toBe(false)
  })

  it('renders DeveloperPanel inside workspace surface', () => {
    const wrapper = mountWorkspace({ activeMenu: '__dev_panel__' })

    expect(wrapper.find('.workspace-surface .stub-developer-panel').exists()).toBe(true)
  })

  // ----- Error container displays all required info -----

  it('displays default error text when error is null in error state', () => {
    const wrapper = mountWorkspace({ project: null, error: null })

    const errorContainer = wrapper.find('.error-container')
    expect(errorContainer.text()).toContain('项目数据为空')
  })
})
