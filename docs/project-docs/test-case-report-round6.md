# 测试用例 — 第6轮迭代（7项新增功能）

## 1. 需求依据
- 需求来源：项目负责人下达的第6轮迭代7项功能清单
- 测试范围：7项新增功能的确定性逻辑、接口集成和边界场景

## 2. 代码功能模块概览

| 模块 | 说明 | 代码位置 |
|------|------|----------|
| 6-1 张力曲线分析器 | 纯确定性跨章节节奏分析，4种问题检测 | `src/utils/tensionCurvePlanner.ts` |
| 6-2 多读者群体评估 | 3种读者群体预设+并行评估 | `src/agents/ReaderAgent.ts` |
| 6-3 对话质量分析器 | 4项确定性对话检查 | `src/utils/dialogueAnalyzer.ts` |
| 6-4 角色语言风格档案 | SpeechPattern接口+ObserverAgent提取+StateSettler处理 | `src/types/sandbox.ts` + `src/agents/ObserverAgent.ts` + `src/agents/StateSettler.ts` |
| 6-5 改稿二次验证 | 两级验证：确定性+LLM | `src/services/pipeline/RevisionVerifier.ts` |
| 6-6 ComposerAgent裁剪 | clampText强制截断+smartTrim意图感知裁剪 | `src/agents/ComposerAgent.ts` |
| 6-7 项目ID一致性修复 | pipeline页面+SandboxChat projectId统一 | 多文件 |

## 3. 需求与代码差异说明

### 3.1 需求中未在代码中体现的内容
无。7项需求均有对应代码实现。

### 3.2 需求中未覆盖但代码中存在的功能模块
- `tensionCurvePlanner.ts` 中的 `formatTensionCurveReport()` 函数（报告格式化为可读字符串）—— 可作为辅助测试项
- `tensionCurvePlanner.ts` 中的 `calculateSuggestedTension()` 函数（建议下一章目标张力值）—— 需求未明确提及但属于分析器核心逻辑
- `RevisionVerifier.ts` 中 LLM 验证限额（`MAX_LLM_VERIFICATIONS = 3`）—— 需求未说明限额，但代码有此约束

## 4. 测试用例

---

### 4.1 6-1 跨章节张力曲线规划（tensionCurvePlanner.ts）

#### TC-6-1-01 [P0] 验证高潮集群检测（3+连续高张力章节）
- **前置条件**：构造5个章节，第2-4章内容包含"战斗""突破""爆发"等高张力关键词
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入5个章节
  [2] 检查返回的 `issues` 数组
- **预期结果**：检测到 `climax_cluster` 类型问题，severity 为 `critical`，chapters 包含第2-4章，message 提示"连续3章高张力（>70）"

#### TC-6-1-02 [P0] 验证低谷段落检测（4+连续低张力章节）
- **前置条件**：构造6个章节，第1-4章内容仅包含"离开""来到""次日"等过渡关键词
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入6个章节
  [2] 检查返回的 `issues` 数组
- **预期结果**：检测到 `low_lying` 类型问题，severity 为 `warning`，chapters 包含第1-4章

#### TC-6-1-03 [P0] 验证单调节奏检测（5+连续章节张力方差<15）
- **前置条件**：构造7个章节，第1-5章内容均为"回忆沉思"类（张力20-40范围，方差<15）
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入7个章节
  [2] 检查返回的 `issues` 数组
- **预期结果**：检测到 `monotone` 类型问题，severity 为 `warning`

#### TC-6-1-04 [P0] 验证突变跳跃检测（相邻章节张力差>50）
- **前置条件**：构造2个章节，第1章为"沉思回忆"（张力~30），第2章为"战斗爆发"（张力~90）
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入2个章节
  [2] 检查返回的 `issues` 数组
- **预期结果**：检测到 `sudden_jump` 类型问题，chapters 包含[1,2]，message 包含张力差值

#### TC-6-1-05 [P1] 验证场景类型识别-对话型场景
- **前置条件**：构造1个章节，内容引号比例>30%
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入该章节
  [2] 检查 `tensionValues[0].sceneType`
- **预期结果**：sceneType 为 `dialogue`，tension 为 50

