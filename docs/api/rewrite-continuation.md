# RewriteContinuationService API

## Purpose

`RewriteContinuationService` coordinates two authoring workflows on top of an imported novel:

1. **Continuation** -- generate new chapters after the last imported chapter.
2. **Rewrite** -- replace a range of existing chapters with new direction, with backup and rollback support.

Both workflows use the V5 sandbox encyclopedia (`Entity` + `StateEvent`) for consistency and delegate chapter generation to `GenerationScheduler`.

**Source:** `src/services/rewrite-continuation.ts`

**Singleton export:** `rewriteContinuationService`

---

## Exported Types

### `ContinuationOptions`

```typescript
interface ContinuationOptions {
  startChapter: number       // Chapter number to start generating from
  count: number              // Number of new chapters to generate
  extractPlotEvents: boolean // Extract plot events (foreshadowing arcs)
  enableAntiRetcon: boolean  // Run anti-retcon validation on each chapter
  autoSave: boolean          // Auto-save each chapter after generation
  autoExtract: boolean       // Auto-extract entities/state events after each chapter
}
```

### `RewriteOptions`

```typescript
interface RewriteOptions {
  range: RewriteRange         // { start: number; end: number } inclusive
  newDirectionPrompt: string  // User-provided direction for the rewrite
  extractPlotEvents: boolean  // Extract plot events during rewrite
  enableAntiRetcon: boolean   // Run anti-retcon validation
  autoSave: boolean           // Auto-save
}
```

### `RewriteRange`

```typescript
interface RewriteRange {
  start: number  // First chapter to rewrite (inclusive)
  end: number    // Last chapter to rewrite (inclusive)
}
```

### `StateDiffReport`

Returned after rewrite generation to show what changed.

```typescript
interface StateDiffReport {
  baselineSnapshot: EntityStateSnapshot[]      // State at range.start - 1
  preRewriteSnapshot: EntityStateSnapshot[]    // State at range.end (before rewrite)
  postRewriteSnapshot: EntityStateSnapshot[]   // State after rewrite generation
  diffs: StateDiffItem[]                       // Structured pre/post diffs
  brokenForeshadowing: BrokenForeshadowing[]   // Foreshadowing arcs broken by rewrite
  newEntities: Entity[]                        // New entities from rewrite
  removedEntityIds: string[]                   // Entities no longer present
}
```

### `StateDiffItem`

```typescript
interface StateDiffItem {
  entityId: string
  entityName: string
  category: StateDiffCategory  // e.g. 'property_changed', 'relation_added', 'location_changed'
  description: string
  before: string
  after: string
  accepted: boolean | null     // null = pending review, true = accepted, false = rejected
}
```

### `RewriteBackup`

Serializable backup of chapters, state events, and plot events for rollback.

```typescript
interface RewriteBackup {
  projectId: string
  range: RewriteRange
  chapters: Array<{ number: number; title: string; content: string; wordCount: number }>
  stateEvents: Array<{
    id: string; projectId: string; chapterNumber: number;
    entityId: string; eventType: string; payload: Record<string, unknown>;
    source: string
  }>
  plotEvents: PlotEventRecord[]
  createdAt: number
}
```

### `PlotEventRecord`

```typescript
interface PlotEventRecord {
  id: string
  projectId: string
  chapterNumber: number
  description: string
  type: PlotEventType
  importance: number
  involvedEntityIds: string[]
  estimatedResolutionChapter?: number
  resolvedForeshadowingFromChapter?: number
  evidence?: string
  createdAt: number
}
```

---

## Class: `RewriteContinuationService`

### Constructor

```typescript
new RewriteContinuationService()
```

Creates a new instance with its own `GenerationScheduler` and empty backup state.

### Instance Methods

#### `continueNovel(options: ContinuationOptions): Promise<void>`

Generates new chapters starting from `options.startChapter`. Sets the sandbox `currentChapter` to `startChapter - 1` so the context builder produces the correct state snapshot.

| Param | Type | Description |
|-------|------|-------------|
| `options` | `ContinuationOptions` | Continuation configuration |

**Delegates to:** `GenerationScheduler.executeBatchGeneration()`

#### `startRewrite(options: RewriteOptions): Promise<StateDiffReport>`

Replaces chapters in the specified range with new content driven by `newDirectionPrompt`.

| Param | Type | Description |
|-------|------|-------------|
| `options` | `RewriteOptions` | Rewrite configuration with range and direction |

