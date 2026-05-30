# AI小说工坊 - 统一优化计划

> 制定日期：2026-05-28
> 制定人：项目负责人（统筹）
> 参与人：产品经理、UI设计师、开发工程师、测试工程师
> 基础报告：四份独立审视报告 + 四份维度优化方案

---

## 一、计划总览

本计划整合四位团队成员独立制定的优化方案，消除冲突、统一优先级、协调实施顺序，确保各维度协同推进。

### 各维度方案汇总

| 维度 | 方案文件 | 优化项数 | P0 | P1 | P2 | P3 |
|------|---------|---------|-----|-----|-----|-----|
| 产品 | product-optimization-plan.md | 19 | 4 | 6 | 5 | 4 |
| 设计 | ui-optimization-plan.md | 12 | 2 | 3 | 3 | 4 |
| 技术 | tech-optimization-plan.md | 25 | 7 | 8 | 8 | 5 |
| 质量 | quality-optimization-plan.md | 17 | 3 | 4 | 6 | 4 |
| **合计（去重前）** | | **73** | **16** | **21** | **22** | **17** |

---

## 二、跨维度冲突与去重

### 2.1 多人共识项（各维度独立发现的同一问题）

| 问题 | 产品 | 设计 | 技术 | 质量 | 统一优先级 |
|------|------|------|------|------|-----------|
| SandboxLayout硬编码样式 | P0-4 | P0-1 | 提及 | — | **P0** |
| 测试覆盖不足 | — | — | P2 | P3-4 | **P2** |
| localStorage sandbox容量限制 | P2-1 | — | — | P1-2 | **P1** |
| 亮色主题Token不完整 | — | P1-1 | — | — | **P1** |
| 错误处理不一致 | — | — | P1-5 | P2-1 | **P1** |
| Element Plus全量导入 | — | — | P1-1 | — | **P1** |

### 2.2 冲突项协调

| 冲突点 | 产品经理 | UI设计师 | 开发工程师 | 测试工程师 | 统一决定 |
|--------|---------|---------|-----------|-----------|---------|
| 响应式布局 | 未提及 | P2-2（仅3个组件） | 未提及 | P3-3（5个核心组件） | 按测试工程师方案扩展 |
| localStorage迁移优先级 | P2 | 未提及 | 未提及 | P1 | 按P1执行（数据安全优先） |
| 硬编码颜色消除 | P1（OnboardingDialog） | P2-1（13个文件45处） | 未提及 | 未提及 | 合并为P2，按UI设计师方案统一执行 |

---

## 三、统一优化项清单（按执行顺序）

### 批次一：P0 紧急修复（预期1-2天）

| 编号 | 优化项 | 负责人 | 来源维度 | 涉及文件 |
|------|--------|--------|---------|---------|
| 1 | **XSS漏洞修复** — reportExporter.ts generateReportHTML未转义HTML | 开发 | 质量P0-1 | src/utils/reportExporter.ts, src/utils/pdfExporter.ts |
| 2 | **saveChapter/saveProject数据竞态** — 章节正文可能丢失 | 开发 | 质量P0-2 | src/stores/project.ts:396-400, src/stores/storage.ts:170-200 |
| 3 | **IndexedDB升级删库** — 版本不匹配直接删除用户数据 | 开发 | 质量P0-3 | src/stores/storage.ts:64-97 |
| 4 | **Token估算公式统一** — 4处实现方向相反 | 开发 | 技术P0-1 | src/utils/llm/tokenizer.ts, src/utils/context/pipeline.ts:66-69, src/utils/summarizer.ts:113 |
| 5 | **LLM双重重试消除** — 最坏9次API调用 | 开发 | 技术P0-2 | src/utils/llm/llmCaller.ts:245-250 |
| 6 | **LLM默认超时修正** — 30分钟改为3分钟 | 开发 | 技术P0-3 | src/utils/llm/llmCaller.ts:169 |
| 7 | **加密模块安全加固** — 改用PBKDF2派生密钥 | 开发 | 技术P0-4 | src/utils/crypto.ts:56-66 |
| 8 | **ReDoS防护** — regex-script.ts恶意正则检测 | 开发 | 技术P0-5 | src/services/regex-script.ts:374-386 |
| 9 | **GenerationScheduler并发安全** — 单例状态覆盖 | 开发 | 技术P0-7 | src/services/generation-scheduler.ts:81-82 |
| 10 | **SandboxLayout设计系统接入** — 硬编码#fff改为Token | UI | 设计P0-1 + 产品P0-4 | src/components/Sandbox/SandboxLayout.vue:82-84 |
| 11 | **GlassContextPanel暗色适配** — 硬编码rgba改为Token | UI | 设计P0-2 | src/components/GlassContextPanel.vue:147-158 |
| 12 | **统一产品定位** — DESIGN.md状态声明 + README定位 | 产品 | 产品P0-1 | DESIGN.md, README.md |
| 13 | **路由模式修复** — createWebHistory改为createWebHashHistory | 开发 | 产品P0-2 | src/router/index.ts:1,4 |
| 14 | **补充inspect.js引用** | 开发 | 产品P0-3 | index.html |