#### TC-6-1-06 [P1] 验证空章节输入
- **前置条件**：传入空数组
- **步骤**：
  [1] 调用 `analyzeTensionCurve([])`
- **预期结果**：返回 `{ tensionValues: [], issues: [], suggestedNextTension: 50 }`

#### TC-6-1-07 [P1] 验证建议下一章张力值-高张力后建议降低
- **前置条件**：构造3个章节，张力均>70
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入3个章节
  [2] 检查 `suggestedNextTension`
- **预期结果**：suggestedNextTension 为 45

#### TC-6-1-08 [P1] 验证建议下一章张力值-低张力后建议升高
- **前置条件**：构造3个章节，张力均<30
- **步骤**：
  [1] 调用 `analyzeTensionCurve()` 传入3个章节
  [2] 检查 `suggestedNextTension`
- **预期结果**：suggestedNextTension 为 65

#### TC-6-1-09 [P2] 验证formatTensionCurveReport格式化输出
- **前置条件**：已有分析报告
- **步骤**：
  [1] 调用 `formatTensionCurveReport(report)`
- **预期结果**：返回字符串包含"跨章节张力曲线"标题、张力值条形图、问题列表、建议张力值

---

### 4.2 6-2 ReaderAgent多读者群体评估（ReaderAgent.ts）

#### TC-6-2-01 [P0] 验证3种读者群体预设存在
- **前置条件**：ReaderAgent已加载
- **步骤**：
  [1] 调用 `ReaderAgent.getPersonas()`
- **预期结果**：返回3个persona：veteran（资深网文读者）、newcomer（新手读者）、genre_fan（题材核心受众）

#### TC-6-2-02 [P0] 验证多读者群体并行评估
- **前置条件**：项目和章节数据已准备，AI已配置
- **步骤**：
  [1] 调用 `runMultiPersonaReview(context, config)`
  [2] 检查返回的 PersonaFeedback 数组
- **预期结果**：返回3个反馈，每个包含 personaName、overallScore(1-10)、engagementLevel、dropRisk、specificFeedback

#### TC-6-2-03 [P1] 验证单群体评估失败时的降级处理
- **前置条件**：模拟某个persona评估失败
- **步骤**：
  [1] 调用 `runMultiPersonaReview()`，其中一个persona的AI调用抛出异常
- **预期结果**：失败的persona返回fallback反馈，其他persona正常返回，总体返回3个结果

#### TC-6-2-04 [P1] 验证自定义persona参数
- **前置条件**：自定义persona数组
- **步骤**：
  [1] 调用 `runMultiPersonaReview(context, config, customPersonas)`
- **预期结果**：使用自定义persona而非默认3种

---

### 4.3 6-3 对话质量专项检测（dialogueAnalyzer.ts）

#### TC-6-3-01 [P0] 验证对话比例分析-平衡
- **前置条件**：构造内容，对话占比在20%-60%之间
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：ratioAssessment 为 `balanced`，dialogueRatio 在0.2-0.6之间

#### TC-6-3-02 [P0] 验证对话比例分析-对话过多
- **前置条件**：构造内容，对话占比>60%
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：ratioAssessment 为 `dialogue_heavy`，issues 包含"对话占比过高"警告

#### TC-6-3-03 [P0] 验证对话比例分析-叙述过多
- **前置条件**：构造内容，对话占比<20%
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：ratioAssessment 为 `narration_heavy`，issues 包含"对话占比过低"警告

#### TC-6-3-04 [P0] 验证重复标签检测（单章>5次）
- **前置条件**：构造内容，"说"字出现8次
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：repeatedTags 包含 `{ tag: '说', count: 8 }`，issues 包含"标签使用过于单调"警告

#### TC-6-3-05 [P0] 验证连续对话检测（>6行无叙述穿插）
- **前置条件**：构造内容，8行连续以引号开头的对话行
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：maxConsecutiveDialogues 为 8，issues 包含"连续8行对话无叙述穿插"警告

#### TC-6-3-06 [P1] 验证综合评分计算
- **前置条件**：构造内容，对话比例失衡+重复标签2个+连续对话过多
- **步骤**：
  [1] 调用 `analyzeDialogue(content)`
- **预期结果**：overallScore = 100 - 15 - 10 - 10 = 65（比例失衡-15，2个重复标签各-5，连续对话-10）

