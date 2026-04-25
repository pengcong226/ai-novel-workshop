import { BaseAgent } from './BaseAgent'
import type { AgentContext, AgentRole, AgentResult } from './types'

export class EditorAgent extends BaseAgent {
  readonly role: AgentRole = 'editor'

  protected async run(context: AgentContext): Promise<Omit<AgentResult, 'role' | 'durationMs'>> {
    if (!context.project || !context.chapter?.content) {
      return { status: 'success', message: '缺少编辑审校输入' }
    }

    const { runReview } = await import('@/assistant/review/reviewRunner')
    const result = await runReview({
      profile: 'consistency',
      project: context.project,
      chapter: context.chapter,
    })

    return {
      status: 'success',
      message: `编辑审校生成 ${result.suggestionsAdded} 条建议`,
      data: result,
    }
  }
}
