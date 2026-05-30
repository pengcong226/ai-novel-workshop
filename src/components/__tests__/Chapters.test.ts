import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter } from '@/test/mocks'
import type { Chapter } from '@/types'
import Chapters from '@/components/Chapters.vue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/vue-virtual', () => ({
  useVirtualizer: vi.fn((optionsOrRef: any) => {
    const opts = optionsOrRef?.value ?? optionsOrRef
    const count = opts?.count ?? 0
    return {
      getTotalSize: () => count * 200,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, i) => ({
          index: i,
          start: i * 200,
          size: 200,
          end: (i + 1) * 200,
        })),
    }
  }),
}))

vi.mock('@/utils/readingPreview', () => ({
  buildReadingPreview: (chapter: any) => chapter?.content?.slice(0, 200) ?? '',
  truncateReadingPreviewText: (text: string, max: number) => text.slice(0, max),
}))

vi.mock('@/utils/formatters', () => ({
  getChapterStatusType: (status: string) =>
    ({ draft: 'info', revised: 'warning', final: 'success' }[status] ?? 'info'),
  getChapterStatusText: (status: string) =>
    ({ draft: '草稿', revised: '已修订', final: '定稿' }[status] ?? status),
  formatDate: (d: Date) => (d ? '2025-01-01' : ''),
}))

vi.mock('@/utils/errorHandler', () => ({
  getFriendlyMessage: (err: unknown) => String(err),
}))

vi.mock('@/utils/getErrorMessage', () => ({
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/performance', () => ({
  measureSync: (_label: string, fn: () => any) => fn(),
}))

vi.mock('@/services/generation-scheduler', () => ({
  generationScheduler: {
    executeBatchGeneration: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/composables/useChapterExport', () => ({
  useChapterExport: () => ({
    showExportSettings: ref(false),
    exportMode: ref('all'),
    exportChapter: vi.fn(),
    handleExportCommand: vi.fn(),
    handleChapterExport: vi.fn(),
    handleExportComplete: vi.fn(),
  }),
}))

vi.mock('@/composables/useRewriteContinuation', () => ({
  useRewriteContinuation: () => ({
    diffReport: ref(null),
    acceptRewrite: vi.fn(),
    rejectRewrite: vi.fn(),
  }),
}))

vi.mock('@/composables/usePipelineStatePersistence', () => ({
  usePipelineStatePersistence: () => ({
    pipelineEvents: ref([]),
    currentPipelineEvent: ref(null),
    isPipelinePaused: ref(false),
    isPipelineRunning: ref(false),
    showPipelineProgress: ref(false),
    restoreState: vi.fn().mockResolvedValue(false),
    pushEvent: vi.fn(),
    startPipeline: vi.fn(),
    finishPipeline: vi.fn(),
    pausePipeline: vi.fn(),
    resumePipeline: vi.fn(),
  }),
}))

vi.mock('@/utils/pipelineLock', () => ({
  acquireProjectLock: vi.fn(() => true),
  releaseProjectLock: vi.fn(),
  getLockConflictMessage: vi.fn(() => 'Lock conflict'),
}))

// ---------------------------------------------------------------------------
// Store mock state
// ---------------------------------------------------------------------------

const mockLoadChapter = vi.fn().mockImplementation(async (id: string) => ({
  id,
  content: `Full content for ${id}`,
}))
const mockDeleteChapter = vi.fn().mockResolvedValue(undefined)
const mockReorderChapters = vi.fn().mockResolvedValue(undefined)
const mockSaveCurrentProject = vi.fn().mockResolvedValue(undefined)

let mockProject: any = null
let mockLoading = false

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    get currentProject() { return mockProject },
    get loading() { return mockLoading },
    loadChapter: mockLoadChapter,
    deleteChapter: mockDeleteChapter,
    reorderChapters: mockReorderChapters,
    saveCurrentProject: mockSaveCurrentProject,
  }),
}))

