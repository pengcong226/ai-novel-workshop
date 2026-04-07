/**
 * 初始化内置插件
 *
 * 在应用启动时自动加载和注册内置插件
 */

import { openAIProviderContribution, manifest as openAIManifest } from './builtin/openai-provider'
import { anthropicProviderContribution, manifest as anthropicManifest } from './builtin/anthropic-provider'
import { localProviderContribution, manifest as localManifest } from './builtin/local-provider'
import { pluginManager } from './manager'
import { getLogger } from '@/utils/logger'
import type { PluginContext, PluginManifest } from './types'

/**
 * 初始化内置插件
 *
 * 这个函数应该在应用启动时调用
 */
const logger = getLogger('plugin:init')

export async function initializeBuiltinPlugins(): Promise<void> {
  logger.info('开始初始化内置插件')

  try {
    // 安装OpenAI Provider
    await pluginManager.installPlugin(openAIManifest as any as PluginManifest, async () => ({
      activate: async (context: PluginContext) => {
        context.register.aiProvider(openAIProviderContribution)
        logger.info('内置插件已激活', { plugin: openAIManifest.name, id: openAIManifest.id })
      },
      deactivate: async () => {
        logger.info('内置插件已停用', { plugin: openAIManifest.name, id: openAIManifest.id })
      }
    }))

    // 激活OpenAI Provider
    await pluginManager.activatePlugin(openAIManifest.id)

    // 安装Anthropic Provider
    await pluginManager.installPlugin(anthropicManifest as any as PluginManifest, async () => ({
      activate: async (context: PluginContext) => {
        context.register.aiProvider(anthropicProviderContribution)
        logger.info('内置插件已激活', { plugin: anthropicManifest.name, id: anthropicManifest.id })
      },
      deactivate: async () => {
        logger.info('内置插件已停用', { plugin: anthropicManifest.name, id: anthropicManifest.id })
      }
    }))

    // 激活Anthropic Provider
    await pluginManager.activatePlugin(anthropicManifest.id)

    // 安装Local Provider
    await pluginManager.installPlugin(localManifest as any as PluginManifest, async () => ({
      activate: async (context: PluginContext) => {
        context.register.aiProvider(localProviderContribution)
        logger.info('内置插件已激活', { plugin: localManifest.name, id: localManifest.id })
      },
      deactivate: async () => {
        logger.info('内置插件已停用', { plugin: localManifest.name, id: localManifest.id })
      }
    }))

    // 激活Local Provider
    await pluginManager.activatePlugin(localManifest.id)

    logger.info('内置插件初始化完成')
  } catch (error) {
    logger.error('内置插件初始化失败', error)
    throw error
  }
}

/**
 * 获取内置插件列表
 */
export function getBuiltinPlugins() {
  return [
    {
      manifest: openAIManifest,
      contribution: openAIProviderContribution
    },
    {
      manifest: anthropicManifest,
      contribution: anthropicProviderContribution
    },
    {
      manifest: localManifest,
      contribution: localProviderContribution
    }
  ]
}
