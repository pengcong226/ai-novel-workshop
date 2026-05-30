# 第二轮自我迭代 — 产品评估报告

> 评估日期：2026-05-28
> 评估者：产品经理
> 评估范围：第一轮修复后的系统全面评估 + InkOS 对标分析
> 代码规模：398 源文件 / 115,498 行代码 + 62 测试文件 / 11,245 行测试

---

## 一、第一轮修复验证

上一轮评估发现的 3 个关键问题已全部修复：

| 问题 | 修复状态 | 验证方式 |
|------|----------|----------|
| Pipeline Phase 7-9 未接入 | ✅ 已修复 | PipelineRunner 第 330-414 行：StateSettler / ChapterAnalyzer / HookPromoter 已完整接入 |
| Pipeline 未设为默认路径 | ✅ 已修复 | generation-scheduler.ts 第 44 行：`usePipeline = true` |
| 核心模块测试缺失 | ✅ 已修复 | 新增 8 个测试文件共 3,530 行，覆盖 PipelineRunner / ChapterReviewCycle / BatchContinueScheduler / SnapshotManager / AuditResultAggregator / AIGCDetector |

**额外完成的改进**：
- `as any` 类型逃逸从 8 处减少到 1 处（ComposerAgent 仅存 1 处）
- DataAdapter 已提取为独立模块（144 行）
- checkpointManager 已迁移到 IndexedDB（保留 localStorage fallback）

---

## 二、功能完整性评估

### 2.1 已完成功能清单（对比优化方案）

| 功能模块 | 状态 | 完成度 | 说明 |
|----------|------|--------|------|
| 10-Agent Pipeline | ✅ 已完成 | 95% | Phase 0-9 完整串联，仅剩 1 处 `as any` |
| 自动审稿门控 | ✅ 已完成 | 90% | ChapterReviewCycle + SnapshotManager + AuditResultAggregator |
| 一键续写 N 章 | ✅ 已完成 | 85% | BatchContinueScheduler + WriteNextDialog + PipelineProgressPanel |
| 自然语言操作 | ✅ 已完成 | 80% | NaturalLanguageRouter + AutomatonChat（35+ 正则规则 + LLM 兜底） |
| 守护进程模式 | ✅ 已完成 | 80% | DaemonService（811 行）+ WritingDashboard 控制面板 |
| 题材 Profile | ✅ 已完成 | 90% | 10 中文 + 5 英文 = 15 种题材，含审计维度/节奏模板/角色类型 |
| 风格克隆 | ✅ 已完成 | 85% | StyleAnalyzerAgent + StyleProfilePanel + AI 提取风格 |
| AIGC 检测 | ✅ 已完成 | 75% | AIGCDetector（GPTZero/Originality/本地检测），但 UI 入口不明显 |
| 短篇小说 | ✅ 已完成 | 70% | ShortFictionRunner + ShortFictionAgent，但 UI 入口缺失 |
| 同人创作 | ✅ 已完成 | 80% | FanficService（4 种模式：canon/au/ooc/cp） |
| PDF 导出 | ✅ 已完成 | 70% | pdfExporter.ts（浏览器打印 API），但无 EPUB 导出 |

### 2.2 功能缺口与增强机会

#### 缺口 1：短篇小说模式缺乏 UI 入口（影响：中）

**现状**：ShortFictionRunner 和 ShortFictionAgent 代码完整（665 行），但用户在 ProjectList 或 ProjectEditor 中**无法找到任何入口**创建短篇项目。

**建议**：在 ProjectList 的创建项目 Dialog 中增加「短篇小说」项目类型选项，包含预设的短篇配置（5000-30000 字、单卷结构）。

#### 缺口 2：AIGC 检测 UI 入口不明显（影响：中）

**现状**：AIGCDetector 已集成到 Pipeline 的 PipelineRunner 中（作为后处理步骤），但用户在章节编辑器中**无法手动触发** AIGC 检测。应允许用户在章节详情页一键检测当前章节。

**建议**：在 ChapterEditorDialog 或 QualityReport 中增加「AI 检测率」面板。

#### 缺口 3：缺少 EPUB 导出（影响：低-中）

**现状**：仅有 PDF 导出（基于浏览器打印 API，效果受浏览器差异影响）。InkOS 没有导出功能但有完善的章节管理。对于小说产品，EPUB 是发布到各阅读平台的标准格式。

