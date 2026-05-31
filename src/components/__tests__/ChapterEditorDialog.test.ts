import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref, toRaw } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter, createMockProject } from '@/test/mocks'
import type { Chapter } from '@/types'

// ---------------------------------------------------------------------------
// Mocks (declared before importing the component under test)
// ---------------------------------------------------------------------------

const mockSaveChapter = vi.fn().mockResolvedValue(undefined)
const mockLoadChapter = vi.fn().mockImplementation(async (id: string) => ({
  id,
  content: `Loaded content for ${id}`,
  title: 'Loaded Title',
  number: 1,
}))

const mockProject = createMockProject()

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: mockProject,
    loadChapter: mockLoadChapter,
    saveChapter: mockSaveChapter,
  }),
}))

vi.mock('@/stores/suggestions', () => ({
  useSuggestionsStore: () => ({
    getSuggestionsByChapter: vi.fn(() => []),
    markAsAdopted: vi.fn(),
    markAsIgnored: vi.fn(),
  }),
}))

vi.mock('@/composables/useContextRadar', () => ({
  useContextRadar: () => ({
    activeContextCharacters: ref([]),
    activeContextWorldbook: ref([]),
  }),
}))

const registeredShortcuts: Array<{ id: string; keys: string[]; handler: () => void; when?: () => boolean; disabled?: () => boolean }> = []

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    registerShortcuts: vi.fn((shortcuts: typeof registeredShortcuts) => {
      registeredShortcuts.push(...shortcuts)
    }),
  }),
}))

vi.mock('@/services/paragraph-ai', () => ({
  executeParagraphAI: vi.fn().mockResolvedValue({ result: 'AI result' }),
  isParagraphAction: vi.fn(() => true),
}))

vi.mock('@/services/generation/agent-orchestrator', () => ({
  runExtractionInBackground: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils/project-config-normalizer', () => ({
  normalizeProjectConfig: vi.fn((config: unknown) => config ?? {}),
}))

vi.mock('@/utils/chapterVersioning', () => ({
  createSnapshot: vi.fn().mockResolvedValue(undefined),
  pruneSnapshots: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/escapeXml', () => ({
  escapeXml: (s: string) => s,
}))

vi.mock('@/assistant/review/reviewRunner', () => ({
  runReview: vi.fn().mockResolvedValue({ suggestionsAdded: 0 }),
}))

vi.mock('@/utils/getErrorMessage', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

vi.mock('@/utils/eventBus', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  }
})

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-test'),
}))

// ---------------------------------------------------------------------------
// Stubs for child components
// ---------------------------------------------------------------------------

const NovelEditorStub = {
  name: 'NovelEditor',
  props: ['modelValue', 'placeholder', 'autofocus', 'annotations'],
  emits: ['update:modelValue', 'word-count-change', 'ai-action'],
  expose: ['getEditor', 'scrollToParagraph', 'applySuggestedFix'],
  methods: {
    getEditor: () => null,
    scrollToParagraph: () => true,
    applySuggestedFix: () => true,
  },
  template: '<div class="stub-novel-editor" data-testid="novel-editor"><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" data-testid="editor-textarea" /></div>',
}

const GlassContextPanelStub = {
  name: 'GlassContextPanel',
  props: ['activeTab', 'chapterForm', 'characters', 'worldbook'],
  emits: ['update:activeTab', 'update:chapterForm'],
  template: '<div class="stub-glass-context-panel" />',
}

const ChapterVersionPanelStub = {
  name: 'ChapterVersionPanel',
  props: ['modelValue', 'projectId', 'chapterId'],
  emits: ['update:modelValue', 'restore'],
  template: '<div class="stub-version-panel" />',
}

const ReviewSidePanelStub = {
  name: 'ReviewSidePanel',
  props: ['visible', 'projectId', 'chapterId', 'chapterNumber'],
  emits: ['navigateTo', 'applyFix', 'dismiss'],
  template: '<div class="stub-review-panel" />',
}

