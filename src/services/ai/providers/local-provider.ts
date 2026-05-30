/**
 * 本地模型API客户端
 * @module services/ai/providers/local-provider
 *
 * 提供OpenAI兼容格式的本地模型聊天和流式聊天请求
 */

import type { ChatRequest } from '../../../types/ai';
import type { OpenAIResponse } from '../types';
import { AIServiceError } from '../errors';
import { readSSEStream, openAIContentExtractor } from '@/utils/sse-stream';

/**
 * 本地模型API客户端
 */
export class LocalProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model?: string }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model || 'llama3:8b';
  }

  /**
   * 发送聊天请求（OpenAI兼容格式）
   */
  async chat(request: ChatRequest): Promise<OpenAIResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model || this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'LOCAL_TIMEOUT',
          'Local API request timed out after 30 seconds',
          'local'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `LOCAL_${response.status}`,
        error.error?.message || `Local API error: ${response.status}`,
        'local',
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
        },
        body: JSON.stringify({
          model: request.model || this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'LOCAL_TIMEOUT',
          'Local API stream request timed out after 30 seconds',
          'local'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `LOCAL_${response.status}`,
        error.error?.message || `Local API error: ${response.status}`,
        'local',
        error
      );
    }

    yield* readSSEStream(response.body, openAIContentExtractor);
  }
}