**建议**：使用 `epub-gen` 或类似库实现 EPUB 导出，在 ExportSettings 中增加选项。

#### 缺口 4：Pipeline 未覆盖"大纲耗尽自动翻页"（影响：中）

**现状**：旧 `generation-scheduler.ts` 中有 `extendOutlineWithLLM` 的大纲自动翻页逻辑（第 219-238 行），但新的 PipelineRunner 中**未包含此逻辑**。批量续写超过大纲长度时会失败。

**建议**：在 PipelineRunner 的 Phase 0（prepare）中增加大纲余量检测，当 `chapterNumber >= outline.chapters.length - 4` 时自动触发大纲扩展。

#### 缺口 5：缺少"章节拆分"功能（影响：低）

**现状**：InkOS 有 `chapter-splitter.ts`（自动将超长章节拆分为合理长度的子章节），工坊无此功能。对于一键续写场景，如果单章字数严重超标，需要手动处理。

---

## 三、用户体验审视

### 3.1 操作流程分析

**核心创作流程**：
```
创建项目 → 配置AI模型 → 设定世界观(沙盘) → 编写大纲 → 一键续写 → 审校修订 → 导出
```

**流程顺畅度评估**：

| 步骤 | 流畅度 | 问题 |
|------|--------|------|
| 创建项目 | ⭐⭐⭐⭐⭐ | 一键体验示例 + 模板选择，体验优秀 |
| 配置AI模型 | ⭐⭐⭐ | 缺少"推荐配置"，新手不知道该选哪个模型 |
| 设定世界观 | ⭐⭐⭐⭐ | WorldGenWizard 引导良好，但信息密度高 |
| 编写大纲 | ⭐⭐⭐⭐ | 大纲编辑器完善，自动翻页 |
| 一键续写 | ⭐⭐⭐⭐⭐ | WriteNextDialog + PipelineProgressPanel 体验流畅 |
| 审校修订 | ⭐⭐⭐ | QualityReport 展示建议，但修订入口不够直观 |
| 导出 | ⭐⭐⭐ | PDF 导出可用，缺 EPUB |

### 3.2 需要优化的 UX 问题

#### UX-1：一键续写与批量生成的混淆

**现状**：Chapters.vue 中有两个相似的入口——「一键续写」和旧的「批量生成」。两者的区别是什么？用户不清楚。

**建议**：
1. 统一为单一入口「AI 续写」，内部根据 Pipeline 配置自动选择路径
2. 在入口旁增加简要说明（如"由 AI 自动规划、写作、审校、修订"）

#### UX-2：Pipeline 进度展示缺少 Agent 阶段可视化

**现状**：PipelineProgressPanel 展示了章节级进度（第 X/N 章），但**缺少 Agent 阶段级**的进度（如"正在审计...正在修订..."）。用户无法感知当前处于哪个 Agent 阶段。

**建议**：在 PipelineProgressPanel 中增加 Agent 阶段时间线（类似流水线工位），展示每个 Agent 的执行状态和耗时。

#### UX-3：Daemon 控制面板功能有限

**现状**：WritingDashboard 中的 Daemon 面板仅有模式选择（auto/semi/manual）和基本状态显示。缺少：
- 每日/每周产出统计图表
- 失败日志查看
- 定时调度时间配置
- 费用统计

**建议**：扩展 Daemon 面板为独立的管理视图。

#### UX-4：AgentConsole 缺少新 Agent 的详细信息

**现状**：AgentConsole 已包含 composer/auditor/reviser/normalizer 标签，但每个 Agent 缺少：
- 功能说明 tooltip
- 独立的运行日志查看
- 模型选择（审计和修订可使用不同模型）

#### UX-5：写作仪表盘缺少关键指标

**现状**：WritingDashboard 展示了字数/进度/章节数/平均章长，但缺少：
- Token 消耗趋势（日/周/月）
- 审计评分趋势（最近 10 章的评分曲线）
- 质量问题统计（高频 issue 类型分布）
- 预算剩余估算

---

## 四、数据与状态管理评估

### 4.1 数据持久化

