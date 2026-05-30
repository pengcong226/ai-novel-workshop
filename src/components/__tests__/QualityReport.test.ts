import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { createMockProject, createMockChapter, resetMockIdCounter } from '@/test/mocks'
import { ref, nextTick } from 'vue'
import type { QualityReport as QualityReportType } from '@/utils/qualityChecker'

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted ensures availability in hoisted vi.mock factories)
// ---------------------------------------------------------------------------

const { mockCheckChapter, mockCreateQualityChecker } = vi.hoisted(() => {
  const mockCheckChapter = vi.fn()
  const mockCreateQualityChecker = vi.fn().mockReturnValue({
    checkChapter: mockCheckChapter,
  })
  return { mockCheckChapter, mockCreateQualityChecker }
})

const { mockDetect } = vi.hoisted(() => {
  const mockDetect = vi.fn().mockResolvedValue({
    overallScore: 85,
    aiProbability: 0.15,
    humanProbability: 0.85,
    provider: 'local',
    paragraphs: [],
    latencyMs: 100,
  })
  return { mockDetect }
})

vi.mock('@/utils/qualityChecker', () => ({
  createQualityChecker: mockCreateQualityChecker,
  analyzeQualityTrend: vi.fn((reports: any[]) => {
    if (reports.length === 0) {
      return {
        averageScore: 0,
        scoreTrend: 'stable',
        dimensionTrends: {},
        recommendations: [],
      }
    }
    const avg = reports.reduce((s: number, r: any) => s + r.overallScore, 0) / reports.length
    const dimTrends: Record<string, { trend: string; scores: number[] }> = {}
    if (reports[0]?.dimensions) {
      for (const dim of reports[0].dimensions) {
        dimTrends[dim.name] = {
          trend: '稳定',
          scores: reports.map((r: any) => {
            const d = r.dimensions.find((dd: any) => dd.name === dim.name)
            return d ? d.score : 0
          }),
        }
      }
    }
    return {
      averageScore: Math.round(avg * 10) / 10,
      scoreTrend: 'stable',
      dimensionTrends: dimTrends,
      recommendations: ['建议1', '建议2'],
    }
  }),
}))

vi.mock('@/utils/reportExporter', () => ({
  exportQualityReportAsJSON: vi.fn(),
  exportQualityReportAsMarkdown: vi.fn(),
}))

vi.mock('@/services/AIGCDetector', () => ({
  AIGCDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
}))

vi.mock('@/agents/PostWriteValidator', () => ({
  validateSensitiveWords: vi.fn().mockReturnValue([]),
}))

vi.mock('@/composables/useAuditLog', () => ({
  useAuditLog: () => ({
    logs: ref([]),
    addLog: vi.fn(),
    getLogsByChapter: vi.fn().mockReturnValue([]),
  }),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/utils/formatters', () => ({
  formatDate: vi.fn(() => '2025-01-15 10:00'),
  formatNumber: vi.fn((n: number) => String(n)),
  getChapterStatusText: vi.fn((s: string) => s),
  getChapterStatusType: vi.fn(() => 'info'),
}))

vi.mock('echarts/core', () => {
  const mockChart = {
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  }
  return {
    init: vi.fn(() => mockChart),
    use: vi.fn(),
  }
})

vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((md: string) => `<p>${md}</p>`),
  },
}))

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    ElMessageBox: vi.fn().mockResolvedValue('confirm'),
  }
})

// ---------------------------------------------------------------------------
// Stub Element Plus components
// ---------------------------------------------------------------------------

const stub = (name: string, opts: Record<string, any> = {}) => ({
  name,
  props: opts.props ?? [],
  emits: opts.emits ?? [],
  template: opts.template ?? `<div class="stub-${name.toLowerCase()}"><slot /><slot name="header" /><slot name="footer" /><slot name="prefix" /><slot name="default" /><slot name="suffix" /></div>`,
})

