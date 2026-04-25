import type { Chapter, Project } from '@/types'
import type { ChatMessage } from '@/types/ai'
import type { ReviewProfile } from './reviewProfiles'
import type { ParsedReviewSuggestion } from './reviewParser'
import { buildReviewPrompt } from './reviewPromptFactory'
import { parseReviewResponse } from './reviewParser'
import { splitReviewParagraphs } from './reviewParagraphs'
import { useSandboxStore } from '@/stores/sandbox'
import { useSuggestionsStore } from '@/stores/suggestions'

export interface RunReviewOptions {
  profile: ReviewProfile
  project: Project | null
  chapter: Pick<Chapter, 'id' | 'number' | 'title' | 'content'> | null
}

export interface RunReviewResult {
  suggestionsAdded: number
  rawContent: string
  suggestions: ParsedReviewSuggestion[]
}

export async function runReview(options: RunReviewOptions): Promise<RunReviewResult> {
  const { useAIStore } = await import('@/stores/ai')
  const aiStore = useAIStore()

  const promptContext = {
    project: options.project,
    chapter: options.chapter,
  }
  const apiMessages = buildReviewPrompt(options.profile, promptContext, useSandboxStore()) as ChatMessage[]
  const response = await aiStore.chat(apiMessages, { type: 'check', complexity: 'high', priority: 'balanced' })
  const rawContent = response.content
  const paragraphs = splitReviewParagraphs(options.chapter?.content ?? '')
  const suggestions = parseReviewResponse(rawContent, { paragraphs })
  const suggestionsStore = useSuggestionsStore()
  let suggestionsAdded = 0

  for (const suggestion of suggestions) {
    const added = suggestionsStore.addSuggestion({
      type: 'improvement',
      category: suggestion.category,
      priority: suggestion.priority,
      title: `[${options.profile}] ${suggestion.title}`,
      message: suggestion.message,
      location: {
        projectId: options.project?.id,
        chapter: options.chapter?.number,
        chapterId: options.chapter?.id,
        paragraphIndex: suggestion.paragraphIndex,
        textSnippet: suggestion.textSnippet,
        suggestedFix: suggestion.suggestedFix,
      },
      actions: suggestion.actions,
    })

    if (added) suggestionsAdded++
  }

  return { suggestionsAdded, rawContent, suggestions }
}
