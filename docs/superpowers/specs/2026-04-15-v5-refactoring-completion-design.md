# V5 Refactoring Completion: Final Cleanup & Migration

**Goal:** Finish the remaining V5 refactoring work — migrate generation-scheduler to V5, convert old UI components, clean up dead code, and deprecate old stores.

**Architecture:** Entity+StateEvent is already the single source of truth. This spec covers the "last mile": wiring the scheduler and UI components to it, and removing the dead layers.

**Tech Stack:** Vue 3, Pinia, TypeScript, Tauri (SQLite)

---

## 1. Generation Scheduler V5 Migration (`src/services/generation-scheduler.ts`)

### 1.1 Replace V1 entity extraction with V5 writes

Lines 84-130 currently push into `project.characters` (V1). Replace with:

- Import `useSandboxStore` at the top of the method
- For each extracted character, call `sandboxStore.addEntity(entity)` where entity is `type: 'CHARACTER'`
- For each extracted relationship, call `sandboxStore.addStateEvent(...)` with `eventType: 'RELATION_ADD'`
- Remove all `as any` casts on character arrays

### 1.2 Dispatch V5 Tool Calling state extraction results

Lines 598-643: The V5 Tool Calling extraction completes but results are only logged. Fix:

- Parse `extractionRes` for tool calls containing `update_entity_state` results
- For each event in the parsed results:
  - Look up entity by name in `sandboxStore.entities`
  - If found, create a `StateEvent` with the appropriate type and call `sandboxStore.addStateEvent(event)`
- Remove the placeholder comment "In real implementation, parse extractionRes.toolCalls and dispatch to sandboxStore"

### 1.3 Remove remaining `as any` casts

6 occurrences remain. Fix each:
- Line 106: `as any` on character push — replaced by sandbox store writes
- Line 113: `extChars as any` — use `sandboxStore.entities.map(e => ({ name: e.name }))`
- Line 171: `detail: 'minimal' as any` — type the summary data properly
- Lines 547-548: `(postResult as any).chapter` — type the plugin pipeline result
- Line 639: `toolChoice as any` — type the AI store chat options properly

### 1.4 Replace tableMemory calls with sandbox store reads

Lines 182-298: `importMemory` / `updateMemoryFromChapter` / `exportMemory` operate on the old table memory system. This entire block should:

