/**
 * 上下文构建器 - 借鉴酒馆/Tavern的记忆管理机制
 *
 * 核心功能：
 * 1. 分层记忆系统（Author's Note > World Info > Character > Memory Tables > Summary > Recent）
 * 2. Token预算管理
 * 3. 动态注入关键设定
 * 4. 智能摘要压缩
 * 5. 表格记忆系统（借鉴 st-memory-enhancement）
 * 6. 向量检索相关章节（新增）
 */

import type { Project, Chapter, ChapterOutline, VectorServiceConfig } from '@/types'
import {
  initNovelMemory,
  generateMemoryPrompt,
  type MemorySystem
} from './tableMemory'
import { sanitizeForPrompt, validateInput } from './inputSanitizer'
import { buildSystemPrompt, getPromptDefinition } from './promptHelper'
import { getVectorService, type VectorService } from './vectorService'
import { countTokens as countLLMTokens } from './llm/tokenizer'

// Token预算配置
const TOKEN_BUDGET = {
  TOTAL: 6000,           // 总预算（输入token）
  SYSTEM_PROMPT: 300,    // 系统提示
  AUTHORS_NOTE: 200,     // 作者注释（最高优先级）
  WORLD_INFO: 800,       // 世界观设定
  CHARACTERS: 600,       // 人物设定
  MEMORY_TABLES: 500,    // 表格记忆
  VECTOR_CONTEXT: 600,   // 向量检索上下文（新增）
  SUMMARY: 600,          // 摘要（调整）
  RECENT_CHAPTERS: 2000, // 最近章节完整内容（调整）
  OUTLINE: 400,          // 当前章节大纲
  RESERVE: 400           // 预留空间
}

/**
 * 章节摘要
 */
export interface ChapterSummary {
  chapterNumber: number
  title: string
  summary: string           // 压缩后的摘要
  keyEvents: string[]       // 关键事件
  characters: string[]      // 出场人物
  locations: string[]       // 场景地点
  plotProgression: string   // 剧情推进
  tokenCount: number        // 摘要token数
}

/**
 * 上下文构建结果
 */
export interface BuildContext {
  systemPrompt: string
  authorsNote: string
  worldInfo: string
  characters: string
  memoryTables: string  // 表格记忆
  vectorContext: string // 向量检索上下文（新增）
  summary: string
  recentChapters: string
  outline: string
  totalTokens: number
  warnings: string[]
}

/**
 * Token计数（优先使用统一 tokenizer，失败时降级到估算）
 */
function estimateTokens(text: string): number {
  if (!text) return 0

  try {
    // 上下文构建默认按 OpenAI 分词规则估算，显著优于字符比例公式
    return countLLMTokens(text, 'openai')
  } catch {
    // 降级：保守估算，避免 token 低估导致超限
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
    const otherChars = text.length - chineseChars - englishWords

    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars / 3)
  }
}

/**
 * 截断文本到指定token数
 */
function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return ''

  const currentTokens = estimateTokens(text)
  if (currentTokens <= maxTokens) return text

  // 简单截断（可以优化为智能截断）
  const ratio = maxTokens / currentTokens
  let targetLength = Math.floor(text.length * ratio * 0.9) // 留10%余量
  if (targetLength < 0) targetLength = 0

  let truncated = text.substring(0, targetLength)
  
  // 安全截断：避免切断 Unicode 代理对（Surrogate Pair），防止产生非法的 JSON 字符串导致 400 报错
  if (truncated.length > 0) {
    const lastCode = truncated.charCodeAt(truncated.length - 1)
    if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
      truncated = truncated.substring(0, truncated.length - 1)
    }
  }

  return truncated + '\n...(内容已截断)'
}

/**
 * 构建Author's Note（最高优先级指令）
 */
