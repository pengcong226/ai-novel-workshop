/**
 * Theme state management store.
 *
 * Manages the active theme ID and applies CSS variables / dark-mode
 * classes to the document root.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useThemeStore } from '@/stores/theme'
 * import { storeToRefs } from 'pinia'
 * const { activeThemeId } = storeToRefs(useThemeStore())
 * ```
 *
 * @module stores/theme
 */

import { defineStore } from 'pinia'
import { ref, watch, type Ref } from 'vue'
import { usePluginStore } from './plugin'
import { sanitizeThemeCss } from '@/utils/cssSanitizer'

const DEFAULT_THEME_ID = 'builtin-classic-light-theme'

/** Snapshot of the default theme state for `$reset()`. */
const DEFAULT_STATE = {
  activeThemeId: (typeof window !== 'undefined'
    ? window.localStorage.getItem('active-theme-id')
    : null) || DEFAULT_THEME_ID,
} as const

export const useThemeStore = defineStore('theme', () => {
  const pluginStore = usePluginStore()

  /** Currently active theme identifier */
  const activeThemeId: Ref<string> = ref(DEFAULT_STATE.activeThemeId)

  watch(activeThemeId, (newId) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('active-theme-id', newId)
    }
    applyTheme()
  })

  /**
   * Apply the current theme's CSS variables and dark-mode class
   * to `document.documentElement`. No-op in SSR environments.
   */
  function applyTheme(): void {
    if (typeof document === 'undefined') return

    const registries = pluginStore.getRegistries()
    const theme = registries.theme.get(activeThemeId.value)
    if (!theme) return

    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }

    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.cssVariables)) {
      root.style.setProperty(key, value)
    }

    let styleTag = document.getElementById('plugin-theme-css')
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'plugin-theme-css'
      document.head.appendChild(styleTag)
    }
    styleTag.innerHTML = sanitizeThemeCss(theme.globalCss || '')
  }

  /**
   * Reset the theme store to its initial state and re-apply the
   * default theme.
   */
  function $reset(): void {
    activeThemeId.value = DEFAULT_STATE.activeThemeId
    applyTheme()
  }

  return { activeThemeId, applyTheme, $reset }
})
