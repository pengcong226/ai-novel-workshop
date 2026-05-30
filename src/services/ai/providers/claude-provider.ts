/**
 * Claude API客户端
 * @module services/ai/providers/claude-provider
 *
 * 提供Anthropic Claude格式的聊天和流式聊天请求，支持结构化输出（Tool Calling）
 */

import type { ChatRequest, ChatResponse, TokenUsage, CostBreakdown, ModelConfig } from '../../../types/ai';
import type { ClaudeResponse } from '../types';
import { USD_TO_CNY_RATE } from '../types';
import { AIServiceError } from '../errors';
import { enforceSecureAnthropicAccess } from '@/utils/anthropic-guard';
import { readSSEStream, claudeContentExtractor } from '@/utils/sse-stream';

/**
 * Claude API客户端
 */
export class ClaudeProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
  }

  private enforceSecureAnthropicAccess(): void {
    enforceSecureAnthropicAccess(this.baseUrl);
  }

  /**
   * 发送聊天请求
   */
  async chat(request: ChatRequest): Promise<ClaudeResponse> {
    this.enforceSecureAnthropicAccess();

    // 分离系统消息
    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages.filter(m => m.role !== 'system');

    // V4-①: 结构化输出适配 (Claude通过Tool Calling实现强制JSON)
    const claudePayload: any = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: request.temperature ?? 0.7,
      stop_sequences: request.stopSequences,
      stream: false,
    };

    if (request.response_format?.type === 'json_schema' && request.response_format.json_schema) {
      const schemaName = request.response_format.json_schema.name || "output_format";
      claudePayload.tools = [{
        name: schemaName,
        description: request.response_format.json_schema.description || "Output the structured data",
        input_schema: request.response_format.json_schema.schema
      }];
      claudePayload.tool_choice = { type: "tool", name: schemaName };
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudePayload),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'CLAUDE_TIMEOUT',
          'Claude API request timed out after 30 seconds',
          'anthropic'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `CLAUDE_${response.status}`,
        error.error?.message || `Claude API error: ${response.status}`,
        'anthropic',
        error
      );
    }

    const result = await response.json();

    // 如果是Claude的Tool Calling，需要提取内容
    if (result.content) {
      const toolUse = result.content.find((c: any) => c.type === 'tool_use');
      if (toolUse && toolUse.input) {
        result.content = [{ type: 'text', text: typeof toolUse.input === 'string' ? toolUse.input : JSON.stringify(toolUse.input) }];
      }
    }

    return result;
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    this.enforceSecureAnthropicAccess();

    const systemMessage = request.messages.find(m => m.role === 'system');
    const conversationMessages = request.messages.filter(m => m.role !== 'system');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxTokens ?? 4096,
          system: systemMessage?.content,
          messages: conversationMessages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          temperature: request.temperature ?? 0.7,
          stop_sequences: request.stopSequences,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AIServiceError(
          'CLAUDE_TIMEOUT',
          'Claude API stream request timed out after 30 seconds',
          'anthropic'
        );
      }
      throw error;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AIServiceError(
        `CLAUDE_${response.status}`,
        error.error?.message || `Claude API error: ${response.status}`,
        'anthropic',
        error
      );
    }

    yield* readSSEStream(response.body, claudeContentExtractor);
  }

  /**
   * 将Claude响应转换为统一格式
   */
  normalizeResponse(response: ClaudeResponse, model: ModelConfig): ChatResponse {
    const usage: TokenUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
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

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      model: response.model,
      usage,
      cost,
      latency: 0,
      finishReason: this.mapStopReason(response.stop_reason),
    };
  }

  private mapStopReason(reason: string | null): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }
}
