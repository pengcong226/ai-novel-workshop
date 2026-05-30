import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockEntity } from '@/test/mocks'
import type { Entity } from '@/types/sandbox'

// --- Mock stores before importing component ---
vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
  isOfficialAnthropicEndpoint: () => false,
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/stateDiff', () => ({
  captureSnapshot: vi.fn().mockReturnValue({ entities: [], stateEvents: [] }),
  replayReducer: vi.fn().mockReturnValue({}),
}))

vi.mock('@/utils/entityHelpers', () => ({
  buildNameToIdMapFromEntities: vi.fn().mockReturnValue({}),
  formatEntityLocation: vi.fn().mockReturnValue(''),
}))

vi.mock('@/utils/stateEventIndexes', () => ({
  buildStateEventIndexes: vi.fn().mockReturnValue(new Map()),
  sortStateEventsByChapter: vi.fn().mockImplementation((events) => [...events].sort((a, b) => a.chapterNumber - b.chapterNumber)),
}))

vi.mock('@/schemas/stateEventSchema', () => ({
  StateEventSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'mock-generated-id'),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// Stub Element Plus sub-components
const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'text', 'size'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
  emits: ['click'],
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder', 'clearable', 'size'],
  emits: ['update:modelValue', 'clear'],
  template: `
    <input
      class="el-input-stub"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `,
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['size', 'type'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const ElScrollbarStub = {
  name: 'ElScrollbar',
  template: '<div class="el-scrollbar-stub"><slot /></div>',
}

// Icon stubs
const PlusStub = { name: 'Plus', template: '<span />' }
const SearchStub = { name: 'Search', template: '<span />' }
const ArrowDownStub = { name: 'ArrowDown', template: '<span />' }

import EntityTree from '@/components/Sandbox/EntityTree.vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'

function mountTree() {
  return mount(EntityTree, {
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElInput: ElInputStub,
        ElIcon: ElIconStub,
        ElTag: ElTagStub,
        ElScrollbar: ElScrollbarStub,
        Plus: PlusStub,
        Search: SearchStub,
        ArrowDown: ArrowDownStub,
      },
    },
  })
}

function seedEntities(store: ReturnType<typeof useSandboxStore>, entities: Entity[]) {
  for (const e of entities) {
    store.entities = [...store.entities, e]
  }
}

describe('EntityTree', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
  })

  // --- Empty state ---

  it('shows empty message when no entities exist', () => {
    const wrapper = mountTree()

    expect(wrapper.find('.tree-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无实体')
  })

  it('shows create button in empty state', () => {
    const wrapper = mountTree()

    const buttons = wrapper.findAll('.el-button-stub')
    // One in header + one in empty state
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    expect(wrapper.text()).toContain('创建第一个实体')
  })

  // --- Entity rendering ---

  it('renders entity names in tree items', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
      createMockEntity({ id: 'e2', name: '李四', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(2)
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('李四')
  })

  // --- Grouping by type ---

  it('groups entities by type with correct labels', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'c1', name: '角色A', type: 'CHARACTER' }),
      createMockEntity({ id: 'l1', name: '地点A', type: 'LOCATION' }),
      createMockEntity({ id: 'f1', name: '势力A', type: 'FACTION' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const groups = wrapper.findAll('.tree-group')
    expect(groups).toHaveLength(3)

    const labels = wrapper.findAll('.group-label')
    const labelTexts = labels.map(l => l.text())
    expect(labelTexts).toContain('人物')
    expect(labelTexts).toContain('地点')
    expect(labelTexts).toContain('势力')
  })

  it('displays entity count per group', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'c1', name: '角色A', type: 'CHARACTER' }),
      createMockEntity({ id: 'c2', name: '角色B', type: 'CHARACTER' }),
      createMockEntity({ id: 'l1', name: '地点A', type: 'LOCATION' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const counts = wrapper.findAll('.group-count')
    expect(counts).toHaveLength(2)
    expect(counts[0].text()).toBe('2')
    expect(counts[1].text()).toBe('1')
  })

  // --- Filtering / Search ---

  it('filters entities by name when search query is entered', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '龙王', type: 'CHARACTER' }),
      createMockEntity({ id: 'e2', name: '凤凰', type: 'CHARACTER' }),
      createMockEntity({ id: 'e3', name: '龙太子', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    // Set search query via v-model binding
    const input = wrapper.find('.el-input-stub')
    await input.setValue('龙')
    await input.trigger('input')
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(2)
    expect(wrapper.text()).toContain('龙王')
    expect(wrapper.text()).toContain('龙太子')
    expect(wrapper.text()).not.toContain('凤凰')
  })

  it('filters entities by alias', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', aliases: ['小张'], type: 'CHARACTER' }),
      createMockEntity({ id: 'e2', name: '李四', aliases: [], type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const input = wrapper.find('.el-input-stub')
    await input.setValue('小张')
    await input.trigger('input')
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(wrapper.text()).toContain('张三')
  })

  it('shows no-match message when search has no results', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const input = wrapper.find('.el-input-stub')
    await input.setValue('不存在的名字')
    await input.trigger('input')
    await nextTick()

    expect(wrapper.find('.tree-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('未找到匹配实体')
  })

  // --- Entity selection ---

  it('emits select event when an entity is clicked', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    await wrapper.find('.tree-item').trigger('click')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['e1'])
  })

  it('applies active class to selected entity', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
      createMockEntity({ id: 'e2', name: '李四', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    // Click the first entity
    const items = wrapper.findAll('.tree-item')
    await items[0].trigger('click')
    await nextTick()

    expect(wrapper.findAll('.tree-item')[0].classes()).toContain('active')
    expect(wrapper.findAll('.tree-item')[1].classes()).not.toContain('active')
  })

  // --- Collapse / Expand groups ---

  it('toggles group collapse when group header is clicked', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    // Group starts expanded - items visible
    expect(wrapper.find('.group-items').isVisible()).toBe(true)

    // Click group header to collapse
    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    // Arrow should have collapsed class
    expect(wrapper.find('.group-arrow').classes()).toContain('collapsed')
  })

  // --- Importance tags ---

  it('shows critical tag for critical importance entities', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '主角', type: 'CHARACTER', importance: 'critical' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const tag = wrapper.find('.el-tag-stub')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('核心')
  })

  it('shows major tag for major importance entities', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '配角', type: 'CHARACTER', importance: 'major' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const tag = wrapper.find('.el-tag-stub')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('重要')
  })

  it('does not show tag for minor importance entities', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '路人', type: 'CHARACTER', importance: 'minor' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    expect(wrapper.find('.el-tag-stub').exists()).toBe(false)
  })

  // --- Archived entities are excluded ---

  it('excludes archived entities from the tree', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '活跃', type: 'CHARACTER', isArchived: false }),
      createMockEntity({ id: 'e2', name: '已归档', type: 'CHARACTER', isArchived: true }),
    ])

    const wrapper = mountTree()
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(wrapper.text()).toContain('活跃')
    expect(wrapper.text()).not.toContain('已归档')
  })

  // --- Keyboard navigation ---

  it('selects entity on Enter key', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    await wrapper.find('.tree-item').trigger('keydown.enter')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['e1'])
  })

  it('toggles group on Enter key at group header', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', type: 'CHARACTER' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    // Initially expanded
    expect(wrapper.find('.group-items').isVisible()).toBe(true)

    await wrapper.find('.group-header').trigger('keydown.enter')
    await nextTick()

    expect(wrapper.find('.group-arrow').classes()).toContain('collapsed')
  })

  // --- Entity creation ---

  it('calls addEntity and emits select when create button is clicked', async () => {
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-1' } as any

    const addEntitySpy = vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)

    const wrapper = mountTree()
    await nextTick()

    // Click the header create button (first .el-button-stub)
    const createBtn = wrapper.find('.tree-header .el-button-stub')
    await createBtn.trigger('click')
    await flushPromises()

    expect(addEntitySpy).toHaveBeenCalledOnce()
    const addedEntity = addEntitySpy.mock.calls[0][0]
    expect(addedEntity.type).toBe('CHARACTER')
    expect(addedEntity.name).toBe('新角色')
    expect(addedEntity.id).toBe('mock-generated-id')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['mock-generated-id'])
  })

  // --- ARIA roles ---

  it('has correct ARIA roles for navigation and groups', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'c1', name: '角色', type: 'CHARACTER' }),
      createMockEntity({ id: 'l1', name: '地点', type: 'LOCATION' }),
    ])

    const wrapper = mountTree()
    await nextTick()

    expect(wrapper.find('[role="navigation"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="group"]')).toHaveLength(2)
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(2)
  })
})
