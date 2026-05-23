/**
 * 插件状态管理 Pinia Store
 *
 * 管理插件的安装、激活、设置等状态
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { pluginManager } from '@/plugins/manager'
import { PluginStorage } from '@/plugins/storage'
import { getLogger } from '@/utils/logger'
import type { PluginManifest, PluginInstance} from '@/plugins/types'

export const usePluginStore = defineStore('plugin', () => {
  // 状态
  const plugins = ref<PluginManifest[]>([])
  const activePlugins = ref<string[]>([])
  const pluginSettings = ref<Record<string, unknown>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // 实验模式开关（安全版）
  const experimentalMode = ref(
    typeof window !== 'undefined'
      ? localStorage.getItem('plugin-experimental-mode') === 'true'
      : false
  )

  const logger = getLogger('plugin:store')

  // 计算属性
  const pluginCount = computed(() => plugins.value.length)
  const activePluginCount = computed(() => activePlugins.value.length)

  const installedPluginIds = computed(() => plugins.value.map(p => p.id))

  /**
   * 加载已安装插件
   */
  async function loadInstalledPlugins() {
    loading.value = true
    error.value = null

    try {
      const installedPlugins = await PluginStorage.loadInstalledPlugins()
      plugins.value = installedPlugins

      // 加载所有插件设置
      const allSettings = await PluginStorage.loadAllPluginSettings()
      pluginSettings.value = allSettings

      logger.info('已加载插件', { count: installedPlugins.length })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载插件失败'
      logger.error('加载插件失败', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 安装插件
   */
  async function installPlugin(manifest: PluginManifest, entryPoint: () => Promise<unknown>) {
    loading.value = true
    error.value = null

    try {
      await pluginManager.installPlugin(manifest, entryPoint)
      plugins.value.push(manifest)
      logger.info('插件安装成功', { pluginId: manifest.id })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '安装插件失败'
      logger.error('安装插件失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 卸载插件
   */
  async function uninstallPlugin(pluginId: string) {
    loading.value = true
    error.value = null

    try {
      await pluginManager.uninstallPlugin(pluginId)

      // 从列表中移除
      const index = plugins.value.findIndex(p => p.id === pluginId)
      if (index >= 0) {
        plugins.value.splice(index, 1)
      }

      // 从激活列表中移除
      const activeIndex = activePlugins.value.indexOf(pluginId)
      if (activeIndex >= 0) {
        activePlugins.value.splice(activeIndex, 1)
      }

      // 删除设置
      const { [pluginId]: _, ...rest } = pluginSettings.value
      pluginSettings.value = rest

      logger.info('插件卸载成功', { pluginId })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '卸载插件失败'
      logger.error('卸载插件失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 激活插件
   */
  async function activatePlugin(pluginId: string) {
    loading.value = true
    error.value = null

    try {
      await pluginManager.activatePlugin(pluginId)

      if (!activePlugins.value.includes(pluginId)) {
        activePlugins.value.push(pluginId)
      }

      logger.info('插件激活成功', { pluginId })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '激活插件失败'
      logger.error('激活插件失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 停用插件
   */
  async function deactivatePlugin(pluginId: string) {
    loading.value = true
    error.value = null

    try {
      await pluginManager.deactivatePlugin(pluginId)

      const index = activePlugins.value.indexOf(pluginId)
      if (index >= 0) {
        activePlugins.value.splice(index, 1)
      }

      logger.info('插件停用成功', { pluginId })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '停用插件失败'
      logger.error('停用插件失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * 切换插件激活状态
   */
  async function togglePlugin(pluginId: string) {
    if (activePlugins.value.includes(pluginId)) {
      await deactivatePlugin(pluginId)
    } else {
      await activatePlugin(pluginId)
    }
  }

  /**
   * 更新插件设置
   */
  async function updatePluginSettings(pluginId: string, settings: Record<string, unknown>) {
    try {
      await PluginStorage.updatePluginSettings(pluginId, settings)
      pluginSettings.value[pluginId] = {
        ...(pluginSettings.value[pluginId] ?? {}),
        ...settings
      } as Record<string, unknown>
      logger.debug('插件设置已更新', { pluginId, keys: Object.keys(settings || {}) })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新插件设置失败'
      logger.error('更新插件设置失败', err)
      throw err
    }
  }

  /**
   * 获取插件设置
   */
  function getPluginSettings(pluginId: string): Record<string, unknown> {
    return (pluginSettings.value[pluginId] || {}) as Record<string, unknown>
  }

  /**
   * 获取插件信息
   */
  function getPlugin(pluginId: string): PluginManifest | undefined {
    return plugins.value.find(p => p.id === pluginId)
  }

  /**
   * 获取插件实例
   */
  function getPluginInstance(pluginId: string): PluginInstance | undefined {
    return pluginManager.getPlugin(pluginId)
  }

  /**
   * 检查插件是否激活
   */
  function isPluginActive(pluginId: string): boolean {
    return activePlugins.value.includes(pluginId)
  }

  /**
   * 检查插件是否已安装
   */
  function isPluginInstalled(pluginId: string): boolean {
    return plugins.value.some(p => p.id === pluginId)
  }

  /**
   * 获取插件的注册表
   */
  function getRegistries() {
    return pluginManager.getRegistries()
  }

  /**
   * 获取所有菜单项
   */
  function getMenuItems() {
    return pluginManager.getRegistries().menuItem.getAll()
  }

  /**
   * 获取所有侧边栏面板
   */
  function getSidebarPanels() {
    return pluginManager.getRegistries().sidebarPanel.getAll()
  }

  /**
   * 获取所有工具栏按钮
   */
  function getToolbarButtons() {
    return pluginManager.getRegistries().toolbarButton.getAll()
  }

  /**
   * 获取所有快捷命令
   */
  function getQuickCommands() {
    return pluginManager.getRegistries().quickCommand.getAll()
  }

  /**
   * 设置实验模式
   */
  function setExperimentalMode(value: boolean) {
    experimentalMode.value = value
    localStorage.setItem('plugin-experimental-mode', value ? 'true' : 'false')
  }

  /**
   * 导出插件配置
   */
  async function exportPluginConfig(pluginId: string): Promise<string> {
    return await PluginStorage.exportPluginConfig(pluginId)
  }

  /**
   * 导入插件配置
   */
  async function importPluginConfig(configJson: string) {
    const { manifest, settings } = await PluginStorage.importPluginConfig(configJson)
    const existingIndex = plugins.value.findIndex(p => p.id === manifest.id)
    if (existingIndex !== -1) {
      plugins.value[existingIndex] = manifest
    } else {
      plugins.value.push(manifest)
    }
    pluginSettings.value[manifest.id] = settings
    return { manifest, settings }
  }

  /**
   * 执行快捷命令
   */
  async function executeQuickCommand(command: string) {
    const { routeAssistantInput } = await import('@/assistant/commands/inputRouter')
    return await routeAssistantInput(command)
  }

  /**
   * 清除所有插件
   */
  async function clearAllPlugins() {
    loading.value = true
    error.value = null

    try {
      // 停用所有插件
      for (const pluginId of activePlugins.value) {
        await pluginManager.deactivatePlugin(pluginId)
      }

      // 清除存储
      await PluginStorage.clearAllPlugins()

      // 清空状态
      plugins.value = []
      activePlugins.value = []
      pluginSettings.value = {}

      logger.warn('所有插件已清除')
    } catch (err) {
      error.value = err instanceof Error ? err.message : '清除插件失败'
      logger.error('清除插件失败', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    plugins,
    activePlugins,
    pluginSettings,
    loading,
    error,
    experimentalMode,

    // 计算属性
    pluginCount,
    activePluginCount,
    installedPluginIds,

    // 方法
    loadInstalledPlugins,
    installPlugin,
    uninstallPlugin,
    activatePlugin,
    deactivatePlugin,
    togglePlugin,
    updatePluginSettings,
    getPluginSettings,
    getPlugin,
    getPluginInstance,
    isPluginActive,
    isPluginInstalled,
    getRegistries,
    getMenuItems,
    getSidebarPanels,
    getToolbarButtons,
    getQuickCommands,
    setExperimentalMode,
    exportPluginConfig,
    importPluginConfig,
    executeQuickCommand,
    clearAllPlugins
  }
})
