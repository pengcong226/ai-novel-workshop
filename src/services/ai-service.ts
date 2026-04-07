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
  CostBreakdown,
  StreamCallback,
  ModelConfig,
  TaskContext,
  UsageStatistics,
  TaskType,
  BudgetConfig,
  RateLimitSettings,
} from '../types/ai';

import { countTokens as countProviderTokens } from '../utils/llm/tokenizer';
import { ModelRouter, SimpleUsageTracker } from './ai/ModelRouter';
import { ProviderRegistry } from '@/plugins/registries/provider-registry';
import { getLogger } from '@/utils/logger';

// ============================================================================
// 常量定义
// ============================================================================

/** USD转CNY汇率 */
const USD_TO_CNY_RATE = 7.2;

/** 默认重试配置 */
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 30000, // 30秒
  backoffMultiplier: 2,
  jitterRatio: 0.25,
};

/** 默认速率限制配置 */
const DEFAULT_RATE_LIMIT_CONFIG = {
  requestsPerMinute: 60,
  tokensPerMinute: 100000,
  concurrentRequests: 2,
  queueTimeoutMs: 30000,
};

const aiServiceLogger = getLogger('ai:service')

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 重试配置
 */
interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterRatio: number;
}

/**
 * 速率限制配置
 */
interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
  queueTimeoutMs: number;
}

/**
 * 速率限制状态
 */
interface RateLimitState {
  requestCount: number;
  tokenCount: number;
  activeRequests: number;
  windowStart: number;
}

/**
 * API响应（OpenAI格式）
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * API响应（Claude格式）
 */
interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * 成本记录
 */
interface CostRecord {
  timestamp: Date;
  model: string;
  provider: AIProvider;
  taskType?: TaskType;
  tokens: TokenUsage;
  cost: CostBreakdown;
}

interface RemainingBudget {
  chapterLimitUSD: number;
  dailyRemainingUSD: number;
  monthlyRemainingUSD: number;
}

// ============================================================================
// 错误类
// ============================================================================

/**
 * AI服务错误
 */
export class AIServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public provider?: AIProvider,
    public details?: any
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

/**
 * 速率限制错误
 */
