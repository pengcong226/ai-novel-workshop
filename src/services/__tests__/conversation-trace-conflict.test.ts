import { describe, expect, it } from 'vitest'
import { buildTraceReviewQueue } from '../conversation-trace-conflict'
import type { TraceExtractedArtifact } from '@/types/conversation-trace'

describe('conversation-trace-conflict', () => {
  it('marks worldbook duplicate as conflict and defaults to manual review action', () => {
    const artifacts: TraceExtractedArtifact[] = [
      {
        id: 'a1',
        type: 'worldbook',
        title: '宗门设定',
        confidence: 0.9,
        source: [{ line: 1, role: 'assistant', snippet: '青岚宗设定' }],
        payload: {
          key: ['青岚宗'],
          content: '青岚宗是北境第一宗门'
        }
      }
    ]

    const result = buildTraceReviewQueue(artifacts, {
      worldbookEntries: [{ key: ['青岚宗'], content: '旧设定' }]
    })

    expect(result.conflicts).toHaveLength(1)
    expect(result.items[0].action).toBe('skip')
    expect(result.items[0].conflicts[0].target).toBe('worldbook')
  })

  it('forces character/world artifacts into manual review when structure exists', () => {
    const artifacts: TraceExtractedArtifact[] = [
      {
        id: 'a2',
        type: 'character_profile',
        title: '角色林渊',
        confidence: 0.8,
        source: [{ line: 3, role: 'assistant', snippet: '林渊冷静克制' }],
        payload: { name: '林渊', personality: '冷静克制' }
      },
      {
        id: 'a3',
        type: 'world_fact',
        title: '北境规则',
        confidence: 0.75,
        source: [{ line: 4, role: 'user', snippet: '门规森严' }],
        payload: { content: '门规森严' }
      }
    ]

    const result = buildTraceReviewQueue(artifacts, {
      hasWorldStructure: true,
      hasCharacterStructure: true
    })

    expect(result.items.every(i => i.action === 'skip')).toBe(true)
    expect(result.conflicts.length).toBeGreaterThanOrEqual(2)
  })

  it('auto-applies items without conflicts', () => {
    const artifacts: TraceExtractedArtifact[] = [
      {
        id: 'a4',
        type: 'knowledge',
        title: '知识片段',
        confidence: 0.7,
        source: [{ line: 6, role: 'assistant', snippet: '设定片段' }],
        payload: { content: '全新事实片段', comment: '来源会话' }
      }
    ]

    const result = buildTraceReviewQueue(artifacts, {
      knowledgeEntries: [{ content: '旧事实片段' }]
    })

    expect(result.conflicts).toHaveLength(0)
    expect(result.items[0].action).toBe('apply')
  })
})
