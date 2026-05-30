import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter } from '@/test/mocks'

// --- Mocks (must precede component imports) ---

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
  isOfficialAnthropicEndpoint: () => false,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/stateDiff', () => ({
  captureSnapshot: vi.fn().mockReturnValue({ entities: [], stateEvents: [] }),
  replayReducer: vi.fn().mockReturnValue({}),
}))

vi.mock('@/utils/entityHelpers', () => ({
  buildNameToIdMapFromEntities: vi.fn().mockReturnValue({}),
  formatEntityLocation: vi.fn().mockReturnValue(''),
}))

vi.mock('@/utils/stateEventIndexes', () => ({
  buildStateEventIndexes: vi.fn().mockReturnValue(new Map()),
  sortStateEventsByChapter: vi.fn().mockImplementation((events: unknown[]) =>
    [...events].sort((a: any, b: any) => a.chapterNumber - b.chapterNumber),
  ),
}))

vi.mock('@/schemas/stateEventSchema', () => ({
  StateEventSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'mock-generated-id'),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// --- Stub async child components ---
// We stub all defineAsyncComponent children so tests only exercise SandboxLayout logic.

const EntityTreeStub = {
  name: 'EntityTree',
  emits: ['select'],
  template: '<div class="entity-tree-stub" data-testid="entity-tree"><slot /></div>',
}

const SandboxDocumentStub = {
  name: 'SandboxDocument',
  template: '<div class="sandbox-document-stub" data-testid="sandbox-document">Document</div>',
}

const PlotLoomBoardStub = {
  name: 'PlotLoomBoard',
  template: '<div class="plot-loom-stub" data-testid="plot-loom">Timeline</div>',
}

const SandboxGraphStub = {
  name: 'SandboxGraph',
  template: '<div class="sandbox-graph-stub" data-testid="sandbox-graph">Graph</div>',
}

const SandboxMapStub = {
  name: 'SandboxMap',
  template: '<div class="sandbox-map-stub" data-testid="sandbox-map">Map</div>',
}

const AutomatonChatStub = {
  name: 'AutomatonChat',
  template: '<div class="automaton-chat-stub" data-testid="automaton-chat">Chat</div>',
}

const WorldGenWizardStub = {
  name: 'WorldGenWizard',
  emits: ['close'],
  template: '<div class="world-gen-wizard-stub" data-testid="world-gen-wizard">Wizard</div>',
}

const NovelDeepImportDialogStub = {
  name: 'NovelDeepImportDialog',
  emits: ['close', 'done'],
  template: '<div class="deep-import-stub" data-testid="deep-import">Import</div>',
}

const ChapterScrubberStub = {
  name: 'ChapterScrubber',
  props: ['modelValue', 'totalChapters'],
  emits: ['update:modelValue'],
  template: '<div class="chapter-scrubber-stub" data-testid="chapter-scrubber">Scrubber</div>',
}

const ErrorBoundaryStub = {
  name: 'ErrorBoundary',
  props: ['name', 'showRetry', 'showDetail'],
  template: '<div class="error-boundary-stub"><slot /></div>',
}

const AppTourStub = {
  name: 'AppTour',
  props: ['modelValue', 'steps'],
  emits: ['update:modelValue', 'finish', 'close'],
  template: '<div class="app-tour-stub" data-testid="app-tour"></div>',
}

// --- Element Plus stubs ---

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'plain', 'icon'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
  emits: ['click'],
}

const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue', 'tab-click'],
  template: '<div class="el-tabs-stub"><slot /></div>',
}

const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  template: '<div class="el-tab-pane-stub" :data-name="name"><slot /></div>',
}

// --- Component under test ---

