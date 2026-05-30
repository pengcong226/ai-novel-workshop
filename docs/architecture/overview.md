# Architecture Overview

This document provides a high-level technical overview of the AI Novel Workshop architecture.

## System Architecture Diagram

```
+====================================================================+
|                        AI Novel Workshop                            |
+====================================================================+
|                                                                    |
|  +---------------------------+  +------------------------------+   |
|  |     Vue 3 Frontend        |  |    Tauri Desktop Backend     |   |
|  |                           |  |                              |   |
|  |  +--------------------+   |  |  +------------------------+  |   |
|  |  | Views              |   |  |  | Rust IPC Commands      |  |   |
|  |  |  ProjectList       |   |  |  |  entities CRUD         |  |   |
|  |  |  ProjectEditor     |   |  |  |  state_events CRUD     |  |   |
|  |  +--------------------+   |  |  |  projects/chapters     |  |   |
|  |  +--------------------+   |  |  |  load_entities (lazy)  |  |   |
|  |  | Components (60+)   |   |  |  |  load_state_events     |  |   |
|  |  |  Sandbox/*         |   |  |  +------------------------+  |   |
|  |  |  Chapters          |   |  |  +------------------------+  |   |
|  |  |  ChapterEditor     |   |  |  | SQLite Database        |  |   |
|  |  |  AIAssistant       |   |  |  |  projects              |  |   |
|  |  |  QualityReport     |   |  |  |  chapters              |  |   |
|  |  +--------------------+   |  |  |  entities              |  |   |
|  |  +--------------------+   |  |  |  state_events          |  |   |
|  |  | Pinia Stores       |   |  |  |  vector_index          |  |   |
|  |  |  sandbox (V5)      |---+--+->|                        |  |   |
|  |  |  project           |   |  |  +------------------------+  |   |
|  |  |  ai                |   |  +------------------------------+   |
|  |  |  vector            |   |                                    |
|  |  |  suggestions       |   |  +------------------------------+   |
|  |  +--------------------+   |  | Browser Fallback             |   |
|  |  +--------------------+   |  |  IndexedDB (Web mode)        |   |
|  |  | Services           |   |  +------------------------------+   |
|  |  |  generation-sched  |   |                                    |
|  |  |  vector-service    |   +------------------------------------+   |
|  |  |  ModelRouter       |                                        |
|  |  |  NovelExtractor    |   +------------------------------------+   |
|  |  +--------------------+   |  AI Integration Layer              |   |
|  |  +--------------------+   |  +------------------------------+  |   |
|  |  | Context Pipeline   |   |  | ModelRouter (FailoverManager)|  |   |
|  |  |  (Middleware Chain)|   |  |  OpenAI / Anthropic / GLM    |  |   |
|  |  |  PlotAnchor        |   |  |  Tongyi Qianwen / Local     |  |   |
|  |  |  Vector            |   |  +------------------------------+  |   |
|  |  |  Entity State      |   |  | Vector Service               |  |   |
|  |  |  Summary           |   |  |  bge-small-zh (local)        |  |   |
|  |  |  Recent Chapters   |   |  |  OpenAI embeddings (cloud)   |  |   |
|  |  |  Outline           |   |  +------------------------------+  |   |
|  |  +--------------------+   |  | Tool Calling Extraction      |  |   |
|  |  +--------------------+   |  |  JSON Schema strict: true    |  |   |
|  |  | Plugin System      |   |  |  Entity + StateEvent update  |  |   |
|  |  |  9 Registries      |   |  +------------------------------+  |   |
|  |  |  Theme Extensions  |   +------------------------------------+   |
|  |  +--------------------+                                         |
|  +---------------------------+                                     |
|                                                                    |
+====================================================================+
```

## Key Modules

### 1. Entity & StateEvent Store (`src/stores/sandbox.ts`)

The central data backbone of the application. Implements an event-sourcing pattern:

- **Entity** -- static definitions (CHARACTER, FACTION, LORE, ITEM, LOCATION, etc.)
- **StateEvent** -- append-only mutation records tagged with `chapterNumber`
- **ResolvedEntity** -- computed runtime projection for a target chapter, produced by a reducer that replays events up to that chapter

