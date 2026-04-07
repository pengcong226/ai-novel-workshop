/**
 * 世界书 AI 辅助服务
 *
 * 使用 AI 辅助生成、优化和管理世界书条目
 */

import type { Worldbook, WorldbookEntry } from '@/types/worldbook'
import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'

const logger = getLogger('worldbook:ai')

/**
 * AI 生成选项
 */
export interface AIGenerateOptions {
  /** 生成类型 */
  type: 'entry' | 'optimize' | 'keywords' | 'merge' | 'categorize'

  /** 上下文 */
  context?: string

  /** 参考文本 */
  referenceText?: string

  /** 现有条目 */
  existingEntries?: WorldbookEntry[]

  /** 提示词 */
  prompt?: string

  /** 模型 */
  model?: string

  /** 温度 */
  temperature?: number

  /** 最大 token 数 */
  maxTokens?: number
}

/**
 * AI 生成的条目建议
 */
export interface AIEntrySuggestion {
  /** 建议的关键词 */
  keys: string[]

  /** 建议的内容 */
  content: string

  /** 建议的类型 */
  category?: string

  /** 置信度 (0-1) */
  confidence: number

  /** 推理说明 */
  reasoning?: string

  /** 相关章节 */
  relatedChapters?: number[]

  /** 标签 */
  tags?: string[]
}

/**
 * AI 关键词建议
 */
export interface AIKeywordSuggestion {
  /** 关键词 */
  keyword: string

  /** 重要性 (0-1) */
  importance: number

  /** 类型 */
  type: 'primary' | 'secondary'

  /** 推理 */
  reasoning?: string
}

/**
 * AI 分析结果
 */
export interface AIAnalysisResult {
  /** 条目重复度 */
  duplicationScore: number

  /** 内容质量 */
  qualityScore: number

  /** 覆盖度 */
  coverageScore: number

  /** 建议 */
  suggestions: string[]

  /** 问题条目 */
  problematicEntries: Array<{
    entry: WorldbookEntry
    issue: string
    suggestion: string
  }>
}

/**
 * 世界书 AI 助手
 */
export class WorldbookAIAssistant {
  private model: string

  constructor(model?: string) {
    this.model = model || 'gpt-4-turbo'
  }

  /**
   * 设置模型
   */
  setModel(model: string): void {
    this.model = model
    logger.info('AI 模型已设置', { model })
  }

