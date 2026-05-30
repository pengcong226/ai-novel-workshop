# 第四轮迭代 — 产品评估报告

> 评估日期：2026-05-29
> 评估者：产品经理
> 代码规模：118,342 行源码 + 11,290 行测试

---

## 一、第三轮修复验证

| 第三轮任务 | 状态 | 验证 |
|-----------|------|------|
| 上下文智能裁剪 | ✅ 已完成 | ComposerAgent 已集成意图感知排序 |
| 章节节奏分析 | ✅ 已完成 | `chapterCadence.ts` 已实现确定性模式检测 |
| Onboarding dismiss 修复 | ✅ 已完成 | `useOnboarding.ts` 新增 `dismissed-at` 时间戳，24小时内不重复弹出 |
| 虚拟滚动 | ✅ 已完成 | Chapters.vue 使用 `@tanstack/vue-virtual` 实现虚拟化 |
| 审计维度增强 | ✅ 已完成 | ContinuityAuditor 已融入节奏分析结果 |

---

## 二、剩余 InkOS 高价值功能分析

### 2.1 完全未实现的功能

| # | 功能 | InkOS 实现 | 价值评估 | 建议 |
|---|------|-----------|----------|------|
| 1 | **Narrative Control（叙事控制）** | `narrative-control.ts`：将 ChapterMemo 渲染为叙事控制块注入 Writer prompt，确保 Writer 严格执行 memo 中的 7 段结构 | ⭐⭐⭐⭐ | **值得实现** — 直接提升 Writer 对 memo 的遵从度 |
| 2 | **Hook Ledger Validator（伏笔账本校验）** | `hook-ledger-validator.ts`：在审计阶段验证正文中是否实际执行了 memo 承诺的伏笔操作 | ⭐⭐⭐⭐ | **值得实现** — 与伏笔健康系统配合形成闭环 |
| 3 | **Consolidator（真相文件重建器）** | `consolidator.ts`：每章完成后从正文反推重建全部 truth files（7个结构化文件） | ⭐⭐⭐ | **部分等价** — StateSettler + ChapterAnalyzer + HookPromoter 已覆盖核心功能，但缺乏完整的 truth file 一致性校验 |
| 4 | **Foundation Reviewer（基础审阅器）** | `foundation-reviewer.ts`：建书时对 Architect 产出的基础设定进行 LLM 质量审阅 | ⭐⭐ | **低优先级** — 仅影响项目创建阶段，工坊的 WorldGenWizard 已有类似功能 |
| 5 | **Polisher（润色器）** | `polisher.ts`：独立于 Reviser 的轻量级润色步骤 | ⭐⭐⭐ | **可替代** — ReviserAgent 的 `polish` 模式已覆盖 |

### 2.2 建议本轮实现的功能

#### 功能 A：Narrative Control（叙事控制注入）

**现状差距**：PipelineRunner 的 ChapterMemo 仅传递给 ComposerAgent 做上下文选择，但 Writer 撰写正文时**不强制要求按 memo 结构输出**。

**InKOS 做法**：`narrative-control.ts` 将 ChapterMemo 渲染为结构化的「叙事控制块」，注入 Writer 的 system prompt 中，强制 Writer 按 memo 的 7 段结构组织正文。

**实现方案**：
1. 新增 `src/utils/narrativeControl.ts`
2. 将 ChapterMemo 转换为 Writer prompt 中的结构化指令块
3. 在 PipelineRunner Phase 3（Write）中注入

**预估工作量**：1 人日

#### 功能 B：Hook Ledger Validator（伏笔账本校验）

**现状差距**：审计阶段不检查正文是否实际执行了 memo 中承诺的伏笔操作（如"本章应回收伏笔 X"但正文中未回收）。

**实现方案**：
1. 新增 `src/utils/hookLedgerValidator.ts`
2. 解析 ChapterMemo 中的伏笔操作承诺
3. 在 PostWriteValidator 中增加伏笔执行校验
4. 未执行的伏笔操作标记为 `warning` 级 issue

**预估工作量**：1 人日

---

## 三、深度用户体验优化

### 3.1 Onboarding 流程优化

**现状评估**：

| 引导类型 | 触发逻辑 | 持久化 | 问题 |
|----------|----------|--------|------|
| OnboardingDialog | 首次进入 | `completed` + `dismissed-at`（24h 保护） | ✅ 已修复 |
| Sandbox Tour | 首次进入沙盘 | `completed` | ✅ 正常 |
| Pipeline 引导 | 无 | — | ❌ 缺失 |

#### UX-1：Pipeline 首次使用引导（预估 1 人日）

**现状**：用户首次点击「一键续写」时，WriteNextDialog 只有配置选项，没有说明 Pipeline 是什么、将经历哪些阶段。

