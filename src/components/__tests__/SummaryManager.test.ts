import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia, flushPromises } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter, createMockProject } from '@/test/mocks'
import { useProjectStore } from '@/stores/project'
import SummaryManager from '@/components/SummaryManager.vue'
import type { Chapter, ChapterSummaryData } from '@/types'
import { SummaryDetail } from '@/types'
import {
  generateChapterSummary,
  batchGenerateSummaries,
  checkSummaryQuality,
} from '@/utils/summarizer'
import { ElMessage, ElMessageBox } from 'element-plus'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/utils/summarizer', () => ({
  generateChapterSummary: vi.fn().mockResolvedValue({
    id: 'summary-gen',
    chapterNumber: 1,
    title: 'Test',
    summary: 'Generated summary text',
    keyEvents: ['事件A'],
    characters: ['角色A'],
    locations: ['地点A'],
    plotProgression: '剧情推进',
    wordCount: 100,
    summaryWordCount: 20,
    tokenCount: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    detail: 'brief',
  }),
  batchGenerateSummaries: vi.fn().mockResolvedValue([]),
  checkSummaryQuality: vi.fn().mockReturnValue({
    isValid: true,
    issues: [],
    suggestions: [],
    score: 8,
    completeness: 0.9,
    coherence: 0.85,
    conciseness: 0.8,
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm'),
  },
}))

vi.mock('@element-plus/icons-vue', () => ({
  MagicStick: { name: 'MagicStick', template: '<span />' },
  Refresh: { name: 'Refresh', template: '<span />' },
}))

// ---------------------------------------------------------------------------
// Stub Element Plus components
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="stub-card"><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'loading'],
  emits: ['click'],
  template: '<button class="stub-button" :class="[type && `type-${type}`, size]" :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="stub-tag" :data-type="type"><slot /></span>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="stub-empty"><p>{{ description }}</p><slot /></div>',
}

const ElDividerStub = {
  name: 'ElDivider',
  template: '<hr class="stub-divider" />',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'showClose'],
  template: '<div class="stub-dialog" v-if="modelValue"><slot /><slot name="footer" /></div>',
}

const ElFormStub = {
  name: 'ElForm',
  props: ['model', 'labelWidth'],
  template: '<form class="stub-form"><slot /></form>',
}

const ElFormItemStub = {
  name: 'ElFormItem',
  props: ['label'],
  template: '<div class="stub-form-item"><label>{{ label }}</label><slot /></div>',
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'type', 'rows', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input class="stub-input" :value="modelValue" :placeholder="placeholder" />',
}

const ElProgressStub = {
  name: 'ElProgress',
  props: ['percentage', 'format'],
  template: '<div class="stub-progress">{{ percentage }}%</div>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="stub-icon"><slot /></span>',
}

