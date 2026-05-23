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
      providers: [
        {
          id: 'provider-1',
          name: 'Provider',
          type: 'openai',
          baseUrl: 'https://api.example.test/v1',
          apiKey: 'test-key',
          isEnabled: true,
          models: [
            {
              id: 'custom-editor',
              name: 'Custom Editor',
              type: 'checking',
              maxTokens: 4096,
              costPerInputToken: 0,
              costPerOutputToken: 0,
              isEnabled: true,
            },
          ],
        },
      ],
      agentConfigs: [
        { role: 'editor', enabled: false, phase: 'post-generation', priority: 5, model: 'custom-editor' },
      ],
    })

    const editor = normalized.agentConfigs?.find(config => config.role === 'editor')
    const sentinel = normalized.agentConfigs?.find(config => config.role === 'sentinel')

    expect(editor).toMatchObject({ enabled: false, model: 'custom-editor' })
    expect(sentinel).toMatchObject({ enabled: false, phase: 'post-generation', priority: 2 })
    expect(normalized.agentConfigs).toHaveLength(DEFAULT_AGENT_CONFIGS.length)
  })

  it('drops unknown persisted agent model overrides', () => {
    const normalized = normalizeProjectConfig({
      providers: [
        {
          id: 'provider-1',
          name: 'Provider',
          type: 'openai',
          baseUrl: 'https://api.example.test/v1',
          apiKey: 'test-key',
          isEnabled: true,
          models: [
            {
              id: 'known-model',
              name: 'Known Model',
              type: 'checking',
              maxTokens: 4096,
              costPerInputToken: 0,
              costPerOutputToken: 0,
              isEnabled: true,
            },
          ],
        },
      ],
      agentConfigs: [
        { role: 'editor', enabled: true, phase: 'post-generation', priority: 5, model: 'unknown-model' },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'editor')).not.toHaveProperty('model')
  })

  it('drops disabled provider model overrides', () => {
    const normalized = normalizeProjectConfig({
      providers: [
        {
          id: 'provider-1',
          name: 'Provider',
          type: 'openai',
          baseUrl: 'https://api.example.test/v1',
          apiKey: 'test-key',
          isEnabled: false,
          models: [
            {
              id: 'disabled-provider-model',
              name: 'Disabled Provider Model',
              type: 'checking',
              maxTokens: 4096,
              costPerInputToken: 0,
              costPerOutputToken: 0,
              isEnabled: true,
            },
          ],
        },
      ],
      agentConfigs: [
        { role: 'editor', enabled: true, phase: 'post-generation', priority: 5, model: 'disabled-provider-model' },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'editor')).not.toHaveProperty('model')
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

  it('allows sentinel and extractor as active post-generation agents', () => {
    const normalized = normalizeProjectConfig({
      agentConfigs: [
        { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 2 },
        { role: 'extractor', enabled: true, phase: 'post-generation', priority: 10 },
      ],
    })

    expect(normalized.agentConfigs?.find(config => config.role === 'sentinel')).toMatchObject({
      enabled: true,
      phase: 'post-generation',
      priority: 2,
    })
    expect(normalized.agentConfigs?.find(config => config.role === 'extractor')).toMatchObject({
      enabled: true,
      phase: 'post-generation',
      priority: 10,
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
