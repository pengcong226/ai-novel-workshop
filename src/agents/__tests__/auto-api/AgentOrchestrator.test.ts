/**
 * 接口自动化测试 — Agent编排器（AgentOrchestrator）
 * 覆盖用例：TC-1.1 ~ TC-1.7
 * 优先级：P0 + P1
 */
import { describe, expect, it, vi } from 'vitest'
import { AgentOrchestrator } from '@/agents/AgentOrchestrator'
import type { Agent, AgentContext, AgentResult, AgentPhase, AgentRole } from '@/agents/types'
import type { Chapter, Project } from '@/types'

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function createAgent(
  role: AgentRole,
  run: (context: AgentContext) => Promise<AgentResult>
): Agent {
  return {
    role,
    execute: vi.fn(run),
  }
}

function makeContext(phase: AgentPhase = 'post-generation'): AgentContext {
  return {
    phase,
    project: { id: 'p1', title: '测试项目' } as Project,
    chapter: { id: 'c1', number: 1, title: '第一章', content: '正文' } as Chapter,
  }
}

// ---------------------------------------------------------------------------
// 测试用例
// ---------------------------------------------------------------------------

describe('AgentOrchestrator 接口自动化测试', () => {

  // =========================================================================
  // TC-1.1 Agent注册与阶段过滤
  // =========================================================================
  describe('TC-1.1 Agent注册与阶段过滤', () => {
    it('P0: 仅执行匹配阶段的Agent', async () => {
      const calls: string[] = []
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('planner', async () => {
            calls.push('planner')
            return { role: 'planner', status: 'success' }
          }),
          createAgent('editor', async () => {
            calls.push('editor')
            return { role: 'editor', status: 'success' }
          }),
          createAgent('composer', async () => {
            calls.push('composer')
            return { role: 'composer', status: 'success' }
          }),
        ],
        configs: [
          { role: 'planner', enabled: true, phase: 'pre-generation', priority: 1 },
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
          { role: 'composer', enabled: true, phase: 'composition', priority: 1 },
        ],
      })

      const result = await orchestrator.runPhase('pre-generation', makeContext('pre-generation'))

      expect(calls).toEqual(['planner'])
      expect(result.status).toBe('success')
      expect(result.results).toHaveLength(1)
      expect(result.results[0].role).toBe('planner')
    })

    it('P0: disabled的Agent不被执行', async () => {
      const sentinel = createAgent('sentinel', async () => ({ role: 'sentinel', status: 'success' }))
      const orchestrator = new AgentOrchestrator({
        agents: [sentinel],
        configs: [
          { role: 'sentinel', enabled: false, phase: 'post-generation', priority: 1 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())
      expect(sentinel.execute).not.toHaveBeenCalled()
      expect(result.status).toBe('skipped')
    })
  })

  // =========================================================================
  // TC-1.2 优先级排序执行
  // =========================================================================
  describe('TC-1.2 优先级排序执行', () => {
    it('P0: 按priority从小到大顺序执行', async () => {
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
          createAgent('editor', async () => {
            calls.push('editor')
            return { role: 'editor', status: 'success' }
          }),
        ],
        configs: [
          { role: 'extractor', enabled: true, phase: 'post-generation', priority: 10 },
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())

      expect(calls).toEqual(['sentinel', 'editor', 'extractor'])
      expect(result.status).toBe('success')
    })
  })

  // =========================================================================
  // TC-1.3 Agent未注册时的容错
  // =========================================================================
  describe('TC-1.3 Agent未注册时的容错', () => {
    it('P1: 未注册的Agent返回failed但不崩溃', async () => {
      const orchestrator = new AgentOrchestrator({
        agents: [], // 不注册任何Agent
        configs: [
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())

      expect(result.results).toHaveLength(1)
      expect(result.results[0].status).toBe('failed')
      expect(result.results[0].message).toContain('Agent not registered')
      expect(result.status).toBe('failed')
    })
  })

  // =========================================================================
  // TC-1.4 shouldHalt中断执行
  // =========================================================================
  describe('TC-1.4 shouldHalt中断执行', () => {
    it('P0: shouldHalt=true时中断后续Agent执行', async () => {
      const calls: string[] = []
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('sentinel', async () => {
            calls.push('sentinel')
            return { role: 'sentinel', status: 'halted', shouldHalt: true, message: '逻辑冲突' }
          }),
          createAgent('extractor', async () => {
            calls.push('extractor')
            return { role: 'extractor', status: 'success' }
          }),
        ],
        configs: [
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
          { role: 'extractor', enabled: true, phase: 'post-generation', priority: 2 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())

      expect(calls).toEqual(['sentinel']) // extractor不应执行
      expect(result.status).toBe('halted')
      expect(result.results).toHaveLength(1)
    })

    it('P0: status=halted也触发中断', async () => {
      const calls: string[] = []
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('sentinel', async () => {
            calls.push('sentinel')
            return { role: 'sentinel', status: 'halted' }
          }),
          createAgent('editor', async () => {
            calls.push('editor')
            return { role: 'editor', status: 'success' }
          }),
        ],
        configs: [
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 2 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())

      expect(calls).toEqual(['sentinel'])
      expect(result.status).toBe('halted')
    })
  })

  // =========================================================================
  // TC-1.5 无匹配Agent时返回skipped
  // =========================================================================
  describe('TC-1.5 无匹配Agent时返回skipped', () => {
    it('P1: 没有匹配阶段的Agent时返回skipped', async () => {
      const orchestrator = new AgentOrchestrator({
        agents: [],
        configs: [],
      })

      const result = await orchestrator.runPhase('settlement', makeContext('settlement'))

      expect(result.status).toBe('skipped')
      expect(result.results).toEqual([])
    })
  })

  // =========================================================================
  // TC-1.6 Agent执行抛异常时的处理
  // =========================================================================
  describe('TC-1.6 Agent执行抛异常时的处理', () => {
    it('P1: Agent抛出异常时记录失败但继续执行后续Agent', async () => {
      const calls: string[] = []
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('sentinel', async () => {
            calls.push('sentinel')
            throw new Error('哨兵执行异常')
          }),
          createAgent('editor', async () => {
            calls.push('editor')
            return { role: 'editor', status: 'success' }
          }),
        ],
        configs: [
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 2 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())

      expect(calls).toEqual(['sentinel', 'editor'])
      expect(result.results[0].status).toBe('failed')
      expect(result.results[0].message).toBe('哨兵执行异常')
      expect(result.results[1].status).toBe('success')
      expect(result.status).toBe('partial')
    })

    it('P1: 所有Agent都失败时返回failed', async () => {
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('sentinel', async () => { throw new Error('失败1') }),
          createAgent('editor', async () => { throw new Error('失败2') }),
        ],
        configs: [
          { role: 'sentinel', enabled: true, phase: 'post-generation', priority: 1 },
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 2 },
        ],
      })

      const result = await orchestrator.runPhase('post-generation', makeContext())
      expect(result.status).toBe('failed')
    })
  })

  // =========================================================================
  // TC-1.7 Trace事件回调
  // =========================================================================
  describe('TC-1.7 Trace事件回调', () => {
    it('P2: 执行时触发onTrace回调', async () => {
      const traces: any[] = []
      const orchestrator = new AgentOrchestrator({
        agents: [
          createAgent('editor', async () => ({ role: 'editor', status: 'success' })),
        ],
        configs: [
          { role: 'editor', enabled: true, phase: 'post-generation', priority: 1 },
        ],
        onTrace: (event) => traces.push(event),
      })

      await orchestrator.runPhase('post-generation', makeContext())

      expect(traces.length).toBeGreaterThanOrEqual(2)
      expect(traces.some(t => t.status === 'running' || t.status === 'success')).toBe(true)
    })
  })
})
