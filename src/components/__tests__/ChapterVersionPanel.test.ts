import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { ChapterSnapshot } from '@/types/chapter-version'

// All mocks MUST use vi.hoisted() to avoid Vitest hoisting issues
const {
  mockListSnapshots,
  mockGetSnapshot,
  mockDeleteSnapshot,
  mockElMessageSuccess,
  mockElMessageError,
  mockMessageBoxConfirm,
} = vi.hoisted(() => ({
  mockListSnapshots: vi.fn(),
  mockGetSnapshot: vi.fn(),
  mockDeleteSnapshot: vi.fn(),
  mockElMessageSuccess: vi.fn(),
  mockElMessageError: vi.fn(),
  mockMessageBoxConfirm: vi.fn(),
}))

vi.mock('@/utils/chapterVersioning', () => ({
  listSnapshots: mockListSnapshots,
  getSnapshot: mockGetSnapshot,
  deleteSnapshot: mockDeleteSnapshot,
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mockElMessageSuccess,
    error: mockElMessageError,
  },
  ElMessageBox: {
    confirm: mockMessageBoxConfirm,
  },
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import ChapterVersionPanel from '@/components/ChapterVersionPanel.vue'

// --- Stubs ---
const elDrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size'],
  emits: ['update:modelValue'],
  template: `
    <div v-if="modelValue" class="el-drawer-stub" data-testid="drawer">
      <div class="el-drawer__header">{{ title }}</div>
      <div class="el-drawer__body"><slot /></div>
      <div class="el-drawer__footer"><slot name="footer" /></div>
    </div>
  `,
}

const elButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'text', 'disabled'],
  emits: ['click'],
  template: '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
}

