import { describe, it, expect, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import ProjectWorkspace from '@/components/ProjectWorkspace.vue'

// ---------------------------------------------------------------------------
// Stub components used by defineAsyncComponent
// ---------------------------------------------------------------------------

const WritingDashboardStub = {
  name: 'WritingDashboard',
  emits: ['openChapters', 'createChapter', 'continueWriting', 'batchGenerate', 'openConfig', 'openSandbox', 'openAgents'],
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
  project: { id: 'proj-1' },
  projectId: 'proj-1',
  activeMenu: 'dashboard',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountWorkspace(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides }

  return mount(ProjectWorkspace, {
    props,
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
})
