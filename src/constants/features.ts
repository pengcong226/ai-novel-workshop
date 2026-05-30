/**
 * Feature Flag Definitions
 *
 * Central registry of all feature flags used across the application.
 * Each flag has a unique key, human-readable label, description, category,
 * and default value. Actual evaluation logic lives in `src/utils/featureFlags.ts`.
 *
 * @see src/utils/featureFlags.ts  -- reactive flag system + localStorage override
 * @see src/composables/useFeatureFlag.ts -- Vue composable for template/script usage
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureFlagCategory = 'ui' | 'experimental' | 'debug'

export interface FeatureFlagDefinition {
  /** Unique identifier used as localStorage key suffix and reactive ref name. */
  readonly key: string
  /** Chinese-first human label for UI display. */
  readonly label: string
  /** Short description of what the flag controls. */
  readonly description: string
  /** Category grouping for settings panel organization. */
  readonly category: FeatureFlagCategory
  /** Default value when no localStorage override or remote value exists. */
  readonly defaultValue: boolean
}

// ---------------------------------------------------------------------------
// Flag Keys (compile-time safe references)
// ---------------------------------------------------------------------------

export const FeatureFlagKeys = {
  // --- UI: new sandbox views ---
  /** Sandbox entity relationship graph (SandboxGraph.vue). */
  SANDBOX_GRAPH: 'sandbox-graph',
  /** Sandbox narrative timeline view (SandboxTimeline.vue). */
  SANDBOX_TIMELINE: 'sandbox-timeline',

  // --- Experimental: in-progress capabilities ---
  /** Vector-based semantic search (vector store). */
  VECTOR_SEARCH: 'vector-search',
  /** Deep import pipeline for batch novel extraction. */
  DEEP_IMPORT: 'deep-import',

  // --- Debug: developer diagnostics ---
  /** Developer vitals performance panel (web vitals overlay). */
  DEV_VITALS_PANEL: 'dev-vitals-panel',
  /** Mutation trace logging for store state changes. */
  MUTATION_TRACE: 'mutation-trace',
} as const

export type FeatureFlagKey = (typeof FeatureFlagKeys)[keyof typeof FeatureFlagKeys]

// ---------------------------------------------------------------------------
// Flag Definitions
// ---------------------------------------------------------------------------

export const FEATURE_FLAG_DEFINITIONS: ReadonlyArray<FeatureFlagDefinition> = [
  // -- UI --
  {
    key: FeatureFlagKeys.SANDBOX_GRAPH,
    label: '沙盘关系图',
    description: '启用沙盘实体关系图谱可视化视图',
    category: 'ui',
    defaultValue: true,
  },
  {
    key: FeatureFlagKeys.SANDBOX_TIMELINE,
    label: '沙盘时间线',
    description: '启用沙盘叙事时间线视图',
    category: 'ui',
    defaultValue: true,
  },

  // -- Experimental --
  {
    key: FeatureFlagKeys.VECTOR_SEARCH,
    label: '向量语义搜索',
    description: '启用基于向量的语义搜索功能',
    category: 'experimental',
    defaultValue: false,
  },
  {
    key: FeatureFlagKeys.DEEP_IMPORT,
    label: '深度导入',
    description: '启用批量小说深度提取导入管线',
    category: 'experimental',
    defaultValue: true,
  },

  // -- Debug --
  {
    key: FeatureFlagKeys.DEV_VITALS_PANEL,
    label: '开发者性能面板',
    description: '显示 Web Vitals 开发者性能监控浮层',
    category: 'debug',
    defaultValue: false,
  },
  {
    key: FeatureFlagKeys.MUTATION_TRACE,
    label: '状态变更追踪',
    description: '记录 Store 状态变更日志用于调试',
    category: 'debug',
    defaultValue: false,
  },
] as const

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/** Map from flag key to its definition for O(1) lookups. */
export const FEATURE_FLAG_MAP: ReadonlyMap<string, FeatureFlagDefinition> = new Map(
  FEATURE_FLAG_DEFINITIONS.map((def) => [def.key, def])
)

/** Return the definition for a given flag key, or undefined if unknown. */
export function getFlagDefinition(key: string): FeatureFlagDefinition | undefined {
  return FEATURE_FLAG_MAP.get(key)
}

/** Return all flag keys belonging to a category. */
export function getFlagKeysByCategory(category: FeatureFlagCategory): string[] {
  return FEATURE_FLAG_DEFINITIONS.filter((d) => d.category === category).map((d) => d.key)
}
