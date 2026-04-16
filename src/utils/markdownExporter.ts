/**
 * Markdown 导出工具
 * 支持导出章节为 Markdown 格式
 */

import { saveAs } from 'file-saver'
import type { Chapter, Project } from '@/types'

/**
 * 导出选项
 */
export interface MarkdownExportOptions {
  includeMetadata: boolean      // 包含元数据
  includeOutline: boolean       // 包含大纲
  includeCharacters: boolean    // 包含出场人物
  includeLocation: boolean      // 包含地点
  includeSummary: boolean       // 包含摘要
  chapterSeparator: string      // 章节分隔符
  customTemplate?: string       // 自定义模板
}

/**
 * 默认导出选项
 */
export const DEFAULT_MD_OPTIONS: MarkdownExportOptions = {
  includeMetadata: true,
  includeOutline: false,
  includeCharacters: true,
  includeLocation: true,
  includeSummary: false,
  chapterSeparator: '\n\n---\n\n'
}

/**
 * 转义 Markdown 特殊字符
 */
export function escapeMarkdown(text: string): string {
  // 只转义可能在 Markdown 中产生歧义的特殊字符
  // 不转义所有字符，保持文本可读性
  return text
    .replace(/\\/g, '\\\\')   // 反斜杠
    .replace(/\*/g, '\\*')    // 星号（斜体/粗体标记）
    .replace(/`/g, '\\`')     // 反引号（代码标记）
}

/**
 * 格式化日期
 */
function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 获取章节状态文本
 */
function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    draft: '草稿',
    revised: '已修订',
    final: '定稿'
  }
  return texts[status] || status
}

/**
 * 生成单个章节的 Markdown
 */
