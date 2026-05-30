# P0 阶段核心自动化能力 — 技术设计文档

> 文档版本：v1.0
> 编写日期：2026-05-28
> 编写者：产品经理
> 状态：待评审

---

## 目录

- [概述](#概述)
- [P0-1 升级为 10-Agent 自动流水线](#p0-1-升级为-10-agent-自动流水线)
- [P0-2 自动审稿门控（Audit-Review Cycle）](#p0-2-自动审稿门控audit-review-cycle)
- [P0-3 一键续写 N 章](#p0-3-一键续写-n-章)
- [附录 A 涉及文件清单汇总](#附录-a-涉及文件清单汇总)
- [附录 B 工作量预估总览](#附录-b-工作量预估总览)

---

## 概述

### 设计目标

将 ai-novel-workshop 从当前的「写手单打独斗 + 后置校验」模式升级为「10-Agent 全自动流水线」，实现从规划→作曲→写作→审计→修订→落盘的完整闭环。核心参考实现为 InkOS 的 `PipelineRunner` + `Scheduler` + `ChapterReviewCycle` 架构。

### 现状分析

**工坊现有 Agent 体系**（6 个角色）：

| 角色 | 阶段 | 职责 | 状态 |
|------|------|------|------|
| planner | pre-generation | 大纲细化 | 已实现 |
| writer | generation | 章节撰写 | 已实现（在 generation-scheduler.ts 中直接调用 LLM） |
| sentinel | post-generation | 逻辑校验（防吃书） | 已实现 |
| editor | post-generation | 编辑审校 | 已实现 |
| reader | post-generation | 读者反馈 | 已实现 |
| extractor | post-generation | 设定抽取 | 已实现 |

**核心差距**：
1. **无流水线概念**：generation-scheduler.ts 是一个顺序 for 循环，Agent 仅在生成后以独立阶段运行，不在统一管道中
2. **无上下文治理**：缺乏 Composer 阶段（ContextPackage / RuleStack / ChapterMemo）
3. **无审计-修订循环**：sentinel 只做布尔判定（通过/不通过），没有评分 + 修订 + 重评的闭环
4. **无状态沉淀**：extractor 是一次性抽取，不维护 Truth Files（当前状态、伏笔池、章节摘要等结构化文档）
5. **无长度治理**：字数严重偏离时无标准化机制

### 目标架构

```
PipelineRunner（新建）
├── Phase 0: prepareChapterInput  ← 输入治理
│   ├── ContextBuilder (增强现有 buildChapterContext)
│   └── RuleStackBuilder (新增)
├── Phase 1: PlannerAgent        ← 细化大纲 + 生成 ChapterMemo
├── Phase 2: ComposerAgent       ← 组装上下文包（新增）
├── Phase 3: WriterAgent         ← 撰写草稿（增强现有）
├── Phase 4: LengthNormalizerAgent← 字数标准化（新增）
├── Phase 5: ContinuityAuditor   ← 33维审计（新增）
├── Phase 6: ReviserAgent        ← 自动修订（新增）
├── Phase 7: StateSettler        ← 状态沉淀（重构 extractor）
├── Phase 8: ChapterAnalyzer     ← 章节摘要生成（新增）
└── Phase 9: HookPromoter        ← 伏笔升级检查（新增）
```

---

## P0-1 升级为 10-Agent 自动流水线

### 1.1 Agent 职责定义

#### 1.1.1 PlannerAgent（规划师）— 增强现有

**职责**：根据项目大纲、前文摘要、伏笔池，生成当前章的详细执行计划（ChapterIntent + ChapterMemo）。

**输入接口**：
```typescript
interface PlanChapterInput {
  project: Project               // 项目全局信息
  chapterNumber: number          // 当前章节号
  previousEndingExcerpt?: string // 上一章尾段摘录（≤500字）
  externalContext?: string       // 用户方向指导
  hookPool: HookEntry[]          // 活跃伏笔列表
  recentSummaries: string[]      // 最近5章摘要
}
```

**输出接口**：
```typescript
interface PlanChapterOutput {
  intent: ChapterIntent    // 结构化意图（goal + mustKeep + mustAvoid + styleEmphasis）
  memo: ChapterMemo        // 7段执行备忘录
  intentMarkdown: string   // 用于传递给下游的文本形式
}

interface ChapterIntent {
  chapter: number
  goal: string              // ≤50字，具体任务陈述
  mustKeep: string[]        // 本章必须保留的元素
  mustAvoid: string[]       // 本章必须回避的元素
  styleEmphasis: string[]   // 文风强调点
  outlineReference?: string // 大纲原文引用
}

interface ChapterMemo {
  goal: string                  // LLM 生成的具体目标（≤50字）
  currentTasks: string          // 当前章节任务
  payoffOrHold: string          // 该兑现/暂不掀
  dailyTransitionFunction: string // 日常/过渡章节功能
  threeQuestionCheck: string    // 关键抉择三连问
  chapterEndChanges: string     // 章尾必须发生的改变
  hardDonts: string             // 绝对不要做
  bodySkeleton: string          // 骨架正文结构
}
```

**状态流转**：`pending → planning → planned → consumed`

**错误处理**：
- Memo 解析失败：最多重试 3 次，每次注入解析错误反馈给 LLM 自我修正
- 3 次后仍失败：降级使用 outline 原文作为 memo，标记 `degraded: true`

**变更范围**：改造现有 `src/agents/PlannerAgent.ts`，新增 memo 生成与解析能力

---

#### 1.1.2 ComposerAgent（作曲师）— 新增

**职责**：根据 Planner 的输出，从项目的 Truth Files 和记忆库中组装最优上下文包（ContextPackage），构建 RuleStack，决定哪些伏笔/摘要/角色矩阵片段需要纳入本章上下文。

**输入接口**：
```typescript
interface ComposeChapterInput {
  project: Project
  chapterNumber: number
  plan: PlanChapterOutput
  hookPool: HookEntry[]
  chapterSummaries: string
  characterMatrix: string
  emotionalArcs: string
  subplotBoard: string
  entityGraph: Entity[]        // 来自 SandboxStore
  stateEvents: StateEvent[]    // 来自 SandboxStore
}
```

**输出接口**：
```typescript
interface ComposeChapterOutput {
  contextPackage: ContextPackage   // 精选上下文（≤budget 字符）
  ruleStack: RuleStack             // 规则栈（禁止事项 + 必须保留）
  trace: ComposeTrace              // 决策追踪日志
}

interface ContextPackage {
  chapter: number
  storyBible: string         // ≤14000 chars
  currentState: string       // ≤7000 chars
  hookSnapshot: string       // ≤9000 chars
  chapterSummaries: string   // ≤9000 chars
  characterMatrix: string    // ≤12000 chars
  emotionalArcs: string      // ≤7000 chars
  subplotBoard: string       // ≤7000 chars
  volumeOutline: string      // ≤12000 chars
  recentChapters: string[]   // 最近3章正文摘录
  selectedEntities: string   // 关键实体卡片
}

interface RuleStack {
  genreRules: string[]       // 类型规则
  bookRules: string[]        // 项目自定义规则
  prohibitions: string[]     // 禁止事项
  styleGuide: string         // 文风指南
}
```

**上下文预算控制**：
- 总预算由 `project.config.advancedSettings.maxContextTokens` 决定（默认 128K tokens）
- 每个 context block 有独立的字符上限（参考 InkOS LEGACY_WRITER_CONTEXT_BUDGET）
- 超限时按重要性裁剪，输出 `warnings` 通知

**新增文件**：
- `src/agents/ComposerAgent.ts`
- `src/utils/contextAssembler.ts`（上下文组装工具）
- `src/utils/ruleStackBuilder.ts`

---

#### 1.1.3 WriterAgent（写手）— 重构现有

**职责**：根据 Composer 提供的完整上下文包，撰写章节正文。分为两个子阶段：
1. **Creative Phase**：自由创作，产出初稿
2. **Settle Phase**：撰写状态变更（本章新增/修改的设定、伏笔、关系变化）

**输入变更**：从直接读取 project 数据改为接收 `ContextPackage` + `RuleStack`

```typescript
interface WriteChapterInput {
  project: Project
  chapterNumber: number
  title: string
  contextPackage: ContextPackage   // 从 Composer 接收
  ruleStack: RuleStack             // 从 Composer 接收
  memo: ChapterMemo                // 从 Planner 接收
  lengthSpec: LengthSpec            // 目标字数规格
  temperatureOverride?: number     // 温度覆盖（重试时升高）
}
```

**输出接口**：
```typescript
interface WriteChapterOutput {
  content: string              // 章节正文
  title: string                // 章节标题
  wordCount: number            // 实际字数
  chapterSummary: string       // 本章摘要（Writer 自行生成）
  stateChanges: StateChange[]  // 状态变更清单（Settle 子阶段产出）
  postWriteErrors: PostWriteViolation[] // 格式/结构校验错误
  tokenUsage: TokenUsage
}

interface StateChange {
  type: 'entity_add' | 'entity_update' | 'relation_change' | 'hook_planted' | 'hook_resolved' | 'location_change' | 'event_record'
  entityId?: string
  description: string
  chapterNumber: number
}
```

**状态流转**：`composing → writing → settling → written`

**错误处理**：
- 流式生成失败：降级为非流式模式重试 1 次
- 内容为空：立即重试，温度 +0.1
- 格式违规（post-write validation）：交给 Reviser 修复

**变更范围**：重构 `src/services/generation-scheduler.ts` 中的写作逻辑，提取为独立 `WriterAgent`

---

#### 1.1.4 LengthNormalizerAgent（字数标准化器）— 新增

**职责**：当章节字数超出硬范围时，通过 LLM 修正（压缩或扩展）到目标区间。

**输入接口**：
```typescript
interface NormalizeLengthInput {
  content: string
  lengthSpec: LengthSpec
  chapterIntent?: string
}

interface LengthSpec {
  target: number        // 目标字数
  softMin: number       // 软下限（target * 0.85）
  softMax: number       // 软上限（target * 1.15）
  hardMin: number       // 硬下限（target * 0.7）
  hardMax: number       // 硬上限（target * 1.5）
  countingMode: 'chars' | 'words'  // 中文按字符，英文按单词
}
```

**输出接口**：
```typescript
interface NormalizeLengthOutput {
  normalizedContent: string
  finalCount: number
  applied: boolean
  mode: 'compress' | 'expand' | 'none'
  warning?: string
  tokenUsage: TokenUsage
}
```

**处理逻辑**：
- 字数在硬范围外 → 触发 normalize
- `compress`：超出硬上限时压缩
- `expand`：低于硬下限时扩展
- 保护：不引入新支线、不改变事实

**新增文件**：
- `src/agents/LengthNormalizerAgent.ts`
- `src/utils/lengthMetrics.ts`

---

#### 1.1.5 ContinuityAuditor（连续性审计员）— 新增

**职责**：对章节正文进行 33 维度的质量审计，输出结构化的 AuditResult（包含评分、问题清单）。

**完整审计维度**（参考 InkOS continuity.ts）：

| 编号 | 维度名称 | 级别 | 说明 |
|------|----------|------|------|
| 1 | OOC检查 | critical | 角色行为是否偏离人设 |
| 2 | 时间线检查 | critical | 时间线是否自洽 |
| 3 | 设定冲突 | critical | 是否与已有设定矛盾 |
| 4 | 战力崩坏 | critical | 力量体系是否合理 |
| 5 | 数值检查 | warning | 数值前后是否一致 |
| 6 | 伏笔检查 | warning | 悬而未决伏笔状态 |
| 7 | 节奏检查 | warning | 章节节奏是否单调 |
| 8 | 文风检查 | warning | 是否偏离项目文风 |
| 9 | 信息越界 | critical | 是否泄露未来信息 |
| 10 | 词汇疲劳 | info | 高频词/标记词密度 |
| 11 | 配角降智 | warning | 配角行为是否合理 |
| 12 | 套话密度 | info | AI 标记词/套话密度 |
| 13 | 段落等长 | info | 段落长度是否均匀 |
| 14 | 视角一致性 | warning | POV 是否一致 |
| 15 | 章节备忘偏离 | critical | 是否偏离 ChapterMemo |
| 16 | 格式违规 | critical | 章节格式是否规范 |

**输入接口**：
```typescript
interface AuditChapterInput {
  bookDir: string              // 项目数据目录
  chapterContent: string       // 待审计正文
  chapterNumber: number
  contextPackage?: ContextPackage
  ruleStack?: RuleStack
  memo?: ChapterMemo
  genre?: string               // 类型（用于加载 GenreProfile）
  temperature?: number
}
```

**输出接口**：
```typescript
interface AuditResult {
  passed: boolean              // 是否通过门控
  overallScore: number         // 0-100 综合评分
  issues: AuditIssue[]
  summary: string              // 审计摘要
  dimensionScores: Record<string, number>  // 各维度分项评分
  tokenUsage: TokenUsage
}

interface AuditIssue {
  severity: 'critical' | 'warning' | 'info'
  category: string             // 维度名称
  description: string          // 问题描述
  suggestion: string           // 修复建议
  affectedParagraphs?: number[] // 涉及段落索引
}
```

**审计 Prompt 构建**：
- System Prompt：包含角色设定、审计维度清单及各维度详细检查指令
- User Prompt：包含正文内容 + 上下文证据块（当前状态、伏笔池、角色矩阵、章节摘要等）
- 每个维度使用 `dimensionName` + `dimensionNote` 构建详细的检查指引
- 输出要求 LLM 返回结构化 JSON

**新增文件**：
- `src/agents/ContinuityAuditor.ts`
- `src/utils/auditDimensions.ts`（维度定义与 prompt 构建）

---

#### 1.1.6 ReviserAgent（修订师）— 新增

**职责**：根据审计结果，对章节正文进行定点修复或全面修订。

**修订模式**：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| auto | 自动选择策略 | 默认模式 |
| polish | 润色：只改表达，不改事实 | 文风问题、套话密度 |
| rewrite | 改写：重组问题段落 | 节奏、逻辑问题 |
| spot-fix | 定点修复：仅修改问题句段 | 小范围问题 |
| anti-detect | 反检测改写 | AI 检测率高 |

**输入接口**：
```typescript
interface ReviseChapterInput {
  content: string               // 原始正文
  chapterNumber: number
  issues: AuditIssue[]          // 审计发现的问题
  mode: ReviseMode
  contextPackage?: ContextPackage
  ruleStack?: RuleStack
  memo?: ChapterMemo
  lengthSpec?: LengthSpec
}
```

**输出接口**：
```typescript
interface ReviseOutput {
  revisedContent: string        // 修订后正文
  wordCount: number
  fixedIssues: string[]         // 已修复的问题列表
  tokenUsage: TokenUsage
}
```

**修订策略**：
- `auto` 模式下，根据 issue severity 分级：
  - `critical`：必须修复
  - `warning`：应当改善
  - `info`：参考建议
- 将分级后的 issue list 注入修订 prompt
- 保护：保留章节原有事实、关键钩子、角色名

**新增文件**：
- `src/agents/ReviserAgent.ts`
- `src/utils/reviseModeRouter.ts`

---

#### 1.1.7 StateSettler（状态沉淀器）— 重构现有 ExtractorAgent

**职责**：根据 Writer 的 StateChange 清单和正文内容，更新项目的 Truth Files（SandboxStore 中的 Entity 和 StateEvent）。

**输入接口**：
```typescript
interface SettleStateInput {
  project: Project
  chapter: Chapter
  stateChanges: StateChange[]    // 来自 Writer
  content: string                // 正文（用于二次抽取验证）
}
```

**输出接口**：
```typescript
interface SettleStateOutput {
  newEntities: Entity[]
  updatedEntities: Entity[]
  newStateEvents: StateEvent[]
  updatedTruthFiles: {
    currentState: string         // 更新后的当前状态摘要
    hookPool: HookEntry[]        // 更新后的伏笔池
    chapterSummary: string       // 章节摘要追加
  }
}
```

**处理逻辑**：
1. 消费 Writer 产出的 `stateChanges`
2. 对照正文进行二次验证（防止 Writer 幻觉）
3. 增量更新 Entity（新增/更新角色、势力、地点等）
4. 增量更新 StateEvent（关系变化、事件记录等）
5. 更新结构化 Truth Files

**变更范围**：重构 `src/agents/ExtractorAgent.ts`，从一次性抽取改为增量沉淀

---

#### 1.1.8 ChapterAnalyzer（章节分析器）— 增强现有

**职责**：从正文和状态变更中生成结构化章节摘要、伏笔追踪、情感弧线更新。

**输出**：
```typescript
interface ChapterAnalysisOutput {
  chapterSummary: string         // 结构化章节摘要（≤500字）
  hookUpdates: HookUpdate[]      // 伏笔状态更新
  emotionalArcUpdate: string     // 情感弧线追加
  subplotUpdate: string          // 支线状态更新
}
```

**变更范围**：新增 `src/agents/ChapterAnalyzer.ts`，或增强现有 editor agent 的分析能力

---

#### 1.1.9 HookPromoter（伏笔升级器）— 新增

**职责**：检查伏笔池中是否有伏笔满足升级条件（如已埋设超过 N 章未回收、已达到核心伏笔阈值等），更新伏笔状态标记。

**处理逻辑**：
- 解析伏笔池 markdown 表格
- 基于章节摘要计算每个伏笔的 advanced_count
- 符合条件的伏笔标记 `promoted: true`
- 纯确定性逻辑，无 LLM 调用

**新增文件**：`src/agents/HookPromoter.ts`（或合并到 ChapterAnalyzer）

---

#### 1.1.10 PostWriteValidator（写后校验器）— 新增

**职责**：确定性规则校验，不依赖 LLM。

**检查项**：
- 章节标题重复检测
- 段落长度异常检测
- AI 标记词密度检测（仿佛、不禁、宛如、竟然、忽然、猛地）
- 敏感词检测
- 章节引用完整性（是否引用了不存在的角色/设定）

**输出**：`AuditIssue[]`，合并到审计结果中

**新增文件**：`src/utils/postWriteValidator.ts`

---

### 1.2 PipelineRunner — 流水线编排器

#### 1.2.1 核心设计

```typescript
class PipelineRunner {
  private agents: Map<string, BaseAgent>
  private config: PipelineConfig

  /**
   * 执行完整的单章写作流水线
   * 返回 ChapterPipelineResult
   */
  async writeNextChapter(options: WriteNextChapterOptions): Promise<ChapterPipelineResult>
}
```

**Pipeline 阶段流程**：

```
输入: project, chapterNumber, externalContext?
  │
  ▼
[Phase 0] prepareChapterInput
  │ 构建 ContextBuilder 输入
  ▼
[Phase 1] PlannerAgent.planChapter()
  │ → PlanChapterOutput { intent, memo }
  ▼
[Phase 2] ComposerAgent.composeChapter()
  │ → ComposeChapterOutput { contextPackage, ruleStack, trace }
  ▼
[Phase 3] WriterAgent.writeChapter()
  │ → WriteChapterOutput { content, title, wordCount, stateChanges }
  ▼
[Phase 4] LengthNormalizerAgent.normalizeChapter()
  │ → normalizedContent (if needed)
  ▼
[Phase 5] ContinuityAuditor.auditChapter()
  │ → AuditResult { passed, score, issues }
  ▼
[Phase 6] ReviserAgent.reviseChapter()  ← 仅在未通过时执行
  │ → revisedContent
  │ （回到 Phase 5 重新审计，最多 N 轮）
  ▼
[Phase 7] StateSettler.settleState()
  │ → 更新 Entity + StateEvent + TruthFiles
  ▼
[Phase 8] ChapterAnalyzer.analyzeChapter()
  │ → chapterSummary + hookUpdates + emotionalArcs
  ▼
[Phase 9] HookPromoter.promoteHooks()
  │ → 更新伏笔池
  ▼
输出: ChapterPipelineResult { chapterNumber, title, wordCount, auditResult, status }
```

#### 1.2.2 接口定义

```typescript
interface PipelineConfig {
  maxAuditRetries: number          // 审计-修订最大轮次，默认 1
  passScoreThreshold: number       // 通过分数线，默认 85
  netImprovementEpsilon: number    // 最小净提升分，默认 3
  temperatureBase: number          // 基础温度，默认 0.7
  temperatureRetryStep: number     // 重试温度步长，默认 0.1
  maxTemperature: number           // 最大温度，默认 1.2
  enableLengthNormalization: boolean // 是否启用字数标准化，默认 true
  enableHookPromotion: boolean     // 是否启用伏笔升级，默认 true
  onStageProgress?: (stage: string, detail: string) => void  // 进度回调
  onAgentTrace?: (trace: AgentTraceEvent) => void             // Agent 追踪回调
}

interface WriteNextChapterOptions {
  project: Project
  chapterNumber: number
  externalContext?: string         // 用户方向指导
  wordCountOverride?: number       // 字数覆盖
  temperatureOverride?: number     // 温度覆盖
}

interface ChapterPipelineResult {
  chapterNumber: number
  title: string
  wordCount: number
  auditResult: AuditResult
  revised: boolean                 // 是否经过修订
  postReviseCount: number          // 修订后字数
  status: 'ready-for-review' | 'audit-failed' | 'state-degraded'
  tokenUsage: TokenUsageSummary    // 全流程 token 消耗汇总
  durationMs: number               // 总耗时
  stageTimings: Record<string, number>  // 各阶段耗时
}
```

#### 1.2.3 错误处理策略

| 阶段 | 错误类型 | 处理方式 |
|------|----------|----------|
| Planner | Memo 解析失败 | 重试 3 次 → 降级使用 outline |
| Composer | 上下文超限 | 自动裁剪 + 警告 |
| Writer | 流式失败 | 降级非流式 → 重试 1 次 |
| Writer | 内容为空 | 温度 +0.1 → 重试 |
| Normalizer | 修正后更差 | 回滚到修正前内容 |
| Auditor | LLM 调用失败 | 跳过审计，标记 `audit-skipped` |
| Reviser | 修订无改善 | 保留当前最优版本，退出循环 |
| Settler | 更新失败 | 记录警告，不阻断流水线 |

#### 1.2.4 实现步骤

1. **新建 PipelineRunner 类**（`src/services/pipeline/PipelineRunner.ts`）
   - 编排 10 个 Agent 的调用顺序
   - 管理 audit-revise 循环
   - 汇总 token 消耗
   - 进度回调

2. **新建 Pipeline 类型定义**（`src/services/pipeline/types.ts`）
   - PipelineConfig, ChapterPipelineResult, TokenUsageSummary 等

3. **适配现有 Agent 接口**（`src/agents/types.ts`）
   - 扩展 AgentRole 枚举：新增 `'composer' | 'auditor' | 'reviser' | 'normalizer' | 'settler' | 'analyzer' | 'hook-promoter' | 'post-write-validator'`
   - 扩展 AgentPhase 枚举：新增 `'composition' | 'audit' | 'revise' | 'settlement'`

4. **重构 generation-scheduler.ts**
   - 将核心写作循环替换为 PipelineRunner 调用
   - 保留 BatchGenerationOptions 接口兼容性
   - 将 Agent 配置和启用控制统一收归 PipelineConfig

#### 1.2.5 涉及文件清单

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `src/services/pipeline/PipelineRunner.ts` | 新建 | 流水线编排器核心 |
| `src/services/pipeline/types.ts` | 新建 | Pipeline 相关类型定义 |
| `src/services/pipeline/contextAssembler.ts` | 新建 | 上下文组装工具 |
| `src/agents/ComposerAgent.ts` | 新建 | 作曲师 Agent |
| `src/agents/ContinuityAuditor.ts` | 新建 | 连续性审计 Agent |
| `src/agents/ReviserAgent.ts` | 新建 | 修订 Agent |
| `src/agents/LengthNormalizerAgent.ts` | 新建 | 字数标准化 Agent |
| `src/agents/ChapterAnalyzer.ts` | 新建 | 章节分析 Agent |
| `src/agents/HookPromoter.ts` | 新建 | 伏笔升级 Agent |
| `src/utils/postWriteValidator.ts` | 新建 | 写后确定性校验 |
| `src/utils/auditDimensions.ts` | 新建 | 审计维度定义与 prompt |
| `src/utils/lengthMetrics.ts` | 新建 | 字数计算工具 |
| `src/utils/reviseModeRouter.ts` | 新建 | 修订模式路由 |
| `src/agents/PlannerAgent.ts` | 修改 | 增加 memo 生成能力 |
| `src/agents/ExtractorAgent.ts` | 修改 | 重构为 StateSettler |
| `src/agents/types.ts` | 修改 | 扩展角色和阶段枚举 |
| `src/services/generation-scheduler.ts` | 修改 | 替换核心循环为 Pipeline 调用 |
| `src/stores/ai.ts` | 修改 | 支持多模型路由（审计/修订可选不同模型） |
| `src/types/index.ts` | 修改 | 新增 Truth Files 相关类型 |

#### 1.2.6 预估工作量

| 子任务 | 工作量 |
|--------|--------|
| PipelineRunner 编排器 | 3 人日 |
| PlannerAgent 增强（memo） | 2 人日 |
| ComposerAgent 新增 | 3 人日 |
| WriterAgent 重构 | 2 人日 |
| LengthNormalizerAgent | 1.5 人日 |
| ContinuityAuditor（33维） | 4 人日 |
| ReviserAgent | 2 人日 |
| StateSettler 重构 | 2 人日 |
| ChapterAnalyzer | 1.5 人日 |
| HookPromoter + PostWriteValidator | 1 人日 |
| 类型定义与接口适配 | 1 人日 |
| 单元测试 | 3 人日 |
| 集成测试与调试 | 2 人日 |
| **合计** | **28 人日** |

---

## P0-2 自动审稿门控（Audit-Review Cycle）

### 2.1 设计概述

参考 InkOS 的 `chapter-review-cycle.ts`，实现 **「审计 → 修订 → 重评」** 的自动化循环。核心机制：
- 每章生成后自动触发审计
- 审计未通过 → 自动修订 → 重评
- 循环终止后选择最优快照版本
- 支持快照回滚（修复变差时回退到更优版本）

### 2.2 审计 Agent 评分标准和输出格式

#### 2.2.1 评分体系

**总体评分**：0-100 分整数

**评分区间语义**：
- **90-100**：优秀，可直接发布
- **85-89**：良好，通过门控
- **70-84**：需要修订，自动修复
- **<70**：严重问题，需要重写

**门控通过条件**（必须同时满足）：
1. `auditResult.passed === true`（无 critical 级别问题）
2. `overallScore >= 85`（PASS_SCORE_THRESHOLD）
3. 字数在硬范围内（LengthSpec.hardMin ≤ wordCount ≤ LengthSpec.hardMax）
4. 无阻断级敏感词

#### 2.2.2 审计输出格式

```typescript
interface AuditResult {
  passed: boolean
  overallScore: number          // 0-100
  issues: AuditIssue[]          // 所有发现的问题
  summary: string               // 一段话审计摘要
  dimensionScores: {            // 各维度分项
    ooc: number                 // OOC检查 (0-100)
    timeline: number            // 时间线 (0-100)
    lore: number                // 设定冲突 (0-100)
    pacing: number              // 节奏 (0-100)
    style: number               // 文风 (0-100)
    hooks: number               // 伏笔 (0-100)
    memo: number                // Memo遵守 (0-100)
    [dimension: string]: number
  }
  tokenUsage: TokenUsage
}
```

#### 2.2.3 审计 Prompt 策略

**System Prompt 结构**：
```
你是一位专业的网络小说质量审计员。请对以下章节进行多维度质量审计。

## 审计维度清单
1. OOC检查 (权重: 高) — [详细检查指引]
2. 时间线检查 (权重: 高) — [详细检查指引]
...

## 输出格式
严格返回 JSON，包含：
- overallScore: 0-100 整数
- passed: boolean（score >= 85 且无 critical 问题时为 true）
- issues: [{ severity, category, description, suggestion }]
- summary: 一句话审计总结
```

**User Prompt 结构**：
```
## 项目设定
{storyBible 摘录}

## 当前状态
{currentState}

## 伏笔池
{hookSnapshot}

## 角色矩阵
{characterMatrix}

## 章节备忘
{memo}

## 待审计正文
{chapterContent}
```

**辅助审计**（确定性，不依赖 LLM）：
- AI 标记词密度检测 → 合并为 `info` 级 issue
- 敏感词扫描 → 阻断级（`block`）提升为 `critical`
- 段落长度均匀度检测 → 合并为 `info` 级 issue
- 标题重复检测 → `warning` 级 issue

### 2.3 修订 Agent 修订策略

#### 2.3.1 自动模式（auto）策略

```
1. 将 issues 按 severity 分级：
   - Critical（必须解决）: 3 条以内，全量注入
   - High（应当改善）: 5 条以内，全量注入
   - Medium（参考建议）: 3 条以内，摘要注入

2. 构建修订 prompt：
   System: 你是章节修订师，以下是需要修复的问题...
   User:
     ## 待修订正文
     {content}
     ## 待修复问题（分级）
     {tieredIssueList}
     ## 修订规则
     1. 必须修复所有 Critical 问题
     2. 尝试改善 High 问题
     3. 参考 Medium 建议
     4. 保留原有事实、人名、关键钩子
     5. 不引入新的支线或揭示

3. 输出修订后完整正文
```

#### 2.3.2 定点修复模式（spot-fix）

```
对每个 issue 提取 affectedParagraphs，
仅允许修改问题句段及前后各一句，
其余内容原封不动。
```

#### 2.3.3 反检测模式（anti-detect）

```
在保持剧情不变的前提下降低 AI 检测性：
- 打破句式规律
- 口语化替代
- 减少"了"字密度
- 转折词降频
- 情绪外化
- 消灭叙述者结论
- 群像反应具体化
- 段落长度差异化
- 消灭 AI 标记词
```

### 2.4 循环终止条件和回滚机制

#### 2.4.1 循环控制

```typescript
const DEFAULT_MAX_REVIEW_ITERATIONS = 1    // 默认最多修订 1 轮
const PASS_SCORE_THRESHOLD = 85            // 通过分数线
const NET_IMPROVEMENT_EPSILON = 3          // 最小净提升分
```

**循环逻辑**：
```
snapshots = []

1. initial = assess(draft)
   snapshots.push({ content: draft, score: initial.score })

2. if isPassed(initial):
     → 结束，使用 draft

3. for iteration in 1..maxReviewIterations:
     revised = reviser.revise(draft, issues)
     assessment = assess(revised)
     snapshots.push({ content: revised, score: assessment.score })

     if isPassed(assessment):
       → 结束，使用 revised

     if assessment.score >= current.score + EPSILON:
       → 分数提升了，继续下一轮
     else:
       → 没有净提升，退出循环

4. 选择 snapshots 中最高分版本
5. 如果最高分版本 ≠ 当前版本，回滚到最高分版本
```

#### 2.4.2 快照回滚机制

```typescript
interface ReviewSnapshot {
  content: string
  wordCount: number
  auditResult: AuditResult
  score: number
}

// 在所有修订轮次完成后
const bestSnapshot = snapshots.reduce((best, snap) =>
  snap.score >= best.score + NET_IMPROVEMENT_EPSILON ? snap : best
)

// 如果最佳版本与最终版本不同，回滚
if (bestSnapshot.content !== finalContent) {
  finalContent = bestSnapshot.content
  auditResult = bestSnapshot.auditResult
}
```

#### 2.4.3 温度控制策略

```typescript
// 修订时使用较低温度（更保守）
temperature = 0  // 修订阶段固定低温

// 写作重试时逐步升温
temperature = base + failures * step  // base=0.7, step=0.1
// 上限: 1.2
```

#### 2.4.4 终止条件汇总

| 条件 | 动作 |
|------|------|
| score >= 85 且 passed 且字数合规 | 通过，进入落盘 |
| 达到 maxReviewIterations | 退出循环，选最优快照 |
| 修订后无净提升（<3分） | 退出循环，选最优快照 |
| 修订后内容为空 | 退出循环，使用修订前版本 |
| 敏感词阻断 | 立即失败，不进入修订 |
| critical 级 post-write 违规 | 立即失败 |

### 2.5 涉及文件清单

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `src/services/pipeline/ChapterReviewCycle.ts` | 新建 | 审计-修订循环引擎 |
| `src/agents/ContinuityAuditor.ts` | 新建 | 审计 Agent（同 P0-1） |
| `src/agents/ReviserAgent.ts` | 新建 | 修订 Agent（同 P0-1） |
| `src/utils/auditDimensions.ts` | 新建 | 维度定义 |
| `src/utils/postWriteValidator.ts` | 新建 | 确定性校验 |
| `src/utils/aiTellAnalyzer.ts` | 新建 | AI 标记词分析 |
| `src/utils/sensitiveWordChecker.ts` | 新建 | 敏感词检查 |
| `src/utils/lengthMetrics.ts` | 新建 | 字数计算（同 P0-1） |

### 2.6 预估工作量

| 子任务 | 工作量 |
|--------|--------|
| ChapterReviewCycle 引擎 | 2 人日 |
| 审计 Prompt 设计与调优 | 3 人日 |
| 修订 Prompt 设计与调优 | 2 人日 |
| 确定性校验器 | 1.5 人日 |
| AI 标记词 + 敏感词分析器 | 1 人日 |
| 快照回滚机制 | 0.5 人日 |
| 集成测试 | 2 人日 |
| **合计** | **12 人日** |

---

## P0-3 一键续写 N 章

### 3.1 设计概述

将现有的 `BatchGenerationOptions` + `GenerationScheduler.executeBatchGeneration` 升级为基于 Pipeline 的全自动续写能力。用户只需指定续写章数和可选的方向指导，系统自动完成从规划到落盘的全流程。

### 3.2 用户交互流程

#### 3.2.1 入口设计

**触发位置**：`Chapters.vue` 组件中的「批量生成」按钮（现有）升级为「一键续写」

**交互 Dialog**：

```typescript
interface ContinueWritingOptions {
  chapterCount: number           // 续写章数 (1-100, 默认 10)
  directionPrompt?: string       // 可选的方向指导
  checkpointInterval?: number    // 断点间隔 (0=不断点, 默认 0)
  autoSave: boolean              // 是否自动保存 (默认 true)
}
```

**UI 组件**：
```
┌─────────────────────────────────────────────┐
│  ✍️ 一键续写                                  │
│                                              │
│  续写章数: [====10====] 1~100               │
│                                              │
│  方向指导 (可选):                              │
│  ┌─────────────────────────────────────┐     │
│  │ 本段剧情以主角在迷雾森林的冒险为      │     │
│  │ 主线，需要引入新的反派角色...          │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ☑ 每章完成后自动保存                         │
│  ☐ 每 N 章暂停审查 (N=[5])                   │
│                                              │
│  [取消]                          [开始续写]   │
└─────────────────────────────────────────────┘
```

#### 3.2.2 进度展示

**实时进度面板**（复用 `TaskManager` 现有机制）：

```
┌─────────────────────────────────────────────┐
│  📝 批量续写进行中... (3/10)                   │
│                                              │
│  ████████░░░░░░░░░░░░░░░░░░ 30%             │
│                                              │
│  当前: 第 15 章                                │
│  阶段: 审计修订 (第 1/1 轮)                    │
│  耗时: 2m 15s                                │
│  Token: 12,500 / 预算 150,000                │
│                                              │
│  已完成:                                      │
│  ✅ 第 13 章 (2,150字, 评分 92)              │
│  ✅ 第 14 章 (1,980字, 评分 88)              │
│  🔄 第 15 章 (审计中...)                      │
│                                              │
│  [暂停]  [取消]                               │
└─────────────────────────────────────────────┘
```

**每个 Agent 阶段的实时反馈**：
```typescript
interface PipelineProgressEvent {
  type: 'stage-start' | 'stage-complete' | 'chapter-complete' | 'batch-complete' | 'error'
  chapterNumber: number
  stage?: string           // 当前阶段名
  stageDetail?: string     // 阶段详情
  progress: number         // 0-100 整体进度
  auditScore?: number      // 审计评分
  wordCount?: number       // 字数
  tokenUsage?: number      // 当前章 token 消耗
  totalTokenUsage?: number // 累计 token 消耗
  error?: string           // 错误信息
}
```

### 3.3 Pipeline 调度逻辑

#### 3.3.1 批量续写调度器

```typescript
class BatchContinueScheduler {
  private pipeline: PipelineRunner
  private currentRunId: number = 0

  async executeBatchContinue(
    options: ContinueWritingOptions
  ): Promise<BatchContinueResult> {
    this.currentRunId++
    const runId = this.currentRunId

    const results: ChapterPipelineResult[] = []
    let startChapter = project.chapters.length + 1

    for (let i = 0; i < options.chapterCount; i++) {
      // 检查取消
      if (this.isRunCancelled(runId)) break

      // 检查暂停
      await this.waitIfPaused(runId)

      const chapterNumber = startChapter + i

      // 断点检查
      if (options.checkpointInterval > 0
          && i > 0
          && i % options.checkpointInterval === 0) {
        const shouldContinue = await options.onCheckpoint?.(results)
        if (!shouldContinue) break
      }

      // 执行单章 Pipeline
      const result = await this.pipeline.writeNextChapter({
        project,
        chapterNumber,
        externalContext: options.directionPrompt,
      })

      results.push(result)

      // 发送进度事件
      this.emitProgress({
        type: 'chapter-complete',
        chapterNumber,
        auditScore: result.auditResult.overallScore,
        wordCount: result.wordCount,
        progress: Math.round(((i + 1) / options.chapterCount) * 100),
      })

      // 自动保存
      if (options.autoSave) {
        await this.persistChapter(result)
      }

      // 章间冷却（避免 API 限流）
      await this.cooldown(2000)
    }

    return { results, totalChapters: results.length }
  }
}
```

#### 3.3.2 大纲自动翻页

当续写章数超过现有大纲时，自动触发大纲扩展：

```typescript
// 在 Pipeline 的 prepareChapterInput 阶段
if (chapterNumber >= project.outline.chapters.length - 4) {
  // 触发大纲扩展（现有 extendOutlineWithLLM）
  const newOutlines = await extendOutlineWithLLM(project, chapterNumber, 20)
  project.outline.chapters.push(...newOutlines)
  await projectStore.saveCurrentProject()
}
```

#### 3.3.3 与现有系统的兼容

**保持兼容的接口**：
- `BatchGenerationOptions` → 新增 `usePipeline: boolean` 选项
- `GenerationScheduler.executeBatchGeneration` → 内部根据 `usePipeline` 路由到新旧逻辑
- 默认 `usePipeline: true`（新逻辑）

**渐进式迁移**：
1. Phase 1：新增 Pipeline 路径，`usePipeline: false` 默认
2. Phase 2：切换为 `usePipeline: true` 默认
3. Phase 3：移除旧路径

### 3.4 中断/恢复机制

#### 3.4.1 暂停/恢复

```typescript
class BatchContinueScheduler {
  private paused = false
  private pauseResolver?: () => void

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.pauseResolver?.()
  }

  private async waitIfPaused(runId: number): Promise<void> {
    while (this.paused && !this.isRunCancelled(runId)) {
      await new Promise(resolve => {
        this.pauseResolver = resolve
        setTimeout(resolve, 1000)  // 超时安全网
      })
    }
  }
}
```

#### 3.4.2 取消与清理

```typescript
cancelBatch(): void {
  this.currentRunId++  // 使旧 runId 失效
  this.paused = false
  this.pauseResolver?.()
}
```

取消后的清理：
- 当前正在执行的 Agent 调用无法中断（LLM 请求），但完成后会检查 runId
- 已完成的章节保留（不回滚）
- TaskManager 标记任务为 "已取消"

#### 3.4.3 断点续写（Checkpoint）

```typescript
// 存储断点状态到 localStorage / IndexedDB
interface CheckpointState {
  projectId: string
  startChapter: number
  targetCount: number
  completedChapters: number[]
  lastCompletedChapter: number
  timestamp: number
}

// 恢复时
async function resumeFromCheckpoint(project: Project): Promise<void> {
  const checkpoint = await loadCheckpoint(project.id)
  if (checkpoint) {
    // 从 lastCompletedChapter + 1 继续
    const remainingCount = checkpoint.targetCount - checkpoint.completedChapters.length
    await batchContinueScheduler.executeBatchContinue({
      chapterCount: remainingCount,
      // ... 其他参数从 checkpoint 恢复
    })
  }
}
```

### 3.5 资源控制与安全

#### 3.5.1 Token 预算管理

```typescript
interface BatchBudgetConfig {
  maxTokenPerChapter: number     // 单章 token 上限，默认 150000
  maxTotalTokens: number         // 总 token 上限，默认 5000000
  maxCostUSD: number             // 总费用上限，默认 $5
  alertThreshold: number         // 预警阈值，默认 0.8
}
```

#### 3.5.2 限流保护

```typescript
// 章间冷却时间
const COOLDOWN_MS = 2000

// 失败重试
const MAX_RETRIES_PER_CHAPTER = 2
const RETRY_DELAY_MS = 5000

// 连续失败暂停
const PAUSE_AFTER_CONSECUTIVE_FAILURES = 3
```

#### 3.5.3 每日上限

```typescript
// 防止失控运行
const MAX_CHAPTERS_PER_DAY = 50

// 检查
if (dailyChapterCount >= MAX_CHAPTERS_PER_DAY) {
  pause('已达到每日生成上限')
}
```

### 3.6 涉及文件清单

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `src/services/pipeline/BatchContinueScheduler.ts` | 新建 | 批量续写调度器 |
| `src/services/pipeline/PipelineRunner.ts` | 新建 | 同 P0-1 |
| `src/services/pipeline/types.ts` | 修改 | 增加续写相关类型 |
| `src/services/pipeline/checkpointManager.ts` | 新建 | 断点管理 |
| `src/components/dialogs/ContinueWritingDialog.vue` | 新建 | 续写配置 Dialog |
| `src/components/panels/PipelineProgressPanel.vue` | 新建 | 流水线进度面板 |
| `src/components/Chapters.vue` | 修改 | 集成续写入口 |
| `src/services/generation-scheduler.ts` | 修改 | 增加 Pipeline 路径 |
| `src/stores/taskManager.ts` | 修改 | 支持 Pipeline 进度事件 |
| `src/stores/tokenUsage.ts` | 修改 | 支持批量 token 统计 |
| `src/utils/budgetGuard.ts` | 新建 | 预算守卫 |

### 3.7 预估工作量

| 子任务 | 工作量 |
|--------|--------|
| BatchContinueScheduler | 2 人日 |
| ContinueWritingDialog UI | 1.5 人日 |
| PipelineProgressPanel UI | 2 人日 |
| 断点管理 | 1 人日 |
| 预算守卫 | 1 人日 |
| 大纲自动翻页适配 | 0.5 人日 |
| 暂停/恢复/取消逻辑 | 1 人日 |
| 与现有 Scheduler 兼容层 | 1 人日 |
| 集成测试 | 2 人日 |
| **合计** | **12 人日** |

---

## 附录 A 涉及文件清单汇总

### 新建文件（19 个）

| # | 文件路径 | 所属 P0 项 |
|---|----------|-----------|
| 1 | `src/services/pipeline/PipelineRunner.ts` | P0-1 |
| 2 | `src/services/pipeline/types.ts` | P0-1 |
| 3 | `src/services/pipeline/contextAssembler.ts` | P0-1 |
| 4 | `src/services/pipeline/ChapterReviewCycle.ts` | P0-2 |
| 5 | `src/services/pipeline/BatchContinueScheduler.ts` | P0-3 |
| 6 | `src/services/pipeline/checkpointManager.ts` | P0-3 |
| 7 | `src/agents/ComposerAgent.ts` | P0-1 |
| 8 | `src/agents/ContinuityAuditor.ts` | P0-1/P0-2 |
| 9 | `src/agents/ReviserAgent.ts` | P0-1/P0-2 |
| 10 | `src/agents/LengthNormalizerAgent.ts` | P0-1 |
| 11 | `src/agents/ChapterAnalyzer.ts` | P0-1 |
| 12 | `src/agents/HookPromoter.ts` | P0-1 |
| 13 | `src/utils/postWriteValidator.ts` | P0-1/P0-2 |
| 14 | `src/utils/auditDimensions.ts` | P0-2 |
| 15 | `src/utils/lengthMetrics.ts` | P0-1 |
| 16 | `src/utils/reviseModeRouter.ts` | P0-2 |
| 17 | `src/utils/aiTellAnalyzer.ts` | P0-2 |
| 18 | `src/utils/sensitiveWordChecker.ts` | P0-2 |
| 19 | `src/utils/budgetGuard.ts` | P0-3 |

### 新建 UI 组件（2 个）

| # | 文件路径 | 所属 P0 项 |
|---|----------|-----------|
| 1 | `src/components/dialogs/ContinueWritingDialog.vue` | P0-3 |
| 2 | `src/components/panels/PipelineProgressPanel.vue` | P0-3 |

### 修改文件（9 个）

| # | 文件路径 | 所属 P0 项 | 变更说明 |
|---|----------|-----------|----------|
| 1 | `src/agents/PlannerAgent.ts` | P0-1 | 增加 memo 生成能力 |
| 2 | `src/agents/ExtractorAgent.ts` | P0-1 | 重构为 StateSettler |
| 3 | `src/agents/types.ts` | P0-1 | 扩展角色/阶段枚举 |
| 4 | `src/services/generation-scheduler.ts` | P0-1/P0-3 | 集成 Pipeline 路径 |
| 5 | `src/stores/ai.ts` | P0-1 | 多模型路由支持 |
| 6 | `src/types/index.ts` | P0-1 | Truth Files 类型 |
| 7 | `src/components/Chapters.vue` | P0-3 | 续写入口集成 |
| 8 | `src/stores/taskManager.ts` | P0-3 | Pipeline 进度事件 |
| 9 | `src/stores/tokenUsage.ts` | P0-3 | 批量 token 统计 |

---

## 附录 B 工作量预估总览

| P0 项 | 核心工作量 | 测试工作量 | 合计 |
|--------|-----------|-----------|------|
| P0-1: 10-Agent 流水线 | 22 人日 | 5 人日 | **28 人日** (含测试) |
| P0-2: 自动审稿门控 | 8 人日 | 4 人日 | **12 人日** (含测试) |
| P0-3: 一键续写 N 章 | 8 人日 | 4 人日 | **12 人日** (含测试) |
| **总计** | | | **~52 人日** |

> 注：P0-1 与 P0-2 有部分重叠（审计 Agent、修订 Agent），实际独立开发工作量约为 **42-45 人日**。

### 建议开发顺序

1. **第一步**：P0-1 的 Agent 基础设施（BaseAgent 增强、类型定义、PipelineRunner 骨架）
2. **第二步**：P0-2 的审计-修订循环（与 PipelineRunner 集成）
3. **第三步**：P0-1 的其余 Agent（Composer、Normalizer、Settler、Analyzer）
4. **第四步**：P0-3 的批量续写 UI 和调度逻辑
5. **第五步**：集成测试、性能优化、边界条件处理

---

> 本文档为 P0 阶段详细技术设计，供开发工程师评估工作量和编写实现代码使用。
