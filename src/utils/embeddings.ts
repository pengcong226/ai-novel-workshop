/**
 * 文本嵌入服务
 *
 * 支持两种嵌入方式：
 * 1. 本地模型：使用 @xenova/transformers 的 sentence-transformers 模型
 * 2. OpenAI：使用 OpenAI embeddings API
 */

import type { VectorServiceConfig } from '@/types'

/**
 * 嵌入服务接口
 */
export interface EmbeddingService {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
  getDimension(): number
}

/**
 * 本地嵌入服务（使用 Transformers.js）
 */
export class LocalEmbeddingService implements EmbeddingService {
  private embedder: any = null
  private dimension: number = 384 // 默认维度（all-MiniLM-L6-v2）
  private modelId: string
  private initialized: boolean = false
  private initPromise: Promise<void> | null = null

  constructor(modelId: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelId = modelId

    // 根据模型设置维度
    if (modelId.includes('bge-small') || modelId.includes('all-MiniLM')) {
      this.dimension = 384
    } else if (modelId.includes('bge-base') || modelId.includes('all-mpnet-base') || modelId.includes('paraphrase-multilingual')) {
      this.dimension = 768
    } else if (modelId.includes('bge-large')) {
      this.dimension = 1024
    }
  }

  /**
   * 初始化模型（懒加载）
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    if (this.initPromise) {
      await this.initPromise
      return
    }

    this.initPromise = (async () => {
      try {
        console.log('[LocalEmbedding] 开始加载模型:', this.modelId)

        const { pipeline, env } = await import('@xenova/transformers')

        // 关键修复：在浏览器中绝对不能将 allowLocalModels 设为 true，否则会触发 Node.js 环境误判导致 registerBackend 崩溃！
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        env.allowRemoteModels = true;
        
        // 将"远程"服务器强制指向本地的 Vite 开发服务器 /models/ 目录
        env.remoteHost = window.location.origin;
        env.remotePathTemplate = '/models/{model}/';

        this.embedder = await pipeline('feature-extraction', this.modelId, {
          quantized: true // 使用量化模型减小体积
        })

        this.initialized = true
        console.log('[LocalEmbedding] 模型加载完成，维度:', this.dimension)
      } catch (error) {
        console.error('[LocalEmbedding] 模型加载失败:', error)
        throw new Error(`本地模型加载失败 (请确保模型文件已正确下载到 public/models 目录中)。详细错误: ${error instanceof Error ? error.message : String(error)}`)
      }
    })()

    await this.initPromise
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    await this.initialize()

    try {
      // 清理文本
      const cleanText = this.cleanText(text)

      // 生成嵌入
      const result = await this.embedder(cleanText, {
        pooling: 'mean',
        normalize: true
      })

      // 转换为普通数组
      return Array.from(result.data)
    } catch (error) {
      console.error('[LocalEmbedding] 嵌入生成失败:', error)
      throw error
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.initialize()

    try {
      const embeddings: number[][] = []

      // 批量处理（每次最多 8 个）
      const batchSize = 8
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const cleanBatch = batch.map(t => this.cleanText(t))

        const results = await Promise.all(
          cleanBatch.map(text =>
            this.embedder(text, { pooling: 'mean', normalize: true })
          )
        )

        embeddings.push(...results.map(r => Array.from(r.data as Float32Array)))
      }

      return embeddings
    } catch (error) {
      console.error('[LocalEmbedding] 批量嵌入生成失败:', error)
      throw error
    }
  }

  /**
   * 获取向量维度
   */
  getDimension(): number {
    return this.dimension
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    // 移除多余的空白字符
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000) // 限制长度，避免超出模型限制
  }
}

/**
 * OpenAI 嵌入服务
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string
  private baseUrl: string
  private model: string
  private dimension: number

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1'
    this.model = config.model || 'text-embedding-3-small'
    this.dimension = this.model.includes('large') ? 3072 : 1536
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text])
    return embeddings[0]
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: texts.map(t => this.cleanText(t)),
          encoding_format: 'float'
        })
      })

      if (!response.ok) {
        let errorMsg = `OpenAI API 错误: ${response.status}`;
        try {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const error = await response.json();
            errorMsg = error.error?.message || errorMsg;
          } else {
            const _text = await response.text();
            errorMsg += ` - 返回了非JSON格式 (可能是Base URL配置错误，例如少写了 /v1，或者接口不支持 /embeddings 路由)`;
          }
        } catch (e) {
          errorMsg += ' - 无法解析错误信息';
        }
        throw new Error(errorMsg);
      }

      const data = await response.json()

      // 按 index 排序
      const embeddings = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((item: any) => item.embedding)

      return embeddings
    } catch (error) {
      console.error('[OpenAIEmbedding] 嵌入生成失败:', error)
      throw error
    }
  }

  /**
   * 获取向量维度
   */
  getDimension(): number {
    return this.dimension
  }

  /**
   * 清理文本
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 8000) // OpenAI 的 token 限制
  }
}

/**
 * 创建嵌入服务
 */
export function createEmbeddingService(config: VectorServiceConfig): EmbeddingService {
  if (config.provider === 'local') {
    return new LocalEmbeddingService(config.model || 'Xenova/all-MiniLM-L6-v2')
  } else if (config.provider === 'openai') {
    if (!config.apiKey) {
      throw new Error('OpenAI 嵌入服务需要 API Key')
    }
    return new OpenAIEmbeddingService({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model
    })
  } else {
    throw new Error(`不支持的嵌入服务提供商: ${config.provider}`)
  }
}

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('向量维度不匹配')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)

  if (denominator === 0) {
    return 0
  }

  return dotProduct / denominator
}

/**
 * 计算欧几里得距离
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('向量维度不匹配')
  }

  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }

  return Math.sqrt(sum)
}
