import type { Project, Chapter } from '@/types';
import { invoke } from '@tauri-apps/api/core';
import { getLogger } from '@/utils/logger';

/**
 * 向量数据库服务 (V5 架构重构版)
 * @module services/vector-service
 *
 * 核心变更：从"全包揽 RAG"重构为"图谱制导的正文切片检索引擎"。
 * - 只索引 Chapter Content（段落级切片），不再索引世界观/人物/大纲（由图谱和 WorldbookInjector 负责）
 * - 检索查询由图谱实体制导（Graph-Guided RAG）
 * - 轻量级重排：图谱命中加权 + 时序衰减（替代昂贵的 Neural Reranker）
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

/** V5: 只保留 chapter 类型和 trace 导入类型 */
export interface DocumentMetadata {
  type: 'chapter' | 'trace';
  projectId: string;
  chapterNumber?: number;
  chunkIndex?: number;        // 段落切片在原章节中的序号
  entityNames?: string[];     // 切片中涉及的人名/地名 (用于图谱命中重排)
  timestamp: number;
  [key: string]: any;
}

export interface SearchOptions {
  topK?: number;
  filter?: Record<string, unknown>;
  minScore?: number;
  /** 当前章节号 (用于时序衰减重排) */
  currentChapterNumber?: number;
  /** 当前章节涉及实体名 (用于图谱命中重排) */
  activeEntityNames?: string[];
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

      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.allowRemoteModels = true;

      env.remoteHost = window.location.origin;
      env.remotePathTemplate = '/models/{model}/';

      this.pipeline = await pipeline(
        'feature-extraction',
        this.config.model || '/dist/models/Xenova/bge-m3',
        { quantized: true }
      );

      this.initialized = true;
    } catch (error) {
      getLogger('vector:service').error('本地嵌入模型初始化失败', error);
      throw new Error(`本地模型下载或加载失败。详细错误: ${error instanceof Error ? error.message : String(error)}`);
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
    return this.config.dimension || 1024;
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
// 段落切片工具
// ============================================================================

/** 段落切片参数 */
const CHUNK_TARGET_CHARS = 400;   // 目标切片长度 (中文约 200~300 字的段落)
const CHUNK_OVERLAP_CHARS = 80;   // 切片重叠字符数 (防止关键句被切断)
const CHUNK_MIN_CHARS = 100;      // 低于此长度的切片合并到前一个

interface ChapterChunk {
  id: string;
  content: string;
  chunkIndex: number;
  entityNames: string[];
}

/**
 * 将章节正文切成段落级切片，保留重叠以防止关键信息断裂。
 * 同时用简单启发式提取切片中的实体名 (用于图谱命中重排)。
 */
function chunkChapterContent(
  chapterId: string,
  chapterNumber: number,
  content: string,
  characterNames: string[],
  locationNames: string[]
): ChapterChunk[] {
  if (!content || content.trim().length === 0) return [];

  const allEntityNames = [...characterNames, ...locationNames];
  const chunks: ChapterChunk[] = [];

  let offset = 0;
  let chunkIndex = 0;
  let carryOver = ''; // 短切片累积区 (合并到下一个切片)

  while (offset < content.length) {
    let end = Math.min(offset + CHUNK_TARGET_CHARS, content.length);

    // 如果不是最后一段，尝试在句子边界处断开
    if (end < content.length) {
      const searchRange = content.substring(end - CHUNK_OVERLAP_CHARS, end + CHUNK_OVERLAP_CHARS);
      const lastPunct = searchRange.lastIndexOf('。');
      const lastExcl = searchRange.lastIndexOf('！');
      const lastQues = searchRange.lastIndexOf('？');
      const lastNewline = searchRange.lastIndexOf('\n');
      const bestBreak = Math.max(lastPunct, lastExcl, lastQues, lastNewline);
      if (bestBreak !== -1) {
        end = (end - CHUNK_OVERLAP_CHARS) + bestBreak + 1;
      }
    }

    const chunkText = carryOver + content.substring(offset, end).trim();
    carryOver = '';
    if (chunkText.length === 0) {
      offset = end;
      continue;
    }

    // 提取本切片中出现的实体名
    const entitiesInChunk = allEntityNames.filter(name => chunkText.includes(name));

    // 如果切片过短且不是最后一片，累积到下一个切片
    if (chunkText.length < CHUNK_MIN_CHARS && end < content.length) {
      carryOver = chunkText + '\n';
      offset = end;
      continue;
    }

    chunks.push({
      id: `chunk-${chapterId}-${chunkIndex}`,
      content: chunkText,
      chunkIndex,
      entityNames: entitiesInChunk,
    });

    chunkIndex++;
    // 下一个切片的开头往前推 overlap 长度，确保关键句不被切断
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP_CHARS);
  }

  // 刷入末尾残留
  if (carryOver.trim().length > 0) {
    const entitiesInCarry = allEntityNames.filter(name => carryOver.includes(name));
    chunks.push({
      id: `chunk-${chapterId}-${chunkIndex}`,
      content: carryOver.trim(),
      chunkIndex,
      entityNames: entitiesInCarry,
    });
  }

  return chunks;
}

