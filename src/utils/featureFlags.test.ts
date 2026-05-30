import { afterEach, describe, expect, it } from 'vitest'
import {
  isFeatureEnabled,
  setFeatureFlag,
  clearFeatureFlagOverride,
  resetAllFeatureFlags,
  getAllFlagValues,
  getFeatureFlagRef,
  syncRemoteFlags,
  resetFeatureFlagsForTest,
} from '@/utils/featureFlags'
import { FeatureFlagKeys } from '@/constants/features'

describe('featureFlags', () => {
  afterEach(() => {
    resetFeatureFlagsForTest()
    localStorage.clear()
  })

  it('returns default values from definitions (sandbox-graph defaults to true)', () => {
    expect(isFeatureEnabled(FeatureFlagKeys.SANDBOX_GRAPH)).toBe(true)
  })

  it('returns false for vector-search which defaults to false', () => {
    expect(isFeatureEnabled(FeatureFlagKeys.VECTOR_SEARCH)).toBe(false)
  })

  it('setFeatureFlag toggles a flag and persists to localStorage', () => {
    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, true)

    expect(isFeatureEnabled(FeatureFlagKeys.VECTOR_SEARCH)).toBe(true)
    expect(localStorage.getItem(`__ff_${FeatureFlagKeys.VECTOR_SEARCH}`)).toBe('true')
  })

  it('clearFeatureFlagOverride reverts a flag to its definition default', () => {
    setFeatureFlag(FeatureFlagKeys.SANDBOX_GRAPH, false)
    expect(isFeatureEnabled(FeatureFlagKeys.SANDBOX_GRAPH)).toBe(false)

    clearFeatureFlagOverride(FeatureFlagKeys.SANDBOX_GRAPH)
    // sandbox-graph defaults to true
    expect(isFeatureEnabled(FeatureFlagKeys.SANDBOX_GRAPH)).toBe(true)
    expect(localStorage.getItem(`__ff_${FeatureFlagKeys.SANDBOX_GRAPH}`)).toBeNull()
  })

  it('resetAllFeatureFlags clears all overrides at once', () => {
    setFeatureFlag(FeatureFlagKeys.SANDBOX_GRAPH, false)
    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, true)
    setFeatureFlag(FeatureFlagKeys.DEV_VITALS_PANEL, true)

    resetAllFeatureFlags()

    const values = getAllFlagValues()
    expect(values[FeatureFlagKeys.SANDBOX_GRAPH]).toBe(true)
    expect(values[FeatureFlagKeys.VECTOR_SEARCH]).toBe(false)
    expect(values[FeatureFlagKeys.DEV_VITALS_PANEL]).toBe(false)
  })

  it('getAllFlagValues returns a snapshot of every flag', () => {
    const values = getAllFlagValues()

    expect(values).toHaveProperty(FeatureFlagKeys.SANDBOX_GRAPH)
    expect(values).toHaveProperty(FeatureFlagKeys.SANDBOX_TIMELINE)
    expect(values).toHaveProperty(FeatureFlagKeys.VECTOR_SEARCH)
    expect(values).toHaveProperty(FeatureFlagKeys.DEEP_IMPORT)
    expect(values).toHaveProperty(FeatureFlagKeys.DEV_VITALS_PANEL)
    expect(values).toHaveProperty(FeatureFlagKeys.MUTATION_TRACE)
  })

  it('getFeatureFlagRef returns a reactive ref that tracks changes', () => {
    const ref = getFeatureFlagRef(FeatureFlagKeys.VECTOR_SEARCH)
    expect(ref.value).toBe(false)

    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, true)
    expect(ref.value).toBe(true)
  })

  it('returns false for an unknown flag key without crashing', () => {
    expect(isFeatureEnabled('nonexistent-flag-key')).toBe(false)
  })

  it('syncRemoteFlags resolves without error (stub implementation)', async () => {
    await expect(syncRemoteFlags()).resolves.toBeUndefined()
    await expect(syncRemoteFlags('https://example.com/api/flags')).resolves.toBeUndefined()
  })

  it('resetFeatureFlagsForTest clears internal state and localStorage overrides', () => {
    setFeatureFlag(FeatureFlagKeys.MUTATION_TRACE, true)
    expect(isFeatureEnabled(FeatureFlagKeys.MUTATION_TRACE)).toBe(true)

    resetFeatureFlagsForTest()

    // After reset, reading should re-initialize from defaults
    expect(isFeatureEnabled(FeatureFlagKeys.MUTATION_TRACE)).toBe(false)
    expect(localStorage.getItem(`__ff_${FeatureFlagKeys.MUTATION_TRACE}`)).toBeNull()
  })
})
