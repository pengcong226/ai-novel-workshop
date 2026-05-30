# NovelExtractor API

## Purpose

`NovelExtractor` is the incremental chapter-by-chapter extraction pipeline for deep-importing existing novels. It uses LLM Tool Calling to extract `Entity` (characters, factions, lore, etc.) and `StateEvent` records from each chapter. Results are cached per-session in encrypted localStorage and can be resumed after interruption.

**Source:** `src/services/novel-extractor.ts`

Two extraction modes are supported:
- **Full mode** -- extract every chapter sequentially.
- **Smart sampling mode** -- LLM quick-scans chapters to identify "key" chapters, then extracts only those.

---

## Exported Types

### `DeepImportOptions`

```typescript
interface DeepImportOptions {
  mode: 'full' | 'smart_sampling'       // Extraction strategy
  extractPlotEvents: boolean            // Also extract plot-level events
  checkpointInterval: number            // Chapters between review pauses (0 = none)
  maxCostUSD: number                    // Auto-pause cost ceiling
  batchSize: number                     // Chapters per batch LLM call
  chapterRange?: { start: number; end: number }  // Partial extraction range
}
```

### `DeepImportSession`

```typescript
interface DeepImportSession {
  id: string
  projectId: string
  totalChapters: number
  extractedChapters: number[]
  results: Map<number, ChapterExtractionResult>
  nameToIdMap: Record<string, string>     // Entity name -> UUID
  totalTokenUsage: { input: number; output: number }
  totalCostUSD: number
  createdAt: number
  updatedAt: number
  mode: 'full' | 'smart_sampling'
  keyChapters?: number[]                  // For smart sampling
  isComplete: boolean
}
```

### `DeepImportEstimate`

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

### `ChapterExtractionResult`

```typescript
interface ChapterExtractionResult {
  chapterNumber: number
  entities: ExtractNovelEntitiesOutput
  stateEvents: ExtractStateEventsOutput
  plotEvents?: ExtractPlotEventsOutput
  tokenUsage: { input: number; output: number }
  costUSD: number
  extractedAt: number
  status: 'success' | 'skipped' | 'error'
  errorMessage?: string
}
```

### `BatchExtractionResult`

```typescript
interface BatchExtractionResult {
  batchIndex: number
  chapterRange: { start: number; end: number }
  chapterResults: ChapterExtractionResult[]
  tokenUsage: { input: number; output: number }
  costUSD: number
  extractedAt: number
  status: 'success' | 'error'
  errorMessage?: string
}
```

### `ExtractionProgress`

Emitted via the `onProgress` callback during extraction.

```typescript
interface ExtractionProgress {
  currentChapter: number
  totalChapters: number
  phase: 'entity_extraction' | 'state_extraction' | 'plot_extraction' | 'review_checkpoint'
  percentage: number             // 0-100
  tokenUsage: { input: number; output: number }
  costUSD: number
  message: string                // Human-readable status for UI
  currentBatch?: number          // 1-indexed
  totalBatches?: number
  batchChapterRange?: { start: number; end: number } | null
}
```

### `SandboxCommitOps`

Output of `resolveToSandboxOps`, ready to commit to the sandbox store.

```typescript
interface SandboxCommitOps {
  newEntities: Entity[]
  updatedEntities: Array<{ id: string; updates: Partial<Entity> }>
  stateEvents: StateEvent[]
}
```

### `EntitySummaryMap`

```typescript
type EntitySummaryMap = Map<string, EntitySummary>
```

Where `EntitySummary` contains: `{ id, name, type, importance, summary, isNearby }`.

---

## Class: `NovelExtractor`

### Constructor

```typescript
new NovelExtractor(
  projectId: string,
  options: DeepImportOptions,
  onProgress?: (progress: ExtractionProgress) => void
)
```

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | `string` | Target project ID |
| `options` | `DeepImportOptions` | Extraction configuration |
| `onProgress` | `(progress: ExtractionProgress) => void` | Optional progress callback |

### Instance Methods

#### `estimateCost(chapters: ParsedChapter[]): DeepImportEstimate`

Estimates cost and time before running extraction. Accounts for batch size, system prompt overhead, and entity list injection.

| Param | Type | Description |
|-------|------|-------------|
| `chapters` | `ParsedChapter[]` | All parsed chapters |

**Returns:** `DeepImportEstimate` with token counts, costs, and time estimate.

#### `extractAll(chapters, existingEntities?, resumeFrom?, keyChaptersOverride?): Promise<DeepImportSession>`

Main extraction pipeline. Processes all chapters in batches, caches progress, and supports resume.

| Param | Type | Description |
|-------|------|-------------|
| `chapters` | `ParsedChapter[]` | All parsed chapters |
| `existingEntities` | `Entity[]` | Pre-existing entities to seed the known entity list |
| `resumeFrom` | `DeepImportSession` | Previous incomplete session to resume |
| `keyChaptersOverride` | `number[]` | Override key chapters for smart sampling |

**Returns:** Completed or partially-completed `DeepImportSession`.

**Behavior:**
- Filters chapters by `options.chapterRange` if set
- Skips already-extracted chapters (resume support)
- In smart sampling mode, skips non-key chapters
- Auto-pauses at checkpoint intervals and on cost limit
- Auto-pauses after 5 consecutive batch failures
- Debounced caching every 2 seconds; flush on completion

#### `extractChapter(chapter, knownEntityMap, prevChapterContent?): Promise<ChapterExtractionResult>`

Thin wrapper to extract a single chapter. Delegates to `extractBatch`.

| Param | Type | Description |
|-------|------|-------------|
| `chapter` | `ParsedChapter` | Chapter to extract |
| `knownEntityMap` | `EntitySummaryMap` | Known entity summaries for context |
| `prevChapterContent` | `string` | Previous chapter content for continuity |

