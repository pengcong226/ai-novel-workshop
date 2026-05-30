# AI小说工坊 → 全自动写作工厂 优化路线图

> 制定人：产品经理
> 日期：2026-05-29
> 方向：将AI小说工坊从"可视化创作工作站"升级为"全自动写作工厂"
> 参照：InkOS v1.4.1 核心能力（源码级分析）
> 工坊路径：/data/share/project/ai-novel-workshop/
> InkOS路径：/data/share/project/inkos/

---

## 总体策略

**核心目标**：在保留工坊现有可视化优势的基础上，补齐InkOS的全自动写作能力。

**设计原则**：
1. **渐进式升级**——不推翻现有架构，在Vue/Pinia/Tauri体系上叠加自动化能力
2. **Entity & StateEvent为核心**——工坊的Entity模型比InkOS的7文件真相系统更统一，应继续作为底层数据架构
3. **UI优先于CLI**——工坊的桌面应用定位不变，但增加命令行/自然语言作为高级入口
4. **人工门控兜底**——参考InkOS的auto/semi/manual三模式，全自动可配置

---

## P0：立即做（核心自动化能力）

### P0-1：升级为10-Agent自动流水线

**现状**：工坊当前6-Agent（Planner/Writer/Sentinel/Extractor/Editor/Reader），各Agent独立运行，缺少Pipeline串联。

**目标**：参考InkOS的10-Agent Pipeline，构建完整的 plan→compose→write→settle→audit→revise 循环。

**InkOS参考**（`packages/core/src/pipeline/runner.ts`）：
- 三阶段Pipeline：创意写作(0.7温度) → 状态沉淀(0.3温度) → 质量循环
- 关键Agent：Planner→Composer→Writer→Observer→Reflector→Normalizer→Auditor→Reviser
- Agent间通过结构化JSON通信，每个Agent有明确输入/输出schema

**改造方案**：

| 现有Agent | 升级后 | 新增Agent | 职责 |
|-----------|--------|-----------|------|
| Planner | **Planner** | — | 生成章节意图+钩子议程 |
| — | **Composer** | ✅ 新增 | 根据意图选择上下文包（Entity状态+伏笔+摘要+前章） |
| Writer | **Writer** | — | 创意写作（两阶段：创意+沉淀） |
| Sentinel | **Sentinel** | — | 逻辑矛盾检测 |
| Extractor | **Observer + Settler** | ✅ 拆分 | Observer提取事实 → Settler输出JSON delta更新Entity/StateEvent |
| Editor | **Normalizer** | ✅ 升级 | 字数归一化 + 表面清理 |
| — | **Auditor** | ✅ 新增 | 多维度审计（连贯性/OOC/战力/伏笔/文风等） |
| — | **Reviser** | ✅ 新增 | 根据审计结果自动修订 |
| Reader | **Reader** | — | 读者视角反馈 |

**涉及文件**：
- 新建：`src/agents/PipelineRunner.ts` — Pipeline编排器
- 新建：`src/agents/ComposerAgent.ts` — 上下文组装Agent
- 新建：`src/agents/AuditorAgent.ts` — 多维审计Agent
- 新建：`src/agents/ReviserAgent.ts` — 自动修订Agent
- 新建：`src/agents/NormalizerAgent.ts` — 字数归一化Agent
- 拆分：`src/agents/ExtractorAgent.ts` → Observer + Settler
- 修改：`src/stores/ai.ts` — 新增Pipeline执行模式
- 修改：`src/agents/types.ts` — 扩展AgentRole和AgentPhase定义

**预期效果**：
- 一键生成完整章节（plan→write→audit→revise循环）
- 审计后自动修订，不需人工介入
- Agent数量从6个升级到10个

---

### P0-2：构建自动审稿门控机制（Audit→Revise循环）

**现状**：工坊的QualityReport组件仅做基础质量评分，无自动修订能力。用户看到问题后需手动处理。

