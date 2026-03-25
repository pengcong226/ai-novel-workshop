/**
 * LLM分析模块统一导出
 */

// 类型定义
export type {
  AnalysisMode,
  AnalysisStage,
  LLMProvider,
  AnalysisProgress,
  LLMChapter,
  LLMCharacter,
  LLMRelationship,
  LLMWorldSetting,
  LLMOutline,
  ChapterPattern,
  LLMAnalysisResult,
  LLMProviderConfig,
  UserCorrection,
  RerunAnalysisRequest,
  TextChunk,
  AnalysisCache,
  AnalysisError,
  QuickModeSampling
} from './types'

export {
  AnalysisErrorType,
  SUPPORTED_MODELS,
  DEFAULT_QUICK_MODE_SAMPLING
} from './types'

// 工具函数
export { countTokens, countChunksTokens, estimateCost } from './tokenizer'
export { splitTextForLLM, sampleText, selectRepresentativeChapters } from './textChunker'
export { CacheManager, cacheManager } from './cacheManager'
export {
  validateLLMOutput,
  extractJSONArray,
  extractJSONObject,
  cleanJSONString
} from './jsonValidator'

// JSON Schema
export {
  chapterListSchema,
  chapterPatternSchema,
  characterListSchema,
  relationshipListSchema,
  worldSettingSchema,
  outlineSchema
} from './schemas'

// LLM调用
export { callLLM, callLLMWithValidation } from './llmCaller'

// 分析模块
export { detectChaptersWithLLM } from './chapterDetector'
export { extractCharactersWithLLM } from './characterExtractor'
export { extractWorldWithLLM } from './worldExtractor'
export { generateOutlineWithLLM } from './outlineGenerator'

// 主分析器
export {
  analyzeNovelWithLLM,
  resumeAnalysisFromCache,
  getAnalysisProgress
} from './analyzer'
