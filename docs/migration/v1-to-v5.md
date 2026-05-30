# V1 to V5 Data Model Migration Guide

This document describes the migration from the V1 flat data model (Character, WorldSetting, Worldbook) to the V5 Entity + StateEvent event-sourcing architecture.

## Overview

V5 replaces the monolithic V1 data structures with a two-table event-sourcing design:

| Aspect | V1 | V5 |
|--------|----|----|
| Characters | `Character[]` stored directly on `Project` | `Entity[]` (type='CHARACTER') + `StateEvent[]` |
| World Settings | `WorldSetting` with nested factions, locations, rules | `Entity[]` (type='WORLD'/'FACTION'/'LOCATION'/'LORE') |
| Worldbook | `Worldbook` (standalone entry list) | `Entity[]` (type='LORE') |
| State Tracking | `CharacterState` + `CharacterStateHistory[]` | Append-only `StateEvent[]` with chapter-based reducer |
| Relationships | `Relationship[]` on Character | `StateEvent` (RELATION_ADD / RELATION_UPDATE / RELATION_REMOVE) |
| Abilities | `Ability[]` on Character | `StateEvent` (ABILITY_CHANGE) |

## Why the Migration Was Necessary

V1 stored all data as large nested objects on the `Project` interface. This caused several problems:

1. **No event history** -- Character state could only represent the current snapshot, with a flat `stateHistory` array that lacked structured typing.
2. **Data duplication** -- Character descriptions, relationships, and world settings were stored redundantly across different structures.
3. **Poor scalability** -- For novels exceeding 100 chapters, the monolithic `Character` object with its `development[]` and `stateHistory[]` arrays grew unwieldy.
4. **Extraction difficulty** -- AI extraction had to parse free-form text fields rather than structured typed events.

## V5 Data Model

### Entity

An `Entity` is a static definition of a story element. Types are defined in `src/types/sandbox.ts`:

```typescript
type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM' | 'CONCEPT' | 'WORLD'
type EntityImportance = 'critical' | 'major' | 'minor' | 'background'

interface Entity {
  id: string
  projectId: string
  type: EntityType
  name: string
  aliases: string[]
  importance: EntityImportance
  category: string           // free-form label (e.g. 'protagonist', 'sect', 'weapon')
  systemPrompt: string       // full description / background text
  description?: string       // legacy compatibility field
  speechProfile?: SpeechPattern  // character speech style (v6.0+)
  visualMeta?: {
    color?: string
    icon?: string
    defaultCoordinates?: { x: number; y: number }
    worldbookUid?: string
  }
  isArchived: boolean
  createdAt: number
}
```

Entities are the "nouns" of the story. They describe what exists but not how it changes.

### StateEvent

A `StateEvent` is an append-only record of a state mutation that occurred at a specific chapter:

```typescript
type StateEventType =
  | 'PROPERTY_UPDATE'       // generic key/value change
  | 'RELATION_ADD'          // new relationship formed
  | 'RELATION_REMOVE'       // relationship ended
  | 'RELATION_UPDATE'       // relationship changed
  | 'LOCATION_MOVE'         // entity moved to a new position
  | 'VITAL_STATUS_CHANGE'   // alive/dead/sealed/etc.
  | 'ABILITY_CHANGE'        // ability gained/lost/sealed

interface StateEvent {
  id: string
  projectId: string
  chapterNumber: number     // when this change happened
  entityId: string          // which entity was affected
  eventType: StateEventType
  payload: {
    key?: string
    value?: string
    targetId?: string
    relationType?: string
    attitude?: string
    coordinates?: { x: number; y: number }
    status?: string
    abilityName?: string
    abilityStatus?: string
  }
  source: 'MANUAL' | 'AI_EXTRACTED' | 'MIGRATION'
}
```

StateEvents are the "verbs" of the story. They describe how things change over time.

### ResolvedEntity

A `ResolvedEntity` is a computed runtime projection -- the result of replaying all StateEvents up to a target chapter against the base Entity:

```typescript
interface ResolvedEntity extends Entity {
  properties: Record<string, string>   // from PROPERTY_UPDATE events
  relations: EntityRelation[]          // from RELATION_ADD/UPDATE events
  location: { x: number; y: number } | null  // from LOCATION_MOVE events
  vitalStatus: string                  // from VITAL_STATUS_CHANGE events
  abilities: AbilityRecord[]           // from ABILITY_CHANGE events
}
```

`ResolvedEntity` is not stored -- it is computed on-the-fly by the sandbox store's reducer (`activeEntitiesState` getter).

## Event Sourcing Pattern

V5 follows a simplified event-sourcing pattern:

```
Entity (base definition)
  +
StateEvent[] (append-only mutations, ordered by chapterNumber)
  |
  v
[Reducer: replay events up to target chapter]
  |
  v
ResolvedEntity (current state at that chapter)
```

### How the Reducer Works

The sandbox store (`src/stores/sandbox.ts`) maintains two reactive arrays:

- `entities: Entity[]` -- all entity definitions
- `stateEvents: StateEvent[]` -- all state mutations, sorted by chapter number

The `activeEntitiesState` computed property replays state events against each entity to produce a `Map<string, ResolvedEntity>`. For each entity:

1. Start with the base Entity properties
2. Walk through all StateEvents for that entity, ordered by `chapterNumber`
3. Apply each event's payload to build the resolved state

This means you can query "what was the state of character X at chapter 15?" by replaying only events with `chapterNumber <= 15`.

