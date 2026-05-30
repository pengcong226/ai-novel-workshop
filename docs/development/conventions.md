# Code Conventions

Project coding standards and conventions for AI Novel Workshop.

## Language and UI

- **UI copy is Chinese-first.** All user-facing text (labels, tooltips, messages, notifications) uses Chinese.
- **TypeScript everywhere.** All new code must be TypeScript with strict mode enabled.
- **No `any` types.** Use proper typing; use `unknown` with type guards when the type is truly unknown.

## TypeScript Conventions

### Imports

- Use V5 types from `src/types/sandbox.ts` for all new work.
- Treat `src/types/index.ts` as a legacy/deprecated compatibility surface.
- Use path aliases (`@/stores/...`, `@/utils/...`) instead of relative paths.

### Type Definitions

- Define interfaces for all data structures.
- Use `interface` for object shapes that may be extended; use `type` for unions, intersections, and utility types.
- Export types alongside their implementations.

### Null Safety

- Use `strictNullChecks` (enabled via `strict: true` in tsconfig).
- Prefer optional chaining (`?.`) and nullish coalescing (`??`) over manual checks.
- Use `isWebRuntime()` from `src/utils/anthropic-guard.ts` for runtime detection; never inline `__TAURI_INTERNALS__` checks.

## Vue Conventions

### Component Structure

- Use `<script setup lang="ts">` with the Composition API.
- Define props with `defineProps` using TypeScript interfaces.
- Define emits with `defineEmits` using typed tuples.
- Use Element Plus (`el-*`) as the design system base.

### Store Access

- Use Pinia composables (`use*Store`) for store interactions.
- Never access stores outside of `setup()` or composables.

### Async Components

- Load heavy components with `defineAsyncComponent` to reduce initial bundle size.

## Architecture Conventions

### Data Model

- Use the V5 Entity + StateEvent event-sourcing model for all new data.
- Entity types: `CHARACTER`, `FACTION`, `LOCATION`, `LORE`, `ITEM`, `CONCEPT`, `WORLD`.
- StateEvent types: `PROPERTY_UPDATE`, `RELATION_ADD`, `RELATION_REMOVE`, `RELATION_UPDATE`, `LOCATION_MOVE`, `VITAL_STATUS_CHANGE`, `ABILITY_CHANGE`.

### Storage

- Use `isWebRuntime()` to route between Tauri IPC (SQLite) and browser (IndexedDB/localStorage).
- Frontend store/service code calls Rust IPC; do not add alternate persistence paths.
- Restore-style commands must validate untrusted JSON before deleting rows and keep delete/insert inside one SQLite transaction.

### Context Assembly

- Extend existing middleware flows in `contextBuilder.ts`; do not create parallel pipelines.
- Each middleware owns its own token budget.

### Security

- Treat all AI-generated content, review fixes, and assistant actions as untrusted input.
- Keep execution behind local allowlists and exact-match validation.
- Use `writeEncryptedLocalStorage` / `readEncryptedLocalStorage` from `src/utils/crypto.ts` for API keys; never use raw `encryptApiKeyV2` / `localStorage.setItem`.

### Module-Scope Singletons

- `useDeepImportSession` and `useRewriteContinuation` are module-scope singleton composables that share state across components.
- Do not convert them to per-instance composables without understanding the cross-component state sharing requirement.

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| Files (Vue components) | PascalCase | `ChapterEditorDialog.vue` |
| Files (composables) | camelCase with `use` prefix | `useRewriteContinuation.ts` |
| Files (utilities) | camelCase | `contextBuilder.ts` |
| Files (services) | kebab-case | `generation-scheduler.ts` |
| Files (types) | camelCase | `sandbox.ts` |
| TypeScript interfaces | PascalCase | `ResolvedEntity` |
| TypeScript types | PascalCase | `EntityType` |
| Constants | UPPER_SNAKE_CASE | `MAX_CONTEXT_TOKENS` |
| Functions | camelCase | `buildNameToIdMapFromEntities` |
| CSS custom properties | `--ds-*` prefix | `--ds-color-primary` |
| Pinia stores | `use*Store` | `useSandboxStore` |

## Shared Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| Entity helpers | `src/utils/entityHelpers.ts` | `buildNameToIdMapFromEntities`, `formatEntityLocation` |
| Event type labels | `src/utils/eventTypeLabels.ts` | Label/tag maps for StateEvent types |
| Crypto helpers | `src/utils/crypto.ts` | Encrypted localStorage read/write |
| Runtime detection | `src/utils/anthropic-guard.ts` | `isWebRuntime()` |

## Error Handling

- Wrap async operations in try/catch at service boundaries.
- Use the `ErrorBoundary` component for UI-level error recovery.
- Log errors with structured context (project ID, chapter number, entity ID) for debugging.

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
