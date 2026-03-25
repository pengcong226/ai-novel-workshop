import type { VectorDocumentMetadata, VectorSearchResult } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { getLogger } from '@/utils/logger'

/**
 * 向量文档
 */
export interface VectorDocument {
  id: string
  content: string
  metadata: VectorDocumentMetadata
  embedding: number[]
}

/**
 * 向量存储服务 (Rust 后端代理)
 */
export class VectorStore {
  private dimension: number
  private projectId: string
  private logger = getLogger('vector:store')

  constructor(projectId: string, dimension: number = 384) {
    this.projectId = projectId
    this.dimension = dimension
  }

  /**
   * 初始化向量存储
   */
  async initialize(): Promise<void> {
    // 代理到 Rust，无须前端初始化 IndexedDB
    this.logger.debug('初始化完成 (Rust 后端)', { projectId: this.projectId })
  }

  /**
   * 添加文档
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    await this.addDocuments([doc])
  }

  /**
   * 批量添加文档
   */
  async addDocuments(docs: VectorDocument[]): Promise<void> {
    if (docs.length === 0) return;
    
    // 转换为 Rust 需要的格式
    const payload = docs.map(doc => ({
      id: doc.id,
      collection: 'default',
      project_id: this.projectId,
      content: doc.content,
      metadata: JSON.stringify(doc.metadata),
      embedding: doc.embedding,
      keywords: '[]',
    }))
    
    await invoke('add_vector_documents', { documents: payload })
  }

  /**
   * 删除文档
   */
  async deleteDocument(id: string): Promise<void> {
    await invoke('delete_vector_document', { id })
  }

  /**
   * 获取文档 (暂时未在 Rust 实现单条获取，这在业务逻辑中用不到)
   */
  getDocument(id: string): VectorDocument | undefined {
    return undefined
  }

  /**
   * 相似度搜索 (全交给 Rust 极速检索)
   */
  async search(
    queryEmbedding: number[],
    topK: number = 10,
    options?: {
      minScore?: number
      filter?: (metadata: VectorDocumentMetadata) => boolean
    }
  ): Promise<VectorSearchResult[]> {
    const rawResults: any[] = await invoke('vector_search', {
      collection: 'default',
      projectId: this.projectId,
      queryEmbedding,
      topK,
      minScore: options?.minScore || 0.0
    });
    
    let results: VectorSearchResult[] = rawResults.map(r => ({
      id: r.id,
      content: r.content,
      metadata: JSON.parse(r.metadata),
      score: r.score,
      source: 'vector' as const
    }));

    if (options?.filter) {
      results = results.filter(r => options.filter!(r.metadata));
    }

    return results;
  }

  /**
   * 混合搜索（放弃低效的关键词检索，全量走向量检索）
   */
  async hybridSearch(
    query: string,
    queryEmbedding: number[],
    topK: number = 10,
    options?: {
      minScore?: number
      vectorWeight?: number
      filter?: (metadata: VectorDocumentMetadata) => boolean
    }
  ): Promise<VectorSearchResult[]> {
    return this.search(queryEmbedding, topK, options);
  }

  /**
   * 获取所有文档 (放弃前台获取)
   */
  getAllDocuments(): VectorDocument[] {
    return []
  }

  /**
   * 获取文档数量
   */
  async getDocumentCount(): Promise<number> {
    return await invoke<number>('get_vector_document_count', {
      collection: 'default',
      projectId: this.projectId
    })
  }

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    await invoke('clear_vector_collection', { collection: 'default' })
  }

  /**
   * 导出索引 (废弃)
   */
  exportIndex(): object | null {
    return null
  }

  /**
   * 导入索引 (废弃)
   */
  async importIndex(data: any): Promise<void> {
    // 废弃
  }
}

/**
 * 创建向量存储实例
 */
export async function createVectorStore(
  projectId: string,
  dimension: number = 384
): Promise<VectorStore> {
  const store = new VectorStore(projectId, dimension)
  await store.initialize()
  return store
}
