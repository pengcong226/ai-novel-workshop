import { ref, onMounted, onUnmounted, computed } from 'vue'

/**
 * Canonical breakpoint values matching responsive.scss:
 *   mobile:  768px   (phones / tablet portrait)
 *   tablet:  1024px  (tablet landscape / small desktop)
 *   desktop: 1280px  (standard desktop and up)
 *
 * Legacy aliases (sm, md, lg, xl, 2xl) are kept for backward compatibility.
 */
const BREAKPOINTS = {
  // Canonical
  mobile:  768,
  tablet:  1024,
  desktop: 1280,
  // Legacy aliases
  sm:  768,
  md:  768,
  lg:  900,
  xl:  1024,
  '2xl': 1280,
} as const

type CanonicalKey = 'mobile' | 'tablet' | 'desktop'
type LegacyKey = 'sm' | 'md' | 'lg' | 'xl' | '2xl'
type BreakpointKey = CanonicalKey | LegacyKey

export function useBreakpoint() {
  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

  let cleanup: (() => void) | null = null

  onMounted(() => {
    const handler = () => {
      width.value = window.innerWidth
    }
    window.addEventListener('resize', handler, { passive: true })
    cleanup = () => window.removeEventListener('resize', handler)
    // Sync immediately in case SSR initial value was stale
    width.value = window.innerWidth
  })

  onUnmounted(() => {
    cleanup?.()
  })

  // ── Canonical boolean flags (true = viewport >= breakpoint) ────
  const isMobileUp  = computed(() => width.value >= BREAKPOINTS.mobile)
  const isTabletUp  = computed(() => width.value >= BREAKPOINTS.tablet)
  const isDesktopUp = computed(() => width.value >= BREAKPOINTS.desktop)

  // Legacy aliases
  const sm  = isMobileUp
  const md  = isMobileUp
  const lg  = computed(() => width.value >= BREAKPOINTS.lg)
  const xl  = isTabletUp
  const xxl = isDesktopUp

  // ── Canonical "below" helpers (true = viewport < breakpoint) ───
  const isMobileBelow  = computed(() => width.value < BREAKPOINTS.mobile)
  const isTabletBelow  = computed(() => width.value < BREAKPOINTS.tablet)
  const isDesktopBelow = computed(() => width.value < BREAKPOINTS.desktop)

  // Legacy aliases
  const belowSm  = isMobileBelow
  const belowMd  = isMobileBelow
  const belowLg  = computed(() => width.value < BREAKPOINTS.lg)
  const belowXl  = isTabletBelow
  const below2xl = isDesktopBelow

  // ── Current breakpoint label (canonical) ───────────────────────
  const current = computed<CanonicalKey>(() => {
    if (width.value >= BREAKPOINTS.desktop) return 'desktop'
    if (width.value >= BREAKPOINTS.tablet)  return 'tablet'
    return 'mobile'
  })

  // ── Convenience booleans ──────────────────────────────────────
  const isMobile  = computed(() => width.value < BREAKPOINTS.mobile)
  const isTablet  = computed(() => width.value >= BREAKPOINTS.mobile && width.value < BREAKPOINTS.tablet)
  const isDesktop = computed(() => width.value >= BREAKPOINTS.desktop)

  return {
    width,
    // Canonical flags (>= breakpoint)
    isMobileUp,
    isTabletUp,
    isDesktopUp,
    // Legacy flags (>= breakpoint)
    sm,
    md,
    lg,
    xl,
    xxl,
    // Canonical "below" (< breakpoint)
    isMobileBelow,
    isTabletBelow,
    isDesktopBelow,
    // Legacy "below"
    belowSm,
    belowMd,
    belowLg,
    belowXl,
    below2xl,
    // Current canonical label
    current,
    // Convenience
    isMobile,
    isTablet,
    isDesktop,
  }
}
