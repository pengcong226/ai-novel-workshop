# 项目当前状态评估报告

> ⚠️ **本文档已过时**。请参阅 v2.0 版本：[project-status-assessment-v2.md](./project-status-assessment-v2.md)
> 本文档中的以下结论已被后续迭代推翻：
> - "Phase 7-9未接入" → 已全部接入
> - "Pipeline测试覆盖为零" → 473个测试全通过
> - "as any仅8处" → 实际161处（后清理至36处）
> - "模板/导出/角色追踪/批量创作缺失" → 均已实现

> 评估日期：2026-05-28
> 评估者：产品经理
> 评估范围：P0~P3 阶段新增代码（约 7,237 行 Agent/Pipeline 代码 + 4,998 行 Vue 组件）
> 状态：待评审

---

## 一、评估总览

### 1.1 代码规模

| 模块 | 文件数 | 总行数 | 新建/改造 |
|------|--------|--------|-----------|
| Pipeline 服务层 | 8 | 3,246 | 全部新建 |
| Agent 层 | 12 | 3,991 | 10 新建 + 2 修改 |
| UI 组件层 | 8 | ~4,998 | 5 新建 + 3 大幅修改 |
| 类型定义 | 2 | ~500 | 扩展 |
| DaemonService | 1 | ~300 | 新建 |
| Worker | 1 | ~80 | 新建 |
| **合计** | **~32** | **~13,000+** | — |

### 1.2 总体评分

| 维度 | 评分 (1-10) | 说明 |
|------|-------------|------|
| 架构设计 | **9** | 10-Agent Pipeline 架构清晰，阶段分离合理 |
| 接口定义 | **8** | TypeScript 类型完整，输入输出接口规范 |
| 代码质量 | **6** | 存在 `as any` 滥用、TODO 遗留、错误处理不均 |
| 功能闭环 | **7** | Pipeline 主链路完整，Phase 7-9 未接入 |
| 测试覆盖 | **3** | Pipeline/新 Agent 测试严重缺失 |
| UX 完成度 | **7** | 入口和进度面板已就位，但新手引导缺失 |
| 文档覆盖 | **6** | 注释充分但无 API 文档和使用指南 |
| **综合** | **6.6** | 架构优秀但工程质量需加固 |

---

## 二、代码质量问题（按优先级排序）

### 🔴 P0-必须修复

#### 问题 1：Pipeline Phase 7-9 未实现（功能断裂）

**严重性**：功能闭环断裂

**现状**：`PipelineRunner.ts` 第 250-252 行明确标注了三个 TODO：
```typescript
// TODO: Phase 7 StateSettler — 重构 ExtractorAgent
// TODO: Phase 8 ChapterAnalyzer — 增强现有 editor
// TODO: Phase 9 HookPromoter — 伏笔升级检查
```

StateSettler（494行）、ChapterAnalyzer（158行）、HookPromoter（129行）三个 Agent 已完整实现，但 PipelineRunner 并未调用它们。这意味着：
- 审计通过后的章节**不会自动更新 Entity 和 StateEvent**
- **伏笔池不会自动更新**
- **章节摘要不会自动生成**
- 每章生成后项目的 Truth Files 处于停滞状态

**影响**：批量续写 10 章后，Sandbox 中的实体和关系不会自动更新，用户看到的角色/地点信息仍停留在续写前的状态。

**修复方案**：
1. 在 PipelineRunner 的 Phase 6（audit-revise 循环）后，接入 StateSettler.settle()
2. 在 settle 完成后调用 ChapterAnalyzer.analyzeChapter()
3. 最后执行 HookPromoter.promoteHooks()
4. 将三步的输出持久化到 SandboxStore

**预估工作量**：2 人日

---

#### 问题 2：Pipeline 未接入 GenerationScheduler 默认路径

**严重性**：功能不可达

**现状**：`generation-scheduler.ts` 中 Pipeline 模式默认**关闭**：
```typescript
private usePipeline = false  // feature flag，默认关闭
```

用户从 UI 触发的「一键续写」路径（`Chapters.vue` 第 755-762 行）确实会动态创建 PipelineRunner 和 BatchContinueScheduler，但常规的「单章生成」和旧的「批量生成」路径仍然走的是旧的 `executeBatchGeneration` 逻辑。

**影响**：Pipeline 体系虽然完整，但只有一键续写入口能触发；普通用户逐章生成时不会经过审计-修订循环。

