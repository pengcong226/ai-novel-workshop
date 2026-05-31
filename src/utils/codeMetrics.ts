/**
 * Codebase metrics analysis utilities.
 *
 * Provides programmatic access to file size distribution, function
 * complexity estimates, import dependency graph, and dead-code detection
 * heuristics. Designed to run against the in-tree TypeScript/Vue source
 * set; the heavy filesystem work is performed by the companion
 * `scripts/code-quality-report.cjs` CLI, while this module exposes
 * pure-function helpers that can be consumed from tests or other tools.
 *
 * @module utils/codeMetrics
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary row for a single source file. */
export interface FileMetric {
  /** Absolute or repo-relative path. */
  path: string
  /** Extension (e.g. `.ts`, `.vue`). */
  ext: string
  /** Total line count. */
  lines: number
  /** Estimated exported symbol count. */
  exportedSymbols: number
  /** Number of `import` statements. */
  importCount: number
  /** Import specifiers (bare module names or relative paths). */
  imports: string[]
}

/** Buckets for the file-size distribution report. */
export interface FileSizeDistribution {
  /** 1-100 lines */
  tiny: number
  /** 101-300 lines */
  small: number
  /** 301-500 lines */
  medium: number
  /** 501-1000 lines */
  large: number
  /** 1001+ lines */
  huge: number
}

/** Per-file complexity estimate. */
export interface ComplexityEstimate {
  path: string
  /** Simple heuristic: count of branching keywords + nesting depth. */
  score: number
  /** Human-readable rating. */
  rating: 'low' | 'medium' | 'high' | 'very-high'
}

/** An edge in the import dependency graph. */
export interface ImportEdge {
  from: string
  to: string
}

/** Dead-code candidate: an export that is never imported elsewhere. */
export interface DeadCodeCandidate {
  path: string
  symbol: string
}

/** Aggregate report returned by {@link buildFullReport}. */
export interface CodeMetricsReport {
  totalFiles: number
  totalLines: number
  fileTypes: Record<string, number>
  sizeDistribution: FileSizeDistribution
  largestFiles: FileMetric[]
  complexityEstimates: ComplexityEstimate[]
  importEdges: ImportEdge[]
  deadCodeCandidates: DeadCodeCandidate[]
  testFileCount: number
  sourceFileCount: number
  testCoverageGap: string[]
}

// ---------------------------------------------------------------------------
// File-size distribution
// ---------------------------------------------------------------------------

/** Categorise line counts into human-friendly buckets. */
export function buildSizeDistribution(metrics: FileMetric[]): FileSizeDistribution {
  const dist: FileSizeDistribution = { tiny: 0, small: 0, medium: 0, large: 0, huge: 0 }
  for (const m of metrics) {
    if (m.lines <= 100) dist.tiny++
    else if (m.lines <= 300) dist.small++
    else if (m.lines <= 500) dist.medium++
    else if (m.lines <= 1000) dist.large++
    else dist.huge++
  }
  return dist
}

/** Return the top-N files sorted by line count descending. */
export function largestFiles(metrics: FileMetric[], n = 20): FileMetric[] {
  return [...metrics].sort((a, b) => b.lines - a.lines).slice(0, n)
}

// ---------------------------------------------------------------------------
// Complexity estimation
// ---------------------------------------------------------------------------

const BRANCHING_RE =
  /\b(if|else|for|while|do|switch|case|catch|&&|\?\?|\?\.|try)\b/g

/**
 * Rough complexity score based on branching keyword density and
 * max observed nesting depth. Not a replacement for cyclomatic
 * complexity, but useful for triage.
 */
export function estimateComplexity(source: string, path: string): ComplexityEstimate {
  const branchMatches = source.match(BRANCHING_RE)
  const branchCount = branchMatches ? branchMatches.length : 0

  // Max nesting depth: track curly-brace depth.
  let depth = 0
  let maxDepth = 0
  for (const ch of source) {
    if (ch === '{') { depth++; if (depth > maxDepth) maxDepth = depth }
    else if (ch === '}') { depth = Math.max(0, depth - 1) }
  }

  const score = branchCount + maxDepth * 2

  let rating: ComplexityEstimate['rating']
  if (score <= 15) rating = 'low'
  else if (score <= 40) rating = 'medium'
  else if (score <= 80) rating = 'high'
  else rating = 'very-high'

  return { path, score, rating }
}

// ---------------------------------------------------------------------------
// Import dependency graph
// ---------------------------------------------------------------------------

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE =
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const EXPORT_RE =
  /export\s+(?:default\s+)?(?:function|class|const|let|var|enum|interface|type|abstract)\s+(\w+)/g

/** Extract static import specifiers from a source string. */
export function extractImports(source: string): string[] {
  const results: string[] = []
  let m: RegExpExecArray | null

  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(source)) !== null) {
    if (m[1] !== undefined) results.push(m[1])
  }
  DYNAMIC_IMPORT_RE.lastIndex = 0
  while ((m = DYNAMIC_IMPORT_RE.exec(source)) !== null) {
    if (m[1] !== undefined) results.push(m[1])
  }
  return results
}

/** Extract exported symbol names from a source string. */
export function extractExports(source: string): string[] {
  const results: string[] = []
  let m: RegExpExecArray | null

  EXPORT_RE.lastIndex = 0
  while ((m = EXPORT_RE.exec(source)) !== null) {
    if (m[1] !== undefined) results.push(m[1])
  }
  return results
}