**建议**：
1. 在 WriteNextDialog 顶部增加简要说明卡片："AI 将自动完成 规划→写作→审计→修订 的全流程"
2. 增加"了解更多"链接，展开 Pipeline 阶段说明
3. 首次使用时 tooltip 标注关键配置项

#### UX-2：审计结果可视化增强（预估 1.5 人日）

**现状**：QualityReport 展示审计建议列表，但缺少：
- 各维度评分雷达图（直观展示哪些维度达标/不达标）
- 历史评分趋势折线图（展示最近 N 章的质量走势）
- 修订前后对比（展示 Reviser 修复了哪些问题）

**建议**：在 QualityReport 中增加维度雷达图和趋势折线图。

#### UX-3：章节编辑器内嵌 AI 助手（预估 2 人日）

**现状**：用户在编辑器中修改章节时，需要切到 AI 助手面板才能进行对话式修改。操作路径长。

**建议**：在 NovelEditor 中增加内嵌的 AI 修改建议面板，选中文本后 bubble menu 直接提供"AI 润色/扩写/缩写/改写"选项。

### 3.2 错误体验优化

**现状**：`errorHandler.ts` 已实现统一错误处理（分类、分级、恢复建议），`FailoverManager` + `CircuitBreaker` 已实现模型故障转移。

**仍需改进**：

#### UX-4：Pipeline 阶段级错误提示（预估 0.5 人日）

Pipeline 某阶段失败时，当前只返回通用的 "流水线执行失败"。应按阶段提供针对性提示：
- Planner 失败："大纲信息不足，请检查大纲是否完整"
- Writer 失败："AI 服务响应超时，请检查网络或切换模型"
- Auditor 失败："审计服务不可用，章节已跳过审计直接保存"

---

## 四、系统稳定性和健壮性

### 4.1 已有稳定性机制

| 机制 | 实现 | 评估 |
|------|------|------|
| CircuitBreaker | `ai/CircuitBreaker.ts` — 三态熔断器（CLOSED/OPEN/HALF_OPEN） | ✅ 成熟 |
| FailoverManager | `ai/FailoverManager.ts` — 多模型故障转移 | ✅ 成熟 |
| ErrorHandler | `utils/errorHandler.ts` — 统一错误处理（4级分类、恢复建议） | ✅ 成熟 |
| IndexedDB 事务 | `storage.ts` — 使用 IDBTransaction 保证原子性 | ✅ 正确 |
| Pipeline 错误降级 | Phase 7-9 失败不阻断流水线 | ✅ 合理 |

### 4.2 需要增强的稳定性点

#### ST-1：Pipeline 内 LLM 调用缺少统一重试策略

**现状**：PipelineRunner 中各 Agent 独立调用 LLM，但重试逻辑不统一：
- Writer 通过 FailoverManager 有重试
- Auditor/Reviser 直接调用 aiStore，无重试
- Composer 不调用 LLM（纯确定性），无此问题

**建议**：统一所有 Pipeline 内的 LLM 调用通过 FailoverManager，获得一致的重试和故障转移能力。

**预估工作量**：1 人日

#### ST-2：IndexedDB 存储空间监控

**现状**：项目数据持续增长（章节内容、快照、实体、状态事件），但无存储空间监控。当 IndexedDB 接近配额时可能静默失败。

**建议**：
1. 在 storage.ts 中增加 `estimateStorageUsage()` 方法（使用 `navigator.storage.estimate()`）
2. 在 WritingDashboard 中展示存储使用率
3. 使用率超过 80% 时弹出警告

**预估工作量**：0.5 人日

#### ST-3：Pipeline 并发保护

**现状**：用户可能同时触发一键续写和守护进程自动续写，导致两个 PipelineRunner 并发操作同一项目。

**建议**：
1. 在项目级别增加全局写锁
2. 一键续写和 Daemon 互斥运行
3. 锁冲突时提示"另一个续写任务正在运行"

**预估工作量**：0.5 人日

---

## 五、数据安全和备份

### 5.1 已有数据安全机制

| 机制 | 实现 | 评估 |
|------|------|------|
| 项目备份导出 | `projectBackup.ts` — 完整的项目+沙盘数据导出（ProjectBackupV1） | ✅ 成熟 |
| 章节快照 | `chapterVersioning.ts` — 自动/手动快照，支持列表和回滚 | ✅ 成熟 |
| 章节保存锁 | `project.ts` 第 296 行 — 防并发 saveCurrentProject 覆盖数据 | ✅ 已有 |
| IndexedDB 事务 | 原子写入项目和章节 | ✅ 正确 |
| 断点恢复 | `checkpointManager.ts` — IndexedDB 持久化断点 | ✅ 已有 |

