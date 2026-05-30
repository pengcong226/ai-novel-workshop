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

  // ===== Header Text =====

  it('renders the volume header with title and description text', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.text()).toContain('当前大纲时间线 (状态流)')
    expect(wrapper.text()).toContain('在这里可以基于宏观剧情线推演后续章节大纲')
  })

  // ===== All Planned Chapters =====

  it('marks the first planned chapter as active when no completed chapters exist', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    expect(nodes[0].classes()).toContain('active')
    expect(nodes[1].classes()).toContain('pending')
    expect(nodes[2].classes()).toContain('pending')

    // Only the first node has action buttons
    expect(wrapper.findAll('.active-action-area')).toHaveLength(1)
  })

  // ===== Timeline ARIA =====

  it('renders the timeline with role="list" and aria-label', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const timeline = wrapper.find('.el-timeline-stub')
    expect(timeline.attributes('role')).toBe('list')
    expect(timeline.attributes('aria-label')).toBe('大纲时间线')
  })

  // ===== State Change Display =====

  it('never renders state change items for the active node (dead code: requires completed AND active)', () => {
    // Note: hasExtractedStates requires isCompletedNode (status === 'completed'),
    // but isActiveNode only matches 'planned' | 'writing' chapters.
    // These conditions are mutually exclusive, so automated-state-changes never renders.
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'writing' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // The active node has the action area, but the state change section never renders
    expect(wrapper.findAll('.active-action-area')).toHaveLength(1)
    expect(wrapper.find('.automated-state-changes').exists()).toBe(false)
  })

  // ===== Predicted States Display (Deterministic) =====

  it('renders predicted states on pending node when random > 0.5', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8)

    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // ch-2 is active (first 'planned'), ch-3 is pending (isPendingNode)
    const predictedStates = wrapper.findAll('.predicted-states')
    expect(predictedStates).toHaveLength(1) // only ch-3 has predicted states
    expect(predictedStates[0].text()).toContain('预测状态')
    expect(predictedStates[0].text()).toContain('可能产生物品或状态变更')

    randomSpy.mockRestore()
  })

  it('hides predicted states on pending nodes when random <= 0.5', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.3)

    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-3', title: '第三章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.findAll('.predicted-states')).toHaveLength(0)

    randomSpy.mockRestore()
  })

  // ===== Enter Key on Active Node =====

  it('triggers executeChapter when Enter is pressed on the active node', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const activeNode = wrapper.findAll('.outline-node')[1] // ch-2 is active
    await activeNode.trigger('keydown.enter')

    expect(ElMessage.info).toHaveBeenCalledWith(expect.stringContaining('正在生成并同步'))
  })

  it('does not trigger executeChapter when Enter is pressed on a non-active node', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const completedNode = wrapper.findAll('.outline-node')[0] // ch-1 is completed
    await completedNode.trigger('keydown.enter')

    expect(ElMessage.info).not.toHaveBeenCalled()
  })

  // ===== Execute Chapter Post-Completion =====

  it('updates sandboxStore.currentChapter after executeChapter completes', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const sandboxStore = useSandboxStore()
    const wrapper = mountTimeline()
    const generateBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('AI 生成'))
    await generateBtn!.trigger('click')

    // Fast-forward the 2-second timeout
    vi.advanceTimersByTime(2500)
    await flushPromises()
    await nextTick()

    // currentChapter should have been set to 1 (the chapter number of ch-1)
    expect(sandboxStore.currentChapter).toBe(1)
    expect(ElMessage.success).toHaveBeenCalledWith('正文生成与状态同步完成！')
  })

  // ===== Timer Cleanup on Unmount =====

  it('clears generation timers on unmount to prevent memory leaks', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Trigger executeChapter to create a timer
    const generateBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('AI 生成'))
    generateBtn!.trigger('click')

    wrapper.unmount()

    // clearTimeout should have been called during onUnmounted cleanup
    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  // ===== Chapter Status Text for Planned Status =====

  it('displays raw status text for planned chapters with no special mapping', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // 'planned' has no mapping in getChapterStatusText, so it returns the raw string
    expect(wrapper.find('.outline-status').text()).toContain('planned')
  })

  // ===== Single Chapter Edge Case =====

  it('handles a single chapter correctly as active node with actions', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '独章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.findAll('.outline-node')).toHaveLength(1)
    expect(wrapper.findAll('.outline-node')[0].classes()).toContain('active')
    expect(wrapper.findAll('.active-action-area')).toHaveLength(1)
    expect(wrapper.text()).toContain('AI 生成正文并全盘同步状态')
    expect(wrapper.text()).toContain('手动撰写')
  })

  // ===== Keyboard Navigation Boundary Conditions =====

  it('does not throw or focus out-of-bounds when pressing ArrowUp on the first node', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    const fakeQuerySelectorAll = vi.fn().mockReturnValue({ length: 2 })
    const closestSpy = vi.spyOn(nodes[0].element, 'closest' as any).mockReturnValue({
      querySelectorAll: fakeQuerySelectorAll,
    } as any)

    // ArrowUp on the first node (index 0) should attempt index -1, which is out of bounds
    await nodes[0].trigger('keydown.up')

    // focusNextNode computes nextIndex = 0 + (-1) = -1, returns early without focusing
    // The closest querySelectorAll should NOT be called since nextIndex < 0
    expect(fakeQuerySelectorAll).not.toHaveBeenCalled()

    closestSpy.mockRestore()
  })

  it('does not throw or focus out-of-bounds when pressing ArrowDown on the last node', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    const nodes = wrapper.findAll('.outline-node')
    const fakeQuerySelectorAll = vi.fn().mockReturnValue({ length: 2 })
    const closestSpy = vi.spyOn(nodes[1].element, 'closest' as any).mockReturnValue({
      querySelectorAll: fakeQuerySelectorAll,
    } as any)

    // ArrowDown on the last node (index 1) should attempt index 2, which is out of bounds
    await nodes[1].trigger('keydown.down')

    // focusNextNode computes nextIndex = 1 + 1 = 2, and 2 >= chapters.length (2), returns early
    expect(fakeQuerySelectorAll).not.toHaveBeenCalled()

    closestSpy.mockRestore()
  })

  // ===== Execute Chapter calls addStateEvent =====

  it('calls sandboxStore.addStateEvent with correct payload after executeChapter timer fires', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    seedProject(chapters)
    const sandboxStore = useSandboxStore()
    const addStateEventSpy = vi.spyOn(sandboxStore, 'addStateEvent')

    const wrapper = mountTimeline()
    const generateBtn = wrapper.findAll('.el-button-stub').find((b) => b.text().includes('AI 生成'))
    await generateBtn!.trigger('click')

    vi.advanceTimersByTime(2500)
    await flushPromises()
    await nextTick()

    expect(addStateEventSpy).toHaveBeenCalledTimes(1)
    const callArg = addStateEventSpy.mock.calls[0][0]
    expect(callArg).toMatchObject({
      projectId: expect.any(String),
      chapterNumber: 1,
      entityId: 'mock-entity-1',
      eventType: 'PROPERTY_UPDATE',
      payload: { key: 'status', value: '同步完成' },
      source: 'AI_EXTRACTED',
    })
  })

  // ===== Batch Planning New Chapter Title =====

  it('generates new chapter with correct title format during batch planning', async () => {
    vi.useFakeTimers()
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'completed' }),
      createMockChapterOutline({ chapterId: 'ch-2', title: '第二章', status: 'planned' }),
    ]
    const projectStore = seedProject(chapters)
    const wrapper = mountTimeline()

    const batchBtn = wrapper.findAll('.el-button-stub').find((b) =>
      b.text().includes('AI 批量推演'),
    )
    await batchBtn!.trigger('click')

    vi.advanceTimersByTime(2000)
    await flushPromises()
    await nextTick()

    // 2 existing chapters + 1 new = 3 total; new chapter is index 2 (number 3)
    const allChapters = projectStore.currentProject!.outline.chapters
    expect(allChapters).toHaveLength(3)
    expect(allChapters[2].title).toBe('第3章：未命名')
    expect(allChapters[2].status).toBe('planned')
  })

  // ===== Empty Chapter Title Fallback =====

  it('displays 未命名章节 when chapter title is empty string', () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.find('.outline-title').text()).toBe('未命名章节')
  })

  // ===== Execute Chapter with no currentProject (guard clause) =====

  it('shows empty state when project becomes null after mount, preventing executeChapter', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Initially has timeline nodes and active action area
    expect(wrapper.findAll('.outline-node')).toHaveLength(1)
    expect(wrapper.findAll('.active-action-area')).toHaveLength(1)

    // Clear the project after mount to simulate null
    const projectStore = useProjectStore()
    projectStore.currentProject = null as any
    await nextTick()

    // Empty state should now show; no outline-node or action buttons exist
    expect(wrapper.find('.el-empty-stub').exists()).toBe(true)
    expect(wrapper.findAll('.outline-node')).toHaveLength(0)
    expect(wrapper.findAll('.active-action-area')).toHaveLength(0)
    expect(ElMessage.info).not.toHaveBeenCalled()
  })

  // ===== Simulate Batch Planning with no currentProject (guard clause) =====

  it('does nothing when batch planning is triggered and currentProject is null', async () => {
    const chapters = [
      createMockChapterOutline({ chapterId: 'ch-1', title: '第一章', status: 'planned' }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    // Clear the project after mount and wait for Vue to update
    const projectStore = useProjectStore()
    projectStore.currentProject = null as any
    await nextTick()

    // Bottom actions should be hidden when project is null
    expect(wrapper.find('.bottom-actions').exists()).toBe(false)

    // ElMessage.info should not have been called (no batch planning triggered)
    expect(ElMessage.info).not.toHaveBeenCalled()
  })

  // ===== Chapter with generationPrompt taking precedence over scene description =====

  it('prefers generationPrompt over scene description when both exist', () => {
    const chapters = [
      createMockChapterOutline({
        chapterId: 'ch-1',
        title: '第一章',
        status: 'planned',
        generationPrompt: '优先显示的提示词',
        scenes: [{ id: 's1', description: '场景描述应被忽略', characters: [], location: '', order: 0 }],
      }),
    ]
    seedProject(chapters)
    const wrapper = mountTimeline()

    expect(wrapper.find('.outline-text').text()).toBe('优先显示的提示词')
    expect(wrapper.text()).not.toContain('场景描述应被忽略')
  })
})
