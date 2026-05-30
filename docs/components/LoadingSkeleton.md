# LoadingSkeleton

Multi-variant skeleton loading placeholder that mimics the shape of project cards, chapter lists, editor areas, entity trees, text blocks, and compact inline elements.

**Source**: `src/components/LoadingSkeleton.vue`

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'card' \| 'list' \| 'editor' \| 'tree' \| 'text' \| 'compact'` | `'card'` | Which skeleton layout to render. |
| `count` | `number` | `3` | Number of skeleton items to display. |
| `groupItems` | `number` | `2` | Number of child items per tree group (only applies to `variant="tree"`). |
| `width` | `string` | `'100%'` | CSS width of the outer container. |

## Emits

None.

## Slots

None.

## Variants

| Variant | Visual Shape | Typical Usage |
|---------|-------------|---------------|
| `card` | Accent bar, title, tags, text lines, progress bar | Project list while loading |
| `list` | Left accent, drag handle, chapter number, title, tags, text lines, action buttons | Chapter list while loading |
| `editor` | Toolbar with icon buttons, content area with varying-width lines | Editor surface while loading |
| `tree` | Title, search bar, collapsible groups with dot-prefixed items | Entity tree / sidebar while loading |
| `text` | Lines of varying width (100%, 90%, 75%, 95%, 60%) | Inline text placeholder |
| `compact` | Short, thin lines | Small inline placeholder |

## Usage

### Card Skeleton (default)

```vue
<template>
  <LoadingSkeleton :count="4" />
</template>

<script setup lang="ts">
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
</script>
```

### Chapter List Skeleton

```vue
<template>
  <LoadingSkeleton variant="list" :count="6" />
</template>
```

### Editor Skeleton

```vue
<template>
  <LoadingSkeleton variant="editor" :count="8" />
</template>
```

### Tree Skeleton with Custom Group Size

```vue
<template>
  <LoadingSkeleton variant="tree" :count="4" :group-items="3" />
</template>
```

### Text Block with Custom Width

```vue
<template>
  <LoadingSkeleton variant="text" :count="5" width="320px" />
</template>
```

## Notes

- Line widths in the `editor` and `text` variants cycle through preset percentages to produce a natural, non-uniform appearance.
- The component uses CSS custom properties from the project's design system (`--ds-*`).
- No external dependencies beyond Vue.
