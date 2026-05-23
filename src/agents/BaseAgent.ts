import type { Agent, AgentConfig, AgentContext, AgentResult, AgentRole } from './types'

export abstract class BaseAgent implements Agent {
  abstract readonly role: AgentRole

  async execute(context: AgentContext, config: AgentConfig): Promise<AgentResult> {
    const startedAt = performance.now()
    const result = await this.run(context, config)
    return {
      ...result,
      role: this.role,
      durationMs: Math.round(performance.now() - startedAt),
    }
  }

  protected abstract run(context: AgentContext, config: AgentConfig): Promise<Omit<AgentResult, 'role' | 'durationMs'>>
}
