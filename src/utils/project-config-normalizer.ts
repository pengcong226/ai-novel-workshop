import type { AdvancedSettings, ModelProvider, ProjectConfig, StyleProfile, SystemPrompts, VectorServiceConfig } from '@/types'
import { DEFAULT_SYSTEM_PROMPTS } from './systemPrompts'
import { getStylePreset, mergeStyleProfile } from '@/data/stylePresets'
import {
  ACTIVE_AGENT_ROLES,
  DEFAULT_AGENT_CONFIGS,
  isAgentPhase,
  type AgentConfig,
  type AgentRole
} from '@/agents/types'

interface LegacyProjectConfigShape extends Partial<ProjectConfig> {
  advanced?: Partial<AdvancedSettings>
}

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  temperature: 0.8,
  topP: 0.9,
  maxTokens: 4096,
  maxContextTokens: 8192,
  recentChaptersCount: 3,
  targetWordCount: 2000,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: []
}

const DEFAULT_VECTOR_CONFIG: VectorServiceConfig = {
  provider: 'local',
  model: '/dist/models/Xenova/bge-m3',
  dimension: 1024,
  topK: 5,
  minScore: 0.6,
  vectorWeight: 0.7
}

const DEFAULT_STYLE_PROFILE = getStylePreset()

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  preset: 'standard',
  providers: [],
  plannerModel: '',
  writerModel: '',
  sentinelModel: '',
  extractorModel: '',
  systemPrompts: { ...DEFAULT_SYSTEM_PROMPTS },
  planningDepth: 'medium',
  writingDepth: 'standard',
  enableQualityCheck: true,
  qualityThreshold: 7,
  maxCostPerChapter: 0.15,
  enableAISuggestions: true,
  enableAutoReview: false,
  agentConfigs: DEFAULT_AGENT_CONFIGS.map(config => ({ ...config })),
  enableLogicValidator: true,
  enableZeroTouchExtraction: true,
  enableVectorRetrieval: true,
  vectorConfig: { ...DEFAULT_VECTOR_CONFIG },
  advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS }
}

function cloneProviders(providers: unknown): ModelProvider[] {
  if (!Array.isArray(providers)) return []
  return JSON.parse(JSON.stringify(providers)) as ModelProvider[]
}

function normalizeSystemPrompts(input: unknown): SystemPrompts {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_SYSTEM_PROMPTS }
  }

  const custom = input as Partial<SystemPrompts>
  return {
    planner: custom.planner ?? DEFAULT_SYSTEM_PROMPTS.planner,
    writer: custom.writer ?? DEFAULT_SYSTEM_PROMPTS.writer,
    sentinel: custom.sentinel ?? DEFAULT_SYSTEM_PROMPTS.sentinel,
    extractor: custom.extractor ?? DEFAULT_SYSTEM_PROMPTS.extractor
  }
}

function normalizeAdvancedSettings(
  advancedSettings: unknown,
  legacyAdvanced: unknown,
  fallback: AdvancedSettings
): AdvancedSettings {
  const source = ((advancedSettings && typeof advancedSettings === 'object' ? advancedSettings : undefined)
    || (legacyAdvanced && typeof legacyAdvanced === 'object' ? legacyAdvanced : undefined)
    || {}) as Partial<AdvancedSettings>

  return {
    temperature: source.temperature ?? fallback.temperature,
    topP: source.topP ?? fallback.topP,
    maxTokens: source.maxTokens ?? fallback.maxTokens,
    maxContextTokens: source.maxContextTokens ?? fallback.maxContextTokens,
    recentChaptersCount: source.recentChaptersCount ?? fallback.recentChaptersCount,
    targetWordCount: source.targetWordCount ?? fallback.targetWordCount,
    frequencyPenalty: source.frequencyPenalty ?? fallback.frequencyPenalty,
    presencePenalty: source.presencePenalty ?? fallback.presencePenalty,
    stopSequences: Array.isArray(source.stopSequences)
      ? [...source.stopSequences]
      : [...fallback.stopSequences]
  }
}

function normalizeVectorConfig(
  vectorConfig: unknown,
  fallback: VectorServiceConfig
): VectorServiceConfig {
  const source = (vectorConfig && typeof vectorConfig === 'object'
    ? vectorConfig
    : {}) as Partial<VectorServiceConfig>

  return {
    provider: source.provider ?? fallback.provider,
    model: source.model ?? fallback.model,
    dimension: source.dimension ?? fallback.dimension,
    apiKey: source.apiKey ?? fallback.apiKey,
    baseUrl: source.baseUrl ?? fallback.baseUrl,
    projectId: source.projectId ?? fallback.projectId,
    topK: source.topK ?? fallback.topK,
    minScore: source.minScore ?? fallback.minScore,
    vectorWeight: source.vectorWeight ?? fallback.vectorWeight,
    maxExternalArtifactsToIndex: source.maxExternalArtifactsToIndex ?? fallback.maxExternalArtifactsToIndex,
    maxExternalArtifactContentLength: source.maxExternalArtifactContentLength ?? fallback.maxExternalArtifactContentLength
  }
}

