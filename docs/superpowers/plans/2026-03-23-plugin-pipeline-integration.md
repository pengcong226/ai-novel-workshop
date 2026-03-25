# Plugin Pipeline Integration & Safe Experimental Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plugin processors actually run in import/export/generation flows, add robust processor execution policies, and add a safe experimental toggle for advanced plugin behavior.

**Architecture:** Reuse the existing plugin registries and store, then connect `ProcessorRegistry.processPipeline()` to real business paths (chapter generation, importer/exporter flows). Add execution-policy controls (priority/timeout/error policy), and surface a global safe experimental switch in plugin settings and storage.

**Tech Stack:** Vue 3, TypeScript, Pinia, Element Plus, Vitest

---

## Scope Boundaries (Non-goals)

- Do **not** add or preserve any safety-bypass prompt strategy.
- Experimental mode only controls plugin execution behavior/capabilities in app logic.
- Do not refactor unrelated modules.

---

## File Structure

### Modify

- `src/plugins/types.ts`
  - Add processor execution policy types (`priority`, `timeoutMs`, `onError`).
- `src/plugins/registries/processor-registry.ts`
  - Add deterministic ordering and guarded pipeline execution.
- `src/plugins/storage.ts`
  - Persist plugin system global settings (experimental mode + pipeline defaults).
- `src/stores/plugin.ts`
  - Expose global plugin settings APIs and pipeline helpers.
- `src/plugins/registries/importer-registry.ts`
  - Hook pre/post import processor pipeline.
- `src/plugins/registries/exporter-registry.ts`
  - Hook pre-export processor pipeline.
- `src/components/Chapters.vue`
  - Hook post-generation processor pipeline before final chapter assignment/save.
- `src/components/PluginManager.vue`
  - Add experimental mode and pipeline policy controls UI.

### Create

- `src/plugins/__tests__/processor-registry.test.ts`
- `src/plugins/__tests__/plugin-store-settings.test.ts`
- `src/plugins/__tests__/importer-exporter-pipeline.test.ts`
- `docs/PLUGIN_PIPELINE_GUIDE.md`

---

## Chunk 1: Core Processor Execution Policies

### Task 1: Extend processor type contracts

**Files:**
- Modify: `src/plugins/types.ts`
- Test: `src/plugins/__tests__/processor-registry.test.ts`

- [ ] **Step 1: Write failing type-level usage test**

```ts
// src/plugins/__tests__/processor-registry.test.ts
const processor = {
  id: 'normalize-text',
  name: 'Normalize Text',
  type: 'processor' as const,
  stage: 'post-generation' as const,
  priority: 100,
  timeoutMs: 2000,
  onError: 'continue' as const,
  async process(data: any) { return data }
}
expect(processor.priority).toBe(100)
```

- [ ] **Step 2: Run test to verify type/build fails**

