/**
 * AI服务模块导出
 * @module services/ai
 */

// 类型导出
export type {
  AIProvider,
  ModelTier,
  ModelConfig,
  ModelsConfig,
  TaskType,
  Complexity,
  Priority,
  TaskContext,
  MessageRole,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  TokenUsage,
  CostBreakdown,
  StreamEvent,
  StreamCallback,
} from '../../types/ai';

// 模型路由器
export { ModelRouter, SimpleUsageTracker } from './ModelRouter';

// AI服务（AIService 类仍从 ai-service.ts 获取）
export { AIService } from '../ai-service';

// 错误类 — 从子模块直接导出
export {
  AIServiceError,
  RateLimitError,
  BudgetExceededError,
  ModelUnavailableError,
} from './errors';

// 速率限制器和成本追踪器 — 从子模块直接导出
export { RateLimiter } from './rate-limiter';
export { CostTracker } from './cost-tracker';

// 内部类型 — 从子模块直接导出
export type {
  AIServiceConfig,
  BudgetConfig,
  UsageStatistics,
} from '../../types/ai';

export type {
  CostRecord,
  RetryConfig,
  RateLimitConfig,
} from './types';