function buildAuthorsNote(
  currentChapter: number,
  recentChapters: Chapter[],
  project: Project
): string {
  const parts: string[] = []

  // 1. 连贯性强制指令
  if (currentChapter > 1) {
    parts.push(`【作者注释 - 极其重要！】`)
    parts.push(`这是第${currentChapter}章，必须严格承接前文剧情。`)
    parts.push(`当前场景：${inferCurrentScene(recentChapters, project)}`)
    parts.push(`当前人物状态：${inferCharacterStates(recentChapters, project)}`)

    // 提取前文关键信息
    const lastChapter = recentChapters[0]
    if (lastChapter && lastChapter.content) {
      parts.push(`\n前文结尾情况：`)
      const cContent = lastChapter.content;
      parts.push(`- 场景：${cContent.substring(Math.max(0, cContent.length - 200))}`)
    }

    parts.push(`\n【绝对禁止】`)
    parts.push(`- 重新开始剧情（当作第一章写）`)
    parts.push(`- 改变已建立的人物关系`)
    parts.push(`- 遗忘已发生的事件`)
    parts.push(`- 突然跳到不相关的新场景`)
  } else {
    parts.push(`【作者注释】`)
    parts.push(`这是第一章，请设定好世界观、人物和故事的起点。`)
  }

  return parts.join('\n')
}

/**
 * 推断当前场景
 */
function inferCurrentScene(recentChapters: Chapter[], _project: Project): string {
  if (!recentChapters || recentChapters.length === 0) {
    return '故事开始'
  }

  const lastChapter = recentChapters[0]
  const content = lastChapter.content || ''

  // 简单的场景推断（可以优化为AI提取）
  const locationKeywords = ['山谷', '城市', '森林', '山脉', '宫殿', '洞府', '战场']
  for (const keyword of locationKeywords) {
    if (content.includes(keyword)) {
      return keyword
    }
  }

  return '未知场景'
}

/**
 * 推断人物状态
 */
function inferCharacterStates(recentChapters: Chapter[], project: Project): string {
  if (!recentChapters || recentChapters.length === 0) {
    return ''
  }

  const lastChapter = recentChapters[0]
  const characters = project.characters || []

  // 提取最后出场的人物
  const mentionedCharacters = characters.filter(c =>
    (lastChapter.content || '').includes(c.name)
  ).map(c => c.name)

  if (mentionedCharacters.length > 0) {
    return `主要人物：${mentionedCharacters.join('、')}`
  }

  return ''
}

/**
 * 构建World Info（动态注入关键设定）
 */
function buildWorldInfo(
  project: Project,
  _currentChapter: Chapter,
  recentChapters: Chapter[]
): string {
  const parts: string[] = []

  // 1. 核心世界观（最高优先级）
  if (project.world) {
    const world = project.world
    parts.push(`【核心世界观】`)
    parts.push(`名称：${world.name || '未命名世界'}`)

    if (world.era) {
      parts.push(`时代：${world.era.time || '未知'} | 科技水平：${world.era.techLevel || '未知'}`)
    }

    if (world.powerSystem) {
      parts.push(`力量体系：${world.powerSystem.name || '未知'}`)
      if (world.powerSystem.levels && world.powerSystem.levels.length > 0) {
        parts.push(`等级划分：${world.powerSystem.levels.map(l => l.name).join(' → ')}`)
      }
    }
  }

  // 2. 主要势力（与当前章节相关）
  if (project.world?.factions && project.world.factions.length > 0) {
    // 提取前文提到的势力
    const mentionedFactions = project.world.factions.filter(f => {
      if (!recentChapters || recentChapters.length === 0) return false
      return recentChapters.some(ch => (ch.content || '').includes(f.name))
    })

    if (mentionedFactions.length > 0) {
      parts.push(`\n【相关势力】`)
      mentionedFactions.forEach(f => {
        parts.push(`${f.name}：${f.description}`)
      })
    }
  }

  // 3. 世界规则（动态注入）
  if (project.world?.rules && project.world.rules.length > 0) {
    parts.push(`\n【世界规则】`)
    project.world.rules.slice(0, 5).forEach(rule => {
      parts.push(`- ${rule.name}：${rule.description}`)
    })
  }

  return parts.join('\n')
}

/**
 * 构建人物设定（动态注入相关人物）
 */
