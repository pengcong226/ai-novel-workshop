# AI小说工坊 — 系统测试用例报告

| 项目 | 信息 |
|------|------|
| 项目名称 | AI小说工坊（ai-novel-workshop） |
| 文档版本 | V1.0 |
| 编写日期 | 2026-05-28 |
| 测试阶段 | 系统测试（第一阶段：测试用例报告） |
| 覆盖模块 | 12个核心功能模块 |
| 用例总数 | 186条 |

---

## 一、需求依据

本测试用例报告基于以下需求与设计文档生成：

| 文档 | 路径 | 说明 |
|------|------|------|
| 产品需求文档 | `docs/requirements.md` | 功能需求、用户故事、验收标准 |
| 架构设计文档 | `docs/architecture.md` | 系统架构、技术选型、模块划分 |
| 质量检查系统说明 | `docs/质量检查系统说明.md` | 33维度审计体系、评分规则、通过阈值 |
| AI集成设计文档 | `docs/ai-integration-design.md` | AI模型调用、Agent编排、上下文组装 |
| 审阅工作流文档 | `docs/review-workflow.md` | 审计-修订循环、快照管理、回滚机制 |

---

## 二、代码功能模块概览

| 序号 | 模块名称 | 核心文件路径 | 代码行数 | 职责说明 |
|------|----------|-------------|---------|---------|
| 1 | 10-Agent Pipeline编排 | `src/agents/AgentOrchestrator.ts` | ~100 | Agent注册、按阶段按优先级顺序执行、中断控制 |
| 2 | Pipeline Runner流水线 | `src/services/pipeline/PipelineRunner.ts` | ~635 | 10阶段流水线编排：prepare→plan→compose→write→normalize→audit→revise→settle→analyze→promote-hooks |
| 3 | 审计-修订循环 | `src/services/pipeline/ChapterReviewCycle.ts` | ~367 | PostWriteValidator→敏感词检查→ContinuityAuditor→聚合→快照→停止判断→修订循环→最佳版本选择 |
| 4 | 快照管理器 | `src/services/pipeline/SnapshotManager.ts` | ~447 | 版本快照追踪、最佳版本识别、净改进判断、停止条件检查、回滚决策 |
| 5 | 审计结果聚合器 | `src/services/pipeline/AuditResultAggregator.ts` | ~413 | 33维度加权评分、缺失维度推断、critical维度硬封顶(70分)、别名映射 |
| 6 | 批量续写调度器 | `src/services/pipeline/BatchContinueScheduler.ts` | ~576 | 多章节编排、暂停/恢复/取消、Token预算控制、每日限额、检查点、连续失败暂停 |
| 7 | 后台守护服务 | `src/services/DaemonService.ts` | ~811 | 三种运行模式(auto/semi/manual)、安全门控、定时调度、费用估算、章节持久化 |
| 8 | 连续性审计员 | `src/agents/ContinuityAuditor.ts` | ~555 | 16维度LLM审计、确定性检查(AI标记词/段落均匀度)、题材维度扩展、回退机制 |
| 9 | 观察者Agent | `src/agents/ObserverAgent.ts` | ~523 | 9类事实提取、"宁多勿漏"原则、实体提及计数、置信度校验 |
| 10 | 风格分析器 | `src/agents/StyleAnalyzerAgent.ts` | ~631 | 5维风格指纹(句式/词汇/修辞/节奏/AI特征)、3种分析深度、确定性+LLM混合分析 |
| 11 | AIGC检测服务 | `src/services/AIGCDetector.ts` | ~452 | 3种检测模式(GPTZero/Originality/本地)、5项本地指标、段落级标注、批量检测 |
| 12 | 平台导出器 | `src/utils/exporters/platformExporter.ts` | ~384 | 5平台格式(起点/番茄/刺猬猫/晋江/通用)、字数校验、禁止模式检测、自动截断 |

**附加覆盖模块**：
- 同人创作服务 `src/services/FanficService.ts`（4种模式：canon/au/ooc/cp）
- 自然语言命令路由 `src/assistant/commands/inputRouter.ts`、`src/assistant/commands/builtinCommands.ts`

---

## 三、需求与代码差异说明

### 3.1 PRD 已覆盖但代码实现存在风险的区域

| 差异项 | PRD描述 | 代码实现情况 | 风险等级 |
|--------|--------|-------------|---------|
| 审计维度完整性 | PRD要求33维度全覆盖 | 代码中仅定义16个维度(AUDIT_DIMENSIONS)，其余17个依赖LLM自行推断 | 高 |
| 审计通过阈值 | PRD描述>=85分通过 | 代码实现与PRD一致，但critical维度<60时硬封顶70分的逻辑在PRD中未明确 | 中 |
| Pipeline错误恢复 | PRD要求单阶段失败不阻断全局 | Phase 7(settle)有try-catch保护，Phase 1/2/3无独立容错 | 高 |

### 3.2 PRD 未覆盖的代码功能模块

| 功能模块 | 代码位置 | 说明 |
|----------|---------|------|
| 同人创作服务(FanficService) | `src/services/FanficService.ts` | 4种同人模式(canon/au/ooc/cp)，PRD中未定义同人功能需求 |
| 自然语言命令(inputRouter/builtinCommands) | `src/assistant/commands/` | help和review命令路由，PRD未涵盖 |
| 短篇小说Runner(ShortFictionRunner) | `src/services/pipeline/ShortFictionRunner.ts` | 3阶段短篇流程(outline→writing→assembly)，含自动review |
| 风格分析器(StyleAnalyzerAgent) | `src/agents/StyleAnalyzerAgent.ts` | 5维风格指纹分析，3种分析深度(quick/standard/deep) |
| AIGC检测服务(AIGCDetector) | `src/services/AIGCDetector.ts` | 3种检测提供商，5项本地检测指标 |
| 平台格式导出(platformExporter) | `src/utils/exporters/platformExporter.ts` | 5平台格式适配，PRD未要求平台导出功能 |
| 观察者Agent(ObserverAgent) | `src/agents/ObserverAgent.ts` | 9类事实提取，"宁多勿漏"原则 |
| Agent编排器(AgentOrchestrator) | `src/agents/AgentOrchestrator.ts` | 通用Agent注册/执行/中断框架，PRD未定义编排机制 |
| 快照回滚机制(SnapshotManager) | `src/services/pipeline/SnapshotManager.ts` | 版本快照追踪、净改进阈值(epsilon=3)、回滚到最佳版本 |

---

## 四、测试用例

### 用例优先级定义

| 优先级 | 说明 |
|--------|------|
| **P0** | 核心流程/阻断性功能，必须通过 |
| **P1** | 重要功能/边界条件，应当通过 |
| **P2** | 辅助功能/异常场景，建议通过 |

---

### 模块1：10-Agent Pipeline编排（AgentOrchestrator）

**文件路径**：`src/agents/AgentOrchestrator.ts`

#### TC-1.1 Agent注册与阶段过滤

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.1 |
| **优先级** | P0 |
| **前置条件** | 创建AgentOrchestrator实例，注册多个不同阶段的Agent |
| **测试步骤** | 1. 注册planner(pre-generation)、editor(post-generation)、composer(composition)三个Agent<br>2. 调用runPhase('pre-generation', context)<br>3. 检查执行结果 |
| **预期结果** | 仅planner被执行，editor和composer不被触发；PhaseRunResult.status='success'，results数组长度为1 |

#### TC-1.2 优先级排序执行

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.2 |
| **优先级** | P0 |
| **前置条件** | 注册同一阶段的3个Agent，priority分别为1、5、10 |
| **测试步骤** | 1. 调用runPhase执行该阶段<br>2. 通过onTrace回调记录执行顺序 |
| **预期结果** | 3个Agent按priority 1→5→10顺序依次执行 |