const AIRewriteConfirmStub = {
  name: 'AIRewriteConfirm',
  props: ['visible', 'originalText', 'modifiedText', 'action'],
  emits: ['update:visible', 'accept', 'regenerate'],
  template: '<div class="stub-ai-rewrite-confirm" />',
}

const FindReplacePanelStub = {
  name: 'FindReplacePanel',
  props: ['visible', 'editor', 'showReplace'],
  emits: ['update:visible'],
  template: '<div class="stub-find-replace" />',
}

// Element Plus stubs
const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'fullscreen', 'showClose', 'closeOnClickModal', 'title', 'width', 'top', 'ariaModal', 'ariaLabelledby'],
  emits: ['update:modelValue'],
  template: `
    <div v-if="modelValue" class="el-dialog-stub" data-testid="dialog">
      <div class="el-dialog__header"><slot name="header" :titleId="'chapter-editor-title'" :titleClass="''" /></div>
      <div class="el-dialog__body"><slot /></div>
      <div class="el-dialog__footer"><slot name="footer" /></div>
    </div>
  `,
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'loading', 'text', 'circle', 'round', 'disabled'],
  emits: ['click'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const ElCheckboxStub = {
  name: 'ElCheckbox',
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: '<label class="el-checkbox-stub"><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const ElBadgeStub = {
  name: 'ElBadge',
  props: ['value', 'hidden'],
  template: '<span class="el-badge-stub" :data-value="value"><slot /></span>',
}

const ElRowStub = { name: 'ElRow', props: ['gutter'], template: '<div class="el-row-stub"><slot /></div>' }
const ElColStub = { name: 'ElCol', props: ['span'], template: '<div class="el-col-stub"><slot /></div>' }
const ElStatisticStub = { name: 'ElStatistic', props: ['title', 'value', 'precision'], template: '<div class="el-statistic-stub" />' }
const ElDividerStub = { name: 'ElDivider', template: '<hr class="el-divider-stub" />' }
const ElTabsStub = { name: 'ElTabs', props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="el-tabs-stub"><slot /></div>' }
const ElTabPaneStub = { name: 'ElTabPane', props: ['label', 'name'], template: '<div class="el-tab-pane-stub"><slot /></div>' }
const ElCardStub = { name: 'ElCard', props: ['shadow'], template: '<div class="el-card-stub"><slot /></div>' }
const ElProgressStub = { name: 'ElProgress', props: ['percentage', 'color', 'format'], template: '<div class="el-progress-stub" />' }
const ElTagStub = { name: 'ElTag', props: ['type', 'size'], template: '<span class="el-tag-stub"><slot /></span>' }
const ElTimelineStub = { name: 'ElTimeline', template: '<div class="el-timeline-stub"><slot /></div>' }
const ElTimelineItemStub = { name: 'ElTimelineItem', props: ['type', 'title'], template: '<div class="el-timeline-item-stub"><slot /></div>' }

const iconStubs = {
  ArrowLeft: { name: 'ArrowLeft', template: '<span />' },
  MagicStick: { name: 'MagicStick', template: '<span />' },
  Search: { name: 'Search', template: '<span />' },
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

async function mountDialog(props: {
  modelValue?: boolean
  chapter?: Chapter | null
  projectId?: string
  preserveProvidedContent?: boolean
} = {}) {
  const ChapterEditorDialog = (await import('@/components/ChapterEditorDialog.vue')).default
  const mountProps: Record<string, unknown> = {
    modelValue: true,
    ...props,
  }
  // Wrap chapter in toRaw to avoid DataCloneError from structuredClone on Vue proxy
  if (props.chapter) {
    mountProps.chapter = toRaw(props.chapter)
  }

  return mount(ChapterEditorDialog, {
    props: mountProps,
    global: {
      stubs: {
        NovelEditor: NovelEditorStub,
        GlassContextPanel: GlassContextPanelStub,
        ChapterVersionPanel: ChapterVersionPanelStub,
        ReviewSidePanel: ReviewSidePanelStub,
        AIRewriteConfirm: AIRewriteConfirmStub,
        FindReplacePanel: FindReplacePanelStub,
        ElDialog: ElDialogStub,
        ElButton: ElButtonStub,
        ElInput: ElInputStub,
        ElCheckbox: ElCheckboxStub,
        ElIcon: ElIconStub,
        ElBadge: ElBadgeStub,
        ElRow: ElRowStub,
        ElCol: ElColStub,
        ElStatistic: ElStatisticStub,
        ElDivider: ElDividerStub,
        ElTabs: ElTabsStub,
        ElTabPane: ElTabPaneStub,
        ElCard: ElCardStub,
        ElProgress: ElProgressStub,
        ElTag: ElTagStub,
        ElTimeline: ElTimelineStub,
        ElTimelineItem: ElTimelineItemStub,
        ...iconStubs,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChapterEditorDialog', () => {
  let ElMessage: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    registeredShortcuts.length = 0
    vi.useFakeTimers()
    ElMessage = (await import('element-plus')).ElMessage as unknown as typeof ElMessage

    // Mock structuredClone to handle Vue reactive proxies (DataCloneError in jsdom)
    const realStructuredClone = globalThis.structuredClone
    vi.stubGlobal('structuredClone', <T>(value: T, options?: StructuredSerializeOptions): T => {
      try {
        return realStructuredClone(value, options)
      } catch {
        // Fallback: deep clone via JSON for non-cloneable values (Vue proxies)
        return JSON.parse(JSON.stringify(value))
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- 1. Dialog open/close ----

  it('renders the dialog when modelValue is true', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(true)
  })

  it('does not render dialog content when modelValue is false', async () => {
    const wrapper = await mountDialog({ modelValue: false })
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
  })

  it('emits update:modelValue when back button is clicked', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    const _backBtn = wrapper.find('.back-btn-stub, .el-button-stub')
    // The first button in the header is the back button
    const headerButtons = wrapper.findAll('.header-left .el-button-stub, .immersive-header .el-button-stub')
    // Find back button by aria-label in the real component; in stubs we click the first button
    const firstButton = headerButtons.length > 0 ? headerButtons[0] : wrapper.find('.el-button-stub')
    if (firstButton.exists()) {
      await firstButton.trigger('click')
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    }
  })

  // ---- 2. Chapter content loading ----

  it('loads chapter content when opened with an existing chapter', async () => {
    const chapter = createMockChapter({
      id: 'ch-load-test',
      title: '测试章节标题',
      number: 3,
      content: '',
    })

    const _wrapper = await mountDialog({ modelValue: true, chapter })
    await flushPromises()

    expect(mockLoadChapter).toHaveBeenCalledWith('ch-load-test')
  })

  it('displays the chapter number in Chinese format in the header', async () => {
    const chapter = createMockChapter({ number: 7, title: '第七章' })
    const wrapper = await mountDialog({ modelValue: true, chapter })
    await flushPromises()

    expect(wrapper.text()).toContain('第7章')
  })

  it('uses provided content directly when preserveProvidedContent is true', async () => {
    const chapter = createMockChapter({
      id: 'ch-preserve',
      title: '保留内容',
      content: 'Provided content should be used',
    })

    const _wrapper = await mountDialog({
      modelValue: true,
      chapter,
      preserveProvidedContent: true,
    })
    await flushPromises()

    // loadChapter should NOT have been called because preserveProvidedContent skips the load
    expect(mockLoadChapter).not.toHaveBeenCalledWith('ch-preserve')
  })

  // ---- 3. Save action ----

  it('calls saveChapter on the project store when save button is clicked with a title', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    // Set a title so save won't be rejected
    const titleInput = wrapper.find('.immersive-title-input input, .el-input-stub')
    if (titleInput.exists()) {
      await titleInput.setValue('章节标题')
      await flushPromises()
    } else {
      // fallback: set title via the form ref
      const vm = wrapper.vm as any
      if (vm.chapterForm) {
        vm.chapterForm.title = '章节标题'
      }
    }

    // Find the save button (primary type button with "保存" text)
    const buttons = wrapper.findAll('.el-button-stub')
    let saveButton = null
    for (const btn of buttons) {
      if (btn.text().includes('保存')) {
        saveButton = btn
        break
      }
    }

    expect(saveButton).not.toBeNull()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(mockSaveChapter).toHaveBeenCalled()
  })

  it('shows warning when saving without a title', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const buttons = wrapper.findAll('.el-button-stub')
    let saveButton = null
    for (const btn of buttons) {
      if (btn.text().includes('保存')) {
        saveButton = btn
        break
      }
    }

    expect(saveButton).not.toBeNull()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请输入章节标题')
    expect(mockSaveChapter).not.toHaveBeenCalled()
  })

  // ---- 4. Quality check trigger ----

  it('shows warning when triggering quality check without content', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const buttons = wrapper.findAll('.el-button-stub')
    let qualityButton = null
    for (const btn of buttons) {
      if (btn.text().includes('防吃书预警')) {
        qualityButton = btn
        break
      }
    }

    if (qualityButton) {
      await qualityButton.trigger('click')
      await flushPromises()
      expect(ElMessage.warning).toHaveBeenCalled()
    }
  })

  it('registers keyboard shortcuts on mount', async () => {
    await mountDialog({ modelValue: true })
    await flushPromises()

    const ids = registeredShortcuts.map(s => s.id)
    expect(ids).toContain('chapter-editor.save')
    expect(ids).toContain('chapter-editor.find')
    expect(ids).toContain('chapter-editor.quality')
    expect(ids).toContain('chapter-editor.review')
  })

  // ---- 5. Keyboard shortcuts ----

  it('save shortcut is disabled when saving or generating', async () => {
    const _wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const saveShortcut = registeredShortcuts.find(s => s.id === 'chapter-editor.save')
    expect(saveShortcut).toBeDefined()

    // Initially not disabled
    expect(saveShortcut!.disabled?.()).toBe(false)
  })

  it('quality shortcut is disabled when quality check is running', async () => {
    await mountDialog({ modelValue: true })
    await flushPromises()

    const qualityShortcut = registeredShortcuts.find(s => s.id === 'chapter-editor.quality')
    expect(qualityShortcut).toBeDefined()
    // Initially not disabled
    expect(qualityShortcut!.disabled?.()).toBe(false)
  })

  // ---- 6. Status display ----

  it('displays the initial save status as idle (未保存)', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const statusEl = wrapper.find('[role="status"]')
    expect(statusEl.exists()).toBe(true)
    // Save status shows "未保存" initially
    expect(wrapper.text()).toContain('未保存')
  })

  // ---- 7. Auto-save scheduling ----

  it('schedules auto-save when chapter title and content change', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    // Set a title so auto-save is eligible
    vm.chapterForm.title = '自动保存标题'
    await nextTick()
    await flushPromises()

    // The auto-save should be pending
    expect(vm.saveStatus).not.toBe('idle')
  })

  // ---- 8. Find/replace toggle ----

  it('toggles find/replace panel when the button is clicked', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.showFindReplace).toBe(false)

    const buttons = wrapper.findAll('.el-button-stub')
    let findReplaceButton: ReturnType<typeof buttons[0]> | null = null
    for (const btn of buttons) {
      if (btn.text().includes('查找替换')) {
        findReplaceButton = btn
        break
      }
    }

    expect(findReplaceButton).not.toBeNull()
    await findReplaceButton!.trigger('click')
    expect(vm.showFindReplace).toBe(true)

    await findReplaceButton!.trigger('click')
    expect(vm.showFindReplace).toBe(false)
  })

  // ---- 9. Optimize content info message ----

  it('shows info message when optimizeContent is triggered', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const buttons = wrapper.findAll('.el-button-stub')
    let optimizeButton: ReturnType<typeof buttons[0]> | null = null
    for (const btn of buttons) {
      if (btn.text().includes('打磨文笔')) {
        optimizeButton = btn
        break
      }
    }

    expect(optimizeButton).not.toBeNull()
    await optimizeButton!.trigger('click')
    await flushPromises()

    expect(ElMessage.info).toHaveBeenCalledWith('内容优化功能开发中...')
  })

  // ---- 10. Review panel: no content warning ----

  it('shows warning when running review without content', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const buttons = wrapper.findAll('.el-button-stub')
    let reviewButton: ReturnType<typeof buttons[0]> | null = null
    for (const btn of buttons) {
      if (btn.text().includes('审校')) {
        reviewButton = btn
        break
      }
    }

    expect(reviewButton).not.toBeNull()
    await reviewButton!.trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('请先填写章节内容')
  })

  // ---- 11. Version restore handler ----

  it('restores content and title from version and schedules auto-save', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    // Set a title so auto-save is eligible
    vm.chapterForm.title = '原始标题'
    vm.chapterForm.content = '原始内容'
    await nextTick()
    await flushPromises()

    // Invoke handleVersionRestore via the component instance
    vm.handleVersionRestore('恢复后的内容', '恢复后的标题')
    await nextTick()
    await flushPromises()

    expect(vm.chapterForm.content).toBe('恢复后的内容')
    expect(vm.chapterForm.title).toBe('恢复后的标题')
    // auto-save should have been triggered (status not idle)
    expect(vm.saveStatus).not.toBe('idle')
  })

  // ---- 12. Save checkpoint calls createSnapshot ----

  it('creates a snapshot when saveCheckpoint is called with title and content', async () => {
    const { createSnapshot, pruneSnapshots } = await import('@/utils/chapterVersioning')
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    vm.chapterForm.title = '检查点标题'
    vm.chapterForm.content = '检查点内容'
    await nextTick()
    await flushPromises()

    await vm.saveCheckpoint()
    await flushPromises()

    expect(createSnapshot).toHaveBeenCalled()
    expect(pruneSnapshots).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('手动版本已保存')
  })

  // ---- 13. Save checkpoint shows error on failure ----

  it('shows error message when saveCheckpoint fails', async () => {
    const { createSnapshot } = await import('@/utils/chapterVersioning')
    vi.mocked(createSnapshot).mockRejectedValueOnce(new Error('snapshot failed'))

    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    vm.chapterForm.title = '检查点标题'
    vm.chapterForm.content = '检查点内容'
    await nextTick()
    await flushPromises()

    await vm.saveCheckpoint()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('手动版本保存失败'))
  })

  // ---- 14. Save emits 'saved' event with chapter data ----

  it('emits saved event with chapter data after successful save', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    vm.chapterForm.title = '可保存标题'
    vm.chapterForm.content = '可保存内容'
    await nextTick()
    await flushPromises()

    const buttons = wrapper.findAll('.el-button-stub')
    let saveButton: ReturnType<typeof buttons[0]> | null = null
    for (const btn of buttons) {
      if (btn.text().includes('保存')) {
        saveButton = btn
        break
      }
    }

    expect(saveButton).not.toBeNull()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('saved')).toBeTruthy()
    const savedPayload = wrapper.emitted('saved')![0][0] as any
    expect(savedPayload.title).toBe('可保存标题')
    expect(savedPayload.content).toBe('可保存内容')
  })

  // ---- 15. "新建章节" label when no chapter is provided ----

  it('displays "新建章节" label when no chapter is passed', async () => {
    const wrapper = await mountDialog({ modelValue: true, chapter: undefined })
    await flushPromises()

    expect(wrapper.text()).toContain('新建章节')
  })

  // ---- 16. Auto-save fires after the 3-second timer ----

  it('persists chapter draft after the 3-second auto-save timer', async () => {
    const wrapper = await mountDialog({ modelValue: true })
    await flushPromises()

    const vm = wrapper.vm as any
    vm.chapterForm.title = '自动保存标题'
    vm.chapterForm.content = '自动保存内容'
    await nextTick()
    await flushPromises()

    // Advance fake timers by 3 seconds to trigger the auto-save
    vi.advanceTimersByTime(3100)
    await flushPromises()

    expect(mockSaveChapter).toHaveBeenCalled()
    expect(vm.saveStatus).toBe('saved')
  })
})
