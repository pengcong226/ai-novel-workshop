import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import ChapterEditorToolbar from '@/components/ChapterEditorToolbar.vue'

// Stub Element Plus components used by the toolbar
const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'plain', 'round', 'size', 'loading', 'text', 'ariaLabel'],
  emits: ['click'],
  template: `
    <button
      class="el-button-stub"
      :class="{ 'is-loading': loading }"
      :disabled="loading"
      @click="$emit('click', $event)"
    >
      <slot />
    </button>
  `,
}

const ElCheckboxStub = {
  name: 'ElCheckbox',
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: `
    <label class="el-checkbox-stub">
      <input
        type="checkbox"
        :checked="modelValue"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <slot />
    </label>
  `,
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const ElBadgeStub = {
  name: 'ElBadge',
  props: ['value', 'hidden'],
  template: `<span v-if="!hidden" class="el-badge-stub">{{ value }}</span>`,
}

const MagicStickStub = { template: '<span />' }
const SearchStub = { template: '<span />' }

function mountToolbar(propsOverrides: Partial<{
  generating: boolean
  autoUpdateSettings: boolean
  reviewing: boolean
  unresolvedReviewCount: number
  wordCount: number
}> = {}) {
  return mount(ChapterEditorToolbar, {
    props: {
      generating: false,
      autoUpdateSettings: false,
      reviewing: false,
      unresolvedReviewCount: 0,
      wordCount: 1000,
      ...propsOverrides,
    },
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElCheckbox: ElCheckboxStub,
        ElIcon: ElIconStub,
        ElBadge: ElBadgeStub,
        MagicStick: MagicStickStub,
        Search: SearchStub,
      },
    },
  })
}

describe('ChapterEditorToolbar', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
  })

  // --- Rendering ---

  it('renders all toolbar action buttons', () => {
    const wrapper = mountToolbar()

    // The toolbar should contain buttons for each action
    const buttons = wrapper.findAll('.el-button-stub')
    // 5 buttons: AI连载, 打磨文笔, 防吃书预警, 审校, 查找替换
    expect(buttons.length).toBeGreaterThanOrEqual(5)
  })

  it('displays the word count with the correct label', () => {
    const wrapper = mountToolbar({ wordCount: 4200 })

    const wordCount = wrapper.find('.word-count')
    expect(wordCount.exists()).toBe(true)
    expect(wordCount.text()).toBe('4200 墨')
  })

  it('renders the auto-update checkbox with label', () => {
    const wrapper = mountToolbar()

    const checkbox = wrapper.find('.el-checkbox-stub')
    expect(checkbox.exists()).toBe(true)
    expect(checkbox.text()).toContain('后台静默提词')
  })

  // --- Generate button ---

  it('emits generate event when AI连载 button is clicked', async () => {
    const wrapper = mountToolbar()

    // AI连载 is the first button in the toolbar
    const generateButton = wrapper.findAll('.el-button-stub')[0]
    await generateButton.trigger('click')

    expect(wrapper.emitted('generate')).toHaveLength(1)
  })

  it('shows loading state on the generate button when generating is true', () => {
    const wrapper = mountToolbar({ generating: true })

    const generateButton = wrapper.findAll('.el-button-stub')[0]
    expect(generateButton.classes()).toContain('is-loading')
  })

  it('does not show loading state on the generate button when generating is false', () => {
    const wrapper = mountToolbar({ generating: false })

    const generateButton = wrapper.findAll('.el-button-stub')[0]
    expect(generateButton.classes()).not.toContain('is-loading')
  })

  // --- Optimize button ---

  it('emits optimize event when 打磨文笔 button is clicked', async () => {
    const wrapper = mountToolbar()

    const optimizeButton = wrapper.findAll('.el-button-stub')[1]
    await optimizeButton.trigger('click')

    expect(wrapper.emitted('optimize')).toHaveLength(1)
  })

  // --- Check quality button ---

  it('emits checkQuality event when 防吃书预警 button is clicked', async () => {
    const wrapper = mountToolbar()

    const qualityButton = wrapper.findAll('.el-button-stub')[2]
    await qualityButton.trigger('click')

    expect(wrapper.emitted('checkQuality')).toHaveLength(1)
  })

  // --- Review button ---

  it('emits review event when 审校 button is clicked', async () => {
    const wrapper = mountToolbar()

    const reviewButton = wrapper.findAll('.el-button-stub')[3]
    await reviewButton.trigger('click')

    expect(wrapper.emitted('review')).toHaveLength(1)
  })

  it('shows loading state on the review button when reviewing is true', () => {
    const wrapper = mountToolbar({ reviewing: true })

    const reviewButton = wrapper.findAll('.el-button-stub')[3]
    expect(reviewButton.classes()).toContain('is-loading')
  })

  it('displays the review badge when unresolvedReviewCount is greater than 0', () => {
    const wrapper = mountToolbar({ unresolvedReviewCount: 5 })

    const badge = wrapper.find('.el-badge-stub')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('5')
  })

  it('hides the review badge when unresolvedReviewCount is 0', () => {
    const wrapper = mountToolbar({ unresolvedReviewCount: 0 })

    const badge = wrapper.find('.el-badge-stub')
    // ElBadgeStub renders nothing when hidden is true
    expect(badge.exists()).toBe(false)
  })

  // --- Find / Replace button ---

  it('emits toggleFindReplace event when 查找替换 button is clicked', async () => {
    const wrapper = mountToolbar()

    const findReplaceButton = wrapper.findAll('.el-button-stub')[4]
    await findReplaceButton.trigger('click')

    expect(wrapper.emitted('toggleFindReplace')).toHaveLength(1)
  })

  // --- Auto-update checkbox ---

  it('reflects the autoUpdateSettings prop value in the checkbox', () => {
    const wrapper = mountToolbar({ autoUpdateSettings: true })

    const checkbox = wrapper.find('.el-checkbox-stub input')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
  })

  it('emits update:autoUpdateSettings when checkbox is toggled', async () => {
    const wrapper = mountToolbar({ autoUpdateSettings: false })

    const checkbox = wrapper.find('.el-checkbox-stub input')
    await checkbox.setValue(true)

    expect(wrapper.emitted('update:autoUpdateSettings')).toBeTruthy()
    expect(wrapper.emitted('update:autoUpdateSettings')![0]).toEqual([true])
  })

  // --- Edge cases ---

  it('displays zero word count correctly', () => {
    const wrapper = mountToolbar({ wordCount: 0 })

    const wordCount = wrapper.find('.word-count')
    expect(wordCount.text()).toBe('0 墨')
  })
})