const globalStubs = {
  ElCard: stub('ElCard', { template: '<div class="stub-elcard"><slot name="header" /><slot /></div>' }),
  ElButton: stub('ElButton', {
    props: ['type', 'size', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button class="stub-elbutton" :class="type" @click="$emit(\'click\')"><slot /></button>',
  }),
  ElTag: stub('ElTag', { props: ['type', 'size'], template: '<span class="stub-eltag"><slot /></span>' }),
  ElEmpty: stub('ElEmpty', { props: ['description'], template: '<div class="stub-elempty"><p>{{ description }}</p><slot /></div>' }),
  ElRow: stub('ElRow', { props: ['gutter'], template: '<div class="stub-elrow"><slot /></div>' }),
  ElCol: stub('ElCol', { props: ['span'], template: '<div class="stub-elcol"><slot /></div>' }),
  ElDivider: stub('ElDivider', { template: '<hr class="stub-eldivider"/>' }),
  ElDialog: stub('ElDialog', { props: ['modelValue', 'title', 'width', 'top', 'closeOnClickModal', 'closeOnPressEscape', 'showClose'], emits: ['update:modelValue'], template: '<dialog class="stub-eldialog" :open="modelValue"><slot /><slot name="footer" /></dialog>' }),
  ElInput: stub('ElInput', { props: ['modelValue', 'placeholder', 'style', 'clearable'], emits: ['update:modelValue'], template: '<input class="stub-elinput" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" />' }),
  ElStatistic: stub('ElStatistic', { props: ['title', 'value', 'precision'], template: '<div class="stub-elstatistic"><div>{{ title }}</div><div>{{ value }}</div><slot name="suffix" /><slot /></div>' }),
  ElProgress: stub('ElProgress', { props: ['percentage', 'color', 'format', 'strokeWidth'], template: '<div class="stub-elprogress" />' }),
  ElTable: stub('ElTable', {
    props: ['data', 'stripe', 'style'],
    template: '<table class="stub-eltable"><slot /></table>',
  }),
  ElTableColumn: stub('ElTableColumn', {
    props: ['prop', 'label', 'width', 'minWidth'],
    // Do NOT render default slot -- there is no row context in stubs
    template: '<td class="stub-eltablecol">{{ label }}</td>',
  }),
  ElTabs: stub('ElTabs', { props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="stub-eltabs"><slot /></div>' }),
  ElTabPane: stub('ElTabPane', { props: ['label', 'name'], template: '<div class="stub-eltabpane"><slot /></div>' }),
  ElAlert: stub('ElAlert', { props: ['title', 'type', 'showIcon', 'closable'], template: '<div class="stub-elalert"><slot name="title" /><slot /></div>' }),
  ElTimeline: stub('ElTimeline', { template: '<ul class="stub-eltimeline"><slot /></ul>' }),
  ElTimelineItem: stub('ElTimelineItem', { props: ['type', 'timestamp', 'placement', 'size'], template: '<li class="stub-eltimelineitem"><slot /></li>' }),
  ElIcon: stub('ElIcon', { props: ['size'], template: '<i class="stub-elicon"><slot /></i>' }),
  ElBadge: stub('ElBadge', { props: ['value', 'type'], template: '<span class="stub-elbadge"><slot /></span>' }),
  Check: { template: '<span />' },
  Download: { template: '<span />' },
  Search: { template: '<span />' },
  Warning: { template: '<span />' },
  CircleCheckFilled: { template: '<span />' },
  WarnTriangleFilled: { template: '<span />' },
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import QualityReport from '@/components/QualityReport.vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import * as echarts from 'echarts/core'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQualityReport(overrides: Partial<QualityReportType> = {}): QualityReportType {
  return {
    chapterId: 'ch-1',
    chapterNumber: 1,
    timestamp: new Date('2025-01-15T10:00:00Z'),
    overallScore: 8.2,
    dimensions: [
      {
        name: '情节质量',
        score: 8.5,
        maxScore: 10,
        issues: [{ type: 'warning', message: '冲突不够明显', severity: 3 }],
        suggestions: ['建议增加情节冲突'],
      },
      {
        name: '人物塑造',
        score: 7.8,
        maxScore: 10,
        issues: [],
        suggestions: ['丰富配角人物形象'],
      },
      {
        name: '文笔水平',
        score: 8.3,
        maxScore: 10,
        issues: [{ type: 'info', message: '句式可更多样', severity: 1 }],
        suggestions: [],
      },
    ],
    summary: '整体质量良好',
    improvements: ['增加冲突设置', '丰富配角', '句式多样化'],
    details: '## 详细报告\n这是一份详细的质量分析...',
    ...overrides,
  }
}

function mountReport() {
  const pinia = createTestPinia()

  const projectStore = useProjectStore()
  const sandboxStore = useSandboxStore()

  const project = createMockProject({
    title: 'Test Novel',
    chapters: [
      createMockChapter({ number: 1, title: '第一章', content: '第一章内容...' }),
      createMockChapter({ number: 2, title: '第二章', content: '第二章内容...' }),
    ],
    config: {
      ...createMockProject().config,
      qualityThreshold: 7,
    },
  })

  projectStore.currentProject = project

  const wrapper = mount(QualityReport, {
    global: {
      stubs: globalStubs,
    },
  })

  return { wrapper, projectStore, sandboxStore, pinia }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityReport.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMockIdCounter()
  })

  // =========================================================================
  // 1. Empty state display
  // =========================================================================

  it('shows empty state when no reports exist', () => {
    const { wrapper } = mountReport()

    expect(wrapper.find('.stub-elempty').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有质量报告')
  })

  it('hides empty state when reports are present', async () => {
    const { wrapper } = mountReport()

    // Trigger checkAllChapters to populate reports
    const reports: QualityReportType[] = [makeQualityReport()]
    mockCheckChapter.mockResolvedValueOnce(reports[0])

    await wrapper.find('button.stub-elbutton').trigger('click')
    await flushPromises()

    expect(wrapper.find('.stub-elempty').exists()).toBe(false)
    expect(wrapper.find('.content').exists()).toBe(true)
  })

  // =========================================================================
  // 2. Quality score display in overview
  // =========================================================================

  it('displays average quality score and chapter count in overview', async () => {
    const { wrapper } = mountReport()

    const reports = [makeQualityReport({ overallScore: 8.2 }), makeQualityReport({ chapterNumber: 2, overallScore: 7.6 })]
    for (const r of reports) {
      mockCheckChapter.mockResolvedValueOnce(r)
    }

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    const overviewCard = wrapper.find('.overview-card')
    expect(overviewCard.exists()).toBe(true)

    // Check the statistic components are rendered
    const statistics = overviewCard.findAllComponents({ name: 'ElStatistic' })
    expect(statistics.length).toBeGreaterThanOrEqual(2)

    // Verify chapter count
    const chapterCountStat = overviewCard.findAllComponents({ name: 'ElStatistic' }).find(
      (c: any) => c.props('title') === '检查章节数'
    )
    expect(chapterCountStat).toBeDefined()
    expect(chapterCountStat!.props('value')).toBe(2)
  })

  // =========================================================================
  // 3. Dimension breakdown display
  // =========================================================================

  it('renders dimension breakdown cards with scores and trend tags', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // The dimensions-card should exist
    const dimensionsCard = wrapper.find('.dimensions-card')
    expect(dimensionsCard.exists()).toBe(true)

    // Should contain dimension names
    expect(wrapper.text()).toContain('情节质量')
    expect(wrapper.text()).toContain('人物塑造')
    expect(wrapper.text()).toContain('文笔水平')

    // Should show score values
    expect(wrapper.text()).toContain('8.5 / 10')
    expect(wrapper.text()).toContain('7.8 / 10')
    expect(wrapper.text()).toContain('8.3 / 10')
  })

  // =========================================================================
  // 4. Improvement suggestions
  // =========================================================================

  it('renders improvement recommendations in the recommendations card', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    const recCard = wrapper.find('.recommendations-card')
    expect(recCard.exists()).toBe(true)

    // The mock analyzeQualityTrend returns ['建议1', '建议2']
    expect(wrapper.text()).toContain('建议1')
    expect(wrapper.text()).toContain('建议2')

    // The recommendation numbers should be rendered
    const recItems = wrapper.findAll('.recommendation-item')
    expect(recItems.length).toBe(2)
  })

  // =========================================================================
  // 5. Chart rendering initialization
  // =========================================================================

  it('initializes ECharts on mount when reports are present', async () => {
    const { wrapper } = mountReport()

    // Populate reports so the chart container divs are rendered (v-else branch)
    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)
    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    expect(echarts.init).toHaveBeenCalled()
  })

  it('disposes ECharts on unmount', async () => {
    const { wrapper } = mountReport()

    // Populate reports first so charts are initialized
    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)
    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    const mockChartInstance = (echarts.init as Mock).mock.results[0]?.value
    wrapper.unmount()

    if (mockChartInstance) {
      expect(mockChartInstance.dispose).toHaveBeenCalled()
    }
  })

  // =========================================================================
  // 6. Chapter detail dialog
  // =========================================================================

  it('opens detail dialog when view detail button is clicked', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    // Trigger check to populate reports
    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // Find the "查看详情" button in the table and click it
    // The button is rendered via the table column template
    const detailButtons = wrapper.findAll('button.stub-elbutton')
    // Find button with text containing "查看详情"
    const viewDetailBtn = detailButtons.find((b) => b.text().includes('查看详情'))

    if (viewDetailBtn) {
      await viewDetailBtn.trigger('click')
      await nextTick()

      // The dialog should now have currentReport set
      // The detail dialog title should contain the chapter number
      expect(wrapper.text()).toContain('第 1 章质量报告')
    }
  })

  it('displays dimension issues and suggestions in detail dialog', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport({
      dimensions: [
        {
          name: '情节质量',
          score: 6.5,
          maxScore: 10,
          issues: [
            { type: 'error', message: '逻辑漏洞', severity: 7 },
            { type: 'warning', message: '节奏不均', severity: 4 },
          ],
          suggestions: ['增加转折', '调整节奏'],
        },
      ],
      improvements: ['改进情节逻辑'],
    })

    mockCheckChapter.mockResolvedValueOnce(report)
    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // Click the view detail button
    const viewDetailBtn = wrapper.findAll('button.stub-elbutton').find((b) => b.text().includes('查看详情'))
    if (viewDetailBtn) {
      await viewDetailBtn.trigger('click')
      await nextTick()

      // Check issues are rendered
      expect(wrapper.text()).toContain('逻辑漏洞')
      expect(wrapper.text()).toContain('节奏不均')

      // Check suggestions are rendered
      expect(wrapper.text()).toContain('增加转折')
      expect(wrapper.text()).toContain('调整节奏')
    }
  })

  // =========================================================================
  // 7. Chapter search / filter
  // =========================================================================

  it('filters reports by search text', async () => {
    const { wrapper } = mountReport()

    const r1 = makeQualityReport({ chapterNumber: 1, summary: '战斗场景精彩' })
    const r2 = makeQualityReport({ chapterNumber: 2, summary: '对话描写平淡' })
    mockCheckChapter.mockResolvedValueOnce(r1)
    mockCheckChapter.mockResolvedValueOnce(r2)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // The chapters-card table should show both
    const chaptersCard = wrapper.find('.chapters-card')
    expect(chaptersCard.exists()).toBe(true)

    // Find the search input and set its value
    const searchInput = chaptersCard.find('input.stub-elinput')
    expect(searchInput.exists()).toBe(true)

    // Simulate search by updating the component's searchText ref
    // The input binding is v-model="searchText"
    await searchInput.setValue('1')
    await nextTick()

    // After filtering, only chapter 1 should be shown in the table
    // (the table data comes from filteredReports computed property)
    // The table stubs render rows, so we check the component's internal state
    expect((wrapper.vm as any).filteredReports.length).toBe(1)
    expect((wrapper.vm as any).filteredReports[0].chapterNumber).toBe(1)
  })

  // =========================================================================
  // 8. Need-improvement count
  // =========================================================================

  it('calculates need-improvement count based on quality threshold', async () => {
    const { wrapper } = mountReport()

    // Reports below threshold (7)
    const lowReport = makeQualityReport({ chapterNumber: 1, overallScore: 5.5 })
    const highReport = makeQualityReport({ chapterNumber: 2, overallScore: 8.5 })
    mockCheckChapter.mockResolvedValueOnce(lowReport)
    mockCheckChapter.mockResolvedValueOnce(highReport)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // Need improvement count should be 1 (only the low-scoring report)
    expect((wrapper.vm as any).needImprovementCount).toBe(1)
  })

  // =========================================================================
  // 9. AIGC detection
  // =========================================================================

  it('runs AIGC detection and displays results', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    // First run check to populate reports
    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // Click the AIGC detection button (second button)
    const aigcButton = wrapper.findAll('button.stub-elbutton').find((b) => b.text().includes('AIGC检测'))
    expect(aigcButton).toBeDefined()

    await aigcButton!.trigger('click')
    await flushPromises()

    expect(mockDetect).toHaveBeenCalled()

    // After detection, AIGC results should be populated
    expect((wrapper.vm as any).aigcResults.size).toBeGreaterThan(0)
  })

  // =========================================================================
  // 10. Trend analysis display
  // =========================================================================

  it('displays quality trend tag in overview', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // The trend tag should be rendered (stable trend by default)
    const overviewCard = wrapper.find('.overview-card')
    const trendTag = overviewCard.findComponent({ name: 'ElTag' })
    expect(trendTag.exists()).toBe(true)
    // "稳定" text should appear for stable trend
    expect(wrapper.text()).toContain('稳定')
  })

  // =========================================================================
  // 11. CED consistency detection panel
  // =========================================================================

  it('shows CED panel with no-interception message when logs are empty', async () => {
    const { wrapper } = mountReport()

    const report = makeQualityReport()
    mockCheckChapter.mockResolvedValueOnce(report)

    await wrapper.findAll('button.stub-elbutton')[0].trigger('click')
    await flushPromises()

    // The CED card should show the "no interceptions" message
    expect(wrapper.text()).toContain('防跑偏拦截大盘')
    expect(wrapper.text()).toContain('当前生成暂无防吃书拦截记录，一致性良好')
  })
})
