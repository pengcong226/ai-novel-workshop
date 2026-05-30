# 更新日志

## v6.0.0 (2026-05-30) — 第6轮迭代

### 新功能

1. **跨章节张力曲线规划** - 新增 `TensionCurvePlanner` 确定性全书节奏分析器，检测高潮扎堆/低谷过长/节奏单调/突变跳跃4类跨章节节奏问题，为下一章推荐张力目标值，集成到流水线 Phase 8b。

2. **多读者群体评估** - `ReaderAgent` 增强，模拟资深网文读者/新手读者/题材核心受众3种读者群体差异化反馈，包含弃书风险评估。

3. **对话质量专项检测** - 新增 `DialogueAnalyzer` 确定性对话分析器，支持对话/叙述比例计算、对话标签频率统计、重复标签检测、连续对话检测，集成到17维质量审计的 `dialogue` 维度。

4. **角色语言风格档案** - `ObserverAgent` 新增第10类事实提取（语言风格），追踪角色 formality/vocabulary/sentenceLength/quirks/catchphrases 等语言特征。

5. **改稿二次验证** - 新增 `RevisionVerifier`，审计-修订循环中不再盲目标记 fixedIssues，两级验证：Level 1 确定性验证（长度/重复段/敏感词）+ Level 2 LLM 验证。

6. **ComposerAgent LLM 裁剪** - 章节数 ≥ 20 时自动启用 LLM 语义裁剪，对 `chapterSummaries` 和 `characterMatrix` 做相关性评分，仅保留高相关条目，最长2次 LLM 调用，失败回退到 smartTrim。

7. **项目ID一致性修复** - 修复 `StateSettler` 中 `__pending__` projectId 占位符问题，确保所有 `StateEvent` 都有正确的 projectId，添加兜底校验。

### 改进

- `ContinuityAuditor` 新增 `dialogue` 审计维度，集成对话质量分析
- `PipelineRunner` 新增 Phase 8b 张力曲线分析阶段
- `ChapterReviewCycle` 集成 RevisionVerifier 验证结果，未修复问题提升优先级
- `PostWriteValidator` 支持敏感词检测开关控制
- 项目配置新增 `enableSensitiveWordCheck` 和 `enableLLMCompose` 选项
- 生产环境 Mock 数据自动清理机制

### 技术债务清理

- `as any` 断言从 130 处清理至 5 处（仅余2处真实类型不兼容 + 3处测试文件）
- TODO/FIXME 清理完成
- TypeScript 编译零错误

---

## v5.1.0 (2026-04-22 ~ 2026-05-23) — 第1~5轮迭代优化

### 第5轮迭代

- 敏感词检测开关：项目配置新增 `enableSensitiveWordCheck` 开关，控制 `PostWriteValidator` 中敏感词检测的执行
- 敏感词 category 匹配修复：统一 `ChapterReviewCycle` 中敏感词类别判断逻辑
- `as any` 类型断言全面清理（130→5）
- TODO/FIXME 标记清理

### 第4轮迭代

- 10-Agent 智能流水线完善：plan→compose→write→normalize→audit→(revise→audit)→settle→analyze→promote-hooks 全链路打通
- `PipelineRunner` 流水线编排器实现，支持阶段跳过与错误恢复
- `ChapterReviewCycle` 审计-修订循环实现，支持多轮迭代收敛
- `SnapshotManager` 快照管理，审计修订过程中保留内容快照与迭代计数
- Pipeline Lock 项目级互斥锁，防止并发流水线执行

### 第3轮迭代

- `ComposerAgent` 上下文组装器，聚合大纲/角色/世界观/前文摘要等上下文
- `WriterAgent` 写作代理，基于组装上下文生成章节内容
- `ReviserAgent` 修订代理，根据审计问题修订章节内容
- `PostWriteValidator` 后写作验证器，段落均匀性/重复段/敏感词检测
- `ContinuityAuditor` 连续性审计器，多维度质量审计

### 第2轮迭代

- `ObserverAgent` 观察者代理，从章节内容提取9类事实（角色/关系/地点/物品/事件/时间线/情感弧线/主题/世界观规则）
- `StateSettler` 状态结算器，将观察事实转化为状态事件
- `AnalyzerAgent` 分析代理，生成章节分析报告
- IndexedDB + localStorage 浏览器端存储方案落地

### 第1轮迭代

