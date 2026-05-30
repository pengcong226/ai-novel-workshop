/**
 * OpenAI API客户端
 * @module services/ai/providers/openai-provider
 *
 * 提供OpenAI格式的聊天和流式聊天请求，以及响应标准化
 */

import type { ChatRequest, ChatResponse, TokenUsage, CostBreakdown, ModelConfig } from '../../../types/ai';
import type { OpenAIResponse } from '../types';
import { USD_TO_CNY_RATE } from '../types';
import { AIServiceError } from '../errors';
import { readSSEStream, openAIContentExtractor } from '@/utils/sse-stream';

/**
 * OpenAI API客户端
 */
export class OpenAIProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<OpenAIResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stop: request.stopSequences,
          response_format: request.response_format,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'OPENAI_TIMEOUT',
          'OpenAI API request timed out after 30 seconds',
          'openai'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `OPENAI_${response.status}`,
        error.error?.message || `OpenAI API error: ${response.status}`,
        'openai',
        error
      );
    }

    return response.json();
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stop: request.stopSequences,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'OPENAI_TIMEOUT',
          'OpenAI API stream request timed out after 30 seconds',
          'openai'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `OPENAI_${response.status}`,
        error.error?.message || `OpenAI API error: ${response.status}`,
        'openai',
        error
      );
    }

    yield* readSSEStream(response.body, openAIContentExtractor);
  }

  /**
   * 将OpenAI响应转换为统一格式
   */
  normalizeResponse(response: OpenAIResponse, model: ModelConfig): ChatResponse {
    const usage: TokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    };

    // 计算成本
    const inputCostUSD = (usage.inputTokens / 1000) * model.costPerInputToken;
    const outputCostUSD = (usage.outputTokens / 1000) * model.costPerOutputToken;
    const totalUSD = inputCostUSD + outputCostUSD;

    const cost: CostBreakdown = {
      ...usage,
      inputCostUSD,
      outputCostUSD,
      totalUSD,
      totalCNY: totalUSD * USD_TO_CNY_RATE,
      model: model.id,
    };

    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage,
      cost,
      latency: 0, // 需要在调用时计算
      finishReason: this.mapFinishReason(response.choices[0].finish_reason),
    };
  }

  private mapFinishReason(reason: string): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }
}
