# V5 Global Sci-Fi UI & Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the entire application to a Sci-Fi Glassmorphism dark theme and implement the fully functional Multi-View Sandbox Vue components.

**Architecture:** Use Element Plus's native `dark` class toggling paired with a global SCSS/CSS override file to apply translucent backgrounds. Convert the mockup components (`Sandbox*.vue`) into real Vue 3 components tied to Pinia's `SandboxStore`.

**Tech Stack:** Vue 3, Pinia, Element Plus, CSS/SCSS

---

### Task 1: Enable Native Dark Mode

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add dark class to html**
Open `index.html` and modify the `<html>` tag to include the `dark` class.

```html
<html lang="zh-CN" class="dark">
```

- [ ] **Step 2: Commit**
```bash
git add index.html
git commit -m "style: enable Element Plus dark mode by default"
```

---

### Task 2: Inject Global Sci-Fi CSS Theme

**Files:**
- Create: `src/assets/styles/scifi-theme.css`
- Modify: `src/main.ts`

- [ ] **Step 1: Create scifi-theme.css**

```css
/* src/assets/styles/scifi-theme.css */
:root {
  --bg-base: #0a0a0f;
  --bg-panel: rgba(20, 20, 30, 0.7);
  --bg-panel-hover: rgba(30, 30, 45, 0.8);
  --border-color: rgba(60, 130, 246, 0.2);
  --border-glow: rgba(60, 130, 246, 0.5);
  --text-main: #e2e8f0;
  --text-muted: #94a3b8;
  --accent-primary: #3b82f6;
  --accent-glow: #60a5fa;
  --accent-secondary: #8b5cf6;
  --accent-success: #10b981;
  --accent-warning: #f59e0b;
}

body {
  background-color: var(--bg-base);
  color: var(--text-main);
  background-image:
    radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 85% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 50%);
  background-attachment: fixed;
}

/* Glassmorphism Overrides for Element Plus */
html.dark .el-card, 
html.dark .el-menu, 
html.dark .el-dialog, 
html.dark .el-tabs__nav-wrap {
  background-color: var(--bg-panel) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid var(--border-color) !important;
}

html.dark .el-input__wrapper,
html.dark .el-textarea__inner {
  background-color: rgba(0, 0, 0, 0.4) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: none !important;
}

html.dark .el-input__wrapper.is-focus,
html.dark .el-textarea__inner:focus {
  border-color: var(--accent-glow) !important;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.3) !important;
}
```

- [ ] **Step 2: Import theme in main.ts**

```typescript
import './assets/styles/scifi-theme.css'
```
*Note: Make sure this import is placed after element-plus styles so it can properly override them.*

- [ ] **Step 3: Commit**
```bash
git add src/assets/styles/scifi-theme.css src/main.ts
git commit -m "style: inject global sci-fi glassmorphism theme overrides"
```

---

### Task 3: Strip ProjectEditor Backgrounds

**Files:**
- Modify: `src/views/ProjectEditor.vue`

- [ ] **Step 1: Remove solid backgrounds**
Search for `.sidebar`, `.main-content`, and `.right-sidebar` CSS classes in `src/views/ProjectEditor.vue`.
Remove `background: white;` and `background: #f5f7fa;` so the global radial gradient bleeds through.

```css
.sidebar {
  /* removed background: white; */
  border-right: 1px solid var(--border-color);
  /* ... */
}
.main-content {
  /* removed background: #f5f7fa; */
  padding: 20px;
  /* ... */
}
.right-sidebar {
  /* removed background: white; */
  border-left: 1px solid var(--border-color);
  /* ... */
}
```

- [ ] **Step 2: Commit**
```bash
git add src/views/ProjectEditor.vue
git commit -m "style(ui): make ProjectEditor layout transparent to inherit global theme"
```

---

### Task 4: Implement SandboxLayout and Navigation

**Files:**
- Modify: `src/components/Sandbox/SandboxLayout.vue`

