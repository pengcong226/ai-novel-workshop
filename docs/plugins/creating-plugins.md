# Plugin Development Guide

This guide covers everything you need to build, test, and distribute plugins for AI Novel Workshop.

## Table of Contents

- [Overview](#overview)
- [Plugin Structure](#plugin-structure)
- [The Manifest](#the-manifest)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Plugin Context API](#plugin-context-api)
- [Registries (Extension Points)](#registries-extension-points)
  - [AI Provider](#1-ai-provider)
  - [Exporter](#2-exporter)
  - [Importer](#3-importer)
  - [Processor](#4-processor)
  - [Menu Item](#5-menu-item)
  - [Sidebar Panel](#6-sidebar-panel)
  - [Toolbar Button](#7-toolbar-button)
  - [Quick Command](#8-quick-command)
  - [AI Action Handler](#9-ai-action-handler)
  - [Theme](#10-theme)
- [Validation](#validation)
- [Permissions](#permissions)
- [Best Practices](#best-practices)
- [Example: Complete Exporter Plugin](#example-complete-exporter-plugin)

## Overview

The plugin system is built around a **manifest + lifecycle + contributions** model.
A plugin declares what it provides in a JSON manifest, then implements `activate` /
`deactivate` hooks that receive a sandboxed `PluginContext`. Contributions are
registered either statically (via the manifest `contributes` section) or dynamically
(via `context.register.*` at activation time).

## Plugin Structure

A minimal plugin consists of two things:

```
my-plugin/
  manifest.json      # Plugin metadata and contribution declarations
  index.ts           # activate / deactivate / uninstall hooks
```

When building plugins **inside** the codebase (as source-level extensions), you
combine the manifest and the module in a single file:

```typescript
// src/plugins/examples/my-plugin.ts
import type { PluginManifest, PluginContext } from '@/plugins/types'

export const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  author: 'Your Name',
  description: 'What this plugin does',
  permissions: ['project-data'],
}

export async function activate(context: PluginContext) {
  // Register contributions, set up event listeners, etc.
}

export async function deactivate() {
  // Clean up resources
}

export async function uninstall() {
  // Remove persistent data if needed
}
```

## The Manifest

`PluginManifest` is the contract between the plugin and the host application.
Required fields are marked with an asterisk.

| Field | Type | Description |
|---|---|---|
| `id` * | `string` | Unique identifier. Lowercase alphanumeric + hyphens, must start with a letter or digit. Max 128 chars. |
| `name` * | `string` | Human-readable name. Max 256 chars. |
| `version` * | `string` | Semver version (e.g. `1.0.0`, `2.1.0-beta.1`). |
| `author` * | `string` | Author name or organization. |
| `description` * | `string` | Short description of what the plugin does. Max 2048 chars. |
| `icon` | `string` | Emoji or URL to a square icon image. |
| `homepage` | `string` | URL to the plugin's homepage. |
| `repository` | `string` | URL to the source code repository. |
| `dependencies` | `Record<string, string>` | Map of plugin IDs to semver ranges (e.g. `"^1.0.0"`). |
| `permissions` | `PluginPermission[]` | Required permissions (see [Permissions](#permissions)). |
| `contributes` | `PluginContributions` | Static contribution declarations (see [Registries](#registries-extension-points)). |
| `configuration` | `object` | Configuration schema for user-facing settings (see below). |

### Configuration Schema

Each key in `configuration` defines a user-configurable setting:

```typescript
configuration: {
  outputFormat: {
    type: 'string',            // 'string' | 'number' | 'boolean' | 'array' | 'object'
    default: 'markdown',
    description: 'Default output format',
    required: false,
    options: [
      { label: 'Markdown', value: 'markdown' },
      { label: 'Plain Text', value: 'text' },
    ],
  },
}
```

## Lifecycle Hooks

Plugins export up to three async lifecycle functions:

| Hook | When Called | Purpose |
|---|---|---|
| `activate(context)` | Plugin is enabled | Register contributions, set up event listeners, initialize state. |
| `deactivate()` | Plugin is disabled | Unsubscribe listeners, release resources. The plugin may be re-activated later. |
| `uninstall()` | Plugin is permanently removed | Delete persisted data, clean up storage. |

```typescript
export async function activate(context: PluginContext) {
  // Contributions declared in the manifest are registered automatically.
  // Use this hook for dynamic registrations and side effects.
  context.events.on('chapter:saved', handleChapterSaved)
}

export async function deactivate() {
  // Runs before contributions are unregistered.
}
```

## Plugin Context API

The `PluginContext` object passed to `activate` provides controlled access to the
host application. It is organized into namespaces:

### `context.project`

| Method | Returns | Description |
|---|---|---|
| `getCurrentProject()` | `Project \| null` | The currently open project. |
| `saveProject()` | `Promise<void>` | Persist the current project. |
| `updateProject(updates)` | `void` | Merge partial updates into the project. |
| `getChapters()` | `Chapter[]` | All chapters in the project. |
| `getCharacters()` | `ResolvedEntity[]` | Character entities from the sandbox. |
| `getWorldSetting()` | `Record<string, unknown>` | Lore and location entities. |
| `getOutline()` | `Outline` | The project outline. |

Requires permission: `project-data`.

### `context.ai`

| Method | Returns | Description |
|---|---|---|
| `chat(messages, options?)` | `Promise<string>` | Send a chat request and return the full response. |
| `chatStream(messages, callback)` | `Promise<void>` | Stream a chat response chunk-by-chunk. |
| `generateText(prompt, options?)` | `Promise<string>` | Shorthand for a single-user-message chat. |

Requires permission: `ai-api`.

### `context.data`

| Method | Returns | Description |
|---|---|---|
| `query(collection, query)` | `Promise<VectorSearchResult[]>` | Semantic vector search. |
| `addDocument(doc)` | `Promise<void>` | Insert a document into the vector store. |
| `getMemory(contextType)` | `Promise<MemoryContext>` | Retrieve memory context. |

Requires permission: `storage`.

### `context.ui`

| Method | Description |
|---|---|
| `showMessage(message, type?)` | Show a toast notification. |
| `showDialog(options)` | Show a modal dialog. Returns a promise. |
| `showNotification(options)` | Show a desktop-style notification. |
| `confirm(message)` | Show a confirmation dialog. Returns `Promise<boolean>`. |

### `context.events`

| Method | Description |
|---|---|
| `on(event, handler)` | Subscribe to an application event. |
| `off(event, handler)` | Unsubscribe from an event. |
| `emit(event, payload?)` | Emit a custom event. |

### `context.register`

Dynamic registration methods that mirror the manifest `contributes` section.
See [Registries](#registries-extension-points) for details.

### `context.utils`

| Method | Description |
|---|---|
| `log(message, level?)` | Write to the application log with the plugin ID prefix. |
| `sleep(ms)` | Promise-based delay. |
| `clone(obj)` | Deep clone via JSON round-trip. |
| `deepMerge(target, source)` | Recursively merge objects. |

## Registries (Extension Points)

There are 10 extension points. Contributions can be declared statically in the
manifest or registered dynamically via `context.register.*` in the `activate` hook.

### 1. AI Provider

Add a new AI backend (e.g. a new LLM provider).

```typescript
context.register.aiProvider({
  id: 'my-provider',
  name: 'My AI Provider',
  type: 'ai-provider',
  config: {
    providerType: 'custom',
    defaultBaseURL: 'https://api.example.com/v1',
    requiresApiKey: true,
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'model-1',
        name: 'Model One',
        type: 'writing',
        maxTokens: 32000,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
        isEnabled: true,
      },
    ],
  },
  createProvider(config) {
    return {
      async chat(request) { /* ... */ },
      async *chatStream(request) { /* ... */ },
      async validateConfig() { return true },
      async getModels() { return this.config.supportedModels },
      estimateCost(request) { /* ... */ },
    }
  },
})
```

### 2. Exporter

Export project data to a file format.

```typescript
context.register.exporter({
  id: 'my-exporter',
  name: 'Custom Exporter',
  type: 'exporter',
  format: 'docx',
  fileExtension: '.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  capabilities: {
    supportsBatch: true,
    supportsCustomTemplate: false,
    supportsMetadata: true,
    supportsImages: false,
  },
  async export(data, options) {
    // Return a Blob
    return new Blob([content], { type: this.mimeType })
  },
  async exportBatch(items, options) {
    // Optional: batch export
  },
})
```

### 3. Importer

Import external files into the project.

```typescript
context.register.importer({
  id: 'my-importer',
  name: 'Custom Importer',
  type: 'importer',
  supportedFormats: ['txt', 'md'],
  fileExtensions: ['.txt', '.md'],
  async import(file, options) {
    const text = await file.text()
    return {
      project: { title: file.name.replace(/\.\w+$/, '') },
      chapters: [{ content: text }],
    }
  },
  async preprocess(text) {
    // Optional: clean raw text before import
    return text.trim()
  },
  async postprocess(project) {
    // Optional: transform the project after import
    return project
  },
})
```

### 4. Processor

Inject into the data processing pipeline. Processors run at a specific **stage**
and are ordered by **priority** (higher runs first).

| Stage | When it runs |
|---|---|
| `pre-import` | Before imported text is parsed into chapters. |
| `post-import` | After import, before the project is saved. |
| `pre-export` | Before export data is assembled. |
| `post-generation` | After AI generates a chapter. |

```typescript
context.register.processor({
  id: 'my-processor',
  name: 'Text Normalizer',
  type: 'processor',
  stage: 'pre-import',
  priority: 100,           // Higher = runs first (default: 0)
  timeoutMs: 5000,         // Optional timeout
  onError: 'continue',     // 'continue' skips on error; 'abort' stops the pipeline
  async process(data, context) {
    // context contains project, chapter, characters, worldSetting, outline, config
    if (typeof data === 'string') {
      return data.replace(/\r\n/g, '\n')
    }
    return data
  },
})
```

### 5. Menu Item

Add an entry to application menus.

```typescript
context.register.menuItem({
  id: 'my-menu-item',
  label: 'Word Count Analysis',
  icon: 'chart-bar',
  order: 50,
  group: 'tools',
  when: () => context.project.getCurrentProject() !== null,
  handler: async () => {
    const chapters = context.project.getChapters()
    const total = chapters.reduce((n, ch) => n + (ch.content?.length ?? 0), 0)
    context.ui.showMessage(`Total characters: ${total}`, 'info')
  },
})
```

### 6. Sidebar Panel

Add a panel to the left or right sidebar.

```typescript
import MyPanelComponent from './MyPanel.vue'

context.register.sidebarPanel({
  id: 'my-panel',
  title: 'Analytics',
  icon: 'chart-line',
  component: MyPanelComponent,
  position: 'right',
  width: 320,
  order: 10,
})
```

### 7. Toolbar Button

Add a button to an editor toolbar.

```typescript
context.register.toolbarButton({
  id: 'my-toolbar-btn',
  label: 'Insert Template',
  icon: 'template',
  location: 'chapter-editor',  // | 'outline-editor' | 'character-editor'
  order: 20,
  handler: async (editorContext) => {
    // editorContext has: chapter, content, selection
    const { content, selection } = editorContext
    // Insert text at selection...
  },
})
```

### 8. Quick Command

Add a slash-command to the AI assistant chat.

```typescript
context.register.quickCommand({
  id: 'my-command',
  text: 'Summarize Chapter',
  command: '/summarize',
  icon: 'document',
  handler: async () => {
    const project = context.project.getCurrentProject()
    if (!project) return
    const summary = await context.ai.generateText(
      'Summarize the current chapter in 3 sentences.'
    )
    context.ui.showMessage(summary, 'info')
  },
})
```

### 9. AI Action Handler

Handle structured actions dispatched by the AI assistant.

```typescript
context.register.aiActionHandler({
  type: 'update-character-notes',
  async handler(data, actionContext) {
    // data is the action payload from the AI
    // actionContext provides project, chapter, characters, worldSetting
  },
})
```

### 10. Theme

Register a color theme.

```typescript
context.register.theme({
  id: 'ocean-dark',
  name: 'Ocean Dark',
  description: 'A deep blue dark theme',
  mode: 'dark',
  primaryColor: '#0077b6',
  cssVariables: {
    '--bg-primary': '#0a192f',
    '--bg-secondary': '#112240',
    '--text-primary': '#ccd6f6',
    '--text-secondary': '#8892b0',
    '--accent': '#0077b6',
  },
  globalCss: `
    .ocean-dark .editor { background: var(--bg-primary); }
  `,
})
```

## Validation

The plugin system validates manifests at load time. For programmatic validation
(recommended before installing untrusted plugins), use the standalone validator:

```typescript
import { validateManifest, isValidPluginId, isValidSemver } from '@/plugins/plugin-validator'

const result = validateManifest(userProvidedManifest)

if (!result.valid) {
  console.error('Validation errors:', result.errors)
}

if (result.warnings.length > 0) {
  console.warn('Validation warnings:', result.warnings)
}
```

`validateManifest` checks:

- All required fields are present and are strings.
- `id` matches `^[a-z0-9][a-z0-9-]*$` and is at most 128 characters.
- `version` is valid semver.
- `permissions` only contains recognized permission names.
- `dependencies` is a `Record<string, string>`.
- `contributes` arrays contain objects with the required fields for each
  contribution type (e.g. exporters must have `format`, `fileExtension`, `mimeType`).
- `configuration` values have recognized `type` strings.

Helper functions `isValidPluginId(id)` and `isValidSemver(version)` are also
exported for lightweight checks.

## Permissions

Plugins must declare the permissions they need. The host application enforces
these at runtime -- calling a protected API without the corresponding permission
throws an error.

| Permission | Grants Access To |
|---|---|
| `storage` | IndexedDB / localStorage, vector store queries |
| `network` | Making HTTP requests to external services |
| `filesystem` | File system operations (Tauri desktop mode) |
| `ai-api` | Calling AI chat and text generation APIs |
| `project-data` | Reading and writing project, chapters, characters, outline |
| `user-settings` | Modifying user preferences |

**Principle of least privilege**: Only request the permissions your plugin
actually needs. Users see permission declarations before installing a plugin.

## Best Practices

### Naming

- Plugin IDs must be lowercase kebab-case (e.g. `epub-exporter`, `my-custom-theme`).
- Use a unique prefix if publishing to a shared marketplace (e.g. `acme-text-tools`).

### Versioning

- Use semantic versioning: `MAJOR.MINOR.PATCH`.
- Bump MAJOR for breaking changes to configuration or contribution interfaces.
- Bump MINOR for new features or new contributions.
- Bump PATCH for bug fixes.

### Error Handling

- Always wrap async operations in try/catch.
- Use `context.utils.log(message, 'error')` instead of `console.error`.
- For processors, set `onError: 'continue'` when a failure should not block the pipeline.

### Performance

- Use lazy imports (`await import(...)`) for heavy dependencies.
- Set `timeoutMs` on processors to prevent runaway execution.
- Avoid blocking the main thread; use async operations.

### Security

- Treat all input from AI actions as untrusted. Validate shapes and types.
- Never execute arbitrary code from AI-provided strings.
- Use the minimum set of permissions required.
- Do not store secrets in plugin configuration; use the encrypted storage helpers.

### Testing

- Unit test your contribution implementations (e.g. the `export` function, the
  `process` function) independently of the plugin system.
- Use the `PluginLoader.loadFromJson()` method to validate manifests in tests.
- Integration tests should exercise `activate` / `deactivate` lifecycle to ensure
  clean setup and teardown.

## Example: Complete Exporter Plugin

```typescript
import type {
  PluginManifest,
  PluginContext,
  ExporterContribution,
  ExportData,
  ExportOptions,
} from '@/plugins/types'

const csvExporter: ExporterContribution = {
  id: 'csv-exporter',
  name: 'CSV Exporter',
  type: 'exporter',
  format: 'csv',
  fileExtension: '.csv',
  mimeType: 'text/csv',
  capabilities: {
    supportsBatch: true,
    supportsCustomTemplate: false,
    supportsMetadata: true,
    supportsImages: false,
  },
  async export(data: ExportData, _options: ExportOptions): Promise<Blob> {
    const rows: string[] = ['"title","content"']
    if (data.type === 'chapter' && data.content) {
      const title = (data.content.title ?? '').replace(/"/g, '""')
      const body = (data.content.content ?? '').replace(/"/g, '""')
      rows.push(`"${title}","${body}"`)
    }
    return new Blob([rows.join('\n')], { type: 'text/csv' })
  },
  async exportBatch(items: ExportData[], options: ExportOptions): Promise<Blob> {
    const rows: string[] = ['"title","content"']
    for (const item of items) {
      if (item.type === 'chapter' && item.content) {
        const title = (item.content.title ?? '').replace(/"/g, '""')
        const body = (item.content.content ?? '').replace(/"/g, '""')
        rows.push(`"${title}","${body}"`)
      }
    }
    return new Blob([rows.join('\n')], { type: 'text/csv' })
  },
}

export const manifest: PluginManifest = {
  id: 'csv-exporter-plugin',
  name: 'CSV Exporter',
  version: '1.0.0',
  author: 'Example Author',
  description: 'Export chapters and projects to CSV format',
  permissions: ['filesystem'],
  contributes: {
    exporters: [csvExporter],
  },
}

export async function activate(context: PluginContext) {
  context.utils.log('CSV Exporter activated')
}

export async function deactivate() {
  // nothing to clean up
}
```
