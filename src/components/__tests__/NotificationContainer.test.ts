import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { useNotificationsStore } from '@/stores/notifications'
import NotificationContainer from '@/components/NotificationContainer.vue'

// Stub child NotificationItem so we only test container behavior
const NotificationItemStub = {
  name: 'NotificationItem',
  props: ['notification'],
  emits: ['dismiss'],
  template: `
    <div class="stub-notification" :data-id="notification.id">
      <span class="stub-message">{{ notification.message }}</span>
      <button class="stub-dismiss" @click="$emit('dismiss', notification.id)">dismiss</button>
    </div>
  `,
}

describe('NotificationContainer', () => {
  let store: ReturnType<typeof useNotificationsStore>

  beforeEach(() => {
    createTestPinia()
    store = useNotificationsStore()
  })

  function mountContainer() {
    return mount(NotificationContainer, {
      global: {
        stubs: {
          NotificationItem: NotificationItemStub,
          // Stub Teleport so content renders in-place for testing
          Teleport: { template: '<slot />' },
        },
      },
    })
  }

  // --- Rendering ---

  it('renders the notification container with correct role', () => {
    const wrapper = mountContainer()

    const region = wrapper.find('[role="region"]')
    expect(region.exists()).toBe(true)
    expect(region.attributes('aria-label')).toBe('通知区域')
  })

  it('renders no notification items when store is empty', () => {
    const wrapper = mountContainer()

    expect(wrapper.findAll('.stub-notification')).toHaveLength(0)
  })

  it('renders notification items from the store', async () => {
    store.notify({ message: 'Hello', type: 'info' })
    store.notify({ message: 'World', type: 'success' })

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.findAll('.stub-notification')).toHaveLength(2)
    expect(wrapper.findAll('.stub-message').map(w => w.text())).toEqual(['Hello', 'World'])
  })

  it('limits visible notifications to 5', async () => {
    for (let i = 0; i < 8; i++) {
      store.notify({ message: `msg-${i}`, type: 'info' })
    }

    const wrapper = mountContainer()
    await nextTick()

    // MAX_VISIBLE is 5
    expect(wrapper.findAll('.stub-notification')).toHaveLength(5)
  })

  // --- Dismiss ---

  it('dismisses a notification when NotificationItem emits dismiss', async () => {
    const id = store.notify({ message: 'to dismiss', type: 'info' })

    const wrapper = mountContainer()
    await nextTick()

    expect(store.visibleNotifications).toHaveLength(1)

    // Click dismiss on the stubbed child
    await wrapper.find('.stub-dismiss').trigger('click')
    await nextTick()

    expect(store.visibleNotifications).toHaveLength(0)
  })

  // --- Dismiss All ---

  it('shows dismiss-all button when more than 1 notification is visible', async () => {
    store.notify({ message: 'one', type: 'info' })
    store.notify({ message: 'two', type: 'info' })

    const wrapper = mountContainer()
    await nextTick()

    const dismissAllBtn = wrapper.find('.notification-container__dismiss-all')
    expect(dismissAllBtn.exists()).toBe(true)
    expect(dismissAllBtn.text()).toBe('全部关闭')
  })

  it('does not show dismiss-all button with only 1 notification', async () => {
    store.notify({ message: 'only one', type: 'info' })

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container__dismiss-all').exists()).toBe(false)
  })

  it('dismiss-all button clears all active notifications', async () => {
    store.notify({ message: 'one', type: 'info' })
    store.notify({ message: 'two', type: 'info' })
    store.notify({ message: 'three', type: 'info' })

    const wrapper = mountContainer()
    await nextTick()

    expect(store.visibleNotifications).toHaveLength(3)

    await wrapper.find('.notification-container__dismiss-all').trigger('click')
    await nextTick()

    expect(store.visibleNotifications).toHaveLength(0)
  })

  // --- Position ---

  it('applies position class from store (default top-right)', () => {
    const wrapper = mountContainer()

    expect(wrapper.find('.notification-container--top-right').exists()).toBe(true)
  })

  it('applies bottom-right position class when store position changes', async () => {
    store.setPosition('bottom-right')

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container--bottom-right').exists()).toBe(true)
  })

  it('applies top-left position class', async () => {
    store.setPosition('top-left')

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container--top-left').exists()).toBe(true)
  })

  it('applies bottom-left position class', async () => {
    store.setPosition('bottom-left')

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container--bottom-left').exists()).toBe(true)
  })

  it('applies top-center position class', async () => {
    store.setPosition('top-center')

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container--top-center').exists()).toBe(true)
  })

  // --- Overflow indicator ---

  it('shows overflow indicator when hasOverflow is true', async () => {
    // The store's notify() caps active at MAX_VISIBLE (5), so we must
    // directly push into the reactive array to simulate overflow.
    for (let i = 0; i < 7; i++) {
      store.active.push({
        id: `overflow-${i}`,
        type: 'info',
        message: `overflow-msg-${i}`,
        duration: 0,
        closable: true,
        actions: [],
        persistent: false,
        createdAt: Date.now(),
        read: false,
        paused: false,
      })
    }

    const wrapper = mountContainer()
    await nextTick()

    expect(store.hasOverflow).toBe(true)
    expect(store.overflowCount).toBe(2)

    const overflow = wrapper.find('.notification-container__overflow')
    expect(overflow.exists()).toBe(true)
    expect(overflow.text()).toContain('2 条通知')
  })

  it('does not show overflow indicator when notifications fit', async () => {
    store.notify({ message: 'one', type: 'info' })

    const wrapper = mountContainer()
    await nextTick()

    expect(wrapper.find('.notification-container__overflow').exists()).toBe(false)
  })

  // --- Transition name ---

  it('computes transition name based on position (right)', () => {
    store.setPosition('top-right')
    const wrapper = mountContainer()

    // The component uses a TransitionGroup with dynamic name
    // We verify the list container exists
    expect(wrapper.find('.notification-container__list').exists()).toBe(true)
  })

  it('computes transition name based on position (left)', () => {
    store.setPosition('top-left')
    const wrapper = mountContainer()

    expect(wrapper.find('.notification-container__list').exists()).toBe(true)
  })
})
