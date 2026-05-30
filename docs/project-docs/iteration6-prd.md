# 第6轮迭代 — 产品需求文档（PRD）

> 版本：v1.0
> 日期：2026-05-29
> 撰写者：产品经理
> 基于文档：`project-status-assessment-v2.md`（项目负责人全量代码审查报告）

---

## 一、背景与目标

### 1.1 当前系统状态

经过5轮迭代，AI小说工坊已具备完整的10-Agent Pipeline、17维审计修订循环、伏笔追踪、叙事控制等核心能力。系统功能集丰富（77,482行源码），但在深度质量环节存在7处明确缺陷，需要从"功能完整"推进到"质量闭环"。

### 1.2 本轮目标

**聚焦7项深度质量优化**，每项均有明确代码行号依据，目标是补齐Pipeline从"能跑"到"跑得好"之间的质量鸿沟。

### 1.3 不做什么

- 不新增功能模块（无新页面、新组件）
- 不做架构重构（两套Agent系统合并、as any清理等留待后续）
- 不做UI优化（本轮纯后端/Agent层优化）

---

## 二、需求清单

### 需求 6-1：跨全书张力曲线规划

#### 问题

`chapterCadence.ts`（206行）仅分析单章节奏（场景类型、情绪张力、标题同质化），缺少跨章节的宏观节奏规划能力。当前无法检测：

- 高潮扎堆（连续3章高强度无缓冲）
- 低谷过长（连续5章无冲突推进）
- 节奏单调（全书缺乏起伏弧线）

#### 代码依据

- `chapterCadence.ts` — `analyzeChapterCadence()` 输入为单章内容，无全书视角
- `DataAdapter.ts:91` — `extractEmotionalArcs()` 返回硬编码占位符 `(情感弧线待实现)`

#### 功能定义

1. **新增 `tensionCurvePlanner.ts`**：接收全书已写章节列表，输出跨章节张力曲线
   - 输入：`{ chapters: Chapter[], currentChapterNumber: number }`
   - 输出：`TensionCurveReport`
     ```typescript
     interface TensionCurveReport {
       /** 各章节张力值（0-100） */
       tensionValues: Array<{ chapter: number; tension: number; sceneType: string }>
       /** 节奏问题列表 */
       issues: TensionIssue[]
       /** 建议的下一章张力目标 */
       suggestedNextTension: number
     }

     interface TensionIssue {
       type: 'climax_cluster' | 'low_lying' | 'monotone' | 'sudden_jump'
       chapters: number[]        // 涉及章节
       severity: 'warning' | 'critical'
       message: string           // 如 "第12-14章连续3章高潮，缺少缓冲"
       suggestion: string        // 如 "建议第13章插入过渡场景"
     }
     ```

2. **张力值计算**（确定性，不依赖LLM）：
   - 基于现有 `chapterCadence.ts` 的单章分析结果
   - 场景类型映射：`action/climax`→80-100，`confrontation`→60-80，`dialogue`→40-60，`reflection`→20-40，`transition`→10-30
   - 跨章节规则：
     - 连续3章张力>70 → `climax_cluster`
     - 连续4章张力<30 → `low_lying`
     - 连续5章张力波动<15 → `monotone`
     - 相邻章节张力差>50 → `sudden_jump`

3. **集成到 Pipeline**：
   - Phase 8（ChapterAnalyzer）后执行张力曲线分析
   - 结果注入 Phase 9（HookPromoter）的上下文，辅助判断是否需要高张力伏笔

4. **替换 DataAdapter 占位符**：
   - `extractEmotionalArcs()` 改为调用 `tensionCurvePlanner` 获取真实数据

#### 验收标准

- [ ] `tensionCurvePlanner.ts` 存在，包含 `TensionCurveReport` 和 `TensionIssue` 类型
- [ ] 对5章以上已写项目执行分析，输出包含 `tensionValues` 和 `issues`
- [ ] 4种节奏问题类型（climax_cluster/low_lying/monotone/sudden_jump）均能正确检测
- [ ] `DataAdapter.extractEmotionalArcs()` 不再返回占位符
- [ ] Pipeline Phase 8 后调用张力曲线分析，结果注入 Phase 9 上下文

#### 工作量

2 人日

---

### 需求 6-2：ReaderAgent 增强 — 多读者群体模拟