function buildCharacterInfo(
  project: Project,
  currentChapter: Chapter,
  recentChapters: Chapter[]
): string {
  if (!project.characters || project.characters.length === 0) {
    return ''
  }

  const parts: string[] = []

  // 1. 提取相关人物（当前章节大纲 + 前文出场）
  const relevantCharacterNames = new Set<string>()

  // 从章节大纲获取
  if (currentChapter.outline?.characters) {
    currentChapter.outline.characters.forEach(name => relevantCharacterNames.add(name))
  }

  // 从前文提取
  if (recentChapters && recentChapters.length > 0) {
    project.characters.forEach(char => {
      if (recentChapters.some(ch => ch.content.includes(char.name))) {
        relevantCharacterNames.add(char.name)
      }
    })
  }

  // 如果没有指定，默认取前3个主要人物
  if (relevantCharacterNames.size === 0 && project.characters.length > 0) {
    project.characters.slice(0, 3).forEach(c => relevantCharacterNames.add(c.name))
  }

  // 2. 构建人物卡
  const relevantCharacters = project.characters.filter(c =>
    relevantCharacterNames.has(c.name)
  )

  if (relevantCharacters.length > 0) {
    parts.push(`【人物设定】`)

    relevantCharacters.forEach(char => {
      parts.push(`\n${char.name}：`)
      parts.push(`  性别：${char.gender === 'male' ? '男' : char.gender === 'female' ? '女' : '其他'}`)
      parts.push(`  年龄：${char.age}岁`)
      if (char.appearance) parts.push(`  外貌：${char.appearance}`)
      if (char.personality && char.personality.length > 0) {
        parts.push(`  性格：${char.personality.join('、')}`)
      }
      if (char.background) parts.push(`  背景：${char.background}`)
      if (char.abilities && char.abilities.length > 0) {
        parts.push(`  能力：${char.abilities.map(a => a.name).join('、')}`)
      }

      // 人物关系（简化）
      if (char.relationships && char.relationships.length > 0) {
        const relations = char.relationships.slice(0, 3).map(r => {
          const target = project.characters.find(c => c.id === r.targetId)
          return target ? `${r.type === 'friend' ? '朋友' : r.type === 'enemy' ? '敌人' : r.type}(${target.name})` : ''
        }).filter(r => r).join('、')

        if (relations) parts.push(`  关系：${relations}`)
      }
    })
  }

  return parts.join('\n')
}

/**
 * 构建章节摘要（压缩历史）
 */
function buildSummary(
  chapters: Chapter[],
  currentChapter: number
): { summary: string, summaries: ChapterSummary[] } {
  if (!chapters || chapters.length === 0 || currentChapter <= 1) {
    return { summary: '', summaries: [] }
  }

  const summaries: ChapterSummary[] = []

  // 获取需要摘要的章节（排除最近3章）
  const chaptersToSummarize = chapters
    .filter(ch => ch.number < currentChapter - 3 && ch.number >= 1)
    .sort((a, b) => a.number - b.number)

  if (chaptersToSummarize.length === 0) {
    return { summary: '', summaries: [] }
  }

  // 使用新的摘要系统
  chaptersToSummarize.forEach(ch => {
    // 如果章节有详细摘要数据，使用它
    if (ch.summaryData) {
      const summary: ChapterSummary = {
        chapterNumber: ch.number,
        title: ch.title,
        summary: ch.summaryData.summary,
        keyEvents: ch.summaryData.keyEvents,
        characters: ch.summaryData.characters,
        locations: ch.summaryData.locations,
        plotProgression: ch.summaryData.plotProgression,
        tokenCount: ch.summaryData.tokenCount
      }
      summaries.push(summary)
    } else if (ch.summary) {
      // 如果只有简单摘要，使用它
      const summary: ChapterSummary = {
        chapterNumber: ch.number,
        title: ch.title,
        summary: ch.summary,
        keyEvents: [],
        characters: [],
        locations: [],
        plotProgression: '',
        tokenCount: estimateTokens(ch.summary)
      }
      summaries.push(summary)
    } else {
      // 如果没有摘要，提取前150字作为临时摘要
      const cContent = ch.content || ''
      const summary: ChapterSummary = {
        chapterNumber: ch.number,
        title: ch.title,
        summary: cContent.substring(0, 150) + '...',
        keyEvents: [],
        characters: [],
        locations: [],
        plotProgression: '',
        tokenCount: 0
      }
      summary.tokenCount = estimateTokens(summary.summary)
      summaries.push(summary)
    }
  })

  // 构建摘要文本
  const parts: string[] = []
  parts.push(`【历史章节摘要】`)

  // 如果章节数超过10，按卷分组
  if (summaries.length > 10) {
    const batchSize = Math.ceil(summaries.length / 5)
    for (let i = 0; i < summaries.length; i += batchSize) {
      const batch = summaries.slice(i, i + batchSize)
      parts.push(`\n第${batch[0].chapterNumber}-${batch[batch.length - 1].chapterNumber}章：`)
      batch.forEach(s => {
        parts.push(`  ${s.chapterNumber}. ${s.title}：${s.summary}`)
        // 如果有关键事件，添加到摘要中
        if (s.keyEvents && s.keyEvents.length > 0) {
          parts.push(`    关键事件：${s.keyEvents.join('、')}`)
        }
      })
    }
  } else {
    summaries.forEach(s => {
      parts.push(`第${s.chapterNumber}章 ${s.title}：${s.summary}`)
      // 如果有关键事件，添加到摘要中
      if (s.keyEvents && s.keyEvents.length > 0) {
        parts.push(`  关键事件：${s.keyEvents.join('、')}`)
      }
    })
  }

  return {
    summary: parts.join('\n'),
    summaries
  }
}

