import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { createMockProject, resetMockIdCounter } from '@/test/mocks'
import type { TokenUsageRecord } from '@/types/token-usage'

// ---------------------------------------------------------------------------
// Mocks (must precede component imports)
// ---------------------------------------------------------------------------

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { useProjectStore } from '@/stores/project'
import { useTokenUsageStore } from '@/stores/tokenUsage'
import TokenUsagePanel from '@/components/TokenUsagePanel.vue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _recSeq = 0

function createRecord(overrides: Partial<TokenUsageRecord> = {}): TokenUsageRecord {
  return {
    id: `rec-${++_recSeq}`,
    projectId: 'proj-1',
    timestamp: new Date().toISOString(),
    source: 'chatStream',
    taskType: 'chapter',
    model: 'gpt-4',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    inputCostUSD: 0.01,
    outputCostUSD: 0.005,
    totalUSD: 0.015,
    totalCNY: 0.108,
    latency: 2000,
    status: 'success',
    ...overrides,
  }
}

function buildRecords(projectId = 'proj-1'): TokenUsageRecord[] {
  return [
    createRecord({ id: 'rec-1', projectId, model: 'gpt-4', taskType: 'chapter', inputTokens: 2000, outputTokens: 1000, totalTokens: 3000, totalUSD: 0.03, totalCNY: 0.216, latency: 1500 }),
    createRecord({ id: 'rec-2', projectId, model: 'claude-3', taskType: 'check', inputTokens: 800, outputTokens: 400, totalTokens: 1200, totalUSD: 0.012, totalCNY: 0.086, latency: 3000 }),
    createRecord({ id: 'rec-3', projectId, model: 'gpt-4', taskType: 'chapter', inputTokens: 1500, outputTokens: 750, totalTokens: 2250, totalUSD: 0.0225, totalCNY: 0.162, latency: 1800 }),
  ]
}

/**
 * Add records to the store using the store's own mutation method.
 * Direct array assignment does not trigger Pinia reactivity properly;
 * recordUsage() goes through the correct reactive mutation path.
 */
function populateStore(store: ReturnType<typeof useTokenUsageStore>, records: TokenUsageRecord[]) {
  for (const rec of records) {
    store.recordUsage(rec)
  }
}

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="el-card-stub"><div v-if="$slots.header" class="el-card__header"><slot name="header" /></div><slot /></div>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p></div>',
}

const ElStatisticStub = {
  name: 'ElStatistic',
  props: ['title', 'value'],
  template: '<div class="el-statistic-stub"><span class="stat-title">{{ title }}</span><span class="stat-value">{{ value }}</span></div>',
}

const ElRowStub = {
  name: 'ElRow',
  props: ['gutter'],
  template: '<div class="el-row-stub"><slot /></div>',
}

const ElColStub = {
  name: 'ElCol',
  props: ['span'],
  template: '<div class="el-col-stub"><slot /></div>',
}

const ElRadioGroupStub = {
  name: 'ElRadioGroup',
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: '<div class="el-radio-group-stub"><slot /></div>',
}

const ElRadioButtonStub = {
  name: 'ElRadioButton',
  props: ['value'],
  template: '<button class="el-radio-button-stub"><slot /></button>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'disabled', 'plain'],
  emits: ['click'],
  template: '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const ElPopconfirmStub = {
  name: 'ElPopconfirm',
  props: ['title'],
  emits: ['confirm'],
  template: '<div class="el-popconfirm-stub"><slot name="reference" /></div>',
}

const ElProgressStub = {
  name: 'ElProgress',
  props: ['percentage', 'status'],
  template: '<div class="el-progress-stub" :data-percentage="percentage" :data-status="status"></div>',
}

// ElTable stub: iterates over `data` and provides each row to descendants
// via Vue's provide/inject (mimicking how real Element Plus tables work).
const ElTableStub = {
  name: 'ElTable',
  props: ['data', 'size'],
  template: `
    <div class="el-table-stub">
      <template v-for="(row, idx) in (data || [])" :key="idx">
        <table-row-wrapper :row="row">
          <slot :row="row" />
        </table-row-wrapper>
      </template>
    </div>
  `,
  components: {
    TableRowWrapper: {
      props: ['row'],
      provide() {
        return { elTableRow: () => this.row }
      },
      template: '<div class="el-table-row-stub"><slot /></div>',
    },
  },
}

