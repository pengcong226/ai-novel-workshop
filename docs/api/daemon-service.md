# DaemonService API

## Purpose

`DaemonService` is a background pipeline executor that manages automated chapter generation with safety gates, scheduled execution, and progress event notifications. It supports three operating modes and provides comprehensive guardrails against runaway AI costs.

**Source:** `src/services/DaemonService.ts`

**Operating modes:**
- `auto` -- fully automatic: generates chapters on schedule without human intervention.
- `semi` -- semi-automatic: requires human confirmation before proceeding.
- `manual` -- manual trigger only: the scheduler still runs, but chapter generation must be explicitly triggered.

---

## Exported Types

### `DaemonConfig`

```typescript
interface DaemonConfig {
  enabled: boolean                          // Enable/disable the service
  mode: 'auto' | 'semi' | 'manual'         // Operating mode
  scheduleIntervalMs: number                // Scheduling interval (default: 3,600,000 = 1 hour)
  maxChaptersPerSession: number             // Max chapters per session (default: 10)
  maxChaptersPerDay: number                 // Daily chapter cap (default: 50)
  maxTokenPerDay: number                    // Daily token cap (default: 5,000,000)
  maxCostPerDayUSD: number                  // Daily cost cap in USD (default: $5)
  consecutiveFailureThreshold: number       // Auto-pause after N consecutive failures (default: 3)
  cooldownBetweenChaptersMs: number         // Cooldown between chapters (default: 2,000)
  pipelineConfig?: Partial<PipelineConfig>  // Pipeline configuration overrides
}
```

### `DaemonState`

```typescript
interface DaemonState {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'error'
  currentChapter?: number                   // Chapter currently being generated
  chaptersCompletedToday: number
  tokensUsedToday: number
  lastRunTimestamp: number
  lastError?: string
  consecutiveFailures: number
  scheduledNextRun?: number                 // Timestamp of next scheduled run
}
```

### `DaemonEventType`

```typescript
type DaemonEventType =
  | 'started'
  | 'chapter-start'
  | 'chapter-complete'
  | 'chapter-failed'
  | 'paused'
  | 'resumed'
  | 'stopped'
  | 'error'
  | 'daily-limit-reached'
  | 'schedule-tick'
```

### `DaemonEvent`

```typescript
interface DaemonEvent {
  type: DaemonEventType
  timestamp: number
  chapterNumber?: number
  chapterResult?: ChapterPipelineResult
  error?: string
  state: DaemonState     // Snapshot of daemon state at event time
}
```

### `DaemonEventListener`

```typescript
type DaemonEventListener = (event: DaemonEvent) => void
```

---

## Class: `DaemonService`

### Constructor

```typescript
new DaemonService(config?: Partial<DaemonConfig>)
```

| Param | Type | Description |
|-------|------|-------------|
| `config` | `Partial<DaemonConfig>` | Optional configuration overrides. Merged with defaults. |

---

### Lifecycle Methods

#### `start(): void`

Starts the daemon service. Sets status to `running` and starts the scheduling timer. Emits `'started'` event.

**No-op if:** already running or disabled.

#### `stop(): void`

Stops the daemon service. Clears the scheduling timer and sets status to `stopped`. Emits `'stopped'` event.

**No-op if:** already stopped.

#### `pause(): void`

Pauses the daemon service. Clears the scheduling timer and sets status to `paused`. Emits `'paused'` event. The current chapter (if executing) will finish before pausing takes effect.

**No-op if:** status is not `running`.

#### `resume(): void`

Resumes from paused state. Restarts the scheduling timer and sets status to `running`. Emits `'resumed'` event.

**No-op if:** status is not `paused`.

---

### Configuration Methods

#### `getState(): DaemonState`

Returns a copy of the current daemon state.

**Returns:** `DaemonState` (copy, not reference)

#### `updateConfig(config: Partial<DaemonConfig>): void`

Updates daemon configuration. If the scheduling interval changes while running, the timer is restarted. If `enabled` is set to `false` while running, the service is automatically stopped.

| Param | Type | Description |
|-------|------|-------------|
| `config` | `Partial<DaemonConfig>` | Configuration overrides |

#### `onEvent(listener: DaemonEventListener): () => void`

Subscribes to daemon events. Returns an unsubscribe function.

| Param | Type | Description |
|-------|------|-------------|
| `listener` | `DaemonEventListener` | Event handler |

**Returns:** Unsubscribe function.

#### `resetDailyCounters(): void`

Resets `chaptersCompletedToday` and `tokensUsedToday` to zero. Typically called at midnight or when a new day begins. Does not automatically resume from paused state.

---

### Safety Gates

The daemon checks these gates before each chapter execution:

| Gate | Condition | Default |
|------|-----------|---------|
| Daily chapter limit | `chaptersCompletedToday >= maxChaptersPerDay` | 50 |
| Daily token limit | `tokensUsedToday >= maxTokenPerDay` | 5,000,000 |
| Daily cost limit | estimated cost >= `maxCostPerDayUSD` | $5 |
| Consecutive failures | `consecutiveFailures >= consecutiveFailureThreshold` | 3 (auto-pauses) |
| Session chapter limit | `chaptersCompletedToday >= maxChaptersPerSession` | 10 |

