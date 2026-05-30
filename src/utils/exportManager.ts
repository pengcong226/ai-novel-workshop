/**
 * 统一导出管理器
 * 提供统一的导出 API，支持多种格式、批量导出和预览
 */

import type { Chapter, Project } from '@/types'
import { getLogger } from '@/utils/logger'

import {
  exportAllChaptersToMarkdown,
  exportChapterToMarkdown,
  exportProjectToMarkdown,
  type MarkdownExportOptions,
  DEFAULT_MD_OPTIONS
} from '@/utils/markdownExporter'

import {
  exportAllChaptersToPdf,
  exportChapterToPdf,
  type PdfExportOptions,
  DEFAULT_PDF_OPTIONS
} from '@/utils/pdfExporter'

import {
  exportAllChaptersToDocx,
  type DocxExportOptions,
  DEFAULT_DOCX_OPTIONS
} from '@/utils/docxExporter'

import {
  exportProjectAsEPUB
} from '@/utils/exporters/epubExporter'

import {
  exportAllChaptersToTxt,
  exportChapterToTxt,
  type TxtExportOptions,
  DEFAULT_TXT_OPTIONS
} from '@/utils/txtExporter'

import {
  exportToPlatformFormat,
  type PlatformExportOptions,
  type PlatformId
} from '@/utils/exporters/platformExporter'

const logger = getLogger('utils:export-manager')

/**
 * 支持的导出格式
 */
export type ExportFormat = 'txt' | 'md' | 'pdf' | 'docx' | 'epub'

/**
 * 导出范围
 */
export type ExportScope = 'single' | 'all' | 'project'

/**
 * 统一导出选项
 */
export interface ExportManagerOptions {
  format: ExportFormat
  scope: ExportScope
  chapterIndex?: number      // scope='single' 时使用
  onProgress?: (current: number, total: number) => void

  // 各格式的特定选项（可选，使用默认值）
  txtOptions?: Partial<TxtExportOptions>
  mdOptions?: Partial<MarkdownExportOptions>
  pdfOptions?: Partial<PdfExportOptions>
  docxOptions?: Partial<DocxExportOptions>
}

/**
 * 导出结果
 */
export interface ExportResult {
  success: boolean
  format: ExportFormat
  message: string
  warnings?: string[]
}

/**
 * 格式信息
 */
export interface FormatInfo {
  id: ExportFormat
  name: string
  extension: string
  description: string
  supportsChapter: boolean
  supportsBatch: boolean
  supportsProject: boolean
}

/**
 * 可用的导出格式信息
 */
export const AVAILABLE_FORMATS: FormatInfo[] = [
  {
    id: 'txt',
    name: '纯文本',
    extension: '.txt',
    description: '带缩进和格式的纯文本文件，兼容性最好',
    supportsChapter: true,
    supportsBatch: true,
    supportsProject: true
  },
  {
    id: 'md',
    name: 'Markdown',
    extension: '.md',
    description: 'Markdown 格式，适合后续编辑和渲染',
    supportsChapter: true,
    supportsBatch: true,
    supportsProject: true
  },
  {
    id: 'pdf',
    name: 'PDF',
    extension: '.pdf',
    description: 'PDF 格式，通过浏览器打印生成，适合阅读和分享',
    supportsChapter: true,
    supportsBatch: true,
    supportsProject: false
  },
  {
    id: 'docx',
    name: 'Word',
    extension: '.docx',
    description: 'Microsoft Word 格式，适合进一步编辑和排版',
    supportsChapter: true,
    supportsBatch: true,
    supportsProject: false
  },
  {
    id: 'epub',
    name: 'EPUB',
    extension: '.epub',
    description: '电子书格式，适合在阅读器上阅读',
    supportsChapter: false,
    supportsBatch: false,
    supportsProject: true
  }
]

/**
 * 生成导出预览
 * 返回纯文本预览（截取前 N 字符）
 */
export function generateExportPreview(
  chapters: Chapter[],
  format: ExportFormat,
  maxChars: number = 2000
): string {
  const sortedChapters = [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0))

  let preview = ''

  switch (format) {
    case 'txt': {
      const firstChapter = sortedChapters[0]
      if (firstChapter) {
        preview = `第${firstChapter.number}章 ${firstChapter.title || ''}\n`
        preview += '─'.repeat(30) + '\n\n'
        preview += (firstChapter.content || '').slice(0, maxChars)
      }
      break
    }
    case 'md': {
      const firstChapter = sortedChapters[0]
      if (firstChapter) {
        preview = `# 第${firstChapter.number}章 ${firstChapter.title || ''}\n\n`
        preview += `**字数：** ${firstChapter.wordCount || 0}\n\n`
        preview += (firstChapter.content || '').slice(0, maxChars)
      }
      break
    }
    case 'pdf': {
      preview = `[PDF 预览]\n\n`
      const firstChapter = sortedChapters[0]
      if (firstChapter) {
        preview += `第${firstChapter.number}章 ${firstChapter.title || ''}\n\n`
        preview += (firstChapter.content || '').slice(0, maxChars)
      }
      break
    }
    case 'docx': {
      preview = `[DOCX 预览]\n\n`
      const firstChapter = sortedChapters[0]
      if (firstChapter) {
        preview += `第${firstChapter.number}章 ${firstChapter.title || ''}\n\n`
        preview += (firstChapter.content || '').slice(0, maxChars)
      }
      break
    }
    case 'epub': {
      preview = `[EPUB 电子书预览]\n\n`
      for (const ch of sortedChapters.slice(0, 3)) {
        preview += `第${ch.number}章 ${ch.title || ''}\n`
        preview += (ch.content || '').slice(0, 300) + '\n\n'
      }
      if (sortedChapters.length > 3) {
        preview += `...（共 ${sortedChapters.length} 章）\n`
      }
      break
    }
  }

  if (preview.length > maxChars) {
    preview = preview.slice(0, maxChars) + '\n\n...（预览截断）'
  }

  return preview
}

