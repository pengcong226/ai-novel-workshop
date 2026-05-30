/**
 * Token-bucket rate limiter for API call gating.
 *
 * Designed for client-side rate limiting of AI API calls to prevent
 * accidental or malicious burst-flooding of paid endpoints.
 */

import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:rateLimiter')

export interface RateLimiterConfig {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number
  /** Sliding window duration in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Milliseconds until the next request is allowed (0 if allowed now). */
  retryAfterMs: number
}

/**
 * Sliding-window rate limiter.
 *
 * Tracks timestamps of recent requests and rejects new ones that would
 * exceed the configured limit within the window.
 */
export class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests
    this.windowMs = config.windowMs
  }

  /**
   * Check whether a new request is allowed under the rate limit.
   * If allowed, the request timestamp is recorded.
   */
  tryAcquire(): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Evict expired timestamps
    while (this.timestamps.length > 0 && this.timestamps[0] <= windowStart) {
      this.timestamps.shift()
    }

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0]
      const retryAfterMs = oldestInWindow + this.windowMs - now
      logger.warn('Rate limit exceeded', {
        count: this.timestamps.length,
        maxRequests: this.maxRequests,
        retryAfterMs,
      })
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
    }

    this.timestamps.push(now)
    return { allowed: true, retryAfterMs: 0 }
  }

  /** Current number of requests in the active window. */
  get currentCount(): number {
    const windowStart = Date.now() - this.windowMs
    while (this.timestamps.length > 0 && this.timestamps[0] <= windowStart) {
      this.timestamps.shift()
    }
    return this.timestamps.length
  }

  /** Reset the limiter state. */
  reset(): void {
    this.timestamps.length = 0
  }
}
