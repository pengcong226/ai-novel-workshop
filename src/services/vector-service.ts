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
  [key: string]: unknown;
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

    return results.map(r => ({
      id: r.id,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      score: r.score,
      source: r.source as 'vector',
    }));
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

  async search(
    collection: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    return this.vectorSearch(collection, query, options);
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
    model: config?.model ?? 'Xenova/all-MiniLM-L6-v2',
    dimension: config?.dimension ?? 384,
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
