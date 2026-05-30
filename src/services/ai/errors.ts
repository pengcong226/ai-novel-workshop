/**
 * AI服务错误类定义
 * @module services/ai/errors
 *
 * 包含AI服务相关的所有自定义错误类和断言辅助函数
 */

import type { AIProvider } from './types';
import { isBrowserOnline } from '@/composables/useOnlineStatus';

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

export function assertOnlineForAIRequest(provider: AIProvider): void {
  if (provider !== 'local' && !isBrowserOnline()) {
    throw new AIServiceError('OFFLINE', '当前处于离线状态，无法调用 AI 服务。', provider)
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
