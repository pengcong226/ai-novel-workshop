/**
 * LLM API调用封装
 * 基于统一 AIService 主链路（限流/预算/重试）
 */

import type { LLMProviderConfig } from './types'
import { countTokens, estimateCost } from './tokenizer'
import { validateLLMOutput } from './jsonValidator'
import { redactSensitiveText } from '@/utils/crypto'
import type { AnySchema } from 'ajv'
import { AIService } from '@/services/ai-service'
import type { AIProvider, AIServiceConfig, ChatMessage, TaskContext } from '@/types/ai'

export interface LLMCallOptions {
  maxRetries?: number
  temperature?: number
  maxTokens?: number
  timeout?: number  // 毫秒
}

export interface LLMCallResult {
  content: string
  tokenUsage: {
    input: number
    output: number
  }
  cost: number
}

const aiServiceCache = new Map<string, AIService>()

function getPreferredModelId(provider: LLMProviderConfig['provider']): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-3.5-sonnet'
    case 'openai':
      return 'gpt-4-turbo'
    case 'local':
      // 走 OpenAI 兼容链路时仍使用 openai tier 的模型槽位
      return 'gpt-3.5-turbo'
    case 'custom':
    default:
      return 'gpt-4-turbo'
  }
}

function getProviderForCost(config: LLMProviderConfig): AIProvider {
  if (config.provider === 'custom') return 'custom'
  if (config.provider === 'local') return 'local'
  return config.provider
}

function buildAIServiceConfig(
  config: LLMProviderConfig,
  maxRetries: number
): AIServiceConfig {
  // 说明：为了统一进入 AIService 的限流和预算管控，
  // custom/local 统一走 OpenAI 兼容接口。
  const serviceConfig: AIServiceConfig = {
    providers: {},
    budget: {
      chapterLimitUSD: 0,
      dailyLimitUSD: 0,
      monthlyLimitUSD: 0,
      alertThreshold: 0
    },
    retry: {
      maxAttempts: maxRetries,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterRatio: 0.25
    },
    rateLimit: {
      default: {
        requestsPerMinute: 60,
        tokensPerMinute: 100000,
        concurrentRequests: 2,
        queueTimeoutMs: 30000
      }
    },
    router: {
      preferredModels: {
        worldbuilding: getPreferredModelId(config.provider),
        character: getPreferredModelId(config.provider),
        outline: getPreferredModelId(config.provider),
        chapter: getPreferredModelId(config.provider),
        check: getPreferredModelId(config.provider)
      }
    }
  }

  if (config.provider === 'anthropic') {
    serviceConfig.providers.anthropic = {
      apiKey: config.apiKey,
      baseUrl: config.baseURL || 'https://api.anthropic.com/v1'
    }
  } else if (config.provider === 'openai') {
    serviceConfig.providers.openai = {
      apiKey: config.apiKey,
      baseUrl: config.baseURL || 'https://api.openai.com/v1'
    }
  } else {
    // custom/local: 统一走 OpenAI 兼容模式（chat/completions）
    serviceConfig.providers.openai = {
      apiKey: config.apiKey || 'local-key',
      baseUrl: config.baseURL || 'http://localhost:11434/v1'
    }
  }

  return serviceConfig
}

function getServiceCacheKey(config: LLMProviderConfig, maxRetries: number): string {
  return JSON.stringify({
    provider: config.provider,
    model: config.model,
    baseURL: config.baseURL || '',
    apiKey: config.apiKey,
    maxRetries
  })
}

function getOrCreateAIService(config: LLMProviderConfig, maxRetries: number): AIService {
  const key = getServiceCacheKey(config, maxRetries)
  const cached = aiServiceCache.get(key)
  if (cached) return cached

  const service = new AIService(buildAIServiceConfig(config, maxRetries))
  aiServiceCache.set(key, service)
  return service
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`请求超时（${timeoutMs}ms）`))
    }, timeoutMs)

    promise
      .then(value => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * 调用LLM API
 */
export async function callLLM(
  prompt: string,
  config: LLMProviderConfig,
  options: LLMCallOptions = {}
): Promise<LLMCallResult> {
  const {
    maxRetries = 3,
    temperature = config.temperature || 0.7,
    maxTokens = config.maxTokens || 65536,
    timeout = 1800000
  } = options

  const service = getOrCreateAIService(config, maxRetries)

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: prompt
    }
  ]

  const context: TaskContext = {
    type: 'chapter',
    complexity: 'high',
    priority: 'quality',
    preferredModel: getPreferredModelId(config.provider),
    metadata: {
      source: 'llm-caller'
    }
  }

  try {
    const response = await withTimeout(
      service.chat(messages, context, {
        model: config.model,
        temperature,
        maxTokens
      }),
      timeout
    )

    const inputTokens = response.usage?.inputTokens ?? countTokens(prompt, config.provider)
    const outputTokens = response.usage?.outputTokens ?? countTokens(response.content || '', config.provider)

    // 外部返回成本以 LLMProviderConfig.pricing 为准，确保分析链路与旧行为一致
    const cost = config.pricing
      ? estimateCost(inputTokens, outputTokens, config.pricing.input, config.pricing.output)
      : (response.cost?.totalUSD ?? 0)

    return {
      content: response.content,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens
      },
      cost
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const sanitized = redactSensitiveText(err.message, [config.apiKey])

    throw new Error(`[LLM调用失败:${getProviderForCost(config)}] ${sanitized}`)
  }
}

/**
 * 休眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 调用LLM并验证JSON输出
 */
export async function callLLMWithValidation(
  prompt: string,
  schema: AnySchema,
  config: LLMProviderConfig,
  options: LLMCallOptions = {}
): Promise<unknown> {
  const maxRetries = options.maxRetries || 3
  const basePrompt = prompt
  let currentPrompt = basePrompt

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callLLM(currentPrompt, config, {
        ...options,
        maxRetries
      })

      console.log(`[LLM验证] 第${attempt}次尝试，原始响应前200字符:`, result.content.substring(0, 200))

      const validation = validateLLMOutput(result.content, schema, {
        // 仅在最后一次尝试时允许激进闭合修复
        allowAggressiveRepair: attempt === maxRetries
      })

      if (validation.valid) {
        return validation.data
      }

      console.error(`[LLM验证] 第${attempt}次验证失败:`, redactSensitiveText(validation.error || '', [config.apiKey]))

      if (attempt < maxRetries) {
        const condensedError = (validation.error || '返回结果不符合目标JSON结构')
          .replace(/\s+/g, ' ')
          .slice(0, 300)

        currentPrompt = `${basePrompt}\n\n请修正上一次返回的JSON结果，并严格遵守目标结构。只返回合法JSON，不要添加注释、Markdown代码块或任何额外说明。\n关键错误：${condensedError}`

        console.log(`[LLM验证] 使用精简纠错提示重试，错误摘要: ${condensedError}`)
        await sleep(1000 * attempt)
        continue
      }
    } catch (error) {
      console.error(
        `[LLM验证] 第${attempt}次调用失败:`,
        redactSensitiveText(error instanceof Error ? error.message : String(error), [config.apiKey])
      )

      if (attempt < maxRetries) {
        console.log(`[LLM验证] 等待${1000 * attempt}ms后重试...`)
        await sleep(1000 * attempt)
        continue
      }

      throw error
    }
  }

  throw new Error(`LLM输出验证失败，已重试${maxRetries}次`)
}
