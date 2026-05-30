# Legacy Type System Reference

This document provides a complete mapping from V1 legacy types (defined in `src/types/deprecated.ts`) to their V5 equivalents (defined in `src/types/sandbox.ts`). Use this as a reference when migrating code that still references V1 types.

## Type Mapping Table

### Core Data Types

| V1 Type (deprecated) | V5 Type | V5 Location | Notes |
|----------------------|---------|-------------|-------|
| `WorldSetting` | Multiple `Entity` types | `sandbox.ts` | Decomposed into WORLD + FACTION + LOCATION + LORE entities |
| `Character` | `Entity` (type='CHARACTER') | `sandbox.ts` | Flat fields moved to `systemPrompt`; dynamic state to `StateEvent` |
| `Faction` | `Entity` (type='FACTION') | `sandbox.ts` | `description` maps to `systemPrompt` |
| `WorldRule` | `Entity` (type='LORE', category='world-rule') | `sandbox.ts` | `description` maps to `systemPrompt` |
| `Location` | `Entity` (type='LOCATION') | `sandbox.ts` | Visual data moved to `visualMeta` |
| `CharacterTag` | `EntityImportance` | `sandbox.ts` | String union: `'critical' \| 'major' \| 'minor' \| 'background'` |
| `CharacterState` | `ResolvedEntity` | `sandbox.ts` (store) | Computed by reducer, not stored directly |
| `CharacterStateHistory` | `StateEvent[]` | `sandbox.ts` | Append-only events with `chapterNumber` |
| `CharacterDevelopment` | `StateEvent[]` sequence | `sandbox.ts` | Multiple events covering ability/relation/state changes |

### World Building Types

| V1 Type (deprecated) | V5 Equivalent | Notes |
|----------------------|---------------|-------|
| `EraSetting` | Entity (type='WORLD') `systemPrompt` | Free text in entity description |
| `GeographySetting` | Entity (type='LOCATION')[] | One entity per location |
| `PowerSystemSetting` | Entity (type='LORE', category='power-system') | Single entity with full system description |
| `PowerLevel` | Entity (type='LORE', category='power-level') | Or embedded in power system entity |
| `Skill` | Entity (type='ITEM') or StateEvent (ABILITY_CHANGE) | Depends on whether it is a learnable ability |
| `Item` | Entity (type='ITEM') | `description` maps to `systemPrompt` |

### Memory System Types (Removed)

| V1 Type (deprecated) | V5 Replacement | Notes |
|----------------------|----------------|-------|
| `ShortTermMemory` | Context Builder middleware | `contextBuilder.ts` handles recent chapter window |
| `MidTermMemory` | Chapter summaries in `Chapter.summaryData` | Automatic summary generation |
| `LongTermMemory` | Sandbox entities + vector retrieval | Entity/StateEvent + vector store |
| `ChapterSummary` | `ChapterSummaryData` (in `src/types/index.ts`) | Structured with key events, characters, locations |
| `KeyEvent` | `StateEvent` + `PlotEventRecord` | Split into state changes and plot events |

### Map System Types

| V1 Type (deprecated) | V5 Equivalent | Notes |
|----------------------|---------------|-------|
| `MapPosition` | `Entity.visualMeta.defaultCoordinates` | Stored on LOCATION entities |
| `MapData` | Computed from location entities | Dynamic from sandbox state |
| `MapRegion` | Computed from faction entities + locations | Faction territory visualization |
| `MapRoute` | Not directly mapped | Visual-only, computed from location connections |
| `CharacterLocation` | `StateEvent` (LOCATION_MOVE) | Tracked as state events |
| `LocationType` | `Entity.category` | Free-form category string |

### Relationship Types

| V1 Type (deprecated) | V5 Equivalent | Notes |
|----------------------|---------------|-------|
| `Relationship` | `StateEvent` (RELATION_ADD/RELATION_UPDATE) | Dynamic state, not stored on entity |
| `RelationshipEvolution` | Sequence of `StateEvent` (RELATION_UPDATE) | Each change is a separate event |
| `EntityRelation` | `EntityRelation` (in `sandbox.ts`) | Target + type + attitude |
| `AbilityChange` | `StateEvent` (ABILITY_CHANGE) | `abilityName` + `abilityStatus` in payload |
| `RelationshipChange` | `StateEvent` (RELATION_UPDATE) | `targetId` + `relationType` in payload |
| `StateChange` | Multiple `StateEvent` types | LOCATION_MOVE, PROPERTY_UPDATE, etc. |

## Field-by-Field Mapping

### Character -> Entity