This design enables full history reconstruction at any chapter point without storing redundant snapshots.

### 2. Context Assembly Pipeline (`src/utils/contextBuilder.ts`)

Builds the generation context through a middleware chain. Each middleware manages its own token budget:

```
System Prompt (300 tokens, fixed)
  -> Author's Note (200, highest priority)
  -> World Info (800, dynamic injection)
  -> Character Info (600, relevant characters)
  -> Entity State (500, current resolved state)
  -> Plot Anchor Warnings (variable)
  -> Vector Context (600, semantic retrieval)
  -> Summary (600, historical compression)
  -> Recent Chapters (2000, full content)
  -> Outline (400, current chapter outline)
```

### 3. Generation Scheduler (`src/services/generation-scheduler.ts`)

Orchestrates the 10-stage AI creation pipeline:

```
Planner -> Composer -> Writer -> LengthNormalizer -> ContinuityAuditor
  -> Reviser -> StateSettler -> ChapterAnalyzer -> HookPromoter
  -> PostWriteValidator
```

Additional quality layers include:
- 17-dimension quality audit (8 deterministic + 9 LLM-based)
- Audit-revision loop with snapshot, audit, revise, re-evaluate, and rollback
- TensionCurvePlanner for cross-book rhythm analysis
- ReaderAgent for multi-audience evaluation
- DialogueAnalyzer for dialogue quality checks
- RevisionVerifier for two-level post-revision validation

### 4. Multi-View Sandbox (`src/components/Sandbox/`)

Multiple views of the same Entity/StateEvent data:

| View | Component | Visualization |
|------|-----------|---------------|
| Document | `SandboxDocument.vue` | Form-based entity editing |
| Graph | `SandboxGraph.vue` | AntV G6 force-directed graph with spotlight selection |
| Timeline | `SandboxTimeline.vue` | vis-timeline StateEvent rendering |
| Map | `SandboxMap.vue` | SVG/CSS percent-positioned world map |
| Chat | `AutomatonChat.vue` | AI dialogue interaction |
| World Gen | `WorldGenWizard.vue` | Bulk entity generation with draft preview |
| Plot Loom | `PlotLoomBoard.vue` | Kanban + timeline fusion with fate anchors |

### 5. AI Service Layer (`src/services/ai/`)

- **ModelRouter** -- routes requests to the appropriate model based on task type and configuration
- **FailoverManager** -- circuit-breaker pattern for provider failover (timeouts, 429 errors trigger hot-swap)
- **Cost-aware routing** -- different models for different tasks (reasoning, writing, extraction)

### 6. Vector Retrieval (`src/stores/vector.ts`, `src/services/vector-service.ts`)

Dual-mode vector retrieval:
- **Local**: bge-small-zh-v1.5 (512-dim, Chinese-optimized, default)
- **Cloud**: OpenAI text-embedding-3-small (1536-dim)
- **Hybrid search**: vector similarity + keyword matching with reranking

Graph-guided RAG uses active sandbox entities to focus retrieval on relevant chapter content.

### 7. Plugin System (`src/plugins/`)

Extensible architecture with 9 registry types:

| Registry | Purpose |
|----------|---------|
| Provider | AI model providers (OpenAI, Anthropic, local) |
| Processor | Content processing pipelines |
| Theme | Visual theme extensions |
| Importer | Data import formats |
| Exporter | Export format adapters |
| Action-handler | Assistant action execution |
| Toolbar | Editor toolbar extensions |
| Sidebar | Sidebar panel extensions |
| Menu | Context menu extensions |

### 8. Tauri Backend (`src-tauri/src/lib.rs`)

Rust backend providing IPC commands for:
- CRUD operations on entities, state events, projects, and chapters
- Lazy-loading commands (`load_entities`, `load_state_events`) for large datasets
- Batch operations and transaction management
- Vector index operations (via `vector.rs`)

### 9. Assistant Commands (`src/assistant/`)

IDE-like command console with slash commands:
- `/review consistency` -- consistency reviewer
- `/review quality` -- quality evaluator
- `/review editor` -- chief editor review
- Results are structured into suggestion cards with action buttons (action registry)

## Data Flow

### Chapter Generation Flow

