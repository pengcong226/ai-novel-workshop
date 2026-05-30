# AI小说工坊 - 项目状态评估报告（v2.0）

> 更新日期：2026-05-29
> 评估依据：全量代码审查（77,482行源码、414个源文件）
> 评估者：项目负责人
> 状态：基于代码实证，每项结论均有代码行号支撑

---

## 一、项目总览

### 1.1 代码规模（实测）

| 模块 | 文件数 | 总行数 | 说明 |
|------|--------|--------|------|
| Agent 层 | 19 | ~5,200 | 含 BaseAgent、类型定义、编排器 |
| Pipeline 服务层 | 8 | ~3,800 | PipelineRunner、ReviewCycle、Scheduler 等 |
| Utils 工具层 | ~60 | ~12,000 | 导出、校验、LLM工具、上下文构建等 |
| Services 服务层 | ~30 | ~8,500 | AI服务、导入导出、世界观、生成调度等 |
| UI 组件层 | ~60 | ~18,000 | Vue组件、Sandbox、编辑器、助手面板等 |
| Store 状态层 | 13 | ~4,500 | Pinia stores |
| 类型定义 | 16 | ~2,500 | TypeScript 类型 |
| 插件系统 | 20 | ~3,000 | 插件框架、注册表、内置插件 |
| **合计** | **~414** | **~77,482** | 不含测试文件 |

### 1.2 总体评分（v2.0 修正）

| 维度 | v1.0评分 | v2.0评分 | 变化 | 依据 |
|------|----------|----------|------|------|
| 架构设计 | 9 | **9** | 不变 | 10-Agent Pipeline + 插件系统 + 双运行时架构 |
| 接口定义 | 8 | **8** | 不变 | TypeScript 类型完整，JSON Schema strict 模式 |
| 代码质量 | 6 | **7** | ↑ | `as any` 从8处增至161处但正在清理，TS零编译错误 |
| 功能闭环 | 7 | **8** | ↑ | **Phase 7-9已全部接入**（PipelineRunner:376/405/449行） |
| 测试覆盖 | 3 | **7** | ↑ | 从0%→473个测试全通过，覆盖核心Pipeline模块 |
| UX 完成度 | 7 | **8** | ↑ | 新手引导AppTour已实现，AgentConsole已同步10阶段 |
| 文档覆盖 | 6 | **5** | ↓ | 评估文档严重滞后，与实际代码状态脱节 |
| **综合** | **6.6** | **7.4** | ↑ | 主要改善来自功能闭环和测试覆盖 |

---

## 二、Pipeline 流水线状态（逐阶段确认）

### 2.1 十阶段流水线执行状态

| 阶段 | Agent | 是否接入 | 代码依据 | 说明 |
|------|-------|----------|----------|------|
| Phase 0 | prepare | ✅ 已接入 | PipelineRunner:138-151 | 提取hook池、近期摘要、章节大纲、前章尾段；大纲耗尽时自动扩展 |
| Phase 1 | PlannerAgent | ✅ 已接入 | PipelineRunner:579-622 | **无LLM调用**，纯确定性从大纲提取意图/memo |
| Phase 2 | ComposerAgent | ✅ 已接入 | PipelineRunner:206-253 | 确定性组装ContextPackage，**composeWithLLM()为stub**（ComposerAgent:496，仅调用compose()） |
| Phase 3 | Writer | ✅ 已接入 | PipelineRunner:628-766 | LLM生成正文，含NarrativeControl注入、withRetry重试 |
| Phase 4 | LengthNormalizer | ✅ 已接入 | PipelineRunner:290-308 | 可选启用（enableLengthNormalization），默认关闭 |
| Phase 5+6 | ContinuityAuditor + ReviserAgent | ✅ 已接入 | PipelineRunner:316-341 | 委托ChapterReviewCycle，含审计-修订循环 |
| Phase 7 | StateSettler | ✅ 已接入 | PipelineRunner:376 | `await this.settler.settle(...)`，try/catch保护，失败不阻断 |
| Phase 8 | ChapterAnalyzer | ✅ 已接入 | PipelineRunner:405 | `await this.analyzer.analyze(...)`，含Phase 8b长跨度疲劳检测 |
| Phase 9 | HookPromoter | ✅ 已接入 | PipelineRunner:449 | `this.hookPromoter.promote(...)`，含Phase 9b hook健康分析，受enableHookPromotion门控 |

