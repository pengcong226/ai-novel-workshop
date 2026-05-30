import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useBreakpoint } from './useBreakpoint'

/**
 * Mount a component that uses useBreakpoint and exposes the result.
 */
function mountBreakpoint() {
  let result!: ReturnType<typeof useBreakpoint>

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useBreakpoint()
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, ...result }
}

/**
 * Helper: set innerWidth and fire the resize event.
 */
function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('useBreakpoint', () => {
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    // Default to a desktop width before each test
    setInnerWidth(1440)
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
    vi.restoreAllMocks()
  })

  it('initializes width from window.innerWidth', () => {
    setInnerWidth(1024)
    const { width } = mountBreakpoint()
    expect(width.value).toBe(1024)
  })

  it('reports isDesktop true when width >= 1280', () => {
    setInnerWidth(1440)
    const { isDesktop } = mountBreakpoint()
    expect(isDesktop.value).toBe(true)
  })

  it('reports isDesktop false when width < 1280', () => {
    setInnerWidth(1024)
    const { isDesktop } = mountBreakpoint()
    expect(isDesktop.value).toBe(false)
  })

  it('reports isMobile true when width < 768', () => {
    setInnerWidth(375)
    const { isMobile } = mountBreakpoint()
    expect(isMobile.value).toBe(true)
  })

  it('reports isMobile false when width >= 768', () => {
    setInnerWidth(768)
    const { isMobile } = mountBreakpoint()
    expect(isMobile.value).toBe(false)
  })

  it('reports isTablet true when 768 <= width < 1024', () => {
    setInnerWidth(900)
    const { isTablet } = mountBreakpoint()
    expect(isTablet.value).toBe(true)
  })

  it('reports isTablet false when width < 768', () => {
    setInnerWidth(500)
    const { isTablet } = mountBreakpoint()
    expect(isTablet.value).toBe(false)
  })

  it('reports isTablet false when width >= 1024', () => {
    setInnerWidth(1100)
    const { isTablet } = mountBreakpoint()
    expect(isTablet.value).toBe(false)
  })

  it('current returns "mobile" when width < 768', () => {
    setInnerWidth(500)
    const { current } = mountBreakpoint()
    expect(current.value).toBe('mobile')
  })

  it('current returns "tablet" when 1024 <= width < 1280', () => {
    setInnerWidth(1100)
    const { current } = mountBreakpoint()
    expect(current.value).toBe('tablet')
  })

  it('current returns "desktop" when width >= 1280', () => {
    setInnerWidth(1440)
    const { current } = mountBreakpoint()
    expect(current.value).toBe('desktop')
  })

  it('isMobileUp is true when width >= 768', () => {
    setInnerWidth(768)
    const { isMobileUp } = mountBreakpoint()
    expect(isMobileUp.value).toBe(true)
  })

  it('isMobileUp is false when width < 768', () => {
    setInnerWidth(500)
    const { isMobileUp } = mountBreakpoint()
    expect(isMobileUp.value).toBe(false)
  })

  it('isDesktopBelow is true when width < 1280', () => {
    setInnerWidth(1024)
    const { isDesktopBelow } = mountBreakpoint()
    expect(isDesktopBelow.value).toBe(true)
  })

  it('isDesktopBelow is false when width >= 1280', () => {
    setInnerWidth(1280)
    const { isDesktopBelow } = mountBreakpoint()
    expect(isDesktopBelow.value).toBe(false)
  })
})
