/**
 * 大纲生成器
 * 从章节内容生成结构化大纲
 */

import type { Outline, Volume, ChapterOutline } from '@/types'
import { v4 as uuidv4 } from 'uuid'

export interface GeneratedOutline {
  volumes: Volume[]
  chapters: ChapterOutline[]
  structure: string
  totalChapters: number
  description: string
}

/**
 * 分析章节内容，提取主要事件
 */
function extractMainEvents(content: string): string[] {
  const events: string[] = []

  // 基于句子的转折词提取事件
  const turningPointKeywords = ['但是', '然而', '突然', '就在这时', '就在此时', '没想到', '不料']

  const sentences = content.split(/[。！？\n]/)

  for (const sentence of sentences) {
    for (const keyword of turningPointKeywords) {
      if (sentence.includes(keyword)) {
        // 提取转折后的内容作为事件
        const eventStart = sentence.indexOf(keyword)
        const event = sentence.slice(eventStart + keyword.length).trim()
        if (event.length >= 10 && event.length <= 100) {
          events.push(event)
        }
        break
      }
    }
  }

  // 最多返回5个事件
  return events.slice(0, 5)
}

/**
 * 分析章节内容，提取场景
 */
function extractScenes(content: string): string[] {
  const scenes: string[] = []

  // 基于地点词提取场景
  const locationPattern = /在([^\s，。！？]{2,8})(?:城|镇|村|山|谷|殿|宫|阁|楼|院|府)/g
  const matches = content.matchAll(locationPattern)

  for (const match of matches) {
    scenes.push(match[0])
  }

  // 去重
  return [...new Set(scenes)].slice(0, 5)
}

/**
 * 分析章节内容，提取目标
 */
function extractGoals(content: string): string[] {
  const goals: string[] = []

  // 基于目标词提取目标
  const goalPatterns = [
    /为了([^\s，。！？]{5,30})/g,
    /想要([^\s，。！？]{5,30})/g,
    /决定([^\s，。！？]{5,30})/g,
    /必须([^\s，。！？]{5,30})/g
  ]

  for (const pattern of goalPatterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      if (match[1].length >= 5 && match[1].length <= 30) {
        goals.push(match[1])
      }
    }
  }

  return [...new Set(goals)].slice(0, 3)
}

/**
 * 分析章节内容，提取冲突
 */
function extractConflicts(content: string): string[] {
  const conflicts: string[] = []

  // 基于冲突词提取冲突
  const conflictPatterns = [
    /与([^\s，。！？]{2,6})发生冲突/g,
    /和([^\s，。！？]{2,6})争吵/g,
    /遭到([^\s，。！？]{2,6})的攻击/g,
    /陷入([^\s，。！？]{5,30})的困境/g
  ]

  for (const pattern of conflictPatterns) {
    const matches = content.matchAll(pattern)
    for (const match of matches) {
      if (match[0].length >= 5 && match[0].length <= 50) {
        conflicts.push(match[0])
      }
    }
  }

  return [...new Set(conflicts)].slice(0, 3)
}

/**
 * 生成章节摘要
 */
function generateChapterSummary(content: string): string {
  // 简单提取前200字作为摘要
  const cleanContent = content.replace(/\s+/g, '').trim()
  if (cleanContent.length <= 200) {
    return cleanContent
  }

  // 尝试在句号处截断
  const first200 = cleanContent.slice(0, 200)
  const lastPeriod = first200.lastIndexOf('。')

  if (lastPeriod > 100) {
    return first200.slice(0, lastPeriod + 1)
  }

  return first200 + '...'
}

/**
 * 自动分卷
 */