**修复方案**：
1. 在项目配置中添加 `enablePipeline: boolean` 选项
2. 在 `GenerationScheduler` 中根据配置自动路由到 Pipeline 路径
3. 或者将审计-修订循环独立为后处理步骤，插入到旧路径中

**预估工作量**：1.5 人日

---

#### 问题 3：`as any` 类型逃逸（8 处）

**严重性**：类型安全隐患

**分布**：

| 文件 | 行号 | 代码 | 原因 |
|------|------|------|------|
| PipelineRunner.ts | 521 | `(project as any).plotEvents` | Project 类型缺少 plotEvents 字段 |
| PipelineRunner.ts | 587 | `(project as any)._entities` | 内部属性未暴露到类型 |
| PipelineRunner.ts | 591 | `(project as any)._stateEvents` | 同上 |
| ComposerAgent.ts | 283 | `(project as any)._entities` | 同上 |
| StateSettler.ts | 465 | `{ description: change.description } as any` | Entity 更新类型不匹配 |
| StateSettler.ts | 490 | `(project as any)._entities` | 同上 |
| StateSettler.ts | 521-524 | 多处 `(e: any)` | plotEvents 类型未定义 |
| pipelineWorker.ts | 全文 | `self as any`, `projectData: any` | Worker 类型声明缺失 |

**根因**：Project 类型定义中未包含 `_entities`、`_stateEvents`、`plotEvents` 等运行时附加字段。Agent 通过运行时注入访问这些数据，导致类型逃逸。

**修复方案**：
1. 在 `types/index.ts` 的 `Project` 接口中扩展 `runtime?: { entities?: Entity[]; stateEvents?: StateEvent[]; plotEvents?: PlotEvent[] }`
2. 或创建 `RuntimeProject extends Project` 接口
3. 消除所有 `as any` 断言

**预估工作量**：1 人日

---

### 🟡 P1-应当修复

#### 问题 4：Pipeline 测试覆盖为零

**现状统计**：

| 模块 | 测试文件 | 覆盖情况 |
|------|----------|----------|
| PipelineRunner | ❌ 无测试 | 0% |
| ChapterReviewCycle | ❌ 无测试 | 0% |
| BatchContinueScheduler | ❌ 无测试 | 0% |
| SnapshotManager | ❌ 无测试 | 0% |
| AuditResultAggregator | ❌ 无测试 | 0% |
| checkpointManager | ❌ 无测试 | 0% |
| ComposerAgent | ❌ 无测试 | 0% |
| ContinuityAuditor | ❌ 无测试 | 0% |
| ReviserAgent | ❌ 无测试 | 0% |
| StateSettler | ❌ 无测试 | 0% |
| ObserverAgent | ❌ 无测试 | 0% |
| LengthNormalizerAgent | ❌ 无测试 | 0% |
| HookPromoter | ❌ 无测试 | 0% |
| PostWriteValidator | ❌ 无测试 | 0% |

已有的 Agent 测试仅覆盖旧体系（AgentOrchestrator、PlannerAgent refinement），不涉及任何新建的 Pipeline 层。

**风险**：7,237 行新代码完全没有测试保障，后续修改极易引入回归。

**建议优先级**：
1. `ChapterReviewCycle` + `SnapshotManager`（核心循环逻辑，最容易出 bug）
2. `PipelineRunner`（集成层，mock 各 Agent 验证编排）
3. `ContinuityAuditor`（审计评分计算逻辑）
4. `BatchContinueScheduler`（取消/暂停/重试状态机）

**预估工作量**：5-7 人日

---

#### 问题 5：4 个 TODO 遗留的未完成代码

| # | 文件 | 行号 | TODO 内容 |
|---|------|------|-----------|
| 1 | PipelineRunner.ts | 250 | Phase 7 StateSettler 未接入 |
| 2 | PipelineRunner.ts | 251 | Phase 8 ChapterAnalyzer 未接入 |
| 3 | PipelineRunner.ts | 252 | Phase 9 HookPromoter 未接入 |
| 4 | ComposerAgent.ts | 303 | LLM 智能裁剪上下文（当前仅为确定性组装） |

**说明**：TODO 1-3 与问题 1 重复。TODO 4 意味着 ComposerAgent 目前只是简单的文本截断，没有使用 LLM 对上下文进行智能裁剪和优先级排序。这对于长篇小说（上下文超限时）的生成质量有负面影响。

