// 临时简化版本 - 只保留核心功能
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, ProjectConfig } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { decryptProjectConfig, encryptProjectConfig } from '@/utils/crypto'
import { useStorage } from './storage'

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const globalConfig = ref<ProjectConfig | null>(null)
  const storage = useStorage()

  const projectCount = computed(() => projects.value.length)
  const hasCurrentProject = computed(() => currentProject.value !== null)

  async function loadGlobalConfig() {
    try {
      const configData = localStorage.getItem('global-config')
      if (configData) {
        const parsedConfig = JSON.parse(configData) as ProjectConfig
        globalConfig.value = decryptProjectConfig(parsedConfig)
      }
    } catch (e) {
      console.error('加载全局配置失败:', e)
    }
  }

  async function saveGlobalConfig(config: ProjectConfig) {
    try {
      const encryptedConfig = encryptProjectConfig(config)
      localStorage.setItem('global-config', JSON.stringify(encryptedConfig))
      globalConfig.value = decryptProjectConfig(encryptedConfig)
    } catch (e) {
      console.error('保存全局配置失败:', e)
      throw e
    }
  }

  async function loadProjects() {
    loading.value = true
    error.value = null
    try {
      const data = await storage.loadProjects()
      projects.value = data || []
      await loadGlobalConfig()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载项目失败'
    } finally {
      loading.value = false
    }
  }

  async function createProject(title: string, genre: string = '玄幻', targetWords: number = 100000) {
    const defaultConfig: ProjectConfig = {
      preset: 'standard',
      planningModel: 'gpt-4-turbo',
      writingModel: 'gpt-3.5-turbo',
      checkingModel: 'gpt-3.5-turbo',
      planningDepth: 'medium',
      writingDepth: 'standard',
      enableQualityCheck: true,
      qualityThreshold: 7,
      maxCostPerChapter: 0.15,
      enableAISuggestions: true,
      enableVectorRetrieval: true,
      providers: []
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
        era: { time: '', techLevel: '', socialForm: '' },
        geography: { locations: [] },
        factions: [],
        rules: [],
        aiGenerated: false
      },
      characters: [],
      outline: {
        id: uuidv4(),
        synopsis: '',
        theme: '',
        mainPlot: { id: uuidv4(), name: '主线', description: '' },
        subPlots: [],
        volumes: [],
        chapters: [],
        foreshadowings: []
      },
      chapters: [],
      config: defaultConfig
    }

    projects.value.push(newProject)
    await storage.saveProjects(projects.value)
    return newProject
  }

  async function openProject(projectId: string) {
    loading.value = true
    error.value = null
    try {
      const projectData = await storage.loadProject(projectId)
      if (projectData) {
        currentProject.value = projectData
      } else {
        throw new Error('项目不存在')
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '打开项目失败'
    } finally {
      loading.value = false
    }
  }

  async function saveCurrentProject() {
    if (!currentProject.value) return

    loading.value = true
    error.value = null
    try {
      currentProject.value.updatedAt = new Date()
      await storage.saveProject(currentProject.value)

      const index = projects.value.findIndex(p => p.id === currentProject.value!.id)
      if (index !== -1) {
        projects.value[index] = { ...currentProject.value }
        await storage.saveProjects(projects.value)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '保存项目失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteProject(projectId: string) {
    loading.value = true
    error.value = null
    try {
      await storage.deleteProject(projectId)
      projects.value = projects.value.filter(p => p.id !== projectId)
      if (currentProject.value?.id === projectId) {
        currentProject.value = null
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : '删除项目失败'
    } finally {
      loading.value = false
    }
  }

  async function exportProject(projectId: string) {
    const project = await storage.loadProject(projectId)
    if (!project) throw new Error('项目不存在')

    const data = JSON.stringify(project, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.title}.anproj`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importProject(file: File) {
    return new Promise<Project>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string)
          const project = data as Project
          project.id = uuidv4()
          project.createdAt = new Date()
          project.updatedAt = new Date()
          await storage.saveProject(project)
          projects.value.push(project)
          await storage.saveProjects(projects.value)
          resolve(project)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsText(file)
    })
  }

  return {
    projects,
    currentProject,
    loading,
    error,
    globalConfig,
    projectCount,
    hasCurrentProject,
    loadProjects,
    createProject,
    openProject,
    saveCurrentProject,
    deleteProject,
    exportProject,
    importProject,
    loadGlobalConfig,
    saveGlobalConfig
  }
})
