/**
 * 向量服务 Pinia Store (V5 架构版)
 * @module stores/vector
 *
 * V5 变更：
 * - 只索引章节正文 (段落级切片)，不再索引世界观/人物/大纲
 * - 检索使用 vectorSearch / retrieveRelevantContext
 * - 移除按集合分类的增删查方法 (V4 多集合模式已废弃)
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  VectorService,
  createVectorService,
  resetVectorService,
  type EmbeddingConfig,
  type SearchResult,
} from '../services/vector-service'

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
  const documentCount = ref<number>(0)

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
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      console.error('Failed to initialize vector service:', e)
      throw e
    } finally {
      isLoading.value = false
    }
  }

  // ============================================================================
  // 文档管理 (V5: 只支持章节切片)
  // ============================================================================

  /**
   * 索引整个项目的所有章节正文 (段落级切片)
   */
  async function indexProject(project: Parameters<VectorService['indexProject']>[0]): Promise<void> {
    await ensureInitialized()
    await service.value!.indexProject(project)
    await refreshStats()
  }

  /**
   * 索引单个章节 (段落级切片)
   */
  async function indexChapter(
    chapter: Parameters<VectorService['indexChapter']>[0],
    projectId: string,
    characterNames?: string[],
    locationNames?: string[]
  ): Promise<void> {
    await ensureInitialized()
    await service.value!.indexChapter(chapter, projectId, characterNames, locationNames)
    await refreshStats()
  }

  /**
   * 删除某章节的所有切片
   */
  async function deleteChapter(chapterId: string): Promise<void> {
    await ensureInitialized()
    await service.value!.deleteChapter(chapterId)
    await refreshStats()
  }

  /**
   * 删除项目的所有文档
   */
  async function deleteProjectDocuments(projectId: string): Promise<number> {
    await ensureInitialized()
    const deleted = await service.value!.deleteDocumentsForProject(projectId)
    await refreshStats()
    return deleted
  }

  // ============================================================================
  // 检索功能 (V5: 图谱制导)
  // ============================================================================

  /**
   * V5 核心检索：图谱制导的正文切片检索
   */
  async function vectorSearch(
    queryText: string,
    options?: Parameters<VectorService['vectorSearch']>[1]
  ): Promise<SearchResult[]> {
    await ensureInitialized()
    return service.value!.vectorSearch(queryText, options)
  }

  /**
   * V5 图谱制导检索：根据当前章节的图谱实体构建针对性查询
   */
  async function retrieveRelevantContext(
    currentChapter: Parameters<VectorService['retrieveRelevantContext']>[0],
    project: Parameters<VectorService['retrieveRelevantContext']>[1],
    activeEntityNames?: string[]
  ): Promise<SearchResult[]> {
    await ensureInitialized()
    return service.value!.retrieveRelevantContext(currentChapter, project, activeEntityNames)
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 清空所有索引
   */
  async function clearAll(): Promise<void> {
    await ensureInitialized()
    await service.value!.clear()
    documentCount.value = 0
  }

  /**
   * 获取文档数量
   */
  async function getDocumentCount(projectId?: string): Promise<number> {
    await ensureInitialized()
    const count = await service.value!.getDocumentCount(projectId)
    documentCount.value = count
    return count
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
   * 刷新统计信息
   */
  async function refreshStats(): Promise<void> {
    if (!service.value) return
    try {
      documentCount.value = await service.value.getDocumentCount(currentProjectId.value || undefined)
    } catch {
      // 忽略统计刷新失败
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
    documentCount.value = 0
    resetVectorService()
  }

  return {
    // 状态
    service,
    isInitialized,
    isLoading,
    error,
    currentProjectId,
    documentCount,
    isReady,

    // 初始化
    initialize,

    // 文档管理
    indexProject,
    indexChapter,
    deleteChapter,
    deleteProjectDocuments,

    // 检索
    vectorSearch,
    retrieveRelevantContext,

    // 索引管理
    clearAll,
    getDocumentCount,
    refreshStats,

    // 辅助
    reset,
  }
})