vi.mock('@/stores/plugin', () => ({
  usePluginStore: () => ({
    getToolbarButtons: () => [],
  }),
}))

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="stub-card"><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'loading', 'size', 'plain'],
  emits: ['click'],
  template: '<button class="stub-button" :data-type="type" @click="$emit(\'click\')"><slot /></button>',
}

const ElDropdownStub = {
  name: 'ElDropdown',
  emits: ['command'],
  template: '<div class="stub-dropdown"><slot /><slot name="dropdown" /></div>',
}

const ElDropdownMenuStub = {
  name: 'ElDropdownMenu',
  template: '<div class="stub-dropdown-menu"><slot /></div>',
}

const ElDropdownItemStub = {
  name: 'ElDropdownItem',
  props: ['command', 'divided'],
  template: '<div class="stub-dropdown-item" :data-command="command"><slot /></div>',
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder', 'clearable', 'size'],
  emits: ['update:modelValue'],
  template: '<input class="stub-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const ElSelectStub = {
  name: 'ElSelect',
  props: ['modelValue', 'placeholder', 'clearable', 'size', 'style'],
  emits: ['update:modelValue'],
  template: '<select class="stub-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
}

const ElOptionStub = {
  name: 'ElOption',
  props: ['label', 'value'],
  template: '<option :value="value">{{ label }}</option>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="stub-tag"><slot /></span>',
}

const ElDividerStub = {
  name: 'ElDivider',
  template: '<hr class="stub-divider" />',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="stub-icon"><slot /></span>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="stub-empty"><p>{{ description }}</p><slot /></div>',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'top', 'destroyOnClose'],
  emits: ['update:modelValue'],
  template: '<div class="stub-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
}

const _ElMessageStub = {
  name: 'ElMessage',
  template: '<div />',
}

