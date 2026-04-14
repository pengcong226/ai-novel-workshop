# V5 Entity & StateEvent Architecture Refactoring

**Goal:** Complete the V5 Multi-View Sandbox Architecture refactoring by unifying all character, worldbook, and sandbox data under the `Entity` and `StateEvent` models, eliminating the 4 competing data models and 3 competing state trackers.

**Architecture:** We will adopt the V5 Event Sourcing model (`sandbox.ts`) as the single source of truth. We will expand the base `Entity` type to hold static identity fields, and expand `StateEvent` types to capture all dynamic state changes. A new computed view `ResolvedEntity` will replace `CharacterV3`/`WorldEntityV3`. The old V1 models will be migrated on project load, and `character-card.ts` will be retained purely as an import/export adapter.

**Tech Stack:** Vue 3, Pinia, TypeScript, Tauri (SQLite)

---

## 1. Unified Type Definitions (`src/types/sandbox.ts`)

**Base Entity Expansion:**
```typescript
export type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM' | 'CONCEPT';
export type EntityImportance = 'critical' | 'major' | 'minor' | 'background';

export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  aliases: string[];         // Added: From V1 Character
  importance: EntityImportance; // Added: From V1 CharacterTag
  category: string;
  systemPrompt: string;      // Used for background/personality/appearance
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number; y: number };
  };
  isArchived: boolean;       // Added: From V1 Character
  createdAt: number;
}
```

**StateEvent Expansion:**
```typescript
export type StateEventType = 
  | 'PROPERTY_UPDATE' 
  | 'RELATION_ADD' 
  | 'RELATION_REMOVE' 
  | 'RELATION_UPDATE' 
  | 'LOCATION_MOVE'
  | 'VITAL_STATUS_CHANGE'    // Added: alive/dead/unknown
  | 'ABILITY_CHANGE';        // Added: gain/lose/improve

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
    status?: string;         // For VITAL_STATUS_CHANGE
    abilityName?: string;    // For ABILITY_CHANGE
    abilityStatus?: string;  // For ABILITY_CHANGE
  };
  source: 'MANUAL' | 'AI_EXTRACTED' | 'MIGRATION';
}
```

**Resolved View (Computed):**
```typescript
export interface AbilityRecord {
  name: string;
  status: 'active' | 'sealed' | 'lost';
}

export interface ResolvedEntity {
  entity: Entity;
  // Computed from StateEvents:
  properties: Record<string, string>;
  relations: EntityRelation[];
  location: { x: number, y: number } | string | null;
  vitalStatus: 'alive' | 'dead' | 'missing' | 'unknown';
  abilities: AbilityRecord[];
}
```

## 2. Infrastructure & Data Layer (`src/stores/sandbox.ts` & `src-tauri/src/lib.rs`)

1. **Implement `sandboxStore.loadData()`**:
   - Connect to Tauri backend to call `load_entities` and `load_state_events`
   - Store results in `entities.value` and `stateEvents.value`

2. **Add CRUD Actions to `sandbox.ts`**:
   - `addEntity(entity)`, `updateEntity(id, updates)`, `deleteEntity(id)`
   - `addStateEvent(event)`, `deleteStateEvent(id)`
   - Back these with existing Tauri commands (`save_entity`, `save_state_event`) and add missing delete commands.

3. **Update Reducer**:
   - Modify `activeEntitiesState` computed property to return `Record<string, ResolvedEntity>`
   - Add handlers for `VITAL_STATUS_CHANGE` and `ABILITY_CHANGE` in the switch statement.

4. **Tauri Schema Migrations**:
   - Ensure the SQLite `entities` table has columns for `aliases`, `importance`, and `is_archived`.
   - Update `save_entity` and `load_entities` commands to map these fields.

## 3. The Great Migration (`src/utils/entityMigration.ts`)

Create a robust migration script that runs once per project:

