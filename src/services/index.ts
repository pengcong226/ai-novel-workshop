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
