# GenerationScheduler API

## Purpose

`GenerationScheduler` orchestrates AI-powered chapter generation for the novel workshop. It manages two execution paths:

1. **Pipeline mode** (default) -- delegates to `PipelineRunner` for a multi-agent pipeline (plan, compose, write, normalize, audit, revise, settle, analyze).
2. **Legacy batch mode** -- direct context-build, stream-generate, anti-retcon validate, and state-extract loop.

Both paths support batch generation with checkpoint review, outline auto-extension, cancellation, and per-chapter error recovery.

**Source:** `src/services/generation-scheduler.ts`

**Singleton export:** `generationScheduler`

---

## Exported Types

### `BatchGenerationOptions`

```typescript
interface BatchGenerationOptions {
  startChapter: number           // First chapter number to generate
  count: number                  // Total chapters to generate
  autoSave: boolean              // Persist each chapter immediately after generation
  autoUpdateSettings: boolean    // Extract state events after each chapter
  enableCheckpoint?: boolean     // Pause at intervals for human review
  checkpointInterval?: number    // Number of chapters between checkpoints
  extraction?: {
    extractPlotEvents?: boolean  // Extract plot-level events (foreshadowing, etc.)
    enableAntiRetcon?: boolean   // Run anti-retcon validator on each chapter
  }
  rewrite?: {
    directionPrompt?: string     // User direction for rewrite context
  }
  callbacks?: {
    onCheckpointConfirm?: (chaptersGenerated: number) => Promise<boolean>
    onBatchComplete?: (chaptersGenerated: number) => void
  }
}
```

### `ChapterPipelineResult`

Returned by the Pipeline execution path. Defined in `src/services/pipeline/types.ts`.

```typescript
interface ChapterPipelineResult {
  chapterNumber: number
  title: string
  wordCount: number
  content: string
  auditResult: AuditResult
  revised: boolean
  postReviseCount: number
  status: 'ready-for-review' | 'audit-failed' | 'state-degraded'
  tokenUsage: TokenUsageSummary
  durationMs: number
  stageTimings: Record<string, number>
}
```

### `PipelineConfig`

Configuration for `PipelineRunner`. Defined in `src/services/pipeline/types.ts`.

```typescript
interface PipelineConfig {
  maxAuditRetries: number          // Default: 1
  passScoreThreshold: number       // Default: 85
  netImprovementEpsilon: number    // Default: 3
  temperatureBase: number          // Default: 0.7
  temperatureRetryStep: number     // Default: 0.1
  maxTemperature: number           // Default: 1.2
  enableLengthNormalization: boolean
  enableHookPromotion: boolean
  enableLLMCompose?: boolean       // Default: true (chapters >= 20)
  onStageProgress?: (stage: string, detail: string) => void
  onAgentTrace?: (trace: AgentTraceEvent) => void
}
```

### `WriteNextChapterOptions`

```typescript
interface WriteNextChapterOptions {
  project: Project
  chapterNumber: number
  chapterOutline?: ChapterOutline
  externalContext?: string
  wordCountOverride?: number
  temperatureOverride?: number
}
```

---

## Exported Functions / Helpers

### `hasHighImpactContent(text: string): boolean`

Checks if a chapter's content contains keywords indicating major plot events (death, breakthrough, betrayal, etc.). Used to decide whether to run state extraction.

| Param | Type | Description |
|-------|------|-------------|
| `text` | `string` | Chapter content to scan |

**Returns:** `true` if any high-impact keyword is found.

### `buildGenerationOptions(advancedSettings?): object`

Merges user-configured advanced settings into AI generation options with defaults.

| Param | Type | Description |
|-------|------|-------------|
| `advancedSettings` | `{ maxTokens?: number; temperature?: number; stopSequences?: string[] }` | Optional overrides |

**Returns:** `{ maxTokens: number; temperature: number; stopSequences?: string[] }`

### `HIGH_IMPACT_KEYWORDS: string[]`

Array of Chinese keywords used by `hasHighImpactContent`.

---

## Class: `GenerationScheduler`

### Constructor

```typescript
new GenerationScheduler()
```

Initializes in Pipeline mode by default (`usePipeline = true`).

### Methods

#### `enablePipeline(config?: Partial<PipelineConfig>): void`

Re-initializes the `PipelineRunner` with optional configuration overrides.

| Param | Type | Description |
|-------|------|-------------|
| `config` | `Partial<PipelineConfig>` | Optional pipeline configuration |

#### `disablePipeline(): void`

Disables Pipeline mode. Subsequent calls to `executeBatchGeneration` will use the legacy batch path.

#### `getPipeline(): PipelineRunner | null`

Returns the current `PipelineRunner` instance, or `null` if Pipeline mode is disabled.

#### `isPipelineEnabled(): boolean`

Returns whether Pipeline mode is currently active.

