# Services API Reference

---

## GenerationScheduler

**Module**: `src/services/generation-scheduler.ts`
**Import**: `import { GenerationScheduler } from '@/services/generation-scheduler'`
**Singleton**: `export const generationScheduler = new GenerationScheduler()`

Orchestrates chapter generation in both single-chapter and batch modes. Supports two execution paths: the **Pipeline mode** (default, uses `PipelineRunner` for multi-agent 10-stage generation) and the **legacy mode** (direct LLM calls with inline anti-retcon and quality checks).

### Constructor

```typescript
new GenerationScheduler()
```

Automatically initializes Pipeline mode with default config.

### Properties

| Name | Type | Description |
|------|------|-------------|
| `currentRunId` | `number` (private) | Monotonically increasing run ID for cancellation detection |
| `pipeline` | `PipelineRunner \| null` | Pipeline runner instance |
| `usePipeline` | `boolean` | Whether Pipeline mode is active (default: `true`) |

### Methods

#### Pipeline Control

```typescript
enablePipeline(config?: Partial<PipelineConfig>): void
```

(Re-)initializes the Pipeline runner with optional configuration.

```typescript
disablePipeline(): void
```

Disables Pipeline mode. Subsequent calls fall back to legacy generation logic.

```typescript
getPipeline(): PipelineRunner | null
```

Returns the current Pipeline instance.

```typescript
isPipelineEnabled(): boolean
```

Returns whether Pipeline mode is active.

#### Single Chapter via Pipeline

```typescript
async writeChapterWithPipeline(options: WriteNextChapterOptions): Promise<ChapterPipelineResult>
```

Generates a single chapter using the Pipeline. Throws if Pipeline is not enabled.

**Parameters** (`WriteNextChapterOptions`):
- `project: Project` - Current project
- `chapterNumber: number` - Target chapter number
- `chapterOutline?: ChapterOutline` - Optional chapter outline
- `externalContext?: string` - Optional external context (e.g., rewrite direction prompt)
- `wordCountOverride?: number` - Target word count
- `temperatureOverride?: number` - Model temperature

#### Batch Generation via Pipeline

```typescript
async executeBatchWithPipeline(
  batchOptions: BatchGenerationOptions,
  pipelineConfig?: Partial<PipelineConfig>
): Promise<ChapterPipelineResult[]>
```

Generates multiple chapters sequentially using Pipeline mode. Includes:
- Progress tracking via `TaskManager`
- Cancellation support (run ID based)
- Checkpoint pauses for human review
- Automatic outline extension when nearing the end
- Inter-chapter cooldown (2 seconds)
- Auto-save support

#### Legacy Batch Generation

```typescript
async executeBatchGeneration(options: BatchGenerationOptions): Promise<void>
```

Generates chapters using the legacy path with inline features:
- Anti-retcon validation with planner consultation
- Quality checking
- State extraction via tool-calling
- Plot event extraction
- Plugin post-processing pipeline
- Outline auto-extension
- Checkpoint reviews
- Staged chapter save with failure compensation

#### Cancellation

```typescript
cancelBatchGeneration(): void
```

Cancels the current batch generation by incrementing the run ID. All in-flight and queued chapters will detect the cancellation.

### BatchGenerationOptions

```typescript
interface BatchGenerationOptions {
  startChapter: number
  count: number
  autoSave?: boolean
  autoUpdateSettings?: boolean
  enableCheckpoint?: boolean
  checkpointInterval?: number
  extraction?: {
    extractPlotEvents?: boolean
    enableAntiRetcon?: boolean
  }
  rewrite?: {
    directionPrompt?: string
  }
  callbacks?: {
    onBatchComplete?: (count: number) => void
    onCheckpointConfirm?: (completedChapters: number) => Promise<boolean>
  }
}
```

---

## NovelExtractor

**Module**: `src/services/novel-extractor.ts`
**Import**: `import { NovelExtractor } from '@/services/novel-extractor'`

LLM-powered extraction engine for importing existing novels. Uses Tool Calling to extract entities, state events, and plot events from chapter text. Supports full mode (every chapter) and smart sampling mode (LLM quick-scan first, then extract only key chapters).

### Constructor

```typescript
new NovelExtractor(
  projectId: string,
  options: DeepImportOptions,
  onProgress?: (progress: ExtractionProgress) => void
)
```

**Parameters**:
- `projectId` - Target project ID
- `options` - Extraction configuration (`DeepImportOptions`)
- `onProgress` - Optional progress callback

### Instance Methods

