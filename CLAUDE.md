# Project Instructions: AI Novel Workshop

## Tech Stack
- Frontend: Vue 3 + TypeScript + Pinia + Element-Plus + Vite
- Backend: Tauri (Rust) + SQLite
- Charts/Graphs: AntV G6, ECharts
- AI/LLMs: `@modelcontextprotocol/sdk`, `@xenova/transformers`, OpenAI-compatible endpoints

## Build & Run
- Dev Server: `npm run dev`
- Tauri App: `npm run tauri dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Test: `npm test`

## Code Style & Conventions
- **Components**: PascalCase for Vue components (e.g. `RelationshipGraph.vue`)
- **Refactoring & Architecture**: The codebase has successfully transitioned to the **V4 Architecture**.
  - State management uses Pinia stores (`src/stores/`)
  - The system relies on a stateful graph-based memory and table memory for long novel generation, eliminating hallucination deadlocks.
  - Structured Outputs (JSON Schema/Tool Calling) and 19-point ConStory-Bench consistency checks are fully implemented.

## Project Structure
- `src/components/` → Vue UI components
- `src/stores/` → Pinia state management
- `src/services/` → Business logic and API connections
- `src/utils/` → Helper functions (including prompt/context building)
- `src-tauri/` → Rust backend and database interactions
- `docs/` → Project documentation and architecture specs