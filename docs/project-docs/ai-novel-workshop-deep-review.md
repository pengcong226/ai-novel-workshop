# AI小说工坊 - 产品经理深度审视报告（v2）

> 审视日期：2026-05-27
> 审视人：产品经理
> 项目版本：v5.0.0
> 审视方法：逐文件阅读源码、组件、文档、配置，每个结论附文件路径和代码依据

---

## 一、产品定位与目标用户评估

### 1.1 定位现状与矛盾

项目存在**两套产品定位并存**的问题：

**定位A：AI长篇小说智能生成工具**（见 `README.md` 第3-5行）
- "一个支持100万字以上长篇小说的智能生成系统"
- "通过Entity & StateEvent状态记忆系统确保长篇创作的连贯性和一致性"
- 核心价值：帮用户从零创作一部长篇小说

**定位B：互动式同人小说生成器**（见 `DESIGN.md` 第6-11行）
- "一个互动式同人小说生成器，让用户在阅读小说时可以随时'如果主角这样做会怎样'"
- "不需要从零构建世界观和人物设定——原作自带"
- DESIGN.md第35行明确写道："推倒重来，设计全新的同人创作系统，不再维护原项目"

**矛盾点**：
- README.md中展示了v5.0大量已完成的功能（Entity系统、滚动大纲、向量检索等），显然项目仍在持续维护
- DESIGN.md中提出的新方向（Python FastAPI后端、PostgreSQL、用户系统）与现有架构完全不同
- 代码仓库中的实际实现（`src/`目录）显然是定位A的产物，定位B停留在设计文档阶段
- 产品方向未最终确定，会导致团队资源分配和优先级判断混乱

### 1.2 目标用户画像

PRD（`docs/requirements.md` 第28-30行）定义了三类用户：
1. **网文作者**（提高创作效率）
2. **小说爱好者**（自娱自乐）
3. **内容创作者**（快速生成内容）

**问题**：三类用户的需求差异巨大：
- 网文作者需要精细控制、高质量输出、对主流平台的发布支持
- 小说爱好者需要低门槛、快速上手、趣味性
- 内容创作者需要批量生产、效率优先、模板化

从代码实现来看，系统偏向"专业工具型"：
- `src/components/ProjectConfig.vue` 提供了"小白模式"和"极客模式"双模式切换
- `src/stores/ai.ts` 第70-88行的模型路由逻辑（plannerModel/writerModel/sentinelModel/extractorModel）面向的是对AI模型有认知的专业用户
- `src/components/TokenUsagePanel.vue` 提供了Token用量和成本管理，面向对AI调用成本敏感的用户

**结论**：实际实现偏向对AI有认知的进阶用户，与"小说爱好者自娱自乐"的定位存在落差。

---

## 二、功能模块逐一分析

### 2.1 项目管理模块

**涉及文件**：
- `src/views/ProjectList.vue` — 项目列表页
- `src/stores/project.ts` — 项目状态管理

**功能覆盖**：
| 功能 | 实现状态 | 代码位置 |
|------|----------|----------|
| 创建项目 | ✅ 完整 | `ProjectList.vue` 第342-377行：表单校验+模板应用+路由跳转 |
| 项目列表展示 | ✅ 完整 | `ProjectList.vue` 第37-96行：卡片网格+进度条+状态标签 |
| 从模板创建 | ✅ 完整 | `ProjectList.vue` 第451-526行：模板选择+实体注入+保存 |
| 导入项目 | ✅ 完整 | `project.ts` 第513-586行：支持.anproj和.anprojl两种格式 |
| 导出项目 | ✅ 完整 | `project.ts` 第490-510行：含Sandbox数据的完整备份 |
| 删除项目 | ✅ 完整 | `project.ts` 第468-487行 |
| 章节级独立存储 | ✅ 完整 | `project.ts` 第374-463行：loadChapter/saveChapter/deleteChapter |

**亮点**：
- `project.ts` 第184-265行实现了**防抖保存+页面卸载同步备份**机制（beforeunload写localStorage），防止用户意外关闭丢失数据
- `project.ts` 第296-371行实现了**保存锁**（isSaving+pendingSave），避免并发保存覆盖
- `.anprojl`格式（第189-251行）支持流式导入大型项目文件，避免一次性加载OOM