**目标**：参考InkOS的`chapter-review-cycle.ts`，实现"审计→修订→再审计"的自动循环。

**InkOS参考**（`packages/core/src/pipeline/chapter-review-cycle.ts`）：
- 审计通过阈值：85分
- 最大修订轮数：可配置（默认1轮，`writing.reviewRetries`）
- 净改进检测：修订后分数提升不足3分则停止（避免无意义循环）
- 快照回滚：每次修订前保存快照，修订后分数下降则回滚

**改造方案**：

1. **扩展审计维度**：从当前的基础评分升级为结构化审计
   ```
   维度包括：OOC检查、时间线检查、设定冲突、战力崩坏、数值检查、
   伏笔检查、节奏检查、文风检查、信息越界、词汇疲劳、敏感词检查 等
   ```
   每个维度输出 `severity: critical|warning|info` + `category` + `description` + `suggestion`

2. **实现审计-修订循环**：
   ```
   write → audit → (critical问题? → revise → audit → ...) → 完成
   ```
   配置项：`reviewRetries`（最大修订轮数，默认1）、`passScoreThreshold`（通过阈值，默认85）

3. **快照回滚机制**：修订后分数下降则回滚到修订前版本

**涉及文件**：
- 新建：`src/agents/AuditorAgent.ts` — 多维审计（参考`continuity.ts`的33维审计结构）
- 新建：`src/agents/ReviserAgent.ts` — 自动修订（参考`reviser.ts`的分级问题处理）
- 新建：`src/pipeline/ChapterReviewCycle.ts` — 审计修订循环控制器
- 修改：`src/stores/ai.ts` — 集成审计修订循环
- 修改：`src/types/index.ts` — 新增AuditResult/AuditIssue类型

**预期效果**：
- 每章自动生成→审计→修订，质量分数可配置
- 消除人工逐章审稿的需要
- 审计结果可视化展示

---

### P0-3：实现一键续写N章（全自动写作流程）

**现状**：工坊支持"批量生成"但需要用户手动触发，每轮独立，无连续的Pipeline串联。

**目标**：参考InkOS的`inkos write next --count 5`，实现一键自动续写N章，全自动不中断。

**InkOS参考**（`packages/core/src/pipeline/runner.ts` + `scheduler.ts`）：
- `writeNextChapter()`：单章完整Pipeline
- `--count N`：连续写N章，每章完成后自动更新真相文件/Entity状态
- Scheduler：定时触发写作周期，支持cron表达式
- 质量门控：连续失败N次自动暂停并通知

**改造方案**：

1. **"一键写N章"功能**：
   - UI入口：WritingDashboard新增"自动续写"按钮，可配置章数
   - 每章执行完整Pipeline：plan→compose→write→settle→audit→revise
   - 每章完成后自动更新Entity/StateEvent状态
   - 实时显示进度（当前第X章 / 共N章，质量分数）

2. **质量门控**：
   - 连续N章审计不通过则自动暂停
   - 暂停时展示失败原因和建议

3. **进度持久化**：
   - 自动续写过程中可暂停/恢复
   - 进度写入项目状态，中断后可续

**涉及文件**：
- 新建：`src/pipeline/BatchWriteRunner.ts` — 批量写作运行器
- 修改：`src/components/WritingDashboard.vue` — 新增自动续写入口和进度面板
- 修改：`src/stores/ai.ts` — 支持批量Pipeline执行和状态管理
- 修改：`src/stores/project.ts` — 自动保存每章结果

**预期效果**：
- "一键写5章"按钮，全自动完成，含质量保障
- 每章自动更新Entity状态，确保连贯性
- 可暂停/恢复，中断不丢数据

---

## P1：近期做（增强自动化深度）

### P1-1：StateEvent自动沉淀（Observer+Settler拆分）

**现状**：工坊的ExtractorAgent负责从文本中提取实体，但输出直接写入Entity，缺少Observer的"过度提取"和Settler的"结构化delta校验"两阶段。

