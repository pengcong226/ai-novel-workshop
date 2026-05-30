# AI Novel Workshop - Documentation Index

Central documentation hub for the AI Novel Workshop (AI小说工坊) project.

## Getting Started

| Document | Description |
|----------|-------------|
| [Getting Started Guide](./guides/getting-started.md) | Installation, first project setup, core workflow walkthrough |
| [AI Configuration Guide](./guides/ai-config.md) | Provider setup, model role assignment, context window management, cost optimization |
| [Advanced Features Guide](./guides/advanced-features.md) | Sandbox entities, deep import, rewrite/continuation, batch generation, quality checking |

## Architecture

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture/overview.md) | System diagram, key modules, data flow, technology stack, design principles |
| [Architecture (Detailed)](./architecture.md) | In-depth technical architecture document |
| [Frontend Architecture](./frontend-architecture.md) | Vue 3 frontend structure and conventions |
| [Data Architecture](./data-architecture.md) | Storage model, memory system, persistence layer |
| [Technical Summary](./technical-summary.md) | Core technical decisions and rationale |
| [Technical Solutions](./technical-solutions.md) | Detailed technical solution designs |

## API Reference

| Document | Description |
|----------|-------------|
| [API Documentation Index](./api/README.md) | Module index for all stores, services, utilities, and types |
| [Stores API](./api/stores.md) | Pinia store interfaces: sandbox, project, AI, suggestions |
| [Services API](./api/services.md) | Service interfaces: generation scheduler, novel extractor, rewrite/continuation, daemon |
| [Utilities API](./api/utils.md) | Utility interfaces: context builder, quality checker, summarizer, chapter parser, state diff |
| [Types Reference](./api/types.md) | V5 canonical types and legacy type mappings |
| [Generation Scheduler](./api/generation-scheduler.md) | 10-stage generation pipeline details |
| [Novel Extractor](./api/novel-extractor.md) | Deep import extraction pipeline |
| [Rewrite/Continuation](./api/rewrite-continuation.md) | Rewrite and continuation service API |
| [Daemon Service](./api/daemon-service.md) | Background scheduled generation service |

## Components

| Document | Description |
|----------|-------------|
| [Component Documentation Index](./components/README.md) | All documented Vue components with paths and descriptions |
| [ChapterEditorDialog](./components/ChapterEditorDialog.md) | Immersive chapter editor with AI generation, review, and version history |
| [Chapters](./components/Chapters.md) | Chapter management page with list, filtering, batch generation |
| [SearchDialog](./components/SearchDialog.md) | Command-palette-style global search |
| [LoadingSkeleton](./components/LoadingSkeleton.md) | Multi-variant skeleton loader |
| [NotificationContainer](./components/NotificationContainer.md) | Toast notification container |
| [ErrorBoundary](./components/ErrorBoundary.md) | Vue error boundary with retry |
| [Component List](./component-list.md) | Full component inventory |

## Guides

| Document | Description |
|----------|-------------|
| [Getting Started](./guides/getting-started.md) | Installation and first project |
| [AI Configuration](./guides/ai-config.md) | Provider and model setup |
| [Advanced Features](./guides/advanced-features.md) | Deep import, rewrite, batch generation, quality checks |
| [Developer Setup](./development/setup.md) | Development environment setup and build verification |
| [Code Conventions](./development/conventions.md) | Project coding standards and naming conventions |
| [Testing Guide](./development/testing.md) | Testing strategy, commands, and coverage requirements |
| [Unified Import System](./unified-import-system.md) | Import pipeline architecture |
| [Unified Import Quickstart](./unified-import-quickstart.md) | Quick guide to the import system |
| [Worldbook System](./worldbook-system.md) | Worldbook entry management |
| [Worldbook Importer Guide](./worldbook-importer-guide.md) | Importing worldbook data |
| [Worldbook Exporter Usage](./worldbook-exporter-usage.md) | Exporting worldbook data |
| [Character Card System](./character-card-system.md) | Character card data model |
| [Character Card UI Guide](./character-card-ui-guide.md) | Character card UI usage |
| [Relationship Graph](./RELATIONSHIP_GRAPH.md) | Entity relationship visualization |
| [Relationship Graph Quickstart](./QUICKSTART_RELATIONSHIP_GRAPH.md) | Quick guide to relationship graphs |
| [Map Implementation](./map-implementation.md) | World map feature design |
| [Map Usage](./map-usage.md) | World map usage guide |
| [Vector Retrieval](./vector-retrieval.md) | RAG and vector search system |
| [BGE-M3 Model Guide](./bge-m3-model-guide.md) | Local embedding model setup |
| [Memory Implementation](./memory-implementation.md) | Three-layer memory system design |
| [Table Memory System](./table-memory-system.md) | Table-based memory implementation |
| [Timeline Implementation](./TIMELINE_IMPLEMENTATION.md) | Sandbox timeline view |
| [Knowledge Base Integration](./knowledge-base-integration.md) | Knowledge base feature |
| [Conflict Detection System](./CONFLICT_DETECTION_SYSTEM.md) | Anti-retcon conflict detection |
| [Summary System](./SUMMARY_SYSTEM_COMPLETE.md) | Chapter summary generation |
| [Summary Integration Guide](./SUMMARY_INTEGRATION_GUIDE.md) | Integrating summaries into context |
| [Chapters Summary Patch](./CHAPTERS_SUMMARY_PATCH.md) | Summary system patch notes |

