import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { chatMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
}))

vi.mock('@/services/ai-service', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    chat: chatMock,
  })),
}))

vi.mock('@/utils/devFlags', () => ({
  getAIMockEnabled: () => false,
}))

vi.mock('@/plugins/manager', () => ({
  pluginManager: {
    getRegistries: () => ({
      aiProvider: { getAll: () => [] },
    }),
  },
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { useAIStore } from '@/stores/ai'
import { useProjectStore } from '@/stores/project'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'

describe('ai store routing context', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    chatMock.mockReset()
    chatMock.mockResolvedValue({ content: '', model: 'custom-review-model' })
  })

  it('preserves caller preferredModel over project defaults', async () => {
    const projectStore = useProjectStore()
    projectStore.currentProject = {
      id: 'project-1',
      title: '项目',
      config: normalizeProjectConfig({
        sentinelModel: 'default-sentinel-model',
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
                id: 'default-sentinel-model',
                name: 'Default Sentinel',
                type: 'checking',
                maxTokens: 4096,
                costPerInputToken: 0,
                costPerOutputToken: 0,
                isEnabled: true,
              },
              {
                id: 'custom-review-model',
                name: 'Custom Review',
                type: 'checking',
                maxTokens: 4096,
                costPerInputToken: 0,
                costPerOutputToken: 0,
                isEnabled: true,
              },
            ],
          },
        ],
      }),
    } as typeof projectStore.currentProject

    const aiStore = useAIStore()
    await aiStore.chat(
      [{ role: 'user', content: 'review' }],
      { type: 'check', complexity: 'high', priority: 'balanced', preferredModel: 'custom-review-model' }
    )

    expect(chatMock).toHaveBeenCalledWith(
      [{ role: 'user', content: 'review' }],
      expect.objectContaining({ preferredModel: 'custom-review-model' }),
      undefined
    )
  })
})
