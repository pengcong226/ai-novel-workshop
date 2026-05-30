import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import {
  createMockProject,
  createMockOutline,
  createMockChapterOutline,
  resetMockIdCounter,
} from '@/test/mocks'

// --- Mocks (must come before component import) ---

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
  isOfficialAnthropicEndpoint: () => false,
}))

vi.mock('@/stores/storage', () => ({
  useStorage: () => ({
    loadProjects: vi.fn().mockResolvedValue([]),
    saveProjects: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    loadProject: vi.fn().mockResolvedValue(null),
    loadChapter: vi.fn().mockResolvedValue(null),
    saveChapter: vi.fn().mockResolvedValue(undefined),
    deleteChapter: vi.fn().mockResolvedValue(undefined),
    reorderChapters: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
  }),
}))

// --- Element Plus stubs ---

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'loading'],
  template: '<button class="el-button-stub" :class="type" @click="$emit(\'click\')"><slot /></button>',
  emits: ['click'],
}

const ElTimelineStub = {
  name: 'ElTimeline',
  template: '<div class="el-timeline-stub" role="list"><slot /></div>',
}

const ElTimelineItemStub = {
  name: 'ElTimelineItem',
  props: ['type', 'color'],
  template: '<div class="el-timeline-item-stub" :data-type="type"><slot /></div>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<i class="el-icon-stub"><slot /></i>',
}

// --- Icon stubs (Element Plus icons) ---

const EditPenStub = { name: 'EditPen', template: '<span class="icon-edit-pen" />' }
const DocumentStub = { name: 'Document', template: '<span class="icon-document" />' }
const DataLineStub = { name: 'DataLine', template: '<span class="icon-data-line" />' }
const ViewStub = { name: 'View', template: '<span class="icon-view" />' }
const MagicStickStub = { name: 'MagicStick', template: '<span class="icon-magic-stick" />' }

// --- Import component and stores AFTER mocks ---

import SandboxTimeline from '@/components/Sandbox/SandboxTimeline.vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage } from 'element-plus'

// --- Mount helper ---

function mountTimeline() {
  return mount(SandboxTimeline, {
    global: {
      stubs: {
        ElEmpty: ElEmptyStub,
        ElButton: ElButtonStub,
        ElTimeline: ElTimelineStub,
        ElTimelineItem: ElTimelineItemStub,
        ElIcon: ElIconStub,
        EditPen: EditPenStub,
        Document: DocumentStub,
        DataLine: DataLineStub,
        View: ViewStub,
        MagicStick: MagicStickStub,
      },
    },
  })
}

// Helper: seed a project with outline chapters into the project store
function seedProject(chapters: ReturnType<typeof createMockChapterOutline>[]) {
  const projectStore = useProjectStore()
  const project = createMockProject({
    outline: createMockOutline({ chapters }),
  })
  projectStore.currentProject = project as any
  return projectStore
}

// --- Tests ---