#### `estimateCost(chapters: ParsedChapter[]): DeepImportEstimate`

Estimates extraction cost before running. Returns estimated chapters, tokens per chapter, cost per chapter, total cost, and time estimate.

**Returns**:
```typescript
interface DeepImportEstimate {
  estimatedChapters: number
  avgInputTokensPerChapter: number
  avgOutputTokensPerChapter: number
  costPerChapterUSD: number
  totalCostUSD: number
  estimatedTimeMinutes: number
}
```

#### `extractAll(chapters, existingEntities?, resumeFrom?, keyChaptersOverride?): Promise<DeepImportSession>`

Main extraction pipeline. Processes chapters in batches, extracting entities and state events via LLM.

**Features**:
- Resumable sessions (checkpoint caching)
- Smart sampling mode: skips non-key chapters
- Auto-pause on checkpoint interval
- Auto-pause on 5 consecutive failures
- Cost limit enforcement
- Debounced session caching (2-second delay)
- Entity summary map with importance-based truncation

#### `extractChapter(chapter, knownEntityMap, prevChapterContent?): Promise<ChapterExtractionResult>`

Thin wrapper around `extractBatch` for single chapter extraction.

#### `extractBatch(chapters, knownEntityMap, prevBatchContent?): Promise<BatchExtractionResult>`

Extracts entities and state events from a batch of chapters. Makes 2-3 LLM calls per batch:
1. Entity extraction (using `EXTRACT_NOVEL_ENTITIES_SCHEMA`)
2. State event extraction (using `EXTRACT_STATE_EVENTS_SCHEMA`)
3. (Optional) Plot event extraction (using `EXTRACT_PLOT_EVENTS_SCHEMA`)

#### `quickScanChapter(chapter): Promise<{isKeyChapter: boolean; reason: string; mentionedEntities: string[]}>`

Quick LLM scan to determine if a chapter is a "key chapter" worth extracting. Used in smart sampling mode.

#### `resolveToSandboxOps(session: DeepImportSession): SandboxCommitOps`

Converts extraction results into sandbox-ready operations (new entities, entity updates, state events). Resolves entity names to IDs.

#### `abort(): void`

Aborts extraction. Resolves any pending pause promise.

#### `pause(): void`

Pauses extraction at the next batch boundary.

#### `resume(): void`

Resumes paused extraction.

### Static Methods

#### `NovelExtractor.checkResumableSession(projectId: string): Promise<DeepImportSession | null>`

Checks localStorage for an incomplete extraction session. Uses an indexed key system with fallback to prefix scan.

#### `NovelExtractor.clearCachedSession(projectId: string, sessionId: string): void`

Removes a cached session from localStorage.

### Constants

| Name | Value | Description |
|------|-------|-------------|
| `MAX_CONSECUTIVE_FAILURES` | 5 | Auto-pause after N consecutive batch failures |
| `NEARBY_WINDOW` | 5 | Chapter window for full entity summaries |
| `MAX_ENTITY_SUMMARY_TOKENS` | 3000 | Token budget for entity summary section |
| `CHARS_PER_TOKEN` | 1.5 | Approximate characters per token (Chinese text) |

---

## RewriteContinuationService

**Module**: `src/services/rewrite-continuation.ts`
**Import**: `import { RewriteContinuationService } from '@/services/rewrite-continuation'`
**Singleton**: `export const rewriteContinuationService = new RewriteContinuationService()`

Coordinates two authoring workflows:
1. **Continuation** - Generate new chapters after the last imported chapter
2. **Rewrite** - Replace a range of chapters with a new direction

### Instance Methods

#### `continueNovel(options: ContinuationOptions): Promise<void>`

Generates new chapters continuing from a starting point. Delegates to `GenerationScheduler.executeBatchGeneration()`.

**Parameters** (`ContinuationOptions`):
- `startChapter: number` - First chapter to generate
- `count: number` - Number of chapters to generate
- `autoSave?: boolean`
- `autoExtract?: boolean`
- `extractPlotEvents?: boolean`
- `enableAntiRetcon?: boolean`

#### `startRewrite(options: RewriteOptions): Promise<StateDiffReport>`

Executes a rewrite workflow:

1. Captures baseline snapshot at `range.start - 1`
2. Captures pre-rewrite snapshot at `range.end`
3. Backs up affected chapters and state events (encrypted localStorage)
4. Deletes state events in the rewrite range
5. Generates replacement chapters
6. Computes and returns a `StateDiffReport`

