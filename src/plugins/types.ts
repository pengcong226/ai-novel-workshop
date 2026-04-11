/**
 * 插件系统类型定义
 *
 * 提供完整的插件接口定义，包括：
 * - 插件元数据
 * - 权限控制
 * - 扩展点声明
 * - 生命周期钩子
 */

import type { Component } from 'vue'
import type { Project, Chapter, Character, WorldSetting, Outline } from '@/types'

// Inline AI types used by plugin context (not all exported from @/types/ai)
type Message = { role: string; content: string }
type ChatOptions = {
  temperature?: number
  maxTokens?: number
  model?: string
  stopSequences?: string[]
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  [key: string]: any
}
type GenerateOptions = {
  temperature?: number
  maxTokens?: number
  model?: string
  stopSequences?: string[]
  [key: string]: any
}

// ==================== 基础类型 ====================

/**
 * 插件权限
 */
export type PluginPermission =
  | 'storage'          // 访问存储（IndexedDB, localStorage）
  | 'network'          // 发起网络请求
  | 'filesystem'       // 访问文件系统
  | 'ai-api'           // 调用AI API
  | 'project-data'     // 访问项目数据
  | 'user-settings'    // 修改用户设置

/**
 * 插件状态
 */
export type PluginStatus =
  | 'installing'       // 安装中
  | 'installed'        // 已安装
  | 'activating'       // 激活中
  | 'active'           // 激活
  | 'deactivating'     // 停用中
  | 'inactive'         // 未激活
  | 'error'            // 错误状态

// ==================== 扩展点贡献类型 ====================

/**
 * AI Provider 扩展贡献
 */
export interface AIProviderContribution {
  id: string
  name: string
  type: 'ai-provider'

  // Provider配置
  config: {
    providerType: string           // 'openai' | 'anthropic' | 'custom'
    defaultBaseURL?: string
    requiresApiKey: boolean
    supportsStreaming: boolean
    supportedModels: ModelInfo[]
  }

  // Provider工厂函数
  createProvider(config: ProviderConfig): ProviderInstance
}

/**
 * 导出器扩展贡献
 */
export interface ExporterContribution {
  id: string
  name: string
  type: 'exporter'

  // 支持的格式
  format: string           // 'epub' | 'pdf' | 'docx' | 'html'
  fileExtension: string    // '.epub' | '.pdf'
  mimeType: string

  // 能力声明
  capabilities: {
    supportsBatch: boolean
    supportsCustomTemplate: boolean
    supportsMetadata: boolean
    supportsImages: boolean
  }

  // 导出实现
  export(data: ExportData, options: ExportOptions): Promise<Blob>
  exportBatch?(items: ExportData[], options: ExportOptions): Promise<Blob>

  // 可选：配置面板
  getSettingsComponent?(): Component
}

/**
 * 导入器扩展贡献
 */
export interface ImporterContribution {
  id: string
  name: string
  type: 'importer'

  // 支持的格式
  supportedFormats: string[]  // ['epub', 'pdf', 'docx']
  fileExtensions: string[]    // ['.epub', '.pdf']

  // 导入实现
  import(file: File, options: ImportOptions): Promise<ImportResult>

  // 可选：预处理钩子
  preprocess?(text: string): Promise<string>

  // 可选：后处理钩子
  postprocess?(project: Partial<Project>): Promise<Partial<Project>>
}

/**
 * 数据处理器扩展贡献
 */
export interface ProcessorContribution {
  id: string
  name: string
  type: 'processor'

  // 处理阶段
  stage: 'pre-import' | 'post-import' | 'pre-export' | 'post-generation'

  // 执行策略
  priority?: number                    // 优先级，数值越大越先执行
  timeoutMs?: number                   // 超时时间（毫秒）
  onError?: 'continue' | 'abort'      // 失败时继续或中断

  // 处理方法
  process(data: any, context: ProcessorContext): Promise<unknown>

  // 可选：UI配置组件
  getSettingsComponent?(): Component
}

/**
 * 菜单项扩展贡献
 */
export interface MenuItemContribution {
  id: string
  label: string
  icon: string
  order?: number
  group?: string

  // 显示条件
  when?: () => boolean

  // 点击处理
  handler: () => void | Promise<void>
}

/**
 * 侧边栏面板扩展贡献
 */
export interface SidebarPanelContribution {
  id: string
  title: string
  icon: string
  component: Component
  order?: number
  position: 'left' | 'right'
  width?: number
}

/**
 * 工具栏按钮扩展贡献
 */
