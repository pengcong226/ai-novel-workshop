/**
 * AI服务集成层
 * @module services/ai-service
 *
 * 提供统一的AI API调用接口，支持OpenAI和Claude
 * 包含错误处理、重试机制、速率限制、成本控制
 */

import type {
  AIServiceConfig,
  AIProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  StreamCallback,
  ModelConfig,
  TaskContext,
  UsageStatistics,
  BudgetConfig,
} from '../types/ai';

import { countTokens as countProviderTokens } from '../utils/llm/tokenizer';
import { ModelRouter, SimpleUsageTracker } from './ai/ModelRouter';
import { FailoverManager } from './ai/FailoverManager';
import { ProviderRegistry } from '@/plugins/registries/provider-registry';
import { getLogger } from '@/utils/logger';

// 从子模块导入已提取的组件
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './ai/types';
import type { RetryConfig, RateLimitConfig } from './ai/types';
import {
  AIServiceError,
  RateLimitError,
  BudgetExceededError,
  ModelUnavailableError,
  assertOnlineForAIRequest,
} from './ai/errors';
import { RateLimiter } from './ai/rate-limiter';
import { CostTracker } from './ai/cost-tracker';
import { OpenAIProvider } from './ai/providers/openai-provider';
import { ClaudeProvider } from './ai/providers/claude-provider';
import { LocalProvider } from './ai/providers/local-provider';

const aiServiceLogger = getLogger('ai:service')

// ============================================================================
// AI服务主类
// ============================================================================

/**
 * AI服务
 * 统一的AI调用接口
 */
export class AIService {
  private config: AIServiceConfig;
  private modelRouter: ModelRouter;
  private failoverManager: FailoverManager;
  private usageTracker: SimpleUsageTracker;
  private costTracker: CostTracker;
  private rateLimiter: RateLimiter;
  private retryConfig: RetryConfig;

  private openaiProvider?: OpenAIProvider;
  private claudeProvider?: ClaudeProvider;
  private localProvider?: LocalProvider;
  private providerRegistry?: ProviderRegistry;

  constructor(config: AIServiceConfig, providerRegistry?: ProviderRegistry) {
    this.config = config;
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...(config.retry || {}),
    };
    this.rateLimiter = new RateLimiter(DEFAULT_RATE_LIMIT_CONFIG);
    this.costTracker = new CostTracker(config.budget);
    this.providerRegistry = providerRegistry;

    // 初始化内置providers
    if (config.providers.openai) {
      this.openaiProvider = new OpenAIProvider(config.providers.openai);
    }

    if (config.providers.anthropic) {
      this.claudeProvider = new ClaudeProvider(config.providers.anthropic);
    }

    if (config.providers.local) {
      this.localProvider = new LocalProvider(config.providers.local);
    }

    // 初始化模型路由器
    const allModels = this.getAllModelConfigs();
    this.usageTracker = new SimpleUsageTracker(allModels);
    this.modelRouter = new ModelRouter(this.usageTracker, {
      costOptimization: config.router?.costOptimization,
      preferredModels: config.router?.preferredModels,
    });

    // 初始化故障转移管理器
    this.failoverManager = new FailoverManager(this.modelRouter, {
      failureThreshold: 3,
      resetTimeoutMs: 60000
    });

