import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getE2EProviderConfig } from '../e2eProviderConfig'

describe('getE2EProviderConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('throws when E2E_API_KEY is missing', () => {
    vi.stubEnv('E2E_API_KEY', '')
    expect(() => getE2EProviderConfig()).toThrow('E2E_API_KEY')
  })

  it('returns provider config from env', () => {
    vi.stubEnv('E2E_API_KEY', 'sk-test-123')
    const config = getE2EProviderConfig()
    expect(config.apiKey).toBe('sk-test-123')
    expect(config.baseUrl).toContain('maas-api.ai-yuanjing.com')
  })
})
