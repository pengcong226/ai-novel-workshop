/**
 * AI service store.
 *
 * Manages AI service initialization, chat/streaming, model routing,
 * pipeline configuration, intent-driven execution, and daemon lifecycle.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useAIStore } from '@/stores/ai'
 * import { storeToRefs } from 'pinia'
 * const { isInitialized, error, daemonState } = storeToRefs(useAIStore())
 * ```
 *
 * @module stores/ai
 */

import { defineStore } from 'pinia'
import { ref, shallowRef, type Ref } from 'vue'
import { AIService } from '@/services/ai-service'
import type { AIServiceConfig, BudgetConfig, ChatMessage, ChatRequest, TaskContext, ChatResponse, StreamEvent } from '@/types/ai'
import { getAIMockEnabled } from '@/utils/devFlags'
import { getLogger } from '@/utils/logger'
import { AIError, toAppError, ErrorCode } from '@/utils/errors'
import { useProjectStore } from './project'
import { useTokenUsageStore } from './tokenUsage'
import { pluginManager } from '@/plugins/manager'
import type { PipelineConfig } from '@/services/pipeline/types'
import type { IntentMatch } from '@/types/interactionIntents'
import type { DaemonConfig, DaemonState, DaemonEvent } from '@/services/DaemonService'
import { SlidingWindowRateLimiter } from '@/utils/rateLimiter'