#### `writeChapterWithPipeline(options: WriteNextChapterOptions): Promise<ChapterPipelineResult>`

Generates a single chapter through the Pipeline. Throws if Pipeline is not enabled.

| Param | Type | Description |
|-------|------|-------------|
| `options` | `WriteNextChapterOptions` | Project, chapter number, outline, and overrides |

**Returns:** `ChapterPipelineResult` with content, audit result, token usage, and timings.

**Throws:** `Error` if Pipeline is not enabled.

#### `executeBatchWithPipeline(batchOptions, pipelineConfig?): Promise<ChapterPipelineResult[]>`

Generates multiple chapters through the Pipeline with checkpoint support and per-chapter error recovery.

| Param | Type | Description |
|-------|------|-------------|
| `batchOptions` | `BatchGenerationOptions` | Batch configuration |
| `pipelineConfig` | `Partial<PipelineConfig>` | Optional pipeline overrides |

**Returns:** Array of `ChapterPipelineResult` for successfully generated chapters.

**Throws:** `Error` if project is not loaded or AI is not initialized.

**Behavior:**
- Creates a cancellable task via `taskManager`
- Auto-extends outline when approaching the end (4 chapters remaining)
- Skips failed chapters and continues the batch
- 2-second cooldown between chapters

#### `executeBatchGeneration(options: BatchGenerationOptions): Promise<void>`

Generates multiple chapters using the legacy batch path. Includes anti-retcon validation, state extraction, quality checks, and plot event extraction.

| Param | Type | Description |
|-------|------|-------------|
| `options` | `BatchGenerationOptions` | Batch configuration |

**Throws:** `Error` if project is not loaded or AI is not initialized.

**Behavior:**
- Retries each chapter up to 3 times with anti-retcon repair
- Consults a "planner" agent when anti-retcon violations are detected
- Extracts state events via tool-calling JSON schema
- Runs quality checks when enabled
- Extracts plot events when `extraction.extractPlotEvents` is true
- Stages chapters for batch flush when `autoSave` is false
- 1-second cooldown between chapters

#### `cancelBatchGeneration(): void`

Cancels the currently running batch by incrementing the internal run ID. The current chapter will finish; the next iteration checks the run ID and stops.

---

## Usage Examples

### Single chapter via Pipeline

```typescript
import { generationScheduler } from '@/services/generation-scheduler'

const result = await generationScheduler.writeChapterWithPipeline({
  project: currentProject,
  chapterNumber: 5,
  chapterOutline: currentProject.outline.chapters[4],
})

console.log(`Chapter ${result.chapterNumber}: ${result.wordCount} words, score ${result.auditResult.overallScore}`)
```

### Batch generation via Pipeline

```typescript
import { generationScheduler } from '@/services/generation-scheduler'

const results = await generationScheduler.executeBatchWithPipeline({
  startChapter: 1,
  count: 10,
  autoSave: true,
  autoUpdateSettings: true,
  enableCheckpoint: true,
  checkpointInterval: 5,
  callbacks: {
    onCheckpointConfirm: async (chaptersGenerated) => {
      return confirm(`已生成 ${chaptersGenerated} 章，是否继续？`)
    },
    onBatchComplete: (total) => {
      console.log(`批量生成完成，共 ${total} 章`)
    },
  },
})
```

### Legacy batch with anti-retcon

```typescript
import { generationScheduler } from '@/services/generation-scheduler'

await generationScheduler.executeBatchGeneration({
  startChapter: 6,
  count: 5,
  autoSave: true,
  autoUpdateSettings: true,
  extraction: {
    extractPlotEvents: true,
    enableAntiRetcon: true,
  },
})
```

### Cancel an ongoing batch

```typescript
generationScheduler.cancelBatchGeneration()
```

### Toggle Pipeline mode

```typescript
// Enable with custom config
generationScheduler.enablePipeline({
  maxAuditRetries: 2,
  passScoreThreshold: 90,
  temperatureBase: 0.8,
})

// Disable Pipeline (fall back to legacy)
generationScheduler.disablePipeline()
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Project not loaded / AI not initialized | `executeBatchGeneration` and `executeBatchWithPipeline` throw `Error('系统未初始化或项目未加载')` |
| Pipeline not enabled | `writeChapterWithPipeline` throws `Error('Pipeline 未启用，请先调用 enablePipeline()')` |
| Stream failure during legacy generation | Falls back from streaming to regular `chat()` call |
| Anti-retcon violation detected | Retries up to 3 times with planner consultation; forces passage after limit |
| Single chapter failure in batch | Logs error, adds toast notification, skips chapter, continues batch |
| Outline auto-extension failure | Logs warning, continues generation with existing outline |
| Batch cancelled by user | Current chapter finishes, next iteration exits cleanly via run ID check |
| Staged chapter flush failure (autoSave=false) | Attempts compensatory save on batch failure; keeps failed chapters for retry |
