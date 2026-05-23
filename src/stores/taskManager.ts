import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
  const tasks = ref<GlobalTask[]>([])
  const toasts = ref<TaskToast[]>([])
  const logger = getLogger('task:manager')

  // Computed properties
  const activeTasks = computed(() => tasks.value.filter(t => t.status === 'running' || t.status === 'pending'))
  const hasActiveTasks = computed(() => activeTasks.value.length > 0)
  const completedTasks = computed(() => tasks.value.filter(t => ['success', 'error', 'cancelled'].includes(t.status)))

  // Create a new background task
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

  // Update an existing task
  function updateTask(id: string, updates: Partial<Pick<GlobalTask, 'title' | 'description' | 'progress' | 'status'>>) {
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

  function completeTask(id: string, message?: string) {
    updateTask(id, { status: 'success', progress: 100, description: message || '完成' })
  }

  function failTask(id: string, error: string) {
    updateTask(id, { status: 'error', description: error })
    // Automatically trigger a toast for failed background tasks
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      addToast(`任务失败: ${task.title} - ${error}`, 'error')
    }
  }

  function cancelTask(id: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task && task.status === 'running' || task?.status === 'pending') {
      if (task.onCancel) {
        task.onCancel()
      }
      updateTask(id, { status: 'cancelled', description: '已取消' })
      logger.info(`Task cancelled: ${task.title} [${task.id}]`)
    }
  }

  function addToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration: number = 4000) {
    const toast: TaskToast = {
      id: uuidv4(),
      message,
      type,
      duration,
      createdAt: new Date()
    }
    toasts.value.push(toast)
    
    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        removeToast(toast.id)
      }, duration)
    }
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function clearCompletedTasks() {
    tasks.value = tasks.value.filter(t => !['success', 'error', 'cancelled'].includes(t.status))
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
    clearCompletedTasks
  }
})
