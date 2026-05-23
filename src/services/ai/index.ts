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

// AI服务
export {
  AIService,
  AIServiceError,
  RateLimitError,
  BudgetExceededError,
  ModelUnavailableError,
  RateLimiter,
  CostTracker,
} from '../ai-service';

export type {
  AIServiceConfig,
  BudgetConfig,
  CostRecord,
  RetryConfig,
  RateLimitConfig,
} from '../ai-service';
