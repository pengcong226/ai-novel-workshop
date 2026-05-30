import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import AIRewriteConfirm from '@/components/editor/AIRewriteConfirm.vue'

// --- Mock ElMessageBox ---
const mockMessageBoxConfirm = vi.fn()
vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: (...args: unknown[]) => mockMessageBoxConfirm(...args),
  },
}))

// --- Stubs ---
const elDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'closeOnClickModal'],
  emits: ['update:modelValue'],
  template: `
    <div v-if="modelValue" class="el-dialog-stub" data-testid="dialog">
      <slot />
      <div class="el-dialog__footer"><slot name="footer" /></div>
    </div>
  `,
}

const elButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'text', 'disabled'],
  emits: ['click'],
  template: '<button class="el-button-stub" :type="type" @click="$emit(\'click\')"><slot /></button>',
}

function mountComponent(props: {
  visible?: boolean
  originalText?: string
  modifiedText?: string
  action?: string
} = {}) {
  return mount(AIRewriteConfirm, {
    props: {
      visible: true,
      originalText: '原文内容。',
      modifiedText: '修改后内容。',
      action: 'rewrite',
      ...props,
    },
    global: {
      stubs: {
        ElDialog: elDialogStub,
        ElButton: elButtonStub,
      },
    },
  })
}

describe('AIRewriteConfirm', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
    mockMessageBoxConfirm.mockResolvedValue('confirm')
  })

  // --- Rendering ---

  it('renders dialog when visible is true', () => {
    const wrapper = mountComponent({ visible: true })

    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(true)
  })

  it('does not render dialog when visible is false', () => {
    const wrapper = mountComponent({ visible: false })

    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
  })

  it('displays the title "AI 修改对比"', () => {
    const wrapper = mountComponent()

    const dialog = wrapper.findComponent({ name: 'ElDialog' })
    expect(dialog.props('title')).toBe('AI 修改对比')
  })

  // --- Action label ---

  it('displays "AI 重写" label for rewrite action', () => {
    const wrapper = mountComponent({ action: 'rewrite' })

    expect(wrapper.find('.action-label').text()).toBe('AI 重写')
  })

  it('displays "AI 扩写" label for expand action', () => {
    const wrapper = mountComponent({ action: 'expand' })

    expect(wrapper.find('.action-label').text()).toBe('AI 扩写')
  })

  it('displays "AI 缩写" label for compress action', () => {
    const wrapper = mountComponent({ action: 'compress' })

    expect(wrapper.find('.action-label').text()).toBe('AI 缩写')
  })

  it('displays style label with prefix for style: actions', () => {
    const wrapper = mountComponent({ action: 'style:古风' })

    expect(wrapper.find('.action-label').text()).toBe('风格改写 → 古风')
  })

  it('falls back to raw action string for unknown actions', () => {
    const wrapper = mountComponent({ action: 'custom_action' })

    expect(wrapper.find('.action-label').text()).toBe('custom_action')
  })

  // --- Diff display ---

  it('renders diff panes with "原文" and "AI 修改" headers', () => {
    const wrapper = mountComponent()

    const headers = wrapper.findAll('.diff-pane-header')
    expect(headers).toHaveLength(2)
    expect(headers[0].text()).toBe('原文')
    expect(headers[1].text()).toBe('AI 修改')
  })

  it('highlights removed segments in the original pane', () => {
    const wrapper = mountComponent({
      originalText: '被删除的内容。',
      modifiedText: '全新的内容。',
    })

    const removedSpans = wrapper.findAll('.seg-removed')
    expect(removedSpans.length).toBeGreaterThanOrEqual(1)
    expect(removedSpans[0].text()).toBe('被删除的内容。')
  })

  it('highlights added segments in the modified pane', () => {
    const wrapper = mountComponent({
      originalText: '原始文本。',
      modifiedText: '新的文本。',
    })

    const addedSpans = wrapper.findAll('.seg-added')
    expect(addedSpans.length).toBeGreaterThanOrEqual(1)
    expect(addedSpans[0].text()).toBe('新的文本。')
  })

  it('marks common sentences as non-diff in both panes', () => {
    const common = '共同句子。'
    const wrapper = mountComponent({
      originalText: `${common}原文独有。`,
      modifiedText: `${common}修改独有。`,
    })

    // The common sentence should NOT have diff classes
    const originalPane = wrapper.findAll('.diff-content')[0]
    const spans = originalPane.findAll('span')
    const commonSpan = spans.find(s => s.text() === common)
    expect(commonSpan).toBeDefined()
    expect(commonSpan!.classes()).not.toContain('seg-removed')
  })

  // --- Button actions ---

  it('emits update:visible(false) when "放弃" button is clicked', async () => {
    const wrapper = mountComponent()

    const buttons = wrapper.findAll('.el-button-stub')
    const discardBtn = buttons.find(b => b.text() === '放弃')
    await discardBtn!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0]).toEqual([false])
  })

  it('emits accept when "采纳" button is clicked', async () => {
    const wrapper = mountComponent()

    const buttons = wrapper.findAll('.el-button-stub')
    const acceptBtn = buttons.find(b => b.text() === '采纳')
    await acceptBtn!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('accept')).toBeTruthy()
  })

  it('emits regenerate after user confirms in MessageBox', async () => {
    mockMessageBoxConfirm.mockResolvedValueOnce('confirm')
    const wrapper = mountComponent()

    const buttons = wrapper.findAll('.el-button-stub')
    const regenBtn = buttons.find(b => b.text() === '重新生成')
    await regenBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockMessageBoxConfirm).toHaveBeenCalled()
    expect(wrapper.emitted('regenerate')).toBeTruthy()
  })

  it('does not emit regenerate when user cancels MessageBox', async () => {
    mockMessageBoxConfirm.mockRejectedValueOnce(new Error('cancel'))
    const wrapper = mountComponent()

    const buttons = wrapper.findAll('.el-button-stub')
    const regenBtn = buttons.find(b => b.text() === '重新生成')
    await regenBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockMessageBoxConfirm).toHaveBeenCalled()
    expect(wrapper.emitted('regenerate')).toBeFalsy()
  })

  // --- Dialog properties ---

  it('sets close-on-click-modal to false', () => {
    const wrapper = mountComponent()

    const dialog = wrapper.findComponent({ name: 'ElDialog' })
    expect(dialog.props('closeOnClickModal')).toBe(false)
  })

  it('sets dialog width to 700px', () => {
    const wrapper = mountComponent()

    const dialog = wrapper.findComponent({ name: 'ElDialog' })
    expect(dialog.props('width')).toBe('700px')
  })
})
