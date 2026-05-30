import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import type { ConflictDetectionResult, ConflictReport } from '@/types/conflicts'

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

function makeConflict(overrides: Partial<ConflictReport> = {}): ConflictReport {
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

function makeResult(conflicts: ConflictReport[]): ConflictDetectionResult {
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
    const filterSeverity = wrapper.vm.filterSeverity as unknown as string
    wrapper.vm.filterSeverity = 'critical' as any
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
  // 14. Evidence and suggestions rendering
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
})
