import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockEntity, createMockStateEvent, createMockProject, createMockChapter } from '@/test/mocks'
import type { Entity, StateEvent } from '@/types/sandbox'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {} }),
}))

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
  buildStateEventIndexes: vi.fn(),
  sortStateEventsByChapter: vi.fn().mockImplementation((events: StateEvent[]) =>
    [...events].sort((a, b) => a.chapterNumber - b.chapterNumber)
  ),
}))

vi.mock('@/schemas/stateEventSchema', () => ({
  StateEventSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: {} }),
  },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-v4'),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm'),
  },
}))

vi.mock('@element-plus/icons-vue', () => ({
  Plus: { name: 'PlusIcon', template: '<span />' },
}))

// ---------------------------------------------------------------------------
// Element Plus stubs
// ---------------------------------------------------------------------------

const ElCardStub = {
  name: 'ElCard',
  props: ['shadow'],
  template: '<div class="el-card-stub"><slot /><template v-if="$slots.header"><slot name="header" /></template></div>',
}

const ElSelectStub = {
  name: 'ElSelect',
  props: ['modelValue', 'placeholder', 'filterable', 'style'],
  emits: ['update:modelValue'],
  template: '<select class="el-select-stub" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
}

const ElOptionStub = {
  name: 'ElOption',
  props: ['key', 'label', 'value'],
  template: '<option class="el-option-stub" :value="value"><slot>{{ label }}</slot></option>',
}

const ElTagStub = {
  name: 'ElTag',
  props: ['type', 'size', 'effect'],
  template: '<span class="el-tag-stub"><slot /></span>',
}

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'loading', 'text'],
  emits: ['click'],
  template: '<button class="el-button-stub" @click="$emit(\'click\')"><slot /></button>',
}

const ElEmptyStub = {
  name: 'ElEmpty',
  props: ['description'],
  template: '<div class="el-empty-stub"><p>{{ description }}</p><slot /></div>',
}

const ElTimelineStub = {
  name: 'ElTimeline',
  template: '<div class="el-timeline-stub"><slot /></div>',
}

const ElTimelineItemStub = {
  name: 'ElTimelineItem',
  props: ['timestamp', 'type', 'hollow', 'size', 'placement'],
  template: '<div class="el-timeline-item-stub"><span class="timestamp">{{ timestamp }}</span><slot /></div>',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue', 'title', 'width', 'closeOnClickModal'],
  emits: ['update:modelValue'],
  template: '<div class="el-dialog-stub" v-if="modelValue"><slot /><slot name="footer" /></div>',
}

const ElFormStub = {
  name: 'ElForm',
  props: ['model', 'labelWidth'],
  template: '<form class="el-form-stub"><slot /></form>',
}

const ElFormItemStub = {
  name: 'ElFormItem',
  props: ['label', 'required'],
  template: '<div class="el-form-item-stub"><label>{{ label }}</label><slot /></div>',
}

const ElInputStub = {
  name: 'ElInput',
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" :placeholder="placeholder" />',
}

const ElInputNumberStub = {
  name: 'ElInputNumber',
  props: ['modelValue', 'min', 'max'],
  emits: ['update:modelValue'],
  template: '<input class="el-input-number-stub" type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
}

const ElRowStub = {
  name: 'ElRow',
  props: ['gutter'],
  template: '<div class="el-row-stub"><slot /></div>',
}

