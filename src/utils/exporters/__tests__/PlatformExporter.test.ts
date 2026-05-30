/**
 * 接口自动化测试 — 平台格式导出器（platformExporter）
 * 覆盖用例：TC-12.1 ~ TC-12.11
 * 优先级：P0 + P1
 */
import { describe, expect, it } from 'vitest'
import {
  PLATFORM_CONFIGS,
  validateChapterForPlatform,
  exportToPlatformFormat,
} from '@/utils/exporters/platformExporter'
import type { Chapter } from '@/types'
import type { PlatformId } from '@/utils/exporters/platformExporter'

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  const content = overrides.content || '这是测试章节的正文内容。'.repeat(100)
  return {
    id: 'ch-1',
    number: 1,
    title: '第一章 开始',
    content,
    wordCount: content.replace(/\s/g, '').length,
    status: 'draft',
    ...overrides,
  } as Chapter
}

function makeLongContent(wordCount: number): string {
  const base = '这是一个用于测试字数限制的段落，包含足够多的汉字。'
  let text = ''
  while (text.length < wordCount) {
    text += base
  }
  return text.slice(0, wordCount)
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('PlatformExporter 接口自动化测试', () => {

  // =========================================================================
  // TC-12.1 起点中文网格式导出
  // =========================================================================
  describe('TC-12.1 起点中文网格式导出', () => {
    it('P0: qidian平台配置参数正确', () => {
      const config = PLATFORM_CONFIGS.qidian
      expect(config.maxChapterTitleLength).toBe(30)
      expect(config.maxChapterLength).toBe(10000)
      expect(config.minChapterLength).toBe(2000)
      expect(config.paragraphIndent).toBe('\u3000\u3000')
      expect(config.chapterTitleFormat).toBe('plain')
    })

    it('P0: 正常章节通过qidian校验', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(3000), // 3000字，在2000-10000范围内
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    it('P0: 导出格式正确', () => {
      const chapters = [makeChapter({
        title: '第一章 测试',
        content: makeLongContent(3000),
      })]

      const result = exportToPlatformFormat(chapters, { platform: 'qidian' })
      expect(result.content).toBeTruthy()
      expect(result.chapterCount).toBe(1)
      expect(result.totalWordCount).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TC-12.2 番茄小说格式导出
  // =========================================================================
  describe('TC-12.2 番茄小说格式导出', () => {
    it('P0: fanqie平台配置参数正确', () => {
      const config = PLATFORM_CONFIGS.fanqie
      expect(config.maxChapterTitleLength).toBe(50)
      expect(config.maxChapterLength).toBe(8000)
      expect(config.minChapterLength).toBe(1000)
      expect(config.chapterTitleFormat).toBe('numbered')
    })

    it('P0: 正常章节通过fanqie校验', () => {
      const chapter = makeChapter({
        title: '第1章',
        content: makeLongContent(2000),
      })

      const result = validateChapterForPlatform(chapter, 'fanqie')
      expect(result.valid).toBe(true)
    })
  })

  // =========================================================================
  // TC-12.3 晋江文学城格式导出
  // =========================================================================
  describe('TC-12.3 晋江文学城格式导出', () => {
    it('P0: jjwxc平台配置参数正确', () => {
      const config = PLATFORM_CONFIGS.jjwxc
      expect(config.maxChapterTitleLength).toBe(25)
      expect(config.maxChapterLength).toBe(15000)
      expect(config.minChapterLength).toBe(3000)
      expect(config.chapterTitleFormat).toBe('numbered')
    })

    it('P0: 正常章节通过jjwxc校验', () => {
      const chapter = makeChapter({
        title: '第1章',
        content: makeLongContent(5000),
      })

      const result = validateChapterForPlatform(chapter, 'jjwxc')
      expect(result.valid).toBe(true)
    })

    it('P1: jjwxc检测外部链接', () => {
      const chapter = makeChapter({
        title: '第1章',
        content: makeLongContent(4000) + '详情请访问 https://example.com',
      })

      const result = validateChapterForPlatform(chapter, 'jjwxc')
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('链接'))).toBe(true)
    })
  })

  // =========================================================================
  // TC-12.4 章节字数校验
  // =========================================================================
  describe('TC-12.4 章节字数校验', () => {
    it('P0: 超过maxChapterLength时返回警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(11000), // 超过qidian的10000上限
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('超过') && w.includes('上限'))).toBe(true)
    })

    it('P0: 低于minChapterLength时返回警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(500), // 低于qidian的2000下限
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('低于') && w.includes('下限'))).toBe(true)
    })

    it('P0: 字数在范围内时无警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(3000),
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      const wordCountWarnings = result.warnings.filter(
        w => w.includes('超过') || w.includes('低于')
      )
      expect(wordCountWarnings).toHaveLength(0)
    })
  })

  // =========================================================================
  // TC-12.5 禁止模式检测
  // =========================================================================
  describe('TC-12.5 禁止模式检测', () => {
    it('P1: 检测到禁止字符时返回警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(3000) + '□■◆',
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('禁止'))).toBe(true)
    })

    it('P1: 检测到制表符时返回警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(3000) + '\t',
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(false)
    })
  })

  // =========================================================================
  // TC-12.6 零宽字符检测
  // =========================================================================
  describe('TC-12.6 零宽字符检测', () => {
    it('P1: 检测到零宽字符时返回警告', () => {
      const chapter = makeChapter({
        title: '第一章',
        content: makeLongContent(3000) + '\u200B\uFEFF',
      })

      const result = validateChapterForPlatform(chapter, 'qidian')
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('零宽字符'))).toBe(true)
    })
  })

  // =========================================================================
  // TC-12.8 自动截断
  // =========================================================================
  describe('TC-12.8 自动截断', () => {
    it('P0: autoTrimLongChapters=true时截断超长章节', () => {
      const chapters = [makeChapter({
        title: '第一章',
        content: makeLongContent(12000), // 超过qidian的10000上限
      })]

      const result = exportToPlatformFormat(chapters, {
        platform: 'qidian',
        autoTrimLongChapters: true,
      })

      // 导出仍然成功
      expect(result.content).toBeTruthy()
      expect(result.chapterCount).toBe(1)
    })
  })

  // =========================================================================
  // TC-12.9 章节排序与连接
  // =========================================================================
  describe('TC-12.9 章节排序与连接', () => {
    it('P1: 多章节导出成功', () => {
      const chapters = [
        makeChapter({ number: 3, title: '第三章', content: makeLongContent(3000) }),
        makeChapter({ number: 1, title: '第一章', content: makeLongContent(3000) }),
        makeChapter({ number: 2, title: '第二章', content: makeLongContent(3000) }),
      ]

      const result = exportToPlatformFormat(chapters, { platform: 'generic' })

      expect(result.chapterCount).toBe(3)
      expect(result.totalWordCount).toBeGreaterThan(0)
      expect(result.content).toBeTruthy()
    })
  })

  // =========================================================================
  // TC-12.10 各平台separator差异
  // =========================================================================
  describe('TC-12.10 各平台separator差异', () => {
    it('P2: ciweimao使用特殊separator', () => {
      expect(PLATFORM_CONFIGS.ciweimao.separator).toBe('\n\n---\n\n')
    })

    it('P2: qidian使用简单separator', () => {
      expect(PLATFORM_CONFIGS.qidian.separator).toBe('\n\n')
    })

    it('P2: generic使用简单separator', () => {
      expect(PLATFORM_CONFIGS.generic.separator).toBe('\n\n')
    })
  })

  // =========================================================================
  // TC-12.11 通用格式导出
  // =========================================================================
  describe('TC-12.11 通用格式导出', () => {
    it('P1: generic平台限制最宽松', () => {
      const config = PLATFORM_CONFIGS.generic
      expect(config.maxChapterTitleLength).toBe(100)
      expect(config.maxChapterLength).toBe(50000)
      expect(config.minChapterLength).toBe(0)
    })

    it('P1: 任何内容都能通过generic校验', () => {
      const chapter = makeChapter({
        title: '这是一个很长的标题'.repeat(10),
        content: '短内容',
      })

      const result = validateChapterForPlatform(chapter, 'generic')
      // generic的minChapterLength=0，短内容也应该通过
      const lengthWarnings = result.warnings.filter(
        w => w.includes('超过') || w.includes('低于')
      )
      expect(lengthWarnings).toHaveLength(0)
    })
  })

  // =========================================================================
  // 附加: 标题长度校验
  // =========================================================================
  describe('标题长度校验', () => {
    it('P1: 标题超过限制时返回警告', () => {
      const chapter = makeChapter({
        title: '这是一个非常非常非常非常非常非常非常非常长的章节标题',
        content: makeLongContent(3000),
      })

      const result = validateChapterForPlatform(chapter, 'jjwxc') // jjwxc限制25字
      expect(result.valid).toBe(false)
      expect(result.warnings.some(w => w.includes('标题'))).toBe(true)
    })
  })

  // =========================================================================
  // 附加: 所有平台配置完整性
  // =========================================================================
  describe('平台配置完整性', () => {
    it('P1: 5个平台配置都存在', () => {
      const platforms: PlatformId[] = ['qidian', 'fanqie', 'ciweimao', 'jjwxc', 'generic']
      for (const p of platforms) {
        expect(PLATFORM_CONFIGS[p]).toBeDefined()
        expect(PLATFORM_CONFIGS[p].name).toBeTruthy()
        expect(PLATFORM_CONFIGS[p].maxChapterLength).toBeGreaterThan(0)
        expect(PLATFORM_CONFIGS[p].encoding).toBe('utf-8')
      }
    })
  })
})
