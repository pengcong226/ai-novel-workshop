import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { useSuggestionsStore } from '@/stores/suggestions'
import type { Suggestion, SuggestionPriority, SuggestionStatus } from '@/types/suggestions'
import ReviewSidePanel from '@/components/editor/ReviewSidePanel.vue'

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="stub-empty"><p>{{ description }}</p></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'loading', 'disabled', 'text', 'plain'],
  emits: ['click'],
  template: '<button class="stub-button" :disabled="disabled ?? false" @click="$emit(\'click\')"><slot /></button>',
}

const ElCardStub = {
  name: 'ElCard',
  props: ['shadow'],
  template: '<div class="stub-card"><slot /></div>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size', 'effect'],
  template: '<span class="stub-tag" :data-type="type"><slot /></span>',
}

const globalStubs = {
  ElEmpty: ElEmptyStub,
  ElButton: ElButtonStub,
  ElCard: ElCardStub,
  ElTag: ElTagStub,
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function createSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  const now = new Date()
  return {
    id: `sug-${Math.random().toString(36).slice(2, 9)}`,
    type: 'improvement',
    category: 'quality',
    priority: 'medium',
    title: '建议标题',
    message: '建议内容描述',
    location: {
      chapter: 1,
      paragraphIndex: 3,
      textSnippet: '原始文本片段',
      suggestedFix: '修复后的文本',
    },
    status: 'unread',
    createdAt: now,
    updatedAt: now,
    pushed: false,
    ...overrides,
  }
}

function createMinimalSuggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  const now = new Date()
  return {
    id: `sug-min-${Math.random().toString(36).slice(2, 9)}`,
    type: 'question',
    category: 'reminder',
    priority: 'low',
    title: '无位置建议',
    message: '这条建议没有位置信息',
    location: { chapter: 1 },
    status: 'unread',
    createdAt: now,
    updatedAt: now,
    pushed: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

function mountPanel(
  props: { visible?: boolean; chapterNumber?: number; projectId?: string; chapterId?: string } = {},
  storeSeed: Suggestion[] = [],
) {
  const pinia = createTestPinia()
  const store = useSuggestionsStore()

  // Seed the store with test data
  storeSeed.forEach(s => {
    store.suggestions.push({ ...s })
  })

  const wrapper = mount(ReviewSidePanel, {
    props: {
      visible: true,
      chapterNumber: 1,
      ...props,
    },
    global: {
      plugins: [pinia],
      stubs: globalStubs,
    },
  })

  return { wrapper, store }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewSidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Visibility ----

  it('renders nothing when visible is false', () => {
    const { wrapper } = mountPanel({ visible: false }, [createSuggestion()])

    expect(wrapper.find('.review-side-panel').exists()).toBe(false)
  })

  // ---- Empty state ----

  it('shows empty state when there are no suggestions for the chapter', () => {
    const { wrapper } = mountPanel()

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无审校建议')
  })

  it('shows empty state when suggestions exist for a different chapter', () => {
    const otherChapter = createSuggestion({ location: { chapter: 99 } })
    const { wrapper } = mountPanel({ chapterNumber: 1 }, [otherChapter])

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
  })

  // ---- Header counts ----

  it('displays correct total and unresolved counts in the header', () => {
    const suggestions = [
      createSuggestion({ id: 's1', status: 'unread', priority: 'high' }),
      createSuggestion({ id: 's2', status: 'read', priority: 'medium' }),
      createSuggestion({ id: 's3', status: 'adopted', priority: 'low' }),
    ]
    const { wrapper } = mountPanel({ chapterNumber: 1 }, suggestions)

    const headerText = wrapper.find('.panel-header').text()
    // total = 3, unresolved = 2 (adopted is resolved)
    expect(headerText).toContain('共 3 条建议')
    expect(headerText).toContain('2 条未处理')
    expect(headerText).toContain('第 1 章')
  })

  // ---- Suggestion list rendering ----

  it('renders a card for each suggestion in the chapter', () => {
    const suggestions = [
      createSuggestion({ id: 's1', priority: 'high' }),
      createSuggestion({ id: 's2', priority: 'low' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const cards = wrapper.findAll('.stub-card')
    expect(cards).toHaveLength(2)
  })

  // ---- Sorting by priority ----

  it('sorts suggestions by priority: high first, then medium, then low', () => {
    const suggestions = [
      createSuggestion({ id: 's-low', priority: 'low', title: '低优先级' }),
      createSuggestion({ id: 's-high', priority: 'high', title: '高优先级' }),
      createSuggestion({ id: 's-med', priority: 'medium', title: '中优先级' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const cards = wrapper.findAll('.suggestion-card')
    expect(cards).toHaveLength(3)

    // First card should contain high priority title
    expect(cards[0]!.text()).toContain('高优先级')
    expect(cards[1]!.text()).toContain('中优先级')
    expect(cards[2]!.text()).toContain('低优先级')
  })

  // ---- Priority labels and tag types ----

  it('renders correct priority labels for each level', () => {
    const suggestions = [
      createSuggestion({ id: 's1', priority: 'high' }),
      createSuggestion({ id: 's2', priority: 'medium' }),
      createSuggestion({ id: 's3', priority: 'low' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const text = wrapper.text()
    expect(text).toContain('高优先级')
    expect(text).toContain('中优先级')
    expect(text).toContain('低优先级')
  })

  it('maps priority to correct el-tag type attribute', () => {
    const suggestions = [
      createSuggestion({ id: 's1', priority: 'high' }),
      createSuggestion({ id: 's2', priority: 'medium' }),
      createSuggestion({ id: 's3', priority: 'low' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const tags = wrapper.findAll('.stub-tag[data-type]')
    const priorityTags = tags.filter(t => {
      const type = t.attributes('data-type')
      return type === 'danger' || type === 'warning' || type === 'info'
    })

    expect(priorityTags).toHaveLength(3)
    expect(priorityTags[0]!.attributes('data-type')).toBe('danger')   // high
    expect(priorityTags[1]!.attributes('data-type')).toBe('warning')  // medium
    expect(priorityTags[2]!.attributes('data-type')).toBe('info')     // low
  })

  // ---- Status labels ----

  it('shows status label for adopted and ignored suggestions', () => {
    const suggestions = [
      createSuggestion({ id: 's1', status: 'adopted' }),
      createSuggestion({ id: 's2', status: 'ignored' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const text = wrapper.text()
    expect(text).toContain('已采纳')
    expect(text).toContain('已忽略')
  })

  it('does not show status label for unread or read suggestions', () => {
    const suggestions = [
      createSuggestion({ id: 's1', status: 'unread', title: 'unread-title' }),
      createSuggestion({ id: 's2', status: 'read', title: 'read-title' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    // The status label tags (data-type="info") should not exist for unread/read
    const tags = wrapper.findAll('.stub-tag[data-type="info"]')
    const statusLabels = tags.filter(t =>
      t.text() === '未读' || t.text() === '已读',
    )
    expect(statusLabels).toHaveLength(0)
  })

  // ---- Paragraph index and snippet display ----

  it('renders paragraph index, text snippet, and suggested fix when present', () => {
    const suggestion = createSuggestion({
      location: {
        chapter: 1,
        paragraphIndex: 5,
        textSnippet: '主角走到门前',
        suggestedFix: '主角缓步走到门前',
      },
    })
    const { wrapper } = mountPanel({}, [suggestion])

    expect(wrapper.text()).toContain('段落 P5')
    expect(wrapper.text()).toContain('主角走到门前')
    expect(wrapper.text()).toContain('建议修改')
    expect(wrapper.text()).toContain('主角缓步走到门前')
  })

  it('hides paragraph line, snippet, and fix when not provided', () => {
    const { wrapper } = mountPanel({}, [createMinimalSuggestion()])

    expect(wrapper.text()).not.toContain('段落 P')
    expect(wrapper.find('.snippet').exists()).toBe(false)
    expect(wrapper.find('.fix-block').exists()).toBe(false)
  })

  // ---- Navigate button ----

  it('emits navigate-to with paragraphIndex when jump button is clicked', async () => {
    const suggestion = createSuggestion({
      location: { chapter: 1, paragraphIndex: 7 },
    })
    const { wrapper } = mountPanel({}, [suggestion])

    const buttons = wrapper.findAll('.actions .stub-button')
    // First button is "跳转"
    await buttons[0]!.trigger('click')

    expect(wrapper.emitted('navigate-to')).toHaveLength(1)
    expect(wrapper.emitted('navigate-to')![0]).toEqual([7])
  })

  it('disables the jump button when paragraphIndex is undefined', () => {
    const suggestion = createMinimalSuggestion()
    const { wrapper } = mountPanel({}, [suggestion])

    const buttons = wrapper.findAll('.stub-button')
    expect(buttons.length).toBeGreaterThan(0)
    // First button is "跳转"
    const jumpButton = buttons[0]!
    expect(jumpButton.attributes('disabled')).toBeDefined()
  })

  // ---- Apply fix button ----

  it('emits apply-fix with correct payload when apply button is clicked', async () => {
    const suggestion = createSuggestion({
      id: 'fix-sug',
      location: {
        chapter: 1,
        paragraphIndex: 2,
        textSnippet: '错误文本',
        suggestedFix: '修正文本',
      },
    })
    const { wrapper } = mountPanel({}, [suggestion])

    const buttons = wrapper.findAll('.actions .stub-button')
    // Second button is "采纳修复"
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('apply-fix')).toHaveLength(1)
    expect(wrapper.emitted('apply-fix')![0]).toEqual([{
      suggestionId: 'fix-sug',
      paragraphIndex: 2,
      originalSnippet: '错误文本',
      fixContent: '修正文本',
    }])
  })

  it('disables the apply button when textSnippet or suggestedFix is missing', () => {
    const suggestion = createSuggestion({
      location: { chapter: 1, paragraphIndex: 1, textSnippet: undefined, suggestedFix: undefined },
    })
    const { wrapper } = mountPanel({}, [suggestion])

    const applyButton = wrapper.findAll('.actions .stub-button')[1]!
    expect(applyButton.attributes('disabled')).toBeDefined()
  })

  it('disables the apply button when suggestion status is adopted', () => {
    const suggestion = createSuggestion({
      status: 'adopted',
    })
    const { wrapper } = mountPanel({}, [suggestion])

    const applyButton = wrapper.findAll('.actions .stub-button')[1]!
    expect(applyButton.attributes('disabled')).toBeDefined()
  })

  it('disables the apply button when suggestion status is ignored', () => {
    const suggestion = createSuggestion({
      status: 'ignored',
    })
    const { wrapper } = mountPanel({}, [suggestion])

    const applyButton = wrapper.findAll('.actions .stub-button')[1]!
    expect(applyButton.attributes('disabled')).toBeDefined()
  })

  // ---- Dismiss button ----

  it('emits dismiss with suggestion id when ignore button is clicked', async () => {
    const suggestion = createSuggestion({ id: 'dismiss-me' })
    const { wrapper } = mountPanel({}, [suggestion])

    const buttons = wrapper.findAll('.actions .stub-button')
    // Third button is "忽略"
    await buttons[2]!.trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')![0]).toEqual(['dismiss-me'])
  })

  // ---- Scope filtering ----

  it('only shows suggestions matching the current chapterNumber', () => {
    const suggestions = [
      createSuggestion({ id: 's1', location: { chapter: 1 } }),
      createSuggestion({ id: 's2', location: { chapter: 2 } }),
      createSuggestion({ id: 's3', location: { chapter: 1 } }),
    ]
    const { wrapper } = mountPanel({ chapterNumber: 1 }, suggestions)

    const cards = wrapper.findAll('.stub-card')
    expect(cards).toHaveLength(2)
  })

  // ---- Priority CSS class ----

  it('applies priority-specific CSS class on suggestion cards', () => {
    const suggestions = [
      createSuggestion({ id: 's1', priority: 'high' }),
      createSuggestion({ id: 's2', priority: 'medium' }),
      createSuggestion({ id: 's3', priority: 'low' }),
    ]
    const { wrapper } = mountPanel({}, suggestions)

    const cards = wrapper.findAll('.suggestion-card')
    expect(cards[0]!.classes()).toContain('priority-high')
    expect(cards[1]!.classes()).toContain('priority-medium')
    expect(cards[2]!.classes()).toContain('priority-low')
  })
})
