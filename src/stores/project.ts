/**
 * Project aggregate store.
 *
 * Manages the project list, current open project, global config,
 * chapter-level CRUD, import/export, and lifecycle operations.
 *
 * ### storeToRefs usage
 * ```ts
 * import { useProjectStore } from '@/stores/project'
 * import { storeToRefs } from 'pinia'
 * const { currentProject, projects, loading } = storeToRefs(useProjectStore())
 * ```
 *
 * @module stores/project
 */

import { defineStore } from 'pinia'
import { ref, computed, shallowRef, type Ref, type ComputedRef } from 'vue'
import type { Project, ProjectConfig } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { decryptProjectConfig, encryptProjectConfig } from '@/utils/crypto'
import { getLogger } from '@/utils/logger'
import { useStorage } from './storage'
import { useSandboxStore } from './sandbox'
import { migrateV1ToV5Full } from '@/utils/v1ToV5Migration'
import { getDefaultProjectConfig, normalizeProjectConfig } from '@/utils/project-config-normalizer'
import { reorderChaptersByIds } from '@/utils/chapterReorder'
import { createProjectBackup, parseProjectBackupJson, reassignProjectBackupIds } from '@/utils/projectBackup'

export const useProjectStore = defineStore('project', () => {
  // State
  const projects: Ref<Project[]> = shallowRef([])
  const currentProject: Ref<Project | null> = shallowRef(null)
  const loading: Ref<boolean> = ref(false)
  const error: Ref<string | null> = ref(null)

  /** Global config used when no project is open. */
  const globalConfig: Ref<ProjectConfig | null> = ref(null)
  let globalConfigLoaded = false

  // 存储服务
  const storage = useStorage()
  const logger = getLogger('project:store')

  // Getters
  /** Number of projects in the list. */
  const projectCount: ComputedRef<number> = computed(
    (): number => projects.value.length
  )
  /** Whether a project is currently open. */
  const hasCurrentProject: ComputedRef<boolean> = computed(
    (): boolean => currentProject.value !== null
  )

  // Cached derived state from current project
  const currentChaptersSorted = computed(() => {
    const proj = currentProject.value
    if (!proj?.chapters) return []
    return [...proj.chapters].sort((a, b) => (a.number || 0) - (b.number || 0))
  })

  const currentProjectStats = computed(() => {
    const proj = currentProject.value
    if (!proj) return { chapterCount: 0, totalWords: 0, avgWordsPerChapter: 0 }
    const chapters = proj.chapters || []
    const totalWords = chapters.reduce((sum, c) => sum + ((c as any).wordCount || 0), 0)
    return {
      chapterCount: chapters.length,
      totalWords,
      avgWordsPerChapter: chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0,
    }
  })

  // 加载全局配置（幂等：已加载时跳过网络读取）
  async function loadGlobalConfig(force = false) {
    if (globalConfigLoaded && !force) return
    try {
      const configData = localStorage.getItem('global-config')
      if (configData) {
        const parsedConfig = JSON.parse(configData) as ProjectConfig
        const decryptedConfig = await decryptProjectConfig(parsedConfig)
        globalConfig.value = normalizeProjectConfig(decryptedConfig)
      }
      globalConfigLoaded = true
    } catch (e) {
      logger.error('加载全局配置失败', e)
    }
  }

  // 保存全局配置
  async function saveGlobalConfig(config: ProjectConfig) {
    try {
      const normalizedConfig = normalizeProjectConfig(config)
      const encryptedConfig = await encryptProjectConfig(normalizedConfig)
      localStorage.setItem('global-config', JSON.stringify(encryptedConfig))
      globalConfig.value = normalizedConfig
      globalConfigLoaded = true
    } catch (e) {
      logger.error('保存全局配置失败', e)
      throw e
    }
  }

  // 加载所有项目
  async function loadProjects() {
    loading.value = true
    error.value = null
    try {
      const data = await storage.loadProjects()
      projects.value = data || []
      // 同时加载全局配置
      await loadGlobalConfig()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载项目失败'
    } finally {
      loading.value = false
    }
  }

  // 创建新项目
  async function createProject(title: string, genre: string = '玄幻', targetWords: number = 100000) {
    const defaultConfig: ProjectConfig = getDefaultProjectConfig(globalConfig.value || {})

    const newProject: Project = {
      id: uuidv4(),
      title,
      description: '',
      genre,
      targetWords,
      currentWords: 0,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),

      outline: {
        id: uuidv4(),
        synopsis: '',
        theme: '',
        mainPlot: {
          id: uuidv4(),
          name: '主线',
          description: ''
        },
        subPlots: [],
        volumes: [],
        chapters: [],
        foreshadowings: []
      },
      chapters: [],
      config: defaultConfig
    }

    logger.info('创建新项目', { id: newProject.id, title: newProject.title })

    projects.value.push(newProject)

    // 保存项目列表到localStorage
    await storage.saveProjects(projects.value)

    // 保存完整项目数据到IndexedDB
    await storage.saveProject(newProject)
    logger.info('项目已保存到 IndexedDB', { id: newProject.id })

    return newProject
  }

  // 打开项目
  async function openProject(projectId: string) {
    loading.value = true
    error.value = null
    try {
      logger.info('开始加载项目', { projectId })
      const projectData = await storage.loadProject(projectId)
      logger.debug('项目加载结果', { found: Boolean(projectData), projectId })

      if (projectData) {
        projectData.config = normalizeProjectConfig(projectData.config)
        currentProject.value = projectData
        logger.info('项目加载成功', { projectId: projectData.id, title: projectData.title })

        // 加载 sandbox 数据并执行 V5 迁移（如果需要）
        const sandboxStore = useSandboxStore()
        await sandboxStore.loadData(projectId)

        // 如果 sandbox 没有数据，但有旧的 characters/world，执行迁移
        if (sandboxStore.entities.length === 0 && (projectData.characters?.length > 0 || projectData.world)) {
          logger.info('开始 V5 全量迁移', {
            projectId,
            characterCount: projectData.characters?.length || 0,
            hasWorld: !!projectData.world
          })

          try {
            const { entities, stateEvents } = migrateV1ToV5Full(
              projectData,
              projectId
            )

            // 批量保存 Entity 和 StateEvent
            if (entities.length > 0) {
              await sandboxStore.batchAddEntities(entities)
            }
            if (stateEvents.length > 0) {
              await sandboxStore.batchAddStateEvents(stateEvents)
            }

            logger.info('V5 迁移完成', { 
              projectId,
              entityCount: entities.length,
              eventCount: stateEvents.length 
            })
          } catch (migrationError) {
            logger.error('V5 迁移失败', migrationError)
            // 迁移失败不影响项目打开，但记录错误
          }
        }
      } else {
        logger.error('项目不存在', { projectId })
        throw new Error('项目不存在')
      }
    } catch (e) {
      logger.error('打开项目失败', e)
      error.value = e instanceof Error ? e.message : '打开项目失败'
    } finally {
      loading.value = false
    }
  }

  // 防抖保存定时器
  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null
  const SAVE_DEBOUNCE_DELAY = 1000 // 1秒防抖
  let beforeUnloadHandler: ((event: BeforeUnloadEvent) => void) | null = null

  type ProjectLineRecord =
    | { type: 'meta'; version: 1; data: Omit<Project, 'chapters'> }
    | { type: 'chapter'; data: Project['chapters'][number] }
    | { type: 'end'; count: number }

  function isLikelyLineProjectFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return name.endsWith('.anprojl') || file.type === 'application/x-ndjson'
  }

  async function importProjectFromLineStream(file: File): Promise<Project> {
    if (!file.stream) {
      throw new Error('当前环境不支持流式导入')
    }

    const reader = file.stream().getReader()
    const decoder = new TextDecoder('utf-8')

    let buffer = ''
    let meta: Omit<Project, 'chapters'> | null = null
    const chapters: Project['chapters'] = []

    let readResult = await reader.read()

    while (!readResult.done) {
      const value = readResult.value

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        const record = JSON.parse(line) as ProjectLineRecord
        if (record.type === 'meta') {
          meta = record.data
        } else if (record.type === 'chapter') {
          chapters.push(record.data)
        }
      }

      readResult = await reader.read()
    }

    if (buffer.trim()) {
      const record = JSON.parse(buffer) as ProjectLineRecord
      if (record.type === 'meta') {
        meta = record.data
      } else if (record.type === 'chapter') {
        chapters.push(record.data)
      }
    }

    if (!meta) {
      throw new Error('导入失败：缺少项目元数据')
    }

    return {
      ...(meta as Project),
      chapters
    }
  }

  // 防抖保存当前项目（用于频繁更新场景）
  function debouncedSaveCurrentProject() {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
    }

    saveDebounceTimer = setTimeout(() => {
      void saveCurrentProject().catch((e) => {
        logger.error('防抖保存失败', e)
      })
      saveDebounceTimer = null
    }, SAVE_DEBOUNCE_DELAY)
  }

  if (typeof window !== 'undefined') {
    beforeUnloadHandler = (_event: BeforeUnloadEvent) => {
      if (!saveDebounceTimer || !currentProject.value) {
        return
      }

      clearTimeout(saveDebounceTimer)
      saveDebounceTimer = null

      // V3-fix: 修复 beforeunload 中的异步保存为同步操作 (localStorage)
      try {
        localStorage.setItem(`backup_${currentProject.value.id}`, JSON.stringify(currentProject.value))
        logger.info('页面卸载，已将未保存更改同步写入 localStorage 备份')
      } catch (e) {
        logger.error('同步备份失败', e)
      }
    }
  }

  function cleanup() {
    if (beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
      saveDebounceTimer = null
    }
  }

  // V3: 保存锁，防止并发 saveCurrentProject 覆盖数据
  let isSaving = false
  let pendingSave = false
  let currentSavePromise: Promise<void> | null = null

  // 章节保存锁：按 chapterId 串行化，防止同一章节并发保存导致数据竞态
  const chapterSaveQueues = new Map<string, Promise<void>>()

  // 立即保存当前项目（用于关键操作）
  async function saveCurrentProject() {
    if (!currentProject.value) {
      logger.error('保存失败：currentProject 为空')
      return
    }

    // 取消防抖定时器
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer)
      saveDebounceTimer = null
    }

    // V3: 若已在保存中，标记待保存，并等待当前保存链完成
    if (isSaving) {
      pendingSave = true
      logger.debug('保存已在进行中，已排队等待')
      await currentSavePromise
      return
    }

    const runSave = async (): Promise<void> => {
      const project = currentProject.value
      if (!project) {
        logger.error('保存失败：currentProject 为空')
        return
      }

      isSaving = true
      loading.value = true
      error.value = null
      try {
        logger.info('开始保存项目', {
          id: project.id,
          title: project.title
        })
        project.updatedAt = new Date()
        project.config = normalizeProjectConfig(project.config)
        await storage.saveProject(project)
        logger.debug('项目已保存到 IndexedDB', { id: project.id })

        // 自动定期备份（不阻断主流程）
        try {
          const { maybeAutoBackup } = await import('@/utils/autoBackup')
          void maybeAutoBackup(project)
        } catch { /* 静默 */ }

        // 更新项目列表
        const index = projects.value.findIndex(p => p.id === project.id)
        if (index !== -1) {
          projects.value[index] = { ...project }
          await storage.saveProjects(projects.value)
          logger.debug('项目列表已更新', { id: project.id })
        }
      } catch (e) {
        logger.error('保存失败', e)
        error.value = e instanceof Error ? e.message : '保存项目失败'
        pendingSave = false  // V3-fix: 保存失败时清除待保存标记，避免无限重试
        throw e
      } finally {
        loading.value = false
        isSaving = false
        // 若有待保存，自动重新触发，并让调用方等待实际保存完成
        if (pendingSave) {
          pendingSave = false
          await saveCurrentProject()
        }
      }
    }

    currentSavePromise = runSave()
    try {
      await currentSavePromise
    } finally {
      if (!isSaving) currentSavePromise = null
    }
  }

  // ============== 惰性加载：单章独立操作API ==============
  
  async function loadChapter(chapterId: string) {
    if (!currentProject.value) return null
    return await storage.loadChapter(currentProject.value.id, chapterId)
  }

  async function saveChapter(chapter: any) {
    if (!currentProject.value) {
      const errMsg = '保存章节失败：项目未加载'
      logger.error(errMsg)
      throw new Error(errMsg)
    }

    const chapterId = chapter.id

    // 串行化同一章节的并发保存请求，防止数据竞态
    const previousTask = chapterSaveQueues.get(chapterId) || Promise.resolve()
    const currentTask = previousTask.then(() => doSaveChapter(chapter))
    chapterSaveQueues.set(chapterId, currentTask)

    try {
      await currentTask
    } finally {
      // 清理已完成的队列项（仅当队列中没有更新的任务时）
      if (chapterSaveQueues.get(chapterId) === currentTask) {
        chapterSaveQueues.delete(chapterId)
      }
    }
  }

  async function doSaveChapter(chapter: any) {
    if (!currentProject.value) {
      const errMsg = '保存章节失败：项目未加载'
      logger.error(errMsg)
      throw new Error(errMsg)
    }

    loading.value = true
    error.value = null
    try {
      logger.info('开始独立保存章节', { chapterId: chapter.id, title: chapter.title })
      const currentChapterMeta = currentProject.value.chapters.find((c: any) => c.id === chapter.id)
      const chapterToSave = currentChapterMeta?.number
        ? { ...chapter, projectId: currentProject.value.id, number: currentChapterMeta.number }
        : { ...chapter, projectId: currentProject.value.id }

      // 1. 直通底层存储，保存完整带有 content 的章节数据
      await storage.saveChapter(chapterToSave, currentProject.value.id)

      // 2. 剥离 content 以维护前端状态机的轻量化（防OOM）
      const shallowChapter = { ...chapterToSave }
      delete shallowChapter.content

      const index = currentProject.value.chapters.findIndex((c: any) => c.id === chapter.id)
      if (index !== -1) {
        currentProject.value.chapters[index] = shallowChapter
      } else {
        currentProject.value.chapters.push(shallowChapter)
      }

      // 3. 级联更新主项目字数
      currentProject.value.currentWords = currentProject.value.chapters.reduce((sum: number, c: any) => sum + (c.wordCount || 0), 0)

      // V3-fix: 移除对 saveCurrentProject 的级联调用。章节保存应该是独立的，不触发全量项目序列化
    } catch (e) {
      logger.error('保存独立章节失败', e)
      error.value = e instanceof Error ? e.message : '保存章节失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteChapter(chapterId: string) {
    if (!currentProject.value) return
    loading.value = true
    try {
      await storage.deleteChapter(chapterId, currentProject.value.id)
      currentProject.value.chapters = currentProject.value.chapters.filter((c: any) => c.id !== chapterId)
      currentProject.value.currentWords = currentProject.value.chapters.reduce((sum: number, c: any) => sum + (c.wordCount || 0), 0)
      await saveCurrentProject()
    } catch (e) {
      logger.error('删除章节失败', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function reorderChapters(orderedIds: string[]) {
    if (!currentProject.value) return

    const previousProject = currentProject.value
    const reorderedChapters = reorderChaptersByIds(previousProject.chapters, orderedIds)
    if (reorderedChapters === previousProject.chapters) return

    const nextProject = {
      ...previousProject,
      chapters: reorderedChapters,
    }

    loading.value = true
    error.value = null
    try {
      currentProject.value = nextProject
      await storage.reorderChapters(nextProject.id, orderedIds)
    } catch (e) {
      currentProject.value = previousProject
      logger.error('章节排序保存失败', e)
      error.value = e instanceof Error ? e.message : '章节排序保存失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  // ===========================================

  // 删除项目
  async function deleteProject(projectId: string) {
    loading.value = true
    error.value = null
    try {
      await storage.deleteProject(projectId)
      projects.value = projects.value.filter(p => p.id !== projectId)
      await storage.saveProjects(projects.value)
      logger.info('项目已删除，项目列表已同步更新', { projectId })

      if (currentProject.value?.id === projectId) {
        currentProject.value = null
      }
    } catch (e) {
      logger.error('删除项目失败', e)
      error.value = e instanceof Error ? e.message : '删除项目失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  // 导出项目
  async function exportProject(projectId: string) {
    const project = await storage.loadFullProject(projectId)
    if (!project) throw new Error('项目不存在')

    const sandboxStore = useSandboxStore()
    await sandboxStore.loadData(projectId)
    if (!sandboxStore.isLoaded || sandboxStore.loadedProjectId !== projectId) {
      throw new Error('项目沙盒数据加载失败')
    }

    const backup = createProjectBackup(project, sandboxStore.entities, sandboxStore.stateEvents)
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${project.title}-backup.anproj`
    a.click()

    URL.revokeObjectURL(url)
  }

  // 导入项目
  async function importProject(file: File): Promise<Project> {
    if (isLikelyLineProjectFile(file)) {
      const project = await importProjectFromLineStream(file)
      project.id = uuidv4()
      project.createdAt = new Date()
      project.updatedAt = new Date()

      await storage.saveProject(project)
      projects.value = [...projects.value, project]
      await storage.saveProjects(projects.value)

      return project
    }

    const text = await file.text()
    const parsedBackup = parseProjectBackupJson(text)

    if (parsedBackup.backup) {
      const nextProjectId = uuidv4()
      const reassignedBackup = reassignProjectBackupIds(parsedBackup.backup, nextProjectId)
      const restoredProject: Project = {
        ...reassignedBackup.project,
        id: nextProjectId,
        title: `${reassignedBackup.project.title}（恢复）`,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const sandboxStore = useSandboxStore()
      const previousProjects = projects.value
      try {
        await storage.saveProject(restoredProject)
        await sandboxStore.replaceProjectData(
          nextProjectId,
          reassignedBackup.sandbox.entities,
          reassignedBackup.sandbox.stateEvents
        )

        projects.value = [...projects.value, restoredProject]
        await storage.saveProjects(projects.value)
      } catch (restoreError) {
        projects.value = previousProjects
        try {
          await storage.deleteProject(nextProjectId)
          await sandboxStore.replaceProjectData(nextProjectId, [], [])
        } catch (rollbackError) {
          logger.error('恢复项目回滚失败', rollbackError)
        }
        throw restoreError
      }

      return restoredProject
    }

    let project: Project

    try {
      project = JSON.parse(text) as Project
    } catch {
      throw new Error(parsedBackup.errors.join('；') || '导入文件格式无效')
    }

    // 生成新ID避免冲突
    project.id = uuidv4()
    project.createdAt = new Date()
    project.updatedAt = new Date()

    // 保存项目
    await storage.saveProject(project)
    projects.value.push(project)
    await storage.saveProjects(projects.value)

    return project
  }

  // 从备份恢复项目数据
  async function restoreFromBackup(backupData: any) {
    if (!backupData) {
      throw new Error('备份数据为空')
    }
    // 将备份数据赋值给 currentProject
    currentProject.value = backupData
    // 立即保存到持久层
    await saveCurrentProject()
    logger.info('[ProjectStore] 已从备份恢复项目数据')
  }

  /**
   * Reset the project store to its initial state. Calls `cleanup()`
   * first to clear timers and event listeners.
   */
  function $reset(): void {
    cleanup()
    projects.value = []
    currentProject.value = null
    loading.value = false
    error.value = null
    globalConfig.value = null
  }

  return {
    // State
    projects,
    currentProject,
    loading,
    error,
    globalConfig,

    // Getters
    projectCount,
    hasCurrentProject,
    currentChaptersSorted,
    currentProjectStats,

    // Actions
    loadProjects,
    createProject,
    openProject,
    saveCurrentProject,
    debouncedSaveCurrentProject,
    deleteProject,
    exportProject,
    importProject,
    loadGlobalConfig,
    saveGlobalConfig,
    restoreFromBackup,

    // Chapter-level API
    loadChapter,
    saveChapter,
    deleteChapter,
    reorderChapters,

    // Lifecycle
    cleanup,
    $reset
  }
})
