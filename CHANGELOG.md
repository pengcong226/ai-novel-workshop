# Changelog

All notable changes to the AI Novel Workshop project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v6.0.0] - 2026-05-30

### Added
- **TensionCurvePlanner** -- deterministic full-book rhythm analysis detecting four issue types (climax clustering, prolonged troughs, monotone pacing, abrupt jumps); recommends target tension value for the next chapter (`1ccd3b0`)
- **ReaderAgent** -- multi-reader-group evaluation simulating three audience archetypes (veteran web-novel reader, newcomer, genre-core fan) with drop-off risk assessment (`1ccd3b0`)
- **DialogueAnalyzer** -- dedicated dialogue quality checks (dialogue/narration ratio, tag frequency, repeated tags, consecutive dialogue detection) integrated as the 18th dimension of the quality audit (`1ccd3b0`)
- **SpeechPattern** -- ObserverAgent now extracts a 10th fact category: character language style profiles (formality, vocabulary, sentence length, quirks, catchphrases) (`1ccd3b0`)
- **RevisionVerifier** -- two-level verification in the audit-revision loop: Level 1 deterministic checks (word count, duplicate paragraphs, sensitive words, paragraph std-dev, AI-marker density) + Level 2 LLM verification (`1ccd3b0`)
- **ComposerAgent LLM pruning** -- when chapter count >= 20, automatically applies LLM-based semantic pruning to chapterSummaries and characterMatrix, retaining only high-relevance entries (`1ccd3b0`)
- Project management documents: PRD, test reports, and evaluation reports under `docs/project-docs/` (`92b1349`)

### Fixed
- Project ID consistency between pipeline page and SandboxChat, eliminating data cross-talk when switching projects (`1ccd3b0`)
- Phase 8/9 error handling decoupled so Phase 9 executes independently (`1ccd3b0`)
- `hookPool` variable shadowing fix (`1ccd3b0`)
- `DataAdapter.extractEmotionalArcs()` changed from placeholder to real implementation (`1ccd3b0`)
- Mock data auto-cleanup utility (`1ccd3b0`)

### Verification
- `tsc --noEmit`: zero errors
- `vitest run`: 69/69 test files, 473/473 tests passing
- Three-stage system test: 113 cases all passing, 0 defects

## [v5.1.0] - 2026-04-26

### Added
- **Global Design System** -- `src/assets/styles/design-system.css` with unified `--ds-*` design tokens, Element Plus variable bridge, glass surfaces, micro-animations, and scrollbar styling (`3ed4334`, `b3c73a9`)
- **Modern project home page** -- ProjectList updated to Notion/Linear-style Hero layout with project statistics, gradient cards, and improved empty-state entry (`3ed4334`)
- **CSS Grid writing workspace** -- ProjectEditor updated with collapsible glass sidebar, plugin sidebar, Zen Mode, and consistent main-panel layout (`3ed4334`, `606c0c5`)
- **Editor and assistant experience unification** -- Chapters, ChapterEditorDialog, AIAssistant, WritingDashboard, AgentConsole, TokenUsagePanel all adopt Design System surfaces, status accent bars, and dark-first visuals (`606c0c5`, `e4bfde0`)
- **AI-assisted review and outline workflows** (`7ac2820`)
- **Deep import, rewrite-continuation, and shared utilities** (`4721a41`)
- **Simplified codebase** -- extracted shared utilities, optimized hot paths, fixed state sync (`e901f4c`, `1eff058`)

### Changed
- Runtime detection hardened: Vite injects `__APP_IS_TAURI__` at build time; `isWebRuntime()` no longer trusts forgeable browser globals (`b5275afd`)
- Web builds continue to block direct browser access to the Anthropic official API endpoint

### Fixed
- Sandbox loading no longer incorrectly routes through Tauri `invoke` in browser mode
- G6 `graph.data` API compatibility for browser-mode SandboxGraph
- Sidebar collapse control accessibility
- Chapter menu toggle regression
- Project configuration wiring completion (`70163ea`)

### Verification
- `npm run type-check` passes
- `npm run lint -- --quiet` passes
- `npm test -- --run`: 50 test files, 267 tests passing
- `npm run build` passes (existing third-party eval, dynamic/static import overlap, and chunk size warnings remain)

## [v5.0.0] - 2026-04-12