**问题**：
- `ProjectList.vue` 第282-286行：新建项目默认目标字数100万（targetWords: 1000000），步长5万（:step=50000），对新手用户来说这个默认值和步长太大
- `ProjectList.vue` 第311-314行：`TEMPLATE_BY_CREATE_OPTION`映射中，"标准网文"映射到`builtin-fantasy`，"快速大纲"映射到`builtin-urban`，这种映射关系不够直观，用户选择"快速大纲"实际上得到的是都市模板

### 2.2 记忆系统（Entity & StateEvent）

**涉及文件**：
- `src/stores/sandbox.ts` — 核心状态管理
- `src/types/sandbox.ts` — 数据模型定义
- `src/utils/stateDiff.ts` — 状态推演引擎

**架构设计**：
- Entity定义（sandbox.ts 第14-17行）：支持7种类型CHARACTER/FACTION/LOCATION/LORE/ITEM/CONCEPT/WORLD
- StateEvent定义（sandbox.ts 第20-28行）：7种事件类型PROPERTY_UPDATE/RELATION_ADD/RELATION_REMOVE/RELATION_UPDATE/LOCATION_MOVE/VITAL_STATUS_CHANGE/ABILITY_CHANGE
- 状态推演（sandbox.ts 第351-373行）：`activeEntitiesState`计算属性通过`replayReducer`将Entity+StateEvent合并为ResolvedEntity，实现任意章节的状态快照

**实现质量评估**：
1. **运行时边界防护**（sandbox.ts 第9行）：通过`isWebRuntime()`区分Tauri和浏览器环境，Tauri模式走IPC调用SQLite，浏览器模式走localStorage
2. **数据验证**（sandbox.ts 第40-98行）：`isLoadedEntity`和`isLoadedStateEvent`函数对加载数据进行严格的类型校验，防止脏数据进入系统
3. **批量操作**（sandbox.ts 第463-533行）：`batchAddEntities`和`batchAddStateEvents`支持批量写入
4. **事务安全**（sandbox.ts 第637-684行）：`replaceProjectData`在Web模式下实现了回滚机制（先保存旧数据，失败时恢复）

**问题**：
- `sandbox.ts` 第122-135行：Web模式下使用**localStorage存储所有实体和状态事件**，当项目数据量大时（100万字小说可能有数百个实体和数千条状态事件），localStorage的5-10MB容量限制将成为瓶颈
- `sandbox.ts` 第140行：`pendingStateEvents`用于WorldGenWizard的草稿预览，但在`loadData`中未被持久化，意味着页面刷新后草稿丢失
- Entity类型中包含CONCEPT（概念）和WORLD（世界）类型，但从SandboxLayout（`Sandbox/SandboxLayout.vue`第13-17行）的Tab分类来看，UI层未对这些类型做专门的视图展示

### 2.3 AI服务层

**涉及文件**：
- `src/stores/ai.ts` — AI Store
- `src/services/ai-service.ts` — AI服务核心
- `src/services/ai/ModelRouter.ts` — 模型路由

**模型路由策略**（`ai.ts` 第70-88行）：
```typescript
// resolvePreferredModel函数
if (contextType === 'outline' || contextType === 'worldbuilding' || contextType === 'character')
  → plannerModel  // 规划用高智商模型
if (contextType === 'chapter')
  → writerModel   // 写作用性价比模型
if (contextType === 'check')
  → sentinelModel // 检查用轻量模型
if (contextType === 'state_extraction' || contextType === 'memory_update')
  → extractorModel // 提取用模型
```

**四层模型路由**（planner/writer/sentinel/extractor）实现了PRD中"分层AI策略"的设计，每层可绑定不同模型。

**Mock模式**（`ai.ts` 第90-138行）：开发环境支持零Token Mock模式，`emitMockStream`模拟流式输出，方便开发调试。

**预算管理**（`ai.ts` 第175-180行）：自动计算三级预算——chapterLimitUSD（单章）、dailyLimitUSD（日限额=max(单章*5, 单章)）、monthlyLimitUSD（月限额=max(单章*100, 10)）。