**v1.0报告中"Phase 7-9未接入"的结论已过时**。三个阶段在后续迭代中已全部接入PipelineRunner主流程。

### 2.2 已知架构问题

| # | 问题 | 代码依据 | 严重性 |
|---|------|----------|--------|
| 1 | Phase 9嵌套在Phase 8的try块内，Phase 8失败会导致Phase 9跳过 | PipelineRunner:443-507 | 🟡 中 |
| 2 | hookPool变量在PipelineRunner中声明两次（128行和448行），内层遮蔽外层 | PipelineRunner:128,448 | 🟡 中 |
| 3 | StateSettler.settle()传入`stateChanges: []`（PipelineRunner:379），完全依赖settler内部LLM提取 | PipelineRunner:379 | 🟢 低 |

---

## 三、Agent 能力矩阵（逐代码确认）

### 3.1 Pipeline Agent（直接调用，不走AgentOrchestrator）

| Agent | 行数 | 核心能力 | LLM依赖 | 集成状态 |
|-------|------|----------|----------|----------|
| PlannerAgent | ~200 | 从大纲提取意图/memo，含场景规范化 | ❌ 无LLM | ✅ 完整 |
| ComposerAgent | ~510 | 组装ContextPackage，智能裁剪（mustKeep关键词排序），7段预算分配 | ❌ 无LLM（composeWithLLM为stub） | ⚠️ LLM增强模式未实现 |
| ContinuityAuditor | ~700 | **17维审计**：8维确定性检查 + 9维LLM审计 + hook健康 + 节奏分析 + 伏笔验证 | ✅ LLM + withRetry | ✅ 完整 |
| ReviserAgent | ~270 | 5种修订模式（auto/polish/spot-fix/anti-detect/rewrite），自动模式选择 | ✅ LLM + withRetry | ⚠️ fixedIssues未验证实际修复 |
| LengthNormalizer | ~100 | 长度标准化，字数软/硬限制 | ❌ 无LLM | ✅ 完整 |
| StateSettler | ~490 | 三阶段状态更新：ObserverFacts→WriterStateChanges→LLM二次提取 | ✅ LLM | ⚠️ projectId使用'__pending__'占位符 |
| ChapterAnalyzer | ~160 | 章节分析 + 长跨度疲劳检测 | ✅ LLM | ✅ 完整 |
| HookPromoter | ~130 | 伏笔升级检查 + hook健康分析 | ✅ LLM | ✅ 完整 |
| PostWriteValidator | ~300 | 6项确定性校验：长度/AI标记/敏感词/段落等长/重复段/标题 | ❌ 无LLM | ✅ 完整（含敏感词开关） |
| ObserverAgent | ~350 | **9类事实提取**：角色/关系/地点/物品/状态变化/伏笔/情感/时间线/数值 | ✅ LLM (temp=0.3) | ⚠️ 实体名正则匹配可能误匹配子串 |

### 3.2 AgentOrchestrator Agent（框架调用，独立于Pipeline）

| Agent | 行数 | 核心能力 | 说明 |
|-------|------|----------|------|
| EditorAgent | 26 | 编辑审校（reviewRunner profile:consistency） | 薄包装层，逻辑在reviewRunner |
| ReaderAgent | 32 | 读者反馈（reviewRunner profile:quality） | 薄包装层，返回ReaderFeedback[] |
| SentinelAgent | 26 | 逻辑校验（antiRetconValidator），可发出halt信号 | 防吃书哨兵 |
| ExtractorAgent | 20 | 设定抽取（调用外部extractChapter回调） | 通用抽取框架 |
| ShortFictionAgent | ~370 | 短篇小说生成（大纲→逐章写作→组装） | 独立于主Pipeline |

**注意**：项目中存在两套并行的Agent系统——PipelineRunner（直接调用）和AgentOrchestrator（框架调度），两者不互通。

---

## 四、功能模块完整性（逐代码确认）

### 4.1 ✅ 已完成且完整的功能

