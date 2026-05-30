import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, onErrorCaptured } from 'vue'
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

describe('ErrorBoundary', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // --- Slot rendering ---

  it('renders slot content when no error occurs', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<div class="slot-content">Hello</div>',
      },
    })

    expect(wrapper.find('.slot-content').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
  })

  it('does not render slot when error is captured', async () => {
    const BuggyChild = createBuggyComponent('child exploded')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test' },
      slots: {
        default: BuggyChild,
      },
    })

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
    const BuggyChild = createBuggyComponent('test error message')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test' },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-message').text()).toBe('test error message')
  })

  it('displays default title when no title prop is provided', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test' },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('组件渲染出错')
  })

  it('displays custom title when title prop is provided', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', title: '自定义错误标题' },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('自定义错误标题')
  })

  // --- Retry button ---

  it('shows retry button when showRetry is true', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showRetry: true },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const retryBtn = wrapper.findAll('button').find(b => b.text().includes('重试'))
    expect(retryBtn).toBeDefined()
  })

  it('does not show retry button when showRetry is false', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showRetry: false },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const retryBtn = wrapper.findAll('button').find(b => b.text().includes('重试'))
    expect(retryBtn).toBeUndefined()
  })

  it('retry resets error state and re-renders slot content', async () => {
    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showRetry: true },
      slots: {
        default: '<div class="slot-content">Restored</div>',
      },
    })

    // Manually trigger the error state via the component's internal refs
    const vm = wrapper.vm as unknown as { hasError: { value: boolean }; errorMessage: { value: string } }
    vm.hasError.value = true
    vm.errorMessage.value = 'manual error'
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)

    // Click retry
    const retryBtn = wrapper.findAll('button').find(b => b.text().includes('重试'))!
    await retryBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // After retry, slot should re-render
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
    expect(wrapper.find('.slot-content').exists()).toBe(true)
  })

  // --- Detail toggle ---

  it('toggles detail visibility when showDetail button is clicked', async () => {
    const BuggyChild = createBuggyComponent('detail error')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showDetail: true },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    // Detail pre should not be visible initially
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)

    // Click the detail toggle button
    const detailBtn = wrapper.findAll('button').find(b => b.text().includes('查看详情'))!
    await detailBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // Now detail should be visible
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-detail').text()).toContain('detail error')

    // Click again to collapse
    const collapseBtn = wrapper.findAll('button').find(b => b.text().includes('收起详情'))!
    await collapseBtn.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)
  })

  it('does not show detail toggle when showDetail is false', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test', showDetail: false },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    const detailBtn = wrapper.findAll('button').find(b => b.text().includes('查看详情'))
    expect(detailBtn).toBeUndefined()
  })

  // --- Error icon ---

  it('renders the error icon in fallback', async () => {
    const BuggyChild = createBuggyComponent('err')

    const wrapper = mount(ErrorBoundary, {
      props: { name: 'test' },
      slots: { default: BuggyChild },
    })

    const child = wrapper.findComponent(BuggyChild)
    child.vm.shouldThrow = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.error-boundary-icon').text()).toBe('!')
  })
})