| 数据类型 | 存储方案 | 评估 |
|----------|----------|------|
| 项目数据 | IndexedDB（storage.ts） | ✅ 成熟 |
| 章节数据 | IndexedDB | ✅ 成熟 |
| 章节快照 | IndexedDB（chapter_snapshots） | ✅ 已有 |
| 模板数据 | IndexedDB + localStorage fallback | ✅ P3 已迁移 |
| 断点数据 | IndexedDB + localStorage fallback | ✅ 已迁移 |
| Pipeline 运行状态 | 内存（非持久化） | ⚠️ 刷新丢失 |
| Daemon 状态 | 内存 + ai store | ⚠️ 刷新丢失 |

#### 问题 D-1：Pipeline 运行状态不持久化

**现状**：批量续写过程中刷新页面，所有进度丢失。PipelineProgressPanel 的数据全部来自内存中的事件流。

**影响**：用户在长时间续写过程中（如 50 章），一旦误触刷新或浏览器崩溃，无法恢复进度。

**建议**：
1. 将 Pipeline 运行状态持久化到 IndexedDB（当前章节、已完成列表、配置参数）
2. 页面加载时检测未完成的 Pipeline 任务，提供「恢复续写」选项
3. 断点管理器已有基础设施，可复用

#### 问题 D-2：Daemon 状态不持久化

**现状**：Daemon 的 `chaptersCompletedToday`、`tokensUsedToday` 等计数器在页面刷新后重置为 0。

**影响**：每日限额保护失效——刷新后 Daemon 认为今天还没有生成过任何章节，可能超出限额。

**建议**：将 Daemon 计数器持久化到 IndexedDB，按日期键存储。

### 4.2 状态同步

#### 问题 D-3：StateSettler 与 SandboxStore 的同步延迟

**现状**：StateSettler 在 Pipeline 中异步执行，产出的 newEntities 和 newStateEvents 需要同步到 SandboxStore。当前通过 `project as any` 访问运行时数据，而非通过 store action。

**影响**：如果 Pipeline 和用户手动编辑 Sandbox 同时进行，可能产生数据竞争。

**建议**：StateSettler 应通过 SandboxStore 的 action 方法（`addEntity`、`addStateEvent`）进行增量更新，而非直接操作数据。

---

## 五、InkOS 对标分析 — 可借鉴功能

### 5.1 InkOS 独有且高价值的功能

| # | 功能 | InkOS 实现 | 工坊现状 | 借鉴价值 |
|---|------|-----------|----------|----------|
| 1 | **伏笔健康分析** | hook-health.ts（200+ 行）：活跃伏笔上限、过期检测、压力评估、生命周期追踪 | HookPromoter 仅做升级检查 | ⭐⭐⭐⭐⭐ |
| 2 | **伏笔过期/阻塞检测** | hook-stale-detection.ts：stale/blocked 标记、半衰期计算、上游依赖追踪 | 无 | ⭐⭐⭐⭐⭐ |
| 3 | **长跨度疲劳检测** | long-span-fatigue.ts：跨章节开头/结尾模式重复检测、英文方差分析 | 无 | ⭐⭐⭐⭐ |
| 4 | **章节节奏分析** | chapter-cadence.ts + cadence-policy.ts：场景类型单调检测、情绪连续高压检测、标题聚集检测 | 无 | ⭐⭐⭐⭐ |
| 5 | **写作方法论注入** | writing-methodology.ts：去 AI 味正反例、六步走心理分析、配角设计、代入感六大支柱、强情绪升级法 | 无 | ⭐⭐⭐⭐⭐ |
| 6 | **统计风格分析** | style-analyzer.ts：纯文本分析（TTR、句式统计、修辞检测），不依赖 LLM | StyleAnalyzerAgent 用 LLM 分析 | ⭐⭐⭐ |
| 7 | **POV 过滤** | pov-filter.ts：根据叙述视角过滤上下文中不应出现的信息 | 无 | ⭐⭐⭐ |
| 8 | **上下文治理** | governed-context.ts + governed-working-set.ts：按规则栈和意图智能裁剪上下文 | ComposerAgent 使用固定预算截断 | ⭐⭐⭐⭐ |
| 9 | **章节备忘 7 段结构** | ChapterMemo：goal + 7 段正文（任务/兑现/过渡/三连问/改变/不要做/骨架） | PipelineMemo 已实现，但简化为 8 字段 | ⭐⭐⭐⭐ |
| 10 | **审计 33 维度** | continuity.ts：完整 33 维度 + 题材特定注释 + 同人扩展维度 | ContinuityAuditor 16 维度 | ⭐⭐⭐⭐ |