**Parameters** (`RewriteOptions`):
- `range: {start: number; end: number}` - Chapter range to rewrite
- `newDirectionPrompt?: string` - New narrative direction
- `autoSave?: boolean`
- `extractPlotEvents?: boolean`
- `enableAntiRetcon?: boolean`

**Returns**: `StateDiffReport` with snapshots, diffs, broken foreshadowing, and removed entities.

#### `acceptRewrite(): Promise<void>`

Accepts the rewrite. Clears the backup and saves the project.

#### `rejectRewrite(): Promise<void>`

Rejects the rewrite. Restores chapters, state events, and plot events from the backup.

#### `cancel(): void`

Cancels any in-progress batch generation.

### Static Methods

#### `RewriteContinuationService.convertPlotEvents(extracted, projectId, chapterNumber, nameToIdMap): PlotEventRecord[]`

Converts extracted plot events to `PlotEventRecord` format, resolving entity names to IDs.

#### `RewriteContinuationService.checkPendingBackup(projectId: string): Promise<RewriteBackup | null>`

Checks for a pending rewrite backup (for crash recovery).

---

## DaemonService

**Module**: `src/services/DaemonService.ts`
**Import**: `import { DaemonService } from '@/services/DaemonService'`

Background chapter generation executor with scheduling, safety gates, and event notification.

### Constructor

```typescript
new DaemonService(config?: Partial<DaemonConfig>)
```

### DaemonConfig

```typescript
interface DaemonConfig {
  enabled: boolean                          // default: true
  mode: 'auto' | 'semi' | 'manual'         // default: 'auto'
  scheduleIntervalMs: number                // default: 3,600,000 (1 hour)
  maxChaptersPerSession: number             // default: 10
  maxChaptersPerDay: number                 // default: 50
  maxTokenPerDay: number                    // default: 5,000,000
  maxCostPerDayUSD: number                  // default: $5
  consecutiveFailureThreshold: number       // default: 3
  cooldownBetweenChaptersMs: number         // default: 2,000
  pipelineConfig?: Partial<PipelineConfig>  // Pipeline overrides
}
```

### DaemonState

```typescript
interface DaemonState {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error'
  currentChapter?: number
  chaptersCompletedToday: number
  tokensUsedToday: number
  lastRunTimestamp: number
  lastError?: string
  consecutiveFailures: number
  scheduledNextRun?: number
}
```

### DaemonEvent

```typescript
interface DaemonEvent {
  type: DaemonEventType
  timestamp: number
  chapterNumber?: number
  chapterResult?: ChapterPipelineResult
  error?: string
  state: DaemonState
}

type DaemonEventType =
  | 'started' | 'chapter-start' | 'chapter-complete'
  | 'chapter-failed' | 'paused' | 'resumed' | 'stopped'
  | 'error' | 'daily-limit-reached' | 'schedule-tick'
```

### Methods

#### Lifecycle

| Method | Signature | Description |
|--------|-----------|-------------|
| `start()` | `() => void` | Start daemon (sets status to `running`, starts scheduler) |
| `stop()` | `() => void` | Stop daemon (clears timer, sets status to `stopped`) |
| `pause()` | `() => void` | Pause daemon (waits for current chapter to complete) |
| `resume()` | `() => void` | Resume from paused state |
| `getState()` | `() => DaemonState` | Get state snapshot (copy) |
| `updateConfig(config)` | `(config: Partial<DaemonConfig>) => void` | Update config (restarts scheduler if interval changed; stops if disabled) |
| `onEvent(listener)` | `(listener: DaemonEventListener) => () => void` | Subscribe to events; returns unsubscribe function |
| `resetDailyCounters()` | `() => void` | Reset `chaptersCompletedToday` and `tokensUsedToday` |

### Safety Gates

Before each chapter execution, the daemon checks:

1. **Daily chapter limit** (`maxChaptersPerDay`)
2. **Daily token limit** (`maxTokenPerDay`)
3. **Daily cost limit** (`maxCostPerDayUSD`, estimated at $0.002/1K tokens)
4. **Consecutive failure threshold** (`consecutiveFailureThreshold`) - auto-pauses on breach
5. **Session chapter limit** (`maxChaptersPerSession`)

### Execution Flow

1. Scheduler timer fires at `scheduleIntervalMs`
2. Safety gate check
3. Determine next chapter (first unfinished from outline)
4. Acquire project lock (prevents conflict with manual generation)
5. Execute chapter via `PipelineRunner.writeNextChapter()`
6. Update counters (chapters, tokens, failures)
7. Save chapter result to project store
8. Inter-chapter cooldown
9. Release project lock