#### TC-6-3-07 [P1] 验证空内容输入
- **前置条件**：传入空字符串
- **步骤**：
  [1] 调用 `analyzeDialogue('')`
- **预期结果**：dialogueRatio 为 0，overallScore 为 100，issues 为空

---

### 4.4 6-4 角色语言风格档案（SpeechPattern）

#### TC-6-4-01 [P0] 验证SpeechPattern接口完整性
- **前置条件**：Entity数据包含speechProfile
- **步骤**：
  [1] 创建Entity，设置speechProfile包含5个字段
  [2] 检查speechProfile的字段类型
- **预期结果**：formality为'formal'|'casual'|'mixed'，vocabulary为'simple'|'moderate'|'literary'，sentenceLength为'short'|'medium'|'long'，quirks和catchphrases为string[]

#### TC-6-4-02 [P0] 验证ObserverAgent提取speech_pattern类别
- **前置条件**：章节内容包含角色对话特征
- **步骤**：
  [1] ObserverAgent执行提取，类别列表包含'speech_pattern'
  [2] 检查prompt中speech_pattern的说明
- **预期结果**：提取结果metadata包含formality、vocabulary、sentenceLength、quirks、catchphrases字段

#### TC-6-4-03 [P0] 验证StateSettler处理speech_pattern
- **前置条件**：DeltaResult包含speech_pattern类别的delta
- **步骤**：
  [1] StateSettler处理speech_pattern case
- **预期结果**：将speech_pattern数据写入Entity的speechProfile字段

#### TC-6-4-04 [P1] 验证speechProfile可选性
- **前置条件**：Entity不设置speechProfile
- **步骤**：
  [1] 创建Entity，不设置speechProfile
  [2] 访问entity.speechProfile
- **预期结果**：speechProfile为undefined，不影响其他功能

---

### 4.5 6-5 改稿后二次验证（RevisionVerifier.ts）

#### TC-6-5-01 [P0] 验证Level1确定性验证-字数范围修复
- **前置条件**：issue.category='格式违规'，description包含'字数'，lengthSpec={softMin:1000,softMax:3000}
- **步骤**：
  [1] 修订后内容字数在范围内
  [2] 调用 `verifyRevision()`
- **预期结果**：status 为 `verified_fixed`，evidence 包含"已在范围"

#### TC-6-5-02 [P0] 验证Level1确定性验证-重复段落修复
- **前置条件**：issue.category='格式违规'，description包含'重复'
- **步骤**：
  [1] 修订后内容无重复段落
  [2] 调用 `verifyRevision()`
- **预期结果**：status 为 `verified_fixed`

#### TC-6-5-03 [P0] 验证Level1确定性验证-敏感词移除
- **前置条件**：issue.category='敏感词'
- **步骤**：
  [1] 修订后内容无敏感词
  [2] 调用 `verifyRevision()`
- **预期结果**：status 为 `verified_fixed`

#### TC-6-5-04 [P0] 验证Level1确定性验证-段落标准差改善
- **前置条件**：issue.category='段落等长'
- **步骤**：
  [1] 修订后段落长度标准差>修订前
  [2] 调用 `verifyRevision()`
- **预期结果**：status 为 `verified_fixed`，evidence 包含标准差变化

#### TC-6-5-05 [P0] 验证Level1确定性验证-AI标记词密度降低
- **前置条件**：issue.category='套话密度'
- **步骤**：
  [1] 修订后AI标记词密度<修订前
  [2] 调用 `verifyRevision()`
- **预期结果**：status 为 `verified_fixed`

#### TC-6-5-06 [P0] 验证Level2 LLM验证-确定性无法验证时调用LLM
- **前置条件**：issue.category不属于可确定性验证的类别
- **步骤**：
  [1] 调用 `verifyRevision()`
  [2] Level1返回null，进入Level2
- **预期结果**：LLM验证被调用，返回verified_fixed/not_fixed/partially_fixed之一

#### TC-6-5-07 [P1] 验证LLM验证限额（最多3个）
- **前置条件**：5个无法确定性验证的issue
- **步骤**：
  [1] 调用 `verifyRevision()`
