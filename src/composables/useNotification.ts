/**
 * 通知系统 Composable
 * 提供便捷的 toast 通知 API，支持队列管理、自动消失、操作按钮等
 *
 * Usage:
 *   const { success, error, warning, info, notify } = useNotification()
 *   success('保存成功')
 *   error('保存失败', { title: '错误', persistent: true })
 *   notify({ type: 'warning', message: '磁盘空间不足', actions: [{ label: '清理', handler: () => ... }] })
 */

import { useNotificationsStore, type NotificationOptions, type NotificationPosition } from '@/stores/notifications'

export function useNotification() {
  const store = useNotificationsStore()

  /**
   * Show a notification with full options
   */
  function notify(options: NotificationOptions): string {
    return store.notify(options)
  }

  /**
   * Show a success notification
   */
  function success(message: string, options?: Partial<Omit<NotificationOptions, 'type' | 'message'>>): string {
    return store.success(message, options)
  }

  /**
   * Show an error notification (persistent by default)
   */
  function error(message: string, options?: Partial<Omit<NotificationOptions, 'type' | 'message'>>): string {
    return store.error(message, options)
  }

  /**
   * Show a warning notification
   */
  function warning(message: string, options?: Partial<Omit<NotificationOptions, 'type' | 'message'>>): string {
    return store.warning(message, options)
  }

  /**
   * Show an info notification
   */
  function info(message: string, options?: Partial<Omit<NotificationOptions, 'type' | 'message'>>): string {
    return store.info(message, options)
  }

  /**
   * Dismiss a specific notification by id
   */
  function dismiss(id: string): void {
    store.dismiss(id)
  }

  /**
   * Dismiss all active notifications
   */
  function dismissAll(): void {
    store.dismissAll()
  }

  /**
   * Set the global notification position
   */
  function setPosition(position: NotificationPosition): void {
    store.setPosition(position)
  }

  /**
   * Show a notification with a retry action
   */
  function withRetry(message: string, retryFn: () => void, options?: Partial<NotificationOptions>): string {
    return notify({
      type: 'error',
      message,
      actions: [
        { label: '重试', handler: retryFn },
      ],
      ...options,
    })
  }

  /**
   * Show a save success notification (suppressed if repeated within 2s)
   */
  let lastSaveSuccessId: string | undefined
  let lastSaveSuccessTime = 0
  function saveSuccess(message = '保存成功'): string {
    const now = Date.now()
    if (now - lastSaveSuccessTime < 2000) {
      // Suppress rapid successive save notifications
      return lastSaveSuccessId ?? ''
    }
    lastSaveSuccessTime = now
    lastSaveSuccessId = success(message, { duration: 2000 })
    return lastSaveSuccessId
  }

  return {
    // Core
    notify,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
    setPosition,

    // Higher-level
    withRetry,
    saveSuccess,
  }
}