/**
 * 从文本中简单提取可能的人名/地名关键词 (用于元数据标签)
 * 这是轻量级启发式，不依赖 NER 模型
 * @deprecated 内联在 chunkChapterContent 中，此函数已不再使用
 */

// ============================================================================
// 轻量级重排
// ============================================================================

/**
 * 图谱命中重排：如果切片涉及当前图谱实体，提高分数
 */
function applyGraphHitRerank(
  results: SearchResult[],
  activeEntityNames: string[]
): SearchResult[] {
  if (!activeEntityNames || activeEntityNames.length === 0) return results;

  return results.map(r => {
    const chunkEntities: string[] = r.metadata?.entityNames || [];
    const hasHit = chunkEntities.some(e => activeEntityNames.includes(e));
    return {
      ...r,
      score: hasHit ? r.score * 1.5 : r.score,
    };
  });
}

/**
 * 时序衰减重排：距离当前章节越近，分数越高
 * decayFactor = 0.005 表示每差一章衰减 0.5%
 */
function applyTimeDecayRerank(
  results: SearchResult[],
  currentChapterNumber: number,
  decayFactor: number = 0.005
): SearchResult[] {
  return results.map(r => {
    const chunkChapter = r.metadata?.chapterNumber ?? 0;
    if (chunkChapter <= 0 || currentChapterNumber <= 0) return r;

    const distance = currentChapterNumber - chunkChapter;
    if (distance < 0) {
      // 未来章节数据不应存在，若出现则大幅衰减
      return { ...r, score: r.score * 0.1 };
    }
    const decayMultiplier = Math.max(1 - distance * decayFactor, 0.3); // 最低不低于 0.3
    return {
      ...r,
      score: r.score * decayMultiplier,
    };
  });
}

/**
 * 组合重排：先图谱命中提权，再时序衰减，最后按分数降序排列
 */
function applyCombinedRerank(
  results: SearchResult[],
  options: SearchOptions
): SearchResult[] {
  let reranked = results;

  // 1. 图谱命中提权
  if (options.activeEntityNames && options.activeEntityNames.length > 0) {
    reranked = applyGraphHitRerank(reranked, options.activeEntityNames);
  }

  // 2. 时序衰减
  if (options.currentChapterNumber && options.currentChapterNumber > 0) {
    reranked = applyTimeDecayRerank(reranked, options.currentChapterNumber);
  }

  // 3. 按最终分数降序排列
  reranked.sort((a, b) => b.score - a.score);

  return reranked;
}

// ============================================================================
// 向量服务主类 (V5 重构版)
// ============================================================================

/** V5: 只保留一个 collection，所有正文切片统一存储 */
const CHAPTER_CONTENT_COLLECTION = 'chapter_content';

export class VectorService {
  private embeddingModel: EmbeddingModel;
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

  // ============================================================================
  // 文档 CRUD
  // ============================================================================

  async addDocument(document: VectorDocument): Promise<void> {
    await this.addDocuments([document]);
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    await this.ensureInitialized();

    const texts = documents.map(d => d.content);
    const allHaveEmbeddings = documents.every(d => d.embedding && d.embedding.length > 0);
    const embeddings = allHaveEmbeddings
      ? documents.map(d => d.embedding!)
      : await this.embeddingModel.embedBatch(texts);

    const payload = documents.map((doc, i) => ({
      id: doc.id,
      collection: CHAPTER_CONTENT_COLLECTION,
      project_id: doc.metadata.projectId || '',
      content: doc.content,
      metadata: JSON.stringify(doc.metadata),
      embedding: embeddings[i],
      keywords: JSON.stringify(doc.metadata?.entityNames || []),
    }));

    await invoke('add_vector_documents', { documents: payload });
  }

  async deleteDocument(id: string): Promise<void> {
    await invoke('delete_vector_document', { id });
  }

  async deleteDocumentsForProject(projectId: string): Promise<number> {
    const deleted = await invoke<number>('delete_vector_documents', {
      collection: CHAPTER_CONTENT_COLLECTION,
      projectId,
      filter: null,
    });
    return deleted;
  }

  // ============================================================================
  // 索引：只索引章节正文 (段落级切片)
  // ============================================================================

