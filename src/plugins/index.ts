/**
 * 插件系统统一导出
 *
 * 提供插件系统的完整API
 */

// 核心类
export { PluginManager, pluginManager } from './manager'
export { PluginStorage } from './storage'
export { PluginLoader } from './loader'

// 初始化
export { initializePluginSystem, isPluginSystemInitialized, getPluginSystemStatus } from './setup'
export { initializeBuiltinPlugins, getBuiltinPlugins } from './init'

// 类型
export type {
  PluginManifest,
  PluginInstance,
  PluginContext,
  PluginLifecycle,
  PluginPermission,
  PluginStatus,
  PluginContributions,
  // 贡献点类型
  AIProviderContribution,
  ExporterContribution,
  ImporterContribution,
  ProcessorContribution,
  MenuItemContribution,
  SidebarPanelContribution,
  ToolbarButtonContribution,
  ConfigPanelContribution,
  QuickCommandContribution,
  AIActionHandlerContribution,
  // 支持类型
  ModelInfo,
  ProviderConfig,
  ProviderInstance,
  ChatRequest,
  ChatResponse,
  CostEstimate,
  ExportData,
  ExportOptions,
  ImportOptions,
  ImportResult,
  ProcessorContext,
  EditorContext,
  ActionContext,
  VectorQuery,
  VectorDocument,
  VectorSearchResult,
  MemoryContext,
  DialogOptions,
  NotificationOptions
} from './types'

// 注册表
export {
  ProviderRegistry,
  ExporterRegistry,
  ImporterRegistry,
  ProcessorRegistry,
  MenuItemRegistry,
  SidebarPanelRegistry,
  ToolbarButtonRegistry,
  QuickCommandRegistry,
  AIActionHandlerRegistry
} from './registries'

// 注册表类型
export type { ProcessorStage } from './registries'

// 上下文
export { createPluginContext, enhancePluginContext } from './context'

// 内置插件
export { openAIProviderContribution, manifest as openAIManifest } from './builtin/openai-provider'
export { anthropicProviderContribution, manifest as anthropicManifest } from './builtin/anthropic-provider'
export { localProviderContribution, manifest as localManifest } from './builtin/local-provider'

// 示例插件
export { epubExporterContribution, manifest as epubManifest } from './examples/epub-exporter'
export { pdfExporter, manifest as pdfManifest } from './examples/pdf-exporter'
export { textCleanerProcessor, styleConverterProcessor, manifest as textProcessorManifest } from './examples/text-cleaner'
export { zhipuGLMProviderContribution, manifest as zhipuManifest } from './examples/zhipu-provider'
