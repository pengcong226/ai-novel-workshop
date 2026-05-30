import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import NotificationItem from '@/components/NotificationItem.vue'
import { useNotificationsStore, type NotificationItem as NotificationItemType } from '@/stores/notifications'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<NotificationItemType> = {}): NotificationItemType {
  return {
    id: 'notif-1',
    type: 'info',
    title: 'Test Title',
    message: 'Test message body',
    duration: 0,
    closable: true,
    actions: [],
    persistent: false,
    createdAt: Date.now(),
    read: false,
    paused: false,
    ...overrides,
  }
}

function createWrapper(
  notification: Partial<NotificationItemType> = {},
  globalOpts: Record<string, unknown> = {},
): VueWrapper {
  const pinia = createTestPinia()
  return mount(NotificationItem, {
    props: { notification: makeNotification(notification) },
    global: { plugins: [pinia], ...globalOpts },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationItem', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createTestPinia()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- Rendering -----------------------------------------------------------

  it('renders the message text', () => {
    const wrapper = createWrapper({ message: 'Hello world' })

    expect(wrapper.find('.notification-item__message').text()).toBe('Hello world')
  })

  it('renders the title when provided', () => {
    const wrapper = createWrapper({ title: 'My Title' })

    expect(wrapper.find('.notification-item__title').text()).toBe('My Title')
  })

  it('does not render title element when title is undefined', () => {
    const wrapper = createWrapper({ title: undefined })

    expect(wrapper.find('.notification-item__title').exists()).toBe(false)
  })

  // ---- Type icon / color class ---------------------------------------------

  it.each([
    ['success', 'icon-success', '&#10003;'],
    ['error', 'icon-error', '&#10007;'],
    ['warning', 'icon-warning', '&#9888;'],
    ['info', 'icon-info', '&#8505;'],
  ] as const)('renders %s type with correct icon class and border', (type, iconClass, _entity) => {
    const wrapper = createWrapper({ type })

    // Root element gets the type-specific modifier class
    expect(wrapper.classes()).toContain(`notification-item--${type}`)
    // Icon wrapper has the type-specific class
    expect(wrapper.find(`.${iconClass}`).exists()).toBe(true)
  })

  it('sets aria-live="assertive" for error type', () => {
    const wrapper = createWrapper({ type: 'error' })

    expect(wrapper.attributes('aria-live')).toBe('assertive')
  })

  it('sets aria-live="polite" for non-error types', () => {
    const wrapper = createWrapper({ type: 'info' })

    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('sets role="alert" on the root element', () => {
    const wrapper = createWrapper()

    expect(wrapper.attributes('role')).toBe('alert')
  })

  // ---- Close button --------------------------------------------------------

  it('renders close button when closable is true', () => {
    const wrapper = createWrapper({ closable: true })

    const closeBtn = wrapper.find('.notification-item__close')
    expect(closeBtn.exists()).toBe(true)
    expect(closeBtn.attributes('aria-label')).toBe('关闭通知')
  })

  it('does not render close button when closable is false', () => {
    const wrapper = createWrapper({ closable: false })

    expect(wrapper.find('.notification-item__close').exists()).toBe(false)
  })

  it('emits "dismiss" with notification id when close button is clicked', async () => {
    const wrapper = createWrapper({ id: 'abc-123', closable: true })

    await wrapper.find('.notification-item__close').trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')![0]).toEqual(['abc-123'])
  })

  // ---- Action buttons ------------------------------------------------------

  it('renders action buttons when actions array is non-empty', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const wrapper = createWrapper({
      actions: [
        { label: 'Undo', handler: handler1 },
        { label: 'Retry', handler: handler2 },
      ],
    })

    const buttons = wrapper.findAll('.notification-item__action-btn')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.text()).toBe('Undo')
    expect(buttons[1]!.text()).toBe('Retry')
  })

  it('calls action handler when an action button is clicked', async () => {
    const handler = vi.fn()
    const wrapper = createWrapper({
      actions: [{ label: 'Retry', handler }],
    })

    await wrapper.find('.notification-item__action-btn').trigger('click')

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not render actions container when actions array is empty', () => {
    const wrapper = createWrapper({ actions: [] })

    expect(wrapper.find('.notification-item__actions').exists()).toBe(false)
  })

  // ---- Auto-dismiss timer --------------------------------------------------

  it('emits "dismiss" after duration elapses', async () => {
    const wrapper = createWrapper({ id: 'auto-dismiss', duration: 3000 })

    // Before duration, no dismiss
    vi.advanceTimersByTime(2999)
    expect(wrapper.emitted('dismiss')).toBeUndefined()

    // At duration, dismiss fires
    vi.advanceTimersByTime(1)
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.emitted('dismiss')![0]).toEqual(['auto-dismiss'])
  })

  it('does not start auto-dismiss timer when duration is 0', () => {
    const wrapper = createWrapper({ id: 'persistent', duration: 0 })

    vi.advanceTimersByTime(30_000)

    expect(wrapper.emitted('dismiss')).toBeUndefined()
  })

  it('shows progress bar when duration > 0', () => {
    const wrapper = createWrapper({ duration: 5000 })

    expect(wrapper.find('.notification-item__progress').exists()).toBe(true)
    expect(wrapper.find('.notification-item__progress-bar').exists()).toBe(true)
  })

  it('does not show progress bar when duration is 0', () => {
    const wrapper = createWrapper({ duration: 0 })

    expect(wrapper.find('.notification-item__progress').exists()).toBe(false)
  })

  // ---- Progress bar width --------------------------------------------------

  it('updates progress bar width as time advances', async () => {
    const wrapper = createWrapper({ id: 'prog', duration: 1000 })

    // Advance halfway
    vi.advanceTimersByTime(500)
    await wrapper.vm.$nextTick()

    const bar = wrapper.find('.notification-item__progress-bar')
    const style = bar.attributes('style') ?? ''
    // Should be approximately 50%
    expect(style).toMatch(/width:\s*\d+\.?\d*%/)
    const pct = parseFloat(style.match(/width:\s*([\d.]+)%/)?.[1] ?? '0')
    expect(pct).toBeGreaterThanOrEqual(40)
    expect(pct).toBeLessThanOrEqual(60)
  })

  // ---- Pause / resume (hover) ----------------------------------------------

  it('calls notifStore.pause on mouseenter', async () => {
    const pinia = createTestPinia()
    const notifStore = useNotificationsStore(pinia)
    const pauseSpy = vi.spyOn(notifStore, 'pause')

    const wrapper = mount(NotificationItem, {
      props: { notification: makeNotification({ id: 'hover-me' }) },
      global: { plugins: [pinia] },
    })

    await wrapper.trigger('mouseenter')

    expect(pauseSpy).toHaveBeenCalledWith('hover-me')
  })

  it('calls notifStore.resume on mouseleave', async () => {
    const pinia = createTestPinia()
    const notifStore = useNotificationsStore(pinia)
    const resumeSpy = vi.spyOn(notifStore, 'resume')

    const wrapper = mount(NotificationItem, {
      props: { notification: makeNotification({ id: 'leave-me' }) },
      global: { plugins: [pinia] },
    })

    await wrapper.trigger('mouseleave')

    expect(resumeSpy).toHaveBeenCalledWith('leave-me')
  })

  it('applies paused class to progress bar when notification is paused', () => {
    const wrapper = createWrapper({ paused: true, duration: 5000 })

    const bar = wrapper.find('.notification-item__progress-bar')
    expect(bar.classes()).toContain('notification-item__progress-bar--paused')
  })

  it('does not apply paused class when notification is not paused', () => {
    const wrapper = createWrapper({ paused: false, duration: 5000 })

    const bar = wrapper.find('.notification-item__progress-bar')
    expect(bar.classes()).not.toContain('notification-item__progress-bar--paused')
  })

  // ---- Cleanup (unmount) ---------------------------------------------------

  it('clears interval on unmount to prevent memory leaks', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')

    const wrapper = createWrapper({ duration: 10_000 })
    wrapper.unmount()

    expect(clearSpy).toHaveBeenCalled()
  })
})