**问题**：
- `ai.ts` 第168-173行：当providers数组为空时直接return，错误信息存储在`error`中但**不会主动通知用户**，用户可能在尝试生成时才发现AI未初始化
- `ai.ts` 第221-236行：同类型内置提供商只注册第一个（第235行注释"同类型内置提供商已存在，跳过后续注册"），如果用户配置了多个OpenAI兼容的自定义提供商，只有第一个会被使用
- 预算计算逻辑（第177行）过于简单：`dailyLimitUSD = max(chapterLimit * 5, chapterLimit)`实际上等于`chapterLimit * 5`，缺乏用户自定义入口

### 2.4 章节管理与生成

**涉及文件**：
- `src/components/Chapters.vue` — 章节管理组件
- `src/components/WritingDashboard.vue` — 写作仪表盘

**功能覆盖**（`Chapters.vue` 第1-150行）：
- 章节列表展示（虚拟滚动优化，第53-65行）
- 拖拽排序（第76-85行）
- AI批量生成（第34行按钮）
- 续写/改写（第38-39行按钮）
- 导出（Markdown/PDF/JSON，第19-33行）
- 验证章节（第8行按钮）
- 检查点查看（第131行按钮）
- 插件工具栏扩展（第135-145行）

**亮点**：
- 使用`@tanstack/vue-virtual`实现虚拟滚动，支持大量章节的流畅浏览
- 章节存储采用**内容剥离策略**（`project.ts`第399-407行）：前端状态中的章节不包含content字段，只在需要编辑时按需加载，防止百万字项目OOM
- 导出功能支持可配置的输出设置（第28-29行）

**问题**：
- `Chapters.vue` 第128-129行："重新生成"按钮没有二次确认，用户可能误触导致章节内容被覆盖
- 虚拟滚动容器高度硬编码为`calc(100vh - 200px)`（第53行），在不同屏幕尺寸下可能不精确

### 2.5 沙盘系统（多视图沙盒）

**涉及文件**：
- `src/components/Sandbox/SandboxLayout.vue` — 沙盘布局
- `src/components/Sandbox/SandboxDocument.vue` — 实体文档视图
- `src/components/Sandbox/SandboxGraph.vue` — 关系图谱
- `src/components/Sandbox/PlotLoomBoard.vue` — 命运织布机
- `src/components/Sandbox/SandboxMap.vue` — 势力地图
- `src/components/Sandbox/WorldGenWizard.vue` — 创世向导
- `src/components/Sandbox/AutomatonChat.vue` — AI对话

**布局设计**（`SandboxLayout.vue`第1-26行）：
- 三栏布局：左侧实体树（250px）+ 中间主视图（flex:1）+ 右侧面板（300px）
- 中间区域通过el-tabs切换4种视图：文档视图/命运织布机/关系图/势力图
- 右侧面板根据状态切换：NovelDeepImportDialog / WorldGenWizard / AutomatonChat

**问题**：
- `SandboxLayout.vue` 第3行：左侧sidebar标记为"Entities Tree (WIP)"，说明**实体树组件尚未完成**
- `SandboxLayout.vue` 第82-84行：样式使用硬编码的`#fff`白色背景和`#e4e7ed`边框，**未使用Design System的CSS变量**（如`--ds-surface`等），与项目的暗色主题系统不兼容，在暗色模式下会出现白色块
- `SandboxLayout.vue` 第41行：默认激活Tab为`timeline`（命运织布机），而非更直观的`doc`（文档视图），对新用户不够友好

### 2.6 AI助手与建议系统

**涉及文件**：
- `src/components/AIAssistant.vue` — AI助手组件
- `src/stores/suggestions.ts` — 建议管理

**功能设计**（`AIAssistant.vue`第1-68行）：
- 浮动按钮入口+Drawer侧滑面板
- 三个Tab：对话/建议/统计
- 快捷命令：总结设定/优化世界观/设计配角/推演剧情（第122-127行）
- 建议管理：支持标记已读/采纳/忽略/批量操作（第42-53行）
- 统计面板：ECharts图表展示建议分布（第57-63行）

**亮点**：
- 快捷命令设计精准，覆盖了创作者最常需要的AI辅助场景
- 建议系统支持优先级过滤和批量操作，便于用户管理大量AI建议
- 审校工作流（见`docs/assistant/review-workflow.md`）支持一致性审查员/质量评估员/主编三种角色预设

