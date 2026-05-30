# Types API Reference

---

## Sandbox Types (V5)

**Module**: `src/types/sandbox.ts`
**Import**: `import type { Entity, StateEvent, EntityRelation, ... } from '@/types/sandbox'`

The canonical V5 data model types. All new features should use these types.

### EntityType

```typescript
type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM' | 'CONCEPT' | 'WORLD'
```

| Type | Description |
|------|-------------|
| `CHARACTER` | Personas: protagonists, antagonists, supporting characters |
| `FACTION` | Organizations, sects, nations, groups |
| `LOCATION` | Places, regions, buildings |
| `LORE` | Knowledge, rules, power systems, world-building lore |
| `ITEM` | Objects, artifacts, weapons, tools |
| `CONCEPT` | Abstract concepts, techniques, philosophies |
| `WORLD` | The world entity itself (era, tech level, global settings) |

### EntityImportance

```typescript
type EntityImportance = 'critical' | 'major' | 'minor' | 'background'
```

| Level | Description |
|-------|-------------|
| `critical` | Protagonist, core antagonist, key plot driver |
| `major` | Important supporting character, major faction, key location |
| `minor` | Secondary character, general location |
| `background` | Passersby, background settings |

### Entity

```typescript
interface Entity {
  id: string               // UUID
  projectId: string        // Owning project
  type: EntityType
  name: string             // Primary display name
  aliases: string[]        // Alternative names/nicknames
  importance: EntityImportance
  category: string         // Free-form category (e.g., "力量体系", "world-rule")
  systemPrompt: string     // Full description text (character backstory, lore content, etc.)
  description?: string     // Alias for systemPrompt (legacy compat)
  speechProfile?: SpeechPattern  // Optional speech style profile
  visualMeta?: {           // Optional visual metadata for UI
    color?: string
    icon?: string
    defaultCoordinates?: { x: number; y: number }
    worldbookUid?: string
  }
  isArchived: boolean      // Soft-delete flag
  createdAt: number        // Unix timestamp (milliseconds)
}
```

### SpeechPattern

```typescript
interface SpeechPattern {
  formality: 'formal' | 'casual' | 'mixed'
  vocabulary: 'simple' | 'moderate' | 'literary'
  sentenceLength: 'short' | 'medium' | 'long'
  quirks: string[]         // e.g., ["经常用古语", "说话带口头禅"]
  catchphrases: string[]   // e.g., ["本座", "呵呵"]
}
```

### EntityRelation

```typescript
interface EntityRelation {
  targetId: string   // ID of the related entity
  type: string       // Relation type (e.g., "师徒", "敌对", "恋人")
  attitude?: string  // Psychological attitude (e.g., "信任", "戒备", "暗恋")
}
```

Note: Relations are not stored directly on entities. They are expressed as `RELATION_ADD` / `RELATION_REMOVE` / `RELATION_UPDATE` state events and resolved at runtime by the reducer.

### StateEventType

```typescript
type StateEventType =
  | 'PROPERTY_UPDATE'       // Generic property change
  | 'RELATION_ADD'          // New relation established
  | 'RELATION_REMOVE'       // Relation dissolved
  | 'RELATION_UPDATE'       // Relation attitude change
  | 'LOCATION_MOVE'         // Entity relocated
  | 'VITAL_STATUS_CHANGE'   // Death, injury, recovery
  | 'ABILITY_CHANGE'        // Ability gained, lost, or status changed
```

### StateEvent

```typescript
interface StateEvent {
  id: string               // UUID
  projectId: string        // Owning project
  chapterNumber: number    // Chapter at which this event occurs
  entityId: string         // Target entity
  eventType: StateEventType
  payload: {
    key?: string              // Property key (PROPERTY_UPDATE)
    value?: string            // Property value (PROPERTY_UPDATE)
    targetId?: string         // Related entity ID (RELATION_*)
    relationType?: string     // Relation type (RELATION_*)
    attitude?: string         // Attitude description (RELATION_UPDATE)
    coordinates?: { x: number; y: number }  // Coordinates (LOCATION_MOVE)
    status?: string           // Vital status (VITAL_STATUS_CHANGE)
    abilityName?: string      // Ability name (ABILITY_CHANGE)
    abilityStatus?: string    // Ability status: 'active' | 'sealed' | 'lost' (ABILITY_CHANGE)
  }
  source: 'MANUAL' | 'AI_EXTRACTED' | 'MIGRATION'
}
```

**Payload Usage by Event Type**:

