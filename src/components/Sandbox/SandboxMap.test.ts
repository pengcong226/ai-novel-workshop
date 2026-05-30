import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { Entity, StateEvent } from '@/types/sandbox'
import type { Pinia } from 'pinia'

// ── Hoisted mocks ──────────────────────────────────────────────────────

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/utils/performance', () => ({
  measureSync: (_label: string, fn: () => unknown) => fn(),
}))

vi.mock('@/utils/anthropic-guard', () => ({
  isWebRuntime: () => true,
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => `mock-uuid-${Date.now()}`),
}))

// ── Imports (after mocks) ──────────────────────────────────────────────

import SandboxMap from './SandboxMap.vue'
import { useSandboxStore } from '@/stores/sandbox'

// ── Factories ──────────────────────────────────────────────────────────

function makeLocationEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'loc-1',
    projectId: 'proj-1',
    type: 'LOCATION',
    name: 'Forest Glade',
    aliases: [],
    importance: 'major',
    category: 'Location',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now(),
    visualMeta: {
      color: '#22c55e',
      defaultCoordinates: { x: 30, y: 60 },
    },
    ...overrides,
  }
}

function makeCharacterEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'char-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: 'Aria',
    aliases: [],
    importance: 'major',
    category: 'Protagonist',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

function makeStateEvent(overrides: Partial<StateEvent> = {}): StateEvent {
  return {
    id: 'event-1',
    projectId: 'proj-1',
    chapterNumber: 1,
    entityId: 'char-1',
    eventType: 'LOCATION_MOVE',
    payload: { coordinates: { x: 40, y: 50 } },
    source: 'MANUAL',
    ...overrides,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function mountWithStore(pinia: Pinia) {
  return mount(SandboxMap, {
    global: { plugins: [pinia] },
  })
}

async function seedStore(
  pinia: Pinia,
  entities: Entity[],
  stateEvents: StateEvent[] = [],
  currentChapter = 1
) {
  const store = useSandboxStore(pinia)
  store.entities = entities
  store.stateEvents = stateEvents
  store.currentChapter = currentChapter
  await nextTick()
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('SandboxMap', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createTestPinia()
  })

  // ── 1. Map canvas rendering ────────────────────────────────────────

  it('renders the map canvas with grid background', () => {
    seedStore(pinia, [])
    const wrapper = mountWithStore(pinia)

    const canvas = wrapper.find('.map-canvas')
    expect(canvas.exists()).toBe(true)
  })

  it('renders the container with correct aria attributes', () => {
    seedStore(pinia, [])
    const wrapper = mountWithStore(pinia)

    const container = wrapper.find('.sandbox-map-container')
    expect(container.attributes('role')).toBe('img')
    expect(container.attributes('aria-label')).toBe('势力分布地图')
  })

  it('renders the info hint text', () => {
    seedStore(pinia, [])
    const wrapper = mountWithStore(pinia)

    expect(wrapper.text()).toContain('角色位置根据时间线中提取的 @地点 自动同步')
  })

  // ── 2. Location pins ───────────────────────────────────────────────

  it('renders location pin at default coordinates when no visualMeta', () => {
    const loc = makeLocationEntity({
      id: 'loc-no-meta',
      name: 'Mysterious Cave',
      visualMeta: undefined,
    })
    seedStore(pinia, [loc])
    const wrapper = mountWithStore(pinia)

    const pins = wrapper.findAll('.map-pin')
    expect(pins).toHaveLength(1)
    expect(pins[0].find('.map-pin-label').text()).toBe('Mysterious Cave')
    // Default coordinates are (50, 50)
    expect(pins[0].attributes('style')).toContain('top: 50%')
    expect(pins[0].attributes('style')).toContain('left: 50%')
  })

  it('renders location pin with configured coordinates and color', () => {
    const loc = makeLocationEntity({
      id: 'loc-configured',
      name: 'Dragon Peak',
      visualMeta: {
        color: '#ff0000',
        defaultCoordinates: { x: 80, y: 20 },
      },
    })
    seedStore(pinia, [loc])
    const wrapper = mountWithStore(pinia)

    const pins = wrapper.findAll('.map-pin')
    expect(pins).toHaveLength(1)
    expect(pins[0].find('.map-pin-label').text()).toBe('Dragon Peak')
    expect(pins[0].attributes('style')).toContain('top: 20%')
    expect(pins[0].attributes('style')).toContain('left: 80%')
    // Pin icon color should be set (jsdom normalizes hex to rgb)
    const icon = pins[0].find('i')
    expect(icon.attributes('style')).toContain('color: rgb(255, 0, 0)')
  })

  it('does not render archived location entities', () => {
    const loc = makeLocationEntity({
      id: 'loc-archived',
      name: 'Ruined Castle',
      isArchived: true,
    })
    seedStore(pinia, [loc])
    const wrapper = mountWithStore(pinia)

    const pins = wrapper.findAll('.map-pin')
    expect(pins).toHaveLength(0)
  })

  it('does not render character entities as location pins', () => {
    const char = makeCharacterEntity()
    seedStore(pinia, [char])
    const wrapper = mountWithStore(pinia)

    const pins = wrapper.findAll('.map-pin')
    expect(pins).toHaveLength(0)
  })

  // ── 3. Character avatars ───────────────────────────────────────────

  it('renders character avatar at resolved location', () => {
    const char = makeCharacterEntity({ id: 'char-aria', name: 'Aria' })
    // Need a LOCATION_MOVE event to populate `location` on the resolved entity
    const move = makeStateEvent({
      id: 'move-1',
      entityId: 'char-aria',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 45, y: 55 } },
    })
    seedStore(pinia, [char], [move])
    const wrapper = mountWithStore(pinia)

    const avatars = wrapper.findAll('.map-avatar')
    expect(avatars).toHaveLength(1)
    expect(avatars[0].text()).toBe('A') // first char of "Aria"
    expect(avatars[0].attributes('title')).toContain('Aria')
    expect(avatars[0].attributes('style')).toContain('top: 55%')
    expect(avatars[0].attributes('style')).toContain('left: 45%')
  })

  it('does not render avatar for character without location', () => {
    const char = makeCharacterEntity({ id: 'char-no-loc' })
    // No LOCATION_MOVE events, so resolved entity location is null
    seedStore(pinia, [char], [])
    const wrapper = mountWithStore(pinia)

    const avatars = wrapper.findAll('.map-avatar')
    expect(avatars).toHaveLength(0)
  })

  it('does not render avatar for archived character', () => {
    const char = makeCharacterEntity({ id: 'char-archived', isArchived: true })
    const move = makeStateEvent({
      id: 'move-archived',
      entityId: 'char-archived',
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 10, y: 20 } },
    })
    seedStore(pinia, [char], [move])
    const wrapper = mountWithStore(pinia)

    const avatars = wrapper.findAll('.map-avatar')
    expect(avatars).toHaveLength(0)
  })

  it('renders multiple characters with different locations', () => {
    const char1 = makeCharacterEntity({ id: 'char-a', name: 'Alpha' })
    const char2 = makeCharacterEntity({ id: 'char-b', name: 'Beta' })
    const move1 = makeStateEvent({
      id: 'move-a',
      entityId: 'char-a',
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 20, y: 30 } },
    })
    const move2 = makeStateEvent({
      id: 'move-b',
      entityId: 'char-b',
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 70, y: 80 } },
    })
    seedStore(pinia, [char1, char2], [move1, move2])
    const wrapper = mountWithStore(pinia)

    const avatars = wrapper.findAll('.map-avatar')
    expect(avatars).toHaveLength(2)
    expect(avatars[0].text()).toBe('A')
    expect(avatars[1].text()).toBe('B')
  })

  // ── 4. Movement paths ─────────────────────────────────────────────

  it('renders SVG movement path when character has two+ moves', () => {
    const char = makeCharacterEntity({ id: 'char-path', name: 'Wanderer' })
    const move1 = makeStateEvent({
      id: 'move-p1',
      entityId: 'char-path',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 10, y: 20 } },
    })
    const move2 = makeStateEvent({
      id: 'move-p2',
      entityId: 'char-path',
      chapterNumber: 2,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 60, y: 70 } },
    })
    seedStore(pinia, [char], [move1, move2], 2)
    const wrapper = mountWithStore(pinia)

    const svgLayer = wrapper.find('.map-svg-layer')
    expect(svgLayer.exists()).toBe(true)
    const lines = svgLayer.findAll('line')
    expect(lines).toHaveLength(1)
    // Line goes from previous position (10,20) to current (60,70)
    expect(lines[0].attributes('x1')).toBe('10%')
    expect(lines[0].attributes('y1')).toBe('20%')
    expect(lines[0].attributes('x2')).toBe('60%')
    expect(lines[0].attributes('y2')).toBe('70%')
  })

  it('renders no movement path when character has only one move', () => {
    const char = makeCharacterEntity({ id: 'char-single', name: 'Stayer' })
    const move = makeStateEvent({
      id: 'move-single',
      entityId: 'char-single',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 50, y: 50 } },
    })
    seedStore(pinia, [char], [move], 1)
    const wrapper = mountWithStore(pinia)

    const lines = wrapper.find('.map-svg-layer').findAll('line')
    expect(lines).toHaveLength(0)
  })

  it('renders no movement path when last two moves are at the same location', () => {
    const char = makeCharacterEntity({ id: 'char-same', name: 'Stillness' })
    const move1 = makeStateEvent({
      id: 'move-same-1',
      entityId: 'char-same',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 40, y: 40 } },
    })
    const move2 = makeStateEvent({
      id: 'move-same-2',
      entityId: 'char-same',
      chapterNumber: 2,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 40, y: 40 } },
    })
    seedStore(pinia, [char], [move1, move2], 2)
    const wrapper = mountWithStore(pinia)

    const lines = wrapper.find('.map-svg-layer').findAll('line')
    expect(lines).toHaveLength(0)
  })

  it('ignores LOCATION_MOVE events beyond currentChapter', () => {
    const char = makeCharacterEntity({ id: 'char-future', name: 'TimeLord' })
    const move1 = makeStateEvent({
      id: 'move-f1',
      entityId: 'char-future',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 10, y: 10 } },
    })
    const move2 = makeStateEvent({
      id: 'move-f2',
      entityId: 'char-future',
      chapterNumber: 5,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 90, y: 90 } },
    })
    // currentChapter is 1, so chapter 5 event should be ignored
    seedStore(pinia, [char], [move1, move2], 1)
    const wrapper = mountWithStore(pinia)

    // With only one visible move (chapter 1), no path should render
    const lines = wrapper.find('.map-svg-layer').findAll('line')
    expect(lines).toHaveLength(0)
  })

  it('renders dashed SVG line with accent stroke', () => {
    const char = makeCharacterEntity({ id: 'char-dash', name: 'Dasher' })
    const move1 = makeStateEvent({
      id: 'move-d1',
      entityId: 'char-dash',
      chapterNumber: 1,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 10, y: 10 } },
    })
    const move2 = makeStateEvent({
      id: 'move-d2',
      entityId: 'char-dash',
      chapterNumber: 2,
      eventType: 'LOCATION_MOVE',
      payload: { coordinates: { x: 80, y: 90 } },
    })
    seedStore(pinia, [char], [move1, move2], 2)
    const wrapper = mountWithStore(pinia)

    const line = wrapper.find('.map-svg-layer line')
    expect(line.attributes('stroke')).toBe('var(--accent-glow)')
    expect(line.attributes('stroke-dasharray')).toBe('5,5')
  })
})