### Added
- **V5 Multi-View Sandbox Architecture** -- replaced Character Card / Worldbook with unified Entity & StateEvent graph (`30f13a5` through `4bd7892`)
- **V5 Entity & StateEvent tables** in SQLite schema (`30f13a5`)
- **Tauri IPC commands** for Entity and StateEvent atomics (`44bbee9`)
- **Pinia store** for multi-view sandbox state reduction (`73e94ba`)
- **Tool Calling schema** for automated state extraction (`204d50b`)
- **V1-to-V5 migration script** for legacy RP formats (`acaa9c3`)
- **Plot Loom Board** -- kanban + timeline fusion with Fate Anchors (PlotAnchor) injected into AI generation context via PlotAnchorMiddleware (`fcdfad5`, `bd1c453`)
- **World Gen Wizard** -- chat interface for bulk-generating entities and relations with draft-node preview and atomic Tauri IPC commit (`7c75229`, `9116c38`)
- **Dynamic Affinity Text** -- attitude-based color coding in relationship graph, updated by RELATION_UPDATE events (`46ea6f3`)
- **Multi-View Sandbox views**: SandboxDocument, SandboxGraph (AntV G6), SandboxTimeline, SandboxMap (SVG/CSS), AutomatonChat (`8415043` through `133a2b5`)
- **Theme Plugin system** -- ThemeExtension types, dynamic theme injector, Theme Registry, and UI switcher (`a8d7745` through `0d13913`)
- **Lazy loading and spotlight graph** with cascading center selection for large entity graphs (`cbfcaa1`, `762a0b1`)
- **Load_entities / load_state_events IPC commands** for on-demand Tauri data loading (`271cac0`)
- **Graph-Guided RAG** -- single-collection (`chapter_content`) vector retrieval guided by active sandbox entities (`680a1db`)
- **Local bge-m3 vector model** enabled by default (`47f1f81`)
- **Structured logger** replacing console.log across the codebase (`e1f1bb0`)
- **ConStory-Bench** -- 19-point consistency check system (antiRetconValidator)

### Changed
- Context builder migrated to V5 sandbox store (`cc03069`)
- Generation scheduler migrated to V5 sandbox store (`9bf2427`)
- All V1 runtime consumers removed (`4bd7892`)
- Element Plus dark mode enabled by default (`5829533`)
- Legacy menus pruned; Sandbox menu introduced (`ad00fc8`)

### Fixed
- P0 security vulnerabilities across the codebase (`430fedb`)
- Backend safety and command issues (`d5deff2`)
- Memory leaks and V5 migration issues in stores (`a5a1b28`)
- Type name collisions and erosion (`59cedb2`)
- Critical data safety, memory leaks, and performance issues (`ebb1a07`)
- Theme loading race condition (`e49fc10`)
- Code review feedback on lazy loading, SQLite reading, and graph rendering (`5e2b0c5`)

### Performance
- SQLite WAL mode enabled (`fdaa788`)
- ECharts tree-shaken in QualityReport; TemplateLibrary lazy-loaded (`a05e7c8`)
- Bundle size optimization (`fdaa788`)

### Security
- P0 vulnerabilities resolved across codebase (`430fedb`)
- Local debug tools hardened against XSS and exposure (`3d9fafb`)

## [v4.0.0] - 2026-03-28

### Added
- **Unified Import System** -- pipeline for importing novel text, generating conversation traces (JSONL), and extracting entities (`0e0d6b6`, `dbb95b4`)
- **Plugin System v1.0** -- extensible architecture with 9 registries (provider, processor, theme, importer, exporter, action-handler, toolbar, sidebar, menu, quick-command) and 3 built-in plugins
- **Assistant slash command registry** -- `/review consistency`, `/review quality`, `/review editor` and other command-driven workflows (`a8394a1`, `5188057`)
- **Assistant action envelope** -- generic action parser executed via plugin action registry (`46f7cfa`, `eecad7c`)
- **FailoverManager** -- circuit-breaker-based model routing with hot-swap between primary and backup providers
- **Context Pipeline** -- middleware-based context assembly replacing monolithic 200-line function
- **Structured Outputs (Tool Calling)** -- JSON Schema `strict: true` for state extraction with 99.9% success rate
- **Tauri IPC + SQLite** -- atomic persistence layer replacing browser-only storage
- **API risk control** -- 400-error auto-heal, 1003-error content safety detection, Unicode surrogate-pair safe truncation
- **RAG reranking** -- hybrid relevance + temporal ordering

