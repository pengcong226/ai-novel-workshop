import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'

describe('LoadingSkeleton', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // --- Default props ---

  it('renders with default variant "card" and count 3', () => {
    const wrapper = mount(LoadingSkeleton)

    expect(wrapper.find('.loading-skeleton--card').exists()).toBe(true)
    expect(wrapper.findAll('.skel-card')).toHaveLength(3)
  })

  // --- Variant: card ---

  it('renders card variant with correct structure', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'card', count: 2 },
    })

    const cards = wrapper.findAll('.skel-card')
    expect(cards).toHaveLength(2)

    // Each card should have accent and body
    for (const card of cards) {
      expect(card.find('.skel-card__accent').exists()).toBe(true)
      expect(card.find('.skel-card__body').exists()).toBe(true)
      expect(card.find('.skel-row--title').exists()).toBe(true)
    }
  })

  // --- Variant: list ---

  it('renders list variant with correct structure', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'list', count: 2 },
    })

    expect(wrapper.find('.loading-skeleton--list').exists()).toBe(true)
    const items = wrapper.findAll('.skel-list-item')
    expect(items).toHaveLength(2)

    for (const item of items) {
      expect(item.find('.skel-list-item__accent').exists()).toBe(true)
      expect(item.find('.skel-list-item__body').exists()).toBe(true)
    }
  })

  // --- Variant: editor ---

  it('renders editor variant with toolbar and content lines', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'editor', count: 4 },
    })

    expect(wrapper.find('.loading-skeleton--editor').exists()).toBe(true)
    expect(wrapper.find('.skel-editor').exists()).toBe(true)

    // Toolbar has 6 tool buttons (hardcoded)
    expect(wrapper.findAll('.skel-tool-btn')).toHaveLength(6)

    // Content has `count` lines
    expect(wrapper.findAll('.skel-row--editor-line')).toHaveLength(4)
  })

  // --- Variant: tree ---

  it('renders tree variant with groups and groupItems', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'tree', count: 3, groupItems: 2 },
    })

    expect(wrapper.find('.loading-skeleton--tree').exists()).toBe(true)
    expect(wrapper.find('.skel-tree').exists()).toBe(true)

    // Should render `count` groups
    expect(wrapper.findAll('.skel-tree-group')).toHaveLength(3)

    // Each group should have `groupItems` items
    const allItems = wrapper.findAll('.skel-tree-item')
    expect(allItems).toHaveLength(3 * 2)
  })

  // --- Variant: text ---

  it('renders text variant with varied line widths', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'text', count: 5 },
    })

    expect(wrapper.find('.loading-skeleton--text').exists()).toBe(true)
    const lines = wrapper.findAll('.skel-row--text')
    expect(lines).toHaveLength(5)

    // Each line should have a width style applied
    for (const line of lines) {
      expect(line.attributes('style')).toContain('width:')
    }
  })

  // --- Variant: compact ---

  it('renders compact variant with correct items', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'compact', count: 4 },
    })

    expect(wrapper.find('.loading-skeleton--compact').exists()).toBe(true)
    expect(wrapper.findAll('.skel-row--compact')).toHaveLength(4)
  })

  // --- Count prop ---

  it('respects count prop for card variant', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'card', count: 5 },
    })

    expect(wrapper.findAll('.skel-card')).toHaveLength(5)
  })

  it('renders zero items when count is 0', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'card', count: 0 },
    })

    expect(wrapper.findAll('.skel-card')).toHaveLength(0)
  })

  it('renders single item when count is 1', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'text', count: 1 },
    })

    expect(wrapper.findAll('.skel-row--text')).toHaveLength(1)
  })

  // --- Skeleton CSS class (shimmer) ---

  it('applies .skeleton class to shape elements for shimmer effect', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'card', count: 1 },
    })

    // Card accent should have skeleton class
    expect(wrapper.find('.skel-card__accent.skeleton').exists()).toBe(true)

    // Title row should have skeleton class
    expect(wrapper.find('.skel-row--title.skeleton').exists()).toBe(true)

    // Tags should have skeleton class
    expect(wrapper.findAll('.skel-tag.skeleton').length).toBeGreaterThanOrEqual(2)
  })

  it('applies .skeleton class in list variant', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'list', count: 1 },
    })

    expect(wrapper.find('.skel-handle.skeleton').exists()).toBe(true)
    expect(wrapper.find('.skel-chapter-num.skeleton').exists()).toBe(true)
    expect(wrapper.find('.skel-chapter-title.skeleton').exists()).toBe(true)
  })

  // --- Width prop ---

  it('applies width style to container', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { width: '300px' },
    })

    expect(wrapper.attributes('style')).toContain('width: 300px')
  })

  it('defaults width to 100%', () => {
    const wrapper = mount(LoadingSkeleton)

    expect(wrapper.attributes('style')).toContain('width: 100%')
  })

  // --- groupItems prop ---

  it('uses default groupItems of 2 for tree variant', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'tree', count: 1 },
    })

    expect(wrapper.findAll('.skel-tree-item')).toHaveLength(2)
  })

  it('respects custom groupItems for tree variant', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'tree', count: 1, groupItems: 4 },
    })

    expect(wrapper.findAll('.skel-tree-item')).toHaveLength(4)
  })

  // --- Editor line width variation ---

  it('varies editor line widths for natural appearance', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'editor', count: 3 },
    })

    const lines = wrapper.findAll('.skel-row--editor-line')
    const widths = lines.map(l => l.attributes('style'))

    // Lines should have different widths
    const uniqueWidths = new Set(widths)
    expect(uniqueWidths.size).toBeGreaterThan(1)
  })

  // --- Text line width variation ---

  it('varies text line widths for natural appearance', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'text', count: 4 },
    })

    const lines = wrapper.findAll('.skel-row--text')
    const widths = lines.map(l => l.attributes('style'))

    const uniqueWidths = new Set(widths)
    expect(uniqueWidths.size).toBeGreaterThan(1)
  })
})