const elTagStub = {
  name: 'ElTag',
  props: ['type', 'size'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

function makeSnapshot(overrides: Partial<ChapterSnapshot> = {}): ChapterSnapshot {
  return {
    id: 'snap-1',
    chapterId: 'ch-1',
    projectId: 'proj-1',
    title: '第一章',
    content: '快照内容',
    wordCount: 500,
    createdAt: Date.now(),
    source: 'auto',
    ...overrides,
  }
}

/** Mount with modelValue=false so we can toggle to true to trigger watch(visible). */
function mountPanel(snapshots: ChapterSnapshot[], opts: { projectId?: string; chapterId?: string } = {}) {
  const { projectId = 'proj-1', chapterId = 'ch-1' } = opts
  mockListSnapshots.mockResolvedValue(snapshots)

  return mount(ChapterVersionPanel, {
    props: { projectId, chapterId, modelValue: false },
    global: {
      stubs: { ElDrawer: elDrawerStub, ElButton: elButtonStub, ElTag: elTagStub },
    },
  })
}

/** Open drawer (false -> true) and flush async loadSnapshots. */
async function openAndFlush(wrapper: ReturnType<typeof mountPanel>) {
  await wrapper.setProps({ modelValue: true })
  await nextTick()
  await new Promise(r => setTimeout(r, 0))
  await nextTick()
}

describe('ChapterVersionPanel', () => {
  beforeEach(() => {
    createTestPinia()
    vi.clearAllMocks()
    mockListSnapshots.mockResolvedValue([])
    mockGetSnapshot.mockResolvedValue(undefined)
    mockDeleteSnapshot.mockResolvedValue(undefined)
    mockMessageBoxConfirm.mockResolvedValue('confirm')
  })

  // --- Rendering ---

  it('renders the drawer when opened', async () => {
    const wrapper = mountPanel([])
    await openAndFlush(wrapper)

    expect(wrapper.find('[data-testid="drawer"]').exists()).toBe(true)
  })

  it('does not render drawer when initially closed', () => {
    const wrapper = mountPanel([])

    expect(wrapper.find('[data-testid="drawer"]').exists()).toBe(false)
  })

  it('displays drawer title "章节版本历史"', async () => {
    const wrapper = mountPanel([])
    await openAndFlush(wrapper)

    expect(wrapper.find('.el-drawer__header').text()).toBe('章节版本历史')
  })

  // --- Loading & empty states ---

  it('shows empty state when no snapshots exist', async () => {
    const wrapper = mountPanel([])
    await openAndFlush(wrapper)

    expect(wrapper.find('.empty-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无历史版本')
  })

  // --- Snapshot list ---

  it('renders snapshot items when snapshots are loaded', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', source: 'auto' }),
      makeSnapshot({ id: 's2', source: 'manual' }),
    ])
    await openAndFlush(wrapper)

    expect(wrapper.findAll('.version-item')).toHaveLength(2)
  })

  it('displays word count and title in version meta', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', title: '第三章', wordCount: 1200 }),
    ])
    await openAndFlush(wrapper)

    const meta = wrapper.find('.version-meta')
    expect(meta.text()).toContain('1200')
    expect(meta.text()).toContain('第三章')
  })

  it('displays "手动" tag for manual source snapshots', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', source: 'manual' }),
    ])
    await openAndFlush(wrapper)

    const tag = wrapper.find('.el-tag-stub')
    expect(tag.text()).toBe('手动')
  })

  it('displays "自动" tag for auto source snapshots', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', source: 'auto' }),
    ])
    await openAndFlush(wrapper)

    const tag = wrapper.find('.el-tag-stub')
    expect(tag.text()).toBe('自动')
  })

  // --- Selection ---

  it('applies active class to selected snapshot', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1' }),
      makeSnapshot({ id: 's2' }),
    ])
    await openAndFlush(wrapper)

    const items = wrapper.findAll('.version-item')
    await items[1].trigger('click')
    await nextTick()

    expect(items[1].classes()).toContain('active')
    expect(items[0].classes()).not.toContain('active')
  })

  it('enables restore button when a snapshot is selected', async () => {
    const wrapper = mountPanel([makeSnapshot({ id: 's1' })])
    await openAndFlush(wrapper)

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const footerButtons = wrapper.findAll('.el-button-stub')
    const restoreBtn = footerButtons.find(b => b.text() === '恢复此版本')
    expect(restoreBtn).toBeDefined()
    expect(restoreBtn!.attributes('disabled')).toBeFalsy()
  })

  // --- Restore ---

  it('calls getSnapshot and emits restore after user confirms', async () => {
    const snap = makeSnapshot({ id: 's1', content: '恢复内容', title: '恢复标题' })
    mockGetSnapshot.mockResolvedValue(snap)

    const wrapper = mountPanel([snap])
    await openAndFlush(wrapper)

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const footerButtons = wrapper.findAll('.el-button-stub')
    const restoreBtn = footerButtons.find(b => b.text() === '恢复此版本')
    await restoreBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockGetSnapshot).toHaveBeenCalledWith('s1', 'proj-1', 'ch-1')
    expect(mockMessageBoxConfirm).toHaveBeenCalled()
    expect(wrapper.emitted('restore')).toBeTruthy()
    expect(wrapper.emitted('restore')![0]).toEqual(['恢复内容', '恢复标题'])
    expect(mockElMessageSuccess).toHaveBeenCalledWith('已恢复到选定版本')
  })

  it('does not emit restore when user cancels the confirm dialog', async () => {
    const snap = makeSnapshot({ id: 's1' })
    mockGetSnapshot.mockResolvedValue(snap)
    mockMessageBoxConfirm.mockRejectedValue(new Error('cancel'))

    const wrapper = mountPanel([snap])
    await openAndFlush(wrapper)

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const footerButtons = wrapper.findAll('.el-button-stub')
    const restoreBtn = footerButtons.find(b => b.text() === '恢复此版本')
    await restoreBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.emitted('restore')).toBeFalsy()
  })

  // --- Delete ---

  it('deletes snapshot after user confirms and reloads list', async () => {
    const snapshots = [
      makeSnapshot({ id: 's1' }),
      makeSnapshot({ id: 's2' }),
    ]
    mockListSnapshots.mockResolvedValueOnce(snapshots)
    mockListSnapshots.mockResolvedValueOnce([snapshots[1]])

    const wrapper = mount(ChapterVersionPanel, {
      props: { projectId: 'proj-1', chapterId: 'ch-1', modelValue: false },
      global: {
        stubs: { ElDrawer: elDrawerStub, ElButton: elButtonStub, ElTag: elTagStub },
      },
    })
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    const deleteButtons = wrapper.findAll('.el-button-stub').filter(b => b.text() === '删除')
    expect(deleteButtons).toHaveLength(2)
    await deleteButtons[0].trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockMessageBoxConfirm).toHaveBeenCalled()
    expect(mockDeleteSnapshot).toHaveBeenCalledWith('s1', 'proj-1', 'ch-1')
    expect(mockListSnapshots).toHaveBeenCalledTimes(2)
    expect(mockElMessageSuccess).toHaveBeenCalledWith('历史版本已删除')
  })

  it('does not delete snapshot when user cancels confirm', async () => {
    const wrapper = mountPanel([makeSnapshot({ id: 's1' })])
    await openAndFlush(wrapper)
    mockMessageBoxConfirm.mockRejectedValueOnce(new Error('cancel'))

    const deleteBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '删除')
    await deleteBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockDeleteSnapshot).not.toHaveBeenCalled()
  })

  it('shows error message when deleteSnapshot fails', async () => {
    const wrapper = mountPanel([makeSnapshot({ id: 's1' })])
    await openAndFlush(wrapper)
    mockDeleteSnapshot.mockRejectedValueOnce(new Error('DB error'))

    const deleteBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '删除')
    await deleteBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockElMessageError).toHaveBeenCalledWith(expect.stringContaining('删除失败'))
  })

  it('clears selectedId when deleting the currently selected snapshot', async () => {
    const snap = makeSnapshot({ id: 's1' })
    mockListSnapshots.mockResolvedValueOnce([snap])
    mockListSnapshots.mockResolvedValueOnce([])

    const wrapper = mount(ChapterVersionPanel, {
      props: { projectId: 'proj-1', chapterId: 'ch-1', modelValue: false },
      global: {
        stubs: { ElDrawer: elDrawerStub, ElButton: elButtonStub, ElTag: elTagStub },
      },
    })
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const deleteBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '删除')
    await deleteBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    const restoreBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '恢复此版本')
    // disabled="" is an empty string in HTML attribute; check the DOM attribute directly
    expect(restoreBtn!.element.hasAttribute('disabled')).toBe(true)
  })

  // --- Watcher triggers ---

  it('calls listSnapshots with correct chapterId and projectId', async () => {
    const wrapper = mountPanel([], { projectId: 'proj-abc', chapterId: 'ch-xyz' })
    await openAndFlush(wrapper)

    expect(mockListSnapshots).toHaveBeenCalledWith('ch-xyz', 'proj-abc')
  })

  // --- Snapshot comparison / selection workflow ---

  it('switches active selection when clicking a different snapshot', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1' }),
      makeSnapshot({ id: 's2' }),
      makeSnapshot({ id: 's3' }),
    ])
    await openAndFlush(wrapper)

    const items = wrapper.findAll('.version-item')

    // Select first
    await items[0].trigger('click')
    await nextTick()
    expect(items[0].classes()).toContain('active')
    expect(items[1].classes()).not.toContain('active')

    // Switch to third
    await items[2].trigger('click')
    await nextTick()
    expect(items[0].classes()).not.toContain('active')
    expect(items[2].classes()).toContain('active')
  })

  it('renders multiple snapshots with distinct metadata for comparison', async () => {
    const now = Date.now()
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', title: '第一幕', wordCount: 800, createdAt: now - 2000 }),
      makeSnapshot({ id: 's2', title: '第二幕', wordCount: 1500, createdAt: now - 1000 }),
    ])
    await openAndFlush(wrapper)

    const metas = wrapper.findAll('.version-meta')
    expect(metas[0].text()).toContain('800')
    expect(metas[0].text()).toContain('第一幕')
    expect(metas[1].text()).toContain('1500')
    expect(metas[1].text()).toContain('第二幕')
  })

  it('renders formatted timestamps for each snapshot', async () => {
    const fixedTime = new Date(2025, 0, 15, 10, 30).getTime() // Jan 15 10:30
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1', createdAt: fixedTime }),
    ])
    await openAndFlush(wrapper)

    const timeEl = wrapper.find('.version-time')
    expect(timeEl.text()).toContain('01-15')
    expect(timeEl.text()).toContain('10:30')
  })

  // --- Restore edge cases ---

  it('closes drawer after successful restore', async () => {
    const snap = makeSnapshot({ id: 's1', content: 'some content', title: 'title' })
    mockGetSnapshot.mockResolvedValue(snap)

    const wrapper = mountPanel([snap])
    await openAndFlush(wrapper)

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const restoreBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '恢复此版本')
    await restoreBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(wrapper.find('[data-testid="drawer"]').exists()).toBe(false)
  })

  it('does nothing when getSnapshot returns undefined', async () => {
    mockGetSnapshot.mockResolvedValue(undefined)

    const wrapper = mountPanel([makeSnapshot({ id: 's1' })])
    await openAndFlush(wrapper)

    await wrapper.find('.version-item').trigger('click')
    await nextTick()

    const restoreBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '恢复此版本')
    await restoreBtn!.trigger('click')
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockMessageBoxConfirm).not.toHaveBeenCalled()
    expect(wrapper.emitted('restore')).toBeFalsy()
  })

  // --- Close button ---

  it('closes drawer when close button is clicked', async () => {
    const wrapper = mountPanel([makeSnapshot({ id: 's1' })])
    await openAndFlush(wrapper)
    expect(wrapper.find('[data-testid="drawer"]').exists()).toBe(true)

    const closeBtn = wrapper.findAll('.el-button-stub').find(b => b.text() === '关闭')
    await closeBtn!.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="drawer"]').exists()).toBe(false)
  })

  // --- Reload on props change ---

  it('reloads snapshots when chapterId prop changes while drawer is open', async () => {
    const wrapper = mountPanel([
      makeSnapshot({ id: 's1' }),
    ], { projectId: 'proj-1', chapterId: 'ch-1' })
    await openAndFlush(wrapper)
    expect(wrapper.findAll('.version-item')).toHaveLength(1)

    const newSnap = makeSnapshot({ id: 's-new', title: '新章节' })
    mockListSnapshots.mockResolvedValueOnce([newSnap])
    await wrapper.setProps({ chapterId: 'ch-2' })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()

    expect(mockListSnapshots).toHaveBeenLastCalledWith('ch-2', 'proj-1')
    expect(wrapper.findAll('.version-item')).toHaveLength(1)
  })
})
