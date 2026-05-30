/**
 * ComposerAgent（作曲师）
 *
 * 根据 Planner 的输出，从项目的 Entity 和记忆库中组装最优上下文包（ContextPackage），
 * 构建 RuleStack，决定哪些伏笔/摘要/角色矩阵片段需要纳入本章上下文。
 */

import { getLogger } from '@/utils/logger'
import { safeParseAIJson } from '@/utils/safeParseAIJson'
import { sanitizeForPrompt } from '@/utils/inputSanitizer'
import { analyzeHookHealth } from '@/utils/hookHealthAnalyzer'
import { withRetry } from '@/utils/llmRetry'
import type { HookHealthInput } from '@/utils/hookHealthAnalyzer'
import type { Project } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'
import type { ChatResponse } from '@/types/ai'
import type {
  ComposeChapterInput,
  ComposeChapterOutput,
  ContextPackage,
  RuleStack,
  ComposeTrace,
  HookEntry,
} from '@/services/pipeline/types'

const logger = getLogger('agent:composer')

// 各上下文块的字符上限（参考 InkOS LEGACY_WRITER_CONTEXT_BUDGET）
const SECTION_LIMITS = {
  storyBible: 14000,
  currentState: 7000,
  hookSnapshot: 9000,
  chapterSummaries: 9000,
  characterMatrix: 12000,
  emotionalArcs: 7000,
  subplotBoard: 7000,
  volumeOutline: 12000,
  selectedEntities: 8000,
} as const

function clampText(text: string, maxChars: number): { text: string; trimmed: boolean } {
  if (text.length <= maxChars) return { text, trimmed: false }
  return { text: text.slice(0, maxChars - 20) + '\n\n[...已截断]', trimmed: true }
}

/**
 * 意图感知裁剪：根据 mustKeep 关键词列表对文本行进行相关性评分，
 * 高相关性行优先纳入上下文预算，不相关行缩减预算。
 * 当 mustKeep 为空时回退到 clampText 行为。
 */
function smartTrim(
  text: string,
  maxChars: number,
  sectionName: string,
  mustKeep?: string[],
): { text: string; trimmed: boolean } {
  // 无 mustKeep 或文本未超限，回退到简单截断
  if (!mustKeep || mustKeep.length === 0 || text.length <= maxChars) {
    return clampText(text, maxChars)
  }

  const keywords = mustKeep.filter(Boolean)
  if (keywords.length === 0) {
    return clampText(text, maxChars)
  }

  // 按行拆分（保留空行作为分隔）
  const lines = text.split('\n')

  // 计算每行的相关性得分
  const scoredLines = lines.map((line, index) => {
    const lowerLine = line.toLowerCase()
    let score = 0
    for (const kw of keywords) {
      const lowerKw = kw.toLowerCase()
      // 统计关键词在行中出现的次数
      let pos = 0
      while ((pos = lowerLine.indexOf(lowerKw, pos)) !== -1) {
        score += 1
        pos += lowerKw.length
      }
    }
    return { line, index, score }
  })

  // 按得分降序排列（得分相同时保持原始顺序）
  const sortedIndices = scoredLines
    .map((_, i) => i)
    .sort((a, b) => {
      const scoreDiff = scoredLines[b].score - scoredLines[a].score
      if (scoreDiff !== 0) return scoreDiff
      return a - b // 保持原始顺序
    })

  // 贪心填充：按相关性从高到低逐行纳入，直到预算耗尽
  const included = new Set<number>()
  let usedChars = 0
  for (const idx of sortedIndices) {
    const lineLen = scoredLines[idx].line.length + 1 // +1 for newline
    if (usedChars + lineLen <= maxChars - 20) {
      included.add(idx)
      usedChars += lineLen
    }
  }

  // 按原始顺序重建文本，未纳入的行标记为 [...省略]
  const resultLines: string[] = []
  let skipped = false
  for (let i = 0; i < lines.length; i++) {
    if (included.has(i)) {
      if (skipped) {
        resultLines.push('[...部分内容已省略]')
        skipped = false
      }
      resultLines.push(lines[i])
    } else {
      skipped = true
    }
  }
  if (skipped) {
    resultLines.push('[...部分内容已省略]')
  }

  const trimmed = resultLines.join('\n')
  const wasTrimmed = trimmed.length < text.length

  if (wasTrimmed) {
    logger.info(`[Composer] 智能裁剪 ${sectionName}: ${text.length}→${trimmed.length} 字符，关键词匹配 ${included.size}/${lines.length} 行`)
  }

  return { text: trimmed, trimmed: wasTrimmed }
}

