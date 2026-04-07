/**
 * 续写建议系统
 * 基于已有内容提供续写建议
 */

import type { Chapter, Character, Outline, WorldSetting } from '@/types'

export interface ContinuationSuggestion {
  type: 'plot' | 'character' | 'scene' | 'conflict' | 'foreshadowing'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  context: string
  suggestions: string[]
}

export interface PlotThread {
  id: string
  name: string
  status: 'active' | 'dormant' | 'resolved'
  lastMention: number // 章节号
  occurrences: number
  relatedCharacters: string[]
}

export interface ForeshadowingItem {
  id: string
  description: string
  plantedChapter: number
  resolvedChapter?: number
  status: 'planted' | 'hinted' | 'resolved' | 'forgotten'
}

/**
 * 分析情节线
 */
function analyzePlotThreads(chapters: Chapter[]): PlotThread[] {
  const threads: PlotThread[] = []
  const threadKeywords: Record<string, string[]> = {
    '主线任务': ['任务', '目标', '目的', '寻找', '追求'],
    '修炼成长': ['修炼', '突破', '进阶', '提升', '境界'],
    '情感线': ['感情', '喜欢', '爱慕', '心动', '思念'],
    '复仇线': ['复仇', '报仇', '仇恨', '怨恨'],
    '探索线': ['探索', '发现', '秘密', '谜团', '真相']
  }

  // 分析每个情节线的状态
  for (const [threadName, keywords] of Object.entries(threadKeywords)) {
    let occurrences = 0
    let lastMention = 0
    const relatedCharacters = new Set<string>()

    for (const chapter of chapters) {
      const content = chapter.content
      for (const keyword of keywords) {
        if (content.includes(keyword)) {
          occurrences++
          lastMention = chapter.number
        }
      }
    }

    if (occurrences > 0) {
      const recentMention = lastMention >= chapters.length * 0.8
      const dormant = lastMention < chapters.length * 0.3

      threads.push({
        id: threadName,
        name: threadName,
        status: dormant ? 'dormant' : recentMention ? 'active' : 'active',
        lastMention,
        occurrences,
        relatedCharacters: Array.from(relatedCharacters)
      })
    }
  }

  return threads.sort((a, b) => b.occurrences - a.occurrences)
}

/**
 * 分析伏笔
 */
function analyzeForeshadowing(chapters: Chapter[]): ForeshadowingItem[] {
  const items: ForeshadowingItem[] = []

  // 伏笔关键词
  const foreshadowKeywords = [
    '似乎', '仿佛', '隐约', '好像', '暗藏', '埋下',
    '预兆', '征兆', '暗示', '预示', '伏笔', '悬念'
  ]

  for (const chapter of chapters) {
    const content = chapter.content

    for (const keyword of foreshadowKeywords) {
      const regex = new RegExp(`.*${keyword}.*`, 'g')
      const matches = content.match(regex)

      if (matches) {
        for (const match of matches.slice(0, 2)) { // 每章最多2个
          items.push({
            id: `foreshadow-${chapter.number}-${items.length}`,
            description: match.slice(0, 100),
            plantedChapter: chapter.number,
            status: 'planted'
          })
        }
      }
    }
  }

  return items.slice(0, 20) // 最多20个伏笔
}

/**
 * 分析人物出场
 */
function analyzeCharacterAppearances(
  chapters: Chapter[],
  characters: Character[]
): Map<string, number[]> {
  const appearances = new Map<string, number[]>()

  for (const character of characters) {
    const chaptersAppeared: number[] = []

    for (const chapter of chapters) {
      if (chapter.content.includes(character.name)) {
        chaptersAppeared.push(chapter.number)
      }
    }

    appearances.set(character.id, chaptersAppeared)
  }

  return appearances
}

/**
 * 生成续写建议
 */
