import type { Chapter, ChapterOutline, Project } from '@/types'

export type AgentRole =
  | 'planner' | 'writer' | 'sentinel' | 'extractor' | 'editor' | 'reader'
  | 'composer' | 'auditor' | 'reviser' | 'normalizer' | 'settler' | 'analyzer' | 'hook-promoter' | 'post-write-validator'

export type AgentPhase =
  | 'pre-generation' | 'generation' | 'post-generation'
  | 'composition' | 'audit' | 'revise' | 'settlement'

export type AgentRunStatus = 'skipped' | 'running' | 'success' | 'failed' | 'halted'

export interface ReaderFeedback {
  title: string
  message: string
  paragraphIndex?: number
  emotionalScore?: number
  immersionScore?: number
}

export interface ReaderPersona {
  id: string
  name: string
  readingExperience: 'veteran' | 'intermediate' | 'newcomer'
  genreFamiliarity: 'core' | 'casual' | 'unfamiliar'
  focusAreas: string[]
  toleranceForTropes: 'high' | 'medium' | 'low'
}

export interface PersonaFeedback {
  personaId: string
  personaName: string
  overallScore: number
  engagementLevel: 'hooked' | 'interested' | 'neutral' | 'bored'
  specificFeedback: Array<{
    aspect: string
    score: number
    comment: string
  }>
  dropRisk: 'none' | 'low' | 'medium' | 'high'
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

export const AGENT_PHASES: AgentPhase[] = ['pre-generation', 'generation', 'post-generation', 'composition', 'audit', 'revise', 'settlement']

export const ACTIVE_AGENT_ROLES: AgentRole[] = ['planner', 'sentinel', 'extractor', 'editor', 'reader', 'composer', 'auditor', 'reviser', 'normalizer']

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  planner: '规划师',
  writer: '写手',
  sentinel: '哨兵',
  extractor: '抽取器',
  editor: '编辑审校',
  reader: '读者反馈',
  composer: '作曲师',
  auditor: '审计员',
  reviser: '修订师',
  normalizer: '字数标准化器',
  settler: '状态沉淀器',
  analyzer: '章节分析器',
  'hook-promoter': '伏笔升级器',
  'post-write-validator': '写后校验器',
}

export const AGENT_PHASE_LABELS: Record<AgentPhase, string> = {
  'pre-generation': '生成前',
  generation: '生成中',
  'post-generation': '生成后',
  composition: '上下文组装',
  audit: '质量审计',
  revise: '修订',
  settlement: '状态沉淀',
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
