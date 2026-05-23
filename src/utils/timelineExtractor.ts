/**
 * 时间线事件提取器
 * 从大纲和章节内容中提取事件并生成时间线数据
 */

import type { Project, Chapter, Outline} from '@/types'
import { useSandboxStore } from '@/stores/sandbox'
import { getLogger } from '@/utils/logger'
const logger = getLogger('utils:timelineExtractor')

/**
 * 时间线事件类型
 */
export type TimelineEventType = 'main' | 'subplot' | 'character' | 'foreshadowing' | 'custom'

/**
 * 时间线事件
 */
export interface TimelineEvent {
  id: string
  content: string
  start: number  // 章节号作为时间点
  end?: number   // 如果是范围事件
  type: TimelineEventType
  group?: string  // 分组/轨道名称
  title?: string
  description?: string
  className?: string  // CSS类名用于样式
  characterIds?: string[]  // 相关人物ID
  tags?: string[]
}

/**
 * 时间线分组/轨道
 */
export interface TimelineGroup {
  id: string
  content: string
  className?: string
}

/**
 * 时间线冲突
 */
export interface TimelineConflict {
  type: 'overlap' | 'contradiction' | 'gap'
  events: string[]  // 冲突的事件ID
  description: string
  severity: 'warning' | 'error'
}

/**
 * 从项目提取时间线事件
 */
export function extractTimelineEvents(project: Project): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // 1. 从大纲提取事件
  if (project.outline) {
    events.push(...extractOutlineEvents(project.outline))
  }

  // 2. 从章节提取事件
  if (project.chapters) {
    events.push(...extractChapterEvents(project.chapters))
  }

  // 3. 按章节排序
  events.sort((a, b) => a.start - b.start)

  return events
}

/**
 * 从大纲提取事件
 */