  /**
   * 索引整个项目的所有章节正文 (段落级切片)
   * V5 变更：不再索引世界观、人物、大纲，只索引 Chapter Content
   */
  async indexProject(project: Project): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.info('开始索引项目 (仅正文切片)', { projectId: project.id });

    // 收集已知实体名 (用于给切片打 entityNames 标签)
    const characterNames = (project.characters || []).map(c => c.name);
    const locationNames = (project.world?.geography?.locations || []).map(l => l.name);

    const allDocs: VectorDocument[] = [];

    for (const chapter of project.chapters || []) {
      const chunks = chunkChapterContent(
        chapter.id,
        chapter.number,
        chapter.content || '',
        characterNames,
        locationNames
      );

      for (const chunk of chunks) {
        allDocs.push({
          id: chunk.id,
          content: chunk.content,
          metadata: {
            type: 'chapter',
            projectId: project.id,
            chapterNumber: chapter.number,
            chunkIndex: chunk.chunkIndex,
            entityNames: chunk.entityNames,
            timestamp: chapter.generationTime ? new Date(chapter.generationTime).getTime() : Date.now(),
          },
        });
      }
    }

    if (allDocs.length === 0) {
      this.logger.info('没有可索引的章节内容');
      return;
    }

    // 批量生成嵌入
    const embeddings = await this.embeddingModel.embedBatch(allDocs.map(d => d.content));

