import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '../rate-limiter'
import type { RateLimitConfig } from '../types'
import { AIServiceError } from '../errors'

describe('RateLimiter', () => {
  const defaultConfig: RateLimitConfig = {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
    concurrentRequests: 2,
    queueTimeoutMs: 5000,
  }

  let limiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00Z'))
    limiter = new RateLimiter(defaultConfig)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- checkLimit ----

  it('allows request when under all limits', () => {
    const result = limiter.checkLimit('openai', 1000)
    expect(result.allowed).toBe(true)
    expect(result.waitTime).toBe(0)
  })

  it('blocks request when concurrent limit is reached', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      concurrentRequests: 1,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    // Acquire the single concurrent slot
    await rl.waitForSlot('openai', 100)

    // Now check -- concurrent limit should block
    const result = rl.checkLimit('openai', 100)
    expect(result.allowed).toBe(false)
    expect(result.waitTime).toBe(100)
  })

  it('blocks request when requests-per-minute limit is reached', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 2,
      tokensPerMinute: 0,
      concurrentRequests: 0,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    // Consume the 2 allowed requests
    await rl.waitForSlot('openai', 100)
    await rl.waitForSlot('openai', 100)

    // Third should be blocked
    const result = rl.checkLimit('openai', 100)
    expect(result.allowed).toBe(false)
    expect(result.waitTime).toBeGreaterThan(0)
  })

  it('rejects when tokens-per-minute would be exceeded', () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 0,
      tokensPerMinute: 5000,
      concurrentRequests: 0,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    const result = rl.checkLimit('openai', 6000)
    expect(result.allowed).toBe(false)
    expect(result.waitTime).toBeGreaterThan(0)
  })

  it('allows token request when within token-per-minute budget', () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 0,
      tokensPerMinute: 10000,
      concurrentRequests: 0,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    const result = rl.checkLimit('openai', 5000)
    expect(result.allowed).toBe(true)
    expect(result.waitTime).toBe(0)
  })

  // ---- waitForSlot ----

  it('acquires a slot successfully within limits', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 10,
      tokensPerMinute: 50000,
      concurrentRequests: 5,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    await expect(rl.waitForSlot('openai', 1000)).resolves.toBeUndefined()
  })

  it('throws AIServiceError on queue timeout', async () => {
    // Use concurrent limit (waitTime=100ms per iteration) so we can trigger
    // the queue timeout quickly with fake timer advances
    const config: RateLimitConfig = {
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      concurrentRequests: 1,
      queueTimeoutMs: 250,
    }
    const rl = new RateLimiter(config)

    // Acquire the single concurrent slot
    await rl.waitForSlot('openai', 100)

    // Next request is blocked by concurrent limit (waitTime=100ms).
    // Each loop iteration delays 100ms then re-checks the queue timeout.
    // After ~250ms the queue timeout should fire.
    const promise = rl.waitForSlot('openai', 100)

    // Attach rejection handler immediately to avoid unhandled rejection
    const caught = promise.catch((e: unknown) => e)

    await vi.advanceTimersByTimeAsync(300)

    const error = await caught
    expect(error).toBeInstanceOf(AIServiceError)
    expect((error as AIServiceError).code).toBe('RATE_LIMIT_QUEUE_TIMEOUT')
  })

  it('waits and succeeds when slot becomes available after window rollover', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 1,
      tokensPerMinute: 0,
      concurrentRequests: 0,
      queueTimeoutMs: 120000,
    }
    const rl = new RateLimiter(config)

    // Fill the slot in current window
    await rl.waitForSlot('openai', 100)

    // Start waiting for next slot
    const waitPromise = rl.waitForSlot('openai', 100)

    // Advance to next minute window
    await vi.advanceTimersByTimeAsync(60_000)

    await expect(waitPromise).resolves.toBeUndefined()
  })

  // ---- recordRequest ----

  it('recordRequest releases active request count', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 10,
      tokensPerMinute: 50000,
      concurrentRequests: 1,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    // Acquire the only concurrent slot
    await rl.waitForSlot('openai', 1000)

    // Should be blocked now
    expect(rl.checkLimit('openai', 100).allowed).toBe(false)

    // Record request completion (releases the slot)
    rl.recordRequest('openai', 800, 1000)

    // Should be allowed again
    expect(rl.checkLimit('openai', 100).allowed).toBe(true)
  })

  // ---- releaseReservation ----

  it('releaseReservation frees concurrent slot without adjusting token count', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 10,
      tokensPerMinute: 50000,
      concurrentRequests: 1,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    await rl.waitForSlot('openai', 1000)
    expect(rl.checkLimit('openai', 100).allowed).toBe(false)

    // Release the reservation (frees concurrent slot and subtracts reserved tokens)
    rl.releaseReservation('openai', 1000)

    expect(rl.checkLimit('openai', 100).allowed).toBe(true)
  })

  // ---- waitForAvailability (compat alias) ----

  it('waitForAvailability delegates to waitForSlot', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 10,
      tokensPerMinute: 50000,
      concurrentRequests: 5,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    await expect(rl.waitForAvailability('openai', 1000)).resolves.toBeUndefined()
  })

  // ---- override config ----

  it('uses per-request config override when provided', () => {
    const rl = new RateLimiter({
      requestsPerMinute: 100,
      tokensPerMinute: 1000000,
      concurrentRequests: 10,
      queueTimeoutMs: 5000,
    })

    // Override tokens to a very low limit
    const result = rl.checkLimit('openai', 50000, { tokensPerMinute: 10000 })
    expect(result.allowed).toBe(false)
  })

  // ---- window reset ----

  it('resets request and token counts when time window rolls over', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 1,
      tokensPerMinute: 1000,
      concurrentRequests: 0,
      queueTimeoutMs: 30000,
    }
    const rl = new RateLimiter(config)

    // Fill up in current window
    await rl.waitForSlot('openai', 500)

    // Should be blocked now
    expect(rl.checkLimit('openai', 500).allowed).toBe(false)

    // Advance to next minute window
    vi.advanceTimersByTime(60_000)

    // Should be allowed again in new window
    expect(rl.checkLimit('openai', 500).allowed).toBe(true)
  })

  // ---- independent keys ----

  it('tracks limits independently per key', async () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 1,
      tokensPerMinute: 5000,
      concurrentRequests: 0,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    await rl.waitForSlot('openai', 1000)

    // OpenAI is at limit, but anthropic should still be available
    expect(rl.checkLimit('anthropic', 1000).allowed).toBe(true)
  })

  // ---- zero limits disabled ----

  it('treats zero limits as disabled', () => {
    const config: RateLimitConfig = {
      requestsPerMinute: 0,
      tokensPerMinute: 0,
      concurrentRequests: 0,
      queueTimeoutMs: 5000,
    }
    const rl = new RateLimiter(config)

    const result = rl.checkLimit('openai', 999999)
    expect(result.allowed).toBe(true)
    expect(result.waitTime).toBe(0)
  })
})