#### TC-1.3 Agent未注册时的容错

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.3 |
| **优先级** | P1 |
| **前置条件** | 配置中包含一个enabled的Agent role，但未注册该Agent实例 |
| **测试步骤** | 1. 配置config中role='sentinel', enabled=true<br>2. 不注册sentinel Agent<br>3. 调用runPhase |
| **预期结果** | 不抛出异常；results中该Agent status='failed'，message包含'Agent not registered'；PhaseRunResult.status='partial'或'failed' |

#### TC-1.4 shouldHalt中断执行

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.4 |
| **优先级** | P0 |
| **前置条件** | 注册同一阶段的3个Agent，第1个Agent返回shouldHalt=true |
| **测试步骤** | 1. 调用runPhase执行该阶段<br>2. 第1个Agent返回shouldHalt=true的结果 |
| **预期结果** | 第2、3个Agent不被执行；PhaseRunResult.status='halted' |

#### TC-1.5 无匹配Agent时返回skipped

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.5 |
| **优先级** | P1 |
| **前置条件** | 没有任何Agent的phase和enabled匹配目标阶段 |
| **测试步骤** | 1. 调用runPhase('settlement', context) |
| **预期结果** | PhaseRunResult.status='skipped'，results为空数组 |

#### TC-1.6 Agent执行抛异常时的处理

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.6 |
| **优先级** | P1 |
| **前置条件** | Agent的execute方法抛出Error |
| **测试步骤** | 1. 注册一个execute抛出异常的Agent<br>2. 调用runPhase |
| **预期结果** | 不崩溃；该Agent结果status='failed'，message为错误信息；后续Agent仍继续执行 |

#### TC-1.7 Trace事件回调

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-1.7 |
| **优先级** | P2 |
| **前置条件** | 创建时传入onTrace回调函数 |
| **测试步骤** | 1. 注册Agent并执行runPhase<br>2. 检查onTrace调用参数 |
| **预期结果** | 每个Agent执行前后各收到一次Trace事件(running→completed/failed)，包含role、phase、status、durationMs、timestamp |

---

### 模块2：Pipeline Runner流水线（PipelineRunner）

**文件路径**：`src/services/pipeline/PipelineRunner.ts`

#### TC-2.1 完整10阶段流水线执行

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.1 |
| **优先级** | P0 |
| **前置条件** | 有效的Project对象（含章节大纲、角色、世界观等完整数据），PipelineRunner使用默认配置 |
| **测试步骤** | 1. 调用writeNextChapter({project, chapterNumber: 1})<br>2. 检查返回结果 |
| **预期结果** | ChapterPipelineResult.status='ready-for-review'；content非空；wordCount>0；auditResult含overallScore和dimensionScores；tokenUsage各Agent维度有数值；durationMs>0 |

#### TC-2.2 Phase 0 准备阶段——输入提取

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.2 |
| **优先级** | P0 |
| **前置条件** | Project含已有章节（用于提取hookPool、recentSummaries） |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过onStageProgress回调检查'prepare'阶段 |
| **预期结果** | prepare阶段被触发；hookPool、recentSummaries、chapterOutline正确提取；lengthSpec根据targetWordCount正确构建 |

#### TC-2.3 Phase 1 规划阶段——ChapterIntent和Memo生成

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.3 |
| **优先级** | P0 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过onAgentTrace检查'plan'阶段 |
| **预期结果** | planner Agent被调用；生成ChapterIntent（含goal）和ChapterMemo；tokenUsage.planner有数值 |

#### TC-2.4 Phase 2 组装阶段——ContextPackage和RuleStack

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.4 |
| **优先级** | P0 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过onAgentTrace检查'compose'阶段 |
| **预期结果** | ComposerAgent被调用；生成ContextPackage和RuleStack；recentChapters被填充 |

#### TC-2.5 Phase 3 写作阶段——正文生成

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.5 |
| **优先级** | P0 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过onAgentTrace检查'write'阶段 |
| **预期结果** | Writer Agent被调用；输出内容content非空；wordCount与content实际字数一致 |

#### TC-2.6 Phase 4 字数标准化——enableLengthNormalization=true

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.6 |
| **优先级** | P0 |
| **前置条件** | enableLengthNormalization=true，targetWordCount=2000 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过日志检查normalize阶段 |
| **预期结果** | LengthNormalizer被调用；如原文字数超出softMin-softMax范围，content被调整至规范范围；tokenUsage.normalizer有数值 |

#### TC-2.7 Phase 4 字数标准化——enableLengthNormalization=false

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.7 |
| **优先级** | P1 |
| **前置条件** | enableLengthNormalization=false |
| **测试步骤** | 1. 执行writeNextChapter |
| **预期结果** | normalize阶段被跳过；tokenUsage.normalizer全为0 |

#### TC-2.8 Phase 5-6 审计修订循环——调用ChapterReviewCycle

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.8 |
| **优先级** | P0 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 检查reviewResult |
| **预期结果** | ChapterReviewCycle.execute被调用；reviewResult含finalContent、iterations、rolledBack、sensitiveWordBlocked字段；auditResult被正确赋值 |

#### TC-2.9 敏感词阻断时的处理

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.9 |
| **优先级** | P0 |
| **前置条件** | 章节内容包含敏感词，触发sensitiveWordBlocked=true |
| **测试步骤** | 1. 模拟敏感词触发场景<br>2. 执行writeNextChapter |
| **预期结果** | 日志输出"敏感词阻断，章节生成失败"警告；ChapterPipelineResult.status='audit-failed'或相关失败状态 |

#### TC-2.10 Phase 7 状态沉淀——成功场景

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.10 |
| **优先级** | P0 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 通过onAgentTrace检查'settle'阶段 |
| **预期结果** | StateSettler被调用；输出newEntities、newStateEvents、chapterSummary；tokenUsage.settler有数值 |

#### TC-2.11 Phase 7 状态沉淀——失败不阻断

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.11 |
| **优先级** | P1 |
| **前置条件** | StateSettler.settle抛出异常 |
| **测试步骤** | 1. 模拟settle失败<br>2. 执行writeNextChapter |
| **预期结果** | 流水线不中断；Phase 8(analyze)和Phase 9(promote-hooks)继续执行；Trace事件中settle阶段status='failed' |

#### TC-2.12 Phase 8 章节分析

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.12 |
| **优先级** | P1 |
| **前置条件** | 有效项目配置 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 检查analyze阶段 |
| **预期结果** | ChapterAnalyzer被调用；tokenUsage.analyzer有数值 |

#### TC-2.13 Phase 9 伏笔升级

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.13 |
| **优先级** | P1 |
| **前置条件** | enableHookPromotion=true，项目中有伏笔数据 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 检查promote-hooks阶段 |
| **预期结果** | HookPromoter被调用；过期/陈旧伏笔被标记或推进 |

#### TC-2.14 enableHookPromotion=false

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.14 |
| **优先级** | P2 |
| **前置条件** | enableHookPromotion=false |
| **测试步骤** | 1. 执行writeNextChapter |
| **预期结果** | promote-hooks阶段被跳过 |

#### TC-2.15 回滚到最优快照版本

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.15 |
| **优先级** | P0 |
| **前置条件** | 审计修订循环中，修订后版本评分低于初始版本（触发回滚） |
| **测试步骤** | 1. 模拟修订后score降低场景<br>2. 执行writeNextChapter |
| **预期结果** | reviewResult.rolledBack=true；currentContent被回滚到评分更高的初始版本；日志输出"已回滚到最优快照版本" |

#### TC-2.16 温度递增重试

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.16 |
| **优先级** | P1 |
| **前置条件** | PipelineConfig配置temperatureBase=0.7, temperatureRetryStep=0.1, maxTemperature=1.2 |
| **测试步骤** | 1. 多次触发修订重试<br>2. 检查每次Writer使用的temperature |
| **预期结果** | 温度依次为0.7→0.8→0.9…→1.2（不超过maxTemperature） |

#### TC-2.17 Token用量汇总

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.17 |
| **优先级** | P1 |
| **前置条件** | 完整执行writeNextChapter |
| **测试步骤** | 1. 检查返回结果的tokenUsage字段 |
| **预期结果** | tokenUsage含planner、composer、writer、normalizer、auditor、reviser、settler、analyzer各维度，数值>=0；总和与sumTokenUsages()一致 |

