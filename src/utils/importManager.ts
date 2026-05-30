/**
 * 统一导入管理器
 * 支持 TXT/DOCX/MD 文件导入，含文件验证、预览和冲突处理
 */

import type { Chapter } from '@/types'
import type { ImportOptions, ImportResult, ProgressCallback } from '@/utils/novelImporter'
import { importNovel, importMultipleFiles } from '@/utils/novelImporter'
import { parseNovelText, type ParsedChapter } from '@/utils/chapterParser'
import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:import-manager')

/**
 * 支持的导入格式
 */
export type ImportFormat = 'txt' | 'md' | 'docx'

/**
 * 文件验证结果
 */
export interface FileValidationResult {
  valid: boolean
  format: ImportFormat | null
  errors: string[]
  warnings: string[]
  fileInfo?: {
    name: string
    size: number
    sizeFormatted: string
    lastModified: Date
  }
}

/**
 * 导入预览结果
 */
export interface ImportPreviewResult {
  chapters: ParsedChapter[]
  stats: {
    totalWords: number
    totalChapters: number
    avgWordsPerChapter: number
    longestChapter: { title: string; words: number } | null
    shortestChapter: { title: string; words: number } | null
  }
  warnings: string[]
}

/**
 * 冲突解决策略
 */
export type ConflictStrategy = 'skip' | 'replace' | 'merge' | 'ask'

/**
 * 冲突信息
 */
export interface ConflictInfo {
  type: 'duplicate_title' | 'duplicate_number' | 'empty_content'
  existingChapter?: Chapter
  newChapter?: ParsedChapter
  message: string
}

/**
 * 导入管理器配置
 */
export interface ImportManagerConfig {
  maxFileSize: number           // 最大文件大小（字节）
  maxChapters: number           // 最大章节数
  allowedFormats: ImportFormat[]
  defaultConflictStrategy: ConflictStrategy
  autoDetectEncoding: boolean
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ImportManagerConfig = {
  maxFileSize: 100 * 1024 * 1024,  // 100MB
  maxChapters: 10000,
  allowedFormats: ['txt', 'md', 'docx'],
  defaultConflictStrategy: 'skip',
  autoDetectEncoding: true
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 检测文件格式
 */
function detectFormat(file: File): ImportFormat | null {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const formatMap: Record<string, ImportFormat> = {
    txt: 'txt',
    text: 'txt',
    md: 'md',
    markdown: 'md',
    docx: 'docx'
  }
  return formatMap[ext || ''] || null
}

/**
 * 使用 mammoth 从 DOCX 提取文本
 */
async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })

    if (result.messages.length > 0) {
      const warnings = result.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message)
      if (warnings.length > 0) {
        logger.warn('DOCX 解析警告:', warnings)
      }
    }

    return result.value
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`DOCX 文件解析失败: ${message}`)
  }
}

/**
 * 读取文本文件内容
 */
async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const content = e.target?.result as string
      if (!content || content.trim().length === 0) {
        reject(new Error('文件内容为空'))
        return
      }
      resolve(content)
    }

    reader.onerror = () => {
      reject(new Error(`文件读取失败: ${reader.error?.message || '未知错误'}`))
    }

    reader.readAsText(file, 'UTF-8')
  })
}

/**
 * 读取文件内容（根据格式）
 */
async function readFileContent(file: File, format: ImportFormat): Promise<string> {
  switch (format) {
    case 'docx':
      return extractTextFromDocx(file)
    case 'txt':
    case 'md':
      return readTextFile(file)
    default:
      throw new Error(`不支持的文件格式: ${format}`)
  }
}

/**
 * 验证文件
 */
export function validateFile(file: File, config: ImportManagerConfig = DEFAULT_CONFIG): FileValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 文件大小检查
  if (file.size === 0) {
    errors.push('文件为空')
  } else if (file.size > config.maxFileSize) {
    errors.push(`文件大小(${formatFileSize(file.size)})超过限制(${formatFileSize(config.maxFileSize)})`)
  }

  // 格式检测
  const format = detectFormat(file)
  if (!format) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '未知'
    errors.push(`不支持的文件格式: .${ext}，支持的格式: ${config.allowedFormats.join(', ')}`)
  } else if (!config.allowedFormats.includes(format)) {
    errors.push(`格式 ${format} 不在允许的格式列表中`)
  }

  // 警告
  if (file.size > 50 * 1024 * 1024) {
    warnings.push('文件较大，导入可能需要较长时间')
  }

  return {
    valid: errors.length === 0,
    format,
    errors,
    warnings,
    fileInfo: {
      name: file.name,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
      lastModified: new Date(file.lastModified)
    }
  }
}