| 功能 | 代码依据 | 说明 |
|------|----------|------|
| **10阶段流水线** | PipelineRunner.ts | 全部接入，Phase 0-9完整可执行 |
| **审计-修订循环** | ChapterReviewCycle.ts | 完整：审计→快照→修订→重评→最优选，含回滚 |
| **敏感词检测** | PostWriteValidator:123-141 | 含开关控制（ProjectConfig.enableSensitiveWordCheck） |
| **伏笔追踪** | hookLedgerValidator.ts + HookPromoter | 伏笔种植/推进/回收/提及验证，集成到ContinuityAuditor |
| **节奏分析** | chapterCadence.ts (206行) | 5种场景类型检测，连续同类型告警，高张力检测，标题同质化 |
| **叙事控制** | narrativeControl.ts (280行) | 7段结构：Hook→Rising→Climax→Falling→Resolution→Transition→Cliffhanger |
| **批量续写** | BatchContinueScheduler (575行) | 暂停/恢复/取消，Token预算，每日限额50章，连续3失败自动暂停，断点持久化 |
| **自动备份** | autoBackup.ts | 30分钟间隔，IndexedDB存储，最多10快照，恢复功能 |
| **存储监控** | storageEstimator.ts | navigator.storage.estimate()，80%警告，95%严重 |
| **流水线锁** | pipelineLock.ts | 项目级互斥锁，30分钟过期自动清理 |
| **LLM重试** | llmRetry.ts | 指数退避+抖动，Agent专属配置（Writer:3/2s, Auditor:2/1s, Reviser:2/1s） |
| **错误处理** | errorHandler.ts | 55+友好消息，10阶段错误映射 |
| **EPUB导出** | epubExporter.ts | JSZip生成，含目录、章节XHTML、元数据 |
| **PDF导出** | pdfExporter.ts | 浏览器打印API，可配置字号/行高/页边距/目录 |
| **DOCX导出** | docxExporter.ts | Word格式导出 |
| **TXT/Markdown导出** | txtExporter.ts / markdownExporter.ts | 纯文本和Markdown格式 |
| **平台格式导出** | exporters/platformExporter.ts | 起点/番茄/刺猬猫/晋江/通用 5种平台适配 |
| **模板系统** | templateManager.ts + builtInTemplates.ts | 内置模板+用户模板，从模板创建 |
| **大纲系统** | outlineGenerator.ts + outlineTemplates.ts | 经典结构模板，卷管理，结构化编辑 |
| **角色提取** | characterExtractor.ts + llm/characterExtractor.ts | AI驱动的角色信息提取 |
| **关系提取** | relationExtractor.ts | AI驱动的关系提取，含好感度 |
| **世界观生成** | WorldGenWizard.vue | 对话式交互 + Tool Calling批量生成实体和关系 |
| **关系图谱** | SandboxGraph.vue | AntV G6可视化，动态好感度颜色编码 |
| **时间线** | SandboxTimeline.vue | vis-timeline时间线展示 |
| **命运织布机** | PlotLoomBoard.vue | 看板+时间线融合视图，命运锚点 |
| **小说导入分析** | novelImporter.ts + NovelImportDialog.vue | 智能提取人物、关系、章节结构 |
| **统一导入** | UnifiedImportDialog.vue | 向下兼容旧版角色卡/世界书/会话轨迹 |
| **深度导入** | Sandbox/NovelDeepImportDialog.vue | 多步骤：上传→配置→提取→审核→确认 |
| **插件系统** | plugins/ (20文件) | 完整框架：注册表7类、沙箱隔离、权限控制、主题插件 |
| **同人创作** | FanficService.ts | 4种模式：canon/AU/OOC/CP |
| **AIGC检测** | AIGCDetector.ts | GPTZero/Originality.ai外部API + 本地启发式检测 |
| **风格分析** | StyleAnalyzerAgent.ts | 5维风格指纹：句式/词汇/修辞/节奏/AI特征，3种分析深度 |
| **类型配置** | data/genres/ (14文件) | 武侠/仙侠/玄幻/都市/言情/科幻/推理/轻小说/游戏/历史 + 6英文类型 |
| **Failover路由** | ai/FailoverManager.ts | 主备模型热切换，熔断器闭环 |
| **模型路由** | ai/ModelRouter.ts | 成本感知：推演跑大模型，正文跑生文模型 |
| **向量知识库** | vector-service.ts | OpenAI Embeddings + 本地@xenova/transformers无缝切换 |
| **新手引导** | AppTour.vue | 7步引导，替代el-tour（解决v-if+v-model bug），localStorage持久化 |
| **质量报告** | QualityReport.vue | ECharts雷达图+趋势线图，含敏感词检测Tab |
| **上下文构建** | contextBuilder.ts + context/pipeline.ts | 分层记忆管理（Author's Note > World Info > Entity State > Summary > Recent） |
| **Token用量** | TokenUsagePanel.vue + tokenUsage.ts | 用量追踪和展示 |
| **成本追踪** | ai/cost-tracker.ts | 模型调用成本计算 |

