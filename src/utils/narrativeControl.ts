/**
 * Narrative Control（叙事控制块）
 *
 * 将 ChapterMemo 渲染为结构化的「叙事控制块」，注入 Writer 的 prompt 中，
 * 强制 Writer 按 memo 的 7 段结构组织正文。
 *
 * 7 段结构（参考 InkOS narrative-control.ts）：
 *   Hook → Rising → Climax → Falling → Resolution → Transition → Cliffhanger
 */

import type { ChapterMemo } from '@/services/pipeline/types'
import { getLogger } from '@/utils/logger'

const logger = getLogger('utils:narrative-control')

// ============================================================================
// 叙事段落定义
// ============================================================================

export interface NarrativeSegment {
  id: string
  name: string
  chineseName: string
  description: string
  guidance: string
}

export const NARRATIVE_SEGMENTS: NarrativeSegment[] = [
  {
    id: 'hook',
    name: 'Hook',
    chineseName: '开篇钩子',
    description: '以悬念、冲突或引人入胜的场景开场，抓住读者注意力',
    guidance: '用一个令人好奇的细节、意外的对话或紧张的氛围开始章节。避免平铺直叙的"过渡式"开场。',
  },
  {
    id: 'rising',
    name: 'Rising',
    chineseName: '铺垫升温',
    description: '逐步展开情节，提供必要信息，为高潮做铺垫',
    guidance: '引入本章关键信息、角色互动或环境描写，让紧张感逐渐累积。注意节奏变化，不要全段对话或全段描写。',
  },
  {
    id: 'climax',
    name: 'Climax',
    chineseName: '章节高潮',
    description: '本章最核心的冲突爆发、真相揭示或情感顶点',
    guidance: '这是本章最重要的一幕。集中笔墨展现冲突、转折或顿悟。使用短句加快节奏，用具体细节增强冲击力。',
  },
  {
    id: 'falling',
    name: 'Falling',
    chineseName: '高潮回落',
    description: '高潮之后的消化、反思或结果展现',
    guidance: '让读者和角色一起消化高潮带来的冲击。展现角色的内心变化、局势的新平衡。',
  },
  {
    id: 'resolution',
    name: 'Resolution',
    chineseName: '阶段收束',
    description: '本章主线的阶段性解决或明确未解决',
    guidance: '明确本章的"核心问题"是已解决还是延后。如果有伏笔回收，在此完成。避免突然结束。',
  },
  {
    id: 'transition',
    name: 'Transition',
    chineseName: '承转过渡',
    description: '为下一章铺设桥梁，暗示新的方向',
    guidance: '自然过渡到下一章的内容。可以通过角色的计划、新信息的暗示或场景转换来实现。',
  },
  {
    id: 'cliffhanger',
    name: 'Cliffhanger',
    chineseName: '章尾悬念',
    description: '在章节末尾留下悬念或期待，驱动读者继续阅读',
    guidance: '以一个未解之谜、意外事件或悬念结尾。不必每次都"震惊"，但要让读者想看下一章。',
  },
]

// ============================================================================
// 核心渲染函数
// ============================================================================

/**
 * 将 ChapterMemo 渲染为叙事控制块 prompt 文本
 *
 * @param memo 章节备忘
 * @param chapterNumber 章节号
 * @returns 结构化的叙事控制块文本
 */
