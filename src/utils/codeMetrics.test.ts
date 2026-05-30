import { describe, expect, it } from 'vitest'
import {
  buildSizeDistribution,
  largestFiles,
  estimateComplexity,
  extractImports,
  extractExports,
  buildDependencyGraph,
  detectDeadCodeFromSources,
  buildFullReport,
} from '@/utils/codeMetrics'
import type { FileMetric } from '@/utils/codeMetrics'

// ---- helpers ---------------------------------------------------------------

function makeMetric(overrides: Partial<FileMetric> & Pick<FileMetric, 'path'>): FileMetric {
  return {
    ext: '.ts',
    lines: 50,
    exportedSymbols: 1,
    importCount: 0,
    imports: [],
    ...overrides,
  }
}

// ---- tests -----------------------------------------------------------------

describe('buildSizeDistribution', () => {
  it('categorises files into the correct buckets', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'a.ts', lines: 50 }),    // tiny
      makeMetric({ path: 'b.ts', lines: 200 }),   // small
      makeMetric({ path: 'c.ts', lines: 400 }),   // medium
      makeMetric({ path: 'd.ts', lines: 800 }),   // large
      makeMetric({ path: 'e.ts', lines: 1500 }),  // huge
    ]

    const dist = buildSizeDistribution(metrics)
    expect(dist).toEqual({ tiny: 1, small: 1, medium: 1, large: 1, huge: 1 })
  })

  it('returns all zeros for an empty input', () => {
    const dist = buildSizeDistribution([])
    expect(dist).toEqual({ tiny: 0, small: 0, medium: 0, large: 0, huge: 0 })
  })

  it('handles boundary values correctly (100 -> tiny, 101 -> small)', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'a.ts', lines: 100 }),
      makeMetric({ path: 'b.ts', lines: 101 }),
    ]
    const dist = buildSizeDistribution(metrics)
    expect(dist.tiny).toBe(1)
    expect(dist.small).toBe(1)
  })
})

describe('largestFiles', () => {
  it('returns the top N files sorted by line count descending', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'small.ts', lines: 10 }),
      makeMetric({ path: 'big.ts', lines: 500 }),
      makeMetric({ path: 'medium.ts', lines: 200 }),
    ]

    const result = largestFiles(metrics, 2)
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('big.ts')
    expect(result[1].path).toBe('medium.ts')
  })

  it('defaults to top 20 when n is omitted', () => {
    const metrics = Array.from({ length: 30 }, (_, i) =>
      makeMetric({ path: `f${i}.ts`, lines: i * 10 }),
    )
    expect(largestFiles(metrics)).toHaveLength(20)
  })
})

describe('estimateComplexity', () => {
  it('returns low complexity for simple code', () => {
    const result = estimateComplexity('const x = 1', 'simple.ts')
    expect(result.rating).toBe('low')
    expect(result.path).toBe('simple.ts')
  })

  it('returns high or very-high complexity for heavily nested branching code', () => {
    // 20+ branching keywords + deep nesting
    const nested = Array.from({ length: 10 }, (_, i) =>
      `${'  '.repeat(i)}if (a${i}) { if (b${i}) { for (let j=0;j<10;j++) { while(c${i}) { switch(d${i}) { case 1: try { if(e${i}) {} } catch {} } } } } }`,
    ).join('\n')

    const result = estimateComplexity(nested, 'complex.ts')
    expect(['high', 'very-high']).toContain(result.rating)
  })

  it('accounts for nesting depth in the score', () => {
    const shallow = 'if (a) { if (b) { } }'
    const deep = 'if (a) { if (b) { if (c) { if (d) { if (e) { } } } } }'

    const shallowResult = estimateComplexity(shallow, 'shallow.ts')
    const deepResult = estimateComplexity(deep, 'deep.ts')

    expect(deepResult.score).toBeGreaterThan(shallowResult.score)
  })
})

describe('extractImports', () => {
  it('extracts static import specifiers', () => {
    const source = `
      import { ref } from 'vue'
      import foo from '@/utils/foo'
      import type { Bar } from './bar'
    `
    const result = extractImports(source)
    expect(result).toContain('vue')
    expect(result).toContain('@/utils/foo')
    expect(result).toContain('./bar')
  })

  it('extracts dynamic import specifiers', () => {
    const source = `const mod = import('./lazy-module')`
    const result = extractImports(source)
    expect(result).toContain('./lazy-module')
  })

  it('returns an empty array for source with no imports', () => {
    expect(extractImports('const x = 1')).toEqual([])
  })
})