### 2.7 质量检查系统

**涉及文件**：
- `src/components/QualityReport.vue` — 质量报告组件
- `src/utils/qualityChecker.ts` — 质量检查工具

**功能**：
- 批量章节质量检查
- 质量趋势图表
- 多维度雷达图（文笔/逻辑等）
- 报告导出

**问题**：
- 质量检查依赖AI模型（sentinelModel），如果用户只配置了一个模型，质量检查和写作会使用同一模型，无法实现真正的分层策略
- 质量检查深度有限：主要基于AI的主观评估，缺乏基于规则的硬性检查（如时间线矛盾检测、人物位置一致性验证等）

### 2.8 模板系统

**涉及文件**：
- `src/components/TemplateLibrary.vue` — 模板库组件
- `src/utils/templateManager.ts` — 模板管理器

**功能**：
- 内置玄幻/都市/科幻/武侠等分类模板
- 支持搜索和AI生成流派模板
- 支持导入导出
- 从模板创建项目时可选择导入内容（世界观/角色/大纲）

**问题**：
- 用户自定义模板存储在localStorage中（templateManager），有容量限制且无法跨设备同步
- 模板中的实体数据与V5 Entity格式绑定，旧版模板可能需要迁移

### 2.9 插件系统

**涉及文件**：
- `src/plugins/types.ts` — 插件类型定义
- `src/plugins/manager.ts` — 插件管理器
- `src/plugins/init.ts` — 内置插件初始化

**架构**：支持9个注册表（菜单、侧边栏面板、工具栏按钮、AI提供商、主题等），插件可扩展系统功能的各个方面。

**亮点**：
- ProjectEditor中已实现插件菜单项和侧边栏面板的动态注入（`ProjectEditor.vue`第372-401行）
- Chapters组件中实现了插件工具栏按钮的动态渲染（`Chapters.vue`第135-145行）

**问题**：
- 插件生态需要积累，目前仅有3个内置插件和4个示例插件
- 插件安全沙箱机制在types.ts中有定义，但实际隔离程度需要验证

---

## 三、产品逻辑与业务流程分析

### 3.1 核心创作流程

从代码梳理出的完整创作流程：

```
创建项目(ProjectList) → 配置AI模型(ProjectConfig)
  → 搭建世界观(WorldGenWizard/SandboxDocument)
  → 设定人物(SandboxDocument)
  → 编写大纲(PlotLoomBoard)
  → 生成章节(Chapters/批量生成)
  → AI审校(AIAssistant/review-workflow)
  → 修正优化(QualityReport)
  → 导出(Chapters/MarkdownExporter)
```

**流程评价**：
- 步骤过多（7-8步），对新用户来说冷启动路径太长
- 缺少"快速体验"模式：用户从创建到看到第一个AI生成内容至少需要配置AI+创建设定+编写大纲三个前置步骤
- WorldGenWizard（创世向导）是降低世界观搭建门槛的创新设计，但位于沙盘系统内部，用户不容易发现

### 3.2 数据流分析

```
用户操作 → Vue组件 → Pinia Store → 存储层
  - 项目数据：project store → storage adapter → IndexedDB(localStorage列表+IDB详情)
  - 实体数据：sandbox store → localStorage(Web)/Tauri IPC+SQLite(桌面)
  - AI配置：project store → project.config → localStorage(加密)
```

**问题**：数据分散在三个存储位置：
1. localStorage：项目列表、全局配置、AI配置（加密）、Web模式Sandbox数据
2. IndexedDB：项目详情、章节内容
3. SQLite（仅桌面端）：实体和状态事件

Web模式下Sandbox使用localStorage而非IndexedDB，是一个架构限制。当实体和状态事件数据量增长时，localStorage的容量限制（约5-10MB）将导致问题。

### 3.3 V1→V5迁移策略

**文件**：`src/utils/v1ToV5Migration.ts`

系统在`project.ts`第141-170行实现了自动迁移：当打开项目发现sandbox无数据但有旧版characters/world时，自动执行V1→V5迁移。

**亮点**：迁移对用户透明，不需要手动操作。
**问题**：迁移过程中的错误被静默捕获（第168行），如果迁移失败用户不会收到任何提示。

