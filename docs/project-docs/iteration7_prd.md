# 第7轮迭代 — PRD文档

> 版本：v1.0 | 日期：2026-05-30 | 撰写：产品经理

---

## 一、B3: TS编译错误清零

### 1.1 问题描述
当前有24个TS编译错误，集中在 WritingDashboard.vue (6个，Store类型转换) 和 ProjectList.vue (4个)。

### 1.2 修复方案
- WritingDashboard.vue 中的6处 `as Record<string, unknown>` → 改为以 `unknown` 临时转换再访问属性
- ProjectList.vue 中 AdvancedSettings 类型匹配 → 补齐 AdvancedSettings 的字段

### 1.3 验收标准
- `vue-tsc --noEmit` 输出0错误
- CI/CD pipeline中加入 TS 检查步骤

**工作量**: 0.5人日

---

## 二、A1: 体裁感知审计权重

### 2.1 现状与问题
- `ContinuityAuditor.ts`中17维审计维度对所有体裁用相同权重和检查指令，无法区分玄幻需要的"升级节奏"与言情小说重视的"角色情感弧线"。
- `GenreProfile.auditDimensions` 中已有 `weight`（0-10），但 ContinuityAuditor 未采用。

### 2.2 功能定义
- 修改 ContinuityAuditor 的 `computeAuditResult` 方法，每维度的 `score` 权重=GenreProfile.weight/10
- GenreProfile 需提前映射所有17维度，添加 weight 列表
- 每体裁有对应的重点维度，审计按体裁切换权重，影响综合得分

### 2.3 接口与数据结构
```typescript
interface GenreAuditWeights {
  dimensionId: string;   // 对应到 AuditDimension.id
  weight: 1–10;         // 0=忽略维度，10=最高权
}
```

### 2.4 验收标准
- 运行 ContinuityAuditor 审计 2 个不同体裁项目（玄幻 vs 言情），权重调换后，审计项敏感度有变化
- 维度权重可配置

工作量：1 人日

---

## 三、A2: Hook Governance + Arbiter（伏笔治理引擎）

### 3.1 背景
当前伏笔健康分析只有诊断（压力、陈旧度等），缺少准入控制与冲突检测。

### 3.2 功能
- **Governance**：新伏笔种植前需通过准入审核（声明 `expectedPayoffTiming`），系统拒绝超过15个未解决的活跃伏笔。
- **Arbiter**：检查新伏笔是否与现有伏笔的依赖/回指冲突；仲裁解决冲突（互斥伏笔检测）

### 3.3 接口设计
```typescript
interface HookGovernanceResult {
  accepted: boolean;
  reason?: string;  // 拒绝理由
}
function admitHook(hook: ProposedHook, context: HookGovernanceContext): HookGovernanceResult
```

- `hookArbiter.ts`：使用有向图检测新伏笔是否形成环或与现有伏笔冲突

### 3.4 验收标准
- 新伏笔超 8 个激活伏笔时拒绝准入
- 检测到一个新伏笔依赖的线索已被另一个伏笔所指，发出 ConflictingResult
- 所有决策输出有审计日志

工作量：2人日

---

## 四、A3: 状态校验器（State Validator）

### 4.1 背景
StateSettler写入Entity新数据后没有后校验；如果LLM提取的state变化有矛盾（角色死亡后又出现），需要在下一周期捕获矛盾。

### 4.2 方案
- `stateValidator.ts`: 掯晰检测新state与Entity库之间主要矛盾，输出 `ValidationError[]`。
- 与Phase 7结束前调用（后置校验），发现问题以 warning 提升为 error 级 证据跳出层次。

```typescript
interface StateValidationResult {
  entityName: string;
  conflictType: 'contradiction' | 'duplicity';
  description: string;
}
```
- 校验范围：角色名字是否出现在当前章节的entity实体表里、field值突变。

工作量：1.5人日

---

## 五、B1: 写作统计仪表盘

### 5.1 功能
为 WritingDashboard 增加写作统计面板，提供每日字数、Token消耗、写作时长。统计数据写入 IndexedDB（repository: `writing-stats`）

### 5.2 数据模型
```typescript
interface DailyStats {
  date: string;          // 'YYYY-MM-DD'
  wordsWritten: number;
  chaptersWritten: number;
  tokenUsage: { input: number; output: number };
  timeSpentMinutes: number;
}
```
用IndexedDB per-day stats.

### 5.3 交互
- 用 ECharts 或 Chart.js 做线性趋势+柱状图
- 补足edR/Stats

工作量：2人日

---

## 六、B2: 章节版本对比

### 6.1 需求
对章节的两个版本进行行级diff对比，新增为绿色，删除为红色高亮。

### 6.2 实现方案
- 复用 jsdiff / diff-match-patch 库计算word-level diff
- UI: 左右 / 左右对照的 diff 高亮视图

工作量：1.5人日

---

## 七、C1: 大纲自动扩展与张力曲线联动

### 7.1
- 大纲扩展时调用tensionCurvePlanner、保证扩展后整体的张力曲线不跌破斜率
- 扩展前保存快照

工作量：1.5人日

---

## 八、C2: 记忆增强检索

### 8.1
- 根据embeddings接近度选回章节摘要段落嵌入上下文

工作量：2人日

---

## 九、C3: 模型渐进降级 + 模型调用策略

### 9.1
- 前3章用强模型，后续章依前3章质量检测递减模型
- 切换日志发出阶梯事件

工作量: 1.5人日

---

## 十、D1: 角色对话模拟器

功能: 依 Entity 卡片 + Speech Profile 与 Agent 互动

工作量: 2人日

## 十一、D2: 写作风格迁移

基于 StyleAnalyzer 的 fingerprint 做StyleTransfer，输出提示词 提给ReviserAgent（作为新模式）

工作量: 2人日

---

## 十二、D3: 分支叙事架构

数据结构及 UI，管理 tree。工作量 3人日。

---

总工作量: 21 人日