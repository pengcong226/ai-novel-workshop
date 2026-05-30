<template>
  <GlassContextPanel
    v-if="!showReviewPanel"
    v-model:activeTab="activeTabModel"
    v-model:chapterForm="chapterFormModel"
    :characters="characters"
    :worldbook="worldbook"
  />

  <ReviewSidePanel
    v-else
    :visible="showReviewPanel"
    :project-id="projectId"
    :chapter-id="chapterFormModel.id"
    :chapter-number="chapterFormModel.number"
    @navigate-to="(idx: number) => $emit('navigateTo', idx)"
    @apply-fix="(payload) => $emit('applyFix', payload)"
    @dismiss="(id: string) => $emit('dismiss', id)"
  />
</template>

<script setup lang="ts">
import { useModel } from 'vue'
import type { Chapter } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'
import GlassContextPanel from './GlassContextPanel.vue'
import ReviewSidePanel from './editor/ReviewSidePanel.vue'

const props = defineProps<{
  activeTab: string
  chapterForm: Chapter
  characters: ResolvedEntity[]
  worldbook: ResolvedEntity[]
  showReviewPanel: boolean
  projectId?: string
}>()

const activeTabModel = useModel(props, 'activeTab')
const chapterFormModel = useModel(props, 'chapterForm')

defineEmits<{
  'navigateTo': [paragraphIndex: number]
  'applyFix': [payload: { suggestionId: string; paragraphIndex?: number; originalSnippet: string; fixContent: string }]
  'dismiss': [suggestionId: string]
}>()
</script>