---

## 四、技术架构产品化评估

### 4.1 双运行时架构

项目通过`isWebRuntime()`（引用自`src/utils/anthropic-guard.ts`）区分Web和Tauri环境，所有存储操作都有两条路径。

**产品影响**：
- Web版本功能完整但受浏览器存储限制
- 桌面版性能更好但需要安装Rust环境
- 用户可能不清楚两种版本的差异，FAQ中虽有说明（README.md第586-593行）但不够醒目

### 4.2 Design System

项目建立了完整的CSS变量体系（`src/assets/styles/design-system.css`），包含`--ds-*`系列设计令牌。

**问题**：部分组件未使用Design System：
- `SandboxLayout.vue`第82-84行使用硬编码颜色值
- 侧边栏样式与Element Plus变量混合使用

### 4.3 代码规范问题

1. **V1废弃类型残留**：`src/types/index.ts`中存在大量`@deprecated`标注的旧类型（Character、WorldView等），与V5 Entity类型并存
2. **路由使用createWebHistory**：`vite.config.ts`中配置了history模式路由，违反项目规范要求使用hashRouter
3. **index.html缺少inspect.js引用**：违反规范要求必须包含的功能插件脚本

---

## 五、竞品对比分析

### 5.1 Sudowrite（海外主流AI写作工具）

| 维度 | AI小说工坊 | Sudowrite |
|------|-----------|-----------|
| 目标用户 | 中文创作者 | 英文创作者 |
| 长篇支持 | ✅ 100万字+（Entity+StateEvent架构） | ⚠️ 有限（依赖简单摘要） |
| 记忆系统 | ✅ 事件溯源+向量检索+三层记忆 | ⚠️ 基础上下文管理 |
| 本地存储 | ✅ 完全本地 | ❌ 云端存储 |
| 模型选择 | ✅ 多提供商+自定义 | ⚠️ 平台提供，用户不可选 |
| UI成熟度 | ⚠️ 中等（部分组件未完成） | ✅ 高（商业化打磨） |
| 新手引导 | ❌ 缺乏 | ✅ 完善 |
| 商业模式 | ❌ 无（MIT开源） | ✅ 订阅制（$19-99/月） |

**AI小说工坊的优势**：长篇记忆系统、本地存储、模型自由度
**AI小说工坊的劣势**：UI打磨、新手引导、商业模式

### 5.2 SillyTavern（开源角色扮演工具）

| 维度 | AI小说工坊 | SillyTavern |
|------|-----------|-------------|
| 定位 | 小说创作 | 角色扮演对话 |
| 记忆系统 | ✅ Entity+StateEvent（更结构化） | ⚠️ 世界书+角色卡（较松散） |
| 大纲系统 | ✅ 完整（卷-章-幕结构） | ❌ 无 |
| 批量生成 | ✅ 支持 | ❌ 不支持 |
| 可视化 | ✅ 关系图/时间线/地图 | ⚠️ 有限 |
| 社区生态 | ⚠️ 初期 | ✅ 成熟（大量角色卡和扩展） |
| 导入兼容 | ✅ 支持SillyTavern格式导入 | N/A |

**AI小说工坊的优势**：专业的小说创作流程、结构化记忆系统
**SillyTavern的优势**：社区生态成熟、用户基数大

### 5.3 橙瓜码字（国内写作工具）

| 维度 | AI小说工坊 | 橙瓜码字 |
|------|-----------|----------|
| AI能力 | ✅ 强（多模型支持） | ❌ 无AI |
| 大纲管理 | ✅ 结构化+AI辅助 | ✅ 手动大纲 |
| 云端同步 | ❌ 本地优先 | ✅ 多端同步 |
| 写作统计 | ✅ Token用量+质量报告 | ✅ 字数统计+写作日历 |
| 发布对接 | ❌ 无 | ✅ 主流平台对接 |
| 离线使用 | ✅ 完全支持 | ⚠️ 部分功能 |

---

## 六、用户体验深度分析

### 6.1 冷启动体验问题

**当前流程**：
1. 打开项目列表页 → 看到空状态提示"开始你的第一部作品"
2. 点击"新建项目" → 填写表单（名称、类型、目标字数、模板）
3. 进入项目编辑器 → 看到写作仪表盘
4. **必须先去"配置"页添加AI提供商和API Key**
5. 然后才能使用任何AI功能

