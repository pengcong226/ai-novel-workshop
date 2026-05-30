import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModelRouter, SimpleUsageTracker } from '../ModelRouter'
import type { ModelConfig, TaskContext } from '../../../types/ai'

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

describe('ModelRouter', () => {
  const planningModels: ModelConfig[] = [
    makeModel({ id: 'planner-1', tier: 'planning', provider: 'openai', costPerInputToken: 0.01, costPerOutputToken: 0.03, rpmLimit: 500 }),
    makeModel({ id: 'planner-2', tier: 'planning', provider: 'anthropic', costPerInputToken: 0.003, costPerOutputToken: 0.015, rpmLimit: 1000 }),
  ]
  const writingModels: ModelConfig[] = [
    makeModel({ id: 'writer-1', tier: 'writing', provider: 'openai', costPerInputToken: 0.001, costPerOutputToken: 0.003, rpmLimit: 3500 }),
    makeModel({ id: 'writer-2', tier: 'writing', provider: 'anthropic', costPerInputToken: 0.0005, costPerOutputToken: 0.002, rpmLimit: 4000 }),
  ]
  const checkingModels: ModelConfig[] = [
    makeModel({ id: 'checker-1', tier: 'checking', provider: 'openai', costPerInputToken: 0.0005, costPerOutputToken: 0.0015, rpmLimit: 3500 }),
  ]

  const allModels = [...planningModels, ...writingModels, ...checkingModels]

  let tracker: SimpleUsageTracker
  let router: ModelRouter

  beforeEach(() => {
    tracker = new SimpleUsageTracker(allModels)
    router = new ModelRouter(tracker, {
      models: { planning: planningModels, writing: writingModels, checking: checkingModels },
    })
  })

  // ---- selectModel ----

  it('selects a writing-tier model for chapter tasks', () => {
    const model = router.selectModel(makeContext({ type: 'chapter' }))
    expect(model.tier).toBe('writing')
  })

  it('selects a planning-tier model for worldbuilding tasks', () => {
    const model = router.selectModel(makeContext({ type: 'worldbuilding', complexity: 'high' }))
    expect(model.tier).toBe('planning')
  })

  it('selects a checking-tier model for check tasks', () => {
    const model = router.selectModel(makeContext({ type: 'check' }))
    expect(model.tier).toBe('checking')
  })

  it('selects a planning-tier model for outline tasks', () => {
    const model = router.selectModel(makeContext({ type: 'outline' }))
    expect(model.tier).toBe('planning')
  })

  // ---- getRankedCandidates ----

  it('returns candidates with preferred model first', () => {
    const candidates = router.getRankedCandidates(
      makeContext({ type: 'chapter', preferredModel: 'writer-2' }),
    )
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0].id).toBe('writer-2')
  })

  it('falls back to lower tier models when tier has no available models', () => {
    router.setModelEnabled('planner-1', false)
    router.setModelEnabled('planner-2', false)

    const candidates = router.getRankedCandidates(
      makeContext({ type: 'worldbuilding', complexity: 'high' }),
    )
    const tierSet = new Set(candidates.map(m => m.tier))
    expect(tierSet.has('writing')).toBe(true)
  })

  it('excludes disabled models from candidates', () => {
    router.setModelEnabled('writer-1', false)

    const candidates = router.getRankedCandidates(makeContext({ type: 'chapter' }))
    const ids = candidates.map(m => m.id)
    expect(ids).not.toContain('writer-1')
  })

  it('excludes models with insufficient quota from primary candidates', () => {
    // Exhaust quota for writer-1 (rpmLimit=3500, need >350 to drop below 0.1)
    for (let i = 0; i < 3200; i++) {
      tracker.recordUsage('writer-1', 100)
    }

    const candidates = router.getRankedCandidates(makeContext({ type: 'chapter' }))
    // writer-1 has ~9% availability, below the 10% threshold for primary ranking
    // Primary candidates (first batch) should not include writer-1
    // The "all other models" fallback section may include it
    const tierCandidates = candidates.filter(m => m.tier === 'writing')
    // writer-2 should be first among writing models since writer-1 is quota-limited
    expect(tierCandidates[0].id).toBe('writer-2')
  })

  // ---- getModel ----

  it('returns model config by id', () => {
    const model = router.getModel('writer-1')
    expect(model).toBeDefined()
    expect(model!.id).toBe('writer-1')
  })

  it('returns undefined for unknown model id', () => {
    const model = router.getModel('nonexistent')
    expect(model).toBeUndefined()
  })

  // ---- getAvailableModelsList ----

  it('returns only enabled models', () => {
    router.setModelEnabled('checker-1', false)
    const available = router.getAvailableModelsList()
    expect(available.every(m => m.enabled)).toBe(true)
    expect(available.find(m => m.id === 'checker-1')).toBeUndefined()
  })

  // ---- updateModelConfig ----

  it('updates model configuration successfully', () => {
    const updated = router.updateModelConfig('writer-1', { rpmLimit: 9999 })
    expect(updated).toBe(true)
    expect(router.getModel('writer-1')!.rpmLimit).toBe(9999)
  })

  it('returns false when updating nonexistent model', () => {
    const updated = router.updateModelConfig('nonexistent', { rpmLimit: 1 })
    expect(updated).toBe(false)
  })

  // ---- priority weighting ----

  it('quality priority favors higher-tier models for chapter tasks', () => {
    const candidates = router.getRankedCandidates(
      makeContext({ type: 'chapter', priority: 'quality' }),
    )
    expect(candidates[0].tier).toBe('writing')
  })

  it('speed priority favors high-RPM models', () => {
    const candidates = router.getRankedCandidates(
      makeContext({ type: 'chapter', priority: 'speed' }),
    )
    // writer-2 has rpmLimit=4000 > writer-1's 3500
    expect(candidates[0].id).toBe('writer-2')
  })
})

describe('SimpleUsageTracker', () => {
  it('returns full availability for unused model', () => {
    const tracker = new SimpleUsageTracker([makeModel({ id: 'm1', rpmLimit: 100 })])
    expect(tracker.getQuotaAvailability('m1')).toBe(1)
  })

  it('decrements availability on recordUsage', () => {
    const tracker = new SimpleUsageTracker([makeModel({ id: 'm1', rpmLimit: 100 })])
    tracker.recordUsage('m1', 500)
    expect(tracker.getQuotaAvailability('m1')).toBeCloseTo(0.99, 2)
  })

  it('returns 0 for unknown model id', () => {
    const tracker = new SimpleUsageTracker([])
    expect(tracker.getQuotaAvailability('unknown')).toBe(0)
  })

  it('reset restores all quotas to full', () => {
    const tracker = new SimpleUsageTracker([makeModel({ id: 'm1', rpmLimit: 10 })])
    for (let i = 0; i < 10; i++) {
      tracker.recordUsage('m1', 100)
    }
    expect(tracker.getQuotaAvailability('m1')).toBe(0)

    tracker.reset()
    expect(tracker.getQuotaAvailability('m1')).toBe(1)
  })
})
