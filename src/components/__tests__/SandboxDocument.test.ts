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

const { sharedMockLogger } = vi.hoisted(() => ({
  sharedMockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => sharedMockLogger,
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

  // --- Additional tests ---

  it('saves all three fields (name, category, systemPrompt) on name blur', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '李四', category: 'Supporting', systemPrompt: '原始提示' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    // Change name, then trigger blur
    const nameInput = wrapper.find('#entity-name')
    await nameInput.setValue('李四改')
    await nameInput.trigger('blur')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledOnce()
    expect(updateSpy).toHaveBeenCalledWith('e1', {
      name: '李四改',
      category: 'Supporting',
      systemPrompt: '原始提示',
    })
  })

  it('renders all six category options in select', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三', category: 'Location' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    const select = wrapper.find('#entity-category')
    const options = select.findAll('option')
    expect(options).toHaveLength(6)
    expect(options[0].text()).toContain('Protagonist')
    expect(options[1].text()).toContain('Supporting')
    expect(options[2].text()).toContain('Antagonist')
    expect(options[3].text()).toContain('Faction')
    expect(options[4].text()).toContain('Location')
    expect(options[5].text()).toContain('Lore')
  })

  it('hides dynamic properties grid when resolved properties are empty', async () => {
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
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.find('.props-grid').exists()).toBe(false)
  })

  it('renders location coordinates in @坐标: [x, y] format', async () => {
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
        location: '42,88',
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const locTag = wrapper.find('.loc-tag')
    expect(locTag.exists()).toBe(true)
    expect(locTag.text()).toContain('@坐标:')
    expect(locTag.text()).toContain('42')
    expect(locTag.text()).toContain('88')
  })

  it('renders static section labels', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '测试角色' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.text()).toContain('实体名称')
    expect(wrapper.text()).toContain('分类类型')
    expect(wrapper.text()).toContain('核心设定')
    expect(wrapper.text()).toContain('实体羁绊')
  })

  it('shows empty tag when resolved state is null', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    // replayReducer returns empty object => no resolved state for e1
    vi.mocked(replayReducer).mockReturnValue({})

    const wrapper = mountDocument()
    await nextTick()

    expect(wrapper.text()).toContain('暂无状态关联')
    expect(wrapper.find('.rel-tag').exists()).toBe(false)
    expect(wrapper.find('.loc-tag').exists()).toBe(false)
  })

  it('uses entity ID as fallback when relation target ID is not in entity map', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    // Relation references an entity ID that doesn't exist in store
    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [{ targetId: 'unknown-id', targetName: '未知', type: 'ally' }],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    const relTag = wrapper.find('.rel-tag')
    expect(relTag.exists()).toBe(true)
    // Should fall back to showing the raw ID since unknown-id isn't in entityNameMap
    expect(relTag.text()).toContain('unknown-id')
    expect(relTag.text()).toContain('ally')
  })

  it('does not call addEntity when create is clicked without a current project', async () => {
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = null

    const addEntitySpy = vi.spyOn(store, 'addEntity')

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(addEntitySpy).not.toHaveBeenCalled()
  })

  it('creates entity with generated ID and expected defaults', async () => {
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-42' } as any

    const addEntitySpy = vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    const addedEntity = addEntitySpy.mock.calls[0][0]
    expect(addedEntity.id).toBe('mock-generated-id')
    expect(addedEntity.type).toBe('CHARACTER')
    expect(addedEntity.aliases).toEqual([])
    expect(addedEntity.importance).toBe('minor')
    expect(addedEntity.category).toBe('Supporting')
    expect(addedEntity.systemPrompt).toBe('')
    expect(addedEntity.isArchived).toBe(false)
  })

  // --- Error handling in saveEntity ---

  it('logs error and does not throw when updateEntity rejects', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const saveError = new Error('DB write failed')
    vi.spyOn(store, 'updateEntity').mockRejectedValue(saveError)

    const wrapper = mountDocument()
    await nextTick()

    const nameInput = wrapper.find('#entity-name')
    await nameInput.setValue('张三丰')
    await nameInput.trigger('blur')

    // saveEntity is async and catches errors internally; it should not throw
    await flushPromises()
    // If we reach here without an exception, the error was caught gracefully
    expect(wrapper.find('.entity-details').exists()).toBe(true)
    // Verify the error was logged
    expect(sharedMockLogger.error).toHaveBeenCalledWith('Failed to save entity:', saveError)
  })

  // --- generateId fallback ---

  it('falls back to Math.random when generateId returns falsy', async () => {
    const { generateId } = await import('@/utils/generateId')
    vi.mocked(generateId).mockReturnValueOnce('')

    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-1' } as any

    const addEntitySpy = vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    const addedEntity = addEntitySpy.mock.calls[0][0]
    // Should use Math.random().toString(36).slice(2) instead of 'mock-generated-id'
    expect(addedEntity.id).not.toBe('mock-generated-id')
    expect(addedEntity.id).toBe((0.123456).toString(36).slice(2))

    randomSpy.mockRestore()
  })

  // --- ElMessage.success on creation ---

  it('shows success message after creating a new entity', async () => {
    const { ElMessage } = await import('element-plus')
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-1' } as any

    vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('已创建新实体，请在左侧实体库中选择查看')
  })

  // --- activeEntityId picks first entity ---

  it('selects the first entity when multiple entities exist', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '角色甲', systemPrompt: '甲的设定' }),
      createMockEntity({ id: 'e2', name: '角色乙', systemPrompt: '乙的设定' }),
      createMockEntity({ id: 'e3', name: '角色丙', systemPrompt: '丙的设定' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    // Should display the first entity's data
    const nameInput = wrapper.find('#entity-name')
    expect((nameInput.element as HTMLInputElement).value).toBe('角色甲')

    const textarea = wrapper.find('#entity-system-prompt')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('甲的设定')
  })

  // --- Accessibility attributes ---

  it('has correct accessibility attributes on form elements', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    // Name input has aria-required
    const nameInput = wrapper.find('#entity-name')
    expect(nameInput.attributes('aria-required')).toBe('true')

    // State group has aria-live and aria-atomic
    const stateGroup = wrapper.find('.state-group')
    expect(stateGroup.attributes('aria-live')).toBe('polite')
    expect(stateGroup.attributes('aria-atomic')).toBe('true')
  })

  // --- System prompt textarea saves all three fields ---

  it('saves all three fields when system prompt textarea loses focus', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '王五', category: 'Antagonist', systemPrompt: '旧设定' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    const textarea = wrapper.find('#entity-system-prompt')
    await textarea.setValue('新设定内容')
    await textarea.trigger('blur')
    await flushPromises()

    expect(updateSpy).toHaveBeenCalledOnce()
    expect(updateSpy).toHaveBeenCalledWith('e1', {
      name: '王五',
      category: 'Antagonist',
      systemPrompt: '新设定内容',
    })
  })

  // --- Both relations and location rendered simultaneously ---

  it('renders both relation tags and location tag when both exist', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
      createMockEntity({ id: 'e2', name: '李四' }),
    ])

    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [{ targetId: 'e2', targetName: '李四', type: 'mentor' }],
        location: '50,75',
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    // Both relation and location tags should be present
    expect(wrapper.find('.rel-tag').exists()).toBe(true)
    expect(wrapper.find('.rel-tag').text()).toContain('李四')
    expect(wrapper.find('.rel-tag').text()).toContain('mentor')

    expect(wrapper.find('.loc-tag').exists()).toBe(true)
    expect(wrapper.find('.loc-tag').text()).toContain('@坐标:')
    expect(wrapper.find('.loc-tag').text()).toContain('50')
    expect(wrapper.find('.loc-tag').text()).toContain('75')

    // Empty tag should NOT be present
    expect(wrapper.find('.empty-tag').exists()).toBe(false)
  })

  // --- Textarea placeholder ---

  it('renders system prompt textarea with placeholder text', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
    ])

    const wrapper = mountDocument()
    await nextTick()

    const textarea = wrapper.find('#entity-system-prompt')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('placeholder')).toBe('请输入实体的背景、性格或世界观规则...')
  })

  // --- addEntity createdAt field ---

  it('sets createdAt to a numeric timestamp when creating a new entity', async () => {
    const store = useSandboxStore()
    const projectStore = useProjectStore()
    projectStore.currentProject = { id: 'proj-1' } as any

    const addEntitySpy = vi.spyOn(store, 'addEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    await wrapper.find('.el-button-stub').trigger('click')
    await flushPromises()

    const addedEntity = addEntitySpy.mock.calls[0][0]
    expect(typeof addedEntity.createdAt).toBe('number')
    // Timestamp should be within a reasonable range (within 5 seconds of now)
    const now = Date.now()
    expect(addedEntity.createdAt).toBeGreaterThanOrEqual(now - 5000)
    expect(addedEntity.createdAt).toBeLessThanOrEqual(now)
  })

  // --- Empty-tag hidden when only relations (no location) ---

  it('hides empty-tag when relations exist but location is null', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '张三' }),
      createMockEntity({ id: 'e2', name: '李四' }),
    ])

    vi.mocked(replayReducer).mockReturnValue({
      e1: {
        entityId: 'e1',
        entityName: '张三',
        entityType: 'CHARACTER',
        properties: {},
        relations: [{ targetId: 'e2', targetName: '李四', type: 'ally' }],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    const wrapper = mountDocument()
    await nextTick()

    // Relation tag should be shown
    expect(wrapper.find('.rel-tag').exists()).toBe(true)
    // Location tag should NOT be shown
    expect(wrapper.find('.loc-tag').exists()).toBe(false)
    // Empty tag should NOT be shown since relations exist
    expect(wrapper.find('.empty-tag').exists()).toBe(false)
  })

  // --- All three fields preserved on category change ---

  it('saves all three fields (name, category, systemPrompt) on category change', async () => {
    const store = useSandboxStore()
    seedEntities(store, [
      createMockEntity({ id: 'e1', name: '赵六', category: 'Protagonist', systemPrompt: '核心角色设定' }),
    ])

    const updateSpy = vi.spyOn(store, 'updateEntity').mockResolvedValue(undefined)

    const wrapper = mountDocument()
    await nextTick()

    const categorySelect = wrapper.find('#entity-category')
    await categorySelect.setValue('Antagonist')
    await categorySelect.trigger('change')
    await flushPromises()

    // Verify the last call preserves all three fields
    const lastCall = updateSpy.mock.calls[updateSpy.mock.calls.length - 1]
    expect(lastCall[0]).toBe('e1')
    expect(lastCall[1]).toMatchObject({
      name: '赵六',
      category: 'Antagonist',
      systemPrompt: '核心角色设定',
    })
  })
})
