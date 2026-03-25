/**
 * 向量服务 - 整合嵌入和向量存储
 *
 * 核心功能：
 * 1. 文档索引和向量化
 * 2. 语义搜索
 * 3. 智能上下文检索
 * 4. 增量更新
 */

import type { Project, Chapter, VectorServiceConfig, VectorSearchResult, VectorDocumentMetadata } from '@/types'
import { createEmbeddingService, type EmbeddingService } from './embeddings'
import { createVectorStore, type VectorDocument, VectorStore } from './vectorStore'

/**
 * 文档内容提取器
 */
interface DocumentContent {
  id: string
  content: string
  metadata: VectorDocumentMetadata
}

/**
 * 向量服务
 */
export class VectorService {
  private embeddingService: EmbeddingService
  private vectorStore: VectorStore
  private config: VectorServiceConfig
  private initialized: boolean = false

  constructor(config: VectorServiceConfig) {
    this.config = config
    this.embeddingService = createEmbeddingService(config)
    this.vectorStore = new VectorStore(config.projectId!, config.dimension || 384)
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    await this.vectorStore.initialize()
    this.initialized = true
    console.log('[VectorService] 初始化完成')
  }

  /**
   * 索引项目文档（世界观、人物、大纲等）
   */
  async indexProject(project: Project): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    console.log('[VectorService] 开始索引项目:', project.id)

    const documents: DocumentContent[] = []

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
    const embeddings = await this.embeddingService.embedBatch(
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
    await this.vectorStore.addDocuments(vectorDocs)

    console.log(`[VectorService] 索引完成，共 ${vectorDocs.length} 个文档`)
  }

  /**
   * 索引单个章节
   */
  async indexChapter(chapter: Chapter, projectId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    const doc = this.extractSingleChapterDocument(chapter, projectId)
    const embedding = await this.embeddingService.embed(doc.content)

    await this.vectorStore.addDocument({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      embedding
    })

    console.log(`[VectorService] 已索引章节: ${chapter.number} - ${chapter.title}`)
  }

  /**
   * 删除章节索引
   */
  async deleteChapter(chapterId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    await this.vectorStore.deleteDocument(chapterId)
    console.log(`[VectorService] 已删除章节索引: ${chapterId}`)
  }

  /**
   * 语义搜索
   */
  async search(
    query: string,
    topK: number = 10,
    options?: {
      minScore?: number
      filter?: (metadata: VectorDocumentMetadata) => boolean
      useHybridSearch?: boolean
    }
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    // 生成查询向量
    const queryEmbedding = await this.embeddingService.embed(query)

    // 执行搜索
    if (options?.useHybridSearch) {
      return await this.vectorStore.hybridSearch(
        query,
        queryEmbedding,
        topK,
        options
      )
    } else {
      return await this.vectorStore.search(
        queryEmbedding,
        topK,
        options
      )
    }
  }

  /**
   * 智能上下文检索 - 根据当前章节内容检索相关历史章节
   */
  async retrieveRelevantContext(
    currentChapter: Chapter,
    project: Project,
    options?: {
      topK?: number
      minScore?: number
      includeTypes?: VectorDocumentMetadata['type'][]
      excludeCurrentChapter?: boolean
    }
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    // 构建查询文本
    const queryText = this.buildChapterQuery(currentChapter, project)

    // 生成查询向量
    const queryEmbedding = await this.embeddingService.embed(queryText)

    // 构建过滤器
    const filter = (metadata: VectorDocumentMetadata): boolean => {
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
    const results = await this.vectorStore.search(
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

  /**
   * 获取向量维度
   */
  getDimension(): number {
    return this.embeddingService.getDimension()
  }

  /**
   * 获取文档数量
   */
  async getDocumentCount(): Promise<number> {
    return await this.vectorStore.getDocumentCount()
  }

  /**
   * 清空所有索引
   */
  async clear(): Promise<void> {
    await this.vectorStore.clear()
    console.log('[VectorService] 已清空所有索引')
  }

  /**
   * 提取世界观文档
   */
  private extractWorldDocuments(project: Project): DocumentContent[] {
    const documents: DocumentContent[] = []
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

  /**
   * 提取人物文档
   */
  private extractCharacterDocuments(project: Project): DocumentContent[] {
    const documents: DocumentContent[] = []

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

  /**
   * 提取大纲文档
   */
  private extractOutlineDocuments(project: Project): DocumentContent[] {
    const documents: DocumentContent[] = []
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

  /**
   * 提取章节文档
   */
  private extractChapterDocuments(project: Project): DocumentContent[] {
    const documents: DocumentContent[] = []

    project.chapters.forEach(chapter => {
      const doc = this.extractSingleChapterDocument(chapter, project.id)
      documents.push(doc)
    })

    return documents
  }

  /**
   * 提取单个章节文档
   */
  private extractSingleChapterDocument(chapter: Chapter, projectId: string): DocumentContent {
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

  /**
   * 构建章节查询文本
   */
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
}

/**
 * 创建向量服务实例
 */
export async function createVectorService(config: VectorServiceConfig): Promise<VectorService> {
  const service = new VectorService(config)
  await service.initialize()
  return service
}

/**
 * 全局向量服务缓存
 */
const vectorServiceCache = new Map<string, VectorService>()

/**
 * 获取或创建向量服务
 */
export async function getVectorService(
  projectId: string,
  config?: Partial<VectorServiceConfig>
): Promise<VectorService> {
  // 检查缓存
  if (vectorServiceCache.has(projectId)) {
    return vectorServiceCache.get(projectId)!
  }

  // 创建新实例
  const fullConfig: VectorServiceConfig = {
    provider: config?.provider || 'local',
    model: config?.model,
    dimension: config?.dimension || 384,
    apiKey: config?.apiKey,
    baseUrl: config?.baseUrl,
    projectId
  }

  const service = await createVectorService(fullConfig)
  vectorServiceCache.set(projectId, service)

  return service
}

/**
 * 清理向量服务缓存
 */
export function clearVectorServiceCache(projectId?: string): void {
  if (projectId) {
    vectorServiceCache.delete(projectId)
  } else {
    vectorServiceCache.clear()
  }
}
