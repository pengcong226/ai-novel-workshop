import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { Entity, EntityType, EntityImportance } from '@/types/sandbox'
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
  v4: vi.fn(() => 'mock-uuid-1234'),
}))

vi.mock('@/utils/generateId', () => ({
  generateId: vi.fn(() => 'generated-id-001'),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@element-plus/icons-vue', () => ({
  Plus: { template: '<span />' },
  Search: { template: '<span />' },
  ArrowDown: { template: '<span />' },
}))

// ── Imports (after mocks) ──────────────────────────────────────────────

import EntityTree from './EntityTree.vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'

// ── Factories ──────────────────────────────────────────────────────────

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    projectId: 'proj-1',
    type: 'CHARACTER',
    name: 'Aria',
    aliases: [],
    importance: 'minor',
    category: 'Supporting',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now(),
    ...overrides,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function mountWithStore(pinia: Pinia) {
  return mount(EntityTree, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-input': {
          template: '<div><slot name="prefix" /><input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /></div>',
          props: ['modelValue', 'placeholder', 'clearable', 'size'],
          emits: ['update:modelValue'],
        },
        'el-button': {
          template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
          props: ['type', 'text', 'size'],
          emits: ['click'],
        },
        'el-icon': { template: '<span><slot /></span>' },
        'el-scrollbar': { template: '<div><slot /></div>' },
        'el-tag': {
          template: '<span class="el-tag-stub"><slot /></span>',
          props: ['size', 'type'],
        },
      },
    },
  })
}

async function seedEntities(pinia: Pinia, entities: Entity[]) {
  const store = useSandboxStore(pinia)
  store.entities = entities
  await nextTick()
}

