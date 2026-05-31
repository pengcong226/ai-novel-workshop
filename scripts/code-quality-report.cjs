#!/usr/bin/env node

/**
 * Code Quality Report Generator
 *
 * Scans the `src/` directory and prints a human-readable code quality
 * report covering file sizes, type counts, test vs source ratios,
 * complexity hotspots, and coverage gaps.
 *
 * Usage:
 *   node scripts/code-quality-report.cjs
 *   npm run quality:report
 *
 * Exit code is always 0; this is a reporting tool, not a gate.
 */

'use strict'

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(__dirname, '..', 'src')
const LARGE_FILE_THRESHOLD = 500
const _COMPLEXITY_THRESHOLD = 80
const TOP_N = 15

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect files under `dir` matching `extensions`.
 * Skips node_modules, __tests__, dist, and .git directories.
 */
function walk(dir, extensions) {
  const results = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '__tests__' ||
      entry.name === 'dist' ||
      entry.name === '.git'
    ) {
      continue
    }
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walk(fullPath, extensions))
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// Analysis helpers (inline to avoid ESM/CJS interop issues)
// ---------------------------------------------------------------------------

const IMPORT_RE =
  /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_RE =
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const EXPORT_RE =
  /export\s+(?:default\s+)?(?:function|class|const|let|var|enum|interface|type|abstract)\s+(\w+)/g
const BRANCHING_RE =
  /\b(if|else|for|while|do|switch|case|catch|&&|\?\?|\?\.|try)\b/g

function extractImports(source) {
  const results = []
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(source)) !== null) results.push(m[1])
  DYNAMIC_IMPORT_RE.lastIndex = 0
  while ((m = DYNAMIC_IMPORT_RE.exec(source)) !== null) results.push(m[1])
  return results
}

function extractExports(source) {
  const results = []
  let m
  EXPORT_RE.lastIndex = 0
  while ((m = EXPORT_RE.exec(source)) !== null) results.push(m[1])
  return results
}

function estimateComplexity(source) {
  const branchMatches = source.match(BRANCHING_RE)
  const branchCount = branchMatches ? branchMatches.length : 0
  let depth = 0
  let maxDepth = 0
  for (const ch of source) {
    if (ch === '{') {
      depth++
      if (depth > maxDepth) maxDepth = depth
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1)
    }
  }
  return branchCount + maxDepth * 2
}

// ---------------------------------------------------------------------------
// Collect metrics
// ---------------------------------------------------------------------------

function collectMetrics(files) {
  return files.map((filePath) => {
    const source = fs.readFileSync(filePath, 'utf-8')
    const lines = source.split('\n').length
    const ext = path.extname(filePath)
    const imports = extractImports(source)
    const exportedSymbols = extractExports(source)
    const relPath = path.relative(path.resolve(__dirname, '..'), filePath)
    return { path: relPath, ext, lines, exportedSymbols: exportedSymbols.length, importCount: imports.length, imports, source }
  })
}

// ---------------------------------------------------------------------------
// Size distribution
// ---------------------------------------------------------------------------

function sizeDistribution(metrics) {
  const dist = { tiny: 0, small: 0, medium: 0, large: 0, huge: 0 }
  for (const m of metrics) {
    if (m.lines <= 100) dist.tiny++
    else if (m.lines <= 300) dist.small++
    else if (m.lines <= 500) dist.medium++
    else if (m.lines <= 1000) dist.large++
    else dist.huge++
  }
  return dist
}

// ---------------------------------------------------------------------------
// Test coverage gap
// ---------------------------------------------------------------------------

function findCoverageGap(metrics) {
  const testBases = new Set()
  for (const m of metrics) {
    if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path)) {
      testBases.add(m.path.replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, ''))
    }
  }
  return metrics
    .filter((m) => {
      if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path)) return false
      if (!/\.(ts|js|tsx|jsx)$/.test(m.path)) return false
      const withoutExt = m.path.replace(/\.(ts|js|tsx|jsx)$/, '')
      return !testBases.has(withoutExt)
    })
    .map((m) => m.path)
}

// ---------------------------------------------------------------------------
// Dead code detection
// ---------------------------------------------------------------------------