## Migration

| Document | Description |
|----------|-------------|
| [V1 to V5 Migration](./migration/v1-to-v5.md) | Data model migration from V1 flat types to V5 event-sourcing |
| [Legacy Types Reference](./migration/legacy-types.md) | Complete mapping table from V1 types to V5 equivalents |

## Plugins

| Document | Description |
|----------|-------------|
| [Plugin Development Guide](./plugins/creating-plugins.md) | Complete guide to building plugins: manifest, lifecycle, registries, permissions |
| [Plugin Quick Start](./PLUGIN_QUICK_START.md) | Quick start for plugin development |
| [Plugin System Summary](./PLUGIN_SYSTEM_SUMMARY.md) | Plugin architecture overview |
| [Plugin Usage Guide](./PLUGIN_USAGE_GUIDE.md) | Using installed plugins |
| [Plugin Testing Guide](./PLUGIN_TESTING_GUIDE.md) | Testing plugin implementations |
| [Plugin Development (Detailed)](./PLUGIN_DEVELOPMENT.md) | Extended plugin development reference |
| [Plugin Completion Report](./PLUGIN_COMPLETION_REPORT.md) | Plugin system implementation status |
| [Plugin Final Summary](./PLUGIN_FINAL_SUMMARY.md) | Plugin system final status |

## Assistant

| Document | Description |
|----------|-------------|
| [Assistant Commands](./assistant/commands.md) | Slash commands (`/help`, `/review`) and action buttons |
| [Review Workflow](./assistant/review-workflow.md) | AI review suggestion pipeline |
| [MCP Agent Guide](./MCP_AGENT_GUIDE.md) | MCP integration with AI assistant |
| [AI Debug Skill](./AI-DEBUG-SKILL.md) | AI debugging workflow |

## Quality and Testing

| Document | Description |
|----------|-------------|
| [Testing Guide](./development/testing.md) | Developer testing guide |
| [Test Guide](./TEST-GUIDE.md) | Manual functional testing checklist |
| [Quality Check System](./质量检查系统说明.md) | Quality check system explanation |
| [Code Review](./CODE-REVIEW.md) | Code review findings |
| [Code Review V2](./CODE-REVIEW-V2.md) | Second-pass code review |
| [Team Review Report](./team-review-report.md) | Multi-agent team review report |
| [Completeness Analysis](./COMPLETENESS_ANALYSIS.md) | Feature completeness assessment |

## Project Management

| Document | Description |
|----------|-------------|
| [Requirements](./requirements.md) | Full project requirements specification |
| [Release Notes](./RELEASE_NOTES.md) | Version history and changelog |
| [V5 Optimization Plan](./v5-optimization-plan.md) | V5 performance and architecture optimization plan |
| [Optimization Analysis](./optimization-analysis.md) | Detailed optimization analysis |
| [Optimization Plan](./optimization-plan.md) | Optimization implementation plan |
| [Fix and Optimization Checklist](./修复与优化清单.md) | Bug fix and optimization tracking |

## AI Integration (Reference)

| Document | Description |
|----------|-------------|
| [AI Integration Design](./ai-integration-design.md) | Technical design for AI service integration |
| [AI Config Guide](./AI_CONFIG_GUIDE.md) | AI provider configuration (Chinese) |
| [AI Service Progress](./AI服务接入进度.md) | AI service integration progress |
| [AI Generation Status](./AI-GENERATION-STATUS.md) | Generation feature status |
| [LLM Integration Complete](./LLM-INTEGRATION-COMPLETE.md) | LLM integration completion report |
| [LLM Import Guide](./LLM-IMPORT-GUIDE.md) | LLM-based novel import guide |
| [LLM Import Verification](./LLM-IMPORT-VERIFICATION.md) | Import verification procedures |
| [LLM Import Completion](./LLM-IMPORT-COMPLETION.md) | Import completion report |
| [Unified Import Changelog](./unified-import-changelog.md) | Import system changelog |

## Planning Archives

| Directory | Description |
|-----------|-------------|
| [Superpowers Plans](./superpowers/plans/) | Historical implementation plans |
| [Superpowers Specs](./superpowers/specs/) | Design specifications |
| [Project Docs](./project-docs/) | Product assessments, test reports, optimization plans |