/**
 * 从 Sandbox Entity 列表中提取关键实体卡片文本
 */
function buildEntityCards(entities: Entity[], maxChars: number): string {
  const cards: string[] = []
  let totalLen = 0

  // 按类型分组，角色优先
  const sorted = [...entities].sort((a, b) => {
    const priority: Record<string, number> = { CHARACTER: 0, LOCATION: 1, FACTION: 2, ITEM: 3, LORE: 4 }
    return (priority[a.type] ?? 9) - (priority[b.type] ?? 9)
  })

  for (const entity of sorted) {
    const card = `### ${entity.name}（${entity.type}）\n${entity.description || entity.systemPrompt || '(无描述)'}`
    if (totalLen + card.length + 2 > maxChars) break
    cards.push(card)
    totalLen += card.length + 2
  }

  return cards.join('\n\n')
}

/**
 * 从 StateEvent 列表提取最近状态变更摘要
 */
function buildStateEventSummary(events: StateEvent[], maxChars: number): string {
  const recent = events.slice(-30) // 最近30条事件
  const lines: string[] = []
  let totalLen = 0

  for (const event of recent) {
    const line = `- [${event.eventType}] ${event.entityId}: ${event.payload?.key || ''}${event.payload?.value ? '=' + event.payload.value : ''}`
    if (totalLen + line.length + 1 > maxChars) break
    lines.push(line)
    totalLen += line.length + 1
  }

  return lines.join('\n')
}

/**
 * 从项目大纲中提取当前卷大纲
 */
function buildVolumeOutline(project: Project, chapterNumber: number): string {
  const volumes = project.outline.volumes || []
  const currentVolume = volumes.find(
    v => chapterNumber >= v.startChapter && chapterNumber <= v.endChapter
  )

  if (!currentVolume) {
    // 如果找不到当前卷，返回总纲
    return [
      `# 总纲\n${project.outline.synopsis}`,
      `## 主题\n${project.outline.theme}`,
      `## 主线\n${project.outline.mainPlot?.description || ''}`,
    ].join('\n\n')
  }

  const parts = [
    `# 第${currentVolume.number}卷：${currentVolume.title}`,
    `## 卷主题：${currentVolume.theme}`,
    `## 章节范围：第${currentVolume.startChapter}章 - 第${currentVolume.endChapter}章`,
    `## 主要事件：\n${(currentVolume.mainEvents || []).map(e => `- ${e}`).join('\n')}`,
  ]

  // 添加当前卷的章节大纲
  const volumeChapters = (currentVolume.chapters || project.outline.chapters || [])
    .filter(ch => {
      const num = project.outline.chapters?.indexOf(ch)
      return num !== undefined && num >= currentVolume.startChapter - 1 && num <= currentVolume.endChapter - 1
    })
    .slice(0, 10)

  if (volumeChapters.length > 0) {
    parts.push('## 章节大纲：\n' + volumeChapters.map(ch => `- ${ch.title}: ${ch.goals?.join('、') || ''}`).join('\n'))
  }

  return parts.join('\n\n')
}

/**
 * 构建伏笔快照（按压力排序：高 advancePressure + resolvePressure 的伏笔优先）
 */