/**
 * 构建最近章节（完整内容）
 */
function buildRecentChapters(
  chapters: Chapter[],
  currentChapter: number,
  maxTokens: number,
  recentCount: number = 3
): string {
  if (!chapters || chapters.length === 0 || currentChapter <= 1) {
    return ''
  }

  const parts: string[] = []

  // 获取最近N章
  const recentChapters = chapters
    .filter(ch => ch.number < currentChapter && ch.number >= currentChapter - recentCount)
    .sort((a, b) => b.number - a.number) // 倒序

  if (recentChapters.length === 0) {
    return ''
  }

  parts.push(`【最近章节完整内容 - 必须严格承接】`)

  let totalTokens = 0

  for (const ch of recentChapters) {
    const cContent = ch.content || ''
    const chapterText = `\n第${ch.number}章 ${ch.title}\n${cContent}`
    const chapterTokens = estimateTokens(chapterText)

    // 检查是否超出预算
    if (totalTokens + chapterTokens > maxTokens) {
      // 截断到剩余预算
      const remainingTokens = maxTokens - totalTokens
      if (remainingTokens > 50) {
        const truncatedContent = truncateToTokens(cContent, remainingTokens - 50)
        parts.push(`\n第${ch.number}章 ${ch.title}\n${truncatedContent}`)
      }
      break // 真正跳出循环
    }

    parts.push(chapterText)
    totalTokens += chapterTokens
  }

  return parts.join('\n')
}

/**
 * 构建章节大纲
 */
function buildOutline(outline: ChapterOutline | undefined): string {
  if (!outline) return ''

  const parts: string[] = []
  parts.push(`【本章大纲】`)
  parts.push(`标题：${outline.title}`)

  if (outline.goals && outline.goals.length > 0) {
    parts.push(`目标：${outline.goals.join('、')}`)
  }

  if (outline.conflicts && outline.conflicts.length > 0) {
    parts.push(`冲突：${outline.conflicts.join('、')}`)
  }

  if (outline.resolutions && outline.resolutions.length > 0) {
    parts.push(`解决：${outline.resolutions.join('、')}`)
  }

  if (outline.location) {
    parts.push(`地点：${outline.location}`)
  }

  if (outline.characters && outline.characters.length > 0) {
    parts.push(`出场人物：${outline.characters.join('、')}`)
  }

  if (outline.foreshadowingToPlant && outline.foreshadowingToPlant.length > 0) {
    parts.push(`埋下伏笔：${outline.foreshadowingToPlant.join('、')}`)
  }

  if (outline.foreshadowingToResolve && outline.foreshadowingToResolve.length > 0) {
    parts.push(`揭示伏笔：${outline.foreshadowingToResolve.join('、')}`)
  }

  return parts.join('\n')
}

