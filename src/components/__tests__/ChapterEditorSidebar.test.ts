import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createTestPinia } from '@/test/helpers'
import ChapterEditorSidebar from '@/components/ChapterEditorSidebar.vue'
import type { Chapter } from '@/types'

// Mock the child components to isolate the sidebar
const mockGlassContextPanel = {
  name: 'GlassContextPanel',
  props: ['activeTab', 'chapterForm', 'characters', 'worldbook'],
  emits: ['update:activeTab', 'update:chapterForm'],
  template: `
    <div class="glass-context-panel-stub" data-testid="glass-context-panel">
      <span data-testid="active-tab">{{ activeTab }}</span>
      <span data-testid="characters-count">{{ characters?.length || 0 }}</span>
      <span data-testid="worldbook-count">{{ worldbook?.length || 0 }}</span>
    </div>
  `,
}

const mockReviewSidePanel = {
  name: 'ReviewSidePanel',
  props: ['visible', 'projectId', 'chapterId', 'chapterNumber'],
  emits: ['navigateTo', 'applyFix', 'dismiss'],
  template: `
    <div class="review-side-panel-stub" data-testid="review-side-panel">
      <span data-testid="chapter-id">{{ chapterId }}</span>
      <span data-testid="chapter-number">{{ chapterNumber }}</span>
      <button data-testid="btn-navigate" @click="$emit('navigateTo', 3)">navigate</button>
      <button
        data-testid="btn-apply-fix"
        @click="$emit('applyFix', {
          suggestionId: 's1',
          paragraphIndex: 2,
          originalSnippet: '原文',
          fixContent: '修正'
        })"
      >apply</button>
      <button data-testid="btn-dismiss" @click="$emit('dismiss', 's1')">dismiss</button>
    </div>
  `,
}

vi.mock('@/composables/useAuditLog', () => ({
  useAuditLog: () => ({
    logs: ref([]),
    addLog: vi.fn(),
    getLogsByChapter: vi.fn().mockReturnValue([]),
  }),
}))

function createMockChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-test-1',
    number: 1,
    title: '第一章 测试',
    content: '测试内容。',
    wordCount: 100,
    outline: {
      chapterId: 'outline-1',
      title: '第一章',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      status: 'completed',
    },
    status: 'draft',
    generatedBy: 'ai',
    generationTime: new Date(),
    checkpoints: [],
    ...overrides,
  }
}

function mountSidebar(propsOverrides: Partial<{
  activeTab: string
  chapterForm: Chapter
  characters: unknown[]
  worldbook: unknown[]
  showReviewPanel: boolean
  projectId: string
}> = {}) {
  return mount(ChapterEditorSidebar, {
    props: {
      activeTab: 'context',
      chapterForm: createMockChapter(),
      characters: [],
      worldbook: [],
      showReviewPanel: false,
      projectId: 'test-project',
      ...propsOverrides,
    },
    global: {
      stubs: {
        GlassContextPanel: mockGlassContextPanel,
        ReviewSidePanel: mockReviewSidePanel,
      },
    },
  })
}

describe('ChapterEditorSidebar', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
  })

  // --- Panel switching ---

  it('renders GlassContextPanel when showReviewPanel is false', () => {
    const wrapper = mountSidebar({ showReviewPanel: false })

    expect(wrapper.find('[data-testid="glass-context-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="review-side-panel"]').exists()).toBe(false)
  })

  it('renders ReviewSidePanel when showReviewPanel is true', () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    expect(wrapper.find('[data-testid="review-side-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="glass-context-panel"]').exists()).toBe(false)
  })

  it('switches from context panel to review panel when showReviewPanel changes', async () => {
    const wrapper = mountSidebar({ showReviewPanel: false })

    expect(wrapper.find('[data-testid="glass-context-panel"]').exists()).toBe(true)

    await wrapper.setProps({ showReviewPanel: true })

    expect(wrapper.find('[data-testid="review-side-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="glass-context-panel"]').exists()).toBe(false)
  })

  it('switches back to context panel when showReviewPanel is set to false', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    expect(wrapper.find('[data-testid="review-side-panel"]').exists()).toBe(true)

    await wrapper.setProps({ showReviewPanel: false })

    expect(wrapper.find('[data-testid="glass-context-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="review-side-panel"]').exists()).toBe(false)
  })

  // --- Passing props to GlassContextPanel ---

  it('passes the activeTab prop to GlassContextPanel', () => {
    const wrapper = mountSidebar({ activeTab: 'basic' })

    const tabDisplay = wrapper.find('[data-testid="active-tab"]')
    expect(tabDisplay.text()).toBe('basic')
  })

  it('passes the characters array to GlassContextPanel', () => {
    const chars = [
      { id: 'c1', name: '主角', type: 'CHARACTER' },
      { id: 'c2', name: '反派', type: 'CHARACTER' },
    ]
    const wrapper = mountSidebar({ characters: chars as any })

    const count = wrapper.find('[data-testid="characters-count"]')
    expect(count.text()).toBe('2')
  })

  it('passes the worldbook array to GlassContextPanel', () => {
    const wb = [{ id: 'w1', name: '世界观', type: 'LORE' }]
    const wrapper = mountSidebar({ worldbook: wb as any })

    const count = wrapper.find('[data-testid="worldbook-count"]')
    expect(count.text()).toBe('1')
  })

  // --- Passing props to ReviewSidePanel ---

  it('passes chapterForm.id and chapterForm.number to ReviewSidePanel', () => {
    const chapter = createMockChapter({ id: 'ch-42', number: 42 })
    const wrapper = mountSidebar({
      showReviewPanel: true,
      chapterForm: chapter,
    })

    expect(wrapper.find('[data-testid="chapter-id"]').text()).toBe('ch-42')
    expect(wrapper.find('[data-testid="chapter-number"]').text()).toBe('42')
  })

  // --- Event forwarding from ReviewSidePanel ---

  it('forwards navigateTo event from ReviewSidePanel', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('[data-testid="btn-navigate"]').trigger('click')

    const emitted = wrapper.emitted('navigateTo')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([3])
  })

  it('forwards applyFix event from ReviewSidePanel with the full payload', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('[data-testid="btn-apply-fix"]').trigger('click')

    const emitted = wrapper.emitted('applyFix')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([{
      suggestionId: 's1',
      paragraphIndex: 2,
      originalSnippet: '原文',
      fixContent: '修正',
    }])
  })

  it('forwards dismiss event from ReviewSidePanel', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('[data-testid="btn-dismiss"]').trigger('click')

    const emitted = wrapper.emitted('dismiss')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['s1'])
  })

  // --- Edge cases ---

  it('handles empty characters and worldbook arrays gracefully', () => {
    const wrapper = mountSidebar({
      characters: [],
      worldbook: [],
    })

    const countChars = wrapper.find('[data-testid="characters-count"]')
    const countWb = wrapper.find('[data-testid="worldbook-count"]')
    expect(countChars.text()).toBe('0')
    expect(countWb.text()).toBe('0')
  })
})
