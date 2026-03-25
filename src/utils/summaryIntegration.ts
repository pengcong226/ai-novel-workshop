/**
 * 摘要系统集成工具
 *
 * 提供章节完成时的自动摘要生成功能
 */

import type { Chapter, ChapterSummaryData } from '@/types'
import {
  generateChapterSummary,
  determineSummaryDetail,
  SummaryDetail,
  createContentHash,
  SUMMARY_GENERATION_VERSION
} from './summarizer'

/**
 * 在章节保存后触发摘要生成
 *
 * @param chapter 章节
 * @param allChapters 所有章节列表
 * @param onSave 保存回调
 */
function shouldRefreshSummary(
  chapter: Chapter,
  maxChapter: number
): boolean {
  const detail = determineSummaryDetail(chapter.number, maxChapter)
  const sourceHash = createContentHash(chapter.content)
  const summaryData = chapter.summaryData as ChapterSummaryData | undefined

  if (detail === SummaryDetail.FULL) {
    return false
  }

  if (!summaryData) {
    return true
  }

  if (summaryData.detail !== detail) {
    return true
  }

  if (summaryData.sourceHash !== sourceHash) {
    return true
  }

  if ((summaryData.summaryVersion || 0) < SUMMARY_GENERATION_VERSION) {
    return true
  }

  return false
}

export async function onChapterSaved(
  chapter: Chapter,
  allChapters: Chapter[],
  onSave: (chapterId: string, summaryData: any) => Promise<void>
): Promise<void> {
  try {
    // 判断是否需要生成摘要
    if (chapter.wordCount < 100) {
      console.log(`[摘要生成] 第${chapter.number}章字数不足，跳过摘要生成`)
      return
    }

    // 判断是否需要生成摘要（最近3章不生成）
    const maxChapter = Math.max(...allChapters.map(c => c.number))
    const detail = determineSummaryDetail(chapter.number, maxChapter)

    if (detail === SummaryDetail.FULL) {
      console.log(`[摘要生成] 第${chapter.number}章是最近3章，不需要生成摘要`)
      return
    }

    if (!shouldRefreshSummary(chapter, maxChapter)) {
      console.log(`[摘要生成] 第${chapter.number}章摘要仍然有效，跳过`)
      return
    }

    console.log(`[摘要生成] 开始为第${chapter.number}章生成摘要...`)

    // 生成摘要
    const summaryData = await generateChapterSummary(chapter, {
      currentChapterNumber: maxChapter
    })

    // 调用保存回调
    await onSave(chapter.id, summaryData)

    console.log(`[摘要生成] 第${chapter.number}章摘要已保存`)
  } catch (error) {
    console.error('[摘要生成] 失败:', error)
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 批量生成缺失的摘要
 */
export async function generateMissingSummaries(
  chapters: Chapter[],
  onSave: (chapterId: string, summaryData: any) => Promise<void>,
  onProgress?: (current: number, total: number, chapterNumber: number) => void
): Promise<number> {
  // 找出需要生成摘要的章节
  const maxChapter = Math.max(...chapters.map(c => c.number))
  const chaptersNeedingSummary = chapters.filter(ch => shouldRefreshSummary(ch, maxChapter))

  if (chaptersNeedingSummary.length === 0) {
    console.log('[摘要生成] 没有需要生成摘要的章节')
    return 0
  }

  console.log(`[摘要生成] 需要为 ${chaptersNeedingSummary.length} 章生成摘要`)

  let successCount = 0

  for (let i = 0; i < chaptersNeedingSummary.length; i++) {
    const chapter = chaptersNeedingSummary[i]

    if (onProgress) {
      onProgress(i + 1, chaptersNeedingSummary.length, chapter.number)
    }

    try {
      const summaryData = await generateChapterSummary(chapter, {
        currentChapterNumber: maxChapter
      })
      await onSave(chapter.id, summaryData)
      successCount++

      // 短暂延迟，避免API请求过快
      if (i < chaptersNeedingSummary.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      console.error(`[摘要生成] 第${chapter.number}章生成失败:`, error)
      // 继续处理下一章
    }
  }

  return successCount
}