  /**
   * 生成条目建议
   */
  async generateEntrySuggestion(
    options: AIGenerateOptions
  ): Promise<AIEntrySuggestion[]> {
    const {
      context,
      referenceText,
      existingEntries,
      prompt,
      temperature = 0.7,
      maxTokens = 1000
    } = options

    logger.info('开始生成条目建议', {
      contextLength: context?.length || 0,
      referenceTextLength: referenceText?.length || 0,
      existingEntriesCount: existingEntries?.length || 0
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const promptText = `
参考已有设定数量: ${existingEntries?.length || 0}
背景上下文:
${context || '无'}
参考文本:
${referenceText || '无'}
用户要求:
${prompt || '无附加要求'}

请基于以上内容生成一条高质量的世界书设定条目。
使用 JSON 格式返回: {"keys": ["关键词1", "关键词2"], "category": "设定的类别如角色/地点", "content": "具体设定内容", "confidence": 0.95, "reasoning": "建议原因", "tags": ["标签1"]}`

    try {
      const dbResponse = await aiStore.chat([
        { role: 'system', content: '你是专业的小说设定和世界观梳理专家，精通总结和条目提炼。' },
        { role: 'user', content: promptText }
      ], {
        type: 'worldbuilding',
        complexity: 'low',
        priority: 'balanced'
      }, {
        model: this.model,
        temperature,
        maxTokens,
        response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<AIEntrySuggestion>(dbResponse.content)
      if (parsed) {
        logger.info('条目建议生成完成', { count: 1 })
        return [parsed]
      }
    } catch (e: any) {
      logger.error('AI 调用失败:', e.message)
    }

    return [{
      keys: ['默认关键词'],
      content: 'AI未能生成有效内容。',
      category: 'lore',
      confidence: 0,
      reasoning: '请求失败',
      tags: []
    }]
  }

  /**
   * 生成关键词建议
   */
  async generateKeywordSuggestions(
    entry: WorldbookEntry,
    context?: string
  ): Promise<AIKeywordSuggestion[]> {
    logger.info('开始生成关键词建议', {
      entryId: entry.uid,
      contentLength: entry.content.length
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const promptText = `
请为以下设定的条目内容生成 2-5 个用于检索的关键词（包括主关键词和次级关键词）。
条目内容:
${entry.content}
${context ? `上下文参考:\n${context}` : ''}

输出 JSON 格式: 
{ "suggestions": [ { "keyword": "关键词", "importance": 0.9, "type": "primary", "reasoning": "为什么建议" } ] }`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.7, maxTokens: 800, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ suggestions: AIKeywordSuggestion[] }>(dbResponse.content)
      if (parsed?.suggestions?.length) {
        logger.info('关键词建议生成完成', { count: parsed.suggestions.length })
        return parsed.suggestions
      }
    } catch (e: any) {
      logger.error('关键词建议生成失败:', e.message)
    }

    return [{
      keyword: '请求失败',
      importance: 0,
      type: 'primary',
      reasoning: 'API 调用失败'
    }]
  }

  /**
   * 优化条目
   */
  async optimizeEntry(
    entry: WorldbookEntry,
    options?: { improveClarity?: boolean; addKeywords?: boolean }
  ): Promise<WorldbookEntry> {
    logger.info('开始优化条目', {
      entryId: entry.uid,
      options
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const promptText = `
请优化以下设定条目的内容。保持设定核心不变，使语言更精炼、描述更生动。
当前内容:
${entry.content}
当前关键词: ${entry.key?.join(', ')}

要求: ${options?.improveClarity ? '提升表述清晰度和逻辑。' : ''} ${options?.addKeywords ? '如果必要，补充合适的关键词。' : ''}
输出 JSON 格式: 
{ "content": "优化后的内容", "keys": ["优化后的关键词1"], "comment": "优化的建议/解释" }`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.7, maxTokens: 1500, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ content: string; keys: string[]; comment: string }>(dbResponse.content)
      if (parsed) {
        logger.info('条目优化完成', { entryId: entry.uid })
        return {
          ...entry,
          content: parsed.content || entry.content,
          key: parsed.keys || entry.key,
          comment: (entry.comment || '') + '\n[AI 优化建议: ' + (parsed.comment || '') + ']'
        }
      }
    } catch (e: any) {
      logger.error('优化条目失败:', e.message)
    }

    return entry
  }

  /**
   * 合并相似条目
   */
  async mergeSimilarEntries(
    entries: WorldbookEntry[]
  ): Promise<Array<{ merged: WorldbookEntry; sources: WorldbookEntry[] }>> {
    logger.info('开始合并相似条目', { count: entries.length })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const promptText = `
请分析以下世界书设定的条目，找出意思相近或重复的条目，并将它们合并为更完善的单一条目。
条目列表:
${JSON.stringify(entries.map(e => ({ uid: e.uid, keys: e.key, content: e.content })), null, 2)}

输出要求: JSON 格式
{ "merges": [ { "sources": [原条目uid数组], "mergedContent": "合并后的完整内容", "mergedKeys": ["合并后的所有相关关键词"] } ] }`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 2000, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ merges: Array<{ sources: number[]; mergedContent: string; mergedKeys: string[] }> }>(dbResponse.content)
      if (parsed?.merges?.length) {
        const results: Array<{ merged: WorldbookEntry; sources: WorldbookEntry[] }> = []
        for (const merge of parsed.merges) {
          const sourceEntries = merge.sources.map(id => entries.find(e => e.uid === id)).filter(Boolean) as WorldbookEntry[]
          if (sourceEntries.length > 1) {
            results.push({
              merged: {
                ...sourceEntries[0],
                uid: Date.now(), // 临时生成新uid
                content: merge.mergedContent,
                key: merge.mergedKeys,
                comment: '[AI 合并条目]'
              },
              sources: sourceEntries
            })
          }
        }
        logger.info('相似条目合并完成', { mergeCount: results.length })
        return results
      }
    } catch (e: any) {
      logger.error('合并相似条目失败:', e.message)
    }

    return []
  }

  /**
   * 分类条目
   */
  async categorizeEntries(
    entries: WorldbookEntry[]
  ): Promise<Map<string, WorldbookEntry[]>> {
    logger.info('开始分类条目', { count: entries.length })

    const categories = new Map<string, WorldbookEntry[]>()
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    // 若数据量太大，仅抽取 keys / content 简略版给AI
    const entriesData = entries.map(e => ({ uid: e.uid, keys: e.key, content: e.content.substring(0, 100) }))
    const promptText = `
请分析以下世界书设定的条目，根据内容将它们分类。
条目列表:
${JSON.stringify(entriesData, null, 2)}

输出 JSON 格式: 
{ "categories": [ { "categoryName": "类别如:人物/地点/势力", "entryUids": [属于该类的条目uid数组] } ] }`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 2000, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ categories: Array<{ categoryName: string; entryUids: number[] }> }>(dbResponse.content)
      if (parsed?.categories?.length) {
        parsed.categories.forEach(cat => {
          const matchedEntries = cat.entryUids.map(id => entries.find(e => e.uid === id)).filter(Boolean) as WorldbookEntry[]
          if (matchedEntries.length > 0) {
            categories.set(cat.categoryName, matchedEntries)
          }
        })
        logger.info('条目分类完成', { categoryCount: categories.size })
        return categories
      }
    } catch (e: any) {
      logger.error('分类条目失败:', e.message)
    }

    // fallback: 按原有 category 分类
    entries.forEach(entry => {
      const category = entry.novelWorkshop?.category || 'custom'
      if (!categories.has(category)) {
        categories.set(category, [])
      }
      categories.get(category)!.push(entry)
    })

    logger.info('条目回退基于现有分类完成', { categoryCount: categories.size })
    return categories
  }