export interface ToolbarButtonContribution {
  id: string
  label: string
  icon: string
  location: 'chapter-editor' | 'outline-editor' | 'character-editor'
  order?: number

  handler: (context: EditorContext) => void | Promise<void>
}

/**
 * 配置面板扩展贡献
 */
export interface ConfigPanelContribution {
  id: string
  title: string
  component: Component
  order?: number
  icon?: string
}

/**
 * 快捷命令扩展贡献
 */
export interface QuickCommandContribution {
  id: string
  text: string
  command: string
  icon?: string

  handler?: () => void | Promise<void>
}

/**
 * AI动作处理器扩展贡献
 */
export interface AIActionHandlerContribution {
  type: string  // 动作类型标识

  handler: (data: any, context: ActionContext) => Promise<void>
}

/**
 * 主题扩展贡献
 */
export interface ThemeExtension {
  id: string
  name: string
  description?: string
  mode: 'light' | 'dark'
  cssVariables: Record<string, string>
  globalCss?: string
  primaryColor?: string
}

/**
 * 插件贡献点汇总
 */
export interface PluginContributions {
  // AI提供商
  aiProviders?: AIProviderContribution[]

  // 导出器
  exporters?: ExporterContribution[]

  // 导入器
  importers?: ImporterContribution[]

  // 数据处理器
  processors?: ProcessorContribution[]

  // UI扩展
  menuItems?: MenuItemContribution[]
  sidebarPanels?: SidebarPanelContribution[]
  toolbarButtons?: ToolbarButtonContribution[]
  configPanels?: ConfigPanelContribution[]

  // AI助手扩展
  quickCommands?: QuickCommandContribution[]
  aiActionHandlers?: AIActionHandlerContribution[]

  // 主题扩展
  themes?: ThemeExtension[]
}

// ==================== 插件元数据 ====================

/**
 * 插件清单
 */
export interface PluginManifest {
  // 基本信息
  id: string                    // 插件唯一标识
  name: string                  // 插件名称
  version: string               // 版本号 (semver)
  author: string                // 作者
  description: string           // 描述
  icon?: string                 // 图标（emoji或URL）
  homepage?: string             // 主页URL
  repository?: string           // 代码仓库

  // 依赖管理
  dependencies?: {
    [pluginId: string]: string  // 插件ID: 版本范围
  }

  // 权限声明
  permissions?: PluginPermission[]

  // 扩展点声明
  contributes?: PluginContributions

  // 插件配置Schema
  configuration?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      default?: any
      description?: string
      required?: boolean
      options?: Array<{ label: string; value: any }>
    }
  }
}

/**
 * 插件实例
 */
export interface PluginInstance {
  manifest: PluginManifest
  active: boolean
  module: any
  context: PluginContext
  settings?: Record<string, any>
}

/**
 * 插件生命周期
 */
export interface PluginLifecycle {
  /**
   * 插件激活钩子
   * 在插件首次启用时调用
   */
  activate?(context: PluginContext): Promise<void>

  /**
   * 插件停用钩子
   * 在插件禁用时调用
   */
  deactivate?(): Promise<void>

  /**
   * 插件卸载钩子
   * 在插件删除时调用
   */
  uninstall?(): Promise<void>
}

// ==================== 插件上下文 ====================

/**
 * 插件上下文API - 暴露给插件的核心功能
 */
export interface PluginContext {
  // 项目数据访问
  project: {
    getCurrentProject(): Project | null
    saveProject(): Promise<void>
    updateProject(updates: Partial<Project>): void
    getChapters(): Chapter[]
    getCharacters(): Character[]
    getWorldSetting(): WorldSetting
    getOutline(): Outline
  }

