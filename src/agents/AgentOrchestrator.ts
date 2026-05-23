import type { Agent, AgentConfig, AgentContext, AgentPhase, AgentResult, AgentRole, AgentTraceEvent, PhaseRunResult } from './types'

interface AgentLogger {
  warn(message: string, error?: unknown): void
}

export interface AgentOrchestratorOptions {
  agents: Agent[]
  configs: AgentConfig[]
  logger?: AgentLogger
  onTrace?: (event: AgentTraceEvent) => void
}

export class AgentOrchestrator {
  private readonly agents = new Map<AgentRole, Agent>()
  private readonly configs: AgentConfig[]
  private readonly logger?: AgentLogger
  private readonly onTrace?: (event: AgentTraceEvent) => void

  constructor(options: AgentOrchestratorOptions) {
    for (const agent of options.agents) {
      this.agents.set(agent.role, agent)
    }
    this.configs = options.configs
    this.logger = options.logger
    this.onTrace = options.onTrace
  }

  async runPhase(phase: AgentPhase, context: AgentContext): Promise<PhaseRunResult> {
    const runnableConfigs = this.configs
      .filter(config => config.enabled && config.phase === phase)
      .sort((left, right) => left.priority - right.priority)

    if (runnableConfigs.length === 0) {
      return { phase, status: 'skipped', results: [] }
    }

    const results: AgentResult[] = []

    for (const config of runnableConfigs) {
      const agent = this.agents.get(config.role)
      if (!agent) {
        const missingResult: AgentResult = {
          role: config.role,
          status: 'failed',
          message: `Agent not registered: ${config.role}`,
        }
        results.push(missingResult)
        this.emitTrace(phase, missingResult)
        continue
      }

      this.emitTrace(phase, { role: config.role, status: 'success' }, 'running')
      const startedAt = performance.now()
      try {
        const result = await agent.execute({ ...context, phase }, config)
        const resultWithDuration = {
          ...result,
          durationMs: result.durationMs ?? Math.round(performance.now() - startedAt),
        }
        results.push(resultWithDuration)
        this.emitTrace(phase, resultWithDuration)

        if (resultWithDuration.shouldHalt || resultWithDuration.status === 'halted') {
          return { phase, status: 'halted', results }
        }
      } catch (error) {
        const failedResult: AgentResult = {
          role: config.role,
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - startedAt),
        }
        this.logger?.warn(`Agent ${config.role} failed`, error)
        results.push(failedResult)
        this.emitTrace(phase, failedResult)
      }
    }

    if (results.some(result => result.status === 'failed')) {
      return { phase, status: results.every(result => result.status === 'failed') ? 'failed' : 'partial', results }
    }

    return { phase, status: 'success', results }
  }

  private emitTrace(phase: AgentPhase, result: AgentResult, status: AgentTraceEvent['status'] = result.status): void {
    this.onTrace?.({
      role: result.role,
      phase,
      status,
      message: result.message,
      durationMs: result.durationMs,
      timestamp: Date.now(),
    })
  }
}
