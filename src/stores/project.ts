import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, ProjectConfig } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { decryptProjectConfig, encryptProjectConfig } from '@/utils/crypto'
import { getLogger } from '@/utils/logger'
import { useStorage } from './storage'

export const useProjectStore = defineStore('project', () => {
  // 状态
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 全局配置（当没有打开项目时使用）
  const globalConfig = ref<ProjectConfig | null>(null)

  // 存储服务
  const storage = useStorage()
  const logger = getLogger('project:store')

  // 计算属性
  const projectCount = computed(() => projects.value.length)
  const hasCurrentProject = computed(() => currentProject.value !== null)

  // 加载全局配置
  async function loadGlobalConfig() {
    try {
      const configData = localStorage.getItem('global-config')
      if (configData) {
        const parsedConfig = JSON.parse(configData) as ProjectConfig
        globalConfig.value = decryptProjectConfig(parsedConfig)
      }
    } catch (e) {
      logger.error('加载全局配置失败', e)
    }
  }

  // 保存全局配置
  async function saveGlobalConfig(config: ProjectConfig) {
    try {
      const encryptedConfig = encryptProjectConfig(config)
      localStorage.setItem('global-config', JSON.stringify(encryptedConfig))
      globalConfig.value = decryptProjectConfig(encryptedConfig)
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
    const defaultConfig: ProjectConfig = {
      preset: globalConfig.value?.preset || 'standard',
      plannerModel: globalConfig.value?.plannerModel || 'gpt-4-turbo',
      writerModel: globalConfig.value?.writerModel || 'gpt-3.5-turbo',
      sentinelModel: globalConfig.value?.sentinelModel || 'gpt-3.5-turbo',
      extractorModel: globalConfig.value?.extractorModel || '',
      systemPrompts: globalConfig.value?.systemPrompts || undefined,
      planningDepth: globalConfig.value?.planningDepth || 'medium',
      writingDepth: globalConfig.value?.writingDepth || 'standard',
      enableQualityCheck: globalConfig.value?.enableQualityCheck ?? true,
      qualityThreshold: globalConfig.value?.qualityThreshold || 7,
      maxCostPerChapter: globalConfig.value?.maxCostPerChapter || 0.15,
      enableAISuggestions: globalConfig.value?.enableAISuggestions ?? true,
      enableLogicValidator: globalConfig.value?.enableLogicValidator ?? true,           // 默认开启防吃书查杀
      enableZeroTouchExtraction: globalConfig.value?.enableZeroTouchExtraction ?? true, // 默认开启后台零触感提取
      enableVectorRetrieval: globalConfig.value?.enableVectorRetrieval ?? true,
      vectorConfig: globalConfig.value?.vectorConfig || {
        provider: 'local',
        model: 'bge-small-zh-v1.5',  // 默认中文优化模型
        dimension: 512,
      },
      providers: globalConfig.value?.providers ? JSON.parse(JSON.stringify(globalConfig.value.providers)) : [],
      advancedSettings: globalConfig.value?.advancedSettings ? JSON.parse(JSON.stringify(globalConfig.value.advancedSettings)) : undefined
    }

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

      world: {
        id: uuidv4(),
        name: '',
        era: {
          time: '',
          techLevel: '',
          socialForm: ''
        },
        geography: {
          locations: []
        },
        factions: [],
        rules: [],
        aiGenerated: false
      },

      characters: [],
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
        currentProject.value = projectData
        logger.info('项目加载成功', { projectId: projectData.id, title: projectData.title })
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
  let saveDebounceTimer: NodeJS.Timeout | null = null
  const SAVE_DEBOUNCE_DELAY = 1000 // 1秒防抖
  const LARGE_EXPORT_THRESHOLD_BYTES = 5 * 1024 * 1024

  type ProjectLineRecord =
    | { type: 'meta'; version: 1; data: Omit<Project, 'chapters'> }
    | { type: 'chapter'; data: Project['chapters'][number] }
    | { type: 'end'; count: number }

  function estimateProjectSizeRough(project: Project): number {
    const base = 2048 + (project.title?.length || 0) + (project.description?.length || 0)
    const chapterSize = (project.chapters || []).reduce((sum, ch) => {
      return sum + (ch.content?.length || 0) + (ch.summary?.length || 0) + 1024
    }, 0)

    return base + chapterSize
  }

  function buildLineExportBlob(project: Project): Blob {
    const projectMeta = { ...project } as any as Omit<Project, 'chapters'>
    delete (projectMeta as Partial<Project>).chapters

    const lines: string[] = []
    const metaRecord: ProjectLineRecord = {
      type: 'meta',
      version: 1,
      data: projectMeta as Omit<Project, 'chapters'>
    }

    lines.push(`${JSON.stringify(metaRecord)}\n`)

    for (const chapter of project.chapters || []) {
      const chapterRecord: ProjectLineRecord = {
        type: 'chapter',
        data: chapter
      }
      lines.push(`${JSON.stringify(chapterRecord)}\n`)
    }

    const endRecord: ProjectLineRecord = {
      type: 'end',
      count: (project.chapters || []).length
    }
    lines.push(`${JSON.stringify(endRecord)}\n`)

    return new Blob(lines, { type: 'application/x-ndjson' })
  }

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

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        if (buffer.trim()) {
          const record = JSON.parse(buffer) as ProjectLineRecord
          if (record.type === 'meta') {
            meta = record.data
          } else if (record.type === 'chapter') {
            chapters.push(record.data)
          }
        }
        break
      }

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
    window.addEventListener('beforeunload', (event) => {
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
    })
  }

  // V3: 保存锁，防止并发 saveCurrentProject 覆盖数据
  let isSaving = false
  let pendingSave = false

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

    // V3: 若已在保存中，标记待保存，等当前完成后自动重新保存
    if (isSaving) {
      pendingSave = true
      logger.debug('保存已在进行中，已排队等待')
      return
    }

    isSaving = true
    loading.value = true
    error.value = null
    try {
      logger.info('开始保存项目', {
        id: currentProject.value.id,
        title: currentProject.value.title
      })
      currentProject.value.updatedAt = new Date()
      await storage.saveProject(currentProject.value)
      logger.debug('项目已保存到 IndexedDB', { id: currentProject.value.id })

      // 更新项目列表
      const index = projects.value.findIndex(p => p.id === currentProject.value!.id)
      if (index !== -1) {
        projects.value[index] = { ...currentProject.value }
        await storage.saveProjects(projects.value)
        logger.debug('项目列表已更新', { id: currentProject.value.id })
      }
    } catch (e) {
      logger.error('保存失败', e)
      error.value = e instanceof Error ? e.message : '保存项目失败'
      pendingSave = false  // V3-fix: 保存失败时清除待保存标记，避免无限重试
      throw e
    } finally {
      loading.value = false
      isSaving = false
      // 若有待保存，自动重新触发
      if (pendingSave) {
        pendingSave = false
        void saveCurrentProject().catch(e => logger.error('重新保存失败', e))
      }
    }
  }

  // ============== 惰性加载：单章独立操作API ==============
  
  async function loadChapter(chapterId: string) {
    if (!currentProject.value) return null
    return await storage.loadChapter(currentProject.value.id, chapterId)
  }

  async function saveChapter(chapter: any) {
    if (!currentProject.value) {
      logger.error('保存章节失败：currentProject 为空')
      return
    }

    loading.value = true
    error.value = null
    try {
      logger.info('开始独立保存章节', { chapterId: chapter.id, title: chapter.title })
      
      // 1. 直通底层存储，保存完整带有 content 的章节数据
      await storage.saveChapter(chapter, currentProject.value.id)
      
      // 2. 剥离 content 以维护前端状态机的轻量化（防OOM）
      const shallowChapter = { ...chapter }
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
    const project = await storage.loadProject(projectId)
    if (!project) throw new Error('项目不存在')

    const estimatedSize = estimateProjectSizeRough(project)
    const useLineExport = estimatedSize >= LARGE_EXPORT_THRESHOLD_BYTES

    const blob = useLineExport
      ? buildLineExportBlob(project)
      : new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })

    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = useLineExport
      ? `${project.title}.anprojl`
      : `${project.title}.anproj`
    a.click()

    URL.revokeObjectURL(url)
  }

  // 导入项目
  async function importProject(file: File): Promise<Project> {
    let project: Project

    if (isLikelyLineProjectFile(file)) {
      project = await importProjectFromLineStream(file)
    } else {
      const text = await file.text()

      try {
        project = JSON.parse(text) as Project
      } catch {
        // 兼容：如果扩展名不正确但内容是分行格式，做一次流式兜底
        project = await importProjectFromLineStream(file)
      }
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

  return {
    // 状态
    projects,
    currentProject,
    loading,
    error,
    globalConfig,

    // 计算属性
    projectCount,
    hasCurrentProject,

    // 方法
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

    // 章节级新接口
    loadChapter,
    saveChapter,
    deleteChapter
  }
})