function buildHookSnapshot(hooks: HookEntry[], currentChapter: number): string {
  if (hooks.length === 0) return '（暂无活跃伏笔）'

  const active = hooks.filter(h => h.status !== 'resolved')
  const resolved = hooks.filter(h => h.status === 'resolved').slice(-5)

  // 计算伏笔健康诊断，获取压力分数
  let pressureSortedActive = [...active]
  if (active.length > 0) {
    try {
      const hookInputs: HookHealthInput[] = active.map(h => ({
        hookId: h.id,
        content: h.content,
        status: h.status,
        startChapter: h.chapterNumber,
        lastAdvancedChapter: h.lastAdvancedChapter || h.chapterNumber,
        advanceCount: h.advanceCount || 0,
        payoffTiming: h.payoffTiming,
        dependsOn: h.dependsOn,
      }))

      const healthResult = analyzeHookHealth({
        hooks: hookInputs,
        currentChapter,
      })

      // 按 advancePressure + resolvePressure 降序排列
      pressureSortedActive = [...active].sort((a, b) => {
        const diagA = healthResult.diagnostics.get(a.id)
        const diagB = healthResult.diagnostics.get(b.id)
        const pressureA = (diagA?.advancePressure || 0) + (diagA?.resolvePressure || 0)
        const pressureB = (diagB?.advancePressure || 0) + (diagB?.resolvePressure || 0)
        return pressureB - pressureA
      })

      logger.info(`[Composer] 伏笔压力排序完成: ${pressureSortedActive.length} 个活跃伏笔，前3压力值: ${
        pressureSortedActive.slice(0, 3).map(h => {
          const d = healthResult.diagnostics.get(h.id)
          return `${h.content.slice(0, 10)}(${(d?.advancePressure || 0) + (d?.resolvePressure || 0)})`
        }).join(', ')
      }`)
    } catch (err) {
      logger.warn(`[Composer] 伏笔健康分析失败，回退到默认排序:`, err)
    }
  }

  const parts: string[] = []
  if (pressureSortedActive.length > 0) {
    parts.push('## 活跃伏笔（按压力排序）\n' + pressureSortedActive.map(h =>
      `- [${h.status}] 第${h.chapterNumber}章: ${h.content}`
    ).join('\n'))
  }
  if (resolved.length > 0) {
    parts.push('## 最近已回收伏笔\n' + resolved.map(h =>
      `- 第${h.chapterNumber}章: ${h.content}`
    ).join('\n'))
  }

  return parts.join('\n\n')
}

/**
 * 根据项目配置和大纲构建规则栈
 */
function buildRuleStack(project: Project): RuleStack {
  const genreRules: string[] = []
  const bookRules: string[] = []
  const prohibitions: string[] = []

  // 题材规则
  const genre = project.genre || ''
  if (genre.includes('玄幻') || genre.includes('仙侠')) {
    genreRules.push('力量体系需自洽，不可凭空出现未铺垫的能力')
    genreRules.push('战斗描写注重招式细节和力量对比')
  } else if (genre.includes('都市')) {
    genreRules.push('现实逻辑约束，超自然元素需要合理解释')
  } else if (genre.includes('悬疑') || genre.includes('推理')) {
    genreRules.push('线索必须在揭示前铺垫')
    genreRules.push('逻辑自洽是第一优先级')
  }

  // 项目自定义规则
  if (project.config?.systemPrompts?.writer) {
    bookRules.push(project.config.systemPrompts.writer.slice(0, 500))
  }

  // 通用禁止事项
  prohibitions.push('不得泄露未来章节的信息')
  prohibitions.push('不得出现当前章节未出场的角色突然获知未发生之事')
  prohibitions.push('不得使用"仿佛"、"不禁"、"宛如"等AI标记词过多')

  const styleGuide = project.config?.styleProfile
    ? `文风：${project.config.styleProfile.tone || '均衡'}，叙述：${project.config.styleProfile.narrativePerspective || '第三人称'}，节奏：${project.config.styleProfile.pacing || '均衡'}`
    : '第三人称叙事，均衡节奏'

  return { genreRules, bookRules, prohibitions, styleGuide }
}