function extractOutlineEvents(outline: Outline): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // 主线事件
  if (outline.mainPlot && outline.mainPlot.startChapter && outline.mainPlot.endChapter) {
    const mainPlotId = outline.mainPlot.id || 'main'
    events.push({
      id: `mainplot-${mainPlotId}`,
      content: outline.mainPlot.name,
      start: outline.mainPlot.startChapter,
      end: outline.mainPlot.endChapter,
      type: 'main',
      group: 'main',
      title: '主线剧情',
      description: outline.mainPlot.description,
      className: 'event-main'
    })
  }

  // 支线事件
  const subPlots = Array.isArray(outline.subPlots) ? outline.subPlots : []
  subPlots.forEach((plot, index) => {
    if (plot && typeof plot === 'object' && plot.startChapter && plot.endChapter) {
      const plotId = plot.id || `sp-${index}`
      events.push({
        id: `subplot-${plotId}`,
        content: plot.name,
        start: plot.startChapter,
        end: plot.endChapter,
        type: 'subplot',
        group: `subplot-${plotId}`,
        title: '支线剧情',
        description: plot.description,
        className: 'event-subplot'
      })
    }
  })

  // 卷事件
  const volumes = Array.isArray(outline.volumes) ? outline.volumes : []
  volumes.forEach((volume, vIndex) => {
    if (volume && typeof volume === 'object') {
      const volIdStr = volume.id || `vol-${vIndex}`
      events.push({
        id: `volume-${volIdStr}`,
        content: `第${volume.number}卷: ${volume.title}`,
        start: volume.startChapter,
        end: volume.endChapter,
        type: 'main',
        group: 'volumes',
        title: volume.theme,
        description: (volume.mainEvents || []).join('\n'),
        className: 'event-volume'
      })

      // 卷内主要事件
      const mainEvents = Array.isArray(volume.mainEvents) ? volume.mainEvents : []
      mainEvents.forEach((event, index) => {
        if (event) {
          // 平均分配事件到各章节
          const chapterRange = (volume.endChapter || 1) - (volume.startChapter || 1) + 1
          const eventChapter = (volume.startChapter || 1) + Math.floor((index / mainEvents.length) * chapterRange)

          events.push({
            id: `event-${volIdStr}-${index}`,
            content: event,
            start: eventChapter,
            type: 'main',
            group: 'events',
            title: '主要事件',
            className: 'event-important'
          })
        }
      })
    }
  })

  // 章节大纲事件
  const chapters = Array.isArray(outline.chapters) ? outline.chapters : []
  chapters.forEach((chapter, index) => {
    if (!chapter || typeof chapter !== 'object') return

    const chapterNumber = index + 1
    const chapterIdStr = chapter.chapterId || `outline-chap-${index}`

    // 章节目标
    const goals = Array.isArray(chapter.goals) ? chapter.goals : []
    goals.forEach((goal, i) => {
      if (goal) {
        events.push({
          id: `goal-${chapterIdStr}-${i}`,
          content: `目标: ${goal}`,
          start: chapterNumber,
          type: 'main',
          group: 'goals',
          title: '章节目标',
          className: 'event-goal'
        })
      }
    })

    // 章节冲突
    const conflicts = Array.isArray(chapter.conflicts) ? chapter.conflicts : []
    conflicts.forEach((conflict, i) => {
      if (conflict) {
        events.push({
          id: `conflict-${chapterIdStr}-${i}`,
          content: `冲突: ${conflict}`,
          start: chapterNumber,
          type: 'subplot',
          group: 'conflicts',
          title: '章节冲突',
          className: 'event-conflict'
        })
      }
    })

    // 伏笔埋设
    const foreshadowingToPlant = Array.isArray(chapter.foreshadowingToPlant) ? chapter.foreshadowingToPlant : []
    foreshadowingToPlant.forEach((foreshadow, i) => {
      if (foreshadow) {
        events.push({
          id: `foreshadow-plant-${chapterIdStr}-${i}`,
          content: `埋伏笔: ${foreshadow}`,
          start: chapterNumber,
          type: 'foreshadowing',
          group: 'foreshadowing',
          title: '埋设伏笔',
          className: 'event-foreshadow-plant'
        })
      }
    })

    // 伏笔揭示
    const foreshadowingToResolve = Array.isArray(chapter.foreshadowingToResolve) ? chapter.foreshadowingToResolve : []
    foreshadowingToResolve.forEach((foreshadow, i) => {
      if (foreshadow) {
        events.push({
          id: `foreshadow-resolve-${chapterIdStr}-${i}`,
          content: `揭示伏笔: ${foreshadow}`,
          start: chapterNumber,
          type: 'foreshadowing',
          group: 'foreshadowing',
          title: '揭示伏笔',
          className: 'event-foreshadow-resolve'
        })
      }
    })
  })

  // 伏笔管理
  const foreshadowings = Array.isArray(outline.foreshadowings) ? outline.foreshadowings : []
  foreshadowings.forEach(foreshadow => {
    if (foreshadow && typeof foreshadow === 'object') {
      events.push({
        id: `foreshadowing-${foreshadow.id}`,
        content: foreshadow.description,
        start: foreshadow.plantChapter,
        end: foreshadow.resolveChapter,
        type: 'foreshadowing',
        group: 'foreshadowing',
        title: '伏笔',
        className: foreshadow.status === 'resolved' ? 'event-foreshadow-resolved' : 'event-foreshadow-active'
      })
    }
  })

  return events
}

/**
 * 从章节提取事件
 */
function extractChapterEvents(chapters: Chapter[]): TimelineEvent[] {
  const events: TimelineEvent[] = []

  const chaptersArray = Array.isArray(chapters) ? chapters : []
  chaptersArray.forEach((chapter, index) => {
    const chapterIdStr = chapter.id || `idx-${index}`
    // 章节本身作为事件
    events.push({
      id: `chapter-${chapterIdStr}`,
      content: `第${chapter.number}章: ${chapter.title}`,
      start: chapter.number,
      type: 'main',
      group: 'chapters',
      title: '章节',
      description: chapter.content ? chapter.content.substring(0, 100) + '...' : undefined,
      className: `event-chapter-${chapter.status}`
    })

    // 从章节大纲提取
    if (chapter.outline) {
      // 场景
      const scenes = Array.isArray(chapter.outline.scenes) ? chapter.outline.scenes : []
      scenes.forEach((scene, i) => {
        events.push({
          id: `scene-${chapterIdStr}-${i}`,
          content: scene.description || `场景 ${i + 1}`,
          start: chapter.number,
          type: 'main',
          group: 'scenes',
          title: scene.location || '场景',
          characterIds: scene.characters,
          className: 'event-scene'
        })
      })

      // 出场人物
      if (chapter.outline.characters && chapter.outline.characters.length > 0) {
        chapter.outline.characters.forEach((charId, charIndex) => {
          events.push({
            id: `appearance-${chapterIdStr}-${charId}-${charIndex}`,
            content: `人物出场`,
            start: chapter.number,
            type: 'character',
            group: `character-${charId}`,
            characterIds: [charId],
            className: 'event-character'
          })
        })
      }
    }
  })

  return events
}

