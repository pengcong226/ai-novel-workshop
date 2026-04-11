# V5 架构深度优化清单与计划

基于对当前系统（表格记忆、混合存储、模型路由、上下文组装等）的代码分析，为了将《AI小说工坊》推向企业级稳定性和长效维护，特制定以下分阶段优化清单：

## Phase 1: 高可用大模型路由 (熔断器与故障转移)
**目标**：彻底解决 API 极度不稳定导致的挂机生成中断问题。
* [x] 引入 `CircuitBreaker` (熔断器)：针对各 Provider/Model 实现 `Closed` -> `Open` -> `Half-Open` 探活状态机。
* [x] 引入 `FailoverManager` (故障转移管理器)：封装请求层，当主力模型 (如 Claude 3.5) 熔断或 429 超时，无缝自动降级到备用模型队列 (如 GPT-4o 或本地模型)。
* [x] 重构 `ModelRouter.ts`，从 `selectModel` 返回单一模型改为返回带权重的备选队列 (Candidates List)。

## Phase 2: Context Builder 管道化重构
**目标**：拆解 200+ 行的上帝函数，彻底消灭“黑客式的字符串拼装”。
* [x] 引入 Pipeline / Middleware 架构 (`MemoryMiddleware`, `VectorMiddleware`, `SummaryMiddleware`)。
* [x] 各中间件解耦，独立计算自己申请的 Token 预算并执行智能截断。
* [x] 全面处理 Unicode Surrogate Pairs 防护，消灭因字符切坏导致的 API Http 400 报错。
*(注：已完成 `contextBuilder.ts` 及其相关中间件的全面替换)*

## Phase 3: 记忆系统升级为结构化输出 (Tool Calling)
**目标**：将指令触发准确率从 80% 提升至 99.9%。
* [x] 废弃利用 RegExp 抓取 `updateRow` 的做法。
* [x] 对接 OpenAI/Anthropic 原生的 Function Calling 规范 (使用 JSON Schema `response_format`)。
* [x] 统一定义 `TableMemoryUpdater` 工具函数给 AI 调用，接收强类型的 `JSON Schema` 以直接更新 CSV 表。

## Phase 4: RAG 混合排序与存储原子化 API
**目标**：杜绝吃书隐患，且消除千万字下的前端 OOM 或大 JSON 永久丢数据风险。
* [x] **RAG 重排策略**：设定类 (Settings/Characters) 按相关性评分 (Score) 降序排列，剧情类 (Chapters/Events) 按时间序排列。
* [x] 淘汰 Rust 端 `process_and_save_project_blob` 中危险的 JSON 暴力拆解过滤机制。
* [x] 新增 `save_character_atomic`、`save_worldbook_entry_atomic` 等原子化 API，直接从前端 Pinia 向后端独立更新单一资源。

---
> 制定日期：2026/04/09
> 当前执行进度：所有核心功能 (Phase 1, 2, 3, 4) 已上线并完成代码审查与修复！