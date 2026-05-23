import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { Chapter } from '@/types'
import { escapeXml } from '@/utils/escapeXml'

export interface EpubExportOptions {
  author: string
  language: string
  includeChapterNumbers: boolean
}

export const DEFAULT_EPUB_OPTIONS: EpubExportOptions = {
  author: '',
  language: 'zh-CN',
  includeChapterNumbers: true
}

export async function exportAllChaptersToEpub(
  chapters: Chapter[],
  projectTitle: string,
  options: EpubExportOptions,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const zip = new JSZip()
  const bookId = `urn:uuid:${crypto.randomUUID()}`

  // mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // Build chapter XHTML files
  const manifest: string[] = []
  const spine: string[] = []
  const toc: string[] = []

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    const id = `ch${i + 1}`
    const heading = options.includeChapterNumbers
      ? `第${ch.number}章 ${escapeXml(ch.title || '')}`
      : escapeXml(ch.title || '')

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${options.language}">
<head><title>${heading}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<h2>${heading}</h2>
${(ch.content || '').split('\n').map(p => p.trim() ? `<p>${escapeXml(p)}</p>` : '<br/>').join('\n')}
</body></html>`

    zip.file(`OEBPS/${id}.xhtml`, xhtml)
    manifest.push(`<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="${id}"/>`)
    toc.push(`<li><a href="${id}.xhtml">${heading}</a></li>`)
    onProgress?.(i + 1, chapters.length)
  }

  // CSS
  zip.file('OEBPS/style.css', `body { font-family: serif; line-height: 1.8; margin: 1em; }
h2 { text-align: center; margin: 1.5em 0; }
p { text-indent: 2em; margin: 0.5em 0; }`)

  // content.opf
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(projectTitle)}</dc:title>
    <dc:language>${options.language}</dc:language>
    <dc:creator>${escapeXml(options.author)}</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${manifest.join('\n    ')}
  </manifest>
  <spine>${spine.join('\n    ')}</spine>
</package>`)

  // nav.xhtml (EPUB3 table of contents)
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc">
  <h1>目录</h1>
  <ol>${toc.join('\n    ')}</ol>
</nav>
</body></html>`)

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  saveAs(blob, `${projectTitle}.epub`)
}