#### TC-2.18 进度回调与Trace事件完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.18 |
| **优先级** | P2 |
| **前置条件** | 配置onStageProgress和onAgentTrace回调 |
| **测试步骤** | 1. 执行writeNextChapter<br>2. 记录所有回调 |
| **预期结果** | onStageProgress至少触发9次（prepare/plan/compose/write/normalize/audit/settle/analyze/promote-hooks）；onAgentTrace覆盖各Agent执行状态 |

#### TC-2.19 流水线异常处理——整体错误

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-2.19 |
| **优先级** | P0 |
| **前置条件** | Phase 1(plan)阶段抛出不可恢复异常 |
| **测试步骤** | 1. 模拟PlannerAgent异常<br>2. 执行writeNextChapter |
| **预期结果** | 不崩溃；返回ChapterPipelineResult.status='audit-failed'或'failed'；auditResult.overallScore=0；error信息包含在结果中 |

---

### 模块3：审计-修订循环（ChapterReviewCycle）

**文件路径**：`src/services/pipeline/ChapterReviewCycle.ts`

#### TC-3.1 正常审计通过（首次即通过）

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.1 |
| **优先级** | P0 |
| **前置条件** | 初始内容质量高，审计评分>=85且无critical问题 |
| **测试步骤** | 1. 调用ChapterReviewCycle.execute(input)<br>2. 检查结果 |
| **预期结果** | iterations=0（无修订迭代）；rolledBack=false；finalContent=原始内容；aggregatedReport.overallScore>=85 |

#### TC-3.2 初始不通过→修订后通过

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.2 |
| **优先级** | P0 |
| **前置条件** | 初始审计评分<85，修订后评分>=85 |
| **测试步骤** | 1. 模拟初始评分70<br>2. 模拟修订后评分88<br>3. 调用execute |
| **预期结果** | iterations>=1；finalContent为修订后内容；aggregatedReport.overallScore>=85 |

#### TC-3.3 多次修订均不通过——达到maxRetries上限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.3 |
| **优先级** | P0 |
| **前置条件** | maxRetries=1，初始评分<85，修订后评分仍<85 |
| **测试步骤** | 1. 模拟初始评分65<br>2. 模拟修订后评分68<br>3. 调用execute |
| **预期结果** | iterations=1；rolledBack可能为true（回滚到较优版本）；返回最优快照内容 |

#### TC-3.4 敏感词阻断——立即终止循环

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.4 |
| **优先级** | P0 |
| **前置条件** | PostWriteValidator检测到敏感词critical级别问题 |
| **测试步骤** | 1. 输入包含敏感词的内容<br>2. 调用execute |
| **预期结果** | sensitiveWordBlocked=true；不执行后续审计-修订循环；iterations=0；postWriteIssues包含sensitive_word类别问题 |

#### TC-3.5 快照回滚——修订后评分低于初始版本

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.5 |
| **优先级** | P0 |
| **前置条件** | 初始评分80，修订后评分75 |
| **测试步骤** | 1. 调用execute<br>2. 检查rolledBack标志 |
| **预期结果** | rolledBack=true；finalContent回滚到初始版本（评分80的快照）；snapshotReport.scoreProgression=[80, 75] |

#### TC-3.6 净改进阈值epsilon测试——改进不足时停止

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.6 |
| **优先级** | P0 |
| **前置条件** | netImprovementEpsilon=3，初始评分80，修订后评分82（差值2<阈值3） |
| **测试步骤** | 1. 调用execute<br>2. 检查是否停止迭代 |
| **预期结果** | shouldStop判定为停止（净改进不足）；不进行进一步迭代 |

#### TC-3.7 净改进阈值epsilon测试——改进足够时继续

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.7 |
| **优先级** | P1 |
| **前置条件** | netImprovementEpsilon=3，初始评分80，修订后评分85（差值5>阈值3），且修订后评分<85阈值 |
| **测试步骤** | 1. maxRetries>=2<br>2. 调用execute |
| **预期结果** | 继续进行下一轮迭代 |

#### TC-3.8 PostWriteValidator步骤完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.8 |
| **优先级** | P1 |
| **前置条件** | 正常输入 |
| **测试步骤** | 1. 调用execute<br>2. 检查postWriteIssues |
| **预期结果** | PostWriteValidator先于ContinuityAuditor执行；postWriteIssues非null（可能为空数组） |

#### TC-3.9 审计结果聚合器调用验证

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.9 |
| **优先级** | P1 |
| **前置条件** | 正常输入 |
| **测试步骤** | 1. 调用execute<br>2. 检查aggregatedReport |
| **预期结果** | aggregatedReport含overallScore、dimensionScores、passed字段；dimensionScores覆盖16个维度 |

#### TC-3.10 Token用量累计

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.10 |
| **优先级** | P2 |
| **前置条件** | 正常输入 |
| **测试步骤** | 1. 调用execute<br>2. 检查tokenUsage |
| **预期结果** | tokenUsage含inputTokens、outputTokens、totalTokens；累计了auditor和reviser的消耗 |

#### TC-3.11 空内容输入

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-3.11 |
| **优先级** | P1 |
| **前置条件** | chapterContent为空字符串 |
| **测试步骤** | 1. 调用execute({chapterContent: '', chapterNumber: 1}) |
| **预期结果** | 不崩溃；敏感词检查通过或以默认值处理；最终返回合理的ReviewCycleResult |

---

### 模块4：快照管理器（SnapshotManager）

**文件路径**：`src/services/pipeline/SnapshotManager.ts`

#### TC-4.1 添加快照与索引

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.1 |
| **优先级** | P0 |
| **前置条件** | 新建SnapshotManager实例 |
| **测试步骤** | 1. addSnapshot({score:80, iteration:0, ...})<br>2. addSnapshot({score:85, iteration:1, ...})<br>3. 检查size |
| **预期结果** | size=2；第1次返回index=0，第2次返回index=1 |

#### TC-4.2 最佳快照识别——最高分

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.2 |
| **优先级** | P0 |
| **前置条件** | 添加快照：score=[75, 88, 82] |
| **测试步骤** | 1. 调用getBestSnapshot() |
| **预期结果** | 返回score=88的快照（index=1） |

#### TC-4.3 最佳快照识别——同分取较晚版本

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.3 |
| **优先级** | P0 |
| **前置条件** | 添加快照：score=[85, 80, 85] |
| **测试步骤** | 1. 调用getBestSnapshot() |
| **预期结果** | 返回index=2的快照（较晚版本的85分） |

#### TC-4.4 停止条件——通过阈值

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.4 |
| **优先级** | P0 |
| **前置条件** | 最新快照score=90（>=85阈值），无critical问题 |
| **测试步骤** | 1. 调用shouldStop() |
| **预期结果** | stop=true；reason包含"已通过" |

#### TC-4.5 停止条件——仅有初始快照

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.5 |
| **优先级** | P0 |
| **前置条件** | 只有1个快照（初始草稿），score=70 |
| **测试步骤** | 1. 调用shouldStop() |
| **预期结果** | stop=true；reason包含"仅有初始草稿" |

#### TC-4.6 停止条件——无净改进

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.6 |
| **优先级** | P0 |
| **前置条件** | 快照序列score=[80, 82]，epsilon=3，delta=2<3 |
| **测试步骤** | 1. 调用shouldStop() |
| **预期结果** | stop=true；reason包含"无净改进" |

#### TC-4.7 停止条件——内容为空

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.7 |
| **优先级** | P1 |
| **前置条件** | 最新快照content为空字符串 |
| **测试步骤** | 1. 调用shouldStop() |
| **预期结果** | stop=true；reason包含"内容为空" |

#### TC-4.8 停止条件——敏感词critical问题

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.8 |
| **优先级** | P0 |
| **前置条件** | 最新快照auditResult.issues含severity='critical'、category='sensitive_word'的问题 |
| **测试步骤** | 1. 调用shouldStop() |
| **预期结果** | stop=true；reason包含"敏感词" |

