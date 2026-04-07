/**
 * LLM驱动的小说分析 - 类型定义
 */

// 分析模式
export type AnalysisMode = 'quick' | 'full'

// 分析阶段
export type AnalysisStage = 'pattern' | 'chapters' | 'characters' | 'world' | 'outline' | 'complete'

// LLM提供商类型
export type LLMProvider = 'anthropic' | 'openai' | 'local' | 'custom'

// 分析进度
export interface AnalysisProgress {
  stage: AnalysisStage
  current: number
  total: number
  message: string
  estimatedCost?: number
  tokenUsage?: {
    input: number
    output: number
  }
}

// LLM识别的章节
export interface LLMChapter {
  number: number
  title: string
  startPosition: number
  endPosition: number
  content?: string
  wordCount?: number
}

// LLM识别的人物
export interface LLMCharacter {
  name: string
  role: 'protagonist' | 'supporting' | 'antagonist' | 'minor'
  personality: string[]
  firstAppearance: string
  description: string
  confidence: number
  verified: boolean
}

// LLM识别的人物关系
export interface LLMRelationship {
  from: string
  to: string
  relation: string
  description: string
}

// LLM提取的世界观
export interface LLMWorldSetting {
  worldType: string
  era: string
  powerSystem?: string
  majorFactions: string[]
  keyLocations: string[]
  description: string
}

// LLM生成的大纲
export interface LLMOutline {
  mainPlot: string
  subPlots: string[]
  keyEvents: Array<{
    chapter: number
    event: string
  }>
}

// 章节模式识别结果
export interface ChapterPattern {
  pattern: string
  examples: string[]
  estimatedTotal: number
  confidence: number
}

// 分析结果
export interface LLMAnalysisResult {
  mode: AnalysisMode

  chapters: LLMChapter[]
  chapterPattern: ChapterPattern

  characters: LLMCharacter[]
  relationships: LLMRelationship[]

  worldSetting: LLMWorldSetting
  outline: LLMOutline

  stats: {
    totalWords: number
    totalChapters: number
    avgWordsPerChapter: number
    analysisTime: number
    tokenUsage: {
      input: number
      output: number
    }
  }

  errors: Array<{
    stage: string
    message: string
    retryable: boolean
  }>
}

// LLM提供商配置
export interface LLMProviderConfig {
  provider: LLMProvider
  model: string
  apiKey: string
  baseURL?: string
  maxTokens: number
  temperature: number
  pricing: {
    input: number  // 每1M tokens价格（美元）
    output: number
  }
}

// 用户修正标记
export interface UserCorrection {
  type: 'delete' | 'edit' | 'add'
  target: 'chapter' | 'character' | 'relationship' | 'world' | 'outline'
  data: any
  reason?: string
}

// 重新分析请求
export interface RerunAnalysisRequest {
  scope: 'chapters' | 'characters' | 'world' | 'all'
  corrections: UserCorrection[]
  focusHint?: string
}

// 文本分块
export interface TextChunk {
  index: number
  text: string
  startPosition: number
  endPosition: number
  tokenCount: number
}

// 缓存数据
export interface AnalysisCache {
  fileId: string
  timestamp: number
  mode: AnalysisMode

  chapterDetection?: {
    result: any
    timestamp: number
  }
  characterExtraction?: {
    result: any
    timestamp: number
  }
  worldExtraction?: {
    result: any
    timestamp: number
  }
  outlineGeneration?: {
    result: any
    timestamp: number
  }

  complete?: LLMAnalysisResult
}

// 错误类型
export enum AnalysisErrorType {
  NETWORK_ERROR = 'network',
  RATE_LIMIT = 'rate_limit',
  TOKEN_LIMIT = 'token_limit',
  INVALID_OUTPUT = 'invalid_output',
  USER_CANCEL = 'user_cancel',
  UNKNOWN = 'unknown'
}

// 分析错误
export interface AnalysisError {
  type: AnalysisErrorType
  stage: string
  message: string
  retryable: boolean
  recoveryHint?: string
}

// 快速模式采样配置
export interface QuickModeSampling {
  chapterDetection: {
    start: number
    end: number
    validation: "pattern-match-full-text"
  }
  characterExtraction: {
    chapters: "first-20-percent"
    minChapters: number
    maxChapters: number
  }
  worldExtraction: {
    chapters: "first-5-middle-5-last-5"
  }
  outlineGeneration: {
    basis: "analyzed-chapters"
  }
}

// 预设模型配置
export const SUPPORTED_MODELS: Record<string, Partial<LLMProviderConfig>> = {
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    maxTokens: 200000,
    temperature: 0.7,
    pricing: { input: 3, output: 15 }
  },
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    maxTokens: 200000,
    temperature: 0.7,
    pricing: { input: 15, output: 75 }
  },
  'gpt-4-turbo': {
    provider: 'openai',
    maxTokens: 128000,
    temperature: 0.7,
    pricing: { input: 10, output: 30 }
  },
  'gpt-4o': {
    provider: 'openai',
    maxTokens: 128000,
    temperature: 0.7,
    pricing: { input: 5, output: 15 }
  }
}

// 默认快速模式配置
export const DEFAULT_QUICK_MODE_SAMPLING: QuickModeSampling = {
  chapterDetection: {
    start: 5000,
    end: 2000,
    validation: "pattern-match-full-text"
  },
  characterExtraction: {
    chapters: "first-20-percent",
    minChapters: 10,
    maxChapters: 30
  },
  worldExtraction: {
    chapters: "first-5-middle-5-last-5"
  },
  outlineGeneration: {
    basis: "analyzed-chapters"
  }
}
