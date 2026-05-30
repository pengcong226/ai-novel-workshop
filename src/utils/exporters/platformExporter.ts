/**
 * 平台格式导出器
 * 支持起点中文网、番茄小说等主流平台的格式要求
 */

import type { Chapter } from '@/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('exporter:platform')

export type PlatformId = 'qidian' | 'fanqie' | 'ciweimao' | 'jjwxc' | 'generic'

export interface PlatformFormatConfig {
  id: PlatformId
  name: string                  // 平台名称
  maxChapterTitleLength: number // 章节标题最大字数
  maxChapterLength: number      // 单章最大字数
  minChapterLength: number      // 单章最小字数
  paragraphIndent: string       // 段落缩进（全角空格）
  chapterTitleFormat: 'plain' | 'numbered' | 'custom'
  separator: string             // 章节分隔符
  forbiddenPatterns: RegExp[]   // 禁止出现的格式
  encoding: string
}

export const PLATFORM_CONFIGS: Record<PlatformId, PlatformFormatConfig> = {
  qidian: {
    id: 'qidian',
    name: '起点中文网',
    maxChapterTitleLength: 30,
    maxChapterLength: 10000,
    minChapterLength: 2000,
    paragraphIndent: '\u3000\u3000',
    chapterTitleFormat: 'plain',
    separator: '\n\n',
    forbiddenPatterns: [/\t/g, /[□■◆◇○●]/g],
    encoding: 'utf-8',
  },
  fanqie: {
    id: 'fanqie',
    name: '番茄小说',
    maxChapterTitleLength: 50,
    maxChapterLength: 8000,
    minChapterLength: 1000,
    paragraphIndent: '\u3000\u3000',
    chapterTitleFormat: 'numbered',
    separator: '\n\n',
    forbiddenPatterns: [/\t/g, /[□■◆◇○●★☆]/g],
    encoding: 'utf-8',
  },
  ciweimao: {
    id: 'ciweimao',
    name: '刺猬猫',
    maxChapterTitleLength: 40,
    maxChapterLength: 12000,
    minChapterLength: 1500,
    paragraphIndent: '\u3000\u3000',
    chapterTitleFormat: 'plain',
    separator: '\n\n---\n\n',
    forbiddenPatterns: [/\t/g],
    encoding: 'utf-8',
  },
  jjwxc: {
    id: 'jjwxc',
    name: '晋江文学城',
    maxChapterTitleLength: 25,
    maxChapterLength: 15000,
    minChapterLength: 3000,
    paragraphIndent: '\u3000\u3000',
    chapterTitleFormat: 'numbered',
    separator: '\n\n',
    forbiddenPatterns: [/\t/g, /[□■◆◇○●★☆♦♠♣♥]/g],
    encoding: 'utf-8',
  },
  generic: {
    id: 'generic',
    name: '通用格式',
    maxChapterTitleLength: 100,
    maxChapterLength: 50000,
    minChapterLength: 0,
    paragraphIndent: '\u3000\u3000',
    chapterTitleFormat: 'plain',
    separator: '\n\n',
    forbiddenPatterns: [],
    encoding: 'utf-8',
  },
}

export interface PlatformExportOptions {
  platform: PlatformId
  authorName?: string
  bookName?: string
  includeAuthorNotes?: boolean
  autoTrimLongChapters?: boolean
}

export const DEFAULT_PLATFORM_OPTIONS: PlatformExportOptions = {
  platform: 'qidian',
  authorName: '',
  bookName: '',
  includeAuthorNotes: false,
  autoTrimLongChapters: false,
}

export interface PlatformExportResult {
  content: string
  warnings: string[]
  chapterCount: number
  totalWordCount: number
}

/**
 * 格式化章节标题，按照平台规则处理
 */
