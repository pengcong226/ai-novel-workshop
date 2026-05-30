---
name: ai-novel-workshop
description: AI小说工坊 — 全自动中文网络小说写作工厂，支持10-Agent Pipeline、33维审稿门控、一键续写、题材Profile（10种中文题材）、AIGC检测、文风分析克隆、平台格式导出、自然语言操作。基于Vue 3 + TypeScript的Web应用。
version: 1.0.0
metadata: { "openclaw": { "emoji": "✍️", "requires": { "bins": ["node", "npm"], "env": [] }, "homepage": "", "install": [{ "id": "npm", "kind": "node", "package": "ai-novel-workshop", "label": "Install AI Novel Workshop" }] } }
---

# AI小说工坊 — 全自动写作工厂

AI小说工坊是一个基于10-Agent Pipeline的全自动中文网络小说写作系统。

## 核心能力

### 10-Agent自动流水线
- Planner → Composer → Writer → Normalizer → Auditor → Reviser → Settler → Analyzer → HookPromoter
- 审计-修订循环（最多3轮，快照回滚）
- 33维质量审计（OOC/时间线/设定/战力/伏笔/节奏/文风/格式...）

### 一键续写N章
- 批量续写调度器，支持暂停/恢复/取消
- 断点审查（每N章暂停确认）
- Token预算控制和每日上限

### 题材Profile（10种中文题材）
玄幻修仙、仙侠、都市现实、历史军事、悬疑推理、科幻未来、武侠江湖、言情、游戏竞技、轻小说

### 自然语言操作
22种Intent（写下一章/改写/审计/创建角色/续写/帮助...），正则+LLM路由

### 文风分析与克隆
深度文风指纹（句式/词汇/修辞/节奏/AI特征），3种分析深度

### AIGC检测
GPTZero/Originality.ai/本地启发式 三种模式

### 平台格式导出
起点中文网/番茄小说/刺猬猫/晋江文学城/通用格式

## When to Use

- **中文网文创作**：自动流水线写长篇网络小说
- **批量章节生成**：一键续写N章，保持质量一致
- **质量审计**：33维度自动审计+修订
- **文风克隆**：从参考文本提取并应用写作风格
- **AIGC检测**：检测AI生成概率
- **平台发布**：一键导出为主流平台格式

## Commands

```bash
# 启动Web应用
npm run dev

# CLI命令（需安装CLI包）
workshop write-next 10 --direction "主角在迷雾森林的冒险"
workshop audit 5
workshop export --format epub
```

## Agent Interface

本工坊可通过以下接口被外部Agent调用：

### Pipeline接口
- `PipelineRunner.writeNextChapter(options)` — 执行单章Pipeline
- `BatchContinueScheduler.executeBatchContinue(...)` — 批量续写

### Intent接口
- `NaturalLanguageRouter.route(text)` — 自然语言路由到22种Intent
- `AIStore.executeIntent(context)` — 执行Intent操作

### 审计接口
- `ContinuityAuditor.audit(input)` — 33维审计
- `AIGCDetector.detect(text)` — AIGC检测
