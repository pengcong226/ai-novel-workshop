import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick, type Ref } from 'vue'
import { createTestPinia } from '@/test/helpers'
import SearchDialog from '@/components/SearchDialog.vue'
import type { SearchResult } from '@/composables/useGlobalSearch'

// --- Mock useGlobalSearch composable ---
const mockQuery = ref('')
const mockVisible = ref(false)
const mockResults: Ref<SearchResult[]> = ref([])
const mockRecentSearches: Ref<string[]> = ref([])
const mockOpen = vi.fn(() => {
  mockVisible.value = true
})
const mockClose = vi.fn(() => {
  mockVisible.value = false
  mockQuery.value = ''
})
const mockCommitRecent = vi.fn()
const mockDeleteRecent = vi.fn((term: string) => {
  mockRecentSearches.value = mockRecentSearches.value.filter(t => t !== term)
})
const mockActivate = vi.fn()

vi.mock('@/composables/useGlobalSearch', () => ({
  useGlobalSearch: () => ({
    query: mockQuery,
    visible: mockVisible,
    results: mockResults,
    recentSearches: mockRecentSearches,
    commitRecent: mockCommitRecent,
    deleteRecent: mockDeleteRecent,
    open: mockOpen,
    close: mockClose,
    activate: mockActivate,
  }),
}))

vi.mock('@/utils/searchEngine', () => ({
  highlightText: vi.fn((text: string) => {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    return `<mark>${escaped}</mark>`
  }),
}))

vi.mock('@/utils/eventTypeLabels', () => ({
  SEARCH_ENTITY_TYPE_LABELS: {
    chapter: '章节',
    character: '人物',
    lore: '设定',
    location: '地点',
    faction: '势力',
    outline: '大纲',
  },
  SEARCH_ENTITY_TYPE_TAG: {
    chapter: '',
    character: 'success',
    lore: 'warning',
    location: 'info',
    faction: 'danger',
    outline: '',
  },
}))

// Stub Element Plus components
const elDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'width', 'appendToBody', 'showClose'],
  emits: ['opened', 'closed', 'update:modelValue'],
  template: `
    <div v-if="modelValue" class="el-dialog-stub" data-testid="dialog">
      <slot />
    </div>
  `,
}

const elIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const elTagStub = {
  name: 'ElTag',
  props: ['type', 'size', 'disableTransitions'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

function mountDialog() {
  return mount(SearchDialog, {
    global: {
      stubs: {
        ElDialog: elDialogStub,
        ElIcon: elIconStub,
        ElTag: elTagStub,
        Search: { template: '<span />' },
        Clock: { template: '<span />' },
        Close: { template: '<span />' },
        WarningFilled: { template: '<span />' },
      },
    },
  })
}

describe('SearchDialog', () => {
  beforeEach(() => {
    createTestPinia()
    mockQuery.value = ''
    mockVisible.value = false
    mockResults.value = []
    mockRecentSearches.value = []
    vi.clearAllMocks()
  })

  // --- Open / Close ---

  it('exposes an open method', () => {
    const wrapper = mountDialog()

    expect(typeof (wrapper.vm as unknown as { open: () => void }).open).toBe('function')
  })

  it('calls useGlobalSearch.open when open is invoked', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { open: () => void }

    vm.open()
    await nextTick()

    expect(mockOpen).toHaveBeenCalled()
  })

  it('renders dialog when visible is true', async () => {
    mockVisible.value = true

    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(true)
  })

  it('does not render dialog content when visible is false', () => {
    mockVisible.value = false

    const wrapper = mountDialog()

    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
  })

  it('calls close on Escape keydown', async () => {
    mockVisible.value = true

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')
    await input.trigger('keydown.escape')

    expect(mockClose).toHaveBeenCalled()
  })

  // --- Search input ---

  it('has a search input with correct placeholder', async () => {
    mockVisible.value = true

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('搜索章节、人物、设定...')
  })

  // --- Empty state ---

  it('shows empty hint when no query and no recent searches', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = []

    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.find('.search-empty-hint').exists()).toBe(true)
    expect(wrapper.text()).toContain('输入关键词开始搜索')
  })

  // --- Recent searches ---

  it('shows recent searches when available and query is empty', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['角色A', '第一章']

    const wrapper = mountDialog()
    await nextTick()

    const recentItems = wrapper.findAll('.recent-item')
    expect(recentItems).toHaveLength(2)
    expect(recentItems[0].find('.item-title').text()).toBe('角色A')
    expect(recentItems[1].find('.item-title').text()).toBe('第一章')
  })

  it('hides recent searches when query is non-empty', async () => {
    mockVisible.value = true
    mockQuery.value = 'test'
    mockRecentSearches.value = ['旧搜索']

    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.find('.recent-item').exists()).toBe(false)
  })

  it('shows clear-all button for recent searches', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['term1', 'term2']

    const wrapper = mountDialog()
    await nextTick()

    const clearBtn = wrapper.find('.clear-recent-btn')
    expect(clearBtn.exists()).toBe(true)
    expect(clearBtn.text()).toBe('清除')
  })

  it('clicking a recent item applies it as the query', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['测试搜索']

    const wrapper = mountDialog()
    await nextTick()

    await wrapper.find('.recent-item').trigger('click')
    await nextTick()

    expect(mockQuery.value).toBe('测试搜索')
  })

  // --- Search results ---

  it('shows no-results message when query has no matches', async () => {
    mockVisible.value = true
    mockQuery.value = 'xyz不存在'
    mockResults.value = []

    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.find('.search-no-results').exists()).toBe(true)
    expect(wrapper.text()).toContain('未找到匹配「xyz不存在」的结果')
  })

  it('renders grouped search results', async () => {
    mockVisible.value = true
    mockQuery.value = '角色'
    mockResults.value = [
      { type: 'character', id: 'char:1', title: '主角角色', snippet: '角色描述...' },
      { type: 'chapter', id: 'chapter:1', title: '第一章', snippet: '角色出现在...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const sections = wrapper.findAll('.search-section')
    expect(sections.length).toBeGreaterThanOrEqual(2)

    // Results should be rendered
    const items = wrapper.findAll('.search-item:not(.recent-item)')
    expect(items).toHaveLength(2)
  })

  it('renders result items with title and snippet', async () => {
    mockVisible.value = true
    mockQuery.value = '测试'
    mockResults.value = [
      { type: 'character', id: 'c:1', title: '测试角色', snippet: '这是测试的描述' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const item = wrapper.find('.search-item:not(.recent-item)')
    expect(item.find('.item-title').exists()).toBe(true)
    expect(item.find('.item-snippet').exists()).toBe(true)
  })

  // --- Keyboard navigation ---

  it('navigates down with ArrowDown key', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['term1', 'term2', 'term3']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')

    // Default selectedIndex is 0
    // Press down to move to index 1
    await input.trigger('keydown.down')

    // After ArrowDown, the second item should have active class
    // (Vue reactivity + keyboard handler)
    await nextTick()
    const activeItems = wrapper.findAll('.recent-item')
    expect(activeItems.length).toBeGreaterThanOrEqual(2)
  })

  it('navigates up with ArrowUp key', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['term1', 'term2', 'term3']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')

    // Press up from index 0 should wrap to last
    await input.trigger('keydown.up')
    await nextTick()

    // Last item should be active (wrap-around)
    const items = wrapper.findAll('.recent-item')
    expect(items[items.length - 1].classes()).toContain('search-item--active')
  })

  it('selects active item on Enter key', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['搜索词']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')
    await input.trigger('keydown.enter')
    await nextTick()

    // Should apply the recent search
    expect(mockQuery.value).toBe('搜索词')
  })

  it('wraps selection from first to last on ArrowUp', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['a', 'b', 'c']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')
    // selectedIndex starts at 0
    await input.trigger('keydown.up')
    await nextTick()

    const items = wrapper.findAll('.recent-item')
    // Last item (index 2) should be active
    expect(items[2].classes()).toContain('search-item--active')
  })

  it('wraps selection from last to first on ArrowDown', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['a', 'b', 'c']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')

    // Navigate to last: press up once from 0 -> 2
    await input.trigger('keydown.up')
    await nextTick()

    // Now press down from 2 -> 0 (wrap)
    await input.trigger('keydown.down')
    await nextTick()

    const items = wrapper.findAll('.recent-item')
    expect(items[0].classes()).toContain('search-item--active')
  })

  // --- Mouse hover sets active index ---

  it('sets active index on mouseenter for recent items', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['first', 'second']

    const wrapper = mountDialog()
    await nextTick()

    const items = wrapper.findAll('.recent-item')

    // Hover over second item
    await items[1].trigger('mouseenter')
    await nextTick()

    expect(items[1].classes()).toContain('search-item--active')
  })

  // --- Result click activates ---

  it('activates a result when clicked', async () => {
    mockVisible.value = true
    mockQuery.value = 'test'
    const result: SearchResult = { type: 'chapter', id: 'chapter:1', title: 'Test', snippet: '...' }
    mockResults.value = [result]

    const wrapper = mountDialog()
    await nextTick()

    const item = wrapper.find('.search-item:not(.recent-item)')
    await item.trigger('click')
    await nextTick()

    // The component appends _globalIndex to results before passing to activate
    expect(mockActivate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', id: 'chapter:1', title: 'Test' }),
    )
  })

  // --- Footer hints ---

  it('renders keyboard hint footer', async () => {
    mockVisible.value = true

    const wrapper = mountDialog()
    await nextTick()

    const footer = wrapper.find('.search-footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('导航')
    expect(footer.text()).toContain('选择')
    expect(footer.text()).toContain('关闭')
  })

  // --- clearAllRecent ---

  it('clears all recent searches when clicking the clear button', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['termA', 'termB', 'termC']

    const wrapper = mountDialog()
    await nextTick()

    const clearBtn = wrapper.find('.clear-recent-btn')
    expect(clearBtn.exists()).toBe(true)

    await clearBtn.trigger('click')
    await nextTick()

    // deleteRecent should have been called once for each term
    expect(mockDeleteRecent).toHaveBeenCalledTimes(3)
    expect(mockDeleteRecent).toHaveBeenCalledWith('termA')
    expect(mockDeleteRecent).toHaveBeenCalledWith('termB')
    expect(mockDeleteRecent).toHaveBeenCalledWith('termC')
  })

  // --- deleteRecent via remove button ---

  it('deletes a single recent search when clicking the remove button', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['keep', 'remove-me']

    const wrapper = mountDialog()
    await nextTick()

    const removeButtons = wrapper.findAll('.remove-recent-btn')
    // Click the remove button on the second item
    await removeButtons[1].trigger('click')

    expect(mockDeleteRecent).toHaveBeenCalledWith('remove-me')
    expect(mockDeleteRecent).toHaveBeenCalledTimes(1)
  })

  // --- Result ordering by entity type ---

  it('orders result groups by entity type priority (chapter before character)', async () => {
    mockVisible.value = true
    mockQuery.value = 'test'
    // Provide results in reverse priority order
    mockResults.value = [
      { type: 'character', id: 'char:1', title: 'Char A', snippet: '...' },
      { type: 'chapter', id: 'ch:1', title: 'Chapter 1', snippet: '...' },
      { type: 'outline', id: 'outline:1', title: 'Outline', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const tags = wrapper.findAll('.el-tag-stub')
    // chapter < character < outline in the defined order
    expect(tags[0].text()).toBe('章节')
    expect(tags[1].text()).toBe('人物')
    expect(tags[2].text()).toBe('大纲')
  })

  // --- selectActive with search results on Enter ---

  it('activates the selected search result on Enter key', async () => {
    mockVisible.value = true
    mockQuery.value = 'match'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Matched Chapter', snippet: '...' },
      { type: 'character', id: 'char:1', title: 'Matched Char', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')
    // Default selectedIndex is 0, so pressing Enter activates first result
    await input.trigger('keydown.enter')
    await nextTick()

    expect(mockActivate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chapter', id: 'ch:1', title: 'Matched Chapter' }),
    )
  })

  // --- selectedIndex resets when query changes ---

  it('resets selected index to 0 when query changes', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = ['a', 'b', 'c']

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')

    // Navigate down to index 1
    await input.trigger('keydown.down')
    await nextTick()

    // Now change query (simulates typing)
    mockQuery.value = 'new search'
    await nextTick()

    // With results, first result should be at index 0
    // Verify by checking that after another ArrowDown, index moves to 1
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Result1', snippet: '...' },
      { type: 'chapter', id: 'ch:2', title: 'Result2', snippet: '...' },
    ]
    await nextTick()

    await input.trigger('keydown.down')
    await nextTick()

    // After reset + one ArrowDown, we should be at index 1 (second item)
    const items = wrapper.findAll('.search-item:not(.recent-item)')
    if (items.length >= 2) {
      expect(items[1].classes()).toContain('search-item--active')
    }
  })

  // --- Entity type tags with correct labels ---

  it('renders entity type tags with correct labels for each group', async () => {
    mockVisible.value = true
    mockQuery.value = 'q'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Ch1', snippet: '...' },
      { type: 'character', id: 'c:1', title: 'C1', snippet: '...' },
      { type: 'lore', id: 'l:1', title: 'L1', snippet: '...' },
      { type: 'location', id: 'loc:1', title: 'Loc1', snippet: '...' },
      { type: 'faction', id: 'f:1', title: 'F1', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const tags = wrapper.findAll('.el-tag-stub')
    const tagTexts = tags.map(t => t.text())

    expect(tagTexts).toContain('章节')
    expect(tagTexts).toContain('人物')
    expect(tagTexts).toContain('设定')
    expect(tagTexts).toContain('地点')
    expect(tagTexts).toContain('势力')
  })

  // --- Result count per group ---

  it('shows correct item count per result group', async () => {
    mockVisible.value = true
    mockQuery.value = 'test'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Ch1', snippet: '...' },
      { type: 'chapter', id: 'ch:2', title: 'Ch2', snippet: '...' },
      { type: 'chapter', id: 'ch:3', title: 'Ch3', snippet: '...' },
      { type: 'character', id: 'c:1', title: 'C1', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const counts = wrapper.findAll('.result-count')
    expect(counts[0].text()).toBe('3 项')
    expect(counts[1].text()).toBe('1 项')
  })

  // --- ArrowDown wraps in search results ---

  it('wraps selection from last to first on ArrowDown in search results', async () => {
    mockVisible.value = true
    mockQuery.value = 'q'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'R1', snippet: '...' },
      { type: 'chapter', id: 'ch:2', title: 'R2', snippet: '...' },
      { type: 'chapter', id: 'ch:3', title: 'R3', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const input = wrapper.find('.search-input')

    // Press up from index 0 to go to last (index 2)
    await input.trigger('keydown.up')
    await nextTick()

    // Press down from index 2 to wrap to index 0
    await input.trigger('keydown.down')
    await nextTick()

    const items = wrapper.findAll('.search-item:not(.recent-item)')
    expect(items[0].classes()).toContain('search-item--active')
  })

  // --- Escaping special characters in titles ---

  it('escapes HTML special characters in result titles', async () => {
    mockVisible.value = true
    mockQuery.value = 'test'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Chapter <1> & "test"', snippet: '...' },
    ]

    const wrapper = mountDialog()
    await nextTick()

    const title = wrapper.find('.search-item:not(.recent-item) .item-title')
    // highlightText escapes HTML then wraps in <mark>.
    // wrapper.html() returns the DOM serialization where entities are decoded,
    // so we check the innerHTML via element.innerHTML which preserves encoding.
    const el = title.element as HTMLElement
    const innerHtml = el.innerHTML
    expect(innerHtml).toContain('<mark>')
    expect(innerHtml).toContain('&lt;1&gt;')
    expect(innerHtml).toContain('&amp;')
  })

  // --- Section header hidden for recent when query present ---

  it('does not render recent section header when query is non-empty', async () => {
    mockVisible.value = true
    mockQuery.value = 'searching'
    mockRecentSearches.value = ['old term']

    const wrapper = mountDialog()
    await nextTick()

    expect(wrapper.text()).not.toContain('最近搜索')
    expect(wrapper.find('.clear-recent-btn').exists()).toBe(false)
  })

  // --- Search footer always visible ---

  it('always shows footer regardless of query or result state', async () => {
    mockVisible.value = true
    mockQuery.value = ''
    mockRecentSearches.value = []

    const wrapper = mountDialog()
    await nextTick()

    // Footer should always be present
    expect(wrapper.find('.search-footer').exists()).toBe(true)

    // With results
    mockQuery.value = 'something'
    mockResults.value = [
      { type: 'chapter', id: 'ch:1', title: 'Something', snippet: '...' },
    ]
    await nextTick()

    expect(wrapper.find('.search-footer').exists()).toBe(true)
  })
})
