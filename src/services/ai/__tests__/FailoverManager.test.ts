import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FailoverManager } from '../FailoverManager'
import { ModelRouter, SimpleUsageTracker } from '../ModelRouter'
import type { ModelConfig, TaskContext } from '../../../types/ai'
import { AIError } from '@/utils/errors'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

function makeModel(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'test-model',
    provider: 'openai',
    model: 'test-model-v1',
    tier: 'writing',
    costPerInputToken: 0.005,
    costPerOutputToken: 0.015,
    maxTokens: 4096,
    rpmLimit: 600,
    enabled: true,
    ...overrides,
  }
}

function makeContext(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    type: 'chapter',
    complexity: 'medium',
    priority: 'balanced',
    ...overrides,
  }
}

describe('FailoverManager', () => {
  const models: ModelConfig[] = [
    makeModel({ id: 'primary', provider: 'openai', tier: 'writing', rpmLimit: 1000 }),
    makeModel({ id: 'secondary', provider: 'anthropic', tier: 'writing', rpmLimit: 1000 }),
    makeModel({ id: 'tertiary', provider: 'local', tier: 'checking', rpmLimit: 500 }),
  ]

  let tracker: SimpleUsageTracker
  let router: ModelRouter
  let manager: FailoverManager

  beforeEach(() => {
    vi.useFakeTimers()
    tracker = new SimpleUsageTracker(models)
    router = new ModelRouter(tracker, {
      models: { planning: [], writing: [models[0], models[1]], checking: [models[2]] },
    })
    manager = new FailoverManager(router, { failureThreshold: 2, resetTimeoutMs: 10000 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---- successful execution ----

  it('returns result from first candidate when request succeeds', async () => {
    const requestFn = vi.fn().mockResolvedValue('ok')

    const { result, finalModel } = await manager.executeWithFailover(
      makeContext(),
      requestFn,
    )

    expect(result).toBe('ok')
    expect(finalModel.id).toBe('primary')
    expect(requestFn).toHaveBeenCalledTimes(1)
  })

  // ---- failover on error ----

  it('falls over to next candidate on transient error', async () => {
    const requestFn = vi.fn().mockImplementation(async (model: ModelConfig) => {
      if (model.id === 'primary') {
        throw new Error('503 Service Unavailable')
      }
      return 'fallback-ok'
    })

    const onSwitch = vi.fn()
    const { result, finalModel } = await manager.executeWithFailover(
      makeContext(),
      requestFn,
      onSwitch,
    )

    expect(result).toBe('fallback-ok')
    expect(finalModel.id).toBe('secondary')
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })

  // ---- all models fail ----

  it('throws AIError when all candidates fail', async () => {
    const requestFn = vi.fn().mockRejectedValue(new Error('503'))

    await expect(
      manager.executeWithFailover(makeContext(), requestFn),
    ).rejects.toThrow(AIError)
  })

  // ---- breaker skips open circuits ----

  it('skips circuit-broken providers and uses next available', async () => {
    const requestFn = vi.fn().mockImplementation(async (model: ModelConfig) => {
      if (model.id === 'primary') {
        throw new Error('502 Bad Gateway')
      }
      return 'ok'
    })

    // Trip the primary breaker (threshold=2)
    await manager.executeWithFailover(makeContext(), requestFn).catch(() => {})
    await manager.executeWithFailover(makeContext(), requestFn).catch(() => {})

    // Primary breaker should now be open
    const breaker = manager.getBreaker('openai')
    expect(breaker.getState()).toBe('OPEN')

    // Next call should skip primary
    const successFn = vi.fn().mockResolvedValue('ok')
    const { finalModel } = await manager.executeWithFailover(makeContext(), successFn)
    expect(finalModel.id).not.toBe('primary')
  })

  // ---- onSwitch callback ----

  it('calls onSwitch callback on model switch', async () => {
    const requestFn = vi.fn().mockImplementation(async (model: ModelConfig) => {
      if (model.id === 'primary' || model.id === 'secondary') {
        throw new Error('timeout')
      }
      return 'ok'
    })

    const onSwitch = vi.fn()
    await manager.executeWithFailover(makeContext(), requestFn, onSwitch)

    expect(onSwitch).toHaveBeenCalled()
  })

  // ---- getBreaker ----

  it('creates and returns breaker for new provider', () => {
    const breaker = manager.getBreaker('new-provider')
    expect(breaker).toBeDefined()
    expect(breaker.getState()).toBe('CLOSED')
  })

  it('returns same breaker instance for same provider', () => {
    const b1 = manager.getBreaker('openai')
    const b2 = manager.getBreaker('openai')
    expect(b1).toBe(b2)
  })

  // ---- empty candidates ----

  it('throws AIError when all models are disabled and requestFn rejects fallback', async () => {
    for (const model of models) {
      router.setModelEnabled(model.id, false)
    }

    // The fallback model from DEFAULT_MODELS still exists; make requestFn reject for any model
    const failFn = vi.fn().mockRejectedValue(new Error('no models'))
    await expect(
      manager.executeWithFailover(makeContext(), failFn),
    ).rejects.toThrow(AIError)

    // Restore model enabled state so subsequent tests are not affected
    for (const model of models) {
      router.setModelEnabled(model.id, true)
    }
  })

  // ---- breaker success resets state ----

  it('resets breaker on successful request after previous failure', async () => {
    const requestFn = vi.fn().mockImplementation(async (model: ModelConfig) => {
      if (model.provider === 'openai') throw new Error('503')
      return 'ok'
    })

    await manager.executeWithFailover(makeContext(), requestFn)

    // openai had one transient failure (below threshold=2), breaker should still be CLOSED
    const primaryBreaker = manager.getBreaker('openai')
    expect(primaryBreaker.getState()).toBe('CLOSED')
    // The successful model (anthropic) breaker should be CLOSED too
    expect(requestFn).toHaveBeenCalled()
  })

  // ---- fatal errors immediately open breaker ----

  it('fatal error (401) immediately opens breaker', async () => {
    const requestFn = vi.fn().mockImplementation(async (model: ModelConfig) => {
      if (model.provider === 'openai') {
        throw new Error('401 Unauthorized')
      }
      return 'ok'
    })

    // Use preferredModel to ensure the openai model is tried first
    await manager.executeWithFailover(
      makeContext({ preferredModel: 'primary' }),
      requestFn,
    )

    const openaiBreaker = manager.getBreaker('openai')
    expect(openaiBreaker.getState()).toBe('OPEN')
  })
})
