import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationsStore } from './notifications'

vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${Math.random().toString(36).slice(2, 9)}`),
}))

// ── Tests ──────────────────────────────────────────────────────────────

describe('notifications store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
  })

  describe('initial state', () => {
    it('starts with empty active/history and default position', () => {
      const store = useNotificationsStore()

      expect(store.active).toEqual([])
      expect(store.history).toEqual([])
      expect(store.position).toBe('top-right')
    })

    it('returns zero unreadCount when history is empty', () => {
      const store = useNotificationsStore()

      expect(store.unreadCount).toBe(0)
    })
  })

  describe('notify', () => {
    it('creates a notification with defaults (info type, 4s duration)', () => {
      const store = useNotificationsStore()

      const id = store.notify({ message: 'test message' })

      expect(id).toBeTruthy()
      expect(store.active).toHaveLength(1)
      expect(store.active[0].type).toBe('info')
      expect(store.active[0].message).toBe('test message')
      expect(store.active[0].duration).toBe(4000)
      expect(store.active[0].closable).toBe(true)
      expect(store.active[0].persistent).toBe(false)
      expect(store.active[0].read).toBe(false)
      expect(store.active[0].paused).toBe(false)
    })

    it('sets persistent=true and duration=0 for error type', () => {
      const store = useNotificationsStore()

      store.notify({ message: 'err', type: 'error' })

      expect(store.active[0].duration).toBe(0)
      expect(store.active[0].persistent).toBe(true)
    })

    it('deduplicates by group key, moving old to history when persistent', () => {
      const store = useNotificationsStore()

      store.notify({ message: 'first', group: 'chat', persistent: true })
      expect(store.active).toHaveLength(1)

      store.notify({ message: 'second', group: 'chat' })

      expect(store.active).toHaveLength(1)
      expect(store.active[0].message).toBe('second')
      // First notification was persistent, so it lands in history
      expect(store.history).toHaveLength(1)
      expect(store.history[0].message).toBe('first')
    })

    it('auto-dismisses oldest non-paused when exceeding MAX_VISIBLE (5)', () => {
      const store = useNotificationsStore()

      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        store.notify({ message: `msg-${i}`, persistent: true })
      }
      expect(store.active).toHaveLength(5)

      // Pause one so the next dismisses a different one
      store.pause(store.active[2].id)

      store.notify({ message: 'overflow', persistent: true })

      expect(store.active).toHaveLength(5)
      expect(store.active.some(n => n.message === 'overflow')).toBe(true)
      // The paused item should still be present
      expect(store.active.find(n => n.message === `msg-2`)?.paused).toBe(true)
    })
  })

  describe('convenience methods', () => {
    it('success() creates a success notification', () => {
      const store = useNotificationsStore()
      store.success('done!')

      expect(store.active[0].type).toBe('success')
      expect(store.active[0].message).toBe('done!')
    })

    it('error() creates a persistent error with duration=0', () => {
      const store = useNotificationsStore()
      store.error('fail')

      expect(store.active[0].type).toBe('error')
      expect(store.active[0].duration).toBe(0)
      expect(store.active[0].persistent).toBe(true)
    })

    it('warning() creates a warning notification', () => {
      const store = useNotificationsStore()
      store.warning('heads up')

      expect(store.active[0].type).toBe('warning')
      expect(store.active[0].message).toBe('heads up')
    })

    it('info() creates an info notification', () => {
      const store = useNotificationsStore()
      store.info('fyi')

      expect(store.active[0].type).toBe('info')
      expect(store.active[0].message).toBe('fyi')
    })
  })

  describe('dismiss', () => {
    it('removes a notification from active and moves to history when persistent', () => {
      const store = useNotificationsStore()
      const id = store.notify({ message: 'keep me', persistent: true })

      store.dismiss(id)

      expect(store.active).toHaveLength(0)
      expect(store.history).toHaveLength(1)
      expect(store.history[0].message).toBe('keep me')
    })

    it('does not add to history when not persistent and not error', () => {
      const store = useNotificationsStore()
      const id = store.notify({ message: 'ephemeral', type: 'success', persistent: false })

      store.dismiss(id)

      expect(store.active).toHaveLength(0)
      expect(store.history).toHaveLength(0)
    })

    it('is a no-op for an unknown id', () => {
      const store = useNotificationsStore()
      store.info('hello')

      store.dismiss('non-existent-id')

      expect(store.active).toHaveLength(1)
    })
  })

  describe('dismissAll', () => {
    it('moves all active notifications to history and empties active', () => {
      const store = useNotificationsStore()
      store.notify({ message: 'a', persistent: true })
      store.notify({ message: 'b', type: 'error' })

      store.dismissAll()

      expect(store.active).toHaveLength(0)
      // Both are persistent/error, so both appear in history
      expect(store.history.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('read state', () => {
    it('markRead marks a specific notification as read', () => {
      const store = useNotificationsStore()
      const id = store.notify({ message: 'unread', persistent: true })
      store.dismiss(id)

      expect(store.history[0].read).toBe(false)
      store.markRead(id)

      expect(store.history[0].read).toBe(true)
      expect(store.unreadCount).toBe(0)
    })

    it('markAllRead marks all history items as read', () => {
      const store = useNotificationsStore()
      store.notify({ message: 'a', persistent: true })
      store.notify({ message: 'b', persistent: true })
      store.dismissAll()

      store.markAllRead()

      expect(store.history.every(n => n.read)).toBe(true)
      expect(store.unreadCount).toBe(0)
    })

    it('unreadCount reflects unread persistent notifications in history', () => {
      const store = useNotificationsStore()
      store.notify({ message: 'a', persistent: true })
      store.notify({ message: 'b', persistent: true })
      store.dismissAll()

      expect(store.unreadCount).toBe(2)
    })
  })

  describe('pause / resume', () => {
    it('pause sets paused=true, resume sets paused=false', () => {
      const store = useNotificationsStore()
      const id = store.notify({ message: 'hover me' })

      store.pause(id)
      expect(store.active[0].paused).toBe(true)

      store.resume(id)
      expect(store.active[0].paused).toBe(false)
    })

    it('pause/resume is a no-op for unknown id', () => {
      const store = useNotificationsStore()
      store.info('test')

      store.pause('bad-id')
      store.resume('bad-id')

      expect(store.active[0].paused).toBe(false)
    })
  })

  describe('clearHistory / getHistoryByType', () => {
    it('clearHistory empties all history', () => {
      const store = useNotificationsStore()
      store.notify({ message: 'x', persistent: true })
      store.dismissAll()
      expect(store.history.length).toBeGreaterThan(0)

      store.clearHistory()

      expect(store.history).toEqual([])
    })

    it('getHistoryByType returns only matching type', () => {
      const store = useNotificationsStore()
      store.error('err')
      store.info('info')
      store.dismissAll()

      const errors = store.getHistoryByType('error')
      expect(errors.every(n => n.type === 'error')).toBe(true)

      const infos = store.getHistoryByType('info')
      expect(infos.every(n => n.type === 'info')).toBe(true)
    })
  })

  describe('computed getters', () => {
    it('visibleNotifications caps at 5 items', () => {
      const store = useNotificationsStore()
      for (let i = 0; i < 7; i++) {
        store.notify({ message: `n-${i}`, persistent: true })
      }

      expect(store.visibleNotifications).toHaveLength(5)
    })

    it('hasOverflow is true when active has more than MAX_VISIBLE items (via direct push)', () => {
      const store = useNotificationsStore()

      // notify() auto-trims, so push directly to test the getter
      for (let i = 0; i < 6; i++) {
        store.active.push({
          id: `manual-${i}`,
          type: 'info',
          message: `m-${i}`,
          duration: 4000,
          closable: true,
          actions: [],
          persistent: false,
          createdAt: Date.now(),
          read: false,
          paused: false,
        })
      }

      expect(store.hasOverflow).toBe(true)
    })

    it('overflowCount reflects the number of hidden notifications (via direct push)', () => {
      const store = useNotificationsStore()

      for (let i = 0; i < 7; i++) {
        store.active.push({
          id: `manual-${i}`,
          type: 'info',
          message: `m-${i}`,
          duration: 4000,
          closable: true,
          actions: [],
          persistent: false,
          createdAt: Date.now(),
          read: false,
          paused: false,
        })
      }

      expect(store.overflowCount).toBe(2)
    })
  })

  describe('setPosition', () => {
    it('changes the notification position', () => {
      const store = useNotificationsStore()

      store.setPosition('bottom-left')

      expect(store.position).toBe('bottom-left')
    })
  })

  describe('$reset', () => {
    it('resets store to initial state', () => {
      const store = useNotificationsStore()
      store.info('hello')
      store.setPosition('top-left')
      store.notify({ message: 'x', persistent: true })
      store.dismissAll()

      store.$reset()

      expect(store.active).toEqual([])
      expect(store.history).toEqual([])
      expect(store.position).toBe('top-right')
    })
  })
})
