# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

All commands are from `package.json`.

- Install deps: `npm install`
- Web dev server: `npm run dev`
- Desktop app dev (Tauri): `npm run tauri:dev`
- Full debug mode (Express + Vite): `npm run dev:full` (uses `playground/debug-server.cjs`)
- Build web app: `npm run build`
- Build desktop app: `npm run tauri:build`
- Preview production build: `npm run preview`
- Lint: `npm run lint` (run separately from build/type-check; concurrent Vite config temp files can trigger transient ESLint ENOENT)
- Lint with fixes: `npm run lint:fix`
- Type check: `npm run type-check` (runs `vue-tsc --noEmit`)
- Run tests: `npm test` (Vitest watch mode)
- Run tests once: `npm run test:run` or `npm test -- --run`
- Run a single test file once: `npm test -- --run src/path/to/file.test.ts`
- Run tests matching a name: `npm test -- --run -t "test name"`
- Rust backend check when Cargo is available: `cargo check --manifest-path src-tauri/Cargo.toml`

## High-Level Architecture

### 1) Runtime and Persistence Model

The app has two runtime modes:

- **Tauri desktop mode**: Vue frontend + Rust backend (`src-tauri`) + SQLite persistence
- **Browser mode**: Vue frontend + IndexedDB fallback

Storage selection is environment-aware (`isWebRuntime()` from `src/utils/anthropic-guard.ts`), so features can run in both modes, but desktop mode is the primary large-project path.

### 2) Canonical Data Backbone (V5)

The canonical model is **Entity + StateEvent** event sourcing (legacy character/worldbook models are facades/deprecated):

- `Entity`: static definition (`CHARACTER`, `FACTION`, `LORE`, etc.)
- `StateEvent`: append-only state mutation records with `chapterNumber`
- `ResolvedEntity`: computed runtime projection for a target chapter

Core reducer/projection lives in sandbox state flow (`src/stores/sandbox.ts`) and is the source of truth for chapter-level "current truth".

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

`BatchGenerationOptions` uses nested sub-objects: `extraction`, `rewrite`, `callbacks`.

Post-generation review is controlled by normalized `ProjectConfig.enableAutoReview`; it should run in the background and must not block chapter persistence or generation completion.

### 6) Deep Import Pipeline (Batch Extraction)

Deep import is a multi-step extraction system for existing novels:

- `src/services/novel-extractor.ts`: extraction orchestration (supports batch chapter processing with debounced cache)
- `src/services/deep-import-schemas.ts`: strict JSON schemas for extraction outputs
- `src/composables/useDeepImportSession.ts`: session/progress/checkpoint orchestration (module-scope singleton)
- `src/components/Sandbox/deep-import/*`: config/progress/review UI
- `src/utils/chapterParser.ts`: chapter boundary detection and parsing

### 7) Rewrite / Continuation Workflow

Rewrite and continuation use snapshot/diff style state management:

- Types: `src/types/rewrite-continuation.ts`
- Service: `src/services/rewrite-continuation.ts`
- Composable: `src/composables/useRewriteContinuation.ts` (module-scope singleton, concurrent-rewrite guard)
- Diff utilities: `src/utils/stateDiff.ts`

### 8) Rust Backend (Tauri)

`src-tauri/src/lib.rs` exposes IPC commands for persistence (entities, state events, project/chapter data, chapter snapshots, sandbox replacement, batch operations) backed by SQLite.

Frontend store/service code should call Rust IPC instead of adding alternate persistence paths. Restore-style commands should validate untrusted JSON before deleting existing rows and keep delete/insert work inside one SQLite transaction.

### 9) UI Shell and Editor Structure

Routing is intentionally simple:

- `/projects` → project list
- `/project/:id` → unified project workspace

Inside the workspace, major features are panel/component based (not route-heavy), with Sandbox as a central multi-view domain surface.

Chapter editing is split between:

