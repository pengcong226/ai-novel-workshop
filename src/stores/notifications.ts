/**
 * 通知状态管理 Store
 * 管理全局通知队列、历史记录和未读计数
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'

// ── Types ───────────────────────────────────────────────────────────────

export type NotificationType = 'success' | 'error' | 'warning' | 'info'
export type NotificationPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'

export interface NotificationAction {
  label: string
  handler: () => void
}

export interface NotificationOptions {
  /** Notification type determines icon and color */
  type?: NotificationType
  /** Title text (optional, shown in bold above message) */
  title?: string
  /** Message body */
  message: string
  /** Auto-dismiss duration in ms. 0 = persistent (no auto-dismiss) */
  duration?: number
  /** Whether to show the close button */
  closable?: boolean
  /** Action buttons rendered below the message */
  actions?: NotificationAction[]
  /** Group key for deduplication / stacking */
  group?: string
  /** Whether this notification persists in history after dismissal */
  persistent?: boolean
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title?: string
  message: string
  duration: number
  closable: boolean
  actions: NotificationAction[]
  group?: string
  persistent: boolean
  createdAt: number
  /** Whether the user has seen this notification (read state) */
  read: boolean
  /** Whether auto-dismiss timer is paused (hover) */
  paused: boolean
}

// ── Store ───────────────────────────────────────────────────────────────

const MAX_VISIBLE = 5
const MAX_HISTORY = 200

export const useNotificationsStore = defineStore('notifications', () => {
  // State
  const active = ref<NotificationItem[]>([])
  const history = ref<NotificationItem[]>([])
  const position = ref<NotificationPosition>('top-right')

  // Getters
  const unreadCount = computed(() => history.value.filter(n => !n.read).length)
  const visibleNotifications = computed(() => active.value.slice(0, MAX_VISIBLE))
  const hasOverflow = computed(() => active.value.length > MAX_VISIBLE)
  const overflowCount = computed(() => Math.max(0, active.value.length - MAX_VISIBLE))

  // ── Actions ─────────────────────────────────────────────────────────

  /**
   * Add a new notification to the active queue
   */
  function notify(options: NotificationOptions): string {
    const id = uuidv4()
    const duration = options.duration ?? (options.type === 'error' ? 0 : 4000)

    const item: NotificationItem = {
      id,
      type: options.type ?? 'info',
      title: options.title,
      message: options.message,
      duration,
      closable: options.closable ?? true,
      actions: options.actions ?? [],
      group: options.group,
      persistent: options.persistent ?? (options.type === 'error'),
      createdAt: Date.now(),
      read: false,
      paused: false,
    }

    // Deduplicate: if a notification with the same group key exists, replace it
    if (item.group) {
      const existingIndex = active.value.findIndex(n => n.group === item.group)
      if (existingIndex !== -1) {
        const existing = active.value[existingIndex]
        active.value.splice(existingIndex, 1)
        addToHistory(existing)
      }
    }

    // Enforce max visible by removing oldest non-persistent
    while (active.value.length >= MAX_VISIBLE) {
      const oldest = active.value.find(n => !n.paused)
      if (oldest) {
        dismiss(oldest.id)
      } else {
        break
      }
    }

    active.value.push(item)
    return id
  }

  /**
   * Convenience: success notification
   */
  function success(message: string, options?: Partial<NotificationOptions>): string {
    return notify({ ...options, type: 'success', message })
  }

  /**
   * Convenience: error notification (persistent by default)
   */
  function error(message: string, options?: Partial<NotificationOptions>): string {
    return notify({ ...options, type: 'error', message, duration: options?.duration ?? 0 })
  }

  /**
   * Convenience: warning notification
   */
  function warning(message: string, options?: Partial<NotificationOptions>): string {
    return notify({ ...options, type: 'warning', message })
  }

  /**
   * Convenience: info notification
   */
  function info(message: string, options?: Partial<NotificationOptions>): string {
    return notify({ ...options, type: 'info', message })
  }

  /**
   * Dismiss a notification by id
   */
  function dismiss(id: string) {
    const index = active.value.findIndex(n => n.id === id)
    if (index === -1) return

    const [item] = active.value.splice(index, 1)
    addToHistory(item)
  }

  /**
   * Dismiss all active notifications
   */
  function dismissAll() {
    for (const item of [...active.value]) {
      addToHistory(item)
    }
    active.value = []
  }

  /**
   * Mark a notification as read
   */
  function markRead(id: string) {
    const item = history.value.find(n => n.id === id)
    if (item) {
      item.read = true
    }
  }

  /**
   * Mark all history notifications as read
   */
  function markAllRead() {
    for (const item of history.value) {
      item.read = true
    }
  }

  /**
   * Pause auto-dismiss timer (e.g. on hover)
   */
  function pause(id: string) {
    const item = active.value.find(n => n.id === id)
    if (item) {
      item.paused = true
    }
  }

  /**
   * Resume auto-dismiss timer
   */
  function resume(id: string) {
    const item = active.value.find(n => n.id === id)
    if (item) {
      item.paused = false
    }
  }

  /**
   * Clear all history
   */
  function clearHistory() {
    history.value = []
  }

  /**
   * Get history filtered by type
   */
  function getHistoryByType(type: NotificationType): NotificationItem[] {
    return history.value.filter(n => n.type === type)
  }

  /**
   * Add an item to history, enforcing the max size
   */
  function addToHistory(item: NotificationItem) {
    // Only keep in history if marked persistent or is error type
    if (item.persistent || item.type === 'error') {
      history.value.unshift({ ...item, read: item.read || item.type === 'success' })
      // Trim history
      if (history.value.length > MAX_HISTORY) {
        history.value.length = MAX_HISTORY
      }
    }
  }

  /**
   * Set notification position
   */
  function setPosition(p: NotificationPosition) {
    position.value = p
  }

  return {
    // State
    active,
    history,
    position,

    // Getters
    unreadCount,
    visibleNotifications,
    hasOverflow,
    overflowCount,

    // Actions
    notify,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
    markRead,
    markAllRead,
    pause,
    resume,
    clearHistory,
    getHistoryByType,
    setPosition,
  }
})