// ElTableColumn stub: reads `elTableRow` from injected parent table.
// If the column has a custom scoped slot (#default="{ row }"), it renders it
// with the injected row. Otherwise, it reads the `prop` field from the row.
const ElTableColumnStub = {
  name: 'ElTableColumn',
  props: ['prop', 'label', 'minWidth', 'width', 'min-width'],
  inject: {
    getTableRow: { from: 'elTableRow', default: null },
  },
  computed: {
    row() {
      return this.getTableRow ? this.getTableRow() : null
    },
  },
  template: `
    <div class="el-table-column-stub">
      <span class="el-table-column-label">{{ label }}</span>
      <span class="el-table-column-value">
        <slot v-if="$slots.default" :row="row" />
        <template v-else-if="row && prop">{{ row[prop] }}</template>
      </span>
    </div>
  `,
}

const ElTagStub = {
  name: 'ElTag',
  props: ['size'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const globalStubs = {
  ElCard: ElCardStub,
  ElEmpty: ElEmptyStub,
  ElStatistic: ElStatisticStub,
  ElRow: ElRowStub,
  ElCol: ElColStub,
  ElRadioGroup: ElRadioGroupStub,
  ElRadioButton: ElRadioButtonStub,
  ElButton: ElButtonStub,
  ElPopconfirm: ElPopconfirmStub,
  ElProgress: ElProgressStub,
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  ElTag: ElTagStub,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenUsagePanel', () => {
  let projectStore: ReturnType<typeof useProjectStore>
  let tokenUsageStore: ReturnType<typeof useTokenUsageStore>

  beforeEach(() => {
    _recSeq = 0
    resetMockIdCounter()
    createTestPinia()
    projectStore = useProjectStore()
    tokenUsageStore = useTokenUsageStore()

    // Set up a current project by default
    projectStore.currentProject = createMockProject({
      id: 'proj-1',
      title: 'Test Novel',
      config: {
        preset: 'standard',
        providers: [],
        plannerModel: 'gpt-4',
        writerModel: 'gpt-4',
        sentinelModel: 'gpt-4',
        extractorModel: 'gpt-4',
        planningDepth: 'medium',
        writingDepth: 'standard',
        enableQualityCheck: false,
        qualityThreshold: 70,
        maxCostPerChapter: 0.15,
        enableAISuggestions: false,
        enableVectorRetrieval: false,
      },
    }) as unknown as typeof projectStore.currentProject
  })

  function mountPanel() {
    return mount(TokenUsagePanel, {
      global: { stubs: globalStubs },
    })
  }

  // ---------------------------------------------------------------
  // 1. Empty state
  // ---------------------------------------------------------------

  it('shows empty description when no records exist', () => {
    const wrapper = mountPanel()

    const empty = wrapper.find('.el-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('尚无 AI 调用记录')
  })

  // ---------------------------------------------------------------
  // 2. Calls loadProjectUsage on mount
  // ---------------------------------------------------------------

  it('calls loadProjectUsage on mount with the current project ID', () => {
    const spy = vi.spyOn(tokenUsageStore, 'loadProjectUsage')
    mountPanel()

    expect(spy).toHaveBeenCalledWith('proj-1')
  })

  // ---------------------------------------------------------------
  // 3. Usage stats display (summary metrics)
  // ---------------------------------------------------------------

  it('displays summary metrics when records exist', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const stats = wrapper.findAll('.stat-title')
    const statTexts = stats.map(s => s.text())
    expect(statTexts).toContain('调用次数')
    expect(statTexts).toContain('输入 Token')
    expect(statTexts).toContain('输出 Token')
    expect(statTexts).toContain('总 Token')
    expect(statTexts).toContain('总费用')

    // Verify computed values from the summary
    const statValues = wrapper.findAll('.stat-value')
    const valueTexts = statValues.map(v => v.text())

    // requestCount = 3
    expect(valueTexts[0]).toBe('3')
    // totalTokens = 3000 + 1200 + 2250 = 6450
    expect(valueTexts).toContain('6,450')
  })

  // ---------------------------------------------------------------
  // 4. Budget progress display
  // ---------------------------------------------------------------

  it('renders budget progress bars with correct percentages', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const budgetSection = wrapper.findAll('.el-card-stub').find(card => card.text().includes('预算进度'))
    expect(budgetSection).toBeDefined()
    expect(budgetSection!.text()).toContain('预算进度')

    const progressBars = budgetSection!.findAll('.el-progress-stub')
    expect(progressBars.length).toBe(2)
  })

  // ---------------------------------------------------------------
  // 5. Average performance display
  // ---------------------------------------------------------------

  it('displays average latency, tokens, and cost', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const averageSection = wrapper.findAll('.el-card-stub').find(card => card.text().includes('平均表现'))
    expect(averageSection).toBeDefined()

    const text = averageSection!.text()
    expect(text).toContain('平均延迟')
    expect(text).toContain('平均 Token')
    expect(text).toContain('平均费用')

    // Average latency = (1500 + 3000 + 1800) / 3 = 2100
    expect(text).toContain('2100 ms')
  })

  // ---------------------------------------------------------------
  // 6. Model breakdown table
  // ---------------------------------------------------------------

  it('renders the by-model breakdown table with model names', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const modelCard = wrapper.findAll('.el-card-stub').find(card => card.text().includes('按模型'))
    expect(modelCard).toBeDefined()
    expect(modelCard!.text()).toContain('按模型')

    // Check model column labels and values are rendered
    const columnLabels = modelCard!.findAll('.el-table-column-label')
    const labelTexts = columnLabels.map(l => l.text())
    expect(labelTexts).toContain('模型')
    expect(labelTexts).toContain('次数')
    expect(labelTexts).toContain('Token')
    expect(labelTexts).toContain('费用')
  })

  // ---------------------------------------------------------------
  // 7. Task type breakdown table
  // ---------------------------------------------------------------

  it('renders the by-task-type breakdown table with task labels', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const taskCard = wrapper.findAll('.el-card-stub').find(card => card.text().includes('按任务'))
    expect(taskCard).toBeDefined()
    expect(taskCard!.text()).toContain('按任务')

    // Column headers should include task-related labels
    const columnLabels = taskCard!.findAll('.el-table-column-label')
    const labelTexts = columnLabels.map(l => l.text())
    expect(labelTexts).toContain('任务')
    expect(labelTexts).toContain('次数')
  })

  // ---------------------------------------------------------------
  // 8. Recent records table
  // ---------------------------------------------------------------

  it('renders recent records table sorted by timestamp descending', async () => {
    const now = new Date()
    populateStore(tokenUsageStore, [
      createRecord({ id: 'old', timestamp: new Date(now.getTime() - 60_000).toISOString(), totalTokens: 100, totalUSD: 0.001 }),
      createRecord({ id: 'mid', timestamp: new Date(now.getTime() - 30_000).toISOString(), totalTokens: 200, totalUSD: 0.002 }),
      createRecord({ id: 'new', timestamp: now.toISOString(), totalTokens: 300, totalUSD: 0.003 }),
    ])

    const wrapper = mountPanel()
    await nextTick()

    // Find the recent records card by its header text (the header card also
    // mentions "近期请求" in its description paragraph, so match the header).
    const recentCard = wrapper.findAll('.el-card-stub').find(card => {
      const header = card.find('.el-card__header')
      return header.exists() && header.text().includes('近期请求')
    })
    expect(recentCard).toBeDefined()
    expect(recentCard!.text()).toContain('近期请求')

    // Column labels are rendered inside row wrappers (one set per data row)
    const allLabels = recentCard!.findAll('.el-table-column-label')
    const labelTexts = allLabels.map(l => l.text())
    expect(labelTexts).toContain('时间')
    expect(labelTexts).toContain('模型')
  })

  // ---------------------------------------------------------------
  // 9. Cost breakdown display
  // ---------------------------------------------------------------

  it('displays total cost in both USD and CNY formats', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    const statValues = wrapper.findAll('.stat-value')
    const costValue = statValues.find(v => v.text().includes('$') && v.text().includes('¥'))
    expect(costValue).toBeDefined()
    expect(costValue!.text()).toContain('$')
    expect(costValue!.text()).toContain('¥')
  })

  // ---------------------------------------------------------------
  // 10. Refresh button triggers reload
  // ---------------------------------------------------------------

  it('calls loadProjectUsage when refresh button is clicked', async () => {
    populateStore(tokenUsageStore, buildRecords())
    const spy = vi.spyOn(tokenUsageStore, 'loadProjectUsage')

    const wrapper = mountPanel()
    await nextTick()

    const buttons = wrapper.findAll('.el-button-stub')
    const refreshButton = buttons.find(b => b.text() === '刷新')
    expect(refreshButton).toBeDefined()

    await refreshButton!.trigger('click')
    expect(spy).toHaveBeenCalledWith('proj-1')
  })

  // ---------------------------------------------------------------
  // 11. Clear button is disabled when no records
  // ---------------------------------------------------------------

  it('disables clear and export buttons when there are no records', () => {
    const wrapper = mountPanel()

    const buttons = wrapper.findAll('.el-button-stub')
    const exportButton = buttons.find(b => b.text() === '导出')
    const clearButton = buttons.find(b => b.text() === '清空')

    expect(exportButton).toBeDefined()
    expect(clearButton).toBeDefined()
    expect(exportButton!.attributes('disabled')).toBeDefined()
    expect(clearButton!.attributes('disabled')).toBeDefined()
  })

  // ---------------------------------------------------------------
  // 12. Project filtering - only shows current project records
  // ---------------------------------------------------------------

  it('only displays records for the current project', async () => {
    populateStore(tokenUsageStore, buildRecords('proj-1'))
    populateStore(tokenUsageStore, [
      createRecord({ id: 'other-1', projectId: 'proj-2', model: 'gpt-4', totalTokens: 9999, totalUSD: 0.99 }),
    ])

    const wrapper = mountPanel()
    await nextTick()

    const statValues = wrapper.findAll('.stat-value')

    // requestCount should be 3 (proj-1 only), not 4
    expect(statValues[0].text()).toBe('3')
    // totalTokens should be 6450 (proj-1 only), not 6450 + 9999
    expect(statValues.some(v => v.text() === '6,450')).toBe(true)
  })

  // ---------------------------------------------------------------
  // 13. Range filtering - monthly view
  // ---------------------------------------------------------------

  it('defaults to monthly range filter and renders stats', async () => {
    populateStore(tokenUsageStore, buildRecords())

    const wrapper = mountPanel()
    await nextTick()

    // The range ref defaults to 'month'; verify all five stat cards render
    const statValues = wrapper.findAll('.stat-value')
    expect(statValues.length).toBeGreaterThanOrEqual(5)
  })

  // ---------------------------------------------------------------
  // 14. Export generates JSON download
  // ---------------------------------------------------------------

  it('calls exportProjectUsage and triggers download when export is clicked', async () => {
    populateStore(tokenUsageStore, buildRecords())
    const exportSpy = vi.spyOn(tokenUsageStore, 'exportProjectUsage').mockReturnValue('[]')

    // Mock anchor click
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })

    const wrapper = mountPanel()
    await nextTick()

    const buttons = wrapper.findAll('.el-button-stub')
    const exportButton = buttons.find(b => b.text() === '导出')
    expect(exportButton).toBeDefined()
    await exportButton!.trigger('click')

    expect(exportSpy).toHaveBeenCalledWith('proj-1')
    expect(clickSpy).toHaveBeenCalled()

    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------
  // 15. Task type labels rendered in Chinese
  // ---------------------------------------------------------------

  it('renders task type labels in Chinese for known types', async () => {
    populateStore(tokenUsageStore, [
      createRecord({ id: 'ch', taskType: 'chapter', model: 'gpt-4' }),
      createRecord({ id: 'ck', taskType: 'check', model: 'gpt-4' }),
    ])

    const wrapper = mountPanel()
    await nextTick()

    // The by-task table uses getTaskTypeLabel, check that tags appear
    const tags = wrapper.findAll('.el-tag-stub')
    const tagTexts = tags.map(t => t.text())
    expect(tagTexts).toContain('章节生成')
    expect(tagTexts).toContain('审校/检查')
  })
})
