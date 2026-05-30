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

  // ---- Card progress elements ---------------------------------------------

  it('renders progress label and bar inside each card', () => {
    const wrapper = createWrapper({ variant: 'card', count: 2 })

    // Each card has exactly one progress label and one progress bar
    expect(wrapper.findAll('.skel-progress-label')).toHaveLength(2)
    expect(wrapper.findAll('.skel-progress-bar')).toHaveLength(2)
    // Both carry the skeleton animation class
    expect(wrapper.findAll('.skel-progress-label.skeleton')).toHaveLength(2)
    expect(wrapper.findAll('.skel-progress-bar.skeleton')).toHaveLength(2)
  })

  it('renders three tags per card (two normal + one date)', () => {
    const wrapper = createWrapper({ variant: 'card', count: 1 })

    const tags = wrapper.findAll('.skel-tag')
    // 2 regular tags + 1 date tag = 3 per card
    expect(tags).toHaveLength(3)
    expect(wrapper.findAll('.skel-tag--date')).toHaveLength(1)
  })

  // ---- List variant detail elements ----------------------------------------

  it('renders list variant with divider, chapter metadata, and action buttons', () => {
    const wrapper = createWrapper({ variant: 'list', count: 1 })

    expect(wrapper.find('.skel-divider').exists()).toBe(true)
    expect(wrapper.find('.skel-chapter-num').exists()).toBe(true)
    expect(wrapper.find('.skel-chapter-title').exists()).toBe(true)
    // Action row with 2 normal buttons + 1 wide button
    expect(wrapper.find('.skel-row--actions').exists()).toBe(true)
    expect(wrapper.findAll('.skel-btn')).toHaveLength(3)
    expect(wrapper.findAll('.skel-btn--wide')).toHaveLength(1)
  })

  // ---- Text line width values ----------------------------------------------

  it('assigns correct preset widths to text lines in order', () => {
    const expectedWidths = ['100%', '90%', '75%', '95%', '60%']
    const wrapper = createWrapper({ variant: 'text', count: 5 })

    const lines = wrapper.findAll('.skel-row--text')
    lines.forEach((line, i) => {
      expect(line.attributes('style')).toContain(`width: ${expectedWidths[i]}`)
    })
  })

  it('wraps text line widths when count exceeds preset array length', () => {
    const wrapper = createWrapper({ variant: 'text', count: 7 })

    const lines = wrapper.findAll('.skel-row--text')
    // Line 6 (index 5) wraps to widths[0] = '100%', line 7 (index 6) to widths[1] = '90%'
    expect(lines[5].attributes('style')).toContain('width: 100%')
    expect(lines[6].attributes('style')).toContain('width: 90%')
  })

  // ---- Tree group header sub-elements --------------------------------------

  it('renders icon, label, and count inside each tree group header', () => {
    const wrapper = createWrapper({ variant: 'tree', count: 2, groupItems: 1 })

    // Each of the 2 groups has one header with icon, label, and count
    expect(wrapper.findAll('.skel-tree-icon')).toHaveLength(2)
    expect(wrapper.findAll('.skel-tree-label')).toHaveLength(2)
    expect(wrapper.findAll('.skel-tree-count')).toHaveLength(2)
    // All carry the skeleton animation class
    expect(wrapper.findAll('.skel-tree-icon.skeleton')).toHaveLength(2)
    expect(wrapper.findAll('.skel-tree-label.skeleton')).toHaveLength(2)
    expect(wrapper.findAll('.skel-tree-count.skeleton')).toHaveLength(2)
  })

  // ---- Tree variant with default groupItems --------------------------------

  it('defaults tree groupItems to 2 when omitted', () => {
    const wrapper = createWrapper({ variant: 'tree', count: 3 })

    // 3 groups x 2 default items = 6 tree items
    expect(wrapper.findAll('.skel-tree-item')).toHaveLength(6)
  })

  // ---- Editor line width wrapping ------------------------------------------

  it('wraps editor line widths when count exceeds preset array length', () => {
    const wrapper = createWrapper({ variant: 'editor', count: 10 })

    const lines = wrapper.findAll('.skel-row--editor-line')
    // 8 presets; line 9 (index 8) wraps to widths[0] = '92%'
    // line 10 (index 9) wraps to widths[1] = '88%'
    expect(lines[8].attributes('style')).toContain('width: 92%')
    expect(lines[9].attributes('style')).toContain('width: 88%')
  })

  // ---- Count of 1 (edge case) ----------------------------------------------

  it('renders correctly with count of 1 for list variant', () => {
    const wrapper = createWrapper({ variant: 'list', count: 1 })

    expect(wrapper.findAll('.skel-list-item')).toHaveLength(1)
    expect(wrapper.findAll('.skel-handle')).toHaveLength(1)
    expect(wrapper.findAll('.skel-btn')).toHaveLength(3)
  })
})
