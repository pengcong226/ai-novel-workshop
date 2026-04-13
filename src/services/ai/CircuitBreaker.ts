/**
 * 熔断器状态机
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

import { getLogger } from '@/utils/logger'
const logger = getLogger('circuit-breaker')

/**
 * 熔断器配置
 */
export interface BreakerConfig {
  /** 连续失败多少次触发熔断 */
  failureThreshold: number;
  /** 熔断后多久尝试半开探活 (ms) */
  resetTimeoutMs: number;
}

/**
 * 针对大模型提供商的熔断器
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private nextAttemptTimer: number = 0;

  constructor(
    public readonly providerId: string,
    private config: BreakerConfig
  ) {}

  /**
   * 判断当前是否允许发送请求
   */
  canRequest(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttemptTimer) {
        // 冷却时间到，进入半开状态，放行一次探活请求
        this.state = 'HALF_OPEN';
        return true;
      }
      // 还在熔断冷却期内，直接拒绝
      return false;
    }

    // HALF_OPEN 状态
    return true;
  }

  /**
   * 请求成功时调用，重置状态
   */
  onSuccess(): void {
    if (this.state !== 'CLOSED') {
      logger.info(`Provider ${this.providerId} 探活成功，恢复为 CLOSED 状态。`);
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  /**
   * 请求失败时调用，记录失败并评估是否熔断
   */
  onFailure(error: any): void {
    if (this.isTransientError(error)) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTimer = Date.now() + this.config.resetTimeoutMs;
        logger.warn(`Provider ${this.providerId} 已熔断！连续失败 ${this.failureCount} 次，将在 ${this.config.resetTimeoutMs / 1000}s 后尝试探活。`);
      }
    } else if (this.isFatalError(error)) {
      this.forceOpen();
    }
  }

  /**
   * 强制进入长时间熔断
   */
  forceOpen(): void {
    this.state = 'OPEN';
    this.nextAttemptTimer = Date.now() + 5 * 60 * 1000; // 长时间熔断 5 分钟
    logger.error(`Provider ${this.providerId} 发生致命错误 (如认证失败等)，强制熔断 5 分钟！`);
  }

  getState(): CircuitState {
    return this.state;
  }

  /**
   * 判断是否是瞬态错误 (可以重试或熔断的错误)
   */
  private isTransientError(error: any): boolean {
    const errStr = String(error?.message || error);
    // 网络超时、网关错误、内部错误、限流
    if (
      errStr.includes('429') ||
      errStr.includes('500') ||
      errStr.includes('502') ||
      errStr.includes('503') ||
      errStr.includes('504') ||
      errStr.includes('timeout') ||
      errStr.includes('fetch')
    ) {
      return true;
    }
    if (error?.name === 'RateLimitError' || error?.code === 'RATE_LIMIT_EXCEEDED') {
      return true;
    }
    return false;
  }

  /**
   * 判断是否是致命错误 (不该重试，必须直接熔断或抛出)
   */
  private isFatalError(error: any): boolean {
    const errStr = String(error?.message || error);
    // 认证失败、账户欠费、无效的模型
    if (
      errStr.includes('401') ||
      errStr.includes('403') ||
      errStr.includes('invalid_api_key') ||
      errStr.includes('insufficient_quota') ||
      errStr.includes('model_not_found')
    ) {
      return true;
    }
    return false;
  }
}