export function generateChapterMarkdown(
  chapter: Chapter,
  options: MarkdownExportOptions = DEFAULT_MD_OPTIONS
): string {
  const lines: string[] = []

  // 标题
  lines.push(`# 第${chapter.number}章 ${chapter.title}`)
  lines.push('')

  // 元数据
  if (options.includeMetadata) {
    lines.push(`**字数：** ${chapter.wordCount}`)
    lines.push(`**创建时间：** ${formatDate(chapter.generationTime)}`)
    lines.push(`**状态：** ${getStatusText(chapter.status)}`)

    if (chapter.generatedBy === 'ai') {
      lines.push(`**生成方式：** AI生成`)
    }

    if (chapter.qualityScore !== undefined) {
      lines.push(`**质量评分：** ${chapter.qualityScore}/10`)
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  // 大纲信息
  if (options.includeOutline && chapter.outline) {
    lines.push('## 章节大纲')
    lines.push('')

    if (chapter.outline.goals.length > 0) {
      lines.push('**目标：**')
      chapter.outline.goals.forEach(goal => {
        lines.push(`- ${goal}`)
      })
      lines.push('')
    }

    if (chapter.outline.conflicts.length > 0) {
      lines.push('**冲突：**')
      chapter.outline.conflicts.forEach(conflict => {
        lines.push(`- ${conflict}`)
      })
      lines.push('')
    }

    if (chapter.outline.resolutions.length > 0) {
      lines.push('**解决：**')
      chapter.outline.resolutions.forEach(resolution => {
        lines.push(`- ${resolution}`)
      })
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // 正文内容
  lines.push(chapter.content)
  lines.push('')

  // 章节结尾信息
  lines.push('---')
  lines.push('')

  // 出场人物
  if (options.includeCharacters && chapter.outline?.characters.length > 0) {
    lines.push(`**人物：** ${chapter.outline.characters.join('、')}`)
  }

  // 地点
  if (options.includeLocation && chapter.outline?.location) {
    lines.push(`**地点：** ${chapter.outline.location}`)
  }

  // 摘要
  if (options.includeSummary && chapter.summary) {
    lines.push('')
    lines.push('**摘要：**')
    lines.push(chapter.summary)
  }

  return lines.join('\n')
}

/**
 * 生成目录 Markdown
 */
export function generateTocMarkdown(chapters: Chapter[]): string {
  const lines: string[] = []

  lines.push('# 目录')
  lines.push('')

  chapters.forEach(chapter => {
    const wordCount = (chapter.wordCount / 1000).toFixed(1)
    lines.push(`- [第${chapter.number}章 ${chapter.title}](#第${chapter.number}章-${chapter.title.replace(/\s+/g, '-')}) (${wordCount}k字)`)
  })

  lines.push('')
  lines.push(`**总字数：** ${chapters.reduce((sum, c) => sum + c.wordCount, 0).toLocaleString()} 字`)
  lines.push('')

  return lines.join('\n')
}

/**
 * 导出单个章节为 Markdown 文件
 */
export function exportChapterToMarkdown(
  chapter: Chapter,
  projectTitle: string,
  options: MarkdownExportOptions = DEFAULT_MD_OPTIONS
): void {
  const content = generateChapterMarkdown(chapter, options)
  const filename = `${projectTitle}_第${chapter.number}章_${chapter.title}.md`

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, filename)
}

/**
 * 批量导出所有章节为 Markdown 文件
 */
export function exportAllChaptersToMarkdown(
  chapters: Chapter[],
  projectTitle: string,
  options: MarkdownExportOptions = DEFAULT_MD_OPTIONS,
  onProgress?: (current: number, total: number) => void
): void {
  // 生成目录
  let content = generateTocMarkdown(chapters)

  // 添加每个章节
  chapters.forEach((chapter, index) => {
    if (onProgress) {
      onProgress(index + 1, chapters.length)
    }

    content += options.chapterSeparator
    content += generateChapterMarkdown(chapter, options)
  })

  // 添加文件结尾
  content += '\n\n---\n\n'
  content += `# 完结\n\n`
  content += `本文由 AI小说工坊 生成\n`
  content += `导出时间：${new Date().toLocaleString()}\n`

  const filename = `${projectTitle}_完整版.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, filename)
}

/**
 * 生成项目概述 Markdown
 */
export function generateProjectOverviewMarkdown(project: Project): string {
  const lines: string[] = []

  lines.push(`# ${project.title}`)
  lines.push('')

  // 基本信息
  lines.push('## 基本信息')
  lines.push('')
  lines.push(`- **类型：** ${project.genre}`)
  lines.push(`- **目标字数：** ${project.targetWords.toLocaleString()} 字`)
  lines.push(`- **当前字数：** ${project.currentWords.toLocaleString()} 字`)
  lines.push(`- **状态：** ${project.status === 'draft' ? '草稿' : project.status === 'writing' ? '写作中' : '已完成'}`)
  lines.push(`- **创建时间：** ${formatDate(project.createdAt)}`)
  lines.push(`- **更新时间：** ${formatDate(project.updatedAt)}`)
  lines.push('')

  // 简介
  if (project.description) {
    lines.push('## 简介')
    lines.push('')
    lines.push(project.description)
    lines.push('')
  }

  // 世界观
  const { useSandboxStore } = require('@/stores/sandbox')
  const sandboxStore = useSandboxStore()
  const worldEntity = sandboxStore.entities.find((e: { type: string }) => e.type === 'WORLD')
  const worldResolved = worldEntity ? sandboxStore.activeEntitiesState[worldEntity.id] : null
  const factions = sandboxStore.entities.filter((e: { type: string; isArchived: boolean }) => e.type === 'FACTION' && !e.isArchived)
  const locations = sandboxStore.entities.filter((e: { type: string; isArchived: boolean }) => e.type === 'LOCATION' && !e.isArchived)

  if (worldEntity?.name || worldResolved?.properties['eraTime']) {
    lines.push('## 世界观')
    lines.push('')

    if (worldEntity?.name) {
      lines.push(`**世界名称：** ${worldEntity.name}`)
      lines.push('')
    }

    if (worldResolved?.properties['eraTime']) {
      lines.push(`**时代背景：** ${worldResolved.properties['eraTime']}`)
      lines.push('')
    }

    if (worldResolved?.properties['eraTechLevel']) {
      lines.push(`**科技水平：** ${worldResolved.properties['eraTechLevel']}`)
      lines.push('')
    }

    if (worldResolved?.properties['eraSocialForm']) {
      lines.push(`**社会形态：** ${worldResolved.properties['eraSocialForm']}`)
      lines.push('')
    }

    // 势力
    if (factions.length > 0) {
      lines.push('### 主要势力')
      lines.push('')
      factions.forEach((faction: { id: string; name: string; systemPrompt?: string }) => {
        const factionResolved = sandboxStore.activeEntitiesState[faction.id]
        lines.push(`#### ${faction.name}`)
        lines.push('')
        const factionType = factionResolved?.properties['factionType'] || '未知'
        lines.push(`**类型：** ${factionType}`)
        lines.push('')
        const factionDesc = factionResolved?.properties['description'] || faction.systemPrompt || ''
        if (factionDesc) {
          lines.push(factionDesc)
          lines.push('')
        }
      })
    }

    // 地点
    if (locations.length > 0) {
      lines.push('### 重要地点')
      lines.push('')
      locations.forEach((location: { id: string; name: string; systemPrompt?: string }) => {
        const locResolved = sandboxStore.activeEntitiesState[location.id]
        const locDesc = locResolved?.properties['description'] || location.systemPrompt || ''
        lines.push(`- **${location.name}**：${locDesc}`)
      })
      lines.push('')
    }
  }

  // 主要人物
  const characterEntities = sandboxStore.entities.filter((e: { type: string; isArchived: boolean }) => e.type === 'CHARACTER' && !e.isArchived)
  if (characterEntities.length > 0) {
    lines.push('## 主要人物')
    lines.push('')

    characterEntities.slice(0, 10).forEach((entity: { id: string; name: string; importance: string; aliases?: string[]; systemPrompt?: string }) => {
      const resolved = sandboxStore.activeEntitiesState[entity.id]
      lines.push(`### ${entity.name}`)
      lines.push('')

      if (entity.aliases && entity.aliases.length > 0) {
        lines.push(`**别名：** ${entity.aliases.join('、')}`)
        lines.push('')
      }

      const gender = resolved?.properties['gender'] || '未知'
      lines.push(`**性别：** ${gender === 'male' ? '男' : gender === 'female' ? '女' : gender === 'other' ? '其他' : gender}`)
      lines.push(`**年龄：** ${resolved?.properties['age'] || ''}`)
      lines.push('')

      if (entity.systemPrompt) {
        lines.push('**背景：**')
        lines.push(entity.systemPrompt)
        lines.push('')
      }

      const personalityRaw = resolved?.properties['personality']
      if (personalityRaw) {
        try {
          const personality: string[] = JSON.parse(personalityRaw)
          if (personality.length > 0) {
            lines.push(`**性格：** ${personality.join('、')}`)
            lines.push('')
          }
        } catch {
          // personality is not JSON, display as-is
          lines.push(`**性格：** ${personalityRaw}`)
          lines.push('')
        }
      }
    })

    if (characterEntities.length > 10) {
      lines.push(`*（还有 ${characterEntities.length - 10} 个角色未显示）*`)
      lines.push('')
    }
  }

  // 大纲
  if (project.outline.synopsis) {
    lines.push('## 故事大纲')
    lines.push('')
    lines.push(project.outline.synopsis)
    lines.push('')

    if (project.outline.theme) {
      lines.push(`**主题：** ${project.outline.theme}`)
      lines.push('')
    }
  }

  // 卷大纲
  if (project.outline.volumes.length > 0) {
    lines.push('## 分卷大纲')
    lines.push('')

    project.outline.volumes.forEach(volume => {
      lines.push(`### 第${volume.number}卷：${volume.title}`)
      lines.push('')
      lines.push(`**主题：** ${volume.theme}`)
      lines.push('')
      lines.push(`**章节范围：** 第${volume.startChapter}章 - 第${volume.endChapter}章`)
      lines.push('')

      if (volume.mainEvents.length > 0) {
        lines.push('**主要事件：**')
        volume.mainEvents.forEach(event => {
          lines.push(`- ${event}`)
        })
        lines.push('')
      }
    })
  }

  return lines.join('\n')
}

/**
 * 导出完整项目为 Markdown（包含设定、大纲、章节）
 */
export function exportProjectToMarkdown(
  project: Project,
  options: MarkdownExportOptions = DEFAULT_MD_OPTIONS,
  onProgress?: (current: number, total: number) => void
): void {
  let content = ''

  // 项目概述
  content += generateProjectOverviewMarkdown(project)
  content += '\n\n---\n\n'

  // 章节目录
  content += generateTocMarkdown(project.chapters)
  content += '\n\n---\n\n'

  // 所有章节
  const total = project.chapters.length
  project.chapters.forEach((chapter, index) => {
    if (onProgress) {
      onProgress(index + 1, total)
    }

    content += generateChapterMarkdown(chapter, options)
    content += options.chapterSeparator
  })

  // 文件结尾
  content += '# 完结\n\n'
  content += `本文由 AI小说工坊 生成\n`
  content += `导出时间：${new Date().toLocaleString()}\n`

  const filename = `${project.title}_完整项目.md`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  saveAs(blob, filename)
}
