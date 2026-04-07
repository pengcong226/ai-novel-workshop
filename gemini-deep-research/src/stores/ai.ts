import { defineStore } from 'pinia'
import { ref } from 'vue'
import { AIService } from '@/services/ai-service'
import type { AIServiceConfig, BudgetConfig, ChatMessage, ChatRequest, TaskContext, ChatResponse, StreamEvent } from '@/types/ai'
import { getAIMockEnabled } from '@/utils/devFlags'
import { getLogger } from '@/utils/logger'
import { useProjectStore } from './project'

export const useAIStore = defineStore('ai', () => {
  const aiService = ref<AIService | null>(null)
  const isInitialized = ref(false)
  const error = ref<string | null>(null)
  const configuredModel = ref<string | null>(null) // 存储配置的模型ID
  const logger = getLogger('ai:store')
  const MOCK_MODEL_ID = 'mock-dev-model'

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // V3: 共享模型路由逻辑，消除 chat/chatStream 中的重复代码
  function resolvePreferredModel(
    cfg: any,
    contextType?: string,
    fallbackModel?: string | null
  ): string | null {
    let model = fallbackModel || null
    if (cfg) {
      if (contextType === 'outline' || contextType === 'worldbuilding' || contextType === 'character') {
        model = cfg.planningModel || model
      } else if (contextType === 'chapter') {
        model = cfg.writingModel || model
      } else if (contextType === 'check') {
        model = cfg.checkingModel || model
      }
    }
    return model
  }

  function createMockChatResponse(messages: ChatMessage[], context?: TaskContext): ChatResponse {
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user')?.content || ''
    const inputText = lastUserMessage.replace(/\s+/g, ' ').trim()
    const snippet = inputText.slice(0, 120)

    const content = `【Mock响应】任务类型: ${context?.type || 'chapter'}\n已启用本地免Token调试模式。\n输入片段: ${snippet || '（无用户输入）'}\n\n你可以在开发者面板关闭 Mock 后再走真实模型。`

    const inputTokens = Math.max(1, Math.ceil(messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0) / 4))
    const outputTokens = Math.max(1, Math.ceil(content.length / 4))

    return {
      content,
      model: MOCK_MODEL_ID,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      cost: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputCostUSD: 0,
        outputCostUSD: 0,
        totalUSD: 0,
        totalCNY: 0,
        model: MOCK_MODEL_ID
      },
      latency: 5,
      finishReason: 'stop'
    }
  }

  async function emitMockStream(
    messages: ChatMessage[],
    callback: (event: StreamEvent) => void,
    context?: TaskContext
  ): Promise<ChatResponse> {
    const response = createMockChatResponse(messages, context)
    const chunks = response.content.match(/.{1,24}/g) || [response.content]

    for (const chunk of chunks) {
      callback({ type: 'chunk', chunk })
      await sleep(15)
    }

    callback({ type: 'done', response })
    return response
  }

  /**
   * 初始化AI服务
   */
  function initialize() {
    if (isInitialized.value && aiService.value) {
      return
    }

    try {
      const projectStore = useProjectStore()
      const config = projectStore.currentProject?.config || projectStore.globalConfig

      if (!config) {
        error.value = '未找到配置，请先配置模型提供商'
        return
      }

      // 检查是否有配置的提供商
      if (!config.providers || config.providers.length === 0) {
        error.value = '未配置任何AI模型提供商，请在配置中添加API密钥'
        logger.warn('providers 数组为空')
        return
      }

      // 构建AI服务配置
      const budgetConfig: BudgetConfig = {
        chapterLimitUSD: config.maxCostPerChapter || 0.15,
        dailyLimitUSD: Math.max((config.maxCostPerChapter || 0.15) * 5, config.maxCostPerChapter || 0.15),
        monthlyLimitUSD: Math.max((config.maxCostPerChapter || 0.15) * 100, 10),
        alertThreshold: 0.8
      }

      const aiConfig: AIServiceConfig = {
        providers: {},
        budget: budgetConfig,
        router: {
          costOptimization: true,
          preferredModels: {}, // 将在下面填充
        },
      }

      // 从配置中读取模型提供商信息
      let hasEnabledProvider = false
      const preferredModels: Record<string, string> = {}

      config.providers.forEach((provider) => {
        if (!provider.isEnabled) {
          logger.debug('提供商已禁用，跳过', { provider: provider.name })
          return
        }

        if (!provider.apiKey) {
          logger.warn('提供商未配置 API 密钥', { provider: provider.name })
          return
        }

        if (!provider.models || provider.models.length === 0) {
          logger.warn('提供商未配置模型', { provider: provider.name })
          return
        }

        hasEnabledProvider = true

        const enabledModel = provider.models.find(m => m.isEnabled)
        if (!enabledModel) {
          logger.warn('提供商没有启用的模型', { provider: provider.name })
          return
        }

        // V3-fix: 使用 provider.type 作为 key（与 AIService 构造函数的硬编码 key 保持一致）
        // openai / custom 都归入 'openai' key（AIService 只认 openai/anthropic/local）
        // 采用"先到先得"策略：同类型的第一个 provider 优先，避免静默覆盖
        const providerKey = provider.type === 'anthropic' ? 'anthropic' : 'openai'

        if (aiConfig.providers[providerKey as 'openai' | 'anthropic']) {
          logger.info('同类型提供商已存在，跳过后续注册', {
            existingKey: providerKey,
            skipped: provider.name,
            type: provider.type,
          })
        } else {
          const providerConfig = {
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl || (provider.type === 'anthropic'
              ? 'https://api.anthropic.com/v1'
              : 'https://api.openai.com/v1'),
          }
          if (providerKey === 'anthropic') {
            aiConfig.providers.anthropic = providerConfig
          } else {
            aiConfig.providers.openai = providerConfig
          }
          logger.info('已配置提供商', {
            provider: provider.name,
            type: provider.type,
            key: providerKey,
            model: enabledModel.id,
          })
        }

        // 首个启用的提供商设为默认模型（后续不覆盖）
        if (!preferredModels.chapter) {
          preferredModels.worldbuilding = enabledModel.id
          preferredModels.character = enabledModel.id
          preferredModels.outline = enabledModel.id
          preferredModels.chapter = enabledModel.id
          preferredModels.check = enabledModel.id
        }
      })

      // 设置优先模型
      aiConfig.router!.preferredModels = preferredModels

      if (!hasEnabledProvider) {
        error.value = '没有启用的AI模型提供商，请在配置中启用至少一个提供商'
        logger.warn('没有启用的提供商')
        return
      }

      if (Object.keys(aiConfig.providers).length === 0) {
        error.value = '未配置任何有效的AI模型提供商'
        logger.warn('aiConfig.providers 为空')
        return
      }

      aiService.value = new AIService(aiConfig)
      aiService.value.setBudget(budgetConfig)
      isInitialized.value = true
      error.value = null

      // 保存配置的模型ID，供后续使用
      if (preferredModels.chapter) {
        configuredModel.value = preferredModels.chapter
      }

      logger.info('AI 服务初始化成功', {
        providers: Object.keys(aiConfig.providers),
        preferredModels,
        configuredModel: configuredModel.value
      })
    } catch (e) {
      logger.error('AI 服务初始化失败', e)
      error.value = e instanceof Error ? e.message : 'AI服务初始化失败'
    }
  }

  /**
   * 发送聊天请求
   */
  async function chat(
    messages: ChatMessage[],
    context?: TaskContext,
    options?: Partial<ChatRequest>
  ): Promise<ChatResponse> {
    if (import.meta.env.DEV && getAIMockEnabled()) {
      logger.warn('AI Mock 模式已启用，chat 返回模拟响应', { type: context?.type })
      return createMockChatResponse(messages, context)
    }

    if (!aiService.value || !isInitialized.value) {
      initialize()

      if (!aiService.value) {
        throw new Error(error.value || 'AI服务未初始化')
      }
    }

    const projectStore = useProjectStore()
    const config = projectStore.currentProject?.config || projectStore.globalConfig

    let preferredModel = resolvePreferredModel(config, context?.type, configuredModel.value)

    if (!preferredModel && config?.providers) {
      const fallbackProvider = config.providers.find(provider =>
        provider.isEnabled && provider.models?.some(model => model.isEnabled)
      )
      preferredModel = fallbackProvider?.models.find(model => model.isEnabled)?.id || null
    }

    const requestContext: TaskContext = preferredModel
      ? {
          type: context?.type || 'chapter',
          complexity: context?.complexity || 'medium',
          priority: context?.priority || 'balanced',
          tokenBudget: context?.tokenBudget,
          preferredModel,
          metadata: {
            ...context?.metadata,
            requestedBy: 'ai-store'
          }
        }
      : context || {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced'
        }

    if (preferredModel) {
      logger.info('AI chat 使用指定模型', { preferredModel, type: requestContext.type })
    } else {
      logger.info('AI chat 使用路由器自动选模', { type: requestContext.type })
    }

    return await aiService.value.chat(messages, requestContext, options)
  }

  /**
   * 流式聊天请求
   */
  async function chatStream(
    messages: ChatMessage[],
    callback: (event: StreamEvent) => void,
    context?: TaskContext,
    options?: Partial<ChatRequest>
  ) {
    if (import.meta.env.DEV && getAIMockEnabled()) {
      logger.warn('AI Mock 模式已启用，chatStream 返回模拟流', { type: context?.type })
      return await emitMockStream(messages, callback, context)
    }

    if (!aiService.value || !isInitialized.value) {
      initialize()

      if (!aiService.value) {
        throw new Error(error.value || 'AI服务未初始化')
      }
    }

    const projectStore = useProjectStore()
    const config = projectStore.currentProject?.config || projectStore.globalConfig

    let preferredModel = resolvePreferredModel(config, context?.type, configuredModel.value)

    if (!preferredModel && config?.providers) {
      const fallbackProvider = config.providers.find(provider =>
        provider.isEnabled && provider.models?.some(model => model.isEnabled)
      )
      preferredModel = fallbackProvider?.models.find(model => model.isEnabled)?.id || null
    }

    const requestContext: TaskContext = preferredModel
      ? {
          type: context?.type || 'chapter',
          complexity: context?.complexity || 'medium',
          priority: context?.priority || 'balanced',
          tokenBudget: context?.tokenBudget,
          preferredModel,
          metadata: {
            ...context?.metadata,
            requestedBy: 'ai-store-stream'
          }
        }
      : context || {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced'
        }

    if (preferredModel) {
      logger.info('AI stream 使用指定模型', { preferredModel, type: requestContext.type })
    } else {
      logger.info('AI stream 使用路由器自动选模', { type: requestContext.type })
    }

    return await aiService.value.chatStream(messages, callback, requestContext, options)
  }

  /**
   * 检查是否已初始化
   */
  function checkInitialized(): boolean {
    if (import.meta.env.DEV && getAIMockEnabled()) {
      return true
    }

    if (!isInitialized.value) {
      initialize()
    }
    return isInitialized.value && aiService.value !== null
  }

  return {
    aiService,
    isInitialized,
    error,
    initialize,
    chat,
    chatStream,
    checkInitialized,
  }
})