**Returns:** `StateDiffReport` comparing pre- and post-rewrite entity states.

**Throws:** `Error('No project selected')` if no project is loaded.

**Workflow:**
1. Captures baseline snapshot at `range.start - 1`
2. Captures pre-rewrite snapshot at `range.end`
3. Backs up affected chapters, state events, and plot events to encrypted localStorage
4. Deletes state events in the rewrite range from the sandbox
5. Sets `currentChapter` to `range.start - 1` for context
6. Generates replacement chapters via `GenerationScheduler`
7. Computes and returns a `StateDiffReport`

#### `acceptRewrite(): Promise<void>`

Commits the rewrite. Clears the persisted backup and saves the project.

#### `rejectRewrite(): Promise<void>`

Rolls back the rewrite. Restores state events, chapter content, word counts, titles, and plot events from the backup. Clears the persisted backup and saves the project.

**Behavior on error:** If backup restoration of state events fails, logs error but continues restoring chapters and plot events.

#### `cancel(): void`

Cancels the currently running batch generation. Delegates to `GenerationScheduler.cancelBatchGeneration()`.

### Static Methods

#### `RewriteContinuationService.convertPlotEvents(extracted, projectId, chapterNumber, nameToIdMap): PlotEventRecord[]`

Converts extracted plot events (from LLM output) into `PlotEventRecord` format for persistence. Resolves entity names to IDs via the provided map.

| Param | Type | Description |
|-------|------|-------------|
| `extracted` | `ExtractedPlotEvent[]` | Raw plot events from LLM extraction |
| `projectId` | `string` | Target project ID |
| `chapterNumber` | `number` | Chapter where events were extracted |
| `nameToIdMap` | `Record<string, string>` | Entity name to UUID mapping |

**Returns:** Array of `PlotEventRecord` with resolved entity IDs.

#### `RewriteContinuationService.checkPendingBackup(projectId: string): Promise<RewriteBackup | null>`

Checks encrypted localStorage for a pending rewrite backup (for crash recovery).

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | `string` | Project to check |

**Returns:** `RewriteBackup` if found, `null` otherwise.

---

## Singleton Export

```typescript
export const rewriteContinuationService = new RewriteContinuationService()
```

Import and use this singleton for all rewrite/continuation operations.

---

## Usage Examples

### Continue a novel after import

```typescript
import { rewriteContinuationService } from '@/services/rewrite-continuation'

await rewriteContinuationService.continueNovel({
  startChapter: 21,      // Continue from chapter 21
  count: 5,              // Generate 5 new chapters
  extractPlotEvents: true,
  enableAntiRetcon: true,
  autoSave: true,
  autoExtract: true,
})
```

### Rewrite a range of chapters

```typescript
const report = await rewriteContinuationService.startRewrite({
  range: { start: 10, end: 15 },
  newDirectionPrompt: '主角在第10章选择放弃修炼，转向商业路线发展',
  extractPlotEvents: true,
  enableAntiRetcon: true,
  autoSave: true,
})

// Review the diff
console.log(`${report.diffs.length} state changes detected`)
console.log(`${report.brokenForeshadowing.length} foreshadowing arcs broken`)

// Accept or reject
if (userApproves) {
  await rewriteContinuationService.acceptRewrite()
} else {
  await rewriteContinuationService.rejectRewrite()
}
```

### Cancel an ongoing operation

```typescript
rewriteContinuationService.cancel()
```

### Crash recovery

```typescript
const pending = await RewriteContinuationService.checkPendingBackup(projectId)
if (pending) {
  // Show UI: "A rewrite backup was found for chapters {range}. Restore?"
  console.log(`Pending backup for chapters ${pending.range.start}-${pending.range.end}`)
}
```

### Convert plot events (used internally by generation scheduler)

```typescript
const records = RewriteContinuationService.convertPlotEvents(
  extractedPlotEvents,
  'project-123',
  5,
  { '张三': 'uuid-abc', '李四': 'uuid-def' }
)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No project selected | `startRewrite` throws `Error('No project selected')` |
| No backup to restore | `rejectRewrite` logs warning and returns without action |
| Backup persistence failure | Warning logged; rewrite continues without backup protection |
| State event restoration failure | Error logged; chapter/plot restoration continues |
| Backup clear failure | Warning logged; does not affect main flow |
| Generation failure during rewrite | Error propagates from `GenerationScheduler`; backup remains for recovery |