#### 问题

`ReaderAgent.ts`（32行）仅为薄包装，直接调用 `reviewRunner({ profile: 'quality' })`，返回统一的建议列表。无法模拟不同读者群体的差异化反馈（如：资深读者关注伏笔回收、新读者关注代入感、目标题材读者关注套路满足度）。

#### 代码依据

- `ReaderAgent.ts:13` — `runReview({ profile: 'quality' })`，固定单一profile
- `reviewProfiles.ts` — 4种profile（consistency/quality/editor/style），无读者群体区分

#### 功能定义

1. **定义读者群体类型**：

   ```typescript
   interface ReaderPersona {
     id: string
     name: string                  // 如 '资深网文读者'、'新手读者'、'题材核心受众'
     readingExperience: 'veteran' | 'intermediate' | 'newcomer'
     genreFamiliarity: 'core' | 'casual' | 'unfamiliar'
     focusAreas: string[]          // 如 ['伏笔回收', '逻辑自洽', '角色成长']
     toleranceForTropes: 'high' | 'medium' | 'low'
   }

   interface ReaderFeedback {
     personaId: string
     personaName: string
     overallScore: number          // 1-10
     engagementLevel: 'hooked' | 'interested' | 'neutral' | 'bored'
     specificFeedback: Array<{
       aspect: string              // 如 '代入感'、'伏笔'、'节奏'
       score: number
       comment: string
     }>
     dropRisk: 'none' | 'low' | 'medium' | 'high'  // 弃书风险
   }
   ```

2. **预设3种读者群体**：
   - **资深网文读者**：关注伏笔回收、逻辑自洽、角色成长、套路创新
   - **新手读者**：关注代入感、情节易懂性、角色辨识度、悬念吸引力
   - **题材核心受众**：关注题材套路满足度（如玄幻读者的升级爽感、言情读者的CP互动）

3. **ReaderAgent 改造**：
   - 支持多群体并行调用 `reviewRunner`，每群体使用不同的 system prompt
   - 聚合多群体反馈，输出 `ReaderFeedback[]`
   - 在 `AgentOrchestrator` 中使用时，可选择默认（3群体全跑）或指定群体

4. **新增 reviewProfile**：
   - `reader_veteran`：资深读者视角
   - `reader_newcomer`：新手读者视角
   - `reader_genre_fan`：题材核心受众视角

#### 验收标准

- [ ] `ReaderPersona` 和 `ReaderFeedback` 类型定义存在
- [ ] 3种预设读者群体（veteran/newcomer/genre_fan）可配置
- [ ] ReaderAgent 支持多群体并行评估，输出 `ReaderFeedback[]`
- [ ] 每个群体的 system prompt 包含明确的关注维度和评分标准
- [ ] `reviewProfiles.ts` 新增 3 种 reader profile

#### 工作量

2 人日

---

### 需求 6-3：对话质量专项检测

#### 问题

当前无专门的对话质量分析。ContinuityAuditor 的17维审计中不包含对话维度，导致以下问题无法检测：
- 角色对话不符合人设（如冷酷角色突然说俏皮话）
- 对话/叙述比例失衡（全对话或全叙述）
- 对话标签重复（"他说"、"她笑道"过多）

#### 代码依据

- `ContinuityAuditor.ts` — 17维审计维度中无 `dialogue` 类别
- `ObserverAgent.ts` — 提取角色信息但不分析说话方式

#### 功能定义

1. **新增 `dialogueAnalyzer.ts`**：

   ```typescript
   interface DialogueAnalysisResult {
     /** 对话/叙述比例 */
     dialogueRatio: number           // 0-1，对话占总文本比例
     ratioAssessment: 'balanced' | 'dialogue_heavy' | 'narration_heavy'
     /** 对话标签统计 */
     tagFrequency: Array<{ tag: string; count: number }>
     /** 角色对话一致性（需配合角色语言风格档案） */
     characterDialogueIssues: Array<{
       characterName: string
       issue: string
       severity: 'warning' | 'error'
       evidence: string             // 原文摘录
     }>
     /** 综合评分 */
     overallScore: number           // 0-100
   }
   ```

2. **确定性检测项**（不依赖LLM）：
   - 对话/叙述比例计算：统计引号内文本占比
   - 对话标签频率：统计"说/道/笑/叹/吼"等标签出现频率
   - 重复标签检测：同一标签在单章出现>5次则标记
   - 连续对话检测：>6轮连续对话无叙述穿插则标记

