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
- **Refactoring & Architecture**: The codebase is currently transitioning to the **V3 Architecture** outlined in `gemini-deep-research/docs/`.
  - State management uses Pinia stores (`src/stores/`)
  - The goal is to move away from RP-style stateless reactive prompts to stateful graph-based memory for long novel generation.
  - Follow the directives in `gemini-deep-research/docs/V3-实施方案-ClaudeCode执行手册.md` for major refactoring tasks.

## Project Structure
- `src/components/` → Vue UI components
- `src/stores/` → Pinia state management
- `src/services/` → Business logic and API connections
- `src/utils/` → Helper functions (including prompt/context building)
- `src-tauri/` → Rust backend and database interactions
- `gemini-deep-research/` → Architecture V3 blueprint and new component iterations