import SandboxLayout from '@/components/Sandbox/SandboxLayout.vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountLayout() {
  return mount(SandboxLayout, {
    global: {
      stubs: {
        EntityTree: EntityTreeStub,
        SandboxDocument: SandboxDocumentStub,
        PlotLoomBoard: PlotLoomBoardStub,
        SandboxGraph: SandboxGraphStub,
        SandboxMap: SandboxMapStub,
        AutomatonChat: AutomatonChatStub,
        WorldGenWizard: WorldGenWizardStub,
        NovelDeepImportDialog: NovelDeepImportDialogStub,
        ChapterScrubber: ChapterScrubberStub,
        ErrorBoundary: ErrorBoundaryStub,
        AppTour: AppTourStub,
        ElButton: ElButtonStub,
        ElTabs: ElTabsStub,
        ElTabPane: ElTabPaneStub,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxLayout', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    // Ensure tour never auto-shows during tests
    localStorage.setItem('ai-novel-workshop:sandbox-tour:completed', 'true')
    sessionStorage.setItem('ai-novel-workshop:sandbox-tour:completed', 'true')
    // Prevent setTimeout-based tour logic from interfering
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // =========================================================================
  // 1. Sidebar rendering
  // =========================================================================

  it('renders the entity sidebar with EntityTree', () => {
    const wrapper = mountLayout()

    const sidebar = wrapper.find('.sidebar')
    expect(sidebar.exists()).toBe(true)
    expect(sidebar.attributes('role')).toBe('complementary')
    expect(sidebar.attributes('aria-label')).toBe('实体库侧边栏')
    expect(sidebar.find('[data-testid="entity-tree"]').exists()).toBe(true)
  })

  // =========================================================================
  // 2. Main view structure
  // =========================================================================

  it('renders the main view with action bar and chapter scrubber', () => {
    const wrapper = mountLayout()

    const mainView = wrapper.find('.main-view')
    expect(mainView.exists()).toBe(true)
    expect(mainView.find('[data-testid="chapter-scrubber"]').exists()).toBe(true)
    expect(wrapper.find('.el-tabs-stub').exists()).toBe(true)
  })

  it('renders the action bar with wizard and import buttons', () => {
    const wrapper = mountLayout()

    const buttons = wrapper.findAll('.el-button-stub')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(buttons[0].text()).toContain('批量世界生成向导')
    expect(buttons[1].text()).toContain('深度小说导入')
  })

  // =========================================================================
  // 3. Panel switching (view mode toggle)
  // =========================================================================

  it('defaults to the doc tab', () => {
    const wrapper = mountLayout()

    // Default activeTab should be 'doc'; the doc pane should be visible
    const tabPanes = wrapper.findAll('.el-tab-pane-stub')
    expect(tabPanes.length).toBe(4)

    const names = tabPanes.map((pane) => pane.attributes('data-name'))
    expect(names).toEqual(['doc', 'timeline', 'graph', 'map'])
  })

  it('switches to timeline tab when tab is clicked', async () => {
    const wrapper = mountLayout()

    // Simulate the el-tabs emitting update:modelValue for the timeline tab
    const tabs = wrapper.findComponent(ElTabsStub)
    await tabs.vm.$emit('update:modelValue', 'timeline')
    await nextTick()

    // After switching, the doc tab should no longer be the default value
    expect(tabs.props('modelValue')).toBe('timeline')
  })

  it('switches to graph tab', async () => {
    const wrapper = mountLayout()

    const tabs = wrapper.findComponent(ElTabsStub)
    await tabs.vm.$emit('update:modelValue', 'graph')
    await nextTick()

    expect(tabs.props('modelValue')).toBe('graph')
  })

  it('switches to map tab', async () => {
    const wrapper = mountLayout()

    const tabs = wrapper.findComponent(ElTabsStub)
    await tabs.vm.$emit('update:modelValue', 'map')
    await nextTick()

    expect(tabs.props('modelValue')).toBe('map')
  })

  // =========================================================================
  // 4. Entity selection
  // =========================================================================

  it('switches to doc tab when an entity is selected from the tree', async () => {
    const wrapper = mountLayout()

    // First switch to a non-doc tab
    const tabs = wrapper.findComponent(ElTabsStub)
    await tabs.vm.$emit('update:modelValue', 'timeline')
    await nextTick()
    expect(tabs.props('modelValue')).toBe('timeline')

    // Now emit entity select from EntityTree
    const entityTree = wrapper.findComponent(EntityTreeStub)
    await entityTree.vm.$emit('select', 'entity-123')
    await nextTick()

    // Should have switched back to doc
    expect(tabs.props('modelValue')).toBe('doc')
  })

  it('stays on doc tab when entity is selected while already on doc', async () => {
    const wrapper = mountLayout()

    const tabs = wrapper.findComponent(ElTabsStub)
    expect(tabs.props('modelValue')).toBe('doc')

    const entityTree = wrapper.findComponent(EntityTreeStub)
    await entityTree.vm.$emit('select', 'entity-456')
    await nextTick()

    expect(tabs.props('modelValue')).toBe('doc')
  })

  // =========================================================================
  // 5. Right sidebar -- AI assistant panel
  // =========================================================================

  it('renders right sidebar with AutomatonChat by default', () => {
    const wrapper = mountLayout()

    const rightSidebar = wrapper.find('.right-sidebar')
    expect(rightSidebar.exists()).toBe(true)
    expect(rightSidebar.attributes('role')).toBe('complementary')
    expect(rightSidebar.attributes('aria-label')).toBe('AI助手面板')
    expect(rightSidebar.find('[data-testid="automaton-chat"]').exists()).toBe(true)
    expect(rightSidebar.find('[data-testid="deep-import"]').exists()).toBe(false)
    expect(rightSidebar.find('[data-testid="world-gen-wizard"]').exists()).toBe(false)
  })

  // =========================================================================
  // 6. Deep import dialog toggle
  // =========================================================================

  it('shows deep import dialog when import button is clicked', async () => {
    const wrapper = mountLayout()

    const buttons = wrapper.findAll('.el-button-stub')
    // Second button is the deep import button
    await buttons[1].trigger('click')
    await nextTick()

    const rightSidebar = wrapper.find('.right-sidebar')
    expect(rightSidebar.find('[data-testid="deep-import"]').exists()).toBe(true)
    expect(rightSidebar.find('[data-testid="automaton-chat"]').exists()).toBe(false)
  })

  // =========================================================================
  // 7. Wizard mode toggle
  // =========================================================================

  it('shows world gen wizard when wizard button is clicked', async () => {
    const wrapper = mountLayout()
    const sandboxStore = useSandboxStore()

    // Click the wizard button
    const buttons = wrapper.findAll('.el-button-stub')
    await buttons[0].trigger('click')
    await nextTick()

    // The wizard button sets sandboxStore.isWizardMode = true
    expect(sandboxStore.isWizardMode).toBe(true)
    // Right sidebar should now show the wizard
    expect(wrapper.find('[data-testid="world-gen-wizard"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="automaton-chat"]').exists()).toBe(false)
  })

  // =========================================================================
  // 8. Data loading on mount
  // =========================================================================

  it('calls sandboxStore.loadData on mount when a project is open', async () => {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()

    projectStore.currentProject = {
      id: 'proj-test-1',
      title: 'Test Project',
      chapters: [],
    } as any

    const loadSpy = vi.spyOn(sandboxStore, 'loadData').mockResolvedValue(undefined)

    mountLayout()
    await flushPromises()

    expect(loadSpy).toHaveBeenCalledWith('proj-test-1')
  })

  it('does not call sandboxStore.loadData when no project is open', async () => {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()

    projectStore.currentProject = null

    const loadSpy = vi.spyOn(sandboxStore, 'loadData')

    mountLayout()
    await flushPromises()

    expect(loadSpy).not.toHaveBeenCalled()
  })

  // =========================================================================
  // 9. Chapter scrubber binding
  // =========================================================================

  it('passes currentChapter and totalChapters to ChapterScrubber', () => {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()

    projectStore.currentProject = {
      id: 'proj-1',
      title: 'Test',
      chapters: [
        { id: 'ch-1', number: 1 },
        { id: 'ch-2', number: 2 },
        { id: 'ch-3', number: 3 },
      ],
    } as any

    sandboxStore.currentChapter = 2

    const wrapper = mountLayout()

    const scrubber = wrapper.findComponent(ChapterScrubberStub)
    expect(scrubber.exists()).toBe(true)
    expect(scrubber.props('modelValue')).toBe(2)
    expect(scrubber.props('totalChapters')).toBe(3)
  })

  // =========================================================================
  // 10. Deep import done handler
  // =========================================================================

  it('reloads sandbox data when deep import completes', async () => {
    const projectStore = useProjectStore()
    const sandboxStore = useSandboxStore()

    projectStore.currentProject = {
      id: 'proj-done',
      title: 'Import Project',
      chapters: [],
    } as any

    const loadSpy = vi.spyOn(sandboxStore, 'loadData').mockResolvedValue(undefined)
    sandboxStore.isLoaded = true

    const wrapper = mountLayout()

    // Open deep import dialog
    const buttons = wrapper.findAll('.el-button-stub')
    await buttons[1].trigger('click')
    await nextTick()

    // Emit done from the deep import dialog
    const importDialog = wrapper.findComponent(NovelDeepImportDialogStub)
    await importDialog.vm.$emit('done')
    await flushPromises()

    expect(sandboxStore.isLoaded).toBe(false)
    expect(loadSpy).toHaveBeenCalledWith('proj-done')
  })

  // =========================================================================
  // 11. Layout structure -- three-panel layout
  // =========================================================================

  it('renders the three-panel layout (sidebar, main-view, right-sidebar)', () => {
    const wrapper = mountLayout()

    const layout = wrapper.find('.sandbox-layout')
    expect(layout.exists()).toBe(true)
    expect(layout.find('.sidebar').exists()).toBe(true)
    expect(layout.find('.main-view').exists()).toBe(true)
    expect(layout.find('.right-sidebar').exists()).toBe(true)
  })
})
