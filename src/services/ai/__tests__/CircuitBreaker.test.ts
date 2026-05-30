import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker } from '../CircuitBreaker'
import type { BreakerConfig } from '../CircuitBreaker'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('CircuitBreaker', () => {
  const defaultConfig: BreakerConfig = {
    failureThreshold: 3,
    resetTimeoutMs: 10_000,
  }

  let breaker: CircuitBreaker

  beforeEach(() => {
    vi.useFakeTimers()
    breaker = new CircuitBreaker('test-provider', defaultConfig)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- canRequest ----

  it('allows requests in CLOSED state', () => {
    expect(breaker.canRequest()).toBe(true)
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('blocks requests during OPEN cooldown period', () => {
    // Trigger enough failures to open
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('503 Service Unavailable'))
    }
    expect(breaker.getState()).toBe('OPEN')
    expect(breaker.canRequest()).toBe(false)
  })

  it('transitions from OPEN to HALF_OPEN after cooldown expires', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('503 Service Unavailable'))
    }
    expect(breaker.getState()).toBe('OPEN')

    // Advance time past the reset timeout
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 1)

    expect(breaker.canRequest()).toBe(true)
    expect(breaker.getState()).toBe('HALF_OPEN')
  })

  it('allows requests in HALF_OPEN state', () => {
    // Move to OPEN then HALF_OPEN
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('timeout'))
    }
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 1)
    breaker.canRequest() // triggers HALF_OPEN

    // Still allowed in HALF_OPEN
    expect(breaker.canRequest()).toBe(true)
  })

  // ---- onSuccess ----

  it('resets to CLOSED after success in HALF_OPEN', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('502'))
    }
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 1)
    breaker.canRequest() // HALF_OPEN
    breaker.onSuccess()

    expect(breaker.getState()).toBe('CLOSED')
    expect(breaker.canRequest()).toBe(true)
  })

  it('resets failure count on success', () => {
    // Fail twice (below threshold)
    breaker.onFailure(new Error('500'))
    breaker.onFailure(new Error('500'))

    // Success resets count
    breaker.onSuccess()

    // Now fail twice again - should NOT open because count was reset
    breaker.onFailure(new Error('500'))
    breaker.onFailure(new Error('500'))
    expect(breaker.getState()).toBe('CLOSED')
  })

  // ---- onFailure with transient errors ----

  it('opens circuit after reaching failure threshold with transient errors', () => {
    for (let i = 0; i < defaultConfig.failureThreshold - 1; i++) {
      breaker.onFailure(new Error('503'))
      expect(breaker.getState()).toBe('CLOSED')
    }
    breaker.onFailure(new Error('503'))
    expect(breaker.getState()).toBe('OPEN')
  })

  it('recognizes 429 rate limit as transient error', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('429 Too Many Requests'))
    }
    expect(breaker.getState()).toBe('OPEN')
  })

  it('recognizes fetch network errors as transient', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('fetch failed'))
    }
    expect(breaker.getState()).toBe('OPEN')
  })

  it('recognizes RateLimitError object as transient', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      const err = new Error('rate limited')
      ;(err as any).name = 'RateLimitError'
      breaker.onFailure(err)
    }
    expect(breaker.getState()).toBe('OPEN')
  })

  it('recognizes RATE_LIMIT_EXCEEDED code as transient', () => {
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      const err = new Error('limited')
      ;(err as any).code = 'RATE_LIMIT_EXCEEDED'
      breaker.onFailure(err)
    }
    expect(breaker.getState()).toBe('OPEN')
  })

  // ---- onFailure with fatal errors ----

  it('force-opens circuit on 401 authentication error', () => {
    breaker.onFailure(new Error('401 Unauthorized'))
    expect(breaker.getState()).toBe('OPEN')
  })

  it('force-opens circuit on invalid_api_key error', () => {
    breaker.onFailure(new Error('invalid_api_key provided'))
    expect(breaker.getState()).toBe('OPEN')
  })

  it('force-opens circuit on insufficient_quota error', () => {
    breaker.onFailure(new Error('insufficient_quota'))
    expect(breaker.getState()).toBe('OPEN')
  })

  it('fatal errors use 5-minute cooldown', () => {
    breaker.onFailure(new Error('403 Forbidden'))

    // Should still be open at 4:59
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)
    expect(breaker.canRequest()).toBe(false)

    // Advance 1 more ms to exceed the strict ">" comparison
    vi.advanceTimersByTime(2)
    expect(breaker.canRequest()).toBe(true)
    expect(breaker.getState()).toBe('HALF_OPEN')
  })

  // ---- non-transient, non-fatal errors ----

  it('ignores non-transient, non-fatal errors (no state change)', () => {
    breaker.onFailure(new Error('unknown error'))
    breaker.onFailure(new Error('some other problem'))
    expect(breaker.getState()).toBe('CLOSED')
  })

  // ---- forceOpen ----

  it('forceOpen puts breaker in OPEN with 5-minute cooldown', () => {
    breaker.forceOpen()
    expect(breaker.getState()).toBe('OPEN')
    expect(breaker.canRequest()).toBe(false)

    // Must exceed the strict ">" comparison: advance past exactly 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(breaker.canRequest()).toBe(true)
    expect(breaker.getState()).toBe('HALF_OPEN')
  })

  // ---- HALF_OPEN failure re-opens ----

  it('failure in HALF_OPEN re-opens the circuit', () => {
    // Get to HALF_OPEN
    for (let i = 0; i < defaultConfig.failureThreshold; i++) {
      breaker.onFailure(new Error('503'))
    }
    vi.advanceTimersByTime(defaultConfig.resetTimeoutMs + 1)
    breaker.canRequest() // HALF_OPEN
    expect(breaker.getState()).toBe('HALF_OPEN')

    // Fail again -> back to OPEN
    breaker.onFailure(new Error('503'))
    expect(breaker.getState()).toBe('OPEN')
  })
})