- 项目管理系统搭建：项目创建/列表/配置/删除
- 章节管理：章节创建/编辑/排序/删除
- 基础 LLM 集成：AI 辅助大纲生成、章节内容生成
- Element Plus UI 组件库集成

---

## v5.0.0 (2026-04-10 ~ 2026-04-17) — V5 多视图沙盘重构

### 架构重构

- 从 V1 线性运行时全面迁移到 V5 Entity/StateEvent 多视图沙盘架构
- 新增 V5 核心类型定义：`Entity`、`StateEvent`、`SandboxStore`
- Pinia Store 多视图沙盘状态管理
- 数据库 Schema 重构：Entity 和 StateEvent 原子操作表
- Tauri IPC 命令：`load_entities`、`load_state_events`
- V1 运行时消费者全部移除

### 多视图沙盘组件

- **SandboxTimeline** — 3态渲染时间线组件
- **SandboxGraph** — AntV G6 动态关系图谱，支持 spotlight 级联中心选择
- **SandboxMap** — SVG/CSS 百分比定位动态地图
- **SandboxDocument** — 静态字段 + 计算动态状态文档视图
- **AutomatonChat** — 自动化聊天组件

### World Gen Wizard（世界观生成向导）

- 聊天式交互生成世界观实体
- 草稿节点/边渲染与提交逻辑
- 集成到 SandboxLayout

### Plot Loom（织线板）

- 替代线性时间线的 2D 看板视图
- 未来剧情锚点注入生成上下文中间件

### Dynamic Affinity Text（动态亲和文本）

- 关系动态态度追踪

### 迁移与兼容

- 遗留 RP 格式到 V5 Sandbox 迁移脚本
- AI Tool Calling Schema 自动化状态提取

### 性能优化

- SQLite WAL 模式
- 内存泄漏修复
- ECharts tree-shaking，TemplateLibrary 懒加载
- 懒加载与 pending 状态缓冲

### 质量修复

- 关键数据安全、内存泄漏、性能问题修复
- P0 安全漏洞修复
- 类型名冲突与侵蚀修复
- Rust 后端安全与命令修复
- V5 迁移后代码审查问题修复
- 结构化日志替代 console.log
- Graph 渲染与 SQLite 读取问题修复

---

## v5.0.0-rc (2026-04-11) — V5 Design System

### 主题系统

- Theme Plugin Registry 设计与实现
- ThemeExtension 类型定义
- 动态主题注入器（从插件注册表注入）
- Theme Registry 与 UI Switcher
- PluginLoader 主题注册表支持
- Element Plus 暗色模式默认启用

### 全局科幻 UI

- V5 Global Sci-Fi UI 设计与实现
- V5 UI & AI Config 重构设计

---

## v4.0.0 (2026-04-08 ~ 2026-04-09) — V4 架构演进

### 架构演进

- V4 架构全面演进，TypeScript 编译零错误
- 前端架构与技术栈文档更新

### Assistant 系统

- Slash Command 注册表
- Assistant 快捷命令路由
- 通用 Assistant Action 信封解析器
- Plugin Action Registry 执行 Assistant Actions
- 多角色 Review Command 工作流
- Assistant 命令与 Review 工作流指南

### 其他

- ESLint 规则配置
- XSS 防护加固
- 仓库元数据

---

## v3.0.0 (2026-03-25 ~ 2026-04-08) — 深度导入与工具链

### 新功能

- 深度导入（Deep Import）工作流
- 续写（Rewrite Continuation）功能
- 共享工具库提取

### 数据导入

- Conversation Trace JSONL 完整导入工作流
- Worldbook 和 Character Card 工作流集成
- Tavern Parser 设计规范

### 稳定性修复

- Chapter projectId 持久化保护
- async loadProject 错误安全处理
- P0 稳定性与安全漏洞修复

---

## v1.0.0 (2026-04-25 ~ 2026-05-23) — 初始版本

> 注：此版本基于 UI 重设计后的代码库，由 AI Fanfic Workshop 项目演化而来。

### 核心功能

- 项目创建与管理
- 章节编辑器
- AI 辅助审阅与大纲工作流
- 项目配置完整接线
- Phase A 编辑器与沙盘工作流
- 产品体验打磨
- 工作区 UI 重设计

### 技术栈

- Vue 3 + Pinia + TypeScript + Vite 5 + Element Plus
- Tauri 桌面端（Rust 后端）
- IndexedDB + localStorage 浏览器端存储
- AntV G6 图谱渲染
