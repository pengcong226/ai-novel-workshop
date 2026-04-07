import { describe, expect, it } from 'vitest'
import { parseConversationTraceFile, parseConversationTraceText } from '../conversation-trace-parser'

describe('conversation-trace-parser', () => {
  it('parses only user and assistant by default', async () => {
    const text = [
      JSON.stringify({ role: 'system', content: 'sys' }),
      JSON.stringify({ role: 'user', content: 'u1' }),
      JSON.stringify({ role: 'assistant', content: 'a1' })
    ].join('\n')

    const result = await parseConversationTraceText(text)

    expect(result.messages).toHaveLength(2)
    expect(result.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(result.stats.filteredMessages).toBe(1)
  })

  it('supports includeRoles override', async () => {
    const text = [
      JSON.stringify({ role: 'system', content: 'sys' }),
      JSON.stringify({ role: 'user', content: 'u1' })
    ].join('\n')

    const result = await parseConversationTraceText(text, {
      includeRoles: ['system', 'user']
    })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
  })

  it('collects parse errors for invalid lines', async () => {
    const text = [
      JSON.stringify({ role: 'user', content: 'ok' }),
      '{ bad json',
      JSON.stringify({ role: 'assistant', content: 'ok2' })
    ].join('\n')

    const result = await parseConversationTraceText(text)

    expect(result.errors).toHaveLength(1)
    expect(result.messages).toHaveLength(2)
    expect(result.stats.parseErrors).toBe(1)
  })

  it('extracts content from message.content blocks', async () => {
    const text = [
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'hello' },
            { type: 'text', text: 'world' }
          ]
        }
      })
    ].join('\n')

    const result = await parseConversationTraceText(text)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toContain('hello')
    expect(result.messages[0].content).toContain('world')
  })

  it('respects maxMessages limit', async () => {
    const text = [
      JSON.stringify({ role: 'user', content: '1' }),
      JSON.stringify({ role: 'assistant', content: '2' }),
      JSON.stringify({ role: 'user', content: '3' })
    ].join('\n')

    const result = await parseConversationTraceText(text, { maxMessages: 2 })

    expect(result.messages).toHaveLength(2)
  })

  it('parses from File input', async () => {
    const file = new File(
      [JSON.stringify({ role: 'user', content: 'from-file' })],
      'trace.jsonl',
      { type: 'application/x-ndjson' }
    )

    const result = await parseConversationTraceFile(file)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].content).toBe('from-file')
  })

  it('keeps sourceLine aligned to physical line numbers in stream mode', async () => {
    const file = new File(
      [[
        '\n',
        JSON.stringify({ role: 'user', content: 'line-2' }),
        '\n\n',
        JSON.stringify({ role: 'assistant', content: 'line-4' }),
        '\n'
      ].join('')],
      'trace-lines.jsonl',
      { type: 'application/x-ndjson' }
    )

    const result = await parseConversationTraceFile(file)

    expect(result.messages.map(m => m.sourceLine)).toEqual([2, 4])
  })

  it('reports parse error line by physical line number in stream mode', async () => {
    const file = new File(
      [[
        '\n',
        '{ bad json',
        '\n',
        JSON.stringify({ role: 'assistant', content: 'line-4' }),
        '\n'
      ].join('')],
      'trace-error-lines.jsonl',
      { type: 'application/x-ndjson' }
    )

    const result = await parseConversationTraceFile(file)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].line).toBe(2)
    expect(result.messages[0].sourceLine).toBe(3)
  })

  it('rejects overlong lines in stream mode', async () => {
    const longContent = 'x'.repeat(64)
    const file = new File(
      [JSON.stringify({ role: 'user', content: longContent })],
      'trace-long-line.jsonl',
      { type: 'application/x-ndjson' }
    )

    const result = await parseConversationTraceFile(file, { maxLineLength: 30 })

    expect(result.messages).toHaveLength(0)
    expect(result.stats.parseErrors).toBe(1)
    expect(result.errors[0].message).toContain('单行长度超过限制')
  })

  it('honors maxMessages lower bound (0) without parsing records', async () => {
    const text = [
      JSON.stringify({ role: 'user', content: 'u1' }),
      '{ bad json',
      JSON.stringify({ role: 'assistant', content: 'a1' })
    ].join('\n')

    const result = await parseConversationTraceText(text, { maxMessages: 0 })

    expect(result.messages).toHaveLength(0)
    expect(result.stats.parsedRecords).toBe(0)
    expect(result.stats.parseErrors).toBe(0)
  })

  it('stops parsing after reaching maxErrors in text mode', async () => {
    const text = [
      '{ bad json 1',
      '{ bad json 2',
      JSON.stringify({ role: 'assistant', content: 'should-not-parse' })
    ].join('\n')

    const result = await parseConversationTraceText(text, { maxErrors: 1 })

    expect(result.stats.parseErrors).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.messages).toHaveLength(0)
  })

  it('truncates parse error rawLine by maxErrorRawLineLength', async () => {
    const badLine = '{ bad json with very long payload '
    const text = [badLine].join('\n')

    const result = await parseConversationTraceText(text, {
      maxErrorRawLineLength: 8,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].rawLine).toBe(badLine.slice(0, 8))
  })

  it('supports maxErrorRawLineLength = 0', async () => {
    const result = await parseConversationTraceText('{ bad json', {
      maxErrorRawLineLength: 0,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].rawLine).toBe('')
  })

})