3. **LLM增强检测项**（需要AI辅助）：
   - 角色对话一致性：对比角色描述与实际对话语气是否匹配
   - 对话信息密度：对话是否推动情节或揭示角色

4. **集成到 ContinuityAuditor**：
   - 在确定性检查阶段增加对话维度
   - 对话/叙述比例异常、标签重复作为 `warning` 级 issue

#### 验收标准

- [ ] `dialogueAnalyzer.ts` 存在，包含 `DialogueAnalysisResult` 类型
- [ ] 对话/叙述比例计算准确（引号内文本 / 总文本）
- [ ] 对话标签频率统计正确，重复标签可检测
- [ ] 连续>6轮对话无叙述可检测
- [ ] ContinuityAuditor 的确定性检查阶段包含对话维度
- [ ] 对话异常作为 warning 级审计 issue 输出

#### 工作量

1.5 人日

---

### 需求 6-4：角色语言风格档案

#### 问题

ObserverAgent 提取角色信息（9类事实）但不追踪说话方式一致性。同一角色在不同章节中可能语气突变而无法检测。

#### 代码依据

- `ObserverAgent.ts` — 9类事实提取中无 `speech_pattern` 类别
- `StateSettler.ts` — ObserverFacts 的 `category` 枚举不含语言风格

#### 功能定义

1. **扩展 ObserverAgent 事实类别**：

   新增第10类 `speech_pattern`：

   ```typescript
   interface SpeechPattern extends ObservedFact {
     category: 'speech_pattern'
     entityName: string            // 角色名
     speechTraits: {
       formality: 'formal' | 'casual' | 'mixed'     // 正式/随意/混合
       vocabulary: 'simple' | 'moderate' | 'literary' // 词汇水平
       sentenceLength: 'short' | 'medium' | 'long'    // 句式长度
       quirks: string[]            // 语言特点，如 "喜欢用反问句"、"爱说口头禅"
       catchphrases: string[]      // 口头禅
     }
   }
   ```

2. **ObserverAgent 提取逻辑**：
   - 在章节正文中识别角色对话段落
   - 提取该角色的语言特征（正式度、词汇水平、句式长度、语言习惯）
   - 与已积累的该角色语言档案比对，检测不一致

3. **角色语言档案存储**：
   - 在 Sandbox Entity 的 `systemPrompt` 字段中追加语言风格描述
   - 新增 Entity 的 `speechProfile` 可选字段（避免侵入已有类型，使用扩展属性）

4. **集成到对话质量检测**：
   - `dialogueAnalyzer.ts` 在 LLM 增强检测时，读取角色的 `speechProfile`
   - 角色对话与档案不一致时标记为 `characterDialogueIssues`

#### 验收标准

- [ ] `SpeechPattern` 类型定义存在，ObservedFact 的 category 支持 `speech_pattern`
- [ ] ObserverAgent 在 observe() 中提取角色对话语言特征
- [ ] 提取结果包含 formality/vocabulary/sentenceLength/quirks/catchphrases
- [ ] 角色语言档案持久化到 Entity 的扩展属性
- [ ] dialogueAnalyzer 可读取角色语言档案进行一致性检测

#### 工作量

1.5 人日

---

### 需求 6-5：ReviserAgent 修复验证

#### 问题

`ReviserAgent.ts:241` 在修订后盲目标记所有 issue 为已修复（`fixedIssues`），不验证 LLM 是否实际修复了问题。这导致审计-修订循环可能提前通过，质量问题被掩盖。

#### 代码依据

- `ReviserAgent.ts` — 修订后直接设置 `fixedIssues: issues.map(i => i.id)`，无验证逻辑
- `ChapterReviewCycle.ts` — 依赖 `fixedIssues` 判断修订是否通过

#### 功能定义

1. **修订验证策略**：

   ```typescript
   interface RevisionVerification {
     /** 原始 issue ID */
     issueId: string
     /** 验证结果 */
     status: 'verified_fixed' | 'partially_fixed' | 'not_fixed' | 'worsened'
     /** 验证依据 */
     evidence: string    // 如 "原文'李明突然笑了'已改为'李明嘴角微微上扬'"
   }
   ```