/**
 * 构建向量检索上下文（新增）
 */
async function buildVectorContext(
  project: Project,
  currentChapter: Chapter,
  vectorService?: VectorService,
  maxTokens: number = TOKEN_BUDGET.VECTOR_CONTEXT
): Promise<string> {
  if (!vectorService) {
    return ''
  }

  try {
    // 检索相关上下文
    const results = await vectorService.retrieveRelevantContext(
      currentChapter,
      project,
      {
        topK: 5,
        minScore: 0.6,
        excludeCurrentChapter: true
      }
    )

    if (results.length === 0) {
      return ''
    }

    const parts: string[] = []
    parts.push(`【相关上下文 - 向量检索】`)

    // 按类型分组
    const groupedResults = new Map<string, typeof results>()
    for (const result of results) {
      const type = result.metadata.type
      if (!groupedResults.has(type)) {
        groupedResults.set(type, [])
      }
      groupedResults.get(type)!.push(result)
    }

    // 添加各类型的相关信息
    for (const [type, items] of groupedResults) {
      const typeNames: Record<string, string> = {
        'setting': '世界观设定',
        'character': '人物',
        'plot': '剧情',
        'event': '事件',
        'chapter': '历史章节',
        'rule': '世界规则'
      }

      parts.push(`\n${typeNames[type] || type}：`)

      items.slice(0, 3).forEach(item => {
        const rawPreview = item.content.substring(0, 500)
        const validation = validateInput(rawPreview)
        if (!validation.valid) {
          console.warn('[ContextBuilder] 检测到可疑检索片段，已清洗:', validation.warnings)
        }

        const preview = sanitizeForPrompt(rawPreview, {
          maxLength: 500,
          preserveLineBreaks: true
        })

        parts.push(`  - <context source="${type}" score="${(item.score * 100).toFixed(0)}%">${preview}</context>`)
      })
    }

    const context = parts.join('\n')

    // 截断到指定token数
    if (estimateTokens(context) > maxTokens) {
      return truncateToTokens(context, maxTokens)
    }

    return context
  } catch (error) {
    console.error('[ContextBuilder] 向量检索失败:', error)
    return ''
  }
}

/**
 * 主函数：构建完整上下文
 */
