import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockChapter, createMockProject } from '@/test/mocks'
import { useProjectStore } from '@/stores/project'
import SummaryManager from '@/components/SummaryManager.vue'
import type { Chapter, ChapterSummaryData } from '@/types'
import { SummaryDetail } from '@/types'

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
})
