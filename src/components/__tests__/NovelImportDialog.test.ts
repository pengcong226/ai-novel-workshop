import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createTestPinia } from '@/test/helpers'
import NovelImportDialog from '@/components/NovelImportDialog.vue'

// ---------------------------------------------------------------------------
// Mock stores
// ---------------------------------------------------------------------------

const mockCurrentProject = ref<any>(null)
const mockGlobalConfig = ref<any>(null)
const mockLoadGlobalConfig = vi.fn().mockResolvedValue(undefined)

vi.mock('@/stores/project', () => ({
  useProjectStore: () => ({
    currentProject: mockCurrentProject.value,
    globalConfig: mockGlobalConfig.value,
    loadGlobalConfig: mockLoadGlobalConfig,
  }),
}))

// ---------------------------------------------------------------------------
// Mock utils
// ---------------------------------------------------------------------------

const mockImportNovel = vi.fn()

vi.mock('@/utils/novelImporter', () => ({
  importNovel: (...args: unknown[]) => mockImportNovel(...args),
}))

const mockDetectChapterPattern = vi.fn()

vi.mock('@/utils/chapterParser', () => ({
  detectChapterPattern: (...args: unknown[]) => mockDetectChapterPattern(...args),
}))

const mockAnalyzeNovelWithLLM = vi.fn()

vi.mock('@/utils/llm', () => ({
  analyzeNovelWithLLM: (...args: unknown[]) => mockAnalyzeNovelWithLLM(...args),
  DEFAULT_QUICK_MODE_SAMPLING: { ratio: 0.2 },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 8)),
}))

vi.mock('@/utils/crypto', () => ({
  encryptApiKey: vi.fn((v: string) => `enc:${v}`),
  decryptApiKey: vi.fn((v: string) => v?.replace?.('enc:', '') ?? ''),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/utils/getErrorMessage', () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
  }
})

// ---------------------------------------------------------------------------
// Stub child components
// ---------------------------------------------------------------------------

const AnalysisProgressStub = {
  name: 'AnalysisProgress',
  props: ['progress', 'status', 'tokenUsage', 'estimatedCost'],
  emits: ['cancel'],
  template: '<div class="analysis-progress-stub" />',
}

const ChapterPreviewStub = {
  name: 'ChapterPreview',
  props: ['modelValue'],
  emits: ['update:modelValue', 'confirm', 'regenerate'],
  template: '<div class="chapter-preview-stub" />',
}