/**
 * 生成时间线分组
 */
export function generateTimelineGroups(project: Project): TimelineGroup[] {
  const groups: TimelineGroup[] = []

  // 基础分组
  groups.push({ id: 'main', content: '主线', className: 'group-main' })
  groups.push({ id: 'chapters', content: '章节', className: 'group-chapters' })
  groups.push({ id: 'events', content: '主要事件', className: 'group-events' })
  groups.push({ id: 'goals', content: '目标', className: 'group-goals' })
  groups.push({ id: 'conflicts', content: '冲突', className: 'group-conflicts' })
  groups.push({ id: 'foreshadowing', content: '伏笔', className: 'group-foreshadowing' })
  groups.push({ id: 'scenes', content: '场景', className: 'group-scenes' })

  // 支线分组
  const subPlots = Array.isArray(project.outline?.subPlots) ? project.outline.subPlots : []
  subPlots.forEach(plot => {
    if (plot && typeof plot === 'object') {
      groups.push({
        id: `subplot-${plot.id}`,
        content: `支线: ${plot.name}`,
        className: 'group-subplot'
      })
    }
  })

  // 卷分组
  const volumes = Array.isArray(project.outline?.volumes) ? project.outline.volumes : []
  if (volumes.length > 0) {
    groups.push({ id: 'volumes', content: '卷', className: 'group-volumes' })
  }

  // 人物分组
  const sandboxStore = useSandboxStore()
  const characters = sandboxStore.entities.filter(e => e.type === 'CHARACTER')
  characters.forEach(entity => {
    if (entity && typeof entity === 'object') {
      groups.push({
        id: `character-${entity.id}`,
        content: entity.name,
        className: 'group-character'
      })
    }
  })

  return groups
}

/**
 * 检测时间线冲突
 */
export function detectTimelineConflicts(events: TimelineEvent[]): TimelineConflict[] {
  const conflicts: TimelineConflict[] = []

  // 确保events是数组
  const eventsArray = Array.isArray(events) ? events : []

  // 检测事件重叠
  for (let i = 0; i < eventsArray.length; i++) {
    for (let j = i + 1; j < eventsArray.length; j++) {
      const event1 = eventsArray[i]
      const event2 = eventsArray[j]

      // 只检测同一组内的事件
      if (event1.group !== event2.group) continue

      // 检测重叠
      const overlap = hasOverlap(event1, event2)
      if (overlap) {
        conflicts.push({
          type: 'overlap',
          events: [event1.id, event2.id],
          description: `事件 "${event1.content}" 和 "${event2.content}" 在时间上重叠`,
          severity: 'warning'
        })
      }
    }
  }

  // 检测伏笔未揭示
  eventsArray.forEach(event => {
    if (event.type === 'foreshadowing' && !event.end) {
      conflicts.push({
        type: 'gap',
        events: [event.id],
        description: `伏笔 "${event.content}" 已埋设但尚未揭示`,
        severity: 'warning'
      })
    }
  })

  // 检测时间顺序矛盾
  const sortedEvents = [...eventsArray].sort((a, b) => a.start - b.start)
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const current = sortedEvents[i]
    const next = sortedEvents[i + 1]

    // 如果当前事件有结束时间，且结束时间大于下一个事件的开始时间
    if (current.end && current.end > next.start && current.group !== next.group) {
      conflicts.push({
        type: 'contradiction',
        events: [current.id, next.id],
        description: `事件 "${current.content}" 的结束时间与 "${next.content}" 的开始时间存在矛盾`,
        severity: 'error'
      })
    }
  }

  return conflicts
}