/**
 * ComposerAgent 主类
 */
export class ComposerAgent {
  private aiStore: any = null

  private async getAIStore() {
    if (!this.aiStore) {
      const { useAIStore } = await import('@/stores/ai')
      this.aiStore = useAIStore()
    }
    return this.aiStore
  }

  /**
   * 组装上下文包
   * 优先使用确定性逻辑组装，必要时用 LLM 辅助裁剪
   */
  async compose(input: ComposeChapterInput): Promise<ComposeChapterOutput> {
    const startTime = performance.now()
    logger.info(`[Composer] 开始为第${input.chapterNumber}章组装上下文`)

    const { project, plan, hookPool, chapterSummaries, characterMatrix,
            emotionalArcs, subplotBoard, entityGraph, stateEvents } = input

    // 提取 mustKeep 关键词列表（从 plan.output 或 plan.intent 中获取）
    const mustKeep: string[] = plan?.intent?.mustKeep || []

    // 1. 构建各上下文块
    const storyBible = this.buildStoryBible(project)
    const currentState = buildStateEventSummary(stateEvents, SECTION_LIMITS.currentState)
    const hookSnapshot = buildHookSnapshot(hookPool, input.chapterNumber)
    const volumeOutline = buildVolumeOutline(project, input.chapterNumber)
    const selectedEntities = buildEntityCards(entityGraph, SECTION_LIMITS.selectedEntities)

    // 2. 角色矩阵按 mustKeep 角色优先排序
    const processedCharacterMatrix = this.prioritizeCharacterMatrix(characterMatrix, mustKeep)

    // 3. 章节摘要按距离加权（最近章节优先）
    const processedChapterSummaries = this.prioritizeChapterSummaries(chapterSummaries)

    // 4. 裁剪各块到限制
    const trimmedSections: ComposeTrace['trimmedSections'] = []
    const trace: ComposeTrace = {
      selectedSections: [],
      trimmedSections,
      totalBudgetUsed: 0,
      totalBudgetAvailable: Object.values(SECTION_LIMITS).reduce((a, b) => a + b, 0),
    }

    const trimAndTrack = (text: string, limit: number, name: string): string => {
      // 使用 smartTrim 进行意图感知裁剪，回退到 clampText
      const { text: trimmed, trimmed: wasTrimmed } = smartTrim(text, limit, name, mustKeep)
      if (wasTrimmed) {
        trimmedSections.push({ section: name, originalChars: text.length, trimmedChars: trimmed.length })
      }
      trace.selectedSections.push(name)
      trace.totalBudgetUsed += trimmed.length
      return trimmed
    }

    const contextPackage: ContextPackage = {
      chapter: input.chapterNumber,
      storyBible: trimAndTrack(storyBible, SECTION_LIMITS.storyBible, 'storyBible'),
      currentState: trimAndTrack(currentState, SECTION_LIMITS.currentState, 'currentState'),
      hookSnapshot: trimAndTrack(hookSnapshot, SECTION_LIMITS.hookSnapshot, 'hookSnapshot'),
      chapterSummaries: trimAndTrack(processedChapterSummaries, SECTION_LIMITS.chapterSummaries, 'chapterSummaries'),
      characterMatrix: trimAndTrack(processedCharacterMatrix, SECTION_LIMITS.characterMatrix, 'characterMatrix'),
      emotionalArcs: trimAndTrack(emotionalArcs, SECTION_LIMITS.emotionalArcs, 'emotionalArcs'),
      subplotBoard: trimAndTrack(subplotBoard, SECTION_LIMITS.subplotBoard, 'subplotBoard'),
      volumeOutline: trimAndTrack(volumeOutline, SECTION_LIMITS.volumeOutline, 'volumeOutline'),
      recentChapters: [], // 将由 PipelineRunner 从 project.chapters 填充
      selectedEntities: trimAndTrack(selectedEntities, SECTION_LIMITS.selectedEntities, 'selectedEntities'),
    }

    const ruleStack = buildRuleStack(project)

    const elapsed = Math.round(performance.now() - startTime)
    logger.info(`[Composer] 上下文组装完成，耗时 ${elapsed}ms，已用预算 ${trace.totalBudgetUsed}/${trace.totalBudgetAvailable} 字符`)

    if (trimmedSections.length > 0) {
      logger.warn(`[Composer] 以下上下文块被截断:`, trimmedSections.map(t => `${t.section}(${t.originalChars}→${t.trimmedChars})`).join(', '))
    }

    return { contextPackage, ruleStack, trace }
  }

