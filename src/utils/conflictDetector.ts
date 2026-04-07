/**
 * 冲突检测器 - 检测小说中的前后矛盾和不一致问题
 *
 * 核心功能：
 * 1. 人物设定冲突检测（性格、能力、外貌）
 * 2. 时间线冲突检测（事件顺序、时间跨度、年龄）
 * 3. 世界观不一致检测（规则、设定）
 * 4. 情节逻辑漏洞检测
 * 5. 伏笔检测
 */

import type { Project, Chapter, Character, WorldSetting } from '@/types'
import type {
  ConflictReport,
  ConflictDetectionConfig,
  ConflictDetectionResult,
  ConflictType} from '@/types/conflicts'
import { v4 as uuidv4 } from 'uuid'

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ConflictDetectionConfig = {
  enableCharacterConflicts: true,
  enableTimelineConflicts: true,
  enableWorldConflicts: true,
  enablePlotLogicConflicts: true,
  enableForeshadowingConflicts: true,
  personalityChangeThreshold: 0.7,
  timeDurationTolerance: 7,
  ageErrorTolerance: 1,
  minConfidenceThreshold: 0.6,
  ignoreMarkedConflicts: true
}

/**
 * 冲突检测器类
 */
export class ConflictDetector {
  private config: ConflictDetectionConfig
  private project: Project
  private conflicts: ConflictReport[] = []

