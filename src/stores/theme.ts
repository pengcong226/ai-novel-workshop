import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePluginStore } from './plugin'

const DEFAULT_THEME_ID = 'builtin-classic-light-theme'

export const useThemeStore = defineStore('theme', () => {
  const pluginStore = usePluginStore()
  const storedThemeId = typeof window !== 'undefined'
    ? window.localStorage.getItem('active-theme-id')
    : null
  const activeThemeId = ref(storedThemeId || DEFAULT_THEME_ID)

  watch(activeThemeId, (newId) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('active-theme-id', newId)
    }
    applyTheme()
  })

  function applyTheme() {
    if (typeof document === 'undefined') return

    const registries = pluginStore.getRegistries()
    // Find the theme in the registry
    const theme = registries.theme.get(activeThemeId.value)
    if (!theme) return

    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }

    // 2. Inject CSS Variables
    const root = document.documentElement
    for (const [key, value] of Object.entries(theme.cssVariables)) {
      root.style.setProperty(key, value)
    }

    // 3. Inject Global CSS
    let styleTag = document.getElementById('plugin-theme-css')
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'plugin-theme-css'
      document.head.appendChild(styleTag)
    }
    styleTag.innerHTML = theme.globalCss || ''
  }

  return { activeThemeId, applyTheme }
})