### Changed
- V4 architecture evolution completed with 0 TypeScript errors (`98d0371`, `adcf327`)
- CLAUDE.md and eslint rules added (`31931db`)

### Fixed
- Async `loadProject` error handling (`dbb95b4`)
- Chapter `projectId` persistence guards (`f62a2e8`)
- P0 stability and security gaps (`26634d8`)

### Security
- Local debug tools hardened against XSS and exposure (`3d9fafb`)
- Chapter `projectId` persistence guards to prevent data leakage (`f62a2e8`)

## [v3.0.0] - 2026-03-21

### Added
- **Vector retrieval system** -- dual-mode: local model (free) / OpenAI embeddings; semantic search with configurable top-K, similarity threshold, and hybrid keyword+vector weighting
- **Auto-summary generation** -- multi-tier compression (3-chapter full, 4-10 detailed, 11-30 brief, 30+ minimal) with automatic key-information extraction
- **Conflict detection system** -- character, timeline, worldview, and plot-logic conflict detection with severity grading and fix suggestions
- **Enhanced quality checks** -- five-dimension scoring (plot, character, writing, logic, innovation) with trend charts and PDF report export
- **Character relationship graph** -- AntV G6 interactive visualization with auto-extraction (explicit + co-occurrence >= 3), drag/zoom/filter, and PNG export
- **Timeline editor** -- vis-timeline multi-track visualization (main plot, subplot, character, foreshadowing) with auto-extraction and conflict detection
- **Table memory enhancement** -- drag-sort, inline edit, column resize/sort/filter, Excel import/export, CSV, undo/redo, validation
- **World map editor** -- SVG-based interactive map with 15 location types, area division, character position tracking, movement trajectories
- **System prompt management** -- 5 model-specific role definitions (planner, novelist, editor, consultant, data manager) with variable substitution
- **Enhanced model management** -- 12+ provider templates, remote model list fetch, batch config import, cost statistics panel

### Changed
- New dependencies: `vis-timeline`, `vis-data`, `@antv/g6`, `html2canvas`, `xlsx`
- Performance optimizations: vector index caching, batch embedding, summary compression, chart rendering

## [v1.0.0] - 2026-03-15

### Added
- **Project creation and management** -- create projects (novel type, length, style), project list, metadata editing
- **Chapter editor** -- rich-text editing, chapter create/delete/reorder, AI continuation writing
- **AI assistant** -- multi-model support (OpenAI, Anthropic, GLM, Tongyi Qianwen, local models), context assembly, token tracking
- **Outline system** -- classic structure templates, volume management, structured editing
- **Export formats** -- TXT, Markdown, PDF, EPUB, DOCX
- **Worldbook** -- keyword-triggered entries with layered memory management
- **Character cards** -- character descriptions, personality traits, relationship management

---

## Version History Summary

| Version | Date | Key Theme |
|---------|------|-----------|
| v6.0.0 | 2026-05-30 | Pipeline intelligence and quality closed-loop (7 new features) |
| v5.1.0 | 2026-04-26 | Global Design System, workspace UI redesign |
| v5.0.0 | 2026-04-12 | V5 Multi-View Sandbox architecture (Entity + StateEvent) |
| v4.0.0 | 2026-03-28 | Unified import, plugin system, assistant commands |
| v3.0.0 | 2026-03-21 | 8 major feature modules (vector, summary, conflict, quality, graph, timeline, table, map) |
| v1.0.0 | 2026-03-15 | Initial release with core novel-writing functionality |

[Unreleased]: https://github.com/pengcong226/ai-novel-workshop/compare/v6.0.0...HEAD
[v6.0.0]: https://github.com/pengcong226/ai-novel-workshop/compare/v5.1.0...v6.0.0
[v5.1.0]: https://github.com/pengcong226/ai-novel-workshop/compare/v5.0.0...v5.1.0
[v5.0.0]: https://github.com/pengcong226/ai-novel-workshop/compare/v4.0.0...v5.0.0
[v4.0.0]: https://github.com/pengcong226/ai-novel-workshop/compare/v3.0.0...v4.0.0
[v3.0.0]: https://github.com/pengcong226/ai-novel-workshop/compare/v1.0.0...v3.0.0
[v1.0.0]: https://github.com/pengcong226/ai-novel-workshop/releases/tag/v1.0.0
