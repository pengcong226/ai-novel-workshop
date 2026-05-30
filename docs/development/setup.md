# Developer Setup Guide

Prerequisites, installation, and build verification for AI Novel Workshop development.

## Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| Node.js | 18+ | All development |
| npm | 9+ | Dependency management |
| Rust toolchain | Latest stable (via [rustup](https://rustup.rs/)) | Tauri desktop mode only |

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ai-fanfic-workshop

# Install dependencies
npm install
```

## Development Servers

### Web Mode (Vite Dev Server)

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:5173`. Uses IndexedDB/localStorage for persistence. Suitable for UI development and most feature work.

### Desktop Mode (Tauri)

```bash
npm run tauri:dev
```

Starts the Tauri desktop app in development mode. Requires the Rust toolchain. Uses SQLite for persistence. The Tauri app window opens automatically.

### Full Debug Mode (Express + Vite)

```bash
npm run dev:full
```

Runs the Express debug server (`playground/debug-server.cjs`) alongside Vite concurrently. Useful for testing API interactions and server-side features.

## Build Verification

Run these commands to verify your environment is correctly set up:

```bash
# Type checking (vue-tsc --noEmit)
npm run type-check

# Lint
npm run lint

# Run tests once
npm run test:run

# Production build
npm run build
```

All four commands should complete without errors before making changes.

## Production Builds

### Web Build

```bash
npm run build
```

Outputs to `dist/`. Can be previewed with `npm run preview`.

### Desktop Build

```bash
npm run tauri:build
```

Produces a native installer. Requires the Rust toolchain and platform-specific dependencies (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

### Bundle Analysis

```bash
npm run build:analyze
```

Generates a bundle size visualization at `dist/stats.html`.

## Project Structure

```
src/
  components/          # Vue 3 components (60+)
    Sandbox/           # Multi-view sandbox (document, graph, timeline, map, chat)
    Chapters.vue       # Chapter management
    ChapterEditorDialog.vue  # Immersive chapter editor
    AIAssistant.vue    # Chat-based AI assistant
    editor/            # Tiptap editor components
  stores/              # Pinia stores
    sandbox.ts         # V5 Entity + StateEvent backbone
    project.ts         # Project aggregate
    ai.ts              # AI model/provider config
    vector.ts          # Vector retrieval
    suggestions.ts     # Review suggestions
  services/            # Business logic services
    generation-scheduler.ts   # 10-stage generation pipeline
    novel-extractor.ts        # Deep import extraction
    rewrite-continuation.ts   # Rewrite/continuation workflow
    ai/                       # AI service layer (ModelRouter, FailoverManager)
  types/               # TypeScript type definitions
    sandbox.ts         # V5 canonical types (Entity, StateEvent)
    index.ts           # Legacy compatibility re-exports
  utils/               # Utilities
    contextBuilder.ts  # Context assembly middleware pipeline
    qualityChecker.ts  # Quality assessment
    stateDiff.ts       # Event-sourcing reducer and snapshot diff
    entityHelpers.ts   # Shared entity helpers
  plugins/             # Plugin system (9 registry types)
  assistant/           # AI assistant commands and actions
  composables/         # Vue composables
src-tauri/
  src/lib.rs           # Tauri IPC commands (SQLite backend)
```

## Key Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build config, Vitest config, dev server proxy |
| `tsconfig.json` | TypeScript compiler options |
| `package.json` | Dependencies and npm scripts |
| `src-tauri/Cargo.toml` | Rust dependencies for desktop mode |
| `src-tauri/tauri.conf.json` | Tauri app configuration |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_DEV_SERVER_HOST` | Dev server host | `127.0.0.1` |
| `VITE_DEV_ALLOWED_HOSTS` | Comma-separated allowed hosts | (empty) |
| `VITE_CUSTOM_PROXY_TARGET` | HTTPS proxy target for AI API calls | (none) |
| `ANALYZE` | Set to `true` for bundle analysis | (unset) |

## Troubleshooting

### Build Fails with TypeScript Errors

Run `npm run type-check` to isolate TypeScript issues from build issues.

### Lint Fails with ENOENT Errors

Transient ESLint ENOENT errors can occur with concurrent Vite config temp files. Run `npm run lint` separately from build/type-check.

### Tauri Desktop Mode Won't Start

Ensure the Rust toolchain is installed and up to date:

```bash
rustup update
cargo check --manifest-path src-tauri/Cargo.toml
```

### Tests Fail After Fresh Install

Clear any stale state and reinstall:

```bash
rm -rf node_modules
npm install
npm run test:run
```
