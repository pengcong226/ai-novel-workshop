import { describe, expect, it } from 'vitest'
import { extractTraceArtifacts } from '../conversation-trace-extractor'
import type { TraceMessage } from '@/types/conversation-trace'

describe('conversation-trace-extractor', () => {
  const messages: TraceMessage[] = [
    {
      role: 'user',
      content: '请补充世界观设定：青岚宗是北境第一修仙宗门，门规森严。',
      sourceLine: 1,
      sourceRecord: {}
    },
    {
      role: 'assistant',
      content: '角色林渊的性格冷静克制，口癖是“先看局势”。他厌恶背叛。',
      sourceLine: 2,
      sourceRecord: {}
    }
  ]

  it('extracts knowledge and worldbook artifacts with source references', async () => {
    const result = await extractTraceArtifacts(messages)

    expect(result.artifacts.length).toBeGreaterThan(0)
    expect(result.stats.totalMessages).toBe(2)

    const knowledge = result.artifacts.find(a => a.type === 'knowledge')
    const worldbook = result.artifacts.find(a => a.type === 'worldbook')

    expect(knowledge).toBeDefined()
    expect(worldbook).toBeDefined()
    expect(worldbook?.source[0].line).toBeGreaterThan(0)
  })

  it('extracts character profile and world fact artifacts by heuristics', async () => {
    const result = await extractTraceArtifacts(messages)

    expect(result.artifacts.some(a => a.type === 'character_profile')).toBe(true)
    expect(result.artifacts.some(a => a.type === 'world_fact')).toBe(true)
  })

  it('supports regex preprocessing hook', async () => {
    const result = await extractTraceArtifacts(messages, {
      regexManager: {
        execute: (text: string) => ({
          replacedText: text.replace('青岚宗', '青云宗')
        })
      }
    })

    const knowledge = result.artifacts.find(a => a.type === 'knowledge')
    const payload = knowledge?.payload as Record<string, unknown> | undefined

    expect(String(payload?.content || '')).toContain('青云宗')
  })
})
