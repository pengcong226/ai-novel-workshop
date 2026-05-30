import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegexScriptManager, createRegexScriptManager } from '../regex-script'
import type { RegexScript } from '@/types/regex-script'
import { RegexScriptPlacement } from '@/types/regex-script'

vi.mock('@/utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `mock-uuid-${++uuidCounter}`,
}))

function makeScript(overrides: Partial<RegexScript> = {}): RegexScript {
  return {
    id: 'test-script-1',
    scriptName: 'Test Script',
    disabled: false,
    runOnEdit: false,
    findRegex: '/hello/gi',
    trimStrings: [],
    replaceString: 'world',
    placement: [RegexScriptPlacement.AI_MESSAGE_END],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    markdownOnly: false,
    promptOnly: false,
    ...overrides,
  }
}

describe('RegexScriptManager', () => {
  let manager: RegexScriptManager

  beforeEach(() => {
    manager = new RegexScriptManager()
    uuidCounter = 0
  })

  // ---- CRUD ----

  it('adds and retrieves a script by id', () => {
    const script = makeScript()
    manager.addScript(script)

    expect(manager.getScript('test-script-1')).toEqual(script)
    expect(manager.count).toBe(1)
  })

  it('removes a script and returns true on success', () => {
    manager.addScript(makeScript())
    expect(manager.removeScript('test-script-1')).toBe(true)
    expect(manager.getScript('test-script-1')).toBeUndefined()
    expect(manager.count).toBe(0)
  })

  it('returns false when removing non-existent script', () => {
    expect(manager.removeScript('no-such-id')).toBe(false)
  })

  it('gets all scripts as array', () => {
    manager.addScript(makeScript({ id: 'a' }))
    manager.addScript(makeScript({ id: 'b' }))
    expect(manager.getAllScripts()).toHaveLength(2)
  })

  it('filters enabled scripts', () => {
    manager.addScript(makeScript({ id: 'a', disabled: false }))
    manager.addScript(makeScript({ id: 'b', disabled: true }))
    manager.addScript(makeScript({ id: 'c', disabled: false }))

    const enabled = manager.getEnabledScripts()
    expect(enabled).toHaveLength(2)
    expect(enabled.map(s => s.id)).toEqual(['a', 'c'])
  })

  it('updates a script and returns the updated version', () => {
    manager.addScript(makeScript())
    const updated = manager.updateScript('test-script-1', {
      scriptName: 'Updated Name',
      disabled: true,
    })

    expect(updated?.scriptName).toBe('Updated Name')
    expect(updated?.disabled).toBe(true)
    expect(manager.getScript('test-script-1')?.scriptName).toBe('Updated Name')
  })

  it('returns undefined when updating non-existent script', () => {
    expect(manager.updateScript('no-such', { scriptName: 'X' })).toBeUndefined()
  })

  it('toggles script disabled state', () => {
    manager.addScript(makeScript({ disabled: false }))

    manager.toggleScript('test-script-1', true)
    expect(manager.getScript('test-script-1')?.disabled).toBe(true)

    manager.toggleScript('test-script-1', false)
    expect(manager.getScript('test-script-1')?.disabled).toBe(false)
  })

  it('clears all scripts', () => {
    manager.addScript(makeScript({ id: 'a' }))
    manager.addScript(makeScript({ id: 'b' }))
    manager.clear()
    expect(manager.count).toBe(0)
    expect(manager.getAllScripts()).toHaveLength(0)
  })

  // ---- factory ----

  it('createRegexScriptManager returns a new manager instance', () => {
    const m = createRegexScriptManager()
    expect(m).toBeInstanceOf(RegexScriptManager)
    expect(m.count).toBe(0)
  })

  // ---- import ----

  it('imports scripts from JSON string', async () => {
    const data = JSON.stringify([
      { scriptName: 'Script A', findRegex: '/aaa/g', replaceString: 'bbb' },
      { scriptName: 'Script B', findRegex: '/ccc/g', replaceString: 'ddd' },
    ])

    const result = await manager.importScripts(data)
    expect(result.imported).toHaveLength(2)
    expect(result.skipped).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
    expect(manager.count).toBe(2)
  })

  it('skips scripts with missing required fields when skipInvalid=true', async () => {
    const data = JSON.stringify([
      { findRegex: '/ok/g' }, // missing scriptName
      { scriptName: 'Valid', findRegex: '/valid/g', replaceString: 'x' },
    ])

    const result = await manager.importScripts(data)
    expect(result.imported).toHaveLength(1)
    expect(result.skipped).toHaveLength(1)
  })

  it('skips scripts with invalid regex when validateRegex=true', async () => {
    const data = JSON.stringify([
      { scriptName: 'Bad Regex', findRegex: '/(unclosed/', replaceString: 'x' },
    ])

    const result = await manager.importScripts(data)
    expect(result.imported).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]).toContain('正则表达式无效')
  })

  it('skips duplicate scripts when overwrite=false', async () => {
    manager.addScript(makeScript({ id: 'existing-id' }))

    const data = JSON.stringify([
      { id: 'existing-id', scriptName: 'Dup', findRegex: '/dup/g', replaceString: 'x' },
    ])

    const result = await manager.importScripts(data)
    expect(result.imported).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
  })

  it('overwrites existing scripts when overwrite=true', async () => {
    manager.addScript(makeScript({ id: 'existing-id', scriptName: 'Old' }))

    const data = JSON.stringify([
      { id: 'existing-id', scriptName: 'New', findRegex: '/new/g', replaceString: 'x' },
    ])

    const result = await manager.importScripts(data, { overwrite: true })
    expect(result.imported).toHaveLength(1)
    expect(manager.getScript('existing-id')?.scriptName).toBe('New')
  })

  it('handles malformed JSON gracefully', async () => {
    const result = await manager.importScripts('not valid json!!!')
    expect(result.imported).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('解析脚本文件失败')
  })

  it('assigns default disabled state from options', async () => {
    const data = JSON.stringify([
      { scriptName: 'DefaultDisabled', findRegex: '/x/g', replaceString: 'y' },
    ])

    const result = await manager.importScripts(data, { defaultDisabled: true })
    expect(result.imported[0].disabled).toBe(true)
  })

  // ---- export ----

  it('exports all scripts as pretty JSON', () => {
    manager.addScript(makeScript({ id: 'a', scriptName: 'A' }))
    manager.addScript(makeScript({ id: 'b', scriptName: 'B' }))

    const json = manager.exportScripts()
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })

  it('exports only enabled scripts when enabledOnly=true', () => {
    manager.addScript(makeScript({ id: 'a', disabled: false }))
    manager.addScript(makeScript({ id: 'b', disabled: true }))
    manager.addScript(makeScript({ id: 'c', disabled: false }))

    const json = manager.exportScripts({ enabledOnly: true })
    const parsed = JSON.parse(json)
    // Only 'a' and 'c' are enabled
    expect(parsed).toHaveLength(2)
    expect(parsed.map((s: RegexScript) => s.id)).toEqual(['a', 'c'])
  })

  it('excludes extensions when includeExtensions=false', () => {
    manager.addScript(makeScript({ extensions: { priority: 10, category: 'test' } }))

    const json = manager.exportScripts({ includeExtensions: false })
    const parsed = JSON.parse(json)
    expect(parsed.extensions).toBeUndefined()
  })

  it('returns single object (not array) when only one script', () => {
    manager.addScript(makeScript())

    const json = manager.exportScripts()
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(false)
    expect(parsed.id).toBe('test-script-1')
  })

  // ---- execute ----

  it('executes regex replacement on matching text', () => {
    manager.addScript(makeScript({
      findRegex: '/hello/gi',
      replaceString: 'goodbye',
    }))

    const report = manager.execute('hello world, hello there')
    expect(report.matchedCount).toBe(1)
    expect(report.results[0].matched).toBe(true)
    expect(report.results[0].replacedText).toBe('goodbye world, goodbye there')
    expect(report.results[0].matchCount).toBe(2)
  })

  it('skips disabled scripts during execution', () => {
    manager.addScript(makeScript({ id: 'disabled', disabled: true }))

    const report = manager.execute('hello')
    expect(report.executedCount).toBe(0)
    expect(report.matchedCount).toBe(0)
  })

  it('applies capture group substitution ($1, $2)', () => {
    manager.addScript(makeScript({
      findRegex: '/(\\w+)@(\\w+)/g',
      replaceString: '$2@$1',
    }))

    const report = manager.execute('user@domain')
    expect(report.results[0].replacedText).toBe('domain@user')
  })

  it('applies trimStrings before regex execution', () => {
    manager.addScript(makeScript({
      trimStrings: ['REMOVE_ME'],
      findRegex: '/hello/g',
      replaceString: 'hi',
    }))

    const report = manager.execute('REMOVE_ME hello world')
    expect(report.results[0].replacedText).toBe(' hi world')
  })

  it('respects onlyRunIds filter', () => {
    manager.addScript(makeScript({ id: 'a', scriptName: 'A', findRegex: '/a/g', replaceString: 'X' }))
    manager.addScript(makeScript({ id: 'b', scriptName: 'B', findRegex: '/b/g', replaceString: 'Y' }))

    const report = manager.execute('a b', { onlyRunIds: ['b'] })
    expect(report.executedCount).toBe(1)
    expect(report.results[0].scriptId).toBe('b')
  })

  it('respects skipIds filter', () => {
    manager.addScript(makeScript({ id: 'a', scriptName: 'A', findRegex: '/a/g', replaceString: 'X' }))
    manager.addScript(makeScript({ id: 'b', scriptName: 'B', findRegex: '/b/g', replaceString: 'Y' }))

    const report = manager.execute('a b', { skipIds: ['a'] })
    expect(report.executedCount).toBe(1)
    expect(report.results[0].scriptId).toBe('b')
  })

  it('filters scripts by depth range', () => {
    manager.addScript(makeScript({
      id: 'depth-2-only',
      minDepth: 2,
      maxDepth: 4,
      findRegex: '/test/g',
      replaceString: 'replaced',
    }))

    // Should not execute at depth 1
    const reportLow = manager.execute('test', { depth: 1 })
    expect(reportLow.executedCount).toBe(0)

    // Should execute at depth 3
    const reportOk = manager.execute('test', { depth: 3 })
    expect(reportOk.executedCount).toBe(1)
  })

  it('respects placement filter', () => {
    manager.addScript(makeScript({
      placement: [RegexScriptPlacement.USER_INPUT],
      findRegex: '/hello/g',
      replaceString: 'world',
    }))

    // Should not run when placement doesn't match
    const reportNoMatch = manager.execute('hello', { placement: RegexScriptPlacement.AI_MESSAGE_END })
    expect(reportNoMatch.executedCount).toBe(0)

    // Should run when placement matches
    const reportMatch = manager.execute('hello', { placement: RegexScriptPlacement.USER_INPUT })
    expect(reportMatch.executedCount).toBe(1)
  })

  it('returns performance stats in execution report', () => {
    manager.addScript(makeScript({ findRegex: '/test/g', replaceString: 'ok' }))

    const report = manager.execute('test')
    expect(report.totalTime).toBeGreaterThanOrEqual(0)
    expect(report.performance).toBeDefined()
    expect(report.performance.averageTime).toBeGreaterThanOrEqual(0)
    expect(report.performance.totalMatches).toBeGreaterThanOrEqual(0)
  })
})
