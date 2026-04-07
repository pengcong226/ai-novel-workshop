/**
 * Local Provider 内置插件
 *
 * 提供本地模型支持(通过兼容OpenAI API的本地服务)
 */

import type {
  AIProviderContribution,
  ProviderConfig,
  ProviderInstance,
  ChatRequest,
  ChatResponse,
  CostEstimate
} from '../types'

type ModelConfig = any
type CostBreakdown = CostEstimate

/**
 * Local Provider实现
 */
class LocalProvider implements ProviderInstance {
  private config: ProviderConfig
  private models: ModelConfig[] = []

  constructor(config: ProviderConfig) {
    this.config = config

    // 本地模型通常是免费的
    this.models = [
      {
        id: 'local-default',
        provider: 'local',
        model: config.model || 'local-model',
        tier: 'writing',
        costPerInputToken: 0,
        costPerOutputToken: 0,
        maxTokens: config.maxTokens || 4096,
        rpmLimit: 1000,
        enabled: true
      }
    ]
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now()

    try {
      const baseURL = this.config.baseURL || 'http://localhost:8000/v1'

      // 调用本地API(兼容OpenAI格式)
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          model: request.model || this.config.model,
          messages: request.messages,
          temperature: request.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? this.config.maxTokens,
          stop: request.stopSequences
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Local API error: ${response.status} ${error}`)
      }

      const data = await response.json()

      const usage = {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }

      const cost = this.estimateCost(request)

      return {
        content: data.choices[0].message.content,
        model: data.model,
        usage,
        cost,
        latency: Date.now() - startTime,
        finishReason: data.choices[0].finish_reason || 'stop'
      }
    } catch (error) {
      console.error('Local provider chat error:', error)
      throw error
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const baseURL = this.config.baseURL || 'http://localhost:8000/v1'

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        messages: request.messages,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        stop: request.stopSequences,
        stream: true
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Local API error: ${response.status} ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Failed to get response reader')
    }

    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'))

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, '').trim()
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const baseURL = this.config.baseURL || 'http://localhost:8000/v1'

      // 尝试连接本地服务
      const response = await fetch(`${baseURL}/models`, {
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        }
      })

      return response.ok
    } catch (error) {
      console.error('Local provider config validation error:', error)
      return false
    }
  }

  async getModels(): Promise<ModelConfig[]> {
    try {
      const baseURL = this.config.baseURL || 'http://localhost:8000/v1'

      const response = await fetch(`${baseURL}/models`, {
        headers: {
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        }
      })

      if (response.ok) {
        const data = await response.json()

        // 如果本地服务返回模型列表,使用它
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((model: any) => ({
            id: model.id,
            provider: 'local',
            model: model.id,
            tier: 'writing',
            costPerInputToken: 0,
            costPerOutputToken: 0,
            maxTokens: this.config.maxTokens || 4096,
            rpmLimit: 1000,
            enabled: true
          }))
        }
      }
    } catch (error) {
      console.warn('Failed to fetch local models:', error)
    }

    // 返回默认模型
    return this.models
  }

  estimateCost(request: ChatRequest): CostBreakdown {
    const model = request.model || this.config.model || 'local-model'

    // 本地模型通常是免费的
    const inputTokens = request.messages.reduce((sum, msg) =>
      sum + Math.ceil(msg.content.length / 4), 0
    )
    const outputTokens = request.maxTokens || 1000

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUSD: 0,
      outputCostUSD: 0,
      totalUSD: 0,
      totalCNY: 0,
      model
    }
  }
}

/**
 * Local Provider插件贡献
 */
export const localProviderContribution: AIProviderContribution = {
  id: 'local-provider',
  name: 'Local Model',
  type: 'ai-provider',

  config: {
    providerType: 'local',
    defaultBaseURL: 'http://localhost:8000/v1',
    requiresApiKey: false,
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'local-default',
        name: 'Local Model',
        type: 'writing',
        maxTokens: 4096,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        isEnabled: true
      }
    ]
  },

  createProvider(config: ProviderConfig): ProviderInstance {
    return new LocalProvider(config)
  }
}

/**
 * 插件清单
 */
export const manifest = {
  id: 'local-provider',
  name: 'Local Provider',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: '本地模型支持(兼容OpenAI API)',
  permissions: ['ai-api', 'network'],
  contributes: {
    aiProviders: [localProviderContribution]
  }
}