2. **验证方式**（两级，确定性+LLM）：

   **Level 1 — 确定性验证**（零成本，立即执行）：
   - 长度类 issue：修订后字数是否在目标范围内
   - 重复段 issue：修订后重复段是否消失（字符串匹配）
   - 敏感词 issue：修订后敏感词是否消失（关键词匹配）
   - 段落等长 issue：修订后段落长度标准差是否降低

   **Level 2 — LLM 验证**（低成本，选择性执行）：
   - 仅对 Level 1 无法验证的 issue 执行
   - 使用简短 prompt：给出原始 issue + 修订后文本，判断是否修复
   - 使用最低成本模型（如 haiku 级别）
   - 单次验证 < 200 tokens

3. **fixedIssues 改造**：
   - 不再盲目标记所有 issue 为已修复
   - 仅将 `status === 'verified_fixed'` 的 issue 加入 `fixedIssues`
   - `partially_fixed` 的 issue 保留在 remainingIssues 中，降低 priority

4. **集成到 ChapterReviewCycle**：
   - 修订后执行验证
   - 验证结果影响下一轮审计的 issue 列表

#### 验收标准

- [ ] `RevisionVerification` 类型定义存在
- [ ] Level 1 确定性验证至少覆盖4种 issue 类型（长度/重复段/敏感词/段落等长）
- [ ] Level 2 LLM 验证对不可确定性验证的 issue 执行
- [ ] `fixedIssues` 不再包含未验证的 issue
- [ ] ChapterReviewCycle 的修订循环利用验证结果
- [ ] LLM 验证使用低成本模型，单次 < 200 tokens

#### 工作量

1.5 人日

---

### 需求 6-6：ComposerAgent LLM 裁剪

#### 问题

`ComposerAgent.ts:496` 的 `composeWithLLM()` 为 stub，直接调用 `compose()`，LLM 智能裁剪未实现。当前 `compose()` 使用确定性的 `smartTrim` + `mustKeep` 关键词匹配进行裁剪，对于长篇小说（50+ 章）上下文质量不足。

#### 代码依据

- `ComposerAgent.ts:496` — `composeWithLLM()` 仅调用 `compose()`
- `smartTrim()` — 基于关键词的相关性评分，无法理解语义关联

#### 功能定义

1. **LLM 裁剪模式**（`composeWithLLM` 真实实现）：

   触发条件：已写章节数 ≥ 20 章时自动启用 LLM 裁剪

2. **裁剪流程**：
   - 先用 `compose()` 完成确定性组装（含 smartTrim）
   - 对 `chapterSummaries` 和 `characterMatrix` 两个高占用块，用 LLM 做语义相关性判断
   - LLM 输入：当前章节意图（`PlanChapterOutput.intent`）+ 候选摘要/角色条目
   - LLM 输出：每个条目的相关性评分（1-5）+ 保留/裁剪建议
   - 仅保留评分 ≥ 3 的条目

3. **LLM 调用规格**：
   - 使用低成本模型
   - 单次输入 < 2000 tokens，输出 < 500 tokens
   - 仅对 `chapterSummaries` 和 `characterMatrix` 两个块执行（合计 < 2次 LLM 调用）

4. **回退策略**：
   - LLM 调用失败时，回退到确定性 `smartTrim` 结果
   - 确保 LLM 裁剪是增强而非替代

#### 验收标准

- [ ] `composeWithLLM()` 不再是 stub，包含真实的 LLM 调用逻辑
- [ ] 已写章节数 ≥ 20 时自动启用 LLM 裁剪
- [ ] LLM 仅对 `chapterSummaries` 和 `characterMatrix` 做语义裁剪
- [ ] LLM 调用失败时正确回退到 smartTrim 结果
- [ ] PipelineRunner Phase 2 支持在 `enableLLMCompose` 开关下调用 `composeWithLLM()`

#### 工作量

1.5 人日

---

### 需求 6-7：StateSettler projectId 占位符修复

#### 问题

`StateSettler.ts:413` 在创建 StateEvent 时使用 `'__pending__'` 作为 `projectId` 占位符，注释称"会在后续流程中被填充"，但代码中无后续填充逻辑。导致：
- StateEvent 无法正确关联到项目
- 按项目查询 StateEvent 时可能遗漏 `__pending__` 标记的事件
- 数据完整性风险