```
User triggers generation
  |
  v
Generation Scheduler
  |-- 1. PlannerAgent: outline verification/extension
  |-- 2. ContextBuilder: middleware pipeline assembles context
  |     |-- PlotAnchorMiddleware: fate anchor warnings
  |     |-- VectorMiddleware: semantic retrieval
  |     |-- EntityStateMiddleware: resolved entity state
  |     |-- SummaryMiddleware: historical compression
  |     +-- (others)
  |-- 3. WriterAgent: stream-generate chapter via AI
  |-- 4. LengthNormalizer: adjust chapter length
  |-- 5. ContinuityAuditor: anti-retcon checks
  |-- 6. ReviserAgent: apply audit suggestions
  |-- 7. StateSettler: extract state events (Tool Calling)
  |-- 8. ChapterAnalyzer: chapter-level analysis
  |-- 9. HookPromoter: foreshadowing management
  +-- 10. PostWriteValidator: final validation
  |
  v
Persist chapter + state events
  |
  v
Update sandbox store (Entity + StateEvent)
  |
  v
Recompute ResolvedEntity for current chapter
```

### Storage Routing

```
isWebRuntime()?
  |
  +-- true  --> IndexedDB (browser storage)
  |
  +-- false --> Tauri IPC --> SQLite (desktop storage)
```

The runtime boundary is determined at build time by Vite injecting `__APP_IS_TAURI__`. Web builds always use browser mode. Tauri builds verify that `window.__TAURI_INTERNALS__.invoke` is available before routing to IPC.

## Technology Stack

### Frontend

| Category | Technology | Purpose |
|----------|-----------|---------|
| Framework | Vue 3.4 | UI framework |
| Language | TypeScript 5 | Type safety |
| Build | Vite 5 | Dev server and bundler |
| State | Pinia | Reactive state management |
| UI Library | Element Plus | Component library |
| Design System | Custom CSS (`--ds-*` tokens) | Visual consistency |
| Graph Viz | AntV G6 | Relationship graphs |
| Charts | ECharts | Quality reports and statistics |
| Timeline | vis-timeline | StateEvent timeline |
| Map | Vue Konva | World map editor |
| Editor | Tiptap | Rich text chapter editing |
| Token Calc | gpt-tokenizer | Token counting |

### Backend (Desktop)

| Category | Technology | Purpose |
|----------|-----------|---------|
| Runtime | Tauri 2 | Desktop application framework |
| Language | Rust | Backend implementation |
| Database | SQLite | Persistent storage |
| IPC | Tauri invoke | Frontend-backend communication |

### AI Integration

| Category | Technology | Purpose |
|----------|-----------|---------|
| Providers | OpenAI, Anthropic, GLM, Tongyi Qianwen | LLM access |
| Structured Output | Tool Calling (JSON Schema) | State extraction |
| Embeddings | @xenova/transformers (local), OpenAI | Vector retrieval |
| Routing | FailoverManager with circuit breaker | High-availability |

### Development

| Category | Technology | Purpose |
|----------|-----------|---------|
| Testing | Vitest | Unit and integration testing |
| Linting | ESLint | Code quality |
| Type Check | vue-tsc | TypeScript verification |
| Formatting | Prettier (via ESLint) | Code formatting |

## Design Principles

1. **Event Sourcing over Snapshots** -- Entity state is reconstructed from append-only StateEvents, enabling full history and arbitrary chapter-point reconstruction.

2. **Middleware over Monoliths** -- Context building uses composable middleware, each owning its token budget. This replaced a 200-line monolithic function.

3. **Tool Calling over Regex** -- All AI-to-system state updates use structured Tool Calling with `strict: true` JSON Schema, achieving 99.9% reliability vs fragile regex parsing.

4. **Environment-Aware Storage** -- A single `isWebRuntime()` check routes between Tauri/SQLite and browser/IndexedDB, so features work in both modes without code duplication.

5. **Defense in Depth** -- AI-generated content is untrusted input. Execution sits behind local allowlists, exact-match validation, and sandboxed action envelopes.

6. **Lazy Loading for Scale** -- Large entity graphs and state event histories load on-demand via dedicated IPC commands, keeping memory usage manageable for million-character novels.
