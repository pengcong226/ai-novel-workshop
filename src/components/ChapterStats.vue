<template>
  <div class="chapter-stats">
    <span class="stat">{{ chapter.wordCount }}字</span>
    <span class="stat">{{ formatDate(chapter.generationTime) }}</span>
  </div>
</template>

<script setup lang="ts">
import type { Chapter } from '@/types'
import { formatDate } from '@/utils/formatters'

defineProps<{
  chapter: Chapter
}>()
</script>

<style scoped>
.chapter-stats {
  display: flex;
  gap: var(--ds-space-4);
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  flex-shrink: 0;
}

/* breakpoint: md (768px) */
@media (max-width: 768px) {
  .chapter-stats {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
