/**
 * 世界书导入服务
 *
 * 支持 PNG/JSON/JSONL 格式的世界书导入
 * 复用 tavern-parser 的解析能力
 */

import { v4 as uuidv4 } from 'uuid'
import { parsePngCard } from './png-parser'
import { getLogger } from '@/utils/logger'
import type {
  Worldbook,
  WorldbookEntry,
  WorldbookImportOptions,
  WorldbookImportResult,
  WorldbookMergeOptions
} from '@/types/worldbook'

/**
 * Tavern Parser 解析结果类型
 */
interface TavernParserResult {
  kind: 'character' | 'worldbook' | 'unknown'
  format: string
  data: {
    entries?: Array<{
      uid?: string
      keys?: string[]
      secondary_keys?: string[]
      content?: string
      enabled?: boolean
      insertion_order?: number
      extensions?: Record<string, unknown>
      [key: string]: unknown
    }>
    name?: string
    description?: string
    scan_depth?: number
    token_budget?: number
    recursive_scanning?: boolean
  }
  raw: Record<string, unknown>
}

const logger = getLogger('worldbook-importer')

function getEntryKeys(entry: WorldbookEntry): string[] {
  return entry.keys?.length ? entry.keys : entry.key || []
}

function getDuplicateSignature(entry: WorldbookEntry): string {
  const keys = getEntryKeys(entry)
    .map(key => key.trim().toLowerCase())
    .filter(Boolean)
    .sort()

  if (keys.length > 0) {
    return `keys:${keys.join('|')}`
  }

  return `fallback:${(entry.name || entry.title || entry.comment || '').trim().toLowerCase()}|${entry.content.trim().toLowerCase()}`
}

function mergeWorldbookEntries(
  existing: WorldbookEntry,
  incoming: WorldbookEntry,
  options: WorldbookMergeOptions
): WorldbookEntry {
  if (options.mergeFunction) {
    return options.mergeFunction(existing, incoming)
  }

  const mergedKeys = [...new Set([...getEntryKeys(existing), ...getEntryKeys(incoming)])]
  const mergedSecondaryKeys = [
    ...new Set([
      ...(existing.secondary_keys || []),
      ...(existing.keysecondary || []),
      ...(incoming.secondary_keys || []),
      ...(incoming.keysecondary || [])
    ])
  ]
  const content = existing.content.length >= incoming.content.length ? existing.content : incoming.content

  return {
    ...existing,
    key: mergedKeys,
    keys: mergedKeys,
    keysecondary: mergedSecondaryKeys,
    secondary_keys: mergedSecondaryKeys,
    content,
    enabled: existing.enabled || incoming.enabled,
    disable: existing.disable && incoming.disable,
    insertion_order: Math.min(existing.insertion_order || 0, incoming.insertion_order || 0),
    order: Math.min(existing.order || 0, incoming.order || 0),
    type: existing.type || incoming.type,
    category: existing.category || incoming.category,
    name: existing.name || incoming.name,
    title: existing.title || incoming.title,
    comment: [existing.comment, incoming.comment].filter(Boolean).join('\n') || undefined,
    updated_at: options.updateTimestamps ? Date.now() : existing.updated_at,
    extensions: {
      ...incoming.extensions,
      ...existing.extensions
    }
  }
}

function getNextWorldbookUid(entries: WorldbookEntry[]): number {
  return Math.max(0, ...entries.map(entry => Number.isFinite(entry.uid) ? entry.uid : 0)) + 1
}

function renameWorldbookEntry(entry: WorldbookEntry, uid: number, suffix: number): WorldbookEntry {
  const label = `副本 ${suffix}`
  return {
    ...entry,
    uid,
    name: entry.name ? `${entry.name} (${label})` : entry.name,
    title: entry.title ? `${entry.title} (${label})` : entry.title,
    comment: entry.comment ? `${entry.comment} (${label})` : label
  }
}

function resolveMergedEntries(
  entries: WorldbookEntry[],
  options: WorldbookMergeOptions,
  stats: WorldbookImportResult['stats']
): WorldbookEntry[] {
  const strategy = options.conflictResolution || 'keep_both'
  if (strategy === 'keep_both') return entries

  const resolved: WorldbookEntry[] = []
  const seen = new Map<string, number>()
  let nextUid = getNextWorldbookUid(entries)

  for (const entry of entries) {
    const signature = getDuplicateSignature(entry)
    const existingIndex = seen.get(signature)

    if (existingIndex === undefined) {
      seen.set(signature, resolved.length)
      resolved.push(entry)
      continue
    }

    if (stats) stats.duplicates++

    if (strategy === 'skip') {
      if (stats) stats.skipped++
      continue
    }

    if (strategy === 'overwrite') {
      resolved[existingIndex] = entry
      continue
    }

    if (strategy === 'merge') {
      resolved[existingIndex] = mergeWorldbookEntries(resolved[existingIndex], entry, options)
      continue
    }

    const renamed = renameWorldbookEntry(entry, nextUid++, stats?.duplicates || resolved.length + 1)
    resolved.push(renamed)
    seen.set(getDuplicateSignature(renamed), resolved.length - 1)
  }

  return resolved
}