**问题**：第4步是关键断点——用户可能不知道需要配置API Key，或者没有API Key。系统没有任何引导流程或免费体验入口。

**对比**：Sudowrite注册后即可使用内置AI额度，不需要用户配置API Key。

### 6.2 信息架构分析

项目编辑器（`ProjectEditor.vue`）的左侧导航包含9个一级入口：
1. 写作仪表盘（dashboard）
2. 设定沙盘（sandbox）
3. 章节（chapters）
4. 摘要管理（summary）
5. 质量报告（quality）
6. Token用量（token-usage）
7. Agent控制台（agents）
8. 开发者面板（__dev_panel__，仅开发环境）
9. 配置（config）

加上插件动态注入的菜单项，用户可能面对10+个导航入口。

**问题**：
- 对新手来说入口过多，不知道从哪里开始
- "设定沙盘"内部还有4个子Tab（文档视图/命运织布机/关系图/势力图），嵌套层级深
- Agent控制台目前为只读展示（`AgentConsole`），缺少运行操控入口，用户无法直接触发Agent运行

### 6.3 移动端适配

- `ProjectList.vue` 第833-854行有`@media (max-width: 768px)`响应式适配
- `ProjectEditor.vue` 第763-776行有`@media (max-width: 900px)`适配（折叠侧边栏、隐藏右侧面板）
- `SandboxLayout.vue` **没有任何响应式适配**，三栏固定布局在移动端无法使用

---

## 七、总结

### 综合评分（含依据）

| 维度 | 评分 | 依据 |
|------|------|------|
| 产品定位清晰度 | 4/10 | README定位原创生成、DESIGN.md定位同人创作，方向未明确 |
| 功能完整性 | 8/10 | 20+核心功能模块全部实现，Entity+StateEvent架构完整 |
| 功能完成度 | 6/10 | SandboxLayout侧边栏标记WIP、AgentConsole仅只读、模板仅localStorage |
| 用户体验 | 5/10 | 冷启动需自带API Key、9+导航入口过载、部分组件未适配暗色主题 |
| 数据架构 | 7/10 | Entity+StateEvent事件溯源设计领先，但Web端localStorage限制明显 |
| AI集成 | 8/10 | 四层模型路由、Mock模式、预算管理、多提供商支持，设计成熟 |
| 代码质量 | 7/10 | TypeScript类型完善、日志系统健全、防抖/锁机制到位，但V1废弃代码残留 |
| 可持续性 | 4/10 | 无商业模式、无用户社区、两套定位并存导致发展方向不明 |

### 核心结论

AI小说工坊是一款**技术架构设计优秀但产品化不足**的项目。其Entity & StateEvent事件溯源架构、四层AI模型路由、沙漏上下文管线在同类产品中处于领先地位。但产品层面存在定位分裂、冷启动门槛高、信息架构过载、UI一致性不统一（部分组件未接入Design System）等问题。

**最关键的三个问题**：
1. **定位未明确**（README vs DESIGN.md的方向冲突）
2. **冷启动无引导**（API Key门槛+无新手教程+9+导航入口）
3. **Web端存储瓶颈**（Sandbox使用localStorage，容量限制将制约项目规模）

### 建议优先行动（按紧急程度排序）

1. **明确产品方向**：在README和DESIGN.md之间做出最终选择，统一团队认知
2. **设计冷启动体验**：提供内置免费模型额度或体验模式，添加新手引导流程
3. **修复Web端存储**：将Sandbox的Web存储从localStorage迁移到IndexedDB
4. **统一UI风格**：将SandboxLayout等未接入Design System的组件统一改造
5. **精简信息架构**：合并或隐藏低优先级导航入口（如Token用量、Agent控制台可收起到二级菜单）
6. **清理技术债务**：移除V1废弃类型、修复路由模式、添加inspect.js引用
7. **补充新手引导**：内置示例项目、添加操作引导、优化空状态提示

---

*报告完毕。审阅范围覆盖了src/views/、src/stores/、src/components/、src/services/、src/utils/、src/plugins/、src/types/、src-tauri/、docs/等目录下的60+个文件。*
