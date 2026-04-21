import type { AdvancedSettings, ModelProvider, ProjectConfig, SystemPrompts, VectorServiceConfig } from '@/types'
import { DEFAULT_SYSTEM_PROMPTS } from './systemPrompts'

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

  return {
    preset: raw.preset ?? base.preset,
    providers: cloneProviders(raw.providers ?? base.providers),
    plannerModel: raw.plannerModel ?? base.plannerModel,
    writerModel: raw.writerModel ?? base.writerModel,
    sentinelModel: raw.sentinelModel ?? base.sentinelModel,
    extractorModel: raw.extractorModel ?? base.extractorModel,
    systemPrompts: normalizeSystemPrompts(raw.systemPrompts ?? base.systemPrompts),
    planningDepth: raw.planningDepth ?? base.planningDepth,
    writingDepth: raw.writingDepth ?? base.writingDepth,
    enableQualityCheck: raw.enableQualityCheck ?? base.enableQualityCheck,
    qualityThreshold: raw.qualityThreshold ?? base.qualityThreshold,
    maxCostPerChapter: raw.maxCostPerChapter ?? base.maxCostPerChapter,
    enableAISuggestions: raw.enableAISuggestions ?? base.enableAISuggestions,
    enableLogicValidator: raw.enableLogicValidator ?? base.enableLogicValidator,
    enableZeroTouchExtraction: raw.enableZeroTouchExtraction ?? base.enableZeroTouchExtraction,
    enableVectorRetrieval: raw.enableVectorRetrieval ?? base.enableVectorRetrieval,
    vectorConfig: normalizedVectorConfig,
    advancedSettings: normalizedAdvancedSettings
  }
}