**目标**：参考InkOS的Observer→Reflector→Settler三步流程，提升状态更新的准确性和可靠性。

**InkOS参考**：
- Observer（`observer-prompts.ts`）：过度提取9类事实（角色、关系、地点、物品、状态变化、伏笔、情感、时间线、数值），宁多勿漏
- Reflector（`settler-prompts.ts`）：输出JSON delta（不是完整markdown），经Zod schema校验后immutable apply
- 状态验证（`state-validator.ts`）：apply后验证状态一致性

**改造方案**：
1. **拆分Extractor为Observer + Settler**：
   - Observer：从章节文本中过度提取事实（9类），输出结构化候选列表
   - Settler：将候选列表转化为StateEvent delta，经schema校验后apply到Entity
2. **Schema校验层**：为StateEvent payload定义严格的Zod/JSON Schema
3. **不可变更新**：delta apply采用immutable模式，出错可回滚

**涉及文件**：
- 新建：`src/agents/ObserverAgent.ts`
- 新建：`src/agents/SettlerAgent.ts`
- 修改：`src/agents/ExtractorAgent.ts` → 重构为Observer+Settler调用
- 新建：`src/schemas/stateEventSchema.ts` — StateEvent payload验证schema
- 修改：`src/stores/sandbox.ts` — 支持delta apply和回滚

**预期效果**：状态提取准确率显著提升，消除"吃书"问题的根源

---

### P1-2：输入治理系统（Input Governance）

**现状**：工坊的AI生成直接将Entity状态+大纲作为上下文，缺少结构化的输入编译过程。

**目标**：参考InkOS的`Composer` Agent和输入治理架构，实现上下文的智能组装。

**InkOS参考**（`packages/core/src/agents/composer.ts`）：
- `ContextPackage`：从真相文件中智能选取与本章相关的上下文子集
- `RuleStack`：本章的优先级规则栈（卷级规则 > 书级规则 > 题材规则 > 通用规则）
- `ChapterIntent`：Planner生成的章节意图（目标、保留项、避免项）
- `ChapterMemo`：本章备忘（钩子议程、支线推进、伏笔回收计划）
- 运行时产物：`chapter-XXXX.intent.md`、`chapter-XXXX.context.json`、`chapter-XXXX.rule-stack.yaml`、`chapter-XXXX.trace.json`

**改造方案**：
1. **Composer Agent**：根据章节大纲+Entity状态+伏笔列表，智能选取上下文子集（Token预算控制）
2. **Rule Stack**：实现优先级规则栈（项目配置 > 大纲意图 > 题材约束 > 通用规则）
3. **Trace记录**：每章生成上下文编译trace，可审计哪些信息被注入

**涉及文件**：
- 新建：`src/agents/ComposerAgent.ts`
- 新建：`src/types/inputGovernance.ts` — ContextPackage/RuleStack/ChapterIntent类型
- 修改：`src/agents/WriterAgent.ts` — 接受Composer输出作为输入
- 修改：`src/stores/ai.ts` — Pipeline中插入Composer阶段

**预期效果**：AI生成的上下文更精准，减少无关信息干扰，提升长篇质量

---

### P1-3：自然语言操作能力

**现状**：工坊完全通过UI按钮操作，无法用自然语言控制写作流程。

**目标**：参考InkOS的`inkos agent`命令和`nl-router.ts`，在工坊中增加自然语言操作入口。

**InkOS参考**：
- `nl-router.ts`：正则+关键词路由，将自然语言映射为结构化Intent（22种Intent类型）
- `interaction/runtime.ts`：统一执行引擎，CLI/TUI/Studio共享
- `interaction/request-router.ts`：Zod schema校验Intent
- 三种自动化模式：auto/semi/manual

**改造方案**：
1. **AI Agent聊天入口**：在AutomatonChat组件中增加Agent模式
   - 用户输入"帮我写下一章"→ 路由到write_next
   - 用户输入"检查第5章的连贯性"→ 路由到audit
   - 用户输入"把主角名字从林夜改为星辰"→ 路由到rename_entity
