/**
 * 世界书状态管理
 *
 * 使用 Pinia Composition API 管理世界书状态和条目 CRUD
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Worldbook, WorldbookEntry, WorldbookGroup } from '@/types/worldbook'
import { WorldbookInjector } from '@/services/worldbook-injector'
import { WorldbookAIAssistant } from '@/services/worldbook-ai'
import { useStorage } from './storage'
import { getLogger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

const logger = getLogger('worldbook:store')

/**
 * 世界书 Store
 */
export const useWorldbookStore = defineStore('worldbook', () => {
  // ============ 状态 ============

  /** 当前世界书 */
  const worldbook = ref<Worldbook | null>(null)

  /** 加载状态 */
  const loading = ref(false)

  /** 错误信息 */
  const error = ref<string | null>(null)

  /** 当前项目ID */
  const projectId = ref<string | null>(null)

  // ============ 服务实例 ============

  /** 存储服务 */
  const storage = useStorage()

  /** 注入器实例 */
  const injector = ref<WorldbookInjector | null>(null)

  /** AI 助手实例 */
  const aiAssistant = ref<WorldbookAIAssistant | null>(null)

  // ============ 计算属性 ============

  /** 所有条目 */
  const entries = computed(() => worldbook.value?.entries || [])

  /** 所有分组 */
  const groups = computed(() => worldbook.value?.metadata?.groups || [])

  /** 启用的条目 */
  const enabledEntries = computed(() =>
    entries.value.filter(e => e.enabled !== false)
  )

  /** 常量条目 */
  const constantEntries = computed(() =>
    entries.value.filter(e => e.constant)
  )

  /** 条目总数 */
  const entryCount = computed(() => entries.value.length)

  /** 启用条目数 */
  const enabledEntryCount = computed(() => enabledEntries.value.length)

  /** 分组数 */
  const groupCount = computed(() => groups.value.length)

  /** 按类型分组的条目 */
  const entriesByType = computed(() => {
    const grouped = new Map<string, WorldbookEntry[]>()
    entries.value.forEach(entry => {
      const type = entry.novelWorkshop?.entryType || 'custom'
      if (!grouped.has(type)) {
        grouped.set(type, [])
      }
      grouped.get(type)!.push(entry)
    })
    return grouped
  })

  /** 按分类分组的条目 */
  const entriesByCategory = computed(() => {
    const grouped = new Map<string, WorldbookEntry[]>()
    entries.value.forEach(entry => {
      const category = entry.novelWorkshop?.category || '未分类'
      if (!grouped.has(category)) {
        grouped.set(category, [])
      }
      grouped.get(category)!.push(entry)
    })
    return grouped
  })

  // ============ 世界书管理方法 ============

  /**
   * 加载世界书
   */
  async function loadWorldbook(targetProjectId?: string): Promise<void> {
    loading.value = true
    error.value = null

    try {
      // 如果没有传入项目ID，从当前项目获取
      let pid = targetProjectId
      if (!pid) {
        // 动态导入避免循环依赖
        const { useProjectStore } = await import('./project')
        const projectStore = useProjectStore()
        pid = projectStore.currentProject?.id

        if (!pid) {
          logger.warn('没有打开的项目，无法加载世界书')
          return
        }
      }

      logger.info('开始加载世界书', { projectId: pid })

      // 从存储加载项目数据
      const projectData = await storage.loadProject(pid)

      if (!projectData) {
        throw new Error('项目不存在')
      }

      // 初始化世界书
      if (!projectData.worldbook) {
        // 创建默认世界书
        projectData.worldbook = {
          entries: [],
          metadata: {
            source: 'novel_workshop',
            format: 'v3',
            createdAt: new Date(),
            updatedAt: new Date(),
            totalEntries: 0
          }
        }
        await storage.saveProject(projectData)
      }

      worldbook.value = projectData.worldbook
      projectId.value = pid

      // 初始化注入器
      if (worldbook.value) {
        injector.value = new WorldbookInjector(worldbook.value)
      }

      // 初始化 AI 助手
      aiAssistant.value = new WorldbookAIAssistant(
        projectData.config?.assistantModel
      )

      logger.info('世界书加载完成', {
        entryCount: entries.value.length
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载世界书失败'
      error.value = errorMessage
      logger.error('加载世界书失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存世界书
   */
  async function saveWorldbook(): Promise<void> {
    if (!worldbook.value || !projectId.value) {
      logger.warn('世界书或项目ID未设置，无法保存')
      return
    }

    loading.value = true
    error.value = null

    try {
      logger.info('开始保存世界书', { projectId: projectId.value })

      // 加载项目数据
      const projectData = await storage.loadProject(projectId.value)

      if (!projectData) {
        throw new Error('项目不存在')
      }

      // 更新时间戳
      if (worldbook.value.metadata) {
        worldbook.value.metadata.updatedAt = new Date()
      }

      // 更新条目数
      if (worldbook.value.metadata) {
        worldbook.value.metadata.totalEntries = entries.value.length
      }

      // 保存到项目
      projectData.worldbook = worldbook.value
      await storage.saveProject(projectData)

      logger.info('世界书保存完成', {
        entryCount: entries.value.length
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存世界书失败'
      error.value = errorMessage
      logger.error('保存世界书失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // ============ 条目 CRUD 方法 ============

  /**
   * 添加条目
   */
  async function addEntry(entry: Partial<WorldbookEntry>): Promise<WorldbookEntry> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    // 生成 UID
    const maxUid = Math.max(0, ...entries.value.map(e => e.uid || 0))
    const newEntry: WorldbookEntry = {
      uid: maxUid + 1,
      key: entry.key || [],
      keysecondary: entry.keysecondary,
      content: entry.content || '',
      comment: entry.comment,
      constant: entry.constant,
      selective: entry.selective,
      order: entry.order,
      position: entry.position,
      disable: entry.disable,
      excludeRecursion: entry.excludeRecursion,
      probability: entry.probability,
      depth: entry.depth,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex,
      extensions: entry.extensions,
      novelWorkshop: {
        ...entry.novelWorkshop,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    worldbook.value.entries.push(newEntry)

    await saveWorldbook()

    logger.info('条目已添加', { entryId: newEntry.uid })

    return newEntry
  }

  /**
   * 更新条目
   */
  async function updateEntry(
    entryId: number,
    updates: Partial<WorldbookEntry>
  ): Promise<WorldbookEntry> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    const index = worldbook.value.entries.findIndex(e => e.uid === entryId)

    if (index === -1) {
      throw new Error(`条目不存在: ${entryId}`)
    }

    const updatedEntry: WorldbookEntry = {
      ...worldbook.value.entries[index],
      ...updates,
      novelWorkshop: {
        ...worldbook.value.entries[index].novelWorkshop,
        ...updates.novelWorkshop,
        updatedAt: new Date()
      }
    }

    worldbook.value.entries[index] = updatedEntry

    await saveWorldbook()

    logger.info('条目已更新', { entryId })

    return updatedEntry
  }

  /**
   * 删除条目
   */
  async function deleteEntry(entryId: number): Promise<void> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    const index = worldbook.value.entries.findIndex(e => e.uid === entryId)

    if (index === -1) {
      throw new Error(`条目不存在: ${entryId}`)
    }

    worldbook.value.entries.splice(index, 1)

    await saveWorldbook()

    logger.info('条目已删除', { entryId })
  }

  /**
   * 批量删除条目
   */
  async function deleteEntries(entryIds: number[]): Promise<void> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    const idSet = new Set(entryIds)
    worldbook.value.entries = worldbook.value.entries.filter(e => !idSet.has(e.uid))

    await saveWorldbook()

    logger.info('条目已批量删除', { count: entryIds.length })
  }

  /**
   * 批量更新条目状态
   */
  async function toggleEntries(
    entryIds: number[],
    enabled: boolean
  ): Promise<void> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    entryIds.forEach(id => {
      const entry = worldbook.value!.entries.find(e => e.uid === id)
      if (entry) {
        entry.disable = !enabled
      }
    })

    await saveWorldbook()

    logger.info('条目状态已切换', { count: entryIds.length, enabled })
  }

  // ============ 分组管理方法 ============

  /**
   * 添加分组
   */
  async function addGroup(
    name: string,
    description?: string
  ): Promise<WorldbookGroup> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    if (!worldbook.value.metadata) {
      worldbook.value.metadata = {}
    }

    if (!worldbook.value.metadata.groups) {
      worldbook.value.metadata.groups = []
    }

    const newGroup: WorldbookGroup = {
      id: uuidv4(),
      name,
      description,
      enabled: true,
      priority: worldbook.value.metadata.groups.length,
      entryIds: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    worldbook.value.metadata.groups.push(newGroup)

    await saveWorldbook()

    logger.info('分组已添加', { groupId: newGroup.id })

    return newGroup
  }

  /**
   * 更新分组
   */
  async function updateGroup(
    groupId: string,
    updates: Partial<WorldbookGroup>
  ): Promise<WorldbookGroup> {
    if (!worldbook.value || !worldbook.value.metadata?.groups) {
      throw new Error('世界书或分组未初始化')
    }

    const index = worldbook.value.metadata.groups.findIndex(g => g.id === groupId)

    if (index === -1) {
      throw new Error(`分组不存在: ${groupId}`)
    }

    const updatedGroup: WorldbookGroup = {
      ...worldbook.value.metadata.groups[index],
      ...updates,
      updatedAt: new Date()
    }

    worldbook.value.metadata.groups[index] = updatedGroup

    await saveWorldbook()

    logger.info('分组已更新', { groupId })

    return updatedGroup
  }

  /**
   * 删除分组
   */
  async function deleteGroup(groupId: string): Promise<void> {
    if (!worldbook.value || !worldbook.value.metadata?.groups) {
      throw new Error('世界书或分组未初始化')
    }

    const index = worldbook.value.metadata.groups.findIndex(g => g.id === groupId)

    if (index === -1) {
      throw new Error(`分组不存在: ${groupId}`)
    }

    worldbook.value.metadata.groups.splice(index, 1)

    await saveWorldbook()

    logger.info('分组已删除', { groupId })
  }

  // ============ 注入器方法 ============

  /**
   * 创建注入器
   */
  function createInjector(): WorldbookInjector {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    return new WorldbookInjector(worldbook.value)
  }

  /**
   * 注入条目到上下文
   */
  function injectEntries(context: string, options?: {
    maxEntries?: number
    maxTokens?: number
  }) {
    if (!injector.value) {
      throw new Error('注入器未初始化')
    }

    return injector.value.inject({
      context,
      maxEntries: options?.maxEntries,
      maxTokens: options?.maxTokens
    })
  }

  // ============ AI 辅助方法 ============

  /**
   * AI 生成条目建议
   */
  async function generateEntrySuggestions(options: {
    context?: string
    referenceText?: string
    prompt?: string
  }) {
    if (!aiAssistant.value) {
      throw new Error('AI 助手未初始化')
    }

    return aiAssistant.value.generateEntrySuggestion({
      type: 'entry',
      ...options
    })
  }

  /**
   * AI 优化条目
   */
  async function optimizeEntry(entryId: number) {
    if (!aiAssistant.value || !worldbook.value) {
      throw new Error('AI 助手或世界书未初始化')
    }

    const entry = worldbook.value.entries.find(e => e.uid === entryId)
    if (!entry) {
      throw new Error(`条目不存在: ${entryId}`)
    }

    return aiAssistant.value.optimizeEntry(entry)
  }

  /**
   * AI 分析世界书质量
   */
  async function analyzeWorldbook() {
    if (!aiAssistant.value || !worldbook.value) {
      throw new Error('AI 助手或世界书未初始化')
    }

    return aiAssistant.value.analyzeWorldbook(worldbook.value)
  }

  // ============ 导入导出方法 ============

  /**
   * 导出世界书
   */
  function exportWorldbook(): string {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    return JSON.stringify(worldbook.value, null, 2)
  }

  /**
   * 批量导入条目
   */
  async function importEntries(
    newEntries: WorldbookEntry[],
    options: {
      merge?: boolean
      conflictResolution?: 'keep_both' | 'overwrite' | 'skip' | 'merge' | 'rename'
      deduplicate?: boolean
      enableAllEntries?: boolean
    } = {}
  ): Promise<void> {
    if (!worldbook.value) {
      throw new Error('世界书未初始化')
    }

    loading.value = true
    error.value = null

    try {
      const {
        merge = true,
        conflictResolution = 'keep_both',
        deduplicate = true,
        enableAllEntries = false
      } = options

      logger.info('开始导入世界书条目', {
        输入条目数: newEntries.length,
        当前已有条目数: entries.value.length,
        前5个新条目: newEntries.slice(0, 5).map((e: any, i: number) => ({
          index: i,
          uid: e.uid,
          keys长度: (e.keys || e.key || []).length,
          content长度: e.content?.length,
          content前50字符: e.content?.substring(0, 50)
        })),
        选项: { merge, conflictResolution, deduplicate, enableAllEntries }
      })

      // 处理条目
      let entriesToImport = [...newEntries]

      logger.info('初始条目列表', { 条目数: entriesToImport.length })

      // 去重（仅对有keys的条目进行去重）
      if (deduplicate) {
        const existingKeys = new Set(
          entries.value.flatMap(e => e.keys || e.key || [])
        )

        logger.info('去重前的条目数', {
          条目数: entriesToImport.length,
          已有keys数量: existingKeys.size
        })

        entriesToImport = entriesToImport.filter(entry => {
          const entryKeys = entry.keys || entry.key || []
          // 如果条目没有keys，不去重（保留）
          if (entryKeys.length === 0) {
            return true
          }
          // 如果条目有keys，检查是否重复
          return !entryKeys.some((k: string) => existingKeys.has(k))
        })

        logger.info('去重后的条目数', { 条目数: entriesToImport.length })
      }

      // 冲突处理
      if (conflictResolution === 'overwrite') {
        // 删除现有冲突条目（仅对有keys的条目进行冲突检查）
        const newKeys = new Set(entriesToImport.flatMap(e => e.keys || e.key || []))

        logger.info('覆盖模式 - 删除冲突条目', {
          新keys数量: newKeys.size,
          冲突前条目数: worldbook.value.entries.length
        })

        worldbook.value.entries = entries.value.filter(entry => {
          const entryKeys = entry.keys || entry.key || []
          // 如果条目没有keys，不删除
          if (entryKeys.length === 0) {
            return true
          }
          return !entryKeys.some((k: string) => newKeys.has(k))
        })

        logger.info('覆盖模式 - 冲突后条目数', {
          条目数: worldbook.value.entries.length
        })
      } else if (conflictResolution === 'skip') {
        // 跳过冲突条目（仅对有keys的条目进行冲突检查）
        const existingKeys = new Set(
          entries.value.flatMap(e => e.keys || e.key || [])
        )

        logger.info('跳过模式 - 检查冲突', {
          已有keys数量: existingKeys.size,
          跳过前条目数: entriesToImport.length
        })

        entriesToImport = entriesToImport.filter(entry => {
          const entryKeys = entry.keys || entry.key || []
          // 如果条目没有keys，不跳过（保留）
          if (entryKeys.length === 0) {
            return true
          }
          return !entryKeys.some((k: string) => existingKeys.has(k))
        })

        logger.info('跳过模式 - 跳过后条目数', { 条目数: entriesToImport.length })
      }

      // 启用所有条目
      if (enableAllEntries) {
        entriesToImport = entriesToImport.map(entry => ({
          ...entry,
          disable: false,
          enabled: true
        }))
      }

      // 重新分配UID
      const maxUid = Math.max(0, ...entries.value.map(e => e.uid || 0))
      entriesToImport = entriesToImport.map((entry, index) => ({
        ...entry,
        uid: maxUid + index + 1
      }))

      // 添加条目
      if (merge) {
        worldbook.value.entries.push(...entriesToImport)
      } else {
        worldbook.value.entries = entriesToImport
      }

      logger.info('世界书条目添加完成', {
        导入条目数: entriesToImport.length,
        当前总条目数: entries.value.length,
        第一个条目: entriesToImport[0] ? {
          uid: entriesToImport[0].uid,
          keys: entriesToImport[0].keys,
          content前100字符: entriesToImport[0].content?.substring(0, 100)
        } : null
      })

      // 更新条目数
      if (worldbook.value.metadata) {
        worldbook.value.metadata.totalEntries = entries.value.length
      }

      await saveWorldbook()

      logger.info('条目导入完成', {
        imported: entriesToImport.length,
        total: entries.value.length
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '导入条目失败'
      error.value = errorMessage
      logger.error('导入条目失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 导入世界书
   */
  async function importWorldbook(json: string, merge = false): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const imported = JSON.parse(json) as Worldbook

      if (merge && worldbook.value) {
        // 合并条目
        worldbook.value.entries.push(...imported.entries)
      } else {
        // 替换
        worldbook.value = imported
      }

      await saveWorldbook()

      logger.info('世界书导入完成', {
        entryCount: imported.entries.length,
        merge
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '导入世界书失败'
      error.value = errorMessage
      logger.error('导入世界书失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  // ============ 统计方法 ============

  /**
   * 获取统计信息
   */
  function getStats() {
    if (!worldbook.value || !injector.value) {
      return null
    }

    return injector.value.getStats()
  }

  return {
    // 状态
    worldbook,
    loading,
    error,
    projectId,

    // 计算属性
    entries,
    groups,
    enabledEntries,
    constantEntries,
    entryCount,
    enabledEntryCount,
    groupCount,
    entriesByType,
    entriesByCategory,

    // 世界书管理方法
    loadWorldbook,
    saveWorldbook,

    // 条目 CRUD 方法
    addEntry,
    updateEntry,
    deleteEntry,
    deleteEntries,
    toggleEntries,

    // 分组管理方法
    addGroup,
    updateGroup,
    deleteGroup,

    // 注入器方法
    createInjector,
    injectEntries,

    // AI 辅助方法
    generateEntrySuggestions,
    optimizeEntry,
    analyzeWorldbook,

    // 导入导出方法
    exportWorldbook,
    importWorldbook,
    importEntries,

    // 统计方法
    getStats
  }
})
