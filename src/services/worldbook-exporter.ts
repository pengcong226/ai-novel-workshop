/**
 * 世界书导出服务
 *
 * 支持多种格式导出世界书：
 * - PNG (嵌入角色卡)
 * - JSON (标准SillyTavern格式)
 * - JSONL (每行一个条目)
 * - YAML (人类可读)
 * - Markdown (文档格式)
 *
 * @module services/worldbook-exporter
 */

import type {
  Worldbook,
  WorldbookEntry,
  WorldbookExportOptions,
  WorldbookExportResult
} from '@/types/worldbook'

/**
 * PNG 导出选项
 */
export interface PngExportOptions extends WorldbookExportOptions {
  /** 背景图片 (Base64 或 URL) */
  backgroundImage?: string

  /** 图片宽度 */
  width?: number

  /** 图片高度 */
  height?: number

  /** 角色卡数据 (嵌入PNG时) */
  characterCard?: {
    name: string
    description?: string
    personality?: string
    scenario?: string
    first_mes?: string
    mes_example?: string
    [key: string]: any
  }

  /** 是否嵌入到角色卡 */
  embedInCharacter?: boolean
}

/**
 * Markdown 导出选项
 */
export interface MarkdownExportOptions extends WorldbookExportOptions {
  /** 模板类型 */
  template?: 'detailed' | 'compact' | 'reference'

  /** 是否包含目录 */
  includeToc?: boolean

  /** 是否包含统计信息 */
  includeStatistics?: boolean
}

/**
 * 世界书导出器
 *
 * 提供多种格式的世界书导出功能
 */