/**
 * 检测两个事件是否重叠
 */
function hasOverlap(event1: TimelineEvent, event2: TimelineEvent): boolean {
  const start1 = event1.start
  const end1 = event1.end || event1.start
  const start2 = event2.start
  const end2 = event2.end || event2.start

  return start1 <= end2 && start2 <= end1
}

/**
 * 从文本提取事件（AI增强版，如果失败则回退为关键词提取）
 */
export async function extractEventsFromTextWithAI(text: string, chapterNumber: number): Promise<TimelineEvent[]> {
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()
    
    if (!aiStore.checkInitialized()) {
      return extractEventsFromText(text, chapterNumber)
    }
    
    const prompt = `你是一个时间线事件提取器。请从下面的小说文本中提取出推动剧情发展的“关键事件”。
请忽略日常琐事、风景描写和内心独白。

返回一个 JSON 数组，每个对象包含以下字段：
- content: 简短的事件描述（如：主角在山洞中发现神秘残剑）
- keyword: 事件核心关键词（如：发现、战斗、相遇）

小说文本：
${text.substring(0, 5000)}
`
    const response = await aiStore.chat([{ role: 'user' as const, content: prompt }], { type: 'outline' as any, complexity: 'low' as const, priority: 'speed' as const }, { maxTokens: 1000 })
    
    let jsonStr = response.content.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) jsonStr = jsonMatch[1]
    
    const parsed = JSON.parse(jsonStr)
    const eventsList = Array.isArray(parsed) ? parsed : (parsed.events || [])
    
    return eventsList.map((e: any, index: number) => ({
      id: `ai-event-${chapterNumber}-${index}`,
      content: e.content || '未知事件',
      start: chapterNumber,
      type: 'main',
      group: 'extracted',
      title: `AI提取: ${e.keyword || '事件'}`,
      className: 'event-extracted'
    }))
  } catch (error) {
    logger.error('AI提取事件失败，回退为关键词提取', error)
    return extractEventsFromText(text, chapterNumber)
  }
}

/**
 * 从文本提取事件（简单的基于关键词的提取）
 */
export function extractEventsFromText(text: string, chapterNumber: number): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // 简单的关键词提取（可以后续扩展为NLP提取）
  const keywords = ['发现', '遇到', '战斗', '获得', '学习', '突破', '死亡', '相遇', '离别', '决定']

  keywords.forEach((keyword, index) => {
    const regex = new RegExp(`.*${keyword}.*`, 'g')
    const matches = text.match(regex)

    if (matches) {
      matches.forEach((match, i) => {
        events.push({
          id: `text-event-${chapterNumber}-${index}-${i}`,
          content: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
          start: chapterNumber,
          type: 'main',
          group: 'extracted',
          title: `文本提取: ${keyword}`,
          className: 'event-extracted'
        })
      })
    }
  })

  return events
}

/**
 * 导出时间线为图片（需要html2canvas库支持）
 */
export async function exportTimelineAsImage(timelineElement: HTMLElement): Promise<Blob | null> {
  try {
    // 动态导入html2canvas
    const html2canvas = (await import('html2canvas')).default

    const canvas = await html2canvas(timelineElement, {
      backgroundColor: '#ffffff',
      scale: 2
    })

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob)
      }, 'image/png')
    })
  } catch (error) {
    logger.error('导出时间线图片失败:', error)
    return null
  }
}

/**
 * 将时间线事件转换为vis-timeline数据格式
 */
export function toVisTimelineData(events: TimelineEvent[]): { items: any[], groups: any[] } {
  // 确保events是数组
  const eventsArray = Array.isArray(events) ? events : []

  const items = eventsArray.map(event => ({
    id: event.id,
    content: event.content,
    start: event.start,
    end: event.end,
    group: event.group,
    type: event.end ? 'range' : 'point',
    className: event.className,
    title: event.description || event.title || '',
    data: event  // 保存原始数据
  }))

  // 收集所有分组
  const groupSet = new Set(eventsArray.map(e => e.group).filter(Boolean))
  const groups = Array.from(groupSet).map(groupId => ({
    id: groupId,
    content: groupId
  }))

  return { items, groups }
}