  /**
   * 构建故事圣经（世界观 + 主线 + 角色概述）
   */
  private buildStoryBible(project: Project): string {
    const parts: string[] = []

    // 基本信息
    parts.push(`# ${project.title}`)
    parts.push(`类型：${project.genre}`)
    parts.push(`简介：${project.description || '(无)'}`)

    // 大纲
    if (project.outline) {
      parts.push(`\n## 总纲\n${project.outline.synopsis || ''}`)
      parts.push(`主题：${project.outline.theme || ''}`)
      if (project.outline.mainPlot) {
        parts.push(`主线：${project.outline.mainPlot.description || project.outline.mainPlot.name || ''}`)
      }
    }

    // 世界观（Sandbox Entities中的世界观设定）
    const worldEntities = project._entities?.filter((e) =>
      e.type === 'LORE' || e.type === 'WORLD'
    ) || []
    if (worldEntities.length > 0) {
      parts.push('\n## 世界观设定')
      for (const entity of worldEntities.slice(0, 10)) {
        parts.push(`- ${entity.name}: ${(entity.description || '').slice(0, 200)}`)
      }
    }

    return parts.join('\n')
  }

  /**
   * 角色矩阵按 mustKeep 角色优先排序
   * 如果是纯文本，按行拆分，包含 mustKeep 角色名的行优先保留
   */
  private prioritizeCharacterMatrix(matrix: string, mustKeep: string[]): string {
    if (!matrix || mustKeep.length === 0) return matrix

    // 如果不是多行文本，直接返回
    const lines = matrix.split('\n')
    if (lines.length <= 1) return matrix

    const keywords = mustKeep.filter(Boolean).map(k => k.toLowerCase())
    if (keywords.length === 0) return matrix

    // 分为优先行和普通行
    const priorityLines: string[] = []
    const normalLines: string[] = []

    for (const line of lines) {
      const lowerLine = line.toLowerCase()
      const isPriority = keywords.some(kw => lowerLine.includes(kw))
      if (isPriority) {
        priorityLines.push(line)
      } else {
        normalLines.push(line)
      }
    }

    if (priorityLines.length > 0) {
      logger.info(`[Composer] 角色矩阵优先排序: ${priorityLines.length} 行匹配 mustKeep 角色`)
    }

    return [...priorityLines, ...normalLines].join('\n')
  }

  /**
   * 章节摘要按距离加权（最近章节优先）
   * 按行拆分后，最后几行（最近章节）排在前面
   */
  private prioritizeChapterSummaries(summaries: string): string {
    if (!summaries) return summaries

    const lines = summaries.split('\n')
    if (lines.length <= 3) return summaries

    // 最后 30% 的行视为"最近章节"，优先保留
    const recentCount = Math.max(1, Math.ceil(lines.length * 0.3))
    const recentLines = lines.slice(-recentCount)
    const olderLines = lines.slice(0, -recentCount)

    logger.info(`[Composer] 章节摘要距离加权: ${recentCount}/${lines.length} 行标记为最近章节`)

    // 最近章节在前，较早章节在后
    return [...recentLines, ...olderLines].join('\n')
  }