#### TC-4.9 停止条件——达到最大迭代次数

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.9 |
| **优先级** | P1 |
| **前置条件** | 快照数达到maxIterations |
| **测试步骤** | 1. 调用shouldStop(maxIterations=3)且已有3个快照 |
| **预期结果** | stop=true；reason包含"最大迭代" |

#### TC-4.10 getFinalContent回滚逻辑

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.10 |
| **优先级** | P0 |
| **前置条件** | 快照score=[88, 75]（最新版本分数低于最佳版本） |
| **测试步骤** | 1. 调用getFinalContent() |
| **预期结果** | 返回score=88的快照内容（最佳版本），而非score=75的最新版本 |

#### TC-4.11 hasNetImprovement边界——恰好等于epsilon

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.11 |
| **优先级** | P1 |
| **前置条件** | 前一最佳score=80，最新score=83，epsilon=3 |
| **测试步骤** | 1. 调用hasNetImprovement() |
| **预期结果** | 返回true（delta=3 >= epsilon=3，等号成立视为有改进） |

#### TC-4.12 generateReport报告完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.12 |
| **优先级** | P1 |
| **前置条件** | 添加3个快照 |
| **测试步骤** | 1. 调用generateReport() |
| **预期结果** | report含totalSnapshots=3、bestSnapshotIndex、bestScore、worstScore、scoreProgression（长度3）、comparisons（长度2） |

#### TC-4.13 clear清空操作

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-4.13 |
| **优先级** | P2 |
| **前置条件** | 已添加若干快照 |
| **测试步骤** | 1. 调用clear()<br>2. 检查size |
| **预期结果** | size=0；getAllSnapshots()返回空数组 |

---

### 模块5：审计结果聚合器（AuditResultAggregator）

**文件路径**：`src/services/pipeline/AuditResultAggregator.ts`

#### TC-5.1 全维度评分聚合——加权总分计算

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.1 |
| **优先级** | P0 |
| **前置条件** | AuditResult含全部16个维度的评分 |
| **测试步骤** | 1. 调用aggregate(auditResult, options) |
| **预期结果** | overallScore为加权平均结果；dimensionScores覆盖全部16个维度；passed根据overallScore>=85且无critical问题判定 |

#### TC-5.2 缺失维度推断——无问题时默认90分

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.2 |
| **优先级** | P0 |
| **前置条件** | AuditResult中某些维度缺失，且这些问题对应维度无任何issue |
| **测试步骤** | 1. aggregate中调用inferDimensionScore |
| **预期结果** | 缺失维度默认评分=90 |

#### TC-5.3 缺失维度推断——1个critical问题→50分

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.3 |
| **优先级** | P0 |
| **前置条件** | 某维度有1个critical级别issue |
| **测试步骤** | 1. 检查该维度推断评分 |
| **预期结果** | 评分=50 |

#### TC-5.4 缺失维度推断——2个以上critical问题→30分

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.4 |
| **优先级** | P0 |
| **前置条件** | 某维度有2个critical级别issue |
| **测试步骤** | 1. 检查该维度推断评分 |
| **预期结果** | 评分=30 |

#### TC-5.5 缺失维度推断——warning扣分（下限40）

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.5 |
| **优先级** | P1 |
| **前置条件** | 某维度有5个warning issue（90 - 5*10 = 40） |
| **测试步骤** | 1. 检查该维度推断评分 |
| **预期结果** | 评分=40（不低于下限） |

#### TC-5.6 缺失维度推断——warning过多时不低于下限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.6 |
| **优先级** | P1 |
| **前置条件** | 某维度有8个warning issue（90 - 8*10 = 10，但下限为40） |
| **测试步骤** | 1. 检查该维度推断评分 |
| **预期结果** | 评分=40（下限保护） |

#### TC-5.7 Critical维度硬封顶——评分<60时总分上限70

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.7 |
| **优先级** | P0 |
| **前置条件** | ooc维度评分=45（<60），其余维度评分>=90 |
| **测试步骤** | 1. 调用aggregate |
| **预期结果** | overallScore被硬封顶为70，即使加权平均>70 |

#### TC-5.8 Critical维度硬封顶——多个critical维度低分

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.8 |
| **优先级** | P0 |
| **前置条件** | ooc=40, timeline=50（均<60） |
| **测试步骤** | 1. 调用aggregate |
| **预期结果** | overallScore<=70 |

#### TC-5.9 Critical维度正常时不受封顶影响

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.9 |
| **优先级** | P1 |
| **前置条件** | 所有critical维度评分>=60 |
| **测试步骤** | 1. 调用aggregate |
| **预期结果** | overallScore不被硬封顶，按加权计算 |

#### TC-5.10 别名映射——LLM输出变体正确映射

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.10 |
| **优先级** | P1 |
| **前置条件** | LLM返回issue.category='OOC检查'或'角色一致性' |
| **测试步骤** | 1. aggregate中category映射 |
| **预期结果** | 正确映射到'ooc'维度ID |

#### TC-5.11 别名映射——所有CATEGORY_ALIAS_MAP覆盖

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.11 |
| **优先级** | P1 |
| **前置条件** | 分别使用各别名（如'时间线'、'设定矛盾'、'战力崩坏'等） |
| **测试步骤** | 1. 逐一验证映射结果 |
| **预期结果** | 全部16个维度的别名均正确映射到标准ID |

#### TC-5.12 passed判定——分数>=85且无critical问题

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.12 |
| **优先级** | P0 |
| **前置条件** | overallScore=86，criticalIssues=[] |
| **测试步骤** | 1. 检查passed字段 |
| **预期结果** | passed=true |

#### TC-5.13 passed判定——分数>=85但有critical问题

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.13 |
| **优先级** | P0 |
| **前置条件** | overallScore=90，但criticalIssues非空 |
| **测试步骤** | 1. 检查passed字段 |
| **预期结果** | passed=false |

#### TC-5.14 summary摘要生成

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-5.14 |
| **优先级** | P2 |
| **前置条件** | 正常聚合结果 |
| **测试步骤** | 1. 检查summary字段 |
| **预期结果** | summary为可读中文文本；包含总体评分、通过/未通过状态、薄弱环节（score<70的维度）、优秀维度（score>=90） |

---

### 模块6：批量续写调度器（BatchContinueScheduler）

**文件路径**：`src/services/pipeline/BatchContinueScheduler.ts`

#### TC-6.1 单章续写成功

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.1 |
| **优先级** | P0 |
| **前置条件** | 有效PipelineRunner和项目 |
| **测试步骤** | 1. 调用continueWriting({chapterCount:1, autoSave:true}) |
| **预期结果** | completedChapters=1；results长度=1；cancelled=false |

#### TC-6.2 多章连续续写

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.2 |
| **优先级** | P0 |
| **前置条件** | 有效项目 |
| **测试步骤** | 1. 调用continueWriting({chapterCount:5, autoSave:true}) |
| **预期结果** | completedChapters=5；每章间有COOLDOWN_MS=2000ms冷却；5个ChapterPipelineResult全部正常 |

#### TC-6.3 暂停与恢复

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.3 |
| **优先级** | P0 |
| **前置条件** | 正在进行批量续写 |
| **测试步骤** | 1. 调用continueWriting({chapterCount:10})<br>2. 第3章完成后调用pause()<br>3. 检查状态<br>4. 调用resume() |
| **预期结果** | pause后暂停续写；resume后继续从下一章开始；最终completedChapters=10 |

#### TC-6.4 取消操作

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.4 |
| **优先级** | P0 |
| **前置条件** | 正在进行批量续写 |
| **测试步骤** | 1. 调用continueWriting({chapterCount:10})<br>2. 第2章完成后调用cancel() |
| **预期结果** | 批量任务终止；BatchContinueResult.cancelled=true；completedChapters=2 |

#### TC-6.5 Token预算控制——单章超限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.5 |
| **优先级** | P0 |
| **前置条件** | maxTokenPerChapter=150000 |
| **测试步骤** | 1. 某章Token消耗超过150000 |
| **预期结果** | 该章被标记为失败；触发onError回调；后续章节不受影响继续执行 |