- **预期结果**：前3个由LLM验证，后2个标记为 `partially_fixed`，evidence为"超出LLM验证限额"

#### TC-6-5-08 [P1] 验证无问题时的空结果
- **前置条件**：issues为空数组
- **步骤**：
  [1] 调用 `verifyRevision(original, revised, [])`
- **预期结果**：返回 `{ verifications: [], fixedIssueIds: [], remainingIssues: [] }`

#### TC-6-5-09 [P2] 验证LLM未初始化时的降级处理
- **前置条件**：AI store未初始化
- **步骤**：
  [1] 调用 `verifyRevision()`，Level2需要LLM验证
- **预期结果**：status 为 `partially_fixed`，evidence 包含"AI未初始化"

---

### 4.6 6-6 ComposerAgent场景描述裁剪（ComposerAgent.ts）

#### TC-6-6-01 [P0] 验证clampText强制截断
- **前置条件**：文本长度超过maxChars
- **步骤**：
  [1] 调用 `clampText(longText, 1000)`
- **预期结果**：返回文本长度≤1000，trimmed为true，末尾包含"[...已截断]"

#### TC-6-6-02 [P0] 验证clampText未超限不截断
- **前置条件**：文本长度未超过maxChars
- **步骤**：
  [1] 调用 `clampText(shortText, 1000)`
- **预期结果**：返回原文本，trimmed为false

#### TC-6-6-03 [P0] 验证smartTrim意图感知裁剪-保留高相关性行
- **前置条件**：文本超过maxChars，mustKeep包含关键词
- **步骤**：
  [1] 调用 `smartTrim(longText, 1000, 'section', ['角色A', '战斗'])`
- **预期结果**：返回文本≤1000字符，trimmed为true，包含与mustKeep关键词匹配度高的行

#### TC-6-6-04 [P1] 验证smartTrim无mustKeep时回退到clampText
- **前置条件**：文本超过maxChars，mustKeep为空数组
- **步骤**：
  [1] 调用 `smartTrim(longText, 1000, 'section', [])`
- **预期结果**：行为与clampText一致，末尾包含"[...已截断]"

#### TC-6-6-05 [P1] 验证smartTrim未超限不裁剪
- **前置条件**：文本未超过maxChars
- **步骤**：
  [1] 调用 `smartTrim(shortText, 1000, 'section', ['关键词'])`
- **预期结果**：返回原文本，trimmed为false

---

### 4.7 6-7 项目ID不一致修复

#### TC-6-7-01 [P0] 验证pipeline页面projectId一致性
- **前置条件**：进入项目编辑器的pipeline/Agent控制台页面
- **步骤**：
  [1] 导航到Agent控制台
  [2] 检查页面使用的projectId是否与当前项目一致
- **预期结果**：projectId与URL中的项目ID一致

#### TC-6-7-02 [P0] 验证SandboxChat projectId一致性
- **前置条件**：进入设定沙盘页面
- **步骤**：
  [1] 导航到设定沙盘
  [2] 发送消息给沙盘自动化主脑
  [3] 检查请求中的projectId
- **预期结果**：projectId与当前项目一致，沙盘数据正确加载

#### TC-6-7-03 [P1] 验证切换项目后projectId更新
- **前置条件**：有多个项目
- **步骤**：
  [1] 进入项目A，记录projectId
  [2] 返回项目列表，进入项目B
  [3] 检查pipeline和沙盘的projectId
- **预期结果**：projectId更新为项目B的ID，不残留项目A的数据

---

## 5. 用例统计

| 模块 | P0 | P1 | P2 | 合计 |
|------|----|----|----|----|
| 6-1 张力曲线分析器 | 4 | 4 | 1 | 9 |
| 6-2 多读者群体评估 | 2 | 2 | 0 | 4 |
| 6-3 对话质量分析器 | 5 | 2 | 0 | 7 |
| 6-4 角色语言风格档案 | 3 | 1 | 0 | 4 |
| 6-5 改稿二次验证 | 5 | 3 | 1 | 9 |
| 6-6 ComposerAgent裁剪 | 3 | 2 | 0 | 5 |
| 6-7 项目ID一致性 | 2 | 1 | 0 | 3 |
| **合计** | **24** | **15** | **2** | **41** |
