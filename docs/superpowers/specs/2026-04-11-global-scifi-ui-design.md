# V5 Global Sci-Fi UI & Sandbox Design Spec

## 1. Overview
The current UI is bright, white, and uses standard Element Plus components. The goal is to overhaul the entire application into a "Sci-Fi Glassmorphism" dark theme, creating a highly immersive and futuristic "Command Center" feel. At the heart of this Command Center is the V5 Multi-View Sandbox, which brings the underlying `Entity` and `StateEvent` data models to life through four interactive, synchronized views.

## 2. Global Dark Theme Override
*   **HTML Class**: Inject `class="dark"` onto the `<html>` element in `index.html` to activate Element Plus's native dark mode variables.
*   **CSS Theme File**: Create `src/assets/styles/scifi-theme.scss` (or `.css`).
    *   **Variables**: Define `--bg-base`, `--bg-panel`, `--accent-glow`, `--border-glow`, etc.
    *   **Overrides**: Deeply override Element Plus components (`.el-card`, `.el-menu`, `.el-input`, `.el-button`) to use `background: rgba(...)` and `backdrop-filter: blur(12px)`.
    *   **Background**: Add a subtle, pulsating `radial-gradient` background to the main app container.

## 3. The Multi-View Sandbox Subcomponents (`src/components/Sandbox/`)
The Sandbox serves as the central hub for worldbuilding, outlining, and state tracking.

### 3.1 SandboxLayout.vue (The Shell)
*   **Layout**: Flex container with a left Entity Explorer sidebar, a middle 4-tab content area, and a right Automaton AI Chat sidebar.
*   **Entity Explorer**: Lists `Characters`, `Factions`, `Locations`, and `Lore` fetched from Pinia's `SandboxStore`. Displays pulsing "New" or state-change badges based on the active `currentChapter` state.
*   **Tabs**: Navigates between Document, Timeline, Graph, and Map views. Unread state changes show a green dot on the tab.

### 3.2 SandboxDocument.vue (The Encyclopedia)
*   **Data Binding**: Reads the computed `activeEntitiesState` from Pinia.
*   **UI**: Notion-like static text fields for `name` and `systemPrompt`. Displays dynamic properties and bi-directional linking tags (`#Faction`, `@Location`) derived from the timeline state.

### 3.3 SandboxTimeline.vue (The Orchestrator)
*   **Data Binding**: Reads `Project.chapters` and `StateEvents`.
*   **UI**: Renders a vertical timeline of chapters.
    *   *Future Nodes*: Dashed borders. Displays AI-predicted state changes (Output of the Planner model).
    *   *Active Nodes*: Glowing borders. Contains the primary action button: `[AI Generate Chapter & Sync State]`.
    *   *Automated Sync Box*: An animated green panel that appears post-generation, showing the exact JSON Structured Outputs (e.g., `Level: 3 -> 7`) that were just committed to the database.

### 3.4 SandboxGraph.vue (The Relational Matrix)
*   **Tech**: Uses `AntV G6`.
*   **Data Binding**: Computes nodes and edges by traversing the `activeEntitiesState.relations` array for the current chapter.
*   **UI**: A dark canvas with glowing nodes. When a `RELATION_ADD` event occurs, the graph dynamically animates the insertion of a new node and draws a laser-like edge connecting it to the protagonist.

### 3.5 SandboxMap.vue (The GIS Tracker)
*   **Tech**: Custom Canvas/SVG or basic CSS absolute positioning over a static fantasy map background.
*   **Data Binding**: Computes pin locations from `Location` entities, and Avatar positions by filtering `LOCATION_MOVE` state events.
*   **UI**: Displays a glowing avatar for the protagonist. When the timeline advances and detects a location change, the avatar animates its position across the map with a trail effect.

## 4. Outer Shell Adjustments
*   **ProjectEditor.vue**: The layout padding and backgrounds are stripped to let the underlying `radial-gradient` body background show through. The left sidebar menu adopts the new translucent, glowing styling.
*   **ProjectConfig.vue**: Cards become glassmorphic panels. Inputs become semi-transparent with glowing borders on focus. The AI role selectors (Planner, Writer, Sentinel, Extractor) remain functional but adopt the dark theme.

## 5. Self-Review
*   *Placeholders*: None.
*   *Internal consistency*: The design consistently references the `SandboxStore` and `StateEvent` architecture implemented previously.
*   *Scope check*: Focuses strictly on CSS overriding and implementing the 5 Vue components for the Sandbox. Logic for AI extraction already exists in the backend/store.
*   *Ambiguity*: Explicitly defines how Element Plus will be overridden (via a global CSS file + HTML class) to avoid confusion about scoped CSS.