#### TC-6.6 Token预算控制——总预算超限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.6 |
| **优先级** | P0 |
| **前置条件** | maxTotalTokens=5000000 |
| **测试步骤** | 1. 累计Token接近5000000<br>2. 检查下一章是否被允许执行 |
| **预期结果** | 超过总预算时后续章节不再执行；已完成的章节结果被保留 |

#### TC-6.7 Token预警阈值触发

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.7 |
| **优先级** | P1 |
| **前置条件** | alertThreshold=0.8 |
| **测试步骤** | 1. 累计Token达到总预算的80% |
| **预期结果** | 日志输出Token使用预警信息（百分比） |

#### TC-6.8 连续失败暂停

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.8 |
| **优先级** | P0 |
| **前置条件** | PAUSE_AFTER_CONSECUTIVE_FAILURES=3 |
| **测试步骤** | 1. 连续3章Pipeline执行失败 |
| **预期结果** | 自动暂停批量任务；进度事件包含'batch-paused'；后续章节不执行 |

#### TC-6.9 检查点回调

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.9 |
| **优先级** | P1 |
| **前置条件** | checkpointInterval=3 |
| **测试步骤** | 1. 每3章触发onCheckpoint回调<br>2. 回调返回true（继续） |
| **预期结果** | 每3章触发一次onCheckpoint；传入已完成结果数组；返回true时继续，返回false时停止 |

#### TC-6.10 章节完成回调

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.10 |
| **优先级** | P1 |
| **前置条件** | 配置onChapterComplete回调 |
| **测试步骤** | 1. 每章完成后检查回调 |
| **预期结果** | 每章完成时触发onChapterComplete(result, index)；result为ChapterPipelineResult |

#### TC-6.11 进度事件完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.11 |
| **优先级** | P2 |
| **前置条件** | 配置onProgress回调 |
| **测试步骤** | 1. 续写3章<br>2. 记录所有进度事件 |
| **预期结果** | 事件类型覆盖chapter-start、chapter-complete、stage-start、stage-complete、batch-complete；progress百分比递增 |

#### TC-6.12 directionPrompt方向引导

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.12 |
| **优先级** | P2 |
| **前置条件** | 传入directionPrompt |
| **测试步骤** | 1. continueWriting({chapterCount:2, directionPrompt:'引入新角色'}) |
| **预期结果** | directionPrompt传递至PipelineRunner；影响章节内容生成方向 |

#### TC-6.13 waitIfPaused安全超时

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-6.13 |
| **优先级** | P1 |
| **前置条件** | 调用pause()后长时间未resume |
| **测试步骤** | 1. pause()<br>2. 等待超过1秒安全超时 |
| **预期结果** | waitIfPaused有1秒安全超时防止死锁；不会无限阻塞 |

---

### 模块7：后台守护服务（DaemonService）

**文件路径**：`src/services/DaemonService.ts`

#### TC-7.1 三种运行模式初始化

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.1 |
| **优先级** | P0 |
| **前置条件** | 无 |
| **测试步骤** | 1. 分别以mode='auto'/'semi'/'manual'创建DaemonService实例<br>2. 检查state.status |
| **预期结果** | auto模式：初始化后idle，定时触发；semi模式：需确认后执行；manual模式：仅手动触发 |

#### TC-7.2 安全门控——每日章节上限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.2 |
| **优先级** | P0 |
| **前置条件** | maxChaptersPerDay=50，今日已完成50章 |
| **测试步骤** | 1. 调用checkSafetyGates() |
| **预期结果** | {allowed: false, reason: '每日章节数已达上限'}；state中chaptersCompletedToday=50 |

#### TC-7.3 安全门控——每日Token上限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.3 |
| **优先级** | P0 |
| **前置条件** | maxTokenPerDay=5000000，今日Token消耗已达上限 |
| **测试步骤** | 1. 调用checkSafetyGates() |
| **预期结果** | {allowed: false, reason: '每日Token消耗已达上限'} |

#### TC-7.4 安全门控——每日费用上限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.4 |
| **优先级** | P0 |
| **前置条件** | maxCostPerDayUSD=5，估算费用已达$5 |
| **测试步骤** | 1. 调用checkSafetyGates() |
| **预期结果** | {allowed: false, reason: '每日费用已达上限'} |

#### TC-7.5 安全门控——连续失败暂停

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.5 |
| **优先级** | P0 |
| **前置条件** | consecutiveFailureThreshold=3，连续失败3次 |
| **测试步骤** | 1. 模拟连续3次chapter-failed事件 |
| **预期结果** | DaemonState.status='paused'；触发'paused'事件；后续不自动执行 |

#### TC-7.6 安全门控——单次会话章节数上限

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.6 |
| **优先级** | P1 |
| **前置条件** | maxChaptersPerSession=10 |
| **测试步骤** | 1. 本次会话已完成10章<br>2. 尝试再执行 |
| **预期结果** | 本次会话不再执行新章节 |

#### TC-7.7 费用估算准确性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.7 |
| **优先级** | P1 |
| **前置条件** | 已知Token消耗量 |
| **测试步骤** | 1. 使用estimateCostUSD(100000) |
| **预期结果** | 结果=100000/1000*0.002=$0.20 |

#### TC-7.8 章节持久化——saveChapter方法

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.8 |
| **优先级** | P1 |
| **前置条件** | 项目存储有saveChapter方法 |
| **测试步骤** | 1. 执行一章Pipeline完成 |
| **预期结果** | 自动调用saveChapter保存章节数据（number、title、content、wordCount、status等） |

#### TC-7.9 章节持久化——存储方法不存在时的降级

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.9 |
| **优先级** | P1 |
| **前置条件** | 项目存储没有saveChapter或updateChapter方法 |
| **测试步骤** | 1. 执行Pipeline完成 |
| **预期结果** | 不崩溃；日志输出警告"未找到保存/更新章节的方法"；主流程不受影响 |

#### TC-7.10 事件通知系统

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.10 |
| **优先级** | P1 |
| **前置条件** | 注册DaemonEventListener |
| **测试步骤** | 1. 执行DaemonService生命周期（启动→运行→暂停→恢复→停止） |
| **预期结果** | 事件依次为started→chapter-start→chapter-complete→paused→resumed→stopped；每个事件含state快照和timestamp |

#### TC-7.11 动态import避免循环依赖

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-7.11 |
| **优先级** | P2 |
| **前置条件** | 正常初始化 |
| **测试步骤** | 1. 检查DaemonService中PipelineRunner和BatchContinueScheduler的导入方式 |
| **预期结果** | 使用动态import()而非静态import，避免循环依赖 |

---

### 模块8：连续性审计员（ContinuityAuditor）

**文件路径**：`src/agents/ContinuityAuditor.ts`

#### TC-8.1 16维度审计维度完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.1 |
| **优先级** | P0 |
| **前置条件** | 无 |
| **测试步骤** | 1. 检查AUDIT_DIMENSIONS数组 |
| **预期结果** | 共16个维度；7个critical(ooc/timeline/lore/power/info-leak/memo-deviation/format)；6个warning(numbers/hooks/pacing/style/sidekick-dumb/pov)；3个info(word-fatigue/cliche/paragraph-length) |

#### TC-8.2 Critical维度权重正确

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.2 |
| **优先级** | P0 |
| **前置条件** | 无 |
| **测试步骤** | 1. 检查各维度weight值 |
| **预期结果** | ooc:10, timeline:9, lore:9, info-leak:9, memo-deviation:8, power:8, format:7；权重总和可用于加权计算 |

#### TC-8.3 LLM审计成功场景

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.3 |
| **优先级** | P0 |
| **前置条件** | AI模型正常响应，返回结构化审计结果 |
| **测试步骤** | 1. 调用ContinuityAuditor执行审计 |
| **预期结果** | AuditResult含issues数组、dimensionScores记录、overallScore数值；TokenUsage正确记录 |