| Event Type | Used Payload Fields |
|------------|-------------------|
| `PROPERTY_UPDATE` | `key`, `value` |
| `RELATION_ADD` | `targetId`, `relationType`, `attitude` |
| `RELATION_REMOVE` | `targetId`, `relationType` (optional) |
| `RELATION_UPDATE` | `targetId`, `attitude` |
| `LOCATION_MOVE` | `coordinates` OR `value` |
| `VITAL_STATUS_CHANGE` | `status` |
| `ABILITY_CHANGE` | `abilityName`, `abilityStatus` |

### Sandbox Store Exported Interfaces

**Module**: `src/stores/sandbox.ts`

#### ResolvedEntity

The runtime projection of an entity at a given chapter, computed by the reducer.

```typescript
interface ResolvedEntity extends Entity {
  properties: Record<string, string>    // Accumulated property values
  relations: EntityRelation[]           // Current relations
  location: { x: number; y: number } | null  // Current location
  vitalStatus: string                   // Current vital status (default: 'alive')
  abilities: AbilityRecord[]            // Current abilities
}
```

#### AbilityRecord

```typescript
interface AbilityRecord {
  name: string
  status: 'active' | 'sealed' | 'lost'
  acquiredChapter: number
}
```

#### DeltaPayload

```typescript
interface DeltaPayload {
  entitiesToAdd?: Entity[]
  entitiesToUpdate?: Array<{ id: string; updates: Partial<Entity> }>
  stateEventsToAdd?: StateEvent[]
}
```

#### DeltaResult

```typescript
interface DeltaResult {
  success: boolean
  entitiesAdded: number
  entitiesUpdated: number
  eventsAdded: number
  errors: string[]
  rollbackToken: string
}
```

---

## Legacy Types

**Module**: `src/types/index.ts`
**Import**: `import type { Project, Chapter, Outline, ... } from '@/types'`

Backward-compatible types for project structure, chapters, outlines, and configuration. Legacy character/world types are re-exported from `src/types/deprecated.ts` and should not be used for new code.

### Project

```typescript
interface Project {
  id: string
  title: string
  description: string
  genre: string
  targetWords: number
  currentWords: number
  status: ProjectStatus           // 'draft' | 'writing' | 'completed'
  createdAt: Date
  updatedAt: Date
  author?: string
  world?: WorldSetting            // @deprecated - use sandbox WORLD entity
  characters?: Character[]        // @deprecated - use sandbox CHARACTER entities
  outline: Outline
  chapters: Chapter[]
  config: ProjectConfig
  memory?: string                 // @deprecated - use sandboxStore.activeEntitiesState
  worldbook?: Worldbook           // @deprecated - use sandbox LORE entities
  knowledgeBase?: KnowledgeBase
  traceImportHistory?: TraceImportSession[]
  presets?: Preset[]
  plotEvents?: PlotEventRecord[]  // Plot events from deep import
  _entities?: Entity[]            // @internal - injected by PipelineRunner
  _stateEvents?: StateEvent[]     // @internal - injected by PipelineRunner
}
```

### Outline

```typescript
interface Outline {
  id: string
  structure?: string
  template?: string
  changeHistory?: OutlineChangeImpact[]
  synopsis: string
  theme: string
  mainPlot: PlotLine
  subPlots: PlotLine[]
  volumes: Volume[]
  chapters: ChapterOutline[]
  foreshadowings: Foreshadowing[]
}
```

### ChapterOutline

```typescript
interface ChapterOutline {
  chapterId: string
  title: string
  scenes: Scene[]
  characters: string[]
  location: string
  goals: string[]
  conflicts: string[]
  resolutions: string[]
  foreshadowingToPlant: string[]
  foreshadowingToResolve: string[]
  status: 'planned' | 'in_progress' | 'completed'
}
```

### Chapter

```typescript
interface Chapter {
  id: string
  number: number
  title: string
  content: string
  wordCount: number
  summary: string
  summaryData?: ChapterSummaryData
  outline: ChapterOutline
  status: 'draft' | 'review' | 'final'
  generatedBy: 'ai' | 'human' | 'mixed'
  generationTime: Date
  checkpoints: ChapterCheckpoint[]
  aiSuggestions: AISuggestion[]
  qualityScore?: number
}
```

### PlotLine

```typescript
interface PlotLine {
  id: string
  name: string
  description: string
  startChapter?: number
  endChapter?: number
}
```

### Volume

```typescript
interface Volume {
  id: string
  number: number
  title: string
  theme: string
  startChapter: number
  endChapter: number
  mainEvents: string[]
  chapterRange?: { start: number; end: number }
  anchors?: Array<{
    id: string
    targetChapterNumber: number
    description: string
    isResolved: boolean
  }>
  chapters?: ChapterOutline[]
}
```

### Foreshadowing

```typescript
interface Foreshadowing {
  id: string
  description: string
  plantChapter: number
  resolveChapter?: number
  status: 'planted' | 'resolved' | 'abandoned'
}
```

