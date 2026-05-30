# Contributing to AI Novel Workshop

Thank you for your interest in contributing to AI Novel Workshop. This document explains how to set up your development environment, follow project conventions, and submit changes.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Commit Message Format](#commit-message-format)
- [Reporting Issues](#reporting-issues)

## Development Setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 18 LTS | v22 recommended |
| npm | >= 9 | Ships with Node.js |
| Rust | >= 1.70 | Required only for Tauri desktop builds |
| Cargo | (with Rust) | Required only for Tauri desktop builds |

### Installation

```bash
# Clone the repository
git clone https://github.com/pengcong226/ai-novel-workshop.git
cd ai-novel-workshop

# Install dependencies
npm install

# Verify the setup
npm run type-check
npm run lint
npm test -- --run
```

### Running in Development

```bash
# Web development server (browser mode)
npm run dev

# Desktop development (Tauri, requires Rust)
npm run tauri:dev

# Full debug mode (Express API + Vite frontend)
npm run dev:full
```

### Environment Modes

The project supports two runtime modes:

- **Browser mode** (`npm run dev`): Vue frontend + IndexedDB persistence. No Rust needed.
- **Tauri desktop mode** (`npm run tauri:dev`): Vue frontend + Rust backend + SQLite persistence.

Runtime detection is automatic via the `isWebRuntime()` utility. You do not need to configure anything to switch between modes.

## Project Structure

```
ai-novel-workshop/
├── src/                    # Vue 3 frontend source
│   ├── components/         # Vue components (60+)
│   ├── stores/             # Pinia state management
│   ├── services/           # Business logic services
│   ├── utils/              # Core utilities
│   ├── types/              # TypeScript type definitions
│   ├── plugins/            # Plugin system
│   ├── assistant/          # AI assistant commands and actions
│   ├── agents/             # AI agent implementations
│   ├── composables/        # Vue composables
│   └── views/              # Route-level views
├── src-tauri/              # Rust backend (Tauri)
│   └── src/
│       ├── lib.rs          # IPC commands and SQLite operations
│       └── vector.rs       # Vector retrieval extension
├── docs/                   # Documentation
├── playground/             # Debug server and test utilities
└── tests/                  # Test utilities and fixtures
```

For a detailed architecture overview, see [docs/architecture/overview.md](./docs/architecture/overview.md).

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Write Tests First (TDD)

Follow the Red-Green-Refactor cycle:

1. Write a failing test that captures the desired behavior
2. Implement the minimum code to pass the test
3. Refactor while keeping tests green

### 3. Implement Changes

- Prefer extending existing middleware, store, and service flows over creating parallel pipelines
- Use V5 types from `src/types/sandbox.ts` for new work (do not use `src/types/index.ts`, which is legacy)
- Use `isWebRuntime()` from `src/utils/anthropic-guard.ts` for runtime detection
- Use encrypted localStorage helpers from `src/utils/crypto.ts` for API keys
- All AI-generated content, review fixes, and assistant actions are untrusted input -- keep execution behind local allowlists

### 4. Verify

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Tests
npm test -- --run

# Build
npm run build
```

### 5. Commit and Push

Follow the [commit message format](#commit-message-format) below, then push your branch and open a pull request.

## Code Style Guidelines

### TypeScript / Vue

- **Framework**: Vue 3 with Composition API (`<script setup lang="ts">`)
- **State management**: Pinia stores
- **Type safety**: Strict TypeScript -- no `any` types without explicit justification
- **UI components**: Element Plus; follow the project Design System (`--ds-*` tokens)
- **Naming conventions**:
  - Files: PascalCase for Vue components (`ChapterEditor.vue`), camelCase for utilities (`contextBuilder.ts`)
  - Functions/variables: camelCase
  - Types/interfaces: PascalCase
  - Constants: UPPER_SNAKE_CASE
- **Imports**: Use path aliases (`@/` maps to `src/`)
- **UI copy**: Chinese-first for all user-facing text

### Rust (Tauri Backend)

- Follow standard Rust conventions (`cargo fmt`, `cargo clippy`)
- IPC commands should validate untrusted JSON before mutating SQLite
- Keep delete/insert operations inside a single SQLite transaction for restore-style commands

### CSS

- Use the Design System tokens (`--ds-*`) defined in `src/assets/styles/design-system.css`
- Prefer scoped styles in Vue components
- Dark mode is the default; light mode is the alternative

### Linting and Formatting

```bash
# Lint check
npm run lint

# Lint with auto-fix
npm run lint:fix
```

ESLint rules are defined in the project configuration. Do not disable rules inline without a comment explaining why.

## Testing Requirements

### Test Framework

The project uses [Vitest](https://vitest.dev/) for unit testing.

### Running Tests

```bash
# Watch mode (development)
npm test

# Single run (CI)
npm run test:run

# Single file
npm test -- --run src/path/to/file.test.ts

# By name pattern
npm test -- --run -t "test name"
```

### Coverage Expectations

- New features should have test coverage for core logic
- Bug fixes should include a regression test
- Aim for 80%+ coverage on new code

### What to Test

- Store logic (Pinia stores)
- Utility functions
- Service-layer business logic
- Composables
- Type validation and schema parsing

### Rust Tests

When modifying `src-tauri/` code:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## Pull Request Process

### Before Opening a PR

1. Ensure all checks pass locally:
   ```bash
   npm run type-check && npm run lint && npm test -- --run && npm run build
   ```
2. Rebase on the latest `main` branch
3. Write a clear PR description explaining what changed and why

### PR Template

```markdown
## What Changed
Brief description of the change.

## Why
Explanation of the motivation or problem being solved.

## Testing
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm test -- --run` passes
- [ ] `npm run build` passes
- [ ] Manual testing performed (describe scenarios)

## Related Issues
Closes #<issue-number>
```

### Review Process

- At least one review is required before merging
- Address all review comments
- Keep PRs focused -- one feature or fix per PR when possible
- Squash commits if the PR history contains many small fixup commits

### Merge Strategy

- Use **squash merge** for feature PRs to keep the main branch history clean
- Use **regular merge** for multi-commit PRs where individual commits are meaningful

## Commit Message Format

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

<optional body>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation changes only |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (dependencies, CI, tooling) |
| `perf` | Performance improvements |
| `style` | Code style changes (formatting, missing semicolons, etc.) |
| `ci` | CI/CD configuration changes |

### Scopes (optional)

Common scopes used in this project: `sandbox`, `store`, `rust`, `ai`, `types`, `plugins`, `theme`, `backend`, `ui`, `migration`, `rag`.

### Examples

```
feat(sandbox): add PlotLoomBoard kanban with fate anchors
fix(store): resolve memory leaks in V5 migration
refactor(rag): rewrite graph-guided RAG module
docs: update architecture documentation for V5
perf: tree-shake echarts in QualityReport
```

## Reporting Issues

### Bug Reports

When reporting a bug, please include:

1. **Environment**: Browser/desktop mode, OS, Node.js version
2. **Steps to reproduce**: Clear numbered steps
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Screenshots or logs**: If applicable

### Feature Requests

When requesting a feature, please include:

1. **Problem description**: What problem does this solve?
2. **Proposed solution**: How should it work?
3. **Alternatives considered**: Other approaches you've thought about
4. **Use case**: Who benefits and how?

## Code of Conduct

- Be respectful and constructive in all interactions
- Focus on technical merit in code reviews
- Welcome newcomers and help them get started

## Questions?

If you have questions about contributing, open a discussion in the GitHub repository or comment on an existing issue.