const CharacterPreviewStub = {
  name: 'CharacterPreview',
  props: ['modelValue', 'relationships'],
  emits: ['update:modelValue', 'confirm'],
  template: '<div class="character-preview-stub" />',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestFile(name: string, size: number = 1024): File {
  const content = 'a'.repeat(size)
  return new File([content], name, { type: 'text/plain' })
}

function mountDialog(props = { modelValue: true }) {
  return mount(NovelImportDialog, {
    props,
    global: {
      stubs: {
        AnalysisProgress: AnalysisProgressStub,
        ChapterPreview: ChapterPreviewStub,
        CharacterPreview: CharacterPreviewStub,
        'el-dialog': {
          template: '<div class="el-dialog-stub"><slot /><slot name="footer" /></div>',
          props: ['modelValue', 'title', 'width', 'closeOnClickModal'],
          emits: ['update:modelValue'],
        },
        'el-steps': { template: '<div class="el-steps-stub"><slot /></div>', props: ['active', 'finishStatus', 'alignCenter'] },
        'el-step': { name: 'ElStep', template: '<div />', props: ['title'] },
        'el-upload': {
          template: '<div class="el-upload-stub"><slot /><slot name="tip" /></div>',
          props: ['drag', 'autoUpload', 'limit', 'onChange', 'onRemove', 'accept'],
          methods: {
            clearFiles: vi.fn(),
          },
        },
        'el-form': { template: '<form><slot /></form>', props: ['model', 'labelWidth'] },
        'el-form-item': { template: '<div class="form-item"><slot /></div>', props: ['label'] },
        'el-input': {
          template: '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          props: ['modelValue', 'placeholder', 'type', 'showPassword', 'clearable'],
          emits: ['update:modelValue'],
        },
        'el-switch': {
          template: '<button class="el-switch-stub" :class="{ active: modelValue }" @click="$emit(\'update:modelValue\', !modelValue)" />',
          props: ['modelValue', 'disabled', 'activeText', 'inactiveText'],
          emits: ['update:modelValue'],
        },
        'el-button': {
          template: '<button class="el-button-stub" :class="[type]" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
          props: ['type', 'disabled', 'loading', 'size'],
          emits: ['click'],
        },
        'el-select': {
          template: '<select class="el-select-stub" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
          props: ['modelValue', 'placeholder', 'clearable'],
          emits: ['update:modelValue'],
        },
        'el-option': { template: '<option :value="value"><slot /></option>', props: ['label', 'value'] },
        'el-radio-group': {
          template: '<div class="el-radio-group-stub"><slot /></div>',
          props: ['modelValue'],
          emits: ['update:modelValue'],
        },
        'el-radio': {
          template: '<label class="el-radio-stub"><slot /></label>',
          props: ['value'],
        },
        'el-input-number': {
          template: '<input class="el-input-number-stub" type="number" :value="modelValue" />',
          props: ['modelValue', 'min', 'max', 'disabled'],
        },
        'el-divider': { template: '<hr />', props: ['contentPosition'] },
        'el-alert': { template: '<div class="el-alert-stub"><slot /><slot name="title" /></div>', props: ['title', 'type', 'closable', 'showIcon'] },
        'el-progress': { template: '<div class="el-progress-stub" />', props: ['percentage', 'status', 'strokeWidth'] },
        'el-card': { template: '<div class="el-card-stub"><slot name="header" /><slot /></div>', props: ['shadow'] },
        'el-row': { template: '<div><slot /></div>', props: ['gutter'] },
        'el-col': { template: '<div><slot /></div>', props: ['span'] },
        'el-statistic': { template: '<div class="el-statistic-stub" />', props: ['title', 'value'] },
        'el-tabs': {
          template: '<div class="el-tabs-stub"><slot /></div>',
          props: ['modelValue'],
          emits: ['update:modelValue'],
        },
        'el-tab-pane': { template: '<div class="el-tab-pane-stub"><slot /></div>', props: ['label', 'name'] },
        'el-table': { template: '<div class="el-table-stub"><slot /></div>', props: ['data', 'maxHeight'] },
        'el-table-column': { template: '<div />', props: ['prop', 'label', 'width', 'minWidth', 'showOverflowTooltip'] },
        'el-tag': { template: '<span class="el-tag-stub"><slot /></span>', props: ['type', 'size'] },
        'el-descriptions': { template: '<div class="el-descriptions-stub"><slot /></div>', props: ['column', 'border'] },
        'el-descriptions-item': { template: '<div class="el-desc-item"><slot /></div>', props: ['label'] },
        'el-timeline': { template: '<div class="el-timeline-stub"><slot /></div>', props: [] },
        'el-timeline-item': { template: '<div class="el-timeline-item-stub"><slot /></div>', props: ['timestamp', 'placement'] },
        'el-collapse': { template: '<div class="el-collapse-stub"><slot /></div>', props: [] },
        'el-collapse-item': { template: '<div class="el-collapse-item-stub"><slot /></div>', props: ['title'] },
        'el-icon': { template: '<span class="el-icon-stub"><slot /></span>', props: [] },
        UploadFilled: { template: '<span />', props: [] },
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NovelImportDialog', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
    mockCurrentProject.value = null
    mockGlobalConfig.value = null
    localStorage.clear()
  })

  // =========================================================================
  // 1. Dialog rendering
  // =========================================================================

  it('renders the dialog when modelValue is true', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.el-dialog-stub').exists()).toBe(true)
  })

  it('renders the step bar with 4 steps', () => {
    const wrapper = mountDialog()
    const steps = wrapper.findAllComponents({ name: 'ElStep' })
    expect(steps).toHaveLength(4)
  })

  it('shows the upload section on the first step', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.upload-section').isVisible()).toBe(true)
  })

  // =========================================================================
  // 2. Step navigation
  // =========================================================================

  it('disables "next" button on step 0 when no file is selected', () => {
    const wrapper = mountDialog()
    const nextBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '下一步'
    )
    expect(nextBtn).toBeDefined()
    expect(nextBtn!.attributes('disabled')).toBeDefined()
  })

  it('enables "next" button after file is selected and title is filled', async () => {
    const wrapper = mountDialog()

    // Simulate file selection via handleFileChange (called by el-upload onChange)
    const file = createTestFile('test-novel.txt')
    const vm = wrapper.vm as any
    vm.selectedFile = file
    vm.importForm.title = 'Test Novel'
    await wrapper.vm.$nextTick()

    const nextBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '下一步'
    )
    expect(nextBtn).toBeDefined()
    expect(nextBtn!.attributes('disabled')).toBeUndefined()
  })

  it('navigates to step 1 (options) and shows options section on next click', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    // Set up step 0 valid state
    vm.selectedFile = createTestFile('novel.txt')
    vm.importForm.title = 'My Novel'
    await wrapper.vm.$nextTick()

    // Click "next"
    const nextBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '下一步'
    )!
    await nextBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(vm.currentStep).toBe(1)
    expect(wrapper.find('.options-section').isVisible()).toBe(true)
  })

  it('navigates back to step 0 when clicking "previous"', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    // Move to step 1
    vm.selectedFile = createTestFile('novel.txt')
    vm.importForm.title = 'My Novel'
    vm.currentStep = 1
    await wrapper.vm.$nextTick()

    const prevBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '上一步'
    )!
    await prevBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(vm.currentStep).toBe(0)
  })

  // =========================================================================
  // 3. File upload validation
  // =========================================================================

  it('rejects files larger than 10MB', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    const oversized = createTestFile('huge.txt', 11 * 1024 * 1024)
    const uploadFile = { raw: oversized, name: 'huge.txt' }

    // Call handleFileChange directly
    vm.handleFileChange(uploadFile)
    await wrapper.vm.$nextTick()

    // File should not be accepted
    expect(vm.selectedFile).toBeNull()
  })

  it('rejects files with unsupported extensions (.pdf, .docx)', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    const pdfFile = createTestFile('novel.pdf')
    const uploadFile = { raw: pdfFile, name: 'novel.pdf' }

    vm.handleFileChange(uploadFile)
    await wrapper.vm.$nextTick()

    expect(vm.selectedFile).toBeNull()
  })

  it('accepts .txt files under 10MB', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    const validFile = createTestFile('novel.txt', 1024)
    const uploadFile = { raw: validFile, name: 'novel.txt' }

    vm.handleFileChange(uploadFile)
    await wrapper.vm.$nextTick()

    expect(vm.selectedFile).toBe(validFile)
  })

  it('accepts .md files', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    const mdFile = createTestFile('novel.md', 512)
    const uploadFile = { raw: mdFile, name: 'novel.md' }

    vm.handleFileChange(uploadFile)
    await wrapper.vm.$nextTick()

    expect(vm.selectedFile).toBe(mdFile)
  })

  it('auto-fills title from filename when a file is selected', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    // Start with empty title
    expect(vm.importForm.title).toBe('')

    const file = createTestFile('my-novel.txt')
    const uploadFile = { raw: file, name: 'my-novel.txt' }
    vm.handleFileChange(uploadFile)
    await wrapper.vm.$nextTick()

    // The watch on selectedFile should auto-fill the title
    expect(vm.importForm.title).toBe('my-novel')
  })

  // =========================================================================
  // 4. Import preview
  // =========================================================================

  it('shows preview stats after traditional import completes', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    const mockResult = {
      project: {
        title: 'Test Novel',
        author: 'Author',
        chapters: [
          { id: '1', number: 1, title: 'Chapter 1', content: 'content', wordCount: 100 },
        ],
        characters: [
          { id: 'c1', name: 'Hero', tags: ['protagonist'], personality: [] },
        ],
        stats: { totalWords: 100, totalChapters: 1, avgWordsPerChapter: 100 },
      },
      stats: { totalWords: 100, totalChapters: 1, avgWordsPerChapter: 100 },
    }

    mockImportNovel.mockResolvedValue(mockResult)
    mockDetectChapterPattern.mockReturnValue(null)

    // Set up file and advance to processing step
    const file = createTestFile('novel.txt')
    vm.selectedFile = file
    vm.importForm.title = 'Test Novel'
    vm.importOptions.useAIAnalysis = false
    vm.hasImportModel = false
    vm.currentStep = 1
    await wrapper.vm.$nextTick()

    // Click next to trigger processing
    const nextBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '下一步'
    )!
    await nextBtn.trigger('click')
    await flushPromises()

    // Should auto-advance to preview (step 3)
    expect(vm.currentStep).toBe(3)
    expect(vm.previewData).toBeDefined()
    expect(vm.previewData.title).toBe('Test Novel')
  })

  it('emits "imported" event when user confirms the import', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    // Set up preview data
    vm.currentStep = 3
    vm.previewData = {
      title: 'Test Novel',
      author: 'Author',
      chapters: [],
      characters: [],
      stats: { totalWords: 0, totalChapters: 0, avgWordsPerChapter: 0 },
    }
    vm.importResult = {
      project: vm.previewData,
      stats: { totalWords: 0, totalChapters: 0, avgWordsPerChapter: 0 },
    }
    await wrapper.vm.$nextTick()

    // Find and click "confirm import"
    const confirmBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '确认导入'
    )!
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('imported')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
  })

  // =========================================================================
  // 5. Cancel and reset
  // =========================================================================

  it('closes dialog and resets state when cancel is clicked', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    vm.selectedFile = createTestFile('test.txt')
    vm.importForm.title = 'Some Title'
    vm.currentStep = 2
    await wrapper.vm.$nextTick()

    const cancelBtn = wrapper.findAll('.el-button-stub').find(
      (w) => w.text() === '取消'
    )!
    await cancelBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    expect(vm.currentStep).toBe(0)
    expect(vm.selectedFile).toBeNull()
    expect(vm.importForm.title).toBe('')
  })

  // =========================================================================
  // 6. Role helpers
  // =========================================================================

  it('maps character role tags to correct display names', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    expect(vm.getRoleName('protagonist')).toBe('主角')
    expect(vm.getRoleName('supporting')).toBe('配角')
    expect(vm.getRoleName('antagonist')).toBe('反派')
    expect(vm.getRoleName('minor')).toBe('路人')
    expect(vm.getRoleName('unknown_role')).toBe('未知')
  })

  it('maps character role tags to correct element-plus types', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any

    expect(vm.getRoleType('protagonist')).toBe('primary')
    expect(vm.getRoleType('supporting')).toBe('success')
    expect(vm.getRoleType('antagonist')).toBe('danger')
    expect(vm.getRoleType('minor')).toBe('info')
    expect(vm.getRoleType('unknown_role')).toBe('info')
  })
})
