/**
 * DataAdapter - 数据适配器
 * @module services/pipeline/DataAdapter
 *
 * 从 PipelineRunner 中提取的数据访问层，提供纯函数式的数据查询方法。
 * 所有方法均为静态方法，仅从 Project 对象中读取数据，不执行任何副作用。
 */

import type { Project, ChapterOutline } from '@/types'
import type { HookEntry } from './types'
import { analyzeTensionCurve, formatTensionCurveReport } from '@/utils/tensionCurvePlanner'

/**
 * 数据适配器，封装从 Project 中提取各种上下文数据的逻辑
 */
export class DataAdapter {
  /**
   * 从项目的剧情事件中提取伏笔池
   * @param project - 项目数据
   * @returns 伏笔条目数组
   */
  static extractHookPool(project: Project): HookEntry[] {
    const events = project.plotEvents || []
    return events
      .filter((e) => e.type === 'foreshadowing_planted' || e.type === 'foreshadowing_resolved')
      .map((e, i) => ({
        id: e.id || `hook-${i}`,
        content: e.description || '',
        plantedAt: e.createdAt || Date.now(),
        status: (e.type === 'foreshadowing_resolved' ? 'resolved' : 'planted') as 'resolved' | 'planted',
        chapterNumber: e.chapterNumber || 0,
      }))
  }

  /**
   * 获取指定章节之前的最近章节摘要（最多5章）
   * @param project - 项目数据
   * @param chapterNumber - 当前章节号
   * @returns 章节摘要数组
   */
  static extractRecentSummaries(project: Project, chapterNumber: number): string[] {
    const chapters = project.chapters || []
    return chapters
      .filter(ch => ch.number < chapterNumber)
      .slice(-5)
      .map(ch => ch.summary || `${ch.title}: (无摘要)`)
  }

  /**
   * 获取上一章的结尾片段（最后500字）
   * @param project - 项目数据
   * @param chapterNumber - 当前章节号
   * @returns 上一章结尾文本，如果不存在则返回 undefined
   */
  static extractPreviousEnding(project: Project, chapterNumber: number): string | undefined {
    const chapters = project.chapters || []
    const prev = chapters.find(ch => ch.number === chapterNumber - 1)
    if (!prev?.content) return undefined
    return prev.content.slice(-500)
  }

  /**
   * 根据章节号查找大纲中的章节概要
   * @param project - 项目数据
   * @param chapterNumber - 章节号
   * @returns 章节概要对象，如果不存在则返回 undefined
   */
  static findChapterOutline(project: Project, chapterNumber: number): ChapterOutline | undefined {
    const chapters = project.outline?.chapters || []
    return chapters[chapterNumber - 1]
  }

  /**
   * 提取角色关系矩阵
   * @param project - 项目数据
   * @returns 格式化的角色信息字符串
   */
  static extractCharacterMatrix(project: Project): string {
    const entities = DataAdapter.extractEntities(project)
    const characters = entities.filter(e => e.type === 'CHARACTER')
    if (characters.length === 0) return ''
    return characters.slice(0, 20).map(c =>
      `### ${c.name}\n${c.description || '(无描述)'}`
    ).join('\n\n')
  }

  /**
   * 提取最近章节的情感弧线描述（基于张力曲线分析）
   * @param project - 项目数据
   * @returns 格式化的情感弧线字符串
   */
  static extractEmotionalArcs(project: Project): string {
    const chapters = (project.chapters || []).slice(-10)
    if (chapters.length === 0) return ''

    // 使用张力曲线分析器进行分析
    const tensionReport = analyzeTensionCurve(
      chapters.map(ch => ({
        number: ch.number,
        content: ch.content || '',
        title: ch.title,
      }))
    )

    // 格式化报告
    return formatTensionCurveReport(tensionReport)
  }

  /**
   * 提取支线剧情板
   * @param project - 项目数据
   * @returns 格式化的支线剧情字符串
   */
  static extractSubplotBoard(project: Project): string {
    const subplots = project.outline?.subPlots || []
    if (subplots.length === 0) return ''
    return subplots.map(sp =>
      `- ${sp.name}: ${sp.description || ''}`
    ).join('\n')
  }

  /**
   * 提取项目实体列表
   * @param project - 项目数据
   * @returns 实体数组
   */
  static extractEntities(project: Project): Array<{type: string; name: string; description: string}> {
    return (project._entities || []).map(e => ({
      type: e.type,
      name: e.name,
      description: e.systemPrompt || '',
    }))
  }

  /**
   * 提取项目状态事件
   * @param project - 项目数据
   * @returns 状态事件数组
   */
  static extractStateEvents(project: Project): Array<Record<string, unknown>> {
    return (project._stateEvents || []) as unknown as Array<Record<string, unknown>>
  }

  /**
   * 提取最近章节的正文内容（最多3章，每章截取最后1500字）
   * @param project - 项目数据
   * @param chapterNumber - 当前章节号
   * @returns 章节正文片段数组
   */
  static extractRecentChapters(project: Project, chapterNumber: number): string[] {
    const chapters = project.chapters || []
    return chapters
      .filter(ch => ch.number >= chapterNumber - 3 && ch.number < chapterNumber)
      .map(ch => ch.content || '')
      .filter(content => content.length > 0)
      .map(content => content.slice(-1500))
  }
}