  /**
   * 分析世界书质量
   */
  async analyzeWorldbook(worldbook: Worldbook): Promise<AIAnalysisResult> {
    logger.info('开始分析世界书', {
      entryCount: worldbook.entries.length
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const maxEntries = 50 // 如果条目太多，就取片段
    const sampleEntries = worldbook.entries.slice(0, maxEntries).map(e => ({ uid: e.uid, keys: e.key, content: e.content.substring(0, 150) }))

    const promptText = `
请分析这一份世界书的内容质量。
条目数量: ${worldbook.entries.length}
前50个条目样本:
${JSON.stringify(sampleEntries, null, 2)}

请评估它的质量，并给出评分(0-1)和建议。
输出 JSON 格式:
{
  "duplicationScore": 0.15,
  "qualityScore": 0.85,
  "coverageScore": 0.75,
  "suggestions": ["建议1", "建议2"],
  "problematicEntries": [
    { "uid": 123, "issue": "发现的问题", "suggestion": "改进建议" }
  ]
}`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 1500, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<unknown>(dbResponse.content)
      if (parsed) {
        const result: AIAnalysisResult = {
          duplicationScore: (parsed as any).duplicationScore || 0,
          qualityScore: (parsed as any).qualityScore || 0,
          coverageScore: (parsed as any).coverageScore || 0,
          suggestions: (parsed as any).suggestions || [],
          problematicEntries: ((parsed as any).problematicEntries || []).map((pe: any) => ({
            entry: worldbook.entries.find(e => e.uid === pe.uid) as WorldbookEntry,
            issue: pe.issue,
            suggestion: pe.suggestion
          })).filter((pe: any) => pe.entry)
        }
        logger.info('世界书分析完成', { qualityScore: result.qualityScore, suggestionCount: result.suggestions.length })
        return result
      }
    } catch (e: any) {
      logger.error('分析世界书失败:', e.message)
    }

    return {
      duplicationScore: 0, qualityScore: 0, coverageScore: 0, suggestions: ['分析失败'], problematicEntries: []
    }
  }

  /**
   * 检测重复条目
   */
  async detectDuplicates(
    entries: WorldbookEntry[]
  ): Promise<Array<{ entries: WorldbookEntry[]; similarity: number }>> {
    logger.info('开始检测重复条目', { count: entries.length })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const entriesData = entries.map(e => ({ uid: e.uid, keys: e.key, content: e.content.substring(0, 100) }))
    const promptText = `
请分析以下世界书设定的条目，找出高度相似或重复的条目分组。
条目列表: ${JSON.stringify(entriesData, null, 2)}

输出包含可能重复的条目 UID 以及它们的相似度评分(0-1)。
输出 JSON:
{
  "duplicates": [
    { "uids": [123, 456], "similarity": 0.85 }
  ]
}`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 1500, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ duplicates: Array<{ uids: number[]; similarity: number }> }>(dbResponse.content)
      if (parsed?.duplicates) {
        const duplicates = parsed.duplicates.map(dup => ({
          entries: dup.uids.map(id => entries.find(e => e.uid === id)).filter(Boolean) as WorldbookEntry[],
          similarity: dup.similarity
        })).filter(g => g.entries.length > 1)

        logger.info('重复条目检测完成', { duplicateGroupCount: duplicates.length })
        return duplicates
      }
    } catch (e: any) {
      logger.error('检测重复条目失败:', e.message)
    }