const ElColStub = {
  name: 'ElCol',
  props: ['span'],
  template: '<div class="el-col-stub"><slot /></div>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

const stubs = {
  ElCard: ElCardStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElTag: ElTagStub,
  ElButton: ElButtonStub,
  ElEmpty: ElEmptyStub,
  ElTimeline: ElTimelineStub,
  ElTimelineItem: ElTimelineItemStub,
  ElDialog: ElDialogStub,
  ElForm: ElFormStub,
  ElFormItem: ElFormItemStub,
  ElInput: ElInputStub,
  ElInputNumber: ElInputNumberStub,
  ElRow: ElRowStub,
  ElCol: ElColStub,
  ElIcon: ElIconStub,
}

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import CharacterDevelopment from '@/components/CharacterDevelopment.vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'
import { buildStateEventIndexes } from '@/utils/stateEventIndexes'
import { replayReducer } from '@/utils/stateDiff'

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedEntities(store: ReturnType<typeof useSandboxStore>, entities: Entity[]) {
  store.entities = [...store.entities, ...entities]
}

function seedStateEvents(store: ReturnType<typeof useSandboxStore>, events: StateEvent[]) {
  store.stateEvents = [...store.stateEvents, ...events]
}

function mountComponent() {
  return mount(CharacterDevelopment, {
    global: { stubs },
  })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'test-project'

function makeCharacter(overrides: Partial<Entity> = {}): Entity {
  return createMockEntity({
    projectId: PROJECT_ID,
    type: 'CHARACTER',
    ...overrides,
  })
}

function makeStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return createMockStateEvent({
    projectId: PROJECT_ID,
    source: 'MANUAL',
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CharacterDevelopment', () => {
  let store: ReturnType<typeof useSandboxStore>

  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()

    // Default replayReducer mock: return an empty record
    vi.mocked(replayReducer).mockReturnValue({})

    // Setup project store with a current project
    const projectStore = useProjectStore()
    projectStore.currentProject = createMockProject({
      id: PROJECT_ID,
      chapters: [createMockChapter({ number: 1 }), createMockChapter({ number: 2 })],
    }) as any

    store = useSandboxStore()
  })

  // -----------------------------------------------------------------------
  // 1. Character list rendering
  // -----------------------------------------------------------------------

  it('renders character selector with entity options', async () => {
    const char1 = makeCharacter({ id: 'c1', name: '孙悟空' })
    const char2 = makeCharacter({ id: 'c2', name: '唐僧' })

    // Setup state event indexes so eventCount is populated
    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 1 }),
      makeStateEvent({ id: 'evt2', entityId: 'c1', chapterNumber: 2 }),
      makeStateEvent({ id: 'evt3', entityId: 'c2', chapterNumber: 1 }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([
        ['c1', [events[0], events[1]]],
        ['c2', [events[2]]],
      ]),
      countsByEntity: new Map([['c1', 2], ['c2', 1]]),
      chapterNumbersByEntity: new Map(),
      entityIdsByChapterNumber: new Map(),
    })

    seedEntities(store, [char1, char2])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()

    // The selector should contain both character options
    const options = wrapper.findAll('.el-option-stub')
    expect(options.length).toBe(2)
    expect(wrapper.text()).toContain('选择人物')
  })

  // -----------------------------------------------------------------------
  // 2. Auto-select first character with events
  // -----------------------------------------------------------------------

  it('auto-selects the first character entity with most events', async () => {
    const char1 = makeCharacter({ id: 'c1', name: '孙悟空' })
    const char2 = makeCharacter({ id: 'c2', name: '唐僧' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 1 }),
      makeStateEvent({ id: 'evt2', entityId: 'c1', chapterNumber: 2 }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', [events[0], events[1]]]]),
      countsByEntity: new Map([['c1', 2], ['c2', 0]]),
      chapterNumbersByEntity: new Map(),
      entityIdsByChapterNumber: new Map(),
    })

    // Provide resolved entity state for the selected character
    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char1, char2])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Auto-select should pick c1 which has events; info card should show its name
    expect(wrapper.text()).toContain('孙悟空')
  })

  // -----------------------------------------------------------------------
  // 3. Character detail display with stats
  // -----------------------------------------------------------------------

  it('displays character detail info card with importance and stats', async () => {
    const char = makeCharacter({ id: 'c1', name: '林黛玉', importance: 'critical' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 1, eventType: 'ABILITY_CHANGE', payload: { abilityName: '诗词', abilityStatus: 'active' } }),
      makeStateEvent({ id: 'evt2', entityId: 'c1', chapterNumber: 1, eventType: 'VITAL_STATUS_CHANGE', payload: { status: '病弱' } }),
      makeStateEvent({ id: 'evt3', entityId: 'c1', chapterNumber: 2, eventType: 'RELATION_ADD', payload: { targetId: 'c2', relationType: 'friend' } }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 3]]),
      chapterNumbersByEntity: new Map([['c1', new Set([1, 2])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Should display the character name and importance label
    expect(wrapper.text()).toContain('林黛玉')
    expect(wrapper.text()).toContain('关键人物')

    // Stats: growth node count and chapter count
    expect(wrapper.text()).toContain('成长节点')
    expect(wrapper.text()).toContain('出场章节')
  })

  // -----------------------------------------------------------------------
  // 4. Empty state when no state events exist
  // -----------------------------------------------------------------------

  it('shows empty state when selected character has no development events', async () => {
    const char = makeCharacter({ id: 'c1', name: '空角色' })

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map(),
      countsByEntity: new Map([['c1', 0]]),
      chapterNumbersByEntity: new Map(),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Empty state should be visible
    expect(wrapper.find('.el-empty-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无成长记录')
  })

  // -----------------------------------------------------------------------
  // 5. Development timeline rendering
  // -----------------------------------------------------------------------

  it('renders development timeline with event titles and chapter numbers', async () => {
    const char = makeCharacter({ id: 'c1', name: '武松' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 3, eventType: 'ABILITY_CHANGE', payload: { abilityName: '武艺', abilityStatus: 'active' } }),
      makeStateEvent({ id: 'evt2', entityId: 'c1', chapterNumber: 7, eventType: 'VITAL_STATUS_CHANGE', payload: { status: '重伤' } }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 2]]),
      chapterNumbersByEntity: new Map([['c1', new Set([3, 7])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Timeline should show chapter numbers
    const timelineItems = wrapper.findAll('.el-timeline-item-stub')
    expect(timelineItems.length).toBe(2)

    // Should display event type labels
    expect(wrapper.text()).toContain('能力变化')
    expect(wrapper.text()).toContain('生命事件')
  })

  // -----------------------------------------------------------------------
  // 6. Growth statistics by category
  // -----------------------------------------------------------------------

  it('displays growth statistics grouped by event category', async () => {
    const char = makeCharacter({ id: 'c1', name: '诸葛亮' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 1, eventType: 'ABILITY_CHANGE', payload: { abilityName: '计谋', abilityStatus: 'active' } }),
      makeStateEvent({ id: 'evt2', entityId: 'c1', chapterNumber: 1, eventType: 'ABILITY_CHANGE', payload: { abilityName: '阵法', abilityStatus: 'active' } }),
      makeStateEvent({ id: 'evt3', entityId: 'c1', chapterNumber: 2, eventType: 'RELATION_ADD', payload: { targetId: 'c2', relationType: 'friend' } }),
      makeStateEvent({ id: 'evt4', entityId: 'c1', chapterNumber: 2, eventType: 'VITAL_STATUS_CHANGE', payload: { status: '健康' } }),
      makeStateEvent({ id: 'evt5', entityId: 'c1', chapterNumber: 3, eventType: 'LOCATION_MOVE', payload: { coordinates: { x: 10, y: 20 } } }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 5]]),
      chapterNumbersByEntity: new Map([['c1', new Set([1, 2, 3])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Stats section should exist
    expect(wrapper.text()).toContain('成长统计')
    expect(wrapper.text()).toContain('能力成长')
    expect(wrapper.text()).toContain('关系变化')
    expect(wrapper.text()).toContain('状态转变')
  })

  // -----------------------------------------------------------------------
  // 7. Event description rendering for different event types
  // -----------------------------------------------------------------------

  it('renders ABILITY_CHANGE event with ability name and status', async () => {
    const char = makeCharacter({ id: 'c1', name: '赵云' })

    const events = [
      makeStateEvent({
        id: 'evt1',
        entityId: 'c1',
        chapterNumber: 1,
        eventType: 'ABILITY_CHANGE',
        payload: { abilityName: '龙胆枪法', abilityStatus: 'active' },
      }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 1]]),
      chapterNumbersByEntity: new Map([['c1', new Set([1])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Should show ability name in the timeline content
    expect(wrapper.text()).toContain('龙胆枪法')
    expect(wrapper.text()).toContain('获得') // ABILITY_STATUS_LABELS['active']
    expect(wrapper.text()).toContain('能力变化')
  })

  // -----------------------------------------------------------------------
  // 8. LOCATION_MOVE event rendering
  // -----------------------------------------------------------------------

  it('renders LOCATION_MOVE event with coordinates', async () => {
    const char = makeCharacter({ id: 'c1', name: '李白' })

    const events = [
      makeStateEvent({
        id: 'evt1',
        entityId: 'c1',
        chapterNumber: 2,
        eventType: 'LOCATION_MOVE',
        payload: { coordinates: { x: 42, y: 88 } },
      }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 1]]),
      chapterNumbersByEntity: new Map([['c1', new Set([2])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('位置迁移')
    expect(wrapper.text()).toContain('(42, 88)')
  })

  // -----------------------------------------------------------------------
  // 9. Navigate to chapter on click
  // -----------------------------------------------------------------------

  it('navigates to chapter URL when "查看章节" is clicked', async () => {
    const char = makeCharacter({ id: 'c1', name: '关羽' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 5, eventType: 'PROPERTY_UPDATE', payload: { key: '武力', value: '99' } }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 1]]),
      chapterNumbersByEntity: new Map([['c1', new Set([5])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Find the "查看章节" button (third button in development-actions)
    const buttons = wrapper.findAll('.el-button-stub')
    const chapterButton = buttons.find(b => b.text().includes('查看章节'))
    expect(chapterButton).toBeDefined()

    await chapterButton!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith(`/project/${PROJECT_ID}/chapters?chapter=5`)
  })

  // -----------------------------------------------------------------------
  // 10. Delete state event with confirmation
  // -----------------------------------------------------------------------

  it('deletes a state event after confirmation', async () => {
    const char = makeCharacter({ id: 'c1', name: '张飞' })

    const events = [
      makeStateEvent({ id: 'evt1', entityId: 'c1', chapterNumber: 1, eventType: 'PROPERTY_UPDATE', payload: { key: '力量', value: '95' } }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 1]]),
      chapterNumbersByEntity: new Map([['c1', new Set([1])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])
    seedStateEvents(store, events)

    const deleteSpy = vi.spyOn(store, 'deleteStateEvent').mockResolvedValue(undefined)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Find the "删除" button
    const buttons = wrapper.findAll('.el-button-stub')
    const deleteButton = buttons.find(b => b.text().includes('删除'))
    expect(deleteButton).toBeDefined()

    await deleteButton!.trigger('click')
    await flushPromises()

    // ElMessageBox.confirm was called, and then deleteStateEvent
    expect(deleteSpy).toHaveBeenCalledWith('evt1')
  })

  // -----------------------------------------------------------------------
  // 11. Characters sorted by event count (descending)
  // -----------------------------------------------------------------------

  it('sorts character list by event count in descending order', async () => {
    const char1 = makeCharacter({ id: 'c1', name: '少事件角色' })
    const char2 = makeCharacter({ id: 'c2', name: '多事件角色' })
    const char3 = makeCharacter({ id: 'c3', name: '中事件角色' })

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map(),
      countsByEntity: new Map([['c1', 1], ['c2', 5], ['c3', 3]]),
      chapterNumbersByEntity: new Map(),
      entityIdsByChapterNumber: new Map(),
    })

    seedEntities(store, [char1, char2, char3])

    const wrapper = mountComponent()
    await nextTick()

    const options = wrapper.findAll('.el-option-stub')
    expect(options.length).toBe(3)
    // First option should be the character with the most events
    expect(options[0].text()).toContain('多事件角色')
  })

  // -----------------------------------------------------------------------
  // 12. Relationship event rendering
  // -----------------------------------------------------------------------

  it('renders RELATION_ADD event with target entity and relation type', async () => {
    const char1 = makeCharacter({ id: 'c1', name: '刘备' })
    const char2 = makeCharacter({ id: 'c2', name: '关羽' })

    const events = [
      makeStateEvent({
        id: 'evt1',
        entityId: 'c1',
        chapterNumber: 1,
        eventType: 'RELATION_ADD',
        payload: { targetId: 'c2', relationType: 'friend' },
      }),
    ]

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map([['c1', events]]),
      countsByEntity: new Map([['c1', 1]]),
      chapterNumbersByEntity: new Map([['c1', new Set([1])]]),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char1, char2])
    seedStateEvents(store, events)

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Should show the relation event label
    expect(wrapper.text()).toContain('关系建立')
    expect(wrapper.text()).toContain('关系变化')
    // Should resolve the entity name
    expect(wrapper.text()).toContain('关羽')
    // Should show the relation type label
    expect(wrapper.text()).toContain('朋友')
  })

  // -----------------------------------------------------------------------
  // 13. Add node dialog opens and closes
  // -----------------------------------------------------------------------

  it('opens add node dialog when "添加节点" is clicked', async () => {
    const char = makeCharacter({ id: 'c1', name: '孙悟空' })

    vi.mocked(buildStateEventIndexes).mockReturnValue({
      eventsByEntity: new Map(),
      countsByEntity: new Map([['c1', 0]]),
      chapterNumbersByEntity: new Map(),
      entityIdsByChapterNumber: new Map(),
    })

    vi.mocked(replayReducer).mockReturnValue({
      c1: {
        entityId: 'c1',
        entityName: 'test',
        entityType: 'CHARACTER',
        properties: {},
        relations: [],
        location: null,
        vitalStatus: 'alive',
        abilities: [],
      },
    })

    seedEntities(store, [char])

    const wrapper = mountComponent()
    await nextTick()
    await nextTick()

    // Dialog should not be visible initially
    expect(wrapper.find('.el-dialog-stub').exists()).toBe(false)

    // Find and click the "添加节点" button
    const buttons = wrapper.findAll('.el-button-stub')
    const addButton = buttons.find(b => b.text().includes('添加节点'))
    expect(addButton).toBeDefined()

    await addButton!.trigger('click')
    await nextTick()

    // Dialog should now be visible with form content
    const dialog = wrapper.find('.el-dialog-stub')
    expect(dialog.exists()).toBe(true)
    // Dialog form should contain the event type options
    expect(dialog.text()).toContain('所在章节')
    expect(dialog.text()).toContain('事件类型')
  })
})
