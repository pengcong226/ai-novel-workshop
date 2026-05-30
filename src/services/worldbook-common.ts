/**
 * 世界书公共工具函数
 *
 * 从 worldbook-exporter 和 worldbook-png-writer 中提取的共享逻辑，
 * 包含 prepareEntry、filterNovelWorkshopExtensions 和 prepareWorldbookData。
 *
 * @module services/worldbook-common
 */

import type { Worldbook, WorldbookEntry, NovelWorkshopWorldbookExtensions } from '@/types/worldbook'

/**
 * 条目准备选项
 */
export interface PrepareEntryOptions {
  includeExtensions?: boolean
  includeAiMetadata?: boolean
}

/**
 * 世界书数据准备选项
 */
export interface PrepareWorldbookDataOptions {
  includeExtensions?: boolean
  includeAiMetadata?: boolean
  includeStatistics?: boolean
}

/**
 * 准备单个条目
 *
 * 将 WorldbookEntry 转换为可导出的标准格式，移除 undefined 字段，
 * 并根据选项决定是否包含扩展字段。
 *
 * @param entry 世界书条目
 * @param options 选项
 * @returns 清理后的条目数据
 */
export function prepareEntry(
  entry: WorldbookEntry,
  options: PrepareEntryOptions = {}
): Record<string, unknown> {
  const { includeExtensions = false, includeAiMetadata = false } = options

  // SillyTavern 标准字段
  const prepared: Record<string, unknown> = {
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
  for (const key of Object.keys(prepared)) {
    if (prepared[key] === undefined) {
      delete prepared[key]
    }
  }

  // 包含扩展字段
  if (includeExtensions && entry.novelWorkshop) {
    prepared.extensions = {
      ...entry.extensions,
      novelWorkshop: filterNovelWorkshopExtensions(
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
 *
 * 从 novelWorkshop 扩展中仅保留有效字段，根据选项决定是否包含 AI 元数据。
 *
 * @param extensions 扩展字段
 * @param includeAiMetadata 是否包含 AI 元数据
 * @returns 过滤后的扩展字段
 */
export function filterNovelWorkshopExtensions(
  extensions: NovelWorkshopWorldbookExtensions,
  includeAiMetadata: boolean
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}

  // 基本信息
  if (extensions.category) filtered.category = extensions.category
  if (extensions.tags) filtered.tags = extensions.tags
  if (extensions.createdAt) filtered.createdAt = extensions.createdAt
  if (extensions.updatedAt) filtered.updatedAt = extensions.updatedAt

  // 关联关系
  if (extensions.relatedCharacters) {
    filtered.relatedCharacters = extensions.relatedCharacters
  }
  if (extensions.relatedLocations) {
    filtered.relatedLocations = extensions.relatedLocations
  }

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
 * 准备世界书数据
 *
 * 将 Worldbook 转换为可导出的标准格式，包括条目处理和元数据附加。
 *
 * @param worldbook 世界书数据
 * @param options 选项
 * @returns 清理后的世界书数据
 */
export function prepareWorldbookData(
  worldbook: Worldbook,
  options: PrepareWorldbookDataOptions = {}
): Record<string, unknown> {
  const {
    includeExtensions = false,
    includeAiMetadata = false,
    includeStatistics = false
  } = options

  const entries = worldbook.entries.map((entry) =>
    prepareEntry(entry, { includeExtensions, includeAiMetadata })
  )

  const data: Record<string, unknown> = {
    entries,
    name: worldbook.name
  }

  // 添加元数据
  if (worldbook.metadata) {
    if (worldbook.metadata.description) {
      data.description = worldbook.metadata.description
    }
    if (worldbook.metadata.scan_depth !== undefined) {
      data.scan_depth = worldbook.metadata.scan_depth
    }
    if (worldbook.metadata.token_budget !== undefined) {
      data.token_budget = worldbook.metadata.token_budget
    }
    if (worldbook.metadata.recursive_scan_depth !== undefined) {
      data.recursive_scan_depth = worldbook.metadata.recursive_scan_depth
    }

    if (includeStatistics && worldbook.metadata.totalEntries) {
      data.total_entries = worldbook.metadata.totalEntries
    }
  }

  return data
}
