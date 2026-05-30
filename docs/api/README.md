# AI Novel Workshop - API Documentation

This directory contains comprehensive API documentation for the core modules of the AI Novel Workshop (AI小说工坊) project.

## Module Index

### Stores (Pinia)

| Store | Module | Description |
|-------|--------|-------------|
| [Sandbox Store](./stores.md#sandbox-store) | `src/stores/sandbox.ts` | V5 backbone: Entity + StateEvent event-sourcing, reducer projection, draft management |
| [Project Store](./stores.md#project-store) | `src/stores/project.ts` | Project aggregate: CRUD, persistence, chapter lifecycle, import/export |
| [AI Store](./stores.md#ai-store) | `src/stores/ai.ts` | AI model/provider configuration, chat streaming, Pipeline config, daemon control |
| [Suggestions Store](./stores.md#suggestions-store) | `src/stores/suggestions.ts` | Review suggestions: queue management, trigger rules, statistics |

### Services

| Service | Module | Description |
|---------|--------|-------------|
| [GenerationScheduler](./services.md#generation-scheduler) | `src/services/generation-scheduler.ts` | Chapter generation pipeline orchestration (batch and single-chapter modes) |
| [NovelExtractor](./services.md#novel-extractor) | `src/services/novel-extractor.ts` | LLM-powered entity/state extraction from existing novels (deep import) |
| [RewriteContinuationService](./services.md#rewrite-continuation-service) | `src/services/rewrite-continuation.ts` | Rewrite and continuation workflow coordination |
| [DaemonService](./services.md#daemon-service) | `src/services/DaemonService.ts` | Background scheduled chapter generation with safety gates |

### Utilities

| Utility | Module | Description |
|---------|--------|-------------|
| [Context Builder](./utils.md#context-builder) | `src/utils/contextBuilder.ts` | Context assembly pipeline with middleware composition and token budgeting |
| [Quality Checker](./utils.md#quality-checker) | `src/utils/qualityChecker.ts` | Multi-dimensional chapter quality assessment |
| [Summarizer](./utils.md#summarizer) | `src/utils/summarizer.ts` | Chapter/volume summary generation with tiered detail levels |
| [Chapter Parser](./utils.md#chapter-parser) | `src/utils/chapterParser.ts` | Novel text chapter boundary detection and parsing |
| [State Diff](./utils.md#state-diff) | `src/utils/stateDiff.ts` | Event-sourcing reducer, snapshot capture, and rewrite diff computation |

### Types

| Type Module | Module | Description |
|-------------|--------|-------------|
| [Sandbox Types](./types.md#sandbox-types-v5) | `src/types/sandbox.ts` | V5 canonical types: Entity, StateEvent, EntityRelation |
| [Legacy Types](./types.md#legacy-types) | `src/types/index.ts` | Backward-compatible types: Project, Outline, Chapter, ProjectConfig |

## Architecture Overview

The application follows a Vue 3 + Pinia + TypeScript architecture with two runtime modes:

- **Tauri desktop mode**: Vue frontend + Rust backend + SQLite persistence
- **Browser mode**: Vue frontend + IndexedDB/localStorage fallback

The canonical data model is **Entity + StateEvent** (V5 event-sourcing). The `replayReducer` in `stateDiff.ts` is the single source of truth for computing entity state at any chapter number. The `sandboxStore.activeEntitiesState` computed property delegates to this reducer.

### Data Flow

```
User Action
  -> Store (Pinia)
    -> Service (generation / extraction / rewrite)
      -> AI Store (chat / chatStream)
        -> Context Builder (middleware pipeline)
          -> Model API
```

### Context Assembly Pipeline

The context builder (`contextBuilder.ts`) assembles generation context through a middleware pipeline:

1. System Prompt
2. Style Profile
3. Author's Note
4. World Info (from sandbox entities)
5. Character Info (from sandbox entities)
6. State Constraints (anti-retcon guards)
7. Vector Context (semantic retrieval)
8. Summary (historical chapter compression)
9. Recent Chapters (full text of last N chapters)
10. Outline (chapter plan)
