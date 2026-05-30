/**
 * Global task manager store.
 *
 * Tracks background tasks (pending / running / success / error / cancelled),
 * provides a toast notification queue with auto-dismiss, and enforces a
 * maximum completed-task retention of 50 items.
 *
 * ### Potential memory leak note
 * Auto-dismiss toasts use `setTimeout`. The store tracks active timer IDs
 * and clears them on `$reset()` to prevent leaks.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useTaskManager } from '@/stores/taskManager'
 * import { storeToRefs } from 'pinia'
 * const { tasks, toasts, activeTasks } = storeToRefs(useTaskManager())
 * ```
 *
 * @module stores/taskManager
 */

import { defineStore } from 'pinia'
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '@/utils/logger'

export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface GlobalTask {
  id: string
  title: string
  description?: string
  progress: number // 0 to 100
  status: TaskStatus
  createdAt: Date
  updatedAt: Date
  cancellable: boolean
  onCancel?: () => void
}

export interface TaskToast {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
  createdAt: Date
}

export const useTaskManager = defineStore('taskManager', () => {
  const tasks: Ref<GlobalTask[]> = ref([])
  const toasts: Ref<TaskToast[]> = ref([])
  const logger = getLogger('task:manager')

  /** Track toast auto-dismiss timers so we can clear them on $reset() */
  const toastTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // Computed properties
  /** Tasks that are currently running or pending. */
  const activeTasks: ComputedRef<GlobalTask[]> = computed(
    (): GlobalTask[] => tasks.value.filter(t => t.status === 'running' || t.status === 'pending')
  )
  /** Whether any tasks are currently active. */
  const hasActiveTasks: ComputedRef<boolean> = computed(
    (): boolean => activeTasks.value.length > 0
  )
  /** Tasks that have finished (success, error, or cancelled). */
  const completedTasks: ComputedRef<GlobalTask[]> = computed(
    (): GlobalTask[] => tasks.value.filter(t => ['success', 'error', 'cancelled'].includes(t.status))
  )

  /**
   * Create a new background task and add it to the task list.
   *
   * @param options - Task configuration (title, description, cancellability, cancel callback)
   * @returns The newly created task object
   */
  function createTask(options: {
    title: string
    description?: string
    cancellable?: boolean
    onCancel?: () => void
  }): GlobalTask {
    const task: GlobalTask = {
      id: uuidv4(),
      title: options.title,
      description: options.description,
      progress: 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      cancellable: options.cancellable ?? false,
      onCancel: options.onCancel
    }
    
    tasks.value.unshift(task) // Add to top
    logger.info(`Task created: ${task.title} [${task.id}]`)
    return task
  }

  /**
   * Update fields on an existing task. Progress is clamped to 0-100.
   *
   * @param id - Task ID to update
   * @param updates - Partial fields to merge
   */
  function updateTask(id: string, updates: Partial<Pick<GlobalTask, 'title' | 'description' | 'progress' | 'status'>>): void {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      if (updates.title !== undefined) task.title = updates.title
      if (updates.description !== undefined) task.description = updates.description
      if (updates.progress !== undefined) task.progress = Math.min(100, Math.max(0, updates.progress))
      if (updates.status !== undefined) task.status = updates.status
      task.updatedAt = new Date()
      
      logger.debug(`Task updated: ${task.title} [${task.id}] - ${task.status} (${task.progress}%)`)
    }
  }

  /**
   * Mark a task as successfully completed at 100% progress.
   * @param id - Task ID
   * @param message - Optional completion message
   */
  function completeTask(id: string, message?: string): void {
    updateTask(id, { status: 'success', progress: 100, description: message || '完成' })
    cleanupCompletedTasks()
  }

  /**
   * Mark a task as failed with an error message. Automatically shows
   * an error toast with the failure details.
   * @param id - Task ID
   * @param error - Error description string
   */
  function failTask(id: string, error: string): void {
    updateTask(id, { status: 'error', description: error })
    // Automatically trigger a toast for failed background tasks
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      addToast(`任务失败: ${task.title} - ${error}`, 'error')
    }
    cleanupCompletedTasks()
  }

  /**
   * Cancel a running or pending task. Invokes the task's onCancel
   * callback if one was provided at creation time.
   * @param id - Task ID
   */
  function cancelTask(id: string): void {
    const task = tasks.value.find(t => t.id === id)
    if (task && (task.status === 'running' || task.status === 'pending')) {
      if (task.onCancel) {
        task.onCancel()
      }
      updateTask(id, { status: 'cancelled', description: '已取消' })
      logger.info(`Task cancelled: ${task.title} [${task.id}]`)
    }
    cleanupCompletedTasks()
  }

  // 清理已完成的任务，保留最近的50个
  function cleanupCompletedTasks() {
    const MAX_COMPLETED = 50
    const completed = tasks.value.filter(t => ['success', 'error', 'cancelled'].includes(t.status))
    if (completed.length > MAX_COMPLETED) {
      const toRemove = new Set(completed.slice(MAX_COMPLETED).map(t => t.id))
      tasks.value = tasks.value.filter(t => !toRemove.has(t.id))
    }
  }

  /**
   * Add a toast notification to the queue. If `duration > 0`, the
   * toast auto-dismisses after the specified time.
   *
   * @param message - Toast message text
   * @param type - Visual style (info, success, warning, error)
   * @param duration - Auto-dismiss time in ms (0 = persistent)
   */
  function addToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 4000): void {
    const toast: TaskToast = {
      id: uuidv4(),
      message,
      type,
      duration,
      createdAt: new Date()
    }
    toasts.value.push(toast)

    // Auto remove and track the timer to prevent memory leaks on $reset()
    if (duration > 0) {
      const timer = setTimeout(() => {
        toastTimers.delete(toast.id)
        removeToast(toast.id)
      }, duration)
      toastTimers.set(toast.id, timer)
    }
  }

  /**
   * Remove a toast by its ID. Clears any pending auto-dismiss timer.
   * @param id - Toast ID to remove
   */
  function removeToast(id: string): void {
    const timer = toastTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.delete(id)
    }
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  /**
   * Remove all completed tasks from the list.
   */
  function clearCompletedTasks(): void {
    tasks.value = tasks.value.filter(t => !['success', 'error', 'cancelled'].includes(t.status))
  }

  /**
   * Reset the store to its initial state. Clears all tasks, toasts,
   * and pending auto-dismiss timers to prevent memory leaks.
   */
  function $reset(): void {
    // Clear all tracked toast timers to prevent leaks
    for (const timer of toastTimers.values()) {
      clearTimeout(timer)
    }
    toastTimers.clear()

    tasks.value = []
    toasts.value = []
  }

  return {
    tasks,
    toasts,
    activeTasks,
    hasActiveTasks,
    completedTasks,
    createTask,
    updateTask,
    completeTask,
    failTask,
    cancelTask,
    addToast,
    removeToast,
    clearCompletedTasks,
    $reset
  }
})
