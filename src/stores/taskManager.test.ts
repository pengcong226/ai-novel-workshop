import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskManager } from './taskManager'

vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${++uuidCounter}`),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

let uuidCounter = 0

describe('taskManager store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
    uuidCounter = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty tasks and toasts', () => {
      const store = useTaskManager()

      expect(store.tasks).toEqual([])
      expect(store.toasts).toEqual([])
    })

    it('computed properties return correct defaults', () => {
      const store = useTaskManager()

      expect(store.activeTasks).toEqual([])
      expect(store.hasActiveTasks).toBe(false)
      expect(store.completedTasks).toEqual([])
    })
  })

  // ── createTask ───────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('creates a task with correct defaults', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Test Task' })

      expect(task.id).toBe('mock-uuid-1')
      expect(task.title).toBe('Test Task')
      expect(task.progress).toBe(0)
      expect(task.status).toBe('pending')
      expect(task.cancellable).toBe(false)
      expect(task.description).toBeUndefined()
      expect(task.createdAt).toBeInstanceOf(Date)
    })

    it('creates a task with optional fields', () => {
      const store = useTaskManager()
      const onCancel = vi.fn()
      const task = store.createTask({
        title: 'Cancellable',
        description: 'desc',
        cancellable: true,
        onCancel,
      })

      expect(task.description).toBe('desc')
      expect(task.cancellable).toBe(true)
      expect(task.onCancel).toBe(onCancel)
    })

    it('prepends new tasks to the list (most recent first)', () => {
      const store = useTaskManager()

      store.createTask({ title: 'First' })
      store.createTask({ title: 'Second' })

      expect(store.tasks).toHaveLength(2)
      expect(store.tasks[0].title).toBe('Second')
      expect(store.tasks[1].title).toBe('First')
    })
  })

  // ── updateTask ───────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('updates mutable fields on an existing task', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Original' })

      store.updateTask(task.id, { title: 'Updated', progress: 50, status: 'running' })

      expect(store.tasks[0].title).toBe('Updated')
      expect(store.tasks[0].progress).toBe(50)
      expect(store.tasks[0].status).toBe('running')
    })

    it('clamps progress to 0..100', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })

      store.updateTask(task.id, { progress: 150 })
      expect(store.tasks[0].progress).toBe(100)

      store.updateTask(task.id, { progress: -20 })
      expect(store.tasks[0].progress).toBe(0)
    })

    it('is a no-op for non-existent task ID', () => {
      const store = useTaskManager()
      store.createTask({ title: 'Real Task' })

      store.updateTask('nonexistent', { title: 'Ghost' })

      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].title).toBe('Real Task')
    })

    it('updates updatedAt timestamp', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })
      const originalUpdatedAt = store.tasks[0].updatedAt

      vi.advanceTimersByTime(1000)
      store.updateTask(task.id, { progress: 50 })

      expect(store.tasks[0].updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })
  })

  // ── completeTask ─────────────────────────────────────────────────────────

  describe('completeTask', () => {
    it('sets status to success and progress to 100', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })
      store.updateTask(task.id, { status: 'running', progress: 60 })

      store.completeTask(task.id)

      expect(store.tasks[0].status).toBe('success')
      expect(store.tasks[0].progress).toBe(100)
    })

    it('uses default description when no message given', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })

      store.completeTask(task.id)

      expect(store.tasks[0].description).toBe('完成')
    })

    it('uses custom message when provided', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })

      store.completeTask(task.id, '自定义消息')

      expect(store.tasks[0].description).toBe('自定义消息')
    })

    it('clears the onCancel callback to release closure reference', () => {
      const store = useTaskManager()
      const onCancel = vi.fn()
      const task = store.createTask({ title: 'Task', cancellable: true, onCancel })

      store.completeTask(task.id)

      expect(store.tasks[0].onCancel).toBeUndefined()
    })
  })

  // ── failTask ─────────────────────────────────────────────────────────────

  describe('failTask', () => {
    it('sets status to error with error description', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })

      store.failTask(task.id, '网络超时')

      expect(store.tasks[0].status).toBe('error')
      expect(store.tasks[0].description).toBe('网络超时')
    })

    it('automatically creates an error toast', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'My Task' })

      store.failTask(task.id, 'something broke')

      expect(store.toasts).toHaveLength(1)
      expect(store.toasts[0].type).toBe('error')
      expect(store.toasts[0].message).toContain('My Task')
      expect(store.toasts[0].message).toContain('something broke')
    })

    it('clears the onCancel callback', () => {
      const store = useTaskManager()
      const onCancel = vi.fn()
      const task = store.createTask({ title: 'Task', cancellable: true, onCancel })

      store.failTask(task.id, 'fail')

      expect(store.tasks[0].onCancel).toBeUndefined()
    })
  })

  // ── cancelTask ───────────────────────────────────────────────────────────

  describe('cancelTask', () => {
    it('sets status to cancelled for a pending task', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })

      store.cancelTask(task.id)

      expect(store.tasks[0].status).toBe('cancelled')
      expect(store.tasks[0].description).toBe('已取消')
    })

    it('invokes the onCancel callback for pending/running tasks', () => {
      const onCancel = vi.fn()
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task', cancellable: true, onCancel })

      store.cancelTask(task.id)

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('clears the onCancel callback after invocation', () => {
      const onCancel = vi.fn()
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task', cancellable: true, onCancel })

      store.cancelTask(task.id)

      expect(store.tasks[0].onCancel).toBeUndefined()
    })

    it('is a no-op for completed (success) tasks', () => {
      const onCancel = vi.fn()
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task', cancellable: true, onCancel })
      store.completeTask(task.id)

      store.cancelTask(task.id)

      expect(store.tasks[0].status).toBe('success')
      expect(onCancel).not.toHaveBeenCalled()
    })

    it('is a no-op for already-error tasks', () => {
      const store = useTaskManager()
      const task = store.createTask({ title: 'Task' })
      store.failTask(task.id, 'fail')

      store.cancelTask(task.id)

      expect(store.tasks[0].status).toBe('error')
    })
  })

  // ── activeTasks / completedTasks computed ─────────────────────────────────

  describe('computed task filters', () => {
    it('activeTasks returns only pending and running tasks', () => {
      const store = useTaskManager()
      const _t1 = store.createTask({ title: 'Pending' })
      const t2 = store.createTask({ title: 'Running' })
      const t3 = store.createTask({ title: 'Done' })

      store.updateTask(t2.id, { status: 'running' })
      store.completeTask(t3.id)

      expect(store.activeTasks).toHaveLength(2)
      expect(store.activeTasks.map(t => t.title)).toEqual(
        expect.arrayContaining(['Running', 'Pending'])
      )
    })

    it('hasActiveTasks is true when at least one task is active', () => {
      const store = useTaskManager()

      expect(store.hasActiveTasks).toBe(false)

      store.createTask({ title: 'Task' })
      expect(store.hasActiveTasks).toBe(true)
    })

    it('completedTasks returns success, error, and cancelled tasks', () => {
      const store = useTaskManager()
      const t1 = store.createTask({ title: 'Success' })
      const t2 = store.createTask({ title: 'Error' })
      const t3 = store.createTask({ title: 'Cancelled' })
      const t4 = store.createTask({ title: 'Running' })

      store.completeTask(t1.id)
      store.failTask(t2.id, 'err')
      store.cancelTask(t3.id)
      store.updateTask(t4.id, { status: 'running' })

      expect(store.completedTasks).toHaveLength(3)
    })
  })

  // ── addToast / removeToast ───────────────────────────────────────────────

  describe('toast management', () => {
    it('addToast adds a toast with correct fields', () => {
      const store = useTaskManager()

      store.addToast('Hello', 'success', 5000)

      expect(store.toasts).toHaveLength(1)
      expect(store.toasts[0].message).toBe('Hello')
      expect(store.toasts[0].type).toBe('success')
      expect(store.toasts[0].duration).toBe(5000)
    })

    it('addToast defaults to info type and 4000ms duration', () => {
      const store = useTaskManager()

      store.addToast('Info toast')

      expect(store.toasts[0].type).toBe('info')
      expect(store.toasts[0].duration).toBe(4000)
    })

    it('removeToast removes a toast by ID', () => {
      const store = useTaskManager()
      store.addToast('Toast 1')
      store.addToast('Toast 2')

      const toast1Id = store.toasts[0].id
      store.removeToast(toast1Id)

      expect(store.toasts).toHaveLength(1)
      expect(store.toasts[0].message).toBe('Toast 2')
    })

    it('auto-dismisses toasts after duration', () => {
      const store = useTaskManager()

      store.addToast('Short-lived', 'info', 1000)

      expect(store.toasts).toHaveLength(1)

      vi.advanceTimersByTime(1000)

      expect(store.toasts).toHaveLength(0)
    })

    it('persistent toasts (duration=0) are not auto-dismissed', () => {
      const store = useTaskManager()

      store.addToast('Persistent', 'warning', 0)

      vi.advanceTimersByTime(60000)

      expect(store.toasts).toHaveLength(1)
    })
  })

  // ── clearCompletedTasks ──────────────────────────────────────────────────

  describe('clearCompletedTasks', () => {
    it('removes only completed tasks', () => {
      const store = useTaskManager()
      const _t1 = store.createTask({ title: 'Active' })
      const t2 = store.createTask({ title: 'Done' })
      store.completeTask(t2.id)

      store.clearCompletedTasks()

      expect(store.tasks).toHaveLength(1)
      expect(store.tasks[0].title).toBe('Active')
    })
  })

  // ── cleanupCompletedTasks (auto-triggered) ───────────────────────────────

  describe('cleanupCompletedTasks', () => {
    it('retains at most 50 completed tasks', () => {
      const store = useTaskManager()

      // Create 55 completed tasks
      for (let i = 0; i < 55; i++) {
        const task = store.createTask({ title: `Task ${i}` })
        store.completeTask(task.id)
      }

      // Only the 50 most recent should remain (oldest 5 dropped)
      expect(store.tasks).toHaveLength(50)
      // The remaining tasks should be Task 5..54 (most recent first)
      expect(store.tasks[store.tasks.length - 1].title).toBe('Task 5')
    })
  })

  // ── $reset ───────────────────────────────────────────────────────────────

  describe('$reset', () => {
    it('clears all tasks and toasts', () => {
      const store = useTaskManager()
      store.createTask({ title: 'Task' })
      store.addToast('Toast')

      store.$reset()

      expect(store.tasks).toEqual([])
      expect(store.toasts).toEqual([])
    })

    it('clears pending toast timers to prevent leaks', () => {
      const store = useTaskManager()
      store.addToast('Timer toast', 'info', 10000)

      store.$reset()

      // Advancing time should not throw or leave dangling references
      vi.advanceTimersByTime(10000)
      expect(store.toasts).toEqual([])
    })
  })
})
