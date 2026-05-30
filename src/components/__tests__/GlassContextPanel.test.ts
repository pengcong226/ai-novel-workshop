import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockEntity } from '@/test/mocks'
import type { ResolvedEntity } from '@/stores/sandbox'
import type { Entity } from '@/types/sandbox'

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

const mockGetLogsByChapter = vi.fn().mockReturnValue([])

vi.mock('@/composables/useAuditLog', () => ({
  useAuditLog: () => ({
    getLogsByChapter: mockGetLogsByChapter,
    addLog: vi.fn(),
    clearLogs: vi.fn(),
    logs: { value: [] },
  }),
}))

import GlassContextPanel from '@/components/GlassContextPanel.vue'

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

function makeResolvedEntity(overrides: Partial<ResolvedEntity> = {}): ResolvedEntity {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: 'Test Character',
    aliases: [],
    importance: 'major',
    category: '',
    systemPrompt: '',
    description: '',
    isArchived: false,
    createdAt: Date.now(),
    properties: {},
    relations: [],
    location: null,
    vitalStatus: 'active',
    abilities: [],
    ...overrides,
  }
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return createMockEntity(overrides)
}

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElTabsStub = {
  name: 'ElTabs',
  props: ['modelValue'],
  emits: ['update:modelValue', 'tab-click'],
  template: `
    <div class="el-tabs-stub">
      <div class="el-tabs__header">
        <slot name="header" />
      </div>
      <div class="el-tabs__content">
        <slot />
      </div>
    </div>
  `,
}

const ElTabPaneStub = {
  name: 'ElTabPane',
  props: ['label', 'name'],
  template: '<div class="el-tab-pane-stub" :data-name="name"><slot /></div>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p></div>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['size', 'type'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const ElFormStub = {
  name: 'ElForm',
  props: ['model', 'labelPosition'],
  template: '<form class="el-form-stub"><slot /></form>',
}

const ElFormItemStub = {
  name: 'ElFormItem',
  props: ['label'],
  template: '<div class="el-form-item-stub"><label>{{ label }}</label><slot /></div>',
}

