/**
 * 质量检查系统
 * 提供多维度质量评估和改进建议
 */

import type { Chapter, Outline } from '@/types'
import type { ResolvedEntity } from '@/stores/sandbox'

/**
 * 质量维度
 */
export interface QualityDimension {
  name: string
  score: number
  maxScore: number
  issues: QualityIssue[]
  suggestions: string[]
}

/**
 * 质量问题
 */
export interface QualityIssue {
  type: 'error' | 'warning' | 'info'
  message: string
  location?: string
  severity: number // 1-10，10最严重
}

/**
 * 质量检查结果
 */
export interface QualityReport {
  chapterId: string
  chapterNumber: number
  timestamp: Date
  overallScore: number
  dimensions: QualityDimension[]
  summary: string
  improvements: string[]
  details: string
}

/**
 * 质量检查规则配置
 */
export interface QualityCheckConfig {
  enablePlotCheck: boolean
  enableCharacterCheck: boolean
  enableWritingCheck: boolean
  enableLogicCheck: boolean
  enableInnovationCheck: boolean
  customRules: CustomRule[]
  qualityThreshold: number
  enableLLMJudge?: boolean
  llmJudgeWeight?: number
}

export interface LLMJudgeRequest {
  dimension: string
  content: string
  chapterNumber: number
  worldHint?: string
  characterHints?: string[]
}

export interface LLMJudgeResult {
  score: number
  issues?: string[]
  suggestions?: string[]
}

/**
 * 自定义规则
 */
export interface CustomRule {
  id: string
  name: string
  description: string
  pattern: string // 正则表达式或关键词
  type: 'regex' | 'keyword' | 'custom'
  severity: number
  enabled: boolean
}

/**
 * 解析 ResolvedEntity.properties 中的 JSON 字符串数组
 */
