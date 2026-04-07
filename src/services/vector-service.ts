import type { Project, Chapter } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { getLogger } from '@/utils/logger';

/**
 * 向量数据库服务
 * @module services/vector-service
 *
 * 基于Rust SQLite后端的向量检索服务，支持：
 * - 文档嵌入（支持本地ONNX模型和OpenAI API）
 * - 高性能 Rust 原生向量检索
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface EmbeddingConfig {
  provider: 'local' | 'openai';
  model: string;
  dimension: number;
  apiKey?: string;
  baseUrl?: string;
  batchSize?: number;
}

export interface VectorDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  embedding?: number[];
}

export interface DocumentMetadata {
  type: 'setting' | 'character' | 'plot' | 'event' | 'chapter' | 'rule';
  projectId: string;
  chapterNumber?: number;
  timestamp: number;
  [key: string]: any;
}

export interface SearchOptions {
  topK?: number;
  filter?: Record<string, unknown>;
  hybrid?: boolean;
  rrfK?: number;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: DocumentMetadata;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export interface CollectionConfig {
  name: string;
  description?: string;
  dimension: number;
  distanceMetric: 'cosine' | 'l2' | 'ip';
}

export interface IndexStats {
  collection: string;
  documentCount: number;
  dimension: number;
  indexSize: number;
  lastUpdated: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
  healthDetails?: {
    issue: string;
    recommendation: string;
  }[];
}

// ============================================================================
// 嵌入模型实现
// ============================================================================

abstract class EmbeddingModel {
  protected config: EmbeddingConfig;

  constructor(config: EmbeddingConfig) {
    this.config = config;
  }

  abstract embed(text: string): Promise<number[]>;
  abstract embedBatch(texts: string[]): Promise<number[][]>;
  abstract getDimension(): number;

  protected tokenize(text: string): string[] {
    const chinesePattern = /[\u4e00-\u9fa5]+/g;
    const englishPattern = /[a-zA-Z]+/g;

    const chineseTokens = text.match(chinesePattern) || [];
    const englishTokens = text.match(englishPattern) || [];

    return [...chineseTokens, ...englishTokens.map(t => t.toLowerCase())];
  }
}

class LocalEmbeddingModel extends EmbeddingModel {
  private pipeline: any = null;
  private initialized = false;

  constructor(config: EmbeddingConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { pipeline, env } = await import('@xenova/transformers');
      
      // 关键修复：在浏览器中绝对不能将 allowLocalModels 设为 true，否则会触发 Node.js 环境误判导致 registerBackend 崩溃！
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.allowRemoteModels = true;
      
      // 将"远程"服务器强制指向本地的 Vite 开发服务器 /models/ 目录
      env.remoteHost = window.location.origin;
      env.remotePathTemplate = '/models/{model}/';

      this.pipeline = await pipeline(
        'feature-extraction',
        this.config.model || 'Xenova/all-MiniLM-L6-v2',
        { quantized: true }
      );

      this.initialized = true;
    } catch (error) {
      getLogger('vector:service').error('本地嵌入模型初始化失败', error);
      throw new Error(`本地模型下载或加载失败 (通常是网络屏蔽导致)。详细错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.pipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data as Float32Array);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.batchSize || 8;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...batchResults);
    }

    return results;
  }

  getDimension(): number {
    return this.config.dimension || 384;
  }
}

class OpenAIEmbeddingModel extends EmbeddingModel {
  constructor(config: EmbeddingConfig) {
    super(config);
    if (!config.apiKey) {
      throw new Error('OpenAI API密钥未配置');
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Embedding API错误: ${response.status} ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = this.config.batchSize || 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await fetch(`${this.config.baseUrl || 'https://api.openai.com/v1'}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'text-embedding-3-small',
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`OpenAI Embedding API错误: ${response.status} ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      const batchEmbeddings = data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((item: { embedding: number[] }) => item.embedding);

      results.push(...batchEmbeddings);
    }

    return results;
  }

  getDimension(): number {
    const modelDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };
    const model = this.config.model || 'text-embedding-3-small';
    return modelDimensions[model] || this.config.dimension || 1536;
  }
}

// ============================================================================
// 向量服务主类
// ============================================================================

const DEFAULT_COLLECTIONS: CollectionConfig[] = [
  { name: 'world_settings', dimension: 384, distanceMetric: 'cosine' },
  { name: 'character_profiles', dimension: 384, distanceMetric: 'cosine' },
  { name: 'plot_threads', dimension: 384, distanceMetric: 'cosine' },
  { name: 'major_events', dimension: 384, distanceMetric: 'cosine' },
  { name: 'chapter_content', dimension: 384, distanceMetric: 'cosine' },
  { name: 'world_rules', dimension: 384, distanceMetric: 'cosine' },
];

export class VectorService {
  private embeddingModel: EmbeddingModel;
  private collections: Map<string, CollectionConfig> = new Map();
  private initialized = false;
  private embeddingCache: Map<string, number[]> = new Map();
  private cacheMaxSize = 1000;
  private logger = getLogger('vector:service');

  constructor(config: EmbeddingConfig) {
    if (config.provider === 'local') {
      this.embeddingModel = new LocalEmbeddingModel(config);
    } else {
      this.embeddingModel = new OpenAIEmbeddingModel(config);
    }

    for (const collection of DEFAULT_COLLECTIONS) {
      this.collections.set(collection.name, {
        ...collection,
        dimension: this.embeddingModel.getDimension(),
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (this.embeddingModel instanceof LocalEmbeddingModel) {
        await (this.embeddingModel as LocalEmbeddingModel).initialize();
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error('向量服务初始化失败', error);
      throw error;
    }
  }

  async addDocument(collection: string, document: VectorDocument): Promise<void> {
    await this.addDocuments(collection, [document]);
  }

  async addDocuments(collection: string, documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized();

    const texts = documents.map(d => d.content);
    const embeddings = documents[0].embedding
      ? documents.map(d => d.embedding!)
      : await this.embeddingModel.embedBatch(texts);

    const payload = documents.map((doc, i) => ({
      id: doc.id,
      collection,
      project_id: doc.metadata.projectId || '',
      content: doc.content,
      metadata: JSON.stringify(doc.metadata),
      embedding: embeddings[i],
      keywords: JSON.stringify(this.extractKeywords(doc.content)),
    }));

    await invoke('add_vector_documents', { documents: payload });
  }

  async updateDocument(collection: string, id: string, updates: Partial<VectorDocument>): Promise<void> {
    if (updates.content && updates.metadata) {
      await this.addDocument(collection, { id, content: updates.content, metadata: updates.metadata });
    }
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    await invoke('delete_vector_document', { id });
  }

  async deleteDocuments(collection: string, filter: Record<string, unknown>): Promise<number> {
    const projectIdRaw = filter?.projectId;
    const projectId = typeof projectIdRaw === 'string' && projectIdRaw.trim().length > 0
      ? projectIdRaw
      : null;

    const metadataFilterEntries = Object.entries(filter || {}).filter(([key, value]) => {
      if (key === 'projectId') return false;
      return value !== undefined && value !== null;
    });

    const metadataFilter = metadataFilterEntries.length > 0
      ? Object.fromEntries(metadataFilterEntries)
      : null;

    const deleted = await invoke<number>('delete_vector_documents', {
      collection,
      projectId,
      filter: metadataFilter ? JSON.stringify(metadataFilter) : null,
    });

    return deleted;
  }

  async getDocument(collection: string, id: string): Promise<VectorDocument | null> {
    const result = await invoke<{
      id: string;
      content: string;
      metadata: string;
      embedding?: number[];
    } | null>('get_vector_document', {
      collection,
      id,
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      content: result.content,
      metadata: JSON.parse(result.metadata) as DocumentMetadata,
      embedding: result.embedding,
    };
  }

  async vectorSearch(
    collection: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const { topK = 10, filter, minScore = 0 } = options;
    const queryEmbedding = await this.getEmbeddingWithCache(query);
    const projectId = filter?.projectId as string | undefined;

    const results: any[] = await invoke('vector_search', {
      collection,
      projectId: projectId || null,
      queryEmbedding,
      topK,
      minScore,
    });

    const searchResults = results.map(r => ({
      id: r.id,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      score: r.score,
      source: r.source as 'vector',
    }));

    // P1-⑤: OP-RAG 保序检索 — 按原文章节顺序时间线重排
    searchResults.sort((a, b) => {
      const aChapter = a.metadata?.chapterIndex ?? a.metadata?.chapterNumber ?? 0;
      const bChapter = b.metadata?.chapterIndex ?? b.metadata?.chapterNumber ?? 0;
      return aChapter - bChapter;
    });

    return searchResults;
  }

  async keywordSearch(
    collection: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return [];
  }

  async hybridSearch(
    collection: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return this.vectorSearch(collection, query, options);
  }

  async search(arg1: any, arg2?: any, arg3?: any): Promise<any[]> {
    if (typeof arg2 === 'number' || (arg2 === undefined && arg3 === undefined)) {
      // Signature: search(query, topK, options)
      const query = arg1 as string;
      const topK = arg2 as number | undefined ?? 10;
      const options = arg3 as any;
      await this.ensureInitialized();
      return this.vectorSearch("chapter_content", query, { topK, minScore: options?.minScore }) as any;
    } else {
      // Signature: search(collection, query, options)
      const collection = arg1 as string;
      const query = arg2 as string;
      const options = arg3 as SearchOptions ?? {};
      return this.vectorSearch(collection, query, options);
    }
  }

  async rebuildIndex(collection: string): Promise<void> {
    // No-op for Rust backend
  }

  async getIndexStats(collection: string): Promise<IndexStats> {
    return {
      collection,
      documentCount: 0,
      dimension: 384,
      indexSize: 0,
      lastUpdated: Date.now(),
      health: 'healthy',
    };
  }

  async healthCheck(): Promise<Map<string, IndexStats>> {
    return new Map();
  }

  async clearCollection(collection: string): Promise<void> {
    await invoke('clear_vector_collection', { collection });
  }

  async clearAll(): Promise<void> {
    for (const [name] of this.collections) {
      await this.clearCollection(name);
    }
  }

async indexProject(project: Project): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    console.log('[VectorService] 开始索引项目:', project.id)

    const documents: any[] = []

    // 1. 索引世界观设定
    if (project.world) {
      documents.push(...this.extractWorldDocuments(project))
    }

    // 2. 索引人物
    if (project.characters && project.characters.length > 0) {
      documents.push(...this.extractCharacterDocuments(project))
    }

    // 3. 索引大纲
    if (project.outline) {
      documents.push(...this.extractOutlineDocuments(project))
    }

    // 4. 索引章节
    if (project.chapters && project.chapters.length > 0) {
      documents.push(...this.extractChapterDocuments(project))
    }

    console.log(`[VectorService] 提取了 ${documents.length} 个文档`)

    // 批量生成嵌入
    const embeddings = await this.embeddingModel.embedBatch(
      documents.map(d => d.content)
    )

    // 创建向量文档
    const vectorDocs: VectorDocument[] = documents.map((doc, i) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      embedding: embeddings[i]
    }))

    // 批量添加到向量存储
    await this.addDocuments("chapter_content", vectorDocs)

    console.log(`[VectorService] 索引完成，共 ${vectorDocs.length} 个文档`)
  }

async indexChapter(chapter: Chapter, projectId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    const doc = this.extractSingleChapterDocument(chapter, projectId)
    const embedding = await this.embeddingModel.embed(doc.content)

    await this.addDocument("chapter_content", {
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      embedding
    })

    console.log(`[VectorService] 已索引章节: ${chapter.number} - ${chapter.title}`)
  }

async deleteChapter(chapterId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    await this.deleteDocument("chapter_content", chapterId)
    console.log(`[VectorService] 已删除章节索引: ${chapterId}`)
  }

async retrieveRelevantContext(
    currentChapter: Chapter,
    project: Project,
    options?: {
      topK?: number
      minScore?: number
      includeTypes?: any['type'][]
      excludeCurrentChapter?: boolean
    }
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    // 构建查询文本
    const queryText = this.buildChapterQuery(currentChapter, project)

    // 生成查询向量
    const queryEmbedding = await this.embeddingModel.embed(queryText)

    // 构建过滤器
    const filter = (metadata: any): boolean => {
      // 排除当前章节
      if (options?.excludeCurrentChapter && metadata.chapterNumber === currentChapter.number) {
        return false
      }

      // 过滤文档类型
      if (options?.includeTypes && !options.includeTypes.includes(metadata.type)) {
        return false
      }

      return true
    }

    // 执行搜索
    const results = await (this as any).vectorStore.search(
      queryEmbedding,
      options?.topK || 10,
      {
        minScore: options?.minScore || 0.5,
        filter
      }
    )

    console.log(`[VectorService] 检索到 ${results.length} 个相关文档`)
    return results
  }

async indexExternalArtifacts(
    artifacts: any[]
  ): Promise<number> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (artifacts.length === 0) {
      return 0
    }

    const docs: any[] = artifacts.map(artifact => {
      const payload = artifact.payload as Record<string, unknown>
      const content = typeof payload.content === 'string' && payload.content.trim()
        ? payload.content
        : JSON.stringify(payload)

      const typeMap: Record<any['type'], any['type']> = {
        worldbook: 'rule',
        knowledge: 'setting',
        character_profile: 'character',
        world_fact: 'setting',
        timeline_event: 'event',
      }

      return {
        id: `trace-${artifact.id}`,
        content,
        metadata: {
          type: typeMap[artifact.type],
          projectId: (this as any).config.projectId!,
          timestamp: Date.now(),
          source: 'conversation-trace',
          artifactType: artifact.type,
          confidence: artifact.confidence,
          title: artifact.title,
        },
      }
    })

    const embeddings = await this.embeddingModel.embedBatch(docs.map(d => d.content))

    const vectorDocs: VectorDocument[] = docs.map((doc, index) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      embedding: embeddings[index],
    }))

    await this.addDocuments("chapter_content", vectorDocs)
    return vectorDocs.length
  }

async getDocumentCount(): Promise<number> {
    return await Promise.resolve(0) /* TODO */
  }