### 5.2 需要增强的数据安全点

#### DS-1：自动定期备份（预估 1.5 人日）

**现状**：备份是手动操作（用户需主动导出）。如果用户忘记备份，数据丢失后无法恢复。

**建议**：
1. 在 `project.ts` 的 `saveCurrentProject()` 中增加自动快照逻辑
2. 每次保存时检查距上次自动备份是否超过 N 分钟（默认 30 分钟）
3. 自动备份存储到 IndexedDB 的专用 store（`auto-backups`）
4. 保留最近 10 个自动备份，超过的自动清理
5. 在 ProjectList 中增加"恢复自动备份"入口

#### DS-2：Pipeline 续写章节的即时保存（预估 0.5 人日）

**现状**：BatchContinueScheduler 的 `autoSave` 选项为 true 时会逐章保存，但如果浏览器崩溃发生在章节完成和保存之间，该章节内容丢失。

**建议**：
1. 在 PipelineRunner 返回 result 后**立即**持久化章节内容到 IndexedDB
2. 使用 `requestIdleCallback` 异步保存，不阻塞下一章生成
3. 恢复时检查是否有未保存的已完成章节

#### DS-3：数据导出格式增强（预估 1 人日）

**现状**：支持 PDF 导出和 JSON 备份。缺少：
- **EPUB 导出**：发布到各阅读平台的标准格式
- **Markdown 导出**：方便在其他编辑器中继续编辑
- **TXT 纯文本导出**：最通用的格式

**建议**：在 ExportSettings 中增加 EPUB、Markdown、TXT 三种导出格式选项。

---

## 六、综合优化建议（第四轮）

| # | 任务 | 类别 | 优先级 | 工作量 |
|---|------|------|--------|--------|
| 1 | Narrative Control（叙事控制注入） | 质量 | P0 | 1 人日 |
| 2 | Hook Ledger Validator（伏笔账本校验） | 质量 | P0 | 1 人日 |
| 3 | 自动定期备份 | 安全 | P0 | 1.5 人日 |
| 4 | Pipeline 首次使用引导 | UX | P1 | 1 人日 |
| 5 | 审计结果雷达图+趋势图 | UX | P1 | 1.5 人日 |
| 6 | Pipeline LLM 调用统一重试 | 稳定性 | P1 | 1 人日 |
| 7 | EPUB/Markdown/TXT 导出 | 安全 | P1 | 1 人日 |
| 8 | Pipeline 续写即时保存 | 安全 | P1 | 0.5 人日 |
| 9 | Pipeline 并发保护（写锁） | 稳定性 | P1 | 0.5 人日 |
| 10 | 存储空间监控 | 稳定性 | P2 | 0.5 人日 |
| 11 | Pipeline 阶段级错误提示 | UX | P2 | 0.5 人日 |
| 12 | 章节编辑器内嵌 AI 助手 | UX | P2 | 2 人日 |

**总预估工作量**：12 人日

### 建议聚焦方向

**A. 质量闭环**（2 人日）：Narrative Control + Hook Ledger Validator
→ 完成 Writer 对 memo 的遵从度验证 + 伏笔执行校验，形成从规划到验证的完整质量闭环。

**B. 数据安全**（3 人日）：自动备份 + 即时保存 + 多格式导出
→ 保障用户创作数据零丢失，提供灵活的导出选项。

**C. 稳定性 + UX**（7 人日）：重试统一 + 并发保护 + 引导 + 可视化
→ 提升系统整体健壮性和使用体验。

---

## 七、结论

经过三轮迭代，系统已从"功能缺失"推进到"深度打磨"阶段。剩余可借鉴的 InkOS 核心功能仅有 2 项（Narrative Control 和 Hook Ledger Validator），其余为体验和稳定性增强。

**当前系统完整度评估**：

| 维度 | 完成度 | 说明 |
|------|--------|------|
| 核心 Pipeline | 95% | 仅缺叙事控制注入和伏笔账本校验 |
| 审计修订 | 92% | 16 维度 + 节奏分析 + 伏笔健康，仅缺雷达图可视化 |
| UX | 85% | 引导体系基本完善，缺 Pipeline 引导和审计可视化 |
| 数据安全 | 80% | 有备份/快照/事务保护，缺自动备份和多格式导出 |
| 稳定性 | 85% | 有熔断/故障转移/错误处理，缺统一重试和并发保护 |
| 性能 | 88% | 有懒加载/虚拟滚动，缺按需加载和存储监控 |

**建议本轮完成 12 人日的优化后，系统将达到生产就绪状态。**

---

> 本报告为产品经理对项目第四轮迭代的评估，供项目负责人参考决策。
