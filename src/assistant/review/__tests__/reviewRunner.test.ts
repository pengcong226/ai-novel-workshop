import { describe, expect, it, vi } from 'vitest'

const { chatMock, addSuggestionMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  addSuggestionMock: vi.fn(),
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    chat: chatMock,
  }),
}))

vi.mock('@/stores/sandbox', () => ({
  useSandboxStore: () => ({}),
}))

vi.mock('@/stores/suggestions', () => ({
  useSuggestionsStore: () => ({
    addSuggestion: addSuggestionMock,
  }),
}))

vi.mock('../reviewPromptFactory', () => ({
  buildReviewPrompt: () => [{ role: 'user', content: 'review this chapter' }],
}))

import { runReview } from '../reviewRunner'
import type { Chapter, Project } from '@/types'

describe('reviewRunner', () => {
  it('passes agent model override to AI chat', async () => {
    chatMock.mockResolvedValueOnce({ content: '[]' })

    await runReview({
      profile: 'quality',
      project: { id: 'project-1', title: '项目' } as Project,
      chapter: { id: 'chapter-1', number: 1, title: '第一章', content: '正文' } as Chapter,
      model: 'custom-review-model',
    })

    expect(chatMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'review this chapter' }],
      expect.objectContaining({ preferredModel: 'custom-review-model' })
    )
    expect(addSuggestionMock).not.toHaveBeenCalled()
  })
})
