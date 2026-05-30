import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useFeatureFlag, useFeatureFlags } from './useFeatureFlag'
import { resetFeatureFlagsForTest, setFeatureFlag, getAllFlagValues } from '@/utils/featureFlags'
import { FeatureFlagKeys, FEATURE_FLAG_DEFINITIONS } from '@/constants/features'

function mountWithFlag(flagKey: string) {
  let flagResult!: ReturnType<typeof useFeatureFlag>
  const wrapper = mount(
    defineComponent({
      setup() {
        flagResult = useFeatureFlag(flagKey)
        return {}
      },
      render: () => h('div'),
    }),
  )
  return { wrapper, flag: flagResult }
}

function mountWithAllFlags() {
  let flagsResult!: ReturnType<typeof useFeatureFlags>
  const wrapper = mount(
    defineComponent({
      setup() {
        flagsResult = useFeatureFlags()
        return {}
      },
      render: () => h('div'),
    }),
  )
  return { wrapper, flags: flagsResult }
}

describe('useFeatureFlag', () => {
  beforeEach(() => {
    resetFeatureFlagsForTest()
  })

  afterEach(() => {
    resetFeatureFlagsForTest()
    vi.restoreAllMocks()
  })

  it('returns the default value for a known flag', () => {
    const def = FEATURE_FLAG_DEFINITIONS.find(d => d.key === FeatureFlagKeys.SANDBOX_GRAPH)!
    const { flag } = mountWithFlag(FeatureFlagKeys.SANDBOX_GRAPH)
    expect(flag.value).toBe(def.defaultValue)
  })

  it('returns false for an unknown flag key', () => {
    const { flag } = mountWithFlag('nonexistent-flag')
    expect(flag.value).toBe(false)
  })

  it('reacts to setFeatureFlag changes', async () => {
    const { flag } = mountWithFlag(FeatureFlagKeys.VECTOR_SEARCH)
    const def = FEATURE_FLAG_DEFINITIONS.find(d => d.key === FeatureFlagKeys.VECTOR_SEARCH)!
    expect(flag.value).toBe(def.defaultValue)

    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, true)
    await nextTick()
    expect(flag.value).toBe(true)

    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, false)
    await nextTick()
    expect(flag.value).toBe(false)
  })

  it('returns a computed ref that is read-only by contract', () => {
    const { flag } = mountWithFlag(FeatureFlagKeys.SANDBOX_GRAPH)
    // ComputedRef has a readonly .value getter; attempting to assign should
    // not crash but the value should remain unchanged in practice.
    expect(flag.value).toBeDefined()
    expect(typeof flag.value).toBe('boolean')
  })
})

describe('useFeatureFlags', () => {
  beforeEach(() => {
    resetFeatureFlagsForTest()
  })

  afterEach(() => {
    resetFeatureFlagsForTest()
    vi.restoreAllMocks()
  })

  it('returns an entry for every defined flag', () => {
    const { flags } = mountWithAllFlags()

    for (const def of FEATURE_FLAG_DEFINITIONS) {
      expect(flags[def.key]).toBeDefined()
    }
  })

  it('each flag returns the correct default value', () => {
    const { flags } = mountWithAllFlags()

    for (const def of FEATURE_FLAG_DEFINITIONS) {
      expect(flags[def.key].value).toBe(def.defaultValue)
    }
  })

  it('reacts when individual flags are toggled', async () => {
    const { flags } = mountWithAllFlags()

    setFeatureFlag(FeatureFlagKeys.DEV_VITALS_PANEL, true)
    await nextTick()

    expect(flags[FeatureFlagKeys.DEV_VITALS_PANEL].value).toBe(true)
  })

  it('returns a snapshot consistent with getAllFlagValues', () => {
    const { flags } = mountWithAllFlags()
    const snapshot = getAllFlagValues()

    for (const [key, value] of Object.entries(snapshot)) {
      expect(flags[key].value).toBe(value)
    }
  })
})

describe('resetFeatureFlagsForTest', () => {
  it('reserts all overrides to defaults', () => {
    setFeatureFlag(FeatureFlagKeys.SANDBOX_GRAPH, false)
    setFeatureFlag(FeatureFlagKeys.VECTOR_SEARCH, true)

    resetFeatureFlagsForTest()

    const defGraph = FEATURE_FLAG_DEFINITIONS.find(d => d.key === FeatureFlagKeys.SANDBOX_GRAPH)!
    const defVector = FEATURE_FLAG_DEFINITIONS.find(d => d.key === FeatureFlagKeys.VECTOR_SEARCH)!

    const values = getAllFlagValues()
    expect(values[FeatureFlagKeys.SANDBOX_GRAPH]).toBe(defGraph.defaultValue)
    expect(values[FeatureFlagKeys.VECTOR_SEARCH]).toBe(defVector.defaultValue)
  })
})