2. **Intent路由引擎**：新建`src/services/NaturalLanguageRouter.ts`
   - 支持22种Intent（对应InkOS的IntentType）
   - 先用正则快速匹配，模糊意图交给LLM解析
3. **三种自动化模式**：
   - **auto**：全自动，Pipeline自动循环
   - **semi**：半自动，每步暂停确认
   - **manual**：手动，每步需用户触发

**涉及文件**：
- 新建：`src/services/NaturalLanguageRouter.ts`
- 新建：`src/types/interactionIntents.ts` — Intent类型定义
- 修改：`src/components/Sandbox/AutomatonChat.vue` — 升级为Agent控制台
- 修改：`src/stores/ai.ts` — 支持Intent驱动的Pipeline执行

**预期效果**：用户可通过自然语言控制整个写作流程，大幅降低操作门槛

---

### P1-4：守护进程模式（后台自动写作）

**现状**：工坊的AI生成是同步阻塞的，用户需等待生成完成。

**目标**：参考InkOS的`inkos up/down`守护进程和`Scheduler`，实现后台持续写作。

**InkOS参考**（`packages/core/src/pipeline/scheduler.ts`）：
- `Scheduler`类：基于cron的定时任务调度
- Write Cycle：定时触发写作循环
- Radar Scan：定时扫描市场趋势
- 质量门控：连续失败自动暂停
- 每日限额：`maxChaptersPerDay`防止失控

**改造方案**：
1. **后台Pipeline执行器**：新建`src/services/DaemonService.ts`
   - 将Pipeline执行移到Web Worker/后台线程
   - 通过Pinia事件通知UI更新进度
2. **定时写作任务**：可配置"每小时写1章"或"每天写3章"
3. **安全门控**：
   - API成本上限（每日/每项目）
   - 连续失败自动暂停
   - 用户可随时暂停/恢复
4. **Tauri侧支持**：利用Tauri的后台任务能力，桌面应用最小化后继续写作

**涉及文件**：
- 新建：`src/services/DaemonService.ts`
- 新建：`src/workers/pipelineWorker.ts` — Web Worker Pipeline执行
- 修改：`src/stores/ai.ts` — 支持异步Pipeline
- 修改：`src/components/WritingDashboard.vue` — 守护进程控制面板
- 修改：`src-tauri/` — Tauri侧后台任务支持

**预期效果**：应用最小化后持续写作，用户回来时查看新章节即可

---

## P2：中期做（体验增强）

### P2-1：题材Profile系统

**现状**：工坊的模板系统仅有4个内置模板+用户自定义模板，题材规则固定。

**目标**：参考InkOS的15种Genre Profile（`packages/core/genres/`），实现题材驱动的规则约束。

**InkOS参考**：
- 每种题材一个markdown文件（`xuanhuan.md`、`urban.md`等），包含：
  - 通用创作规则（25条）
  - 题材专属规则（禁忌、语言约束、节奏模式）
  - 审计维度和严重度配置
  - 角色类型规范
  - 起承转合节奏模板
- 支持自定义题材：`inkos genre create`

**改造方案**：
1. **GenreProfile数据结构**：定义题材配置schema
2. **内置10+中文题材Profile**：玄幻、仙侠、都市、历史、悬疑、科幻、武侠、言情、游戏、轻小说
3. **每种Profile包含**：创作规则、审计维度、节奏模板、角色类型、禁忌列表
4. **用户可创建自定义题材**

**涉及文件**：
- 新建：`src/data/genres/` — 题材Profile文件目录
- 新建：`src/types/genreProfile.ts` — 类型定义
- 修改：`src/agents/AuditorAgent.ts` — 根据题材加载对应审计维度
- 修改：`src/views/ProjectList.vue` — 建书时选择题材Profile