function formatChapterTitle(chapter: Chapter, config: PlatformFormatConfig): string {
  let title = chapter.title || `第${chapter.index ?? 0 + 1}章`

  // 根据平台要求格式化标题
  switch (config.chapterTitleFormat) {
    case 'numbered': {
      const chapterNum = (chapter.index ?? 0) + 1
      // 如果标题已包含"第X章"格式则直接使用，否则添加编号
      if (!/^第[一二三四五六七八九十百千\d]+章/.test(title)) {
        title = `第${chapterNum}章 ${title}`
      }
      break
    }
    case 'custom':
      // 自定义格式保持原样
      break
    case 'plain':
    default:
      // 纯标题，不做额外处理
      break
  }

  // 截断过长的标题
  if (title.length > config.maxChapterTitleLength) {
    title = title.substring(0, config.maxChapterTitleLength)
    logger.warn(`章节标题过长，已截断: "${chapter.title}" -> "${title}"`)
  }

  return title
}

/**
 * 格式化章节内容，处理缩进和清理特殊字符
 */
function formatChapterContent(content: string, config: PlatformFormatConfig): string {
  let formatted = content

  // 统一换行符
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // 移除禁止出现的格式字符
  for (const pattern of config.forbiddenPatterns) {
    formatted = formatted.replace(pattern, '')
  }

  // 按段落处理
  const paragraphs = formatted.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  const formattedParagraphs = paragraphs.map(paragraph => {
    // 清理段落内部的多余换行
    const cleaned = paragraph.replace(/\n/g, '').trim()

    // 添加段落缩进（如果尚未缩进）
    if (!cleaned.startsWith(config.paragraphIndent)) {
      return config.paragraphIndent + cleaned
    }
    return cleaned
  })

  return formattedParagraphs.join('\n')
}

/**
 * 针对特定平台进行内容后处理
 */
function applyPlatformSpecificFormatting(
  content: string,
  config: PlatformFormatConfig,
  options: PlatformExportOptions
): string {
  let result = content

  switch (config.id) {
    case 'qidian': {
      // 起点中文网：纯文本标题，全角空格缩进，去除特殊符号
      result = result.replace(/[\u200B-\u200D\uFEFF]/g, '') // 移除零宽字符
      result = result.replace(/\s+$/gm, '') // 移除行尾空白
      break
    }

    case 'fanqie': {
      // 番茄小说：支持编号标题，章节可以较短
      // 清理多余空行，番茄对格式要求相对宽松
      result = result.replace(/\n{3,}/g, '\n\n')
      break
    }

    case 'ciweimao': {
      // 刺猬猫：支持作者有话说，使用特定分隔符
      // 在章节末尾添加作者有话说区域（如果启用）
      if (options.includeAuthorNotes) {
        result += '\n\n---\n\n【作者有话说】\n感谢阅读，求收藏求推荐！'
      }
      break
    }

    case 'jjwxc': {
      // 晋江文学城：有严格的章节结构要求
      // 晋江要求每个章节有明确的开始和结束标记
      result = result.replace(/\n{3,}/g, '\n\n')
      // 晋江禁止出现外部链接相关内容
      result = result.replace(/https?:\/\/\S+/g, '[链接已移除]')
      result = result.replace(/www\.\S+/g, '[链接已移除]')
      break
    }

    case 'generic':
    default:
      // 通用格式不做特殊处理
      break
  }

  return result
}

/**
 * 截断过长的章节，在合适的段落边界处截断
 */
function trimLongChapter(content: string, maxLength: number): { content: string; trimmed: boolean } {
  if (content.length <= maxLength) {
    return { content, trimmed: false }
  }

  // 在最大长度范围内寻找最近的段落分隔点
  let trimPoint = maxLength
  const lastNewline = content.lastIndexOf('\n', maxLength)
  if (lastNewline > maxLength * 0.8) {
    trimPoint = lastNewline
  }

  const trimmedContent = content.substring(0, trimPoint)
  logger.warn(`章节内容过长（${content.length}字），已截断至${trimmedContent.length}字`)

  return { content: trimmedContent, trimmed: true }
}

/**
 * 验证章节是否符合平台要求
 */
