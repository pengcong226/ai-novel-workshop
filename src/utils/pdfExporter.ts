/**
 * PDF 导出工具
 * 使用浏览器打印 API 实现 PDF 导出
 */

import type { Chapter, Project } from '@/types'

/**
 * PDF 导出选项
 */
export interface PdfExportOptions {
  title: string                    // 文档标题
  author: string                   // 作者
  fontSize: number                 // 正文字号（px）
  lineHeight: number               // 行高倍数
  fontFamily: string               // 字体
  pageSize: 'A4' | 'A5' | 'Letter' // 页面大小
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
  includePageNumber: boolean       // 包含页码
  includeHeader: boolean           // 包含页眉
  includeFooter: boolean           // 包含页脚
  headerTemplate?: string          // 自定义页眉模板
  footerTemplate?: string          // 自定义页脚模板
  includeMetadata: boolean         // 包含章节元数据
  includeToc: boolean              // 包含目录
  chapterStartPage: boolean        // 每章另起一页
}

/**
 * 默认 PDF 导出选项
 */
export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  title: '未命名小说',
  author: 'AI小说工坊',
  fontSize: 16,
  lineHeight: 1.8,
  fontFamily: 'Georgia, "Noto Serif SC", serif',
  pageSize: 'A4',
  margin: {
    top: 25,
    right: 20,
    bottom: 25,
    left: 20
  },
  includePageNumber: true,
  includeHeader: true,
  includeFooter: true,
  includeMetadata: true,
  includeToc: true,
  chapterStartPage: true
}

/**
 * 获取页面尺寸（毫米）
 */
function getPageSizeInMm(size: 'A4' | 'A5' | 'Letter'): { width: number; height: number } {
  const sizes = {
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 215.9, height: 279.4 }
  }
  return sizes[size]
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
 * 生成打印样式的 CSS
 */
function generatePrintCss(options: PdfExportOptions): string {
  const pageSize = getPageSizeInMm(options.pageSize)

  return `
    @page {
      size: ${pageSize.width}mm ${pageSize.height}mm;
      margin: ${options.margin.top}mm ${options.margin.right}mm ${options.margin.bottom}mm ${options.margin.left}mm;

      ${options.includeHeader ? `
      @top-center {
        content: "${options.headerTemplate || options.title}";
        font-size: 12px;
        color: #666;
      }
      ` : ''}

      ${options.includePageNumber ? `
      @bottom-center {
        content: "第 " counter(page) " 页";
        font-size: 12px;
        color: #666;
      }
      ` : ''}

      ${options.includeFooter ? `
      @bottom-left {
        content: "${options.author}";
        font-size: 10px;
        color: #999;
      }
      ` : ''}
    }

    @page :first {
      @top-center {
        content: none;
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: ${options.fontFamily};
      font-size: ${options.fontSize}px;
      line-height: ${options.lineHeight};
      color: #333;
      background: white;
    }

    /* 封面 */
    .cover {
      page-break-after: always;
      text-align: center;
      padding-top: 200px;
    }

    .cover h1 {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 40px;
      color: #222;
    }

    .cover .author {
      font-size: 20px;
      color: #666;
      margin-bottom: 20px;
    }

    .cover .info {
      font-size: 16px;
      color: #888;
      margin-top: 100px;
    }

    /* 目录 */
    .toc {
      page-break-after: always;
    }

    .toc h2 {
      font-size: 32px;
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }

    .toc-title {
      font-size: 16px;
    }

    .toc-page {
      font-size: 14px;
      color: #666;
    }

    /* 章节 */
    .chapter {
      ${options.chapterStartPage ? 'page-break-before: always;' : ''}
      padding: 20px 0;
    }

    .chapter:first-of-type {
      page-break-before: auto;
    }

    .chapter-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ddd;
    }

    .chapter-number {
      font-size: 24px;
      color: #666;
      margin-bottom: 10px;
    }

    .chapter-title {
      font-size: 36px;
      font-weight: bold;
      color: #222;
      margin-bottom: 20px;
    }

    .chapter-meta {
      font-size: 14px;
      color: #888;
    }

    .chapter-meta span {
      margin: 0 10px;
    }

    .chapter-content {
      text-align: justify;
      text-indent: 2em;
    }

    .chapter-content p {
      margin-bottom: 1em;
    }

    .chapter-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 14px;
      color: #666;
    }

    .chapter-footer p {
      margin: 5px 0;
    }

    /* 结尾 */
    .ending {
      page-break-before: always;
      text-align: center;
      padding-top: 200px;
    }

    .ending h2 {
      font-size: 36px;
      margin-bottom: 40px;
    }

    .ending .info {
      font-size: 16px;
      color: #666;
      line-height: 2;
    }

    /* 打印时隐藏非打印元素 */
    @media print {
      .no-print {
        display: none !important;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }

    /* 段落优化 */
    .chapter-content p {
      orphans: 3;
      widows: 3;
    }

    /* 避免孤行和寡行 */
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
    }

    table, figure, img {
      page-break-inside: avoid;
    }
  `
}