**预期效果**：每种题材有专业的创作规则和审计标准，质量可控

---

### P2-2：EPUB导出 + 平台格式

**现状**：工坊仅支持Markdown和PDF导出。

**目标**：支持EPUB电子书导出，以及起点/番茄等平台格式。

**涉及文件**：
- 新建：`src/utils/exporters/epubExporter.ts`
- 新建：`src/utils/exporters/platformExporter.ts`
- 修改：`src/components/ExportSettings.vue` — 新增EPUB和平台格式选项

---

### P2-3：AIGC检测集成

**现状**：工坊无AIGC检测能力。

**目标**：参考InkOS的`detector.ts`，集成GPTZero/Originality等AIGC检测API。

**涉及文件**：
- 新建：`src/services/AIGCDetector.ts`
- 修改：`src/components/QualityReport.vue` — 显示AIGC检测结果
- 修改：`src/types/index.ts` — 新增DetectionConfig类型

---

### P2-4：文风分析与克隆

**现状**：工坊有StyleProfile但需手动配置。

**目标**：参考InkOS的`style-analyzer.ts`，从参考文本自动提取文风指纹。

**涉及文件**：
- 新建：`src/agents/StyleAnalyzerAgent.ts`
- 修改：`src/components/config/StyleProfilePanel.vue` — 增加"从文本提取"功能

---

## P3：长期做（生态与扩展）

### P3-1：CLI命令行入口

**现状**：工坊仅桌面应用。

**目标**：参考InkOS的CLI，提供命令行入口，支持脚本编排和外部Agent调用。

**InkOS参考**：
- Commander.js命令行框架
- 原子命令（plan/compose/draft/audit/revise）+ 一站式命令（write next）
- `--json`结构化输出
- 可被外部Agent通过exec调用

**改造方案**：
1. **独立CLI包**：新建`packages/cli/`，基于Tauri CLI或独立Node.js
2. **共享核心逻辑**：将PipelineRunner、Agent层抽为独立包，UI和CLI共用
3. **原子命令**：`workshop plan`、`workshop write`、`workshop audit`、`workshop export`

**涉及文件**：
- 新建：`packages/cli/` — CLI包
- 重构：将`src/agents/`和`src/pipeline/`抽为独立`packages/core/`
- 修改：项目结构改为Monorepo

**预期效果**：支持命令行写作、脚本编排、外部Agent调用

---

### P3-2：OpenClaw Skill标准

**现状**：工坊无外部集成能力。

**目标**：参考InkOS的`skills/SKILL.md`，将工坊发布为OpenClaw Skill。

**涉及文件**：
- 新建：`skills/SKILL.md`
- 新建：`packages/skill/` — Skill适配层

---

### P3-3：短篇小说生成

**现状**：工坊专注长篇。

**目标**：参考InkOS的`ShortFictionAgent`，增加独立短篇生成能力。

**InkOS参考**（`packages/core/src/agents/short-fiction.ts`）：
- 12-18章，每章900-1200字
- 三步流程：大纲生成 → 批量写作 → 打包（正文+简介+卖点+封面提示词）
- 独立于长篇Pipeline

**涉及文件**：
- 新建：`src/agents/ShortFictionAgent.ts`
- 新建：`src/pipeline/ShortFictionRunner.ts`
- 修改：`src/views/ProjectList.vue` — 建书时选择"短篇"模式

---

### P3-4：英文写作支持

**现状**：仅中文。

**目标**：参考InkOS的`--lang en`和10种英文题材Profile。

**涉及文件**：
- 新建：`src/data/genres/en/` — 英文题材Profile
- 修改：所有Agent的system prompt增加英文版本
- 修改：UI增加语言切换

---

### P3-5：同人创作模式

**现状**：无。

**目标**：参考InkOS的`fanfic init`，支持4种同人模式（canon/au/ooc/cp）。

**涉及文件**：
- 新建：`src/services/FanficService.ts`
- 修改：ProjectList.vue — 增加"同人创作"入口