export function generateContinuationSuggestions(
  chapters: Chapter[],
  characters: Character[],
  outline?: Outline,
  _worldSetting?: WorldSetting
): ContinuationSuggestion[] {
  const suggestions: ContinuationSuggestion[] = []

  // 分析情节线
  const plotThreads = analyzePlotThreads(chapters)

  // 检查沉睡的情节线
  const dormantThreads = plotThreads.filter(t => t.status === 'dormant')
  if (dormantThreads.length > 0) {
    suggestions.push({
      type: 'plot',
      priority: 'high',
      title: '重启沉睡的情节线',
      description: `有 ${dormantThreads.length} 条情节线已经很久没有进展`,
      context: `沉睡的情节线：${dormantThreads.map(t => t.name).join('、')}`,
      suggestions: [
        '在下一章提及相关情节，唤醒读者的记忆',
        '安排相关人物重新出现',
        '制造与该情节线相关的新事件'
      ]
    })
  }

  // 分析伏笔
  const foreshadowing = analyzeForeshadowing(chapters)
  const unresolvedForeshadowing = foreshadowing.filter(f => f.status === 'planted')

  if (unresolvedForeshadowing.length > 3) {
    suggestions.push({
      type: 'foreshadowing',
      priority: 'medium',
      title: '处理未解决的伏笔',
      description: `有 ${unresolvedForeshadowing.length} 个伏笔尚未揭示`,
      context: '未解决的伏笔过多可能让读者困惑',
      suggestions: [
        '在接下来的章节中揭示1-2个伏笔',
        '为伏笔的揭示做铺垫',
        '确保伏笔的揭示有足够的戏剧性'
      ]
    })
  }

  // 分析人物出场
  const appearances = analyzeCharacterAppearances(chapters, characters)
  const recentChapters = chapters.slice(-5).map(c => c.number)

  for (const character of characters.slice(0, 5)) { // 主角团
    const characterAppearances = appearances.get(character.id) || []
    const recentAppearances = characterAppearances.filter(n => recentChapters.includes(n))

    if (recentAppearances.length === 0 && character.tags?.includes('protagonist')) {
      suggestions.push({
        type: 'character',
        priority: 'high',
        title: `${character.name} 需要出场`,
        description: `主角 ${character.name} 在最近5章没有出现`,
        context: '主角应该保持合理的出场频率',
        suggestions: [
          `安排 ${character.name} 在下一章出场`,
          '展示主角的内心活动或计划',
          '让主角推动关键情节发展'
        ]
      })
    }
  }

  // 检查章节长度
  const avgLength = chapters.reduce((sum, ch) => sum + ch.content.length, 0) / chapters.length
  const lastChapter = chapters[chapters.length - 1]

  if (lastChapter.content.length < avgLength * 0.5) {
    suggestions.push({
      type: 'scene',
      priority: 'low',
      title: '扩展上一章内容',
      description: '最近一章篇幅较短',
      context: `上一章字数：${lastChapter.content.length}，平均：${Math.round(avgLength)}`,
      suggestions: [
        '添加更多细节描写',
        '展开人物的内心活动',
        '增加场景描述'
      ]
    })
  }

  // 检查冲突密度
  const conflictKeywords = ['冲突', '矛盾', '对抗', '争斗', '危机', '困境']
  let conflictCount = 0

  for (let i = Math.max(0, chapters.length - 3); i < chapters.length; i++) {
    const content = chapters[i].content
    for (const keyword of conflictKeywords) {
      conflictCount += (content.match(new RegExp(keyword, 'g')) || []).length
    }
  }

  if (conflictCount < 3) {
    suggestions.push({
      type: 'conflict',
      priority: 'medium',
      title: '增加情节冲突',
      description: '最近3章的冲突密度较低',
      context: '冲突是推动情节发展的动力',
      suggestions: [
        '制造人物之间的矛盾',
        '引入新的对手或障碍',
        '让主角面临困境'
      ]
    })
  }

  // 根据大纲生成建议
  if (outline && outline.chapters.length > chapters.length) {
    const nextChapterOutline = outline.chapters[chapters.length]

    if (nextChapterOutline) {
      suggestions.push({
        type: 'plot',
        priority: 'high',
        title: '按照大纲继续',
        description: `下一章: ${nextChapterOutline.title}`,
        context: (nextChapterOutline as any).summary || '',
        suggestions: [
          ...(nextChapterOutline.goals || []).map(g => `目标：${g}`),
          ...(nextChapterOutline.conflicts || []).map(c => `冲突：${c}`)
        ]
      })
    }
  }

  // 按优先级排序
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return suggestions.slice(0, 10) // 最多10条建议
}

/**
 * 生成章节续写要点
 */
export function generateChapterContinuationPoints(
  currentChapter: Chapter,
  _previousChapters: Chapter[],
  characters: Character[]
): string[] {
  const points: string[] = []

  // 分析当前章节的结尾
  const lastParagraph = currentChapter.content.split('\n\n').pop() || ''

  // 检查是否有悬念
  const suspenseKeywords = ['突然', '就在这时', '没想到', '不料', '却见']
  const hasSuspense = suspenseKeywords.some(keyword => lastParagraph.includes(keyword))

  if (hasSuspense) {
    points.push('上一章结尾有悬念，需要在下一章开头回应')
  }

  // 检查人物状态
  for (const character of characters.slice(0, 3)) {
    if (currentChapter.content.includes(character.name)) {
      points.push(`继续 ${character.name} 的故事线`)
    }
  }

  // 检查场景连续性
  const locations = extractLocations(currentChapter.content)
  if (locations.length > 0) {
    points.push(`当前场景：${locations[locations.length - 1]}`)
  }

  // 基于情节节奏
  if (currentChapter.content.length < 2000) {
    points.push('考虑扩展当前章节或合并到下一章')
  }

  return points
}

/**
 * 提取地点
 */
function extractLocations(text: string): string[] {
  const locationPattern = /在([^\s，。！？]{2,8})(?:城|镇|村|山|谷|殿|宫|阁|楼|院|府)/g
  const locations: string[] = []

  const matches = text.matchAll(locationPattern)
  for (const match of matches) {
    locations.push(match[0])
  }

  return locations
}