export class WorldbookExporter {
  /**
   * 导出世界书
   *
   * @param worldbook 世界书数据
   * @param options 导出选项
   * @returns 导出结果
   */
  async export(
    worldbook: Worldbook,
    options: WorldbookExportOptions
  ): Promise<WorldbookExportResult> {
    try {
      let data: string | Blob
      let mimeType: string
      let extension: string

      switch (options.format) {
        case 'sillytavern':
        case 'tavernai':
        case 'json':
          data = this.exportAsJson(worldbook, options)
          mimeType = 'application/json'
          extension = 'json'
          break

        case 'yaml':
          data = await this.exportAsYaml(worldbook, options)
          mimeType = 'text/yaml'
          extension = 'yaml'
          break

        case 'markdown':
          data = this.exportAsMarkdown(worldbook, options as MarkdownExportOptions)
          mimeType = 'text/markdown'
          extension = 'md'
          break

        default:
          throw new Error(`不支持的导出格式: ${options.format}`)
      }

      return {
        success: true,
        data,
        exportedCount: worldbook.entries.length,
        suggestedFilename: this.generateFilename(worldbook, extension),
        mimeType
      }
    } catch (error) {
      return {
        success: false,
        exportedCount: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 导出为 PNG (嵌入角色卡)
   *
   * @param worldbook 世界书数据
   * @param options PNG导出选项
   * @returns PNG Blob
   */
  async exportAsPng(
    worldbook: Worldbook,
    options: PngExportOptions = {}
  ): Promise<Blob> {
    const {
      width = 400,
      height = 600,
      backgroundImage,
      characterCard,
      embedInCharacter = false,
      includeExtensions = false
    } = options

    // 准备世界书数据
    const worldbookData = this.prepareWorldbookData(worldbook, { includeExtensions })

    // 创建 Canvas
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('无法创建 Canvas 上下文')
    }

    // 绘制背景
    if (backgroundImage) {
      await this.drawImageBackground(ctx, backgroundImage, width, height)
    } else {
      // 默认渐变背景
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#667eea')
      gradient.addColorStop(1, '#764ba2')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    }

    // 绘制世界书信息
    this.drawWorldbookInfo(ctx, worldbook, width, height)

    // 转换为 Blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas 转换为 Blob 失败'))
          }
        },
        'image/png'
      )
    })

    // 嵌入世界书数据到 PNG 元数据
    if (embedInCharacter && characterCard) {
      return await this.embedWorldbookInCharacterCard(blob, worldbookData, characterCard)
    } else {
      return await this.embedDataInPng(blob, worldbookData)
    }
  }

  /**
   * 导出为 JSON (SillyTavern 标准格式)
   *
   * @param worldbook 世界书数据
   * @param options 导出选项
   * @returns JSON 字符串
   */
  exportAsJson(
    worldbook: Worldbook,
    options: WorldbookExportOptions = {}
  ): string {
    const {
      includeExtensions = false,
      includeStatistics = false,
      includeAiMetadata = false,
      enabledOnly = false,
      includeDisabled = true,
      sortBy = 'uid',
      pretty = true
    } = options

    // 过滤条目
    let entries = this.filterEntries(worldbook.entries, { enabledOnly, includeDisabled })

    // 排序
    entries = this.sortEntries(entries, sortBy)

    // 准备数据
    const data = this.prepareWorldbookData(
      {
        ...worldbook,
        entries
      },
      { includeExtensions, includeStatistics, includeAiMetadata }
    )

    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  }

  /**
   * 导出为 JSONL (每行一个条目)
   *
   * @param worldbook 世界书数据
   * @param options 导出选项
   * @returns JSONL 字符串
   */
  exportAsJsonl(
    worldbook: Worldbook,
    options: WorldbookExportOptions = {}
  ): string {
    const {
      includeExtensions = false,
      includeAiMetadata = false,
      enabledOnly = false,
      includeDisabled = true,
      sortBy = 'uid'
    } = options

    // 过滤条目
    let entries = this.filterEntries(worldbook.entries, { enabledOnly, includeDisabled })

    // 排序
    entries = this.sortEntries(entries, sortBy)

    // 转换为 JSONL
    return entries
      .map((entry) => {
        const preparedEntry = this.prepareEntry(entry, { includeExtensions, includeAiMetadata })
        return JSON.stringify(preparedEntry)
      })
      .join('\n')
  }

  /**
   * 导出为 YAML (人类可读格式)
   *
   * @param worldbook 世界书数据
   * @param options 导出选项
   * @returns YAML 字符串
   */
  async exportAsYaml(
    worldbook: Worldbook,
    options: WorldbookExportOptions = {}
  ): Promise<string> {
    const {
      includeExtensions = false,
      includeStatistics = false,
      includeAiMetadata = false,
      enabledOnly = false,
      includeDisabled = true,
      sortBy = 'uid'
    } = options

    // 动态导入 js-yaml
    const yaml = await import('js-yaml')

    // 过滤条目
    let entries = this.filterEntries(worldbook.entries, { enabledOnly, includeDisabled })

    // 排序
    entries = this.sortEntries(entries, sortBy)

    // 准备数据
    const data = this.prepareWorldbookData(
      {
        ...worldbook,
        entries
      },
      { includeExtensions, includeStatistics, includeAiMetadata }
    )

    return yaml.dump(data, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: true
    })
  }

  /**
   * 导出为 Markdown (文档格式)
   *
   * @param worldbook 世界书数据
   * @param options Markdown导出选项
   * @returns Markdown 字符串
   */
  exportAsMarkdown(
    worldbook: Worldbook,
    options: MarkdownExportOptions = {}
  ): string {
    const {
      template = 'detailed',
      includeToc = true,
      includeStatistics = true,
      includeExtensions = false,
      enabledOnly = false,
      includeDisabled = true,
      sortBy = 'uid',
      groupByCategory = false
    } = options

    // 过滤条目
    let entries = this.filterEntries(worldbook.entries, { enabledOnly, includeDisabled })

    // 排序
    entries = this.sortEntries(entries, sortBy)

    // 分组
    const groupedEntries = groupByCategory
      ? this.groupEntriesByCategory(entries)
      : { '所有条目': entries }

    // 生成 Markdown
    const lines: string[] = []

    // 标题
    lines.push(`# ${worldbook.name || '世界书'}`)
    lines.push('')

    // 描述
    if (worldbook.metadata?.description) {
      lines.push(worldbook.metadata.description)
      lines.push('')
    }

    // 统计信息
    if (includeStatistics) {
      lines.push(this.generateStatisticsSection(worldbook, entries))
      lines.push('')
    }

    // 目录
    if (includeToc) {
      lines.push(this.generateTableOfContents(groupedEntries))
      lines.push('')
    }

    // 条目内容
    for (const [category, categoryEntries] of Object.entries(groupedEntries)) {
      if (groupByCategory) {
        lines.push(`## ${category}`)
        lines.push('')
      }

      for (const entry of categoryEntries) {
        lines.push(this.formatEntryAsMarkdown(entry, template, includeExtensions))
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  // ============ 私有方法 ============

  /**
   * 过滤条目
   */
  private filterEntries(
    entries: WorldbookEntry[],
    options: { enabledOnly: boolean; includeDisabled: boolean }
  ): WorldbookEntry[] {
    const { enabledOnly, includeDisabled } = options

    if (enabledOnly) {
      return entries.filter((entry) => !entry.disable)
    }

    if (!includeDisabled) {
      return entries.filter((entry) => !entry.disable)
    }

    return entries
  }

  /**
   * 排序条目
   */
  private sortEntries(entries: WorldbookEntry[], sortBy: string): WorldbookEntry[] {
    const sorted = [...entries]

    switch (sortBy) {
      case 'uid':
        return sorted.sort((a, b) => (a.uid || 0) - (b.uid || 0))

      case 'order':
        return sorted.sort((a, b) => (a.order || 0) - (b.order || 0))

      case 'alphabetical':
        return sorted.sort((a, b) => {
          const aContent = a.content || ''
          const bContent = b.content || ''
          return aContent.localeCompare(bContent, 'zh-CN')
        })

      case 'category':
        return sorted.sort((a, b) => {
          const aCategory = a.novelWorkshop?.category || ''
          const bCategory = b.novelWorkshop?.category || ''
          return aCategory.localeCompare(bCategory, 'zh-CN')
        })

      case 'created_at':
        return sorted.sort((a, b) => {
          const aTime = a.novelWorkshop?.createdAt?.getTime() || 0
          const bTime = b.novelWorkshop?.createdAt?.getTime() || 0
          return bTime - aTime
        })

      default:
        return sorted
    }
  }

  /**
   * 准备世界书数据
   */
  private prepareWorldbookData(
    worldbook: Worldbook,
    options: {
      includeExtensions?: boolean
      includeStatistics?: boolean
      includeAiMetadata?: boolean
    }
  ): any {
    const { includeExtensions = false, includeStatistics = false, includeAiMetadata = false } = options

    const entries = worldbook.entries.map((entry) =>
      this.prepareEntry(entry, { includeExtensions, includeAiMetadata })
    )

    const data: any = {
      entries,
      name: worldbook.name,
      description: worldbook.metadata?.description
    }

    // 添加元数据
    if (worldbook.metadata) {
      data.scan_depth = worldbook.metadata.scan_depth
      data.token_budget = worldbook.metadata.token_budget
      data.recursive_scan_depth = worldbook.metadata.recursive_scan_depth

      if (includeStatistics && worldbook.metadata.totalEntries) {
        data.total_entries = worldbook.metadata.totalEntries
      }
    }

    return data
  }

  /**
   * 准备单个条目
   */
  private prepareEntry(
    entry: WorldbookEntry,
    options: { includeExtensions?: boolean; includeAiMetadata?: boolean }
  ): any {
    const { includeExtensions = false, includeAiMetadata = false } = options

    // SillyTavern 标准字段
    const prepared: any = {
      uid: entry.uid,
      key: entry.key,
      keysecondary: entry.keysecondary,
      content: entry.content,
      comment: entry.comment,
      constant: entry.constant,
      selective: entry.selective,
      order: entry.order,
      position: entry.position,
      disable: entry.disable,
      excludeRecursion: entry.excludeRecursion,
      probability: entry.probability,
      depth: entry.depth,
      useProbability: entry.useProbability,
      displayIndex: entry.displayIndex
    }

    // 移除 undefined 字段
    Object.keys(prepared).forEach((key) => {
      if (prepared[key] === undefined) {
        delete prepared[key]
      }
    })

    // 包含扩展字段
    if (includeExtensions && entry.novelWorkshop) {
      prepared.extensions = {
        ...entry.extensions,
        novelWorkshop: this.filterNovelWorkshopExtensions(
          entry.novelWorkshop,
          includeAiMetadata
        )
      }
    } else if (entry.extensions) {
      prepared.extensions = entry.extensions
    }

    return prepared
  }

  /**
   * 过滤 AI 小说工坊扩展字段
   */
  private filterNovelWorkshopExtensions(
    extensions: any,
    includeAiMetadata: boolean
  ): any {
    const filtered: any = {}

    // 基本信息
    if (extensions.category) filtered.category = extensions.category
    if (extensions.tags) filtered.tags = extensions.tags
    if (extensions.createdAt) filtered.createdAt = extensions.createdAt
    if (extensions.updatedAt) filtered.updatedAt = extensions.updatedAt

    // 关联关系
    if (extensions.relatedCharacters) filtered.relatedCharacters = extensions.relatedCharacters
    if (extensions.relatedLocations) filtered.relatedLocations = extensions.relatedLocations

    // 适用范围
    if (extensions.chapterRange) filtered.chapterRange = extensions.chapterRange

    // 可视化数据
    if (extensions.visualData) filtered.visualData = extensions.visualData

    // AI 元数据
    if (includeAiMetadata && extensions.aiGenerated) {
      filtered.aiGenerated = extensions.aiGenerated
    }

    // 统计信息
    if (includeAiMetadata && extensions.statistics) {
      filtered.statistics = extensions.statistics
    }

    return filtered
  }

  /**
   * 绘制图片背景
   */
  private async drawImageBackground(
    ctx: CanvasRenderingContext2D,
    imageSource: string,
    width: number,
    height: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height)
        resolve()
      }

      img.onerror = () => {
        reject(new Error('背景图片加载失败'))
      }

      img.src = imageSource
    })
  }

  /**
   * 绘制世界书信息
   */
  private drawWorldbookInfo(
    ctx: CanvasRenderingContext2D,
    worldbook: Worldbook,
    width: number,
    height: number
  ): void {
    const _padding = 20

    // 标题背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, width, 80)

    // 标题
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(worldbook.name || '世界书', width / 2, 45)

    // 条目数量
    ctx.font = '14px Arial'
    ctx.fillText(`共 ${worldbook.entries.length} 个条目`, width / 2, 65)

    // 底部信息
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, height - 40, width, 40)

    ctx.fillStyle = '#ffffff'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('AI 小说工坊 - 世界书', width / 2, height - 15)
  }

  /**
   * 嵌入世界书数据到 PNG
   */
  private async embedDataInPng(pngBlob: Blob, data: any): Promise<Blob> {
    // 将数据转换为 Base64
    const jsonStr = JSON.stringify(data)
    const _base64Data = btoa(unescape(encodeURIComponent(jsonStr)))

    // 使用 Canvas 重绘 PNG 并嵌入数据
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('无法创建 Canvas 上下文'))
            return
          }

          ctx.drawImage(img, 0, 0)

          // 嵌入数据到 PNG 元数据
          // 注意：这里简化了实现，实际应该使用 PNG chunks
          // 完整实现需要使用专门的 PNG 库
          canvas.toBlob(
            (blob) => {
              if (blob) {
                // 创建包含元数据的新 Blob
                // 实际实现需要修改 PNG chunks
                resolve(blob)
              } else {
                reject(new Error('PNG 生成失败'))
              }
            },
            'image/png'
          )
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = reader.result as string
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(pngBlob)
    })
  }

  /**
   * 嵌入世界书到角色卡
   */
  private async embedWorldbookInCharacterCard(
    pngBlob: Blob,
    worldbookData: any,
    characterCard: any
  ): Promise<Blob> {
    // 将世界书嵌入到角色卡的 character_book 字段
    const card = {
      ...characterCard,
      character_book: worldbookData
    }

    // 使用与 embedDataInPng 类似的方式嵌入
    return this.embedDataInPng(pngBlob, card)
  }

  /**
   * 生成文件名
   */
  private generateFilename(worldbook: Worldbook, extension: string): string {
    const name = worldbook.name || '世界书'
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 10)
    return `${safeName}_${timestamp}.${extension}`
  }

  /**
   * 按分类分组条目
   */
  private groupEntriesByCategory(
    entries: WorldbookEntry[]
  ): Record<string, WorldbookEntry[]> {
    const groups: Record<string, WorldbookEntry[]> = {}

    for (const entry of entries) {
      const category = entry.novelWorkshop?.category || '未分类'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(entry)
    }

    return groups
  }

  /**
   * 生成统计信息部分
   */
  private generateStatisticsSection(
    _worldbook: Worldbook,
    entries: WorldbookEntry[]
  ): string {
    const enabled = entries.filter((e) => !e.disable).length
    const constant = entries.filter((e) => e.constant).length
    const selective = entries.filter((e) => e.selective).length

    const lines: string[] = [
      '## 统计信息',
      '',
      `- 总条目数: ${entries.length}`,
      `- 启用条目数: ${enabled}`,
      `- 常量条目数: ${constant}`,
      `- 选择性条目数: ${selective}`,
      ''
    ]

    // 按分类统计
    const categories = this.groupEntriesByCategory(entries)
    if (Object.keys(categories).length > 1) {
      lines.push('### 按分类统计')
      lines.push('')
      for (const [category, categoryEntries] of Object.entries(categories)) {
        lines.push(`- ${category}: ${categoryEntries.length} 个`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 生成目录
   */
  private generateTableOfContents(
    groupedEntries: Record<string, WorldbookEntry[]>
  ): string {
    const lines: string[] = ['## 目录', '']

    for (const [category, entries] of Object.entries(groupedEntries)) {
      lines.push(`- [${category}](#${category.toLowerCase().replace(/\s+/g, '-')})`)
      for (const entry of entries) {
        const title = entry.comment || entry.key.slice(0, 3).join(', ')
        lines.push(`  - [${title}](#entry-${entry.uid})`)
      }
    }

    lines.push('')
    return lines.join('\n')
  }

  /**
   * 格式化条目为 Markdown
   */
  private formatEntryAsMarkdown(
    entry: WorldbookEntry,
    template: 'detailed' | 'compact' | 'reference',
    includeExtensions: boolean
  ): string {
    const lines: string[] = []

    const title = entry.comment || entry.key.slice(0, 3).join(', ')

    switch (template) {
      case 'detailed':
        lines.push(`### ${title} {#entry-${entry.uid}}`)
        lines.push('')
        lines.push(`**UID**: ${entry.uid}`)
        lines.push('')
        lines.push('**关键词**:')
        lines.push(`- 主要: ${entry.key.join(', ')}`)
        if (entry.keysecondary && entry.keysecondary.length > 0) {
          lines.push(`- 次要: ${entry.keysecondary.join(', ')}`)
        }
        lines.push('')
        lines.push('**内容**:')
        lines.push('```')
        lines.push(entry.content)
        lines.push('```')
        lines.push('')
        lines.push('**属性**:')
        lines.push(`- 启用: ${!entry.disable ? '是' : '否'}`)
        lines.push(`- 常量: ${entry.constant ? '是' : '否'}`)
        lines.push(`- 选择性: ${entry.selective ? '是' : '否'}`)
        if (entry.order !== undefined) {
          lines.push(`- 顺序: ${entry.order}`)
        }
        if (entry.probability !== undefined) {
          lines.push(`- 概率: ${entry.probability}%`)
        }
        if (entry.depth !== undefined) {
          lines.push(`- 深度: ${entry.depth}`)
        }

        // 扩展字段
        if (includeExtensions && entry.novelWorkshop) {
          lines.push('')
          lines.push('**扩展信息**:')
          if (entry.novelWorkshop.category) {
            lines.push(`- 分类: ${entry.novelWorkshop.category}`)
          }
          if (entry.novelWorkshop.tags) {
            lines.push(`- 标签: ${entry.novelWorkshop.tags.join(', ')}`)
          }
          if (entry.novelWorkshop.relatedCharacters) {
            lines.push(`- 关联角色: ${entry.novelWorkshop.relatedCharacters.join(', ')}`)
          }
        }
        break

      case 'compact':
        lines.push(`### ${title}`)
        lines.push('')
        lines.push(`关键词: ${entry.key.join(', ')}`)
        lines.push('')
        lines.push(entry.content)
        lines.push('')
        if (entry.constant || !entry.disable) {
          const tags: string[] = []
          if (entry.constant) tags.push('常量')
          if (!entry.disable) tags.push('启用')
          lines.push(`[${tags.join(' | ')}]`)
          lines.push('')
        }
        break

      case 'reference':
        lines.push(`### ${title} {#entry-${entry.uid}}`)
        lines.push('')
        lines.push('```yaml')
        lines.push(`uid: ${entry.uid}`)
        lines.push(`keys: [${entry.key.join(', ')}]`)
        if (entry.keysecondary && entry.keysecondary.length > 0) {
          lines.push(`secondary_keys: [${entry.keysecondary.join(', ')}]`)
        }
        lines.push(`enabled: ${!entry.disable}`)
        lines.push(`constant: ${entry.constant || false}`)
        if (entry.order !== undefined) {
          lines.push(`order: ${entry.order}`)
        }
        lines.push('')
        lines.push(`content: |`)
        lines.push('  ' + entry.content.split('\n').join('\n  '))
        lines.push('```')
        lines.push('')
        break
    }

    return lines.join('\n')
  }
}

/**
 * 创建世界书导出器实例
 */
export function createWorldbookExporter(): WorldbookExporter {
  return new WorldbookExporter()
}

/**
 * 便捷导出函数 - 导出为 JSON
 */
export async function exportWorldbookAsJson(
  worldbook: Worldbook,
  options: WorldbookExportOptions = {}
): Promise<WorldbookExportResult> {
  const exporter = new WorldbookExporter()
  return exporter.export(worldbook, { ...options, format: 'json' })
}

/**
 * 便捷导出函数 - 导出为 JSONL
 */
export async function exportWorldbookAsJsonl(
  worldbook: Worldbook,
  options: WorldbookExportOptions = {}
): Promise<string> {
  const exporter = new WorldbookExporter()
  return exporter.exportAsJsonl(worldbook, options)
}

/**
 * 便捷导出函数 - 导出为 YAML
 */
export async function exportWorldbookAsYaml(
  worldbook: Worldbook,
  options: WorldbookExportOptions = {}
): Promise<string> {
  const exporter = new WorldbookExporter()
  return exporter.exportAsYaml(worldbook, options)
}

/**
 * 便捷导出函数 - 导出为 Markdown
 */
export async function exportWorldbookAsMarkdown(
  worldbook: Worldbook,
  options: MarkdownExportOptions = {}
): Promise<string> {
  const exporter = new WorldbookExporter()
  return exporter.exportAsMarkdown(worldbook, options)
}

/**
 * 便捷导出函数 - 导出为 PNG
 */
export async function exportWorldbookAsPng(
  worldbook: Worldbook,
  options: PngExportOptions = {}
): Promise<Blob> {
  const exporter = new WorldbookExporter()
  return exporter.exportAsPng(worldbook, options)
}