function autoDivideVolumes(
  chapters: Array<{ number: number; title: string; content: string }>,
  strategy: 'equal' | 'arcs' | 'single' = 'arcs'
): Volume[] {
  const totalChapters = chapters.length

  if (strategy === 'single') {
    return [{
      id: uuidv4(),
      number: 1,
      title: '第一卷',
      theme: '',
      chapterRange: { start: 1, end: totalChapters },
      startChapter: 1,
      endChapter: totalChapters,
      mainEvents: []
    }]
  }

  if (strategy === 'equal') {
    // 等分章节，每卷约20章
    const volumeSize = 20
    const volumeCount = Math.ceil(totalChapters / volumeSize)
    const volumes: Volume[] = []

    for (let i = 0; i < volumeCount; i++) {
      const start = i * volumeSize + 1
      const end = Math.min((i + 1) * volumeSize, totalChapters)

      volumes.push({
        id: uuidv4(),
        number: i + 1,
        title: `第${i + 1}卷`,
        theme: '',
        chapterRange: { start, end },
        startChapter: start,
        endChapter: end,
        mainEvents: []
      })
    }

    return volumes
  }

  // arcs 策略：基于故事弧分卷
  // 简单实现：按章节标题中的关键词识别
  const arcKeywords = [
    ['启程', '开始', '初入'],
    ['修炼', '成长', '历练'],
    ['危机', '转折', '大战'],
    ['结局', '终章', '完结']
  ]

  const volumes: Volume[] = []
  let currentArc = 0
  let arcStart = 1

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]
    let foundArc = false

    for (let arc = 0; arc < arcKeywords.length; arc++) {
      for (const keyword of arcKeywords[arc]) {
        if (chapter.title.includes(keyword)) {
          if (arc > currentArc) {
            // 新的故事弧开始
            volumes.push({
              id: uuidv4(),
              number: volumes.length + 1,
              title: `第${volumes.length + 1}卷`,
              theme: inferArcTheme(arc),
              chapterRange: { start: arcStart, end: chapter.number - 1 },
              startChapter: arcStart,
              endChapter: chapter.number - 1,
              mainEvents: []
            })
            currentArc = arc
            arcStart = chapter.number
          }
          foundArc = true
          break
        }
      }
      if (foundArc) break
    }
  }

  // 添加最后一卷
  if (arcStart <= totalChapters) {
    volumes.push({
      id: uuidv4(),
      number: volumes.length + 1,
      title: `第${volumes.length + 1}卷`,
      theme: '',
      chapterRange: { start: arcStart, end: totalChapters },
      startChapter: arcStart,
      endChapter: totalChapters,
      mainEvents: []
    })
  }

  // 如果没有识别出任何卷，使用等分策略
  if (volumes.length === 0) {
    return autoDivideVolumes(chapters, 'equal')
  }

  return volumes
}

/**
 * 推断故事弧主题
 */
function inferArcTheme(arcIndex: number): string {
  const themes = [
    '故事开端',
    '成长历练',
    '冲突高潮',
    '结局收官'
  ]
  return themes[arcIndex] || ''
}

/**
 * 推断故事结构
 */
function inferStoryStructure(chapters: number): string {
  if (chapters <= 30) {
    return '短篇小说结构'
  } else if (chapters <= 100) {
    return '三幕结构'
  } else if (chapters <= 200) {
    return '英雄之旅'
  } else {
    return '多卷长篇结构'
  }
}

/**
 * 从章节生成大纲
 */
export async function generateOutline(
  chapters: Array<{ number: number; title: string; content: string }>,
  onProgress?: (current: number, total: number) => void
): Promise<GeneratedOutline> {
  const totalChapters = chapters.length

  // 生成章节大纲
  const chapterOutlines: ChapterOutline[] = []

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i]

    chapterOutlines.push({
      chapterId: uuidv4(),
      title: chapter.title,
      scenes: [{
        id: uuidv4(),
        description: generateChapterSummary(chapter.content),
        characters: [],
        location: extractScenes(chapter.content)[0] || ''
      }],
      goals: extractGoals(chapter.content),
      conflicts: extractConflicts(chapter.content),
      resolutions: [],
      location: extractScenes(chapter.content)[0] || '',
      characters: [],
      status: 'completed'
    })

    onProgress?.(i + 1, chapters.length)
  }

  // 自动分卷
  const volumes = autoDivideVolumes(chapters, 'arcs')

  // 为每卷提取主要事件
  for (const volume of volumes) {
    const volumeChapters = chapters.filter(
      ch => ch.number >= (volume.chapterRange?.start || 0) && ch.number <= (volume.chapterRange?.end || 0)
    )

    const allContent = volumeChapters.map(ch => ch.content).join('\n')
    volume.mainEvents = extractMainEvents(allContent)
  }

  return {
    volumes,
    chapters: chapterOutlines,
    structure: inferStoryStructure(totalChapters),
    totalChapters,
    description: `从导入小说中自动生成的结构化大纲，共 ${totalChapters} 章，分为 ${volumes.length} 卷`
  }
}

/**
 * 将生成的大纲转换为项目格式
 */
export function convertToOutline(
  generated: GeneratedOutline,
  chapters: Array<{ id: string; number: number; title: string }>
): Outline {
  // 映射章节ID
  const chapterIdMap = new Map(
    chapters.map(ch => [ch.number, ch.id])
  )

  return {
    id: uuidv4(),
    structure: generated.structure,
    synopsis: generated.description,
    theme: '自动提取主题',
    mainPlot: {
      id: uuidv4(),
      name: '主要剧情',
      description: generated.description,
      startChapter: 1,
      endChapter: generated.totalChapters
    },
    subPlots: [],
    foreshadowings: [],
    volumes: generated.volumes,
    chapters: generated.chapters.map((outline, index) => ({
      ...outline,
      chapterId: chapterIdMap.get(index + 1) || outline.chapterId
    }))
  }
}
