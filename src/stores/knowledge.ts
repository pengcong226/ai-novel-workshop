/**
 * Knowledge base store.
 *
 * Manages knowledge entries with CRUD, search, category/tag grouping,
 * usage tracking, and project-scoped persistence through the project store.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useKnowledgeStore } from '@/stores/knowledge'
 * import { storeToRefs } from 'pinia'
 * const { entries, totalEntries, allTags } = storeToRefs(useKnowledgeStore())
 * ```
 *
 * @module stores/knowledge
 */

import { defineStore } from 'pinia'
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { KnowledgeEntry, KnowledgeMetadata } from '@/types/knowledge-base'
import { KnowledgeCategory } from '@/types/knowledge-base'
import { getLogger } from '@/utils/logger'
import { StorageError, toAppError, ErrorCode } from '@/utils/errors'
import { v4 as uuidv4 } from 'uuid'

const logger = getLogger('knowledge:store')

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ============ State ============

  /** All knowledge entries */
  const entries: Ref<KnowledgeEntry[]> = ref([])

  /** Loading state */
  const loading: Ref<boolean> = ref(false)

  /** Error message */
  const error: Ref<string | null> = ref(null)

  /** Current project ID */
  const projectId: Ref<string | null> = ref(null)

  // ============ Getters ============

  /** Total entry count */
  const totalEntries: ComputedRef<number> = computed(
    (): number => entries.value.length
  )

  /** Enabled (non-disabled) entry count */
  const enabledEntries: ComputedRef<number> = computed(
    (): number => entries.value.filter(e => !e.disable).length
  )

  /** Disabled entry count */
  const disabledEntries: ComputedRef<number> = computed(
    (): number => entries.value.filter(e => e.disable).length
  )

  /** Constant entry count */
  const constantEntries: ComputedRef<number> = computed(
    (): number => entries.value.filter(e => e.constant).length
  )

  /** Entries grouped by category */
  const entriesByCategory: ComputedRef<Map<KnowledgeCategory, KnowledgeEntry[]>> = computed((): Map<KnowledgeCategory, KnowledgeEntry[]> => {
    const grouped = new Map<KnowledgeCategory, KnowledgeEntry[]>()
    entries.value.forEach(entry => {
      const cat = entry.category || 'custom'
      if (!grouped.has(cat)) {
        grouped.set(cat, [])
      }
      grouped.get(cat)!.push(entry)
    })
    return grouped
  })

  /** Entries grouped by tag */
  const entriesByTag: ComputedRef<Map<string, KnowledgeEntry[]>> = computed((): Map<string, KnowledgeEntry[]> => {
    const grouped = new Map<string, KnowledgeEntry[]>()
    entries.value.forEach(entry => {
      entry.tags?.forEach(tag => {
        if (!grouped.has(tag)) {
          grouped.set(tag, [])
        }
        grouped.get(tag)!.push(entry)
      })
    })
    return grouped
  })

  /** All unique tags across entries */
  const allTags: ComputedRef<string[]> = computed((): string[] => {
    const tags = new Set<string>()
    entries.value.forEach(entry => {
      entry.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  })

  /** Top 10 most-used entries (by usage count) */
  const mostUsedEntries: ComputedRef<KnowledgeEntry[]> = computed(
    (): KnowledgeEntry[] => {
    return [...entries.value]
      .filter(e => e.usageCount && e.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10)
  })

  /** Top 10 most recently updated entries */
  const recentlyUpdated: ComputedRef<KnowledgeEntry[]> = computed(
    (): KnowledgeEntry[] => {
    return [...entries.value]
      .filter(e => e.metadata?.updatedAt)
      .sort((a, b) =>
        (b.metadata?.updatedAt?.getTime() || 0) -
        (a.metadata?.updatedAt?.getTime() || 0)
      )
      .slice(0, 10)
  })

  // ============ 方法 ============

  /**
   * 加载知识库
   */
  async function loadKnowledge(targetProjectId?: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      // 如果没有传入项目ID，从当前项目获取
      let pid = targetProjectId
      if (!pid) {
        const { useProjectStore } = await import('./project')
        const projectStore = useProjectStore()
        pid = projectStore.currentProject?.id

        if (!pid) {
          logger.warn('没有打开的项目，无法加载知识库')
          return
        }
      }

      logger.info('开始加载知识库', { projectId: pid })

      // 从存储加载项目数据
      const { useStorage } = await import('./storage')
      const storage = useStorage()
      const projectData = await storage.loadProject(pid)

      if (!projectData) {
        throw new StorageError('项目不存在', { code: ErrorCode.STORAGE_NOT_FOUND })
      }

      // 初始化知识库（通过 project store 避免竞态）
      if (!projectData.knowledgeBase) {
        const { useProjectStore } = await import('./project')
        const projectStore = useProjectStore()
        const currentProj = projectStore.currentProject

        const defaultKnowledgeBase: import('@/types/knowledge-base').KnowledgeBase = {
          id: uuidv4(),
          name: '默认知识库',
          entries: [],
          categories: [],
          tags: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            totalEntries: 0,
            enabledEntries: 0,
            totalUsage: 0
          }
        }

        if (currentProj && currentProj.id === pid) {
          currentProj.knowledgeBase = defaultKnowledgeBase
          await projectStore.saveCurrentProject()
        } else {
          const storage = useStorage()
          projectData.knowledgeBase = defaultKnowledgeBase
          await storage.saveProject(projectData)
        }
      }

      entries.value = projectData.knowledgeBase.entries || []
      projectId.value = pid

      logger.info('知识库加载完成', {
        entryCount: entries.value.length
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '加载知识库失败'
      error.value = errorMessage
      logger.error('加载知识库失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存知识库
   * 通过 project store 统一持久化，避免 load-modify-save 竞态
   */
  async function saveKnowledge(): Promise<void> {
    if (!projectId.value) {
      logger.warn('项目ID未设置，无法保存知识库')
      return
    }

    loading.value = true
    error.value = null

    try {
      logger.info('开始保存知识库', { projectId: projectId.value })

      // 通过 project store 统一保存，避免竞态
      const { useProjectStore } = await import('./project')
      const projectStore = useProjectStore()
      const currentProj = projectStore.currentProject

      const knowledgeBase: import('@/types/knowledge-base').KnowledgeBase = {
        id: currentProj?.knowledgeBase?.id || uuidv4(),
        name: currentProj?.knowledgeBase?.name || '默认知识库',
        entries: entries.value,
        categories: currentProj?.knowledgeBase?.categories || [],
        tags: currentProj?.knowledgeBase?.tags || [],
        createdAt: currentProj?.knowledgeBase?.createdAt || new Date(),
        updatedAt: new Date(),
        metadata: {
          totalEntries: totalEntries.value,
          enabledEntries: enabledEntries.value,
          totalUsage: entries.value.reduce((sum, e) => sum + (e.usageCount || 0), 0),
          lastUsedAt: new Date()
        }
      }

      if (currentProj && currentProj.id === projectId.value) {
        currentProj.knowledgeBase = knowledgeBase
        projectStore.debouncedSaveCurrentProject()
      } else {
        // fallback: 项目不在当前上下文时，仍用独立保存
        const { useStorage } = await import('./storage')
        const storage = useStorage()
        const projectData = await storage.loadProject(projectId.value)
        if (!projectData) {
          throw new Error('项目不存在')
        }
        projectData.knowledgeBase = knowledgeBase
        await storage.saveProject(projectData)
      }

      logger.info('知识库保存完成', {
        entryCount: entries.value.length
      })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '保存知识库失败'
      error.value = errorMessage
      logger.error('保存知识库失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 添加条目
   */
  async function addEntry(entry: Partial<KnowledgeEntry>): Promise<KnowledgeEntry> {
    const maxUid = Math.max(0, ...entries.value.map(e => e.uid))

    const newEntry: KnowledgeEntry = {
      uid: maxUid + 1,
      key: entry.key || [],
      keysecondary: entry.keysecondary || [],
      content: entry.content || '',
      comment: entry.comment || '',
      constant: entry.constant ?? true,
      disable: entry.disable ?? true,
      selective: entry.selective ?? false,
      order: entry.order ?? 0,
      position: entry.position ?? 'before_char',
      depth: entry.depth ?? 4,
      probability: entry.probability,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex,
      extensions: entry.extensions,

      // 知识库特有字段
      category: entry.category || KnowledgeCategory.CUSTOM,
      tags: entry.tags || [],
      source: entry.source,
      author: entry.author,
      version: entry.version,
      priority: entry.priority ?? 0,
      usageCount: entry.usageCount ?? 0,
      lastUsedAt: entry.lastUsedAt,
      metadata: {
        ...entry.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    entries.value.push(newEntry)
    await saveKnowledge()

    logger.info('知识条目已添加', { uid: newEntry.uid })
    return newEntry
  }

  /**
   * 更新条目
   */
  async function updateEntry(
    uid: number,
    updates: Partial<KnowledgeEntry>
  ): Promise<KnowledgeEntry> {
    const index = entries.value.findIndex(e => e.uid === uid)

    if (index === -1) {
      throw new StorageError(`条目不存在: ${uid}`, { code: ErrorCode.STORAGE_NOT_FOUND, context: { uid } })
    }

    const updatedEntry: KnowledgeEntry = {
      ...entries.value[index],
      ...updates,
      metadata: {
        ...entries.value[index].metadata,
        ...updates.metadata,
        createdAt: entries.value[index].metadata?.createdAt || new Date(),
        updatedAt: new Date()
      } as KnowledgeMetadata
    }

    entries.value[index] = updatedEntry
    await saveKnowledge()

    logger.info('知识条目已更新', { uid })
    return updatedEntry
  }

  /**
   * 删除条目
   */
  async function deleteEntry(uid: number): Promise<void> {
    const index = entries.value.findIndex(e => e.uid === uid)

    if (index === -1) {
      throw new Error(`条目不存在: ${uid}`)
    }

    entries.value.splice(index, 1)
    await saveKnowledge()

    logger.info('知识条目已删除', { uid })
  }

  /**
   * 批量删除条目
   */
  async function deleteEntries(uids: number[]): Promise<void> {
    const uidSet = new Set(uids)
    entries.value = entries.value.filter(e => !uidSet.has(e.uid))
    await saveKnowledge()

    logger.info('知识条目已批量删除', { count: uids.length })
  }

  /**
   * 搜索条目
   */
  function searchEntries(query: string, options?: {
    scope?: Array<'content' | 'comment' | 'tags' | 'source'>
    categories?: KnowledgeCategory[]
    tags?: string[]
    enabledOnly?: boolean
  }): KnowledgeEntry[] {
    let result = [...entries.value]
    const scope = options?.scope || ['content', 'comment', 'tags']
    const lowerQuery = query.toLowerCase()

    // 文本搜索
    if (query) {
      result = result.filter(entry => {
        if (scope.includes('content') && entry.content?.toLowerCase().includes(lowerQuery)) {
          return true
        }
        if (scope.includes('comment') && entry.comment?.toLowerCase().includes(lowerQuery)) {
          return true
        }
        if (scope.includes('tags') && entry.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
          return true
        }
        if (scope.includes('source') && entry.source?.toLowerCase().includes(lowerQuery)) {
          return true
        }
        return false
      })
    }

    // 分类过滤
    if (options?.categories && options.categories.length > 0) {
      result = result.filter(e => options.categories!.includes(e.category))
    }

    // 标签过滤
    if (options?.tags && options.tags.length > 0) {
      result = result.filter(e =>
        e.tags?.some(tag => options.tags!.includes(tag))
      )
    }

    // 仅启用条目
    if (options?.enabledOnly) {
      result = result.filter(e => !e.disable)
    }

    return result
  }

  /**
   * 增加使用次数
   */
  async function incrementUsage(uid: number): Promise<void> {
    const entry = entries.value.find(e => e.uid === uid)
    if (entry) {
      entry.usageCount = (entry.usageCount || 0) + 1
      entry.lastUsedAt = new Date()
      await saveKnowledge()
    }
  }

  /**
   * 获取条目
   */
  function getEntry(uid: number): KnowledgeEntry | undefined {
    return entries.value.find(e => e.uid === uid)
  }

  /**
   * 获取分类条目
   */
  function getEntriesByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    return entries.value.filter(e => e.category === category)
  }

  /**
   * 获取标签条目
   */
  function getEntriesByTag(tag: string): KnowledgeEntry[] {
    return entries.value.filter(e => e.tags?.includes(tag))
  }

  /**
   * 清空知识库
   */
  async function clearKnowledge(): Promise<void> {
    entries.value = []
    await saveKnowledge()
    logger.info('知识库已清空')
  }

  /**
   * Export the entire knowledge base as a formatted JSON string.
   */
  function exportKnowledge(): string {
    return JSON.stringify({
      entries: entries.value,
      metadata: {
        totalEntries: totalEntries.value,
        enabledEntries: enabledEntries.value,
        totalUsage: entries.value.reduce((sum, e) => sum + (e.usageCount || 0), 0),
        exportedAt: new Date()
      }
    }, null, 2)
  }

  /**
   * Reset the knowledge store to its initial state, clearing all entries
   * and project association.
   */
  function $reset(): void {
    entries.value = []
    loading.value = false
    error.value = null
    projectId.value = null
  }

  return {
    // State
    entries,
    loading,
    error,
    projectId,

    // Getters
    totalEntries,
    enabledEntries,
    disabledEntries,
    constantEntries,
    entriesByCategory,
    entriesByTag,
    allTags,
    mostUsedEntries,
    recentlyUpdated,

    // Actions
    loadKnowledge,
    saveKnowledge,
    addEntry,
    updateEntry,
    deleteEntry,
    deleteEntries,
    searchEntries,
    incrementUsage,
    getEntry,
    getEntriesByCategory,
    getEntriesByTag,
    clearKnowledge,
    exportKnowledge,
    $reset
  }
})
