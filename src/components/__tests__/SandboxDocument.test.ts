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

import { replayReducer } from '@/utils/stateDiff'

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
const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p><slot /></div>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
  emits: ['click'],
}

import SandboxDocument from '@/components/Sandbox/SandboxDocument.vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'

function mountDocument() {
  return mount(SandboxDocument, {
    global: {
      stubs: {
        ElEmpty: ElEmptyStub,
        ElButton: ElButtonStub,
      },
    },
  })
}

function seedEntities(store: ReturnType<typeof useSandboxStore>, entities: Entity[]) {
  for (const e of entities) {
    store.entities = [...store.entities, e]
  }
}

describe('SandboxDocument', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    // Reset replayReducer to default empty return
    vi.mocked(replayReducer).mockReturnValue({})
  })

  // --- Empty state ---

  it('shows empty state when no entities exist', () => {
    const wrapper = mountDocument()

    expect(wrapper.find('.el-empty-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('请从左侧实体库选择一个条目查看详细档案')
  })

  it('shows create button in empty state', () => {
    const wrapper = mountDocument()

    expect(wrapper.find('.el-button-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('创建新实体')
  })

  // --- Entity display ---

  it('displays entity details when an entity exists', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', category: 'Protagonist', systemPrompt: '一个勇敢的战士' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.find('.entity-details').exists()).toBe(true)
    expect(wrapper.find('.el-empty-stub').exists()).toBe(false)
  })

  it('renders entity name in input field', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三丰' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    const nameInput = wrapper.find('#entity-name')
    expect(nameInput.exists()).toBe(true)
    expect((nameInput.element as HTMLInputElement).value).toBe('张三丰')
  })

  it('renders entity category in select field', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', category: 'Protagonist' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    const categorySelect = wrapper.find('#entity-category')
    expect(categorySelect.exists()).toBe(true)
    expect((categorySelect.element as HTMLSelectElement).value).toBe('Protagonist')
  })

  it('renders entity system prompt in textarea', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', systemPrompt: '一个勇敢的战士' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    const textarea = wrapper.find('#entity-system-prompt')
    expect(textarea.exists()).toBe(true)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('一个勇敢的战士')
  })

  // --- Save on blur ---

  it('calls updateEntity when name input loses focus', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    const nameInput = wrapper.find('#entity-name')
    await nameInput.setValue('张三丰')
    await nameInput.trigger('blur')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledOnce()
    expect(updateSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
      name: '张三丰',
    }))
  })

  it('calls updateEntity when category select changes', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', category: 'Protagonist' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    const categorySelect = wrapper.find('#entity-category')
    await categorySelect.setValue('Antagonist')
    await categorySelect.trigger('change')
    await flushPromises()

    // v-model + @change may fire multiple times; verify the last call
    expect(updateSpy).toHaveBeenCalled()
    const lastCall = updateSpy.mock.calls[updateSpy.mock.calls.length - 1]
    expect(lastCall[0]).toBe('e1')
    expect(lastCall[1]).toMatchObject({ category: 'Antagonist' })
  })

  it('calls updateEntity when system prompt textarea loses focus', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', systemPrompt: '' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    const textarea = wrapper.find('#entity-system-prompt')
    await textarea.setValue('新的系统提示')
    await textarea.trigger('blur')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledOnce()
    expect(updateSpy).toHaveBeenCalledWith('e1', expect.objectContaining({
      systemPrompt: '新的系统提示',
    }))
  })

  // --- Dynamic state section ---

  it('renders dynamic state section title', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.text()).toContain('动态状态快照')
    expect(wrapper.text()).toContain('StateEvent 实时推演')
  })

  it('shows empty relations message when no state relations', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.text()).toContain('暂无状态关联')
  })

  it('renders entity relations when resolved state has them', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
      createMockEntity({ id: 'e2', name: '李四' }),
    ])

    // Mock replayReducer to return resolved state with relations
    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [{ targetId: 'e2', targetName: '李四', type: 'friend', attitude: 'warm' }],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const relTag = wrapper.find('.rel-tag')
    expect(relTag.exists()).toBe(true)
    expect(relTag.text()).toContain('李四')
    expect(relTag.text()).toContain('friend')
  })

  it('renders location when resolved state has coordinates', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: '100,200',
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const locTag = wrapper.find('.loc-tag')
    expect(locTag.exists()).toBe(true)
    expect(locTag.text()).toContain('100')
    expect(locTag.text()).toContain('200')
  })

  it('renders dynamic properties grid', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: { level: '30', status: 'active' },
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const props = wrapper.findAll('.prop-item')
    expect(props).toHaveLength(2)
    expect(wrapper.text()).toContain('level')
    expect(wrapper.text()).toContain('30')
    expect(wrapper.text()).toContain('status')
    expect(wrapper.text()).toContain('active')
  })

  // --- Entity name resolution ---

  it('resolves entity ID to name in relation tags', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
      createMockEntity({ id: 'e2', name: '李四' }),
      createMockEntity({ id: 'e3', name: '王五' }),
    ])

    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [
          { targetId: 'e2', targetName: '李四', type: 'friend' },
          { targetId: 'e3', targetName: '王五', type: 'rival' },
        ],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const relTags = wrapper.findAll('.rel-tag')
    expect(relTags).toHaveLength(2)
    expect(relTags[0].text()).toContain('李四')
    expect(relTags[1].text()).toContain('王五')
  })

  // --- Create entity from empty state ---

  it('creates new entity when create button is clicked in empty state', async () => {
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-1' } as any

    const addEntitySpy = vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(addEntitySpy).toHaveBeenCalledOnce()
    const addedEntity = addEntitySpy.mock.calls[0][0]
    expect(addedEntity.type).toBe('CHARACTER')
    expect(addedEntity.name).toBe('新角色')
    expect(addedEntity.projectId).toBe('proj-1')
  })

  // --- Basic field group structure ---

  it('renders basic archive field group title', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.text()).toContain('基础档案')
    expect(wrapper.text()).toContain('系统约束设定')
  })
})
