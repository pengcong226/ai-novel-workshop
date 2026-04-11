/**
 * 插件管理器核心
 *
 * 负责插件的安装、激活、停用、卸载等生命周期管理
 */

import type { PluginManifest, PluginInstance, PluginContext } from './types'
import { createPluginContext, enhancePluginContext } from './context'
import { PluginStorage } from './storage'
import { getLogger } from '@/utils/logger'
import { ProviderRegistry } from './registries/provider-registry'
import { ExporterRegistry } from './registries/exporter-registry'
import { ImporterRegistry } from './registries/importer-registry'
import { ProcessorRegistry } from './registries/processor-registry'
import { MenuItemRegistry } from './registries/menu-registry'
import { SidebarPanelRegistry } from './registries/sidebar-registry'
import { ToolbarButtonRegistry } from './registries/toolbar-registry'
import { QuickCommandRegistry } from './registries/quick-command-registry'
import { AIActionHandlerRegistry } from './registries/action-handler-registry'

/**
 * 插件管理器
 */
export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private logger = getLogger('plugin:manager')

  // 各类注册表
  private registries = {
    aiProvider: new ProviderRegistry(),
    exporter: new ExporterRegistry(),
    importer: new ImporterRegistry(),
    processor: new ProcessorRegistry(),
    menuItem: new MenuItemRegistry(),
    sidebarPanel: new SidebarPanelRegistry(),
    toolbarButton: new ToolbarButtonRegistry(),
    quickCommand: new QuickCommandRegistry(),
    aiActionHandler: new AIActionHandlerRegistry()
  }

  /**
   * 安装插件
   */
  async installPlugin(manifest: PluginManifest, entryPoint: () => Promise<unknown>): Promise<void> {
    // 1. 验证插件
    this.validatePlugin(manifest)

    // 2. 检查依赖
    await this.checkDependencies(manifest)

    // 3. 检查是否已安装
    if (this.plugins.has(manifest.id)) {
      throw new Error(`插件 ${manifest.id} 已安装`)
    }

    // 4. 加载插件模块
    let module: any
    try {
      module = await entryPoint()
    } catch (error) {
      throw new Error(`加载插件 ${manifest.id} 失败: ${error}`)
    }

    // 5. 创建插件实例
    const instance: PluginInstance = {
      manifest,
      module,
      active: false,
      context: this.createPluginContext(manifest),
      settings: {}
    }

    this.plugins.set(manifest.id, instance)

    // 6. 保存安装信息
    await PluginStorage.savePluginInfo(manifest)

    this.logger.info('插件安装成功', { pluginId: manifest.id, pluginName: manifest.name })
  }

  /**
   * 激活插件
   */
  async activatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`插件 ${pluginId} 未安装`)
    }

    if (instance.active) {
      this.logger.warn('插件已激活，跳过重复激活', { pluginId })
      return
    }

    try {
      // 1. 增强上下文（注入注册函数）
      instance.context = enhancePluginContext(
        instance.context,
        {
          aiProvider: (c) => this.registries.aiProvider.register(c),
          exporter: (c) => this.registries.exporter.register(c),
          importer: (c) => this.registries.importer.register(c),
          processor: (c) => this.registries.processor.register(c),
          menuItem: (c) => this.registries.menuItem.register(c),
          sidebarPanel: (c) => this.registries.sidebarPanel.register(c),
          toolbarButton: (c) => this.registries.toolbarButton.register(c),
          quickCommand: (c) => this.registries.quickCommand.register(c),
          aiActionHandler: (c) => this.registries.aiActionHandler.register(c)
        }
      )

      // 2. 调用激活钩子
      if (instance.module.activate) {
        await instance.module.activate(instance.context)
      }

      // 3. 注册贡献点
      this.registerContributions(instance)

      instance.active = true
      this.logger.info('插件激活成功', { pluginId })
    } catch (error) {
      this.logger.error('激活插件失败', { pluginId, error })
      throw error
    }
  }

  /**
   * 停用插件
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance || !instance.active) {
      return
    }

    try {
      // 1. 调用停用钩子
      if (instance.module.deactivate) {
        await instance.module.deactivate()
      }

      // 2. 注销贡献点
      this.unregisterContributions(instance)

      instance.active = false
      this.logger.info('插件停用成功', { pluginId })
    } catch (error) {
      this.logger.error('停用插件失败', { pluginId, error })
      throw error
    }
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      return
    }

    try {
      // 1. 停用插件
      if (instance.active) {
        await this.deactivatePlugin(pluginId)
      }

      // 2. 调用卸载钩子
      if (instance.module.uninstall) {
        await instance.module.uninstall()
      }

      // 3. 从内存中移除
      this.plugins.delete(pluginId)

      // 4. 从存储中删除
      await PluginStorage.removePlugin(pluginId)

      this.logger.info('插件卸载成功', { pluginId })
    } catch (error) {
      this.logger.error('卸载插件失败', { pluginId, error })
      throw error
    }
  }

  /**
   * 获取插件
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取激活的插件
   */
  getActivePlugins(): PluginInstance[] {
    return this.getAllPlugins().filter(p => p.active)
  }

  /**
   * 获取注册表
   */
  getRegistries() {
    return this.registries
  }

  /**
   * 执行AI动作
   */
  async executeAction(type: string, data: any, context?: any): Promise<void> {
    const ctx = context || { project: {} as any }
    await this.registries.aiActionHandler.execute(type, data, ctx)
  }

  // ==================== 私有方法 ====================

  /**
   * 验证插件清单
   */
  private validatePlugin(manifest: PluginManifest): void {
    if (!manifest.id) {
      throw new Error('插件清单缺少 id 字段')
    }
    if (!manifest.name) {
      throw new Error('插件清单缺少 name 字段')
    }
    if (!manifest.version) {
      throw new Error('插件清单缺少 version 字段')
    }
    if (!manifest.author) {
      throw new Error('插件清单缺少 author 字段')
    }
    if (!manifest.description) {
      throw new Error('插件清单缺少 description 字段')
    }

    // 验证版本号格式 (semver)
    const semverRegex = /^\d+\.\d+\.\d+(-[\w\d\-\.]+)?$/
    if (!semverRegex.test(manifest.version)) {
      throw new Error(`插件版本号格式不正确: ${manifest.version}`)
    }
  }

  /**
   * 检查依赖
   */
  private async checkDependencies(manifest: PluginManifest): Promise<void> {
    if (!manifest.dependencies) {
      return
    }

    for (const [depId, versionRange] of Object.entries(manifest.dependencies)) {
      const dep = this.plugins.get(depId)
      if (!dep) {
        throw new Error(`缺少依赖插件: ${depId}`)
      }

      // 简单的版本检查
      // TODO: 实现完整的 semver 版本范围检查
      if (!dep.manifest.version.startsWith(versionRange.replace('^', '').replace('~', ''))) {
        this.logger.warn('插件依赖版本不匹配', {
          pluginId: manifest.id,
          dependency: depId,
          required: versionRange,
          current: dep.manifest.version
        })
      }
    }
  }

  /**
   * 创建插件上下文
   */
  private createPluginContext(manifest: PluginManifest): PluginContext {
    return createPluginContext(
      manifest.id,
      manifest.permissions || []
    )
  }

  /**
   * 注册贡献点
   */
  private registerContributions(instance: PluginInstance): void {
    const contributions = instance.manifest.contributes
    if (!contributions) {
      return
    }

    // 注册AI提供商
    if (contributions.aiProviders) {
      contributions.aiProviders.forEach(contribution => {
        this.registries.aiProvider.register(contribution)
        this.logger.debug('注册 AI Provider 贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册导出器
    if (contributions.exporters) {
      contributions.exporters.forEach(contribution => {
        this.registries.exporter.register(contribution)
        this.logger.debug('注册导出器贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册导入器
    if (contributions.importers) {
      contributions.importers.forEach(contribution => {
        this.registries.importer.register(contribution)
        this.logger.debug('注册导入器贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册处理器
    if (contributions.processors) {
      contributions.processors.forEach(contribution => {
        this.registries.processor.register(contribution)
        this.logger.debug('注册处理器贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册菜单项
    if (contributions.menuItems) {
      contributions.menuItems.forEach(contribution => {
        this.registries.menuItem.register(contribution)
        this.logger.debug('注册菜单项贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册侧边栏面板
    if (contributions.sidebarPanels) {
      contributions.sidebarPanels.forEach(contribution => {
        this.registries.sidebarPanel.register(contribution)
        this.logger.debug('注册侧边栏面板贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册工具栏按钮
    if (contributions.toolbarButtons) {
      contributions.toolbarButtons.forEach(contribution => {
        this.registries.toolbarButton.register(contribution)
        this.logger.debug('注册工具栏按钮贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册快捷命令
    if (contributions.quickCommands) {
      contributions.quickCommands.forEach(contribution => {
        this.registries.quickCommand.register(contribution)
        this.logger.debug('注册快捷命令贡献', { contributionId: contribution.id, pluginId: instance.manifest.id })
      })
    }

    // 注册AI动作处理器
    if (contributions.aiActionHandlers) {
      contributions.aiActionHandlers.forEach(contribution => {
        this.registries.aiActionHandler.register(contribution)
        this.logger.debug('注册 AI 动作处理器贡献', { contributionType: contribution.type, pluginId: instance.manifest.id })
      })
    }
  }

  /**
   * 注销贡献点
   */
  private unregisterContributions(instance: PluginInstance): void {
    const contributions = instance.manifest.contributes
    if (!contributions) {
      return
    }

    // 注销AI提供商
    if (contributions.aiProviders) {
      contributions.aiProviders.forEach(contribution => {
        this.registries.aiProvider.unregister(contribution.id)
      })
    }

    // 注销导出器
    if (contributions.exporters) {
      contributions.exporters.forEach(contribution => {
        this.registries.exporter.unregister(contribution.id)
      })
    }

    // 注销导入器
    if (contributions.importers) {
      contributions.importers.forEach(contribution => {
        this.registries.importer.unregister(contribution.id)
      })
    }

    // 注销处理器
    if (contributions.processors) {
      contributions.processors.forEach(contribution => {
        this.registries.processor.unregister(contribution.id)
      })
    }

    // 注销菜单项
    if (contributions.menuItems) {
      contributions.menuItems.forEach(contribution => {
        this.registries.menuItem.unregister(contribution.id)
      })
    }

    // 注销侧边栏面板
    if (contributions.sidebarPanels) {
      contributions.sidebarPanels.forEach(contribution => {
        this.registries.sidebarPanel.unregister(contribution.id)
      })
    }

    // 注销工具栏按钮
    if (contributions.toolbarButtons) {
      contributions.toolbarButtons.forEach(contribution => {
        this.registries.toolbarButton.unregister(contribution.id)
      })
    }

    // 注销快捷命令
    if (contributions.quickCommands) {
      contributions.quickCommands.forEach(contribution => {
        this.registries.quickCommand.unregister(contribution.id)
      })
    }

    // 注销AI动作处理器
    if (contributions.aiActionHandlers) {
      contributions.aiActionHandlers.forEach(contribution => {
        this.registries.aiActionHandler.unregister(contribution.type)
      })
    }
  }
}

// 导出单例实例
export const pluginManager = new PluginManager()
