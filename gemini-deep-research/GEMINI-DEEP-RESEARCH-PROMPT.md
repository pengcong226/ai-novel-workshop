# Deep Research 提示词：AI 小说工坊架构全面审计与演进方案

## 你的角色

你是一位精通大语言模型应用架构、长文本生成系统、以及现代桌面应用开发的高级技术架构师。你将对一个基于 **Vue 3 + TypeScript + Tauri + SQLite** 的**AI 长篇小说自动生成桌面应用**进行全面的架构审计、功能评估和改进建议。

## 项目概述

这是一个名为 **"AI 小说工坊"** 的桌面应用，其核心目标是：**让用户设定世界观、角色、大纲后，由 AI 自动连续生成数百章的长篇网文小说，同时保持跨章节的叙事一致性（不"吃书"、不出现情节漏洞）**。

### 技术栈
- **前端**：Vue 3 + Element Plus + Pinia 状态管理
- **桌面壳**：Tauri（Rust）
- **数据持久化**：IndexedDB (前端) + SQLite (Tauri 侧)
- **AI 接入**：OpenAI 兼容 API / Anthropic Claude API，支持多 Provider

### 项目已有文件说明

我提供了项目的核心代码和文档，按以下结构组织：

```
gemini-deep-research/
├── docs/                          # 项目文档与重构蓝图
│   ├── README.md                  # 项目说明
│   ├── V3-架构审视与重构蓝图.md      # V3 架构审计报告（由 Gemini 此前生成）
│   └── V3-实施方案-ClaudeCode执行手册.md  # V3 实施方案
├── src/
│   ├── types/                     # 类型定义（数据模型的真理来源）
│   │   ├── index.ts               # 核心类型（Project, Chapter, Character, Config 等）
│   │   ├── entity.ts              # V3 图元时序架构类型（EntityNode, CharacterV3 等）
│   │   ├── ai.ts                  # AI 服务类型
│   │   └── worldbook.ts           # 世界书类型
│   ├── stores/                    # Pinia 状态管理
│   │   ├── project.ts             # 项目管理 Store（含保存锁机制）
│   │   ├── ai.ts                  # AI 服务 Store（Provider 路由）
│   │   └── ...
│   ├── services/                  # 服务层
│   │   ├── ai-service.ts          # 统一 AI 调用接口（OpenAI/Claude/本地）
│   │   ├── generation-scheduler.ts # 批量章节生成调度器（PGVU 闭环）
│   │   ├── state-updater.ts       # V3 增量状态追踪引擎
│   │   ├── worldbook-injector.ts  # 世界书动态注入
│   │   └── ...
│   ├── utils/                     # 工具层
│   │   ├── contextBuilder.ts      # 上下文编排器（动态 Token 预算 + 沙漏布局）
│   │   ├── tableMemory.ts         # 表格记忆系统
│   │   ├── entityMigration.ts     # V3 迁移工具
│   │   ├── llm/
│   │   │   ├── antiRetconValidator.ts  # 防吃书验证器（哨兵模型）
│   │   │   └── outlineGenerator.ts     # 大纲生成器
│   │   └── ...
│   ├── components/                # Vue 组件（UI 层）
│   │   ├── Chapters.vue           # 章节管理与生成
│   │   ├── Characters.vue         # 角色管理
│   │   ├── Outline.vue            # 大纲编辑器
│   │   ├── WorldSetting.vue       # 世界观设定
│   │   ├── ProjectConfig.vue      # 项目配置面板
│   │   ├── MemoryTables.vue       # 记忆表格可视化
│   │   ├── WorldbookPanel.vue     # 世界书面板
│   │   └── ...
│   └── views/                     # 页面视图
│       ├── ProjectEditor.vue      # 项目编辑器主页面
│       └── ProjectList.vue        # 项目列表
└── package.json / vite.config.ts  # 构建配置
```

## 研究目标

请从以下 **五个维度** 对项目进行深度分析，每个维度都要基于 **2024-2026 年间的最新学术论文和工业实践**、**与同类产品的对比** 给出具体、可操作的建议：

---

### 一、架构评估：当前设计是否能支撑"数百章长篇"的核心目标？

重点审视：

1. **上下文编排策略** (`contextBuilder.ts`)：
   - 当前的"沙漏布局"（System=约束 → User中段=素材 → User尾段=指令）是否是最优的 attention 分配方案？
   - 动态 Token 预算分配的比例（详见代码中的 `createTokenBudget`）是否合理？
   - 对比最新的 OP-RAG、MemWalker、RAPTOR 等检索增强方案，当前的向量检索 + 摘要 + 最近章节组合策略还有哪些改进空间？

2. **状态追踪引擎** (`state-updater.ts`, `entity.ts`)：
   - "提取 → 验证 → 应用"三步管线的设计是否合理？
   - 基于原文引文的幻觉拒绝机制（`verifyStateShifts`）的有效性评估
   - V3 的 `CharacterV3` 时序切片 + `EntityNode` 图元架构，对比 DOME(2025)、GAM(2026)、TimelineKG 等方案的优劣
   - 叙事一致性维护的"结构层+叙事层"二层分离架构是否足够？需不需要第三层（如"推理验证层"）？

