/**
 * 导出器注册表
 *
 * 管理所有导出器插件，支持多种导出格式
 */

import type { ExporterContribution, ExportData, ExportOptions } from '../types'
import type { ProcessorRegistry } from './processor-registry'
import { getLogger } from '@/utils/logger'

const logger = getLogger('plugin:registry:exporter')

/**
 * 导出器注册表
 *
 * 负责管理所有导出器的注册、查询和调用
 */
export class ExporterRegistry {
  private exporters: Map<string, ExporterContribution> = new Map()
  private processorRegistry?: ProcessorRegistry

  /**
   * 注入处理器注册表
   */
  setProcessorRegistry(processorRegistry: ProcessorRegistry): void {
    this.processorRegistry = processorRegistry
  }

  /**
   * 注册导出器
   */
  register(contribution: ExporterContribution): void {
    if (this.exporters.has(contribution.id)) {
      logger.warn(`导出器 ${contribution.id} 已注册，将被覆盖`)
    }

    this.exporters.set(contribution.id, contribution)
    logger.info(`✅ 导出器 ${contribution.id} 已注册`)
  }

  /**
   * 注销导出器
   */
  unregister(id: string): void {
    this.exporters.delete(id)
    logger.info(`✅ 导出器 ${id} 已注销`)
  }

  /**
   * 获取导出器
   */
  get(id: string): ExporterContribution | undefined {
    return this.exporters.get(id)
  }

  /**
   * 获取所有导出器
   */
  getAll(): ExporterContribution[] {
    return Array.from(this.exporters.values())
  }

  /**
   * 按格式获取导出器
   */
  getByFormat(format: string): ExporterContribution[] {
    return this.getAll().filter(exporter => exporter.format === format)
  }

  /**
   * 获取支持批量导出的导出器
   */
  getBatchExporters(): ExporterContribution[] {
    return this.getAll().filter(exporter => exporter.capabilities.supportsBatch)
  }

  /**
   * 获取支持自定义模板的导出器
   */
  getTemplateExporters(): ExporterContribution[] {
    return this.getAll().filter(exporter => exporter.capabilities.supportsCustomTemplate)
  }

  /**
   * 获取支持元数据的导出器
   */
  getMetadataExporters(): ExporterContribution[] {
    return this.getAll().filter(exporter => exporter.capabilities.supportsMetadata)
  }

  /**
   * 获取支持图片的导出器
   */
  getImageExporters(): ExporterContribution[] {
    return this.getAll().filter(exporter => exporter.capabilities.supportsImages)
  }

  /**
   * 检查导出器是否已注册
   */
  has(id: string): boolean {
    return this.exporters.has(id)
  }

  /**
   * 导出数据
   *
   * @param exporterId 导出器ID
   * @param data 导出数据
   * @param options 导出选项
   * @returns 导出的Blob对象
   */
  async export(exporterId: string, data: ExportData, options?: ExportOptions): Promise<Blob> {
    const exporter = this.exporters.get(exporterId)
    if (!exporter) {
      throw new Error(`导出器 ${exporterId} 未注册`)
    }

    try {
      logger.info(`开始导出: ${exporterId}, 格式: ${exporter.format}`)
      
      let processedData = data
      
      // 执行 pre-export 插件管道
      if (this.processorRegistry) {
        logger.info(`执行 pre-export 管道`)
        
        let projectId = ''
        let projectObj = undefined
        
        if (data.type === 'project') {
          projectId = data.content?.id || ''
          projectObj = data.content
        } else if (data.content?.projectId) {
          projectId = data.content.projectId
        }
        
        processedData = (await this.processorRegistry.processPipeline(
          'pre-export',
          processedData,
          { project: projectObj, config: { params: options } }
        )) as ExportData
      }

      const result = await exporter.export(processedData, options || {})
      logger.info(`✅ 导出成功: ${exporterId}`)
      return result
    } catch (error) {
      logger.error(`导出失败: ${exporterId}`, error)
      throw error
    }
  }

  /**
   * 批量导出
   *
   * @param exporterId 导出器ID
   * @param items 导出数据列表
   * @param options 导出选项
   * @returns 导出的Blob对象
   */
  async exportBatch(
    exporterId: string,
    items: ExportData[],
    options?: ExportOptions
  ): Promise<Blob> {
    const exporter = this.exporters.get(exporterId)
    if (!exporter) {
      throw new Error(`导出器 ${exporterId} 未注册`)
    }

    if (!exporter.exportBatch) {
      throw new Error(`导出器 ${exporterId} 不支持批量导出`)
    }

    try {
      logger.info(`开始批量导出: ${exporterId}, 数量: ${items.length}`)
      
      let processedItems = items
      
      // 执行 pre-export 插件管道 (批量情况下对每个item执行)
      if (this.processorRegistry) {
        logger.info(`执行 pre-export 管道 (批量)`)
        processedItems = (await Promise.all(
          items.map(item => {
            let projectObj = undefined
            if (item.type === 'project') {
              projectObj = item.content
            }
            return this.processorRegistry!.processPipeline(
              'pre-export',
              item,
              { project: projectObj, config: { params: options } }
            )
          })
        )) as ExportData[]
      }

      const result = await exporter.exportBatch(processedItems, options || {})
      logger.info(`✅ 批量导出成功: ${exporterId}`)
      return result
    } catch (error) {
      logger.error(`批量导出失败: ${exporterId}`, error)
      throw error
    }
  }

  /**
   * 获取导出器的设置组件
   *
   * @param exporterId 导出器ID
   * @returns Vue组件或undefined
   */
  getSettingsComponent(exporterId: string) {
    const exporter = this.exporters.get(exporterId)
    if (!exporter) {
      return undefined
    }

    return exporter.getSettingsComponent?.()
  }

  /**
   * 获取支持的导出格式列表
   */
  getSupportedFormats(): string[] {
    const formats = new Set<string>()
    this.exporters.forEach(exporter => {
      formats.add(exporter.format)
    })
    return Array.from(formats)
  }

  /**
   * 获取导出器的文件扩展名
   */
  getFileExtension(exporterId: string): string | undefined {
    const exporter = this.exporters.get(exporterId)
    return exporter?.fileExtension
  }

  /**
   * 获取导出器的MIME类型
   */
  getMimeType(exporterId: string): string | undefined {
    const exporter = this.exporters.get(exporterId)
    return exporter?.mimeType
  }

  /**
   * 清除所有导出器
   */
  clear(): void {
    this.exporters.clear()
    logger.info('✅ 所有导出器已清除')
  }
}
