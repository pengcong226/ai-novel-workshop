import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, inject } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ErrorBoundary from './ErrorBoundary.vue'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Stub el-button as a native <button> so click handlers still work
const ElButtonStub = defineComponent({
  props: ['size', 'type', 'text'],
  emits: ['click'],
  setup(_props, { slots, emit }) {
    return () => h('button', { onClick: () => emit('click') }, slots.default?.())
  },
})

const defaultGlobal = {
  stubs: {
    'el-button': ElButtonStub,
  },
}

// Helper: child component that throws on mount
function createThrowingChild(message = 'child exploded') {
  return defineComponent({
    setup() {
      throw new Error(message)
    },
    render: () => h('div'),
  })
}

// Helper: child component that renders normally
function createNormalChild(text = 'child content') {
  return defineComponent({
    render: () => h('div', { class: 'child-ok' }, text),
  })
}

// Helper: child component that injects errorBoundary and calls reportError
function createReportingChild(message = 'reported error') {
  return defineComponent({
    setup() {
      const boundary = inject<{ reportError: (err: Error) => void }>('errorBoundary')
      return { boundary }
    },
    mounted() {
      this.boundary?.reportError(new Error(message))
    },
    render: () => h('div'),
  })
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Suppress Vue warning about unhandled errors in onErrorCaptured
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // ── 1. Slot rendering when no error ──────────────────────────────────

  it('renders slot content when no error occurs', () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createNormalChild('hello world'),
      },
    })

    expect(wrapper.find('.child-ok').exists()).toBe(true)
    expect(wrapper.find('.child-ok').text()).toBe('hello world')
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
  })

  it('renders nothing when slot is empty and no error', () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: { default: '' },
    })

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
  })

  // ── 2. Error capture from child ──────────────────────────────────────

  it('catches child component error and shows fallback UI', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createThrowingChild('boom'),
      },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-message').text()).toBe('boom')
    // Slot content should be gone
    expect(wrapper.find('.child-ok').exists()).toBe(false)
  })

  it('sets role="alert" and aria-live="assertive" on fallback container', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createThrowingChild('aria test'),
      },
    })

    await nextTick()

    const fallback = wrapper.find('.error-boundary-fallback')
    expect(fallback.attributes('role')).toBe('alert')
    expect(fallback.attributes('aria-live')).toBe('assertive')
  })

  // ── 3. Error message display ─────────────────────────────────────────

  it('displays the error message from the caught Error', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createThrowingChild('specific error message'),
      },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-message').text()).toBe('specific error message')
  })

  it('displays default error message for errors with empty message', async () => {
    const emptyErrorChild = defineComponent({
      setup() {
        const err = new Error('')
        throw err
      },
      render: () => h('div'),
    })

    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: { default: emptyErrorChild },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-message').text()).toBe('未知错误')
  })

  it('uses custom title prop when provided', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { title: '自定义标题' },
      slots: {
        default: createThrowingChild('err'),
      },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('自定义标题')
  })

  it('falls back to default title when title prop is omitted', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createThrowingChild('err'),
      },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-title').text()).toBe('组件渲染出错')
  })

  // ── 4. Retry button ──────────────────────────────────────────────────

  it('shows retry button when showRetry is true and error exists', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showRetry: true },
      slots: {
        default: createThrowingChild('retryable'),
      },
    })

    await nextTick()

    const retryBtn = wrapper.find('button')
    expect(retryBtn.exists()).toBe(true)
    expect(retryBtn.text()).toBe('重试')
  })

  it('hides retry button when showRetry is false', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showRetry: false },
      slots: {
        default: createThrowingChild('no retry'),
      },
    })

    await nextTick()

    // No button should exist (detail button also hidden since showDetail is not set)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('retry resets error state and re-renders slot', async () => {
    // Use a child that throws only on first render, succeeds on retry
    let renderCount = 0
    const flakyChild = defineComponent({
      setup() {
        renderCount++
        if (renderCount === 1) {
          throw new Error('flaky first render')
        }
      },
      render: () => h('div', { class: 'recovered' }, 'recovered after retry'),
    })

    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showRetry: true },
      slots: {
        default: flakyChild,
      },
    })

    await nextTick()
    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-message').text()).toBe('flaky first render')

    // Click retry: resets error, slot re-renders, this time succeeds
    await wrapper.find('button').trigger('click')
    await nextTick()

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(false)
    expect(wrapper.find('.recovered').text()).toBe('recovered after retry')
  })

  // ── 5. Detail toggle ────────────────────────────────────────────────

  it('shows detail toggle button when showDetail is true', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showDetail: true },
      slots: {
        default: createThrowingChild('detail test'),
      },
    })

    await nextTick()

    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].text()).toBe('查看详情')
  })

  it('toggles detail expansion on click', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showDetail: true },
      slots: {
        default: createThrowingChild('detail expand'),
      },
    })

    await nextTick()

    // Detail initially collapsed
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)

    // Click to expand
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(true)
    expect(wrapper.find('button').text()).toBe('收起详情')

    // Click to collapse
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('.error-boundary-detail').exists()).toBe(false)
    expect(wrapper.find('button').text()).toBe('查看详情')
  })

  it('detail contains error stack information', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      props: { showDetail: true },
      slots: {
        default: createThrowingChild('stack trace'),
      },
    })

    await nextTick()
    await wrapper.find('button').trigger('click')

    const detail = wrapper.find('.error-boundary-detail')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('stack trace')
  })

  // ── 6. provide/inject reportError ────────────────────────────────────

  it('allows child to report errors via injected reportError', async () => {
    const wrapper = mount(ErrorBoundary, {
      global: defaultGlobal,
      slots: {
        default: createReportingChild('injected error'),
      },
    })

    await nextTick()

    expect(wrapper.find('.error-boundary-fallback').exists()).toBe(true)
    expect(wrapper.find('.error-boundary-message').text()).toBe('injected error')
  })
})