3. **防吃书系统** (`antiRetconValidator.ts`)：
   - 当前的五大类验证矩阵（时间线、角色、世界观、事实、叙事）设计是否完备？
   - "哨兵模型"方案（用一个 LLM 校验另一个 LLM 的输出）的有效性和成本效益
   - 对比 ConStory-Bench 等最新基准的评估维度，还有哪些遗漏？

4. **记忆系统** (`tableMemory.ts`, `worldbook-injector.ts`)：
   - 表格记忆（受 st-memory-enhancement 启发）在超过 100 章后是否会性能退化？
   - 世界书注入的 trigger 匹配算法效率和精度如何？
   - 是否需要引入分层记忆（工作记忆 / 短期 / 长期 / 归档）的概念？

---

### 二、功能模块评估：覆盖面是否完整？

对比市面上的同类产品（如 NovelAI、AI Dungeon、SillyTavern + 扩展、Dramatron、Recurrentgpt、DOC、LLMWriter 等），分析本项目在以下功能点上的完整度和成熟度：

1. **世界观构建**：世界设定、世界书（Worldbook/Lorebook）、地图编辑器
2. **角色管理**：角色卡、状态追踪、关系图谱、角色弧光分析
3. **大纲系统**：层级大纲、PlotBeat 细粒度场景规划、伏笔播种/收割追踪
4. **生成引擎**：批量生成、流式输出、重试修复、Token 预算管理
5. **质量保障**：防吃书校验、逻辑一致性检查、质量评分
6. **摘要与记忆**：章节摘要、表格记忆、向量检索
7. **导入/导出**：SillyTavern 角色卡、世界书 PNG 格式、Markdown/PDF 导出
8. **数据格式兼容**：与 SillyTavern、NovelAI、Tavern 等生态的互通性

指出哪些功能是"有但不成熟"、"完全缺失"、或"设计方向有问题"的。

---

### 三、UI/UX 评估：交互设计能否支撑复杂工作流？

基于 `ProjectEditor.vue` 的 Tab 布局和各组件的代码，评估：

1. **信息架构**：当前的 Tab 分区（世界观 / 角色 / 大纲 / 章节 / 配置 / ...）是否符合小说创作的心智模型？
2. **批量生成的操控感**：用户在生成 100 章时，能否清晰感知进度、干预流程、回滚错误？
3. **记忆可视化**：表格记忆和角色状态的可视化是否足够直观？用户能否轻松发现"吃书"？
4. **配置复杂度**：`ProjectConfig.vue` 的 40KB 配置面板是否过于复杂？是否需要"简单模式/高级模式"分流？
5. **对比 NovelAI / Sudowrite / AI Dungeon 等产品的 UX 最佳实践**，指出差距和改进方向

---

### 四、性能与可扩展性

1. **数据量瓶颈**：300 章时 IndexedDB 的章节数据和向量索引是否会成为瓶颈？
2. **AI 调用成本**：以生成 300 章、每章 3000 字计算，当前架构的 Token 消耗量估算（含上下文、验证、状态追踪等所有 AI 调用）
3. **并发安全**：保存锁 + 防抖机制是否足以处理批量生成时的并发写入？
4. **插件扩展性**：当前的插件系统（`plugin.ts`）是否足够灵活？

---

### 五、前沿技术机会：2025-2026 年有哪些新技术值得整合？

调研并推荐以下领域的最新进展：

1. **超长上下文模型**（Gemini 2.0 1M、Claude 200K、Llama 长上下文微调）对当前 Token 预算策略的影响
2. **多 Agent 协作**：是否应该引入 Writer Agent / Critic Agent / Editor Agent 多角色协作生成？
3. **强化学习/宪法 AI**：是否可以用 RLHF/Constitutional AI 方法训练一个专用的"一致性评估模型"？
4. **结构化输出**（JSON Mode / Function Calling）：是否应该更多使用 structured output 替代自由文本提取？
5. **跨模态能力**：图文混合叙事（AI 插图生成）是否值得纳入路线图？
6. **本地推理**：Ollama / llama.cpp + Vulkan 加速的本地 13B 模型是否可作为哨兵模型/状态追踪模型的低成本替代？

---

## 输出要求

1. **每个维度** 给出：现状评估（优/良/及格/差）+ 具体问题 + 推荐方案 + 学术/工业参考
2. **优先级排序**：按"对核心目标（300章一致性生成）的影响程度"排序
3. **可操作性**：每个建议都要给出具体的技术方案（不要停留在"建议引入 XX"的层面，要说明如何集成、预期工程量、风险点）
4. **产出一份综合评分卡**：用表格列出各维度当前得分和目标得分

---

## 附加约束

- 请充分利用我提供的源代码进行分析，不要泛泛而谈。引用具体的文件名、函数名、行号来支撑你的观点
- 如果发现代码中有逻辑 Bug 或隐患，请一并指出
- 对比竞品时，引用具体的产品特性，不要虚构功能
- 学术引用请注明论文标题和年份