---

## 优先级总览

| 优先级 | 编号 | 优化项 | 工作量 | 预期收益 |
|--------|------|--------|--------|----------|
| **P0** | P0-1 | 10-Agent自动流水线 | 大 | ⭐⭐⭐⭐⭐ 核心竞争力 |
| **P0** | P0-2 | 自动审稿门控(Audit→Revise) | 中 | ⭐⭐⭐⭐⭐ 质量保障 |
| **P0** | P0-3 | 一键续写N章 | 中 | ⭐⭐⭐⭐⭐ 效率飞跃 |
| **P1** | P1-1 | StateEvent自动沉淀(Observer+Settler) | 中 | ⭐⭐⭐⭐ 消除吃书 |
| **P1** | P1-2 | 输入治理系统(Composer) | 中 | ⭐⭐⭐⭐ 上下文精准 |
| **P1** | P1-3 | 自然语言操作 | 中 | ⭐⭐⭐⭐ 交互革命 |
| **P1** | P1-4 | 守护进程模式 | 大 | ⭐⭐⭐⭐ 持续写作 |
| **P2** | P2-1 | 题材Profile系统 | 中 | ⭐⭐⭐ 题材专业性 |
| **P2** | P2-2 | EPUB导出+平台格式 | 小 | ⭐⭐⭐ 生态对接 |
| **P2** | P2-3 | AIGC检测集成 | 小 | ⭐⭐⭐ 质量外延 |
| **P2** | P2-4 | 文风分析与克隆 | 中 | ⭐⭐⭐ 差异化 |
| **P3** | P3-1 | CLI命令行入口 | 大 | ⭐⭐ 开发者生态 |
| **P3** | P3-2 | OpenClaw Skill | 中 | ⭐⭐ 开放生态 |
| **P3** | P3-3 | 短篇小说生成 | 中 | ⭐⭐ 创作形态 |
| **P3** | P3-4 | 英文写作支持 | 中 | ⭐⭐ 国际化 |
| **P3** | P3-5 | 同人创作模式 | 中 | ⭐⭐ 创作形态 |

---

## 技术架构演进路线

### 第一阶段（P0）：在现有架构上叠加Pipeline

```
当前：UI Button → Agent Store → 单Agent执行 → 结果展示
P0：  UI Button / "一键写N章" → PipelineRunner → 10-Agent串联 → 自动审修订循环 → Entity/StateEvent更新
```

前端架构不变，PipelineRunner作为新的Service层编排Agent调用。

### 第二阶段（P1）：增强Agent深度 + 自然语言入口

```
AutomatonChat → NL Router → Intent → PipelineRunner → Agent Chain
                                              ↓
                                    DaemonService（后台执行）
```

### 第三阶段（P2-P3）：生态开放

```
Monorepo: packages/core + packages/cli + packages/studio + packages/skill
Core被CLI和Studio共用，发布为OpenClaw Skill
```

---

## 关键设计决策

1. **Entity模型 vs 真相文件**：保留工坊的Entity & StateEvent架构，它是比InkOS的7个markdown文件更统一的数据模型。Observer→Settler的输出直接映射为StateEvent delta。

2. **Pipeline编排在前端**：工坊没有Node.js后端（Tauri是Rust），PipelineRunner在前端Pinia store中实现，通过Tauri IPC调用LLM。

3. **审计维度可配置**：不同题材启用不同审计维度（参考InkOS的GenreProfile驱动审计配置）。

4. **三模式可切换**：auto/semi/manual三种自动化程度，用户根据信任度选择。

5. **可视化是差异化**：即使转向全自动工厂，关系图、势力图、命运织布机仍是区别于InkOS的核心卖点，应继续强化。

---

*报告完毕。以上分析基于对InkOS v1.4.1源码（packages/core/src/agents/、pipeline/、interaction/、state/）和工坊v5.0源码的深入阅读。*
