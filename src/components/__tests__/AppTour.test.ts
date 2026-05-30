import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestPinia } from '@/test/helpers'
import type { TourStep } from '@/components/AppTour.vue'

// ---------------------------------------------------------------------------
// Mocks (must precede component imports)
// ---------------------------------------------------------------------------

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@element-plus/icons-vue', () => ({
  Close: { name: 'Close', template: '<span />' },
}))

import AppTour from '@/components/AppTour.vue'

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const ElButtonStub = {
  name: 'ElButton',
  props: ['type', 'size', 'disabled'],
  emits: ['click'],
  template: '<button class="el-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
}

const ElIconStub = {
  name: 'ElIcon',
  template: '<span class="el-icon-stub"><slot /></span>',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSteps(): TourStep[] {
  return [
    { target: '#step-1', title: '第一步标题', description: '第一步描述内容' },
    { target: '#step-2', title: '第二步标题', description: '第二步描述内容' },
    { target: '#step-3', title: '第三步标题', description: '第三步描述内容' },
  ]
}

function createTargetElement(id: string, rect?: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)

  const defaultRect: DOMRect = {
    top: 100,
    left: 50,
    width: 200,
    height: 80,
    right: 250,
    bottom: 180,
    x: 50,
    y: 100,
    toJSON() {},
  }

  el.getBoundingClientRect = vi.fn(() => ({ ...defaultRect, ...rect } as DOMRect))
  return el
}

/**
 * Mount the tour starting closed (modelValue=false), then optionally open it.
 *
 * The component's Teleport renders to document.body, so we use
 * `attachTo: document.body` and query from `document.body` directly.
 */
function mountTour(_open = true, steps?: TourStep[]) {
  const wrapper = mount(AppTour, {
    attachTo: document.body,
    props: {
      modelValue: false,
      steps: steps ?? makeSteps(),
      'onUpdate:modelValue': (val: boolean) => wrapper.setProps({ modelValue: val }),
      onFinish: () => {},
      onClose: () => {},
    },
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElIcon: ElIconStub,
      },
    },
  })

  return { wrapper, openTour: () => openTour(wrapper as any) }
}