describe('extractExports', () => {
  it('extracts exported symbol names', () => {
    const source = `
      export function foo() {}
      export const bar = 1
      export class Baz {}
      export default function qux() {}
    `
    const result = extractExports(source)
    expect(result).toContain('foo')
    expect(result).toContain('bar')
    expect(result).toContain('Baz')
  })

  it('returns an empty array for source with no exports', () => {
    expect(extractExports('const x = 1')).toEqual([])
  })
})

describe('buildDependencyGraph', () => {
  it('produces one edge per import across all file metrics', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'a.ts', imports: ['vue', './b'] }),
      makeMetric({ path: 'b.ts', imports: ['vue'] }),
    ]

    const edges = buildDependencyGraph(metrics)
    expect(edges).toHaveLength(3)
    expect(edges).toContainEqual({ from: 'a.ts', to: 'vue' })
    expect(edges).toContainEqual({ from: 'a.ts', to: './b' })
    expect(edges).toContainEqual({ from: 'b.ts', to: 'vue' })
  })

  it('returns an empty array when no files have imports', () => {
    expect(buildDependencyGraph([])).toEqual([])
  })
})

describe('detectDeadCodeFromSources', () => {
  it('flags exported symbols in files that are never imported', () => {
    const sources = [
      { path: './used.ts', source: `import { helper } from './helper'\nexport function main() {}` },
      { path: './helper.ts', source: 'export function helper() {}' },
      { path: './orphan.ts', source: 'export function orphanFn() {}' },
    ]

    const candidates = detectDeadCodeFromSources(sources)
    const orphanSymbols = candidates.filter(c => c.path === './orphan.ts')
    expect(orphanSymbols.length).toBeGreaterThanOrEqual(1)
    expect(orphanSymbols.some(c => c.symbol === 'orphanFn')).toBe(true)
  })

  it('does not flag files that are imported by at least one other file', () => {
    const sources = [
      { path: './index.ts', source: `import { util } from './util'\nexport function app() {}` },
      { path: './util.ts', source: 'export function util() {}' },
    ]

    const candidates = detectDeadCodeFromSources(sources)
    const utilCandidates = candidates.filter(c => c.path === './util.ts')
    expect(utilCandidates).toHaveLength(0)
  })
})

describe('buildFullReport', () => {
  it('produces a complete report with all fields', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'src/a.ts', ext: '.ts', lines: 120, imports: ['vue'] }),
      makeMetric({ path: 'src/b.ts', ext: '.ts', lines: 80, imports: ['./a'] }),
      makeMetric({ path: 'src/b.test.ts', ext: '.ts', lines: 40, imports: ['./b'] }),
    ]
    const sources = [
      { path: 'src/a.ts', source: 'export function a() { if (true) {} }' },
      { path: 'src/b.ts', source: 'import { a } from "./a"\nexport function b() {}' },
      { path: 'src/b.test.ts', source: 'import { b } from "./b"' },
    ]

    const report = buildFullReport(metrics, sources)

    expect(report.totalFiles).toBe(3)
    expect(report.totalLines).toBe(240)
    expect(report.fileTypes['.ts']).toBe(3)
    expect(report.sizeDistribution).toBeDefined()
    expect(report.largestFiles.length).toBeGreaterThan(0)
    expect(report.complexityEstimates.length).toBe(3)
    expect(report.importEdges.length).toBeGreaterThan(0)
    expect(report.testFileCount).toBe(1)
    expect(report.sourceFileCount).toBe(2)
    expect(report.testCoverageGap).toBeDefined()
  })

  it('computes test coverage gap correctly (a.ts has no sibling test file)', () => {
    const metrics: FileMetric[] = [
      makeMetric({ path: 'src/a.ts', ext: '.ts', lines: 50, imports: [] }),
      makeMetric({ path: 'src/b.ts', ext: '.ts', lines: 50, imports: [] }),
      makeMetric({ path: 'src/b.test.ts', ext: '.ts', lines: 30, imports: ['./b'] }),
    ]
    const sources = [
      { path: 'src/a.ts', source: 'export function a() {}' },
      { path: 'src/b.ts', source: 'export function b() {}' },
      { path: 'src/b.test.ts', source: '' },
    ]

    const report = buildFullReport(metrics, sources)
    expect(report.testCoverageGap).toContain('src/a.ts')
    expect(report.testCoverageGap).not.toContain('src/b.ts')
  })
})
