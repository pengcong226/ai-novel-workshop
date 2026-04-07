/**
 * AI Provider注册表
 *
 * 管理所有AI提供商,包括内置和插件提供的自定义Provider
 */

import type { ChatRequest, ChatResponse, CostBreakdown, ModelConfig } from '@/types/ai'
import type { AIProviderContribution, ProviderConfig, ProviderInstance } from '../types'

/**
 * Provider注册表
 *
 * 负责管理所有AI提供商的注册、查询和调用
 */
export class ProviderRegistry {
  private providers: Map<string, AIProviderContribution> = new Map()
  private instances: Map<string, ProviderInstance> = new Map()
  private configs: Map<string, ProviderConfig> = new Map()

  /**
   * 注册Provider
   */
  register(contribution: AIProviderContribution): void {
    if (this.providers.has(contribution.id)) {
      console.warn(`Provider ${contribution.id} 已注册,将被覆盖`)
    }

    this.providers.set(contribution.id, contribution)
    console.log(`✅ Provider ${contribution.id} 已注册`)
  }

  /**
   * 注销Provider
   */
  unregister(id: string): void {
    this.providers.delete(id)
    this.instances.delete(id)
    this.configs.delete(id)
    console.log(`✅ Provider ${id} 已注销`)
  }

  /**
   * 获取Provider
   */
  get(id: string): AIProviderContribution | undefined {
    return this.providers.get(id)
  }

  /**
   * 获取所有Provider
   */
  getAll(): AIProviderContribution[] {
    return Array.from(this.providers.values())
  }

  /**
   * 获取Provider实例
   *
   * 如果实例不存在,会使用配置创建新实例
   */
  getInstance(id: string): ProviderInstance | undefined {
    // 如果已有实例,直接返回
    if (this.instances.has(id)) {
      return this.instances.get(id)
    }

    // 如果没有配置,返回undefined
    const config = this.configs.get(id)
    if (!config) {
      return undefined
    }

    // 创建新实例
    const contribution = this.providers.get(id)
    if (!contribution) {
      return undefined
    }

    try {
      const instance = contribution.createProvider(config)
      this.instances.set(id, instance)
      return instance
    } catch (error) {
      console.error(`创建Provider ${id} 实例失败:`, error)
      throw error
    }
  }

  /**
   * 配置Provider
   *
   * 配置会触发实例重新创建
   */
  configure(id: string, config: ProviderConfig): void {
    this.configs.set(id, config)
    // 清除旧实例,下次使用时会创建新实例
    this.instances.delete(id)
    console.log(`✅ Provider ${id} 已配置`)
  }

  /**
   * 获取Provider配置
   */
  getConfig(id: string): ProviderConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * 检查Provider是否已注册
   */
  has(id: string): boolean {
    return this.providers.has(id)
  }

  /**
   * 发送聊天请求
   */
  async chat(id: string, request: ChatRequest): Promise<ChatResponse> {
    const instance = this.getInstance(id)
    if (!instance) {
      throw new Error(`Provider ${id} 未配置或未注册`)
    }

    return (await instance.chat(request)) as any
  }

  /**
   * 发送流式聊天请求
   */
  async *chatStream(id: string, request: ChatRequest): AsyncGenerator<string> {
    const instance = this.getInstance(id)
    if (!instance) {
      throw new Error(`Provider ${id} 未配置或未注册`)
    }

    if (!instance.chatStream) {
      throw new Error(`Provider ${id} 不支持流式输出`)
    }

    yield* instance.chatStream(request)
  }

  /**
   * 验证Provider配置
   */
  async validateConfig(id: string): Promise<boolean> {
    const instance = this.getInstance(id)
    if (!instance) {
      return false
    }

    try {
      return await instance.validateConfig()
    } catch (error) {
      console.error(`验证Provider ${id} 配置失败:`, error)
      return false
    }
  }

  /**
   * 获取Provider支持的模型列表
   */
  async getModels(id: string): Promise<ModelConfig[]> {
    const instance = this.getInstance(id)
    if (!instance) {
      throw new Error(`Provider ${id} 未配置或未注册`)
    }

    return (await instance.getModels()) as any
  }

  /**
   * 估算请求成本
   */
  estimateCost(id: string, request: ChatRequest): CostBreakdown {
    const instance = this.getInstance(id)
    if (!instance) {
      throw new Error(`Provider ${id} 未配置或未注册`)
    }

    return instance.estimateCost(request)
  }

  /**
   * 清除所有Provider
   */
  clear(): void {
    this.providers.clear()
    this.instances.clear()
    this.configs.clear()
  }

  /**
   * 获取所有支持的Provider类型
   */
  getSupportedTypes(): string[] {
    return Array.from(this.providers.values()).map(p => p.config.providerType)
  }

  /**
   * 按类型获取Provider
   */
  getByType(type: string): AIProviderContribution[] {
    return this.getAll().filter(p => p.config.providerType === type)
  }

  /**
   * 获取支持流式的Provider
   */
  getStreamingProviders(): AIProviderContribution[] {
    return this.getAll().filter(p => p.config.supportsStreaming)
  }
}