function normalizeStyleProfile(styleProfile: unknown, fallback: StyleProfile = DEFAULT_STYLE_PROFILE): StyleProfile | undefined {
  if (!styleProfile || typeof styleProfile !== 'object') return undefined
  return mergeStyleProfile(styleProfile as Partial<StyleProfile>, fallback)
}

function normalizePriority(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(99, Math.max(1, Math.trunc(value)))
}

function normalizeAgentConfigs(input: unknown, fallback: AgentConfig[] = DEFAULT_AGENT_CONFIGS): AgentConfig[] {
  const byRole = new Map<AgentRole, AgentConfig>()

  for (const config of fallback) {
    byRole.set(config.role, { ...config })
  }

  if (Array.isArray(input)) {
    for (const rawConfig of input) {
      if (!rawConfig || typeof rawConfig !== 'object') continue
      const config = rawConfig as Partial<AgentConfig>
      if (!config.role || !byRole.has(config.role)) continue
      const existing = byRole.get(config.role)!
      byRole.set(config.role, {
        ...existing,
        enabled: ACTIVE_AGENT_ROLES.includes(config.role) && typeof config.enabled === 'boolean' ? config.enabled : existing.enabled,
        phase: isAgentPhase(config.phase) ? config.phase : existing.phase,
        priority: normalizePriority(config.priority, existing.priority),
        batchOnly: config.role === 'reader' && typeof config.batchOnly === 'boolean' ? config.batchOnly : existing.batchOnly,
      })
    }
  }

  return DEFAULT_AGENT_CONFIGS.map(config => byRole.get(config.role) ?? { ...config })
}

export function getDefaultProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return normalizeProjectConfig(overrides)
}

export function normalizeProjectConfig(
  input: LegacyProjectConfigShape | null | undefined,
  defaults: Partial<ProjectConfig> = {}
): ProjectConfig {
  const base = {
    ...DEFAULT_PROJECT_CONFIG,
    ...defaults
  }

  const raw = (input ?? {}) as LegacyProjectConfigShape

  const normalizedAdvancedSettings = normalizeAdvancedSettings(
    raw.advancedSettings,
    raw.advanced,
    normalizeAdvancedSettings(base.advancedSettings, undefined, DEFAULT_ADVANCED_SETTINGS)
  )

  const normalizedVectorConfig = normalizeVectorConfig(
    raw.vectorConfig,
    normalizeVectorConfig(base.vectorConfig, DEFAULT_VECTOR_CONFIG)
  )

  const normalizedStyleProfile = raw.styleProfile !== undefined
    ? normalizeStyleProfile(raw.styleProfile, normalizeStyleProfile(base.styleProfile) ?? DEFAULT_STYLE_PROFILE)
    : normalizeStyleProfile(base.styleProfile)

  return {
    preset: raw.preset ?? base.preset,
    providers: cloneProviders(raw.providers ?? base.providers),
    plannerModel: raw.plannerModel ?? base.plannerModel,
    writerModel: raw.writerModel ?? base.writerModel,
    sentinelModel: raw.sentinelModel ?? base.sentinelModel,
    extractorModel: raw.extractorModel ?? base.extractorModel,
    systemPrompts: normalizeSystemPrompts(raw.systemPrompts ?? base.systemPrompts),
    styleProfile: normalizedStyleProfile,
    planningDepth: raw.planningDepth ?? base.planningDepth,
    writingDepth: raw.writingDepth ?? base.writingDepth,
    enableQualityCheck: raw.enableQualityCheck ?? base.enableQualityCheck,
    qualityThreshold: raw.qualityThreshold ?? base.qualityThreshold,
    maxCostPerChapter: raw.maxCostPerChapter ?? base.maxCostPerChapter,
    enableAISuggestions: raw.enableAISuggestions ?? base.enableAISuggestions,
    enableAutoReview: raw.enableAutoReview ?? base.enableAutoReview,
    agentConfigs: normalizeAgentConfigs(raw.agentConfigs, normalizeAgentConfigs(base.agentConfigs)),
    enableLogicValidator: raw.enableLogicValidator ?? base.enableLogicValidator,
    enableZeroTouchExtraction: raw.enableZeroTouchExtraction ?? base.enableZeroTouchExtraction,
    enableVectorRetrieval: raw.enableVectorRetrieval ?? base.enableVectorRetrieval,
    vectorConfig: normalizedVectorConfig,
    advancedSettings: normalizedAdvancedSettings
  }
}
