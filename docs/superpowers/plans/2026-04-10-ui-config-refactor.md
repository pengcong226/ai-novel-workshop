# V5 UI & AI Config Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Vue frontend by deleting legacy RP components, adding the new unified Sandbox component, and updating the AI Config page to use role-based model selectors.

**Architecture:** We are creating a monolithic `SandboxLayout.vue` component that houses 4 sub-views (Document, Timeline, Graph, Map). `ProjectEditor.vue`'s sidebar is heavily pruned. `ProjectConfig.vue` gets updated to select models for 4 distinct roles (Planner, Writer, Sentinel, Extractor) and their specific parameters.

**Tech Stack:** Vue 3 (Composition API), Pinia, TypeScript, Element-Plus

---

### Task 1: Clean Up Legacy Types and Prompt Configs

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/systemPrompts.ts`

- [ ] **Step 1: Update ProjectConfig type**
In `src/types/index.ts`, update `ProjectConfig` to replace old model names:
```typescript
export interface ProjectConfig {
  preset: 'fast' | 'standard' | 'quality'
  providers: ModelProvider[]

  // New Role-based Model Selectors
  plannerModel: string
  writerModel: string
  sentinelModel: string
  extractorModel: string

  systemPrompts?: SystemPrompts
  // ... keep remaining fields
}
```

- [ ] **Step 2: Update SystemPrompts type**
In `src/types/index.ts`, update `SystemPrompts` to match the 4 roles:
```typescript
export interface SystemPrompts {
  planner: string
  writer: string
  sentinel: string
  extractor: string
}
```

- [ ] **Step 3: Update Default Prompts**
In `src/utils/systemPrompts.ts`, export the new defaults:
```typescript
export const DEFAULT_SYSTEM_PROMPTS = {
  planner: 'You are an expert novel planner. Build engaging story arcs...',
  writer: 'You are an expert novel writer. Write vivid prose...',
  sentinel: 'You are an anti-retcon sentinel. Check logic...',
  extractor: 'You are a state extraction engine. Only output JSON...'
};

export const SYSTEM_PROMPT_VARIABLES = {
  planner: ['{{project_title}}', '{{world_rules}}'],
  writer: ['{{chapter_title}}', '{{active_entities}}'],
  sentinel: ['{{chapter_content}}'],
  extractor: ['{{chapter_content}}']
};
```

- [ ] **Step 4: Run type check**
Run `npm run type-check`. Ignore component errors for now, just ensure the types compile.

- [ ] **Step 5: Commit**
```bash
git add src/types/index.ts src/utils/systemPrompts.ts
git commit -m "refactor(types): update AI config types for V4/V5 roles"
```

### Task 2: Refactor ProjectConfig.vue AI Selection

**Files:**
- Modify: `src/components/ProjectConfig.vue`

- [ ] **Step 1: Update form bindings**
Replace `planningModel`, `writingModel`, etc. with `plannerModel`, `writerModel`, `sentinelModel`, `extractorModel`.

- [ ] **Step 2: Update System Prompt Tabs**
Update `<el-tabs v-model="activePromptTab">` to only have panes for `planner`, `writer`, `sentinel`, and `extractor`.

- [ ] **Step 3: Test and commit**
Run `npm run type-check` to ensure `ProjectConfig.vue` compiles.
```bash
git add src/components/ProjectConfig.vue
git commit -m "refactor(ui): update ProjectConfig.vue to use V5 AI roles"
```

### Task 3: Strip Legacy Menus from ProjectEditor.vue

**Files:**
- Modify: `src/views/ProjectEditor.vue`

- [ ] **Step 1: Remove old menu items**
Delete `<el-menu-item>` blocks for: `world`, `worldbook`, `character-card`, `map`, `characters`, `relationships`, `outline`, `memory`, `timeline`.

- [ ] **Step 2: Add Sandbox menu item**
```vue
          <el-menu-item index="sandbox">
            <el-icon><DataBoard /></el-icon>
            <span>多维设定沙盘</span>
          </el-menu-item>
```

- [ ] **Step 3: Update component imports**
Remove lazy imports for deleted components. Add `SandboxLayout`.
```typescript
const SandboxLayout = defineAsyncComponent(() => import('@/components/Sandbox/SandboxLayout.vue'))
```

- [ ] **Step 4: Update content rendering**
Remove the `<component v-else-if="activeMenu === 'world'"` etc. Replace with:
```vue
          <SandboxLayout v-if="activeMenu === 'sandbox'" />
```

- [ ] **Step 5: Set default menu**
Change `const activeMenu = ref('world')` to `const activeMenu = ref('sandbox')`.

- [ ] **Step 6: Commit**
```bash
git add src/views/ProjectEditor.vue
git commit -m "refactor(ui): prune legacy menus and introduce Sandbox menu"
```

### Task 4: Scaffold the Multi-View Sandbox Components

**Files:**
- Create: `src/components/Sandbox/SandboxLayout.vue`
- Create: `src/components/Sandbox/SandboxDocument.vue`
- Create: `src/components/Sandbox/SandboxTimeline.vue`
- Create: `src/components/Sandbox/SandboxGraph.vue`
- Create: `src/components/Sandbox/SandboxMap.vue`
- Create: `src/components/Sandbox/AutomatonChat.vue`

- [ ] **Step 1: Create SandboxLayout.vue**
Scaffold a basic layout with tabs that load the 4 child components and the right sidebar `AutomatonChat`.

```vue
<template>
  <div class="sandbox-layout">
    <div class="sidebar">Entities Tree</div>
    <div class="main-view">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="文档视图" name="doc"><SandboxDocument /></el-tab-pane>
        <el-tab-pane label="时间线" name="timeline"><SandboxTimeline /></el-tab-pane>
        <el-tab-pane label="关系图" name="graph"><SandboxGraph /></el-tab-pane>
        <el-tab-pane label="势力图" name="map"><SandboxMap /></el-tab-pane>
      </el-tabs>
    </div>
    <AutomatonChat class="right-sidebar" />
  </div>
</template>
```

- [ ] **Step 2: Create stub child components**
Create the 5 child components with empty `<template>` and `<script setup>` tags just so `SandboxLayout` compiles.

- [ ] **Step 3: Commit**
```bash
git add src/components/Sandbox/
git commit -m "feat(ui): scaffold V5 Multi-View Sandbox components"
```

### Task 5: Delete Legacy Components

**Files:**
- Delete: `src/components/WorldSetting.vue`
- Delete: `src/components/WorldbookPanel.vue`
- Delete: `src/components/CharacterCardPanel.vue`
- Delete: `src/components/WorldMap.vue`
- Delete: `src/components/Characters.vue`
- Delete: `src/components/RelationshipGraph.vue`
- Delete: `src/components/Outline.vue`
- Delete: `src/components/MemoryTables.vue`
- Delete: `src/components/TimelineEditor.vue`
- Delete: `src/components/WorldbookEntryEditor.vue`

- [ ] **Step 1: Delete the files**
```bash
rm src/components/WorldSetting.vue src/components/WorldbookPanel.vue src/components/CharacterCardPanel.vue src/components/WorldMap.vue src/components/Characters.vue src/components/RelationshipGraph.vue src/components/Outline.vue src/components/MemoryTables.vue src/components/TimelineEditor.vue src/components/WorldbookEntryEditor.vue
```

- [ ] **Step 2: Fix any compilation errors**
Run `npm run type-check` and remove any leftover imports in `ProjectEditor.vue` or other parent components.

- [ ] **Step 3: Commit**
```bash
git add .
git commit -m "refactor(ui): remove legacy RP/chat configuration components"
```