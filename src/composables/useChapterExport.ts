import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { saveAs } from 'file-saver'
import type { Project, Chapter } from '@/types'
import {
  exportChapterToMarkdown,
  exportAllChaptersToMarkdown,
  DEFAULT_MD_OPTIONS,
} from '@/utils/markdownExporter'
import {
  exportChapterToPdf,
  exportAllChaptersToPdf,
  DEFAULT_PDF_OPTIONS,
} from '@/utils/pdfExporter'

export function useChapterExport(projectRef: Ref<Project | null | undefined>, chaptersRef: Ref<Chapter[]>) {
  const showExportSettings = ref(false)
  const exportMode = ref<'single' | 'all'>('all')
  const exportChapter = ref<Chapter | null>(null)
  const exporting = ref(false)

  // 导出单个章节
  function handleExportSingleChapter(chapter: Chapter, format: 'markdown' | 'pdf') {
    if (!projectRef.value) return

    if (format === 'markdown') {
      exportChapterToMarkdown(chapter, projectRef.value.title, DEFAULT_MD_OPTIONS)
      ElMessage.success(`已导出第${chapter.number}章为 Markdown`)
    } else {
      exportChapterToPdf(chapter, projectRef.value, DEFAULT_PDF_OPTIONS)
      ElMessage.success(`已导出第${chapter.number}章为 PDF`)
    }
  }

  // 导出全部为 Markdown
  async function handleExportAllMarkdown() {
    if (!projectRef.value || chaptersRef.value.length === 0) {
      ElMessage.warning('没有可导出的章节')
      return
    }

    exporting.value = true
    try {
      ElMessage.info('正在导出 Markdown 文件...')

      exportAllChaptersToMarkdown(
        chaptersRef.value,
        projectRef.value.title,
        DEFAULT_MD_OPTIONS,
        (current, total) => {
          console.log(`导出进度: ${current}/${total}`)
        }
      )

      ElMessage.success('导出成功！')
    } catch (error) {
      console.error('导出失败:', error)
      ElMessage.error('导出失败：' + (error as Error).message)
    } finally {
      exporting.value = false
    }
  }

  // 导出全部为 PDF
  async function handleExportAllPdf() {
    if (!projectRef.value || chaptersRef.value.length === 0) {
      ElMessage.warning('没有可导出的章节')
      return
    }

    exporting.value = true
    try {
      ElMessage.info('正在生成 PDF，请稍候...')

      exportAllChaptersToPdf(
        chaptersRef.value,
        projectRef.value,
        DEFAULT_PDF_OPTIONS,
        (current, total) => {
          console.log(`导出进度: ${current}/${total}`)
        }
      )

      ElMessage.success('请在打印对话框中选择"保存为PDF"')
    } catch (error) {
      console.error('导出失败:', error)
      ElMessage.error('导出失败：' + (error as Error).message)
    } finally {
      exporting.value = false
    }
  }

  // 导出全部为 JSON
  async function handleExportAllJson() {
    if (!projectRef.value || chaptersRef.value.length === 0) {
      ElMessage.warning('没有可导出的章节')
      return
    }

    try {
      const data = JSON.stringify({
        title: projectRef.value.title,
        exportTime: new Date().toISOString(),
        chapters: chaptersRef.value
      }, null, 2)

      const blob = new Blob([data], { type: 'application/json' })
      const filename = `${projectRef.value.title}_章节_${new Date().toISOString().split('T')[0]}.json`
      saveAs(blob, filename)

      ElMessage.success('导出成功！')
    } catch (error) {
      console.error('导出失败:', error)
      ElMessage.error('导出失败：' + (error as Error).message)
    }
  }

  // 导出处理命令分发
  function handleExportCommand(command: string) {
    if (!projectRef.value) {
      ElMessage.warning('请先打开项目')
      return
    }

    switch (command) {
      case 'exportAllMarkdown':
        handleExportAllMarkdown()
        break
      case 'exportAllPdf':
        handleExportAllPdf()
        break
      case 'exportAllJson':
        handleExportAllJson()
        break
      case 'exportSettings':
        exportMode.value = 'all'
        exportChapter.value = null
        showExportSettings.value = true
        break
    }
  }

  // 单个章节导出处理命令分发
  function handleChapterExport(chapter: Chapter, format: string) {
    if (!projectRef.value) return

    if (format === 'markdown') {
      handleExportSingleChapter(chapter, 'markdown')
    } else if (format === 'pdf') {
      handleExportSingleChapter(chapter, 'pdf')
    }
  }

  // 导出完成回调
  function handleExportComplete() {
    ElMessage.success('导出完成！')
  }

  return {
    showExportSettings,
    exportMode,
    exportChapter,
    exporting,
    handleExportCommand,
    handleChapterExport,
    handleExportComplete
  }
}