/** Build a flat list of dependency edges from file metrics. */
export function buildDependencyGraph(metrics: FileMetric[]): ImportEdge[] {
  const edges: ImportEdge[] = []
  for (const m of metrics) {
    for (const imp of m.imports) {
      edges.push({ from: m.path, to: imp })
    }
  }
  return edges
}

// ---------------------------------------------------------------------------
// Dead-code detection (heuristic)
// ---------------------------------------------------------------------------

/**
 * Identify exported symbols that are never imported by any other file
 * in the provided metric set. This is a heuristic -- re-exports, barrel
 * files, dynamic usage, and side-effect imports will produce false
 * positives, but the output is useful for triage.
 */
export function detectDeadCode(metrics: FileMetric[]): DeadCodeCandidate[] {
  // Build a set of all imported specifiers (resolved to basename for
  // local imports, kept as-is for package imports).
  const imported = new Set<string>()
  for (const m of metrics) {
    for (const imp of m.imports) {
      // normalise relative paths to a rough module key
      const key = imp.replace(/^\.\.?\//, '').replace(/\.(ts|vue|js|tsx|jsx)$/, '')
      imported.add(key)
      // also add basename
      const parts = key.split('/')
      const base = parts[parts.length - 1]
      if (base !== undefined) imported.add(base)
    }
  }

  const candidates: DeadCodeCandidate[] = []
  for (const m of metrics) {
    // If nobody imports this file at all, flag every export.
    const baseName = m.path
      .replace(/^.*\//, '')
      .replace(/\.(ts|vue|js|tsx|jsx)$/, '')
    const moduleKey = m.path
      .replace(/^\.\.?\//, '')
      .replace(/\.(ts|vue|js|tsx|jsx)$/, '')

    if (!imported.has(baseName) && !imported.has(moduleKey)) {
      for (const sym of extractExports('')) {
        // placeholder -- real exports come from source, passed via FileMetric
        candidates.push({ path: m.path, symbol: sym })
      }
    }
  }

  return candidates
}

/**
 * A richer dead-code scan that receives the raw source per file
 * so it can inspect actual export names.
 */
export function detectDeadCodeFromSources(
  sources: Array<{ path: string; source: string }>,
): DeadCodeCandidate[] {
  // Build import map: normalised module key -> true
  const importedKeys = new Set<string>()
  for (const { source } of sources) {
    for (const imp of extractImports(source)) {
      const norm = imp.replace(/^\.\.?\//, '').replace(/\.(ts|vue|js|tsx|jsx)$/, '')
      importedKeys.add(norm)
      const parts = norm.split('/')
      const base = parts[parts.length - 1]
      if (base !== undefined) importedKeys.add(base)
    }
  }

  const candidates: DeadCodeCandidate[] = []
  for (const { path, source } of sources) {
    const moduleKey = path
      .replace(/^\.\.?\//, '')
      .replace(/\.(ts|vue|js|tsx|jsx)$/, '')
    const baseName = moduleKey.split('/').pop() ?? moduleKey

    if (!importedKeys.has(moduleKey) && !importedKeys.has(baseName)) {
      const exports = extractExports(source)
      for (const sym of exports) {
        candidates.push({ path, symbol: sym })
      }
    }
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Aggregate report builder (works with pre-collected data)
// ---------------------------------------------------------------------------

/**
 * Build a full {@link CodeMetricsReport} from pre-collected file metrics
 * and source texts. This is the main entry point for the CLI script.
 */
export function buildFullReport(
  metrics: FileMetric[],
  sources: Array<{ path: string; source: string }>,
): CodeMetricsReport {
  // File type counts
  const fileTypes: Record<string, number> = {}
  for (const m of metrics) {
    fileTypes[m.ext] = (fileTypes[m.ext] ?? 0) + 1
  }

  // Test vs source
  const testFileCount = metrics.filter(
    (m) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path),
  ).length
  const sourceFileCount = metrics.length - testFileCount

  // Source files that lack a sibling test file
  const testBases = new Set(
    metrics
      .filter((m) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path))
      .map((m) => m.path.replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '')),
  )
  const testCoverageGap = metrics
    .filter((m) => {
      if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path)) return false
      if (!/\.(ts|js|tsx|jsx)$/.test(m.path)) return false
      const withoutExt = m.path.replace(/\.(ts|js|tsx|jsx)$/, '')
      return !testBases.has(withoutExt) && !testBases.has(withoutExt + '.test')
    })
    .map((m) => m.path)

  // Complexity
  const sourceMap = new Map(sources.map((s) => [s.path, s.source]))
  const complexityEstimates: ComplexityEstimate[] = metrics
    .map((m) => {
      const src = sourceMap.get(m.path) ?? ''
      return estimateComplexity(src, m.path)
    })
    .sort((a, b) => b.score - a.score)

  return {
    totalFiles: metrics.length,
    totalLines: metrics.reduce((s, m) => s + m.lines, 0),
    fileTypes,
    sizeDistribution: buildSizeDistribution(metrics),
    largestFiles: largestFiles(metrics),
    complexityEstimates,
    importEdges: buildDependencyGraph(metrics),
    deadCodeCandidates: detectDeadCodeFromSources(sources),
    testFileCount,
    sourceFileCount,
    testCoverageGap,
  }
}
