# SearchDialog

Command-palette-style global search dialog with full keyboard navigation, recent search history, entity-type grouping, and match highlighting.

**Source**: `src/components/SearchDialog.vue`

## Props

This component does not accept external props. Visibility and search state are managed internally by the `useGlobalSearch` composable.

## Emits

None.

## Slots

None.

## Exposed Methods

| Method | Description |
|--------|-------------|
| `open()` | Programmatically open the search dialog. Typically called from a parent via template ref. |

## Search Behavior

- Uses the `useGlobalSearch` composable which indexes chapters, characters, lore, locations, factions, and outlines.
- Results are grouped by entity type and sorted in this order: chapter, character, lore, location, faction, outline.
- Each result group shows an entity-type label (via `SEARCH_ENTITY_TYPE_LABELS`) and a colored tag (via `SEARCH_ENTITY_TYPE_TAG`).
- Matching text is highlighted with `<mark>` tags.

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Arrow Down` | Move selection down (wraps around). |
| `Arrow Up` | Move selection up (wraps around). |
| `Enter` | Activate the selected item. If the query is empty, applies the selected recent search term. |
| `Escape` | Close the dialog. |

## Recent Searches

- Shown when the query input is empty and there are saved recent searches.
- Each recent item has a delete button (appears on hover) and a "clear all" button in the section header.
- Selecting a recent search term fills it into the query input.

## Usage

```vue
<template>
  <SearchDialog ref="searchDialog" />
  <el-button @click="searchDialog?.open()">Search</el-button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SearchDialog from '@/components/SearchDialog.vue'

const searchDialog = ref<InstanceType<typeof SearchDialog> | null>(null)
</script>
```

## Notes

- The dialog renders as an `el-dialog` with `width="560px"` and a hidden header for a command-palette feel.
- The `el-dialog__body` padding is overridden to `0` and max-height is set to `480px` with scroll.
- Auto-focuses the input field when the dialog opens.
- The selection index resets to 0 when the query changes.
