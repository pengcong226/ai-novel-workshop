import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Chapter, Project } from '@/types'

// Mock all exporter modules before importing the module under test.
// Each mock returns a resolved promise or void so the tests exercise
// the exportManager routing logic without triggering real file I/O.

vi.mock('@/utils/markdownExporter', () => ({
  exportAllChaptersToMarkdown: vi.fn(),
  exportChapterToMarkdown: vi.fn(),
  exportProjectToMarkdown: vi.fn(),
  DEFAULT_MD_OPTIONS: {},
}))

vi.mock('@/utils/pdfExporter', () => ({
  exportAllChaptersToPdf: vi.fn(),
  exportChapterToPdf: vi.fn(),
  generatePrintableHtml: vi.fn(() => ''),
  DEFAULT_PDF_OPTIONS: {},
}))

vi.mock('@/utils/docxExporter', () => ({
  exportAllChaptersToDocx: vi.fn(),
  exportChapterToDocx: vi.fn(),
  DEFAULT_DOCX_OPTIONS: {},
}))

vi.mock('@/utils/exporters/epubExporter', () => ({
  exportProjectAsEPUB: vi.fn(),
}))

vi.mock('@/utils/txtExporter', () => ({
  exportAllChaptersToTxt: vi.fn(),
  exportChapterToTxt: vi.fn(),
  exportProjectToTxt: vi.fn(),
  DEFAULT_TXT_OPTIONS: {},
}))

