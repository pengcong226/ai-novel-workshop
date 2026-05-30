import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestPinia } from '@/test/helpers'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'

/**
 * Helper: mount LoadingSkeleton with isolated Pinia (required by jsdom env)
 * and merge any optional props/attrs.
 */
function createWrapper(props: Record<string, unknown> = {}) {
  return mount(LoadingSkeleton, {
    props,
    global: {
      plugins: [createTestPinia()],
    },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoadingSkeleton', () => {
  beforeEach(() => {
    createTestPinia()
  })

  // ---- Variant rendering --------------------------------------------------

  it('renders card variant by default', () => {
    const wrapper = createWrapper()

    expect(wrapper.classes()).toContain('loading-skeleton--card')
    expect(wrapper.findAll('.skel-card')).toHaveLength(3) // default count
  })

  it('renders list variant with correct structure', () => {
    const wrapper = createWrapper({ variant: 'list', count: 2 })

    expect(wrapper.classes()).toContain('loading-skeleton--list')
    const items = wrapper.findAll('.skel-list-item')
    expect(items).toHaveLength(2)
    // Each list item has an accent bar and body with header
    expect(wrapper.findAll('.skel-list-item__accent')).toHaveLength(2)
    expect(wrapper.findAll('.skel-list-item__body')).toHaveLength(2)
    expect(wrapper.findAll('.skel-handle')).toHaveLength(2)
  })

  it('renders editor variant with toolbar and content lines', () => {
    const wrapper = createWrapper({ variant: 'editor', count: 4 })

    expect(wrapper.classes()).toContain('loading-skeleton--editor')
    expect(wrapper.find('.skel-editor').exists()).toBe(true)
    // Toolbar always shows 6 tool buttons regardless of count
    expect(wrapper.findAll('.skel-tool-btn')).toHaveLength(6)
    // Content lines match count
    expect(wrapper.findAll('.skel-row--editor-line')).toHaveLength(4)
  })

  it('renders tree variant with groups and items', () => {
    const wrapper = createWrapper({ variant: 'tree', count: 3, groupItems: 2 })

    expect(wrapper.classes()).toContain('loading-skeleton--tree')
    expect(wrapper.findAll('.skel-tree-group')).toHaveLength(3)
    // Each group has groupItems (default 2) children
    expect(wrapper.findAll('.skel-tree-item')).toHaveLength(3 * 2)
    // Static header elements
    expect(wrapper.find('.skel-row--title-sm').exists()).toBe(true)
    expect(wrapper.find('.skel-row--search').exists()).toBe(true)
  })

  it('renders text variant with varying line widths', () => {
    const wrapper = createWrapper({ variant: 'text', count: 5 })

    expect(wrapper.classes()).toContain('loading-skeleton--text')
    const lines = wrapper.findAll('.skel-row--text')
    expect(lines).toHaveLength(5)
    // The widths cycle through a preset array, so not all are identical
    const widths = lines.map((el) => el.attributes('style'))
    const uniqueWidths = new Set(widths)
    expect(uniqueWidths.size).toBeGreaterThan(1)
  })

  it('renders compact variant with small inline elements', () => {
    const wrapper = createWrapper({ variant: 'compact', count: 4 })

    expect(wrapper.classes()).toContain('loading-skeleton--compact')
    expect(wrapper.findAll('.skel-row--compact')).toHaveLength(4)
  })

  // ---- Count prop ---------------------------------------------------------

  it('respects count prop for card variant', () => {
    const wrapper = createWrapper({ variant: 'card', count: 5 })

    expect(wrapper.findAll('.skel-card')).toHaveLength(5)
  })

  it('defaults count to 3 when omitted', () => {
    const wrapper = createWrapper({ variant: 'text' })

    expect(wrapper.findAll('.skel-row--text')).toHaveLength(3)
  })

  // ---- Shimmer animation --------------------------------------------------

  it('applies skeleton (shimmer) class to animated elements', () => {
    const wrapper = createWrapper({ variant: 'card', count: 1 })

    // The root container itself does NOT have the skeleton class;
    // only the inner shape elements do.
    expect(wrapper.classes()).not.toContain('skeleton')
    // At least the accent, title, tags, and text rows carry it
    const skeletonEls = wrapper.findAll('.skeleton')
    expect(skeletonEls.length).toBeGreaterThan(0)
    // Verify a known shape element has it
    expect(wrapper.find('.skel-card__accent').classes()).toContain('skeleton')
    expect(wrapper.find('.skel-row--title').classes()).toContain('skeleton')
  })

  // ---- Width prop ---------------------------------------------------------

  it('applies width prop to container style', () => {
    const wrapper = createWrapper({ width: '50%' })

    expect(wrapper.attributes('style')).toContain('width: 50%')
  })

  it('defaults width to 100% when omitted', () => {
    const wrapper = createWrapper()

    expect(wrapper.attributes('style')).toContain('width: 100%')
  })

  // ---- Editor line width variation ----------------------------------------

  it('produces varying editor line widths across lines', () => {
    const wrapper = createWrapper({ variant: 'editor', count: 6 })

    const lines = wrapper.findAll('.skel-row--editor-line')
    const widths = lines.map((el) => el.attributes('style'))
    // The editorLineWidth function cycles through 8 presets;
    // 6 lines should yield at least 4 distinct widths
    const uniqueWidths = new Set(widths)
    expect(uniqueWidths.size).toBeGreaterThanOrEqual(4)
  })

  // ---- Tree groupItems prop -----------------------------------------------

  it('uses groupItems prop to control items per tree group', () => {
    const wrapper = createWrapper({ variant: 'tree', count: 2, groupItems: 4 })

    // 2 groups x 4 items = 8 tree items
    expect(wrapper.findAll('.skel-tree-item')).toHaveLength(8)
  })
})