| V1 `Character` Field | V5 `Entity` Field | Transformation |
|---------------------|-------------------|----------------|
| `id` | `id` | Direct copy |
| `name` | `name` | Direct copy |
| `aliases` | `aliases` | Direct copy |
| `isArchived` | `isArchived` | Direct copy |
| `gender` | `systemPrompt` | Concatenated into description text |
| `age` | `systemPrompt` | Concatenated into description text |
| `appearance` | `systemPrompt` | Concatenated into description text |
| `personality[]` | `systemPrompt` | Joined and concatenated |
| `values[]` | `systemPrompt` | Joined and concatenated |
| `background` | `systemPrompt` | Concatenated |
| `motivation` | `systemPrompt` | Concatenated |
| `abilities[]` | `StateEvent` (ABILITY_CHANGE) | Each ability becomes an event |
| `powerLevel` | `StateEvent` (PROPERTY_UPDATE) | key='powerLevel' |
| `relationships[]` | `StateEvent` (RELATION_ADD) | Each relationship becomes an event |
| `appearances[]` | Implicit (from chapter generation) | Not explicitly tracked in V5 |
| `development[]` | `StateEvent[]` sequences | Decomposed into typed events |
| `tags[]` | `importance` | Mapped to EntityImportance |
| `currentState` | `ResolvedEntity` | Computed by reducer |
| `stateHistory[]` | `StateEvent[]` | Each entry becomes a typed event |
| `aiGenerated` | Not carried forward | Extraction source tracked on StateEvent.source |

### WorldSetting -> Entities

The V1 `WorldSetting` is decomposed into multiple V5 entities:

```
WorldSetting
  |
  +-- name, era, geography.name
  |     -> Entity(type='WORLD', name=worldSetting.name)
  |        systemPrompt = "Era: {era.time}, Tech: {era.techLevel}..."
  |
  +-- factions[]
  |     -> Entity(type='FACTION') for each faction
  |
  +-- geography.locations[]
  |     -> Entity(type='LOCATION') for each location
  |        visualMeta.defaultCoordinates from position
  |
  +-- rules[]
  |     -> Entity(type='LORE', category='world-rule') for each rule
  |
  +-- powerSystem
        -> Entity(type='LORE', category='power-system')
```

### CharacterTag -> EntityImportance

| V1 `CharacterTag` | V5 `EntityImportance` |
|-------------------|----------------------|
| `'protagonist'` | `'critical'` |
| `'supporting'` | `'major'` |
| `'antagonist'` | `'major'` |
| `'minor'` | `'minor'` |
| `'other'` | `'background'` |

Category information (protagonist/supporting/antagonist) is preserved in `Entity.category`.

## Deprecated Interfaces Still in Use

The following V1 interfaces are re-exported from `src/types/index.ts` for backward compatibility. They are defined in `src/types/deprecated.ts`:

```typescript
// Re-exported from deprecated.ts (DO NOT USE in new code)
export type {
  WorldSetting,
  EraSetting,
  GeographySetting,
  PowerSystemSetting,
  Faction,
  WorldRule,
  Location,
  MapPosition,
  LocationType,
  MapRegion,
  MapRoute,
  CharacterLocation,
  MapData,
  PowerLevel,
  Skill,
  Item,
  CharacterTag,
  CharacterState,
  CharacterStateHistory,
  Character,
  Ability,
  Relationship,
  RelationshipEvolution,
  AbilityChange,
  RelationshipChange,
  StateChange,
  CharacterDevelopment,
  ShortTermMemory,
  MidTermMemory,
  LongTermMemory,
  ChapterSummary,
  KeyEvent,
} from './deprecated'
```

### Where Legacy Types Are Still Referenced

Legacy types persist in:

1. **`Project` interface** (`src/types/index.ts`) -- `world?`, `characters?`, `memory?`, `worldbook?` fields are `@deprecated` but still typed
2. **`NovelTemplate` interface** (`src/types/index.ts`) -- `worldTemplate` uses `Partial<WorldSetting>`
3. **`CharacterTemplate` interface** (`src/types/index.ts`) -- `template` uses `Partial<Character>`
4. **Quality checker** (`src/utils/qualityChecker.ts`) -- may still accept V1 types as parameters
5. **Older component code** -- some UI components may still destructure V1 types

All of these should be migrated to use `Entity` and `StateEvent` from `src/types/sandbox.ts`.

## Migration Checklist for Developers

When updating code that uses V1 types:

- [ ] Replace `Character` imports with `Entity` from `src/types/sandbox.ts`
- [ ] Replace `WorldSetting` with a collection of typed Entities
- [ ] Replace `CharacterState` lookups with `sandboxStore.activeEntitiesState.get(id)`
- [ ] Replace `Character.stateHistory` with filtered `StateEvent[]`
- [ ] Replace `Relationship[]` with `StateEvent[]` of type RELATION_ADD/UPDATE
- [ ] Replace `Ability[]` with `StateEvent[]` of type ABILITY_CHANGE
- [ ] Replace `CharacterTag` with `EntityImportance`
- [ ] Move character description fields into `Entity.systemPrompt`
- [ ] Move visual/map data into `Entity.visualMeta`
- [ ] Add `projectId` to all new Entity/StateEvent instances
- [ ] Set `source` on new StateEvents to 'MANUAL' or 'AI_EXTRACTED'

## Key Source Files

| File | Purpose |
|------|---------|
| `src/types/sandbox.ts` | V5 Entity, StateEvent, EntityType, StateEventType definitions |
| `src/types/deprecated.ts` | All V1 types with @deprecated annotations |
| `src/types/index.ts` | Re-exports deprecated types + current Project/Chapter/Outline types |
| `src/stores/sandbox.ts` | V5 store with entity/event CRUD and state reducer |
| `src/utils/sandbox-migration.ts` | Migration functions for legacy data conversion |
| `src/utils/stateDiff.ts` | Snapshot/diff utilities for rewrite workflow |
| `src/utils/entityHelpers.ts` | Shared entity helper functions |
