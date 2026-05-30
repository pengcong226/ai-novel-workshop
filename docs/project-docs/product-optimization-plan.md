# AI小说工坊 - 产品维度优化方案

> 制定日期：2026-05-27
> 制定人：产品经理
> 基于报告：`ai-novel-workshop-deep-review.md`
> 项目版本：v5.0.0

---

## 优化总览

| 优先级 | 数量 | 说明 |
|--------|------|------|
| P0 | 4项 | 必须修复——影响产品可用性或规范合规性 |
| P1 | 6项 | 高优先——直接影响核心用户体验 |
| P2 | 5项 | 中优先——提升产品完整度和一致性 |
| P3 | 4项 | 低优先——锦上添花，长期迭代 |

---

## P0：必须修复

### P0-1：统一产品定位——清除DESIGN.md中的矛盾方向

**优化目标**：消除README.md与DESIGN.md之间的定位分裂，统一团队对产品方向的认知。

**现状问题**：
- `README.md` 第3-5行定义为"AI长篇小说智能生成工具"，项目已实现v5.0全部功能
- `DESIGN.md` 第6-11行定义为"互动式同人小说生成器"，第35行明确写"推倒重来，不再维护原项目"
- 两个方向的目标用户、核心体验、技术架构完全不同，共存会导致开发优先级混乱

**具体改什么**：
1. 在`DESIGN.md`文件顶部增加醒目的状态声明，明确该文档为"探索性设计文档，暂不实施"，避免与当前产品方向混淆
2. 在`README.md`第1节"项目简介"中增加一句话产品定位：**"面向中文创作者的AI长篇小说智能生成桌面工具，通过Entity & StateEvent状态记忆系统解决百万字长篇创作的'吃书'问题"**
3. 在`README.md`中增加"产品路线"章节，将同人创作方向列为远期探索方向

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/DESIGN.md`
  - 第1行前插入状态声明块
- 文件：`/data/share/project/ai-novel-workshop/README.md`
  - 第3-5行修订产品简介
  - 在"许可证"（第598行）前增加"产品路线"章节

**改后预期效果**：团队成员和外部贡献者对产品方向有统一认知，开发资源聚焦在长篇创作工具的核心体验上。

---

### P0-2：修复路由模式——从createWebHistory改为createWebHashHistory

**优化目标**：符合项目部署规范，确保前端资源可直接通过静态服务器访问。

**现状问题**：
- `src/router/index.ts` 第1行使用`createWebHistory()`，第4行使用`history: createWebHistory()`
- 项目规范要求使用hashRouter生成路由
- history模式需要服务端配合重写规则，直接访问静态资源会导致404

**具体改什么**：
将路由模式从history改为hash。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/router/index.ts`
  - 第1行：`import { createRouter, createWebHistory } from 'vue-router'` → `import { createRouter, createWebHashHistory } from 'vue-router'`
  - 第4行：`history: createWebHistory()` → `history: createWebHashHistory()`

**改后预期效果**：前端打包后可直接通过文件协议或简单HTTP服务器访问，URL格式变为`/#/projects`形式，无需服务端重写配置。

---

### P0-3：补充index.html中的inspect.js引用

**优化目标**：符合项目规范要求，确保系统内置功能插件正常加载。

**现状问题**：
- `index.html`（第1-13行）中没有任何`<script>`引用inspect.js
- 项目规范要求必须包含：`<script src="https://tokenpony.cn/team-coding-web/inspect.js?t={{timestamp}}"></script>`
- 此为系统内置功能插件，即使用户要求也不允许删除