### 批次二：P1 高优先级（预期3-5天）

| 编号 | 优化项 | 负责人 | 来源维度 | 涉及文件 |
|------|--------|--------|---------|---------|
| 15 | **AI fetch超时控制** — 所有fetch添加AbortSignal超时 | 开发 | 质量P1-1 | src/services/ai-service.ts (6处), src/utils/sse-stream.ts |
| 16 | **localStorage sandbox容量保护** — 预检查+错误捕获 | 开发 | 质量P1-2 + 产品P2-1 | src/stores/sandbox.ts:129-135 |
| 17 | **crypto.randomUUID降级** — 10处调用统一降级方案 | 开发 | 质量P1-3 | 新建utils/generateId.ts, 10个文件替换 |
| 18 | **public目录清理** — 删除调试文件+11.2MB sync-payload.json | 开发 | 质量P1-4 | public/目录 |
| 19 | **CSP安全策略** — index.html添加Content-Security-Policy | 开发 | 技术P0-6 | index.html |
| 20 | **Element Plus按需导入** — 包体积减少约500KB+ | 开发 | 技术P1-1 | src/main.ts:3-4 |
| 21 | **亮色主题Token补全** — accent/success/warning/danger/info | UI | 设计P1-1 | src/assets/styles/design-system.css |
| 22 | **Z-index层级统一管理** — 新增8个Z-index Token | UI | 设计P1-2 | design-system.css + 8个组件文件 |
| 23 | **断点Token统一** — 新增5个断点常量 | UI | 设计P1-3 | design-system.css + 6个组件文件 |
| 24 | **优化冷启动体验** — AI配置引导+未配置提示横幅 | 产品 | 产品P1-1 | OnboardingDialog.vue, ProviderManager.vue, WritingDashboard.vue, ai.ts |
| 25 | **精简信息架构** — 9个导航收为4主+折叠工具组 | 产品 | 产品P1-2 | ProjectEditor.vue:40-148 |
| 26 | **完善空状态CTA** — 15+处el-empty增加操作引导 | 产品 | 产品P1-3 | WritingDashboard, PlotLoomBoard, SandboxDocument, QualityReport |
| 27 | **OnboardingDialog暗色适配** | 产品 | 产品P1-4 | OnboardingDialog.vue:115-150 |
| 28 | **错误处理统一** — throw/warn/null混用问题 | 开发 | 技术P1-5 | 5个文件 |
| 29 | **内存泄漏修复** — 6个文件的无限增长/缺防抖/运算符bug | 开发 | 技术P1-6 | CostTracker, suggestions, taskManager等 |
| 30 | **性能关键优化** — qualityAnalyzer/summarizer/useGlobalSearch | 开发 | 技术P1-7 | 4个文件 |
| 31 | **懒加载优化** — SandboxLayout子组件+ECharts顶层导入 | 开发 | 技术P1-8 | SandboxLayout.vue, AIAssistant.vue |

### 批次三：P2 中优先级（预期5-7天）

| 编号 | 优化项 | 负责人 | 来源维度 | 涉及文件 |
|------|--------|--------|---------|---------|
| 32 | **硬编码颜色全面消除** — 13个文件45处替换为Token | UI | 设计P2-1 | 详见ui-optimization-plan.md |
| 33 | **响应式布局补充** — SandboxLayout/ProjectConfig/GlassContextPanel | UI+测试 | 设计P2-2 + 质量P3-3 | 3+2个核心组件 |
| 34 | **工具函数抽取** — formatters.ts统一formatNumber等 | UI | 设计P2-3 | 新建+11个组件修改 |
| 35 | **代码重复消除** — SSE解析3处/prepareEntry 2处等6个重复项 | 开发 | 技术P2-1 | 6个文件 |
| 36 | **路由完善** — hash模式+404路由+页面标题 | 开发 | 技术P2-3 | src/router/index.ts |
| 37 | **空catch块修复** — 11处空catch添加日志 | 开发+测试 | 质量P2-1 | vector-service/novel-extractor/tokenUsage等 |
| 38 | **后端API Key加密存储** | 开发 | 质量P2-2 | 新建backend/app/services/crypto.py |
| 39 | **suggestions store内存泄漏** — interval永不清理 | 开发 | 质量P2-3 | src/stores/suggestions.ts + AIAssistant.vue |
| 40 | **worldbook-sandbox V5桥接非原子** — 增加暂存+回滚 | 开发 | 质量P2-4 | src/stores/worldbook.ts:278-299 |
| 41 | **v-html安全加固** — FORBID_TAGS白名单+CSS注入过滤 | 开发 | 质量P2-5 | assistantChat.ts, theme.ts |
| 42 | **novelImporter大文件处理** — 4MB分块读取+100MB限制 | 开发 | 质量P2-6 | src/utils/novelImporter.ts |
| 43 | **完成实体树组件** — 替换SandboxLayout WIP占位 | 产品 | 产品P1-5 | 新建EntityTree.vue |
| 44 | **增强AgentConsole** — 从只读升级为可交互 | 产品 | 产品P1-6 | AgentConsole.vue |
| 45 | **V1废弃类型清理** — 移入deprecated.ts | 产品 | 产品P2-2 | src/types/index.ts, 新建deprecated.ts |
| 46 | **优化新建项目默认值** — 100万→20万 | 产品 | 产品P2-3 | ProjectList.vue:140,284 |
| 47 | **SandboxLayout默认Tab** — timeline→doc | 产品 | 产品P2-4 | SandboxLayout.vue:41 |
| 48 | **AgentConsole样式适配** | 产品 | 产品P2-5 | AgentConsole.vue |
| 49 | **UID生成策略统一** — Date.now碰撞问题 | 开发 | 技术P2-6 | knowledge-base.ts:567 |
| 50 | **TypeScript严格度提升** | 开发 | 技术P2-7 | tsconfig.json |

