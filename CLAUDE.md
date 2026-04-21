# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

All commands are from `package.json`.

- Install deps: `npm install`
- Web dev server: `npm run dev`
- Desktop app dev (Tauri): `npm run tauri dev`
- Full debug mode (Express + Vite): `npm run dev:full`
- Build web app: `npm run build`
- Build desktop app: `npm run tauri build`
- Preview production build: `npm run preview`
- Lint (auto-fix enabled): `npm run lint`
- Type check: `npm run type-check` (runs `vue-tsc --noEmit`)
- Run tests: `npm test` (Vitest)
- Run a single test file: `npm test -- src/path/to/file.test.ts`
- Run tests matching a name: `npm test -- -t "test name"`
- Run tests once (non-watch): `npm test -- --run`

## High-Level Architecture

### 1) Runtime and Persistence Model

The app has two runtime modes:

- **Tauri desktop mode**: Vue frontend + Rust backend (`src-tauri`) + SQLite persistence
- **Browser mode**: Vue frontend + IndexedDB fallback

Storage selection is environment-aware, so features can run in both modes, but desktop mode is the primary large-project path.

### 2) Canonical Data Backbone (V5)

The canonical model is **Entity + StateEvent** event sourcing (legacy character/worldbook models are facades/deprecated):

- `Entity`: static definition (`CHARACTER`, `FACTION`, `LORE`, etc.)
- `StateEvent`: append-only state mutation records with `chapterNumber`
- `ResolvedEntity`: computed runtime projection for a target chapter

Core reducer/projection lives in sandbox state flow (`src/stores/sandbox.ts`) and is the source of truth for chapter-level “current truth”.

### 3) Store Layer Responsibilities

- `src/stores/sandbox.ts`: V5 backbone (`entities`, `stateEvents`, reducer projection, chapter state)
- `src/stores/project.ts`: project aggregate (outline/chapters/config), lifecycle, migration hooks
- `src/stores/ai.ts`: model/provider configuration and chat streaming
- `src/stores/vector.ts`: vector retrieval/index behavior
- `src/stores/worldbook.ts`, `src/stores/character-card.ts`: compatibility facades mapped to V5 data

### 4) Context Assembly Pipeline (critical path)

`src/utils/contextBuilder.ts` builds chapter-generation context through middleware composition (system prompt, notes, world info, character info, state constraints, vector retrieval, summaries, recent chapters, outline, etc.), then formats payload for model calls.

This is the central place where token budget and memory priority are enforced.

### 5) Chapter Generation Pipeline

`src/services/generation-scheduler.ts` orchestrates generation:

1. Ensure outline continuity/extension
2. Build context from middleware pipeline
3. Stream-generate chapter via AI store
4. Run anti-retcon/quality checks
5. Persist chapter
6. Advance chapter state
7. Extract state events (tool-calling JSON schema path)
8. Optionally extract plot events for rewrite/continuation flows

### 6) Deep Import Pipeline (Batch Extraction)

Deep import is a multi-step extraction system for existing novels:

- `src/services/novel-extractor.ts`: extraction orchestration (supports batch chapter processing)
- `src/services/deep-import-schemas.ts`: strict JSON schemas for extraction outputs
- `src/composables/useDeepImportSession.ts`: session/progress/checkpoint orchestration
- `src/components/Sandbox/deep-import/*`: config/progress/review UI
- `src/utils/chapterParser.ts`: chapter boundary detection and parsing

### 7) Rewrite / Continuation Workflow

Rewrite and continuation use snapshot/diff style state management:

- Types: `src/types/rewrite-continuation.ts`
- Service: `src/services/rewrite-continuation.ts`
- Composable: `src/composables/useRewriteContinuation.ts`
- Diff utilities: `src/utils/stateDiff.ts`

### 8) Rust Backend (Tauri)

`src-tauri/src/lib.rs` exposes IPC commands for persistence (entities, state events, project/chapter data, batch operations) backed by SQLite.

Frontend store/service code should call Rust IPC instead of adding alternate persistence paths.

### 9) UI Shell Structure

Routing is intentionally simple:

- `/projects` → project list
- `/project/:id` → unified project workspace

Inside the workspace, major features are panel/component based (not route-heavy), with Sandbox as a central multi-view domain surface.

## Project-Specific Conventions

- UI copy is Chinese-first.
- Use V5 types from `src/types/sandbox.ts` for new work.
- Treat `src/types/index.ts` as legacy/deprecated compatibility surface.
- Prefer extending existing middleware/store/service flows rather than creating parallel pipelines.

## Notes from Repository Scan

- Existing `CLAUDE.md` already had strong V5 architecture notes; this version keeps that direction while adding missing command details (especially single-test execution) and tighter architecture mapping for current deep-import + rewrite workflows.
- No `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` files were found in this repository during this scan.