- `src/components/Chapters.vue`: chapter list, batch actions, rewrite/continuation entry points, and editor dialog orchestration
- `src/components/ChapterEditorDialog.vue`: immersive chapter editor workflow, autosave, generation controls, quality checks, review panel, checkpoints, and versions
- `src/components/editor/NovelEditor.vue`: Tiptap-based plain-text editor surface
- `src/components/ChapterVersionPanel.vue`: chapter snapshot history and restore UI
- `src/components/ChapterReadingPreview.vue`: reading-preview presentation path

Saved chapter content remains canonical plain text; editor decorations/annotations should stay ephemeral and must not serialize into chapter body.

Global shell features live in `src/App.vue` and include onboarding, global keyboard shortcuts, global mutator access, global task observation, and offline status banner.

### 10) Review / Suggestions Workflow

AI review suggestions are stored in `src/stores/suggestions.ts` and typed in `src/types/suggestions.ts`.

Review prompt/parse/run helpers live under `src/assistant/review/` and treat AI output as untrusted JSON. Review actions such as navigation or apply-fix should be constructed locally after validating paragraph index, original snippet, and suggested replacement text.

`ChapterEditorDialog.vue` passes unresolved paragraph annotations into `NovelEditor` and shows `src/components/editor/ReviewSidePanel.vue` for jump/apply/ignore actions.

### 11) Plugin System

`src/plugins/` provides an extensible plugin architecture with registries (provider, processor, theme, importer, exporter, action-handler, toolbar, sidebar, menu, quick-command). Built-in plugins include OpenAI/Anthropic/local providers and assistant actions.

### 12) Assistant Commands and Chat

Assistant routing is split from the UI:

- `src/components/AIAssistant.vue`: chat surface and action rendering
- `src/assistant/commands/*`: command registry/router and built-in command handlers
- `src/assistant/actions/*`: local allowlisted action envelopes and execution
- `src/types/ai.ts`: task routing types; `assistant` is a first-class `TaskType`

Do not execute AI-provided commands directly. Assistant actions should be parsed into local envelopes and dispatched through the action executor.

### 13) Backup / Restore

Project backups use `src/utils/projectBackup.ts` with a versioned schema containing the project plus V5 sandbox entities/state events.

- Export goes through `src/stores/project.ts` and should load full project chapter content plus the target project's sandbox data.
- Restore imports backup files into a new project ID by default and reassigns all V5 project IDs.
- Legacy `.anprojl` files should stay on the streaming import path (`importProjectFromLineStream`) instead of `file.text()`.
- Backup JSON is untrusted input: validate size, shape, duplicate IDs, project ID consistency, and state-event entity references before mutating stores or SQLite.

### 14) Offline Status

Online/offline state lives in `src/composables/useOnlineStatus.ts` and is displayed by `src/App.vue`. AI requests should only be blocked for providers that require network access; local providers should not be rejected solely because `navigator.onLine` is false.

## Project-Specific Conventions

- UI copy is Chinese-first.
- Use V5 types from `src/types/sandbox.ts` for new work.
- Treat `src/types/index.ts` as legacy/deprecated compatibility surface.
- Prefer extending existing middleware/store/service flows rather than creating parallel pipelines.
- Encrypted localStorage helpers live in `src/utils/crypto.ts` (`writeEncryptedLocalStorage`, `readEncryptedLocalStorage`) — use these instead of raw `encryptApiKeyV2`/`localStorage.setItem`.
- Shared entity helpers are in `src/utils/entityHelpers.ts` (e.g., `buildNameToIdMapFromEntities`, `formatEntityLocation`).
- Shared event-type label/tag maps are in `src/utils/eventTypeLabels.ts`.
- Runtime detection: always use `isWebRuntime()` from `src/utils/anthropic-guard.ts` instead of inline `__TAURI_INTERNALS__` checks.
- Module-scope singleton composables (`useDeepImportSession`, `useRewriteContinuation`) share state across components — do not convert to per-instance without understanding the cross-component state sharing requirement.
- Sandbox views are driven by the V5 store projection; new map/graph/timeline behavior should read `activeEntitiesState` and `stateEvents` instead of legacy character/worldbook arrays.
- AI-generated content, review fixes, and assistant actions are untrusted input. Keep execution behind local allowlists and exact-match validation.