Run: `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
Expected: fail due to missing processor policy fields in type contracts.

- [ ] **Step 3: Add minimal policy fields in `ProcessorContribution`**

```ts
// src/plugins/types.ts
export interface ProcessorContribution {
  id: string
  name: string
  type: 'processor'
  stage: 'pre-import' | 'post-import' | 'pre-export' | 'post-generation'
  priority?: number
  timeoutMs?: number
  onError?: 'continue' | 'abort'
  process(data: any, context: ProcessorContext): Promise<any>
  getSettingsComponent?(): Component
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/types.ts src/plugins/__tests__/processor-registry.test.ts
git commit -m "feat(plugins): add processor execution policy fields"
```

---

### Task 2: Harden processor pipeline execution

**Files:**
- Modify: `src/plugins/registries/processor-registry.ts`
- Test: `src/plugins/__tests__/processor-registry.test.ts`

- [ ] **Step 1: Write failing behavior tests**

```ts
it('executes processors by priority desc', async () => { /* ... */ })
it('continues on error when onError=continue', async () => { /* ... */ })
it('aborts on error when onError=abort', async () => { /* ... */ })
it('fails processor on timeout', async () => { /* ... */ })
```

- [ ] **Step 2: Run tests to verify failures**

Run: `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
Expected: FAIL on ordering/error/timeout assertions.

- [ ] **Step 3: Implement minimal execution guard in registry**

```ts
private withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('processor timeout')), ms))
  ])
}

async processPipeline(stage, data, context) {
  const processors = [...this.getByStage(stage)]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  let result = data
  for (const processor of processors) {
    try {
      result = await this.withTimeout(
        processor.process(result, context),
        processor.timeoutMs ?? 5000
      )
    } catch (err) {
      if ((processor.onError ?? 'abort') === 'abort') throw err
    }
  }
  return result
}
```

- [ ] **Step 4: Re-run tests**

Run: `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/registries/processor-registry.ts src/plugins/__tests__/processor-registry.test.ts
git commit -m "feat(plugins): add ordered guarded processor pipeline"
```

---

## Chunk 2: Connect Pipeline to Real Business Flows

### Task 3: Integrate import flow pipeline

**Files:**
- Modify: `src/plugins/registries/importer-registry.ts`
- Modify: `src/stores/plugin.ts`
- Test: `src/plugins/__tests__/importer-exporter-pipeline.test.ts`

- [ ] **Step 1: Write failing import pipeline test**

```ts
it('runs pre-import and post-import processor pipeline around importer', async () => {
  // assert order: pre-import -> importer -> post-import
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`
Expected: FAIL (pipeline not invoked).

- [ ] **Step 3: Wire processor pipeline in importer registry**

```ts
const processorRegistry = /* injected or resolved from pluginManager */
const preData = await processorRegistry.processPipeline('pre-import', textOrFile, context)
const result = await importer.import(processedFile, options || {})
const post = await processorRegistry.processPipeline('post-import', result, context)
return post
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`
Expected: PASS (import path).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/registries/importer-registry.ts src/plugins/__tests__/importer-exporter-pipeline.test.ts src/stores/plugin.ts
git commit -m "feat(plugins): run processors in importer flow"
```

---

### Task 4: Integrate export flow pipeline

**Files:**
- Modify: `src/plugins/registries/exporter-registry.ts`
- Test: `src/plugins/__tests__/importer-exporter-pipeline.test.ts`

- [ ] **Step 1: Write failing export pipeline test**

```ts
it('runs pre-export processor pipeline before exporter.export', async () => {
  // assert processed payload reaches exporter
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`
Expected: FAIL on export assertions.

- [ ] **Step 3: Implement minimal pre-export invocation**

```ts
const processedData = await processorRegistry.processPipeline('pre-export', data, context)
return await exporter.export(processedData, options || {})
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`
Expected: PASS (import + export pipeline tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugins/registries/exporter-registry.ts src/plugins/__tests__/importer-exporter-pipeline.test.ts
git commit -m "feat(plugins): run pre-export processors before export"
```

---

### Task 5: Integrate chapter post-generation pipeline

**Files:**
- Modify: `src/components/Chapters.vue`
- Test: `src/plugins/__tests__/plugin-store-settings.test.ts`

- [ ] **Step 1: Add failing integration-like unit test (mock plugin store)**

```ts
it('applies post-generation pipeline to generated chapter content', async () => {
  // mock pipeline returns transformed chapter content
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -- src/plugins/__tests__/plugin-store-settings.test.ts`
Expected: FAIL (generated content not piped).

- [ ] **Step 3: Apply pipeline after AI response and before save**

```ts
const pluginStore = usePluginStore()
const processed = await pluginStore.getRegistries().processor.processPipeline(
  'post-generation',
  { chapter: chapterData, project: currentProject },
  { chapter: chapterData, project: currentProject, config: pluginStore.getGlobalPluginSettings() }
)
chapterData.content = processed?.chapter?.content ?? chapterData.content
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/plugins/__tests__/plugin-store-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Chapters.vue src/plugins/__tests__/plugin-store-settings.test.ts
git commit -m "feat(chapters): apply post-generation processor pipeline"
```

---

## Chunk 3: Safe Experimental Mode + Settings + Docs

### Task 6: Add global plugin settings storage APIs

**Files:**
- Modify: `src/plugins/storage.ts`
- Modify: `src/stores/plugin.ts`
- Test: `src/plugins/__tests__/plugin-store-settings.test.ts`

- [ ] **Step 1: Write failing settings persistence test**

```ts
it('persists and loads global plugin settings', async () => {
  // experimentalMode, defaultTimeoutMs, defaultOnError
})
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -- src/plugins/__tests__/plugin-store-settings.test.ts`
Expected: FAIL (no global settings API).

- [ ] **Step 3: Add storage/store methods**

```ts
// storage.ts
private static GLOBAL_SETTINGS_KEY = 'ai-novel-plugin-global-settings'
static async saveGlobalPluginSettings(settings: Record<string, any>) { ... }
static async loadGlobalPluginSettings(): Promise<Record<string, any>> { ... }

// plugin.ts
const globalSettings = ref({ experimentalMode: false, defaultTimeoutMs: 5000, defaultOnError: 'abort' })
async function loadGlobalPluginSettings() { ... }
async function updateGlobalPluginSettings(updates) { ... }
function getGlobalPluginSettings() { return globalSettings.value }
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/plugins/__tests__/plugin-store-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/storage.ts src/stores/plugin.ts src/plugins/__tests__/plugin-store-settings.test.ts
git commit -m "feat(plugins): add global plugin settings persistence"
```

---

### Task 7: Surface experimental mode in PluginManager UI

**Files:**
- Modify: `src/components/PluginManager.vue`

- [ ] **Step 1: Add UI controls and bind to store**

```vue
<el-switch v-model="global.experimentalMode" active-text="实验模式" />
<el-input-number v-model="global.defaultTimeoutMs" :min="1000" :step="500" />
<el-select v-model="global.defaultOnError">
  <el-option label="中断" value="abort" />
  <el-option label="继续" value="continue" />
</el-select>
```

- [ ] **Step 2: Implement load/save handlers**

```ts
onMounted(async () => {
  await pluginStore.loadGlobalPluginSettings()
  global.value = { ...pluginStore.getGlobalPluginSettings() }
})

async function saveGlobalSettings() {
  await pluginStore.updateGlobalPluginSettings(global.value)
  ElMessage.success('全局插件设置已保存')
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Expected:
- UI shows settings controls.
- Toggling and refresh preserves values.

- [ ] **Step 4: Commit**

```bash
git add src/components/PluginManager.vue
git commit -m "feat(ui): add plugin experimental mode and pipeline policy controls"
```

---

### Task 8: Document behavior and guardrails

**Files:**
- Create: `docs/PLUGIN_PIPELINE_GUIDE.md`
- Modify: `README.md` (plugin section add one bullet linking guide)

- [ ] **Step 1: Write docs**

Include:
- pipeline stage definitions
- ordering/timeout/error policy behavior
- experimental mode semantics (safe-only)
- example processor registration
- troubleshooting

- [ ] **Step 2: Verify docs links**

Run: `npm run build`
Expected: build succeeds; no markdown-related import/link issues in app build.

- [ ] **Step 3: Commit**

```bash
git add docs/PLUGIN_PIPELINE_GUIDE.md README.md
git commit -m "docs(plugins): add processor pipeline integration guide"
```

---

## Verification Checklist (Before Completion)

- [ ] `npm run test -- src/plugins/__tests__/processor-registry.test.ts`
- [ ] `npm run test -- src/plugins/__tests__/importer-exporter-pipeline.test.ts`
- [ ] `npm run test -- src/plugins/__tests__/plugin-store-settings.test.ts`
- [ ] `npm run build`
- [ ] Manual smoke test in `PluginManager.vue` and chapter generation/import/export paths.

---

## Chunk Review Loop Notes

For each chunk above:
1. Run plan review (peer/subagent if available) on that chunk only.
2. Fix issues.
3. Re-run review until approved.

If review loop exceeds 5 iterations, escalate to human for guidance.

---

Plan complete and saved to `docs/superpowers/plans/2026-03-23-plugin-pipeline-integration.md`. Ready to execute?