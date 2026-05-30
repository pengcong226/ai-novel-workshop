# Testing Guide

Testing strategy, commands, and patterns for AI Novel Workshop.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm test` | Run tests in Vitest watch mode |
| `npm run test:run` | Run all tests once (CI mode) |
| `npm test -- --run src/path/to/file.test.ts` | Run a single test file |
| `npm test -- --run -t "test name"` | Run tests matching a name pattern |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run type-check` | TypeScript type checking (vue-tsc --noEmit) |
| `npm run lint` | ESLint check |

## Testing Framework

The project uses **Vitest** as the test runner, configured in `vite.config.ts`. Vitest shares the same transform pipeline as the Vite build, so tests run against the same module resolution and aliases used in production code.

Key configuration:
- **Environment**: `jsdom` for Vue component tests
- **Path aliases**: Same as Vite (`@/` maps to `src/`)
- **Auto-imports**: Element Plus and Vue APIs are auto-imported in tests via `unplugin-auto-import`

## Test File Conventions

| Convention | Example |
|-----------|---------|
| File location | Co-located with source: `src/utils/foo.ts` -> `src/utils/foo.test.ts` |
| File naming | `*.test.ts` for unit tests, `*.spec.ts` for integration tests |
| Test structure | `describe` / `it` blocks with descriptive names |
| Naming style | Chinese or English descriptions are both acceptable |

## Writing Tests

### Unit Tests

Test pure functions and utilities in isolation:

```typescript
import { describe, it, expect } from 'vitest'
import { buildNameToIdMapFromEntities } from './entityHelpers'

describe('buildNameToIdMapFromEntities', () => {
  it('should map entity names to their IDs', () => {
    const entities = [
      { id: '1', name: 'Alice', type: 'CHARACTER' },
      { id: '2', name: 'Bob', type: 'CHARACTER' },
    ]
    const result = buildNameToIdMapFromEntities(entities)
    expect(result.get('Alice')).toBe('1')
    expect(result.get('Bob')).toBe('2')
  })
})
```

### Store Tests

Test Pinia stores with the testing utilities:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSandboxStore } from './sandbox'

describe('SandboxStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should add an entity', () => {
    const store = useSandboxStore()
    store.addEntity({ id: '1', name: 'Test', type: 'CHARACTER', /* ... */ })
    expect(store.entities).toHaveLength(1)
  })
})
```

### Component Tests

Mount Vue components with the Pinia store:

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  it('should render correctly', () => {
    setActivePinia(createPinia())
    const wrapper = mount(MyComponent, {
      props: { /* ... */ },
    })
    expect(wrapper.text()).toContain('expected text')
  })
})
```

## Coverage

Run coverage with:

```bash
npm run test:coverage
```

The project targets 80%+ coverage for new code. Coverage reports are generated in the `coverage/` directory.

## Type Checking as a Test Gate

Always run type checking before committing:

```bash
npm run type-check
```

This runs `vue-tsc --noEmit` and catches type errors across all `.vue` and `.ts` files.

## Linting

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix
```

Run lint separately from build/type-check to avoid transient ENOENT errors caused by concurrent Vite config temp files.

## Test-Driven Development Workflow

1. **RED**: Write a failing test that describes the desired behavior
2. **GREEN**: Write the minimum code to make the test pass
3. **IMPROVE**: Refactor while keeping tests green

Run tests in watch mode during development:

```bash
npm test
```

Vitest re-runs affected tests automatically when files change.

## Rust Backend Tests

When Cargo is available, verify the Rust backend compiles:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Rust unit tests (if present) can be run with:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## Manual Testing

For functional testing of UI features, see the [Manual Test Guide](../TEST-GUIDE.md) which covers:

- Model provider management
- Configuration save/restore
- Advanced settings
- Export/import flows

## CI Verification Checklist

Before committing or creating a PR, verify:

```bash
npm run type-check   # No TypeScript errors
npm run lint         # No lint errors
npm run test:run     # All tests pass
npm run build        # Production build succeeds
```
