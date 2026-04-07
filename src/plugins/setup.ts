/**
 * 插件系统初始化
 *
 * 在应用启动时初始化插件系统
 */

import { usePluginStore } from '@/stores/plugin'
import { initializeBuiltinPlugins } from '@/plugins/init'
import { getLogger } from '@/utils/logger'

let initialized = false
const logger = getLogger('plugin:setup')

/**
 * 初始化插件系统
 *
 * 应该在应用启动时调用一次
 */
export async function initializePluginSystem(): Promise<void> {
  if (initialized) {
    logger.warn('插件系统已经初始化，跳过重复初始化')
    return
  }

  logger.info('开始初始化插件系统')

  try {
    // 1. 加载已安装插件
    const pluginStore = usePluginStore()
    await pluginStore.loadInstalledPlugins()
    logger.info('已安装插件加载完成', { count: pluginStore.plugins.length })

    // 2. 初始化内置插件
    await initializeBuiltinPlugins()
    logger.info('内置插件初始化完成')

    // 3. 激活所有已安装的插件
    for (const plugin of pluginStore.plugins) {
      if (!pluginStore.isPluginActive(plugin.id)) {
        try {
          await pluginStore.activatePlugin(plugin.id)
          logger.info('插件已激活', { pluginId: plugin.id, pluginName: plugin.name })
        } catch (error) {
          logger.error('插件激活失败', { pluginId: plugin.id, pluginName: plugin.name, error })
        }
      }
    }

    initialized = true
    logger.info('插件系统初始化完成')

    // 在开发环境下暴露插件管理器到全局
    if (import.meta.env.DEV) {
      (window as any).__PLUGIN_MANAGER__ = pluginStore.getRegistries()
      logger.debug('开发模式已暴露插件管理器到 window.__PLUGIN_MANAGER__')
    }
  } catch (error) {
    logger.error('插件系统初始化失败', error)
    throw error
  }
}

/**
 * 检查插件系统是否已初始化
 */
export function isPluginSystemInitialized(): boolean {
  return initialized
}

/**
 * 获取插件系统状态
 */
export function getPluginSystemStatus() {
  const pluginStore = usePluginStore()

  return {
    initialized,
    installedPlugins: pluginStore.plugins.length,
    activePlugins: pluginStore.activePlugins.length,
    registries: {
      providers: pluginStore.getRegistries().aiProvider.getAll().length,
      exporters: pluginStore.getRegistries().exporter.getAll().length,
      importers: pluginStore.getRegistries().importer.getAll().length,
      processors: pluginStore.getRegistries().processor.getAll().length,
      menuItems: pluginStore.getMenuItems().length,
      sidebarPanels: pluginStore.getSidebarPanels().length,
      toolbarButtons: pluginStore.getToolbarButtons().length,
      quickCommands: pluginStore.getQuickCommands().length
    }
  }
}
