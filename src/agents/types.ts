import type { Chapter, ChapterOutline, Project } from '@/types'

export type AgentRole = 'planner' | 'writer' | 'sentinel' | 'extractor' | 'editor' | 'reader'

export type AgentPhase = 'pre-generation' | 'generation' | 'post-generation'

export type AgentRunStatus = 'skipped' | 'running' | 'success' | 'failed' | 'halted'

export interface ReaderFeedback {
  title: string
  message: string
  paragraphIndex?: number
  emotionalScore?: number
  immersionScore?: number
}

export interface AgentConfig {
  role: AgentRole
  enabled: boolean
  phase: AgentPhase
  priority: number
  model?: string
  batchOnly?: boolean
}

export interface AgentContext {
  phase: AgentPhase
  project?: Project | null
  chapter?: Chapter | null
  outline?: ChapterOutline
  violations?: string[]
  metadata?: Record<string, unknown>
}

export interface AgentResult<TData = unknown> {
  role: AgentRole
  status: Exclude<AgentRunStatus, 'running' | 'skipped'>
  message?: string
  shouldHalt?: boolean
  data?: TData
  durationMs?: number
}

export interface AgentTraceEvent {
  role: AgentRole
  phase: AgentPhase
  status: AgentRunStatus
  message?: string
  durationMs?: number
  timestamp: number
}

export interface Agent {
  role: AgentRole
  execute(context: AgentContext, config: AgentConfig): Promise<AgentResult>
}

export interface PhaseRunResult {
  phase: AgentPhase
  status: 'skipped' | 'success' | 'partial' | 'failed' | 'halted'
  results: AgentResult[]
}

export const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  { role: 'planner', enabled: false, phase: 'pre-generation', priority: 1 },
  { role: 'sentinel', enabled: false, phase: 'post-generation', priority: 2 },
  { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
  { role: 'reader', enabled: false, phase: 'post-generation', priority: 6 },
  { role: 'extractor', enabled: false, phase: 'post-generation', priority: 10 },
]

export const AGENT_PHASES: AgentPhase[] = ['pre-generation', 'generation', 'post-generation']

export const ACTIVE_AGENT_ROLES: AgentRole[] = ['planner', 'editor', 'reader']

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  planner: '规划师',
  writer: '写手',
  sentinel: '哨兵',
  extractor: '抽取器',
  editor: '编辑审校',
  reader: '读者反馈'
}

export const AGENT_PHASE_LABELS: Record<AgentPhase, string> = {
  'pre-generation': '生成前',
  generation: '生成中',
  'post-generation': '生成后'
}

export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && value in AGENT_ROLE_LABELS
}

export function isAgentPhase(value: unknown): value is AgentPhase {
  return typeof value === 'string' && value in AGENT_PHASE_LABELS
}

export function isActiveAgentRole(value: unknown): value is AgentRole {
  return isAgentRole(value) && ACTIVE_AGENT_ROLES.includes(value)
}
