# V5 Theme Plugin Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a dynamic theme registry within the V1 Plugin Architecture, allowing users to swap between Classic Light and Sci-Fi Dark themes natively.

**Architecture:** Create a `ThemeRegistry` in `src/plugins/registries/theme-registry.ts`. Define the `ThemeExtension` type. Convert existing hardcoded CSS to plugin JS objects. Use a Pinia `ThemeStore` to inject CSS variables and classes at runtime in `App.vue`.

**Tech Stack:** Vue 3, Pinia, TypeScript, DOM API

---

### Task 1: Define Theme Extension Types

**Files:**
- Modify: `src/plugins/types.ts`

- [ ] **Step 1: Add ThemeExtension interface**
In `src/plugins/types.ts`, add the new interface:
```typescript
export interface ThemeExtension {
  id: string
  name: string
  description?: string
  mode: 'light' | 'dark'
  cssVariables: Record<string, string>
  globalCss?: string
  primaryColor?: string
}
```

- [ ] **Step 2: Add theme to PluginRegistries**
In `src/plugins/types.ts`, update `PluginRegistries` to include `theme`:
```typescript
import type { BaseRegistry } from './registries/index'

export interface PluginRegistries {
  aiProvider: BaseRegistry<AIProviderExtension>
  exporter: BaseRegistry<ExporterExtension>
  importer: BaseRegistry<ImporterExtension>
  processor: BaseRegistry<ProcessorExtension>
  menu: BaseRegistry<MenuExtension>
  sidebar: BaseRegistry<SidebarExtension>
  toolbar: BaseRegistry<ToolbarExtension>
  actionHandler: BaseRegistry<ActionHandlerExtension>
  quickCommand: BaseRegistry<QuickCommandExtension>
  theme: BaseRegistry<ThemeExtension>
}
```

- [ ] **Step 3: Commit**
```bash
git add src/plugins/types.ts
git commit -m "feat(plugins): define ThemeExtension types"
```

---

### Task 2: Create Theme Registry

**Files:**
- Create: `src/plugins/registries/theme-registry.ts`
- Modify: `src/plugins/manager.ts`

- [ ] **Step 1: Implement ThemeRegistry class**
Create `src/plugins/registries/theme-registry.ts`:
```typescript
import { BaseRegistry } from './index'
import type { ThemeExtension } from '../types'

export class ThemeRegistry extends BaseRegistry<ThemeExtension> {
  // Can add theme-specific validation here if needed
}
```

- [ ] **Step 2: Register in PluginManager**
In `src/plugins/manager.ts`, import and initialize the registry:
```typescript
import { ThemeRegistry } from './registries/theme-registry'
// ...
export class PluginManager {
  private registries = {
    // ... existing
    theme: new ThemeRegistry()
  }
  // ...
}
```

- [ ] **Step 3: Commit**
```bash
git add src/plugins/registries/theme-registry.ts src/plugins/manager.ts
git commit -m "feat(plugins): implement ThemeRegistry"
```

---

### Task 3: Create Built-in Theme Plugins

**Files:**
- Create: `src/plugins/builtin/scifi-dark-theme.ts`
- Create: `src/plugins/builtin/classic-light-theme.ts`
- Modify: `src/plugins/init.ts`

- [ ] **Step 1: Create Sci-Fi Dark Theme**
```typescript
// src/plugins/builtin/scifi-dark-theme.ts
import type { Plugin } from '../types'

export const scifiDarkThemePlugin: Plugin = {
  meta: {
    id: 'builtin-scifi-dark',
    name: 'Sci-Fi Dark Theme',
    version: '1.0.0',
    description: 'V5 Default Sci-Fi Glassmorphism theme',
    author: 'System'
  },
  setup(context) {
    context.registerTheme({
      id: 'scifi-dark',
      name: 'Sci-Fi Dark',
      mode: 'dark',
      primaryColor: '#3b82f6',
      cssVariables: {
        '--bg-base': '#0a0a0f',
        '--bg-panel': 'rgba(20, 20, 30, 0.7)',
        '--bg-panel-hover': 'rgba(30, 30, 45, 0.8)',
        '--border-color': 'rgba(60, 130, 246, 0.2)',
        '--border-glow': 'rgba(60, 130, 246, 0.5)',
        '--text-main': '#e2e8f0',
        '--text-muted': '#94a3b8',
        '--accent-primary': '#3b82f6',
        '--accent-glow': '#60a5fa',
        '--accent-secondary': '#8b5cf6',
        '--accent-success': '#10b981',
        '--accent-warning': '#f59e0b'
      },
      globalCss: `
body {
  background-image: radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%), radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 50%);
  background-attachment: fixed;
}
html.dark .el-card, html.dark .el-menu, html.dark .el-dialog, html.dark .el-tabs__nav-wrap {
  background-color: var(--bg-panel) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid var(--border-color) !important;
}
html.dark .el-input__wrapper, html.dark .el-textarea__inner {
  background-color: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: none !important;
}
html.dark .el-input__wrapper.is-focus, html.dark .el-textarea__inner:focus {
  border-color: var(--accent-glow) !important;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.3) !important;
}
      `
    })
  }
}
```

