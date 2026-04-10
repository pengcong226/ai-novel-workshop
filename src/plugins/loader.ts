/**
 * 插件加载器
 *
 * 负责从不同来源加载和验证插件
 */

import type { PluginManifest } from './types'

/**
 * 插件来源类型
 */
export type PluginSource =
  | 'local'      // 本地文件
  | 'url'        // 远程URL
  | 'npm'        // NPM包
  | 'marketplace' // 插件市场

/**
 * 插件加载结果
 */
export interface PluginLoadResult {
  success: boolean
  manifest?: PluginManifest
  module?: any
  error?: string
  warnings?: string[]
}

/**
 * 插件验证规则
 */
const MANIFEST_REQUIRED_FIELDS = ['id', 'name', 'version', 'author', 'description']
const MANIFEST_VERSION_PATTERN = /^\d+\.\d+\.\d+(-[\w\d\-\.]+)?$/

/**
 * 插件加载器类
 */
export class PluginLoader {
  /**
   * 从URL加载插件
   */
  static async loadFromUrl(url: string): Promise<PluginLoadResult> {
    try {
      // 加载manifest
      const manifestUrl = url.endsWith('.json') ? url : `${url}/manifest.json`
      const response = await fetch(manifestUrl)

      if (!response.ok) {
        return {
          success: false,
          error: `无法加载manifest: ${response.status} ${response.statusText}`
        }
      }

      const manifest: PluginManifest = await response.json()

      // 验证manifest
      const validation = this.validateManifest(manifest)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        }
      }

      // 加载模块
      const module = await this.loadModule(url, manifest)

