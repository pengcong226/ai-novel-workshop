import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getE2EProviderConfig } from '../e2eProviderConfig.js'

const ORIGINAL_E2E_API_KEY = process.env.E2E_API_KEY

describe('getE2EProviderConfig', () => {
  beforeEach(() => {
    delete process.env.E2E_API_KEY
  })

  afterEach(() => {
    if (ORIGINAL_E2E_API_KEY === undefined) {
      delete process.env.E2E_API_KEY
      return
    }

    process.env.E2E_API_KEY = ORIGINAL_E2E_API_KEY
  })

  it('throws when E2E_API_KEY is missing', () => {
    expect(() => getE2EProviderConfig()).toThrow(/E2E_API_KEY/)
  })

  it('returns provider with env apiKey and expected baseUrl', () => {
    process.env.E2E_API_KEY = 'test-e2e-key'

    const provider = getE2EProviderConfig()

    expect(provider.apiKey).toBe('test-e2e-key')
    expect(provider.baseUrl).toBe('https://maas-api.ai-yuanjing.com/openapi/compatible-mode/v1')
  })
})
