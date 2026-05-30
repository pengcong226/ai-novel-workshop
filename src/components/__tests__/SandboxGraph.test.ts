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

  // --- Positive attitude edge coloring ---

  it('colors edges green for positive attitude keywords', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'lover', attitude: '倾心' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '恋人', type: 'CHARACTER', category: 'Support',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const edge = mockSetData.mock.calls[0][0].edges[0]
    expect(edge.style.stroke).toBe('rgba(16, 185, 129, 0.6)')
  })

  // --- Default edge color ---

  it('uses default blue edge color when no attitude is specified', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'acquaintance' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '熟人', type: 'CHARACTER', category: 'Support',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const edge = mockSetData.mock.calls[0][0].edges[0]
    expect(edge.style.stroke).toBe('rgba(60, 130, 246, 0.4)')
    expect(edge.label).toBe('acquaintance')
  })

  // --- Draft edge rendering in wizard mode ---

  it('renders draft relations as gold dashed edges in wizard mode', () => {
    const store = useSandboxStore()
    // Protagonist has a committed relation to entity-2 so both are visible nodes
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
    })
    store.isWizardMode = true
    store.draftRelations = [{
      sourceId: 'entity-1',
      relation: { targetId: 'entity-2', type: 'draft-bond', attitude: '信任' },
    }]

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    // 2 committed nodes visible (protagonist + connected ally)
    expect(callData.nodes).toHaveLength(2)
    // 2 edges: 1 committed (ally) + 1 draft (draft-bond)
    expect(callData.edges).toHaveLength(2)
    const draftEdge = callData.edges.find((e: { style: { stroke: string } }) =>
      e.style.stroke === 'rgba(245, 158, 11, 0.8)',
    )
    expect(draftEdge).toBeDefined()
    expect(draftEdge.source).toBe('entity-1')
    expect(draftEdge.target).toBe('entity-2')
    expect(draftEdge.style.lineDash).toEqual([4, 4])
    expect(draftEdge.label).toBe('draft-bond (信任)')
  })

  // --- ResizeObserver ---

  it('sets up a ResizeObserver on the graph container', () => {
    const observeSpy = vi.fn()
    const disconnectSpy = vi.fn()

    const OriginalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver {
      observe = observeSpy
      disconnect = disconnectSpy
      unobserve = vi.fn()
    }
    // @ts-expect-error -- replacing global for test
    globalThis.ResizeObserver = MockResizeObserver

    const wrapper = mountGraph()
    expect(observeSpy).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(disconnectSpy).toHaveBeenCalledTimes(1)

    globalThis.ResizeObserver = OriginalResizeObserver
  })

  // --- Non-visible edge filtering ---

  it('excludes edges whose targets are not in the visible set', () => {
    const store = useSandboxStore()
    // Protagonist connected to entity-2, but entity-2 points to disconnected entity-3
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '盟友', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [{ targetId: 'entity-3', type: 'knows' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-3': {
        id: 'entity-3', name: '路人', type: 'CHARACTER', category: 'Minor',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    // entity-3 is 2 degrees away, not visible
    expect(callData.nodes.map((n: { id: string }) => n.id)).not.toContain('entity-3')
    // Edge entity-2 -> entity-3 should be excluded
    const edgeTargets = callData.edges.map((e: { target: string }) => e.target)
    expect(edgeTargets).not.toContain('entity-3')
  })

  // --- Graph interaction modes ---

  it('initializes graph with drag-canvas, zoom-canvas, and drag-node modes', () => {
    mountGraph()

    const [options] = vi.mocked(Graph).mock.calls[0] as unknown[]
    expect(options).toEqual(
      expect.objectContaining({
        modes: {
          default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
        },
      }),
    )
  })

  // --- Node styling by category ---

  it('assigns protagonist blue style to Protagonist category nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const node = mockSetData.mock.calls[0][0].nodes[0]
    expect(node.style.stroke).toBe('#3b82f6')
    expect(node.style.fill).toBe('rgba(59, 130, 246, 0.2)')
  })

  it('assigns antagonist red style to Antagonist category nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '反派', type: 'CHARACTER', category: 'Antagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'enemy' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const nodes = mockSetData.mock.calls[0][0].nodes
    const antagonist = nodes.find((n: { id: string }) => n.id === 'entity-1')
    expect(antagonist.style.stroke).toBe('#ef4444')
    expect(antagonist.style.fill).toBe('rgba(239, 68, 68, 0.2)')
  })

  // --- Additional category styling ---

  it('assigns purple style to Faction category nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'faction-1': {
        id: 'faction-1', name: '天机阁', type: 'FACTION', category: 'Faction',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const nodes = mockSetData.mock.calls[0][0].nodes
    const faction = nodes.find((n: { id: string }) => n.id === 'faction-1')
    expect(faction.style.stroke).toBe('#8b5cf6')
    expect(faction.style.fill).toBe('rgba(139, 92, 246, 0.2)')
  })

  it('assigns amber style to Lore/Item category nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'lore-1': {
        id: 'lore-1', name: '天书', type: 'LORE', category: 'Lore',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'contains' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const nodes = mockSetData.mock.calls[0][0].nodes
    const lore = nodes.find((n: { id: string }) => n.id === 'lore-1')
    expect(lore.style.stroke).toBe('#f59e0b')
    expect(lore.style.fill).toBe('rgba(245, 158, 11, 0.2)')
  })

  it('assigns green default style to unknown category nodes', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '友人', type: 'CHARACTER', category: 'Support',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const nodes = mockSetData.mock.calls[0][0].nodes
    const support = nodes.find((n: { id: string }) => n.id === 'entity-2')
    expect(support.style.stroke).toBe('#10b981')
    expect(support.style.fill).toBe('rgba(16, 185, 129, 0.2)')
  })

  it('recognizes Chinese category names (核心人物) as protagonist style', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: '核心人物',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const node = mockSetData.mock.calls[0][0].nodes[0]
    expect(node.style.stroke).toBe('#3b82f6')
    expect(node.style.fill).toBe('rgba(59, 130, 246, 0.2)')
  })

  // --- Edge label edge cases ---

  it('produces relation-only edge label when attitude is empty string', () => {
    const store = useSandboxStore()
    seedEntities(store, {
      'entity-1': {
        id: 'entity-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [{ targetId: 'entity-2', type: 'ally', attitude: '' }],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'entity-2': {
        id: 'entity-2', name: '盟友', type: 'CHARACTER', category: 'Ally',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    mountGraph()

    const edge = mockSetData.mock.calls[0][0].edges[0]
    // Empty-string attitude is falsy, so no parenthetical should appear
    expect(edge.label).toBe('ally')
    // And color should remain default blue (not classified as positive/negative)
    expect(edge.style.stroke).toBe('rgba(60, 130, 246, 0.4)')
  })

  // --- Draft edge visibility guard ---

  it('excludes draft edges when draft target is not a visible node', () => {
    const store = useSandboxStore()
    // Only protagonist is visible (no committed relation to draft-target)
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
    // Draft relation points to a target that is NOT in visibleSet
    store.draftRelations = [{
      sourceId: 'entity-1',
      relation: { targetId: 'nonexistent-entity', type: 'draft-link' },
    }]

    mountGraph()

    const callData = mockSetData.mock.calls[0][0]
    // Draft node should be visible
    expect(callData.nodes.map((n: { id: string }) => n.id)).toContain('draft-1')
    // But the draft edge to nonexistent-entity should be excluded
    expect(callData.edges).toHaveLength(0)
  })
})
