/**
 * AI服务速率限制器
 * @module services/ai/rate-limiter
 *
 * 提供基于时间窗口的请求速率限制、并发控制和队列超时管理
 */

import type { RateLimitConfig, RateLimitState } from './types';
import { DEFAULT_RATE_LIMIT_CONFIG } from './types';
import type { RateLimitSettings } from '../../types/ai';
import { AIServiceError } from './errors';

/**
 * 速率限制器
 */
export class RateLimiter {
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

    let slotAcquired = false;
    while (!slotAcquired) {
      const result = this.checkLimit(key, tokens, override);
      if (result.allowed) {
        const state = this.getState(key);
        state.requestCount += 1;
        state.tokenCount += tokens;
        state.activeRequests += 1;
        slotAcquired = true;
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
