import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePluginStore } from './plugin'

export const useThemeStore = defineStore('theme', () => {
  const pluginStore = usePluginStore()
  const activeThemeId = ref(
    typeof window !== 'undefined'
      ? (localStorage.getItem('active-theme-id') || 'builtin-scifi-dark')
      : 'builtin-scifi-dark'
  )

  watch(activeThemeId, (newId) => {
    localStorage.setItem('active-theme-id', newId)
    applyTheme()
  })

  function applyTheme() {
    const registries = pluginStore.getRegistries()
    // Find the theme in the registry
    const theme = registries.theme.get(activeThemeId.value)
    if (!theme) return

    // 1. Toggle dark class
    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
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
