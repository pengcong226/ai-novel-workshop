/**
 * 智谱GLM Provider 示例插件
 *
 * 提供智谱GLM系列模型支持（国产大模型）
 */

import type {
  AIProviderContribution,
  ProviderConfig,
  ProviderInstance,
  ChatRequest,
  ChatResponse,
  ModelConfig
} from '@/types'
import type { CostBreakdown } from '@/types/ai'

/**
 * 智谱GLM Provider实现
 */
class ZhipuGLMProvider implements ProviderInstance {
  private config: ProviderConfig
  private models: ModelConfig[] = []

  constructor(config: ProviderConfig) {
    this.config = config

    // 初始化支持的模型列表
    this.models = [
      {
        id: 'glm-4',
        provider: 'custom',
        model: 'glm-4',
        tier: 'planning',
        costPerInputToken: 0.0001,
        costPerOutputToken: 0.0001,
        maxTokens: 128000,
        rpmLimit: 100,
        enabled: true
      },
      {
        id: 'glm-4-air',
        provider: 'custom',
        model: 'glm-4-air',
        tier: 'writing',
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00001,
        maxTokens: 8192,
        rpmLimit: 300,
        enabled: true
      },
      {
        id: 'glm-4-flash',
        provider: 'custom',
        model: 'glm-4-flash',
        tier: 'checking',
        costPerInputToken: 0.000001,
        costPerOutputToken: 0.000001,
        maxTokens: 4096,
        rpmLimit: 500,
        enabled: true
      }
    ]
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now()

    try {
      // 智谱API格式（OpenAI兼容）
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
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
          top_p: 0.9
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(`智谱GLM API错误: ${error.error?.message || response.statusText}`)
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
        finishReason: data.choices[0].finish_reason === 'stop' ? 'stop' : 'length'
      }
    } catch (error) {
      console.error('智谱GLM chat error:', error)
      throw error
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
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
        stream: true
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`智谱GLM API错误: ${error.error?.message || response.statusText}`)
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
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 10
        })
      })

      return response.ok
    } catch (error) {
      console.error('智谱GLM config validation error:', error)
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
 * 智谱GLM Provider插件贡献
 */
export const zhipuGLMProviderContribution: AIProviderContribution = {
  id: 'zhipu-glm-provider',
  name: '智谱GLM',
  type: 'ai-provider',

  config: {
    providerType: 'zhipu-glm',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    requiresApiKey: true,
    supportsStreaming: true,
    supportedModels: [
      {
        id: 'glm-4',
        name: 'GLM-4',
        type: 'planning',
        maxTokens: 128000,
        costPerInputToken: 0.0001,
        costPerOutputToken: 0.0001,
        isEnabled: true
      },
      {
        id: 'glm-4-air',
        name: 'GLM-4-Air',
        type: 'writing',
        maxTokens: 8192,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00001,
        isEnabled: true
      },
      {
        id: 'glm-4-flash',
        name: 'GLM-4-Flash',
        type: 'checking',
        maxTokens: 4096,
        costPerInputToken: 0.000001,
        costPerOutputToken: 0.000001,
        isEnabled: true
      }
    ]
  },

  createProvider(config: ProviderConfig): ProviderInstance {
    return new ZhipuGLMProvider(config)
  }
}

/**
 * 插件清单
 */
export const manifest = {
  id: 'zhipu-glm-provider',
  name: '智谱GLM Provider',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: '智谱GLM系列模型支持（国产大模型）',
  icon: '🤖',
  homepage: 'https://open.bigmodel.cn/',
  permissions: ['ai-api', 'network'],
  contributes: {
    aiProviders: [zhipuGLMProviderContribution]
  },
  configuration: {
    apiKey: {
      type: 'string',
      description: '智谱GLM API密钥',
      required: true
    },
    model: {
      type: 'string',
      default: 'glm-4-flash',
      description: '默认模型'
    }
  }
}

/**
 * 插件激活钩子
 */
export async function activate(context: any) {
  console.log('智谱GLM Provider插件已激活')

  // 注册Provider
  context.register.aiProvider(zhipuGLMProviderContribution)

  // 显示激活消息
  context.ui.showMessage('智谱GLM Provider已启用', 'success')
}

/**
 * 插件停用钩子
 */
export async function deactivate() {
  console.log('智谱GLM Provider插件已停用')
}

/**
 * 插件卸载钩子
 */
export async function uninstall() {
  console.log('智谱GLM Provider插件已卸载')
}
