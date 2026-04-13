/**
 * 上下文构建器 - V3 重构版
 *
 * 核心功能：
 * 1. 动态 Token 预算（根据模型窗口自适应，告别 6000 硬编码）
 * 2. 沙漏式上下文布局（头部放约束，尾部放指令，对抗 Lost in the Middle）
 * 3. System / User 角色分离
 * 4. 表格记忆系统（借鉴 st-memory-enhancement）
 * 5. 向量检索相关章节
 */

import type { Project, Chapter, ChapterOutline, VectorServiceConfig, Character } from '@/types'
import {
  type MemorySystem
} from './tableMemory'
import { sanitizeForPrompt, validateInput } from './inputSanitizer'
import { getVectorService, type VectorService } from './vectorService'
import { countTokens as countLLMTokens } from './llm/tokenizer'
import { ContextPipeline, type ContextPayload } from './context/pipeline'
import {
  SystemPromptMiddleware,
  AuthorsNoteMiddleware,
  StateConstraintsMiddleware,
  CharacterInfoMiddleware,
  WorldInfoMiddleware,
  MemoryTableMiddleware,
  VectorContextMiddleware,
  SummaryMiddleware,
  RecentChaptersMiddleware,
  OutlineMiddleware
} from './context/middlewares'

// ===== 动态 Token 预算工厂 =====
// 根据模型上下文窗口大小按比例分配，不再硬编码 6000
interface TokenBudget {
  TOTAL: number
  SYSTEM_PROMPT: number
  AUTHORS_NOTE: number
  WORLD_INFO: number
  CHARACTERS: number
  MEMORY_TABLES: number
  VECTOR_CONTEXT: number
  SUMMARY: number
  RECENT_CHAPTERS: number
  OUTLINE: number
  RESERVE: number
}

function createTokenBudget(modelContextWindow: number = 128000): TokenBudget {
  // 预留 30% 给生成输出，70% 用于输入上下文
  const inputBudget = Math.floor(modelContextWindow * 0.7)
  // 设合理上限，避免把太多低质量信息塞进去
  const effectiveBudget = Math.min(inputBudget, 60000)

  return {
    TOTAL: effectiveBudget,
    SYSTEM_PROMPT: Math.floor(effectiveBudget * 0.05),
    AUTHORS_NOTE: Math.floor(effectiveBudget * 0.03),
    WORLD_INFO: Math.floor(effectiveBudget * 0.12),
    CHARACTERS: Math.floor(effectiveBudget * 0.10),
    MEMORY_TABLES: Math.floor(effectiveBudget * 0.08),
    VECTOR_CONTEXT: Math.floor(effectiveBudget * 0.15),
    SUMMARY: Math.floor(effectiveBudget * 0.10),
    RECENT_CHAPTERS: Math.floor(effectiveBudget * 0.25),
    OUTLINE: Math.floor(effectiveBudget * 0.05),
    RESERVE: Math.floor(effectiveBudget * 0.07)
  }
}

