import type { Project, Chapter } from '@/types';
import type { MemorySystem } from '../tableMemory';
import type { VectorService } from '@/services/vector-service';
import { countTokens as countLLMTokens } from '../llm/tokenizer';

/**
 * 管道负载，在中间件之间流转的上下文对象
 */
export interface ContextPayload {
  project: Project;
  currentChapter: Chapter;
  memorySystem?: MemorySystem;
  vectorService?: VectorService;

  // 预算管理
  budget: {
    total: number;
    remaining: number;
    distribution: Record<string, number>; // 预设各模块的上限
  };

  // 最终的输出内容
  systemParts: string[];
  userHeadParts: string[]; // 素材类 (如世界观、记忆、摘要)
  userTailParts: string[]; // 指令类 (如大纲、最近章节、系统指令)

  warnings: string[];
  totalTokensUsed: number;

  builtSections: {
    systemPrompt: string;
    authorsNote: string;
    worldInfo: string;
    characters: string;
    stateConstraints: string;
    memoryTables: string;
    vectorContext: string;
    summary: string;
    recentChapters: string;
    outline: string;
    plotAnchors?: string;
  };
}

/**
 * 管道中间件接口
 */
export interface ContextMiddleware {
  name: string;
  process(payload: ContextPayload): Promise<void>;
}

/**
 * Token估算辅助函数
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    return countLLMTokens(text, 'openai');
  } catch {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - chineseChars - englishWords;
    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars / 3);
  }
}

/**
 * 安全截断函数 (防止截断 UTF-16 Surrogate Pair)
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return '';
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  const ratio = maxTokens / currentTokens;
  let targetLength = Math.floor(text.length * ratio * 0.9);
  if (targetLength < 0) targetLength = 0;

  let truncated = text.substring(0, targetLength);

  if (truncated.length > 0) {
    const lastCode = truncated.charCodeAt(truncated.length - 1);
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      truncated = truncated.substring(0, truncated.length - 1);
    }
  }

  return truncated + '\n...(内容已截断)';
}

/**
 * 核心管道调度器
 */
export class ContextPipeline {
  private middlewares: ContextMiddleware[] = [];

  use(middleware: ContextMiddleware) {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(payload: ContextPayload): Promise<ContextPayload> {
    for (const middleware of this.middlewares) {
      const budgetKey = middleware.name;
      const sectionBudget = payload.budget.distribution[budgetKey] || payload.budget.remaining;

      if (payload.budget.remaining <= 0) {
        payload.warnings.push(`[${middleware.name}] 由于 Token 预算耗尽被跳过。`);
        continue;
      }

      await middleware.process(payload);
    }
    return payload;
  }
}