**Returns:** `ChapterExtractionResult`

#### `extractBatch(chapters, knownEntityMap, prevBatchContent?): Promise<BatchExtractionResult>`

Extracts a batch of chapters. Makes up to 3 LLM calls per batch:
1. Entity extraction (new entities, updates, relations)
2. State event extraction (property changes, location moves, etc.)
3. Plot event extraction (optional, when `extractPlotEvents` is enabled)

| Param | Type | Description |
|-------|------|-------------|
| `chapters` | `ParsedChapter[]` | Chapters in the batch |
| `knownEntityMap` | `EntitySummaryMap` | Known entity summaries |
| `prevBatchContent` | `string` | Previous batch tail for context |

**Returns:** `BatchExtractionResult` with per-chapter split results.

#### `quickScanChapter(chapter): Promise<{ isKeyChapter: boolean; reason: string; mentionedEntities: string[] }>`

Fast LLM classification to determine if a chapter is "key" (contains important entity introductions or state changes). Used in smart sampling mode.

| Param | Type | Description |
|-------|------|-------------|
| `chapter` | `ParsedChapter` | Chapter to scan |

**Returns:** Object with `isKeyChapter` flag, `reason`, and `mentionedEntities`.

#### `resolveToSandboxOps(session: DeepImportSession): SandboxCommitOps`

Converts a completed extraction session into sandbox commit operations. Deduplicates entities, resolves names to IDs, and builds `StateEvent` records for all relations and state changes.

| Param | Type | Description |
|-------|------|-------------|
| `session` | `DeepImportSession` | Completed extraction session |

**Returns:** `SandboxCommitOps` with `newEntities`, `updatedEntities`, and `stateEvents`.

#### `abort(): void`

Stops extraction immediately. Clears cache timer, resolves pause promise, and aborts the `AbortController`.

#### `pause(): void`

Pauses extraction at the next batch boundary. Blocks the processing loop until `resume()` is called.

#### `resume(): void`

Resumes a paused extraction.

### Static Methods

#### `NovelExtractor.checkResumableSession(projectId: string): Promise<DeepImportSession | null>`

Checks encrypted localStorage for an incomplete session for the given project. Uses an index for fast lookup, with a legacy fallback that scans by key prefix.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | `string` | Project to check |

**Returns:** The first incomplete `DeepImportSession`, or `null`.

#### `NovelExtractor.clearCachedSession(projectId: string, sessionId: string): void`

Removes a cached session from localStorage and updates the session index.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | `string` | Project ID |
| `sessionId` | `string` | Session ID to clear |

---

## Usage Examples

### Full extraction

```typescript
import { NovelExtractor } from '@/services/novel-extractor'

const extractor = new NovelExtractor(
  projectId,
  {
    mode: 'full',
    extractPlotEvents: true,
    checkpointInterval: 10,
    maxCostUSD: 2.0,
    batchSize: 1,
  },
  (progress) => {
    console.log(`${progress.phase}: ${progress.percentage}% - ${progress.message}`)
  }
)

// Estimate cost first
const estimate = extractor.estimateCost(chapters)
console.log(`Estimated cost: $${estimate.totalCostUSD}, ~${estimate.estimatedTimeMinutes} min`)

// Run extraction
const session = await extractor.extractAll(chapters, existingEntities)

// Commit to sandbox
const ops = extractor.resolveToSandboxOps(session)
await sandboxStore.batchAddEntities(ops.newEntities)
await sandboxStore.batchAddStateEvents(ops.stateEvents)
```

### Smart sampling mode

```typescript
const extractor = new NovelExtractor(projectId, {
  mode: 'smart_sampling',
  extractPlotEvents: false,
  checkpointInterval: 20,
  maxCostUSD: 1.0,
  batchSize: 3,
})

// Key chapters override (user-selected)
const session = await extractor.extractAll(chapters, existingEntities, undefined, [1, 5, 10, 15, 20])
```

### Resume an interrupted session

```typescript
const resumable = await NovelExtractor.checkResumableSession(projectId)
if (resumable) {
  const extractor = new NovelExtractor(projectId, options, onProgress)
  const session = await extractor.extractAll(chapters, existingEntities, resumable)
}
```

### Pause / Resume / Abort

```typescript
extractor.pause()   // Pauses at next batch boundary
extractor.resume()  // Resumes processing
extractor.abort()   // Stops immediately
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| LLM JSON parse failure | Falls back to `JSON.parse`, then to empty result; logs at debug level |
| Batch extraction failure | All chapters in batch marked with `status: 'error'`; consecutive failure counter incremented |
| 5 consecutive failures | Extraction auto-pauses |
| Cost limit reached | Extraction breaks out of loop |
| Checkpoint interval hit | Extraction pauses and emits `review_checkpoint` progress event |
| Session cache write failure | Warning logged; extraction continues |
| Abort during extraction | Cache timer cleared, pause resolved, abort controller fires |
| Entity name not found in `resolveToSandboxOps` | Warning logged, relation/event skipped |

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `MAX_CONSECUTIVE_FAILURES` | 5 | Auto-pause threshold |
| `NEARBY_WINDOW` | 5 | Chapter window for full entity summaries |
| `MAX_ENTITY_SUMMARY_TOKENS` | 3000 | Token budget for entity summary injection |
| `CHARS_PER_TOKEN` | 1.5 | Approximate chars per token for Chinese text |
| `DEFAULT_COST_PER_1K_INPUT` | $0.0025 | Input token cost estimate |
| `DEFAULT_COST_PER_1K_OUTPUT` | $0.01 | Output token cost estimate |
