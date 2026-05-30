<template>
  <GlassContextPanel
    v-if="!showReviewPanel"
    v-model:activeTab="activeTab"
    v-model:chapterForm="chapterForm"
    :characters="characters"
    :worldbook="worldbook"
  />

  <ReviewSidePanel
    v-else
    :visible="showReviewPanel"
    :project-id="projectId"
    :chapter-id="chapterForm.id"
    :chapter-number="chapterForm.number"
    @navigate-to="(idx: number) => $emit('navigateTo', idx)"
    @apply-fix="(payload) => $emit('applyFix', payload)"
    @dismiss="(id: string) => $emit('dismiss', id)"
  />
</template>

<script setup lang="ts">
import type { Chapter } from '@/types'
import type { ResolvedEntity } from '@/types/sandbox'
import GlassContextPanel from './GlassContextPanel.vue'
import ReviewSidePanel from './editor/ReviewSidePanel.vue'

defineProps<{
  activeTab: string
  chapterForm: Chapter
  characters: ResolvedEntity[]
  worldbook: ResolvedEntity[]
  showReviewPanel: boolean
  projectId?: string
}>()

defineEmits<{
  'update:activeTab': [value: string]
  'update:chapterForm': [value: Chapter]
  'navigateTo': [paragraphIndex: number]
  'applyFix': [payload: { suggestionId: string; paragraphIndex?: number; originalSnippet: string; fixContent: string }]
  'dismiss': [suggestionId: string]
}>()
</script>
