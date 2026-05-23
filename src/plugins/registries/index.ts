/**
 * 插件注册表统一导出
 *
 * 提供所有插件注册表的统一入口
 */

// 核心扩展点注册表
export { ProviderRegistry } from './provider-registry'
export { ExporterRegistry } from './exporter-registry'
export { ImporterRegistry } from './importer-registry'
export { ProcessorRegistry } from './processor-registry'

// UI扩展注册表
export { MenuItemRegistry } from './menu-registry'
export { SidebarPanelRegistry } from './sidebar-registry'
export { ToolbarButtonRegistry } from './toolbar-registry'

// AI助手扩展注册表
export { QuickCommandRegistry } from './quick-command-registry'
export { AIActionHandlerRegistry } from './action-handler-registry'
export { ThemeRegistry } from './theme-registry'

// 导出类型
export type { ProcessorStage } from './processor-registry'
