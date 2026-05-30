/**
 * AI服务类型定义与常量
 * @module services/ai/types
 *
 * 包含AI服务内部使用的接口、类型和默认配置常量
 */

import type {
  AIProvider,
  TokenUsage,
  CostBreakdown,
  ModelConfig,
  TaskType,
  BudgetConfig,
  UsageStatistics,
  RateLimitSettings,
} from '../../types/ai';

// ============================================================================
// 常量定义
// ============================================================================

/** USD转CNY汇率 */
export const USD_TO_CNY_RATE = 7.2;

/** 默认重试配置 */
export const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 30000, // 30秒
  backoffMultiplier: 2,
  jitterRatio: 0.25,
};

/** 默认速率限制配置 */
export const DEFAULT_RATE_LIMIT_CONFIG = {
  requestsPerMinute: 60,
  tokensPerMinute: 100000,
  concurrentRequests: 2,
  queueTimeoutMs: 30000,
};

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 重试配置
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterRatio: number;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
  queueTimeoutMs: number;
}

/**
 * 速率限制状态
 */
export interface RateLimitState {
  requestCount: number;
  tokenCount: number;
  activeRequests: number;
  windowStart: number;
}

/**
 * API响应（OpenAI格式）
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * API响应（Claude格式）
 */
export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * 成本记录
 */
export interface CostRecord {
  timestamp: Date;
  model: string;
  provider: AIProvider;
  taskType?: TaskType;
  tokens: TokenUsage;
  cost: CostBreakdown;
}

export interface RemainingBudget {
  chapterLimitUSD: number;
  dailyRemainingUSD: number;
  monthlyRemainingUSD: number;
}

export type {
  AIProvider,
  TokenUsage,
  CostBreakdown,
  ModelConfig,
  TaskType,
  BudgetConfig,
  UsageStatistics,
  RateLimitSettings,
};
