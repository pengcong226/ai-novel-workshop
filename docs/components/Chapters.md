# Chapters

Chapter management page with a virtualized chapter list, search/filter, drag-reorder, batch generation, one-click continuation, rewrite/continuation panels, and multi-format export.

**Source**: `src/components/Chapters.vue`

## Props

None. This component reads project and chapter data directly from the `useProjectStore` Pinia store.

## Emits

None.

## Slots

None.

## Features

### Chapter List

- Virtualized rendering via `@tanstack/vue-virtual` for performance with large chapter counts.
- Each card shows: chapter number, title, status tag, AI-generated badge, word count, generation date, and a content preview.
- Drag-and-drop reordering with visual feedback (drag handle, drop highlight).

### Search and Filters

- Text search across title, content, and summary.
- Status filter: draft / revised / final.
- Word count filter: <1000, 1000-5000, 5000-10000, >10000.
- Quality score filter: high (8-10), medium (5-7), low (0-4).
- Active filter count displayed when any filter is active.

### Actions

| Action | Description |
|--------|-------------|
| Validate Chapters | Checks chapter number continuity, minimum length (100 chars), and duplicate titles. |
| Export (dropdown) | Export all chapters as Markdown, PDF, DOCX, TXT, EPUB, or JSON. Also opens export settings dialog. |
| Batch Generation | Opens a dialog to configure and start bulk AI chapter generation with optional checkpoint intervals. |
| One-Click Continue (Pipeline) | Opens `WriteNextDialog` to configure a pipeline-based batch continuation with progress tracking, pause/resume, and IndexedDB state persistence. |
| Continuation Panel | Opens the `ContinuationPanel` for continuation workflows. |
| Rewrite Panel | Opens the `RewritePanel` for rewrite workflows. |
| New Chapter | Opens `ChapterEditorDialog` in create mode. |

### Per-Chapter Actions

| Action | Description |
|--------|-------------|
| Edit | Opens `ChapterEditorDialog` in edit mode. |
| Preview | Opens a reading preview dialog with `ChapterReadingPreview`. |
| Export (single) | Export the chapter as Markdown, PDF, DOCX, or TXT. |
| Regenerate | Re-generate the chapter via AI (confirmation required). |
| Checkpoints | View and restore from chapter checkpoints. |
| AIGC Detection | Run local heuristic AI-content detection on the chapter. |
| Plugin actions | Dynamically registered toolbar buttons from the plugin system. |
| Delete | Delete the chapter (confirmation required). |

### Async Sub-Components

The following sub-components are loaded via `defineAsyncComponent` to reduce initial bundle size:

- `ChapterEditorDialog`
- `ChapterReadingPreview`
- `ExportSettings`
- `ContinuationPanel`
- `RewritePanel`
- `StateDiffViewer`
- `WriteNextDialog`
- `PipelineProgressPanel`

## Usage

```vue
<template>
  <Chapters />
</template>

<script setup lang="ts">
import Chapters from '@/components/Chapters.vue'
</script>
```

This component is self-contained and reads from the project store. It is typically mounted as the main content of a project workspace route.

## Notes

- The chapter list uses `LoadingSkeleton` with `variant="list"` during the initial load.
- The editor dialog is wrapped in an `ErrorBoundary` to prevent editor crashes from taking down the entire page.
- Pipeline state (events, pause/running) is persisted to IndexedDB via `usePipelineStatePersistence` so that page refreshes do not lose progress.
- Project-level locking (`acquireProjectLock` / `releaseProjectLock`) prevents concurrent batch operations.
