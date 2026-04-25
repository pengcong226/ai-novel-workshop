import { BaseAgent } from './BaseAgent'
import type { AgentContext, AgentRole, AgentResult } from './types'
import type { Chapter } from '@/types'

export interface ExtractorAgentOptions {
  extractChapter: (chapter: Chapter) => Promise<void>
}

export class ExtractorAgent extends BaseAgent {
  readonly role: AgentRole = 'extractor'

  constructor(private readonly options: ExtractorAgentOptions) {
    super()
  }

  protected async run(context: AgentContext): Promise<Omit<AgentResult, 'role' | 'durationMs'>> {
    if (!context.chapter) {
      return { status: 'success', message: '缺少抽取输入' }
    }

    await this.options.extractChapter(context.chapter)
    return { status: 'success', message: '设定抽取已完成' }
  }
}