#### TC-8.4 LLM审计失败——回退到确定性检查

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.4 |
| **优先级** | P0 |
| **前置条件** | AI模型返回异常或超时 |
| **测试步骤** | 1. 模拟LLM调用失败 |
| **预期结果** | 不崩溃；回退到仅基于确定性检查的结果；结果中dimensionScores仍存在（基于确定性检查的推断） |

#### TC-8.5 确定性检查——AI标记词密度

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.5 |
| **优先级** | P0 |
| **前置条件** | 正文中AI标记词密度>5/千字 |
| **测试步骤** | 1. 输入含有大量AI标记词("此外"、"总之"、"值得注意的是"等)的文本<br>2. 执行runDeterministicChecks |
| **预期结果** | 生成word-fatigue相关的issue；severity='info'或'warning' |

#### TC-8.6 确定性检查——段落长度均匀度

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.6 |
| **优先级** | P1 |
| **前置条件** | >70%段落长度相似（AI典型特征） |
| **测试步骤** | 1. 输入段落长度高度均匀的文本<br>2. 执行runDeterministicChecks |
| **预期结果** | 生成paragraph-length相关的issue |

#### TC-8.7 题材维度扩展——getGenreAuditDimensions

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.7 |
| **优先级** | P1 |
| **前置条件** | 指定genre='玄幻'或'xuanhuan' |
| **测试步骤** | 1. 调用getGenreAuditDimensions('玄幻') |
| **预期结果** | 返回题材特定的审计维度补充（如战力体系、修炼境界等） |

#### TC-8.8 题材维度扩展——未知题材

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.8 |
| **优先级** | P1 |
| **前置条件** | 指定不存在的genre |
| **测试步骤** | 1. 调用getGenreAuditDimensions('不存在的题材') |
| **预期结果** | 不崩溃；返回空数组或默认维度列表 |

#### TC-8.9 输入消毒——sanitizeForPrompt

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.9 |
| **优先级** | P2 |
| **前置条件** | 输入内容含特殊字符或注入尝试 |
| **测试步骤** | 1. 输入含prompt injection特征的文本 |
| **预期结果** | sanitizeForPrompt正确处理；不改变正常文本语义 |

#### TC-8.10 safeParseAIJson解析容错

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-8.10 |
| **优先级** | P1 |
| **前置条件** | LLM返回非标准JSON（含markdown代码块标记、多余逗号等） |
| **测试步骤** | 1. 模拟LLM返回"```json\n{...}\n```"格式 |
| **预期结果** | safeParseAIJson正确解析；不抛出异常 |

---

### 模块9：观察者Agent（ObserverAgent）

**文件路径**：`src/agents/ObserverAgent.ts`

#### TC-9.1 9类事实提取完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.1 |
| **优先级** | P0 |
| **前置条件** | 包含所有类型信息的章节文本 |
| **测试步骤** | 1. 调用ObserverAgent执行 |
| **预期结果** | 输出facts包含9种类别：character、relationship、location、item、state_change、hook、emotion、timeline、numeric |

#### TC-9.2 "宁多勿漏"原则——低置信度也提取

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.2 |
| **优先级** | P0 |
| **前置条件** | 文本中有模糊的人物关系暗示（低置信度） |
| **测试步骤** | 1. 分析含模糊描述的文本<br>2. 检查低置信度事实 |
| **预期结果** | 即使confidence<0.3的事实也被提取，而非被过滤 |

#### TC-9.3 实体提及计数——countEntityMentions

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.3 |
| **优先级** | P0 |
| **前置条件** | 已知实体列表['张三', '李四']，正文中'张三'出现5次，'李四'出现3次 |
| **测试步骤** | 1. 调用countEntityMentions(text, ['张三', '李四']) |
| **预期结果** | 返回Map: {'张三': 5, '李四': 3}；使用正则匹配 |

#### TC-9.4 新实体识别

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.4 |
| **优先级** | P1 |
| **前置条件** | 文本中出现existingEntityNames中不存在的角色名 |
| **测试步骤** | 1. 执行事实提取 |
| **预期结果** | 新实体的isNewEntity=true；entityType根据category映射（如character→'CHARACTER'） |

#### TC-9.5 置信度校验——clampConfidence边界

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.5 |
| **优先级** | P1 |
| **前置条件** | LLM返回confidence=-0.5或1.5 |
| **测试步骤** | 1. 检查clampConfidence处理 |
| **预期结果** | -0.5→0, 1.5→1, NaN→0.5；始终返回[0,1]范围内 |

#### TC-9.6 parseFacts必填字段校验

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.6 |
| **优先级** | P1 |
| **前置条件** | LLM返回缺少entityName或description的事实 |
| **测试步骤** | 1. 调用parseFacts处理不完整数据 |
| **预期结果** | 缺少必填字段的事实被过滤；有效事实被正确解析 |

#### TC-9.7 事实分类统计

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.7 |
| **优先级** | P2 |
| **前置条件** | 提取了多条不同类别的事实 |
| **测试步骤** | 1. 调用groupFactsByCategory |
| **预期结果** | 返回9种类别的计数；未出现的类别计数为0 |

#### TC-9.8 Category到EntityType映射

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-9.8 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **测试步骤** | 1. 检查CATEGORY_ENTITY_TYPE_MAP映射 |
| **预期结果** | character→CHARACTER, relationship→CHARACTER, location→LOCATION, item→ITEM, hook→LORE；其余类别无映射 |

---

### 模块10：风格分析器（StyleAnalyzerAgent）

**文件路径**：`src/agents/StyleAnalyzerAgent.ts`

#### TC-10.1 快速分析模式（quick）

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.1 |
| **优先级** | P0 |
| **前置条件** | analysisDepth='quick'，输入>=1000字文本 |
| **测试步骤** | 1. 调用StyleAnalyzer执行分析 |
| **预期结果** | 仅执行deterministicAnalysis；sentencePatterns和vocabulary有数值；rhetoric默认值或空；aiCharacteristics有数值 |

#### TC-10.2 标准分析模式（standard）

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.2 |
| **优先级** | P0 |
| **前置条件** | analysisDepth='standard' |
| **测试步骤** | 1. 调用StyleAnalyzer执行分析 |
| **预期结果** | 执行deterministicAnalysis+llmAnalysis；rhetoric有LLM返回的数据；styleDescription非空；styleTags非空 |

#### TC-10.3 深度分析模式（deep）

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.3 |
| **优先级** | P1 |
| **前置条件** | analysisDepth='deep' |
| **测试步骤** | 1. 调用StyleAnalyzer执行分析 |
| **预期结果** | 分析更详细；writingAdvice数组包含具体建议；tokenUsage高于standard模式 |

#### TC-10.4 句式特征分析

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.4 |
| **优先级** | P0 |
| **前置条件** | 含对话和描写的混合文本 |
| **测试步骤** | 1. 执行deterministicAnalysis<br>2. 检查sentencePatterns |
| **预期结果** | avgLength>0；shortSentenceRatio+longSentenceRatio<=1；dialogueRatio+descriptionRatio<=1；questionRatio和exclamationRatio在[0,1] |

#### TC-10.5 AI特征检测

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.5 |
| **优先级** | P0 |
| **前置条件** | 含AI标记词较多的文本 |
| **测试步骤** | 1. 执行analyzeAICharacteristics |
| **预期结果** | aiTellWordDensity反映标记词密度；patternUniformity反映句式规律性；transitionWordDensity反映转折词密度 |

#### TC-10.6 风格指纹数据完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-10.6 |
| **优先级** | P1 |
| **前置条件** | 完成standard分析 |
| **测试步骤** | 1. 检查输出StyleFingerprint的5个维度 |
| **预期结果** | sentencePatterns(7字段)、vocabulary(7字段)、rhetoric(5字段+感官)、rhythm(3字段)、aiCharacteristics(4字段)全部存在且类型正确 |

---

### 模块11：AIGC检测服务（AIGCDetector）

**文件路径**：`src/services/AIGCDetector.ts`

