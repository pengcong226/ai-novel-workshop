/**
 * Anthropic Provider 内置插件
 *
 * 提供Claude系列模型支持
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
 * Anthropic Provider实现
 */
class AnthropicProvider implements ProviderInstance {
  private config: ProviderConfig
  private models: ModelConfig[] = []

  constructor(config: ProviderConfig) {
    this.config = config

    // 初始化支持的模型列表
    this.models = [
      {
        id: 'claude-3-opus',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        tier: 'planning',
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000075,
        maxTokens: 200000,
        rpmLimit: 100,
        enabled: true
      },
      {
        id: 'claude-3-sonnet',
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        tier: 'writing',
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
        maxTokens: 200000,
        rpmLimit: 100,
        enabled: true
      },
      {
        id: 'claude-3-haiku',
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        tier: 'checking',
        costPerInputToken: 0.00000025,
        costPerOutputToken: 0.00000125,
        maxTokens: 200000,
        rpmLimit: 100,
        enabled: true
      }
    ]
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now()

    try {
      // 转换消息格式为Anthropic格式
      const systemMessage = request.messages.find(m => m.role === 'system')
      const otherMessages = request.messages.filter(m => m.role !== 'system')

      // 调用Anthropic API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey || '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: request.model || this.config.model,
          max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
          system: systemMessage?.content,
          messages: otherMessages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Anthropic API error: ${response.status} ${error}`)
      }

      const data = await response.json()

      const usage = {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      }

      const cost = this.estimateCost(request)

      return {
        content: data.content[0].text,
        model: data.model,
        usage,
        cost,
        latency: Date.now() - startTime,
        finishReason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason
      }
    } catch (error) {
      console.error('Anthropic chat error:', error)
      throw error
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const systemMessage = request.messages.find(m => m.role === 'system')
    const otherMessages = request.messages.filter(m => m.role !== 'system')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model || this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages: otherMessages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Anthropic API error: ${response.status} ${error}`)
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

          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'content_block_delta') {
              const content = parsed.delta?.text
              if (content) {
                yield content
              }
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
    if (!this.config.apiKey) {
      return false
    }

    try {
      // 发送测试请求验证API密钥
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }]
        })
      })

      return response.ok || response.status === 400 // 400表示API密钥有效但请求格式错误
    } catch (error) {
      console.error('Anthropic config validation error:', error)
      return false
    }
  }

  async getModels(): Promise<ModelConfig[]> {
    return this.models
  }

  estimateCost(request: ChatRequest): CostBreakdown {
    const model = request.model || this.config.model
    const modelConfig = this.models.find(m => m.model === model)

    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`)
    }

    // 估算token数
    const inputTokens = request.messages.reduce((sum, msg) =>
      sum + Math.ceil(msg.content.length / 4), 0
    )
    const outputTokens = request.maxTokens || 1000

    const inputCostUSD = inputTokens * modelConfig.costPerInputToken / 1000
    const outputCostUSD = outputTokens * modelConfig.costPerOutputToken / 1000
    const totalUSD = inputCostUSD + outputCostUSD

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * 7.2,
      model
    }
  }
}

/**
 * Anthropic Provider插件贡献
 */
export const anthropicProviderContribution: AIProviderContribution = {
  id: 'anthropic-provider',
  name: 'Anthropic Claude',
  type: 'ai-provider',

  config: {
    providerType: 'anthropic',
    defaultBaseURL: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        type: 'planning',
        maxTokens: 200000,
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000075,
        isEnabled: true
      },
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        type: 'writing',
        maxTokens: 200000,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
        isEnabled: true
      },
      {
        id: 'claude-3-haiku',
        name: 'Claude 3 Haiku',
        type: 'checking',
        maxTokens: 200000,
        costPerInputToken: 0.00000025,
        costPerOutputToken: 0.00000125,
        isEnabled: true
      }
    ]
  },

  createProvider(config: ProviderConfig): ProviderInstance {
    return new AnthropicProvider(config)
  }
}

/**
 * 插件清单
 */
export const manifest = {
  id: 'anthropic-provider',
  name: 'Anthropic Provider',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: 'Anthropic Claude系列模型支持',
  permissions: ['ai-api', 'network'],
  contributes: {
    aiProviders: [anthropicProviderContribution]
  }
}