### 批次四：P3 低优先级（预期7-10天）

| 编号 | 优化项 | 负责人 | 来源维度 |
|------|--------|--------|---------|
| 51 | 章节操作按钮优化 — 6+按钮→2主+下拉 | UI | 设计P3-1 |
| 52 | ECharts图表主题适配 | UI | 设计P3-2 |
| 53 | 空状态图标优化 — emoji→Element Plus图标 | UI | 设计P3-3 |
| 54 | AI呼吸动画优化 — infinite→3次停止 | UI | 设计P3-4 |
| 55 | 内置示例项目模板 | 产品 | 产品P3-1 |
| 56 | 子模块上下文引导(el-tour) | 产品 | 产品P3-2 |
| 57 | 模板/配置存储统一到IndexedDB | 产品 | 产品P3-3 |
| 58 | "重新生成"按钮二次确认 | 产品 | 产品P3-4 |
| 59 | browserslist配置 | 测试 | 质量P3-1 |
| 60 | Autoprefixer配置 | 测试 | 质量P3-2 |
| 61 | 测试覆盖率提升 — 10个新测试文件约200用例 | 测试 | 质量P3-4 |
| 62 | 组件拆分 — ai-service.ts/generation-scheduler.ts | 开发 | 技术P3 |
| 63 | 过时依赖升级 — @xenova/transformers, xlsx | 开发 | 技术P3 |
| 64 | shallowRef优化 | 开发 | 技术P2-2 |
| 65 | escapeBraces默认值修正 | 开发 | 技术P2-8 |

---

## 四、执行计划

### 4.1 批次依赖关系

```
批次一（P0紧急）→ 批次二（P1高优）→ 批次三（P2中优）→ 批次四（P3优化）
     ↓                  ↓                  ↓                  ↓
  安全/数据          体验/性能           质量/一致性         打磨/债务
```

**批次内依赖**：
- #10（SandboxLayout设计系统）是 #43（实体树组件）的前置
- #16（sandbox容量保护）是 #57（存储统一IndexedDB）的前置
- #20（Element Plus按需导入）应与 #31（懒加载优化）同批次执行
- #25（精简信息架构）应与 #26（空状态CTA）同批次执行

### 4.2 工作量估算

| 批次 | 优化项数 | 预估工时 | 执行顺序 |
|------|---------|---------|---------|
| 批次一 | 14项 | 2-3天 | 开发先行（9项）→ UI跟进（2项）→ 产品跟进（3项） |
| 批次二 | 17项 | 3-5天 | 开发（10项）+ UI（3项）+ 产品（4项）并行 |
| 批次三 | 19项 | 5-7天 | 开发主导（12项）+ UI辅助（3项）+ 产品辅助（4项） |
| 批次四 | 15项 | 7-10天 | 全员各自推进 |
| **合计** | **65项** | **17-25天** | |

### 4.3 验收标准

每个批次完成后须通过以下检查：

1. **功能回归**：所有现有功能正常运行，不引入新bug
2. **主题一致性**：暗色/亮色主题下视觉正确，无白色色块
3. **安全基线**：CSP策略生效、XSS漏洞已封堵、API Key加密存储
4. **数据安全**：竞态已消除、IndexedDB升级不再删库、localStorage容量有保护
5. **构建验证**：`npm run build` 成功，产物体积合理
6. **规范合规**：路由使用hash模式、index.html包含inspect.js、base为"/"

---

## 五、各维度方案原文链接

| 维度 | 方案路径 |
|------|---------|
| 产品优化方案 | `/data/share/project/docs/product-optimization-plan.md` |
| UI设计优化方案 | `/data/share/project/docs/ui-optimization-plan.md` |
| 技术优化方案 | `/data/share/project/docs/tech-optimization-plan.md` |
| 质量优化方案 | `/data/share/project/docs/quality-optimization-plan.md` |
| 审视报告（产品） | `/data/share/project/docs/ai-novel-workshop-deep-review.md` |
| 审视报告（设计） | `/data/share/project/docs/ui-design-review-report.md` |
| 审视报告（技术） | `/data/share/project/ai-novel-workshop/reports/技术审视报告-2026-05-28.md` |
| 审视报告（质量） | `/data/share/project/tests/质量审视报告-2026-05-28.md` |

---

*统一优化计划完毕。共整合四位团队成员的73项优化建议，去重后为65项，分4个批次按优先级执行。*