### ProjectConfig

Project configuration is normalized via `normalizeProjectConfig()`. Key fields include:

```typescript
interface ProjectConfig {
  providers: ProviderConfig[]     // AI model providers
  writerModel?: string            // Model for chapter writing
  plannerModel?: string           // Model for planning/outline
  sentinelModel?: string          // Model for quality checking
  extractorModel?: string         // Model for state extraction
  maxCostPerChapter?: number      // Max cost per chapter (USD)
  enableQualityCheck?: boolean    // Enable quality checking
  enableAutoReview?: boolean      // Enable auto post-generation review
  enableLogicValidator?: boolean  // Enable anti-retcon validation
  enableVectorRetrieval?: boolean // Enable vector context retrieval
  vectorConfig?: VectorServiceConfig
  advancedSettings?: {
    maxContextTokens?: number     // Max context window tokens
    targetWordCount?: number      // Target words per chapter
  }
  agentConfigs?: AgentConfig[]    // Per-agent configuration
}
```

### ProjectStatus

```typescript
type ProjectStatus = 'draft' | 'writing' | 'completed'
```

---

## Rewrite-Continuation Types

**Module**: `src/types/rewrite-continuation.ts`
**Import**: `import type { ContinuationOptions, RewriteOptions, StateDiffReport, ... } from '@/types/rewrite-continuation'`

### ContinuationOptions

```typescript
interface ContinuationOptions {
  startChapter: number
  count: number
  autoSave?: boolean
  autoExtract?: boolean
  extractPlotEvents?: boolean
  enableAntiRetcon?: boolean
}
```

### RewriteOptions

```typescript
interface RewriteOptions {
  range: { start: number; end: number }
  newDirectionPrompt?: string
  autoSave?: boolean
  extractPlotEvents?: boolean
  enableAntiRetcon?: boolean
}
```

### StateDiffReport

```typescript
interface StateDiffReport {
  baselineSnapshot: EntityStateSnapshot[]
  preRewriteSnapshot: EntityStateSnapshot[]
  postRewriteSnapshot: EntityStateSnapshot[]
  diffs: StateDiffItem[]
  brokenForeshadowing: BrokenForeshadowing[]
  newEntities: Entity[]
  removedEntityIds: string[]
}
```

### StateDiffItem

```typescript
interface StateDiffItem {
  entityId: string
  entityName: string
  category: string    // e.g., 'property_changed', 'relation_added', 'vital_status_changed'
  description: string
  before: string
  after: string
  accepted: boolean | null
}
```

### BrokenForeshadowing

```typescript
interface BrokenForeshadowing {
  plantedInChapter: number
  description: string
  brokenByChapter: number
  reason: string
}
```

### RewriteBackup

```typescript
interface RewriteBackup {
  projectId: string
  range: { start: number; end: number }
  chapters: Array<{number: number; title: string; content: string; wordCount: number}>
  stateEvents: Array<{id: string; projectId: string; chapterNumber: number; entityId: string; eventType: string; payload: Record<string, unknown>; source: string}>
  plotEvents: PlotEventRecord[]
  createdAt: number
}
```

### PlotEventRecord

```typescript
interface PlotEventRecord {
  id: string
  projectId: string
  chapterNumber: number
  description: string
  type: string           // e.g., 'foreshadowing_planted', 'foreshadowing_resolved', 'climax', 'twist'
  importance: string     // 'high' | 'medium' | 'low'
  involvedEntityIds: string[]
  estimatedResolutionChapter?: number
  resolvedForeshadowingFromChapter?: number
  evidence?: string
  createdAt: number
}
```

---

## AI Types

**Module**: `src/types/ai.ts`
**Import**: `import type { ChatMessage, ChatRequest, ChatResponse, TaskContext, StreamEvent } from '@/types/ai'`

### TaskContext

```typescript
interface TaskContext {
  type: TaskType         // 'chapter' | 'outline' | 'worldbuilding' | 'character' | 'check' | 'state_extraction' | 'memory_update' | 'assistant'
  complexity: 'low' | 'medium' | 'high'
  priority: 'speed' | 'balanced' | 'quality'
  tokenBudget?: number
  preferredModel?: string
  metadata?: Record<string, unknown>
}
```

### ChatMessage

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
```

### StreamEvent

```typescript
type StreamEvent =
  | { type: 'chunk'; chunk: string }
  | { type: 'done'; response: ChatResponse }
  | { type: 'error'; error: string }
```

### ChatResponse

```typescript
interface ChatResponse {
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  cost: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    inputCostUSD: number
    outputCostUSD: number
    totalUSD: number
    totalCNY: number
    model: string
  }
  latency: number
  finishReason: string
}
```