**具体改什么**：在`index.html`的`<body>`结束标签前添加inspect.js脚本引用。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/index.html`
  - 在第10行（`<div id="app"></div>`）之后、第11行（`<script type="module" src="/src/main.ts">`）之前插入：
  ```html
  <script src="https://tokenpony.cn/team-coding-web/inspect.js?t=1748300000"></script>
  ```
  （timestamp替换为实际构建时间戳）

**改后预期效果**：功能插件正常加载，满足规范要求。

---

### P0-4：修复SandboxLayout暗色主题兼容性

**优化目标**：消除暗色模式下的白色色块，统一视觉风格。

**现状问题**：
- `src/components/Sandbox/SandboxLayout.vue` 第82-84行使用硬编码颜色值：
  ```css
  .sidebar { width: 250px; background: #fff; ... border: 1px solid #e4e7ed; }
  .main-view { ... background: #fff; ... border: 1px solid #e4e7ed; }
  .right-sidebar { width: 300px; background: #fff; ... border: 1px solid #e4e7ed; }
  ```
- 项目已建立完整的Design System（`src/assets/styles/design-system.css`），包含`--ds-surface`、`--ds-surface-border`等CSS变量
- 默认使用暗色主题（`index.html`第2行`class="dark"`），SandboxLayout的白色块严重破坏视觉一致性

**具体改什么**：将SandboxLayout的硬编码颜色替换为Design System变量。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/SandboxLayout.vue`
  - 第82行：`background: #fff` → `background: var(--ds-surface)`
  - 第82行：`border: 1px solid #e4e7ed` → `border: 1px solid var(--ds-surface-border)`
  - 第83行：`background: #fff` → `background: var(--ds-surface)`
  - 第83行：`border: 1px solid #e4e7ed` → `border: 1px solid var(--ds-surface-border)`
  - 第84行：`background: #fff` → `background: var(--ds-surface)`
  - 第84行：`border: 1px solid #e4e7ed` → `border: 1px solid var(--ds-surface-border)`

**改后预期效果**：SandboxLayout在暗色/亮色主题下均显示正确的配色，与其他页面视觉一致。

---

## P1：高优先优化

### P1-1：优化冷启动体验——降低AI配置门槛

**优化目标**：新用户从打开应用到看到第一个AI生成内容的时间从"不确定"缩短到"10分钟以内"。

**现状问题**：
- 用户必须自行配置AI提供商的API Key才能使用任何AI功能
- `src/stores/ai.ts` 第168-173行：providers为空时直接return，错误信息不主动通知用户
- `src/components/config/ProviderManager.vue` 第16行：空状态仅显示"还没有配置模型提供商"，无引导
- `OnboardingDialog.vue` 第29-33行：引导步骤中"先配置AI"选项没有说明用户需要准备什么

**具体改什么**：
1. 在OnboardingDialog的"起步方式"步骤中，为"先配置AI"选项增加说明文字："需要准备一个AI服务的API Key（如OpenAI、Anthropic或国内大模型）"
2. 在ProviderManager的空状态中增加操作引导按钮和帮助链接
3. 在WritingDashboard中，当检测到AI未配置时，显示醒目的引导横幅
4. 在ProjectConfig的小白模式中，增加"一键配置"引导流程

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/OnboardingDialog.vue`
  - 第33行后增加说明段落
- 文件：`/data/share/project/ai-novel-workshop/src/components/config/ProviderManager.vue`
  - 第16行el-empty增加按钮：`<el-button type="primary" @click="$emit('add')">添加第一个模型</el-button>`
- 文件：`/data/share/project/ai-novel-workshop/src/components/WritingDashboard.vue`
  - 在第13行dashboard-hero下方增加AI未配置的条件横幅
- 文件：`/data/share/project/ai-novel-workshop/src/stores/ai.ts`
  - 第168-173行：在return前通过ElNotification主动通知用户

**改后预期效果**：新用户明确知道需要什么（API Key），在哪里配置，配置后能立即看到效果。

---

### P1-2：精简信息架构——收起低频导航入口

**优化目标**：将项目编辑器的一级导航入口从9个减少到5-6个，降低新手认知负荷。

**现状问题**：
- `src/views/ProjectEditor.vue` 第40-148行定义了9个一级导航入口：
  1. 写作仪表盘（dashboard）
  2. 设定沙盘（sandbox）
  3. 章节（chapters）
  4. 摘要管理（summary）
  5. 质量报告（quality）
  6. Token用量（token-usage）
  7. Agent控制台（agents）
  8. 开发者面板（__dev_panel__）
  9. 配置（config）
- 新用户面对9个入口不知道从哪里开始

**具体改什么**：
将导航分为"主功能"和"工具"两级：
- **主功能**（始终显示）：写作仪表盘、设定沙盘、章节、配置
- **工具折叠组**（点击展开）：摘要管理、质量报告、Token用量、Agent控制台

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/views/ProjectEditor.vue`
  - 第40-148行`<nav class="sidebar-nav">`区域重构：
  - 将"摘要管理"（第74-79行）、"质量报告"（第83-89行）、"Token用量"（第93-99行）、"Agent控制台"（第103-109行）移入一个可折叠的"工具"分组
  - 使用el-collapse或自定义展开/收起按钮实现
  - 工具组默认收起

**改后预期效果**：新用户看到4个清晰的主功能入口，进阶用户可展开工具组访问完整功能。

---

### P1-3：完善空状态引导——增加CTA按钮

**优化目标**：所有空状态都具备明确的下一步操作引导，而非仅显示静态文字。

**现状问题**：
- 项目中15+处使用el-empty，但多数缺少操作按钮（CTA）
- `WritingDashboard.vue` 第116行："暂无章节，先创建第一章吧"——无创建按钮
- `Chapters.vue` 第49行："还没有章节"——虽有创建按钮，但其他空状态没有
- `PlotLoomBoard.vue` 第23行："暂无项目大纲"——无操作引导
- `SandboxDocument.vue` 第3行："请从左侧实体库选择一个条目"——无操作引导

**具体改什么**：为以下关键空状态增加CTA按钮：
1. WritingDashboard"暂无章节"→ 增加"创建第一章"按钮
2. PlotLoomBoard"暂无大纲"→ 增加"AI生成大纲"按钮
3. SandboxDocument"请从左侧选择"→ 增加"创建新实体"按钮
4. QualityReport"还没有质量报告"→ 增加"运行质量检查"按钮

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/WritingDashboard.vue`
  - 第116行：el-empty增加slot `<template #extra><el-button type="primary" @click="emit('create-chapter')">创建第一章</el-button></template>`
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/PlotLoomBoard.vue`
  - 第23行el-empty增加"AI生成大纲"按钮
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/SandboxDocument.vue`
  - 第3行el-empty增加"创建新实体"按钮
- 文件：`/data/share/project/ai-novel-workshop/src/components/QualityReport.vue`
  - 第20行el-empty增加"运行质量检查"按钮

**改后预期效果**：用户在任何空状态下都能立即知道下一步该做什么，并通过一个点击开始。

---

### P1-4：OnboardingDialog适配暗色主题

**优化目标**：新手引导弹窗在暗色主题下显示正确的配色。

**现状问题**：
- `OnboardingDialog.vue` 第115-150行使用硬编码颜色：
  ```css
  .step-body h2 { color: #303133; }     /* 硬编码深灰色 */
  .step-body p, .hint { color: #606266; } /* 硬编码中灰色 */
  .feature-card { border: 1px solid #ebeef5; background: #f8fafc; } /* 硬编码浅色背景 */
  .feature-card strong { color: #409eff; } /* Element Plus蓝色 */
  ```
- 暗色主题下这些颜色会导致文字不可读或卡片突兀

**具体改什么**：将所有硬编码颜色替换为Design System变量。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/OnboardingDialog.vue`
  - 第115行：`color: #303133` → `color: var(--ds-text-primary)`
  - 第120行：`color: #606266` → `color: var(--ds-text-secondary)`
  - 第138行：`border: 1px solid #ebeef5` → `border: 1px solid var(--ds-surface-border)`
  - 第139行：`background: #f8fafc` → `background: var(--ds-bg-hover)`
  - 第143行：`color: #409eff` → `color: var(--ds-accent-text)`
  - 第147行：`color: #606266` → `color: var(--ds-text-secondary)`

**改后预期效果**：新手引导弹窗在暗色/亮色主题下均显示正确配色。

---

### P1-5：完成SandboxLayout实体树组件

**优化目标**：消除项目中最显眼的WIP标记，完成左侧实体树的基础功能。

**现状问题**：
- `SandboxLayout.vue` 第3行：`<div class="sidebar">Entities Tree (WIP)</div>`——实体树完全未实现
- 该sidebar占250px宽度，是用户进入沙盘后第一眼看到的区域
- 实体数据已在sandbox store中完整管理（`stores/sandbox.ts`的characterEntities/loreEntities/locationEntities等计算属性）

**具体改什么**：
实现基础的实体树组件，按实体类型分组展示，支持选择实体跳转到文档视图。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/SandboxLayout.vue`
  - 第3行：将`Entities Tree (WIP)`替换为新的`EntityTree`组件引用
- 新建文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/EntityTree.vue`
  - 使用el-tree或递归组件实现
  - 按实体类型（人物/势力/地点/知识/物品/概念/世界）分组
  - 显示实体名称和重要度标签
  - 点击实体切换到文档视图并选中该实体
  - 复用sandbox store的`activeEntities`、`characterEntities`等计算属性

**改后预期效果**：沙盘左侧面板展示完整的实体树，用户可快速定位和选择实体。

---

### P1-6：增强AgentConsole为可交互控制台

**优化目标**：Agent控制台从纯展示变为可操控的交互面板。

**现状问题**：
- `AgentConsole.vue` 第1-61行：仅以卡片展示6个Agent的配置信息（角色、阶段、优先级、启用状态）
- 缺少：启停控制、手动触发运行、运行状态反馈、日志输出
- 名为"控制台"实际只是"状态面板"

**具体改什么**：
1. 为每个Agent卡片增加"运行"按钮（仅在对应阶段可用时激活）
2. 增加运行状态指示（空闲/运行中/完成/失败）
3. 增加最近一次运行结果摘要
4. 增加启用/禁用开关

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/AgentConsole.vue`
  - 第17-29行agent-card区域重构：
  - 增加el-switch组件控制enabled状态
  - 增加"运行"按钮，绑定对应Agent的触发方法
  - 增加运行状态tag（success/running/danger）
  - 增加最近运行结果展示区域
- 需要配合在`src/stores/`或`src/services/`中增加Agent运行调度逻辑

**改后预期效果**：用户可从Agent控制台直接触发各Agent运行，查看运行状态和结果。

---

## P2：中优先优化

### P2-1：Web端Sandbox存储从localStorage迁移到IndexedDB

**优化目标**：消除Web模式下Sandbox数据的5-10MB容量限制，支持大型项目。

**现状问题**：
- `stores/sandbox.ts` 第115-135行：Web模式使用localStorage存储entities和stateEvents
- localStorage容量限制约5-10MB，100万字小说的实体和状态事件数据可能超出限制
- `stores/storage.ts` 第854行TODO注释：`TODO: support IndexedDB implementation if needed`

**具体改什么**：
将`loadWebSandboxEntities`/`saveWebSandboxEntities`等函数从localStorage改为IndexedDB。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/stores/sandbox.ts`
  - 第121-135行：将`loadWebSandboxEntities`/`loadWebSandboxStateEvents`/`saveWebSandboxEntities`/`saveWebSandboxStateEvents`四个函数重写为IndexedDB操作
  - 可复用`stores/storage.ts`中已有的IndexedDB基础设施
  - 保持对外接口不变（返回值类型和调用方式不变）
- 文件：`/data/share/project/ai-novel-workshop/src/stores/storage.ts`
  - 第854行TODO：实现IndexedDB后端的sandbox数据存储

**改后预期效果**：Web模式下Sandbox数据容量不受localStorage限制，可支持百万字级别的项目。

---

### P2-2：清理V1废弃类型代码

**优化目标**：消除代码中V1/V5类型并存造成的概念混淆，统一为Entity体系。

**现状问题**：
- `src/types/index.ts`中存在大量`@deprecated`标注的旧类型（Character、WorldView等）
- 新用户和开发者阅读代码时会被两套类型系统困惑
- `project.ts` 第141-170行的V1→V5迁移逻辑虽然实现了自动迁移，但迁移失败时静默处理

**具体改什么**：
1. 将V1废弃类型移入独立的`src/types/deprecated.ts`文件
2. 在`src/types/index.ts`中仅导出V5类型
3. 在V1→V5迁移失败时增加用户提示

**怎么改**：
- 新建文件：`/data/share/project/ai-novel-workshop/src/types/deprecated.ts`
  - 移入所有@deprecated类型定义
- 文件：`/data/share/project/ai-novel-workshop/src/types/index.ts`
  - 移除@deprecated类型，改为从deprecated.ts re-export（保持向后兼容）
- 文件：`/data/share/project/ai-novel-workshop/src/stores/project.ts`
  - 第168行：迁移失败catch块中增加`ElMessage.warning('旧版本数据迁移失败，部分功能可能受影响')`

**改后预期效果**：新开发者阅读代码时不会被两套类型系统困惑，迁移失败有明确提示。

---

### P2-3：优化新建项目默认值和步长

**优化目标**：降低新用户创建项目的认知门槛。

**现状问题**：
- `ProjectList.vue` 第284行：默认目标字数100万（`targetWords: 1000000`）
- `ProjectList.vue` 第140行：步长5万（`:step="50000"`）
- 对于新用户来说，默认100万字的目标太大，5万的步长也不够灵活

**具体改什么**：
1. 默认目标字数改为20万（适合中篇小说起步）
2. 步长改为1万
3. 增加快捷选择按钮（10万/20万/50万/100万）

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/views/ProjectList.vue`
  - 第284行：`targetWords: 1000000` → `targetWords: 200000`
  - 第140行：`:step="50000"` → `:step="10000"`
  - 在第141行（form-tip）之前增加快捷按钮组

**改后预期效果**：新用户创建项目时面对更合理的默认值，减少决策压力。

---

### P2-4：SandboxLayout默认Tab调整

**优化目标**：新用户进入沙盘时看到更直观的默认视图。

**现状问题**：
- `SandboxLayout.vue` 第41行：`const activeTab = ref('timeline')`，默认激活"命运织布机"
- 命运织布机（PlotLoomBoard）是高级功能，包含卷纲/章节细纲/场景/伏笔等复杂概念
- 对新用户来说，"文档视图"（SandboxDocument）更直观易懂

**具体改什么**：将默认Tab从`timeline`改为`doc`。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/SandboxLayout.vue`
  - 第41行：`const activeTab = ref('timeline')` → `const activeTab = ref('doc')`

**改后预期效果**：新用户进入沙盘后首先看到实体文档视图，更容易理解系统的实体管理能力。

---

### P2-5：完善AgentConsole样式以适配Design System

**优化目标**：AgentConsole使用Design System变量，适配暗色主题。

**现状问题**：
- `AgentConsole.vue` 第64-80行样式使用Element Plus的`el-card`组件，但卡片内文字颜色依赖Element Plus默认值
- 未使用`--ds-*`变量体系

**具体改什么**：将AgentConsole的样式迁移到Design System变量。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/AgentConsole.vue`
  - 第69行：`border-radius: var(--ds-radius-lg)`（已使用，保持）
  - 增加卡片背景和文字颜色的Design System变量引用

**改后预期效果**：AgentConsole在暗色主题下显示正确的配色。

---

## P3：低优先优化

### P3-1：内置示例项目模板

**优化目标**：新用户可通过示例项目快速体验完整创作流程。

**现状问题**：
- `src/data/stylePresets.ts`中仅有10种写作风格预设，没有完整的示例项目
- `src/utils/templateManager.ts`管理的内置模板（builtin-fantasy、builtin-urban等）只包含设定和大纲，没有示例章节内容
- 新用户无法在不配置AI的情况下体验系统的核心价值

**具体改什么**：
创建1-2个内置示例项目，包含完整的设定+大纲+3-5章示例内容，用户可在OnboardingDialog或ProjectList中一键加载。

**怎么改**：
- 新建文件：`/data/share/project/ai-novel-workshop/src/data/sampleProjects.ts`
  - 定义一个完整的玄幻题材示例项目（含5个实体、3章内容、基础大纲）
- 文件：`/data/share/project/ai-novel-workshop/src/views/ProjectList.vue`
  - 在空状态区域（第28-35行）增加"体验示例项目"按钮
- 文件：`/data/share/project/ai-novel-workshop/src/components/OnboardingDialog.vue`
  - 第29-33行起步方式中增加"体验示例"选项

**改后预期效果**：新用户无需配置AI即可看到系统的核心功能和创作流程。

---

### P3-2：增加子模块上下文引导提示

**优化目标**：用户在各功能模块中获得上下文相关的操作提示。

**现状问题**：
- `OnboardingDialog.vue`仅在全局层面提供4步引导
- 各子模块（WritingDashboard、SandboxLayout、Chapters等）内没有针对性的引导
- 用户完成Onboarding后进入具体功能时仍然不知道怎么操作

**具体改什么**：
为以下关键页面增加首次进入时的tooltip提示：
1. WritingDashboard：提示"这里是你的创作中心，从快捷操作开始"
2. SandboxLayout：提示"这里管理你的世界观和人物设定"
3. Chapters：提示"点击'新建章节'开始创作，或使用'批量生成'快速出稿"

**怎么改**：
- 使用Element Plus的el-tour组件（如果版本支持）或自定义tooltip组件
- 每个页面在localStorage中记录引导完成状态
- 文件：`/data/share/project/ai-novel-workshop/src/components/WritingDashboard.vue` — 增加tour步骤
- 文件：`/data/share/project/ai-novel-workshop/src/components/Sandbox/SandboxLayout.vue` — 增加tour步骤
- 文件：`/data/share/project/ai-novel-workshop/src/components/Chapters.vue` — 增加tour步骤

**改后预期效果**：用户在每个功能模块首次进入时获得针对性的操作引导。

---

### P3-3：存储层统一——模板和配置数据迁移到IndexedDB

**优化目标**：消除localStorage容量限制对模板和配置数据的影响。

**现状问题**：
- `templateManager.ts`使用localStorage存储用户自定义模板
- `project.ts`第36行：全局配置存储在localStorage的`global-config`键
- localStorage容量约5-10MB，大量模板数据可能接近限制

**具体改什么**：
将模板和全局配置的存储从localStorage迁移到IndexedDB。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/utils/templateManager.ts`
  - 将模板读写操作从localStorage改为IndexedDB
- 文件：`/data/share/project/ai-novel-workshop/src/stores/project.ts`
  - 第36-57行：`loadGlobalConfig`/`saveGlobalConfig`从localStorage改为IndexedDB

**改后预期效果**：模板和配置数据不受localStorage容量限制。

---

### P3-4：增加"重新生成"二次确认

**优化目标**：防止用户误触"重新生成"导致章节内容丢失。

**现状问题**：
- `Chapters.vue` 第128-129行："重新生成"按钮直接触发，没有二次确认
- 章节内容可能包含用户手动编辑的珍贵内容

**具体改什么**：在重新生成前增加ElMessageBox.confirm确认弹窗。

**怎么改**：
- 文件：`/data/share/project/ai-novel-workshop/src/components/Chapters.vue`
  - 找到`regenerateChapter`函数，在执行前增加确认逻辑：
  ```typescript
  ElMessageBox.confirm('重新生成将覆盖当前章节内容，建议先创建检查点备份。是否继续？', '确认重新生成', {
    confirmButtonText: '确认生成',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => { /* 执行重新生成 */ })
  ```

**改后预期效果**：用户误触时有明确的确认提示，避免意外内容丢失。

---

## 优化实施建议

### 实施顺序建议

1. **第一批（P0）**：P0-1到P0-4，可在1天内完成，均为小改动
2. **第二批（P1前3项）**：P1-1到P1-3，预计2-3天，重点改善新手体验
3. **第三批（P1后3项）**：P1-4到P1-6，预计3-5天，涉及新组件开发
4. **第四批（P2）**：P2-1到P2-5，预计3-5天，涉及存储层改造和代码清理
5. **第五批（P3）**：P3-1到P3-4，预计5-7天，涉及示例数据和引导系统

### 关键依赖

- P0-4（SandboxLayout暗色适配）是P1-5（实体树组件）的前置条件
- P2-1（IndexedDB迁移）是P3-3（存储层统一）的前置条件
- P1-6（AgentConsole交互化）需要Agent运行调度逻辑的支持

### 验收标准

每项优化完成后，需要验证：
1. 暗色/亮色主题下视觉正确
2. 不影响现有功能（回归测试）
3. 代码符合Design System规范（使用`--ds-*`变量）
4. 空状态有CTA引导

---

*方案完毕。共4级19项优化，覆盖定位统一、规范合规、冷启动体验、信息架构、功能完成度、主题一致性等维度。*