### Key Advantages

- **Chapter-aware queries** -- State at any chapter is reproducible by limiting event replay
- **Audit trail** -- Every change has a source (manual, AI-extracted, or migration)
- **Conflict detection** -- The anti-retcon validator compares generated text against resolved state
- **Rewrite safety** -- Snapshots and diffs allow safe rollback when rewriting chapters

## Migration Functions

The migration code lives in `src/utils/sandbox-migration.ts`:

### `migrateLegacyWorldbookToEntities(legacyData)`

Converts V1 `Worldbook` entries to V5 `Entity[]` with type `'LORE'`:

- Maps `entry.title` or `entry.name` to `Entity.name`
- Maps `entry.content` to `Entity.systemPrompt`
- Preserves `entry.id` or generates a new one
- Sets a default category from `entry.category` or `'General'`

### `migrateLegacyCharacterToEntities(legacyData)`

Converts V1 `Character[]` to V5 `Entity[]` with type `'CHARACTER'`:

- Maps `char.name` to `Entity.name`
- Combines `char.description` and `char.personality` into `Entity.systemPrompt`
- Maps `char.role` to `Entity.category`
- Preserves `char.id`

### Migration Source Indicators

StateEvents created during migration have `source: 'MIGRATION'` to distinguish them from user-created or AI-extracted events.

## Step-by-Step Migration for Users

### Automatic Migration

When a project is loaded, the system checks for legacy data:

1. If `Project.world` or `Project.characters` contains data, migration is triggered
2. Legacy `WorldSetting` is decomposed into:
   - One `Entity` of type `'WORLD'` for the overall setting
   - `Entity` entries of type `'FACTION'` for each faction
   - `Entity` entries of type `'LOCATION'` for each location
   - `Entity` entries of type `'LORE'` for each world rule
3. Legacy `Character[]` is converted to `Entity[]` of type `'CHARACTER'`
4. Legacy `Worldbook` entries are converted to `Entity[]` of type `'LORE'`
5. All generated StateEvents have `source: 'MIGRATION'`

### What Happens to Legacy Fields

After migration, the legacy fields on `Project` are preserved for backward compatibility but marked `@deprecated`:

| Legacy Field | Status After Migration |
|-------------|----------------------|
| `Project.world` | Cleared; data moved to sandbox entities |
| `Project.characters` | Cleared; data moved to sandbox entities |
| `Project.memory` | Cleared; state now in sandbox StateEvents |
| `Project.worldbook` | Cleared; entries moved to LORE entities |

### Manual Verification

After migration, verify in the Sandbox view:

1. Open the project workspace
2. Navigate to the Sandbox panel
3. Check that characters appear under the CHARACTER tab
4. Check that locations appear under the LOCATION tab
5. Check that world lore appears under the LORE tab
6. Verify the relationship graph shows expected connections

## V5 Store Layer Architecture

The sandbox store (`src/stores/sandbox.ts`) manages all V5 data:

```
sandboxStore
  entities          -- Entity[] (all entity definitions)
  stateEvents       -- StateEvent[] (all state mutations)
  activeEntities    -- computed: non-archived entities
  characterEntities -- computed: entities where type='CHARACTER'
  loreEntities      -- computed: entities where type='LORE'
  locationEntities  -- computed: entities where type='LOCATION'
  factionEntities   -- computed: entities where type='FACTION'

  Methods:
  loadData(projectId)     -- loads from Tauri SQLite or localStorage
  addEntity(entity)       -- adds a new entity
  updateEntity(id, data)  -- updates an entity
  addStateEvent(event)    -- appends a state event
  archiveEntity(id)       -- soft-deletes an entity
```

The store transparently handles both runtime modes:

- **Tauri desktop**: Persists to SQLite via `invoke('save_entity')` and `invoke('load_entities')`
- **Browser**: Persists to `localStorage` with keys prefixed `ai-novel-workshop:sandbox:{projectId}:entities`

## Compatibility Notes

- V1 types are still re-exported from `src/types/index.ts` for backward compatibility
- All V1 types are defined in `src/types/deprecated.ts` with `@deprecated` JSDoc annotations
- New code should import from `src/types/sandbox.ts` exclusively
- The `Character` type from `src/types/deprecated.ts` maps to `Entity` with `type='CHARACTER'`
- The `WorldSetting` type maps to multiple Entity types: `WORLD`, `FACTION`, `LOCATION`, `LORE`

## Troubleshooting

### Entities Missing After Migration

If entities appear missing after migration:

1. Check the browser console for migration log messages
2. Verify localStorage (browser) or SQLite (desktop) contains the expected data
3. Ensure `loadData()` was called with the correct project ID

### Duplicate Entities

If migration creates duplicates:

1. Use the Sandbox merge tool to combine duplicates
2. The `archiveEntity()` function can soft-delete unwanted copies
3. Check that legacy data is cleared to prevent re-migration on next load

### State Events Not Appearing

If resolved state looks incorrect:

1. Verify StateEvents have the correct `entityId` referencing an existing Entity
2. Check that `chapterNumber` values are correct
3. Use the timeline view to inspect events chapter-by-chapter

## Related Documentation

- [Legacy Types Reference](./legacy-types.md) -- Full mapping table of old types to new
- [Architecture Overview](../architecture.md) -- System architecture
- [Technical Summary](../technical-summary.md) -- Core technical decisions
- [Data Architecture](../data-architecture.md) -- Storage and memory system design