### 5.2 优先借鉴建议

#### 借鉴 1：伏笔健康系统（P0，预估 3 人日）

**现状差距**：工坊的 HookPromoter 只做"升级"检查（advanced_count ≥ 2 则标记 promoted），但缺少：
- **过期检测**：伏笔埋设超过 N 章未推进 → 标记 stale
- **阻塞检测**：伏笔的上游依赖未解决 → 标记 blocked
- **健康评分**：活跃伏笔数量上限、新开伏笔速率控制
- **生命周期追踪**：从 planted → advanced → stale/blocked → resolved 的完整状态机

**InkOS 参考**：
- `hook-health.ts`：活跃伏笔上限检查（默认 15）、过期伏笔压力评估、新开伏笔爆发检测
- `hook-stale-detection.ts`：stale（半衰期过期）和 blocked（上游依赖未解决）双诊断
- `hook-promotion.ts`：4 条升级规则（跨卷/advanced_count≥2/有依赖/核心标记）
- `hook-lifecycle.ts`：伏笔生命周期描述与回收时机建议

**实现方案**：
1. 扩展 HookEntry 类型：增加 `stale`、`blocked`、`halfLife`、`dependsOn`、`coreHook` 字段
2. 在 PipelineRunner Phase 9 中增加健康检查调用
3. 在 ContinuityAuditor 的伏笔检查维度中注入健康诊断结果
4. 在 Sandbox 的伏笔面板中展示健康状态标签

---

#### 借鉴 2：写作方法论注入（P0，预估 2 人日）

**现状差距**：Writer 的 system prompt 中没有结构化的写作方法论文本。InkOS 将完整的写作方法论（去 AI 味正反例、六步走心理分析、配角设计、代入感六大支柱等）注入 style_guide.md，Writer 每章生成时自动读取。

**价值**：这是提升 AI 生成质量最直接的手段——不改架构、不改流程，只改 prompt 内容。

**实现方案**：
1. 在 `src/utils/writingMethodology.ts` 中构建完整的写作方法论参考文本
2. 在项目初始化时写入 `styleGuide` 字段
3. Writer 生成时将方法论注入 system prompt
4. 支持中/英文两套方法论

---

#### 借鉴 3：长跨度疲劳检测（P1，预估 2 人日）

**现状差距**：工坊有"词汇疲劳"（单章内 AI 标记词密度）检测，但缺少**跨章节**的模式重复检测。

**InkOS 参考**：
- `long-span-fatigue.ts`：检测最近 N 章的开头/结尾句式是否雷同
- `chapter-cadence.ts`：检测场景类型单调（连续 N 章都是同类型）、情绪连续高压（连续 N 章高张力）
- `cadence-policy.ts`：定义疲劳阈值参数

**实现方案**：
1. 在 PipelineRunner Phase 8（ChapterAnalyzer）中增加跨章节模式分析
2. 分析最近 5-10 章的开头/结尾模式相似度
3. 分析章节类型分布（战斗/日常/过渡/高潮）
4. 将疲劳诊断结果注入审计 issues

---

#### 借鉴 4：上下文智能裁剪（P1，预估 3 人日）

**现状差距**：ComposerAgent 当前使用简单的字符截断（`clampText`），超限直接截断加 `[...已截断]`。InKOS 的 `governed-context.ts` 和 `governed-working-set.ts` 实现了基于规则栈和意图的智能裁剪：
- 根据 ChapterIntent 的 mustKeep 决定哪些上下文必须保留
- 根据伏笔的 POV 相关性过滤不相关的伏笔
- 根据角色矩阵与当前章的关联度裁剪低相关角色信息

**实现方案**：
1. 将 ComposerAgent 的确定性截断升级为基于 PlanChapterOutput.intent 的智能裁剪
2. 实现 `contextFilter` 工具：按相关性评分排序上下文块
3. 优先保留 mustKeep 指定的元素，优先裁剪低相关元素

---

#### 借鉴 5：POV 过滤器（P2，预估 1 人日）

