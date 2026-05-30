import { describe, it, expect, beforeEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import { defineComponent, h, nextTick } from 'vue'
import ChapterEditorSidebar from './ChapterEditorSidebar.vue'
import type { Chapter } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'

// ---------------------------------------------------------------------------
// Stubs: GlassContextPanel (spy on props via attrs + a data attribute)
// ---------------------------------------------------------------------------
const GlassContextPanelStub = defineComponent({
  props: {
    activeTab: String,
    chapterForm: Object,
    characters: Array,
    worldbook: Array,
  },
  emits: ['update:activeTab', 'update:chapterForm'],
  setup(props) {
    return () =>
      h('div', { class: 'glass-context-panel-stub', 'data-active-tab': props.activeTab }, [
        h('div', { class: 'stub-characters-count' }, String(props.characters?.length ?? 0)),
        h('div', { class: 'stub-worldbook-count' }, String(props.worldbook?.length ?? 0)),
        h('div', { class: 'stub-chapter-id' }, props.chapterForm?.id ?? ''),
      ])
  },
})

// ---------------------------------------------------------------------------
// Stubs: ReviewSidePanel (spy on props + emit events for testing forwarding)
// ---------------------------------------------------------------------------
const ReviewSidePanelStub = defineComponent({
  props: {
    visible: Boolean,
    projectId: String,
    chapterId: String,
    chapterNumber: Number,
  },
  emits: ['navigateTo', 'applyFix', 'dismiss'],
  setup(props, { emit }) {
    return () =>
      h('div', { class: 'review-side-panel-stub' }, [
        h('div', { class: 'stub-visible' }, String(props.visible)),
        h('div', { class: 'stub-project-id' }, props.projectId ?? ''),
        h('div', { class: 'stub-chapter-number' }, String(props.chapterNumber ?? '')),
        h('button', { class: 'btn-navigate', onClick: () => emit('navigateTo', 42) }, 'navigate'),
        h(
          'button',
          {
            class: 'btn-apply-fix',
            onClick: () =>
              emit('applyFix', {
                suggestionId: 'sug-1',
                paragraphIndex: 3,
                originalSnippet: '原文',
                fixContent: '修改内容',
              }),
          },
          'apply',
        ),
        h('button', { class: 'btn-dismiss', onClick: () => emit('dismiss', 'sug-2') }, 'dismiss'),
      ])
  },
})

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------
function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-100',
    number: 5,
    title: '测试章节',
    content: '章节内容',
    wordCount: 100,
    outline: { summary: '', keyEvents: [], charactersInvolved: [] },
    status: 'draft',
    generatedBy: 'ai',
    generationTime: new Date('2025-01-01'),
    checkpoints: [],
    ...overrides,
  }
}

const defaultCharacters: ResolvedEntity[] = [
  {
    id: 'char-1',
    projectId: 'p1',
    type: 'CHARACTER',
    name: '主角',
    aliases: [],
    importance: 'critical',
    category: 'main',
    systemPrompt: '',
    properties: { background: '少年英雄' },
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    isArchived: false,
    createdAt: Date.now(),
  },
  {
    id: 'char-2',
    projectId: 'p1',
    type: 'CHARACTER',
    name: '配角',
    aliases: [],
    importance: 'major',
    category: 'support',
    systemPrompt: '',
    properties: { background: '神秘旅人' },
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    isArchived: false,
    createdAt: Date.now(),
  },
]

