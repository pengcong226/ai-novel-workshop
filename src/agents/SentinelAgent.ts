import { BaseAgent } from './BaseAgent'
import type { AgentContext, AgentRole, AgentResult } from './types'

export class SentinelAgent extends BaseAgent {
  readonly role: AgentRole = 'sentinel'

  protected async run(context: AgentContext): Promise<Omit<AgentResult, 'role' | 'durationMs'>> {
    if (!context.project || !context.outline || !context.chapter?.content) {
      return { status: 'success', message: '缺少哨兵输入，跳过逻辑校验' }
    }

    const { validateChapterLogic } = await import('@/utils/llm/antiRetconValidator')
    const result = await validateChapterLogic(
      context.project,
      context.outline,
      context.chapter.content
    )

    return {
      status: result.passed ? 'success' : 'halted',
      message: result.passed ? '哨兵校验通过' : result.reason,
      shouldHalt: !result.passed,
      data: result,
    }
  }
}
