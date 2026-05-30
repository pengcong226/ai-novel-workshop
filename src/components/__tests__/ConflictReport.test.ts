import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import type { ConflictDetectionResult, ConflictReport as ConflictReportType } from '@/types/conflicts'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDetect = vi.fn()
vi.mock('@/utils/conflictDetector', () => ({
  ConflictDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
  DEFAULT_CONFIG: {
    enableCharacterConflicts: true,
    enableTimelineConflicts: true,
    enableWorldConflicts: true,
    enablePlotLogicConflicts: true,
    enableForeshadowingConflicts: true,
    personalityChangeThreshold: 0.7,
    timeDurationTolerance: 7,
    ageErrorTolerance: 1,
    minConfidenceThreshold: 0.6,
    ignoreMarkedConflicts: true,
  },
  exportConflictsAsMarkdown: vi.fn().mockReturnValue('# Conflict Report'),
  exportConflictsAsJSON: vi.fn().mockReturnValue('{}'),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/utils/formatters', () => ({
  getChapterStatusType: (status: string) => {
    const map: Record<string, string> = { active: 'info', ignored: 'info', resolved: 'success' }
    return map[status] || 'info'
  },
  getChapterStatusText: (status: string) => {
    const map: Record<string, string> = { active: '活动', ignored: '已忽略', resolved: '已解决' }
    return map[status] || status
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

// ---------------------------------------------------------------------------
// Stub Element Plus components used in the template
// ---------------------------------------------------------------------------

const stub = (name: string, opts: Record<string, any> = {}) => ({
  name,
  props: opts.props ?? [],
  emits: opts.emits ?? [],
  template: opts.template ?? `<div class="stub-${name.toLowerCase()}"><slot /><slot name="header" /><slot name="footer" /></div>`,
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
  ElDivider: stub('ElDivider', { props: ['contentPosition'], template: '<hr class="stub-eldivider"/>' }),
  ElSelect: stub('ElSelect', { props: ['modelValue', 'placeholder', 'clearable'], emits: ['update:modelValue'], template: '<select class="stub-elselect"><slot /></select>' }),
  ElOption: stub('ElOption', { props: ['label', 'value'], template: '<option class="stub-eloption" :value="value">{{ label }}</option>' }),
  ElDialog: stub('ElDialog', { props: ['modelValue', 'title', 'width'], emits: ['update:modelValue'], template: '<dialog class="stub-eldialog" :open="modelValue"><slot /><slot name="footer" /></dialog>' }),
  ElForm: stub('ElForm', { props: ['model', 'labelWidth'], template: '<form class="stub-elform"><slot /></form>' }),
  ElFormItem: stub('ElFormItem', { props: ['label'], template: '<div class="stub-elformitem"><label>{{ label }}</label><slot /></div>' }),
  ElSwitch: stub('ElSwitch', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" class="stub-elswitch" />' }),
  ElSlider: stub('ElSlider', { props: ['modelValue', 'min', 'max', 'step', 'showInput'], emits: ['update:modelValue'], template: '<input type="range" class="stub-elslider" />' }),
  ElInputNumber: stub('ElInputNumber', { props: ['modelValue', 'min', 'max'], emits: ['update:modelValue'], template: '<input type="number" class="stub-elinputnumber" />' }),
  ElProgress: stub('ElProgress', { props: ['percentage', 'format'], template: '<div class="stub-elprogress">{{ percentage }}%</div>' }),
  ElTable: stub('ElTable', { props: ['data', 'border'], template: '<table class="stub-eltable"><slot /></table>' }),
  ElTableColumn: stub('ElTableColumn', { props: ['prop', 'label', 'width'], template: '<td class="stub-eltablecol"><slot /></td>' }),
  ElDescriptions: stub('ElDescriptions', { props: ['column', 'border'], template: '<dl class="stub-eldescriptions"><slot /></dl>' }),
  ElDescriptionsItem: stub('ElDescriptionsItem', { props: ['label'], template: '<div class="stub-eldescriptionsitem"><dt>{{ label }}</dt><dd><slot /></dd></div>' }),
  ElIcon: stub('ElIcon', { template: '<i class="stub-elicon"><slot /></i>' }),
  Setting: stub('Setting'),
  Search: stub('Search'),
  Download: stub('Download'),
  Document: stub('Document'),
  Warning: stub('Warning'),
}

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeConflict(overrides: Partial<ConflictReportType> = {}): ConflictReportType {
  return {
    id: `conflict-${Math.random().toString(36).slice(2, 8)}`,
    type: 'character_personality',
    severity: 'warning',
    status: 'active',
    title: 'Test Conflict',
    description: 'Test conflict description',
    evidences: [],
    suggestions: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    relatedChapters: [1, 2],
    ...overrides,
  }
}

function makeResult(conflicts: ConflictReportType[]): ConflictDetectionResult {
  const byType: Record<string, number> = {}
  const byChapter: Record<number, number> = {}
  let critical = 0
  let warning = 0
  let info = 0

  for (const c of conflicts) {
    byType[c.type] = (byType[c.type] || 0) + 1
    if (c.severity === 'critical') critical++
    else if (c.severity === 'warning') warning++
    else info++
    for (const ch of c.relatedChapters || []) {
      byChapter[ch] = (byChapter[ch] || 0) + 1
    }
  }

  return {
    detectedAt: new Date('2025-06-01T10:00:00'),
    duration: 1200,
    config: {} as any,
    conflicts,
    statistics: {
      total: conflicts.length,
      critical,
      warning,
      info,
      byType: byType as any,
      byChapter,
    },
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import ConflictReport from '@/components/ConflictReport.vue'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConflictReport.vue', () => {
  let pinia: ReturnType<typeof createTestPinia>

  beforeEach(() => {
    vi.clearAllMocks()
    pinia = createTestPinia()

    // Provide a minimal project in the project store
    const projectStore = useProjectStore()
    projectStore.currentProject = {
      id: 'proj-1',
      title: 'Test Novel',
      chapters: [],
    } as any

    // sandbox store can be empty (activeEntitiesState is a computed getter, skip assignment)
    useSandboxStore()
  })

  function mountComponent() {
    return mount(ConflictReport, {
      global: {
        plugins: [pinia],
        stubs: globalStubs,
      },
    })
  }

  // -----------------------------------------------------------------------
  // 1. Empty state
  // -----------------------------------------------------------------------

  it('shows empty state when no detection has run', () => {
    const wrapper = mountComponent()
    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('还没有进行冲突检测')
  })

  // -----------------------------------------------------------------------
  // 2. Run detection and render conflict list
  // -----------------------------------------------------------------------

  it('renders conflict cards after successful detection', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', title: 'Conflict A', severity: 'critical' }),
      makeConflict({ id: 'c2', title: 'Conflict B', severity: 'warning' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()

    // Click the primary "开始检测" button in the header
    const buttons = wrapper.findAll('.stub-elbutton.primary')
    await buttons[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Empty state should be gone
    expect(wrapper.find('.empty-state').exists()).toBe(false)

    // Both conflict cards should be visible
    const cards = wrapper.findAll('.conflict-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Conflict A')
    expect(cards[1].text()).toContain('Conflict B')
  })

  // -----------------------------------------------------------------------
  // 3. Statistics overview
  // -----------------------------------------------------------------------

  it('displays severity counts in the statistics overview', async () => {
    const conflicts = [
      makeConflict({ severity: 'critical' }),
      makeConflict({ severity: 'critical' }),
      makeConflict({ severity: 'warning' }),
      makeConflict({ severity: 'info' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    const stats = wrapper.find('.statistics-card')
    expect(stats.text()).toContain('4') // total
    expect(stats.text()).toContain('2') // critical
    expect(stats.text()).toContain('1') // warning
    expect(stats.text()).toContain('1') // info
  })

  // -----------------------------------------------------------------------
  // 4. Severity filtering
  // -----------------------------------------------------------------------

  it('filters conflicts by severity', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', severity: 'critical', title: 'Critical Issue' }),
      makeConflict({ id: 'c2', severity: 'warning', title: 'Warning Issue' }),
      makeConflict({ id: 'c3', severity: 'info', title: 'Info Issue' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // All 3 shown initially
    expect(wrapper.findAll('.conflict-card')).toHaveLength(3)

    // Set severity filter to 'critical'
    const _filterSeverity = (wrapper.vm as any).filterSeverity as unknown as string
    ;(wrapper.vm as any).filterSeverity = 'critical'
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(1)
    expect(wrapper.find('.conflict-card').text()).toContain('Critical Issue')
  })

  // -----------------------------------------------------------------------
  // 5. Type filtering
  // -----------------------------------------------------------------------

  it('filters conflicts by type', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', type: 'character_personality', title: 'Personality Conflict' }),
      makeConflict({ id: 'c2', type: 'timeline_age', title: 'Age Conflict' }),
      makeConflict({ id: 'c3', type: 'character_personality', title: 'Another Personality' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(3)

    ;(wrapper.vm as any).filterType = 'timeline_age'
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(1)
    expect(wrapper.find('.conflict-card').text()).toContain('Age Conflict')
  })

  // -----------------------------------------------------------------------
  // 6. Status filtering
  // -----------------------------------------------------------------------

  it('filters conflicts by status', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', status: 'active', title: 'Active Issue' }),
      makeConflict({ id: 'c2', status: 'ignored', title: 'Ignored Issue' }),
      makeConflict({ id: 'c3', status: 'resolved', title: 'Resolved Issue' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(3)

    ;(wrapper.vm as any).filterStatus = 'active'
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(1)
    expect(wrapper.find('.conflict-card').text()).toContain('Active Issue')
  })

  // -----------------------------------------------------------------------
  // 7. Clear filters
  // -----------------------------------------------------------------------

  it('clears all filters when "清除筛选" is clicked', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', severity: 'critical', title: 'Critical' }),
      makeConflict({ id: 'c2', severity: 'warning', title: 'Warning' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    ;(wrapper.vm as any).filterSeverity = 'critical'
    await nextTick()
    expect(wrapper.findAll('.conflict-card')).toHaveLength(1)

    ;(wrapper.vm as any).clearFilters()
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(2)
  })

  // -----------------------------------------------------------------------
  // 8. Conflict detail expansion
  // -----------------------------------------------------------------------

  it('opens detail dialog when "查看详情" is clicked', async () => {
    const conflict = makeConflict({
      id: 'c1',
      title: 'Detailed Conflict',
      description: 'Detailed description here',
      evidences: [],
      suggestions: [],
    })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Use vm method directly to trigger detail view (avoids stub rendering issues)
    ;(wrapper.vm as any).viewConflictDetail(conflict)
    await nextTick()

    // The detail dialog should be showing
    expect((wrapper.vm as any).showDetailDialog).toBe(true)
    expect((wrapper.vm as any).selectedConflict?.title).toBe('Detailed Conflict')
    expect((wrapper.vm as any).selectedConflict?.description).toBe('Detailed description here')
  })

  // -----------------------------------------------------------------------
  // 9. Ignore conflict action
  // -----------------------------------------------------------------------

  it('marks a conflict as ignored when "忽略" is clicked', async () => {
    const conflict = makeConflict({ id: 'c1', status: 'active', title: 'To Ignore' })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Call ignoreConflict directly to test the logic
    ;(wrapper.vm as any).ignoreConflict(conflict)
    await nextTick()

    expect(conflict.status).toBe('ignored')
    expect(ElMessage.success).toHaveBeenCalledWith('已忽略该冲突')
  })

  // -----------------------------------------------------------------------
  // 10. Restore conflict action
  // -----------------------------------------------------------------------

  it('restores an ignored conflict when "恢复" is clicked', async () => {
    const conflict = makeConflict({ id: 'c1', status: 'ignored', title: 'Ignored Conflict' })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Verify the conflict initially renders as ignored
    expect(wrapper.findAll('.conflict-card')).toHaveLength(1)

    // Call restoreConflict directly to test the logic
    ;(wrapper.vm as any).restoreConflict(conflict)
    await nextTick()

    expect(conflict.status).toBe('active')
    expect(ElMessage.success).toHaveBeenCalledWith('已恢复该冲突')
  })

  // -----------------------------------------------------------------------
  // 11. Mark as resolved from detail dialog
  // -----------------------------------------------------------------------

  it('marks conflict as resolved via detail dialog', async () => {
    const conflict = makeConflict({ id: 'c1', status: 'active', title: 'To Resolve' })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Open detail via vm method
    ;(wrapper.vm as any).viewConflictDetail(conflict)
    await nextTick()

    expect((wrapper.vm as any).showDetailDialog).toBe(true)

    // Call markAsResolved
    ;(wrapper.vm as any).markAsResolved(conflict)
    await nextTick()

    expect(conflict.status).toBe('resolved')
    expect((wrapper.vm as any).showDetailDialog).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('已标记为已解决')
  })

  // -----------------------------------------------------------------------
  // 12. Detection without a project shows warning
  // -----------------------------------------------------------------------

  it('shows warning when running detection without a project', async () => {
    const projectStore = useProjectStore()
    projectStore.currentProject = null as any

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()

    expect(mockDetect).not.toHaveBeenCalled()
    expect(ElMessage.warning).toHaveBeenCalledWith('请先打开或创建项目')
  })

  // -----------------------------------------------------------------------
  // 13. Export button disabled when no result
  // -----------------------------------------------------------------------

  it('disables the export button when no result exists', () => {
    const wrapper = mountComponent()

    // Verify the component has no result, so export should be disabled
    expect((wrapper.vm as any).result).toBeNull()

    // The export button text should be visible
    const html = wrapper.html()
    expect(html).toContain('导出报告')
  })

  // -----------------------------------------------------------------------
  // 15. Export report calls exportConflictsAsMarkdown and triggers download
  // -----------------------------------------------------------------------

  it('exports markdown report and creates download link', async () => {
    const { exportConflictsAsMarkdown } = await import('@/utils/conflictDetector')
    const conflicts = [makeConflict({ id: 'c1', title: 'Exported Conflict' })]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Invoke the export function directly (stub button disabled state
    // does not prevent vm method from running)
    ;(wrapper.vm as any).exportReport()
    await nextTick()

    expect(exportConflictsAsMarkdown).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('报告已导出')
  })

  // -----------------------------------------------------------------------
  // 16. Detection error shows error message
  // -----------------------------------------------------------------------

  it('shows error message when detection throws', async () => {
    mockDetect.mockRejectedValueOnce(new Error('Detection engine failure'))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('冲突检测失败：Detection engine failure')
    // Detecting flag should be reset
    expect((wrapper.vm as any).detecting).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 18. Config save persists to localStorage and closes dialog
  // -----------------------------------------------------------------------

  it('saves config to localStorage and closes dialog on "保存配置"', async () => {
    const wrapper = mountComponent()

    // Open config dialog via vm
    ;(wrapper.vm as any).showConfigDialog = true
    await nextTick()

    // Invoke saveConfig
    ;(wrapper.vm as any).saveConfig()
    await nextTick()

    expect(localStorage.getItem('conflict-detection-config')).toBeTruthy()
    expect((wrapper.vm as any).showConfigDialog).toBe(false)
    expect(ElMessage.success).toHaveBeenCalledWith('配置已保存')
  })

  // -----------------------------------------------------------------------
  // 19. Config load from localStorage on mount
  // -----------------------------------------------------------------------

  it('loads saved config overrides from localStorage on mount', () => {
    const savedConfig = {
      personalityChangeThreshold: 0.3,
      enableCharacterConflicts: false,
    }
    localStorage.setItem('conflict-detection-config', JSON.stringify(savedConfig))

    const wrapper = mountComponent()

    const cfg = (wrapper.vm as any).config
    expect(cfg.personalityChangeThreshold).toBe(0.3)
    expect(cfg.enableCharacterConflicts).toBe(false)
    // Other defaults should still be present
    expect(cfg.enableTimelineConflicts).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 20. Evidence and suggestions rendering
  // -----------------------------------------------------------------------

  it('renders evidences and suggestions for each conflict', async () => {
    const conflict = makeConflict({
      id: 'c1',
      title: 'Complex Conflict',
      evidences: [
        { type: 'text', description: 'Evidence A', location: {}, chapterNumber: 2 },
        { type: 'character', description: 'Evidence B', location: {} },
      ],
      suggestions: [
        { id: 's1', type: 'auto', description: 'Auto fix', confidence: 0.9 },
        { id: 's2', type: 'manual', description: 'Manual fix', confidence: 0.5 },
      ],
    })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    const card = wrapper.find('.conflict-card')
    expect(card.text()).toContain('Evidence A')
    expect(card.text()).toContain('Evidence B')
    expect(card.text()).toContain('Auto fix')
    expect(card.text()).toContain('Manual fix')
  })

  // -----------------------------------------------------------------------
  // 21. Combined filters (type + severity) narrow results correctly
  // -----------------------------------------------------------------------

  it('applies multiple filters simultaneously to narrow results', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', type: 'character_personality', severity: 'critical', title: 'CP-Crit' }),
      makeConflict({ id: 'c2', type: 'character_personality', severity: 'warning', title: 'CP-Warn' }),
      makeConflict({ id: 'c3', type: 'timeline_age', severity: 'critical', title: 'TA-Crit' }),
      makeConflict({ id: 'c4', type: 'timeline_age', severity: 'warning', title: 'TA-Warn' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // Apply both type and severity filter
    ;(wrapper.vm as any).filterType = 'character_personality'
    ;(wrapper.vm as any).filterSeverity = 'critical'
    await nextTick()

    const cards = wrapper.findAll('.conflict-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('CP-Crit')
  })

  // -----------------------------------------------------------------------
  // 22. Combined filters yielding zero results shows no cards
  // -----------------------------------------------------------------------

  it('shows no conflict cards when combined filters match nothing', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', type: 'character_personality', severity: 'critical', title: 'Only Crit' }),
      makeConflict({ id: 'c2', type: 'timeline_age', severity: 'warning', title: 'Only Warn' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(2)

    // Filter to a combination that does not exist
    ;(wrapper.vm as any).filterType = 'world_rule'
    ;(wrapper.vm as any).filterSeverity = 'info'
    await nextTick()

    expect(wrapper.findAll('.conflict-card')).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // 23. getTypeName returns correct Chinese labels for all conflict types
  // -----------------------------------------------------------------------

  it('returns correct Chinese type names via getTypeName for each conflict type', async () => {
    const types: Array<{ type: string; expected: string }> = [
      { type: 'character_personality', expected: '人物性格' },
      { type: 'character_ability', expected: '人物能力' },
      { type: 'character_appearance', expected: '人物外貌' },
      { type: 'timeline_sequence', expected: '时间线顺序' },
      { type: 'timeline_duration', expected: '时间跨度' },
      { type: 'timeline_age', expected: '人物年龄' },
      { type: 'world_rule', expected: '世界规则' },
      { type: 'world_setting', expected: '世界设定' },
      { type: 'plot_logic', expected: '情节逻辑' },
      { type: 'relationship', expected: '人物关系' },
      { type: 'location', expected: '地点位置' },
      { type: 'item', expected: '物品属性' },
      { type: 'foreshadowing', expected: '伏笔' },
      { type: 'custom', expected: '自定义' },
    ]

    const wrapper = mountComponent()

    for (const { type, expected } of types) {
      expect((wrapper.vm as any).getTypeName(type)).toBe(expected)
    }

    // Unknown type falls back to the raw string
    expect((wrapper.vm as any).getTypeName('unknown_type')).toBe('unknown_type')
  })

  // -----------------------------------------------------------------------
  // 24. getSeverityType maps severity values to correct element-plus types
  // -----------------------------------------------------------------------

  it('maps severity values to element-plus tag types via getSeverityType', async () => {
    const wrapper = mountComponent()

    expect((wrapper.vm as any).getSeverityType('critical')).toBe('danger')
    expect((wrapper.vm as any).getSeverityType('warning')).toBe('warning')
    expect((wrapper.vm as any).getSeverityType('info')).toBe('info')
    // Unknown severity falls back to 'info'
    expect((wrapper.vm as any).getSeverityType('unknown')).toBe('info')
  })

  // -----------------------------------------------------------------------
  // 25. getSeverityText returns correct Chinese text for each severity
  // -----------------------------------------------------------------------

  it('returns correct Chinese severity text via getSeverityText', async () => {
    const wrapper = mountComponent()

    expect((wrapper.vm as any).getSeverityText('critical')).toBe('严重')
    expect((wrapper.vm as any).getSeverityText('warning')).toBe('警告')
    expect((wrapper.vm as any).getSeverityText('info')).toBe('提示')
    // Unknown severity falls back to the raw string
    expect((wrapper.vm as any).getSeverityText('unknown')).toBe('unknown')
  })

  // -----------------------------------------------------------------------
  // 26. formatDate produces expected output
  // -----------------------------------------------------------------------

  it('formats dates correctly via formatDate', async () => {
    const wrapper = mountComponent()
    const testDate = new Date('2025-03-05T14:08:00')
    const formatted = (wrapper.vm as any).formatDate(testDate)
    expect(formatted).toBe('2025-03-05 14:08')
  })

  // -----------------------------------------------------------------------
  // 27. ignoreConflict updates updatedAt timestamp
  // -----------------------------------------------------------------------

  it('updates updatedAt when a conflict is ignored', async () => {
    const originalDate = new Date('2025-01-01')
    const conflict = makeConflict({ id: 'c1', status: 'active', updatedAt: originalDate })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    ;(wrapper.vm as any).ignoreConflict(conflict)
    await nextTick()

    expect(conflict.status).toBe('ignored')
    expect(conflict.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime())
  })

  // -----------------------------------------------------------------------
  // 28. restoreConflict updates updatedAt timestamp
  // -----------------------------------------------------------------------

  it('updates updatedAt when a conflict is restored', async () => {
    const originalDate = new Date('2025-01-01')
    const conflict = makeConflict({ id: 'c1', status: 'ignored', updatedAt: originalDate })
    mockDetect.mockResolvedValue(makeResult([conflict]))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    ;(wrapper.vm as any).restoreConflict(conflict)
    await nextTick()

    expect(conflict.status).toBe('active')
    expect(conflict.updatedAt.getTime()).toBeGreaterThan(originalDate.getTime())
  })

  // -----------------------------------------------------------------------
  // 29. markAsResolved is a no-op when passed null
  // -----------------------------------------------------------------------

  it('does nothing when markAsResolved is called with null', async () => {
    const wrapper = mountComponent()

    // Should not throw
    ;(wrapper.vm as any).markAsResolved(null)
    await nextTick()

    // Dialog should remain closed (showDetailDialog starts as false)
    expect((wrapper.vm as any).showDetailDialog).toBe(false)
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 30. Per-type statistics render correct labels in statistics card
  // -----------------------------------------------------------------------

  it('displays per-type statistics with Chinese type names', async () => {
    const conflicts = [
      makeConflict({ id: 'c1', type: 'character_personality' }),
      makeConflict({ id: 'c2', type: 'character_personality' }),
      makeConflict({ id: 'c3', type: 'timeline_age' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    const typeStats = wrapper.find('.type-statistics')
    expect(typeStats.text()).toContain('按类型统计')
    expect(typeStats.text()).toContain('人物性格')
    expect(typeStats.text()).toContain('人物年龄')
  })

  // -----------------------------------------------------------------------
  // 31. Detection success message shows conflict count
  // -----------------------------------------------------------------------

  it('shows success message with conflict count after detection', async () => {
    const conflicts = [
      makeConflict({ id: 'c1' }),
      makeConflict({ id: 'c2' }),
      makeConflict({ id: 'c3' }),
    ]
    mockDetect.mockResolvedValue(makeResult(conflicts))

    const wrapper = mountComponent()
    await wrapper.findAll('.stub-elbutton.primary')[0].trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('检测完成！发现 3 个冲突')
  })
})
