import { BaseAgent } from './BaseAgent'
import type { AgentContext, AgentRole, AgentResult, ReaderFeedback } from './types'

export class ReaderAgent extends BaseAgent {
  readonly role: AgentRole = 'reader'

  protected async run(context: AgentContext): Promise<Omit<AgentResult<ReaderFeedback[]>, 'role' | 'durationMs'>> {
    if (!context.project || !context.chapter?.content) {
      return { status: 'success', message: '缺少读者反馈输入', data: [] }
    }

    const { runReview } = await import('@/assistant/review/reviewRunner')
    const result = await runReview({
      profile: 'quality',
      project: context.project,
      chapter: context.chapter,
    })

    const feedback = result.suggestions.map(suggestion => ({
      title: suggestion.title,
      message: suggestion.message,
      paragraphIndex: suggestion.paragraphIndex,
    }))

    return {
      status: 'success',
      message: `读者反馈生成 ${feedback.length} 条建议`,
      data: feedback,
    }
  }
}