/**
 * 生成导入预览（不实际创建项目）
 */
export async function generateImportPreview(
  file: File,
  config: ImportManagerConfig = DEFAULT_CONFIG
): Promise<ImportPreviewResult> {
  const warnings: string[] = []

  // 验证文件
  const validation = validateFile(file, config)
  if (!validation.valid) {
    throw new Error(`文件验证失败: ${validation.errors.join('; ')}`)
  }

  warnings.push(...validation.warnings)

  // 读取内容
  const format = validation.format!
  const text = await readFileContent(file, format)

  if (!text || text.trim().length === 0) {
    throw new Error('文件内容为空')
  }

  // 解析章节
  const { chapters, stats } = parseNovelText(text)

  if (chapters.length === 0) {
    warnings.push('未能检测到章节结构，将作为单章导入')
  }

  if (chapters.length > config.maxChapters) {
    warnings.push(`章节数量(${chapters.length})超过限制(${config.maxChapters})，可能需要手动分割`)
  }

  // 查找最长/最短章节
  let longestChapter: ImportPreviewResult['stats']['longestChapter'] = null
  let shortestChapter: ImportPreviewResult['stats']['shortestChapter'] = null

  if (chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => b.wordCount - a.wordCount)
    longestChapter = { title: sorted[0].title, words: sorted[0].wordCount }
    shortestChapter = { title: sorted[sorted.length - 1].title, words: sorted[sorted.length - 1].wordCount }
  }

  return {
    chapters,
    stats: {
      ...stats,
      longestChapter,
      shortestChapter
    },
    warnings
  }
}

/**
 * 检测与现有项目的冲突
 */
export function detectConflicts(
  existingChapters: Chapter[],
  newChapters: ParsedChapter[]
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []

  const existingTitles = new Set(existingChapters.map(c => c.title?.trim()).filter(Boolean))
  const existingNumbers = new Set(existingChapters.map(c => c.number))

  for (const newCh of newChapters) {
    // 标题冲突
    if (existingTitles.has(newCh.title?.trim())) {
      conflicts.push({
        type: 'duplicate_title',
        newChapter: newCh,
        existingChapter: existingChapters.find(c => c.title?.trim() === newCh.title?.trim()),
        message: `标题冲突: "${newCh.title}" 已存在于项目中`
      })
    }

    // 编号冲突
    if (existingNumbers.has(newCh.number)) {
      conflicts.push({
        type: 'duplicate_number',
        newChapter: newCh,
        existingChapter: existingChapters.find(c => c.number === newCh.number),
        message: `编号冲突: 第${newCh.number}章 已存在于项目中`
      })
    }

    // 空内容
    if (!newCh.content || newCh.content.trim().length === 0) {
      conflicts.push({
        type: 'empty_content',
        newChapter: newCh,
        message: `空内容: "${newCh.title}" 的内容为空`
      })
    }
  }

  return conflicts
}

/**
 * 应用冲突解决策略
 */
export function resolveConflicts(
  newChapters: ParsedChapter[],
  conflicts: ConflictInfo[],
  strategy: ConflictStrategy
): ParsedChapter[] {
  if (conflicts.length === 0) return newChapters

  const skipNumbers = new Set<number>()
  const skipTitles = new Set<string>()

  for (const conflict of conflicts) {
    if (conflict.type === 'empty_content') {
      // 空内容始终跳过
      if (conflict.newChapter) {
        skipNumbers.add(conflict.newChapter.number)
      }
      continue
    }

    if (strategy === 'skip' && conflict.newChapter) {
      skipNumbers.add(conflict.newChapter.number)
      if (conflict.newChapter.title) {
        skipTitles.add(conflict.newChapter.title.trim())
      }
    }
    // replace 和 merge 策略下保留所有章节（调用方处理实际替换逻辑）
  }

  return newChapters.filter(ch => {
    if (skipNumbers.has(ch.number)) return false
    if (ch.title && skipTitles.has(ch.title.trim())) return false
    return true
  })
}

/**
 * 统一导入接口
 */
