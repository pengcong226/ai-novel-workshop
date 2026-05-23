# V5 Multi-View Sandbox Design Spec

**Status: COMPLETE** — All phases implemented. V5 Entity+StateEvent architecture is the single source of truth.

## 1. Overview
The current Character Card and Worldbook systems, inherited from RP/chat-focused applications (like SillyTavern), contain redundant fields (e.g., `first_mes`, `scenario`) and lack the dynamic state tracking necessary for long-form novel generation. 

The V5 architecture replaces these static text blocks with a **Unified Entity & State Engine (Multi-View Sandbox)**. In this system, all lore, characters, factions, and items are strongly-typed Entities. Their state changes over time are driven exclusively by the **Timeline (Chapter Outlines)**. A single state change triggered by the AI during chapter generation cascades automatically across four distinct views: Document, Timeline, Graph, and Map.

## 2. Core Architecture: The Unified Schema

Instead of separate JSON files for `characters` and `worldbooks`, the system uses a unified `Entity` and `StateEvent` architecture.

### 2.1 Entity (Static Background)
Entities represent the unchanging aspects of a concept (e.g., birth name, fundamental rules of a magic system, initial faction creation).
```typescript
type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM';

interface Entity {
  id: string;
  type: EntityType;
  name: string;
  category: string;
  systemPrompt: string; // The core constraints fed to the LLM (e.g., "Ruthless, cautious protagonist")
  createdAt: number;
  
  // Base visual data for map/graph rendering
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number, y: number }; // For locations
  };
}
```

### 2.2 StateEvent (Dynamic Timeline)
The state of an Entity at any given chapter is not overwritten; it is appended as an event in the Timeline. The AI context builder dynamically computes the "current state" by reducing these events up to the target chapter.
```typescript
type StateEventType = 'PROPERTY_UPDATE' | 'RELATION_ADD' | 'RELATION_REMOVE' | 'LOCATION_MOVE';

interface StateEvent {
  id: string;
  chapterNumber: number; // The chapter where this change occurs
  entityId: string;      // The entity being modified
  eventType: StateEventType;
  
  // Payload depends on the eventType
  payload: {
    key?: string;        // e.g., 'cultivation_level'
    value?: string;      // e.g., 'Qi Condensation Tier 7'
    targetId?: string;   // e.g., ID of 'Shadow Puppet' for RELATION_ADD
    relationType?: string; // e.g., 'owner', 'enemy', 'master'
    coordinates?: { x: number, y: number }; // For LOCATION_MOVE
  };
  
  source: 'MANUAL' | 'AI_EXTRACTED';
}
```

## 3. The Four Views (UI & Interaction)

The frontend will present the unified data through four reactive views.

### 3.1 Document View (Entity Wiki)
*   **Purpose**: Read and edit the static `Entity` properties.
*   **Features**: Displays the entity's `systemPrompt` and computed current state. Features Notion-style bi-directional linking tags (`#Faction`, `@Location`).

### 3.2 Timeline View (Outline & State Flow)
*   **Purpose**: The central driver of the story. Chapters exist here as outline nodes.
*   **Features**:
    *   **Future Nodes (Pending)**: AI batch-predicts state changes based on outline text. These predictions are shown but not committed to the database.
    *   **Active Nodes (Execution)**: When a chapter is finalized, the LLM uses Structured Outputs (Tool Calling) to execute `update_entity_state`.
    *   **Solidification**: The extracted changes become official `StateEvent` records, polluting the global context for subsequent chapters.

### 3.3 Graph View (Auto-Generated Relational Map)
*   **Purpose**: Visualize complex character/faction/item relationships without manual drawing.
*   **Features**: Automatically rendered from `RELATION_ADD` and `RELATION_REMOVE` events in the State Timeline. Nodes and edges appear/disappear dynamically depending on the current chapter context.

### 3.4 Map View (GIS Location Tracking)
*   **Purpose**: Visualize where entities are in the world.
*   **Features**: Renders `LOCATION` entities as pins. Renders `CHARACTER` entities as avatars. Avatar positions update automatically by reading the latest `LOCATION_MOVE` event for that character in the timeline.

## 4. Execution Flow (AI Integration)

1.  **Batch Planning**: User requests 5 chapter outlines. AI generates text. Background AI parses text to detect potential new entities and state changes. UI displays these as "Predicted States".
2.  **Chapter Generation**: User clicks "Generate Chapter 16". The system gathers context (Entities + StateEvents up to Chapter 15).
3.  **State Extraction**: Upon chapter completion, a secondary AI pass runs a strict JSON Schema tool (`update_entity_state`).
4.  **Broadcast**: The backend saves the new `StateEvent`s to SQLite. A reactive state manager (Pinia) broadcasts the updates.
5.  **Multi-View Reaction**: Document tags glow, Graph nodes connect, and Map avatars animate to their new coordinates automatically.

## 5. Migration Strategy ✅ COMPLETE

The existing Character Cards (V1-V3) and Worldbook entries have been migrated via `v1ToV5Migration.ts`:
*   `name`, `description`, and `personality` -> `Entity.systemPrompt`
*   `first_mes`, `mes_example`, `scenario` -> **Discarded** (No longer needed).
*   Current Worldbook keywords -> Initial `RELATION_ADD` events at chapter 0.