---

#### 问题 6：checkpointManager 直接依赖 `window.localStorage`

**文件**：`src/services/pipeline/checkpointManager.ts`

**现状**：
```typescript
window.localStorage.setItem(STORAGE_KEY, JSON.stringify(allCheckpoints))
window.localStorage.getItem(STORAGE_KEY)
```

**问题**：
1. pipelineWorker.ts（Web Worker）中无法访问 `window.localStorage`
2. Tauri 环境中 localStorage 行为可能不一致
3. 项目已有 IndexedDB 存储层（storage.ts），checkpoint 应复用

**修复方案**：将 checkpoint 持久化迁移到 IndexedDB storage store，与项目其他数据统一管理。

**预估工作量**：0.5 人日

---

#### 问题 7：PipelineRunner 内 helper 方法过多，职责不聚焦

**现状**：PipelineRunner.ts 共 623 行，包含了大量数据提取 helper：
- `extractHookPool()` — 从 project 中提取伏笔
- `extractRecentSummaries()` — 提取近期摘要
- `extractCharacterMatrix()` — 提取角色矩阵
- `extractEmotionalArcs()` — 提取情感弧线
- `extractSubplotBoard()` — 提取支线面板
- `extractEntities()` — 提取实体
- `extractStateEvents()` — 提取状态事件
- `extractRecentChapters()` — 提取近章正文
- `extractPreviousEnding()` — 提取前章尾段

这些方法本质上是 **数据适配层**（从 Project 类型适配到 Pipeline 类型），应当独立为 `PipelineDataAdapter`。

**修复方案**：提取为 `src/services/pipeline/PipelineDataAdapter.ts`，PipelineRunner 只负责编排。

**预估工作量**：0.5 人日

---

### 🟢 P2-建议优化

#### 问题 8：新增 Agent 未纳入 DEFAULT_AGENT_CONFIGS

**文件**：`src/agents/types.ts`

**现状**：`DEFAULT_AGENT_CONFIGS` 仍只包含旧 5 个角色：
```typescript
export const DEFAULT_AGENT_CONFIGS: AgentConfig[] = [
  { role: 'planner', enabled: false, phase: 'pre-generation', priority: 1 },
  { role: 'sentinel', enabled: false, phase: 'post-generation', priority: 2 },
  { role: 'editor', enabled: true, phase: 'post-generation', priority: 5 },
  { role: 'reader', enabled: false, phase: 'post-generation', priority: 6 },
  { role: 'extractor', enabled: false, phase: 'post-generation', priority: 10 },
]
```

新增的 8 个角色（composer、auditor、reviser、normalizer、settler、analyzer、hook-promoter、post-write-validator）均未加入默认配置。用户无法通过 AgentConsole UI 控制它们。

**修复方案**：扩展 DEFAULT_AGENT_CONFIGS，将新 Agent 的默认优先级和启用状态纳入。

---

#### 问题 9：AgentConsole UI 未同步新角色

**现状**：`AgentConsole.vue` 仍只展示旧 5 个角色（规划师、哨兵、编辑审校、读者反馈、抽取器），新 Agent（审计员、修订师、作曲师等）在 UI 上不可见。

**影响**：用户无法感知 Pipeline 的 10 个 Agent 的运行状态和配置。

---

#### 问题 10：Pipeline 类型与旧类型存在冲突风险

**现状**：Pipeline 层定义了自己的 `TokenUsage`（`{ inputTokens, outputTokens, totalTokens }`），与旧 `ai.ts` 的 `ChatResponse.usage`（`{ inputTokens, outputTokens, totalTokens }`）字段名一致但类型独立。`AuditResult` 也有两个版本——一个在旧 `continuity.ts`，一个在 Pipeline `types.ts`。

**风险**：未来合并时可能出现隐式类型不匹配。

**建议**：统一类型来源，Pipeline 类型应从旧类型派生或建立统一的 re-export 层。

---

## 三、功能完整性评估

### 3.1 Pipeline 主链路（✅ 基本完整）

```
prepare → plan → compose → write → normalize → audit → (revise → audit)
```

- **已实现**：Phase 0-6 完整串联
- **缺失**：Phase 7-9 代码已写但未接入（见问题 1）
- **结论**：主链路可跑通，但落盘后的状态同步断裂