async clear(): Promise<void> {
    await this.clearAll()
    console.log('[VectorService] 已清空所有索引')
  }

private extractWorldDocuments(project: Project): any[] {
    const documents: any[] = []
    const world = project.world

    // 世界观概述
    if (world.name || world.era) {
      documents.push({
        id: `world-overview-${project.id}`,
        content: `世界观：${world.name}\n时代：${world.era.time}\n科技水平：${world.era.techLevel}\n社会形态：${world.era.socialForm}`,
        metadata: {
          type: 'setting',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    }

    // 力量体系
    if (world.powerSystem) {
      const levels = world.powerSystem.levels?.map(l => `${l.name}: ${l.description}`).join('\n') || ''
      documents.push({
        id: `world-power-${project.id}`,
        content: `力量体系：${world.powerSystem.name}\n等级划分：\n${levels}`,
        metadata: {
          type: 'setting',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    }

    // 势力
    if (world.factions && world.factions.length > 0) {
      world.factions.forEach(faction => {
        documents.push({
          id: `faction-${faction.id}`,
          content: `势力：${faction.name}\n类型：${faction.type}\n描述：${faction.description}`,
          metadata: {
            type: 'setting',
            projectId: project.id,
            timestamp: Date.now()
          }
        })
      })
    }

    // 地点
    if (world.geography?.locations && world.geography.locations.length > 0) {
      world.geography.locations.forEach(location => {
        documents.push({
          id: `location-${location.id}`,
          content: `地点：${location.name}\n重要程度：${location.importance}\n描述：${location.description}`,
          metadata: {
            type: 'setting',
            projectId: project.id,
            timestamp: Date.now()
          }
        })
      })
    }

    // 世界规则
    if (world.rules && world.rules.length > 0) {
      world.rules.forEach(rule => {
        documents.push({
          id: `rule-${rule.id}`,
          content: `世界规则：${rule.name}\n描述：${rule.description}`,
          metadata: {
            type: 'rule',
            projectId: project.id,
            timestamp: Date.now()
          }
        })
      })
    }

    return documents
  }

private extractCharacterDocuments(project: Project): any[] {
    const documents: any[] = []

    project.characters.forEach(char => {
      const parts: string[] = []

      parts.push(`人物：${char.name}`)
      if (char.aliases && char.aliases.length > 0) {
        parts.push(`别名：${char.aliases.join('、')}`)
      }
      parts.push(`性别：${char.gender === 'male' ? '男' : char.gender === 'female' ? '女' : '其他'}`)
      parts.push(`年龄：${char.age}岁`)

      if (char.appearance) {
        parts.push(`外貌：${char.appearance}`)
      }

      if (char.personality && char.personality.length > 0) {
        parts.push(`性格：${char.personality.join('、')}`)
      }

      if (char.background) {
        parts.push(`背景：${char.background}`)
      }

      if (char.abilities && char.abilities.length > 0) {
        parts.push(`能力：${char.abilities.map(a => `${a.name}(${a.level})`).join('、')}`)
      }

      if (char.powerLevel) {
        parts.push(`实力等级：${char.powerLevel}`)
      }

      documents.push({
        id: `character-${char.id}`,
        content: parts.join('\n'),
        metadata: {
          type: 'character',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    })

    return documents
  }

private extractOutlineDocuments(project: Project): any[] {
    const documents: any[] = []
    const outline = project.outline

    // 故事概述
    if (outline.synopsis) {
      documents.push({
        id: `outline-synopsis-${project.id}`,
        content: `故事概述：${outline.synopsis}`,
        metadata: {
          type: 'plot',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    }

    // 主题
    if (outline.theme) {
      documents.push({
        id: `outline-theme-${project.id}`,
        content: `故事主题：${outline.theme}`,
        metadata: {
          type: 'plot',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    }

    // 主线剧情
    if (outline.mainPlot) {
      documents.push({
        id: `plot-main-${project.id}`,
        content: `主线剧情：${outline.mainPlot.name}\n${outline.mainPlot.description}`,
        metadata: {
          type: 'plot',
          projectId: project.id,
          timestamp: Date.now()
        }
      })
    }

    // 支线剧情
    if (outline.subPlots && outline.subPlots.length > 0) {
      outline.subPlots.forEach(plot => {
        documents.push({
          id: `plot-${plot.id}`,
          content: `支线剧情：${plot.name}\n${plot.description}\n开始章节：${plot.startChapter || '未知'}\n结束章节：${plot.endChapter || '未知'}`,
          metadata: {
            type: 'plot',
            projectId: project.id,
            timestamp: Date.now()
          }
        })
      })
    }

    // 伏笔
    if (outline.foreshadowings && outline.foreshadowings.length > 0) {
      outline.foreshadowings.forEach(foreshadow => {
        documents.push({
          id: `foreshadow-${foreshadow.id}`,
          content: `伏笔：${foreshadow.description}\n埋设章节：${foreshadow.plantChapter}\n揭示章节：${foreshadow.resolveChapter || '未揭示'}\n状态：${foreshadow.status}`,
          metadata: {
            type: 'plot',
            projectId: project.id,
            timestamp: Date.now()
          }
        })
      })
    }

    return documents
  }

private extractChapterDocuments(project: Project): any[] {
    const documents: any[] = []

    project.chapters.forEach(chapter => {
      const doc = this.extractSingleChapterDocument(chapter, project.id)
      documents.push(doc)
    })

    return documents
  }

private extractSingleChapterDocument(chapter: Chapter, projectId: string): any {
    const parts: string[] = []

    parts.push(`第${chapter.number}章：${chapter.title}`)
    parts.push(chapter.content)

    // 添加大纲信息
    if (chapter.outline) {
      if (chapter.outline.goals && chapter.outline.goals.length > 0) {
        parts.push(`\n章节目标：${chapter.outline.goals.join('、')}`)
      }
      if (chapter.outline.location) {
        parts.push(`地点：${chapter.outline.location}`)
      }
      if (chapter.outline.characters && chapter.outline.characters.length > 0) {
        parts.push(`出场人物：${chapter.outline.characters.join('、')}`)
      }
    }

    return {
      id: `chapter-${chapter.id}`,
      content: parts.join('\n'),
      metadata: {
        type: 'chapter',
        projectId,
        chapterNumber: chapter.number,
        timestamp: new Date(chapter.generationTime).getTime()
      }
    }
  }

private buildChapterQuery(chapter: Chapter, project: Project): string {
    const parts: string[] = []

    // 章节标题
    parts.push(chapter.title)

    // 章节大纲信息
    if (chapter.outline) {
      if (chapter.outline.goals && chapter.outline.goals.length > 0) {
        parts.push(chapter.outline.goals.join(' '))
      }
      if (chapter.outline.conflicts && chapter.outline.conflicts.length > 0) {
        parts.push(chapter.outline.conflicts.join(' '))
      }
      if (chapter.outline.characters && chapter.outline.characters.length > 0) {
        parts.push(chapter.outline.characters.join(' '))
      }
      if (chapter.outline.location) {
        parts.push(chapter.outline.location)
      }
    }

    // 章节内容（取前 500 字）
    if (chapter.content) {
      parts.push(chapter.content.substring(0, 500))
    }

    return parts.join(' ')
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async getEmbeddingWithCache(text: string): Promise<number[]> {
    const cacheKey = this.hashText(text);

    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    const embedding = await this.embeddingModel.embed(text);

    if (this.embeddingCache.size >= this.cacheMaxSize) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) this.embeddingCache.delete(firstKey);
    }
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private extractKeywords(text: string): string[] {
    const tokens = this.tokenize(text);
    return Array.from(new Set(tokens)).slice(0, 20);
  }

  private tokenize(text: string): string[] {
    const chinesePattern = /[\u4e00-\u9fa5]+/g;
    const englishPattern = /[a-zA-Z]+/g;

    const chineseTokens = text.match(chinesePattern) || [];
    const englishTokens = text.match(englishPattern) || [];

    const chineseChars = chineseTokens.join('').split('');
    return [...chineseChars, ...englishTokens.map(t => t.toLowerCase())];
  }
}

// ============================================================================
// 导出和工厂函数
// ============================================================================

let defaultInstance: VectorService | null = null;

export async function createVectorService(
  config?: Partial<EmbeddingConfig>
): Promise<VectorService> {
  const fullConfig: EmbeddingConfig = {
    provider: config?.provider ?? 'local',
    // 默认使用bge-small-zh-v1.5（中文优化，512维）
    // 用户可在ProjectConfig.vectorConfig中切换为：
    // - bge-m3（更强大，1024维，需下载约2GB）
    // - text-embedding-3-small（OpenAI）
    // - 其他模型
    model: config?.model ?? 'bge-small-zh-v1.5',
    dimension: config?.dimension ?? 512,  // bge-small-zh-v1.5 维度
    apiKey: config?.apiKey,
    baseUrl: config?.baseUrl,
    batchSize: config?.batchSize ?? 8,
    ...config,
  };

  const service = new VectorService(fullConfig);
  await service.initialize();

  return service;
}

export async function getVectorService(config?: Partial<EmbeddingConfig>): Promise<VectorService> {
  if (!defaultInstance) {
    defaultInstance = await createVectorService(config);
  }
  return defaultInstance;
}

export function resetVectorService(): void {
  defaultInstance = null;
}

export async function indexExternalArtifacts(
  projectId: string,
  artifacts: any[],
  config?: any
): Promise<number> {
  const service = await getVectorService(config);
  return service.indexExternalArtifacts(artifacts);
}
