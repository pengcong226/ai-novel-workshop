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

// Component under test
import SandboxMap from '@/components/Sandbox/SandboxMap.vue'
import { useSandboxStore } from '@/stores/sandbox'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountMap() {
  return mount(SandboxMap)
}

/**
 * Seed resolved entity data into the store for map testing.
 * Populates both `entities` and `activeEntitiesState`.
 */
function seedMapEntities(
  store: ReturnType<typeof useSandboxStore>,
  resolvedEntities: Record<string, Record<string, unknown>>,
) {
  store.entities = Object.values(resolvedEntities) as ReturnType<typeof store.entities>
  vi.mocked(replayReducer).mockReturnValue(resolvedEntities)
}

/** Create a LOCATION_MOVE state event for avatar path tests. */
function createLocationMoveEvent(overrides: {
  id: string
  entityId: string
  chapterNumber: number
  coordinates: { x: number; y: number }
}) {
  return {
    id: overrides.id,
    projectId: 'test-project',
    chapterNumber: overrides.chapterNumber,
    entityId: overrides.entityId,
    eventType: 'LOCATION_MOVE' as const,
    payload: { coordinates: overrides.coordinates },
    source: 'MANUAL' as const,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SandboxMap', () => {
  beforeEach(() => {
    createTestPinia()
    resetMockIdCounter()
    vi.clearAllMocks()
    vi.mocked(replayReducer).mockReturnValue({})
  })

  // --- Container & ARIA ---

  it('renders the map container with correct ARIA attributes', () => {
    const wrapper = mountMap()

    const container = wrapper.find('.sandbox-map-container')
    expect(container.exists()).toBe(true)
    expect(container.attributes('role')).toBe('img')
    expect(container.attributes('aria-label')).toBe('势力分布地图')
  })

  it('renders the map canvas element', () => {
    const wrapper = mountMap()

    expect(wrapper.find('.map-canvas').exists()).toBe(true)
  })

  // --- Location pins ---

  it('renders location pins for LOCATION type entities', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'loc-1': {
        id: 'loc-1', name: '王城', type: 'LOCATION', category: 'Location',
        isArchived: false, relations: [],
        visualMeta: { defaultCoordinates: { x: 30, y: 40 }, color: '#ff5500' },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
      'loc-2': {
        id: 'loc-2', name: '密林', type: 'LOCATION', category: '地点',
        isArchived: false, relations: [],
        visualMeta: { defaultCoordinates: { x: 70, y: 80 } },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const pins = wrapper.findAll('.map-pin')

    expect(pins).toHaveLength(2)
    // Verify positioning of the first pin
    expect(pins[0].attributes('style')).toContain('top: 40%')
    expect(pins[0].attributes('style')).toContain('left: 30%')
    expect(pins[0].find('.map-pin-label').text()).toBe('王城')
  })

  it('applies custom color from visualMeta to location pin icon', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'loc-1': {
        id: 'loc-1', name: '矿洞', type: 'LOCATION', category: 'Location',
        isArchived: false, relations: [],
        visualMeta: { defaultCoordinates: { x: 25, y: 60 }, color: '#00ff88' },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const pinIcon = wrapper.find('.map-pin i')

    expect(pinIcon.attributes('style')).toContain('rgb(0, 255, 136)')
  })

  it('does not render CHARACTER entities as location pins', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '主角', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()

    expect(wrapper.findAll('.map-pin')).toHaveLength(0)
  })

  // --- Avatar nodes ---

  it('renders character avatar with first character of name', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '李云龙', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        location: "45,55",
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const avatars = wrapper.findAll('.map-avatar')

    expect(avatars).toHaveLength(1)
    expect(avatars[0].text()).toBe('李')
    expect(avatars[0].attributes('title')).toBe('李云龙 的当前位置')
  })

  it('positions avatar at character location coordinates', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '张三', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        location: "65,35",
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const avatar = wrapper.find('.map-avatar')

    expect(avatar.attributes('style')).toContain('top: 35%')
    expect(avatar.attributes('style')).toContain('left: 65%')
  })

  it('does not render avatar for characters without location', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '路人', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        location: null,
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()

    expect(wrapper.findAll('.map-avatar')).toHaveLength(0)
  })

  // --- Avatar movement paths ---

  it('renders avatar path SVG line when character has moved between chapters', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '旅者', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        location: "60,70",
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })
    store.currentChapter = 2
    store.stateEvents = [
      createLocationMoveEvent({
        id: 'move-1', entityId: 'char-1', chapterNumber: 1, coordinates: { x: 30, y: 40 },
      }),
      createLocationMoveEvent({
        id: 'move-2', entityId: 'char-1', chapterNumber: 2, coordinates: { x: 60, y: 70 },
      }),
    ]

    const wrapper = mountMap()
    const svgLayer = wrapper.find('.map-svg-layer')

    expect(svgLayer.exists()).toBe(true)
    const lines = svgLayer.findAll('line')
    expect(lines).toHaveLength(1)
    expect(lines[0].attributes('x1')).toBe('30%')
    expect(lines[0].attributes('y1')).toBe('40%')
    expect(lines[0].attributes('x2')).toBe('60%')
    expect(lines[0].attributes('y2')).toBe('70%')
    expect(lines[0].attributes('stroke-dasharray')).toBe('5,5')
  })

  it('does not render avatar path when character has not moved', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '定居者', type: 'CHARACTER', category: 'Protagonist',
        isArchived: false, relations: [],
        location: "40,50",
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })
    store.stateEvents = [
      createLocationMoveEvent({
        id: 'move-1', entityId: 'char-1', chapterNumber: 1, coordinates: { x: 40, y: 50 },
      }),
    ]

    const wrapper = mountMap()
    const svgLines = wrapper.find('.map-svg-layer').findAll('line')

    expect(svgLines).toHaveLength(0)
  })

  it('renders SVG layer element even when no movement data exists', () => {
    const wrapper = mountMap()

    expect(wrapper.find('.map-svg-layer').exists()).toBe(true)
    expect(wrapper.find('.map-svg-layer').findAll('line')).toHaveLength(0)
  })

  // --- Archived entity filtering ---

  it('does not render archived location entities', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'loc-1': {
        id: 'loc-1', name: '废墟', type: 'LOCATION', category: 'Location',
        isArchived: true, relations: [],
        visualMeta: { defaultCoordinates: { x: 50, y: 50 } },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()

    expect(wrapper.findAll('.map-pin')).toHaveLength(0)
  })

  it('does not render archived character avatars', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'char-1': {
        id: 'char-1', name: '逝者', type: 'CHARACTER', category: 'Protagonist',
        isArchived: true, relations: [],
        location: "50,50",
        properties: {}, vitalStatus: 'dead', abilities: [],
      },
    })

    const wrapper = mountMap()

    expect(wrapper.findAll('.map-avatar')).toHaveLength(0)
  })

  // --- Default coordinates fallback ---

  it('uses default coordinates (50, 50) when visualMeta has no coordinates', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'loc-1': {
        id: 'loc-1', name: '未知之地', type: 'LOCATION', category: 'Location',
        isArchived: false, relations: [],
        visualMeta: {},
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const pin = wrapper.find('.map-pin')

    expect(pin.attributes('style')).toContain('top: 50%')
    expect(pin.attributes('style')).toContain('left: 50%')
  })

  it('uses default color when visualMeta has no color', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'loc-1': {
        id: 'loc-1', name: '无色之镇', type: 'LOCATION', category: 'Location',
        isArchived: false, relations: [],
        visualMeta: { defaultCoordinates: { x: 20, y: 30 } },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const pinIcon = wrapper.find('.map-pin i')

    expect(pinIcon.attributes('style')).toContain('var(--accent-primary)')
  })

  // --- Category-based entity detection ---

  it('renders location pins for entities with Location category even if type is not LOCATION', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'ent-1': {
        id: 'ent-1', name: '天下第一楼', type: 'LORE', category: '地点',
        isArchived: false, relations: [],
        visualMeta: { defaultCoordinates: { x: 15, y: 25 } },
        properties: {}, location: null, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const pins = wrapper.findAll('.map-pin')

    expect(pins).toHaveLength(1)
    expect(pins[0].find('.map-pin-label').text()).toBe('天下第一楼')
  })

  it('renders avatar for entities with Protagonist category even if type is not CHARACTER', () => {
    const store = useSandboxStore()
    seedMapEntities(store, {
      'ent-1': {
        id: 'ent-1', name: '天选之人', type: 'CONCEPT', category: '核心人物',
        isArchived: false, relations: [],
        location: "50,50",
        properties: {}, vitalStatus: 'alive', abilities: [],
      },
    })

    const wrapper = mountMap()
    const avatars = wrapper.findAll('.map-avatar')

    expect(avatars).toHaveLength(1)
    expect(avatars[0].text()).toBe('天')
  })
})