/**
 * 世界书导入器
 */
export class WorldbookImporter {
  /**
   * 导入世界书
   *
   * @param source 文件对象或文件路径
   * @param options 导入选项
   * @returns 导入结果
   */
  async importWorldbook(
    source: File | string,
    options: WorldbookImportOptions = {}
  ): Promise<WorldbookImportResult> {
    const {
      autoGenerateIds = true,
      mergeDuplicates = false,
      inferCategories = true,
      defaultCategory = '未分类',
      enableAllEntries = false,
      filter,
      transform,
      onProgress
    } = options

    const stats = {
      total: 0,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      invalid: 0,
      categories: 0,
      errors: 0
    }

    const errors: any[] = []
    const warnings: any[] = []
    const idMapping = new Map<string, string>()
    const categoryMapping = new Map<string, string[]>()

    try {
      onProgress?.(0, 100, '正在解析文件...')

      // 解析文件
      let worldbook: Worldbook

      if (typeof source === 'string') {
        // 文件路径
        worldbook = await this.parseFromPath(source, onProgress)
      } else {
        // File 对象
        worldbook = await this.parseFile(source, onProgress)
      }

      onProgress?.(40, 100, '正在处理条目...')

      stats.total = worldbook.entries?.length || 0

      // 处理条目
      const processedEntries: WorldbookEntry[] = []
      const seenKeys = new Map<string, WorldbookEntry>()

      for (let i = 0; i < worldbook.entries.length; i++) {
        const entry = worldbook.entries[i]
        const progress = 40 + (i / worldbook.entries.length) * 40
        onProgress?.(progress, 100, `正在处理条目 ${i + 1}/${worldbook.entries.length}...`)

        try {
          // 过滤
          if (filter && !filter(entry)) {
            stats.skipped++
            continue
          }

          // 重复检测（基于关键词）
          const keySignature = (entry.keys || []).sort().join(',')
          if (mergeDuplicates && seenKeys.has(keySignature)) {
            const existing = seenKeys.get(keySignature)!
            const merged = this.mergeEntries(existing, entry)
            const idx = processedEntries.findIndex(e => e === existing)
            if (idx >= 0) {
              processedEntries[idx] = merged
              seenKeys.set(keySignature, merged)
            }
            stats.duplicates++
            continue
          }

          // ID处理
          if (autoGenerateIds || !entry.uid) {
            const oldId = entry.uid
            const newId = uuidv4()
            if (oldId) {
              idMapping.set(String(oldId), newId)
            }
            entry.uid = newId as any
          }

          // 分类推断
          if (inferCategories && !entry.category) {
            entry.category = this.inferCategory(entry)
          }

          if (!entry.category) {
            entry.category = defaultCategory
          }

          // 更新分类映射
          if (entry.category) {
            const entries = categoryMapping.get(entry.category) || []
            entries.push(String(entry.uid!))
            categoryMapping.set(entry.category, entries)
          }

          // 启用条目
          if (enableAllEntries) {
            entry.enabled = true
          }

          // 转换
          if (transform) {
            Object.assign(entry, transform(entry))
          }

          // 验证
          const validation = this.validateEntry(entry)
          if (!validation.valid) {
            errors.push({
              type: 'validation',
              message: validation.errors.join(', '),
              index: processedEntries.length + stats.errors
            })
            stats.errors++
            continue
          }

          processedEntries.push(entry)
          seenKeys.set(keySignature, entry)
          stats.imported++
        } catch (error) {
          errors.push({
            type: 'unknown',
            message: error instanceof Error ? error.message : String(error),
            index: processedEntries.length + stats.errors
          })
          stats.errors++
        }
      }

      onProgress?.(90, 100, '正在生成结果...')

      const result: WorldbookImportResult = {
        success: true,
        importedCount: stats.imported,
        skippedCount: stats.skipped,
        worldbook: {
          entries: processedEntries,
          name: worldbook.name,
          description: worldbook.description,
          scan_depth: worldbook.scan_depth,
          token_budget: worldbook.token_budget,
          recursive_scanning: worldbook.recursive_scanning,
          extensions: worldbook.extensions
        },
        stats,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      }

      onProgress?.(100, 100, '导入完成')

      return result
    } catch (error) {
      errors.push({
        type: 'unknown',
        message: `导入失败: ${error instanceof Error ? error.message : String(error)}`
      })

      return {
        success: false,
        importedCount: stats.imported,
        skippedCount: stats.skipped,
        worldbook: { entries: [] },
        stats,
        errors
      }
    }
  }