export function renderNarrativeControl(memo: ChapterMemo, chapterNumber: number): string {
  const lines: string[] = []

  lines.push('## 叙事控制块（Narrative Control Block）')
  lines.push('')
  lines.push(`本章（第${chapterNumber}章）的正文必须严格按照以下 7 段叙事结构组织。每一段都必须有实质内容，不得省略。`)
  lines.push('')

  // 从 memo 中提取骨架信息，尝试匹配到各段
  const skeletonSegments = parseBodySkeleton(memo.bodySkeleton)

  for (const segment of NARRATIVE_SEGMENTS) {
    const skeletonPart = skeletonSegments[segment.id]

    lines.push(`### ${segment.name}｜${segment.chineseName}`)
    lines.push(`> ${segment.description}`)

    if (skeletonPart) {
      lines.push(`**本章要求**：${skeletonPart}`)
    } else {
      lines.push(`**写作指引**：${segment.guidance}`)
    }

    // 从 memo 的其他字段中关联信息
    const relatedHints = getRelatedHints(segment.id, memo)
    if (relatedHints) {
      lines.push(`**备忘提示**：${relatedHints}`)
    }

    lines.push('')
  }

  // 汇总 memo 中的关键约束
  lines.push('### 关键约束')
  if (memo.hardDonts) {
    lines.push(`- **绝对不要**：${memo.hardDonts}`)
  }
  if (memo.payoffOrHold) {
    lines.push(`- **兑现/暂不掀**：${memo.payoffOrHold}`)
  }
  if (memo.chapterEndChanges) {
    lines.push(`- **章尾变化**：${memo.chapterEndChanges}`)
  }
  lines.push('')

  const result = lines.join('\n')
  logger.info(`[NarrativeControl] 第${chapterNumber}章叙事控制块已渲染`, {
    segments: NARRATIVE_SEGMENTS.length,
    hasSkeleton: !!memo.bodySkeleton,
    totalChars: result.length,
  })

  return result
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析 bodySkeleton 文本，尝试按段落或标记提取各段内容
 *
 * bodySkeleton 可能是：
 * - 按换行分隔的多行文本（每行对应一个段落）
 * - 带有段落标记的结构化文本（如 "Hook: xxx" 或 "【开篇】xxx"）
 * - 自由文本（整个作为通用骨架）
 */
function parseBodySkeleton(skeleton: string): Record<string, string> {
  const result: Record<string, string> = {}

  if (!skeleton || !skeleton.trim()) return result

  // 尝试匹配标记格式：Hook: / 【开篇】/ 1. / ## Hook 等
  const segmentPatterns: Array<{ id: string; patterns: RegExp[] }> = [
    { id: 'hook', patterns: [/hook[：:]\s*/i, /【开篇/, /^1[.、）)]\s*/m, /钩子/] },
    { id: 'rising', patterns: [/rising[：:]\s*/i, /【铺垫/, /^2[.、）)]\s*/m, /升温/] },
    { id: 'climax', patterns: [/climax[：:]\s*/i, /【高潮/, /^3[.、）)]\s*/m, /冲突|爆发/] },
    { id: 'falling', patterns: [/falling[：:]\s*/i, /【回落/, /^4[.、）)]\s*/m, /回落|消化/] },
    { id: 'resolution', patterns: [/resolution[：:]\s*/i, /【收束/, /^5[.、）)]\s*/m, /收束|解决/] },
    { id: 'transition', patterns: [/transition[：:]\s*/i, /【过渡/, /^6[.、）)]\s*/m, /过渡|承转/] },
    { id: 'cliffhanger', patterns: [/cliffhanger[：:]\s*/i, /【悬念/, /^7[.、）)]\s*/m, /悬念|钩尾/] },
  ]

  let hasStructuredMatch = false
  for (const { id, patterns } of segmentPatterns) {
    for (const pattern of patterns) {
      const match = skeleton.match(new RegExp(`${pattern.source}([^\\n]+)`, 'i'))
      if (match) {
        result[id] = match[1].trim()
        hasStructuredMatch = true
        break
      }
    }
  }

  // 如果没有结构化标记，尝试按行分配
  if (!hasStructuredMatch) {
    const lines = skeleton.split(/\n/).filter(l => l.trim())
    if (lines.length >= 3) {
      // 按顺序映射到7段
      const ids = NARRATIVE_SEGMENTS.map(s => s.id)
      const perSegment = Math.ceil(lines.length / ids.length)
      for (let i = 0; i < ids.length; i++) {
        const segmentLines = lines.slice(i * perSegment, (i + 1) * perSegment)
        if (segmentLines.length > 0) {
          result[ids[i]] = segmentLines.join('；')
        }
      }
    } else if (lines.length > 0) {
      // 只有1-2行，整体作为骨架参考
      result['_general'] = lines.join('；')
    }
  }

  return result
}

/**
 * 根据叙事段落 id，从 memo 的其他字段中提取关联提示
 */
function getRelatedHints(segmentId: string, memo: ChapterMemo): string | undefined {
  const hints: string[] = []

  switch (segmentId) {
    case 'hook':
      // 开篇钩子：参考当前任务和目标
      if (memo.currentTasks) hints.push(`任务：${memo.currentTasks}`)
      break
    case 'climax':
      // 高潮：参考目标
      if (memo.goal) hints.push(`目标：${memo.goal}`)
      break
    case 'resolution':
      // 收束：参考兑现/暂不掀
      if (memo.payoffOrHold && memo.payoffOrHold !== '无') {
        hints.push(`兑现/暂不掀：${memo.payoffOrHold}`)
      }
      break
    case 'cliffhanger':
      // 悬念：参考章尾变化
      if (memo.chapterEndChanges) hints.push(`章尾变化：${memo.chapterEndChanges}`)
      break
    case 'transition':
      // 过渡：参考日常过渡功能
      if (memo.dailyTransitionFunction) hints.push(`过渡功能：${memo.dailyTransitionFunction}`)
      break
  }

  return hints.length > 0 ? hints.join('；') : undefined
}
