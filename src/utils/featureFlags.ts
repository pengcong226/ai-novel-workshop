/**
 * Feature Flag System
 *
 * Central reactive feature flag evaluation engine.
 *
 * Architecture:
 * - Module-scope Vue `ref<boolean>` per flag (singleton pattern, same as useOnlineStatus)
 * - Default values from `src/constants/features.ts`
 * - localStorage overrides for dev/testing (`__ff_<key>`)
 * - Future: remote flag resolution stub (fetch from API on init)
 *
 * Usage:
 * ```ts
 * import { isFeatureEnabled, setFeatureFlag, getAllFlagValues } from '@/utils/featureFlags'
 *
 * // Imperative check (non-reactive, suitable for services/utilities)
 * if (isFeatureEnabled('sandbox-graph')) { ... }
 *
 * // Override for testing
 * setFeatureFlag('vector-search', true)
 * ```
 *
 * For reactive template/script usage prefer the composable:
 * ```vue
 * import { useFeatureFlag } from '@/composables/useFeatureFlag'
 * const graphEnabled = useFeatureFlag('sandbox-graph')
 * ```
 *
 * @see src/constants/features.ts -- flag definitions
 * @see src/composables/useFeatureFlag.ts -- Vue composable
 */

import { ref, type Ref } from 'vue'
import {
  FEATURE_FLAG_DEFINITIONS,
  FEATURE_FLAG_MAP,
  type FeatureFlagKey,
} from '@/constants/features'

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = '__ff_'

function storageKey(flagKey: string): string {
  return `${STORAGE_PREFIX}${flagKey}`
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function readOverrideFromStorage(flagKey: string): boolean | null {
  if (!canUseStorage()) return null
  const raw = localStorage.getItem(storageKey(flagKey))
  if (raw === null) return null
  return raw === 'true'
}

function writeOverrideToStorage(flagKey: string, value: boolean): void {
  if (!canUseStorage()) return
  localStorage.setItem(storageKey(flagKey), value ? 'true' : 'false')
}

function removeOverrideFromStorage(flagKey: string): void {
  if (!canUseStorage()) return
  localStorage.removeItem(storageKey(flagKey))
}

// ---------------------------------------------------------------------------
// Reactive State (module-scope singleton)
// ---------------------------------------------------------------------------

/** Internal map from flag key to its reactive ref. */
const flagRefs = new Map<string, Ref<boolean>>()

/** Initialization guard -- ensures we only bootstrap once. */
let initialized = false

/**
 * Bootstrap all flag refs. Reads localStorage overrides first, falls back
 * to definition defaults. Called lazily on first access.
 */
function ensureInitialized(): void {
  if (initialized) return
  initialized = true

  for (const def of FEATURE_FLAG_DEFINITIONS) {
    const override = readOverrideFromStorage(def.key)
    const value = override ?? def.defaultValue
    flagRefs.set(def.key, ref(value))
  }
}

function getFlagRef(flagKey: string): Ref<boolean> {
  ensureInitialized()
  const r = flagRefs.get(flagKey)
  if (!r) {
    // Unknown flag key -- return a static false ref to avoid runtime crashes
    return ref(false)
  }
  return r
}

// ---------------------------------------------------------------------------
// Public API: imperative (non-reactive)
// ---------------------------------------------------------------------------

/**
 * Check whether a feature flag is enabled.
 * Non-reactive -- suitable for services, utilities, and guards.
 */
export function isFeatureEnabled(flagKey: FeatureFlagKey | string): boolean {
  return getFlagRef(flagKey).value
}

/**
 * Override a feature flag at runtime. Writes to localStorage so the
 * override persists across page reloads (useful for dev/testing).
 */
export function setFeatureFlag(flagKey: FeatureFlagKey | string, value: boolean): void {
  const r = getFlagRef(flagKey)
  r.value = value
  writeOverrideToStorage(flagKey, value)
}

/**
 * Clear a localStorage override for a specific flag, reverting it to
 * its definition default.
 */
export function clearFeatureFlagOverride(flagKey: FeatureFlagKey | string): void {
  removeOverrideFromStorage(flagKey)
  const def = FEATURE_FLAG_MAP.get(flagKey)
  const r = getFlagRef(flagKey)
  r.value = def?.defaultValue ?? false
}

/**
 * Clear ALL localStorage overrides, reverting every flag to its default.
 */
export function resetAllFeatureFlags(): void {
  for (const def of FEATURE_FLAG_DEFINITIONS) {
    clearFeatureFlagOverride(def.key)
  }
}

/**
 * Return a snapshot of all flag values. Non-reactive.
 */
export function getAllFlagValues(): Record<string, boolean> {
  ensureInitialized()
  const result: Record<string, boolean> = {}
  for (const [key, r] of flagRefs) {
    result[key] = r.value
  }
  return result
}

// ---------------------------------------------------------------------------
// Public API: reactive refs (for direct use outside the composable)
// ---------------------------------------------------------------------------

/**
 * Return the raw reactive `Ref<boolean>` for a flag.
 * Prefer `useFeatureFlag()` from the composable for component usage
 * (it returns `ComputedRef` with proper typing).
 */
export function getFeatureFlagRef(flagKey: FeatureFlagKey | string): Ref<boolean> {
  return getFlagRef(flagKey)
}

// ---------------------------------------------------------------------------
// Remote Flag Support (future stub)
// ---------------------------------------------------------------------------

/**
 * Fetch latest flag overrides from a remote API and merge them into the
 * local reactive state. Remote values take precedence over defaults but
 * are **not** persisted to localStorage (they act as soft overrides).
 *
 * Currently a no-op stub. Implement when a remote config service
 * (e.g., LaunchDarkly, Unleash, or a custom endpoint) is wired up.
 */
export async function syncRemoteFlags(_apiEndpoint?: string): Promise<void> {
  // TODO: Implement remote flag fetching.
  // Expected flow:
  // 1. GET /api/flags from endpoint
  // 2. For each returned flag, update the reactive ref (if not locally overridden)
  // 3. Do NOT write remote values to localStorage (local overrides win)
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Reset internal state for unit tests. Clears all refs and localStorage
 * overrides, then re-initializes from defaults.
 */
export function resetFeatureFlagsForTest(): void {
  flagRefs.clear()
  initialized = false
  if (canUseStorage()) {
    for (const def of FEATURE_FLAG_DEFINITIONS) {
      localStorage.removeItem(storageKey(def.key))
    }
  }
}
