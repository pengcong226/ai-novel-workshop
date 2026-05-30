# Stores API Reference

All stores are Pinia stores defined using the Composition API pattern (`defineStore` with setup function).

---

## Sandbox Store

**Module**: `src/stores/sandbox.ts`
**Store ID**: `'sandbox'`
**Import**: `import { useSandboxStore } from '@/stores/sandbox'`

The V5 backbone store managing Entity + StateEvent event-sourcing. This is the canonical data model for all world state, character state, faction dynamics, and lore tracking.

### State

| Name | Type | Description |
|------|------|-------------|
| `entities` | `Ref<Entity[]>` | All entities (characters, factions, locations, lore, etc.) |
| `stateEvents` | `Ref<StateEvent[]>` | Append-only state mutation records |
| `pendingStateEvents` | `Ref<StateEvent[]>` | Uncommitted state events (draft mode) |
| `currentChapter` | `Ref<number>` | Current chapter number for reducer projection (default: `1`) |
| `isLoading` | `Ref<boolean>` | Loading indicator for async operations |
| `isLoaded` | `Ref<boolean>` | Whether data has been loaded for the current project |
| `loadedProjectId` | `Ref<string \| null>` | ID of the currently loaded project |
| `draftEntities` | `Ref<Entity[]>` | Entities staged in wizard/draft mode |
| `draftRelations` | `Ref<Array<{sourceId: string; relation: EntityRelation}>>` | Relations staged in draft mode |
| `isWizardMode` | `Ref<boolean>` | Whether the entity wizard is active |
| `deltaRollbackMap` | `Ref<Map<string, {entities: Entity[]; stateEvents: StateEvent[]}>>` | Rollback snapshots for delta operations (max 10 entries) |

### Computed Properties

| Name | Type | Description |
|------|------|-------------|
| `activeEntities` | `ComputedRef<Entity[]>` | Non-archived entities |
| `characterEntities` | `ComputedRef<Entity[]>` | Non-archived CHARACTER entities |
| `loreEntities` | `ComputedRef<Entity[]>` | Non-archived LORE entities |
| `locationEntities` | `ComputedRef<Entity[]>` | Non-archived LOCATION entities |
| `factionEntities` | `ComputedRef<Entity[]>` | Non-archived FACTION entities |
| `activeEntitiesState` | `ComputedRef<Record<string, ResolvedEntity>>` | Canonical state projection at `currentChapter`. Delegates to `replayReducer`. |
| `stateEventIndexes` | `ComputedRef<StateEventIndexes>` | Pre-built indexes for fast state event lookups |

### Methods

#### `loadData(projectId: string): Promise<void>`

Loads entities and state events from persistence (Tauri IPC or localStorage). Sorts events by chapter number on load.

**Parameters**:
- `projectId` - The project to load data for

#### `addEntity(entity: Entity): Promise<void>`

Adds a single entity. Upserts by ID (merges with existing).

#### `updateEntity(id: string, updates: Partial<Entity>): Promise<void>`

Updates an entity by ID with partial fields. No-op if entity not found.

#### `deleteEntity(id: string): Promise<void>`

Deletes an entity and all its associated state events.

#### `addStateEvent(event: StateEvent): Promise<void>`

Adds a single state event. Upserts by ID. Events are sorted by chapter after insertion.

#### `deleteStateEvent(id: string): Promise<void>`

Deletes a single state event by ID.

#### `batchAddEntities(newEntities: Entity[]): Promise<void>`

Batch-adds entities. Deduplicates by ID (upsert). Throws if entities lack `projectId`.

#### `batchAddStateEvents(events: StateEvent[]): Promise<void>`

Batch-adds state events. Deduplicates by ID (upsert). Events are sorted by chapter after insertion.

#### `deleteStateEventsByChapterRange(startChapter: number, endChapter: number): Promise<void>`

Deletes all state events whose `chapterNumber` falls within `[startChapter, endChapter]`.

#### `deleteEntitiesByIds(ids: string[]): Promise<void>`

Deletes entities by IDs (deduplicated). Also removes associated state events. On partial failure, attempts reload.

#### `replaceProjectData(projectId: string, nextEntities: Entity[], nextEvents: StateEvent[]): Promise<void>`

Full replacement of sandbox data for a project. Used by restore/import operations. Web runtime stores a rollback snapshot of previous localStorage data.