    return []
  }

  /**
   * 从文本提取条目
   */
  async extractEntriesFromText(
    text: string,
    options?: { maxEntries?: number; types?: string[] }
  ): Promise<AIEntrySuggestion[]> {
    logger.info('开始从文本提取条目', {
      textLength: text.length,
      options
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const promptText = `
请从以下文本中提取潜在的小说世界观设定条目。
提取选项：最多提取 ${options?.maxEntries || 5} 个。 ${options?.types?.length ? '建议类型: ' + options.types.join(', ') : ''}
输入文本:
${text.substring(0, 5000)}

输出 JSON 格式:
{ "suggestions": [ { "keys": ["关键词1", "关键词2"], "category": "分类", "content": "具体设定内容", "confidence": 0.9, "reasoning": "为什么提取这条设定", "tags": ["标签"] } ] }`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 2000, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ suggestions: AIEntrySuggestion[] }>(dbResponse.content)
      if (parsed?.suggestions) {
        logger.info('文本条目提取完成', { count: parsed.suggestions.length })
        return parsed.suggestions
      }
    } catch (e: any) {
      logger.error('提取文本条目失败:', e.message)
    }

    return []
  }

  /**
   * 生成条目关系图
   */
  async generateRelationshipGraph(
    entries: WorldbookEntry[]
  ): Promise<{
    nodes: Array<{ id: string; label: string; type: string }>
    edges: Array<{ source: string; target: string; relationship: string }>
  }> {
    logger.info('开始生成条目关系图', { entryCount: entries.length })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const maxEntries = 30 // 控制数量
    const entriesData = entries.slice(0, maxEntries).map(e => ({ uid: e.uid, keys: e.key, content: e.content.substring(0, 60) }))

    const promptText = `
请分析以下世界书设定的条目，梳理出它们之间的逻辑或人物关系。
条目列表: ${JSON.stringify(entriesData, null, 2)}

仅返回存在直接关系的边。对于不在列表中的 UID，请不要放入边缘中。
输出 JSON:
{
  "edges": [
    { "source": "123", "target": "456", "relationship": "所属势力/朋友/敌对 等" }
  ]
}`

    const graph = {
      nodes: entries.map(e => ({
        id: String(e.uid),
        label: e.key?.[0] || e.content.substring(0, 20),
        type: e.novelWorkshop?.category || 'custom'
      })),
      edges: [] as Array<{ source: string; target: string; relationship: string }>
    }

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 1500, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ edges: typeof graph.edges }>(dbResponse.content)
      if (parsed?.edges) {
        graph.edges = parsed.edges.filter(edge => 
          graph.nodes.some(n => n.id === edge.source) && 
          graph.nodes.some(n => n.id === edge.target)
        )
      }
    } catch (e: any) {
      logger.error('获取关系图边失败:', e.message)
    }

    logger.info('条目关系图生成完成', {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length
    })

    return graph
  }

  /**
   * 推荐相关条目
   */
  async recommendRelatedEntries(
    entry: WorldbookEntry,
    allEntries: WorldbookEntry[],
    maxRecommendations: number = 5
  ): Promise<Array<{ entry: WorldbookEntry; relevance: number; reason: string }>> {
    logger.info('开始推荐相关条目', {
      entryId: entry.uid,
      totalEntries: allEntries.length
    })

    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    const otherEntries = allEntries.filter(e => e.uid !== entry.uid).slice(0, 50)
    const entriesData = otherEntries.map(e => ({ uid: e.uid, keys: e.key, content: e.content.substring(0, 50) }))
    
    const promptText = `
请为当前的设定寻找相关的关联设定，最多推荐 ${maxRecommendations} 个。
当前设定 (${entry.key?.join(', ')}):
${entry.content}

候选设定池:
${JSON.stringify(entriesData, null, 2)}

输出 JSON:
{
  "recommendations": [
    { "uid": 123, "relevance": 0.85, "reason": "为什么相关" }
  ]
}`

    try {
      const dbResponse = await aiStore.chat([{ role: 'user', content: promptText }], {
        type: 'worldbuilding', complexity: 'low', priority: 'balanced'
      }, {
        model: this.model, temperature: 0.3, maxTokens: 1500, response_format: { type: 'json_object' }
      })

      const parsed = safeParseAIJson<{ recommendations: Array<{ uid: number; relevance: number; reason: string }> }>(dbResponse.content)
      if (parsed?.recommendations) {
        const recommendations = parsed.recommendations.map(rec => ({
          entry: allEntries.find(e => e.uid === rec.uid) as WorldbookEntry,
          relevance: rec.relevance,
          reason: rec.reason
        })).filter(r => r.entry)
        
        logger.info('相关条目推荐完成', { count: recommendations.length })
        return recommendations
      }
    } catch (e: any) {
      logger.error('请求相关推荐失败:', e.message)
    }

    return []
  }
}

