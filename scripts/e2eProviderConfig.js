export function getE2EProviderConfig() {
  const apiKey = (process.env.E2E_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('E2E_API_KEY is required for E2E scripts')
  }

  return {
    id: 'test-provider',
    name: 'YuanJing',
    type: 'custom',
    baseUrl: 'https://maas-api.ai-yuanjing.com/openapi/compatible-mode/v1',
    apiKey,
    isEnabled: true,
    models: [{ id: 'glm-5', name: 'glm-5', isEnabled: true }]
  }
}