export function validateChapterForPlatform(
  chapter: Chapter,
  platform: PlatformId
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []
  const config = PLATFORM_CONFIGS[platform]
  const content = chapter.content || ''
  const title = chapter.title || ''
  const wordCount = content.replace(/\s/g, '').length

  // 检查标题长度
  if (title.length > config.maxChapterTitleLength) {
    warnings.push(`章节标题超过${config.name}限制（${title.length}/${config.maxChapterTitleLength}字）`)
  }

  // 检查章节字数
  if (wordCount > config.maxChapterLength) {
    warnings.push(`章节字数超过${config.name}上限（${wordCount}/${config.maxChapterLength}字）`)
  }

  if (wordCount < config.minChapterLength) {
    warnings.push(`章节字数低于${config.name}下限（${wordCount}/${config.minChapterLength}字）`)
  }

  // 检查禁止的格式
  for (const pattern of config.forbiddenPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      warnings.push(`章节内容包含${config.name}禁止的字符: ${matches[0]}`)
    }
  }

  // 检查零宽字符
  if (/[\u200B-\u200D\uFEFF]/.test(content)) {
    warnings.push('章节内容包含零宽字符，可能导致显示异常')
  }

  // 检查链接（部分平台禁止）
  if (config.id === 'jjwxc' && /https?:\/\/\S+|www\.\S+/.test(content)) {
    warnings.push('晋江文学城禁止在正文中包含外部链接')
  }

  const valid = warnings.length === 0

  if (!valid) {
    logger.warn(`章节 "${title}" 未通过${config.name}格式验证: ${warnings.join('; ')}`)
  } else {
    logger.info(`章节 "${title}" 通过${config.name}格式验证`)
  }

  return { valid, warnings }
}

/**
 * 导出所有章节为平台兼容格式
 */
export function exportToPlatformFormat(
  chapters: Chapter[],
  options: PlatformExportOptions
): PlatformExportResult {
  const mergedOptions = { ...DEFAULT_PLATFORM_OPTIONS, ...options }
  const config = PLATFORM_CONFIGS[mergedOptions.platform]
  const warnings: string[] = []
  let totalWordCount = 0

  logger.info(`开始导出到${config.name}格式，共${chapters.length}章`)

  // 按章节索引排序
  const sortedChapters = [...chapters].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

  const formattedChapters: string[] = []

  // 添加书名和作者信息头部（如果提供）
  if (mergedOptions.bookName || mergedOptions.authorName) {
    const headerParts: string[] = []
    if (mergedOptions.bookName) {
      headerParts.push(`书名：${mergedOptions.bookName}`)
    }
    if (mergedOptions.authorName) {
      headerParts.push(`作者：${mergedOptions.authorName}`)
    }
    formattedChapters.push(headerParts.join('\n'))
  }

  for (const chapter of sortedChapters) {
    // 验证章节
    const validation = validateChapterForPlatform(chapter, config.id)
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings.map(w => `[${chapter.title}] ${w}`))
    }

    // 格式化标题
    const title = formatChapterTitle(chapter, config)

    // 格式化内容
    let content = formatChapterContent(chapter.content || '', config)

    // 处理过长章节
    if (mergedOptions.autoTrimLongChapters) {
      const { content: trimmedContent, trimmed } = trimLongChapter(content, config.maxChapterLength)
      if (trimmed) {
        content = trimmedContent
        warnings.push(`章节 "${chapter.title}" 已自动截断至平台限制长度`)
      }
    }

    // 应用平台特定格式化
    content = applyPlatformSpecificFormatting(content, config, mergedOptions)

    // 组装章节
    const formattedChapter = `${title}\n${content}`
    formattedChapters.push(formattedChapter)

    // 统计字数
    const chapterWordCount = content.replace(/\s/g, '').length
    totalWordCount += chapterWordCount
  }

  // 用平台分隔符连接所有章节
  const fullContent = formattedChapters.join(config.separator)

  logger.info(`导出完成: ${sortedChapters.length}章，共${totalWordCount}字，${warnings.length}条警告`)

  return {
    content: fullContent,
    warnings,
    chapterCount: sortedChapters.length,
    totalWordCount,
  }
}