// 向后兼容：保持一个默认实例供旧代码路径使用
const TOKEN_BUDGET = createTokenBudget(128000)

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
  stateConstraints: string  // V4-D4: 档案员前置约束
  memoryTables: string  // 表格记忆
  vectorContext: string // 向量检索上下文（新增）
  summary: string
  recentChapters: string
  outline: string
  plotAnchors: string // 命运锚点预警
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
export function buildAuthorsNote(
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
 * V3 重构：优先从角色 currentState 中读取真实位置，不再用硬编码关键词碰撞
 */
export function inferCurrentScene(recentChapters: Chapter[], project: Project): string {
  if (!recentChapters || recentChapters.length === 0) {
    return '故事开始'
  }

  // 优先从角色的 currentState 中读取位置
  const characters = project.characters || []
  const lastChapter = recentChapters[0]
  const lastContent = lastChapter.content || ''

  // 只看在最近章节中出场的角色
  const activeCharacters = characters.filter(c =>
    lastContent.includes(c.name) && c.currentState?.location && c.currentState.location !== '未知'
  )
  if (activeCharacters.length > 0) {
    const locations = [...new Set(activeCharacters.map(c => c.currentState!.location))]
    return locations.join('、')
  }

  // 降级：提取前一章末尾 300 字作为场景线索
  if (lastContent.length > 0) {
    const tail = lastContent.slice(-300)
    return `前文末段：...${tail.substring(0, 150)}`
  }

  return '未知场景'
}

/**
 * 推断人物状态
 * V3 重构：从 currentState 读取真实状态，而非仅返回姓名列表
 */
export function isCharacterActive(c: Character): boolean {
  if (c.isArchived) return false
  
  if (c.currentState?.vitalStatus === 'dead') return false
  
  const statusLower = (c.currentState?.status || '').toLowerCase()
  const isDead = statusLower.includes('死亡') || statusLower.includes('dead') || statusLower.includes('殒落')
  
  return !isDead
}

export function inferCharacterStates(recentChapters: Chapter[], project: Project): string {
  if (!recentChapters || recentChapters.length === 0) {
    return ''
  }

  const lastChapter = recentChapters[0]
  const characters = project.characters || []

  // 提取最后出场的人物，并附带状态信息
  const mentioned = characters.filter(c =>
    (lastChapter.content || '').includes(c.name)
  )

  if (mentioned.length === 0) return ''

  return `主要人物：` + mentioned.map(c => {
    const state = c.currentState
    if (state && (state.status || state.location)) {
      const parts = [c.name]
      if (state.status) parts.push(state.status)
      if (state.location) parts.push(`在${state.location}`)
      return parts.join('/')
    }
    return c.name
  }).join('、')
}

/**
 * V4-D4: 提取前置状态约束，注入系统提示词头部
 */
export function buildStateConstraints(characters: Character[], involvedNames: string[]): string {
  const constraints: string[] = []
  for (const name of involvedNames) {
    const char = characters.find(c => c.name === name)
    if (!char?.currentState) continue
    const s = char.currentState
    
    // index.ts CharacterState doesn't have vitalStatus natively, but it might be in status
    const isDead = (s.status || '').toLowerCase().includes('死') || (s.status || '').toLowerCase().includes('dead')
    
    const parts: string[] = []
    if (isDead) parts.push(`生存状态:已死亡`)
    else if (s.status) parts.push(`当前状态:${s.status}`)
    
    if (s.location) parts.push(`当前位置:${s.location}`)
    if (s.faction) parts.push(`所属阵营:${s.faction}`)
    
    // ability levels could be added here if needed
    if (char.powerLevel) parts.push(`修为境界:${char.powerLevel}`)
    
    if (parts.length > 0) {
      constraints.push(`- ${char.name}: ${parts.join(', ')}`)
    }
  }
  if (constraints.length === 0) return ''
  return `\n\n【⚠️ 角色状态约束 — 以下信息为铁律，正文中不得与之矛盾】\n${constraints.join('\n')}`
}

/**
 * 构建World Info（动态注入关键设定）
 */
export function buildWorldInfo(
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
export function buildCharacterInfo(
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
  // V4-③: 过滤死亡/归档角色，仅在大纲明确提及时才注入（RAG 唤醒）
  const relevantCharacters = project.characters.filter(c => {
    if (!relevantCharacterNames.has(c.name)) return false
    
    // 跳过死亡/归档角色，除非本章大纲明确提及
    if (!isCharacterActive(c) && !currentChapter.outline?.characters?.includes(c.name)) {
      return false
    }
    
    return true
  })

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
export function buildSummary(
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
export function buildRecentChapters(
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
export function buildOutline(outline: ChapterOutline | undefined): string {
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
 * 构建向量检索上下文 (V5: 图谱制导的正文切片检索)
 */
export async function buildVectorContext(
  project: Project,
  currentChapter: Chapter,
  vectorService?: VectorService,
  maxTokens: number = 19200,
  activeEntityNames: string[] = []
): Promise<string> {
  if (!vectorService) {
    return ''
  }

  try {
    // V5: 使用图谱制导检索，传入当前章节涉及的实体名
    const results = await vectorService.retrieveRelevantContext(
      currentChapter,
      project,
      activeEntityNames
    )

    if (results.length === 0) {
      return ''
    }

    // V5: 所有结果都是 chapter 切片，按章节号升序排列保持时间线
    results.sort((a, b) => {
      const chapterA = a.metadata?.chapterNumber ?? 0
      const chapterB = b.metadata?.chapterNumber ?? 0
      return chapterA - chapterB
    })

    const parts: string[] = []
    parts.push(`【历史相关片段 - 图谱制导检索】`)

    for (const result of results) {
      const rawPreview = result.content.substring(0, 500)
      const validation = validateInput(rawPreview)
      if (!validation.valid) {
        console.warn('[ContextBuilder] 检测到可疑检索片段，已清洗:', validation.warnings)
      }

      const preview = sanitizeForPrompt(rawPreview, {
        maxLength: 500,
        preserveLineBreaks: true
      })

      const chapterLabel = result.metadata?.chapterNumber ? `ch${result.metadata.chapterNumber}` : ''
      const entitiesLabel = result.metadata?.entityNames?.length
        ? ` entities="${result.metadata.entityNames.join(',')}"`
        : ''
      parts.push(`  - <context source="chapter" ${chapterLabel}${entitiesLabel} score="${(result.score * 100).toFixed(0)}%">${preview}</context>`)
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
  vectorConfig?: VectorServiceConfig, // 向量服务配置（新增）
  modelContextWindow: number = 128000
): Promise<BuildContext> {
  const budget = createTokenBudget(modelContextWindow)

  // 初始化向量服务
  let vectorService: VectorService | undefined
  if (vectorConfig) {
    try {
      vectorService = await getVectorService({ ...vectorConfig, projectId: project.id } as any)
    } catch (error) {
      console.warn('[ContextBuilder] 向量检索初始化失败:', error)
    }
  }

  // 初始化 Payload
  const payload: ContextPayload = {
    project,
    currentChapter,
    memorySystem,
    vectorService,
    budget: {
      total: budget.TOTAL,
      remaining: budget.TOTAL,
      distribution: {
        'SYSTEM_PROMPT': budget.SYSTEM_PROMPT,
        'AUTHORS_NOTE': budget.AUTHORS_NOTE,
        'WORLD_INFO': budget.WORLD_INFO,
        'CHARACTERS': budget.CHARACTERS,
        'MEMORY_TABLES': budget.MEMORY_TABLES,
        'VECTOR_CONTEXT': budget.VECTOR_CONTEXT,
        'SUMMARY': budget.SUMMARY,
        'RECENT_CHAPTERS': budget.RECENT_CHAPTERS,
        'OUTLINE': budget.OUTLINE
      }
    },
    systemParts: [],
    userHeadParts: [],
    userTailParts: [],
    warnings: [],
    totalTokensUsed: 0,
    builtSections: {
      systemPrompt: '',
      authorsNote: '',
      worldInfo: '',
      characters: '',
      stateConstraints: '',
      memoryTables: '',
      vectorContext: '',
      summary: '',
      recentChapters: '',
      outline: ''
    }
  }

  if (!vectorService && vectorConfig) {
    payload.warnings.push('向量检索初始化失败，已使用降级方案')
  }

  // 构建并执行管道
  const pipeline = new ContextPipeline()
    .use(new SystemPromptMiddleware())
    .use(new AuthorsNoteMiddleware())
    .use(new WorldInfoMiddleware())
    .use(new CharacterInfoMiddleware())
    .use(new StateConstraintsMiddleware())
    .use(new MemoryTableMiddleware())
    .use(new VectorContextMiddleware())
    .use(new SummaryMiddleware())
    .use(new RecentChaptersMiddleware())
    .use(new OutlineMiddleware())

  await pipeline.execute(payload)

  const maxContextTokens = project.config?.advancedSettings?.maxContextTokens ?? 8192

  // 2. 计算总token，并在超限时按优先级继续裁剪
  if (payload.totalTokensUsed > maxContextTokens) {
    const shrinkableSections = [
      {
        name: '向量检索上下文',
        get: () => payload.builtSections.vectorContext,
        set: (value: string) => { payload.builtSections.vectorContext = value },
        minTokens: 0
      },
      {
        name: '历史摘要',
        get: () => payload.builtSections.summary,
        set: (value: string) => { payload.builtSections.summary = value },
        minTokens: 120
      },
      {
        name: '世界观设定',
        get: () => payload.builtSections.worldInfo,
        set: (value: string) => { payload.builtSections.worldInfo = value },
        minTokens: 120
      },
      {
        name: '人物设定',
        get: () => payload.builtSections.characters,
        set: (value: string) => { payload.builtSections.characters = value },
        minTokens: 120
      },
      {
        name: '表格记忆',
        get: () => payload.builtSections.memoryTables,
        set: (value: string) => { payload.builtSections.memoryTables = value },
        minTokens: 120
      },
      {
        name: '最近章节',
        get: () => payload.builtSections.recentChapters,
        set: (value: string) => { payload.builtSections.recentChapters = value },
        minTokens: 200
      }
    ]

    const calculateTotalTokens = () =>
      estimateTokens(payload.builtSections.systemPrompt) +
      estimateTokens(payload.builtSections.authorsNote) +
      estimateTokens(payload.builtSections.worldInfo) +
      estimateTokens(payload.builtSections.characters) +
      estimateTokens(payload.builtSections.stateConstraints) +
      estimateTokens(payload.builtSections.memoryTables) +
      estimateTokens(payload.builtSections.vectorContext) +
      estimateTokens(payload.builtSections.summary) +
      estimateTokens(payload.builtSections.recentChapters) +
      estimateTokens(payload.builtSections.outline)

    let currentTotal = calculateTotalTokens()

    for (const section of shrinkableSections) {
      if (currentTotal <= maxContextTokens) break

      const currentText = section.get()
      if (!currentText) continue

      const currentTokens = estimateTokens(currentText)
      if (currentTokens <= section.minTokens) continue

      const overflowTokens = currentTotal - maxContextTokens
      const targetTokens = Math.max(section.minTokens, currentTokens - overflowTokens)
      const trimmedText = truncateToTokens(currentText, targetTokens)
      const trimmedTokens = estimateTokens(trimmedText)

      if (trimmedTokens < currentTokens) {
        section.set(trimmedText)
        payload.warnings.push(`为满足上下文预算，${section.name}已进一步裁剪 ${currentTokens - trimmedTokens} tokens`)
        currentTotal = calculateTotalTokens()
      }
    }
    payload.totalTokensUsed = currentTotal
  }

  // 3. 检查预算与注意力衰减警告
  if (payload.totalTokensUsed > maxContextTokens) {
    payload.warnings.push(`总token数(${payload.totalTokensUsed})超出最大上下文预算(${maxContextTokens})，已执行硬裁剪但仍存在超限风险`)
  } else if (payload.totalTokensUsed > maxContextTokens * 0.5) {
    payload.warnings.push(`当前上下文长度(${payload.totalTokensUsed} tokens)已超过最大容量的一半(${maxContextTokens / 2})，可能会出现AI注意力涣散（遗忘前文细节）`)
  }

  return {
    systemPrompt: payload.builtSections.systemPrompt,
    authorsNote: payload.builtSections.authorsNote,
    worldInfo: payload.builtSections.worldInfo,
    characters: payload.builtSections.characters,
    stateConstraints: payload.builtSections.stateConstraints,
    memoryTables: payload.builtSections.memoryTables,
    vectorContext: payload.builtSections.vectorContext,
    summary: payload.builtSections.summary,
    recentChapters: payload.builtSections.recentChapters,
    outline: payload.builtSections.outline,
    plotAnchors: payload.builtSections.plotAnchors || '',
    totalTokens: payload.totalTokensUsed,
    warnings: payload.warnings
  }
}

/**
 * Prompt 载荷：分离 system 和 user 角色
 */
export interface PromptPayload {
  systemMessage: string
  userMessage: string
}

/**
 * 将上下文转换为分角色 Prompt（V3 沙漏布局）
 *
 * 头部 (system)：刚性约束 + 人物设定 → 模型注意力最强
 * 中段 (user 前半)：世界观 + 记忆 + 向量召回 + 摘要 → 参考素材
 * 尾部 (user 后半)：最近正文 + 大纲 + 执行指令 → 模型注意力最强
 */
export function contextToPromptPayload(context: BuildContext, chapterTitle: string, targetWords: number = 2000): PromptPayload {
  // === System Message: 头部 — 最高注意力区，放不可违反的约束 ===
  const systemParts: string[] = []
  systemParts.push(context.systemPrompt)
  if (context.authorsNote) systemParts.push(context.authorsNote)

  // V4-D4: 档案员前置约束注入 — 让写手在生成时就知道哪些状态不可违背
  if (context.stateConstraints) {
    systemParts.push(context.stateConstraints)
  }

  // V3-fix: 只在 system 中放角色核心摘要（前 2000 字符），避免 system message 超限
  // 完整角色设定放到 user message 的中段
  const SYSTEM_CHAR_LIMIT = 2000
  if (context.characters) {
    const briefCharacters = context.characters.length > SYSTEM_CHAR_LIMIT
      ? context.characters.substring(0, SYSTEM_CHAR_LIMIT) + '\n...(角色设定已截断，完整版见下方上下文)'
      : context.characters
    systemParts.push('【核心角色约束 — 必须严格遵循】')
    systemParts.push(briefCharacters)
  }

  // === User Message: 中段素材 + 尾部指令 ===
  const userParts: string[] = []

  if (context.plotAnchors) {
    systemParts.push(context.plotAnchors)
  }

  // 中段：参考素材（注意力相对弱，放次要信息）
  // V3-fix: 如果角色设定被截断了，在 user 中放完整版
  if (context.characters && context.characters.length > SYSTEM_CHAR_LIMIT) {
    userParts.push('【完整角色设定】')
    userParts.push(context.characters)
  }
  if (context.worldInfo) {
    userParts.push('【世界观设定】')
    userParts.push(context.worldInfo)
  }
  if (context.memoryTables) {
    userParts.push('【记忆追踪】')
    userParts.push(context.memoryTables)
  }
  if (context.vectorContext) {
    userParts.push('【历史相关片段】')
    userParts.push(context.vectorContext)
  }
  if (context.summary) {
    userParts.push('【历史摘要】')
    userParts.push(context.summary)
  }

  // 尾部：最近正文 + 大纲 + 执行指令（最高注意力区）
  if (context.recentChapters) {
    userParts.push('【最近章节正文】')
    userParts.push(context.recentChapters)
  }
  if (context.outline) {
    userParts.push('【本章大纲】')
    userParts.push(context.outline)
  }

  userParts.push(`【写作执行指令 — 请严格遵循】`)
  userParts.push(`章节标题：${chapterTitle}`)
  userParts.push(`目标字数：约${targetWords}字`)
  userParts.push(`必须严格承接前文剧情，保持连贯性。`)
  userParts.push(`严格遵循记忆追踪中的角色状态、物品归属、关系等信息。`)
  userParts.push(`情节紧凑，引人入胜，场景描写生动，对话自然流畅。`)
  userParts.push(`直接返回章节内容文本，不要包含标题和其他说明。`)

  return {
    systemMessage: systemParts.join('\n\n'),
    userMessage: userParts.join('\n\n')
  }
}

/**
 * 向后兼容：将上下文转换为单条 prompt 字符串
 * 供 Chapters.vue 等旧调用方继续使用
 */
export function contextToPrompt(context: BuildContext, chapterTitle: string, targetWords: number = 2000): string {
  const payload = contextToPromptPayload(context, chapterTitle, targetWords)
  return payload.systemMessage + '\n\n' + payload.userMessage
}