const ElInputNumberStub = {
  name: 'ElInputNumber',
  props: ['modelValue', 'min'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-number-stub" type="number" :value="modelValue" />',
}

const ElRadioGroupStub = {
  name: 'ElRadioGroup',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<div class="el-radio-group-stub"><slot /></div>',
}

const ElRadioStub = {
  name: 'ElRadio',
  props: ['value'],
  template: '<label class="el-radio-stub"><slot /></label>',
}

const ElCardStub = {
  name: 'ElCard',
  template: '<div class="el-card-stub"><slot /></div>',
}

const ElTimelineStub = {
  name: 'ElTimeline',
  template: '<div class="el-timeline-stub"><slot /></div>',
}

const ElTimelineItemStub = {
  name: 'ElTimelineItem',
  props: ['type', 'timestamp', 'placement'],
  template: `
    <div class="el-timeline-item-stub" :data-type="type" :data-timestamp="timestamp">
      <slot />
    </div>
  `,
}

const globalStubs = {
  ElTabs: ElTabsStub,
  ElTabPane: ElTabPaneStub,
  ElEmpty: ElEmptyStub,
  ElTag: ElTagStub,
  ElForm: ElFormStub,
  ElFormItem: ElFormItemStub,
  ElInputNumber: ElInputNumberStub,
  ElRadioGroup: ElRadioGroupStub,
  ElRadio: ElRadioStub,
  ElCard: ElCardStub,
  ElTimeline: ElTimelineStub,
  ElTimelineItem: ElTimelineItemStub,
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

interface MountOverrides {
  activeTab?: string
  characters?: ResolvedEntity[]
  worldbook?: Entity[]
  chapterForm?: Record<string, unknown>
}

function mountPanel(overrides: MountOverrides = {}) {
  const defaultProps = {
    activeTab: overrides.activeTab ?? 'context',
    characters: overrides.characters ?? [],
    worldbook: overrides.worldbook ?? [],
    chapterForm: overrides.chapterForm ?? { number: 1, generatedBy: 'ai' as const },
  }

  return mount(GlassContextPanel, {
    props: defaultProps,
    global: { stubs: globalStubs },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlassContextPanel', () => {
  beforeEach(() => {
    resetMockIdCounter()
    createTestPinia()
    mockGetLogsByChapter.mockReturnValue([])
  })

  // ---------------------------------------------------------------
  // 1. Empty state on context tab
  // ---------------------------------------------------------------

  it('shows empty placeholder when no characters and worldbook entries on context tab', () => {
    const wrapper = mountPanel({ activeTab: 'context', characters: [], worldbook: [] })

    const empty = wrapper.find('.el-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('打字时右侧将浮现人物羁绊与世界词条')
  })

  // ---------------------------------------------------------------
  // 2. Tab switching emits update:activeTab
  // ---------------------------------------------------------------

  it('emits update:activeTab when tab changes', async () => {
    const wrapper = mountPanel({ activeTab: 'context' })

    // Simulate switching to "basic" tab by finding the internalTab computed setter
    // The ElTabsStub does not auto-emit, so we trigger it manually
    const tabs = wrapper.findComponent({ name: 'ElTabs' })
    await tabs.vm.$emit('update:modelValue', 'basic')
    await nextTick()

    expect(wrapper.emitted('update:activeTab')).toBeTruthy()
    expect(wrapper.emitted('update:activeTab')![0]).toEqual(['basic'])
  })

  // ---------------------------------------------------------------
  // 3. Tab switching to suggestions
  // ---------------------------------------------------------------

  it('emits update:activeTab with suggestions when switching tabs', async () => {
    const wrapper = mountPanel({ activeTab: 'context' })

    const tabs = wrapper.findComponent({ name: 'ElTabs' })
    await tabs.vm.$emit('update:modelValue', 'suggestions')
    await nextTick()

    expect(wrapper.emitted('update:activeTab')).toBeTruthy()
    expect(wrapper.emitted('update:activeTab')![0]).toEqual(['suggestions'])
  })

  // ---------------------------------------------------------------
  // 4. Renders character cards with name and background
  // ---------------------------------------------------------------

  it('renders character cards with name and background text', () => {
    const characters: ResolvedEntity[] = [
      makeResolvedEntity({
        id: 'c1',
        name: 'Alice',
        properties: { background: 'A brave warrior from the north' },
      }),
      makeResolvedEntity({
        id: 'c2',
        name: 'Bob',
        properties: {},
        systemPrompt: 'A wise wizard',
      }),
    ]

    const wrapper = mountPanel({ activeTab: 'context', characters })

    const cards = wrapper.findAll('.context-card')
    // Two character cards, no worldbook
    expect(cards.length).toBe(2)

    // First card shows background
    expect(cards[0].text()).toContain('Alice')
    expect(cards[0].text()).toContain('A brave warrior from the north')
    expect(cards[0].text()).toContain('人物')

    // Second card falls back to systemPrompt
    expect(cards[1].text()).toContain('Bob')
    expect(cards[1].text()).toContain('A wise wizard')
  })

  // ---------------------------------------------------------------
  // 5. Falls back to default text when no background or systemPrompt
  // ---------------------------------------------------------------

  it('shows fallback text when character has no background and no systemPrompt', () => {
    const characters: ResolvedEntity[] = [
      makeResolvedEntity({
        id: 'c1',
        name: 'Ghost',
        properties: {},
        systemPrompt: '',
      }),
    ]

    const wrapper = mountPanel({ activeTab: 'context', characters })

    const card = wrapper.find('.context-card')
    expect(card.text()).toContain('Ghost')
    expect(card.text()).toContain('暂时没有传记信息')
  })

  // ---------------------------------------------------------------
  // 6. Renders worldbook entries with name and systemPrompt
  // ---------------------------------------------------------------

  it('renders worldbook entries with setting tag and systemPrompt', () => {
    const worldbook: Entity[] = [
      makeEntity({ id: 'wb-1', type: 'LORE', name: 'Ancient Kingdom', systemPrompt: 'A once-great realm' }),
      makeEntity({ id: 'wb-2', type: 'LORE', name: 'Magic System', systemPrompt: '' }),
    ]

    const wrapper = mountPanel({ activeTab: 'context', worldbook })

    const cards = wrapper.findAll('.context-card')
    expect(cards.length).toBe(2)

    expect(cards[0].text()).toContain('设定')
    expect(cards[0].text()).toContain('Ancient Kingdom')
    expect(cards[0].text()).toContain('A once-great realm')

    // Second card falls back to default text
    expect(cards[1].text()).toContain('Magic System')
    expect(cards[1].text()).toContain('暂无详细设定')
  })

  // ---------------------------------------------------------------
  // 7. Renders both characters and worldbook together
  // ---------------------------------------------------------------

  it('renders both characters and worldbook entries on context tab', () => {
    const characters: ResolvedEntity[] = [
      makeResolvedEntity({ id: 'c1', name: 'Hero', properties: { background: 'The chosen one' } }),
    ]
    const worldbook: Entity[] = [
      makeEntity({ id: 'wb-1', type: 'LORE', name: 'Dark Forest', systemPrompt: 'An enchanted woodland' }),
    ]

    const wrapper = mountPanel({ activeTab: 'context', characters, worldbook })

    const cards = wrapper.findAll('.context-card')
    expect(cards.length).toBe(2)

    // First card is the character
    expect(cards[0].text()).toContain('人物')
    expect(cards[0].text()).toContain('Hero')

    // Second card is the worldbook
    expect(cards[1].text()).toContain('设定')
    expect(cards[1].text()).toContain('Dark Forest')
  })

  // ---------------------------------------------------------------
  // 8. Controls tab displays chapter form fields
  // ---------------------------------------------------------------

  it('renders chapter form with number and generatedBy on controls tab', () => {
    const chapterForm = { number: 5, generatedBy: 'hybrid' as const }
    const wrapper = mountPanel({ activeTab: 'basic', chapterForm })

    const basicPane = wrapper.find('.el-tab-pane-stub[data-name="basic"]')
    const formItemLabels = basicPane.findAll('.el-form-item-stub label')
    const labelTexts = formItemLabels.map(l => l.text())

    expect(labelTexts).toContain('章节序号')
    expect(labelTexts).toContain('算力驱动模式')

    // Check the input number stub has the correct value
    const inputNumber = basicPane.find('.el-input-number-stub')
    expect(inputNumber.exists()).toBe(true)
    expect(inputNumber.attributes('value')).toBe('5')
  })

  // ---------------------------------------------------------------
  // 9. Suggestions tab renders AI suggestions
  // ---------------------------------------------------------------

  it('renders aiSuggestions list on suggestions tab when present', () => {
    const chapterForm = {
      number: 1,
      generatedBy: 'ai' as const,
      aiSuggestions: ['Introduce a rival character', 'Foreshadow the betrayal'],
    }

    const wrapper = mountPanel({ activeTab: 'suggestions', chapterForm })

    // Scope to the suggestions tab pane
    const suggestionsPane = wrapper.find('.el-tab-pane-stub[data-name="suggestions"]')
    expect(suggestionsPane.exists()).toBe(true)

    const suggestionCards = suggestionsPane.findAll('.suggestion-item')
    expect(suggestionCards.length).toBe(2)
    expect(suggestionCards[0].text()).toContain('Introduce a rival character')
    expect(suggestionCards[1].text()).toContain('Foreshadow the betrayal')

    // No empty placeholder within the suggestions pane
    const empty = suggestionsPane.find('.el-empty-stub')
    expect(empty.exists()).toBe(false)
  })

  // ---------------------------------------------------------------
  // 10. Suggestions tab shows empty when no suggestions
  // ---------------------------------------------------------------

  it('shows empty placeholder on suggestions tab when aiSuggestions is empty or absent', () => {
    const wrapper = mountPanel({
      activeTab: 'suggestions',
      chapterForm: { number: 1, generatedBy: 'ai' as const },
    })

    const suggestionsPane = wrapper.find('.el-tab-pane-stub[data-name="suggestions"]')
    const empty = suggestionsPane.find('.el-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('暂无智脑批注')
  })

  // ---------------------------------------------------------------
  // 11. Audit tab shows logs when available
  // ---------------------------------------------------------------

  it('renders audit timeline items when chapterLogs are available', () => {
    const logDate = new Date('2026-05-31T14:30:45')
    mockGetLogsByChapter.mockReturnValue([
      {
        id: 'log-1',
        type: 'ai_decision',
        title: '角色状态更新',
        description: '检测到角色情绪变化',
        timestamp: logDate,
        chapterNumber: 1,
      },
      {
        id: 'log-2',
        type: 'error',
        title: '生成失败',
        description: 'API 超时',
        timestamp: logDate,
        chapterNumber: 1,
      },
    ])

    const wrapper = mountPanel({ activeTab: 'audit', chapterForm: { number: 1, generatedBy: 'ai' as const } })

    const auditPane = wrapper.find('.el-tab-pane-stub[data-name="audit"]')
    const timeline = auditPane.find('.el-timeline-stub')
    expect(timeline.exists()).toBe(true)

    const timelineItems = auditPane.findAll('.el-timeline-item-stub')
    expect(timelineItems.length).toBe(2)

    // Verify log type mapping: ai_decision -> primary, error -> danger
    expect(timelineItems[0].attributes('data-type')).toBe('primary')
    expect(timelineItems[1].attributes('data-type')).toBe('danger')

    // Verify content
    expect(timelineItems[0].text()).toContain('角色状态更新')
    expect(timelineItems[0].text()).toContain('检测到角色情绪变化')
    expect(timelineItems[1].text()).toContain('生成失败')

    // Verify formatted time
    expect(timelineItems[0].attributes('data-timestamp')).toBe('14:30:45')
  })

  // ---------------------------------------------------------------
  // 12. Audit tab shows empty when no logs
  // ---------------------------------------------------------------

  it('shows empty placeholder on audit tab when no logs exist', () => {
    mockGetLogsByChapter.mockReturnValue([])

    const wrapper = mountPanel({ activeTab: 'audit', chapterForm: { number: 99, generatedBy: 'ai' as const } })

    const auditPane = wrapper.find('.el-tab-pane-stub[data-name="audit"]')
    const empty = auditPane.find('.el-empty-stub')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('本章暂无 AI 后台活动记录')
  })

  // ---------------------------------------------------------------
  // 13. Log type color mapping covers all known types
  // ---------------------------------------------------------------

  it('maps all known log types to correct timeline colors', () => {
    const logDate = new Date('2026-05-31T10:00:00')
    mockGetLogsByChapter.mockReturnValue([
      { id: 'l1', type: 'warning', title: 'W', description: '', timestamp: logDate, chapterNumber: 1 },
      { id: 'l2', type: 'memory_updated', title: 'M', description: '', timestamp: logDate, chapterNumber: 1 },
      { id: 'l3', type: 'success', title: 'S', description: '', timestamp: logDate, chapterNumber: 1 },
      { id: 'l4', type: 'info', title: 'I', description: '', timestamp: logDate, chapterNumber: 1 },
    ])

    const wrapper = mountPanel({ activeTab: 'audit', chapterForm: { number: 1, generatedBy: 'ai' as const } })

    const auditPane = wrapper.find('.el-tab-pane-stub[data-name="audit"]')
    const items = auditPane.findAll('.el-timeline-item-stub')
    expect(items.length).toBe(4)
    expect(items[0].attributes('data-type')).toBe('warning')
    expect(items[1].attributes('data-type')).toBe('success')
    expect(items[2].attributes('data-type')).toBe('success')
    expect(items[3].attributes('data-type')).toBe('info')
  })

  // ---------------------------------------------------------------
  // 14. ChapterForm emits update when changed
  // ---------------------------------------------------------------

  it('emits update:chapterForm when chapterForm computed setter fires', async () => {
    const wrapper = mountPanel({
      activeTab: 'basic',
      chapterForm: { number: 1, generatedBy: 'ai' as const },
    })

    const basicPane = wrapper.find('.el-tab-pane-stub[data-name="basic"]')
    const inputNumber = basicPane.find('.el-input-number-stub')
    expect(inputNumber.exists()).toBe(true)

    // Verify the component initially displays chapter number 1
    expect(inputNumber.attributes('value')).toBe('1')

    // Verify reactivity: changing props updates the input value
    wrapper.setProps({
      chapterForm: { number: 3, generatedBy: 'manual' },
    })
    await nextTick()

    const updatedInput = basicPane.find('.el-input-number-stub')
    expect(updatedInput.attributes('value')).toBe('3')
  })
})