function detectDeadCode(metrics) {
  const importedKeys = new Set()
  for (const m of metrics) {
    for (const imp of m.imports) {
      const norm = imp.replace(/^\.\.?\//, '').replace(/\.(ts|vue|js|tsx|jsx)$/, '')
      importedKeys.add(norm)
      const parts = norm.split('/')
      importedKeys.add(parts[parts.length - 1])
    }
  }

  const candidates = []
  for (const m of metrics) {
    const moduleKey = m.path
      .replace(/^\.\.?\//, '')
      .replace(/\.(ts|vue|js|tsx|jsx)$/, '')
    const baseName = moduleKey.split('/').pop() || moduleKey
    if (!importedKeys.has(moduleKey) && !importedKeys.has(baseName)) {
      const exports = extractExports(m.source)
      for (const sym of exports) {
        candidates.push({ path: m.path, symbol: sym })
      }
    }
  }
  return candidates
}

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function pad(str, len) {
  return String(str).padStart(len)
}

function printSeparator(char = '-', len = 80) {
  console.log(char.repeat(len))
}

function printHeader(title) {
  console.log()
  printSeparator('=')
  console.log(`  ${title}`)
  printSeparator('=')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const extensions = ['.ts', '.vue', '.js', '.tsx', '.jsx', '.scss', '.css']
  const files = walk(SRC_DIR, extensions)
  const metrics = collectMetrics(files)

  // ---- Overview ----
  printHeader('Code Quality Report')

  const totalLines = metrics.reduce((s, m) => s + m.lines, 0)
  const testFiles = metrics.filter((m) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path))
  const sourceFiles = metrics.filter((m) => !/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(m.path))
  const vueFiles = metrics.filter((m) => m.ext === '.vue')
  const tsFiles = metrics.filter((m) => m.ext === '.ts')
  const jsFiles = metrics.filter((m) => m.ext === '.js')

  console.log()
  console.log(`  Total files scanned : ${pad(metrics.length, 6)}`)
  console.log(`  Total lines of code : ${pad(totalLines.toLocaleString(), 6)}`)
  console.log()
  console.log(`  TypeScript (.ts)    : ${pad(tsFiles.length, 6)}  files`)
  console.log(`  Vue SFC (.vue)      : ${pad(vueFiles.length, 6)}  files`)
  console.log(`  JavaScript (.js)    : ${pad(jsFiles.length, 6)}  files`)
  console.log()
  console.log(`  Source files        : ${pad(sourceFiles.length, 6)}`)
  console.log(`  Test files          : ${pad(testFiles.length, 6)}`)
  console.log(`  Test ratio          : ${pad((testFiles.length / Math.max(sourceFiles.length, 1) * 100).toFixed(1) + '%', 6)}`)

  // ---- File size distribution ----
  printHeader('File Size Distribution')

  const dist = sizeDistribution(metrics)
  console.log()
  console.log(`  Tiny   (1-100 lines)   : ${pad(dist.tiny, 5)}`)
  console.log(`  Small  (101-300 lines)  : ${pad(dist.small, 5)}`)
  console.log(`  Medium (301-500 lines)  : ${pad(dist.medium, 5)}`)
  console.log(`  Large  (501-1000 lines) : ${pad(dist.large, 5)}`)
  console.log(`  Huge   (1001+ lines)    : ${pad(dist.huge, 5)}`)

  // ---- Largest files ----
  printHeader(`Largest Files (> ${LARGE_FILE_THRESHOLD} lines)`)

  const largeFiles = metrics
    .filter((m) => m.lines > LARGE_FILE_THRESHOLD)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, TOP_N)

  if (largeFiles.length === 0) {
    console.log('\n  (none)\n')
  } else {
    console.log()
    console.log(`  ${'Lines'.padStart(6)}  ${'Exports'.padStart(7)}  Path`)
    printSeparator('-', 78)
    for (const m of largeFiles) {
      console.log(`  ${pad(m.lines, 6)}  ${pad(m.exportedSymbols, 7)}  ${m.path}`)
    }
    console.log()
    console.log(`  ${largeFiles.length} file(s) above threshold (showing top ${TOP_N})`)
  }

  // ---- Complexity hotspots ----
  printHeader('Complexity Hotspots')

  const complexity = metrics
    .map((m) => ({
      path: m.path,
      score: estimateComplexity(m.source),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N)

  console.log()
  console.log(`  ${'Score'.padStart(6)}  ${'Rating'.padEnd(10)}  Path`)
  printSeparator('-', 78)
  for (const c of complexity) {
    let rating
    if (c.score <= 15) rating = 'low'
    else if (c.score <= 40) rating = 'medium'
    else if (c.score <= 80) rating = 'high'
    else rating = 'very-high'
    console.log(`  ${pad(c.score, 6)}  ${rating.padEnd(10)}  ${c.path}`)
  }

  // ---- Dead code candidates ----
  printHeader('Dead Code Candidates (unimported modules)')

  const deadCode = detectDeadCode(metrics)
  if (deadCode.length === 0) {
    console.log('\n  (none detected)\n')
  } else {
    console.log()
    const byFile = {}
    for (const dc of deadCode) {
      if (!byFile[dc.path]) byFile[dc.path] = []
      byFile[dc.path].push(dc.symbol)
    }
    const entries = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length).slice(0, TOP_N)
    for (const [filePath, symbols] of entries) {
      console.log(`  ${filePath}`)
      console.log(`    exports: ${symbols.join(', ')}`)
    }
    console.log()
    console.log(`  ${Object.keys(byFile).length} file(s) with potentially unimported exports`)
    console.log('  Note: barrel re-exports, side-effect imports, and dynamic usage may produce false positives.')
  }

  // ---- Test coverage gap ----
  printHeader('Source Files Without Corresponding Tests')

  const gap = findCoverageGap(metrics)
  const gapLimit = 30
  if (gap.length === 0) {
    console.log('\n  All source files have test coverage!\n')
  } else {
    console.log()
    for (const p of gap.slice(0, gapLimit)) {
      console.log(`  - ${p}`)
    }
    if (gap.length > gapLimit) {
      console.log(`  ... and ${gap.length - gapLimit} more`)
    }
    console.log()
    console.log(`  ${gap.length} source file(s) without a matching .test or .spec file`)
    console.log(`  Test coverage (by file count): ${(sourceFiles.length > 0 ? ((sourceFiles.length - gap.length) / sourceFiles.length * 100) : 0).toFixed(1)}%`)
  }

  // ---- Top import targets ----
  printHeader('Most Imported Dependencies (top 20)')

  const importCounts = {}
  for (const m of metrics) {
    for (const imp of m.imports) {
      // normalise
      const key = imp.startsWith('.') ? path.normalize(imp) : imp
      importCounts[key] = (importCounts[key] || 0) + 1
    }
  }
  const sortedImports = Object.entries(importCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  console.log()
  console.log(`  ${'Count'.padStart(5)}  Import target`)
  printSeparator('-', 70)
  for (const [target, count] of sortedImports) {
    console.log(`  ${pad(count, 5)}  ${target}`)
  }

  // ---- Done ----
  console.log()
  printSeparator('=')
  console.log('  Report complete.')
  printSeparator('=')
  console.log()
}

main()