/**
 * 生成章节 HTML
 */
function generateChapterHtml(
  chapter: Chapter,
  options: PdfExportOptions
): string {
  const lines: string[] = []

  lines.push('<article class="chapter">')

  // 章节标题
  lines.push('<header class="chapter-header">')
  lines.push(`<div class="chapter-number">第${chapter.number}章</div>`)
  lines.push(`<h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>`)

  // 元数据
  if (options.includeMetadata) {
    lines.push('<div class="chapter-meta">')
    lines.push(`<span>字数：${chapter.wordCount.toLocaleString()}</span>`)
    lines.push(`<span>状态：${getStatusText(chapter.status)}</span>`)
    lines.push(`<span>创建：${formatDate(chapter.generationTime)}</span>`)
    lines.push('</div>')
  }

  lines.push('</header>')

  // 章节内容
  lines.push('<div class="chapter-content">')

  // 将内容按段落分割并包装
  const paragraphs = chapter.content.split(/\n\n+/)
  paragraphs.forEach(para => {
    if (para.trim()) {
      // 处理单行换行
      const formatted = para.replace(/\n/g, '<br>\n')
      lines.push(`<p>${escapeHtml(formatted).replace(/&lt;br&gt;/g, '<br>')}</p>`)
    }
  })

  lines.push('</div>')

  // 章节结尾信息
  if (chapter.outline?.characters.length || chapter.outline?.location) {
    lines.push('<footer class="chapter-footer">')

    if (chapter.outline?.characters.length > 0) {
      lines.push(`<p><strong>出场人物：</strong>${chapter.outline.characters.join('、')}</p>`)
    }

    if (chapter.outline?.location) {
      lines.push(`<p><strong>地点：</strong>${chapter.outline.location}</p>`)
    }

    lines.push('</footer>')
  }

  lines.push('</article>')

  return lines.join('\n')
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 生成目录 HTML
 */
function generateTocHtml(chapters: Chapter[]): string {
  const lines: string[] = []

  lines.push('<nav class="toc">')
  lines.push('<h2>目录</h2>')

  chapters.forEach((chapter) => {
    const wordCount = (chapter.wordCount / 1000).toFixed(1)
    lines.push('<div class="toc-item">')
    lines.push(`<span class="toc-title">第${chapter.number}章 ${escapeHtml(chapter.title)}</span>`)
    lines.push(`<span class="toc-page">${wordCount}k字</span>`)
    lines.push('</div>')
  })

  lines.push('</nav>')

  return lines.join('\n')
}

/**
 * 生成封面 HTML
 */
function generateCoverHtml(project: Project): string {
  const lines: string[] = []

  lines.push('<div class="cover">')
  lines.push(`<h1>${escapeHtml(project.title)}</h1>`)

  if (project.description) {
    lines.push(`<p class="author">${escapeHtml(project.description.substring(0, 100))}${project.description.length > 100 ? '...' : ''}</p>`)
  }

  lines.push('<div class="info">')
  lines.push(`<p>类型：${escapeHtml(project.genre)}</p>`)
  lines.push(`<p>字数：${project.currentWords.toLocaleString()} 字</p>`)
  lines.push(`<p>状态：${project.status === 'draft' ? '草稿' : project.status === 'writing' ? '写作中' : '已完成'}</p>`)
  lines.push(`<p>导出时间：${new Date().toLocaleDateString()}</p>`)
  lines.push('</div>')

  lines.push('</div>')

  return lines.join('\n')
}

/**
 * 生成结尾 HTML
 */
function generateEndingHtml(_project: Project): string {
  const lines: string[] = []

  lines.push('<div class="ending">')
  lines.push('<h2>完</h2>')
  lines.push('<div class="info">')
  lines.push(`<p>本文由 AI小说工坊 生成</p>`)
  lines.push(`<p>导出时间：${new Date().toLocaleString()}</p>`)
  lines.push('</div>')
  lines.push('</div>')

  return lines.join('\n')
}

/**
 * 导出单个章节为 PDF
 */
export function exportChapterToPdf(
  chapter: Chapter,
  project: Project,
  options: Partial<PdfExportOptions> = {}
): void {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options, title: project.title }

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>第${chapter.number}章 ${chapter.title} - ${project.title}</title>
  <style>
    ${generatePrintCss(opts)}
  </style>
</head>
<body>
  ${generateChapterHtml(chapter, opts)}
</body>
</html>
  `

  openPrintWindow(html, `第${chapter.number}章_${chapter.title}`)
}

/**
 * 批量导出所有章节为 PDF
 */
export function exportAllChaptersToPdf(
  chapters: Chapter[],
  project: Project,
  options: Partial<PdfExportOptions> = {},
  onProgress?: (current: number, total: number) => void
): void {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options, title: project.title }

  const parts: string[] = []

  // 封面
  parts.push(generateCoverHtml(project))

  // 目录
  if (opts.includeToc) {
    parts.push(generateTocHtml(chapters))
  }

  // 章节
  chapters.forEach((chapter, index) => {
    if (onProgress) {
      onProgress(index + 1, chapters.length)
    }
    parts.push(generateChapterHtml(chapter, opts))
  })

  // 结尾
  parts.push(generateEndingHtml(project))

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.title}</title>
  <style>
    ${generatePrintCss(opts)}
  </style>
</head>
<body>
  ${parts.join('\n')}
</body>
</html>
  `

  openPrintWindow(html, project.title)
}

/**
 * 打开打印窗口
 */
function openPrintWindow(html: string, _title: string): void {
  const printWindow = window.open('', '_blank')

  if (!printWindow) {
    alert('无法打开打印窗口，请检查浏览器弹窗设置')
    return
  }

  printWindow.document.write(html)
  printWindow.document.close()

  // 等待内容加载完成后打印
  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
  }

  // 兼容性处理
  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 500)
}

/**
 * 生成可打印的 HTML 内容（用于预览）
 */
export function generatePrintableHtml(
  chapters: Chapter[],
  project: Project,
  options: Partial<PdfExportOptions> = {}
): string {
  const opts = { ...DEFAULT_PDF_OPTIONS, ...options, title: project.title }

  const parts: string[] = []

  parts.push(generateCoverHtml(project))

  if (opts.includeToc) {
    parts.push(generateTocHtml(chapters))
  }

  chapters.forEach(chapter => {
    parts.push(generateChapterHtml(chapter, opts))
  })

  parts.push(generateEndingHtml(project))

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${project.title}</title>
  <style>
    ${generatePrintCss(opts)}
  </style>
</head>
<body>
  ${parts.join('\n')}
</body>
</html>
  `
}