### 3.2 审计-修订循环（✅ 完整）

- ChapterReviewCycle 实现了完整的「审计 → 快照 → 修订 → 重评 → 最优选」流程
- SnapshotManager 支持快照管理和回滚
- AuditResultAggregator 支持多源审计结果聚合
- **评价**：质量较高，逻辑清晰

### 3.3 批量续写（⚠️ 部分完成）

- **已完成**：BatchContinueScheduler 核心调度、暂停/恢复/取消、每日限额、Token 预算
- **已完成**：WriteNextDialog UI、PipelineProgressPanel UI
- **缺失**：
  - 断点续写（checkpointManager 依赖 localStorage，与 Worker 不兼容）
  - 大纲自动翻页（Pipeline 内未检测大纲耗尽）
  - 与旧 Scheduler 的兼容层未完全打通

### 3.4 自然语言操作（✅ 已实现）

- AutomatonChat.vue 实现了自然语言输入 → 意图识别 → 动作执行的闭环
- 支持意图卡片展示、确认执行、动作预览

### 3.5 Daemon 后台服务（✅ 已实现）

- DaemonService.ts 实现了完整的定时调度、安全门控、多模式运行
- 但缺少 UI 入口（用户如何启用和配置 Daemon？）

### 3.6 短篇小说模式（✅ 已实现）

- ShortFictionRunner.ts 和 ShortFictionAgent.ts 已实现
- 但未见明确的 UI 入口或项目创建流程引导

---

## 四、用户体验审视

### 4.1 一键续写入口（✅ 清晰）

- `Chapters.vue` 中的续写按钮入口明确
- `WriteNextDialog.vue` 交互设计合理（章数滑块、方向指导、断点配置）
- `PipelineProgressPanel.vue` 进度展示完整（进度条、阶段、评分、Token）

### 4.2 缺失的新手引导（⚠️ 需补充）

**问题**：
1. 首次使用 Pipeline 时没有任何引导说明
2. 「一键续写」和「批量生成」的区别未说明
3. Pipeline 的 10 个 Agent 各自做什么，用户完全不可见
4. Daemon 服务如何启用？从哪里配置？

**建议**：
1. 在首次点击「一键续写」时弹出 el-tour 引导
2. 在 WriteNextDialog 中增加简要说明文字
3. 在 AgentConsole 中展示 Pipeline Agent 状态

### 4.3 进度展示（⚠️ 有待优化）

**问题**：
1. `PipelineProgressPanel` 在页面刷新后状态丢失
2. 批量续写 10+ 章时，已完成章节列表过长，缺乏折叠/分页
3. Agent 阶段进度（如「审计中...修订中...」）切换不够流畅

### 4.4 错误反馈（⚠️ 不够友好）

**问题**：
1. PipelineRunner 失败时返回的 error 信息是技术性的（`"流水线执行失败: ..."`)
2. 没有按错误类型提供用户可操作的建议（如 API 限流→等待后重试；模型不可用→切换模型）
3. 审计未通过时，用户看不到具体的审计维度得分和问题详情

---

## 五、文档和注释评估

### 5.1 代码注释（✅ 较好）

- 所有新文件均有 JSDoc 风格的头部注释，描述模块职责
- 关键方法有 inline 注释说明逻辑
- 类型定义有字段说明

### 5.2 缺失的文档（⚠️ 需补充）

| 缺失项 | 说明 |
|--------|------|
| Pipeline API 文档 | PipelineRunner / BatchContinueScheduler 的公共 API 无独立文档 |
| Agent 开发指南 | 如何新增自定义 Agent？接口规范是什么？ |
| 架构概览图 | Pipeline 9 阶段的流程图和数据流 |
| 配置参考 | PipelineConfig 各字段的含义和推荐值 |
| 故障排除指南 | 常见错误（API 超时、审计失败、Token 超限）的排查步骤 |

---

## 六、测试覆盖评估

### 6.1 测试覆盖统计

| 模块类别 | 代码行数 | 测试文件数 | 测试行数 | 估算覆盖率 |
|----------|----------|-----------|----------|-----------|
| Pipeline 服务层 | 3,246 | 0 | 0 | **0%** |
| 新建 Agent 层 | 3,991 | 0 | 0 | **0%** |
| 旧 Agent 层 | ~1,500 | 3 | ~250 | ~40% |
| 旧服务层 | ~3,000 | 12 | ~2,000 | ~60% |
| UI 组件 | ~5,000 | 0 | 0 | **0%** |

