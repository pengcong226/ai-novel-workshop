/**
 * 知识库状态管理
 * @module stores/knowledge
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KnowledgeEntry, KnowledgeCategory } from '@/types/knowledge-base'
import { getLogger } from '@/utils/logger'

const logger = getLogger('knowledge:store')

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ============ 状态 ============

  /** 所有知识条目 */
  const entries = ref<KnowledgeEntry[]>([])

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** 当前项目ID */
  const projectId = ref<string | null>(null)

  // ============ 计算属性 ============

  /** 总条目数 */
  const totalEntries = computed(() => entries.value.length)

  /** 已启用条目数 */
  const enabledEntries = computed(() =>
    entries.value.filter(e => !e.disable).length
  )

  /** 禁用条目数 */
  const disabledEntries = computed(() =>
    entries.value.filter(e => e.disable).length
  )

  /** 常量条目数 */
  const constantEntries = computed(() =>
    entries.value.filter(e => e.constant).length
  )

  /** 按分类分组 */
  const entriesByCategory = computed(() => {
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

  /** 按标签分组 */
  const entriesByTag = computed(() => {
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

  /** 所有标签 */
  const allTags = computed(() => {
    const tags = new Set<string>()
    entries.value.forEach(entry => {
      entry.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  })

  /** 最常用条目 */
  const mostUsedEntries = computed(() => {
    return [...entries.value]
      .filter(e => e.usageCount && e.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10)
  })

  /** 最近更新条目 */
  const recentlyUpdated = computed(() => {
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
        throw new Error('项目不存在')
      }

      // 初始化知识库
      if (!projectData.knowledgeBase) {
        projectData.knowledgeBase = {
          entries: [],
          metadata: {
            totalEntries: 0,
            enabledEntries: 0,
            totalUsage: 0
          }
        }
        await storage.saveProject(projectData)
      }

      entries.value = projectData.knowledgeBase.entries || []
      projectId.value = pid

      logger.info('知识库加载完成', {
        entryCount: entries.value.length
      })
    } catch (err) {
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

      const { useStorage } = await import('./storage')
      const storage = useStorage()
      const projectData = await storage.loadProject(projectId.value)

      if (!projectData) {
        throw new Error('项目不存在')
      }

      // 更新统计
      projectData.knowledgeBase = {
        entries: entries.value,
        metadata: {
          totalEntries: totalEntries.value,
          enabledEntries: enabledEntries.value,
          totalUsage: entries.value.reduce((sum, e) => sum + (e.usageCount || 0), 0),
          lastUsedAt: new Date()
        }
      }

      await storage.saveProject(projectData)

      logger.info('知识库保存完成', {
        entryCount: entries.value.length
      })
    } catch (err) {
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
      position: entry.position ?? 0,
      depth: entry.depth ?? 4,
      probability: entry.probability,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex,
      extensions: entry.extensions,

      // 知识库特有字段
      category: entry.category || 'custom',
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
      throw new Error(`条目不存在: ${uid}`)
    }

    const updatedEntry: KnowledgeEntry = {
      ...entries.value[index],
      ...updates,
      metadata: {
        ...entries.value[index].metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
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
   * 导出知识库
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

  return {
    // 状态
    entries,
    loading,
    error,
    projectId,

    // 计算属性
    totalEntries,
    enabledEntries,
    disabledEntries,
    constantEntries,
    entriesByCategory,
    entriesByTag,
    allTags,
    mostUsedEntries,
    recentlyUpdated,

    // 方法
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
    exportKnowledge
  }
})