- [ ] **Step 2: Create Classic Light Theme**
```typescript
// src/plugins/builtin/classic-light-theme.ts
import type { Plugin } from '../types'

export const classicLightThemePlugin: Plugin = {
  meta: {
    id: 'builtin-classic-light',
    name: 'Classic Light Theme',
    version: '1.0.0',
    description: 'V4 Default Element Plus Light theme',
    author: 'System'
  },
  setup(context) {
    context.registerTheme({
      id: 'classic-light',
      name: 'Classic Light',
      mode: 'light',
      primaryColor: '#409eff',
      cssVariables: {
        '--bg-base': '#ffffff',
        '--bg-panel': '#ffffff',
        '--bg-panel-hover': '#f5f7fa',
        '--border-color': '#e4e7ed',
        '--border-glow': 'transparent',
        '--text-main': '#303133',
        '--text-muted': '#909399',
        '--accent-primary': '#409eff',
        '--accent-glow': '#409eff',
        '--accent-secondary': '#67c23a',
        '--accent-success': '#67c23a',
        '--accent-warning': '#e6a23c'
      },
      globalCss: `
body {
  background-image: none;
}
      `
    })
  }
}
```

- [ ] **Step 3: Register Built-in Themes**
In `src/plugins/init.ts`:
```typescript
import { scifiDarkThemePlugin } from './builtin/scifi-dark-theme'
import { classicLightThemePlugin } from './builtin/classic-light-theme'

export function getBuiltinPlugins(): Plugin[] {
  return [
    // ...
    scifiDarkThemePlugin,
    classicLightThemePlugin
  ]
}
```

- [ ] **Step 4: Provide registerTheme in Context**
In `src/plugins/context.ts`:
```typescript
export function createPluginContext(pluginId: string): PluginContext {
  const registries = pluginManager.getRegistries()
  return {
    // ...
    registerTheme: (extension) => registries.theme.register(pluginId, extension),
  }
}
```

- [ ] **Step 5: Commit**
```bash
git add src/plugins/builtin/ src/plugins/init.ts src/plugins/context.ts
git commit -m "feat(plugins): implement built-in light and dark themes"
```

---

### Task 4: Build Theme Store and Injector

**Files:**
- Create: `src/stores/theme.ts`
- Modify: `src/App.vue`
- Delete: `src/assets/styles/scifi-theme.css`
- Modify: `index.html`

- [ ] **Step 1: Create Theme Store**
```typescript
// src/stores/theme.ts
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePluginStore } from './plugin'

export const useThemeStore = defineStore('theme', () => {
  const pluginStore = usePluginStore()
  const activeThemeId = ref(localStorage.getItem('active-theme-id') || 'scifi-dark')

  watch(activeThemeId, (newId) => {
    localStorage.setItem('active-theme-id', newId)
    applyTheme()
  })

  function applyTheme() {
    const registries = pluginStore.getRegistries()
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
```

- [ ] **Step 2: Clean up hardcoded globals**
Remove `<html lang="zh-CN" class="dark">` -> `<html lang="zh-CN">` in `index.html`.
Delete `src/assets/styles/scifi-theme.css` and its import in `src/main.ts`.

- [ ] **Step 3: Trigger applyTheme in App.vue**
In `src/App.vue`:
```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

onMounted(() => {
  // Give plugins a tiny tick to finish registering
  setTimeout(() => {
    themeStore.applyTheme()
  }, 100)
})
</script>
```

- [ ] **Step 4: Commit**
```bash
rm src/assets/styles/scifi-theme.css
git add src/stores/theme.ts src/App.vue index.html src/main.ts
git commit -m "feat(theme): implement dynamic theme injector from plugin registry"
```

---

### Task 5: Add Theme Switcher UI

**Files:**
- Modify: `src/components/ProjectConfig.vue`

- [ ] **Step 1: Add Theme Select Dropdown**
In `src/components/ProjectConfig.vue`, inside the "配置管理" card or a new "界面设置" card:
```vue
<el-form-item label="全局主题 (Theme)">
  <el-select v-model="themeStore.activeThemeId" placeholder="选择主题">
    <el-option 
      v-for="theme in availableThemes" 
      :key="theme.id" 
      :label="theme.name" 
      :value="theme.id" 
    />
  </el-select>
</el-form-item>
```

- [ ] **Step 2: Add Logic**
```typescript
import { useThemeStore } from '@/stores/theme'
const themeStore = useThemeStore()

const availableThemes = computed(() => {
  return pluginStore.getRegistries().theme.getAll()
})
```

- [ ] **Step 3: Commit**
```bash
git add src/components/ProjectConfig.vue
git commit -m "feat(ui): add theme switcher dropdown to config page"
```