#### `applyDelta(projectId: string, delta: DeltaPayload): DeltaResult`

Applies an atomic delta (add/update entities + add state events) with rollback support. Validates all state events against `StateEventSchema` before applying. Returns a `rollbackToken`.

**Parameters**:
- `delta.entitiesToAdd` - New entities to add
- `delta.entitiesToUpdate` - Entity updates `{id, updates}`
- `delta.stateEventsToAdd` - New state events to add

**Returns**: `DeltaResult` with `success`, counts, `errors`, and `rollbackToken`.

#### `rollbackDelta(rollbackToken: string): boolean`

Rolls back a delta operation using its rollback token. Returns `false` if token not found.

#### `getStateSnapshotAt(chapterNumber: number): EntityStateSnapshot[]`

Captures a non-reactive snapshot of all entity states at a given chapter number by replaying the reducer.

#### `buildNameToIdMap(): Record<string, string>`

Builds a name-to-ID mapping from all entities (includes aliases).

#### Draft Methods

- `addDraftEntity(entity: Entity)` - Stages an entity in draft mode
- `addDraftRelation(sourceId: string, relation: EntityRelation)` - Stages a relation in draft mode
- `commitDrafts(): Promise<void>` - Commits all staged entities and relations
- `clearDrafts()` - Clears all staged drafts

#### `entitiesByType(type: Entity['type']): Entity[]`

Filters active (non-archived) entities by type.

---

## Project Store

**Module**: `src/stores/project.ts`
**Store ID**: `'project'`
**Import**: `import { useProjectStore } from '@/stores/project'`

Project lifecycle management: CRUD, persistence, chapter management, import/export.

### State

| Name | Type | Description |
|------|------|-------------|
| `projects` | `ShallowRef<Project[]>` | All projects (shallow for performance) |
| `currentProject` | `ShallowRef<Project \| null>` | Currently open project |
| `loading` | `Ref<boolean>` | Loading indicator |
| `error` | `Ref<string \| null>` | Last error message |
| `globalConfig` | `Ref<ProjectConfig \| null>` | Global fallback configuration |

### Computed Properties

| Name | Type | Description |
|------|------|-------------|
| `projectCount` | `ComputedRef<number>` | Total number of projects |
| `hasCurrentProject` | `ComputedRef<boolean>` | Whether a project is currently open |

### Methods

#### `loadProjects(): Promise<void>`

Loads all projects from storage and loads global config.

#### `createProject(title: string, genre?: string, targetWords?: number): Promise<Project>`

Creates a new project with default config. Defaults: `genre='玄幻'`, `targetWords=100000`.

**Returns**: The created project.

#### `openProject(projectId: string): Promise<void>`

Opens a project, loads its data and sandbox. Automatically triggers V5 migration if legacy character/world data exists but sandbox entities are empty.

#### `saveCurrentProject(): Promise<void>`

Saves the current project with concurrency protection. A save lock prevents concurrent saves; pending saves are queued and executed after the current save completes. Also triggers auto-backup (non-blocking).

#### `debouncedSaveCurrentProject(): void`

Debounced version (1-second delay) of `saveCurrentProject()`. Suitable for frequent update scenarios.

#### `deleteProject(projectId: string): Promise<void>`

Deletes a project from storage and updates the project list.

#### `exportProject(projectId: string): Promise<void>`

Exports the current project as a `.anproj` backup file (downloads via blob URL). Includes sandbox entities and state events.

#### `importProject(file: File): Promise<Project>`

Imports a project from a file. Supports three formats:
1. `.anprojl` (NDJSON line stream) - streamed import
2. `.anproj` (V5 backup with sandbox data) - restores with new project ID
3. Legacy JSON project - basic import with new ID

**Returns**: The imported project.

#### `loadGlobalConfig(): Promise<void>`

Loads global config from localStorage (decrypted).

#### `saveGlobalConfig(config: ProjectConfig): Promise<void>`

Saves global config to localStorage (encrypted).

#### `restoreFromBackup(backupData: any): Promise<void>`

Restores the current project from raw backup data.

#### Chapter-Level API