  // AI服务
  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<string>
    chatStream(messages: Message[], callback: (chunk: string) => void): Promise<void>
    generateText(prompt: string, options?: GenerateOptions): Promise<string>
  }

  // 数据访问
  data: {
    query(collection: string, query: VectorQuery): Promise<VectorSearchResult[]>
    addDocument(doc: VectorDocument): Promise<void>
    getMemory(contextType: string): Promise<MemoryContext>
  }

  // UI交互
  ui: {
    showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
    showDialog(options: DialogOptions): Promise<unknown>
    showNotification(options: NotificationOptions): void
    confirm(message: string): Promise<boolean>
  }

  // 事件系统
  events: {
    on(event: string, handler: (payload: any) => void): void
    off(event: string, handler: (payload: any) => void): void
    emit(event: string, payload?: any): void
  }

  // 注册API
  register: {
    aiProvider(contribution: AIProviderContribution): void
    exporter(contribution: ExporterContribution): void
    importer(contribution: ImporterContribution): void
    processor(contribution: ProcessorContribution): void
    menuItem(contribution: MenuItemContribution): void
    sidebarPanel(contribution: SidebarPanelContribution): void
    toolbarButton(contribution: ToolbarButtonContribution): void
    quickCommand(contribution: QuickCommandContribution): void
    aiActionHandler(contribution: AIActionHandlerContribution): void
    theme(contribution: ThemeExtension): void
  }

  // 工具函数
  utils: {
    log(message: string, level?: 'info' | 'warn' | 'error'): void
    sleep(ms: number): Promise<void>
    clone<T>(obj: T): T
    deepMerge<T>(target: T, source: Partial<T>): T
  }
}

// ==================== 支持类型 ====================

/**
 * 模型信息
 */
export interface ModelInfo {
  id: string
  name: string
  type: 'planning' | 'writing' | 'checking' | 'memory' | 'assistant'
  maxTokens: number
  costPerInputToken: number
  costPerOutputToken: number
  isEnabled: boolean
}

/**
 * Provider配置
 */
export interface ProviderConfig {
  apiKey: string
  baseURL?: string
  model: string
  maxTokens?: number
  temperature?: number
  [key: string]: any
}

/**
 * Provider实例
 */
export interface ProviderInstance {
  chat(request: ChatRequest): Promise<ChatResponse>
  chatStream?(request: ChatRequest): AsyncGenerator<string>
  validateConfig(): Promise<boolean>
  getModels(): Promise<ModelInfo[]>
  estimateCost(request: ChatRequest): CostEstimate
}

/**
 * Chat请求
 */
export interface ChatRequest {
  messages: Message[]
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
  stopSequences?: string[]
}
/**
 * Chat响应
 */
export interface ChatResponse {
  content: string
  model: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  cost: CostEstimate
  latency: number
  finishReason: string
}

/**
 * 成本估算
 */
export interface CostEstimate {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCostUSD: number
  outputCostUSD: number
  totalUSD: number
  totalCNY: number
  model: string
}

/**
 * 导出数据
 */
export interface ExportData {
  type: 'chapter' | 'project' | 'character' | 'world' | 'outline'
  content: any
}

/**
 * 导出选项
 */
export interface ExportOptions {
  includeMetadata?: boolean
  customTemplate?: string
  [key: string]: any
}

/**
 * 导入选项
 */
export interface ImportOptions {
  encoding?: string
  extractMetadata?: boolean
  [key: string]: any
}

/**
 * 导入结果
 */
export interface ImportResult {
  project: Partial<Project>
  chapters?: Chapter[]
  characters?: Character[]
  worldSetting?: WorldSetting
  outline?: Outline
}

/**
 * 处理器上下文
 */
export interface ProcessorContext {
  project?: Project
  chapter?: Chapter
  characters?: Character[]
  worldSetting?: WorldSetting
  outline?: Outline
  config?: Record<string, any>
}

/**
 * 编辑器上下文
 */
export interface EditorContext {
  chapter?: Chapter
  content: string
  selection?: {
    start: number
    end: number
    text: string
  }
}

/**
 * 动作上下文
 */
export interface ActionContext {
  project: Project
  chapter?: Chapter
  characters?: Character[]
  worldSetting?: WorldSetting
}

/**
 * 向量查询
 */
export interface VectorQuery {
  query: string
  topK?: number
  minScore?: number
  filter?: (metadata: any) => boolean
}

/**
 * 向量文档
 */
export interface VectorDocument {
  id: string
  content: string
  metadata: any
  embedding?: number[]
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult {
  id: string
  content: string
  metadata: any
  score: number
  source: string
}

/**
 * 记忆上下文
 */
export interface MemoryContext {
  shortTerm: string[]
  mediumTerm: string[]
  longTerm: VectorSearchResult[]
}

/**
 * 对话选项
 */
export interface DialogOptions {
  title?: string
  message: string
  type?: 'info' | 'success' | 'warning' | 'error'
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  input?: {
    type: 'text' | 'textarea' | 'number' | 'select'
    placeholder?: string
    defaultValue?: any
    options?: Array<{ label: string; value: any }>
  }
}

/**
 * 通知选项
 */
export interface NotificationOptions {
  title: string
  message?: string
  type?: 'success' | 'info' | 'warning' | 'error'
  duration?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