function parseJsonProperty(entity: ResolvedEntity, key: string): string[] {
  const raw = entity.properties[key]
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

/**
 * 质量检查器
 */
export class QualityChecker {
  private config: QualityCheckConfig
  private loreEntities?: ResolvedEntity[]
  private characters?: ResolvedEntity[]
  private _outline?: Outline

  constructor(
    config: QualityCheckConfig,
    loreEntities?: ResolvedEntity[],
    characters?: ResolvedEntity[],
    outline?: Outline,
    private llmJudge?: (request: LLMJudgeRequest) => Promise<LLMJudgeResult | null>
  ) {
    this.config = config
    this.loreEntities = loreEntities
    this.characters = characters
    this._outline = outline
  }

  /**
   * 检查单个章节
   */
  async checkChapter(
    chapter: Chapter,
    onProgress?: (progress: number) => void
  ): Promise<QualityReport> {
    const dimensions: QualityDimension[] = []
    let progress = 0

    // 情节质量检查
    if (this.config.enablePlotCheck) {
      const plotDimension = await this.checkPlotQuality(chapter)
      dimensions.push(plotDimension)
      progress += 20
      onProgress?.(progress)
    }

    // 人物塑造检查
    if (this.config.enableCharacterCheck) {
      const characterDimension = await this.checkCharacterQuality(chapter)
      dimensions.push(characterDimension)
      progress += 20
      onProgress?.(progress)
    }

    // 文笔水平检查
    if (this.config.enableWritingCheck) {
      const writingDimension = await this.checkWritingQuality(chapter)
      dimensions.push(writingDimension)
      progress += 20
      onProgress?.(progress)
    }

    // 逻辑一致性检查
    if (this.config.enableLogicCheck) {
      const logicDimension = await this.checkLogicConsistency(chapter)
      dimensions.push(logicDimension)
      progress += 20
      onProgress?.(progress)
    }

    // 创新性检查
    if (this.config.enableInnovationCheck) {
      const innovationDimension = await this.checkInnovation(chapter)
      dimensions.push(innovationDimension)
      progress += 20
      onProgress?.(progress)
    }

    // 计算总分
    const overallScore = this.calculateOverallScore(dimensions)

    // 生成总结和改进建议
    const summary = this.generateSummary(dimensions, overallScore)
    const improvements = this.generateImprovements(dimensions)
    const details = this.generateDetails(dimensions)

    return {
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      timestamp: new Date(),
      overallScore,
      dimensions,
      summary,
      improvements,
      details
    }
  }

  /**
   * 批量检查多个章节
   */
  async checkChapters(
    chapters: Chapter[],
    onProgress?: (current: number, total: number, chapterNumber: number) => void
  ): Promise<QualityReport[]> {
    const reports: QualityReport[] = []

    for (let i = 0; i < chapters.length; i++) {
      const report = await this.checkChapter(chapters[i], (_progress) => {
        onProgress?.(i + 1, chapters.length, chapters[i].number)
      })
      reports.push(report)
    }

    return reports
  }

  /**
   * 情节质量检查
   */
  private async checkPlotQuality(chapter: Chapter): Promise<QualityDimension> {
    const issues: QualityIssue[] = []
    const suggestions: string[] = []
    const content = chapter.content
    let score = 10

    // 检查冲突设置
    const conflictPatterns = [
      /冲突|矛盾|对抗|斗争|竞争/,
      /危机|困境|挑战|难关/,
      /敌人|对手|反派/
    ]
    const hasConflict = conflictPatterns.some(pattern => pattern.test(content))
    if (!hasConflict && content.length > 1000) {
      issues.push({
        type: 'warning',
        message: '未检测到明显的冲突或矛盾设置',
        severity: 4
      })
      suggestions.push('建议增加情节冲突，推动故事发展')
      score -= 1
    }

    // 检查节奏变化
    const paragraphs = content.split('\n').filter(p => p.trim().length > 0)
    const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length

    if (avgParagraphLength < 50) {
      issues.push({
        type: 'warning',
        message: '段落过短，可能影响节奏感',
        severity: 3
      })
      suggestions.push('建议适当延长重要段落的描写，增强节奏感')
      score -= 0.5
    } else if (avgParagraphLength > 300) {
      issues.push({
        type: 'info',
        message: '段落较长，可能影响阅读节奏',
        severity: 2
      })
      suggestions.push('建议适当分段，提高可读性')
      score -= 0.3
    }

    // 检查情节推进
    const progressionIndicators = ['于是', '然后', '接着', '随后', '这时', '突然', '忽然']
    const progressionCount = progressionIndicators.filter(word => content.includes(word)).length

    if (progressionCount < 2 && content.length > 2000) {
      issues.push({
        type: 'warning',
        message: '情节推进标记较少，可能缺乏流畅性',
        severity: 3
      })
      suggestions.push('建议增加情节推进的过渡语句')
      score -= 0.5
    }

    // 检查高潮设置
    const climaxPatterns = [
      /高潮|巅峰|顶点|极限/,
      /决战|最后|终局|关键时刻/,
      /爆发|释放|觉醒|突破/
    ]
    const hasClimax = climaxPatterns.some(pattern => pattern.test(content))
    if (!hasClimax && content.length > 3000) {
      issues.push({
        type: 'info',
        message: '未检测到明显的高潮点',
        severity: 2
      })
      suggestions.push('可以考虑设置情节高潮点，提升戏剧性')
      score -= 0.3
    }

    const baseDimension: QualityDimension = {
      name: '情节质量',
      score: Math.max(0, score),
      maxScore: 10,
      issues,
      suggestions
    }

    return this.applyLLMJudgeDimension(chapter, baseDimension)
  }

  /**
   * 人物塑造检查
   */
  private async checkCharacterQuality(chapter: Chapter): Promise<QualityDimension> {
    const issues: QualityIssue[] = []
    const suggestions: string[] = []
    const content = chapter.content
    let score = 10

    // 获取章节中的人物
    const chapterCharacters = this.getChapterCharacters(chapter)

    if (chapterCharacters.length === 0) {
      issues.push({
        type: 'warning',
        message: '未检测到人物出场',
        severity: 5
      })
      suggestions.push('建议明确章节中的出场人物')
      score -= 2
    } else {
      // 检查人物对话
      const dialogues = this.extractDialogues(content)
      if (dialogues.length === 0 && content.length > 2000) {
        issues.push({
          type: 'warning',
          message: '章节缺少人物对话',
          severity: 3
        })
        suggestions.push('建议增加人物对话，展现人物性格')
        score -= 1
      }

      // 检查人物描写
      chapterCharacters.forEach(charName => {
        const character = this.characters?.find(c =>
          c.name === charName || c.aliases.includes(charName)
        )

        if (character) {
          // 检查性格展现
          const personality = parseJsonProperty(character, 'personality')
          const personalityPatterns = personality.map(p => new RegExp(p, 'i'))
          const hasPersonality = personalityPatterns.some(pattern => pattern.test(content))

          if (!hasPersonality && dialogues.length > 3) {
            issues.push({
              type: 'info',
              message: `人物"${charName}"的性格特征展现不足`,
              severity: 2
            })
            suggestions.push(`建议通过对话或行为展现"${charName}"的性格特征：${personality.join('、')}`)
            score -= 0.5
          }
        }
      })

      // 检查人物关系
      if (chapterCharacters.length >= 2) {
        const hasInteraction = this.checkCharacterInteraction(content, chapterCharacters)
        if (!hasInteraction) {
          issues.push({
            type: 'info',
            message: '多个人物出场，但缺少互动描写',
            severity: 2
          })
          suggestions.push('建议增加人物之间的互动，展现人物关系')
          score -= 0.5
        }
      }
    }

    return {
      name: '人物塑造',
      score: Math.max(0, score),
      maxScore: 10,
      issues,
      suggestions
    }
  }

  /**
   * 文笔水平检查
   */
  private async checkWritingQuality(chapter: Chapter): Promise<QualityDimension> {
    const issues: QualityIssue[] = []
    const suggestions: string[] = []
    const content = chapter.content
    let score = 10

    // 检查句子流畅度
    const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 0)
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length

    if (avgSentenceLength > 100) {
      issues.push({
        type: 'warning',
        message: '句子偏长，可能影响阅读流畅度',
        severity: 3
      })
      suggestions.push('建议适当拆分长句，提高可读性')
      score -= 0.5
    } else if (avgSentenceLength < 15) {
      issues.push({
        type: 'info',
        message: '句子偏短，可能显得琐碎',
        severity: 2
      })
      suggestions.push('建议适当合并短句，增强连贯性')
      score -= 0.3
    }

    // 检查描写丰富度
    const descriptionPatterns = [
      /描写|形容|仿佛|好像|如同|宛如/,
      /看到|听到|感到|闻到|触摸/,
      /美丽|壮观|宏伟|精致|细腻/
    ]
    const descriptionCount = descriptionPatterns.filter(pattern => pattern.test(content)).length

    if (descriptionCount < 2 && content.length > 2000) {
      issues.push({
        type: 'info',
        message: '描写不够丰富',
        severity: 2
      })
      suggestions.push('建议增加环境、动作、心理等方面的描写')
      score -= 0.5
    }

    // 检查对话自然度
    const dialogues = this.extractDialogues(content)
    const unnaturalDialogues = dialogues.filter(d => {
      // 检查不自然的对话（过长、过于书面化等）
      return d.length > 200 || /[；：]/.test(d)
    })

    if (unnaturalDialogues.length > dialogues.length * 0.3) {
      issues.push({
        type: 'warning',
        message: '部分对话不够自然',
        severity: 3
      })
      suggestions.push('建议优化对话，使其更加口语化、自然')
      score -= 0.5
    }

    // 检查重复用词
    const wordFreq = this.analyzeWordFrequency(content)
    const repeatedWords = Object.entries(wordFreq)
      .filter(([word, count]) => count > 10 && word.length >= 2)
      .map(([word]) => word)

    if (repeatedWords.length > 0) {
      issues.push({
        type: 'info',
        message: `存在重复用词：${repeatedWords.slice(0, 5).join('、')}`,
        severity: 2
      })
      suggestions.push('建议使用同义词替换部分重复用词')
      score -= 0.3
    }

    // 检查比喻和修辞
    const metaphorPatterns = [/像|如|似|仿佛|好像/, /比喻|象征|隐喻/]
    const hasMetaphor = metaphorPatterns.some(pattern => pattern.test(content))

    if (!hasMetaphor && content.length > 3000) {
      issues.push({
        type: 'info',
        message: '缺少修辞手法',
        severity: 1
      })
      suggestions.push('建议适当使用比喻、拟人等修辞手法，增强表现力')
      score -= 0.2
    }

    const baseDimension: QualityDimension = {
      name: '文笔水平',
      score: Math.max(0, score),
      maxScore: 10,
      issues,
      suggestions
    }

    return this.applyLLMJudgeDimension(chapter, baseDimension)
  }

  /**
   * 逻辑一致性检查
   */
  private async checkLogicConsistency(chapter: Chapter): Promise<QualityDimension> {
    const issues: QualityIssue[] = []
    const suggestions: string[] = []
    const content = chapter.content
    let score = 10

    // 检查世界观设定一致性
    if (this.loreEntities && this.loreEntities.length > 0) {
      // 检查力量体系
      const powerSystemEntities = this.loreEntities.filter(e => e.category === '力量体系')
      if (powerSystemEntities.length > 0) {
        const levelNames: string[] = []
        powerSystemEntities.forEach(entity => {
          const levelsRaw = entity.properties['levels']
          if (levelsRaw) {
            try {
              const levels = JSON.parse(levelsRaw)
              if (Array.isArray(levels)) {
                levels.forEach((l: { name?: string }) => { if (l.name) levelNames.push(l.name) })
              }
            } catch { /* ignore parse errors */ }
          }
        })
        const mentionedLevels = levelNames.filter(level => content.includes(level))
        if (mentionedLevels.length > 0) {
          // 可以进一步检查力量等级的使用是否合理
        }
      }

      // 检查地点
      const locationEntities = this.loreEntities.filter(e => e.type === 'LOCATION')
      locationEntities.forEach(loc => {
        if (content.includes(loc.name)) {
          const description = loc.properties['description'] || ''
          if (description && content.includes(description)) {
            // 描述一致
          }
        }
      })

      // 检查规则
      const ruleEntities = this.loreEntities.filter(e => e.category === '规则')
      ruleEntities.forEach(rule => {
        if (content.includes(rule.name)) {
          // 规则被提及，可以检查使用是否正确
        }
      })
    }

    // 检查时间线一致性
    const timeIndicators = ['昨天', '今天', '明天', '昨天晚上', '今天早上', '刚才', '之后', '之前']
    const hasTimeInconsistency = this.checkTimeConsistency(content, timeIndicators)

    if (hasTimeInconsistency) {
      issues.push({
        type: 'warning',
        message: '可能存在时间线不一致的问题',
        severity: 4
      })
      suggestions.push('建议检查时间线的连贯性')
      score -= 1
    }

    // 检查人物状态一致性
    const chapterCharacters = this.getChapterCharacters(chapter)
    chapterCharacters.forEach(charName => {
      const character = this.characters?.find(c =>
        c.name === charName || c.aliases.includes(charName)
      )

      if (character) {
        // 检查能力使用是否符合设定
        character.abilities.forEach(ability => {
          if (content.includes(ability.name)) {
            // 检查能力描述是否一致
            const abilityDesc = character.properties[`ability_desc_${ability.name}`] || ''
            if (abilityDesc && !content.includes(abilityDesc.substring(0, 10))) {
              // 可能不一致
            }
          }
        })

        // 检查外貌描述一致性
        const appearance = character.properties['appearance'] || ''
        if (appearance && content.includes(character.name)) {
          const _appearanceKeywords = appearance.split(/[，,、]/).filter(k => k.trim())
          // 可以检查外貌关键词是否出现
        }
      }
    })

    // 检查因果关系
    const causalPatterns = ['因为', '所以', '由于', '因此', '导致', '使得', '于是']
    const hasCausalRelationship = causalPatterns.some(pattern => content.includes(pattern))

    if (!hasCausalRelationship && content.length > 3000) {
      issues.push({
        type: 'info',
        message: '缺少明显的因果关系描述',
        severity: 2
      })
      suggestions.push('建议增加因果关系，增强情节逻辑性')
      score -= 0.3
    }

    return {
      name: '逻辑一致性',
      score: Math.max(0, score),
      maxScore: 10,
      issues,
      suggestions
    }
  }

  /**
   * 创新性检查
   */
  private async checkInnovation(chapter: Chapter): Promise<QualityDimension> {
    const issues: QualityIssue[] = []
    const suggestions: string[] = []
    const content = chapter.content
    let score = 10

    // 检查情节创新性
    const commonPatterns = [
      /英雄救美/,
      /逆袭成功/,
      /意外获得/,
      /天赋觉醒/,
      /神秘老人/,
      /世家子弟/,
      /废柴逆袭/
    ]
    const usedCommonPatterns = commonPatterns.filter(pattern => pattern.test(content))

    if (usedCommonPatterns.length > 2) {
      issues.push({
        type: 'warning',
        message: '使用了较多常见情节套路',
        severity: 3
      })
      suggestions.push('建议在传统套路基础上增加创新元素')
      score -= 1
    }

    // 检查人物设定创新性
    const chapterCharacters = this.getChapterCharacters(chapter)
    chapterCharacters.forEach(charName => {
      const character = this.characters?.find(c =>
        c.name === charName || c.aliases.includes(charName)
      )

      if (character) {
        // 检查性格组合是否常见
        const personality = parseJsonProperty(character, 'personality')
        const commonPersonalityCombos = [
          ['冷漠', '高傲'],
          ['热情', '开朗'],
          ['腹黑', '聪明'],
          ['善良', '温柔']
        ]

        const isCommonCombo = commonPersonalityCombos.some(combo =>
          combo.every(p => personality.includes(p))
        )

        if (isCommonCombo) {
          issues.push({
            type: 'info',
            message: `人物"${charName}"的性格组合较为常见`,
            severity: 1
          })
          suggestions.push(`建议为"${charName}"增加独特的性格特征`)
          score -= 0.2
        }
      }
    })

    // 检查世界观创新性
    if (this.loreEntities) {
      const powerSystemEntities = this.loreEntities.filter(e => e.category === '力量体系')
      if (powerSystemEntities.length > 0) {
        const commonPowerSystems = ['修仙', '魔法', '斗气', '武魂', '异能']
        const powerSystemName = powerSystemEntities.map(e => e.properties['name'] || e.name).join('')

        if (commonPowerSystems.some(sys => powerSystemName.includes(sys))) {
          issues.push({
            type: 'info',
            message: '力量体系属于常见类型',
            severity: 1
          })
          suggestions.push('建议在力量体系中增加独特设定')
          score -= 0.3
        }
      }
    }

    // 检查创新元素
    const innovationIndicators = ['独创', '独特', '前所未有', '新颖', '奇特', '与众不同']
    const hasInnovation = innovationIndicators.some(word => content.includes(word))

    if (hasInnovation) {
      score += 0.5
    }

    // 检查是否有反转
    const twistPatterns = ['反转', '意想不到', '出乎意料', '原来', '竟然']
    const hasTwist = twistPatterns.some(pattern => content.includes(pattern))

    if (hasTwist) {
      score += 0.3
      suggestions.push('情节反转设置良好，增加了创新性')
    }

    return {
      name: '创新性',
      score: Math.min(10, Math.max(0, score)),
      maxScore: 10,
      issues,
      suggestions
    }
  }

  /**
   * 计算总分
   */
  private calculateOverallScore(dimensions: QualityDimension[]): number {
    if (dimensions.length === 0) return 0

    const totalScore = dimensions.reduce((sum, dim) => sum + dim.score, 0)
    const maxTotalScore = dimensions.reduce((sum, dim) => sum + dim.maxScore, 0)

    return Math.round((totalScore / maxTotalScore) * 10 * 10) / 10
  }

  /**
   * 生成总结
   */
  private generateSummary(dimensions: QualityDimension[], overallScore: number): string {
    const scoreLevel = overallScore >= 8 ? '优秀' : overallScore >= 6 ? '良好' : overallScore >= 4 ? '一般' : '需改进'

    const strongDimensions = dimensions.filter(d => d.score >= 8)
    const weakDimensions = dimensions.filter(d => d.score < 6)

    let summary = `本章质量评分为 ${overallScore}/10，属于${scoreLevel}水平。`

    if (strongDimensions.length > 0) {
      summary += `在${strongDimensions.map(d => d.name).join('、')}方面表现优秀。`
    }

    if (weakDimensions.length > 0) {
      summary += `${weakDimensions.map(d => d.name).join('、')}方面有待提升。`
    }

    return summary
  }

  /**
   * 生成改进建议
   */
  private generateImprovements(dimensions: QualityDimension[]): string[] {
    const improvements: string[] = []

    dimensions.forEach(dim => {
      if (dim.score < 7) {
        improvements.push(...dim.suggestions)
      }
    })

    // 去重并限制数量
    return [...new Set(improvements)].slice(0, 5)
  }

  /**
   * 生成详细报告
   */
  private generateDetails(dimensions: QualityDimension[]): string {
    const parts: string[] = []

    dimensions.forEach(dim => {
      parts.push(`\n## ${dim.name} (${dim.score}/${dim.maxScore})`)

      if (dim.issues.length > 0) {
        parts.push('\n### 发现的问题：')
        dim.issues.forEach(issue => {
          parts.push(`- [${issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '提示'}] ${issue.message}`)
        })
      }

      if (dim.suggestions.length > 0) {
        parts.push('\n### 改进建议：')
        dim.suggestions.forEach(suggestion => {
          parts.push(`- ${suggestion}`)
        })
      }
    })

    return parts.join('\n')
  }

  private async applyLLMJudgeDimension(
    chapter: Chapter,
    baseDimension: QualityDimension
  ): Promise<QualityDimension> {
    if (!this.config.enableLLMJudge || !this.llmJudge) {
      return baseDimension
    }

    try {
      const result = await this.llmJudge({
        dimension: baseDimension.name,
        content: chapter.content,
        chapterNumber: chapter.number,
        worldHint: this.loreEntities?.map(e => e.name).slice(0, 5).join('、'),
        characterHints: this.characters?.map(c => c.name).slice(0, 10)
      })

      if (!result) {
        return baseDimension
      }

      const judgeScore = Math.min(10, Math.max(0, result.score))
      const weight = Math.min(1, Math.max(0, this.config.llmJudgeWeight ?? 0.4))

      const mergedScore = Math.min(
        10,
        Math.max(
          0,
          Number((baseDimension.score * (1 - weight) + judgeScore * weight).toFixed(1))
        )
      )

      const llmIssues: QualityIssue[] = (result.issues || []).slice(0, 3).map(message => ({
        type: 'info',
        message: `[LLM评估] ${message}`,
        severity: 2
      }))

      const mergedSuggestions = [
        ...baseDimension.suggestions,
        ...(result.suggestions || [])
      ]

      return {
        ...baseDimension,
        score: mergedScore,
        issues: [...baseDimension.issues, ...llmIssues],
        suggestions: [...new Set(mergedSuggestions)]
      }
    } catch (error) {
      console.warn('[QualityChecker] LLM评估失败，回退到规则评估:', error)
      return baseDimension
    }
  }

  /**
   * 辅助方法：提取章节中的人物
   */
  private getChapterCharacters(chapter: Chapter): string[] {
    const content = chapter.content
    const characters: string[] = []

    if (this.characters) {
      this.characters.forEach(char => {
        // 检查人物名称或别名是否在内容中
        if (content.includes(char.name)) {
          characters.push(char.name)
        } else {
          const aliasFound = char.aliases.some(alias => content.includes(alias))
          if (aliasFound) {
            characters.push(char.name)
          }
        }
      })
    }

    return characters
  }

  /**
   * 辅助方法：提取对话
   */
  private extractDialogues(content: string): string[] {
    const dialogues: string[] = []
    const patterns = [
      /"([^"]+)"/g,
      /"([^"]+)"/g,
      /「([^」]+)」/g
    ]

    patterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        dialogues.push(match[1])
      }
    })

    return dialogues
  }

  /**
   * 辅助方法：检查人物互动
   */
  private checkCharacterInteraction(content: string, characters: string[]): boolean {
    // 检查人物之间是否有对话、动作互动等
    const dialogues = this.extractDialogues(content)

    // 检查是否有多个不同人物说话
    let differentSpeakers = 0
    characters.forEach(char => {
      if (content.includes(char) && dialogues.length > 0) {
        differentSpeakers++
      }
    })

    return differentSpeakers >= 2 || dialogues.length >= 2
  }

  /**
   * 辅助方法：检查时间一致性
   */
  private checkTimeConsistency(content: string, timeIndicators: string[]): boolean {
    // 简单的时间一致性检查
    // 实际应用中可以更复杂
    const timePositions: { indicator: string; position: number }[] = []

    timeIndicators.forEach(indicator => {
      const index = content.indexOf(indicator)
      if (index !== -1) {
        timePositions.push({ indicator, position: index })
      }
    })

    // 如果时间指示词太多且顺序混乱，可能不一致
    if (timePositions.length > 5) {
      timePositions.sort((a, b) => a.position - b.position)
      // 可以添加更复杂的逻辑
    }

    return false // 简化处理，实际需要更复杂的逻辑
  }

  /**
   * 辅助方法：分析词频
   */
  private analyzeWordFrequency(content: string): Record<string, number> {
    const wordFreq: Record<string, number> = {}
    const words = content.match(/[\u4e00-\u9fa5]{2,}/g) || []

    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1
    })

    return wordFreq
  }
}