  /**
   * 使用 LLM 辅助选取最相关的上下文（高级模式）
   *
   * 触发条件：总章节数 >= 20 时自动启用 LLM 语义裁剪。
   * 流程：先调用 compose() 获取确定性结果（含 smartTrim），
   *       再对 chapterSummaries 和 characterMatrix 两个高占用块
   *       调用 LLM 进行语义相关性评分，仅保留 score >= 3 的条目。
   * 最多 2 次 LLM 调用（一个摘要、一个角色）。
   * LLM 调用失败时回退到 smartTrim 结果，不抛出错误。
   */
  async composeWithLLM(input: ComposeChapterInput): Promise<ComposeChapterOutput> {
    const startTime = performance.now()
    logger.info(`[Composer] composeWithLLM: 开始（第${input.chapterNumber}章）`)

    // 1. 先用确定性逻辑组装（已包含意图感知排序和智能裁剪）
    const result = await this.compose(input)

    // 2. 触发条件：总章节数 >= 20
    const totalChapters = input.project.chapters?.length || 0
    if (totalChapters < 20) {
      logger.info(`[Composer] 章节数 ${totalChapters} < 20，跳过 LLM 语义裁剪，返回确定性结果`)
      return result
    }

    logger.info(`[Composer] 长篇模式：章节数 ${totalChapters} >= 20，启用 LLM 语义裁剪`)

    // 3. 对两个高占用块进行 LLM 语义裁剪（最多 2 次 LLM 调用）
    const intentDescription = input.plan.intent.goal || ''
    const mustKeep = input.plan.intent.mustKeep || []

    // 调用 1/2：裁剪 chapterSummaries
    const trimmedSummaries = await this.trimBlockWithLLM(
      result.contextPackage.chapterSummaries,
      'chapterSummaries',
      intentDescription,
      mustKeep,
    )
    if (trimmedSummaries !== null) {
      logger.info(`[Composer] LLM 裁剪 chapterSummaries: ${result.contextPackage.chapterSummaries.length} → ${trimmedSummaries.length} 字符`)
      result.contextPackage.chapterSummaries = trimmedSummaries
    }

    // 调用 2/2：裁剪 characterMatrix
    const trimmedMatrix = await this.trimBlockWithLLM(
      result.contextPackage.characterMatrix,
      'characterMatrix',
      intentDescription,
      mustKeep,
    )
    if (trimmedMatrix !== null) {
      logger.info(`[Composer] LLM 裁剪 characterMatrix: ${result.contextPackage.characterMatrix.length} → ${trimmedMatrix.length} 字符`)
      result.contextPackage.characterMatrix = trimmedMatrix
    }

    const elapsed = Math.round(performance.now() - startTime)
    logger.info(`[Composer] composeWithLLM 完成，耗时 ${elapsed}ms`)

    return result
  }