    // 配置自定义providers
    if (config.providers.custom && providerRegistry) {
      for (const [id, providerConfig] of Object.entries(config.providers.custom)) {
        providerRegistry.configure(id, {
          ...providerConfig,
          apiKey: providerConfig.apiKey || ''
        });
      }
    }
  }

  /**
   * 获取所有模型配置
   */
  private getAllModelConfigs(): ModelConfig[] {
    // 从ModelRouter获取默认配置
    const router = new ModelRouter(this.usageTracker);
    return router.getAvailableModelsList();
  }

  private getRateLimitConfig(model: ModelConfig): RateLimitConfig {
    const defaultConfig = this.config.rateLimit?.default;
    const providerConfig = this.config.rateLimit?.byProvider?.[model.provider];
    const modelConfig = this.config.rateLimit?.byModel?.[model.id];

    return {
      requestsPerMinute: modelConfig?.requestsPerMinute ?? providerConfig?.requestsPerMinute ?? model.rpmLimit ?? defaultConfig?.requestsPerMinute ?? DEFAULT_RATE_LIMIT_CONFIG.requestsPerMinute,
      tokensPerMinute: modelConfig?.tokensPerMinute ?? providerConfig?.tokensPerMinute ?? defaultConfig?.tokensPerMinute ?? DEFAULT_RATE_LIMIT_CONFIG.tokensPerMinute,
      concurrentRequests: modelConfig?.concurrentRequests ?? providerConfig?.concurrentRequests ?? defaultConfig?.concurrentRequests ?? DEFAULT_RATE_LIMIT_CONFIG.concurrentRequests,
      queueTimeoutMs: modelConfig?.queueTimeoutMs ?? providerConfig?.queueTimeoutMs ?? defaultConfig?.queueTimeoutMs ?? DEFAULT_RATE_LIMIT_CONFIG.queueTimeoutMs,
    };
  }

  private estimateRequestCost(messages: ChatMessage[], request: ChatRequest, model: ModelConfig): number {
    const inputTokens = this.estimateTokens(messages, model.provider);
    const expectedOutputTokens = Math.min(request.maxTokens || model.maxTokens || 2000, model.maxTokens || 2000);
    return this.costTracker.calculateCost(inputTokens, expectedOutputTokens, model).totalUSD;
  }

  private ensureBudgetAvailable(estimatedCostUSD: number): void {
    const overBudget = this.costTracker.isOverBudget(estimatedCostUSD);
    const remainingBudget = this.costTracker.getRemainingBudget();
    const budget = this.config.budget;

    if (overBudget.chapter) {
      throw new BudgetExceededError(estimatedCostUSD, budget?.chapterLimitUSD || 0, 'chapter');
    }

    if (overBudget.daily) {
      const currentDailySpend = Number.isFinite(remainingBudget.dailyRemainingUSD)
        ? (budget?.dailyLimitUSD || 0) - remainingBudget.dailyRemainingUSD + estimatedCostUSD
        : estimatedCostUSD;
      throw new BudgetExceededError(currentDailySpend, budget?.dailyLimitUSD || 0, 'daily');
    }

    if (overBudget.monthly) {
      const currentMonthlySpend = Number.isFinite(remainingBudget.monthlyRemainingUSD)
        ? (budget?.monthlyLimitUSD || 0) - remainingBudget.monthlyRemainingUSD + estimatedCostUSD
        : estimatedCostUSD;
      throw new BudgetExceededError(currentMonthlySpend, budget?.monthlyLimitUSD || 0, 'monthly');
    }
  }

  /**
   * 发送聊天请求
   */
  async chat(
    messages: ChatMessage[],
    context?: TaskContext,
    options?: Partial<ChatRequest>
  ): Promise<ChatResponse> {
    const taskContext = context || {
      type: 'chapter',
      complexity: 'medium',
      priority: 'balanced',
    };

    const { result } = await this.failoverManager.executeWithFailover(
      taskContext,
      async (model) => {
        assertOnlineForAIRequest(model.provider);
        // 构建请求
        const request: ChatRequest = {
          messages,
          model: model.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          stopSequences: options?.stopSequences,
          ...options,
        };

        const estimatedCostUSD = this.estimateRequestCost(messages, request, model);
        this.ensureBudgetAvailable(estimatedCostUSD);

        const rateLimitKey = `${model.provider}:${model.id}`;
        const reservedTokens = request.maxTokens || model.maxTokens || 2000;
        const rateLimitConfig = this.getRateLimitConfig(model);

        // 执行单模型带重试的请求 (主要处理 rate limit 的 delay/retry)
        return this.executeWithRetry(async () => {
          await this.rateLimiter.waitForSlot(rateLimitKey, reservedTokens, rateLimitConfig);
          const startTime = Date.now();

          let response: ChatResponse;

          switch (model.provider) {
            case 'openai':
              response = await this.executeOpenAI(request, model);
              break;
            case 'anthropic':
              response = await this.executeClaude(request, model);
              break;
            case 'local':
              response = await this.executeLocal(request, model);
              break;
            case 'custom':
              response = await this.executeCustomProvider(request, model);
              break;
            default:
              throw new ModelUnavailableError(model.id, `Unknown provider: ${model.provider}`);
          }

          response.latency = Date.now() - startTime;

          // 记录使用情况
          this.usageTracker.recordUsage(model.id, response.usage.totalTokens);
          this.costTracker.recordCost({
            timestamp: new Date(),
            model: model.id,
            provider: model.provider,
            taskType: taskContext.type,
            tokens: response.usage,
            cost: response.cost,
          });
          this.rateLimiter.recordRequest(rateLimitKey, response.usage.totalTokens, reservedTokens);

          return response;
        }).catch(error => {
          this.rateLimiter.releaseReservation(rateLimitKey, reservedTokens);
          throw error;
        });
      },
      (fromModel, toModel) => {
        aiServiceLogger.warn(`[故障转移] 触发模型切换: ${fromModel.id} -> ${toModel.id}`);
        void import('@/stores/taskManager')
          .then(({ useTaskManager }) => {
            const taskManager = useTaskManager();
            taskManager.addToast(`模型 ${fromModel.id} 故障/熔断，已自动转移至 ${toModel.id}`, 'warning');
          })
          .catch(error => {
            aiServiceLogger.debug('故障转移提示注入失败', { error });
          });
      }
    );

    return result;
  }

  /**
   * 流式聊天请求
   */
  async chatStream(
    messages: ChatMessage[],
    callback: StreamCallback,
    context?: TaskContext,
    options?: Partial<ChatRequest>
  ): Promise<ChatResponse> {
    const taskContext = context || {
      type: 'chapter',
      complexity: 'medium',
      priority: 'balanced',
    };

    const { result } = await this.failoverManager.executeWithFailover(
      taskContext,
      async (model) => {
        assertOnlineForAIRequest(model.provider);
        // 构建请求
        const request: ChatRequest = {
          messages,
          model: model.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          stopSequences: options?.stopSequences,
          stream: true,
          ...options,
        };

        const estimatedCostUSD = this.estimateRequestCost(messages, request, model);
        this.ensureBudgetAvailable(estimatedCostUSD);

        const rateLimitKey = `${model.provider}:${model.id}`;
        const reservedTokens = request.maxTokens || model.maxTokens || 2000;
        const rateLimitConfig = this.getRateLimitConfig(model);

        const startTime = Date.now();
        let content = '';
        let inputTokens = 0;

        try {
          await this.rateLimiter.waitForSlot(rateLimitKey, reservedTokens, rateLimitConfig);
          const stream = this.getStream(model.provider, request);

          for await (const chunk of stream) {
            content += chunk;
            callback({ type: 'chunk', chunk });
          }

          // 估算token（流式响应通常不返回精确token数）
          inputTokens = this.estimateTokens(messages, model.provider);
          const outputTokens = this.estimateTokens([{ role: 'assistant', content }], model.provider);

          const usage: TokenUsage = {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          };

          const cost = this.costTracker.calculateCost(inputTokens, outputTokens, model);

          const response: ChatResponse = {
            content,
            model: model.model,
            usage,
            cost,
            latency: Date.now() - startTime,
            finishReason: 'stop',
          };

          // 记录使用情况
          this.usageTracker.recordUsage(model.id, response.usage.totalTokens);
          this.costTracker.recordCost({
            timestamp: new Date(),
            model: model.id,
            provider: model.provider,
            taskType: taskContext.type,
            tokens: response.usage,
            cost: response.cost,
          });
          this.rateLimiter.recordRequest(rateLimitKey, response.usage.totalTokens, reservedTokens);

          callback({ type: 'done', response });

          return response;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.rateLimiter.releaseReservation(rateLimitKey, reservedTokens);
          callback({
            type: 'error',
            error: {
              code: 'STREAM_ERROR',
              message: err.message,
            },
          });
          throw error;
        }
      },
      (fromModel, toModel) => {
        aiServiceLogger.warn(`[故障转移] 触发流式模型切换: ${fromModel.id} -> ${toModel.id}`);
      }
    );

    return result;
  }

  /**
   * 获取流式生成器
   */
  private async *getStream(
    provider: AIProvider,
    request: ChatRequest
  ): AsyncGenerator<string> {
    switch (provider) {
      case 'openai':
        if (!this.openaiProvider) {
          throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'OpenAI provider not configured');
        }
        yield* this.openaiProvider.chatStream(request);
        break;

      case 'anthropic':
        if (!this.claudeProvider) {
          throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'Claude provider not configured');
        }
        yield* this.claudeProvider.chatStream(request);
        break;

      case 'local':
        if (!this.localProvider) {
          throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'Local provider not configured');
        }
        yield* this.localProvider.chatStream(request);
        break;

      case 'custom': {
        if (!this.providerRegistry) {
          throw new AIServiceError('PROVIDER_REGISTRY_NOT_CONFIGURED', 'Provider registry not available');
        }
        // 尝试通过模型ID找到对应的provider
        const providerId = request.model?.split('-')[0] || 'custom';
        yield* this.providerRegistry.chatStream(providerId, request);
        break;
      }

      default:
        throw new AIServiceError('UNKNOWN_PROVIDER', `Unknown provider: ${provider}`);
    }
  }

  /**
   * 执行OpenAI请求
   */
  private async executeOpenAI(request: ChatRequest, model: ModelConfig): Promise<ChatResponse> {
    if (!this.openaiProvider) {
      throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'OpenAI provider not configured');
    }

    const response = await this.openaiProvider.chat(request);
    return this.openaiProvider.normalizeResponse(response, model);
  }

  /**
   * 执行Claude请求
   */
  private async executeClaude(request: ChatRequest, model: ModelConfig): Promise<ChatResponse> {
    if (!this.claudeProvider) {
      throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'Claude provider not configured');
    }

    const response = await this.claudeProvider.chat(request);
    return this.claudeProvider.normalizeResponse(response, model);
  }

  /**
   * 执行本地模型请求
   */
  private async executeLocal(request: ChatRequest, model: ModelConfig): Promise<ChatResponse> {
    if (!this.localProvider) {
      throw new AIServiceError('PROVIDER_NOT_CONFIGURED', 'Local provider not configured');
    }

    const startTime = Date.now();
    const response = await this.localProvider.chat(request);

    // 本地模型成本为0
    const usage: TokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    };

    return {
      content: response.choices[0]!.message.content,
      model: response.model,
      usage,
      cost: {
        ...usage,
        inputCostUSD: 0,
        outputCostUSD: 0,
        totalUSD: 0,
        totalCNY: 0,
        model: model.id,
      },
      latency: Date.now() - startTime,
      finishReason: 'stop',
    };
  }

  /**
   * 执行自定义Provider请求
   */
  private async executeCustomProvider(request: ChatRequest, model: ModelConfig): Promise<ChatResponse> {
    if (!this.providerRegistry) {
      throw new AIServiceError('PROVIDER_REGISTRY_NOT_CONFIGURED', 'Provider registry not available');
    }

    // 尝试通过模型ID找到对应的provider
    const providerId = model.id.split('-')[0]!; // 假设模型ID格式为 "provider-model"

    const startTime = Date.now();

    try {
      const response = await this.providerRegistry.chat(providerId, request);
      response.latency = Date.now() - startTime;
      return response as ChatResponse;
    } catch (error) {
      throw new AIServiceError(
        'CUSTOM_PROVIDER_ERROR',
        `Custom provider ${providerId} error: ${error instanceof Error ? error.message : String(error)}`,
        'custom',
        error
      );
    }
  }

  /**
   * 带重试的执行
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // 检查是否应该重试
      if (this.shouldRetry(error) && attempt < this.retryConfig.maxAttempts) {
        const delay = this.calculateDelay(attempt);
        aiServiceLogger.warn('AI request failed, retrying', {
          attempt,
          delay,
          error
        });

        try {
          const { useTaskManager } = await import('@/stores/taskManager');
          const taskManager = useTaskManager();
          taskManager.addToast(`大模型请求节流/重连中... 将在 ${Math.round(delay/1000)} 秒后发起第 ${attempt} 次重试`, 'warning');
        } catch(e) { /* ignore pinia context errors if any */ }

        await this.delay(delay);
        return this.executeWithRetry(fn, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: any): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    if (error instanceof AIServiceError) {
      // 5xx错误重试
      if (error.code.includes('_5') || error.code === 'OPENAI_429' || error.code === 'CLAUDE_429') {
        return true;
      }
    }

    // 网络错误重试
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return true;
    }

    return false;
  }

  /**
   * 计算重试延迟
   */
  private calculateDelay(attempt: number): number {
    const delay =
      this.retryConfig.baseDelay *
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    const capped = Math.min(delay, this.retryConfig.maxDelay);
    const jitter = this.retryConfig.jitterRatio || 0;

    if (jitter <= 0) {
      return capped;
    }

    const rand = (Math.random() * 2 - 1) * jitter;
    return Math.max(100, Math.round(capped * (1 + rand)));
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 估算token数量
   * 简单估算：中文约2字符/token，英文约4字符/token
   */
  private estimateTokens(messages: ChatMessage[], provider: AIProvider = 'openai'): number {
    return messages.reduce((sum, msg) => {
      try {
        return sum + countProviderTokens(msg.content || '', provider);
      } catch {
        aiServiceLogger.debug('ai-service: token countProviderTokens failed, falling back to heuristic')
        // ignore pinia context / tokenizer errors, fall back to heuristic estimate
        const text = msg.content || '';
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
        const otherChars = text.length - chineseChars - englishWords;
        return sum + Math.ceil(chineseChars * 1.5 + englishWords + otherChars / 3);
      }
    }, 0);
  }

  /**
   * 获取使用统计
   */
  getUsageStatistics(period?: { start: Date; end: Date }): UsageStatistics {
    return this.costTracker.getStatistics(period);
  }

  /**
   * 获取模型路由器
   */
  getModelRouter(): ModelRouter {
    return this.modelRouter;
  }

  /**
   * 设置预算
   */
  setBudget(config: BudgetConfig): void {
    Object.assign(this.config, { budget: config });
    this.costTracker.setBudget(config);
  }
}

// ============================================================================
// 重导出 — 保持向后兼容
// ============================================================================

export {
  AIServiceError,
  RateLimitError,
  BudgetExceededError,
  ModelUnavailableError,
  RateLimiter,
  CostTracker,
};

export type {
  AIServiceConfig,
  BudgetConfig,
  RetryConfig,
  RateLimitConfig,
};

// CostRecord 来自 types 子模块
export type { CostRecord } from './ai/types';