/**
 * 获取导出统计信息
 */
export function getExportStats(chapters: Chapter[]): {
  chapterCount: number
  totalWords: number
  avgWordsPerChapter: number
  statusBreakdown: Record<string, number>
} {
  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
  const statusBreakdown: Record<string, number> = {}

  for (const ch of chapters) {
    const status = ch.status || 'draft'
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1
  }

  return {
    chapterCount: chapters.length,
    totalWords,
    avgWordsPerChapter: Math.round(totalWords / Math.max(chapters.length, 1)),
    statusBreakdown
  }
}

/**
 * 统一导出接口
 */
export async function exportWithManager(
  project: Project,
  options: ExportManagerOptions
): Promise<ExportResult> {
  const { format, scope, chapterIndex, onProgress } = options
  const chapters = project.chapters || []
  const projectTitle = project.title || '未命名小说'

  logger.info(`开始导出: 格式=${format}, 范围=${scope}, 章节数=${chapters.length}`)

  try {
    switch (format) {
      case 'txt': {
        const txtOpts = { ...DEFAULT_TXT_OPTIONS, ...options.txtOptions }
        if (scope === 'single' && chapterIndex !== undefined) {
          const chapter = chapters[chapterIndex]
          if (!chapter) throw new Error(`章节索引 ${chapterIndex} 超出范围`)
          exportChapterToTxt(chapter, projectTitle, txtOpts)
        } else if (scope === 'project') {
          exportAllChaptersToTxt(project.chapters, project.title, txtOpts, onProgress)
        } else {
          exportAllChaptersToTxt(chapters, projectTitle, txtOpts, onProgress)
        }
        break
      }

      case 'md': {
        const mdOpts = { ...DEFAULT_MD_OPTIONS, ...options.mdOptions }
        if (scope === 'single' && chapterIndex !== undefined) {
          const chapter = chapters[chapterIndex]
          if (!chapter) throw new Error(`章节索引 ${chapterIndex} 超出范围`)
          exportChapterToMarkdown(chapter, projectTitle, mdOpts)
        } else if (scope === 'project') {
          exportProjectToMarkdown(project, mdOpts, onProgress)
        } else {
          exportAllChaptersToMarkdown(chapters, projectTitle, mdOpts, onProgress)
        }
        break
      }

      case 'pdf': {
        const pdfOpts = { ...DEFAULT_PDF_OPTIONS, ...options.pdfOptions, title: projectTitle }
        if (scope === 'single' && chapterIndex !== undefined) {
          const chapter = chapters[chapterIndex]
          if (!chapter) throw new Error(`章节索引 ${chapterIndex} 超出范围`)
          exportChapterToPdf(chapter, project, pdfOpts)
        } else {
          exportAllChaptersToPdf(chapters, project, pdfOpts, onProgress)
        }
        break
      }

      case 'docx': {
        const docxOpts = { ...DEFAULT_DOCX_OPTIONS, ...options.docxOptions }
        if (scope === 'single' && chapterIndex !== undefined) {
          const chapter = chapters[chapterIndex]
          if (!chapter) throw new Error(`章节索引 ${chapterIndex} 超出范围`)
          await exportAllChaptersToDocx([chapter], projectTitle, docxOpts)
        } else {
          await exportAllChaptersToDocx(chapters, projectTitle, docxOpts, onProgress)
        }
        break
      }

      case 'epub': {
        await exportProjectAsEPUB(project, chapters)
        break
      }

      default:
        throw new Error(`不支持的导出格式: ${format}`)
    }

    logger.info(`导出完成: ${format}`)
    return {
      success: true,
      format,
      message: `已成功导出为 ${format.toUpperCase()} 格式`
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`导出失败: ${format}`, error)
    return {
      success: false,
      format,
      message: `导出失败: ${message}`
    }
  }
}

/**
 * 批量导出为多种格式
 */
export async function batchExport(
  project: Project,
  formats: ExportFormat[],
  scope: ExportScope = 'all',
  onProgress?: (format: ExportFormat, current: number, total: number) => void
): Promise<ExportResult[]> {
  const results: ExportResult[] = []

  for (let i = 0; i < formats.length; i++) {
    const format = formats[i]
    onProgress?.(format, i + 1, formats.length)

    const result = await exportWithManager(project, {
      format,
      scope,
      onProgress: (current, total) => {
        onProgress?.(format, current, total)
      }
    })

    results.push(result)
  }

  return results
}

/**
 * 导出为平台兼容格式（TXT 文本）
 */
export function exportForPlatform(
  chapters: Chapter[],
  platform: PlatformId,
  options: Partial<PlatformExportOptions> = {}
): { content: string; warnings: string[] } {
  const result = exportToPlatformFormat(chapters, {
    ...options,
    platform
  })

  return {
    content: result.content,
    warnings: result.warnings
  }
}

/**
 * 获取格式信息
 */
export function getFormatInfo(format: ExportFormat): FormatInfo | undefined {
  return AVAILABLE_FORMATS.find(f => f.id === format)
}

/**
 * 获取所有可用格式
 */
export function getAvailableFormats(): FormatInfo[] {
  return [...AVAILABLE_FORMATS]
}

/**
 * 根据范围获取可用格式
 */
export function getFormatsForScope(scope: ExportScope): FormatInfo[] {
  return AVAILABLE_FORMATS.filter(f => {
    switch (scope) {
      case 'single': return f.supportsChapter
      case 'all': return f.supportsBatch
      case 'project': return f.supportsProject
      default: return true
    }
  })
}
