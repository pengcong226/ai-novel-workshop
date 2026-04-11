/**
 * 知识库管理服务
 * @module services/knowledge-base
 *
 * 提供知识库的导入、导出、搜索、管理功能
 */

import { v4 as uuidv4 } from 'uuid'
import { KnowledgeCategory } from '@/types/knowledge-base'
import type {
  KnowledgeBase,
  KnowledgeEntry,
  KnowledgeImportOptions,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeStatistics
} from '@/types/knowledge-base'
import { getLogger } from '@/utils/logger'

const logger = getLogger('knowledge-base')

/**
 * 知识库管理器
 */
export class KnowledgeBaseManager {
  private knowledgeBases: Map<string, KnowledgeBase> = new Map()

  /**
   * 创建知识库
   */
  createKnowledgeBase(options: {
    name: string
    description?: string
    author?: string
    version?: string
  }): KnowledgeBase {
    const id = uuidv4()
    const kb: KnowledgeBase = {
      id,
      name: options.name,
      description: options.description,
      version: options.version || '1.0.0',
      author: options.author,
      entries: [],
      categories: [],
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        totalEntries: 0,
        enabledEntries: 0,
        totalUsage: 0
      }
    }

    this.knowledgeBases.set(id, kb)
    logger.info('知识库已创建', { id, name: options.name })
    return kb
  }

  /**
   * 导入知识库
   */
  async importKnowledgeBase(
    source: File | string,
    options: KnowledgeImportOptions = {}
  ): Promise<{
    imported: KnowledgeEntry[]
    skipped: string[]
    errors: string[]
    knowledgeBase?: KnowledgeBase
  }> {
    const {
      overwrite = false,
      merge = false,
      validate = true,
      autoCategorize = true,
      extractTags = true,
      defaultCategory = KnowledgeCategory.CUSTOM,
      defaultDisabled = true,
      setAsConstant = true,
      cleanContent = true
    } = options

    const imported: KnowledgeEntry[] = []
    const skipped: string[] = []
    const errors: string[] = []

    try {
      // 解析源数据
      let data: any

      if (typeof source === 'string') {
        data = JSON.parse(source)
      } else {
        const text = await source.text()
        data = JSON.parse(text)
      }

      // 提取条目
      let entries: any[] = []

      if (Array.isArray(data)) {
        entries = data
      } else if (data.entries) {
        if (Array.isArray(data.entries)) {
          entries = data.entries
        } else if (typeof data.entries === 'object') {
          // SillyTavern格式：entries是对象
          entries = Object.values(data.entries)
        }
      }

      if (entries.length === 0) {
        throw new Error('未找到有效的条目数据')
      }

      // 创建知识库
      const kb = this.createKnowledgeBase({
        name: data.name || '导入的知识库',
        description: data.description,
        author: data.author,
        version: data.version
      })

      // 处理每个条目
      for (const entryData of entries) {
        try {
          // 验证必需字段
          if (validate && !entryData.content) {
            if (entryData.comment || entryData.uid) {
              skipped.push(`条目缺少内容: ${entryData.comment || entryData.uid}`)
            }
            continue
          }

          // 清理内容
          let content = entryData.content || ''
          if (cleanContent) {
            content = this.cleanContent(content)
          }

          // 自动分类
          let category = defaultCategory
          if (autoCategorize && entryData.comment) {
            category = this.detectCategory(entryData.comment)
          }

          // 提取标签
          let tags: string[] = entryData.tags || []
          if (extractTags && entryData.comment) {
            tags = this.extractTags(entryData.comment, tags)
          }

          // 构建知识条目
          const entry: KnowledgeEntry = {
            uid: entryData.uid || this.generateUid(),
            key: entryData.key || [],
            keysecondary: entryData.keysecondary || [],
            content,
            comment: entryData.comment || '',
            constant: entryData.constant ?? setAsConstant,
            disable: entryData.disable ?? defaultDisabled,
            selective: entryData.selective ?? false,
            order: entryData.order ?? 0,
            position: entryData.position ?? 0,
            depth: entryData.depth ?? 4,
            probability: entryData.probability,
            useProbability: entryData.useProbability,
            displayIndex: entryData.displayIndex,
            extensions: entryData.extensions,

            // 知识库特有字段
            category,
            tags,
            source: entryData.source,
            author: entryData.author,
            version: entryData.version,
            priority: entryData.priority ?? 0,
            usageCount: entryData.usageCount ?? 0,
            lastUsedAt: entryData.lastUsedAt ? new Date(entryData.lastUsedAt) : undefined,
            metadata: {
              createdAt: new Date(),
              updatedAt: new Date(),
              searchKeywords: this.extractKeywords(content)
            }
          }

          kb.entries.push(entry)
          imported.push(entry)
        } catch (e) {
          const error = `导入条目失败: ${entryData.comment || entryData.uid || '未命名'} - ${e instanceof Error ? e.message : String(e)}`
          errors.push(error)
          logger.error(error, e)
        }
      }

      // 更新元数据
      if (!kb.metadata) kb.metadata = {} as any
      kb.metadata!.totalEntries = kb.entries.length
      kb.metadata!.enabledEntries = kb.entries.filter(e => !e.disable).length
      kb.tags = this.collectTags(kb.entries)

      logger.info('知识库导入完成', {
        knowledgeBaseId: kb.id,
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length
      })

      return { imported, skipped, errors, knowledgeBase: kb }
    } catch (e) {
      const error = `解析知识库失败: ${e instanceof Error ? e.message : String(e)}`
      errors.push(error)
      logger.error(error, e)
      return { imported, skipped, errors }
    }
  }

  /**
   * 搜索知识库
   */
  search(
    knowledgeBaseId: string,
    options: KnowledgeSearchOptions
  ): KnowledgeSearchResult[] {
    const kb = this.knowledgeBases.get(knowledgeBaseId)
    if (!kb) {
      throw new Error(`知识库不存在: ${knowledgeBaseId}`)
    }

    let entries = [...kb.entries]

    // 分类过滤
    if (options.categories && options.categories.length > 0) {
      entries = entries.filter(e => options.categories!.includes(e.category))
    }

    // 标签过滤
    if (options.tags && options.tags.length > 0) {
      entries = entries.filter(e =>
        e.tags.some(tag => options.tags!.includes(tag))
      )
    }

    // 仅启用条目
    if (options.enabledOnly) {
      entries = entries.filter(e => !e.disable)
    }

    // 仅收藏条目
    if (options.favoritesOnly) {
      entries = entries.filter(e => e.isFavorite)
    }

    // 文本搜索
    if (options.query) {
      const results: KnowledgeSearchResult[] = []
      const query = options.query.toLowerCase()
      const scope = options.scope || ['content', 'comment', 'tags']

      for (const entry of entries) {
        const matches: KnowledgeSearchResult['matches'] = []
        let score = 0

        // 搜索内容
        if (scope.includes('content') && entry.content) {
          const index = entry.content.toLowerCase().indexOf(query)
          if (index !== -1) {
            matches.push({
              field: 'content',
              position: index,
              length: query.length,
              snippet: this.getSnippet(entry.content, index, query.length)
            })
            score += 10
          }
        }

        // 搜索注释
        if (scope.includes('comment') && entry.comment) {
          const index = entry.comment.toLowerCase().indexOf(query)
          if (index !== -1) {
            matches.push({
              field: 'comment',
              position: index,
              length: query.length,
              snippet: this.getSnippet(entry.comment, index, query.length)
            })
            score += 5
          }
        }

        // 搜索标签
        if (scope.includes('tags') && entry.tags) {
          const matchedTag = entry.tags.find(tag =>
            tag.toLowerCase().includes(query)
          )
          if (matchedTag) {
            matches.push({
              field: 'tags',
              position: 0,
              length: matchedTag.length,
              snippet: matchedTag
            })
            score += 3
          }
        }

        // 搜索来源
        if (scope.includes('source') && entry.source) {
          const index = entry.source.toLowerCase().indexOf(query)
          if (index !== -1) {
            matches.push({
              field: 'source',
              position: index,
              length: query.length,
              snippet: this.getSnippet(entry.source, index, query.length)
            })
            score += 2
          }
        }

        if (matches.length > 0) {
          results.push({ entry, score, matches })
        }
      }

      // 排序
      const sortBy = options.sortBy || 'relevance'
      const sortOrder = options.sortOrder || 'desc'

      results.sort((a, b) => {
        let comparison = 0

        switch (sortBy) {
          case 'relevance':
            comparison = a.score - b.score
            break
          case 'createdAt':
            comparison = (a.entry.metadata?.createdAt?.getTime() || 0) -
                        (b.entry.metadata?.createdAt?.getTime() || 0)
            break
          case 'updatedAt':
            comparison = (a.entry.metadata?.updatedAt?.getTime() || 0) -
                        (b.entry.metadata?.updatedAt?.getTime() || 0)
            break
          case 'usageCount':
            comparison = (a.entry.usageCount || 0) - (b.entry.usageCount || 0)
            break
          case 'priority':
            comparison = (a.entry.priority || 0) - (b.entry.priority || 0)
            break
        }

        return sortOrder === 'desc' ? -comparison : comparison
      })

      // 分页
      const offset = options.offset || 0
      const limit = options.limit || 50

      return results.slice(offset, offset + limit)
    }

    // 无搜索查询，返回所有条目
    return entries.map(entry => ({
      entry,
      score: 0,
      matches: []
    }))
  }

  /**
   * 获取统计信息
   */
  getStatistics(knowledgeBaseId: string): KnowledgeStatistics {
    const kb = this.knowledgeBases.get(knowledgeBaseId)
    if (!kb) {
      throw new Error(`知识库不存在: ${knowledgeBaseId}`)
    }

    const entries = kb.entries

    // 各分类条目数
    const entriesByCategory: Record<KnowledgeCategory, number> = {} as any
    Object.values(KnowledgeCategory).forEach(cat => {
      entriesByCategory[cat] = entries.filter(e => e.category === cat).length
    })

    // 各标签条目数
    const entriesByTag: Record<string, number> = {}
    entries.forEach(e => {
      e.tags.forEach(tag => {
        entriesByTag[tag] = (entriesByTag[tag] || 0) + 1
      })
    })

    // 总使用次数
    const totalUsage = entries.reduce((sum, e) => sum + (e.usageCount || 0), 0)

    // 最常用条目
    const mostUsedEntries = [...entries]
      .filter(e => e.usageCount && e.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 10)
      .map(e => ({
        uid: e.uid,
        comment: e.comment || '',
        usageCount: e.usageCount || 0
      }))

    // 最近更新条目
    const recentlyUpdated = [...entries]
      .filter(e => e.metadata?.updatedAt)
      .sort((a, b) =>
        (b.metadata?.updatedAt?.getTime() || 0) -
        (a.metadata?.updatedAt?.getTime() || 0)
      )
      .slice(0, 10)
      .map(e => ({
        uid: e.uid,
        comment: e.comment || '',
        updatedAt: e.metadata!.updatedAt!
      }))

    // 即将过期条目
    const now = new Date()
    const expiringEntries = entries
      .filter(e => e.expiresAt && e.expiresAt > now)
      .sort((a, b) =>
        (a.expiresAt!.getTime() || 0) -
        (b.expiresAt!.getTime() || 0)
      )
      .slice(0, 10)
      .map(e => ({
        uid: e.uid,
        comment: e.comment || '',
        expiresAt: e.expiresAt!
      }))

    return {
      totalEntries: entries.length,
      enabledEntries: entries.filter(e => !e.disable).length,
      disabledEntries: entries.filter(e => e.disable).length,
      constantEntries: entries.filter(e => e.constant).length,
      entriesByCategory,
      entriesByTag,
      totalUsage,
      averageUsage: entries.length > 0 ? totalUsage / entries.length : 0,
      mostUsedEntries,
      recentlyUpdated,
      expiringEntries
    }
  }

  // ============ 私有辅助方法 ============

  /**
   * 清理内容
   */
  private cleanContent(content: string): string {
    // 移除多余的空白
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  /**
   * 检测分类
   */
  private detectCategory(comment: string): KnowledgeCategory {
    const lower = comment.toLowerCase()

    if (lower.includes('api') || lower.includes('函数') || lower.includes('方法')) {
      return KnowledgeCategory.API_DOCUMENTATION
    }
    if (lower.includes('教程') || lower.includes('指南') || lower.includes('如何')) {
      return KnowledgeCategory.TUTORIAL
    }
    if (lower.includes('最佳') || lower.includes('建议') || lower.includes('优化')) {
      return KnowledgeCategory.BEST_PRACTICE
    }
    if (lower.includes('问题') || lower.includes('faq') || lower.includes('错误')) {
      return KnowledgeCategory.FAQ
    }
    if (lower.includes('示例') || lower.includes('代码') || lower.includes('例子')) {
      return KnowledgeCategory.CODE_EXAMPLE
    }
    if (lower.includes('提示') || lower.includes('prompt') || lower.includes('系统')) {
      return KnowledgeCategory.SYSTEM_PROMPT
    }
    if (lower.includes('工具') || lower.includes('插件') || lower.includes('扩展')) {
      return KnowledgeCategory.TOOL_DOCUMENTATION
    }

    return KnowledgeCategory.CUSTOM
  }

  /**
   * 提取标签
   */
  private extractTags(comment: string, existingTags: string[]): string[] {
    const tags = new Set(existingTags)

    // 从注释中提取标签（如 "19_角色卡管理" -> "角色卡管理"）
    const parts = comment.split('_')
    if (parts.length > 1) {
      tags.add(parts.slice(1).join('_').trim())
    }

    // 提取关键词作为标签
    const keywords = comment.match(/[\u4e00-\u9fa5]{2,}/g) || []
    keywords.forEach(keyword => tags.add(keyword))

    return Array.from(tags)
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    const keywords = new Set<string>()

    // 提取中文词汇
    const chineseWords = content.match(/[\u4e00-\u9fa5]{2,6}/g) || []
    chineseWords.forEach(word => keywords.add(word))

    // 提取英文单词
    const englishWords = content.match(/[a-zA-Z]{3,}/g) || []
    englishWords.forEach(word => keywords.add(word.toLowerCase()))

    return Array.from(keywords).slice(0, 50)
  }

  /**
   * 获取文本片段
   */
  private getSnippet(text: string, position: number, length: number): string {
    const start = Math.max(0, position - 30)
    const end = Math.min(text.length, position + length + 30)

    let snippet = text.substring(start, end)

    if (start > 0) {
      snippet = '...' + snippet
    }
    if (end < text.length) {
      snippet = snippet + '...'
    }

    return snippet
  }

  /**
   * 收集所有标签
   */
  private collectTags(entries: KnowledgeEntry[]): string[] {
    const tags = new Set<string>()
    entries.forEach(e => e.tags.forEach(tag => tags.add(tag)))
    return Array.from(tags).sort()
  }

  /**
   * 生成UID
   */
  private generateUid(): number {
    return Date.now() % 1000000
  }

  /**
   * 获取知识库
   */
  getKnowledgeBase(id: string): KnowledgeBase | undefined {
    return this.knowledgeBases.get(id)
  }

  /**
   * 获取所有知识库
   */
  getAllKnowledgeBases(): KnowledgeBase[] {
    return Array.from(this.knowledgeBases.values())
  }

  /**
   * 删除知识库
   */
  deleteKnowledgeBase(id: string): boolean {
    const deleted = this.knowledgeBases.delete(id)
    if (deleted) {
      logger.info('知识库已删除', { id })
    }
    return deleted
  }
}

/**
 * 创建知识库管理器实例
 */
export function createKnowledgeBaseManager(): KnowledgeBaseManager {
  return new KnowledgeBaseManager()
}