      return {
        success: true,
        manifest,
        module,
        warnings: validation.warnings
      }
    } catch (error) {
      return {
        success: false,
        error: `加载失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 从本地文件加载插件
   */
  static async loadFromFile(file: File): Promise<PluginLoadResult> {
    try {
      // 读取文件内容
      const content = await file.text()
      const manifest: PluginManifest = JSON.parse(content)

      // 验证manifest
      const validation = this.validateManifest(manifest)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        }
      }

      // 本地文件没有模块实现，返回空模块
      const module = {
        activate: async () => {
          console.log(`插件 ${manifest.id} 激活（无模块实现）`)
        },
        deactivate: async () => {
          console.log(`插件 ${manifest.id} 停用（无模块实现）`)
        }
      }

      return {
        success: true,
        manifest,
        module,
        warnings: validation.warnings
      }
    } catch (error) {
      return {
        success: false,
        error: `文件解析失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 从JSON字符串加载插件
   */
  static loadFromJson(json: string): PluginLoadResult {
    try {
      const manifest: PluginManifest = JSON.parse(json)

      // 验证manifest
      const validation = this.validateManifest(manifest)
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        }
      }

      // 返回空模块
      const module = {
        activate: async () => {
          console.log(`插件 ${manifest.id} 激活（无模块实现）`)
        },
        deactivate: async () => {
          console.log(`插件 ${manifest.id} 停用（无模块实现）`)
        }
      }

      return {
        success: true,
        manifest,
        module,
        warnings: validation.warnings
      }
    } catch (error) {
      return {
        success: false,
        error: `JSON解析失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 验证插件清单
   */
  static validateManifest(manifest: any): {
    valid: boolean
    error?: string
    warnings?: string[]
  } {
    const warnings: string[] = []

    // 检查必需字段
    for (const field of MANIFEST_REQUIRED_FIELDS) {
      if (!manifest[field]) {
        return {
          valid: false,
          error: `缺少必需字段: ${field}`
        }
      }
    }

    // 验证ID格式
    if (typeof manifest.id !== 'string') {
      return {
        valid: false,
        error: 'id必须是字符串'
      }
    }

    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      return {
        valid: false,
        error: 'id只能包含小写字母、数字和连字符'
      }
    }

    // 验证版本号格式
    if (!MANIFEST_VERSION_PATTERN.test(manifest.version)) {
      return {
        valid: false,
        error: '版本号格式不正确，应为 semver 格式 (例如: 1.0.0)'
      }
    }

    // 验证权限
    if (manifest.permissions) {
      const validPermissions = ['storage', 'network', 'filesystem', 'ai-api', 'project-data', 'user-settings']
      for (const permission of manifest.permissions) {
        if (!validPermissions.includes(permission)) {
          warnings.push(`未知的权限: ${permission}`)
        }
      }
    }

    // 验证依赖
    if (manifest.dependencies) {
      if (typeof manifest.dependencies !== 'object') {
        return {
          valid: false,
          error: 'dependencies必须是对象'
        }
      }

      for (const [depId, version] of Object.entries(manifest.dependencies)) {
        if (typeof depId !== 'string' || typeof version !== 'string') {
          return {
            valid: false,
            error: '依赖格式不正确'
          }
        }
      }
    }

    // 验证贡献点
    if (manifest.contributes) {
      const validation = this.validateContributions(manifest.contributes)
      if (!validation.valid) {
        return validation
      }
      if (validation.warnings) {
        warnings.push(...validation.warnings)
      }
    }

    // 验证配置
    if (manifest.configuration) {
      const validTypes = ['string', 'number', 'boolean', 'array', 'object']
      for (const [key, config] of Object.entries(manifest.configuration)) {
        if (!validTypes.includes((config as any).type)) {
          warnings.push(`配置项 ${key} 的类型 ${(config as any).type} 可能不被支持`)
        }
      }
    }

    return {
      valid: true,
      warnings
    }
  }

  /**
   * 验证贡献点
   */
  private static validateContributions(contributes: any): {
    valid: boolean
    error?: string
    warnings?: string[]
  } {
    const warnings: string[] = []

    // 验证AI Provider
    if (contributes.aiProviders) {
      if (!Array.isArray(contributes.aiProviders)) {
        return {
          valid: false,
          error: 'aiProviders必须是数组'
        }
      }
    }

    // 验证导出器
    if (contributes.exporters) {
      if (!Array.isArray(contributes.exporters)) {
        return {
          valid: false,
          error: 'exporters必须是数组'
        }
      }
    }

    // 验证导入器
    if (contributes.importers) {
      if (!Array.isArray(contributes.importers)) {
        return {
          valid: false,
          error: 'importers必须是数组'
        }
      }
    }

    // 验证处理器
    if (contributes.processors) {
      if (!Array.isArray(contributes.processors)) {
        return {
          valid: false,
          error: 'processors必须是数组'
        }
      }

      const validStages = ['pre-import', 'post-import', 'pre-export', 'post-generation']
      for (const processor of contributes.processors) {
        if (!validStages.includes(processor.stage)) {
          warnings.push(`处理器 ${processor.id} 的阶段 ${processor.stage} 无效`)
        }
      }
    }

    // 验证菜单项
    if (contributes.menuItems) {
      if (!Array.isArray(contributes.menuItems)) {
        return {
          valid: false,
          error: 'menuItems必须是数组'
        }
      }
    }

    // 验证侧边栏面板
    if (contributes.sidebarPanels) {
      if (!Array.isArray(contributes.sidebarPanels)) {
        return {
          valid: false,
          error: 'sidebarPanels必须是数组'
        }
      }

      for (const panel of contributes.sidebarPanels) {
        if (!['left', 'right'].includes(panel.position)) {
          warnings.push(`侧边栏面板 ${panel.id} 的位置 ${panel.position} 无效`)
        }
      }
    }

    // 验证工具栏按钮
    if (contributes.toolbarButtons) {
      if (!Array.isArray(contributes.toolbarButtons)) {
        return {
          valid: false,
          error: 'toolbarButtons必须是数组'
        }
      }

      const validLocations = ['chapter-editor', 'outline-editor', 'character-editor']
      for (const button of contributes.toolbarButtons) {
        if (!validLocations.includes(button.location)) {
          warnings.push(`工具栏按钮 ${button.id} 的位置 ${button.location} 无效`)
        }
      }
    }

    return {
      valid: true,
      warnings
    }
  }

  /**
   * 加载插件模块
   */
  private static async loadModule(baseUrl: string, manifest: PluginManifest): Promise<any> {
    // 如果贡献点中有定义，直接返回激活/停用钩子
    if (manifest.contributes) {
      return {
        activate: async (context: any) => {
          console.log(`插件 ${manifest.id} 激活（基于贡献点）`)

          // 注册所有贡献点
          const contributes = manifest.contributes
          if (contributes?.aiProviders) {
            for (const provider of contributes.aiProviders) {
              context.register.aiProvider(provider)
            }
          }

          if (contributes?.exporters) {
            for (const exporter of contributes.exporters) {
              context.register.exporter(exporter)
            }
          }

          if (contributes?.importers) {
            for (const importer of contributes.importers) {
              context.register.importer(importer)
            }
          }

          if (contributes?.processors) {
            for (const processor of contributes.processors) {
              context.register.processor(processor)
            }
          }

          if (contributes?.menuItems) {
            for (const menuItem of contributes.menuItems) {
              context.register.menuItem(menuItem)
            }
          }

          if (contributes?.sidebarPanels) {
            for (const panel of contributes.sidebarPanels) {
              context.register.sidebarPanel(panel)
            }
          }

          if (contributes?.toolbarButtons) {
            for (const button of contributes.toolbarButtons) {
              context.register.toolbarButton(button)
            }
          }

          if (contributes?.quickCommands) {
            for (const command of contributes.quickCommands) {
              context.register.quickCommand(command)
            }
          }

          if (contributes?.aiActionHandlers) {
            for (const handler of contributes.aiActionHandlers) {
              context.register.aiActionHandler(handler)
            }
          }
        },

        deactivate: async () => {
          console.log(`插件 ${manifest.id} 停用（基于贡献点）`)
        },

        uninstall: async () => {
          console.log(`插件 ${manifest.id} 卸载（基于贡献点）`)
        }
      }
    }

    // 返回空模块
    return {
      activate: async () => {
        console.log(`插件 ${manifest.id} 激活（空模块）`)
      },
      deactivate: async () => {
        console.log(`插件 ${manifest.id} 停用（空模块）`)
      }
    }
  }

  /**
   * 检查插件兼容性
   */
  static checkCompatibility(manifest: PluginManifest): {
    compatible: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // 检查版本兼容性（这里可以添加更复杂的版本检查）
    // 例如，检查插件是否与当前应用版本兼容

    // 检查依赖
    if (manifest.dependencies) {
      // 在实际实现中，应该检查依赖插件是否已安装
      console.log('需要检查依赖:', manifest.dependencies)
    }

    return {
      compatible: issues.length === 0,
      issues
    }
  }
}
