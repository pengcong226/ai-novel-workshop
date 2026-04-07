/**
 * 向量服务 Pinia Store
 * @module stores/vector
 *
 * 提供向量服务的状态管理和便捷方法
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  VectorService,
  createVectorService,
  type EmbeddingConfig,
  type VectorDocument,
  type SearchResult,
  type IndexStats,
} from '../services/vector-service'
import type { VectorDocumentType, VectorSearchResult } from '../types/index'

/**
 * 向量服务状态
 */
interface VectorState {
  /** 服务是否已初始化 */
  isInitialized: boolean
  /** 是否正在加载 */
  isLoading: boolean
  /** 错误信息 */
  error: string | null
  /** 当前项目ID */
  currentProjectId: string | null
  /** 配置 */
  config: Partial<EmbeddingConfig> | null
}

/**
 * 向量服务 Store
 */
export const useVectorStore = defineStore('vector', () => {
  // 状态
  const service = ref<VectorService | null>(null)
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const currentProjectId = ref<string | null>(null)
  const indexStats = ref<Map<string, IndexStats>>(new Map())

  // 计算属性
  const isReady = computed(() => isInitialized.value && service.value !== null)

  /**
   * 初始化向量服务
   */
  async function initialize(config?: Partial<EmbeddingConfig>): Promise<void> {
    if (isInitialized.value && service.value) {
      return
    }

    isLoading.value = true
    error.value = null

    try {
      service.value = await createVectorService(config)
      isInitialized.value = true

      // 初始化后获取索引统计
      await refreshIndexStats()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('Failed to initialize vector service:', e)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 刷新索引统计
   */
  async function refreshIndexStats(): Promise<void> {
    if (!service.value) return

    try {
      const stats = await service.value.healthCheck()
      indexStats.value = stats
    } catch (e) {
      console.error('Failed to refresh index stats:', e)
    }
  }

  // ============================================================================
  // 文档管理
  // ============================================================================

  /**
   * 添加世界观设定
   */
  async function addWorldSetting(
    projectId: string,
    settingId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('world_settings', {
      id: `setting_${projectId}_${settingId}`,
      content,
      metadata: {
        type: 'setting',
        projectId,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 添加人物档案
   */
  async function addCharacter(
    projectId: string,
    characterId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('character_profiles', {
      id: `char_${projectId}_${characterId}`,
      content,
      metadata: {
        type: 'character',
        projectId,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 添加情节线索
   */
  async function addPlotThread(
    projectId: string,
    threadId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('plot_threads', {
      id: `plot_${projectId}_${threadId}`,
      content,
      metadata: {
        type: 'plot',
        projectId,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 添加重要事件
   */
  async function addEvent(
    projectId: string,
    eventId: string,
    content: string,
    chapterNumber?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('major_events', {
      id: `event_${projectId}_${eventId}`,
      content,
      metadata: {
        type: 'event',
        projectId,
        chapterNumber,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 添加章节内容
   */
  async function addChapter(
    projectId: string,
    chapterNumber: number,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('chapter_content', {
      id: `chapter_${projectId}_${chapterNumber}`,
      content,
      metadata: {
        type: 'chapter',
        projectId,
        chapterNumber,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 添加世界规则
   */
  async function addWorldRule(
    projectId: string,
    ruleId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await ensureInitialized()

    await service.value!.addDocument('world_rules', {
      id: `rule_${projectId}_${ruleId}`,
      content,
      metadata: {
        type: 'rule',
        projectId,
        timestamp: Date.now(),
        ...metadata,
      },
    })
  }

  /**
   * 批量添加文档
   */
  async function addDocuments(
    collection: string,
    documents: VectorDocument[]
  ): Promise<void> {
    await ensureInitialized()
    await service.value!.addDocuments(collection, documents)
  }

  /**
   * 更新文档
   */
  async function updateDocument(
    collection: string,
    id: string,
    updates: Partial<VectorDocument>
  ): Promise<void> {
    await ensureInitialized()
    await service.value!.updateDocument(collection, id, updates)
  }

  /**
   * 删除文档
   */
  async function deleteDocument(collection: string, id: string): Promise<void> {
    await ensureInitialized()
    await service.value!.deleteDocument(collection, id)
  }

  /**
   * 删除项目的所有文档
   */
  async function deleteProjectDocuments(projectId: string): Promise<number> {
    await ensureInitialized()

    let totalDeleted = 0
    const collections = [
      'world_settings',
      'character_profiles',
      'plot_threads',
      'major_events',
      'chapter_content',
      'world_rules',
    ]

    for (const collection of collections) {
      const deleted = await service.value!.deleteDocuments(collection, {
        'metadata.projectId': projectId,
      })
      totalDeleted += deleted
    }

    return totalDeleted
  }

  // ============================================================================
  // 检索功能
  // ============================================================================

  /**
   * 搜索世界观设定
   */
  async function searchWorldSettings(
    projectId: string,
    query: string,
    topK: number = 5
  ): Promise<VectorSearchResult[]> {
    await ensureInitialized()

    const results = await service.value!.search('world_settings', query, {
      topK,
      filter: { 'metadata.projectId': projectId },
      hybrid: true,
    })

    return results.map(convertResult)
  }

  /**
   * 搜索人物档案
   */
  async function searchCharacters(
    projectId: string,
    query: string,
    topK: number = 5
  ): Promise<VectorSearchResult[]> {
    await ensureInitialized()

    const results = await service.value!.search('character_profiles', query, {
      topK,
      filter: { 'metadata.projectId': projectId },
      hybrid: true,
    })

    return results.map(convertResult)
  }

  /**
   * 搜索情节线索
   */
  async function searchPlots(
    projectId: string,
    query: string,
    topK: number = 10
  ): Promise<VectorSearchResult[]> {
    await ensureInitialized()

    const results = await service.value!.search('plot_threads', query, {
      topK,
      filter: { 'metadata.projectId': projectId },
      hybrid: true,
    })

    return results.map(convertResult)
  }

  /**
   * 搜索相关章节
   */
  async function searchChapters(
    projectId: string,
    query: string,
    topK: number = 5
  ): Promise<VectorSearchResult[]> {
    await ensureInitialized()

    const results = await service.value!.search('chapter_content', query, {
      topK,
      filter: { 'metadata.projectId': projectId },
      hybrid: true,
    })

    return results.map(convertResult)
  }

  /**
   * 跨集合搜索
   */
  async function searchAll(
    projectId: string,
    query: string,
    options?: {
      types?: VectorDocumentType[]
      topK?: number
    }
  ): Promise<Map<VectorDocumentType, VectorSearchResult[]>> {
    await ensureInitialized()

    const types = options?.types ?? ['setting', 'character', 'plot', 'event', 'chapter', 'rule']
    const topK = options?.topK ?? 5

    const collectionMap: Record<VectorDocumentType, string> = {
      setting: 'world_settings',
      character: 'character_profiles',
      plot: 'plot_threads',
      event: 'major_events',
      chapter: 'chapter_content',
      rule: 'world_rules',
    }

    const results = new Map<VectorDocumentType, VectorSearchResult[]>()

    // 并行搜索
    const searchPromises = types.map(async (type) => {
      const collection = collectionMap[type]
      const searchResults = await service.value!.search(collection, query, {
        topK,
        filter: { 'metadata.projectId': projectId },
        hybrid: true,
      })
      return { type, results: searchResults.map(convertResult) }
    })

    const searchResults = await Promise.all(searchPromises)

    for (const { type, results: typeResults } of searchResults) {
      results.set(type, typeResults)
    }

    return results
  }

  /**
   * 统一搜索接口
   */
  async function search(
    collection: string,
    query: string,
    options?: {
      projectId?: string
      topK?: number
      hybrid?: boolean
      minScore?: number
    }
  ): Promise<VectorSearchResult[]> {
    await ensureInitialized()

    const filter = options?.projectId
      ? { 'metadata.projectId': options.projectId }
      : undefined

    const results = await service.value!.search(collection, query, {
      topK: options?.topK ?? 10,
      filter,
      hybrid: options?.hybrid ?? true,
      minScore: options?.minScore,
    })

    return results.map(convertResult)
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 重建集合索引
   */
  async function rebuildIndex(collection: string): Promise<void> {
    await ensureInitialized()
    await service.value!.rebuildIndex(collection)
    await refreshIndexStats()
  }

  /**
   * 清空集合
   */
  async function clearCollection(collection: string): Promise<void> {
    await ensureInitialized()
    await service.value!.clearCollection(collection)
    await refreshIndexStats()
  }

  /**
   * 清空项目数据
   */
  async function clearProject(projectId: string): Promise<void> {
    await ensureInitialized()

    const collections = [
      'world_settings',
      'character_profiles',
      'plot_threads',
      'major_events',
      'chapter_content',
      'world_rules',
    ]

    for (const collection of collections) {
      await service.value!.deleteDocuments(collection, {
        'metadata.projectId': projectId,
      })
    }

    await refreshIndexStats()
  }

  /**
   * 清空所有数据
   */
  async function clearAll(): Promise<void> {
    await ensureInitialized()
    await service.value!.clearAll()
    await refreshIndexStats()
  }

  /**
   * 获取索引统计
   */
  async function getIndexStats(collection: string): Promise<IndexStats> {
    await ensureInitialized()
    return service.value!.getIndexStats(collection)
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 确保服务已初始化
   */
  async function ensureInitialized(): Promise<void> {
    if (!isInitialized.value || !service.value) {
      await initialize()
    }
  }

  /**
   * 转换搜索结果
   */
  function convertResult(result: SearchResult): VectorSearchResult {
    return {
      id: result.id,
      content: result.content,
      metadata: result.metadata as any,
      score: result.score,
      source: result.source,
    }
  }

  /**
   * 重置服务
   */
  function reset(): void {
    service.value = null
    isInitialized.value = false
    isLoading.value = false
    error.value = null
    currentProjectId.value = null
    indexStats.value = new Map()
  }

  return {
    // 状态
    service,
    isInitialized,
    isLoading,
    error,
    currentProjectId,
    indexStats,
    isReady,

    // 初始化
    initialize,
    refreshIndexStats,

    // 文档管理
    addWorldSetting,
    addCharacter,
    addPlotThread,
    addEvent,
    addChapter,
    addWorldRule,
    addDocuments,
    updateDocument,
    deleteDocument,
    deleteProjectDocuments,

    // 检索
    searchWorldSettings,
    searchCharacters,
    searchPlots,
    searchChapters,
    searchAll,
    search,

    // 索引管理
    rebuildIndex,
    clearCollection,
    clearProject,
    clearAll,
    getIndexStats,

    // 辅助
    reset,
  }
})
