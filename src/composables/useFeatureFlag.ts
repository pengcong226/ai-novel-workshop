/**
 * Feature Flag Composable
 *
 * Vue composable for consuming feature flags with full reactivity.
 * Wraps the underlying `Ref<boolean>` from `featureFlags.ts` as
 * `ComputedRef<boolean>` (read-only) for safe template binding.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useFeatureFlag } from '@/composables/useFeatureFlag'
 *
 * const graphEnabled = useFeatureFlag('sandbox-graph')
 * const allFlags = useFeatureFlags()
 * </script>
 *
 * <template>
 *   <SandboxGraph v-if="graphEnabled" />
 *   <pre>{{ allFlags }}</pre>
 * </template>
 * ```
 *
 * @see src/utils/featureFlags.ts -- core flag system
 * @see src/constants/features.ts -- flag definitions
 */

import { computed, type ComputedRef } from 'vue'
import type { FeatureFlagKey } from '@/constants/features'
import { FEATURE_FLAG_DEFINITIONS, FEATURE_FLAG_MAP } from '@/constants/features'
import {
  getFeatureFlagRef,
  setFeatureFlag,
  clearFeatureFlagOverride,
  resetAllFeatureFlags,
  getAllFlagValues,
} from '@/utils/featureFlags'

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

/**
 * Reactive check for a single feature flag.
 *
 * Returns a read-only `ComputedRef<boolean>` that updates when the flag
 * is toggled via `setFeatureFlag()`.
 *
 * @param flagKey - One of the defined `FeatureFlagKey` values.
 * @returns Read-only computed ref bound to the flag's current value.
 */
export function useFeatureFlag(flagKey: FeatureFlagKey | string): ComputedRef<boolean> {
  const raw = getFeatureFlagRef(flagKey)
  return computed(() => raw.value)
}

/**
 * Return reactive state for ALL defined feature flags.
 *
 * Each entry is a `ComputedRef<boolean>` keyed by flag key.
 * Useful for settings/debug panels that need to display and toggle
 * all flags.
 *
 * @returns Object mapping flag keys to computed boolean refs.
 */
export function useFeatureFlags(): Record<string, ComputedRef<boolean>> {
  const result: Record<string, ComputedRef<boolean>> = {}
  for (const def of FEATURE_FLAG_DEFINITIONS) {
    const raw = getFeatureFlagRef(def.key)
    result[def.key] = computed(() => raw.value)
  }
  return result
}

// ---------------------------------------------------------------------------
// Re-exports for convenience (so consumers only need one import)
// ---------------------------------------------------------------------------

export {
  setFeatureFlag,
  clearFeatureFlagOverride,
  resetAllFeatureFlags,
  getAllFlagValues,
  FEATURE_FLAG_MAP,
  type FeatureFlagKey,
}