export async function importWithManager(
  file: File,
  userOptions: Partial<ImportOptions> = {},
  config: ImportManagerConfig = DEFAULT_CONFIG,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  logger.info(`开始导入: ${file.name} (${formatFileSize(file.size)})`)

  // 验证文件
  const validation = validateFile(file, config)
  if (!validation.valid) {
    throw new Error(`文件验证失败: ${validation.errors.join('; ')}`)
  }

  const format = validation.format!

  // 构建导入选项
  const options: ImportOptions = {
    title: userOptions.title || file.name.replace(/\.[^/.]+$/, ''),
    detectChapters: userOptions.detectChapters ?? true,
    extractCharacters: userOptions.extractCharacters ?? true,
    extractRelations: userOptions.extractRelations ?? true,
    extractWorld: userOptions.extractWorld ?? true,
    generateOutlineFromChapters: userOptions.generateOutlineFromChapters ?? true,
    analyzeQualityMetrics: userOptions.analyzeQualityMetrics ?? false,
    useAIAnalysis: userOptions.useAIAnalysis ?? false,
    ...userOptions
  }

  onProgress?.({
    stage: 'parsing',
    current: 0,
    total: 100,
    message: `正在解析 ${format.toUpperCase()} 文件...`
  })

  // DOCX 格式需要特殊处理：先转为纯文本再导入
  if (format === 'docx') {
    onProgress?.({
      stage: 'parsing',
      current: 10,
      total: 100,
      message: '正在解析 DOCX 文件...'
    })

    const text = await extractTextFromDocx(file)

    // 创建临时 txt 文件供 importNovel 使用
    const tempFile = new File([text], file.name.replace(/\.docx$/i, '.txt'), {
      type: 'text/plain;charset=utf-8'
    })

    return importNovel(tempFile, options, onProgress)
  }

  // TXT 和 MD 格式直接调用 importNovel
  return importNovel(file, options, onProgress)
}

/**
 * 批量导入多个文件
 */
export async function importMultipleWithManager(
  files: File[],
  userOptions: Partial<ImportOptions> = {},
  config: ImportManagerConfig = DEFAULT_CONFIG,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  logger.info(`开始批量导入: ${files.length} 个文件`)

  // 验证所有文件
  const validations = files.map(f => ({
    file: f,
    validation: validateFile(f, config)
  }))

  const invalidFiles = validations.filter(v => !v.validation.valid)
  if (invalidFiles.length > 0) {
    const errorMessages = invalidFiles.map(v =>
      `${v.file.name}: ${v.validation.errors.join('; ')}`
    )
    throw new Error(`文件验证失败:\n${errorMessages.join('\n')}`)
  }

  // 处理 DOCX 文件：转换为 File 对象
  const processedFiles: File[] = []
  for (const { file, validation } of validations) {
    if (validation.format === 'docx') {
      const text = await extractTextFromDocx(file)
      processedFiles.push(new File([text], file.name.replace(/\.docx$/i, '.txt'), {
        type: 'text/plain;charset=utf-8'
      }))
    } else {
      processedFiles.push(file)
    }
  }

  return importMultipleFiles(processedFiles, {
    title: userOptions.title || '合并小说',
    detectChapters: userOptions.detectChapters ?? true,
    extractCharacters: userOptions.extractCharacters ?? true,
    extractRelations: userOptions.extractRelations ?? true,
    extractWorld: userOptions.extractWorld ?? true,
    generateOutlineFromChapters: userOptions.generateOutlineFromChapters ?? true,
    analyzeQualityMetrics: userOptions.analyzeQualityMetrics ?? false,
    useAIAnalysis: userOptions.useAIAnalysis ?? false,
    ...userOptions
  }, onProgress)
}

/**
 * 获取支持的导入格式信息
 */
export function getSupportedImportFormats(): Array<{
  id: ImportFormat
  name: string
  extensions: string[]
  description: string
}> {
  return [
    {
      id: 'txt',
      name: '纯文本',
      extensions: ['.txt', '.text'],
      description: 'UTF-8 编码的纯文本文件'
    },
    {
      id: 'md',
      name: 'Markdown',
      extensions: ['.md', '.markdown'],
      description: 'Markdown 格式的文本文件'
    },
    {
      id: 'docx',
      name: 'Word 文档',
      extensions: ['.docx'],
      description: 'Microsoft Word 文档格式（使用 mammoth 解析）'
    }
  ]
}