- Read entity state from `sandboxStore.activeEntitiesState` instead of `project.memory`
- After AI extraction of memory commands, dispatch as `StateEvent`s to sandbox store
- Remove the `project.memory` field dependency
- Mark `tableMemory.ts` as deprecated (don't delete yet — will be cleaned in Section 5)

## 2. UI Component Migration

### 2.1 CharacterStatistics.vue

Currently reads `project.characters` (V1). Replace:

- `characters` computed → `sandboxStore.entities.filter(e => e.type === 'CHARACTER')`
- `protagonistCount` → count entities with `importance === 'critical'`
- `supportingCount` → count entities with `importance === 'major'`
- `totalAppearances` → sum of `stateEvents.filter(e => e.entityId === entity.id).length`
- `topCharacters` → sort entities by their state event count
- `chapterAppearances` → derive from `sandboxStore.stateEvents` grouped by chapterNumber
- `characterTags` → group by `entity.importance` instead of `CharacterTag`
- `getTagType` → map `importance` to el-tag types instead of `CharacterTag`

### 2.2 CharacterStateTracker.vue

Currently reads `Character` + `CharacterState`. Replace:

- Read `sandboxStore.activeEntitiesState` for current state
- Use `sandboxStore.stateEvents` filtered by `entityId` for state history
- Map `ResolvedEntity.vitalStatus` → display text
- Map `ResolvedEntity.location` → location display
- Map `ResolvedEntity.abilities` → ability list
- Map `ResolvedEntity.relations` → relationship list

### 2.3 CharacterDevelopment.vue

Currently reads `Character.development: CharacterDevelopment[]`. Replace:

- Filter `sandboxStore.stateEvents` by `entityId` and sort by `chapterNumber`
- Group events by chapter to show development milestones
- Each `PROPERTY_UPDATE` → character trait change
- Each `VITAL_STATUS_CHANGE` → major life event
- Each `ABILITY_CHANGE` → ability gain/loss
- Each `RELATION_ADD/REMOVE/UPDATE` → relationship milestone

### 2.4 GlassContextPanel.vue

Currently scans `project.characters` and `project.worldbook.entries`. Replace:

- Character data: read `sandboxStore.entities.filter(e => e.type === 'CHARACTER')` and their `ResolvedEntity` state
- Lore data: read `sandboxStore.entities.filter(e => e.type === 'LORE')`
- Remove `WorldbookEntry` import and usage

### 2.5 CharacterCardExportDialog.vue

Retain this component. Adapt:

- Export source changes from `characterCardStore` to reading from `sandboxStore.entities` + `sandboxStore.activeEntitiesState`
- Write a `resolvedEntityToSillyTavern(resolved: ResolvedEntity): SillyTavernCharacterCard` converter function
- Import still goes through `characterCardStore` (adapter pattern), then dispatches to sandbox store

### 2.6 WorldbookImportDialog.vue & WorldbookExportDialog.vue

Adapt to V5:

- Import: parse WorldbookEntry → Entity(type='LORE') + StateEvents → save via sandbox store
- Export: read Entity(type='LORE') from sandbox store → convert to WorldbookEntry format

## 3. Context Builder & Radar Migration

### 3.1 useContextRadar.ts

Currently scans `project.characters` and `project.worldbook.entries` with string matching. Replace:

- Scan `sandboxStore.entities` for name/alias matches
- Use `sandboxStore.activeEntitiesState` to get current context for matched entities
- Include entity relations to surface related characters
- Remove dependency on `project.characters` and `project.worldbook`

### 3.2 contextBuilder.ts

Currently assembles context from multiple sources including tableMemory. Change priority:

1. **Primary**: `sandboxStore.activeEntitiesState` — entity properties, relations, vital status
2. **Secondary**: `sandboxStore.entities` filtered by type for lore/location context
3. **Remove**: `tableMemory.ts` injection (the old memory sheets)
4. **Remove**: direct `project.characters` reads
5. **Keep**: chapter content, outline, plot anchors (these are not affected by V5)

## 4. Store Deprecation & Restructuring

### 4.1 worldbook.ts — Re-route through sandbox store

`useWorldbookStore` currently does independent load-modify-save on the project record (race condition source).

- Keep the store as a thin facade for backward compatibility during migration
- All `addEntry`/`updateEntry`/`deleteEntry` calls now dispatch to `sandboxStore.addEntity/updateEntity` with `type: 'LORE'`
- `injectEntries` logic moves to a new composable `useEntityContextInjector` that reads from sandbox store
- `loadWorldbook` becomes a no-op that delegates to `sandboxStore.loadData`
- After all consumers migrated, delete the store entirely

### 4.2 character-card.ts — Adapter only

Already mostly in-memory. Finalize:

- `importCharacterCard` and `importFromPNG` should, after parsing, dispatch Entity+StateEvent to sandbox store
- Export functions (`exportCharacterCard`, `downloadCharacterCard`) should read from sandbox store, not from local state
- Remove `worldbookEntries` from the store state (worldbook entries now live as LORE entities in sandbox store)

### 4.3 project.ts — Deprecate characters/worldbook fields

- Add `@deprecated` JSDoc to `Project.characters` and `Project.worldbook` in types
- `createProject()` should no longer initialize `characters: []`
- After V5 migration runs, clear `projectData.characters = []` and `projectData.worldbook = undefined` before saving
- The migration in `openProject` already handles this for existing projects

### 4.4 tableMemory.ts — Deprecate

- Mark the entire module as `@deprecated`
- Remove the `MemoryTableMiddleware` from the context pipeline
- Remove `project.memory` field usage from context builder
- Do not delete the file yet — keep it for data recovery if needed

## 5. Dead Code Cleanup

### 5.1 Delete files

After all consumers are migrated:

- `src/types/entity.ts` — V3 types (CharacterV3, EntityNode, CharacterStateSlice, WorldEntityV3) superseded by sandbox.ts + ResolvedEntity
- `src/services/state-updater.ts` — V3 state pipeline, no longer called
- `src/utils/entityMigration.ts` — V1→V3 migration, superseded by `v1ToV5Migration.ts`

### 5.2 Clean types/index.ts

- Remove `LegacyModelProvider`, `LegacyGenerationRequest`, `LegacyGenerationResponse`
- Remove `Character` type (after all components migrated — the migration script still needs it during transition)
- Remove `WorldSetting` type (after context builder no longer reads it)
- Remove `CharacterTag` type (replaced by `EntityImportance`)

### 5.3 Clean types/worldbook.ts

- Remove `@deprecated` `WorldbookData` type alias
- Move remaining `Worldbook` and `WorldbookEntry` types to be import-only schemas (only used by import/export adapters)

### 5.4 Deduplicate utility functions

- Remove duplicate `estimateTokens` and `truncateToTokens` from `contextBuilder.ts`
- Keep only the versions in `context/pipeline.ts`
- Update imports in `contextBuilder.ts`

## 6. Execution Order

Phase 1 — Pipeline (generation-scheduler V5 migration, Section 1)
Phase 2 — Context (context builder + radar, Section 3)
Phase 3 — UI (component migration, Section 2)
Phase 4 — Store deprecation (Section 4)
Phase 5 — Dead code cleanup (Section 5)

Each phase produces working, testable code. No phase depends on a later phase.

---

*Self-review: No placeholders. All sections reference specific files and line numbers. Types are consistent with sandbox.ts definitions. Scope is focused on completing V5 migration, not adding new features.*