Cost estimation uses a simplified model: approximately $0.002 per 1K tokens.

---

### Internal Pipeline

When a chapter is executed:

1. Dynamically imports `useProjectStore` to get current project
2. Acquires a project lock to prevent concurrency with one-click continuation
3. Determines the next ungenerated chapter from the outline
4. Dynamically imports `PipelineRunner` and `BatchContinueScheduler`
5. Gets the previous chapter's last 500 characters for continuity
6. Runs `PipelineRunner.writeNextChapter()`
7. Saves the result via project store
8. Releases the project lock
9. Applies inter-chapter cooldown

---

## Usage Examples

### Basic startup

```typescript
import { DaemonService } from '@/services/DaemonService'

const daemon = new DaemonService({
  mode: 'auto',
  scheduleIntervalMs: 3_600_000,  // 1 hour
  maxChaptersPerDay: 20,
  maxCostPerDayUSD: 3.0,
})

// Subscribe to events
const unsubscribe = daemon.onEvent((event) => {
  switch (event.type) {
    case 'chapter-complete':
      console.log(`Chapter ${event.chapterNumber} done!`)
      break
    case 'daily-limit-reached':
      console.log('Daily limit reached, stopping.')
      break
    case 'chapter-failed':
      console.error(`Chapter failed: ${event.error}`)
      break
  }
})

daemon.start()
```

### Semi-automatic mode with confirmation

```typescript
const daemon = new DaemonService({
  mode: 'semi',
  scheduleIntervalMs: 1_800_000,  // 30 minutes
  maxChaptersPerSession: 5,
  consecutiveFailureThreshold: 2,
})

daemon.onEvent((event) => {
  if (event.type === 'chapter-complete') {
    // In semi mode, prompt user before next chapter
    const shouldContinue = confirm(`Chapter ${event.chapterNumber} complete. Continue?`)
    if (!shouldContinue) daemon.pause()
  }
  if (event.type === 'daily-limit-reached') {
    notifyUser('Daily generation limit reached.')
  }
})

daemon.start()
```

### Manual mode

```typescript
const daemon = new DaemonService({
  mode: 'manual',
  maxChaptersPerDay: 100,
})

daemon.start()  // Starts the scheduler, but does not auto-generate

// Trigger generation externally via PipelineRunner
```

### Dynamic configuration update

```typescript
// Change cost limit at runtime
daemon.updateConfig({ maxCostPerDayUSD: 10.0 })

// Change scheduling interval (restarts timer automatically)
daemon.updateConfig({ scheduleIntervalMs: 900_000 })  // 15 minutes

// Disable (automatically stops if running)
daemon.updateConfig({ enabled: false })
```

### Daily counter reset (e.g., cron job at midnight)

```typescript
// Reset counters at the start of each day
daemon.resetDailyCounters()
daemon.resume()  // If it was paused due to daily limits
```

### Unsubscribe from events

```typescript
const unsubscribe = daemon.onEvent(myListener)
// Later:
unsubscribe()
```

---

## Event Types Reference

| Event | When | Key Fields |
|-------|------|------------|
| `started` | Daemon starts | `state` |
| `schedule-tick` | Timer fires (each interval) | `state` |
| `chapter-start` | Chapter generation begins | `chapterNumber`, `state` |
| `chapter-complete` | Chapter generation succeeds | `chapterNumber`, `chapterResult`, `state` |
| `chapter-failed` | Chapter generation fails | `chapterNumber`, `error`, `state` |
| `paused` | Daemon paused | `state` |
| `resumed` | Daemon resumed from pause | `state` |
| `stopped` | Daemon stopped | `state` |
| `error` | Consecutive failure threshold exceeded | `error`, `state` |
| `daily-limit-reached` | Any daily limit hit | `error`, `state` |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No current project found | `chapter-failed` event emitted; `consecutiveFailures` incremented |
| Project lock conflict (concurrent generation) | Chapter skipped; no failure counted |
| All chapters from outline completed | Execution returns `null`; daemon continues scheduling |
| Pipeline execution error | `chapter-failed` event emitted; chapter skipped |
| Chapter save failure | Error logged; does not affect daemon state |
| Cost estimation | Simplified model: $0.002 per 1K tokens |
| Event listener throws | Error caught and logged; other listeners still called |
| Consecutive failure threshold reached | Daemon auto-pauses; `error` event emitted |
| Dynamic import failure | Chapter execution fails; caught and handled |

## State Machine

```
idle --> running (start)
running --> paused (pause)
running --> stopped (stop)
paused --> running (resume)
paused --> stopped (stop)
running --> paused (auto: consecutive failures >= threshold)
stopped --> running (start)
```

The `error` status is not a distinct state; errors are signaled via the `'error'` event while the status transitions to `paused`.