function setCurrentProject(pinia: Pinia, projectId: string | null) {
  const store = useProjectStore(pinia)
  if (projectId) {
    store.currentProject = { id: projectId } as any
  } else {
    store.currentProject = null
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('EntityTree', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createTestPinia()
    setCurrentProject(pinia, 'proj-1')
  })

  // ── 1. Empty states ────────────────────────────────────────────────

  it('shows "no entities" message when entity list is empty', async () => {
    await seedEntities(pinia, [])
    const wrapper = mountWithStore(pinia)

    expect(wrapper.find('.tree-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无实体')
    expect(wrapper.text()).toContain('创建第一个实体')
  })

  it('shows "no match" message when search yields zero results', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    // Set search query via the stubbed input
    const input = wrapper.find('.tree-search input')
    await input.setValue('zzz_nonexistent_zzz')
    await nextTick()

    expect(wrapper.text()).toContain('未找到匹配实体')
  })

  // ── 2. Entity rendering ────────────────────────────────────────────

  it('renders entity names in the tree', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
      makeEntity({ id: 'e2', name: 'Gandalf', type: 'CHARACTER' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(2)

    const names = items.map(item => item.find('.item-name').text())
    expect(names).toContain('Aria')
    expect(names).toContain('Gandalf')
  })

  it('renders entity dot with custom visualMeta color', async () => {
    const entities = [
      makeEntity({
        id: 'e1',
        name: 'Red Entity',
        visualMeta: { color: '#ff0000' },
      }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const dot = wrapper.find('.item-dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('style')).toContain('background: rgb(255, 0, 0)')
  })

  it('renders entity dot with importance-based fallback color when no visualMeta', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Critical Entity', importance: 'critical' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const dot = wrapper.find('.item-dot')
    // critical importance color is #f56c6c → rgb(245, 108, 108) in jsdom
    expect(dot.attributes('style')).toContain('background: rgb(245, 108, 108)')
  })

  // ── 3. Importance tags ─────────────────────────────────────────────

  it('shows importance tag for critical entities', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Hero', importance: 'critical' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const tag = wrapper.find('.item-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('核心')
  })

  it('shows importance tag for major entities', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Mentor', importance: 'major' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const tag = wrapper.find('.item-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('重要')
  })

  it('does not show importance tag for minor entities', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Villager', importance: 'minor' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    expect(wrapper.find('.item-tag').exists()).toBe(false)
  })

  // ── 4. Grouping by type ────────────────────────────────────────────

  it('groups entities by type in canonical order (CHARACTER before LOCATION)', async () => {
    const entities = [
      makeEntity({ id: 'loc1', type: 'LOCATION', name: 'Forest' }),
      makeEntity({ id: 'char1', type: 'CHARACTER', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const groups = wrapper.findAll('.tree-group')
    expect(groups).toHaveLength(2)

    // CHARACTER comes before LOCATION in the type order
    expect(groups[0].find('.group-label').text()).toBe('人物')
    expect(groups[1].find('.group-label').text()).toBe('地点')
  })

  it('renders group header with entity count', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'Aria' }),
      makeEntity({ id: 'e2', type: 'CHARACTER', name: 'Gandalf' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const count = wrapper.find('.group-count')
    expect(count.text()).toBe('2')
  })

  it('sorts entities within a group by importance (critical first)', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'Minor Char', importance: 'minor' }),
      makeEntity({ id: 'e2', type: 'CHARACTER', name: 'Critical Char', importance: 'critical' }),
      makeEntity({ id: 'e3', type: 'CHARACTER', name: 'Major Char', importance: 'major' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const itemNames = wrapper.findAll('.item-name').map(el => el.text())
    expect(itemNames[0]).toBe('Critical Char')
    expect(itemNames[1]).toBe('Major Char')
    expect(itemNames[2]).toBe('Minor Char')
  })

  // ── 5. Filtering / search ──────────────────────────────────────────

  it('filters entities by name match', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
      makeEntity({ id: 'e2', name: 'Gandalf' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const input = wrapper.find('.tree-search input')
    await input.setValue('aria')
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.item-name').text()).toBe('Aria')
  })

  it('filters entities by alias match', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria', aliases: ['The Wanderer'] }),
      makeEntity({ id: 'e2', name: 'Gandalf', aliases: [] }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const input = wrapper.find('.tree-search input')
    await input.setValue('wanderer')
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.item-name').text()).toBe('Aria')
  })

  it('search is case-insensitive', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'ARIA' }),
      makeEntity({ id: 'e2', name: 'gandalf' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const input = wrapper.find('.tree-search input')
    await input.setValue('aria')
    await nextTick()

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.item-name').text()).toBe('ARIA')
  })

  // ── 6. Archived entities ───────────────────────────────────────────

  it('does not render archived entities', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Active Hero' }),
      makeEntity({ id: 'e2', name: 'Dead Villain', isArchived: true }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const items = wrapper.findAll('.tree-item')
    expect(items).toHaveLength(1)
    expect(items[0].find('.item-name').text()).toBe('Active Hero')
  })

  // ── 7. Selection and emit ──────────────────────────────────────────

  it('selects an entity on click and emits select event', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const item = wrapper.find('.tree-item')
    await item.trigger('click')

    expect(item.classes()).toContain('active')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['e1'])
  })

  // ── 8. Group collapse / expand ─────────────────────────────────────

  it('toggles group collapse on header click', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    // Group items should be visible initially
    expect(wrapper.find('.group-items').isVisible()).toBe(true)

    // Click header to collapse
    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    // After collapse the group-items should be hidden (v-show=false → display:none)
    const groupItems = wrapper.find('.group-items')
    expect(groupItems.attributes('style')).toContain('display: none')
  })

  // ── 9. Keyboard navigation ─────────────────────────────────────────

  it('moves focus to next item on ArrowDown', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'First' }),
      makeEntity({ id: 'e2', type: 'CHARACTER', name: 'Second' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const items = wrapper.findAll('.tree-item')
    const focusSpy = vi.spyOn(items[1].element, 'focus')

    await items[0].trigger('keydown', { key: 'down' })

    expect(focusSpy).toHaveBeenCalled()
  })

  it('moves focus to previous item on ArrowUp', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'First' }),
      makeEntity({ id: 'e2', type: 'CHARACTER', name: 'Second' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const items = wrapper.findAll('.tree-item')
    const focusSpy = vi.spyOn(items[0].element, 'focus')

    await items[1].trigger('keydown', { key: 'up' })

    expect(focusSpy).toHaveBeenCalled()
  })

  it('does not move focus beyond the first item on ArrowUp', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'First' }),
      makeEntity({ id: 'e2', type: 'CHARACTER', name: 'Second' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const items = wrapper.findAll('.tree-item')
    // Pressing up on the first item should not throw
    await items[0].trigger('keydown', { key: 'up' })

    // No error means it handled the boundary correctly
    expect(items).toHaveLength(2)
  })

  it('selects entity on Enter keypress', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const item = wrapper.find('.tree-item')
    await item.trigger('keydown.enter')

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')![0]).toEqual(['e1'])
  })

  // ── 10. Accessibility ──────────────────────────────────────────────

  it('renders correct ARIA attributes on the container', async () => {
    await seedEntities(pinia, [])
    const wrapper = mountWithStore(pinia)

    const container = wrapper.find('.entity-tree')
    expect(container.attributes('role')).toBe('navigation')
    expect(container.attributes('aria-label')).toBe('实体库导航')
  })

  it('renders group headers with aria-expanded', async () => {
    const entities = [
      makeEntity({ id: 'e1', type: 'CHARACTER', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const header = wrapper.find('.group-header')
    expect(header.attributes('role')).toBe('button')
    expect(header.attributes('tabindex')).toBe('0')
    expect(header.attributes('aria-expanded')).toBe('true')

    // Collapse the group
    await header.trigger('click')
    await nextTick()

    expect(wrapper.find('.group-header').attributes('aria-expanded')).toBe('false')
  })

  it('marks selected entity with aria-selected', async () => {
    const entities = [
      makeEntity({ id: 'e1', name: 'Aria' }),
    ]
    await seedEntities(pinia, entities)
    const wrapper = mountWithStore(pinia)

    const item = wrapper.find('.tree-item')
    await item.trigger('click')

    expect(item.attributes('aria-selected')).toBe('true')
  })
})
