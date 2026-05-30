import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createTestPinia } from '@/test/helpers'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Stub ElButton so it renders as a native <button> with slot content
const ElButtonStub = {
  name: 'ElButton',
  props: ['size', 'type', 'text'],
  template: '<button class="el-button-stub"><slot /></button>',
}

function mountBoundary(props: Record<string, unknown> = {}, slotContent = '<div class="slot-content">Hello</div>') {
  return mount(ErrorBoundary, {
    props: { name: 'test', ...props },
    slots: { default: slotContent },
    global: {
      stubs: { ElButton: ElButtonStub },
    },
  })
}

// Helper: child component that throws on demand
function createBuggyComponent(errorMessage = 'boom') {
  return defineComponent({
    setup() {
      const shouldThrow = ref(false)
      return { shouldThrow, errorMessage }
    },
    render() {
      if (this.shouldThrow) {
        throw new Error(this.errorMessage)
      }
      return h('div', { class: 'child-ok' }, 'child rendered')
    },
  })
}

function mountBoundaryWithChild(
  props: Record<string, unknown> = {},
  errorMessage = 'boom',
) {
  const BuggyChild = createBuggyComponent(errorMessage)
  const wrapper = mount(ErrorBoundary, {
    props: { name: 'test', ...props },
    slots: { default: BuggyChild },
    global: {
      stubs: { ElButton: ElButtonStub },
    },
  })
  return { wrapper, BuggyChild }
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // --- Slot rendering ---

  it('renders slot content when no error occurs', () => {
    const wrapper = mountBoundary()

    expect(wrapper.find('.slot-content').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
  })

  it('does not render slot when error is captured', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({}, 'child exploded')

    // The child renders normally first
    expect(wrapper.find('.child-ok').exists()).toBe(true)

    // Trigger the error
    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    // After error, fallback should be shown and slot gone
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)
    expect(wrapper.find('.child-ok').exists()).toBe(false)
  })

  // --- Error display ---

  it('displays error message in fallback', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({}, 'test error message')

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-message').text()).toBe('test error message')
  })

  it('displays default title when no title prop is provided', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild()

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('组件渲染出错')
  })

  it('displays custom title when title prop is provided', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({ title: '自定义错误标题' })

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('自定义错误标题')
  })

  // --- Retry button ---

  it('shows retry button when showRetry is true', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({ showRetry: true })

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const retryBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('重试'))
    expect(retryBtn).toBeDefined()
  })

  it('does not show retry button when showRetry is false', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({ showRetry: false })

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const retryBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('重试'))
    expect(retryBtn).toBeUndefined()
  })

  it('retry resets error state and re-renders slot content', async () => {
    // Use BuggyChild to trigger the error, then click retry.
    // After retry, ErrorBoundary resets hasError=false, which causes
    // the <slot> to re-render. Since BuggyChild now has shouldThrow=true,
    // it will throw again, but that tests the cycle. Instead, we use a
    // simple static slot and manually enter error state via provide.
    //
    // Simpler approach: trigger error, then click retry to restore slot.
    const BuggyChild = defineComponent({
      setup() {
        const shouldThrow = ref(false)
        return { shouldThrow }
      },
      render() {
        if (this.shouldThrow) {
          throw new Error('retry-test')
        }
        return h('div', { class: 'slot-content' }, 'Restored content')
      },
    })

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showRetry: true },
      slots: { default: BuggyChild },
      global: {
        stubs: { ElButton: ElButtonStub },
      },
    })

    // Trigger error
    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)

    // Now set shouldThrow back to false before retry
    child.vm.shouldThrow = false

    // Click retry - this resets hasError, re-renders the slot
    const retryBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('重试'))!
    await retryBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // After retry, the slot should render (BuggyChild no longer throws)
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
    expect(wrapper.find('.slot-content').exists()).toBe(true)
  })

  // --- Detail toggle ---

  it('toggles detail visibility when showDetail button is clicked', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({ showDetail: true }, 'detail error')

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    // Detail pre should not be visible initially
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)

    // Click the detail toggle button
    const detailBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('查看详情'))!
    await detailBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Now detail should be visible
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-detail').text()).toContain('detail error')

    // Click again to collapse
    const collapseBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('收起详情'))!
    await collapseBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)
  })

  it('does not show detail toggle when showDetail is false', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild({ showDetail: false })

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const detailBtn = wrapper.findAll('.el-button-stub').find(b => b.text().includes('查看详情'))
    expect(detailBtn).toBeUndefined()
  })

  // --- Error icon ---

  it('renders the error icon in fallback', async () => {
    const { wrapper, BuggyChild } = mountBoundaryWithChild()

    wrapper.findComponent(BuggyChild).vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-icon').text()).toBe('!')
  })
})
