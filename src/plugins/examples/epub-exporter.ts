/**
 * EPUB导出器示例插件
 *
 * 演示如何创建一个完整的导出器插件
 */

import type { ExporterContribution, ExportData, ExportOptions } from '../types'
import type { PluginManifest } from '../types'

/**
 * EPUB导出器实现
 */
const epubExporter: ExporterContribution = {
  id: 'epub-exporter',
  name: 'EPUB导出器',
  type: 'exporter',

  // 支持的格式
  format: 'epub',
  fileExtension: '.epub',
  mimeType: 'application/epub+zip',

  // 能力声明
  capabilities: {
    supportsBatch: true,
    supportsCustomTemplate: true,
    supportsMetadata: true,
    supportsImages: true
  },

  /**
   * 导出单个项目
   */
  async export(data: ExportData, options: ExportOptions): Promise<Blob> {
    console.log('EPUB导出器: 开始导出', data.type)

    // 这里应该实现实际的EPUB导出逻辑
    // EPUB格式是一个ZIP文件，包含：
    // - mimetype文件
    // - META-INF/container.xml
    // - OEBPS/content.opf
    // - OEBPS/toc.ncx
    // - OEBPS/chapters/*.xhtml

    // 简化示例：创建一个基础的EPUB结构
    const epubContent = generateEpubStructure(data, options)

    // 创建Blob
    const blob = new Blob([epubContent], {
      type: 'application/epub+zip'
    })

    console.log('EPUB导出器: 导出完成')
    return blob
  },

  /**
   * 批量导出
   */
  async exportBatch(items: ExportData[], options: ExportOptions): Promise<Blob> {
    console.log(`EPUB导出器: 批量导出 ${items.length} 个项目`)

    // 为每个项目生成章节
    const chapters = items.map((item, index) => ({
      title: `第${index + 1}章`,
      content: generateChapterContent(item)
    }))

    // 生成合并的EPUB
    const epubContent = generateEpubStructure(
      { type: 'project', content: chapters },
      options
    )

    return new Blob([epubContent], { type: 'application/epub+zip' })
  },

  /**
   * 获取设置组件（可选）
   */
  getSettingsComponent() {
    return undefined as any
  }
}

/**
 * 生成EPUB结构
 */
function generateEpubStructure(_data: ExportData, options: ExportOptions): string {
  // 这是一个简化的实现
  // 实际的EPUB生成需要使用JSZip等库创建ZIP文件

  const metadata = options.includeMetadata
    ? `
    <metadata>
      <dc:title>小说标题</dc:title>
      <dc:creator>作者</dc:creator>
      <dc:language>zh-CN</dc:language>
    </metadata>
    `
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  ${metadata}
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`
}

/**
 * 生成章节内容
 */
function generateChapterContent(data: ExportData): string {
  if (data.type === 'chapter' && typeof data.content === 'string') {
    return data.content
  }
  return ''
}

/**
 * 插件清单
 */
export const manifest: PluginManifest = {
  id: 'epub-exporter-plugin',
  name: 'EPUB导出器',
  version: '1.0.0',
  author: 'AI Novel Workshop',
  description: '将小说导出为EPUB格式，支持批量导出、自定义模板和图片',

  permissions: ['filesystem'],

  contributes: {
    exporters: [epubExporter]
  }
}

/**
 * 插件激活钩子
 */
export async function activate(context: any) {
  console.log('EPUB导出器插件已激活')

  // 注册导出器
  context.register.exporter(epubExporter)

  // 可以访问项目数据
  const project = context.project.getCurrentProject()
  if (project) {
    console.log(`当前项目: ${project.name}`)
  }
}

/**
 * 插件停用钩子
 */
export async function deactivate() {
  console.log('EPUB导出器插件已停用')
}

/**
 * 插件卸载钩子
 */
export async function uninstall() {
  console.log('EPUB导出器插件已卸载')
}
