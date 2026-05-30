# Component Documentation

Component API reference for AI Fanfic Workshop (Vue 3 + Element Plus + TypeScript).

## Component Index

| Component | Path | Description |
|-----------|------|-------------|
| [ChapterEditorDialog](./ChapterEditorDialog.md) | `src/components/ChapterEditorDialog.vue` | Fullscreen immersive chapter editor with AI generation, review, quality checks, and version history |
| [Chapters](./Chapters.md) | `src/components/Chapters.vue` | Chapter management page with list, filtering, drag-reorder, batch generation, and export |
| [LoadingSkeleton](./LoadingSkeleton.md) | `src/components/LoadingSkeleton.vue` | Multi-variant skeleton loader for cards, lists, editors, trees, and text blocks |
| [SearchDialog](./SearchDialog.md) | `src/components/SearchDialog.vue` | Command-palette-style global search dialog with keyboard navigation and recent history |
| [NotificationContainer](./NotificationContainer.md) | `src/components/NotificationContainer.vue` | Fixed-position toast notification container with position variants and transitions |
| [ErrorBoundary](./ErrorBoundary.md) | `src/components/ErrorBoundary.vue` | Vue error boundary with retry, detail expansion, and child error reporting via `provide` |

## Conventions

- All UI text is Chinese-first per project convention.
- Components use Element Plus (`el-*`) as the design system base.
- Props are defined with `defineProps` using TypeScript interfaces.
- Emits are defined with `defineEmits` using typed tuples.
- Store interactions use Pinia composables (`use*Store`).
- Async components are loaded via `defineAsyncComponent` where noted.