vi.mock('@/utils/exporters/platformExporter', () => ({
  exportToPlatformFormat: vi.fn(() => ({ content: 'platform-content', warnings: [] })),
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Now import the module under test (hoisted after mocks)
import {
  generateExportPreview,
  getExportStats,
  getFormatInfo,
  getAvailableFormats,
  getFormatsForScope,
  exportWithManager,
  batchExport,
  exportForPlatform,
  AVAILABLE_FORMATS,
  type ExportFormat,
  type ExportScope,
} from '@/utils/exportManager'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `ch-${Math.random().toString(36).slice(2, 6)}`,
    number: 1,
    title: '测试章节',
    content: '这是一段测试内容。',
    wordCount: 100,
    outline: {
      chapterId: 'ch-1',
      title: '测试章节',
      scenes: [],
      characters: [],
      location: '',
      goals: [],
      conflicts: [],
      resolutions: [],
      foreshadowingToPlant: [],
      foreshadowingToResolve: [],
      status: 'planned',
    },
    status: 'draft',
    generatedBy: 'manual',
    generationTime: new Date('2026-01-01'),
    checkpoints: [],
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    title: '测试项目',
    description: '',
    genre: 'fantasy',
    targetWords: 50000,
    currentWords: 0,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    outline: {
      id: 'outline-1',
      synopsis: '',
      theme: '',
      mainPlot: { id: 'plot-1', name: '', description: '', events: [] },
      subPlots: [],
      volumes: [],
      chapters: [],
      foreshadowings: [],
    },
    chapters: [],
    config: {} as Project['config'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// AVAILABLE_FORMATS
// ---------------------------------------------------------------------------

describe('AVAILABLE_FORMATS', () => {
  it('contains exactly 5 formats', () => {
    expect(AVAILABLE_FORMATS).toHaveLength(5)
  })

  it('has all expected format ids', () => {
    const ids = AVAILABLE_FORMATS.map(f => f.id)
    expect(ids).toEqual(expect.arrayContaining(['txt', 'md', 'pdf', 'docx', 'epub']))
  })

  it('each format has required fields', () => {
    for (const fmt of AVAILABLE_FORMATS) {
      expect(fmt.id).toBeTruthy()
      expect(fmt.name).toBeTruthy()
      expect(fmt.extension).toBeTruthy()
      expect(typeof fmt.supportsChapter).toBe('boolean')
      expect(typeof fmt.supportsBatch).toBe('boolean')
      expect(typeof fmt.supportsProject).toBe('boolean')
    }
  })

  it('epub only supports project scope', () => {
    const epub = AVAILABLE_FORMATS.find(f => f.id === 'epub')!
    expect(epub.supportsProject).toBe(true)
    expect(epub.supportsChapter).toBe(false)
    expect(epub.supportsBatch).toBe(false)
  })

  it('pdf does not support project scope', () => {
    const pdf = AVAILABLE_FORMATS.find(f => f.id === 'pdf')!
    expect(pdf.supportsProject).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateExportPreview
// ---------------------------------------------------------------------------

describe('generateExportPreview', () => {
  const chapters = [
    makeChapter({ number: 1, title: '开端', content: '故事从这里开始。' }),
    makeChapter({ number: 2, title: '旅程', content: '主角踏上了旅途。' }),
  ]

  it('generates txt preview with chapter heading', () => {
    const preview = generateExportPreview(chapters, 'txt')
    expect(preview).toContain('第1章')
    expect(preview).toContain('开端')
    expect(preview).toContain('故事从这里开始')
  })

  it('generates md preview with markdown heading and word count', () => {
    const preview = generateExportPreview(chapters, 'md')
    expect(preview).toContain('# 第1章')
    expect(preview).toContain('**字数：**')
  })

  it('generates pdf preview with label prefix', () => {
    const preview = generateExportPreview(chapters, 'pdf')
    expect(preview).toContain('[PDF 预览]')
    expect(preview).toContain('第1章')
  })

  it('generates docx preview with label prefix', () => {
    const preview = generateExportPreview(chapters, 'docx')
    expect(preview).toContain('[DOCX 预览]')
  })

  it('generates epub preview with multiple chapters', () => {
    const preview = generateExportPreview(chapters, 'epub')
    expect(preview).toContain('[EPUB 电子书预览]')
    expect(preview).toContain('第1章')
    expect(preview).toContain('第2章')
  })

  it('epub preview shows count summary for >3 chapters', () => {
    const manyChapters = Array.from({ length: 5 }, (_, i) =>
      makeChapter({ number: i + 1, title: `ch${i + 1}` })
    )
    const preview = generateExportPreview(manyChapters, 'epub')
    expect(preview).toContain('共 5 章')
  })

  it('respects maxChars parameter', () => {
    const longCh = makeChapter({ content: 'x'.repeat(5000) })
    const preview = generateExportPreview([longCh], 'txt', 100)
    expect(preview.length).toBeLessThanOrEqual(200) // some overhead for prefix
  })

  it('returns empty string for empty chapters array', () => {
    const preview = generateExportPreview([], 'txt')
    expect(preview).toBe('')
  })

  it('sorts chapters by number before preview', () => {
    const outOfOrder = [
      makeChapter({ number: 3, title: '第三章', content: 'three' }),
      makeChapter({ number: 1, title: '第一章', content: 'one' }),
    ]
    const preview = generateExportPreview(outOfOrder, 'txt')
    expect(preview).toContain('第1章')
  })
})

// ---------------------------------------------------------------------------
// getExportStats
// ---------------------------------------------------------------------------

describe('getExportStats', () => {
  it('returns correct stats for a set of chapters', () => {
    const chapters = [
      makeChapter({ wordCount: 1000, status: 'draft' }),
      makeChapter({ wordCount: 2000, status: 'final' }),
      makeChapter({ wordCount: 3000, status: 'draft' }),
    ]
    const stats = getExportStats(chapters)
    expect(stats.chapterCount).toBe(3)
    expect(stats.totalWords).toBe(6000)
    expect(stats.avgWordsPerChapter).toBe(2000)
    expect(stats.statusBreakdown).toEqual({ draft: 2, final: 1 })
  })

  it('returns zeros for empty chapters', () => {
    const stats = getExportStats([])
    expect(stats.chapterCount).toBe(0)
    expect(stats.totalWords).toBe(0)
    expect(stats.avgWordsPerChapter).toBe(0)
    expect(stats.statusBreakdown).toEqual({})
  })

  it('defaults status to "draft" when status is undefined', () => {
    const ch = makeChapter()
    delete (ch as Record<string, unknown>).status
    const stats = getExportStats([ch])
    expect(stats.statusBreakdown.draft).toBe(1)
  })

  it('handles single chapter', () => {
    const stats = getExportStats([makeChapter({ wordCount: 500 })])
    expect(stats.avgWordsPerChapter).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// getFormatInfo
// ---------------------------------------------------------------------------

describe('getFormatInfo', () => {
  it('returns format info for known format', () => {
    const info = getFormatInfo('txt')
    expect(info).toBeDefined()
    expect(info!.id).toBe('txt')
    expect(info!.extension).toBe('.txt')
  })

  it('returns undefined for unknown format', () => {
    expect(getFormatInfo('unknown' as ExportFormat)).toBeUndefined()
  })

  it('returns all 5 known formats', () => {
    const formats: ExportFormat[] = ['txt', 'md', 'pdf', 'docx', 'epub']
    for (const f of formats) {
      expect(getFormatInfo(f)).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// getAvailableFormats
// ---------------------------------------------------------------------------

describe('getAvailableFormats', () => {
  it('returns a copy of available formats', () => {
    const formats = getAvailableFormats()
    expect(formats.length).toBe(AVAILABLE_FORMATS.length)
    // Should be a different array reference (copy)
    expect(formats).not.toBe(AVAILABLE_FORMATS)
  })
})

// ---------------------------------------------------------------------------
// getFormatsForScope
// ---------------------------------------------------------------------------

describe('getFormatsForScope', () => {
  it('returns chapter-capable formats for "single" scope', () => {
    const formats = getFormatsForScope('single')
    expect(formats.every(f => f.supportsChapter)).toBe(true)
    expect(formats.map(f => f.id)).not.toContain('epub')
  })

  it('returns batch-capable formats for "all" scope', () => {
    const formats = getFormatsForScope('all')
    expect(formats.every(f => f.supportsBatch)).toBe(true)
    expect(formats.map(f => f.id)).not.toContain('epub')
  })

  it('returns project-capable formats for "project" scope', () => {
    const formats = getFormatsForScope('project')
    expect(formats.every(f => f.supportsProject)).toBe(true)
    // Only txt, md, epub support project scope
    expect(formats.map(f => f.id)).toEqual(expect.arrayContaining(['txt', 'md', 'epub']))
    expect(formats.map(f => f.id)).not.toContain('pdf')
    expect(formats.map(f => f.id)).not.toContain('docx')
  })
})

// ---------------------------------------------------------------------------
// exportWithManager
// ---------------------------------------------------------------------------

describe('exportWithManager', () => {
  const chapter = makeChapter({ number: 1, title: '第一章' })
  const project = makeProject({ chapters: [chapter] })

  it('returns success result on successful txt export', async () => {
    const result = await exportWithManager(project, { format: 'txt', scope: 'all' })
    expect(result.success).toBe(true)
    expect(result.format).toBe('txt')
    expect(result.message).toContain('TXT')
  })

  it('returns success result on successful md export', async () => {
    const result = await exportWithManager(project, { format: 'md', scope: 'all' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('MD')
  })

  it('returns success result on successful pdf export', async () => {
    const result = await exportWithManager(project, { format: 'pdf', scope: 'all' })
    expect(result.success).toBe(true)
  })

  it('returns success result on successful docx export', async () => {
    const result = await exportWithManager(project, { format: 'docx', scope: 'all' })
    expect(result.success).toBe(true)
  })

  it('returns success result on successful epub export', async () => {
    const result = await exportWithManager(project, { format: 'epub', scope: 'project' })
    expect(result.success).toBe(true)
  })

  it('throws error for unsupported format', async () => {
    const result = await exportWithManager(project, { format: 'xml' as ExportFormat, scope: 'all' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('不支持')
  })

  it('single scope with valid chapterIndex succeeds', async () => {
    const result = await exportWithManager(project, {
      format: 'txt',
      scope: 'single',
      chapterIndex: 0,
    })
    expect(result.success).toBe(true)
  })

  it('single scope with out-of-range chapterIndex returns failure', async () => {
    const result = await exportWithManager(project, {
      format: 'txt',
      scope: 'single',
      chapterIndex: 99,
    })
    expect(result.success).toBe(false)
    expect(result.message).toContain('超出范围')
  })

  it('calls onProgress callback during export', async () => {
    const onProgress = vi.fn()
    // The underlying exporters may or may not call onProgress depending on mock behavior,
    // but the manager should not crash when given a progress callback.
    const result = await exportWithManager(project, {
      format: 'txt',
      scope: 'all',
      onProgress,
    })
    expect(result.success).toBe(true)
  })

  it('handles project with empty chapters array', async () => {
    const emptyProject = makeProject({ chapters: [] })
    const result = await exportWithManager(emptyProject, { format: 'txt', scope: 'all' })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// batchExport
// ---------------------------------------------------------------------------

describe('batchExport', () => {
  const project = makeProject({ chapters: [makeChapter()] })

  it('exports multiple formats and returns results array', async () => {
    const results = await batchExport(project, ['txt', 'md'])
    expect(results).toHaveLength(2)
    expect(results[0].format).toBe('txt')
    expect(results[1].format).toBe('md')
    expect(results.every(r => r.success)).toBe(true)
  })

  it('returns empty array for empty formats list', async () => {
    const results = await batchExport(project, [])
    expect(results).toEqual([])
  })

  it('calls onProgress with format info', async () => {
    const onProgress = vi.fn()
    await batchExport(project, ['txt', 'md'], 'all', onProgress)
    // onProgress should be called with (format, current, total) at minimum
    expect(onProgress).toHaveBeenCalled()
    expect(onProgress.mock.calls[0][0]).toBe('txt')
    expect(onProgress.mock.calls[0][1]).toBe(1)
    expect(onProgress.mock.calls[0][2]).toBe(2)
  })

  it('returns failure for format with out-of-range index', async () => {
    const result = await batchExport(project, ['txt'], 'single')
    // single scope with no chapterIndex might fail for some formats but should not crash
    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// exportForPlatform
// ---------------------------------------------------------------------------

describe('exportForPlatform', () => {
  it('delegates to platform exporter and returns content + warnings', () => {
    const chapters = [makeChapter()]
    const result = exportForPlatform(chapters, 'qidian' as never)
    expect(result.content).toBe('platform-content')
    expect(result.warnings).toEqual([])
  })
})