export async function buildChapterContext(
  project: Project,
  currentChapter: Chapter,
  memorySystem?: MemorySystem,  // 表格记忆系统
  vectorConfig?: VectorServiceConfig // 向量服务配置（新增）
): Promise<BuildContext> {
  const warnings: string[] = []
  const chapters = project.chapters || []
  const currentChapterNum = currentChapter.number

  // 动态读取高级配置
  const advanced = project.config?.advancedSettings
  const maxContextTokens = advanced?.maxContextTokens ?? 8192
  const recentCount = advanced?.recentChaptersCount ?? 3
  const targetWordCount = advanced?.targetWordCount ?? 2000

  // 动态分配近期章节上下文预算：保留 2000 Tokens 给设定、大纲等其他模块
  let recentBudget = maxContextTokens - 2000
  if (recentBudget < 2000) recentBudget = 2000

  // 获取最近章节（用于推断状态）
  const recentChapters = chapters
    .filter(ch => ch.number < currentChapterNum && ch.number >= currentChapterNum - recentCount)
    .sort((a, b) => b.number - a.number)

  // 获取最近章节内容（用于触发式过滤）
  const recentContent = recentChapters.map(ch => ch.content || '').join('\n\n')

  const enforceSectionBudget = (sectionName: string, text: string, budget: number): string => {
    if (!text || budget <= 0) {
      return ''
    }

    const sectionTokens = estimateTokens(text)
    if (sectionTokens <= budget) {
      return text
    }

    warnings.push(`${sectionName}已从${sectionTokens} tokens裁剪到${budget} tokens以内`)
    return truncateToTokens(text, budget)
  }

  const calculateTotalTokens = () =>
    estimateTokens(systemPrompt) +
    estimateTokens(authorsNote) +
    estimateTokens(worldInfo) +
    estimateTokens(characters) +
    estimateTokens(memoryTablesText) +
    estimateTokens(vectorContextText) +
    estimateTokens(summary) +
    estimateTokens(recentChaptersText) +
    estimateTokens(outline)

  // 1. 构建各部分
  const promptDefinition = getPromptDefinition(project.config, 'writing')
  const promptVariables = {
    chapter: `第${currentChapter.number}章 ${currentChapter.title}`,
    characters: currentChapter.outline?.characters?.join('、') || '相关人物待补充',
    scenes: currentChapter.outline?.location || inferCurrentScene(recentChapters, project) || '场景信息待补充',
    context: `题材：${project.genre}\n目标字数：${targetWordCount}\n写作深度：${project.config?.writingDepth || 'standard'}\n最近章节数：${recentCount}`,
    genre: project.genre || '未指定题材',
    style: project.config?.writingDepth || 'standard',
    tone: project.config?.preset || 'standard'
  }
  let systemPrompt = buildSystemPrompt(project.config, 'writing', promptVariables)
  warnings.push(`写作系统提示词已通过 Prompt Registry 注入，模板版本：v${promptDefinition.version}`)
  let authorsNote = buildAuthorsNote(currentChapterNum, recentChapters, project)
  let worldInfo = buildWorldInfo(project, currentChapter, recentChapters)
  let characters = buildCharacterInfo(project, currentChapter, recentChapters)

  // 生成表格记忆提示词
  let memoryTablesText = ''
  if (memorySystem) {
    memoryTablesText = generateMemoryPrompt(memorySystem, recentContent)
  } else {
    // 如果没有提供，初始化表格记忆
    const newMemory = initNovelMemory(project)
    memoryTablesText = generateMemoryPrompt(newMemory, recentContent)
  }

  // 向量检索相关上下文（新增）
  let vectorContextText = ''
  if (vectorConfig) {
    try {
      const vectorService = await getVectorService(project.id, vectorConfig)
      vectorContextText = await buildVectorContext(project, currentChapter, vectorService, TOKEN_BUDGET.VECTOR_CONTEXT)
    } catch (error) {
      console.warn('[ContextBuilder] 向量检索失败，将使用降级方案:', error)
      warnings.push('向量检索失败，已使用降级方案')
    }
  }

  let summary = buildSummary(chapters, currentChapterNum).summary
  let recentChaptersText = buildRecentChapters(chapters, currentChapterNum, recentBudget, recentCount)
  let outline = buildOutline(currentChapter.outline)

  systemPrompt = enforceSectionBudget('系统提示', systemPrompt, TOKEN_BUDGET.SYSTEM_PROMPT)
  authorsNote = enforceSectionBudget('作者注释', authorsNote, TOKEN_BUDGET.AUTHORS_NOTE)
  worldInfo = enforceSectionBudget('世界观设定', worldInfo, TOKEN_BUDGET.WORLD_INFO)
  characters = enforceSectionBudget('人物设定', characters, TOKEN_BUDGET.CHARACTERS)
  memoryTablesText = enforceSectionBudget('表格记忆', memoryTablesText, TOKEN_BUDGET.MEMORY_TABLES)
  vectorContextText = enforceSectionBudget('向量检索上下文', vectorContextText, TOKEN_BUDGET.VECTOR_CONTEXT)
  summary = enforceSectionBudget('历史摘要', summary, TOKEN_BUDGET.SUMMARY)
  recentChaptersText = enforceSectionBudget('最近章节', recentChaptersText, recentBudget)
  outline = enforceSectionBudget('章节大纲', outline, TOKEN_BUDGET.OUTLINE)

  // 2. 计算总token，并在超限时按优先级继续裁剪
  let totalTokens = calculateTotalTokens()

  if (totalTokens > maxContextTokens) {
    const shrinkableSections = [
      {
        name: '向量检索上下文',
        get: () => vectorContextText,
        set: (value: string) => {
          vectorContextText = value
        },
        minTokens: 0
      },
      {
        name: '历史摘要',
        get: () => summary,
        set: (value: string) => {
          summary = value
        },
        minTokens: 120
      },
      {
        name: '世界观设定',
        get: () => worldInfo,
        set: (value: string) => {
          worldInfo = value
        },
        minTokens: 120
      },
      {
        name: '人物设定',
        get: () => characters,
        set: (value: string) => {
          characters = value
        },
        minTokens: 120
      },
      {
        name: '表格记忆',
        get: () => memoryTablesText,
        set: (value: string) => {
          memoryTablesText = value
        },
        minTokens: 120
      },
      {
        name: '最近章节',
        get: () => recentChaptersText,
        set: (value: string) => {
          recentChaptersText = value
        },
        minTokens: 200
      }
    ]

    for (const section of shrinkableSections) {
      if (totalTokens <= maxContextTokens) {
        break
      }

      const currentText = section.get()
      if (!currentText) {
        continue
      }

      const currentTokens = estimateTokens(currentText)
      if (currentTokens <= section.minTokens) {
        continue
      }

      const overflowTokens = totalTokens - maxContextTokens
      const targetTokens = Math.max(section.minTokens, currentTokens - overflowTokens)
      const trimmedText = truncateToTokens(currentText, targetTokens)
      const trimmedTokens = estimateTokens(trimmedText)

      if (trimmedTokens < currentTokens) {
        section.set(trimmedText)
        warnings.push(`为满足上下文预算，${section.name}已进一步裁剪 ${currentTokens - trimmedTokens} tokens`)
        totalTokens = calculateTotalTokens()
      }
    }
  }

  // 3. 检查预算与注意力衰减警告
  if (totalTokens > maxContextTokens) {
    warnings.push(`总token数(${totalTokens})超出最大上下文预算(${maxContextTokens})，已执行硬裁剪但仍存在超限风险`)
  } else if (totalTokens > maxContextTokens * 0.5) {
    warnings.push(`当前上下文长度(${totalTokens} tokens)已超过最大容量的一半(${maxContextTokens / 2})，可能会出现AI注意力涣散（遗忘前文细节）`)
  }

  return {
    systemPrompt,
    authorsNote,
    worldInfo,
    characters,
    memoryTables: memoryTablesText,
    vectorContext: vectorContextText,
    summary,
    recentChapters: recentChaptersText,
    outline,
    totalTokens,
    warnings
  }
}

