/**
 * EPUB 导出器
 *
 * 将项目章节导出为 EPUB 格式的电子书文件。
 * 使用纯前端方案生成 EPUB（ZIP 格式 + OPF/NCX manifest）。
 */

import type { Project, Chapter } from '@/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:epub-exporter')

/**
 * 导出项目为 EPUB 文件并触发下载
 */
export async function exportProjectAsEPUB(project: Project, chapters?: Chapter[]): Promise<void> {
  logger.info(`开始导出 EPUB: ${project.title}`)

  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  const bookTitle = project.title || '未命名小说'
  const bookAuthor = project.author || 'AI小说工坊'
  const bookId = `urn:uuid:${project.id || Date.now()}`
  const lang = 'zh-CN'
  const bookChapters = chapters || project.chapters || []

  // mimetype（必须是 ZIP 中的第一个文件，且不压缩）
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // OEBPS/content.opf
  const manifestItems = bookChapters.map((_, i) =>
    `    <item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n')

  const spineItems = bookChapters.map((_, i) =>
    `    <itemref idref="chapter-${i}"/>`
  ).join('\n')

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:creator>${escapeXml(bookAuthor)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`)

  // OEBPS/toc.ncx
  const navPoints = bookChapters.map((ch, i) => {
    const title = ch.title || `第${ch.number || i + 1}章`
    return `    <navPoint id="navPoint-${i}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="chapter-${i}.xhtml"/>
    </navPoint>`
  }).join('\n')

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
  </head>
  <docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`)

  // OEBPS/nav.xhtml (EPUB3 nav)
  const navLi = bookChapters.map((ch, i) => {
    const title = ch.title || `第${ch.number || i + 1}章`
    return `        <li><a href="chapter-${i}.xhtml">${escapeXml(title)}</a></li>`
  }).join('\n')

  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <h1>目录</h1>
    <ol>
${navLi}
    </ol>
  </nav>
</body>
</html>`)

  // OEBPS/style.css
  zip.file('OEBPS/style.css', `body { font-family: serif; line-height: 1.8; margin: 1em; }
h1, h2 { text-align: center; margin: 2em 0 1em; }
p { text-indent: 2em; margin: 0.5em 0; }`)

  // OEBPS/chapter-X.xhtml
  for (let i = 0; i < bookChapters.length; i++) {
    const ch = bookChapters[i]
    if (!ch) continue
    const title = ch.title || `第${ch.number || i + 1}章`
    const content = ch.content || ''
    const htmlContent = plainTextToXHTML(content)

    zip.file(`OEBPS/chapter-${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  <h1>${escapeXml(title)}</h1>
${htmlContent}
</body>
</html>`)
  }

  // 生成 ZIP 文件
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })

  // 触发下载
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${bookTitle}.epub`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  logger.info(`EPUB 导出完成: ${bookTitle}，${bookChapters.length} 章`)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function plainTextToXHTML(text: string): string {
  if (!text) return '<p></p>'
  return text
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => {
      const trimmed = p.trim()
      if (trimmed.startsWith('### ')) return `  <h3>${escapeXml(trimmed.slice(4))}</h3>`
      if (trimmed.startsWith('## ')) return `  <h2>${escapeXml(trimmed.slice(3))}</h2>`
      if (trimmed.startsWith('# ')) return `  <h1>${escapeXml(trimmed.slice(2))}</h1>`
      return `  <p>${escapeXml(trimmed.replace(/\n/g, ' '))}</p>`
    })
    .join('\n')
}
