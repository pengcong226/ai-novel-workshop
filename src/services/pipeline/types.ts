/**
 * Pipeline 流水线类型定义
 * @module services/pipeline/types
 *
 * 定义 PipelineRunner 及各 Agent 的输入输出接口
 */

import type { Project, ChapterOutline } from '@/types'
import type { Entity, StateEvent } from '@/types/sandbox'

// ============================================================================
// 通用类型
// ============================================================================

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** @deprecated 别名，兼容旧代码 */
  promptTokens?: number
  /** @deprecated 别名，兼容旧代码 */
  completionTokens?: number
}

export interface TokenUsageSummary {
  planner: TokenUsage
  composer: TokenUsage
  writer: TokenUsage
  normalizer: TokenUsage
  auditor: TokenUsage
  reviser: TokenUsage
  settler: TokenUsage
  analyzer: TokenUsage
  total: TokenUsage
}

function emptyTokenUsage(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

export function emptyTokenUsageSummary(): TokenUsageSummary {
  return {
    planner: emptyTokenUsage(),
    composer: emptyTokenUsage(),
    writer: emptyTokenUsage(),
    normalizer: emptyTokenUsage(),
    auditor: emptyTokenUsage(),
    reviser: emptyTokenUsage(),
    settler: emptyTokenUsage(),
    analyzer: emptyTokenUsage(),
    total: emptyTokenUsage(),
  }
}

// ============================================================================
// Phase 1: Planner 输入输出
// ============================================================================

export interface PlanChapterInput {
  project: Project
  chapterNumber: number
  chapterOutline?: ChapterOutline
  previousEndingExcerpt?: string
  externalContext?: string
  hookPool: HookEntry[]
  recentSummaries: string[]
}

export interface PlanChapterOutput {
  intent: ChapterIntent
  memo: ChapterMemo
  intentMarkdown: string
}

export interface ChapterIntent {
  chapter: number
  goal: string              // ≤50字
  mustKeep: string[]
  mustAvoid: string[]
  styleEmphasis: string[]
  outlineReference?: string
}

export interface ChapterMemo {
  goal: string
  currentTasks: string
  payoffOrHold: string
  dailyTransitionFunction: string
  threeQuestionCheck: string
  chapterEndChanges: string
  hardDonts: string
  bodySkeleton: string
}

// ============================================================================
// Phase 2: Composer 输入输出
// ============================================================================

export interface ComposeChapterInput {
  project: Project
  chapterNumber: number
  plan: PlanChapterOutput
  hookPool: HookEntry[]
  chapterSummaries: string
  characterMatrix: string
  emotionalArcs: string
  subplotBoard: string
  entityGraph: Entity[]
  stateEvents: StateEvent[]
}

export interface ComposeChapterOutput {
  contextPackage: ContextPackage
  ruleStack: RuleStack
  trace: ComposeTrace
}

export interface ContextPackage {
  chapter: number
  storyBible: string         // ≤14000 chars
  currentState: string       // ≤7000 chars
  hookSnapshot: string       // ≤9000 chars
  chapterSummaries: string   // ≤9000 chars
  characterMatrix: string    // ≤12000 chars
  emotionalArcs: string      // ≤7000 chars
  subplotBoard: string       // ≤7000 chars
  volumeOutline: string      // ≤12000 chars
  recentChapters: string[]
  selectedEntities: string
}

export interface RuleStack {
  genreRules: string[]
  bookRules: string[]
  prohibitions: string[]
  styleGuide: string
}

export interface ComposeTrace {
  selectedSections: string[]
  trimmedSections: Array<{ section: string; originalChars: number; trimmedChars: number }>
  totalBudgetUsed: number
  totalBudgetAvailable: number
}

// ============================================================================
// Phase 3: Writer 输入输出
// ============================================================================

export interface WriteChapterInput {
  project: Project
  chapterNumber: number
  title: string
  contextPackage: ContextPackage
  ruleStack: RuleStack
  memo: ChapterMemo
  lengthSpec: LengthSpec
  temperatureOverride?: number
}

export interface WriteChapterOutput {
  content: string
  title: string
  wordCount: number
  chapterSummary: string
  stateChanges: StateChange[]
  postWriteErrors: PostWriteViolation[]
  tokenUsage: TokenUsage
}

export interface StateChange {
  type: 'entity_add' | 'entity_update' | 'relation_change' | 'hook_planted' | 'hook_resolved' | 'location_change' | 'event_record'
  entityId?: string
  description: string
  chapterNumber: number
}

export interface PostWriteViolation {
  category: string
  severity: 'critical' | 'warning' | 'info'
  description: string
  suggestion: string
  affectedParagraphs?: number[]
}

// ============================================================================
// Phase 4: LengthNormalizer 输入输出
// ============================================================================

export interface LengthSpec {
  target: number
  softMin: number
  softMax: number
  hardMin: number
  hardMax: number
  countingMode: 'chars' | 'words'
}

export interface NormalizeLengthInput {
  content: string
  lengthSpec: LengthSpec
  chapterIntent?: string
}

export interface NormalizeLengthOutput {
  normalizedContent: string
  finalCount: number
  applied: boolean
  mode: 'compress' | 'expand' | 'none'
  warning?: string
  tokenUsage: TokenUsage
}

// ============================================================================
// Phase 5: ContinuityAuditor 输入输出
// ============================================================================

export interface AuditChapterInput {
  chapterContent: string
  /** 章节内容（别名，兼容调用方） */
  content?: string
  chapterNumber: number
  contextPackage?: ContextPackage
  ruleStack?: RuleStack
  memo?: ChapterMemo
  genre?: string
  temperature?: number
  /** 伏笔池数据，用于伏笔健康确定性诊断 */
  hooks?: Array<{
    id: string
    content: string
    status: string
    chapterNumber: number
    lastAdvancedChapter?: number
    advanceCount?: number
    payoffTiming?: string
    dependsOn?: string[]
    coreHook?: boolean
  }>
  /** 已有章节列表，用于节奏分析 */
  chapters?: Array<{
    number: number
    title: string
    contentPreview?: string
  }>
}

export interface AuditResult {
  passed: boolean
  overallScore: number
  issues: AuditIssue[]
  summary: string
  dimensionScores: Record<string, number>
  tokenUsage: TokenUsage
}

export interface AuditIssue {
  severity: 'critical' | 'warning' | 'info'
  category: string
  description: string
  suggestion: string
  affectedParagraphs?: number[]
  /** 问题位置（行号或段落号） */
  location?: string | number
}

// ============================================================================
// Phase 6: Reviser 输入输出
// ============================================================================

export type ReviseMode = 'auto' | 'polish' | 'rewrite' | 'spot-fix' | 'anti-detect'

export interface ReviseChapterInput {
  content: string
  chapterNumber: number
  issues: AuditIssue[]
  mode: ReviseMode
  contextPackage?: ContextPackage
  ruleStack?: RuleStack
  memo?: ChapterMemo
  lengthSpec?: LengthSpec
  /** @deprecated 由ChapterReviewCycle传入的审计结果 */
  auditResult?: AuditResult
  /** @deprecated 由ChapterReviewCycle传入的聚合报告 */
  aggregatedReport?: import('./AuditResultAggregator').AggregatedAuditReport
}

export interface ReviseOutput {
  revisedContent: string
  wordCount: number
  fixedIssues: string[]
  tokenUsage: TokenUsage
  verificationResult?: import('./RevisionVerifier').RevisionVerificationResult
}

// ============================================================================
// Pipeline 配置与结果
// ============================================================================

export interface PipelineConfig {
  maxAuditRetries: number          // 默认 1
  passScoreThreshold: number       // 默认 85
  netImprovementEpsilon: number    // 默认 3
  temperatureBase: number          // 默认 0.7
  temperatureRetryStep: number     // 默认 0.1
  maxTemperature: number           // 默认 1.2
  enableLengthNormalization: boolean
  enableHookPromotion: boolean
  enableLLMCompose?: boolean       // 默认 true，章节数 >= 20 时启用 LLM 语义裁剪
  onStageProgress?: (stage: string, detail: string) => void
  onAgentTrace?: (trace: AgentTraceEvent) => void
}

export interface WriteNextChapterOptions {
  project: Project
  chapterNumber: number
  chapterOutline?: ChapterOutline
  externalContext?: string
  wordCountOverride?: number
  temperatureOverride?: number
}

export interface ChapterPipelineResult {
  chapterNumber: number
  title: string
  wordCount: number
  content: string
  auditResult: AuditResult
  revised: boolean
  postReviseCount: number
  status: 'ready-for-review' | 'audit-failed' | 'state-degraded'
  tokenUsage: TokenUsageSummary
  durationMs: number
  stageTimings: Record<string, number>
}

export interface AgentTraceEvent {
  agent: string
  stage: string
  status: 'started' | 'completed' | 'failed'
  detail?: string
  durationMs?: number
  timestamp: number
}

// ============================================================================
// 伏笔/摘要相关
// ============================================================================

export interface HookEntry {
  id: string
  content: string
  plantedAt: number
  status: 'planted' | 'advanced' | 'resolved'
  chapterNumber: number
  promoted?: boolean
  lastAdvancedChapter?: number
  advanceCount?: number
  payoffTiming?: string
  dependsOn?: string[]
  coreHook?: boolean
}

export interface ReviewSnapshot {
  content: string
  wordCount: number
  auditResult: AuditResult
  score: number
  iteration?: number
  aggregatedReport?: import('./AuditResultAggregator').AggregatedAuditReport
}

// ============================================================================
// Pipeline 阶段枚举
// ============================================================================

export type PipelineStage =
  | 'prepare'
  | 'plan'
  | 'compose'
  | 'write'
  | 'normalize'
  | 'audit'
  | 'revise'
  | 'settle'
  | 'analyze'
  | 'promote-hooks'

export const PIPELINE_STAGES: PipelineStage[] = [
  'prepare',
  'plan',
  'compose',
  'write',
  'normalize',
  'audit',
  'revise',
  'settle',
  'analyze',
  'promote-hooks',
]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  prepare: '输入准备',
  plan: '规划',
  compose: '上下文组装',
  write: '写作',
  normalize: '字数标准化',
  audit: '质量审计',
  revise: '修订',
  settle: '状态沉淀',
  analyze: '章节分析',
  'promote-hooks': '伏笔升级',
}
