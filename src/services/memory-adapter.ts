/**
 * 记忆系统适配器
 * @module services/memory-adapter
 *
 * 整合 MemoryService 和 VectorService
 * 提供统一的记忆系统接口
 */

import { MemoryService, type AIService, type MemoryEntry } from './memory-service';
import { VectorService, type EmbeddingConfig } from './vector-service';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 记忆系统配置
 */
export interface MemorySystemConfig {
  /** AI服务配置 */
  ai: {
    /** 生成摘要的模型 */
    summaryModel?: string;
    /** 提取关键词的模型 */
    keywordModel?: string;
  };
  /** 向量服务配置 */
  vector?: Partial<EmbeddingConfig>;
  /** 记忆配置 */
  memory?: {
    shortTermMaxTokens?: number;
    midTermMaxTokens?: number;
    longTermMaxTokens?: number;
    shortTermChapters?: number;
    midTermChapters?: number;
  };
}

/**
 * 上下文构建选项
 */
export interface ContextOptions {
  /** 当前章节号 */
  currentChapter?: number;
  /** 涉及的人物 */
  involvedCharacters?: string[];
  /** 情节关键词 */
  plotKeywords?: string[];
  /** 最大token数 */
  maxTokens?: number;
  /** 是否包含人物档案 */
  includeCharacters?: boolean;
  /** 是否包含世界设定 */
  includeWorldSetting?: boolean;
  /** 是否包含历史事件 */
  includeEvents?: boolean;
}

/**
 * 构建的上下文
 */
export interface BuiltContext {
  /** 系统提示 */
  systemPrompt: string;
  /** 世界设定 */
  worldSetting?: string;
  /** 人物档案 */
  characters: string[];
  /** 历史摘要 */
  history: {
    recentChapters: string[];
    chapterSummaries: string[];
    relevantEvents: string[];
  };
  /** 总token数 */
  totalTokens: number;
  /** 来源统计 */
  sources: {
    short: number;
    mid: number;
    long: number;
  };
}

// ============================================================================
// AI服务适配器
// ============================================================================

/**
 * AI服务适配器
 * 将外部的AI服务适配为MemoryService需要的接口
 */
export class AIServiceAdapter implements AIService {
  private generateText: (prompt: string, options?: { model?: string; maxTokens?: number }) => Promise<string>;

  constructor(
    generateTextFn: (prompt: string, options?: { model?: string; maxTokens?: number }) => Promise<string>
  ) {
    this.generateText = generateTextFn;
  }

  async generateSummary(content: string, type: 'chapter' | 'volume' | 'book'): Promise<string> {
    const lengthMap = {
      chapter: 300,
      volume: 500,
      book: 1000,
    };

    const focusMap = {
      chapter: '主要事件、人物变化、情节推进',
      volume: '主线进展、人物成长、世界观展开',
      book: '故事主题、人物弧线、核心冲突',
    };

    const prompt = `请为以下内容生成${type === 'chapter' ? '章节' : type === 'volume' ? '卷' : '全书'}级摘要：

内容：
${content}

要求：
- 长度：${lengthMap[type]}字以内
- 重点包含：${focusMap[type]}
- 突出关键转折和人物变化
- 保留重要细节以便后续引用

请生成摘要：`;

    return this.generateText(prompt, { maxTokens: lengthMap[type] * 2 });
  }

  async extractKeywords(text: string): Promise<string[]> {
    const prompt = `请从以下文本中提取关键词，每行一个关键词：

${text.substring(0, 2000)}

要求：
- 提取最重要的人物名、地点、事件、概念等关键词
- 最多提取10个关键词
- 只输出关键词，每行一个`;

    const result = await this.generateText(prompt, { maxTokens: 200 });
    return result.split('\n').filter(line => line.trim().length > 0);
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    // 嵌入向量由 VectorService 单独处理
    // 这里返回空数组，实际使用时应该调用 VectorService
    return [];
  }
}

// ============================================================================
// 向量存储适配器
// ============================================================================

/**
 * 向量存储适配器 (V5 架构版)
 * V5 变更：所有数据统一存储在 chapter_content 集合中，通过 metadata.type 区分
 * 注意：V5 架构下，人物/事件/设定等结构化数据应由图谱和 WorldbookInjector 负责，
 * 不再通过向量服务索引。此适配器仅用于兼容 MemoryService 的接口。
 */
export class VectorStoreAdapter {
  private vectorService: VectorService;

  constructor(vectorService: VectorService) {
    this.vectorService = vectorService;
  }

