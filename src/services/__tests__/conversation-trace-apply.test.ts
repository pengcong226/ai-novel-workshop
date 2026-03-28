import { describe, expect, it, vi } from 'vitest'
import { applyTraceReviewItems } from '../conversation-trace-apply'
import type { TraceReviewItem } from '@/types/conversation-trace'

function createItem(type: TraceReviewItem['artifact']['type'], action: TraceReviewItem['action']): TraceReviewItem {
  return {
    id: `item-${type}-${action}`,
    action,
    note: '',
    conflicts: [],
    artifact: {
      id: `artifact-${type}`,
      type,
      title: `${type}-title`,
      confidence: 0.8,
      source: [{ line: 1, role: 'assistant', snippet: 'snippet' }],
      payload: { content: `${type}-content`, key: ['k1'], name: '林渊' }
    }
  }
}

describe('conversation-trace-apply', () => {
  it('applies only items with apply/merge actions', async () => {
    const deps = {
      applyWorldbook: vi.fn(async () => {}),
      applyKnowledge: vi.fn(async () => {}),
      applyCharacterProfile: vi.fn(async () => {}),
      saveImportSession: vi.fn(async () => {}),
      indexArtifacts: vi.fn(async () => {}),
    }

    const items: TraceReviewItem[] = [
      createItem('worldbook', 'apply'),
      createItem('knowledge', 'merge'),
      createItem('character_profile', 'skip'),
      createItem('world_fact', 'skip'),
      createItem('timeline_event', 'apply')
    ]

    const result = await applyTraceReviewItems(items, {
      fileName: 'trace.jsonl',
      parseStats: {
        totalLines: 10,
        parsedRecords: 10,
        includedMessages: 5,
        filteredMessages: 5,
        parseErrors: 0
      },
      deps,
    })

    expect(result.stats.reviewed).toBe(5)
    expect(result.stats.applied).toBe(2)
    expect(result.stats.merged).toBe(1)
    expect(result.stats.skipped).toBe(2)

    expect(deps.applyWorldbook).toHaveBeenCalledTimes(1)
    expect(deps.applyKnowledge).toHaveBeenCalledTimes(2)
    expect(deps.applyCharacterProfile).toHaveBeenCalledTimes(0)
    expect(deps.saveImportSession).toHaveBeenCalledTimes(1)
    expect(deps.indexArtifacts).toHaveBeenCalledTimes(1)
  })

  it('records import session metadata', async () => {
    const deps = {
      applyWorldbook: vi.fn(async () => {}),
      applyKnowledge: vi.fn(async () => {}),
      applyCharacterProfile: vi.fn(async () => {}),
      saveImportSession: vi.fn(async () => {}),
      indexArtifacts: vi.fn(async () => {}),
    }

    const items: TraceReviewItem[] = [createItem('knowledge', 'apply')]

    const result = await applyTraceReviewItems(items, {
      fileName: 'trace2.jsonl',
      parseStats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0
      },
      deps,
    })

    expect(result.session.fileName).toBe('trace2.jsonl')
    expect(result.session.extractCount).toBe(1)
    expect(result.session.apply.applied).toBe(1)
  })

  it('persists world_fact artifacts through knowledge apply channel', async () => {
    const deps = {
      applyWorldbook: vi.fn(async () => 0),
      applyKnowledge: vi.fn(async () => 1),
      applyCharacterProfile: vi.fn(async () => 0),
      saveImportSession: vi.fn(async () => {}),
      indexArtifacts: vi.fn(async () => {}),
    }

    const items: TraceReviewItem[] = [createItem('world_fact', 'apply')]

    await applyTraceReviewItems(items, {
      fileName: 'trace-world-fact.jsonl',
      parseStats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0
      },
      deps,
    })

    const knowledgePayload = deps.applyKnowledge.mock.calls[0]?.[0] ?? []
    expect(knowledgePayload).toHaveLength(1)
    expect(knowledgePayload[0].type).toBe('world_fact')
  })

  it('reports applied stats based on successful writes', async () => {
    const deps = {
      applyWorldbook: vi.fn(async () => 0),
      applyKnowledge: vi.fn(async () => 1),
      applyCharacterProfile: vi.fn(async () => 0),
      saveImportSession: vi.fn(async () => {}),
      indexArtifacts: vi.fn(async () => {}),
    }

    const items: TraceReviewItem[] = [
      createItem('worldbook', 'apply'),
      createItem('knowledge', 'apply')
    ]

    const result = await applyTraceReviewItems(items, {
      fileName: 'trace-stats.jsonl',
      parseStats: {
        totalLines: 2,
        parsedRecords: 2,
        includedMessages: 2,
        filteredMessages: 0,
        parseErrors: 0
      },
      deps,
    })

    expect(result.stats.applied).toBe(1)
    expect(result.session.apply.applied).toBe(1)
  })

  it('keeps session persistence when indexing fails after writes', async () => {
    const deps = {
      applyWorldbook: vi.fn(async () => 1),
      applyKnowledge: vi.fn(async () => 0),
      applyCharacterProfile: vi.fn(async () => 0),
      saveImportSession: vi.fn(async () => {}),
      indexArtifacts: vi.fn(async () => {
        throw new Error('index failed')
      }),
    }

    const items: TraceReviewItem[] = [createItem('worldbook', 'apply')]

    await expect(applyTraceReviewItems(items, {
      fileName: 'trace-index-fail.jsonl',
      parseStats: {
        totalLines: 1,
        parsedRecords: 1,
        includedMessages: 1,
        filteredMessages: 0,
        parseErrors: 0
      },
      deps,
    })).resolves.toBeDefined()

    expect(deps.saveImportSession).toHaveBeenCalledTimes(1)
  })
})
