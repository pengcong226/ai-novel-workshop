/**
 * OpenAI Provider 内置插件
 *
 * 提供OpenAI GPT系列模型支持
 */

import { getLogger } from '@/utils/logger'

import type {
  AIProviderContribution,
  ProviderConfig,
  ProviderInstance,
  ChatRequest,
  ChatResponse,
  CostEstimate
} from '../types'

const logger = getLogger('plugins:builtin:openai-provider')

type ModelConfig = any
type CostBreakdown = CostEstimate

/**
 * OpenAI Provider实现
 */
class OpenAIProvider implements ProviderInstance {
  private config: ProviderConfig
  private models: ModelConfig[] = []

  constructor(config: ProviderConfig) {
    this.config = config

    // 初始化支持的模型列表
    this.models = [
      {
        id: 'gpt-4-turbo',
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        tier: 'planning',
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
        maxTokens: 128000,
        rpmLimit: 500,
        enabled: true
      },
      {
        id: 'gpt-4',
        provider: 'openai',
        model: 'gpt-4',
        tier: 'planning',
        costPerInputToken: 0.00003,
        costPerOutputToken: 0.00006,
        maxTokens: 8192,
        rpmLimit: 500,
        enabled: true
      },
      {
        id: 'gpt-3.5-turbo',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tier: 'writing',
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015,
        maxTokens: 16385,
        rpmLimit: 3500,
        enabled: true
      }
    ]
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now()

    try {
      // 调用OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
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
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      const usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      }

      const cost = this.estimateCost(request)

      return {
        content: data.choices[0].message.content,
        model: data.model,
        usage,
        cost,
        latency: Date.now() - startTime,
        finishReason: data.choices[0].finish_reason
      }
    } catch (error) {
      logger.error('OpenAI chat error:', error)
      throw error
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
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
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
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
    if (!this.config.apiKey) {
      return false
    }

    try {
      // 发送测试请求验证API密钥
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      })

      return response.ok
    } catch (error) {
      logger.error('OpenAI config validation error:', error)
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

    // 估算token数（简单估算：每4个字符约1个token）
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
 * OpenAI Provider插件贡献
 */
export const openAIProviderContribution: AIProviderContribution = {
  id: 'openai-provider',
  name: 'OpenAI',
  type: 'ai-provider',

  config: {
    providerType: 'openai',
    defaultBaseURL: 'https://api.openai.com/v1',
    requiresApiKey: true,
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        type: 'planning',
        maxTokens: 128000,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
        isEnabled: true
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        type: 'planning',
        maxTokens: 8192,
        costPerInputToken: 0.00003,
        costPerOutputToken: 0.00006,
        isEnabled: true
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        type: 'writing',
        maxTokens: 16385,
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015,
        isEnabled: true
      }
    ]
  },

  createProvider(config: ProviderConfig): ProviderInstance {
    return new OpenAIProvider(config)
  }
}

/**
 * 插件清单
 */
export const manifest = {
  id: 'openai-provider',
  name: 'OpenAI Provider',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: 'OpenAI GPT系列模型支持',
  permissions: ['ai-api', 'network'],
  contributes: {
    aiProviders: [openAIProviderContribution]
  }
}