export const useAIStore = defineStore('ai', () => {
  const aiService: Ref<AIService | null> = shallowRef(null)
  const isInitialized: Ref<boolean> = ref(false)
  const error: Ref<string | null> = ref(null)
  /** Stores the configured model ID for quick access. */
  const configuredModel: Ref<string | null> = ref(null)
  const logger = getLogger('ai:store')
  const MOCK_MODEL_ID = 'mock-dev-model'

  // ── Request deduplication for non-streaming chat ──
  // Key: hash of messages + context, Value: in-flight promise
  const inflightChatRequests = new Map<string, Promise<ChatResponse>>()

  // ── Rate limiter for AI API calls (30 req / 60s sliding window) ──
  const aiRateLimiter = new SlidingWindowRateLimiter({ maxRequests: 30, windowMs: 60_000 })

  // ── Model resolution cache (invalidated on config/override change) ──
  const MODEL_CACHE_MAX_SIZE = 200
  let modelResolutionCacheVersion = 0
  let _lastOverrideSnapshot = ''
  const modelResolutionCache = new Map<string, { version: number; model: string | null }>()

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 构建 AI 请求上下文（消除 chat/chatStream 重复代码）
   */
  function buildRequestContext(
    context: TaskContext | undefined,
    requestedBy: string
  ): TaskContext {
    const projectStore = useProjectStore()
    const config = projectStore.currentProject?.config || projectStore.globalConfig

    let preferredModel = context?.preferredModel ?? resolvePreferredModel(config, context?.type, configuredModel.value)

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
            requestedBy
          }
        }
      : context || {
          type: 'chapter',
          complexity: 'medium',
          priority: 'balanced'
        }

    if (preferredModel) {
      logger.info(`AI ${requestedBy} 使用指定模型`, { preferredModel, type: requestContext.type })
    } else {
      logger.info(`AI ${requestedBy} 使用路由器自动选模`, { type: requestContext.type })
    }

    return requestContext
  }

  // 共享模型路由逻辑
  function resolvePreferredModel(
    cfg: any,
    contextType?: string,
    fallbackModel?: string | null
  ): string | null {
    let model = fallbackModel || null
    if (cfg) {
      if (contextType === 'outline' || contextType === 'worldbuilding' || contextType === 'character') {
        model = cfg.plannerModel || model
      } else if (contextType === 'chapter') {
        model = cfg.writerModel || model
      } else if (contextType === 'check') {
        model = cfg.sentinelModel || model
      } else if (contextType === 'state_extraction' || contextType === 'memory_update') {
        model = cfg.extractorModel || model
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

  function recordTokenUsage(response: ChatResponse, context: TaskContext | undefined, source: 'chat' | 'chatStream' | 'mockChat' | 'mockStream') {
    const projectStore = useProjectStore()
    useTokenUsageStore().recordFromChatResponse({
      projectId: projectStore.currentProject?.id,
      source,
      context,
      response,
    })
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

      config.providers.forEach((provider: any, index: number) => {
        if (!provider.isEnabled) {
          logger.debug('提供商已禁用，跳过', { provider: provider.name })
          return
        }

        // 对于 local 类型的提供商，可以没有 apiKey
        if (provider.type !== 'local' && !provider.apiKey) {
          logger.warn('提供商未配置 API 密钥', { provider: provider.name })
          return
        }

        if (!provider.models || provider.models.length === 0) {
          logger.warn('提供商未配置模型', { provider: provider.name })
          return
        }

        hasEnabledProvider = true

        const enabledModel = provider.models.find((m: any) => m.isEnabled)
        if (!enabledModel) {
          logger.warn('提供商没有启用的模型', { provider: provider.name })
          return
        }

        const isBuiltIn = ['openai', 'anthropic', 'local'].includes(provider.type)
        if (isBuiltIn) {
          const providerKey = provider.type as 'openai' | 'anthropic' | 'local'
          if (!aiConfig.providers[providerKey]) {
            aiConfig.providers[providerKey] = {
              apiKey: provider.apiKey,
              baseUrl: provider.baseUrl || (provider.type === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'),
              model: enabledModel.id
            }
            logger.info('已配置内置提供商', {
              provider: provider.name,
              type: provider.type,
              key: providerKey,
              model: enabledModel.id,
            })
          } else {
            logger.info('同类型内置提供商已存在，跳过后续注册', {
              existingKey: providerKey,
              skipped: provider.name,
              type: provider.type,
            })
          }
        } else {
          // Custom provider
          if (!aiConfig.providers.custom) {
            aiConfig.providers.custom = {}
          }
          const providerKey = provider.name || provider.type || `provider_${index}`
          aiConfig.providers.custom[providerKey] = {
            id: providerKey,
            name: provider.name,
            providerType: provider.type || 'custom',
            apiKey: provider.apiKey || '',
            baseURL: provider.baseUrl,
            model: enabledModel.id
          }
          logger.info('已配置自定义提供商', {
            provider: provider.name,
            type: provider.type,
            key: providerKey,
            model: enabledModel.id,
          })
        }

        // V4-D1: 首个启用的提供商设为 fallback，但优先读取用户按角色配置的模型
        if (!preferredModels.chapter) {
          preferredModels.chapter = config?.writerModel || enabledModel.id
          preferredModels.check = config?.sentinelModel || enabledModel.id
          preferredModels.outline = config?.plannerModel || enabledModel.id
          preferredModels.worldbuilding = config?.plannerModel || enabledModel.id
          preferredModels.character = config?.plannerModel || enabledModel.id
          preferredModels.state_extraction = config?.extractorModel || enabledModel.id
          preferredModels.memory_update = config?.extractorModel || enabledModel.id
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

      aiService.value = new AIService(aiConfig, pluginManager.getRegistries().aiProvider)
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
    } catch (e: unknown) {
      const err = new AIError('AI服务初始化失败', {
        code: ErrorCode.AI_NOT_INITIALIZED,
        cause: e instanceof Error ? e : undefined,
      });
      logger.error(`[${err.code}] AI 服务初始化失败:`, err.toJSON());
      error.value = err.message
    }
  }

  /**
   * Build a stable dedup hash for chat request deduplication.
   * Only hashes messages + context type/model; ignores callback options.
   */
  function chatDedupHash(messages: ChatMessage[], context?: TaskContext): string {
    const key = JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      type: context?.type,
      model: context?.preferredModel,
    })
    // Simple fast hash (djb2)
    let hash = 5381
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) + hash) + key.charCodeAt(i)
      hash |= 0
    }
    return hash.toString(36)
  }

  /**
   * 发送聊天请求（with deduplication for identical in-flight requests）
   */
  async function chat(
    messages: ChatMessage[],
    context?: TaskContext,
    options?: Partial<ChatRequest>
  ): Promise<ChatResponse> {
    if (import.meta.env.DEV && getAIMockEnabled()) {
      logger.warn('AI Mock 模式已启用，chat 返回模拟响应', { type: context?.type })
      const response = createMockChatResponse(messages, context)
      recordTokenUsage(response, context, 'mockChat')
      return response
    }

    if (!aiService.value || !isInitialized.value) {
      initialize()

      if (!aiService.value) {
        throw new Error(error.value || 'AI服务未初始化')
      }
    }

    // Deduplicate identical in-flight requests
    const dedupKey = chatDedupHash(messages, context)
    const existing = inflightChatRequests.get(dedupKey)
    if (existing) {
      logger.info('AI chat 请求去重', { dedupKey })
      return existing
    }

    // Rate limit check
    const rateLimitResult = aiRateLimiter.tryAcquire()
    if (!rateLimitResult.allowed) {
      const waitSec = Math.ceil(rateLimitResult.retryAfterMs / 1000)
      throw new Error(`AI 请求频率超限，请在 ${waitSec} 秒后重试`)
    }

    const requestContext = buildRequestContext(context, 'ai-store')
    const requestPromise = (async () => {
      try {
        const response = await aiService.value!.chat(messages, requestContext, options)
        if (error.value) error.value = null
        recordTokenUsage(response, requestContext, 'chat')
        return response
      } catch (err: unknown) {
        error.value = err instanceof Error ? err.message : String(err)
        logger.error('chat 请求失败', { error: error.value, type: context?.type })
        throw err
      } finally {
        inflightChatRequests.delete(dedupKey)
      }
    })()

    inflightChatRequests.set(dedupKey, requestPromise)
    return requestPromise
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
      const response = await emitMockStream(messages, callback, context)
      recordTokenUsage(response, context, 'mockStream')
      return response
    }

    if (!aiService.value || !isInitialized.value) {
      initialize()

      if (!aiService.value) {
        throw new Error(error.value || 'AI服务未初始化')
      }
    }

    // Rate limit check
    const rateLimitResult = aiRateLimiter.tryAcquire()
    if (!rateLimitResult.allowed) {
      const waitSec = Math.ceil(rateLimitResult.retryAfterMs / 1000)
      throw new Error(`AI 请求频率超限，请在 ${waitSec} 秒后重试`)
    }

    const requestContext = buildRequestContext(context, 'ai-store-stream')
    try {
      const response = await aiService.value.chatStream(messages, callback, requestContext, options)
      if (error.value) error.value = null
      recordTokenUsage(response, requestContext, 'chatStream')
      return response
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
      logger.error('chatStream 请求失败', { error: error.value, type: context?.type })
      throw err
    }
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

  // ============================================================================
  // Pipeline 10-Agent 配置支持
  // ============================================================================

  /**
   * Pipeline 配置（运行时状态）
   */
  const pipelineConfig = ref<Partial<PipelineConfig>>({
    maxAuditRetries: 1,
    passScoreThreshold: 85,
    netImprovementEpsilon: 3,
    temperatureBase: 0.7,
    temperatureRetryStep: 0.1,
    maxTemperature: 1.2,
    enableLengthNormalization: true,
    enableHookPromotion: true,
  })

  /**
   * Agent 独立模型配置
   * 允许为每个 Agent 指定不同的 model/provider/temperature
   */
  interface AgentModelOverride {
    model?: string
    temperature?: number
    maxTokens?: number
  }

  const agentModelOverrides = ref<Record<string, AgentModelOverride>>({})

  /**
   * 设置 Agent 模型覆盖
   */
  function setAgentModelOverride(agentRole: string, override: AgentModelOverride): void {
    agentModelOverrides.value[agentRole] = { ...agentModelOverrides.value[agentRole], ...override }
    // Invalidate model resolution cache when overrides change
    modelResolutionCacheVersion++
    logger.info(`Agent ${agentRole} 模型覆盖已更新`, override)
  }

  /**
   * 获取 Agent 模型覆盖
   */
  function getAgentModelOverride(agentRole: string): AgentModelOverride | undefined {
    return agentModelOverrides.value[agentRole]
  }

  /**
   * 更新 Pipeline 配置
   */
  function updatePipelineConfig(config: Partial<PipelineConfig>): void {
    pipelineConfig.value = { ...pipelineConfig.value, ...config }
    logger.info('Pipeline 配置已更新', config)
  }

  /**
   * 获取当前 Pipeline 配置
   */
  function getPipelineConfig(): Partial<PipelineConfig> {
    return { ...pipelineConfig.value }
  }

  /**
   * 扩展 resolvePreferredModel 以支持 10-Agent 路由
   * Uses a versioned cache to avoid repeated config lookups.
   */
  function resolveAgentModel(agentRole: string, contextType?: string): string | null {
    const cacheKey = `${agentRole}:${contextType || ''}`
    const cached = modelResolutionCache.get(cacheKey)
    if (cached && cached.version === modelResolutionCacheVersion) {
      return cached.model
    }

    const projectStore = useProjectStore()
    const config = projectStore.currentProject?.config || projectStore.globalConfig

    // 1. 先检查 Agent 独立配置
    const override = agentModelOverrides.value[agentRole]
    if (override?.model) {
      setModelCache(cacheKey, override.model)
      return override.model
    }

    // 2. 检查项目配置中的 Agent 级别配置
    if (config) {
      const agentConfig = config.agentConfigs?.find(c => c.role === agentRole)
      if (agentConfig?.model) {
        setModelCache(cacheKey, agentConfig.model)
        return agentConfig.model
      }
    }

    // 3. 按角色映射到传统的模型配置
    const result = resolvePreferredModel(config, contextType, configuredModel.value)
    setModelCache(cacheKey, result)
    return result
  }

  /** Set a cache entry with size cap enforcement (LRU eviction). */
  function setModelCache(key: string, model: string | null): void {
    if (modelResolutionCache.size >= MODEL_CACHE_MAX_SIZE) {
      const firstKey = modelResolutionCache.keys().next().value
      if (firstKey !== undefined) {
        modelResolutionCache.delete(firstKey)
      }
    }
    modelResolutionCache.set(key, { version: modelResolutionCacheVersion, model })
  }

  // ============================================================================
  // Intent-driven Pipeline 执行支持
  // ============================================================================

  /**
   * Intent 执行上下文
   */
  interface IntentExecutionContext {
    intent: IntentMatch
    project: any
    onSuccess?: (result: any) => void
    onError?: (error: Error) => void
  }

  /**
   * 执行 Intent 驱动的 Pipeline 操作
   */
  async function executeIntent(context: IntentExecutionContext): Promise<any> {
    const { intent, project, onSuccess, onError } = context
    logger.info('执行 Intent', { intent: intent.intent, confidence: intent.confidence })

    try {
      let result: any

      switch (intent.intent) {
        // ── 写作类 Intent ──
        case 'write_next':
        case 'write_chapter':
        case 'rewrite_chapter':
        case 'continue_writing': {
          const { PipelineRunner } = await import('@/services/pipeline/PipelineRunner')
          const runner = new PipelineRunner()

          const nextChapterNumber = (project.chapters?.length || 0) + 1
          result = await runner.writeNextChapter({
            project,
            chapterNumber: intent.params?.chapterNumber || nextChapterNumber,
            chapterOutline: intent.params?.chapterOutline,
            externalContext: intent.params?.externalContext,
            wordCountOverride: intent.params?.wordCount,
            temperatureOverride: intent.params?.temperature,
          })
          break
        }

        // ── 审计类 Intent ──
        case 'audit_chapter':
        case 'audit_all':
        case 'check_continuity': {
          const { ContinuityAuditor } = await import('@/agents/ContinuityAuditor')
          const auditor = new ContinuityAuditor()

          const chapterNumber = intent.params?.chapterNumber || (project.chapters?.length || 1)
          const chapter = project.chapters?.find((c: any) => c.number === chapterNumber)
          const chapterContent = chapter?.content || ''
          result = await auditor.audit({
            chapterContent,
            chapterNumber,
            genre: project.genre,
          })
          break
        }

        // ── 实体查询 Intent ──
        case 'query_entity': {
          const { useSandboxStore } = await import('./sandbox')
          const sandboxStore = useSandboxStore()
          const entityName = intent.params?.entityName
          const entities = sandboxStore.entities || []
          result = entityName
            ? entities.filter((e: any) => e.name === entityName || e.aliases?.includes(entityName))
            : entities
          break
        }

        // ── 系统 Intent ──
        case 'show_status': {
          result = {
            isInitialized: isInitialized.value,
            hasError: !!error.value,
            errorMessage: error.value,
            configuredModel: configuredModel.value,
            daemonStatus: daemonState.value.status,
          }
          break
        }

        case 'help': {
          result = {
            supportedIntents: [
              'write_next', 'write_chapter', 'rewrite_chapter', 'continue_writing',
              'audit_chapter', 'audit_all', 'check_continuity',
              'query_entity', 'show_status', 'help',
            ],
            description: 'AI Novel Workshop 支持的意图类型列表',
          }
          break
        }

        // ── 未实现 ──
        default: {
          result = { message: `Intent "${intent.intent}" 尚未实现` }
          break
        }
      }

      onSuccess?.(result)
      return result
    } catch (e: unknown) {
      const err = toAppError(e, 'Intent 执行失败', { intent: intent.intent });
      logger.error(`[${err.code}] Intent 执行失败:`, err.toJSON());
      onError?.(err)
      throw err
    }
  }

  // ============================================================================
  // Daemon 守护进程支持
  // ============================================================================

  /** 懒加载的 DaemonService 单例 */
  let daemonServiceInstance: any = null
  /** Tracks the daemon event subscription for cleanup */
  let daemonEventUnsubscribe: (() => void) | null = null

  /**
   * 获取或创建 DaemonService 实例
   */
  async function getDaemonService() {
    if (!daemonServiceInstance) {
      const { DaemonService } = await import('@/services/DaemonService')
      daemonServiceInstance = new DaemonService()
    }
    return daemonServiceInstance
  }

  /**
   * 守护进程状态
   */
  const daemonState = ref<DaemonState>({
    status: 'idle',
    chaptersCompletedToday: 0,
    tokensUsedToday: 0,
    lastRunTimestamp: 0,
    consecutiveFailures: 0,
  })

  /**
   * 启动守护进程
   */
  async function startDaemon(config?: Partial<DaemonConfig>): Promise<void> {
    logger.info('启动守护进程', config)
    const service = await getDaemonService()

    // Unsubscribe previous event listener to prevent accumulation
    if (daemonEventUnsubscribe) {
      daemonEventUnsubscribe()
      daemonEventUnsubscribe = null
    }

    daemonEventUnsubscribe = service.onEvent((event: DaemonEvent) => {
      daemonState.value = { ...event.state }
    })
    await service.start(config)
    daemonState.value = service.getState()
  }

  /**
   * 停止守护进程
   */
  function stopDaemon(): void {
    logger.info('停止守护进程')
    if (daemonEventUnsubscribe) {
      daemonEventUnsubscribe()
      daemonEventUnsubscribe = null
    }
    if (daemonServiceInstance) {
      daemonServiceInstance.stop()
      daemonState.value = daemonServiceInstance.getState()
    }
  }

  /**
   * 暂停守护进程
   */
  function pauseDaemon(): void {
    logger.info('暂停守护进程')
    if (daemonServiceInstance) {
      daemonServiceInstance.pause()
      daemonState.value = daemonServiceInstance.getState()
    }
  }

  /**
   * 恢复守护进程
   */
  function resumeDaemon(): void {
    logger.info('恢复守护进程')
    if (daemonServiceInstance) {
      daemonServiceInstance.resume()
      daemonState.value = daemonServiceInstance.getState()
    }
  }

  /**
   * 获取守护进程状态
   */
  function getDaemonState(): DaemonState {
    return { ...daemonState.value }
  }

  /**
   * Reset the AI store to its initial state. Stops any running daemon
   * before clearing state.
   */
  function $reset(): void {
    stopDaemon()
    aiService.value = null
    isInitialized.value = false
    error.value = null
    configuredModel.value = null
    daemonState.value = {
      status: 'idle',
      chaptersCompletedToday: 0,
      tokensUsedToday: 0,
      lastRunTimestamp: 0,
      consecutiveFailures: 0,
    }
    pipelineConfig.value = {
      maxAuditRetries: 1,
      passScoreThreshold: 85,
      netImprovementEpsilon: 3,
      temperatureBase: 0.7,
      temperatureRetryStep: 0.1,
      maxTemperature: 1.2,
      enableLengthNormalization: true,
      enableHookPromotion: true,
    }
    agentModelOverrides.value = {}

    // Clear growing caches and dangling references
    modelResolutionCache.clear()
    modelResolutionCacheVersion = 0
    _lastOverrideSnapshot = ''
    inflightChatRequests.clear()
    daemonServiceInstance = null
    daemonEventUnsubscribe = null
  }

  return {
    aiService,
    isInitialized,
    error,
    initialize,
    chat,
    chatStream,
    checkInitialized,
    // Pipeline 配置
    pipelineConfig,
    agentModelOverrides,
    setAgentModelOverride,
    getAgentModelOverride,
    updatePipelineConfig,
    getPipelineConfig,
    resolveAgentModel,
    // Intent support
    executeIntent,
    // Daemon support
    daemonState,
    startDaemon,
    stopDaemon,
    pauseDaemon,
    resumeDaemon,
    getDaemonState,
    // Reset
    $reset,
  }
})
