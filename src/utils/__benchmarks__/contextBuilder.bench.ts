/**
 * Context Builder Benchmarks
 *
 * Measures performance of pure context-building functions across varying
 * chapter counts.  All functions under test are synchronous and free of
 * store dependencies, so no Pinia setup is needed.
 *
 * Run:  npx vitest bench src/utils/__benchmarks__/contextBuilder.bench.ts
 */

import { bench, describe } from 'vitest'
import { buildAuthorsNote, buildSummary } from '@/utils/contextBuilder'

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeChapter(
  number: number,
  opts: { contentLen?: number; withSummaryData?: boolean } = {}
): any {
  const contentLen = opts.contentLen ?? 1500
  const chars =
    '夜色笼罩了整座城市，林照站在天台边缘，风吹动他的衣角。' +
    '远处传来阵阵钟声，仿佛在诉说着什么古老的故事。' +
    '白榆从身后走来，轻声说道："我们该出发了。"'
  const content = chars.repeat(Math.ceil(contentLen / chars.length)).slice(0, contentLen)

  const base: any = {
    id: `ch-${number}`,
    number,
    title: `第${number}章 风起之时`,
    content,
    wordCount: contentLen,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    summary: `第${number}章摘要：主角经历了一场关键战斗。`,
  }

  if (opts.withSummaryData) {
    base.summaryData = {
      summary: `第${number}章详细摘要：主角与敌方展开了激烈交锋，最终险胜。`,
      keyEvents: [`事件${number}-A`, `事件${number}-B`, `事件${number}-C`],
      characters: ['林照', '白榆', '玄烬'],
      locations: ['天台', '古堡', '地下城'],
      plotProgression: `推进度${number}%`,
      tokenCount: 80,
    }
  }

  return base
}

function makeChapters(
  count: number,
  opts?: { contentLen?: number; withSummaryData?: boolean }
): any[] {
  return Array.from({ length: count }, (_, i) => makeChapter(i + 1, opts))
}

// ---------------------------------------------------------------------------
// buildAuthorsNote benchmarks
// ---------------------------------------------------------------------------
// buildAuthorsNote(currentChapter, recentChapters) is synchronous and uses
// only the passed arguments (no store access when chapters is non-empty).

describe('buildAuthorsNote', () => {
  bench('first chapter (no recent chapters)', () => {
    buildAuthorsNote(1, [])
  })

  bench('10 recent chapters', () => {
    buildAuthorsNote(11, makeChapters(10))
  })

  bench('50 recent chapters', () => {
    buildAuthorsNote(51, makeChapters(50))
  })

  bench('50 recent chapters (long content)', () => {
    buildAuthorsNote(51, makeChapters(50, { contentLen: 5000 }))
  })
})

// ---------------------------------------------------------------------------
// buildSummary benchmarks
// ---------------------------------------------------------------------------
// buildSummary(chapters, currentChapter) is pure — no store access.

describe('buildSummary', () => {
  buildSummary(makeChapters(5), 6)

  bench('5 chapters (no summary data)', () => {
    buildSummary(makeChapters(5), 6)
  })

  bench('20 chapters (no summary data)', () => {
    buildSummary(makeChapters(20), 21)
  })

  bench('50 chapters (with summaryData)', () => {
    buildSummary(makeChapters(50, { withSummaryData: true }), 51)
  })

  bench('100 chapters (with summaryData)', () => {
    buildSummary(makeChapters(100, { withSummaryData: true }), 101)
  })

  bench('200 chapters (with summaryData)', () => {
    buildSummary(makeChapters(200, { withSummaryData: true }), 201)
  })

  bench('50 chapters (fallback content substring)', () => {
    buildSummary(makeChapters(50, { contentLen: 3000 }), 51)
  })
})