    // 填入嵌入向量
    const vectorDocs: VectorDocument[] = allDocs.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i],
    }));

    // 批量写入 (分批，每批 50 条)
    const BATCH_SIZE = 50;
    for (let i = 0; i < vectorDocs.length; i += BATCH_SIZE) {
      const batch = vectorDocs.slice(i, i + BATCH_SIZE);
      await this.addDocuments(batch);
    }

    this.logger.info('索引完成', { totalChunks: vectorDocs.length, projectId: project.id });
  }

  /**
   * 索引单个章节 (段落级切片)
   */
  async indexChapter(chapter: Chapter, projectId: string, characterNames: string[] = [], locationNames: string[] = []): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 先删除该章节的旧切片
    await this.deleteChapterChunks(chapter.id);

    const chunks = chunkChapterContent(
      chapter.id,
      chapter.number,
      chapter.content || '',
      characterNames,
      locationNames
    );

    if (chunks.length === 0) {
      this.logger.info('章节无内容可索引', { chapterNumber: chapter.number });
      return;
    }

    const embeddings = await this.embeddingModel.embedBatch(chunks.map(c => c.content));

    const docs: VectorDocument[] = chunks.map((chunk, i) => ({
      id: chunk.id,
      content: chunk.content,
      metadata: {
        type: 'chapter' as const,
        projectId,
        chapterNumber: chapter.number,
        chunkIndex: chunk.chunkIndex,
        entityNames: chunk.entityNames,
        timestamp: chapter.generationTime ? new Date(chapter.generationTime).getTime() : Date.now(),
      },
      embedding: embeddings[i],
    }));

    await this.addDocuments(docs);
    this.logger.info('已索引章节切片', { chapterNumber: chapter.number, chunks: docs.length });
  }

  /**
   * 删除某章节的所有切片
   */
  async deleteChapterChunks(chapterId: string): Promise<void> {
    // 删除以 chunk-{chapterId}- 开头的所有文档
    // Rust 后端按 id 前缀删除不支持，这里逐个删
    // TODO: 未来可以在 Rust 端加 prefix delete
    for (let i = 0; i < 200; i++) {
      try {
        await this.deleteDocument(`chunk-${chapterId}-${i}`);
      } catch {
        break; // 没有更多切片了
      }
    }
  }

  /**
   * 删除整章 (旧版兼容: chapter-{chapterId} 格式)
   */
  async deleteChapter(chapterId: string): Promise<void> {
    await this.deleteChapterChunks(chapterId);
    // 也尝试删除旧版格式的文档
    try {
      await this.deleteDocument(`chapter-${chapterId}`);
    } catch { /* ignore */ }
    this.logger.info('已删除章节索引', { chapterId });
  }

  // ============================================================================
  // 检索：图谱制导 + 轻量级重排
  // ============================================================================

  /**
   * V5 核心检索方法：图谱制导的正文切片检索
   *
   * @param queryText 查询文本 (由调用方根据图谱实体构建)
   * @param options 检索选项 (含 currentChapterNumber 和 activeEntityNames 用于重排)
   */
  async vectorSearch(
    queryText: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const { topK = 10, filter, minScore = 0.4 } = options;
    const queryEmbedding = await this.getEmbeddingWithCache(queryText);
    const projectId = filter?.projectId as string | undefined;

    // 从 Rust 后端检索 topK*2 个候选 (为重排留余量)
    const rawResults: any[] = await invoke('vector_search', {
      collection: CHAPTER_CONTENT_COLLECTION,
      projectId: projectId || null,
      queryEmbedding,
      topK: topK * 2,
      minScore,
    });

    let searchResults: SearchResult[] = rawResults.map(r => ({
      id: r.id,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      score: r.score,
      source: r.source as 'vector',
    }));

    // 轻量级重排
    searchResults = applyCombinedRerank(searchResults, options);

    // 截断到 topK
    searchResults = searchResults.slice(0, topK);

    return searchResults;
  }

  /**
   * 图谱制导检索：根据当前章节的图谱实体，构建针对性查询
   *
   * @param currentChapter 当前正在写的章节
   * @param project 项目数据
   * @param activeEntityNames 当前章节涉及的实体名列表 (从 SandboxStore 获取)
   */
  async retrieveRelevantContext(
    currentChapter: Chapter,
    project: Project,
    activeEntityNames: string[] = []
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 构建图谱制导的查询文本
    const queryParts: string[] = [];

    if (currentChapter.title) {
      queryParts.push(currentChapter.title);
    }

    // 优先使用图谱实体构建查询 (Graph-Guided)
    if (activeEntityNames.length > 0) {
      // 针对每个核心实体构建子查询，取并集
      const allResults: SearchResult[] = [];

      for (const entityName of activeEntityNames.slice(0, 5)) { // 最多 5 个实体
        const entityQuery = `${entityName} ${currentChapter.outline?.location || ''}`;
        const results = await this.vectorSearch(entityQuery, {
          topK: 5,
          currentChapterNumber: currentChapter.number,
          activeEntityNames,
          filter: { projectId: project.id },
          minScore: 0.35,
        });
        allResults.push(...results);
      }

      // 去重 (按 id)
      const seen = new Set<string>();
      const deduped = allResults.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // 最终按分数重排
      deduped.sort((a, b) => b.score - a.score);

      this.logger.info('图谱制导检索完成', {
        entityCount: activeEntityNames.length,
        resultCount: deduped.length,
      });

      return deduped.slice(0, 15); // 最多返回 15 个切片
    }

    // Fallback: 如果没有图谱实体，使用大纲信息构建查询
    if (currentChapter.outline) {
      if (currentChapter.outline.goals?.length) {
        queryParts.push(...currentChapter.outline.goals);
      }
      if (currentChapter.outline.location) {
        queryParts.push(currentChapter.outline.location);
      }
      if (currentChapter.outline.characters?.length) {
        queryParts.push(...currentChapter.outline.characters);
      }
    }

    const fallbackQuery = queryParts.join(' ') || currentChapter.title;
    return this.vectorSearch(fallbackQuery, {
      topK: 10,
      currentChapterNumber: currentChapter.number,
      activeEntityNames,
      filter: { projectId: project.id },
      minScore: 0.4,
    });
  }

  // ============================================================================
  // 会话轨迹导入索引 (保留但统一收归 chapter_content)
  // ============================================================================

  async indexExternalArtifacts(artifacts: any[], projectId: string = ''): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (artifacts.length === 0) return 0;

    const docs: VectorDocument[] = artifacts.map(artifact => {
      const payload = artifact.payload as Record<string, unknown>;
      const content = typeof payload.content === 'string' && payload.content.trim()
        ? payload.content
        : JSON.stringify(payload);

      return {
        id: `trace-${artifact.id}`,
        content,
        metadata: {
          type: 'trace' as const,
          projectId: projectId,
          timestamp: Date.now(),
          source: 'conversation-trace',
          artifactType: artifact.type,
          confidence: artifact.confidence,
          title: artifact.title,
        },
      };
    });

    const embeddings = await this.embeddingModel.embedBatch(docs.map(d => d.content));

    const vectorDocs: VectorDocument[] = docs.map((doc, index) => ({
      ...doc,
      embedding: embeddings[index],
    }));

    await this.addDocuments(vectorDocs);
    return vectorDocs.length;
  }

  // ============================================================================
  // 维护方法
  // ============================================================================

  async clearCollection(): Promise<void> {
    await invoke('clear_vector_collection', { collection: CHAPTER_CONTENT_COLLECTION });
  }

  async clear(): Promise<void> {
    await this.clearCollection();
    this.logger.info('已清空所有索引');
  }

  async getDocumentCount(projectId?: string): Promise<number> {
    return await invoke<number>('get_vector_document_count', {
      collection: CHAPTER_CONTENT_COLLECTION,
      projectId: projectId || null,
    });
  }

  // ============================================================================
  // 内部工具方法
  // ============================================================================

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
    model: config?.model ?? '/dist/models/Xenova/bge-m3',
    dimension: config?.dimension ?? 1024,
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