  constructor(project: Project, config?: Partial<ConflictDetectionConfig>) {
    this.project = project
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 执行完整的冲突检测
   */
  async detect(): Promise<ConflictDetectionResult> {
    const startTime = Date.now()
    this.conflicts = []

    console.log('[冲突检测] 开始检测...')

    // 1. 人物设定冲突检测
    if (this.config.enableCharacterConflicts) {
      console.log('[冲突检测] 检测人物设定冲突...')
      await this.detectCharacterConflicts()
    }

    // 2. 时间线冲突检测
    if (this.config.enableTimelineConflicts) {
      console.log('[冲突检测] 检测时间线冲突...')
      await this.detectTimelineConflicts()
    }

    // 3. 世界观冲突检测
    if (this.config.enableWorldConflicts) {
      console.log('[冲突检测] 检测世界观冲突...')
      await this.detectWorldConflicts()
    }

    // 4. 情节逻辑检测
    if (this.config.enablePlotLogicConflicts) {
      console.log('[冲突检测] 检测情节逻辑...')
      await this.detectPlotLogicConflicts()
    }

    // 5. 伏笔检测
    if (this.config.enableForeshadowingConflicts) {
      console.log('[冲突检测] 检测伏笔...')
      await this.detectForeshadowingConflicts()
    }

    const duration = Date.now() - startTime
    console.log(`[冲突检测] 检测完成，耗时 ${duration}ms，发现 ${this.conflicts.length} 个冲突`)

    // 生成统计信息
    const statistics = this.generateStatistics()

    return {
      detectedAt: new Date(),
      duration,
      config: this.config,
      conflicts: this.conflicts,
      statistics,
      warnings: []
    }
  }

  /**
   * 检测人物设定冲突
   */
  private async detectCharacterConflicts(): Promise<void> {
    const chapters = this.project.chapters || []
    const characters = this.project.characters || []

    for (const character of characters) {
      // 检测性格变化
      await this.detectPersonalityConflicts(character, chapters)

      // 检测能力矛盾
      await this.detectAbilityConflicts(character, chapters)

      // 检测外貌不一致
      await this.detectAppearanceConflicts(character, chapters)
    }
  }

  /**
   * 检测人物性格冲突
   */
  private async detectPersonalityConflicts(
    character: Character,
    chapters: Chapter[]
  ): Promise<void> {
    const personalityKeywords: Record<string, string[]> = {
      '勇敢': ['勇敢', '无畏', '大胆', '英勇'],
      '胆小': ['胆小', '怯懦', '畏缩', '害怕'],
      '善良': ['善良', '仁慈', '温柔', '和善'],
      '冷酷': ['冷酷', '无情', '冷漠', '残忍'],
      '聪明': ['聪明', '机智', '智慧', '睿智'],
      '愚笨': ['愚蠢', '笨拙', '愚笨', '迟钝'],
      '开朗': ['开朗', '乐观', '活泼', '阳光'],
      '阴沉': ['阴沉', '悲观', '忧郁', '沉闷']
    }

    // 获取人物性格设定
    const _basePersonalities = character.personality || []

    // 在各章节中搜索性格描述
    const appearances: Array<{ chapter: number; text: string; traits: string[] }> = []

    for (const chapter of chapters) {
      if (!chapter.content) continue

      // 查找人物出场
      if (!chapter.content.includes(character.name)) continue

      // 提取性格特征
      const foundTraits: string[] = []
      for (const [trait, keywords] of Object.entries(personalityKeywords)) {
        for (const keyword of keywords) {
          if (chapter.content.includes(keyword)) {
            foundTraits.push(trait)
            break
          }
        }
      }

      if (foundTraits.length > 0) {
        appearances.push({
          chapter: chapter.number,
          text: chapter.content.substring(0, 200),
          traits: foundTraits
        })
      }
    }

    // 检测性格矛盾
    const contradictoryPairs: Array<[string, string]> = [
      ['勇敢', '胆小'],
      ['善良', '冷酷'],
      ['聪明', '愚笨'],
      ['开朗', '阴沉']
    ]

    for (const [trait1, trait2] of contradictoryPairs) {
      const hasTrait1 = appearances.some(a => a.traits.includes(trait1))
      const hasTrait2 = appearances.some(a => a.traits.includes(trait2))

      if (hasTrait1 && hasTrait2) {
        const appearance1 = appearances.find(a => a.traits.includes(trait1))!
        const appearance2 = appearances.find(a => a.traits.includes(trait2))!

        this.addConflict({
          type: 'character_personality',
          severity: 'warning',
          title: `${character.name}性格前后矛盾`,
          description: `人物"${character.name}"在第${appearance1.chapter}章表现为"${trait1}"，但在第${appearance2.chapter}章表现为"${trait2}"，性格表现不一致`,
          evidences: [
            {
              type: 'text',
              description: `第${appearance1.chapter}章表现`,
              location: {
                chapterNumber: appearance1.chapter,
                textSnippet: appearance1.text
              },
              chapterNumber: appearance1.chapter
            },
            {
              type: 'text',
              description: `第${appearance2.chapter}章表现`,
              location: {
                chapterNumber: appearance2.chapter,
                textSnippet: appearance2.text
              },
              chapterNumber: appearance2.chapter
            }
          ],
          suggestions: [
            {
              id: uuidv4(),
              type: 'manual',
              description: `检查人物"${character.name}"的性格设定，确保前后一致，或添加合理的性格转变过程`,
              confidence: 0.8
            }
          ],
          relatedCharacterIds: [character.id],
          relatedChapters: [appearance1.chapter, appearance2.chapter]
        })
      }
    }
  }

  /**
   * 检测人物能力冲突
   */
  private async detectAbilityConflicts(
    character: Character,
    chapters: Chapter[]
  ): Promise<void> {
    // 获取人物能力设定
    const baseAbilities = character.abilities || []

    // 检测能力突然出现或消失
    const abilityAppearances = new Map<string, number[]>()

    for (const chapter of chapters) {
      if (!chapter.content || !chapter.content.includes(character.name)) continue

      for (const ability of baseAbilities) {
        if (chapter.content.includes(ability.name)) {
          if (!abilityAppearances.has(ability.name)) {
            abilityAppearances.set(ability.name, [])
          }
          abilityAppearances.get(ability.name)!.push(chapter.number)
        }
      }
    }

    // 检查能力是否在中间章节突然消失
    for (const [abilityName, chapters] of abilityAppearances.entries()) {
      if (chapters.length < 2) continue

      const sortedChapters = chapters.sort((a, b) => a - b)
      const gaps: Array<{ start: number; end: number }> = []

      for (let i = 0; i < sortedChapters.length - 1; i++) {
        const gap = sortedChapters[i + 1] - sortedChapters[i]
        if (gap > 10) { // 超过10章未使用该能力
          gaps.push({
            start: sortedChapters[i],
            end: sortedChapters[i + 1]
          })
        }
      }

      if (gaps.length > 0) {
        this.addConflict({
          type: 'character_ability',
          severity: 'info',
          title: `${character.name}能力"${abilityName}"长期未使用`,
          description: `人物"${character.name}"的能力"${abilityName}"在第${sortedChapters[0]}章出现后，在第${sortedChapters[sortedChapters.length - 1]}章再次出现，中间间隔较长`,
          evidences: [
            {
              type: 'text',
              description: `能力首次出现`,
              location: { chapterNumber: sortedChapters[0] },
              chapterNumber: sortedChapters[0]
            },
            {
              type: 'text',
              description: `能力再次出现`,
              location: { chapterNumber: sortedChapters[sortedChapters.length - 1] },
              chapterNumber: sortedChapters[sortedChapters.length - 1]
            }
          ],
          suggestions: [
            {
              id: uuidv4(),
              type: 'manual',
              description: `检查是否遗忘该能力，或在合适的时候提及该能力未被使用的原因`,
              confidence: 0.7
            }
          ],
          relatedCharacterIds: [character.id],
          relatedChapters: sortedChapters
        })
      }
    }
  }

  /**
   * 检测人物外貌冲突
   */
  private async detectAppearanceConflicts(
    character: Character,
    chapters: Chapter[]
  ): Promise<void> {
    if (!character.appearance) return

    // 提取外貌关键词
    const appearanceKeywords = this.extractAppearanceKeywords(character.appearance)

    // 在章节中搜索外貌描述
    const appearanceDescriptions: Array<{ chapter: number; description: string }> = []

    for (const chapter of chapters) {
      if (!chapter.content || !chapter.content.includes(character.name)) continue

      // 查找外貌描述段落
      const paragraphs = chapter.content.split('\n').filter(p => p.includes(character.name))

      for (const para of paragraphs) {
        // 检查是否包含外貌关键词
        for (const keyword of appearanceKeywords) {
          if (para.includes(keyword)) {
            appearanceDescriptions.push({
              chapter: chapter.number,
              description: para.substring(0, 150)
            })
            break
          }
        }
      }
    }

    // 简单检测：外貌描述过多重复
    if (appearanceDescriptions.length > 3) {
      const uniqueChapters = [...new Set(appearanceDescriptions.map(d => d.chapter))]

      if (uniqueChapters.length > 3) {
        this.addConflict({
          type: 'character_appearance',
          severity: 'info',
          title: `${character.name}外貌描述重复`,
          description: `人物"${character.name}"的外貌在多个章节重复描述，可能造成冗余`,
          evidences: appearanceDescriptions.slice(0, 3).map(d => ({
            type: 'text',
            description: `第${d.chapter}章描述`,
            location: { chapterNumber: d.chapter, textSnippet: d.description },
            chapterNumber: d.chapter
          })),
          suggestions: [
            {
              id: uuidv4(),
              type: 'manual',
              description: `建议减少重复的外貌描述，或在关键情节时重点描写变化`,
              confidence: 0.6
            }
          ],
          relatedCharacterIds: [character.id],
          relatedChapters: uniqueChapters
        })
      }
    }
  }

  /**
   * 检测时间线冲突
   */
  private async detectTimelineConflicts(): Promise<void> {
    const chapters = this.project.chapters || []

    if (chapters.length < 2) return

    // 检测事件顺序矛盾
    await this.detectEventSequenceConflicts(chapters)

    // 检测人物年龄错误
    await this.detectAgeConflicts(chapters)
  }

  /**
   * 检测事件顺序冲突
   */
  private async detectEventSequenceConflicts(chapters: Chapter[]): Promise<void> {
    // 构建事件时间线
    const events: Array<{ chapter: number; event: string; keywords: string[] }> = []

    const eventKeywords = {
      '战斗': ['战斗', '打斗', '交手', '厮杀'],
      '修炼': ['修炼', '闭关', '突破', '进阶'],
      '会面': ['见面', '相遇', '重逢', '会见'],
      '离别': ['离别', '告别', '分别', '离开']
    }

    for (const chapter of chapters) {
      if (!chapter.content) continue

      for (const [eventType, keywords] of Object.entries(eventKeywords)) {
        for (const keyword of keywords) {
          if (chapter.content.includes(keyword)) {
            events.push({
              chapter: chapter.number,
              event: eventType,
              keywords: [keyword]
            })
            break
          }
        }
      }
    }

    // 检测矛盾：如果同一人物在相近章节描述年龄差异过大
    // （简化实现，实际应该更复杂的逻辑）
  }

  /**
   * 检测人物年龄冲突
   */
  private async detectAgeConflicts(chapters: Chapter[]): Promise<void> {
    const characters = this.project.characters || []

    for (const character of characters) {
      if (!character.age || character.age <= 0) continue

      // 在章节中搜索年龄描述
      const agePatterns = [
        /(\d+)岁/g,
        /年龄[是为]?(\d+)/g,
        /年纪[是为]?(\d+)/g
      ]

      const ageAppearances: Array<{ chapter: number; age: number; text: string }> = []

      for (const chapter of chapters) {
        if (!chapter.content || !chapter.content.includes(character.name)) continue

        // 查找年龄描述
        const paragraphs = chapter.content.split('\n').filter(p => p.includes(character.name))

        for (const para of paragraphs) {
          for (const pattern of agePatterns) {
            const matches = para.matchAll(pattern)
            for (const match of matches) {
              const mentionedAge = parseInt(match[1])
              if (mentionedAge > 0 && mentionedAge < 200) { // 合理年龄范围
                ageAppearances.push({
                  chapter: chapter.number,
                  age: mentionedAge,
                  text: para.substring(0, 150)
                })
              }
            }
          }
        }
      }

      // 检测年龄差异
      if (ageAppearances.length >= 2) {
        const ages = ageAppearances.map(a => a.age)
        const maxAgeDiff = Math.max(...ages) - Math.min(...ages)

        if (maxAgeDiff > this.config.ageErrorTolerance) {
          const firstAppearance = ageAppearances[0]
          const lastAppearance = ageAppearances[ageAppearances.length - 1]

          this.addConflict({
            type: 'timeline_age',
            severity: 'warning',
            title: `${character.name}年龄描述不一致`,
            description: `人物"${character.name}"的年龄在不同章节描述不一致，设定年龄为${character.age}岁，但在第${firstAppearance.chapter}章提到${firstAppearance.age}岁，第${lastAppearance.chapter}章提到${lastAppearance.age}岁`,
            evidences: ageAppearances.map(a => ({
              type: 'text',
              description: `第${a.chapter}章年龄描述`,
              location: { chapterNumber: a.chapter, textSnippet: a.text },
              chapterNumber: a.chapter
            })),
            suggestions: [
              {
                id: uuidv4(),
                type: 'manual',
                description: `统一人物年龄描述，或说明年龄变化的原因（如时间流逝）`,
                confidence: 0.85
              }
            ],
            relatedCharacterIds: [character.id],
            relatedChapters: ageAppearances.map(a => a.chapter)
          })
        }
      }
    }
  }

  /**
   * 检测世界观冲突
   */
  private async detectWorldConflicts(): Promise<void> {
    const world = this.project.world
    if (!world) return

    const chapters = this.project.chapters || []

    // 检测规则冲突
    await this.detectWorldRuleConflicts(world, chapters)

    // 检测设定冲突
    await this.detectWorldSettingConflicts(world, chapters)
  }

  /**
   * 检测世界规则冲突
   */
  private async detectWorldRuleConflicts(
    world: WorldSetting,
    _chapters: Chapter[]
  ): Promise<void> {
    if (!world.rules || world.rules.length === 0) return

    // 提取关键规则
    for (const _rule of world.rules) {
      // 检查是否有章节违反该规则
      // （简化实现，实际需要AI辅助分析）
    }
  }

  /**
   * 检测世界设定冲突
   */
  private async detectWorldSettingConflicts(
    world: WorldSetting,
    chapters: Chapter[]
  ): Promise<void> {
    // 检测力量体系冲突
    if (world.powerSystem) {
      await this.detectPowerSystemConflicts(world, chapters)
    }
  }

  /**
   * 检测力量体系冲突
   */
  private async detectPowerSystemConflicts(
    world: WorldSetting,
    chapters: Chapter[]
  ): Promise<void> {
    if (!world.powerSystem || !world.powerSystem.levels) return

    const levels = world.powerSystem.levels

    // 在章节中搜索力量等级描述
    const levelAppearances = new Map<string, number[]>()

    for (const chapter of chapters) {
      if (!chapter.content) continue

      for (const level of levels) {
        if (chapter.content.includes(level.name)) {
          if (!levelAppearances.has(level.name)) {
            levelAppearances.set(level.name, [])
          }
          levelAppearances.get(level.name)!.push(chapter.number)
        }
      }
    }

    // 检测等级顺序问题（简化实现）
    // 实际应该检测人物等级变化是否符合等级顺序
  }

  /**
   * 检测情节逻辑冲突
   */
  private async detectPlotLogicConflicts(): Promise<void> {
    const chapters = this.project.chapters || []
    const outline = this.project.outline

    if (!outline) return

    // 检测伏笔是否揭示
    if (outline.foreshadowings) {
      await this.detectForeshadowingIssues(outline.foreshadowings, chapters)
    }

    // 检测人物行为逻辑
    await this.detectCharacterBehaviorConflicts(chapters)
  }

  /**
   * 检测伏笔问题
   */
  private async detectForeshadowingIssues(
    foreshadowings: any[],
    chapters: Chapter[]
  ): Promise<void> {
    for (const foreshadowing of foreshadowings) {
      if (foreshadowing.status === 'planted' && !foreshadowing.resolveChapter) {
        // 检查是否已经过了很多章还没揭示
        const plantChapter = foreshadowing.plantChapter
        const currentChapter = chapters.length

        if (currentChapter - plantChapter > 20) { // 超过20章未揭示
          this.addConflict({
            type: 'foreshadowing',
            severity: 'warning',
            title: `伏笔"${foreshadowing.description}"长期未揭示`,
            description: `伏笔"${foreshadowing.description}"在第${plantChapter}章埋下，至今已有${currentChapter - plantChapter}章未揭示`,
            evidences: [
              {
                type: 'text',
                description: `伏笔埋设章节`,
                location: { chapterNumber: plantChapter }
              }
            ],
            suggestions: [
              {
                id: uuidv4(),
                type: 'manual',
                description: `建议在近期章节揭示该伏笔，或说明为何延后`,
                confidence: 0.75
              }
            ],
            relatedChapters: [plantChapter]
          })
        }
      }
    }
  }

  /**
   * 检测人物行为逻辑冲突
   */
  private async detectCharacterBehaviorConflicts(chapters: Chapter[]): Promise<void> {
    // 简化实现：检测人物突然出现或消失
    const characters = this.project.characters || []
    const characterAppearances = new Map<string, number[]>()

    for (const chapter of chapters) {
      if (!chapter.content) continue

      for (const character of characters) {
        if (chapter.content.includes(character.name)) {
          if (!characterAppearances.has(character.id)) {
            characterAppearances.set(character.id, [])
          }
          characterAppearances.get(character.id)!.push(chapter.number)
        }
      }
    }

    // 检测重要人物长期未出场
    for (const character of characters) {
      const appearances = characterAppearances.get(character.id) || []

      if (appearances.length === 0) {
        this.addConflict({
          type: 'plot_logic',
          severity: 'info',
          title: `人物"${character.name}"从未出场`,
          description: `人物"${character.name}"在设定中存在，但在所有章节中都未出场`,
          evidences: [],
          suggestions: [
            {
              id: uuidv4(),
              type: 'manual',
              description: `建议让该人物出场，或从人物设定中移除`,
              confidence: 0.7
            }
          ],
          relatedCharacterIds: [character.id]
        })
      } else if (appearances.length >= 3) {
        // 检测突然消失
        const lastAppearance = Math.max(...appearances)
        const currentChapter = chapters.length

        if (currentChapter - lastAppearance > 10 && character.appearances && character.appearances.length > 0) {
          this.addConflict({
            type: 'plot_logic',
            severity: 'info',
            title: `人物"${character.name}"长期未出场`,
            description: `人物"${character.name}"在第${lastAppearance}章后，已有${currentChapter - lastAppearance}章未出场`,
            evidences: [
              {
                type: 'text',
                description: `最后出场`,
                location: { chapterNumber: lastAppearance }
              }
            ],
            suggestions: [
              {
                id: uuidv4(),
                type: 'manual',
                description: `检查该人物是否需要继续参与剧情，或说明其去向`,
                confidence: 0.65
              }
            ],
            relatedCharacterIds: [character.id],
            relatedChapters: [lastAppearance]
          })
        }
      }
    }
  }

  /**
   * 检测伏笔冲突
   */
  private async detectForeshadowingConflicts(): Promise<void> {
    // 已经在 detectPlotLogicConflicts 中处理
  }

  /**
   * 提取外貌关键词
   */
  private extractAppearanceKeywords(appearance: string): string[] {
    // 简单提取外貌相关词汇
    const keywords: string[] = []

    // 提取形容词
    const adjectives = appearance.match(/[\u4e00-\u9fa5]{2,4}/g) || []
    keywords.push(...adjectives)

    return keywords
  }

  /**
   * 添加冲突
   */
  private addConflict(conflict: Omit<ConflictReport, 'id' | 'createdAt' | 'updatedAt' | 'status'>): void {
    this.conflicts.push({
      ...conflict,
      id: uuidv4(),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  }

  /**
   * 生成统计信息
   */
  private generateStatistics(): ConflictDetectionResult['statistics'] {
    const statistics: ConflictDetectionResult['statistics'] = {
      total: this.conflicts.length,
      critical: 0,
      warning: 0,
      info: 0,
      byType: {} as Record<ConflictType, number>,
      byChapter: {}
    }

    for (const conflict of this.conflicts) {
      // 按严重程度统计
      if (conflict.severity === 'critical') statistics.critical++
      else if (conflict.severity === 'warning') statistics.warning++
      else if (conflict.severity === 'info') statistics.info++

      // 按类型统计
      if (!statistics.byType[conflict.type]) {
        statistics.byType[conflict.type] = 0
      }
      statistics.byType[conflict.type]++

      // 按章节统计
      if (conflict.relatedChapters) {
        for (const chapter of conflict.relatedChapters) {
          if (!statistics.byChapter[chapter]) {
            statistics.byChapter[chapter] = 0
          }
          statistics.byChapter[chapter]++
        }
      }
    }

    return statistics
  }
}

/**
 * 快速检测函数
 */
export async function detectConflicts(
  project: Project,
  config?: Partial<ConflictDetectionConfig>
): Promise<ConflictDetectionResult> {
  const detector = new ConflictDetector(project, config)
  return await detector.detect()
}

/**
 * 导出冲突报告为JSON
 */
export function exportConflictsAsJSON(result: ConflictDetectionResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * 导出冲突报告为Markdown
 */
export function exportConflictsAsMarkdown(
  result: ConflictDetectionResult,
  projectName: string
): string {
  const lines: string[] = []

  lines.push(`# 冲突检测报告`)
  lines.push(``)
  lines.push(`项目：${projectName}`)
  lines.push(`检测时间：${result.detectedAt.toLocaleString()}`)
  lines.push(`检测耗时：${result.duration}ms`)
  lines.push(``)
  lines.push(`## 统计信息`)
  lines.push(``)
  lines.push(`- 总计：${result.statistics.total} 个冲突`)
  lines.push(`- 严重：${result.statistics.critical} 个`)
  lines.push(`- 警告：${result.statistics.warning} 个`)
  lines.push(`- 提示：${result.statistics.info} 个`)
  lines.push(``)

  if (result.conflicts.length > 0) {
    lines.push(`## 冲突详情`)
    lines.push(``)

    for (const conflict of result.conflicts) {
      const severityEmoji = conflict.severity === 'critical' ? '🔴' :
                            conflict.severity === 'warning' ? '🟡' : '🔵'

      lines.push(`### ${severityEmoji} ${conflict.title}`)
      lines.push(``)
      lines.push(`- **类型**：${conflict.type}`)
      lines.push(`- **严重程度**：${conflict.severity}`)
      lines.push(`- **描述**：${conflict.description}`)
      lines.push(``)

      if (conflict.evidences.length > 0) {
        lines.push(`**证据：**`)
        lines.push(``)
        for (const evidence of conflict.evidences) {
          lines.push(`- ${evidence.description}`)
          if (evidence.chapterNumber) {
            lines.push(`  - 章节：第${evidence.chapterNumber}章`)
          }
        }
        lines.push(``)
      }

      if (conflict.suggestions.length > 0) {
        lines.push(`**修复建议：**`)
        lines.push(``)
        for (const suggestion of conflict.suggestions) {
          lines.push(`- ${suggestion.description} (置信度：${(suggestion.confidence * 100).toFixed(0)}%)`)
        }
        lines.push(``)
      }

      lines.push(`---`)
      lines.push(``)
    }
  }

  return lines.join('\n')
}