### 6.2 关键风险

1. **ChapterReviewCycle** 是最复杂的循环逻辑（367行），包含快照、回滚、净提升判断——**零测试**
2. **ContinuityAuditor** 的评分计算逻辑（554行）——**零测试**
3. **BatchContinueScheduler** 的取消/暂停/重试状态机（575行）——**零测试**
4. **PipelineRunner** 的 9 阶段编排（623行）——**零测试**

### 6.3 建议的测试优先级

| 优先级 | 测试目标 | 测试类型 | 预估工作量 |
|--------|----------|----------|-----------|
| P0 | ChapterReviewCycle（快照/回滚/终止条件） | 单元测试 | 1.5 人日 |
| P0 | BatchContinueScheduler（取消/暂停/限额） | 单元测试 | 1 人日 |
| P1 | PipelineRunner（mock 全 Agent 的编排测试） | 集成测试 | 1.5 人日 |
| P1 | ContinuityAuditor（维度评分计算） | 单元测试 | 1 人日 |
| P2 | SnapshotManager / AuditResultAggregator | 单元测试 | 1 人日 |
| P2 | checkpointManager | 单元测试 | 0.5 人日 |
| P3 | ComposerAgent（上下文裁剪逻辑） | 单元测试 | 0.5 人日 |
| **合计** | | | **~7 人日** |

---

## 七、优化方向建议

### 7.1 近期必做（1-2 周内）

| # | 任务 | 优先级 | 工作量 |
|---|------|--------|--------|
| 1 | 接入 Pipeline Phase 7-9（StateSettler + ChapterAnalyzer + HookPromoter） | P0 | 2 人日 |
| 2 | Pipeline 默认路由（enablePipeline 配置化） | P0 | 1.5 人日 |
| 3 | 消除 `as any` 类型逃逸（8 处） | P0 | 1 人日 |
| 4 | 核心模块单元测试（ReviewCycle + Scheduler） | P1 | 3 人日 |
| **小计** | | | **7.5 人日** |

### 7.2 中期应当做（2-4 周内）

| # | 任务 | 优先级 | 工作量 |
|---|------|--------|--------|
| 5 | AgentConsole 同步新 Agent 角色 | P1 | 1 人日 |
| 6 | checkpointManager 迁移到 IndexedDB | P1 | 0.5 人日 |
| 7 | PipelineRunner 数据适配层提取 | P2 | 0.5 人日 |
| 8 | 新手引导（Pipeline 首次使用 tour） | P2 | 1 人日 |
| 9 | 错误分类和用户友好提示 | P2 | 1 人日 |
| 10 | Pipeline 类型与旧类型统一 | P2 | 1 人日 |
| **小计** | | | **5 人日** |

### 7.3 长期值得投入

| # | 方向 | 价值 |
|---|------|------|
| 1 | ComposerAgent LLM 智能裁剪 | 大幅提升长篇小说上下文质量 |
| 2 | Daemon UI 控制面板 | 后台自动写作能力对用户可见 |
| 3 | Pipeline 可视化调试器 | 开发阶段大幅提升调试效率 |
| 4 | 审计维度可配置化 | 让用户自定义质量标准 |
| 5 | 多模型策略（轻量 Agent 用小模型） | 降低 Token 成本 30-50% |
| 6 | EPUB/PDF 导出增强 | 提升成品输出能力 |

---

## 八、结论

P0~P3 阶段以 **7,237 行核心代码** 和 **约 5,000 行 UI 代码** 构建了完整的 10-Agent Pipeline 体系，架构设计质量优秀，接口定义规范。但存在三个关键问题需要立即解决：

1. **Phase 7-9 断裂**：StateSettler / ChapterAnalyzer / HookPromoter 已实现但未接入 Pipeline，导致续写后项目状态不更新
2. **Pipeline 未设为默认路径**：feature flag 默认关闭，大部分用户场景不会触发
3. **测试覆盖为零**：7,237 行核心代码无任何测试保障

建议优先完成 7.5 人日的近期任务，即可将系统从"架构完成"推进到"生产可用"。

---

> 本报告为产品经理对项目当前状态的全面评估，供项目负责人和开发工程师参考。
