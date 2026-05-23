# V5 Entity & StateEvent Architecture Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete the V5 Multi-View Sandbox Architecture refactoring by unifying all character, worldbook, and sandbox data under the `Entity` and `StateEvent` models.

**Architecture:** Adopt the V5 Event Sourcing model (`sandbox.ts`) as the single source of truth. Expand the base `Entity` type to hold static identity fields, and expand `StateEvent` types to capture all dynamic state changes. The old V1 models will be migrated on project load, and `character-card.ts` will be retained purely as an import/export adapter.

**Tech Stack:** Vue 3, Pinia, TypeScript, Tauri (SQLite)

---

### Task 1: Unify Type Definitions in `sandbox.ts`

**Files:**
- Modify: `src/types/sandbox.ts`

- [x] **Step 1: Expand EntityType and Entity Importance**

Replace `EntityType` and add `EntityImportance` in `src/types/sandbox.ts`:

```typescript
export type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM' | 'CONCEPT' | 'WORLD';
export type EntityImportance = 'critical' | 'major' | 'minor' | 'background';
```

- [x] **Step 2: Expand Entity interface**

Update the `Entity` interface in `src/types/sandbox.ts`:

```typescript
export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  importance: EntityImportance;
  category: string;
  systemPrompt: string;
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number; y: number };
    worldbookUid?: string;
  };
  isArchived: boolean;
  createdAt: number;
}
```

- [x] **Step 3: Expand StateEventType and StateEvent**

Update the `StateEventType` and `StateEvent` interface in `src/types/sandbox.ts`:

```typescript
export type StateEventType = 
  | 'PROPERTY_UPDATE' 
  | 'RELATION_ADD' 
  | 'RELATION_REMOVE' 
  | 'RELATION_UPDATE' 
  | 'LOCATION_MOVE'
  | 'VITAL_STATUS_CHANGE'
  | 'ABILITY_CHANGE';

export interface StateEvent {
  id: string;
  projectId: string;
  chapterNumber: number;
  entityId: string;
  eventType: StateEventType;
  payload: {
    key?: string;
    value?: string;
    targetId?: string;
    relationType?: string;
    attitude?: string;
    coordinates?: { x: number; y: number };
    status?: string;
    abilityName?: string;
    abilityStatus?: string;
  };
  source: 'MANUAL' | 'AI_EXTRACTED' | 'MIGRATION';
}
```

### Task 2: Update Tauri Backend and SQLite Schema

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: Update SQLite `entities` table creation schema**

Find `CREATE TABLE IF NOT EXISTS entities` in `src-tauri/src/lib.rs` and update it:

```rust
"CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL,
    importance TEXT NOT NULL,
    category TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    visual_meta TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
)",
```

- [x] **Step 2: Update `save_entity` command**

Modify the `save_entity` command in `src-tauri/src/lib.rs` to extract and save the new fields:
Parse aliases array to string, get importance, and isArchived boolean to int.
Insert into the 11 columns in the SQL statement.

- [x] **Step 3: Update `load_entities` command**

Modify the `load_entities` command to parse the new fields back into JSON and return the 11 columns.

### Task 3: Implement Data Loading and CRUD in `sandbox.ts`

**Files:**
- Modify: `src/stores/sandbox.ts`

- [x] **Step 1: Implement `loadData`**

Replace the stubbed `loadData` method in `src/stores/sandbox.ts` with actual Tauri `invoke` calls for `load_entities` and `load_state_events`.

- [x] **Step 2: Add direct CRUD operations**

Add `addEntity`, `updateEntity`, `addStateEvent` functions that call Tauri invokes and update the local ref arrays.

- [x] **Step 3: Export the new methods**

Add the new methods to the `return` statement of `useSandboxStore`.

### Task 4: Upgrade Sandbox Reducer to `ResolvedEntity`

**Files:**
- Modify: `src/stores/sandbox.ts`

- [x] **Step 1: Export AbilityRecord and ResolvedEntity types**

Add `AbilityRecord` and `ResolvedEntity` interfaces.

- [x] **Step 2: Update ActiveEntityState to ResolvedEntity**

Replace `ActiveEntityState` references with `ResolvedEntity`. 

- [x] **Step 3: Add new event handlers to the reducer**

Add handlers for `VITAL_STATUS_CHANGE` and `ABILITY_CHANGE` in the switch statement inside the `activeEntitiesState` computed.

### Task 5: Create Migration Script

**Files:**
- Create: `src/utils/v1ToV5Migration.ts`

- [x] **Step 1: Write migration script**

Create `src/utils/v1ToV5Migration.ts` with a function `migrateV1ToV5` that maps `Character` arrays and `WorldbookEntry` arrays into `Entity[]` and `StateEvent[]`.

### Task 6: Execute Migration on Project Load

**Files:**
- Modify: `src/stores/project.ts`

- [x] **Step 1: Wire up migration logic in `openProject`**

In `src/stores/project.ts`, run `migrateV1ToV5` if `projectData.characters` exists and has items, save entities via `useSandboxStore`, clear old characters, and save project.

### Task 7: Replace V3 State Pipeline with Direct Event Sourcing

**Files:**
- Modify: `src/services/generation-scheduler.ts`

- [x] **Step 1: Remove V3 state updater crash**

In `src/services/generation-scheduler.ts`, remove the call to `runStateUpdatePipeline(chapter.content, project.characters as any, chapter.number, project.id)`.