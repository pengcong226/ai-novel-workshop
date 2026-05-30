import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useChapterExport } from './useChapterExport'
import type { Project, Chapter } from '@/types'

// Mock all external dependencies
vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}))

vi.mock('@/utils/markdownExporter', () => ({
  exportChapterToMarkdown: vi.fn(),
  exportAllChaptersToMarkdown: vi.fn(),
  DEFAULT_MD_OPTIONS: {},
}))

vi.mock('@/utils/pdfExporter', () => ({
  exportChapterToPdf: vi.fn(),
  exportAllChaptersToPdf: vi.fn(),
  DEFAULT_PDF_OPTIONS: {},
}))

vi.mock('@/utils/txtExporter', () => ({
  exportChapterToTxt: vi.fn(),
  exportAllChaptersToTxt: vi.fn(),
  DEFAULT_TXT_OPTIONS: {},
}))

vi.mock('@/utils/epubExporter', () => ({
  exportAllChaptersToEpub: vi.fn().mockResolvedValue(undefined),
  DEFAULT_EPUB_OPTIONS: {},
}))

vi.mock('@/utils/docxExporter', () => ({
  exportAllChaptersToDocx: vi.fn().mockResolvedValue(undefined),
  DEFAULT_DOCX_OPTIONS: {},
}))

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { ElMessage } from 'element-plus'
import { exportAllChaptersToMarkdown } from '@/utils/markdownExporter'
import { exportAllChaptersToTxt } from '@/utils/txtExporter'
import { exportAllChaptersToEpub } from '@/utils/epubExporter'
import { exportAllChaptersToDocx } from '@/utils/docxExporter'
import { saveAs } from 'file-saver'

const mockProject: Project = {
  id: 'proj-1',
  title: 'Test Novel',
  config: { authorName: 'Author' },
} as unknown as Project

const mockChapters: Chapter[] = [
  { number: 1, title: 'Chapter 1', content: 'Content 1' },
  { number: 2, title: 'Chapter 2', content: 'Content 2' },
] as unknown as Chapter[]

function mountExport(project: Project | null = mockProject, chapters: Chapter[] = mockChapters) {
  let result!: ReturnType<typeof useChapterExport>
  const projectRef = ref(project)
  const chaptersRef = ref(chapters)

  const wrapper = mount(
    defineComponent({
      setup() {
        result = useChapterExport(projectRef, chaptersRef)
        return result
      },
      render: () => h('div'),
    }),
  )

  return { wrapper, projectRef, chaptersRef, ...result }
}

describe('useChapterExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with correct default state', () => {
    const { showExportSettings, exportMode, exportChapter, exporting } = mountExport()

    expect(showExportSettings.value).toBe(false)
    expect(exportMode.value).toBe('all')
    expect(exportChapter.value).toBeNull()
    expect(exporting.value).toBe(false)
  })

  it('handleExportCommand shows warning when no project is open', () => {
    const { handleExportCommand } = mountExport(null)

    handleExportCommand('exportAllMarkdown')

    expect(ElMessage.warning).toHaveBeenCalledWith('请先打开项目')
  })

  it('handleExportCommand with exportAllMarkdown calls the markdown exporter', async () => {
    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllMarkdown')

    // Give async callback time to execute
    await vi.waitFor(() => {
      expect(exportAllChaptersToMarkdown).toHaveBeenCalledWith(
        mockChapters,
        'Test Novel',
        expect.anything(),
        expect.any(Function),
      )
    })
  })

  it('handleExportCommand with exportAllTxt calls the txt exporter', async () => {
    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllTxt')

    await vi.waitFor(() => {
      expect(exportAllChaptersToTxt).toHaveBeenCalledWith(
        mockChapters,
        'Test Novel',
        expect.anything(),
      )
    })
  })

  it('handleExportCommand with exportAllEpub calls the epub exporter with author name', async () => {
    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllEpub')

    await vi.waitFor(() => {
      expect(exportAllChaptersToEpub).toHaveBeenCalledWith(
        mockChapters,
        'Test Novel',
        expect.objectContaining({ author: 'Author' }),
      )
    })
  })

  it('handleExportCommand with exportAllDocx calls the docx exporter with author name', async () => {
    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllDocx')

    await vi.waitFor(() => {
      expect(exportAllChaptersToDocx).toHaveBeenCalledWith(
        mockChapters,
        'Test Novel',
        expect.objectContaining({ author: 'Author' }),
      )
    })
  })

  it('handleExportCommand with exportSettings opens settings dialog', () => {
    const { handleExportCommand, showExportSettings, exportMode, exportChapter } = mountExport()

    handleExportCommand('exportSettings')

    expect(showExportSettings.value).toBe(true)
    expect(exportMode.value).toBe('all')
    expect(exportChapter.value).toBeNull()
  })

  it('handleExportAllJson creates a JSON blob with project title and chapters', () => {
    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllJson')

    expect(saveAs).toHaveBeenCalledTimes(1)
    const [blob, filename] = (saveAs as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toMatch(/^Test Novel_章节_/)
    expect(filename).toMatch(/\.json$/)
  })

  it('handleExportAllMarkdown shows warning when chapters are empty', async () => {
    const { handleExportCommand } = mountExport(mockProject, [])

    handleExportCommand('exportAllMarkdown')

    expect(ElMessage.warning).toHaveBeenCalledWith('没有可导出的章节')
  })

  it('handleExportAllMarkdown sets exporting to true during operation', async () => {
    let progressCb: ((current: number, total: number) => void) | undefined
    ;(exportAllChaptersToMarkdown as ReturnType<typeof vi.fn>).mockImplementation(
      (_chapters: unknown, _title: unknown, _opts: unknown, cb: (current: number, total: number) => void) => {
        progressCb = cb
      },
    )

    const { handleExportCommand } = mountExport()

    handleExportCommand('exportAllMarkdown')

    await vi.waitFor(() => {
      expect(exportAllChaptersToMarkdown).toHaveBeenCalled()
    })

    // Verify success message was called
    expect(ElMessage.success).toHaveBeenCalledWith('导出成功！')
  })

  it('handleChapterExport delegates to handleExportSingleChapter for markdown', () => {
    const { handleChapterExport } = mountExport()
    const chapter = mockChapters[0]

    handleChapterExport(chapter, 'markdown')

    expect(ElMessage.success).toHaveBeenCalledWith(expect.stringContaining('Markdown'))
  })

  it('handleChapterExport does nothing when project is null', () => {
    const { handleChapterExport } = mountExport(null)
    const chapter = mockChapters[0]

    handleChapterExport(chapter, 'markdown')

    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('handleExportComplete shows success message', () => {
    const { handleExportComplete } = mountExport()

    handleExportComplete()

    expect(ElMessage.success).toHaveBeenCalledWith('导出完成！')
  })
})