/**
 * 创建 AI 助手实例
 */
export function createAIAssistant(model?: string): WorldbookAIAssistant {
  return new WorldbookAIAssistant(model)
}

/**
 * 从文本提取关键词
 * 便捷函数
 */
export async function extractKeywords(text: string): Promise<string[]> {
  // 使用启发式加 AI的兜底提取
  const chineseNouns = text.match(/[\u4e00-\u9fa5]{2,6}/g) || []
  const englishWords = text.match(/[a-zA-Z]{3,}/g) || []
  const heuristic = Array.from(new Set([...chineseNouns.slice(0, 5), ...englishWords.slice(0, 3)]))

  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()
    const dbResponse = await aiStore.chat([{
      role: 'user', 
      content: `提取这段话的核心关键词（最多10个）:\n${text.substring(0, 1000)}\n\n返回JSON: {"keywords": ["词1", "词2"]}`
    }], undefined, { maxTokens: 300, response_format: { type: 'json_object' } })
    
    const parsed = safeParseAIJson<{ keywords: string[] }>(dbResponse.content)
    if (parsed?.keywords) {
      return parsed.keywords
    }
  } catch (e) {
    // fallback
  }

  return heuristic
}

/**
 * 优化条目内容
 * 便捷函数
 */
export async function optimizeContent(
  content: string,
  options?: { maxLength?: number; style?: 'concise' | 'detailed' }
): Promise<string> {
  const maxLength = options?.maxLength || 500

  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()
    const prompt = `请压缩/优化的文本，使其符合${options?.style === 'concise' ? '精简' : '详实'}风格，且长度不超过${maxLength}字:\n${content}\n\n输出JSON: {"content": "结果"}`
    const dbResponse = await aiStore.chat([{ role: 'user', content: prompt }], undefined, { maxTokens: maxLength * 2, response_format: { type: 'json_object' } })
    const parsed = safeParseAIJson<{ content: string }>(dbResponse.content)
    if (parsed?.content) {
      return parsed.content
    }
  } catch (e) {
    // fallback
  }

  if (content.length <= maxLength) {
    return content
  }
  return content.substring(0, maxLength - 3) + '...'
}