| Method | Signature | Description |
|--------|-----------|-------------|
| `loadChapter` | `(chapterId: string) => Promise<Chapter \| null>` | Loads a single chapter with full content from storage |
| `saveChapter` | `(chapter: Chapter) => Promise<void>` | Saves a chapter independently (serialized per chapter ID) |
| `deleteChapter` | `(chapterId: string) => Promise<void>` | Deletes a chapter and updates project word count |
| `reorderChapters` | `(orderedIds: string[]) => Promise<void>` | Reorders chapters by ID array |

#### `cleanup(): void`

Removes event listeners and clears debounce timers. Call on component unmount.

---

## AI Store

**Module**: `src/stores/ai.ts`
**Store ID**: `'ai'`
**Import**: `import { useAIStore } from '@/stores/ai'`

AI model/provider configuration, chat request routing, Pipeline agent configuration, intent execution, and daemon control.

### State

| Name | Type | Description |
|------|------|-------------|
| `aiService` | `ShallowRef<AIService \| null>` | The underlying AI service instance |
| `isInitialized` | `Ref<boolean>` | Whether the AI service is initialized |
| `error` | `Ref<string \| null>` | Last initialization error |
| `configuredModel` | `Ref<string \| null>` | Currently configured model ID |
| `pipelineConfig` | `Ref<Partial<PipelineConfig>>` | Runtime Pipeline configuration |
| `agentModelOverrides` | `Ref<Record<string, AgentModelOverride>>` | Per-agent model overrides |
| `daemonState` | `Ref<DaemonState>` | Current daemon process state |

### Methods

#### `initialize(): void`

Initializes the AI service from project/global config. Reads provider configurations, builds `AIServiceConfig`, sets up model routing. Supports built-in providers (openai, anthropic, local) and custom providers.

#### `chat(messages: ChatMessage[], context?: TaskContext, options?: Partial<ChatRequest>): Promise<ChatResponse>`

Sends a non-streaming chat request. Auto-initializes if needed. Records token usage.

**Parameters**:
- `messages` - Array of chat messages
- `context` - Task context with `type`, `complexity`, `priority`, `preferredModel`
- `options` - Additional request options (maxTokens, tools, response_format, etc.)

#### `chatStream(messages: ChatMessage[], callback: (event: StreamEvent) => void, context?: TaskContext, options?: Partial<ChatRequest>): Promise<ChatResponse>`

Sends a streaming chat request. The callback receives `chunk` and `done` events. Falls back to non-streaming on stream failure.

#### `checkInitialized(): boolean`

Checks if AI service is ready. Auto-initializes if not.

#### Pipeline Configuration

| Method | Signature | Description |
|--------|-----------|-------------|
| `setAgentModelOverride` | `(agentRole: string, override: AgentModelOverride) => void` | Set per-agent model config |
| `getAgentModelOverride` | `(agentRole: string) => AgentModelOverride \| undefined` | Get per-agent model config |
| `updatePipelineConfig` | `(config: Partial<PipelineConfig>) => void` | Update runtime Pipeline config |
| `getPipelineConfig` | `() => Partial<PipelineConfig>` | Get current Pipeline config |
| `resolveAgentModel` | `(agentRole: string, contextType?: string) => string \| null` | Resolve model for a specific agent role |

#### `executeIntent(context: IntentExecutionContext): Promise<any>`

Executes an intent-driven pipeline operation. Supported intents:
- **Writing**: `write_next`, `write_chapter`, `rewrite_chapter`, `continue_writing`
- **Audit**: `audit_chapter`, `audit_all`, `check_continuity`
- **Query**: `query_entity`
- **System**: `show_status`, `help`

#### Daemon Control

| Method | Signature | Description |
|--------|-----------|-------------|
| `startDaemon` | `(config?: Partial<DaemonConfig>) => Promise<void>` | Start background daemon |
| `stopDaemon` | `() => void` | Stop daemon |
| `pauseDaemon` | `() => void` | Pause daemon |
| `resumeDaemon` | `() => void` | Resume paused daemon |
| `getDaemonState` | `() => DaemonState` | Get daemon state snapshot |

---

## Suggestions Store

**Module**: `src/stores/suggestions.ts`
**Store ID**: `'suggestions'`
**Import**: `import { useSuggestionsStore } from '@/stores/suggestions'`

AI review suggestions management with priority queue, trigger rules, and statistics.

### State

