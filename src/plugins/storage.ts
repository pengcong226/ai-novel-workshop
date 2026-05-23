/**
 * 插件存储系统
 *
 * 负责插件配置的持久化存储和加载
 */

import type { PluginManifest } from './types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('plugin:storage')

/**
 * 插件存储类
 */
export class PluginStorage {
  private static STORAGE_KEY = 'ai-novel-plugins'
  private static SETTINGS_KEY = 'ai-novel-plugin-settings'

  /**
   * 保存插件信息
   */
  static async savePluginInfo(manifest: PluginManifest): Promise<void> {
    try {
      const plugins = await this.loadInstalledPlugins()
      const index = plugins.findIndex(p => p.id === manifest.id)

      if (index >= 0) {
        plugins[index] = manifest
      } else {
        plugins.push(manifest)
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(plugins))
      logger.info(`✅ 插件 ${manifest.id} 信息已保存`)
    } catch (error) {
      logger.error(`保存插件 ${manifest.id} 信息失败:`, error)
      throw error
    }
  }

  /**
   * 加载已安装插件列表
   */
  static async loadInstalledPlugins(): Promise<PluginManifest[]> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) {
        return []
      }

      const plugins = JSON.parse(stored)
      return plugins
    } catch (error) {
      logger.error('加载已安装插件失败:', error)
      return []
    }
  }

  /**
   * 删除插件信息
   */
  static async removePlugin(pluginId: string): Promise<void> {
    try {
      const plugins = await this.loadInstalledPlugins()
      const filtered = plugins.filter(p => p.id !== pluginId)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))

      // 同时删除插件设置
      await this.removePluginSettings(pluginId)

      logger.info(`✅ 插件 ${pluginId} 信息已删除`)
    } catch (error) {
      logger.error(`删除插件 ${pluginId} 信息失败:`, error)
      throw error
    }
  }

  /**
   * 保存插件设置
   */
  static async savePluginSettings(pluginId: string, settings: Record<string, any>): Promise<void> {
    try {
      const allSettings = await this.loadAllPluginSettings()
      allSettings[pluginId] = settings
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(allSettings))
      logger.info(`✅ 插件 ${pluginId} 设置已保存`)
    } catch (error) {
      logger.error(`保存插件 ${pluginId} 设置失败:`, error)
      throw error
    }
  }

  /**
   * 加载插件设置
   */
  static async loadPluginSettings(pluginId: string): Promise<Record<string, any>> {
    try {
      const allSettings = await this.loadAllPluginSettings()
      return allSettings[pluginId] || {}
    } catch (error) {
      logger.error(`加载插件 ${pluginId} 设置失败:`, error)
      return {}
    }
  }

  /**
   * 加载所有插件设置
   */
  static async loadAllPluginSettings(): Promise<Record<string, any>> {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY)
      if (!stored) {
        return {}
      }

      return JSON.parse(stored)
    } catch (error) {
      logger.error('加载所有插件设置失败:', error)
      return {}
    }
  }

  /**
   * 删除插件设置
   */
  static async removePluginSettings(pluginId: string): Promise<void> {
    try {
      const allSettings = await this.loadAllPluginSettings()
      delete allSettings[pluginId]
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(allSettings))
      logger.info(`✅ 插件 ${pluginId} 设置已删除`)
    } catch (error) {
      logger.error(`删除插件 ${pluginId} 设置失败:`, error)
      throw error
    }
  }

  /**
   * 更新插件设置（部分更新）
   */
  static async updatePluginSettings(
    pluginId: string,
    updates: Record<string, any>
  ): Promise<void> {
    try {
      const currentSettings = await this.loadPluginSettings(pluginId)
      const newSettings = { ...currentSettings, ...updates }
      await this.savePluginSettings(pluginId, newSettings)
    } catch (error) {
      logger.error(`更新插件 ${pluginId} 设置失败:`, error)
      throw error
    }
  }

  /**
   * 检查插件是否已安装
   */
  static async isPluginInstalled(pluginId: string): Promise<boolean> {
    const plugins = await this.loadInstalledPlugins()
    return plugins.some(p => p.id === pluginId)
  }

  /**
   * 获取插件信息
   */
  static async getPluginInfo(pluginId: string): Promise<PluginManifest | undefined> {
    const plugins = await this.loadInstalledPlugins()
    return plugins.find(p => p.id === pluginId)
  }

  /**
   * 清除所有插件数据
   */
  static async clearAllPlugins(): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
      localStorage.removeItem(this.SETTINGS_KEY)
      logger.info('✅ 所有插件数据已清除')
    } catch (error) {
      logger.error('清除所有插件数据失败:', error)
      throw error
    }
  }

  /**
   * 导出插件配置
   */
  static async exportPluginConfig(pluginId: string): Promise<string> {
    try {
      const manifest = await this.getPluginInfo(pluginId)
      if (!manifest) {
        throw new Error(`插件 ${pluginId} 未安装`)
      }

      const settings = await this.loadPluginSettings(pluginId)

      const config = {
        manifest,
        settings,
        exportedAt: new Date().toISOString()
      }

      return JSON.stringify(config, null, 2)
    } catch (error) {
      logger.error(`导出插件 ${pluginId} 配置失败:`, error)
      throw error
    }
  }

  /**
   * 导入插件配置
   */
  static async importPluginConfig(configJson: string): Promise<{ manifest: PluginManifest; settings: Record<string, any> }> {
    try {
      const config = JSON.parse(configJson)

      if (!config.manifest) {
        throw new Error('配置文件缺少 manifest 字段')
      }

      // 验证manifest
      if (!config.manifest.id || !config.manifest.name || !config.manifest.version) {
        throw new Error('配置文件中的 manifest 格式不正确')
      }

      // 保存插件信息
      await this.savePluginInfo(config.manifest)

      // 保存设置
      if (config.settings) {
        await this.savePluginSettings(config.manifest.id, config.settings)
      }

      return {
        manifest: config.manifest,
        settings: config.settings || {}
      }
    } catch (error) {
      logger.error('导入插件配置失败:', error)
      throw error
    }
  }
}
