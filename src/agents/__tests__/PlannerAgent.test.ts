import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChapterOutline } from '@/types'

const { chatMock, checkInitializedMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  checkInitializedMock: vi.fn(),
}))

vi.mock('@/stores/ai', () => ({
  useAIStore: () => ({
    chat: chatMock,
    checkInitialized: checkInitializedMock,
  }),
}))

import { PlannerAgent, normalizePlannerRefinement } from '../PlannerAgent'

const baseOutline: ChapterOutline = {
  chapterId: 'outline-1',
  title: '旧标题',
  scenes: [{ id: 'scene-1', description: '旧场景', characters: [], location: '', order: 0 }],
  characters: ['主角'],
  location: '旧地点',
  goals: ['旧目标'],
  conflicts: ['旧冲突'],
  resolutions: [],
  status: 'outdated'
}

describe('PlannerAgent refinement normalization', () => {
  beforeEach(() => {
    chatMock.mockReset()
    checkInitializedMock.mockReset()
    checkInitializedMock.mockReturnValue(true)
  })

  it('accepts only safe bounded outline fields from AI output', () => {
    const result = normalizePlannerRefinement(
      JSON.stringify({
        title: '新标题',
        scenes: [
          { description: '新场景', characters: ['主角', 123], location: '新地点', order: 'bad' }
        ],
        characters: ['主角', '配角', 99],
        location: '新地点',
        goals: ['新目标'],
        conflicts: ['新冲突'],
        resolutions: ['解决方式'],
        status: 'completed',
        actions: [{ type: 'execute' }]
      }),
      baseOutline,
      1000
    )

    expect(result).toMatchObject({
      title: '新标题',
      location: '新地点',
      characters: ['主角', '配角'],
      goals: ['新目标'],
      conflicts: ['新冲突'],
      resolutions: ['解决方式'],
      status: 'planned',
      aiRefinedAt: 1000
    })
    expect(result?.scenes?.[0]).toMatchObject({
      description: '新场景',
      characters: ['主角'],
      location: '新地点',
      order: 0
    })
    expect(result).not.toHaveProperty('actions')
  })

  it('returns null when AI output contains no usable refinement fields', () => {
    expect(normalizePlannerRefinement('{"actions":[]}', baseOutline)).toBeNull()
  })

  it('passes planner model override as routing preference', async () => {
    chatMock.mockResolvedValueOnce({ content: '{"title":"新标题"}' })

    await new PlannerAgent().execute(
      { phase: 'pre-generation', outline: baseOutline },
      { role: 'planner', enabled: true, phase: 'pre-generation', priority: 1, model: 'custom-planner-model' }
    )

    expect(chatMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ preferredModel: 'custom-planner-model' }),
      { maxTokens: 1800 }
    )
  })
})