#### 代码依据

- `StateSettler.ts:413` — `event.projectId = '__pending__'`
- PipelineRunner 调用 `settler.settle()` 时传入的 `input` 包含 `project` 对象，可获取 `project.id`

#### 功能定义

1. **修复方案**（极简）：
   - `SettleStateInput` 已包含 `project: Project` 字段
   - 在 `applyObserverFacts()` 和 `applyStateChanges()` 中，将 `__pending__` 替换为 `input.project.id`
   - 在 `settle()` 方法末尾增加兜底校验：遍历 `result.newStateEvents`，将残留的 `__pending__` 替换为 `input.project.id`

2. **影响范围**：
   - `applyObserverFacts()` — 1处修改
   - `applyStateChanges()` — 1处修改
   - `settle()` — 1处兜底校验
   - 总改动 < 10 行

#### 验收标准

- [ ] StateSettler 创建的 StateEvent 中不再包含 `'__pending__'` projectId
- [ ] 所有 StateEvent 的 projectId 值为实际的 `project.id`
- [ ] 兜底校验确保即使遗漏也不会产生 `__pending__` 数据

#### 工作量

0.5 人日

---

## 三、优先级与工作量汇总

| # | 需求 | 优先级 | 工作量 | 核心价值 |
|---|------|--------|--------|---------|
| 6-1 | 跨全书张力曲线规划 | P0 | 2 人日 | 补齐全书节奏视角，替换情感弧线占位符 |
| 6-5 | ReviserAgent 修复验证 | P0 | 1.5 人日 | 审计-修订循环质量闭环，防止虚假修复 |
| 6-7 | StateSettler projectId 修复 | P0 | 0.5 人日 | 数据完整性修复，改动极小 |
| 6-6 | ComposerAgent LLM 裁剪 | P1 | 1.5 人日 | 长篇小说上下文质量提升 |
| 6-3 | 对话质量专项检测 | P1 | 1.5 人日 | 新增对话维度审计能力 |
| 6-2 | ReaderAgent 增强 | P1 | 2 人日 | 多读者群体差异化反馈 |
| 6-4 | 角色语言风格档案 | P2 | 1.5 人日 | 需配合 6-3 使用，可并行开发 |
| **合计** | — | — | **10.5 人日** | — |

### 建议实施顺序

**第一批**（4 人日）：6-7 → 6-5 → 6-1
- 先修数据缺陷（6-7），再修质量缺陷（6-5），最后补能力缺口（6-1）

**第二批**（3.5 人日）：6-6 → 6-3
- LLM 裁剪（6-6）和对话检测（6-3）可部分并行

**第三批**（3.5 人日）：6-2 → 6-4
- ReaderAgent 增强（6-2）和角色语言档案（6-4）有依赖关系，6-4 的输出供 6-3 的 LLM 增强检测使用

---

## 四、依赖关系

```
6-7（projectId）— 无依赖，可立即开始
6-5（Reviser验证）— 无依赖，可立即开始
6-1（张力曲线）— 无依赖，可立即开始
6-6（LLM裁剪）— 无依赖，可立即开始
6-3（对话检测）— 依赖 6-4 的角色语言档案（仅 LLM 增强检测部分）
6-4（语言档案）— 无依赖，但产出供 6-3 使用
6-2（ReaderAgent）— 无依赖
```

---

## 五、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| LLM 裁剪增加延迟 | 中 | 低 | 仅在 20+ 章时启用，限制 2 次 LLM 调用 |
| 多读者群体 LLM 成本 | 低 | 低 | 使用低成本模型，3 群体合计 < 1500 tokens |
| 修订验证 LLM 调用叠加 | 中 | 中 | Level 1 确定性验证优先，Level 2 仅对必要 issue 执行 |
| 角色语言档案提取准确度 | 中 | 中 | 初始版本仅作辅助参考，不阻断 Pipeline |

---

## 六、非目标（明确排除）

- 两套 Agent 系统合并（P3）
- ObserverAgent 实体名精确匹配优化（P3）
- BatchContinueScheduler 暂停机制优化（P3）
- as any 全面清理（P3）
- 任何 UI 新增或改造
- 新增页面/组件

---

> 本文档为第6轮迭代的产品需求文档，供开发工程师实施参考。