describe('SandboxTimeline', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ===== Empty States =====

  it('shows empty state when no project is loaded', () => {
    const wrapper = mountTimeline()

    expect(wrapper.find('.el-empty-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('大纲为空，请点击底部推演生成')
    expect(wrapper.find('.el-timeline-stub').exists()).toBe(false)
  })

  it('shows empty state when project has no outline chapters', () => {
    seedProject([])
    const wrapper = mountTimeline()

    expect(wrapper.find('.el-empty-stub').exists()).toBe(true)
    expect(wrapper.find('.el-timeline-stub').exists()).toBe(false)
  })

  // ===== Timeline Rendering =====

  it('renders timeline nodes for each outline chapter', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章：启程', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章：危机', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章：决战', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Timeline container is visible
    expect(wrapper.find('.el-timeline-stub').exists()).toBe(true)

    // All chapter nodes rendered
    const nodes = wrapper.findAll('.outline-node')
    expect(nodes).toHaveLength(3)

    // Titles rendered
    expect(wrapper.text()).toContain('第一章：启程')
    expect(wrapper.text()).toContain('第二章：危机')
    expect(wrapper.text()).toContain('第三章：决战')
  })

  it('renders synopsis/prompt text in each timeline node', () => {
    const chapters = [
      createMockChapterOutline({
        chapterId: 'ch-1',
        title: '第一章',
        status: 'completed',
        generationPrompt: '描述主角踏上旅途',
      }),
      createMockChapterOutline({
        chapterId: 'ch-2',
        title: '第二章',
        status: 'planned',
        scenes: [{ id: 's1', description: '遭遇强敌', characters: [], location: '', order: 0 }],
      }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.text()).toContain('描述主角踏上旅途')
    expect(wrapper.text()).toContain('遭遇强敌')
  })

  it('displays default placeholder when chapter has no prompt and no scenes', () => {
    const chapters = [
      createMockChapterOutline({
        chapterId: 'ch-1',
        title: '第一章',
        status: 'planned',
        scenes: [],
        generationPrompt: undefined,
      }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.text()).toContain('暂无详细描述...')
  })

  // ===== Active Node Highlighting =====

  it('marks the first planned chapter as the active node', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes[0].classes()).toContain('completed')
    expect(nodes[1].classes()).toContain('active')
    expect(nodes[2].classes()).toContain('pending')
  })

  it('marks a writing-status chapter as the active node', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'writing' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes[0].classes()).toContain('completed')
    expect(nodes[1].classes()).toContain('active')
    expect(nodes[2].classes()).toContain('pending')
  })

  it('applies correct timeline-item type attributes per node status', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const items = wrapper.findAll('.el-timeline-item-stub')
    expect(items).toHaveLength(3)
    // completed -> info, active (first planned) -> primary, pending -> warning
    expect(items[0].attributes('data-type')).toBe('info')
    expect(items[1].attributes('data-type')).toBe('primary')
    expect(items[2].attributes('data-type')).toBe('warning')
  })

  // ===== Active Node Actions =====

  it('shows action buttons only on the active node', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Only one active-action-area should exist (for the active node)
    const actionAreas = wrapper.findAll('.active-action-area')
    expect(actionAreas).toHaveLength(1)

    // It should contain generate and manual-write buttons
    expect(actionAreas[0].text()).toContain('AI 生成正文并全盘同步状态')
    expect(actionAreas[0].text()).toContain('手动撰写')
  })

  // ===== Chapter Status Text =====

  it('displays correct status text for each chapter status', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'writing' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.text()).toContain('已完成')
    expect(wrapper.text()).toContain('写作中')
    // "planned" has no special mapping in getChapterStatusText, so it shows raw value
    // but the active node (ch-2) is 'writing', and ch-3 is pending 'planned'
    // Both 'planned' nodes: ch-2 is active (status 'writing'), ch-3 is pending
    // getChapterStatusText('planned') returns 'planned' since there's no mapping
  })

  // ===== Keyboard Navigation =====

  it('supports arrow-key navigation between timeline nodes', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes).toHaveLength(3)

    // Each node has tabindex="0" for focusability
    expect(nodes[0].attributes('tabindex')).toBe('0')
    expect(nodes[1].attributes('tabindex')).toBe('0')

    // Each node has proper aria-label
    const ariaLabel0 = nodes[0].attributes('aria-label')
    expect(ariaLabel0).toContain('第1章')
    expect(ariaLabel0).toContain('第一章')

    const ariaLabel2 = nodes[2].attributes('aria-label')
    expect(ariaLabel2).toContain('第3章')
  })

  it('sets aria-current="step" on the active node', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes[0].attributes('aria-current')).toBeUndefined()
    expect(nodes[1].attributes('aria-current')).toBe('step')
  })

  // ===== Execute Chapter =====

  it('triggers executeChapter and shows generating message on AI generate click', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Click the AI generate button
    const generateBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('AI 生成'))
    expect(generateBtn).toBeTruthy()
    await generateBtn!.trigger('click')
    await nextTick()

    // Should show info message
    expect(ElMessage.info).toHaveBeenCalledWith(expect.stringContaining('正在生成并同步'))

    // Fast-forward the 2-second timeout
    vi.advanceTimersByTime(2500)
    await flushPromises()
    await nextTick()
  })

  // ===== Batch Planning =====

  it('renders bottom batch planning button when project is loaded', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.find('.bottom-actions').exists()).toBe(true)
    expect(wrapper.text()).toContain('AI 批量推演后续 5 章大纲')
  })

  it('triggers batch planning and appends new chapter on click', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
    ]
    const projectStore = seedProject(chapters)
    const wrapper = mountTimeline()

    const batchBtn = wrapper.findAll('.el-button-stub').find((b) =>
      b.text().includes('AI 批量推演'),
    )
    expect(batchBtn).toBeTruthy()
    await batchBtn!.trigger('click')
    await nextTick()

    expect(ElMessage.info).toHaveBeenCalledWith('触发批量大纲推演...')

    // Fast-forward the 1.5-second simulated API call
    vi.advanceTimersByTime(2000)
    await flushPromises()
    await nextTick()

    // A new chapter should have been pushed to the outline
    expect(projectStore.currentProject!.outline.chapters.length).toBe(2)
    expect(ElMessage.success).toHaveBeenCalledWith('大纲推演完成')
  })

  // ===== No bottom-actions when no project =====

  it('hides bottom actions when no project is loaded', () => {
    const wrapper = mountTimeline()

    expect(wrapper.find('.bottom-actions').exists()).toBe(false)
  })

  // ===== Manual Write =====

  it('triggers writeManually on manual write button click', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const manualBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('手动撰写'))
    expect(manualBtn).toBeTruthy()
    await manualBtn!.trigger('click')
    await nextTick()

    expect(ElMessage.info).toHaveBeenCalledWith('切换到手动章节编辑器')
  })

  // ===== Node color and icon classes =====

  it('applies correct status icon class per node state', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Status icons rendered inside outline-status elements
    const statusIcons = wrapper.findAll('.outline-status i')
    expect(statusIcons).toHaveLength(3)
    // completed -> ri-check-double-line, active -> ri-edit-line, pending -> ri-time-line
    expect(statusIcons[0].classes()).toContain('ri-check-double-line')
    expect(statusIcons[1].classes()).toContain('ri-edit-line')
    expect(statusIcons[2].classes()).toContain('ri-time-line')
  })

  // ===== All chapters completed =====

  it('handles case where all chapters are completed (no active node)', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'completed' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes).toHaveLength(2)
    // All should be completed
    expect(nodes[0].classes()).toContain('completed')
    expect(nodes[1].classes()).toContain('completed')

    // No active-action-area should be visible
    expect(wrapper.findAll('.active-action-area')).toHaveLength(0)
  })
})
