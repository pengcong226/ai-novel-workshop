import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import { resetMockIdCounter, createMockEntity } from '@/test/mocks'

// --- Mocks (must precede component imports) ---

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
  sortStateEventsByChapter: vi.fn().mockImplementation((events) =>
    [...events].sort((a, b) => a.chapterNumber - b.chapterNumber),
  ),
}))

vi.mock('@/schemas/stateEventSchema', () => ({
  StateEventSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'mock-generated-id'),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

// G6 mock
const mockRender = vi.fn()
const mockSetData = vi.fn()
const mockDestroy = vi.fn()
const mockResize = vi.fn()

vi.mock('@antv/g6', () => ({
  Graph: vi.fn().mockImplementation(() => ({
    render: mockRender,
    setData: mockSetData,
    data: vi.fn(),
    destroy: mockDestroy,
    resize: mockResize,
  })),
}))

import { Graph } from '@antv/g6'

// Element Plus stubs
const ElCascaderStub = {
  name: 'ElCascader',
  props: ['modelValue', 'options', 'size', 'placeholder'],
  emits: ['update:modelValue'],
  template:
    '<div class="el-cascader-stub">' +
    '<span v-if="options">{{ options.length }} focus options</span>' +
    '<slot /></div>',
}

// Component under test
import SandboxGraph from '@/components/Sandbox/SandboxGraph.vue'
import { useSandboxStore } from '@/stores/sandbox'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountGraph() {
  return mount(SandboxGraph, {
    global: {
      stubs: { ElCascader: ElCascaderStub },
    },
  })
}

/**
 * Seed resolved entity data into the store.
 * Both `entities` (for focusOptions) and `activeEntitiesState` (for nodes)
 * are populated by configuring the replayReducer mock.
 */
function seedEntities(
  store: ReturnType<typeof useSandboxStore>,
  resolvedEntities: Record<string, any>,
) {
  store.entities = Object.values(resolvedEntities) as any
  vi.mocked(replayReducer).mockReturnValue(resolvedEntities as any)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxGraph', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    vi.mocked(replayReducer).mockReturnValue({})
  })

  // --- Container & ARIA ---

  it('renders container with correct ARIA attributes', () => {
    const wrapper = mountGraph()

    const container = wrapper.find('.sandbox-graph-container')
    expect(container.exists()).toBe(true)
    expect(container.attributes('role')).toBe('img')
    expect(container.attributes('aria-label')).toBe('实体关系图谱')
  })

  it('renders the graph canvas element', () => {
    const wrapper = mountGraph()

    expect(wrapper.find('#g6-graph-container').exists()).toBe(true)
    expect(wrapper.find('.graph-canvas').exists()).toBe(true)
  })

  // --- Graph initialization ---

  it('creates a Graph instance on mount', () => {
    mountGraph()

    expect(Graph).toHaveBeenCalledTimes(1)
    const [options] = vi.mocked(Graph).mock.calls[0] as unknown[]
    expect(options).toEqual(
      expect.objectContaining({
        layout: expect.objectContaining({ type: 'force', preventOverlap: true }),
        modes: expect.objectContaining({ default: expect.arrayContaining(['drag-canvas', 'zoom-canvas', 'drag-node']) }),
      }),
    )
  })

  // --- Node rendering ---

  it('renders protagonist and connected entity as graph nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'friend' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '盟友', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    expect(mockSetData).toHaveBeenCalled()
    const callData = mockSetData.mock.calls[0][0]
    expect(callData.nodes).toHaveLength(2)
    expect(callData.nodes.map((n: { id: string }) => n.id)).toEqual(
      expect.arrayContaining(['entity-1', 'entity-2']),
    )
    expect(mockRender).toHaveBeenCalled()
  })

  it('filters out entities with no protagonist and no relations', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-lonely': {
        id: 'entity-lonely', name: '路人', type: 'CHARACTER', category: 'Minor',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    expect(callData.nodes).toHaveLength(0)
    expect(callData.edges).toHaveLength(0)
  })

  it('falls back to showing all entities with relations when no protagonist exists', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'ent-a': {
        id: 'ent-a', name: '角色A', type: 'CHARACTER', category: 'Antagonist',
        isArchived: false, relations: [{ targetId: 'ent-b', type: 'rival' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'ent-b': {
        id: 'ent-b', name: '角色B', type: 'CHARACTER', category: 'Support',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    expect(callData.nodes).toHaveLength(2)
    expect(callData.edges).toHaveLength(1)
  })

  // --- Status badge ---

  it('shows status badge when nodes exist', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'p': {
        id: 'p', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountGraph()
    const badge = wrapper.find('.status-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('节点已自动热更新')
  })

  it('hides status badge when no nodes', () => {
    const wrapper = mountGraph()

    expect(wrapper.find('.status-badge').exists()).toBe(false)
  })

  // --- Edge rendering ---

  it('creates edges for relations between visible entities', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'friend', attitude: '信任' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '盟友', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    expect(callData.edges).toHaveLength(1)
    expect(callData.edges[0]).toEqual(
      expect.objectContaining({
        source: 'entity-1',
        target: 'entity-2',
        label: 'friend (信任)',
      }),
    )
  })

  it('colors edges red for negative attitude keywords', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'enemy', attitude: '仇恨' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '反派', type: 'CHARACTER', category: 'Antagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const edge = mockSetData.mock.calls[0][0].edges[0]
    expect(edge.style.stroke).toBe('rgba(239, 68, 68, 0.6)')
  })

  it('truncates long attitude strings to 8 characters plus ellipsis', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally', attitude: '生死与共的羁绊之情' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '伙伴', type: 'CHARACTER', category: 'Support',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const edge = mockSetData.mock.calls[0][0].edges[0]
    expect(edge.label).toBe('ally (生死与共的羁绊之...)')
  })

  // --- Character focus mode ---

  it('renders only 1-degree connected nodes in character focus mode', async () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '盟友', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-3': {
        id: 'entity-3', name: '路人', type: 'CHARACTER', category: 'Minor',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountGraph()
    await nextTick()

    // Find cascader stub and trigger character focus on entity-2
    const cascader = wrapper.findComponent(ElCascaderStub)
    await cascader.vm.$emit('update:modelValue', ['character', 'entity-2'])

    await nextTick()
    // Wait for the 100ms debounce in the nodes/edges watcher
    await new Promise((r) => setTimeout(r, 150))

    expect(mockSetData).toHaveBeenCalled()
    const lastCall = mockSetData.mock.calls[mockSetData.mock.calls.length - 1][0]
    const nodeIds = lastCall.nodes.map((n: { id: string }) => n.id)
    // entity-2 is the focus; entity-1 is connected via backward relation; entity-3 is disconnected
    expect(nodeIds).toContain('entity-1')
    expect(nodeIds).toContain('entity-2')
    expect(nodeIds).not.toContain('entity-3')
  })

  // --- Draft node rendering in wizard mode ---

  it('renders draft entities with dashed border style in wizard mode', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })
    store.isWizardMode = true
    store.draftEntities = [
      createMockEntity({ id: 'draft-1', name: '草稿角色', category: 'Protagonist' }),
    ]

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    expect(callData.nodes).toHaveLength(2)
    const draftNode = callData.nodes.find((n: { id: string }) => n.id === 'draft-1')
    expect(draftNode).toBeDefined()
    expect(draftNode.style.lineDash).toEqual([4, 4])
    expect(draftNode.style.shadowColor).toBe('#fcd34d')
    expect(draftNode.labelCfg.style.fill).toBe('#fcd34d')
  })

  // --- Graph lifecycle ---

  it('destroys the graph instance on unmount', () => {
    const wrapper = mountGraph()
    wrapper.unmount()

    expect(mockDestroy).toHaveBeenCalledTimes(1)
  })

  // --- Graph options ---

  it('initializes graph with correct force layout options', () => {
    mountGraph()

    const [options] = vi.mocked(Graph).mock.calls[0] as unknown[]
    expect(options).toEqual(
      expect.objectContaining({
        layout: expect.objectContaining({
          type: 'force',
          preventOverlap: true,
          nodeSize: 50,
          linkDistance: 150,
        }),
        defaultNode: expect.objectContaining({ type: 'circle', size: 48 }),
      }),
    )
  })

  // --- Focus cascader options ---

  it('renders focus cascader with character entity options from store', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountGraph()
    const cascader = wrapper.findComponent(ElCascaderStub)
    expect(cascader.exists()).toBe(true)
    const opts = cascader.props('options') as Array<{ value: string; label: string; children?: unknown[] }>
    expect(opts).toHaveLength(2)
    expect(opts[0].value).toBe('chapter')
    expect(opts[1].value).toBe('character')
    expect(opts[1].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'entity-1', label: '主角' }),
      ]),
    )
  })

  // --- Backward relations ---

  it('includes entities that point to the protagonist via backward relations', () => {
    const store = useSandboxStore()
    // entity-2 has a relation pointing TO entity-1 (protagonist)
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '追随者', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [{ targetId: 'entity-1', type: 'follower' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    expect(callData.nodes).toHaveLength(2)
    expect(callData.nodes.map((n: { id: string }) => n.id)).toEqual(
      expect.arrayContaining(['entity-1', 'entity-2']),
    )
    // Edge from entity-2 -> entity-1
    expect(callData.edges).toHaveLength(1)
    expect(callData.edges[0]).toEqual(
      expect.objectContaining({ source: 'entity-2', target: 'entity-1' }),
    )
  })
})