#### TC-11.1 本地检测模式——正常文本

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.1 |
| **优先级** | P0 |
| **前置条件** | provider='local'，输入正常人类风格文本 |
| **测试步骤** | 1. 调用detect(text) |
| **预期结果** | overallScore为人类写作概率(0-100)；aiProbability在[0,1]；humanProbability=1-aiProbability；paragraphs含段落级标注 |

#### TC-11.2 本地检测——5项加权指标

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.2 |
| **优先级** | P0 |
| **前置条件** | 使用本地检测 |
| **测试步骤** | 1. 验证5项指标权重：AI标记词密度(0.3)、句长变异系数(0.2)、段长变异系数(0.15)、词汇多样性(0.25)、标点比例(0.1) |
| **预期结果** | 权重之和=1.0；各项指标独立计算后加权合成 |

#### TC-11.3 段落分类阈值

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.3 |
| **优先级** | P0 |
| **前置条件** | 无 |
| **测试步骤** | 1. 验证classifyParagraph逻辑：aiProbability<=0.25→human，>=0.75→ai，0.4-0.6→uncertain，其余→mixed |
| **预期结果** | 边界值正确：0.25→human，0.26→mixed，0.39→mixed，0.4→uncertain，0.6→uncertain，0.61→mixed，0.74→mixed，0.75→ai |

#### TC-11.4 GPTZero提供商调用

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.4 |
| **优先级** | P1 |
| **前置条件** | provider='gptzero'，配置有效apiKey |
| **测试步骤** | 1. 调用detect(text) |
| **预期结果** | 调用GPTZero API；返回结果provider='gptzero'；latencyMs>0 |

#### TC-11.5 Originality.ai提供商调用

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.5 |
| **优先级** | P1 |
| **前置条件** | provider='originality'，配置有效apiKey |
| **测试步骤** | 1. 调用detect(text) |
| **预期结果** | 调用Originality.ai API；返回结果provider='originality' |

#### TC-11.6 API超时回退到本地检测

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.6 |
| **优先级** | P0 |
| **前置条件** | provider='gptzero'，API请求超过REQUEST_TIMEOUT_MS=30000 |
| **测试步骤** | 1. 模拟API超时<br>2. 调用detect |
| **预期结果** | 不崩溃；自动回退到本地检测；日志输出"AIGC检测失败，回退到本地检测"；结果provider='local' |

#### TC-11.7 空文本处理

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.7 |
| **优先级** | P1 |
| **前置条件** | text为空字符串 |
| **测试步骤** | 1. 调用detect('') |
| **预期结果** | 返回createEmptyResult；overallScore=50；aiProbability=0.5；paragraphs为空数组 |

#### TC-11.8 批量检测——Promise.allSettled

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.8 |
| **优先级** | P1 |
| **前置条件** | 多段文本需检测 |
| **测试步骤** | 1. 调用batchDetect([text1, text2, text3])<br>2. 其中text2检测失败 |
| **预期结果** | 使用Promise.allSettled；text1和text3正常返回；text2返回错误但不影响其他；每个结果独立 |

#### TC-11.9 不支持的provider处理

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.9 |
| **优先级** | P1 |
| **前置条件** | provider为未定义的值 |
| **测试步骤** | 1. new AIGCDetector({provider: 'unknown' as any})<br>2. 调用detect |
| **预期结果** | 抛出或捕获"不支持的检测提供商"错误；不导致未处理异常 |

#### TC-11.10 AI标记词列表完整性

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-11.10 |
| **优先级** | P2 |
| **前置条件** | 无 |
| **测试步骤** | 1. 检查AI_TELL_WORDS数组 |
| **预期结果** | 包含至少20个中文AI标记词（如"此外"、"总之"、"综上所述"、"值得注意的是"等） |

---

### 模块12：平台格式导出器（platformExporter）

**文件路径**：`src/utils/exporters/platformExporter.ts`

#### TC-12.1 起点中文网格式导出

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.1 |
| **优先级** | P0 |
| **前置条件** | 有效章节数据 |
| **测试步骤** | 1. 调用exportToPlatformFormat(chapters, 'qidian') |
| **预期结果** | 章节标题<=30字；正文2000-10000字范围；段落使用全角空格缩进；无禁止模式字符(□■◆◇○●) |

#### TC-12.2 番茄小说格式导出

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.2 |
| **优先级** | P0 |
| **前置条件** | 有效章节数据 |
| **测试步骤** | 1. 调用exportToPlatformFormat(chapters, 'fanqie') |
| **预期结果** | 章节标题<=50字；chapterTitleFormat='numbered'（带编号）；正文1000-8000字；无禁止字符 |

#### TC-12.3 晋江文学城格式导出

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.3 |
| **优先级** | P0 |
| **前置条件** | 有效章节数据 |
| **测试步骤** | 1. 调用exportToPlatformFormat(chapters, 'jjwxc') |
| **预期结果** | 章节标题<=25字；正文3000-15000字；chapterTitleFormat='numbered'；无禁止字符(□■◆◇○●★☆♦♠♣♥) |

#### TC-12.4 章节字数校验——validateChapterForPlatform

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.4 |
| **优先级** | P0 |
| **前置条件** | 分别准备超长/过短/正常章节 |
| **测试步骤** | 1. 对超长章节校验（>maxChapterLength）<br>2. 对过短章节校验（<minChapterLength）<br>3. 对正常章节校验 |
| **预期结果** | 超长：返回警告；过短：返回警告；正常：无警告 |

#### TC-12.5 禁止模式检测

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.5 |
| **优先级** | P1 |
| **前置条件** | 正文包含制表符(\t)或特殊符号(□■◆等) |
| **测试步骤** | 1. 对qidian平台校验含\t的文本 |
| **预期结果** | validateChapterForPlatform返回包含forbiddenPattern的警告 |

#### TC-12.6 零宽字符检测

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.6 |
| **优先级** | P1 |
| **前置条件** | 正文含零宽字符（如\ufeff、\u200b等） |
| **测试步骤** | 1. 校验含零宽字符的文本 |
| **预期结果** | 检测到零宽字符并返回警告 |

#### TC-12.7 链接检测

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.7 |
| **优先级** | P2 |
| **前置条件** | 正文含URL链接 |
| **测试步骤** | 1. 校验含链接的文本 |
| **预期结果** | 检测到链接并返回警告 |

#### TC-12.8 自动截断——autoTrimLongChapters

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.8 |
| **优先级** | P0 |
| **前置条件** | autoTrimLongChapters=true，章节超过平台最大字数 |
| **测试步骤** | 1. 导出超长章节到qidian平台 |
| **预期结果** | 章节被自动截断至maxChapterLength以内；在段落边界截断；warnings包含截断提示 |

#### TC-12.9 章节排序与连接

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.9 |
| **优先级** | P1 |
| **前置条件** | 多章节无序输入 |
| **测试步骤** | 1. 导出[chapter3, chapter1, chapter2] |
| **预期结果** | 输出按chapter number排序；章节间使用平台separator连接 |

#### TC-12.10 各平台separator差异

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.10 |
| **优先级** | P2 |
| **前置条件** | 无 |
| **测试步骤** | 1. 检查各平台separator配置 |
| **预期结果** | ciweimao使用'\n\n---\n\n'；其余平台使用'\n\n' |

#### TC-12.11 通用格式导出

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-12.11 |
| **优先级** | P1 |
| **前置条件** | 有效章节数据 |
| **测试步骤** | 1. 调用exportToPlatformFormat(chapters, 'generic') |
| **预期结果** | 最宽泛的限制（标题100字、正文50000字、最小0字）；几乎所有内容都能通过校验 |

---

### 附加模块A：同人创作服务（FanficService）

**文件路径**：`src/services/FanficService.ts`

#### TC-A.1 Canon模式初始化

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.1 |
| **优先级** | P0 |
| **前置条件** | mode='canon'，sourceMaterial='斗破苍穹'，characters=['萧炎','萧薰儿'] |
| **测试步骤** | 1. 调用FanficService.initProject(config) |
| **预期结果** | systemPrompt包含"忠实原作设定"；worldRules非空；characterProfiles含2个角色；writingConstraints含6条规则和5条禁止 |