| Name | Type | Description |
|------|------|-------------|
| `suggestions` | `Ref<Suggestion[]>` | All suggestions |
| `queue` | `Ref<SuggestionQueueItem[]>` | Push queue sorted by priority score |
| `config` | `Ref<SuggestionQueueConfig>` | Queue configuration |
| `rules` | `Ref<SuggestionRule[]>` | Trigger rules (chapter_complete, character_conflict, idle) |
| `lastActivity` | `Ref<Date>` | Timestamp of last user activity |
| `isInitialized` | `Ref<boolean>` | Whether store has been initialized |

### Computed Properties

| Name | Type | Description |
|------|------|-------------|
| `unreadCount` | `ComputedRef<number>` | Number of unread suggestions |
| `highPriorityCount` | `ComputedRef<number>` | Number of unread high-priority suggestions |
| `pendingQueue` | `ComputedRef<SuggestionQueueItem[]>` | Items ready to push (sorted by score descending) |
| `statistics` | `ComputedRef<SuggestionStatistics>` | Full statistics: by status/type/category/priority, adoption rate, trend |

### Methods

#### Lifecycle

- `init()` - Loads from storage, starts periodic checks (every 60 seconds)
- `loadFromStorage()` - Loads suggestions, config, and rules from localStorage
- `saveToStorage()` - Debounced save (500ms)
- `flushSave()` - Immediate synchronous save (for beforeunload)
- `stopPeriodicCheck()` - Stops the 60-second periodic check interval

#### CRUD Operations

| Method | Signature | Description |
|--------|-----------|-------------|
| `addSuggestion` | `(params) => Suggestion \| null` | Add a suggestion. Deduplicates by message similarity (threshold: 0.8). Returns existing if similar found. |
| `getSuggestion` | `(id: string) => Suggestion \| undefined` | Get by ID |
| `deleteSuggestion` | `(id: string) => void` | Delete by ID (removes from queue too) |
| `clearProcessed` | `() => void` | Remove all adopted/ignored suggestions |

#### Status Updates

| Method | Signature | Description |
|--------|-----------|-------------|
| `updateStatus` | `(id: string, status: SuggestionStatus) => void` | Generic status update |
| `markAsRead` | `(id: string) => void` | Mark as read |
| `markAsAdopted` | `(id: string) => void` | Mark as adopted (removes from queue) |
| `markAsIgnored` | `(id: string) => void` | Mark as ignored (removes from queue) |
| `batchUpdateStatus` | `(ids: string[], status: SuggestionStatus) => void` | Batch status update |
| `markAsPushed` | `(id: string) => void` | Mark suggestion as pushed to UI, updates next push time |

#### Filtering & Queries

| Method | Signature | Description |
|--------|-----------|-------------|
| `filterSuggestions` | `(filter: SuggestionFilter) => Suggestion[]` | Filter by status, type, category, priority, project, chapter, keyword, date range |
| `getSuggestionsByChapter` | `(chapter: number, scope?) => Suggestion[]` | Get suggestions for a specific chapter |
| `getSuggestionsByCharacter` | `(characterId: string) => Suggestion[]` | Get suggestions for a specific character |
| `getNextPendingSuggestion` | `() => Suggestion \| null` | Get the highest-priority unread suggestion from the push queue |

#### Trigger System

- `triggerCheck(event: SuggestionTriggerEvent, data?)` - Fires matching rules with cooldown enforcement
- `updateActivity()` - Updates last activity timestamp
- `updateConfig(newConfig: Partial<SuggestionQueueConfig>)` - Update queue config
- `updateRule(ruleId: string, updates: Partial<SuggestionRule>)` - Update a trigger rule

### Default Trigger Rules

| Rule ID | Trigger | Cooldown | Description |
|---------|---------|----------|-------------|
| `chapter_complete_check` | `chapter_save` | 10 min | Checks quality score, suggests improvements if < 7 |
| `character_conflict_check` | `character_update` | 15 min | Checks character name formatting |
| `idle_reminder` | `idle` | 1 hour | Reminds user after idle threshold (30 min) |

### Default Queue Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `maxLength` | 50 | Maximum stored suggestions |
| `similarityThreshold` | 0.8 | Word-overlap threshold for deduplication |
| `autoExpireTime` | 7 days | Auto-expiration time |
| `highPriorityInterval` | 5 min | Push interval for high priority |
| `mediumPriorityInterval` | 30 min | Push interval for medium priority |
| `lowPriorityInterval` | 2 hours | Push interval for low priority |
| `idleThreshold` | 30 min | Idle time before reminder |
