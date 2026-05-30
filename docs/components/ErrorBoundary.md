# ErrorBoundary

Vue error boundary component that catches rendering errors in its default slot, displays a fallback UI with optional retry and detail expansion, and provides an error-reporting injection for child components.

**Source**: `src/components/ErrorBoundary.vue`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `undefined` | Identifier for logging. Appears in logger prefix as `ErrorBoundary:{name}`. |
| `title` | `string` | `'Component rendering error'` (Chinese) | Custom title text shown in the fallback UI. |
| `showRetry` | `boolean` | `false` | Whether to show a "Retry" button that resets the error state. |
| `showDetail` | `boolean` | `false` | Whether to show a "View Details" toggle button that expands to show the full error stack trace. |

## Emits

None.

## Slots

| Slot | Description |
|------|-------------|
| `default` | The child content to render when there is no error. Wrapped by the error boundary. |

## Provided Context

The component uses `provide('errorBoundary', ...)` to make an error-reporting function available to all descendant components via `inject`:

```ts
interface ErrorBoundaryInjection {
  reportError: (err: Error) => void
}
```

Child components can inject this to manually trigger the error boundary:

```ts
import { inject } from 'vue'

const errorBoundary = inject<{ reportError: (err: Error) => void }>('errorBoundary')

// Later, on a caught error:
errorBoundary?.reportError(error)
```

## Error Capture

- Uses Vue's `onErrorCaptured` hook to intercept errors thrown during rendering of child components.
- Stops error propagation by returning `false`.
- Logs the error with the component's logger, including message, component info, and stack trace.

## Retry Behavior

When the "Retry" button is clicked:
1. `hasError` is reset to `false`.
2. The error message and detail are cleared.
3. The default slot is re-rendered, giving the child component another chance.

## Usage

### Basic Wrap

```vue
<template>
  <ErrorBoundary name="MyWidget">
    <MyWidget />
  </ErrorBoundary>
</template>
```

### With Retry and Detail

```vue
<template>
  <ErrorBoundary
    name="ChapterEditorDialog"
    :show-retry="true"
    :show-detail="true"
  >
    <ChapterEditorDialog
      v-model="showEditor"
      :chapter="selectedChapter"
    />
  </ErrorBoundary>
</template>
```

### Custom Title

```vue
<template>
  <ErrorBoundary
    name="ExportSettings"
    title="Export failed"
    :show-retry="true"
  >
    <ExportSettings :project="project" />
  </ErrorBoundary>
</template>
```

## Notes

- The fallback UI is a centered flex container with a dashed border, icon, title, message, and optional action buttons.
- Uses Element Plus buttons (`el-button`) for the retry and detail toggle.
- The detail panel shows the full error stack and component info in a `<pre>` block, capped at 200px height with scroll.
- This component is used in `Chapters.vue` to wrap both `ChapterEditorDialog` and `ExportSettings` to prevent editor or export crashes from cascading.