  /**
   * 解析文件
   */
  private async parseFile(
    file: File,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<Worldbook> {
    const extension = file.name.split('.').pop()?.toLowerCase()

    if (extension === 'png') {
      onProgress?.(10, 100, '正在解析 PNG 文件...')
      return await this.parsePng(file)
    } else if (extension === 'json') {
      onProgress?.(10, 100, '正在解析 JSON 文件...')
      return await this.parseJson(file)
    } else if (extension === 'jsonl') {
      onProgress?.(10, 100, '正在解析 JSONL 文件...')
      return await this.parseJsonl(file)
    }

    throw new Error(`不支持的文件格式: ${extension}`)
  }

  /**
   * 从路径解析（Node.js 环境）
   */
  private async parseFromPath(
    filePath: string,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<Worldbook> {
    const extension = filePath.split('.').pop()?.toLowerCase()

    // 动态导入 fs
    const fs = await import('fs/promises')

    if (extension === 'png') {
      onProgress?.(10, 100, '正在解析 PNG 文件...')
      const buffer = await fs.readFile(filePath)
      return await this.parsePng(buffer)
    } else if (extension === 'json') {
      onProgress?.(10, 100, '正在解析 JSON 文件...')
      const content = await fs.readFile(filePath, 'utf-8')
      return this.parseJsonContent(content)
    } else if (extension === 'jsonl') {
      onProgress?.(10, 100, '正在解析 JSONL 文件...')
      const content = await fs.readFile(filePath, 'utf-8')
      return this.parseJsonlContent(content)
    }

    throw new Error(`不支持的文件格式: ${extension}`)
  }

  /**
   * 解析 PNG 文件（嵌入世界书数据）
   */
  private async parsePng(source: File | Buffer): Promise<Worldbook> {
    try {
      let input: Buffer | ArrayBuffer

      if (source instanceof File) {
        // File 对象转 ArrayBuffer
        input = await source.arrayBuffer()
      } else {
        input = source
      }

      const parsed = await this.parsePngCard(input)

      // 如果是角色卡，尝试提取其中的世界书数据
      if (parsed.kind === 'character') {
        // Character Card V2/V3 格式可能包含 character_book
        if ((parsed.data as any)?.character_book) {
          return this.convertToNovelWorkshopFormat({
            kind: 'worldbook',
            format: parsed.format,
            data: (parsed.data as any).character_book,
            raw: parsed.raw
          })
        }

        // 如果角色卡没有世界书，返回空世界书而不是报错
        // 这样可以让统一导入器继续处理角色卡的其他数据
        logger.info('角色卡不包含世界书数据')
        return {
          name: parsed.data?.name || '角色卡',
          description: '从角色卡导入，不包含世界书',
          entries: [],
          metadata: {
            source: 'character_card_v3'
          }
        }
      }

      if (parsed.kind !== 'worldbook') {
        throw new Error(`PNG 文件不是世界书格式，检测到: ${parsed.kind}`)
      }

      return this.convertToNovelWorkshopFormat(parsed)
    } catch (error) {
      throw new Error(`PNG 解析失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 解析 JSON 文件
   */
  private async parseJson(source: File): Promise<Worldbook> {
    const text = await source.text()
    return this.parseJsonContent(text)
  }

  /**
   * 解析 JSON 内容
   */
  private parseJsonContent(text: string): Worldbook {
    try {
      const data = JSON.parse(text)

      // 检测格式
      if (Array.isArray(data.entries)) {
        // 标准世界书格式
        return this.convertToNovelWorkshopFormat({
          kind: 'worldbook',
          format: 'worldbook',
          data: data,
          raw: data
        })
      } else if (Array.isArray(data)) {
        // 直接是条目数组
        return this.convertToNovelWorkshopFormat({
          kind: 'worldbook',
          format: 'worldbook',
          data: { entries: data },
          raw: {}
        })
      }

      throw new Error('无法识别的 JSON 格式，期望包含 entries 字段或条目数组')
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`JSON 解析失败: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * 解析 JSONL 文件
   */
  private async parseJsonl(source: File): Promise<Worldbook> {
    const text = await source.text()
    return this.parseJsonlContent(text)
  }

  /**
   * 解析 JSONL 内容
   */
  private parseJsonlContent(text: string): Worldbook {
    const entries: WorldbookEntry[] = []
    const lines = text.split('\n').filter(line => line.trim())

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i])
        entries.push(entry)
      } catch (error) {
        logger.warn(`JSONL 第 ${i + 1} 行解析失败:`, error)
      }
    }

    return this.convertToNovelWorkshopFormat({
      kind: 'worldbook',
      format: 'worldbook',
      data: { entries: entries as any },
      raw: { entries }
    })
  }

  /**
   * 转换为小说工坊格式
   * 处理SillyTavern格式的字段映射差异
   */
  private convertToNovelWorkshopFormat(data: TavernParserResult): Worldbook {
    const entries = (data.data.entries || []).map((entry, index) => {
      // SillyTavern格式字段映射
      // 注意：实际数据可能使用 id 而不是 uid
      const rawEntry = entry as any

      return {
        uid: Number(rawEntry.uid ?? rawEntry.id) || Date.now() + Math.floor(Math.random() * 1000),
        key: rawEntry.keys || rawEntry.key || [],
        keys: rawEntry.keys || rawEntry.key || [],
        secondary_keys: rawEntry.secondary_keys || rawEntry.keysecondary || [],
        content: rawEntry.content || '',
        // 注意：实际数据使用 enabled，而不是 disable
        enabled: rawEntry.enabled ?? (rawEntry.disable !== undefined ? !rawEntry.disable : true),
        insertion_order: rawEntry.insertion_order ?? rawEntry.order ?? index,
        extensions: rawEntry.extensions,
        type: this.inferType(entry as any),
        category: this.inferCategory(entry as any),
        name: rawEntry.name || rawEntry.comment || `条目 ${index + 1}`,
        comment: rawEntry.comment,
        position: rawEntry.position as WorldbookEntry['position'],
        depth: rawEntry.depth,
        selective: rawEntry.selective,
        priority: rawEntry.priority,
        group: rawEntry.group,
        group_priority: rawEntry.group_priority,
        scan_depth: rawEntry.scan_depth,
        match_whole_words: rawEntry.match_whole_words,
        case_sensitive: rawEntry.case_sensitive,
        delay_until_recursion: rawEntry.delay_until_recursion,
        prevent_recursion: rawEntry.prevent_recursion,
        created_at: rawEntry.created_at || Date.now(),
        updated_at: rawEntry.updated_at || Date.now(),
        metadata: rawEntry.metadata
      }
    })

    return {
      entries,
      name: data.data.name || '导入的世界书',
      description: data.data.description || '',
      scan_depth: data.data.scan_depth,
      token_budget: data.data.token_budget,
      recursive_scanning: data.data.recursive_scanning,
      extensions: (data.data as any).extensions
    }
  }

  /**
   * 推断条目类型
   */
  private inferType(entry: Partial<WorldbookEntry>): WorldbookEntry['type'] {
    const content = (entry.content || '').toLowerCase()
    const keys = (entry.keys || []).map(k => k.toLowerCase())

    // 基于内容关键词推断
    if (keys.some(k => k.includes('character') || k.includes('角色'))) {
      return 'character'
    }

    if (content.includes('世界') || content.includes('world')) {
      return 'world'
    }

    if (content.includes('lore') || content.includes('传说') || content.includes('历史')) {
      return 'lore'
    }

    return 'custom'
  }

  /**
   * 推断分类
   */
  private inferCategory(entry: Partial<WorldbookEntry>): string {
    const type = entry.type || this.inferType(entry)
    const categoryMap: Record<string, string> = {
      character: '角色',
      world: '世界观',
      lore: '传说',
      custom: '自定义'
    }

    return categoryMap[type || 'custom'] || '未分类'
  }

  /**
   * 合并条目
   */
  private mergeEntries(
    existing: WorldbookEntry,
    incoming: WorldbookEntry,
    options?: WorldbookMergeOptions
  ): WorldbookEntry {
    const mergeFn = options?.mergeFunction || this.defaultMergeFunction

    return mergeFn(existing, incoming)
  }

  /**
   * 默认合并函数
   */
  private defaultMergeFunction(
    existing: WorldbookEntry,
    incoming: WorldbookEntry
  ): WorldbookEntry {
    // 合并关键词
    const mergedKeys = [...new Set([...(existing.keys || []), ...(incoming.keys || [])])]

    // 合并次要关键词
    const mergedSecondaryKeys = [
      ...new Set([
        ...(existing.secondary_keys || []),
        ...(incoming.secondary_keys || [])
      ])
    ]

    // 内容：使用较长的内容
    const mergedContent =
      (existing.content?.length || 0) >= (incoming.content?.length || 0)
        ? existing.content
        : incoming.content

    return {
      uid: existing.uid,
      key: mergedKeys,
      keys: mergedKeys,
      secondary_keys: mergedSecondaryKeys,
      content: mergedContent,
      enabled: existing.enabled || incoming.enabled,
      insertion_order: Math.min(existing.insertion_order || 0, incoming.insertion_order || 0),
      type: existing.type || incoming.type,
      category: existing.category || incoming.category,
      name: existing.name || incoming.name,
      comment: [existing.comment, incoming.comment].filter(Boolean).join('\n') || undefined,
      created_at: existing.created_at,
      updated_at: Date.now(),
      extensions: {
        ...existing.extensions,
        ...incoming.extensions
      }
    }
  }

  /**
   * 验证条目
   */
  private validateEntry(entry: WorldbookEntry): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!entry.keys || entry.keys.length === 0) {
      errors.push('条目缺少关键词')
    }

