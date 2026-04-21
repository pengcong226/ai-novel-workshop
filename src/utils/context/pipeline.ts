import type { Project, Chapter, VectorServiceConfig } from '@/types';
import type { VectorService } from '@/services/vector-service';
import { countTokens as countLLMTokens } from '../llm/tokenizer';

/**
 * 管道负载，在中间件之间流转的上下文对象
 */
export interface ContextPayload {
  project: Project;
  currentChapter: Chapter;
  vectorService?: VectorService;
  vectorConfig?: VectorServiceConfig;

  // 预算管理
  budget: {
    total: number;
    remaining: number;
    distribution: Record<string, number>; // 预设各模块的上限
  };

  // Rewrite/Continuation
  rewriteDirectionPrompt?: string;

  // Shared pre-computed data (populated by pipeline before middleware execution)
  recentChapters: Chapter[];

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
    // Pre-compute recentChapters once for all middlewares
    if (!payload.recentChapters || payload.recentChapters.length === 0) {
      const recentCount = payload.project.config?.advancedSettings?.recentChaptersCount ?? 3;
      const chapters = payload.project.chapters || [];
      payload.recentChapters = chapters
        .filter(ch => ch.number < payload.currentChapter.number && ch.number >= payload.currentChapter.number - recentCount)
        .sort((a, b) => b.number - a.number);
    }

    for (const middleware of this.middlewares) {
      if (payload.budget.remaining <= 0) {
        payload.warnings.push(`[${middleware.name}] 由于 Token 预算耗尽被跳过。`);
        continue;
      }

      await middleware.process(payload);
    }
    return payload;
  }
}
