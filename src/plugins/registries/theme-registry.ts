import type { ThemeExtension } from '../types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('plugin:registry:theme')

/**
 * 主题扩展注册表
 *
 * 管理应用主题样式插件，如全局模式 (dark/light) 和 CSS 变量注入。
 */
export class ThemeRegistry {
  private themes: Map<string, ThemeExtension> = new Map()

  register(pluginId: string, contribution: ThemeExtension): void {
    if (this.themes.has(contribution.id)) {
      logger.warn(`主题 ${contribution.id} 已注册，将被覆盖`)
    }
    this.themes.set(contribution.id, contribution)
    logger.info(`✅ 主题 ${contribution.id} 已注册`)
  }

  unregister(id: string): void {
    this.themes.delete(id)
    logger.info(`✅ 主题 ${id} 已注销`)
  }

  get(id: string): ThemeExtension | undefined {
    return this.themes.get(id)
  }

  getAll(): ThemeExtension[] {
    return Array.from(this.themes.values())
  }
}