  /**
   * 使用 LLM 对单个上下文块进行语义裁剪。
   * 将文本按行拆分为条目，让 LLM 评估每个条目与当前章节意图的相关性（1-5分），
   * 只保留 relevance >= 3 的条目。
   *
   * LLM 调用规格：
   * - 使用低复杂度模型 (complexity: 'low')
   * - 单次输入 < 2000 tokens，输出 < 500 tokens
   * - 最多重试 1 次
   *
   * LLM 调用失败时返回 null（回退到 smartTrim 确定性结果）。
   */
  private async trimBlockWithLLM(
    text: string,
    blockName: string,
    intentDescription: string,
    mustKeep: string[],
  ): Promise<string | null> {
    if (!text || text.trim().length === 0) {
      return null
    }

    // 按行拆分为条目
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    if (lines.length <= 3) {
      // 条目太少，无需裁剪
      return null
    }

    try {
      const aiStore = await this.getAIStore()

      // 截断每条条目以控制 token 预算（单次输入 < 2000 tokens ≈ 3000 字符）
      const MAX_LINE_CHARS = 300
      const truncatedLines = lines.map(line =>
        line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + '...' : line
      )

      // 构建条目列表（带索引）
      const itemsDescription = truncatedLines
        .map((line, index) => `[${index}] ${line}`)
        .join('\n')

      const mustKeepText = mustKeep.length > 0
        ? `\n必须保留的元素：${mustKeep.map(m => sanitizeForPrompt(m)).join('、')}`
        : ''

      const systemPrompt = '你是上下文裁剪专家。根据当前章节意图，评估每个条目的相关性。'
      const userPrompt = [
        `当前章节意图：${sanitizeForPrompt(intentDescription)}${mustKeepText}`,
        '',
        `以下是"${blockName}"中的条目列表：`,
        itemsDescription,
        '',
        '请评估每个条目与当前章节意图的相关性（1-5分，5分最相关）。',
        '返回 JSON 格式：{"items": [{"index": 0, "relevance": 4}, ...]}',
        '只返回 JSON，不要返回其他文字。',
      ].join('\n')

      // 使用 withRetry 包装 LLM 调用，最多重试 1 次
      const response: ChatResponse = await withRetry(
        () => aiStore.chat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          {
            type: 'check',
            complexity: 'low',
            priority: 'speed',
          },
          { maxTokens: 500, temperature: 0.3 }
        ),
        `Composer-LLMTrim-${blockName}`,
        { maxRetries: 1, baseDelayMs: 500, maxDelayMs: 5000 },
      )

      const content = response.content || ''
      const parsed = safeParseAIJson<{ items: Array<{ index: number; relevance: number }> }>(content)

      if (!parsed || !Array.isArray(parsed.items)) {
        logger.warn(`[Composer] LLM 裁剪 ${blockName} 返回格式无效，回退到确定性结果`)
        return null
      }

      // 只保留 relevance >= 3 的条目
      const keptIndices = new Set<number>()
      for (const item of parsed.items) {
        if (item.relevance >= 3 && item.index >= 0 && item.index < lines.length) {
          keptIndices.add(item.index)
        }
      }

      if (keptIndices.size === 0) {
        logger.warn(`[Composer] LLM 裁剪 ${blockName} 所有条目评分 < 3，回退到确定性结果`)
        return null
      }

      if (keptIndices.size >= lines.length) {
        // 所有条目都保留，无需裁剪
        logger.info(`[Composer] LLM 裁剪 ${blockName} 所有条目评分 >= 3，无需裁剪`)
        return null
      }

      // 按原始顺序重建文本
      const keptLines: string[] = []
      let skipped = false
      for (let i = 0; i < lines.length; i++) {
        if (keptIndices.has(i)) {
          if (skipped) {
            keptLines.push('[...低相关性内容已省略]')
            skipped = false
          }
          keptLines.push(lines[i])
        } else {
          skipped = true
        }
      }
      if (skipped) {
        keptLines.push('[...低相关性内容已省略]')
      }

      const trimmed = keptLines.join('\n')
      logger.info(`[Composer] LLM 语义裁剪 ${blockName}: ${lines.length} 条目 → 保留 ${keptIndices.size} 条目，${text.length} → ${trimmed.length} 字符`)

      return trimmed
    } catch (err) {
      logger.warn(`[Composer] LLM 裁剪 ${blockName} 失败，回退到确定性结果:`, err)
      return null
    }
  }
}

/**
 * 计算 LengthSpec
 */
export function buildLengthSpec(targetWordCount: number): {
  target: number
  softMin: number
  softMax: number
  hardMin: number
  hardMax: number
  countingMode: 'chars'
} {
  return {
    target: targetWordCount,
    softMin: Math.round(targetWordCount * 0.85),
    softMax: Math.round(targetWordCount * 1.15),
    hardMin: Math.round(targetWordCount * 0.7),
    hardMax: Math.round(targetWordCount * 1.5),
    countingMode: 'chars',
  }
}