### 4.2 ⚠️ 已实现但存在缺陷的功能

| 功能 | 代码依据 | 缺陷描述 |
|------|----------|----------|
| **情感弧线** | DataAdapter:91 `extractEmotionalArcs()` | **返回硬编码占位符**`(情感弧线待实现)`，非实际数据 |
| **ComposerAgent LLM模式** | ComposerAgent:496 `composeWithLLM()` | **仅调用compose()**，LLM智能裁剪未实现 |
| **ReviserAgent修复验证** | ReviserAgent:241 `fixedIssues` | **标记所有issue为已修复**，不验证实际是否修复 |
| **ObserverAgent实体匹配** | ObserverAgent:323 `countEntityMentions()` | 简单正则匹配，可能子串误匹配（如"李"匹配"李明"） |
| **StateSettler projectId** | StateSettler:413 | 使用`'__pending__'`占位符，未见后续填充代码 |
| **BatchContinueScheduler暂停超时** | BatchContinueScheduler:523 | 暂停安全超时仅1秒，暂停后会自动恢复 |
| **审计维度映射重复** | ContinuityAuditor + AuditResultAggregator | CATEGORY_ALIAS_MAP在两处重复定义，可能漂移 |

### 4.3 ❌ 确认缺失的功能

| 功能 | 说明 | 优先级建议 |
|------|------|------------|
| **跨全书张力曲线规划** | ChapterCadence仅分析单章节奏，无跨章节宏观节奏规划（高潮分布、低谷缓冲） | P1 |
| **读者模拟增强** | ReaderAgent仅32行薄包装，无法模拟不同读者群体差异化反馈 | P2 |
| **对话质量专项检测** | 无专门的对话质量分析（角色对话是否符合人设、对话/叙述比例） | P2 |
| **角色语言风格档案** | ObserverAgent提取角色信息但不追踪说话方式一致性 | P2 |
| **情感弧线实际数据** | extractEmotionalArcs()返回占位符，需接入实际情感分析 | P1 |

---

## 五、测试覆盖状态（实测）

### 5.1 当前测试统计

- **测试文件**：62个
- **测试用例**：473个，全部通过
- **覆盖范围**：Pipeline核心模块（PipelineRunner、ChapterReviewCycle、BatchContinueScheduler等）已有测试覆盖

### 5.2 v1.0报告中的"零测试"问题已解决

v1.0报告标注14个模块零测试覆盖，经过5轮迭代，核心Pipeline模块已补齐测试。当前473个测试全通过。

---

## 六、技术债务清单（代码实测）

### 6.1 as any 类型逃逸

- **当前数量**：161处（v1.0报告为8处，后续迭代新增+原始未统计）
- **根因**：Project类型未包含`_entities`、`_stateEvents`、`plotEvents`等运行时附加字段
- **建议**：扩展Project接口或创建RuntimeProject extends Project

### 6.2 TODO/FIXME 遗留

- **当前数量**：4处
- 开发工程师正在清理中

### 6.3 两套并行Agent系统

- PipelineRunner：直接调用Agent，串行执行10阶段
- AgentOrchestrator：框架调度Agent，支持halt传播，串行执行
- 两者不互通，可能造成维护成本增加

---

## 七、与v1.0报告的差异说明

