import { describe, expect, it } from 'vitest'
import { getDefaultProjectConfig, normalizeProjectConfig } from '@/utils/project-config-normalizer'

describe('project-config-normalizer', () => {
  it('normalizes legacy advanced field and keeps falsy values', () => {
    const normalized = normalizeProjectConfig({
      enableQualityCheck: false,
      enableVectorRetrieval: false,
      enableAutoReview: false,
      advanced: {
        temperature: 0,
        topP: 0,
        maxTokens: 1024,
        maxContextTokens: 0,
        recentChaptersCount: 0,
        targetWordCount: 0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stopSequences: []
      },
      vectorConfig: {
        provider: 'local',
        topK: 0,
        minScore: 0,
        vectorWeight: 0
      }
    })

    expect(normalized.enableQualityCheck).toBe(false)
    expect(normalized.enableVectorRetrieval).toBe(false)
    expect(normalized.enableAutoReview).toBe(false)
    expect(normalized.advancedSettings?.temperature).toBe(0)
    expect(normalized.advancedSettings?.topP).toBe(0)
    expect(normalized.advancedSettings?.targetWordCount).toBe(0)
    expect(normalized.vectorConfig?.topK).toBe(0)
    expect(normalized.vectorConfig?.minScore).toBe(0)
    expect(normalized.vectorConfig?.vectorWeight).toBe(0)
  })

  it('fills defaults and prefers advancedSettings over legacy advanced', () => {
    const normalized = normalizeProjectConfig({
      advanced: {
        temperature: 0.1,
        topP: 0.2,
        maxTokens: 2048,
        maxContextTokens: 4096,
        recentChaptersCount: 2,
        targetWordCount: 1200,
        frequencyPenalty: 0.1,
        presencePenalty: 0.2,
        stopSequences: ['legacy']
      },
      advancedSettings: {
        temperature: 0.6,
        topP: 0.7,
        maxTokens: 3000,
        frequencyPenalty: 0.3,
        presencePenalty: 0.4,
        stopSequences: ['new']
      }
    })

    expect(normalized.advancedSettings?.temperature).toBe(0.6)
    expect(normalized.advancedSettings?.topP).toBe(0.7)
    expect(normalized.advancedSettings?.maxTokens).toBe(3000)
    expect(normalized.advancedSettings?.maxContextTokens).toBeDefined()
    expect(normalized.advancedSettings?.recentChaptersCount).toBeDefined()
    expect(normalized.advancedSettings?.targetWordCount).toBeDefined()
    expect(normalized.advancedSettings?.stopSequences).toEqual(['new'])
  })

  it('returns complete defaults from helper without enabling optional style', () => {
    const defaults = getDefaultProjectConfig()

    expect(defaults.systemPrompts).toBeDefined()
    expect(defaults.vectorConfig?.topK).toBeDefined()
    expect(defaults.vectorConfig?.minScore).toBeDefined()
    expect(defaults.vectorConfig?.vectorWeight).toBeDefined()
    expect(defaults.enableAutoReview).toBe(false)
    expect(defaults.styleProfile).toBeUndefined()
    expect(defaults.advancedSettings?.maxContextTokens).toBeDefined()
    expect(defaults.advancedSettings?.targetWordCount).toBeDefined()
  })

  it('preserves partial style profile values while filling defaults', () => {
    const normalized = normalizeProjectConfig({
      styleProfile: {
        name: '自定义风格',
        avoidList: ['避免口水话']
      } as unknown as NonNullable<Parameters<typeof normalizeProjectConfig>[0]>['styleProfile']
    })

    expect(normalized.styleProfile?.name).toBe('自定义风格')
    expect(normalized.styleProfile?.avoidList).toEqual(['避免口水话'])
    expect(normalized.styleProfile?.tone).toBeTruthy()
    expect(normalized.styleProfile?.examplePhrases.length).toBeGreaterThan(0)
  })
})