1. **Transform V1 `Character` -> `Entity` & `StateEvent[]`**:
   - Base fields (`name`, `aliases`, `gender`, `appearance`, `personality`) merge into the `Entity`'s `systemPrompt` or static fields.
   - `tags` mapping: `'protagonist'` -> `'critical'`, `'supporting'` -> `'major'`, etc.
   - `relationships` -> Generate `RELATION_ADD` StateEvents at chapter 0.
   - `abilities` -> Generate `ABILITY_CHANGE` StateEvents at chapter 0.
   - `stateHistory` -> Generate `LOCATION_MOVE` and `VITAL_STATUS_CHANGE` events at corresponding chapters.

2. **Transform `WorldbookEntry` -> `Entity`**:
   - Map worldbook entries to `EntityType = 'LORE' | 'LOCATION' | 'FACTION' | 'ITEM'`.
   - Content goes into `systemPrompt`.

3. **Project Load Hook**:
   - In `project.ts:openProject`, after loading `projectData`, detect if `projectData.characters.length > 0`.
   - If true, run migration: insert all new entities and events via `sandbox.ts`, then clear `projectData.characters` and `projectData.worldbook`, and save the project.

## 4. Store Deprecation & Consolidation

1. **Deprecate `useWorldbookStore` & `worldbook.ts`**:
   - Remove `src/stores/worldbook.ts` completely to eliminate the database race conditions.
   - Any UI components managing worldbook data must read/write `EntityType = 'LORE'` entities via `sandbox.ts`.

2. **Retain `useCharacterCardStore` as Adapter Only**:
   - `character-card.ts` stays in memory only.
   - `importCharacterCard` will parse the PNG/JSON, then **dispatch actions to `sandbox.ts`** to create the equivalent `Entity`.
   - The store itself should not persist anything to the project JSON.

3. **Clean up `src/types/`**:
   - Delete `src/types/entity.ts` (The V3 models).
   - Delete old `Character`, `WorldSetting`, `CharacterDevelopment` from `src/types/index.ts`.
   - Remove `characters` and `worldbook` fields from the `Project` interface.

## 5. UI Component Migration

Update all UI components to consume `useSandboxStore().activeEntitiesState` instead of old stores:

1. **Immersive Editor Context**:
   - Update `useContextRadar.ts` to scan `sandboxStore.entities` and `activeEntitiesState` instead of the old arrays.
2. **Character & World Management UI**:
   - `CharacterStateTracker.vue`, `CharacterStatistics.vue`, `CharacterDevelopment.vue` must read `ResolvedEntity` data from the sandbox store.
3. **AI Generation Pipeline**:
   - Fix the silent crash in `generation-scheduler.ts` and `state-updater.ts` by removing the V3 `CharacterV3` pipeline completely.
   - Replace it with a new `EventExtractor` that uses LLMs to generate `StateEvent` objects directly from chapter text, appending them to `sandbox.ts`.
4. **Context Builder**:
   - `src/utils/contextBuilder.ts` should pull characters and lore directly from `activeEntitiesState` up to the current chapter. Remove `tableMemory.ts` injection.

## 6. Execution Strategy (Incremental)

We will use **Option A: Incremental Migration** to minimize risk.

- **Phase 1: Foundation.** Expand `sandbox.ts` types and Tauri backend. Implement `loadData` and CRUD.
- **Phase 2: Migration Script.** Write the V1->V5 converter and wire it to project load.
- **Phase 3: Pipeline Refactor.** Swap the context builder, context radar, and generation scheduler to use `sandbox.ts`. Delete `tableMemory.ts` and `state-updater.ts`.
- **Phase 4: UI Refactor.** Convert frontend views (Character Tracker, Stats) to use `ResolvedEntity`.
- **Phase 5: Cleanup.** Delete `worldbook.ts`, `entity.ts`, and old types.

---
*Self-Review Checklist: All placeholders removed? Yes. Consistent typing? Yes. Solves race conditions? Yes (by deleting worldbook store). Solves silent crashes? Yes (by replacing V3 pipeline).*