import { describe, expect, it } from 'vitest'
import { getDefaultProjectConfig, normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { DEFAULT_AGENT_CONFIGS } from '@/agents/types'

describe('project-config-normalizer agent config', () => {
  it('adds default agent configs', () => {
    const defaults = getDefaultProjectConfig()

    expect(defaults.agentConfigs).toEqual(DEFAULT_AGENT_CONFIGS)
  })

  it('preserves explicit disabled agents while filling missing defaults', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        { role: 'editor', enabled: false, phase: 'post-generation', priority: 5, model: 'custom-editor' },
      ],
    })

    const editor = normalized.agentConfigs?.find(config => config.role === 'editor')
    const sentinel = normalized.agentConfigs?.find(config => config.role === 'sentinel')

    expect(editor).toMatchObject({ enabled: false })
    expect(editor).not.toHaveProperty('model')
    expect(sentinel).toMatchObject({ enabled: false, phase: 'post-generation', priority: 2 })
    expect(normalized.agentConfigs).toHaveLength(DEFAULT_AGENT_CONFIGS.length)
  })

  it('keeps reader batch-only option', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        { role: 'reader', enabled: true, phase: 'post-generation', priority: 6, batchOnly: true },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'reader')).toMatchObject({
      enabled: true,
      batchOnly: true,
    })
  })

  it('allows planner as an active pre-generation agent', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        { role: 'planner', enabled: true, phase: 'pre-generation', priority: 1 },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'planner')).toMatchObject({
      enabled: true,
      phase: 'pre-generation',
      priority: 1,
    })
  })

  it('keeps inactive framework roles disabled even if persisted as enabled', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        { role: 'extractor', enabled: true, phase: 'post-generation', priority: 10 },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'extractor')).toMatchObject({
      enabled: false,
    })
  })

  it('sanitizes invalid persisted agent config values', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        {
          role: 'editor',
          enabled: 'false',
          phase: 'invalid',
          priority: Number.NaN,
          model: '   ',
          batchOnly: true,
        },
      ],
    } as unknown as Parameters<typeof normalizeProjectConfig>[0])

    const editor = normalized.agentConfigs?.find(config => config.role === 'editor')
    expect(editor).toMatchObject({
      enabled: true,
      phase: 'post-generation',
      priority: 5,
      batchOnly: undefined,
    })
    expect(editor).not.toHaveProperty('model')
  })
})