**现状差距**：上下文组装时不过滤叙述视角。InKOS 的 `pov-filter.ts` 根据当前章节的 POV 角色，从角色矩阵和伏笔池中过滤该角色不应该知道的信息，防止"上帝视角"泄露。

---

### 5.3 InkOS 架构优势（暂不建议直接借鉴）

| 特性 | InkOS 实现 | 工坊差异 | 暂不借鉴原因 |
|------|-----------|----------|-------------|
| CLI/TUI 入口 | packages/cli 完整 CLI | 纯前端应用 | 架构差异大，投入产出比低 |
| Monorepo 结构 | pnpm workspace | 单一前端项目 | 规模不需要 |
| 文件系统 Truth Files | 7 个 markdown 文件 | IndexedDB + SandboxStore | Web 环境不适合文件系统 |
| Cron 调度 | Scheduler 基于 setInterval | DaemonService 已实现类似功能 | 已有等价实现 |
| LLM Provider 适配 | 30+ provider 适配器 | 3 provider + plugin 体系 | Plugin 架构更灵活 |

---

## 六、综合优化建议

### 6.1 本轮迭代建议（优先级排序）

| # | 任务 | 类别 | 优先级 | 工作量 |
|---|------|------|--------|--------|
| 1 | 伏笔健康系统（过期/阻塞/生命周期） | 功能 | P0 | 3 人日 |
| 2 | 写作方法论注入 prompt | 质量 | P0 | 2 人日 |
| 3 | Pipeline 大纲自动翻页 | 功能 | P0 | 0.5 人日 |
| 4 | 短篇小说 UI 入口 | 功能 | P1 | 1 人日 |
| 5 | AIGC 检测手动触发入口 | 功能 | P1 | 0.5 人日 |
| 6 | 长跨度疲劳检测 | 质量 | P1 | 2 人日 |
| 7 | Composer 上下文智能裁剪 | 质量 | P1 | 3 人日 |
| 8 | Pipeline 进度 Agent 阶段可视化 | UX | P1 | 1.5 人日 |
| 9 | 一键续写与批量生成入口统一 | UX | P2 | 1 人日 |
| 10 | 审计维度扩展到 25+ | 质量 | P2 | 2 人日 |
| 11 | Pipeline 运行状态持久化 | 数据 | P2 | 1.5 人日 |
| 12 | Daemon 计数器持久化 | 数据 | P2 | 0.5 人日 |
| 13 | EPUB 导出 | 功能 | P2 | 2 人日 |
| 14 | POV 过滤器 | 质量 | P2 | 1 人日 |
| 15 | WritingDashboard 指标增强 | UX | P3 | 1.5 人日 |

**总预估工作量**：24 人日

### 6.2 质量提升路径

```
当前状态（第二轮）
  │
  ├── [P0] 伏笔健康 + 写作方法论 + 大纲翻页 → 生成质量跃升
  │
  ├── [P1] 疲劳检测 + 智能裁剪 + UI 入口完善 → 长篇质量保障
  │
  ├── [P2] 审计维度扩展 + 状态持久化 + EPUB → 生产级可用
  │
  └── [P3] 指标增强 + UX 精细化 → 用户粘性提升
```

---

## 七、结论

### 第一轮修复效果

上一轮 3 个关键问题全部修复，Pipeline 从"架构完成"推进到"生产可用"。测试覆盖从 0% 提升到有 3,530 行测试代码。

### 当前系统定位

ai-novel-workshop 现已具备：
- ✅ 完整的 10-Agent 自动化 Pipeline
- ✅ 审计-修订循环 + 快照回滚
- ✅ 一键续写 + 守护进程 + 自然语言操作
- ✅ 15 种题材 Profile + 风格克隆 + AIGC 检测
- ✅ 同人创作（4 种模式）+ 短篇小说

### 最大的提升空间

**生成质量**是当前最大的提升空间。InkOS 在伏笔健康管理、写作方法论注入、跨章节疲劳检测、上下文智能裁剪四个维度有明显领先。这些功能不改架构、只增强 prompt 和分析逻辑，是"性价比最高"的优化方向。

建议本轮迭代聚焦 **伏笔健康 + 写作方法论 + 大纲翻页** 三个 P0 项（5.5 人日），可在不改变架构的前提下显著提升长篇小说的生成质量。

---

> 本报告为产品经理对项目第二轮迭代的全面评估，供项目负责人参考决策。