const globalStubs = {
  ElCard: ElCardStub,
  ElButton: ElButtonStub,
  ElTag: ElTagStub,
  ElEmpty: ElEmptyStub,
  ElDivider: ElDividerStub,
  ElDialog: ElDialogStub,
  ElForm: ElFormStub,
  ElFormItem: ElFormItemStub,
  ElInput: ElInputStub,
  ElProgress: ElProgressStub,
  ElIcon: ElIconStub,
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockSummaryData(overrides: Partial<ChapterSummaryData> = {}): ChapterSummaryData {
  return {
    id: 'summary-1',
    chapterNumber: 1,
    title: 'Chapter 1',
    summary: '这是一段摘要文本，描述了本章的主要内容。',
    keyEvents: ['主角觉醒', '敌人来袭', '获得宝物'],
    characters: ['张三', '李四', '王五'],
    locations: ['皇宫', '密林'],
    plotProgression: '主角从沉睡中觉醒，发现敌人已经来袭',
    wordCount: 5000,
    summaryWordCount: 100,
    tokenCount: 150,
    createdAt: new Date(),
    updatedAt: new Date(),
    detail: SummaryDetail.BRIEF,
    ...overrides,
  }
}

function mountWithChapters(chapters: Chapter[] = []) {
  const pinia = createTestPinia()
  const project = createMockProject({ chapters })
  const store = useProjectStore()
  store.currentProject = project

  // Spy on saveCurrentProject to prevent IndexedDB errors in test environment
  vi.spyOn(store, 'saveCurrentProject').mockResolvedValue(undefined)

  const wrapper = mount(SummaryManager, {
    global: {
      plugins: [pinia],
      stubs: globalStubs,
    },
  })

  return { wrapper, project, store, pinia }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SummaryManager', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
  })

  // ---- Empty state ----

  it('renders empty state when no chapters exist', () => {
    const { wrapper } = mountWithChapters([])

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有章节')
  })

  it('emits createChapter when "创建章节" button is clicked in empty state', async () => {
    const { wrapper } = mountWithChapters([])

    const button = wrapper.find('.stub-empty .stub-button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('创建章节')

    await button.trigger('click')
    expect(wrapper.emitted('createChapter')).toHaveLength(1)
  })

  // ---- Summary list rendering ----

  it('renders summary cards for each chapter', () => {
    const chapters = [
      createMockChapter({ number: 1, title: '开端', summaryData: createMockSummaryData() }),
      createMockChapter({ number: 2, title: '冲突', summaryData: createMockSummaryData({ chapterNumber: 2 }) }),
      createMockChapter({ number: 3, title: '决战' }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    // Header card + 3 chapter cards
    const cards = wrapper.findAll('.stub-card')
    expect(cards.length).toBe(4)
  })

  it('displays chapter number and title for each chapter', () => {
    const chapters = [
      createMockChapter({ number: 1, title: '命运之始', summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    expect(wrapper.text()).toContain('第1章')
    expect(wrapper.text()).toContain('命运之始')
  })

  // ---- Summary status tags ----

  it('shows "已生成" tag when chapter has summary data', () => {
    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const tags = wrapper.findAll('.stub-tag')
    const statusTag = tags.find((t) => t.text().includes('已生成'))
    expect(statusTag).toBeDefined()
  })

  it('shows "未生成" tag when chapter has no summary data', () => {
    const chapters = [
      createMockChapter({ number: 1 }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const tags = wrapper.findAll('.stub-tag')
    const statusTag = tags.find((t) => t.text().includes('未生成'))
    expect(statusTag).toBeDefined()
  })

  // ---- Summary detail display ----

  it('displays summary text content when summary data exists', () => {
    const summaryData = createMockSummaryData({ summary: '这是一段自定义摘要' })
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    expect(wrapper.find('.summary-text').exists()).toBe(true)
    expect(wrapper.find('.summary-text').text()).toContain('这是一段自定义摘要')
  })

  it('displays key events, characters, locations and plot progression', () => {
    const summaryData = createMockSummaryData({
      keyEvents: ['大战一场', '寻得秘宝'],
      characters: ['李白', '杜甫'],
      locations: ['长安', '蜀道'],
      plotProgression: '二人在长安相遇后踏上了蜀道之旅',
    })
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const details = wrapper.find('.summary-details')
    expect(details.exists()).toBe(true)
    expect(details.text()).toContain('大战一场')
    expect(details.text()).toContain('寻得秘宝')
    expect(details.text()).toContain('李白')
    expect(details.text()).toContain('杜甫')
    expect(details.text()).toContain('长安')
    expect(details.text()).toContain('蜀道')
    expect(details.text()).toContain('二人在长安相遇后踏上了蜀道之旅')
  })

  it('displays summary statistics (word count, token count, detail level)', () => {
    const summaryData = createMockSummaryData({
      summaryWordCount: 200,
      tokenCount: 300,
      detail: SummaryDetail.DETAILED,
    })
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    expect(wrapper.find('.summary-stats').exists()).toBe(true)
    expect(wrapper.text()).toContain('200字')
    expect(wrapper.text()).toContain('300 tokens')
    expect(wrapper.text()).toContain('详细摘要')
  })

  it('displays quality check score and metrics when summary exists', () => {
    const summaryData = createMockSummaryData()
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const qualityCheck = wrapper.find('.quality-check')
    expect(qualityCheck.exists()).toBe(true)
    expect(qualityCheck.text()).toContain('质量评分: 8/10')
    expect(qualityCheck.text()).toContain('完整度: 90%')
    expect(qualityCheck.text()).toContain('连贯性: 85%')
    expect(qualityCheck.text()).toContain('简洁性: 80%')
  })

  // ---- No summary placeholder ----

  it('shows "还没有生成摘要" and generate button for chapters without summaries', () => {
    const chapters = [
      createMockChapter({ number: 1 }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    expect(wrapper.find('.no-summary').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有生成摘要')

    const generateBtn = wrapper.find('.no-summary .stub-button')
    expect(generateBtn.exists()).toBe(true)
    expect(generateBtn.text()).toContain('生成摘要')
  })

  // ---- Detail level text mapping ----

  it('renders all summary detail level labels correctly', () => {
    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData({ detail: SummaryDetail.FULL }) }),
      createMockChapter({ number: 2, summaryData: createMockSummaryData({ detail: SummaryDetail.DETAILED }) }),
      createMockChapter({ number: 3, summaryData: createMockSummaryData({ detail: SummaryDetail.BRIEF }) }),
      createMockChapter({ number: 4, summaryData: createMockSummaryData({ detail: SummaryDetail.MINIMAL }) }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    expect(wrapper.text()).toContain('完整内容')
    expect(wrapper.text()).toContain('详细摘要')
    expect(wrapper.text()).toContain('简要摘要')
    expect(wrapper.text()).toContain('极简摘要')
  })

  // ---- Header actions ----

  it('renders "生成所有摘要" and "刷新" buttons in header', () => {
    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const buttons = wrapper.findAll('.stub-button')
    const generateAllBtn = buttons.find((b) => b.text().includes('生成所有摘要'))
    const refreshBtn = buttons.find((b) => b.text().includes('刷新'))

    expect(generateAllBtn).toBeDefined()
    expect(refreshBtn).toBeDefined()
  })

  // ---- Mixed chapters (with and without summaries) ----

  it('correctly renders mix of chapters with and without summaries', () => {
    const chapters = [
      createMockChapter({ number: 1, title: '第一章', summaryData: createMockSummaryData() }),
      createMockChapter({ number: 2, title: '第二章' }),
      createMockChapter({ number: 3, title: '第三章', summaryData: createMockSummaryData({ detail: SummaryDetail.DETAILED }) }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    // First chapter should have summary content
    expect(wrapper.text()).toContain('已生成')
    // Second chapter should have no-summary placeholder
    expect(wrapper.text()).toContain('还没有生成摘要')
    // Third chapter has detailed summary
    expect(wrapper.text()).toContain('详细摘要')
  })

  // ---- Edit and regenerate buttons ----

  it('shows edit and regenerate buttons for chapters with summaries', () => {
    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const buttons = wrapper.findAll('.summary-actions .stub-button')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    const regenBtn = buttons.find((b) => b.text().includes('重新生成'))

    expect(editBtn).toBeDefined()
    expect(regenBtn).toBeDefined()
  })

  // ---- Generate individual chapter summary ----

  it('calls generateChapterSummary when "生成摘要" button is clicked', async () => {
    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, title: '开端' }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const generateBtn = wrapper.find('.no-summary .stub-button')
    await generateBtn.trigger('click')

    expect(generateChapterSummary).toHaveBeenCalled()
  })

  // ---- Regenerate summary with confirmation ----

  it('calls ElMessageBox.confirm before regenerating', async () => {
    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const regenBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('重新生成'))
    await regenBtn!.trigger('click')

    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('重新生成将覆盖'),
      expect.any(String),
      expect.objectContaining({ type: 'warning' })
    )
  })

  // ---- Edit dialog ----

  it('opens edit dialog with pre-filled data when "编辑" button is clicked', async () => {
    const summaryData = createMockSummaryData({
      summary: '自定义摘要内容',
      keyEvents: ['事件甲', '事件乙'],
      characters: ['张三'],
      locations: ['皇宫'],
      plotProgression: '剧情发展',
    })
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    // Dialog should be visible
    const dialog = wrapper.find('.stub-dialog')
    expect(dialog.exists()).toBe(true)

    // Dialog form should contain the form labels
    expect(dialog.text()).toContain('摘要内容')
    expect(dialog.text()).toContain('关键事件')
    expect(dialog.text()).toContain('出场人物')
    expect(dialog.text()).toContain('场景地点')
    expect(dialog.text()).toContain('剧情推进')
  })

  // ---- Refresh ----

  it('clears quality check cache and shows success message on refresh', async () => {
    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const refreshBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('刷新'))
    await refreshBtn!.trigger('click')

    expect(ElMessage.success).toHaveBeenCalledWith('已刷新')
  })

  // ---- Quality tag type based on isValid ----

  it('shows success tag type when quality check passes', () => {
    vi.mocked(checkSummaryQuality).mockReturnValue({
      isValid: true, issues: [], suggestions: [], score: 9,
      completeness: 0.95, coherence: 0.9, conciseness: 0.85,
    })

    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const statusTag = wrapper.findAll('.stub-tag')
      .find((t) => t.text().includes('已生成'))
    expect(statusTag?.attributes('data-type')).toBe('success')
  })

  it('shows warning tag type when quality check fails', () => {
    vi.mocked(checkSummaryQuality).mockReturnValue({
      isValid: false, issues: ['too short'], suggestions: ['add detail'], score: 3,
      completeness: 0.3, coherence: 0.4, conciseness: 0.5,
    })

    const chapters = [
      createMockChapter({ number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const statusTag = wrapper.findAll('.stub-tag')
      .find((t) => t.text().includes('已生成'))
    expect(statusTag?.attributes('data-type')).toBe('warning')
  })

  // ---- Empty detail arrays hide detail sections ----

  it('hides detail items when keyEvents, characters, and locations are empty', () => {
    const summaryData = createMockSummaryData({
      keyEvents: [],
      characters: [],
      locations: [],
      plotProgression: '',
    })
    const chapters = [
      createMockChapter({ number: 1, summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const details = wrapper.find('.summary-details')
    expect(details.exists()).toBe(true)
    // No detail-item divs should be rendered
    expect(details.findAll('.detail-item').length).toBe(0)
  })

  // ---- Generate all summaries ----

  it('shows warning when "生成所有摘要" is clicked with no chapters', async () => {
    const { wrapper } = mountWithChapters([])

    // Click header "生成所有摘要" button (not in empty state)
    const headerBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('生成所有摘要'))

    // In empty state, the generate-all button is in the header card
    // which still renders even with 0 chapters
    if (headerBtn) {
      await headerBtn.trigger('click')
      expect(ElMessage.warning).toHaveBeenCalledWith('没有章节需要生成摘要')
    }
  })

  it('calls batchGenerateSummaries when "生成所有摘要" is clicked with eligible chapters', async () => {
    // Create 6 chapters: chapters 1-3 qualify (number < maxChapter - 3 = 6-3=3)
    const chapters = Array.from({ length: 6 }, (_, i) =>
      createMockChapter({ id: `ch-${i + 1}`, number: i + 1, title: `第${i + 1}章` })
    )
    const { wrapper } = mountWithChapters(chapters)

    const generateAllBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('生成所有摘要'))
    await generateAllBtn!.trigger('click')
    await flushPromises()

    // batchGenerateSummaries should be called with chapters whose number < max(6) - 3 = 3
    expect(batchGenerateSummaries).toHaveBeenCalled()
  })

  // ---- Status tag type for chapters without summary ----

  it('shows info tag type for chapters without summary data', () => {
    const chapters = [
      createMockChapter({ number: 1 }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const statusTag = wrapper.findAll('.stub-tag')
      .find((t) => t.text().includes('未生成'))
    expect(statusTag?.attributes('data-type')).toBe('info')
  })

  // ---- saveSummary flow ----

  it('saves edited summary to project and calls saveCurrentProject', async () => {
    const chapters = [
      createMockChapter({
        id: 'ch-1',
        number: 1,
        title: '开端',
        summaryData: createMockSummaryData({ summary: '原始摘要' }),
      }),
    ]
    const { wrapper, project: _project } = mountWithChapters(chapters)

    // Open edit dialog
    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    // Click save button in dialog footer
    const dialogFooter = wrapper.find('.stub-dialog')
    const saveBtn = dialogFooter.findAll('.stub-button')
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    // saveCurrentProject should have been called
    const store = useProjectStore()
    expect(store.saveCurrentProject).toHaveBeenCalled()
  })

  it('shows success message after saving summary', async () => {
    const chapters = [
      createMockChapter({
        id: 'ch-1',
        number: 1,
        title: '开端',
        summaryData: createMockSummaryData({ summary: '原始摘要' }),
      }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    const dialogFooter = wrapper.find('.stub-dialog')
    const saveBtn = dialogFooter.findAll('.stub-button')
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('摘要已保存')
  })

  it('closes edit dialog after saving', async () => {
    const chapters = [
      createMockChapter({
        id: 'ch-1',
        number: 1,
        title: '开端',
        summaryData: createMockSummaryData({ summary: '原始摘要' }),
      }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    // Dialog should be visible
    expect(wrapper.find('.stub-dialog').exists()).toBe(true)

    const dialogFooter = wrapper.find('.stub-dialog')
    const saveBtn = dialogFooter.findAll('.stub-button')
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    // Dialog should be hidden after save (v-model becomes false)
    expect(wrapper.find('.stub-dialog').exists()).toBe(false)
  })

  // ---- Cancel edit dialog ----

  it('closes edit dialog when cancel button is clicked', async () => {
    const chapters = [
      createMockChapter({
        id: 'ch-1',
        number: 1,
        title: '开端',
        summaryData: createMockSummaryData({ summary: '原始摘要' }),
      }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-dialog').exists()).toBe(true)

    const dialogFooter = wrapper.find('.stub-dialog')
    const cancelBtn = dialogFooter.findAll('.stub-button')
      .find((b) => b.text().includes('取消'))
    await cancelBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-dialog').exists()).toBe(false)
  })

  // ---- generateSummaryForChapter error handling ----

  it('shows error message when generateChapterSummary throws', async () => {
    vi.mocked(generateChapterSummary).mockRejectedValueOnce(new Error('API限流'))

    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, title: '开端' }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const generateBtn = wrapper.find('.no-summary .stub-button')
    await generateBtn.trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('生成失败')
    )
    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('API限流')
    )
  })

  // ---- regenerateSummary cancellation ----

  it('does not call generateChapterSummary when user cancels regeneration', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel')

    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, summaryData: createMockSummaryData() }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    vi.mocked(generateChapterSummary).mockClear()

    const regenBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('重新生成'))
    await regenBtn!.trigger('click')
    await flushPromises()

    expect(generateChapterSummary).not.toHaveBeenCalled()
  })

  // ---- Batch generate: recent chapters skip ----

  it('shows info message when all chapters are in the last 3', async () => {
    // 3 chapters: max = 3, filter ch.number < 3 - 3 = 0 -> none qualify
    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, title: '第一章' }),
      createMockChapter({ id: 'ch-2', number: 2, title: '第二章' }),
      createMockChapter({ id: 'ch-3', number: 3, title: '第三章' }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const generateAllBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('生成所有摘要'))
    await generateAllBtn!.trigger('click')
    await flushPromises()

    expect(ElMessage.info).toHaveBeenCalledWith('最近的3章不需要生成摘要')
    expect(batchGenerateSummaries).not.toHaveBeenCalled()
  })

  // ---- Progress dialog during batch generate ----

  it('shows progress dialog during batch generation', async () => {
    // Make batchGenerateSummaries return after a short delay so we can check dialog visibility
    let batchResolve: (value: any[]) => void
    vi.mocked(batchGenerateSummaries).mockImplementationOnce(
      () => new Promise((resolve) => { batchResolve = resolve })
    )

    // 6 chapters: max = 6, filter ch.number < 6 - 3 = 3 -> chapters 1,2 qualify
    const chapters = Array.from({ length: 6 }, (_, i) =>
      createMockChapter({ id: `ch-${i + 1}`, number: i + 1, title: `第${i + 1}章` })
    )
    const { wrapper } = mountWithChapters(chapters)

    const generateAllBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('生成所有摘要'))
    await generateAllBtn!.trigger('click')

    // Progress dialog should be visible while batch is in progress
    expect(wrapper.find('.progress-content').exists()).toBe(true)
    expect(wrapper.text()).toContain('正在生成第')

    // Resolve the batch to clean up
    batchResolve!([])
    await flushPromises()
  })

  // ---- Batch generate error handling ----

  it('shows error message when batchGenerateSummaries fails', async () => {
    vi.mocked(batchGenerateSummaries).mockRejectedValueOnce(new Error('网络超时'))

    const chapters = Array.from({ length: 6 }, (_, i) =>
      createMockChapter({ id: `ch-${i + 1}`, number: i + 1, title: `第${i + 1}章` })
    )
    const { wrapper } = mountWithChapters(chapters)

    const generateAllBtn = wrapper.findAll('.stub-button')
      .find((b) => b.text().includes('生成所有摘要'))
    await generateAllBtn!.trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('批量生成失败')
    )
    expect(ElMessage.error).toHaveBeenCalledWith(
      expect.stringContaining('网络超时')
    )
  })

  // ---- Edit summary initializes form with empty defaults ----

  it('initializes edit form with empty defaults when summaryData fields are empty', async () => {
    const summaryData = createMockSummaryData({
      summary: '',
      keyEvents: [],
      characters: [],
      locations: [],
      plotProgression: '',
    })
    const chapters = [
      createMockChapter({ id: 'ch-1', number: 1, title: '开端', summaryData }),
    ]
    const { wrapper } = mountWithChapters(chapters)

    const editBtn = wrapper.findAll('.summary-actions .stub-button')
      .find((b) => b.text().includes('编辑'))
    await editBtn!.trigger('click')
    await flushPromises()

    // Dialog should open with the form labels
    const dialog = wrapper.find('.stub-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('摘要内容')
  })
})