| v1.0结论 | 实际代码状态 | 差异原因 |
|----------|-------------|----------|
| "Phase 7-9未接入" | **已全部接入**（PipelineRunner:376/405/449） | 后续迭代已修复，文档未更新 |
| "Pipeline测试覆盖为零" | **473个测试全通过** | 后续迭代已补齐测试 |
| "as any仅8处" | **实际161处** | v1.0仅统计新增代码，未统计存量代码 |
| "AgentConsole未同步新角色" | **已同步10阶段** | 后续迭代已修复 |
| "新手引导缺失" | **AppTour已实现** | 后续迭代已实现（自定义组件替代el-tour） |
| "EPUB/PDF导出需增强" | **已有多格式+平台导出** | v1.0未充分审查存量代码 |
| "模板系统缺失" | **已有完整模板系统** | v1.0误判，templateManager+builtInTemplates已存在 |
| "角色追踪缺失" | **ObserverAgent 9类事实+StateSettler** | v1.0误判，已有完整角色追踪体系 |
| "批量创作缺失" | **BatchContinueScheduler已实现** | v1.0误判，575行完整调度器已存在 |

---

## 八、优化方向（基于代码实证，按优先级排序）

### 8.1 P1 - 应当尽快完成

| # | 方向 | 代码依据 | 预期收益 |
|---|------|----------|----------|
| 1 | 实现情感弧线提取 | DataAdapter:91 返回占位符 | 上下文包中情感弧线从占位符变为实际数据，提升写作连贯性 |
| 2 | 解耦Phase 8/9错误处理 | PipelineRunner:443-507 Phase 9嵌套在Phase 8 try块 | Phase 8失败不影响Phase 9执行 |
| 3 | 修复hookPool变量遮蔽 | PipelineRunner:128 vs 448 | 消除潜在逻辑错误 |
| 4 | 统一审计维度映射 | ContinuityAuditor + AuditResultAggregator 重复定义 | 消除映射漂移风险 |

### 8.2 P2 - 中期优化

| # | 方向 | 代码依据 | 预期收益 |
|---|------|----------|----------|
| 5 | 跨全书张力曲线规划 | chapterCadence.ts仅单章分析 | 全局节奏把控，避免高潮扎堆或低谷过长 |
| 6 | ReaderAgent增强 | ReaderAgent仅32行薄包装 | 模拟不同读者群体差异化反馈 |
| 7 | 对话质量检测 | 无专门对话分析Agent | 角色对话一致性、对话/叙述比例检测 |
| 8 | 角色语言风格档案 | ObserverAgent不追踪说话方式 | 跨章节角色语言一致性追踪 |
| 9 | ReviserAgent修复验证 | ReviserAgent:241 盲目标记fixedIssues | 验证LLM是否实际修复了问题 |
| 10 | ComposerAgent LLM裁剪 | ComposerAgent:496 stub | 长篇小说上下文质量提升 |
| 11 | StateSettler projectId修复 | StateSettler:413 '__pending__'占位符 | 状态事件正确关联项目 |

### 8.3 P3 - 长期投入

| # | 方向 | 预期收益 |
|---|------|----------|
| 12 | 两套Agent系统合并 | 降低维护成本 |
| 13 | ObserverAgent实体名精确匹配 | 消除子串误匹配 |
| 14 | BatchContinueScheduler暂停机制优化 | 暂停超时从1秒延长到合理值 |
| 15 | as any全面清理（161处） | 类型安全 |

---

## 九、结论

经过5轮迭代开发，AI小说工坊已从"架构完成"推进到"功能完整、测试达标"阶段。v1.0报告中标注的关键问题（Phase 7-9未接入、测试零覆盖、新手引导缺失）已全部解决。

当前系统具备：
- ✅ 完整的10阶段AI创作流水线
- ✅ 17维审计 + 多轮修订循环
- ✅ 伏笔追踪、节奏分析、叙事控制
- ✅ 多格式导出 + 平台适配
- ✅ 完整的Sandbox系统（实体/关系/时间线/命运织布机/世界观生成）
- ✅ 插件系统 + 模板系统 + 批量续写
- ✅ 473个测试全通过
- ✅ 新手引导 + 敏感词检测开关

需要持续改进的方向集中在：情感弧线数据化、跨全书节奏规划、对话质量检测、角色语言风格追踪。

---

> 本报告每项结论均基于代码实证，附代码行号依据。如需验证任何结论，可直接查阅对应文件和行号。