/**
 * 将上下文转换为prompt
 */
export function contextToPrompt(context: BuildContext, chapterTitle: string, targetWords: number = 2000): string {
  const parts: string[] = []

  // 1. 系统提示（最高优先级）
  parts.push(context.systemPrompt)
  parts.push('')

  // 2. Author's Note（强制指令）
  parts.push(context.authorsNote)
  parts.push('')

  // 3. 世界观设定
  if (context.worldInfo) {
    parts.push(context.worldInfo)
    parts.push('')
  }

  // 4. 人物设定
  if (context.characters) {
    parts.push(context.characters)
    parts.push('')
  }

  // 5. 表格记忆系统（借鉴 st-memory-enhancement）
  if (context.memoryTables) {
    parts.push(context.memoryTables)
    parts.push('')
  }

  // 6. 向量检索上下文（智能检索相关历史信息）
  if (context.vectorContext) {
    parts.push(context.vectorContext)
    parts.push('')
  }

  // 7. 历史摘要
  if (context.summary) {
    parts.push(context.summary)
    parts.push('')
  }

  // 8. 最近章节（完整内容）
  if (context.recentChapters) {
    parts.push(context.recentChapters)
    parts.push('')
  }

  // 9. 章节大纲
  if (context.outline) {
    parts.push(context.outline)
    parts.push('')
  }

  // 9. 写作要求
  parts.push(`【写作要求】`)
  parts.push(`1. 章节标题：${chapterTitle}`)
  parts.push(`2. 字数：约${targetWords}字`)
  parts.push(`3. 必须严格承接前文剧情，保持连贯性`)
  parts.push(`4. 严格遵循表格记忆中的角色状态、物品归属、关系等信息`)
  parts.push(`5. 情节紧凑，引人入胜`)
  parts.push(`6. 场景描写生动`)
  parts.push(`7. 对话自然流畅`)
  parts.push('')
  parts.push(`直接返回章节内容文本，不要包含标题和其他说明。`)

  return parts.join('\n')
}