const globalStubs = {
  ElCard: ElCardStub,
  ElButton: ElButtonStub,
  ElDropdown: ElDropdownStub,
  ElDropdownMenu: ElDropdownMenuStub,
  ElDropdownItem: ElDropdownItemStub,
  ElInput: ElInputStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElTag: ElTagStub,
  ElDivider: ElDividerStub,
  ElIcon: ElIconStub,
  ElEmpty: ElEmptyStub,
  ElDialog: ElDialogStub,
  LoadingSkeleton: { template: '<div class="stub-skeleton" />' },
  ErrorBoundary: { template: '<div class="stub-error-boundary"><slot /></div>' },
  ChapterEditorDialog: { template: '<div class="stub-editor-dialog" />' },
  ChapterReadingPreview: { template: '<div class="stub-reading-preview" />' },
  ContinuationPanel: { template: '<div class="stub-continuation-panel" />' },
  RewritePanel: { template: '<div class="stub-rewrite-panel" />' },
  StateDiffViewer: { template: '<div class="stub-state-diff-viewer" />' },
  WriteNextDialog: { template: '<div class="stub-write-next-dialog" />' },
  PipelineProgressPanel: { template: '<div class="stub-pipeline-progress" />' },
  ExportSettings: { template: '<div class="stub-export-settings" />' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChapters(overrides: Partial<Chapter>[] = []): Chapter[] {
  return overrides.map((o, i) =>
    createMockChapter({
      number: i + 1,
      title: `Chapter ${i + 1}`,
      content: `Content of chapter ${i + 1}.`,
      wordCount: 2000,
      status: 'draft',
      ...o,
    }),
  )
}

function mountChapters(chapters: Chapter[] = []) {
  mockProject = {
    id: 'proj-1',
    title: 'Test Project',
    chapters,
  }
  mockLoading = false

  return mount(Chapters, {
    global: {
      stubs: globalStubs,
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chapters.vue', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    mockProject = null
    mockLoading = false
  })

  // ---- Empty state ----

  it('renders the empty state when there are no chapters', async () => {
    const wrapper = mountChapters([])

    // Wait for loading to resolve
    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有章节')
  })

  it('shows "创建第一章" button in empty state', async () => {
    const wrapper = mountChapters([])

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    const empty = wrapper.find('.stub-empty')
    expect(empty.find('.stub-button').exists()).toBe(true)
    expect(empty.text()).toContain('创建第一章')
  })

  // ---- Chapter list rendering ----

  it('renders chapter cards when chapters exist', async () => {
    const chapters = makeChapters([
      { title: 'The Beginning', wordCount: 3000 },
      { title: 'The Middle', wordCount: 4000 },
    ])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.chapter-card')
    expect(cards).toHaveLength(2)
  })

  it('displays chapter number, title, and word count', async () => {
    const chapters = makeChapters([
      { number: 1, title: 'Awakening', wordCount: 2500 },
    ])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('第1章')
    expect(wrapper.text()).toContain('Awakening')
    expect(wrapper.text()).toContain('2500字')
  })

  it('displays status tag with correct text for draft chapters', async () => {
    const chapters = makeChapters([{ status: 'draft' }])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.stub-tag').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.text()).toContain('草稿')
  })

  it('displays AI-generated badge when generatedBy is ai', async () => {
    const chapters = makeChapters([{ generatedBy: 'ai' }])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('AI生成')
  })

  // ---- Header actions ----

  it('renders all header action buttons', async () => {
    const chapters = makeChapters([{}])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    const _buttonTexts = wrapper.findAll('.header .stub-button, .actions .stub-button').map(b => b.text())
    const allText = wrapper.text()

    // Verify key action labels are present
    expect(allText).toContain('验证章节')
    expect(allText).toContain('导出')
    expect(allText).toContain('批量生成')
    expect(allText).toContain('一键续写')
    expect(allText).toContain('新建章节')
  })

  // ---- Quality score display ----

  it('shows quality score when chapter has a qualityScore', async () => {
    const chapters = makeChapters([{ qualityScore: 8.5 }])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('质量评分')
    expect(wrapper.text()).toContain('8.5/10')
  })

  it('does not show quality score section when qualityScore is absent', async () => {
    const chapters = makeChapters([{ qualityScore: undefined }])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('质量评分')
  })

  // ---- Search bar and filters ----

  it('renders search bar when chapters exist', async () => {
    const chapters = makeChapters([{}])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.chapter-search-bar').exists()).toBe(true)
    expect(wrapper.find('.stub-input').exists()).toBe(true)
  })

  it('does not render search bar when chapters list is empty', async () => {
    const wrapper = mountChapters([])

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.chapter-search-bar').exists()).toBe(false)
  })

  // ---- Export dropdown ----

  it('renders export dropdown menu items', async () => {
    const chapters = makeChapters([{}])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    const menuItems = wrapper.findAll('.stub-dropdown-item')
    const commands = menuItems.map(item => item.attributes('data-command'))

    expect(commands).toContain('exportAllMarkdown')
    expect(commands).toContain('exportAllPdf')
    expect(commands).toContain('exportAllTxt')
  })

  // ---- Per-chapter action buttons ----

  it('renders edit and preview buttons for each chapter', async () => {
    const chapters = makeChapters([
      { title: 'Chapter A' },
      { title: 'Chapter B' },
    ])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    const chapterCards = wrapper.findAll('.chapter-card')
    for (const card of chapterCards) {
      const buttons = card.findAll('.stub-button')
      const _buttonTexts = buttons.map(b => b.text())
      expect(buttonTexts.some(t => t.includes('编辑'))).toBe(true)
      expect(buttonTexts.some(t => t.includes('预览'))).toBe(true)
    }
  })

  // ---- Loading state ----

  it('shows loading skeleton while chapters are loading and no project exists', async () => {
    mockLoading = true
    mockProject = null

    const wrapper = mount(Chapters, {
      global: { stubs: globalStubs },
    })

    // Skeleton is shown when loading is true and project is not yet available
    expect(wrapper.find('.stub-skeleton').exists()).toBe(true)
  })

  // ---- Date formatting in chapter stats ----

  it('displays formatted generation date in chapter stats', async () => {
    const chapters = makeChapters([{}])
    const wrapper = mountChapters(chapters)

    await new Promise((r) => setTimeout(r, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('2025-01-01')
  })
})
