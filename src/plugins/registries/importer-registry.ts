/**
 * 导入器注册表
 *
 * 管理所有导入器插件，支持多种导入格式
 */

import type { ImporterContribution, ImportOptions, ImportResult } from '../types'
import type { ProcessorRegistry } from './processor-registry'

/**
 * 导入器注册表
 *
 * 负责管理所有导入器的注册、查询和调用
 */
export class ImporterRegistry {
  private importers: Map<string, ImporterContribution> = new Map()
  private processorRegistry?: ProcessorRegistry

  /**
   * 注入处理器注册表
   */
  setProcessorRegistry(processorRegistry: ProcessorRegistry): void {
    this.processorRegistry = processorRegistry
  }

  /**
   * 注册导入器
   */
  register(contribution: ImporterContribution): void {
    if (this.importers.has(contribution.id)) {
      console.warn(`导入器 ${contribution.id} 已注册，将被覆盖`)
    }

    this.importers.set(contribution.id, contribution)
    console.log(`✅ 导入器 ${contribution.id} 已注册`)
  }

  /**
   * 注销导入器
   */
  unregister(id: string): void {
    this.importers.delete(id)
    console.log(`✅ 导入器 ${id} 已注销`)
  }

  /**
   * 获取导入器
   */
  get(id: string): ImporterContribution | undefined {
    return this.importers.get(id)
  }

  /**
   * 获取所有导入器
   */
  getAll(): ImporterContribution[] {
    return Array.from(this.importers.values())
  }

  /**
   * 按格式获取导入器
   */
  getByFormat(format: string): ImporterContribution[] {
    return this.getAll().filter(importer =>
      importer.supportedFormats.includes(format)
    )
  }

  /**
   * 按文件扩展名获取导入器
   */
  getByFileExtension(extension: string): ImporterContribution[] {
    return this.getAll().filter(importer =>
      importer.fileExtensions.includes(extension)
    )
  }

  /**
   * 检查导入器是否已注册
   */
  has(id: string): boolean {
    return this.importers.has(id)
  }

  /**
   * 导入数据
   *
   * @param importerId 导入器ID
   * @param file 要导入的文件
   * @param options 导入选项
   * @returns 导入结果
   */
  async import(
    importerId: string,
    file: File,
    options?: ImportOptions
  ): Promise<ImportResult> {
    const importer = this.importers.get(importerId)
    if (!importer) {
      throw new Error(`导入器 ${importerId} 未注册`)
    }

    try {
      console.log(`开始导入: ${importerId}, 文件: ${file.name}`)

      let processedFile = file

      // 执行 pre-import 插件管道
      if (this.processorRegistry) {
        console.log(`执行 pre-import 管道`)
        processedFile = await this.processorRegistry.processPipeline(
          'pre-import',
          processedFile,
          { config: { projectId: options?.projectId || '', params: options } }
        )
      }

      // 预处理
      if (importer.preprocess) {
        console.log(`执行预处理: ${importerId}`)
        const text = await processedFile.text()
        const processedText = await importer.preprocess(text)
        processedFile = new File([processedText], processedFile.name, { type: processedFile.type })
      }

      // 导入
      const result = await importer.import(processedFile, options || {})

      // 后处理
      if (importer.postprocess) {
        console.log(`执行后处理: ${importerId}`)
        const processedResult = await importer.postprocess(result.project)
        result.project = processedResult
      }

      // 执行 post-import 插件管道
      if (this.processorRegistry) {
        console.log(`执行 post-import 管道`)
        const postResult = await this.processorRegistry.processPipeline(
          'post-import',
          result,
          { config: { projectId: options?.projectId || '', params: options } }
        )
        if (postResult && postResult.project) {
          Object.assign(result, postResult)
        }
      }

      console.log(`✅ 导入成功: ${importerId}`)
      return result
    } catch (error) {
      console.error(`导入失败: ${importerId}`, error)
      throw error
    }
  }

  /**
   * 自动检测文件类型并导入
   *
   * @param file 要导入的文件
   * @param options 导入选项
   * @returns 导入结果
   */
  async autoImport(file: File, options?: ImportOptions): Promise<ImportResult> {
    // 获取文件扩展名
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()

    // 查找支持的导入器
    const importers = this.getByFileExtension(extension)

    if (importers.length === 0) {
      throw new Error(`不支持的文件格式: ${extension}`)
    }

    // 使用第一个支持的导入器
    const importer = importers[0]
    console.log(`自动选择导入器: ${importer.id}`)

    return await this.import(importer.id, file, options)
  }

  /**
   * 获取支持的导入格式列表
   */
  getSupportedFormats(): string[] {
    const formats = new Set<string>()
    this.importers.forEach(importer => {
      importer.supportedFormats.forEach(format => {
        formats.add(format)
      })
    })
    return Array.from(formats)
  }

  /**
   * 获取支持的文件扩展名列表
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>()
    this.importers.forEach(importer => {
      importer.fileExtensions.forEach(ext => {
        extensions.add(ext)
      })
    })
    return Array.from(extensions)
  }

  /**
   * 检查文件格式是否支持
   */
  isFormatSupported(format: string): boolean {
    return this.getByFormat(format).length > 0
  }

  /**
   * 检查文件扩展名是否支持
   */
  isExtensionSupported(extension: string): boolean {
    return this.getByFileExtension(extension).length > 0
  }

  /**
   * 清除所有导入器
   */
  clear(): void {
    this.importers.clear()
    console.log('✅ 所有导入器已清除')
  }
}