  async add(_collection: string, entries: MemoryEntry[]): Promise<void> {
    // V5: 统一使用 addDocument，不再区分集合
    for (const entry of entries) {
      await this.vectorService.addDocument({
        id: entry.id,
        content: entry.content,
        metadata: {
          type: 'trace' as const, // V5 只支持 'chapter' | 'trace'
          projectId: 'default',
          timestamp: entry.metadata.timestamp || Date.now(),
          importance: entry.metadata.importance,
          tags: entry.metadata.tags,
          chapterId: entry.metadata.chapterId,
          chapterNumber: entry.metadata.chapterNumber,
        },
        embedding: entry.embedding,
      });
    }
  }

  async search(collection: string, query: string | number[], topK: number): Promise<MemoryEntry[]> {
    // V5: Handle both text and vector queries
    let queryText: string;
    if (Array.isArray(query)) {
      // Vector queries not supported through this deprecated adapter
      // Use VectorService.vectorSearch directly instead
      console.warn('[VectorStoreAdapter] Vector query not supported in V5 adapter, use VectorService directly');
      return [];
    }
    queryText = query;

    // V5: 统一使用 vectorSearch，通过 filter 传递 collection 信息
    const results = await this.vectorService.vectorSearch(queryText, {
      topK,
      filter: { originalCollection: collection }, // 保留原始 collection 名供过滤
      minScore: 0.3
    });

    return results.map(r => ({
      id: r.id,
      type: r.metadata.type as MemoryEntry['type'],
      content: r.content,
      metadata: {
        timestamp: r.metadata.timestamp,
        tokens: 0,
        importance: (r.metadata.importance as number) || r.score,
        tags: r.metadata.tags as string[] | undefined,
        chapterId: r.metadata.chapterId as string | undefined,
        chapterNumber: r.metadata.chapterNumber as number | undefined,
      },
    }));
  }

  async delete(_collection: string, ids: string[]): Promise<void> {
    // V5: 逐个删除
    for (const id of ids) {
      await this.vectorService.deleteDocument(id);
    }
  }
}

// ============================================================================
// 记忆系统管理器
// ============================================================================

/**
 * 记忆系统管理器
 * 提供高级的记忆管理功能
 *
 * @deprecated V5 架构下不再使用此管理器。记忆功能已迁移到 V5 Graph-Guided RAG + Table Memory。
 * 此模块将在未来版本中移除。
 */
export class MemorySystemManager {
  private memoryService: MemoryService;
  private vectorService: VectorService | null;

  constructor(
    memoryService: MemoryService,
    vectorService?: VectorService
  ) {
    this.memoryService = memoryService;
    this.vectorService = vectorService || null;
  }

  /**
   * 构建完整的生成上下文
   */
  async buildGenerationContext(options: ContextOptions = {}): Promise<BuiltContext> {
    const {
      includeCharacters = true,
      includeWorldSetting = true,
      includeEvents = true,
    } = options;

    const result: BuiltContext = {
      systemPrompt: '',
      characters: [],
      history: {
        recentChapters: [],
        chapterSummaries: [],
        relevantEvents: [],
      },
      totalTokens: 0,
      sources: { short: 0, mid: 0, long: 0 },
    };

    // 1. 获取基础上下文
    const retrievalResult = await this.memoryService.buildContext(options);
    result.sources = retrievalResult.sources;
    result.totalTokens = retrievalResult.totalTokens;

    // 2. 组织内容
    for (const entry of retrievalResult.entries) {
      switch (entry.type) {
        case 'chapter':
          result.history.recentChapters.push(entry.content);
          break;
        case 'summary':
          result.history.chapterSummaries.push(entry.content);
          break;
        case 'character':
          if (includeCharacters) {
            result.characters.push(entry.content);
          }
          break;
        case 'setting':
          if (includeWorldSetting) {
            result.worldSetting = entry.content;
          }
          break;
        case 'event':
          if (includeEvents) {
            result.history.relevantEvents.push(entry.content);
          }
          break;
        case 'plot':
          result.history.relevantEvents.push(entry.content);
          break;
      }
    }

    // 3. 生成系统提示
    result.systemPrompt = this.generateSystemPrompt(result);

    return result;
  }

