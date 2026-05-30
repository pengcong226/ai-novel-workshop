import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { useTaskManager } from '@/stores/taskManager'
import GlobalTaskObserver from '@/components/GlobalTaskObserver.vue'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-' + Math.random().toString(36).slice(2, 9)),
}))

// Stub Element Plus components so they render predictably without full EP registration
const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const ElProgressStub = {
  name: 'ElProgress',
  props: ['percentage', 'strokeWidth', 'showText'],
  template: '<div class="el-progress-stub" :data-percentage="percentage"></div>',
}

const ElCollapseTransitionStub = {
  name: 'ElCollapseTransition',
  template: '<div class="el-collapse-stub"><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['size', 'type', 'link'],
  template: '<button class="el-button-stub"><slot /></button>',
}

// Stub icon components as simple spans
const iconStub = (name: string) => ({
  name,
  template: `<span class="icon-${name.toLowerCase()}"></span>`,
})

const stubs = {
  ElIcon: ElIconStub,
  ElProgress: ElProgressStub,
  ElCollapseTransition: ElCollapseTransitionStub,
  ElButton: ElButtonStub,
  InfoFilled: iconStub('InfoFilled'),
  SuccessFilled: iconStub('SuccessFilled'),
  WarningFilled: iconStub('WarningFilled'),
  CircleCloseFilled: iconStub('CircleCloseFilled'),
  Loading: iconStub('Loading'),
  Operation: iconStub('Operation'),
  ArrowUp: iconStub('ArrowUp'),
  ArrowDown: iconStub('ArrowDown'),
}