async function openTour(wrapper: ReturnType<typeof mount> & { setProps: (...args: unknown[]) => unknown }) {
  await wrapper.setProps({ modelValue: true })
  // The watcher fires, schedules nextTick(updateTargetRect).
  // First nextTick: updateTargetRect runs, sets targetRect.value.
  // Second nextTick: Vue processes the reactive change, updates DOM.
  await nextTick()
  await nextTick()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AppTour', () => {
  beforeEach(() => {
    createTestPinia()
  })

  afterEach(() => {
    // Clean up target elements and any DOM additions from the tour
    document.querySelectorAll('[id^="step-"]').forEach((el) => el.remove())
    // Remove tour overlay and related elements
    document.querySelectorAll('.app-tour-overlay, .app-tour-highlight, .app-tour-card').forEach((el) => el.remove())
  })

  // ---------------------------------------------------------------
  // 1. Does not render overlay when modelValue is false
  // ---------------------------------------------------------------

  it('does not render overlay when modelValue is false', () => {
    createTargetElement('step-1')
    const { wrapper } = mountTour(false)

    expect(document.querySelector('.app-tour-overlay')).toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 2. Renders overlay and card when opened with existing target
  // ---------------------------------------------------------------

  it('renders overlay and step card when opened with an existing target', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    expect(document.querySelector('.app-tour-overlay')).not.toBeNull()
    const card = document.querySelector('.app-tour-card')!
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('第一步标题')
    expect(card.textContent).toContain('第一步描述内容')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 3. Shows correct progress indicator on the first step
  // ---------------------------------------------------------------

  it('shows progress "1 / 3" on the first step', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const progress = document.querySelector('.app-tour-progress')!
    expect(progress).not.toBeNull()
    expect(progress.textContent).toBe('1 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 4. Next button navigates to the next step
  // ---------------------------------------------------------------

  it('navigates to the next step when clicking the next button', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    // Find "下一步" button in body (rendered via Teleport)
    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))
    const nextBtn = buttons().find((b) => b.textContent?.trim() === '下一步')!
    expect(nextBtn).toBeDefined()

    ;(nextBtn as HTMLElement).click()
    // nextStep() calls nextTick(updateTargetRect), so two nextTicks needed
    await nextTick()
    await nextTick()

    const card = document.querySelector('.app-tour-card')!
    expect(card.textContent).toContain('第二步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('2 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 5. Prev button navigates back to the previous step
  // ---------------------------------------------------------------

  it('navigates back when clicking the prev button', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Go to step 2
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    // Now click "上一步"
    const prevBtn = buttons().find((b) => b.textContent?.trim() === '上一步')!
    expect(prevBtn).toBeDefined()

    ;(prevBtn as HTMLElement).click()
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第一步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 6. Prev button is NOT shown on the first step
  // ---------------------------------------------------------------

  it('does not show prev button on the first step', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = Array.from(document.querySelectorAll('.el-button-stub'))
    const prevBtn = buttons.find((b) => b.textContent?.trim() === '上一步')
    expect(prevBtn).toBeUndefined()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 7. Finish button on last step emits "finish" and closes
  // ---------------------------------------------------------------

  it('shows finish button on the last step and emits finish', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    createTargetElement('step-3')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Navigate to step 2
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    // Navigate to step 3 (last)
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    // On the last step: "完成" button should exist, "下一步" should not
    const finishBtn = buttons().find((b) => b.textContent?.trim() === '完成')
    const nextBtnOnLast = buttons().find((b) => b.textContent?.trim() === '下一步')
    expect(finishBtn).toBeDefined()
    expect(nextBtnOnLast).toBeUndefined()

    ;(finishBtn as HTMLElement).click()
    await nextTick()

    expect(wrapper.emitted('finish')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 8. Skip button emits "close" and closes the tour
  // ---------------------------------------------------------------

  it('closes the tour when skip button is clicked', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = Array.from(document.querySelectorAll('.el-button-stub'))
    const skipBtn = buttons.find((b) => b.textContent?.trim() === '跳过')!
    expect(skipBtn).toBeDefined()

    ;(skipBtn as HTMLElement).click()
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 9. Close (X) button emits "close" and closes the tour
  // ---------------------------------------------------------------

  it('closes the tour when the close (X) button is clicked', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const closeBtn = document.querySelector('.app-tour-close') as HTMLElement
    expect(closeBtn).not.toBeNull()

    closeBtn.click()
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 10. Overlay click emits "close"
  // ---------------------------------------------------------------

  it('closes the tour when the overlay is clicked', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const overlay = document.querySelector('.app-tour-overlay') as HTMLElement
    expect(overlay).not.toBeNull()

    // Use dispatchEvent for a direct click (not on a child)
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: false }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 11. Highlight area has correct position and size
  // ---------------------------------------------------------------

  it('renders highlight area with correct position and size', async () => {
    createTargetElement('step-1', { top: 50, left: 30, width: 200, height: 100 })
    const { wrapper, openTour } = mountTour()
    await openTour()

    const highlight = document.querySelector('.app-tour-highlight') as HTMLElement
    expect(highlight).not.toBeNull()

    // padding is 6px in the component
    expect(highlight.style.top).toBe('44px')     // 50 - 6
    expect(highlight.style.left).toBe('24px')    // 30 - 6
    expect(highlight.style.width).toBe('212px')  // 200 + 12
    expect(highlight.style.height).toBe('112px') // 100 + 12
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 12. Tour resets to step 0 when reopened
  // ---------------------------------------------------------------

  it('resets to step 0 when tour is reopened after closing', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Navigate to step 2
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('2 / 3')

    // Close the tour
    await wrapper.setProps({ modelValue: false })
    await nextTick()

    // Reopen
    await wrapper.setProps({ modelValue: true })
    await nextTick()
    await nextTick()

    // Should be back on step 1
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')
    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第一步标题')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 13. Does not render card when target element is missing
  // ---------------------------------------------------------------

  it('does not render the step card when target element does not exist', async () => {
    // No element with id "nonexistent" in the DOM
    const { wrapper, openTour } = mountTour(true, [
      { target: '#nonexistent', title: 'Ghost', description: 'No target' },
    ])
    await openTour()

    // Overlay may render, but the card should not
    expect(document.querySelector('.app-tour-card')).toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 14. Keyboard Escape closes the tour
  // ---------------------------------------------------------------

  it('closes the tour when Escape key is pressed', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([false])
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 15. Keyboard ArrowRight advances to next step
  // ---------------------------------------------------------------

  it('navigates to the next step when ArrowRight key is pressed', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第二步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('2 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 16. Keyboard ArrowLeft goes back to previous step
  // ---------------------------------------------------------------

  it('navigates to the previous step when ArrowLeft key is pressed', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    // Go to step 2 first
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    await nextTick()
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('2 / 3')

    // Go back with ArrowLeft
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第一步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 17. Keyboard Enter advances to next step
  // ---------------------------------------------------------------

  it('navigates to the next step when Enter key is pressed', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    const { wrapper, openTour } = mountTour()
    await openTour()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第二步标题')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 18. Keyboard events are ignored when tour is closed
  // ---------------------------------------------------------------

  it('ignores keyboard events when tour is closed', async () => {
    createTargetElement('step-1')
    const { wrapper } = mountTour(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()

    // No overlay rendered, no events emitted
    expect(document.querySelector('.app-tour-overlay')).toBeNull()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 19. Target resolved via Ref object
  // ---------------------------------------------------------------

  it('renders step card when target is a Ref object', async () => {
    const el = createTargetElement('ref-target')
    const refTarget = { value: el }

    const { wrapper, openTour } = mountTour(true, [
      { target: refTarget, title: 'Ref 标题', description: 'Ref 描述' },
    ])
    await openTour()

    const card = document.querySelector('.app-tour-card')
    expect(card).not.toBeNull()
    expect(card!.textContent).toContain('Ref 标题')
    expect(card!.textContent).toContain('Ref 描述')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 20. Card is positioned below target when space is sufficient
  // ---------------------------------------------------------------

  it('positions card below target when there is enough viewport space', async () => {
    createTargetElement('step-1', { top: 50, bottom: 130, height: 80 })
    const { wrapper, openTour } = mountTour()
    await openTour()

    const card = document.querySelector('.app-tour-card') as HTMLElement
    expect(card).not.toBeNull()

    // Component logic: top = r.bottom + gap (12) = 130 + 12 = 142
    expect(card.style.top).toBe('142px')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 21. Card is positioned above target when not enough space below
  // ---------------------------------------------------------------

  it('positions card above target when viewport space below is insufficient', async () => {
    // Place target near bottom of viewport so below-position overflows
    const nearBottomTop = window.innerHeight - 50
    createTargetElement('step-1', {
      top: nearBottomTop,
      bottom: nearBottomTop + 30,
      height: 30,
    })
    const { wrapper, openTour } = mountTour()
    await openTour()

    const card = document.querySelector('.app-tour-card') as HTMLElement
    expect(card).not.toBeNull()

    // Component logic: top + 200 > viewportH triggers above-placement
    // top = Math.max(gap(12), r.top - gap(12) - 160)
    const expectedTop = Math.max(12, nearBottomTop - 12 - 160)
    expect(card.style.top).toBe(`${expectedTop}px`)
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 22. Icon component is rendered in step header when provided
  // ---------------------------------------------------------------

  it('renders icon component in the step header when step has an icon', async () => {
    createTargetElement('step-1')
    const IconComponent = { name: 'TestIcon', template: '<span class="test-icon" />' }
    const stepsWithIcon: TourStep[] = [
      { target: '#step-1', title: '带图标', description: '有图标步骤', icon: IconComponent },
    ]
    const { wrapper, openTour } = mountTour(true, stepsWithIcon)
    await openTour()

    const card = document.querySelector('.app-tour-card')!
    const iconEl = card.querySelector('.test-icon')
    expect(iconEl).not.toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 23. Navigate through all steps and finish from the last
  // ---------------------------------------------------------------

  it('navigates through all steps sequentially and finishes on the last', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    createTargetElement('step-3')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Step 1 -> 2
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('2 / 3')

    // Step 2 -> 3
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('3 / 3')

    // Finish from step 3
    const finishBtn = buttons().find((b) => b.textContent?.trim() === '完成')!
    ;(finishBtn as HTMLElement).click()
    await nextTick()

    expect(wrapper.emitted('finish')).toBeTruthy()
    expect(document.querySelector('.app-tour-overlay')).toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 24. Single-step tour shows only finish button (no next/skip/prev)
  // ---------------------------------------------------------------

  it('shows only the finish button on a single-step tour', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour(true, [
      { target: '#step-1', title: '唯一', description: '单步' },
    ])
    await openTour()

    const buttons = Array.from(document.querySelectorAll('.el-button-stub'))
    const texts = buttons.map((b) => b.textContent?.trim())

    expect(texts).toContain('完成')
    expect(texts).not.toContain('下一步')
    expect(texts).not.toContain('跳过')
    expect(texts).not.toContain('上一步')

    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 1')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 25. ArrowLeft on first step does not change step
  // ---------------------------------------------------------------

  it('does not navigate when ArrowLeft is pressed on the first step', async () => {
    createTargetElement('step-1')
    const { wrapper, openTour } = mountTour()
    await openTour()

    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    await nextTick()

    // Still on step 1
    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第一步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('1 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 26. Enter key on last step does not error (nextStep is no-op)
  // ---------------------------------------------------------------

  it('does not advance beyond the last step when Enter is pressed', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    createTargetElement('step-3')
    const { wrapper, openTour } = mountTour()
    await openTour()

    // Navigate to last step
    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('3 / 3')

    // Press Enter on last step -- should be a no-op in nextStep()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()
    await nextTick()

    // Still on step 3
    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第三步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('3 / 3')
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 27. Ref target with undefined value does not render card
  // ---------------------------------------------------------------

  it('does not render the card when Ref target value is undefined', async () => {
    const refTarget = { value: undefined }
    const { wrapper, openTour } = mountTour(true, [
      { target: refTarget, title: '空 Ref', description: '不会显示' },
    ])
    await openTour()

    expect(document.querySelector('.app-tour-card')).toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 28. Skip button is not shown on the last step
  // ---------------------------------------------------------------

  it('does not show skip button on the last step', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    createTargetElement('step-3')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Navigate to step 2
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    // Navigate to step 3 (last)
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    // On last step: skip button should be absent
    const skipBtn = buttons().find((b) => b.textContent?.trim() === '跳过')
    expect(skipBtn).toBeUndefined()

    // Finish button should be present
    const finishBtn = buttons().find((b) => b.textContent?.trim() === '完成')
    expect(finishBtn).toBeDefined()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 29. Card is clamped horizontally when target is near left edge
  // ---------------------------------------------------------------

  it('clamps card position horizontally so it does not overflow viewport', async () => {
    // Target near the left edge of the viewport -- card would overflow left
    createTargetElement('step-1', {
      top: 100,
      bottom: 180,
      left: 0,
      right: 50,
      width: 50,
      height: 80,
    })
    const { wrapper, openTour } = mountTour()
    await openTour()

    const card = document.querySelector('.app-tour-card') as HTMLElement
    expect(card).not.toBeNull()

    // left should be clamped to gap (12px) instead of a negative value
    const leftValue = parseInt(card.style.left, 10)
    expect(leftValue).toBeGreaterThanOrEqual(12)
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 30. Highlight element is not rendered when target is missing
  // ---------------------------------------------------------------

  it('does not render highlight when target element is missing', async () => {
    const { wrapper, openTour } = mountTour(true, [
      { target: '#does-not-exist', title: 'Ghost', description: 'No target' },
    ])
    await openTour()

    expect(document.querySelector('.app-tour-highlight')).toBeNull()
    wrapper.unmount()
  })

  // ---------------------------------------------------------------
  // 31. ArrowRight on last step is a no-op (no error, no step change)
  // ---------------------------------------------------------------

  it('does not navigate when ArrowRight is pressed on the last step', async () => {
    createTargetElement('step-1')
    createTargetElement('step-2')
    createTargetElement('step-3')
    const { wrapper, openTour } = mountTour()
    await openTour()

    const buttons = () => Array.from(document.querySelectorAll('.el-button-stub'))

    // Navigate to last step
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()
    ;(buttons().find((b) => b.textContent?.trim() === '下一步')! as HTMLElement).click()
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('3 / 3')

    // ArrowRight on last step
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    await nextTick()

    expect(document.querySelector('.app-tour-card')!.textContent).toContain('第三步标题')
    expect(document.querySelector('.app-tour-progress')!.textContent).toBe('3 / 3')
    wrapper.unmount()
  })
})
