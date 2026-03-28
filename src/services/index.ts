/**
 * 服务层模块导出
 * @module services
 */

// AI 模型路由
export { ModelRouter, SimpleUsageTracker } from './ai/ModelRouter';
export type {
  TaskContext,
  TaskType,
  ModelConfig,
  ModelTier,
  Priority,
  Complexity,
} from '../types/ai';

// 向量服务
export {
  VectorService,
  createVectorService,
  getVectorService,
  resetVectorService,
} from './vector-service';
export type {
  EmbeddingConfig,
  VectorDocument,
  DocumentMetadata,
  SearchOptions,
  SearchResult,
  CollectionConfig,
  IndexStats,
} from './vector-service';

// 记忆服务
export { MemoryService } from './memory-service';
export type {
  MemoryLevel,
  MemoryEntry,
  RetrievalResult,
  MemoryConfig,
  VectorStore as VectorStoreInterface,
  AIService as AIServiceInterface,
} from './memory-service';

// 记忆系统适配器
export {
  MemorySystemManager,
  AIServiceAdapter,
  VectorStoreAdapter,
  createMemorySystem,
} from './memory-adapter';
export type {
  MemorySystemConfig,
  ContextOptions,
  BuiltContext,
} from './memory-adapter';

// 世界书导入器
export {
  WorldbookImporter,
  createWorldbookImporter,
  mergeWorldbooks,
  exportWorldbook,
} from './worldbook-importer';

// 世界书注入器
export {
  WorldbookInjector,
  createInjector,
  createWorldbookInjector,
  filterWorldbook,
  exportWorldbookToJson,
  importWorldbookFromJson,
} from './worldbook-injector';
export type {
  WorldbookCondition,
  InjectionContext,
  InjectionLogEntry,
  InjectionResult,
} from './worldbook-injector';

// 世界书导出器
export {
  WorldbookExporter,
  createWorldbookExporter,
  exportWorldbookAsJson,
  exportWorldbookAsJsonl,
  exportWorldbookAsYaml,
  exportWorldbookAsMarkdown,
  exportWorldbookAsPng,
} from './worldbook-exporter';
export type {
  PngExportOptions,
  MarkdownExportOptions,
} from './worldbook-exporter';

// 会话轨迹导入服务
export {
  parseConversationTraceFile,
  parseConversationTraceText,
} from './conversation-trace-parser';
export { extractTraceArtifacts } from './conversation-trace-extractor';
export { buildTraceReviewQueue } from './conversation-trace-conflict';
export { applyTraceReviewItems } from './conversation-trace-apply';