/**
 * 默认质量检查配置
 */
export const DEFAULT_QUALITY_CHECK_CONFIG: QualityCheckConfig = {
  enablePlotCheck: true,
  enableCharacterCheck: true,
  enableWritingCheck: true,
  enableLogicCheck: true,
  enableInnovationCheck: true,
  customRules: [],
  qualityThreshold: 7,
  enableLLMJudge: false,
  llmJudgeWeight: 0.4
}

/**
 * 创建质量检查器
 */
export function createQualityChecker(
  loreEntities?: ResolvedEntity[],
  characters?: ResolvedEntity[],
  outline?: Outline,
  config?: Partial<QualityCheckConfig>,
  llmJudge?: (request: LLMJudgeRequest) => Promise<LLMJudgeResult | null>
): QualityChecker {
  const finalConfig = {
    ...DEFAULT_QUALITY_CHECK_CONFIG,
    ...config
  }

  return new QualityChecker(finalConfig, loreEntities, characters, outline, llmJudge)
}

/**
 * 生成质量趋势分析
 */
export function analyzeQualityTrend(reports: QualityReport[]): {
  averageScore: number
  scoreTrend: 'improving' | 'stable' | 'declining'
  dimensionTrends: Record<string, { trend: string; scores: number[] }>
  recommendations: string[]
} {
  if (reports.length === 0) {
    return {
      averageScore: 0,
      scoreTrend: 'stable',
      dimensionTrends: {},
      recommendations: []
    }
  }

  // 计算平均分
  const averageScore = reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length

  // 分析趋势
  const scores = reports.map(r => r.overallScore)
  let scoreTrend: 'improving' | 'stable' | 'declining' = 'stable'

  if (scores.length >= 3) {
    const recent = scores.slice(-3)
    const trend = recent[recent.length - 1] - recent[0]
    if (trend > 0.5) {
      scoreTrend = 'improving'
    } else if (trend < -0.5) {
      scoreTrend = 'declining'
    }
  }

  // 分析各维度趋势
  const dimensionTrends: Record<string, { trend: string; scores: number[] }> = {}

  if (reports[0].dimensions.length > 0) {
    reports[0].dimensions.forEach(dim => {
      const dimScores = reports.map(r => {
        const d = r.dimensions.find(d => d.name === dim.name)
        return d ? d.score : 0
      })

      const dimTrend = dimScores.length >= 3
        ? dimScores[dimScores.length - 1] - dimScores[dimScores.length - 3] > 0.5
          ? '上升'
          : dimScores[dimScores.length - 1] - dimScores[dimScores.length - 3] < -0.5
          ? '下降'
          : '稳定'
        : '稳定'

      dimensionTrends[dim.name] = {
        trend: dimTrend,
        scores: dimScores
      }
    })
  }

  // 生成建议
  const recommendations: string[] = []

  Object.entries(dimensionTrends).forEach(([name, data]) => {
    if (data.trend === '下降') {
      recommendations.push(`${name}呈下降趋势，建议重点关注`)
    }
  })

  if (scoreTrend === 'improving') {
    recommendations.push('整体质量呈上升趋势，继续保持')
  } else if (scoreTrend === 'declining') {
    recommendations.push('整体质量呈下降趋势，需要及时调整')
  }

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    scoreTrend,
    dimensionTrends,
    recommendations
  }
}
