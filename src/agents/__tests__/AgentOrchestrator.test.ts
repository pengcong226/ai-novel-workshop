import { describe, expect, it, vi } from 'vitest'
import { AgentOrchestrator } from '../AgentOrchestrator'
import type { Agent, AgentContext, AgentResult } from '../types'
import type { Chapter, Project } from '@/types'

function createAgent(role: Agent['role'], run: (context: AgentContext) => Promise<AgentResult>): Agent {
  return {
    role,
    execute: vi.fn(run),
  }
}

describe('AgentOrchestrator', () => {
  const context: AgentContext = {
    phase: 'post-generation',
    project: { id: 'project-1', title: '测试项目' } as Project,
    chapter: { id: 'chapter-1', number: 1, title: '第一章', content: '正文' } as Chapter,
  }

  it('runs enabled agents for a phase by priority order', async () => {
    const calls: string[] = []
    const orchestrator = new AgentOrchestrator({
      agents: [
        createAgent('extractor', async () => {
          calls.push('extractor')
          return { role: 'extractor', status: 'success' }
        }),
        createAgent('sentinel', async () => {
          calls.push('sentinel')
          return { role: 'sentinel', status: 'success' }
        }),
      ],
      configs: [
        { role: 'extractor', enabled: true, phase: 'post-generation', priority: 10 },
        { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
      ],
    })

    const result = await orchestrator.runPhase('post-generation', context)

    expect(calls).toEqual(['sentinel', 'extractor'])
    expect(result.status).toBe('success')
    expect(result.results.map(item => item.role)).toEqual(['sentinel', 'extractor'])
  })

  it('skips disabled agents and agents from other phases', async () => {
    const sentinel = createAgent('sentinel', async () => ({ role: 'sentinel', status: 'success' }))
    const planner = createAgent('planner', async () => ({ role: 'planner', status: 'success' }))
    const orchestrator = new AgentOrchestrator({
      agents: [sentinel, planner],
      configs: [
        { role: 'sentinel', enabled: false, phase: 'post-generation', priority: 1 },
        { role: 'planner', enabled: true, phase: 'pre-generation', priority: 1 },
      ],
    })

    const result = await orchestrator.runPhase('post-generation', context)

    expect(sentinel.execute).not.toHaveBeenCalled()
    expect(planner.execute).not.toHaveBeenCalled()
    expect(result.status).toBe('skipped')
    expect(result.results).toEqual([])
  })

  it('halts the phase when an agent requests halt', async () => {
    const extractor = createAgent('extractor', async () => ({ role: 'extractor', status: 'success' }))
    const sentinel = createAgent('sentinel', async () => ({
      role: 'sentinel',
      status: 'halted',
      message: '逻辑冲突',
      shouldHalt: true,
    }))
    const orchestrator = new AgentOrchestrator({
      agents: [sentinel, extractor],
      configs: [
        { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
        { role: 'extractor', enabled: true, phase: 'post-generation', priority: 2 },
      ],
    })

    const result = await orchestrator.runPhase('post-generation', context)

    expect(extractor.execute).not.toHaveBeenCalled()
    expect(result.status).toBe('halted')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].message).toBe('逻辑冲突')
  })

  it('captures agent failures and continues by default', async () => {
    const logger = { warn: vi.fn() }
    const reader = createAgent('reader', async () => ({ role: 'reader', status: 'success' }))
    const editor = createAgent('editor', async () => {
      throw new Error('review failed')
    })
    const orchestrator = new AgentOrchestrator({
      agents: [editor, reader],
      configs: [
        { role: 'editor', enabled: true, phase: 'post-generation', priority: 1 },
        { role: 'reader', enabled: true, phase: 'post-generation', priority: 2 },
      ],
      logger,
    })

    const result = await orchestrator.runPhase('post-generation', context)

    expect(reader.execute).toHaveBeenCalledOnce()
    expect(result.status).toBe('partial')
    expect(result.results.map(item => item.status)).toEqual(['failed', 'success'])
    expect(logger.warn).toHaveBeenCalled()
  })

  it('emits trace events for agent lifecycle', async () => {
    const trace = vi.fn()
    const orchestrator = new AgentOrchestrator({
      agents: [createAgent('editor', async () => ({ role: 'editor', status: 'success', message: '完成' }))],
      configs: [{ role: 'editor', enabled: true, phase: 'post-generation', priority: 5 }],
      onTrace: trace,
    })

    await orchestrator.runPhase('post-generation', context)

    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ role: 'editor', status: 'running' }))
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ role: 'editor', status: 'success', message: '完成' }))
  })
})
