# ChapterEditorDialog

Fullscreen immersive chapter editor with AI generation, inline review, quality checks, version history, and auto-save.

**Source**: `src/components/ChapterEditorDialog.vue`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `modelValue` | `boolean` | -- | Controls dialog visibility (v-model). |
| `chapter` | `Chapter \| null` | `null` | Chapter to edit. Pass `null` or omit to create a new chapter. |
| `projectId` | `string` | `undefined` | Explicit project ID override. Falls back to the current project from the store. |
| `preserveProvidedContent` | `boolean` | `false` | When `true`, skips loading the full chapter body from the store and uses the `chapter.content` as-is. Useful when the caller has already loaded the content (e.g., restoring from a checkpoint). |

## Emits

| Event | Payload | Description |
|-------|---------|-------------|
| `update:modelValue` | `boolean` | Emitted when the dialog visibility changes (v-model binding). |
| `saved` | `Chapter` | Emitted after a successful manual save with the persisted chapter data. |

## Slots

This component does not expose named slots. The dialog header is fully custom-rendered internally.

## Keyboard Shortcuts

All shortcuts are scoped to `chapter-editor` and only active when the dialog is open and no nested dialog (find/replace, version panel, quality report, AI rewrite confirm) is active.

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save chapter |
| `Ctrl/Cmd + F` | Open find/replace |
| `Ctrl/Cmd + H` | Open find/replace (alternate) |
| `Ctrl/Cmd + Shift + R` | Run AI review |
| `Ctrl/Cmd + Shift + Q` | Run quality check |

## Auto-Save Behavior

- Triggers after 3 seconds of inactivity following a content or title change.
- Only runs when the dialog is visible, a title is set, and no generation or manual save is in progress.
- Status indicator in the header shows: `idle`, `pending`, `saving`, `saved`, or `error`.

## Internal Sub-Components

- `NovelEditor` -- Tiptap-based plain-text editor surface.
- `FindReplacePanel` -- Inline find-and-replace.
- `GlassContextPanel` -- Context radar side panel (world info, characters).
- `ReviewSidePanel` -- AI review suggestions with navigate/apply/dismiss actions.
- `ChapterVersionPanel` -- Snapshot history and restore dialog.
- `AIRewriteConfirm` -- Diff view for accepting or regenerating AI paragraph rewrites.

## Usage

```vue
<template>
  <ChapterEditorDialog
    v-model="showEditor"
    :chapter="selectedChapter"
    :project-id="projectId"
    @saved="onChapterSaved"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ChapterEditorDialog from '@/components/ChapterEditorDialog.vue'
import type { Chapter } from '@/types'

const showEditor = ref(false)
const selectedChapter = ref<Chapter | null>(null)
const projectId = 'my-project-id'

function onChapterSaved(chapter: Chapter) {
  console.log('Saved chapter:', chapter.title)
}
</script>
```

### Creating a New Chapter

```vue
<template>
  <el-button @click="openNewChapter">New Chapter</el-button>
  <ChapterEditorDialog
    v-model="showEditor"
    :chapter="null"
    @saved="refreshList"
  />
</template>
```

## Notes

- The dialog is rendered as a fullscreen `el-dialog` with `aria-modal="true"`.
- When opened with an existing chapter, the full body content is loaded asynchronously from the project store (unless `preserveProvidedContent` is `true`).
- On manual save, a version snapshot is created automatically, and old snapshots are pruned to keep at most 20.
- If `autoUpdateSettings` (toolbar checkbox, default `true`) is enabled, a background entity extraction runs after save.