const defaultWorldbook: ResolvedEntity[] = [
  {
    id: 'wb-1',
    projectId: 'p1',
    type: 'LORE',
    name: '魔法体系',
    aliases: [],
    importance: 'critical',
    category: 'lore',
    systemPrompt: '世界设定内容',
    properties: {},
    relations: [],
    location: null,
    vitalStatus: 'alive',
    abilities: [],
    isArchived: false,
    createdAt: Date.now(),
  },
]

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------
function mountSidebar(
  propsOverrides: Record<string, unknown> = {},
): VueWrapper {
  const defaultProps = {
    activeTab: 'context',
    chapterForm: makeChapter(),
    characters: defaultCharacters,
    worldbook: defaultWorldbook,
    showReviewPanel: false,
    projectId: 'proj-1',
  }

  return mount(ChapterEditorSidebar, {
    props: { ...defaultProps, ...propsOverrides },
    global: {
      plugins: [createTestPinia()],
      stubs: {
        GlassContextPanel: GlassContextPanelStub,
        ReviewSidePanel: ReviewSidePanelStub,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ChapterEditorSidebar', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // ── Panel switching ──────────────────────────────────────────────────────

  it('renders GlassContextPanel when showReviewPanel is false', () => {
    const wrapper = mountSidebar({ showReviewPanel: false })

    expect(wrapper.find('.glass-context-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(false)
  })

  it('renders ReviewSidePanel when showReviewPanel is true', () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.glass-context-panel-stub').exists()).toBe(false)
  })

  it('toggles panel when showReviewPanel prop changes', async () => {
    const wrapper = mountSidebar({ showReviewPanel: false })

    expect(wrapper.find('.glass-context-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(false)

    await wrapper.setProps({ showReviewPanel: true })
    await nextTick()

    expect(wrapper.find('.glass-context-panel-stub').exists()).toBe(false)
    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(true)
  })

  // ── Context data display ─────────────────────────────────────────────────

  it('passes characters and worldbook arrays to GlassContextPanel', () => {
    const characters = defaultCharacters
    const worldbook = defaultWorldbook
    const wrapper = mountSidebar({ showReviewPanel: false, characters, worldbook })

    expect(wrapper.find('.stub-characters-count').text()).toBe(String(characters.length))
    expect(wrapper.find('.stub-worldbook-count').text()).toBe(String(worldbook.length))
  })

  it('passes empty arrays when no entities are provided', () => {
    const wrapper = mountSidebar({
      showReviewPanel: false,
      characters: [],
      worldbook: [],
    })

    expect(wrapper.find('.stub-characters-count').text()).toBe('0')
    expect(wrapper.find('.stub-worldbook-count').text()).toBe('0')
  })

  it('forwards activeTab and chapterForm props to GlassContextPanel', () => {
    const chapter = makeChapter({ id: 'ch-999' })
    const wrapper = mountSidebar({
      showReviewPanel: false,
      activeTab: 'basic',
      chapterForm: chapter,
    })

    const panel = wrapper.find('.glass-context-panel-stub')
    expect(panel.attributes('data-active-tab')).toBe('basic')
    expect(wrapper.find('.stub-chapter-id').text()).toBe('ch-999')
  })

  // ── ReviewSidePanel prop forwarding ──────────────────────────────────────

  it('passes projectId, chapterId, and chapterNumber to ReviewSidePanel', () => {
    const chapter = makeChapter({ id: 'ch-55', number: 7 })
    const wrapper = mountSidebar({
      showReviewPanel: true,
      projectId: 'proj-abc',
      chapterForm: chapter,
    })

    expect(wrapper.find('.stub-project-id').text()).toBe('proj-abc')
    expect(wrapper.find('.stub-chapter-number').text()).toBe('7')
  })

  it('sets visible=true on ReviewSidePanel when it is rendered', () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    expect(wrapper.find('.stub-visible').text()).toBe('true')
  })

  // ── Review panel event forwarding ────────────────────────────────────────

  it('forwards navigateTo event from ReviewSidePanel with paragraphIndex', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('.btn-navigate').trigger('click')

    expect(wrapper.emitted('navigateTo')).toBeTruthy()
    expect(wrapper.emitted('navigateTo')![0]).toEqual([42])
  })

  it('forwards applyFix event from ReviewSidePanel with full payload', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('.btn-apply-fix').trigger('click')

    expect(wrapper.emitted('applyFix')).toBeTruthy()
    expect(wrapper.emitted('applyFix')![0]).toEqual([
      {
        suggestionId: 'sug-1',
        paragraphIndex: 3,
        originalSnippet: '原文',
        fixContent: '修改内容',
      },
    ])
  })

  it('forwards dismiss event from ReviewSidePanel with suggestionId', async () => {
    const wrapper = mountSidebar({ showReviewPanel: true })

    await wrapper.find('.btn-dismiss').trigger('click')

    expect(wrapper.emitted('dismiss')).toBeTruthy()
    expect(wrapper.emitted('dismiss')![0]).toEqual(['sug-2'])
  })

  // ── useModel two-way binding ─────────────────────────────────────────────

  it('updates activeTab model when GlassContextPanel emits update:activeTab', async () => {
    const wrapper = mountSidebar({ showReviewPanel: false, activeTab: 'context' })

    // Simulate GlassContextPanel emitting an update
    const panel = wrapper.findComponent(GlassContextPanelStub)
    await panel.vm.$emit('update:activeTab', 'suggestions')

    // The v-model binding should have emitted the new value to the parent
    expect(wrapper.emitted('update:activeTab')).toBeTruthy()
    expect(wrapper.emitted('update:activeTab')![0]).toEqual(['suggestions'])
  })

  it('updates chapterForm model when GlassContextPanel emits update:chapterForm', async () => {
    const original = makeChapter({ id: 'ch-orig' })
    const wrapper = mountSidebar({ showReviewPanel: false, chapterForm: original })

    const updated = { ...original, number: 99 }
    const panel = wrapper.findComponent(GlassContextPanelStub)
    await panel.vm.$emit('update:chapterForm', updated)

    expect(wrapper.emitted('update:chapterForm')).toBeTruthy()
    expect(wrapper.emitted('update:chapterForm')![0]).toEqual([updated])
  })

  // ── projectId optionality ────────────────────────────────────────────────

  it('renders ReviewSidePanel without error when projectId is omitted', () => {
    const wrapper = mountSidebar({ showReviewPanel: true, projectId: undefined })

    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.stub-project-id').text()).toBe('')
  })

  it('passes empty-string projectId to ReviewSidePanel', () => {
    const wrapper = mountSidebar({ showReviewPanel: true, projectId: '' })

    expect(wrapper.find('.stub-project-id').text()).toBe('')
  })

  // ── Round-trip panel toggle ──────────────────────────────────────────────

  it('restores GlassContextPanel with correct data after toggling back from ReviewSidePanel', async () => {
    const chapter = makeChapter({ id: 'ch-rt', number: 12 })
    const wrapper = mountSidebar({
      showReviewPanel: true,
      activeTab: 'state',
      chapterForm: chapter,
      characters: defaultCharacters,
      worldbook: defaultWorldbook,
    })

    // ReviewSidePanel is initially shown
    expect(wrapper.find('.review-side-panel-stub').exists()).toBe(true)

    // Switch back to context panel
    await wrapper.setProps({ showReviewPanel: false })
    await nextTick()

    expect(wrapper.find('.glass-context-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.stub-chapter-id').text()).toBe('ch-rt')
    expect(wrapper.find('.glass-context-panel-stub').attributes('data-active-tab')).toBe('state')
    expect(wrapper.find('.stub-characters-count').text()).toBe(String(defaultCharacters.length))
  })

  // ── ReviewSidePanel chapterId from chapterForm.id ────────────────────────

  it('uses chapterForm.id as chapterId prop on ReviewSidePanel', () => {
    const chapter = makeChapter({ id: 'unique-ch-id-42' })
    const wrapper = mountSidebar({
      showReviewPanel: true,
      chapterForm: chapter,
    })

    // The stub does not render chapterId directly, but we can inspect the
    // component instance's received props via findComponent
    const reviewPanel = wrapper.findComponent(ReviewSidePanelStub)
    expect(reviewPanel.props('chapterId')).toBe('unique-ch-id-42')
  })

  // ── Event isolation ─────────────────────────────────────────────────────

  it('does not emit review events when GlassContextPanel is visible', async () => {
    const wrapper = mountSidebar({ showReviewPanel: false })

    // None of the review events should be emitted
    expect(wrapper.emitted('navigateTo')).toBeUndefined()
    expect(wrapper.emitted('applyFix')).toBeUndefined()
    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })

  // ── Sequential v-model updates ──────────────────────────────────────────

  it('supports sequential activeTab updates through v-model', async () => {
    const wrapper = mountSidebar({ showReviewPanel: false, activeTab: 'context' })
    const panel = wrapper.findComponent(GlassContextPanelStub)

    await panel.vm.$emit('update:activeTab', 'basic')
    await panel.vm.$emit('update:activeTab', 'suggestions')
    await panel.vm.$emit('update:activeTab', 'state')

    const emitted = wrapper.emitted('update:activeTab')!
    expect(emitted).toHaveLength(3)
    expect(emitted[0]).toEqual(['basic'])
    expect(emitted[1]).toEqual(['suggestions'])
    expect(emitted[2]).toEqual(['state'])
  })

  it('supports sequential chapterForm updates through v-model', async () => {
    const base = makeChapter({ id: 'ch-seq' })
    const wrapper = mountSidebar({ showReviewPanel: false, chapterForm: base })
    const panel = wrapper.findComponent(GlassContextPanelStub)

    const step1 = { ...base, title: '第一步' }
    const step2 = { ...base, title: '第二步' }
    await panel.vm.$emit('update:chapterForm', step1)
    await panel.vm.$emit('update:chapterForm', step2)

    const emitted = wrapper.emitted('update:chapterForm')!
    expect(emitted).toHaveLength(2)
    expect(emitted[0]).toEqual([step1])
    expect(emitted[1]).toEqual([step2])
  })
})