export class RateLimitError extends AIServiceError {
  constructor(
    public retryAfter: number,
    provider?: AIProvider
  ) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded. Retry after ${retryAfter}ms`,
      provider
    );
    this.name = 'RateLimitError';
  }
}

/**
 * 预算超限错误
 */
export class BudgetExceededError extends AIServiceError {
  constructor(
    public currentSpend: number,
    public limit: number,
    public period: 'daily' | 'monthly' | 'chapter'
  ) {
    super(
      'BUDGET_EXCEEDED',
      `${period} budget exceeded: $${currentSpend.toFixed(4)} / $${limit}`,
      undefined
    );
    this.name = 'BudgetExceededError';
  }
}

/**
 * 模型不可用错误
 */
export class ModelUnavailableError extends AIServiceError {
  constructor(modelId: string, reason: string) {
    super('MODEL_UNAVAILABLE', `Model ${modelId} unavailable: ${reason}`);
    this.name = 'ModelUnavailableError';
  }
}

// ============================================================================
// 速率限制器
// ============================================================================

/**
 * 速率限制器
 */
class RateLimiter {
  private limits: Map<string, RateLimitState> = new Map();

  constructor(private config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {}

  private resolveConfig(override?: Partial<RateLimitSettings>): RateLimitConfig {
    return {
      requestsPerMinute: override?.requestsPerMinute ?? this.config.requestsPerMinute,
      tokensPerMinute: override?.tokensPerMinute ?? this.config.tokensPerMinute,
      concurrentRequests: override?.concurrentRequests ?? this.config.concurrentRequests,
      queueTimeoutMs: override?.queueTimeoutMs ?? this.config.queueTimeoutMs,
    };
  }

  private getState(key: string, now: number = Date.now()): RateLimitState {
    const windowStart = Math.floor(now / 60000) * 60000;
    const existingState = this.limits.get(key);

    if (!existingState || existingState.windowStart !== windowStart) {
      const nextState: RateLimitState = {
        requestCount: 0,
        tokenCount: 0,
        activeRequests: existingState?.activeRequests ?? 0,
        windowStart,
      };
      this.limits.set(key, nextState);
      return nextState;
    }

    return existingState;
  }

  checkLimit(key: string, tokens: number, override?: Partial<RateLimitSettings>): { allowed: boolean; waitTime: number } {
    const config = this.resolveConfig(override);
    const now = Date.now();
    const state = this.getState(key, now);

    if (config.concurrentRequests > 0 && state.activeRequests >= config.concurrentRequests) {
      return { allowed: false, waitTime: 100 };
    }

    if (config.requestsPerMinute > 0 && state.requestCount >= config.requestsPerMinute) {
      return {
        allowed: false,
        waitTime: Math.max(state.windowStart + 60000 - now, 100),
      };
    }

    if (config.tokensPerMinute > 0 && state.tokenCount + tokens > config.tokensPerMinute) {
      return {
        allowed: false,
        waitTime: Math.max(state.windowStart + 60000 - now, 100),
      };
    }

    return { allowed: true, waitTime: 0 };
  }

  async waitForSlot(key: string, tokens: number, override?: Partial<RateLimitSettings>): Promise<void> {
    const startedAt = Date.now();
    const config = this.resolveConfig(override);

    while (true) {
      const result = this.checkLimit(key, tokens, override);
      if (result.allowed) {
        const state = this.getState(key);
        state.requestCount += 1;
        state.tokenCount += tokens;
        state.activeRequests += 1;
        return;
      }

      if (config.queueTimeoutMs > 0 && Date.now() - startedAt >= config.queueTimeoutMs) {
        throw new AIServiceError(
          'RATE_LIMIT_QUEUE_TIMEOUT',
          `Rate limiter queue timeout after ${config.queueTimeoutMs}ms`
        );
      }

      await this.delay(result.waitTime || 100);
    }
  }

  /**
   * 记录请求完成，回填真实 token 并释放并发槽位
   */
  recordRequest(key: string, actualTokens: number, reservedTokens: number = 0): void {
    const state = this.getState(key);
    state.activeRequests = Math.max(state.activeRequests - 1, 0);

    if (reservedTokens > 0) {
      state.tokenCount = Math.max(state.tokenCount - reservedTokens + Math.max(actualTokens, 0), 0);
    }
  }

  releaseReservation(key: string, reservedTokens: number = 0): void {
    const state = this.getState(key);
    state.activeRequests = Math.max(state.activeRequests - 1, 0);

    if (reservedTokens > 0) {
      state.tokenCount = Math.max(state.tokenCount - reservedTokens, 0);
    }
  }

  /**
   * 兼容旧调用名
   */
  async waitForAvailability(key: string, tokens: number, override?: Partial<RateLimitSettings>): Promise<void> {
    await this.waitForSlot(key, tokens, override);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// 成本追踪器
// ============================================================================

/**
 * 成本追踪器
 */
class CostTracker {
  private records: CostRecord[] = [];
  private dailySpend: number = 0;
  private monthlySpend: number = 0;
  private lastDailyReset: Date = new Date();
  private lastMonthlyReset: Date = new Date();

  constructor(private budget?: BudgetConfig) {}

  setBudget(budget?: BudgetConfig): void {
    this.budget = budget;
  }

  private getNormalizedBudget(): Required<BudgetConfig> {
    return {
      chapterLimitUSD: this.budget?.chapterLimitUSD ?? 0,
      dailyLimitUSD: this.budget?.dailyLimitUSD ?? 0,
      monthlyLimitUSD: this.budget?.monthlyLimitUSD ?? 0,
      alertThreshold: this.budget?.alertThreshold ?? 0,
    };
  }

  private resetPeriodsIfNeeded(now: Date = new Date()): void {
    if (now.getDate() !== this.lastDailyReset.getDate() || now.getMonth() !== this.lastDailyReset.getMonth()) {
      this.dailySpend = 0;
      this.lastDailyReset = now;
    }

    if (now.getMonth() !== this.lastMonthlyReset.getMonth() || now.getFullYear() !== this.lastMonthlyReset.getFullYear()) {
      this.monthlySpend = 0;
      this.lastMonthlyReset = now;
    }
  }

  /**
   * 计算成本
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: ModelConfig
  ): CostBreakdown {
    const inputCostUSD = (inputTokens / 1000) * model.costPerInputToken;
    const outputCostUSD = (outputTokens / 1000) * model.costPerOutputToken;
    const totalUSD = inputCostUSD + outputCostUSD;

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * USD_TO_CNY_RATE,
      model: model.id,
    };
  }

  /**
   * 记录成本
   */
  recordCost(record: CostRecord): void {
    this.records.push(record);
    this.updateSpend(record.cost.totalUSD);
    this.checkBudget();
  }

  /**
   * 更新支出
   */
  private updateSpend(amount: number): void {
    const now = new Date();
    this.resetPeriodsIfNeeded(now);
    this.dailySpend += amount;
    this.monthlySpend += amount;
  }

  /**
   * 检查预算
   */
  private checkBudget(): void {
    const budget = this.getNormalizedBudget();

    if (budget.dailyLimitUSD > 0 && this.dailySpend > budget.dailyLimitUSD) {
      throw new BudgetExceededError(this.dailySpend, budget.dailyLimitUSD, 'daily');
    }

    if (budget.monthlyLimitUSD > 0 && this.monthlySpend > budget.monthlyLimitUSD) {
      throw new BudgetExceededError(this.monthlySpend, budget.monthlyLimitUSD, 'monthly');
    }

    if (budget.alertThreshold > 0) {
      if (budget.dailyLimitUSD > 0) {
        const dailyRatio = this.dailySpend / budget.dailyLimitUSD;
        if (dailyRatio >= budget.alertThreshold) {
          aiServiceLogger.warn('Daily budget warning', {
            usedPercent: Number((dailyRatio * 100).toFixed(1)),
            spendUSD: this.dailySpend,
            limitUSD: budget.dailyLimitUSD
          });
        }
      }

      if (budget.monthlyLimitUSD > 0) {
        const monthlyRatio = this.monthlySpend / budget.monthlyLimitUSD;
        if (monthlyRatio >= budget.alertThreshold) {
          aiServiceLogger.warn('Monthly budget warning', {
            usedPercent: Number((monthlyRatio * 100).toFixed(1)),
            spendUSD: this.monthlySpend,
            limitUSD: budget.monthlyLimitUSD
          });
        }
      }
    }
  }

  /**
   * 获取使用统计
   */
  getStatistics(period?: { start: Date; end: Date }): UsageStatistics {
    let filteredRecords = this.records;

    if (period) {
      filteredRecords = this.records.filter(
        r => r.timestamp >= period.start && r.timestamp <= period.end
      );
    }

    const totalTokens = {
      input: 0,
      output: 0,
    };
    let totalCostUSD = 0;
    const byModel = new Map<string, { calls: number; tokens: TokenUsage; cost: CostBreakdown }>();
    const byTaskType = new Map<TaskType, { calls: number; tokens: TokenUsage; cost: CostBreakdown }>();

    for (const record of filteredRecords) {
      totalTokens.input += record.tokens.inputTokens;
      totalTokens.output += record.tokens.outputTokens;
      totalCostUSD += record.cost.totalUSD;

      const modelStats = byModel.get(record.model) || {
        calls: 0,
        tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          inputCostUSD: 0,
          outputCostUSD: 0,
          totalUSD: 0,
          totalCNY: 0,
          model: record.model,
        },
      };
      modelStats.calls++;
      modelStats.tokens.inputTokens += record.tokens.inputTokens;
      modelStats.tokens.outputTokens += record.tokens.outputTokens;
      modelStats.tokens.totalTokens += record.tokens.totalTokens;
      modelStats.cost.totalUSD += record.cost.totalUSD;
      byModel.set(record.model, modelStats);

      if (record.taskType) {
        const taskStats = byTaskType.get(record.taskType) || {
          calls: 0,
          tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          cost: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            inputCostUSD: 0,
            outputCostUSD: 0,
            totalUSD: 0,
            totalCNY: 0,
            model: record.model,
          },
        };
        taskStats.calls++;
        taskStats.tokens.inputTokens += record.tokens.inputTokens;
        taskStats.tokens.outputTokens += record.tokens.outputTokens;
        taskStats.tokens.totalTokens += record.tokens.totalTokens;
        taskStats.cost.totalUSD += record.cost.totalUSD;
        byTaskType.set(record.taskType, taskStats);
      }
    }

    return {
      period: period || {
        start: this.lastMonthlyReset,
        end: new Date(),
      },
      totalCalls: filteredRecords.length,
      totalTokens,
      totalCost: {
        usd: totalCostUSD,
        cny: totalCostUSD * USD_TO_CNY_RATE,
      },
      byModel: Array.from(byModel.entries()).map(([model, stats]) => ({
        model,
        calls: stats.calls,
        tokens: stats.tokens,
        cost: stats.cost,
      })),
      byTaskType: Array.from(byTaskType.entries()).map(([type, stats]) => ({
        type,
        calls: stats.calls,
        tokens: stats.tokens,
        cost: stats.cost,
      })),
    };
  }

  getRemainingBudget(): RemainingBudget {
    this.resetPeriodsIfNeeded();
    const budget = this.getNormalizedBudget();

    return {
      chapterLimitUSD: budget.chapterLimitUSD,
      dailyRemainingUSD: budget.dailyLimitUSD > 0 ? Math.max(budget.dailyLimitUSD - this.dailySpend, 0) : Number.POSITIVE_INFINITY,
      monthlyRemainingUSD: budget.monthlyLimitUSD > 0 ? Math.max(budget.monthlyLimitUSD - this.monthlySpend, 0) : Number.POSITIVE_INFINITY,
    };
  }

  /**
   * 检查是否超过预算
   */
  isOverBudget(projectedCostUSD: number = 0): { chapter: boolean; daily: boolean; monthly: boolean } {
    this.resetPeriodsIfNeeded();
    const budget = this.getNormalizedBudget();

    return {
      chapter: budget.chapterLimitUSD > 0 && projectedCostUSD > budget.chapterLimitUSD,
      daily: budget.dailyLimitUSD > 0 && this.dailySpend + projectedCostUSD > budget.dailyLimitUSD,
      monthly: budget.monthlyLimitUSD > 0 && this.monthlySpend + projectedCostUSD > budget.monthlyLimitUSD,
    };
  }
}

// ============================================================================
// OpenAI Provider
// ============================================================================

/**
 * OpenAI API客户端
 */
class OpenAIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stop: request.stopSequences,
        response_format: request.response_format,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `OPENAI_${response.status}`,
        error.error?.message || `OpenAI API error: ${response.status}`,
        'openai',
        error
      );
    }

    return response.json();
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stop: request.stopSequences,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `OPENAI_${response.status}`,
        error.error?.message || `OpenAI API error: ${response.status}`,
        'openai',
        error
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIServiceError('STREAM_ERROR', 'Failed to get stream reader', 'openai');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }

  /**
   * 将OpenAI响应转换为统一格式
   */
  normalizeResponse(response: OpenAIResponse, model: ModelConfig): ChatResponse {
    const usage: TokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    };

    // 计算成本
    const inputCostUSD = (usage.inputTokens / 1000) * model.costPerInputToken;
    const outputCostUSD = (usage.outputTokens / 1000) * model.costPerOutputToken;
    const totalUSD = inputCostUSD + outputCostUSD;

    const cost: CostBreakdown = {
      ...usage,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * USD_TO_CNY_RATE,
      model: model.id,
    };

    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage,
      cost,
      latency: 0, // 需要在调用时计算
      finishReason: this.mapFinishReason(response.choices[0].finish_reason),
    };
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }
}

// ============================================================================
// Claude Provider
// ============================================================================

/**
 * Claude API客户端
 */
class ClaudeProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<ClaudeResponse> {
    // 分离系统消息
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages.filter(m => m.role !== 'system');

    // V4-①: 结构化输出适配 (Claude通过Tool Calling实现强制JSON)
    const claudePayload: any = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      stop_sequences: request.stopSequences,
      stream: false,
    };

    if (request.response_format?.type === 'json_schema' && request.response_format.json_schema) {
      const schemaName = request.response_format.json_schema.name || "output_format";
      claudePayload.tools = [{
        name: schemaName,
        description: request.response_format.json_schema.description || "Output the structured data",
        input_schema: request.response_format.json_schema.schema
      }];
      claudePayload.tool_choice = { type: "tool", name: schemaName };
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(claudePayload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `CLAUDE_${response.status}`,
        error.error?.message || `Claude API error: ${response.status}`,
        'anthropic',
        error
      );
    }

    const result = await response.json();
    
    // 如果是Claude的Tool Calling，需要提取内容
    if (result.content) {
      const toolUse = result.content.find((c: any) => c.type === 'tool_use');
      if (toolUse && toolUse.input) {
        result.content = [{ type: 'text', text: typeof toolUse.input === 'string' ? toolUse.input : JSON.stringify(toolUse.input) }];
      }
    }
    
    return result;
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages.filter(m => m.role !== 'system');

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        system: systemMessage?.content,
        messages: conversationMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        temperature: request.temperature ?? 0.7,
        stop_sequences: request.stopSequences,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `CLAUDE_${response.status}`,
        error.error?.message || `Claude API error: ${response.status}`,
        'anthropic',
        error
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIServiceError('STREAM_ERROR', 'Failed to get stream reader', 'anthropic');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }

  /**
   * 将Claude响应转换为统一格式
   */
  normalizeResponse(response: ClaudeResponse, model: ModelConfig): ChatResponse {
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };

    // 计算成本
    const inputCostUSD = (usage.inputTokens / 1000) * model.costPerInputToken;
    const outputCostUSD = (usage.outputTokens / 1000) * model.costPerOutputToken;
    const totalUSD = inputCostUSD + outputCostUSD;

    const cost: CostBreakdown = {
      ...usage,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * USD_TO_CNY_RATE,
      model: model.id,
    };

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      model: response.model,
      usage,
      cost,
      latency: 0,
      finishReason: this.mapStopReason(response.stop_reason),
    };
  }

  private mapStopReason(reason: string | null): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }
}

// ============================================================================
// 本地模型 Provider
// ============================================================================

/**
 * 本地模型API客户端
 */
class LocalProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model?: string }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model || 'llama3:8b';
  }

  /**
   * 发送聊天请求（OpenAI兼容格式）
   */
  async chat(request: ChatRequest): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `LOCAL_${response.status}`,
        error.error?.message || `Local API error: ${response.status}`,
        'local',
        error
      );
    }

    return response.json();
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `LOCAL_${response.status}`,
        error.error?.message || `Local API error: ${response.status}`,
        'local',
        error
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIServiceError('STREAM_ERROR', 'Failed to get stream reader', 'local');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  }
}

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
    // 选择模型
    const model = this.modelRouter.selectModel(
      context || {
        type: 'chapter',
        complexity: 'medium',
        priority: 'balanced',
      }
    );

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

    // 执行请求（带重试）
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
        taskType: context?.type,
        tokens: response.usage,
        cost: response.cost,
      });
      this.rateLimiter.recordRequest(rateLimitKey, response.usage.totalTokens, reservedTokens);

      return response;
    }).catch(error => {
      this.rateLimiter.releaseReservation(rateLimitKey, reservedTokens);
      throw error;
    });
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
    // 选择模型
    const model = this.modelRouter.selectModel(
      context || {
        type: 'chapter',
        complexity: 'medium',
        priority: 'balanced',
      }
    );

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
        taskType: context?.type,
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

      case 'custom':
        if (!this.providerRegistry) {
          throw new AIServiceError('PROVIDER_REGISTRY_NOT_CONFIGURED', 'Provider registry not available');
        }
        // 尝试通过模型ID找到对应的provider
        const providerId = request.model?.split('-')[0] || 'custom';
        yield* this.providerRegistry.chatStream(providerId, request);
        break;

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
      content: response.choices[0].message.content,
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
    const providerId = model.id.split('-')[0]; // 假设模型ID格式为 "provider-model"

    const startTime = Date.now();

    try {
      const response = await this.providerRegistry.chat(providerId, request);
      response.latency = Date.now() - startTime;
      return response;
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
        return sum + countProviderTokens(msg.content || '', provider as any);
      } catch {
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
// 导出
// ============================================================================

export type {
  AIServiceConfig,
  BudgetConfig,
  CostRecord,
  RetryConfig,
  RateLimitConfig,
};

export {
  RateLimiter,
  CostTracker,
};