  /**
   * 生成系统提示
   */
  private generateSystemPrompt(context: BuiltContext): string {
    const parts: string[] = [];

    // 角色定义
    parts.push('你是一位专业的小说写作助手，正在帮助用户创作小说。');
    parts.push('请根据提供的上下文信息，保持人物性格、情节发展、世界设定的一致性。');

    // 世界设定
    if (context.worldSetting) {
      parts.push('\n## 世界设定');
      parts.push(context.worldSetting);
    }

    // 人物档案
    if (context.characters.length > 0) {
      parts.push('\n## 人物档案');
      parts.push(context.characters.join('\n\n'));
    }

    // 历史上下文
    if (context.history.chapterSummaries.length > 0) {
      parts.push('\n## 前文摘要');
      parts.push(context.history.chapterSummaries.join('\n'));
    }

    // 最近章节
    if (context.history.recentChapters.length > 0) {
      parts.push('\n## 最近章节');
      parts.push(context.history.recentChapters.join('\n\n---\n\n'));
    }

    // 关键事件
    if (context.history.relevantEvents.length > 0) {
      parts.push('\n## 关键事件');
      parts.push(context.history.relevantEvents.map((e, i) => `${i + 1}. ${e}`).join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * 更新章节记忆
   */
  async updateChapterMemory(
    chapter: any,
    worldSetting?: any,
    characters?: any[]
  ): Promise<void> {
    await this.memoryService.update(chapter, worldSetting, characters);
  }

  /**
   * 搜索相关记忆
   */
  async searchMemory(
    query: string,
    options: {
      types?: ('character' | 'event' | 'setting' | 'plot')[];
      topK?: number;
    } = {}
  ): Promise<MemoryEntry[]> {
    const { types = ['character', 'event', 'setting', 'plot'], topK = 5 } = options;

    const allResults: MemoryEntry[] = [];

    for (const type of types) {
      const results = await this.memoryService['longTerm'].search(query, {
        collection: type === 'character' ? 'characters' : type === 'event' ? 'events' : type === 'setting' ? 'settings' : 'plots',
        topK,
      });
      allResults.push(...results);
    }

    // 按重要性排序
    return allResults
      .sort((a, b) => b.metadata.importance - a.metadata.importance)
      .slice(0, topK);
  }

  /**
   * 获取记忆统计
   */
  async getMemoryStats(): Promise<{
    short: { count: number; tokens: number; utilization: number };
    mid: { count: number; tokens: number };
    long: { count: number; tokens: number };
    vector?: {
      collections: { name: string; count: number }[];
    };
  }> {
    const stats = await this.memoryService.getStats();

    const result: any = { ...stats };

    if (this.vectorService) {
      result.vector = {
        collections: [],
      };

      // V5: 使用 getDocumentCount 替代已删除的 getIndexStats
      try {
        const count = await this.vectorService.getDocumentCount();
        result.vector.collections.push({
          name: 'chapter_content',
          count,
        });
      } catch {
        // 忽略错误
      }
    }

    return result;
  }

  /**
   * 清理所有记忆
   */
  async clearAll(): Promise<void> {
    await this.memoryService.clearAll();

    if (this.vectorService) {
      await this.vectorService.clear();
    }
  }

  /**
   * 导出记忆
   */
  async exportMemory(): Promise<{
    memory: {
      short: MemoryEntry[];
      mid: MemoryEntry[];
      long: MemoryEntry[];
    };
  }> {
    const memory = await this.memoryService.export();
    return { memory };
  }

  /**
   * 导入记忆
   */
  async importMemory(data: {
    memory: {
      short?: MemoryEntry[];
      mid?: MemoryEntry[];
      long?: MemoryEntry[];
    };
  }): Promise<void> {
    await this.memoryService.import(data.memory);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建记忆系统
 *
 * @deprecated V5 架构下不再使用。请直接使用 VectorService + Context Pipeline。
 */
export async function createMemorySystem(
  generateText: (prompt: string, options?: { model?: string; maxTokens?: number }) => Promise<string>,
  config?: MemorySystemConfig
): Promise<{
  memoryService: MemoryService;
  vectorService: VectorService | null;
  manager: MemorySystemManager;
}> {
  // 创建AI服务适配器
  const aiService = new AIServiceAdapter(generateText);

  // 创建向量服务（可选）
  let vectorService: VectorService | null = null;
  let vectorAdapter: VectorStoreAdapter | null = null;

  if (config?.vector) {
    vectorService = new VectorService({
      provider: config.vector.provider || 'local',
      model: config.vector.model || '/dist/models/Xenova/bge-m3',
      dimension: config.vector.dimension || 1024,
      ...config.vector,
    });
    await vectorService.initialize();
    vectorAdapter = new VectorStoreAdapter(vectorService);
  }

  // 创建记忆服务
  const memoryService = new MemoryService(
    aiService,
    vectorAdapter || undefined,
    config?.memory
  );
  await memoryService.initialize();

  // 创建管理器
  const manager = new MemorySystemManager(memoryService, vectorService || undefined);

  return {
    memoryService,
    vectorService,
    manager,
  };
}

export default MemorySystemManager;