    if (!entry.content || entry.content.trim().length === 0) {
      errors.push('条目内容为空')
    }

    if ((entry.keys || []).some(key => key.trim().length === 0)) {
      errors.push('存在空关键词')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 从 PNG 文件中提取 chara 或 ccv3 元数据
   * 委托给 png-parser 模块
   */
  private async parsePngCard(input: Buffer | ArrayBuffer): Promise<TavernParserResult> {
    const arrayBuffer = input instanceof ArrayBuffer ? input : new Uint8Array(input).buffer
    const result = await parsePngCard(arrayBuffer)
    return result as TavernParserResult
  }
}


/**
 * 创建世界书导入器实例
 */
export function createWorldbookImporter(): WorldbookImporter {
  return new WorldbookImporter()
}

/**
 * 导入世界书（便捷函数）
 *
 * @param source 文件对象或文件路径
 * @param options 导入选项
 * @returns 导入结果
 */
export async function importWorldbook(
  source: File | string,
  options?: WorldbookImportOptions
): Promise<WorldbookImportResult> {
  const importer = new WorldbookImporter()
  return importer.importWorldbook(source, options)
}

/**
 * 合并多个世界书
 */
export async function mergeWorldbooks(
  sources: Array<File | string>,
  options: WorldbookMergeOptions = {}
): Promise<WorldbookImportResult> {
  const importer = new WorldbookImporter()
  const mergedEntries: WorldbookEntry[] = []
  const allErrors: Array<any> = []
  const stats = {
    total: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    invalid: 0,
    categories: 0,
    errors: 0
  }

  for (let i = 0; i < sources.length; i++) {
    const result = await importer.importWorldbook(sources[i], {
      autoGenerateIds: !options.preserveIds
    })

    mergedEntries.push(...(result.worldbook?.entries || []))
    stats.total += result.stats?.total || 0
    stats.imported += result.stats?.imported || 0
    stats.skipped += result.stats?.skipped || 0
    stats.duplicates += result.stats?.duplicates || 0
    stats.errors += result.stats?.errors || 0

    if (result.errors) {
      allErrors.push(...result.errors)
    }
  }

  const resolvedEntries = resolveMergedEntries(mergedEntries, options, stats)

  return {
    success: true,
    importedCount: stats.imported,
    skippedCount: stats.skipped,
    worldbook: {
      entries: resolvedEntries,
      name: '合并的世界书',
      description: `合并自 ${sources.length} 个源文件`
    },
    stats,
    errors: allErrors.length > 0 ? allErrors : undefined
  }
}

/**
 * 导出世界书
 */
export async function exportWorldbook(
  worldbook: Worldbook,
  format: 'json' | 'jsonl',
  options: { pretty?: boolean; filter?: (entry: WorldbookEntry) => boolean } = {}
): Promise<string> {
  const { pretty = true, filter } = options

  let entries = worldbook.entries
  if (filter) {
    entries = entries.filter(filter)
  }

  if (format === 'json') {
    const data = {
      name: worldbook.name,
      description: worldbook.description,
      entries,
      scan_depth: worldbook.scan_depth,
      token_budget: worldbook.token_budget,
      recursive_scanning: worldbook.recursive_scanning,
      extensions: worldbook.extensions
    }

    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  } else {
    // JSONL
    return entries.map(entry => JSON.stringify(entry)).join('\n')
  }
}