describe('GlobalTaskObserver', () => {
  let store: ReturnType<typeof useTaskManager>

  beforeEach(() => {
    vi.useFakeTimers()
    createTestPinia()
    store = useTaskManager()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function mountObserver() {
    return mount(GlobalTaskObserver, {
      global: { stubs },
    })
  }

  // ---- Toast rendering ----

  it('renders no toasts when store is empty', () => {
    const wrapper = mountObserver()

    expect(wrapper.findAll('.task-toast')).toHaveLength(0)
  })

  it('renders toast messages from the store', async () => {
    store.addToast('Hello info', 'info', 0)
    store.addToast('Error occurred', 'error', 0)

    const wrapper = mountObserver()
    await nextTick()

    const toasts = wrapper.findAll('.task-toast')
    expect(toasts).toHaveLength(2)
    expect(toasts[0].text()).toContain('Hello info')
    expect(toasts[1].text()).toContain('Error occurred')
  })

  it('applies the correct type class to each toast', async () => {
    store.addToast('info msg', 'info', 0)
    store.addToast('success msg', 'success', 0)
    store.addToast('warning msg', 'warning', 0)
    store.addToast('error msg', 'error', 0)

    const wrapper = mountObserver()
    await nextTick()

    const toasts = wrapper.findAll('.task-toast')
    expect(toasts[0].classes()).toContain('toast-info')
    expect(toasts[1].classes()).toContain('toast-success')
    expect(toasts[2].classes()).toContain('toast-warning')
    expect(toasts[3].classes()).toContain('toast-error')
  })

  it('sets role="alert" on error toasts and role="status" on others', async () => {
    store.addToast('info', 'info', 0)
    store.addToast('err', 'error', 0)

    const wrapper = mountObserver()
    await nextTick()

    const toasts = wrapper.findAll('.task-toast')
    expect(toasts[0].attributes('role')).toBe('status')
    expect(toasts[1].attributes('role')).toBe('alert')
  })

  it('renders the toast container with aria-live="polite"', () => {
    const wrapper = mountObserver()

    const toastArea = wrapper.find('.task-toasts')
    expect(toastArea.attributes('role')).toBe('status')
    expect(toastArea.attributes('aria-live')).toBe('polite')
  })

  // ---- Toast auto-dismiss ----

  it('auto-dismisses a toast after its duration elapses', async () => {
    store.addToast('will disappear', 'info', 1000)

    const wrapper = mountObserver()
    await nextTick()
    expect(wrapper.findAll('.task-toast')).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    await nextTick()

    expect(wrapper.findAll('.task-toast')).toHaveLength(0)
  })

  it('keeps a persistent toast (duration=0) visible', async () => {
    store.addToast('persistent', 'info', 0)

    const wrapper = mountObserver()
    await nextTick()

    vi.advanceTimersByTime(10000)
    await nextTick()

    expect(wrapper.findAll('.task-toast')).toHaveLength(1)
  })

  // ---- Task panel visibility ----

  it('does not render the task panel when there are no tasks', () => {
    const wrapper = mountObserver()

    expect(wrapper.find('.task-panel').exists()).toBe(false)
  })

  it('renders the task panel when tasks exist', async () => {
    store.createTask({ title: 'Test task' })

    const wrapper = mountObserver()
    await nextTick()

    expect(wrapper.find('.task-panel').exists()).toBe(true)
    expect(wrapper.find('.panel-header').exists()).toBe(true)
  })

  it('shows active task count in the header', async () => {
    store.createTask({ title: 'Task A' })
    store.createTask({ title: 'Task B' })

    const wrapper = mountObserver()
    await nextTick()

    expect(wrapper.find('.title').text()).toContain('2')
  })

  // ---- Task panel toggle ----

  it('starts collapsed (panel-content is hidden)', async () => {
    store.createTask({ title: 'Task' })

    const wrapper = mountObserver()
    await nextTick()

    // isExpanded defaults to false; v-show renders the element but with display:none
    const content = wrapper.find('.panel-content')
    expect(content.exists()).toBe(true)
    expect(content.attributes('style')).toContain('display: none')
  })

  it('expands panel content when header is clicked', async () => {
    store.createTask({ title: 'Task' })

    const wrapper = mountObserver()
    await nextTick()

    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const content = wrapper.find('.panel-content')
    expect(content.attributes('style')).not.toContain('display: none')
  })

  it('collapses panel content when header is clicked again', async () => {
    store.createTask({ title: 'Task' })

    const wrapper = mountObserver()
    await nextTick()

    // Expand
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()
    // Collapse
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const content = wrapper.find('.panel-content')
    expect(content.attributes('style')).toContain('display: none')
  })

  // ---- Task items ----

  it('renders task items with title and status text', async () => {
    store.createTask({ title: 'Writing chapter' })

    const wrapper = mountObserver()
    await nextTick()

    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const item = wrapper.find('.task-item')
    expect(item.exists()).toBe(true)
    expect(item.find('.task-title').text()).toBe('Writing chapter')
    expect(item.find('.task-status-text').text()).toBe('等待中')
  })

  it('renders task description when provided', async () => {
    store.createTask({ title: 'Task', description: 'Doing important work' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-item-desc').text()).toBe('Doing important work')
  })

  it('renders progress bar for running tasks', async () => {
    const task = store.createTask({ title: 'Task' })
    store.updateTask(task.id, { status: 'running', progress: 42 })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const progress = wrapper.find('.el-progress-stub')
    expect(progress.exists()).toBe(true)
    expect(progress.attributes('data-percentage')).toBe('42')
  })

  it('does not render progress bar for completed tasks', async () => {
    const task = store.createTask({ title: 'Task' })
    store.completeTask(task.id)

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.el-progress-stub').exists()).toBe(false)
  })

  it('renders cancel button for cancellable running tasks', async () => {
    const task = store.createTask({ title: 'Cancellable', cancellable: true })
    store.updateTask(task.id, { status: 'running' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const cancelBtn = wrapper.find('.task-item-actions .el-button-stub')
    expect(cancelBtn.exists()).toBe(true)
    expect(cancelBtn.text()).toBe('取消')
  })

  it('does not render cancel button for non-cancellable tasks', async () => {
    const task = store.createTask({ title: 'Not cancellable', cancellable: false })
    store.updateTask(task.id, { status: 'running' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-item-actions').exists()).toBe(false)
  })

  it('calls manager.cancelTask when cancel button is clicked', async () => {
    const task = store.createTask({ title: 'Cancellable', cancellable: true })
    store.updateTask(task.id, { status: 'running' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const cancelSpy = vi.spyOn(store, 'cancelTask')
    await wrapper.find('.task-item-actions .el-button-stub').trigger('click')

    expect(cancelSpy).toHaveBeenCalledWith(task.id)
  })

  // ---- Clear completed tasks ----

  it('shows clear button when there are completed tasks', async () => {
    const task = store.createTask({ title: 'Done task' })
    store.completeTask(task.id)

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.panel-footer').exists()).toBe(true)
    expect(wrapper.find('.panel-footer .el-button-stub').text()).toContain('清除已完成')
  })

  it('does not show clear button when there are no completed tasks', async () => {
    store.createTask({ title: 'Pending task' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.panel-footer').exists()).toBe(false)
  })

  it('calls clearCompletedTasks when clear button is clicked', async () => {
    const task = store.createTask({ title: 'Done task' })
    store.completeTask(task.id)

    // Spy before mount so the template binding captures the wrapped function
    const clearSpy = vi.spyOn(store, 'clearCompletedTasks')

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    await wrapper.find('.panel-footer .el-button-stub').trigger('click')

    expect(clearSpy).toHaveBeenCalled()
  })

  // ---- Task title status CSS classes ----

  it('applies error class to task title when task has error status', async () => {
    const task = store.createTask({ title: 'Failed task' })
    store.failTask(task.id, 'Something broke')

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-title').classes()).toContain('error')
    expect(wrapper.find('.task-status-text').text()).toBe('失败')
  })

  it('applies success class to task title when task completed', async () => {
    const task = store.createTask({ title: 'Done task' })
    store.completeTask(task.id)

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-title').classes()).toContain('success')
    expect(wrapper.find('.task-status-text').text()).toBe('完成')
  })

  it('applies cancelled class to task title when task is cancelled', async () => {
    const task = store.createTask({ title: 'Cancelled task', cancellable: true })
    store.cancelTask(task.id)

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-title').classes()).toContain('cancelled')
    expect(wrapper.find('.task-status-text').text()).toBe('已取消')
  })

  // ---- Description visibility ----

  it('does not render task description when not provided', async () => {
    store.createTask({ title: 'No description task' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-item-desc').exists()).toBe(false)
  })

  // ---- Progress bar for pending tasks ----

  it('renders progress bar for pending tasks', async () => {
    store.createTask({ title: 'Pending task' })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const progress = wrapper.find('.el-progress-stub')
    expect(progress.exists()).toBe(true)
    expect(progress.attributes('data-percentage')).toBe('0')
  })

  // ---- Running task status text ----

  it('shows running status text for running tasks', async () => {
    const task = store.createTask({ title: 'Active task' })
    store.updateTask(task.id, { status: 'running', progress: 50 })

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.task-status-text').text()).toBe('进行中')
  })

  // ---- Multiple tasks with mixed statuses ----

  it('renders multiple tasks with different statuses simultaneously', async () => {
    const t1 = store.createTask({ title: 'Pending' })
    const t2 = store.createTask({ title: 'Running' })
    store.updateTask(t2.id, { status: 'running', progress: 30 })
    const t3 = store.createTask({ title: 'Completed' })
    store.completeTask(t3.id)
    const t4 = store.createTask({ title: 'Failed' })
    store.failTask(t4.id, 'err')

    const wrapper = mountObserver()
    await nextTick()
    await wrapper.find('.panel-header').trigger('click')
    await nextTick()

    const items = wrapper.findAll('.task-item')
    expect(items).toHaveLength(4)

    // t4 (failed) was unshifted last, so it appears first
    expect(items[0].find('.task-title').classes()).toContain('error')
    expect(items[1].find('.task-title').classes()).toContain('success')
    expect(items[2].find('.task-title').text()).toBe('Running')
    expect(items[3].find('.task-title').text()).toBe('Pending')
  })

  // ---- Panel header aria ----

  it('renders task panel with correct aria attributes', async () => {
    store.createTask({ title: 'Task' })

    const wrapper = mountObserver()
    await nextTick()

    const panel = wrapper.find('.task-panel')
    expect(panel.attributes('role')).toBe('region')
    expect(panel.attributes('aria-label')).toBe('任务队列')
  })
})