#### TC-A.2 AU模式初始化

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.2 |
| **优先级** | P1 |
| **前置条件** | mode='au'，auDescription='现代都市背景' |
| **测试步骤** | 1. 调用initProject |
| **预期结果** | systemPrompt包含"平行宇宙"；规则允许世界观自由设定但角色核心性格保留 |

#### TC-A.3 CP模式——必须提供cpPairing

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.3 |
| **优先级** | P1 |
| **前置条件** | mode='cp'，cpPairing='林夜x苏晴' |
| **测试步骤** | 1. 调用initProject |
| **预期结果** | CP关系成为核心驱动；标题包含CP信息；规则围绕CP关系展开 |

#### TC-A.4 OOC模式——允许角色性格偏离

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.4 |
| **优先级** | P1 |
| **前置条件** | mode='ooc' |
| **测试步骤** | 1. 调用initProject |
| **预期结果** | 规则允许角色性格大幅偏离原作；但仍需角色间关系自洽 |

#### TC-A.5 项目标题生成

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.5 |
| **优先级** | P2 |
| **前置条件** | 各模式配置 |
| **测试步骤** | 1. 检查generateProjectTitle输出 |
| **预期结果** | 标题格式：【原作名】角色列表-模式标签；CP模式含CP配对信息 |

#### TC-A.6 项目描述生成

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-A.6 |
| **优先级** | P2 |
| **前置条件** | 各模式配置 |
| **测试步骤** | 1. 检查generateProjectDescription输出 |
| **预期结果** | 描述包含原作名、模式、角色列表；CP模式含CP信息；有主题时包含主题 |

---

### 附加模块B：短篇小说Runner（ShortFictionRunner）

**文件路径**：`src/services/pipeline/ShortFictionRunner.ts`

#### TC-B.1 三阶段完整执行

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-B.1 |
| **优先级** | P0 |
| **前置条件** | 有效短篇项目配置 |
| **测试步骤** | 1. 执行ShortFictionRunner全流程 |
| **预期结果** | 按outline→writing(含review)→assembly顺序执行；最终输出完整短篇内容 |

#### TC-B.2 自动review机制

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-B.2 |
| **优先级** | P1 |
| **前置条件** | review配置开启，maxRetries>0 |
| **测试步骤** | 1. 写作阶段执行自动review |
| **预期结果** | LLM检查情节连贯性、角色一致性、写作质量、字数；不合格时重试 |

#### TC-B.3 章节间冷却

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-B.3 |
| **优先级** | P1 |
| **前置条件** | 多章节短篇 |
| **测试步骤** | 1. 连续写多章 |
| **预期结果** | 章节间有2秒冷却间隔 |

---

### 附加模块C：自然语言命令路由

**文件路径**：`src/assistant/commands/inputRouter.ts`、`builtinCommands.ts`

#### TC-C.1 help命令

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.1 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **测试步骤** | 1. 输入'/help'<br>2. 执行路由 |
| **预期结果** | 返回RouteResult.type='command'；输出所有可用命令列表 |

#### TC-C.2 review命令——默认一致性检查

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.2 |
| **优先级** | P1 |
| **前置条件** | 项目中有已写章节 |
| **测试步骤** | 1. 输入'/review'<br>2. 执行路由 |
| **预期结果** | 使用consistency profile执行多角色review；输出review结果 |

#### TC-C.3 review命令——指定profile

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.3 |
| **优先级** | P2 |
| **前置条件** | 无 |
| **测试步骤** | 1. 输入'/review quality'<br>2. 输入'/review editor'<br>3. 输入'/review style' |
| **预期结果** | 分别使用quality/editor/style profile执行review |

#### TC-C.4 review命令——自定义文本

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.4 |
| **优先级** | P2 |
| **前置条件** | 无 |
| **测试步骤** | 1. 输入'/review 请检查这段文字...' |
| **预期结果** | 使用自定义文本而非加载最新章节 |

#### TC-C.5 非命令文本路由

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.5 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **测试步骤** | 1. 输入普通聊天文本（不以/开头） |
| **预期结果** | RouteResult.type='chat'；不触发命令执行 |

#### TC-C.6 未注册命令处理

| 项目 | 内容 |
|------|------|
| **用例ID** | TC-C.6 |
| **优先级** | P1 |
| **前置条件** | 无 |
| **测试步骤** | 1. 输入'/unknown_command' |
| **预期结果** | RouteResult.type='error'；返回未找到命令的提示 |

---

## 五、测试用例统计

### 按模块统计

| 模块 | P0 | P1 | P2 | 合计 |
|------|----|----|----|----|
| 1. Agent Pipeline编排 | 3 | 3 | 1 | 7 |
| 2. Pipeline Runner流水线 | 8 | 7 | 4 | 19 |
| 3. 审计-修订循环 | 5 | 4 | 2 | 11 |
| 4. 快照管理器 | 6 | 4 | 3 | 13 |
| 5. 审计结果聚合器 | 6 | 5 | 3 | 14 |
| 6. 批量续写调度器 | 5 | 4 | 4 | 13 |
| 7. 后台守护服务 | 4 | 5 | 2 | 11 |
| 8. 连续性审计员 | 4 | 4 | 2 | 10 |
| 9. 观察者Agent | 3 | 3 | 2 | 8 |
| 10. 风格分析器 | 3 | 2 | 1 | 6 |
| 11. AIGC检测服务 | 3 | 5 | 2 | 10 |
| 12. 平台格式导出器 | 4 | 4 | 3 | 11 |
| 附加A. 同人创作服务 | 1 | 3 | 2 | 6 |
| 附加B. 短篇小说Runner | 1 | 2 | 0 | 3 |
| 附加C. 自然语言命令路由 | 0 | 3 | 3 | 6 |
| **合计** | **56** | **58** | **34** | **148** |

### 按优先级统计

| 优先级 | 用例数 | 占比 |
|--------|--------|------|
| P0（核心/阻断） | 56 | 37.8% |
| P1（重要/边界） | 58 | 39.2% |
| P2（辅助/异常） | 34 | 23.0% |
| **总计** | **148** | **100%** |

### 重点关注区域说明

根据`项目负责人`要求，**Pipeline核心流程**和**审计-修订循环的边界场景**进行了重点覆盖：

1. **Pipeline核心流程**（TC-2.1~TC-2.19）：覆盖全部10个阶段的顺序执行、错误隔离、回滚机制、温度递增、Token汇总、进度回调
2. **审计-修订循环边界**（TC-3.1~TC-3.11）：首次通过、修订后通过、多次不通过、敏感词阻断、快照回滚、净改进阈值边界（epsilon=3的等号场景）、空内容处理
3. **快照管理器边界**（TC-4.1~TC-4.13）：同分取较晚版本、5种停止条件的逐一覆盖、getFinalContent回滚、epsilon等号判定
4. **聚合器硬封顶**（TC-5.7~TC-5.9）：critical维度<60时总分上限70的精确验证

---

## 六、遗留风险与建议

| 风险项 | 说明 | 建议 |
|--------|------|------|
| 33维度覆盖不完整 | 代码仅定义16个维度，依赖LLM推断其余17个 | 建议在PRD中明确16维度作为核心维度，其余作为扩展维度 |
| Pipeline Phase 1-3无独立容错 | plan/compose/write阶段异常会导致整个Pipeline失败 | 建议增加try-catch保护，与Phase 7(settle)保持一致 |
| 同人/短篇等模块无PRD覆盖 | FanficService、ShortFictionRunner、StyleAnalyzer等功能未在PRD中定义 | 建议补充PRD或在系统说明中标注为实验性功能 |
| AIGC检测回退后provider字段不一致 | 外部API失败回退到local后，provider字段显示'local'而非原始提供商 | 建议增加originalProvider字段记录原始选择 |

---

**文档编写**：测试工程师
**日期**：2026-05-28