- [ ] **Step 1: Write SandboxLayout.vue template**
Implement the left sidebar for navigating entities (read from `sandboxStore.entities`), and the tab switcher for the 4 views.

```vue
<template>
  <div class="sandbox-layout">
    <div class="sidebar-left glass-panel">
      <div class="panel-header sci-fi-title">沙盘实体库</div>
      <div class="entity-nav">
        <!-- Temporary mock items, will be bound to store later -->
        <div class="nav-item active">林渊 (主角)</div>
        <div class="nav-item">青云宗</div>
      </div>
    </div>
    
    <div class="main-view glass-panel">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="文档视图" name="doc"><SandboxDocument /></el-tab-pane>
        <el-tab-pane label="大纲时间线" name="timeline"><SandboxTimeline /></el-tab-pane>
        <el-tab-pane label="关系图谱" name="graph"><SandboxGraph /></el-tab-pane>
        <el-tab-pane label="势力地图" name="map"><SandboxMap /></el-tab-pane>
      </el-tabs>
    </div>
    
    <div class="sidebar-right glass-panel">
      <AutomatonChat />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SandboxDocument from './SandboxDocument.vue'
import SandboxTimeline from './SandboxTimeline.vue'
import SandboxGraph from './SandboxGraph.vue'
import SandboxMap from './SandboxMap.vue'
import AutomatonChat from './AutomatonChat.vue'
import { useSandboxStore } from '@/stores/sandbox'

const activeTab = ref('timeline')
const sandboxStore = useSandboxStore()
</script>

<style scoped>
.sandbox-layout { display: flex; height: 100%; gap: 16px; }
.glass-panel { background: rgba(20,20,30,0.5); backdrop-filter: blur(10px); border-radius: 8px; border: 1px solid rgba(60,130,246,0.2); }
.sidebar-left { width: 250px; display: flex; flex-direction: column; }
.main-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px; }
.sidebar-right { width: 300px; display: flex; flex-direction: column; }
.panel-header { padding: 16px; border-bottom: 1px solid rgba(60,130,246,0.2); }
.sci-fi-title { color: #60a5fa; font-weight: bold; }
.entity-nav { padding: 16px; }
.nav-item { padding: 8px; color: #e2e8f0; cursor: pointer; }
.nav-item.active { background: rgba(59,130,246,0.2); border-left: 3px solid #3b82f6; }
</style>
```

- [ ] **Step 2: Commit**
```bash
git add src/components/Sandbox/SandboxLayout.vue
git commit -m "feat(sandbox): implement SandboxLayout structural shell"
```

---

### Task 5: Implement Sandbox Views Shells

**Files:**
- Modify: `src/components/Sandbox/SandboxDocument.vue`
- Modify: `src/components/Sandbox/SandboxTimeline.vue`
- Modify: `src/components/Sandbox/SandboxGraph.vue`
- Modify: `src/components/Sandbox/SandboxMap.vue`
- Modify: `src/components/Sandbox/AutomatonChat.vue`

- [ ] **Step 1: Replace placeholder text**
In all 5 components, add a simple dark-themed placeholder div indicating the view is loaded properly, so that the layout works. We won't build out the complex AntV G6 or Vis-timeline integrations in this specific PR, as the focus is the UI refactor and theme overhaul.

Example for `SandboxTimeline.vue`:
```vue
<template>
  <div class="sandbox-view-container">
    <div style="color: #60a5fa; margin-bottom: 16px;"><i class="ri-time-line"></i> 大纲时间线 (状态流)</div>
    <el-empty description="底层状态机已挂载。大纲渲染器开发中..." />
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.sandbox-view-container { padding: 20px; height: 100%; }
</style>
```

(Apply similar structure to the other 4 components).

- [ ] **Step 2: Commit**
```bash
git add src/components/Sandbox/
git commit -m "feat(sandbox): implement styled placeholder views for multi-view engine"
```