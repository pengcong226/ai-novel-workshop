/**
 * 插件上下文API实现
 *
 * 为插件提供安全、受控的核心功能访问接口
 */

import { useProjectStore } from '@/stores/project'
import { useAIStore } from '@/stores/ai'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import type { WorldSetting, Outline } from '@/types'
import { getLogger } from '@/utils/logger'
import type {
  PluginContext,
  DialogOptions,
  NotificationOptions,
  VectorQuery,
  VectorDocument,
  VectorSearchResult,
  MemoryContext,
  AIProviderContribution,
  ExporterContribution,
  ImporterContribution,
  ProcessorContribution,
  MenuItemContribution,
  SidebarPanelContribution,
  ToolbarButtonContribution,
  QuickCommandContribution,
  AIActionHandlerContribution,
  ThemeExtension
} from './types'

const logger = getLogger('plugin:context')

/**
 * 创建插件上下文
 *
 * @param pluginId 插件ID
 * @param permissions 插件权限列表
 * @returns 插件上下文API
 */
export function createPluginContext(
  pluginId: string,
  permissions: string[] = []
): PluginContext {
  // 事件系统
  const eventHandlers = new Map<string, Set<(payload: any) => void>>()

  /**
   * 检查权限
   */
  function checkPermission(permission: string): boolean {
    return permissions.includes(permission) || permissions.includes('*')
  }

  /**
   * 权限守卫
   */
  function requirePermission(permission: string, action: string): void {
    if (!checkPermission(permission)) {
      throw new Error(`插件 ${pluginId} 没有权限执行操作: ${action} (需要权限: ${permission})`)
    }
  }

  /**
   * 项目数据访问API
   */
  const projectAPI = {
    getCurrentProject() {
      requirePermission('project-data', '获取当前项目')
      const store = useProjectStore()
      return store.currentProject
    },

    async saveProject() {
      requirePermission('project-data', '保存项目')
      const store = useProjectStore()
      await store.saveCurrentProject()
    },

    updateProject(updates: any) {
      requirePermission('project-data', '更新项目')
      const store = useProjectStore()
      if (store.currentProject) {
        Object.assign(store.currentProject, updates)
      }
    },

    getChapters() {
      requirePermission('project-data', '获取章节列表')
      const store = useProjectStore()
      return store.currentProject?.chapters || []
    },

    getCharacters() {
      requirePermission('project-data', '获取人物列表')
      const store = useProjectStore()
      return store.currentProject?.characters || []
    },

    getWorldSetting(): WorldSetting {
      requirePermission('project-data', '获取世界观设定')
      const store = useProjectStore()
      return store.currentProject?.world as WorldSetting
    },

    getOutline(): Outline {
      requirePermission('project-data', '获取大纲')
      const store = useProjectStore()
      return store.currentProject?.outline as Outline
    }
  }

  /**
   * AI服务API
   */
  const aiAPI = {
    async chat(messages: any[], options?: any) {
      requirePermission('ai-api', '调用AI聊天')
      const store = useAIStore()
      if (!store.checkInitialized()) throw new Error('AI服务未配置')
      const response = await store.chat(messages, { type: 'chapter' as any, priority: 'balanced', complexity: 'low' }, options)
      return response.content
    },

    async chatStream(messages: any[], callback: (chunk: string) => void) {
      requirePermission('ai-api', '调用AI流式聊天')
      const store = useAIStore()
      if (!store.checkInitialized()) throw new Error('AI服务未配置')
      await store.chatStream(
        messages,
        (event) => {
          if (event.type === 'chunk' && event.chunk) {
            callback(event.chunk)
          }
        },
        { type: 'chapter' as any, priority: 'balanced', complexity: 'low' }
      )
    },

    async generateText(prompt: string, options?: any) {
      requirePermission('ai-api', '调用AI文本生成')
      const store = useAIStore()
      if (!store.checkInitialized()) throw new Error('AI服务未配置')
      const response = await store.chat([{ role: 'user', content: prompt }], { type: 'chapter' as any, priority: 'balanced', complexity: 'medium' }, options)
      return response.content
    }
  }

  /**
   * 数据访问API
   */
  const dataAPI = {
    async query(_collection: string, query: VectorQuery): Promise<VectorSearchResult[]> {
      requirePermission('storage', '查询向量数据')
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject?.id
      if (!projectId) throw new Error('未打开项目')
      const { getVectorService } = await import('@/services/vector-service')
      const vectorService = await getVectorService(projectId ? { projectId } as any : undefined)
      return await vectorService.vectorSearch(query.query, {
        topK: query.topK,
        minScore: query.minScore,
        filter: { projectId }
      }) as any as VectorSearchResult[]
    },

    async addDocument(doc: VectorDocument): Promise<void> {
      requirePermission('storage', '添加向量文档')
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProject?.id
      if (!projectId) throw new Error('未打开项目')
      const { getVectorService } = await import('@/services/vector-service')
      const vectorService = await getVectorService(projectId ? { projectId } as any : undefined)
      // 使用 V5 新接口
      await vectorService.addDocument({
        id: doc.id,
        content: doc.content,
        metadata: {
          type: 'trace', // 降级为 trace
          projectId: projectId,
          timestamp: Date.now(),
          ...doc.metadata
        },
        embedding: doc.embedding || []
      })
    },

    async getMemory(_contextType: string): Promise<MemoryContext> {
      requirePermission('storage', '获取记忆上下文')
      return {
        shortTerm: [],
        mediumTerm: [],
        longTerm: []
      }
    }
  }

  /**
   * UI交互API
   */
  const uiAPI = {
    showMessage(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
      ElMessage({
        message,
        type,
        duration: 3000
      })
    },

    async showDialog(options: DialogOptions): Promise<unknown> {
      return new Promise((resolve, _reject) => {
        ElMessageBox.confirm(
          options.message,
          options.title || '提示',
          {
            confirmButtonText: options.confirmText || '确定',
            cancelButtonText: options.cancelText || '取消',
            type: options.type || 'info',
            showCancelButton: options.showCancel !== false,
            inputValue: options.input?.defaultValue
          }
        ).then(() => {
          resolve(true)
        }).catch(() => {
          resolve(false)
        })
      })
    },

    showNotification(options: NotificationOptions) {
      ElNotification({
        title: options.title,
        message: options.message,
        type: options.type || 'info',
        duration: options.duration || 4500,
        position: options.position || 'top-right'
      })
    },

    async confirm(message: string): Promise<boolean> {
      return new Promise((resolve) => {
        ElMessageBox.confirm(message, '确认', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          resolve(true)
        }).catch(() => {
          resolve(false)
        })
      })
    }
  }

  /**
   * 事件系统API
   */
  const eventsAPI = {
    on(event: string, handler: (payload: any) => void) {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler)
    },

    off(event: string, handler: (payload: any) => void) {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        handlers.delete(handler)
      }
    },

    emit(event: string, payload?: any) {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(payload)
          } catch (error) {
            logger.error(`插件 ${pluginId} 事件处理器错误:`, error)
          }
        })
      }
    }
  }

  /**
   * 注册API
   *
   * 注意：这些方法需要由PluginManager注入实际的注册函数
   */
  const registerAPI = {
    aiProvider(contribution: AIProviderContribution) {
      logger.warn(`插件 ${pluginId} 注册AI Provider: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    exporter(contribution: ExporterContribution) {
      logger.warn(`插件 ${pluginId} 注册导出器: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    importer(contribution: ImporterContribution) {
      logger.warn(`插件 ${pluginId} 注册导入器: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    processor(contribution: ProcessorContribution) {
      logger.warn(`插件 ${pluginId} 注册处理器: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    menuItem(contribution: MenuItemContribution) {
      logger.warn(`插件 ${pluginId} 注册菜单项: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    sidebarPanel(contribution: SidebarPanelContribution) {
      logger.warn(`插件 ${pluginId} 注册侧边栏面板: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    toolbarButton(contribution: ToolbarButtonContribution) {
      logger.warn(`插件 ${pluginId} 注册工具栏按钮: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    quickCommand(contribution: QuickCommandContribution) {
      logger.warn(`插件 ${pluginId} 注册快捷命令: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    },

    aiActionHandler(contribution: AIActionHandlerContribution) {
      logger.warn(`插件 ${pluginId} 注册AI动作处理器: ${contribution.type}`)
      // 实际注册逻辑由PluginManager提供
    },

    theme(contribution: ThemeExtension) {
      logger.warn(`插件 ${pluginId} 注册主题: ${contribution.id}`)
      // 实际注册逻辑由PluginManager提供
    }
  }

  /**
   * 工具函数API
   */
  const utilsAPI = {
    log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
      const prefix = `[Plugin: ${pluginId}] `
      switch (level) {
        case 'error':
          logger.error(prefix + message)
          break
        case 'warn':
          logger.warn(prefix + message)
          break
        default:
          logger.info(prefix + message)
      }
    },

    sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms))
    },

    clone<T>(obj: T): T {
      return JSON.parse(JSON.stringify(obj))
    },

    deepMerge<T>(target: T, source: Partial<T>): T {
      const result = { ...target }
      for (const key in source) {
        // Prototype pollution guard
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue
        }
        if (source[key] !== undefined) {
          if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            (result as any)[key] = utilsAPI.deepMerge((result as any)[key] || {}, source[key] as any)
          } else {
            (result as any)[key] = source[key]
          }
        }
      }
      return result
    }
  }

  // 返回完整的插件上下文
  return {
    project: projectAPI,
    ai: aiAPI,
    data: dataAPI,
    ui: uiAPI,
    events: eventsAPI,
    register: registerAPI,
    utils: utilsAPI
  }
}

/**
 * 增强插件上下文
 *
 * 为注册API注入实际的注册函数
 */
export function enhancePluginContext(
  context: PluginContext,
  registers: {
    aiProvider: (contribution: AIProviderContribution) => void
    exporter: (contribution: ExporterContribution) => void
    importer: (contribution: ImporterContribution) => void
    processor: (contribution: ProcessorContribution) => void
    menuItem: (contribution: MenuItemContribution) => void
    sidebarPanel: (contribution: SidebarPanelContribution) => void
    toolbarButton: (contribution: ToolbarButtonContribution) => void
    quickCommand: (contribution: QuickCommandContribution) => void
    aiActionHandler: (contribution: AIActionHandlerContribution) => void
    theme: (contribution: ThemeExtension) => void
  }
): PluginContext {
  return {
    ...context,
    register: {
      aiProvider: registers.aiProvider,
      exporter: registers.exporter,
      importer: registers.importer,
      processor: registers.processor,
      menuItem: registers.menuItem,
      sidebarPanel: registers.sidebarPanel,
      toolbarButton: registers.toolbarButton,
      quickCommand: registers.quickCommand,
      aiActionHandler: registers.aiActionHandler,
      theme: registers.theme
    }
  }
}
