# 多项目深度分析报告：AI 辅助创作系统技术调研

> 生成日期：2026-05-11
> 范围：FictionX / AI-Novel-Writing-Assistant / SillyTavern / NovelCrafter / WHAT-IF 论文

---

## 目录

1. [FictionX Story Gen — 多智能体无限故事生成](#1-fictionx-story-gen)
2. [AI-Novel-Writing-Assistant — AI 长篇小说生产引擎](#2-ai-novel-writing-assistant)
3. [SillyTavern — 角色卡 / 世界信息 / 扩展架构](#3-sillytavern)
4. [NovelCrafter Codex 系统](#4-novelcrafter-codex)
5. [WHAT-IF 论文 — 零样本元提示分支叙事](#5-what-if-论文)
6. [跨项目对比与设计启示](#6-跨项目对比与设计启示)

---

## 1. FictionX Story Gen

**仓库**: `WyseOS/fictionx-story-gen` (Apache-2.0)
**定位**: 基于多智能体的交互式无限故事生成框架

### 1.1 核心架构

FictionX 采用三层 Agent 架构：

| Agent | 职责 |
|-------|------|
| **Character & Outline Agent** | 构建世界观、角色体系、故事大纲树 |
| **Story Content Generation Agent** | 逐节点渲染段落内容 |
| **Evaluation Agent** | 多维度评分（一致性/连贯性/评论性/长度）|

底层 LLM 使用 `Llama-3.3-70B-Instruct`（Together AI 提供推理），同时兼容 GPT-4o、Claude 3.5 Sonnet、自建 vLLM。

### 1.2 故事大纲树（Branching Mechanism）

**核心数据结构**: `OutlineNode` — 多叉树节点

```
Root (depth=0, 空文本)
├── Child Node 1 (depth=1, 整体故事方向)
│   ├── Leaf Node 1a (depth=2, 具体事件 + 场景 + 角色)
│   ├── Leaf Node 1b
│   └── Leaf Node 1c
├── Child Node 2
│   ├── Leaf Node 2a
│   └── Leaf Node 2b
└── Child Node 3
```

**关键设计**:
- **树深度自适应编号**: depth%3 交替使用数字/字母/罗马数字（`1.`, `a.`, `i.`）
- **节点属性**: `text`（事件描述）、`scene`（场景）、`entities`（参与角色列表）
- **上下文计算**: `context()` 方法支持 4 种模式：
  - `full` — 全树节点作为上下文
  - `ancestors` — 仅祖先链
  - `ancestors-with-siblings` — 祖先+兄弟节点
  - `ancestors-with-siblings-children` — 祖先+兄弟+兄弟的子节点
- **前驱/后继**: `predecessor()` / `successor()` 用于衔接事件描述

**大纲生成流程** (`generate_outline`):
1. 创建空根节点
2. 循环选择待扩展节点 → `select_node_to_expand`
3. 为节点生成子事件 → `generate_node_subevents`：
   - depth=0 生成 3 个子事件（故事方向）
   - 其他深度逐个生成，由 LLM 返回 `has_next` 指示是否继续
   - 每个子事件额外生成 `scene` 和 `entities`
4. 达到 `max_children` 或无更多事件时停止

### 1.3 角色系统

**Entity 类**: `name` + `description`（纯文本描述）

**生成流程**:
1. 先生成主角（`generate_main_character`）
2. 按 ally/adversary 交替模式生成配角（最多 15 次尝试）
3. 每个角色的描述需 ≥128 字符，强制要求以句号结尾
4. 停用词过滤 + 无效前缀过滤确保生成质量

**角色检测**: `detect_entities()` 通过关键词匹配将事件与角色关联。

### 1.4 无限生成机制

`extend_by_last_node()` 函数实现故事续写：
- 取最后一个父节点的叶子节点
- 逐个渲染未完成的叶子节点
- 使用 beam search 保留最优候选

### 1.5 内容生成与评分

**Beam Search 策略**:
- `outline_node_beam_width`: 每个大纲节点保留的最优故事数
- `passage_beam_width`: 每个段落保留的候选数
- 每个节点渲染 `min_passages_per_node` ~ `max_passages_per_node` 次

**评分维度**（使用 LLM logprobs）:
| 维度 | 方法 |
|------|------|
| **coherence** | 给定前文，判断续写是否连贯（Yes/No logprob）|
| **relevance** | 判断段落是否与节点事件相关 |
| **commentary** | 判断是否为故事文本而非评论/AI 元叙述 |
| **length** | 惩罚未完成的短输出 |

**上下文管理**:
- 前文摘要：对上一个节点的文本调用 LLM 生成摘要（`previous_summary_context`）
- 事件折叠：`collapse_previous_events` 将已全部渲染的子树折叠为父节点文本
- 自回归续写：`autoregressive_context` 控制续写的原始文本输入

### 1.6 图像集成

- **Text2Image**: Flux Dev 生成封面和场景图
- **Image2Image**: FLUX PuLID 保持角色形象一致性
- Llama-3.3 构建 Prompt Engineering 系统优化图像生成

### 1.7 RAG 角色聊天

故事完成后向量化，支持与任意角色实时对话，保持角色性格和说话风格。独立仓库 `StoryChatV1` 实现。

---

## 2. AI-Novel-Writing-Assistant

**仓库**: `ExplosiveCoderflome/AI-Novel-Writing-Assistant`
**技术栈**: React + Vite / Express + Prisma / LangChain + LangGraph / Qdrant / Plate 编辑器
**定位**: 面向长篇小说的 AI 生产系统，从灵感→世界观→角色→卷规划→章节执行→质量修复的全链路

### 2.1 系统整体架构

```
灵感输入 → 自动导演 → 项目设定 → 故事宏观规划 → 角色准备
    → 卷战略/卷骨架 → 节奏/拆章 → 章节执行 → 质量修复
```

**核心分层**:
- **开书定盘层**: 定义"这本书要写成什么样"
- **整本控制层**: 卷级规划、节奏管理
- **单章生成层**: 角色、世界观、写法、知识库、质量控制托住
- **反馈回灌层**: 每章完成后回灌状态影响后续

### 2.2 自动导演系统（Director Subsystem）

**架构三层**:

| 层级 | 组件 | 职责 |
|------|------|------|
| 任务分发层 | `TaskDispatcher` + `DirectorTaskQueue` | 事件总线 + 统一队列（替代 1.5s 轮询）|
| Worker 消费层 | `DirectorWorker` | 纯消费者：waitForWork→leaseNext→acquireResourceGate→executeCommand→completeTask |
| 持久化调度层 | `DirectorCommandService` / `DirectorRuntimeExecutionService` | HTTP 入口 + 执行租约管理 |

**数据模型**:
- Legacy: `DirectorRunCommand`（与 NovelWorkflowTask 关联）
- Runtime: `DirectorRuntimeInstance` → `DirectorRuntimeCommand` → `DirectorRuntimeExecution`

**导演推进方式**: 
- 按重要阶段审核
- 自动推进到可开写
- 继续自动执行前 10 章

支持检查点恢复、现有项目接管、换模型重试。

### 2.3 写法引擎（Style Engine）

**这是该项目最独特的子系统**。

**数据结构**:
```
StyleProfile {
  narrativeRules: { progression_mode, scene_unit_pattern, multi_pov, looping, ending_style }
  characterRules: { allow_self_reflection, emotion_expression, defense_mechanisms }
  languageRules: { register, roughness, sentence_variation, allow_swearing }
  rhythmRules: { pace, paragraph_density, action_over_explanation }
}
```

**编译流程** (`StyleCompiler`):
1. 输入: `StyleProfile` + `AntiAiRule[]` + binding summaries
2. 按 section 权重编译为 `CompiledStylePromptBlocks`
3. 权重映射为指令强度: ≥0.85 "must keep" / ≥0.65 "keep preferred" / <0.65 "keep when natural"
4. 输出 6 个 contract section: narrative / character / language / rhythm / antiAi / selfCheck

**写法 Contract 文本生成**:
- `buildFullStyleContractText()` — 完整写法规则文本
- `buildPlannerStyleContractSummaryText()` — 给规划器用的精简版

**反 AI 规则库**:
- 禁止解释型心理描写（"他感到"、"他意识到"）
- 禁止主题升华/总结句
- 鼓励无意义生活细节
- 自动检测 + 自动修正预览

**写法来源**:
- 从拆书分析提取
- 从范文文本提取
- 手动创建
- 内置模板（底层循环现实流 / 爽文递进推进流 / 悬疑压迫递增流 等 8 种）

**绑定层级**: 全书级 → 卷级 → 章节级 → 角色视角级 → 单次任务级

### 2.4 世界观引擎

**5 层架构**（来自设计文档）:

| 层级 | 职责 |
|------|------|
| **World Profile** | 世界身份：名称、题材、基调、核心主题 |
| **World Rules** | 约束规则：现实稳定性、超常可见性、死亡可逆性、真相可达性 |
| **World Assets** | 资源库：阵营(Factions)、势力(Forces)、地点(Locations)、特殊要素(Elements) |
| **World Relations** | 关系层：势力关系、地点控制、要素归属 |
| **Story Binding** | 小说绑定接口：从世界资源中筛出最适合当前小说的局部舞台 |

**关键设计哲学**:
- 世界管理 = "世界级约束与资源中心"，不是"设定百科"
- **世界里存全量，小说里激活部分**
- 地点必须有限制性（`access_rule`, `exit_cost`），否则只是摆设
- 势力必须有 `pressure_style`（如何压迫人物）

**来源来源来源**: 18 个 TypeScript 文件构成世界管理模块：
- `WorldService.ts` — 主服务
- `worldLayerGeneration.ts` — 分层生成
- `worldConsistency.ts` — 一致性检查
- `worldSnapshotService.ts` — 快照
- `worldStructureWorkspace.ts` — 结构化工作区

### 2.5 RAG / 知识库系统

- **向量数据库**: Qdrant（可选，`RAG_ENABLED=false` 可跳过）
- **文档管理**: `KnowledgeService` 管理文档生命周期（创建/索引/重建/归档）
- **索引任务**: `ragIndexService.enqueueOwnerJob("rebuild", "knowledge_document", documentId)`
- **拆书分析**: 可将参考作品拆成结构化知识回灌到续写、规划和正文生成
- **绑定**: 知识库文档可绑定到 novel 或 world

### 2.6 Prompt 治理

**强制规则**: 所有产品级 prompt 必须定义为 `PromptAsset`，注册到 `server/src/prompting/registry.ts`。

**资产清单**: id / version / taskType / mode / language / contextPolicy / outputSchema / render()

**Runner**: `runStructuredPrompt` / `runTextPrompt` / `streamTextPrompt` / `streamStructuredPrompt`

**修复策略**: `repairPolicy`（JSON 修复）+ `semanticRetryPolicy`（语义重试）

### 2.7 AI-First 设计原则

从 `AGENTS.md` 中提取的核心约束：
- **意图识别、任务分类、规划、路由、工具选择必须以 AI 结构化理解为主实现**
- 不得用关键词匹配、正则路由、手动分支表做产品核心行为
- AI 意图识别失败应视为 AI 能力问题，不得加 fallback 匹配掩盖
- 目标用户 = 完全不懂写作的新手
- 优先解决"如何把整本书写完"，再优化"写得多精巧"

---

## 3. SillyTavern

**仓库**: `SillyTavern/SillyTavern`
**定位**: LLM 聊天前端，支持角色扮演、小说创作、知识管理

### 3.1 角色卡格式

**V2/V3 规格**: JSON 嵌入 PNG 图片的 tEXt chunk 中
- V2: keyword = `chara`，base64 编码的 JSON
- V3: keyword = `ccv3`，添加 `spec: 'chara_card_v3'`, `spec_version: '3.0'`

**核心字段**:
```json
{
  "name": "角色名",
  "description": "角色描述",
  "personality": "性格特征",
  "mes_example": "对话示例（<START> 分隔）",
  "system_prompt": "系统提示词",
  "creator_notes": "创建者笔记",
  "tags": ["标签"],
  "creator": "创建者",
  "character_version": "版本",
  "extensions": {}
}
```

**嵌入机制** (`character-card-parser.js`):
- `write()`: 将 JSON → base64 → PNG tEXt chunk（同时写入 chara + ccv3）
- `read()`: 优先读 ccv3，回退到 chara
- `parse()`: 从文件路径读取 PNG 解析角色数据

### 3.2 World Info / Lorebook 系统

**存储格式**: 独立 JSON 文件（`worlds/*.json`）

```json
{
  "name": "世界观名称",
  "entries": {
    "0": {
      "uid": 0,
      "key": ["关键词1", "关键词2"],
      "keysecondary": ["次要关键词"],
      "content": "当关键词匹配时注入的内容",
      "comment": "编辑备注",
      "enabled": true,
      "position": "before_char" | "after_char" | 0-N,
      "insertion_order": 100,
      "case_sensitive": false,
      "selective": false,
      "selectiveLogic": 0,
      "constant": false,
      "vectorized": false,
      "extensions": {}
    }
  }
}
```

**WI Entry 完整字段定义**（来自 `newWorldInfoEntryDefinition`）:

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | string[] | 主关键词数组 |
| `keysecondary` | string[] | 次要关键词 |
| `content` | string | 注入内容 |
| `comment` | string | 编辑备注 |
| `enabled` | boolean | 是否启用 |
| `position` | enum/string | 插入位置 |
| `insertion_order` | number | 插入顺序（越大越优先）|
| `disable` | boolean | 禁用标记 |
| `excludeRecursion` | boolean | 不参与递归扫描 |
| `preventRecursion` | boolean | 阻止递归 |
| `delayUntilRecursion` | number | 延迟到递归时激活 |
| `probability` | number | 激活概率 (0-100) |
| `useProbability` | boolean | 是否启用概率 |
| `depth` | number | 扫描深度（默认 4）|
| `selectiveLogic` | enum | 逻辑模式: AND_ANY/NOT_ALL/NOT_ANY/AND_ALL |
| `group` | string | 分组名 |
| `groupOverride` | boolean | 分组覆盖 |
| `groupWeight` | number | 分组权重（默认 100）|
| `scanDepth` | number? | 自定义扫描深度 |
| `caseSensitive` | boolean? | 大小写敏感 |
| `matchWholeWords` | boolean? | 全词匹配 |
| `useGroupScoring` | boolean? | 使用分组评分 |
| `matchPersonaDescription` | boolean | 扫描用户人设描述 |
| `matchCharacterDescription` | boolean | 扫描角色描述 |
| `matchCharacterPersonality` | boolean | 扫描角色性格 |
| `matchCharacterDepthPrompt` | boolean | 扫描角色深度提示 |
| `matchScenario` | boolean | 扫描场景描述 |
| `matchCreatorNotes` | boolean | 扫描创建者笔记 |
| `sticky` | number? | 粘性（持续激活的聊天轮数）|
| `cooldown` | number? | 冷却（激活后的冷却轮数）|
| `delay` | number? | 延迟（首次可激活前的轮数）|
| `constant` | boolean | 始终注入 |
| `vectorized` | boolean | 启用向量匹配 |
| `role` | enum | 角色 (0=system, 1=user, 2=assistant) |
| `automationId` | string | 自动化 ID |
| `outletName` | string | 输出口名称 |
| `characterFilterNames` | string[] | 角色过滤 |
| `characterFilterTags` | string[] | 标签过滤 |
| `triggers` | string[] | 触发类型 |

### 3.3 World Info 扫描机制

**`WorldInfoBuffer` 类**:
- `#depthBuffer[]`: 按深度排列的消息数组
- `#recurseBuffer[]`: 递归扫描新增的消息
- `#injectBuffer[]`: 提示注入的消息
- `#globalScanData`: 聊天无关的扫描数据（人设、角色描述等）

**扫描流程**:
1. 从最新消息向历史扫描 `scanDepth` 条消息
2. 对每个 WI 条目的关键词在缓冲区中匹配
3. 支持正则匹配、全词匹配、大小写敏感
4. 选择性激活：主关键词 + 次关键词通过 AND/NOT 逻辑组合
5. 递归扫描：已激活条目的内容加入递归缓冲区，触发更多匹配
6. 最小激活：`min_activations` 参数确保最少激活数
7. 分组评分：`groupWeight` 控制同组内的优先级

**插入策略** (`world_info_insertion_strategy`):
- `evenly` (0): 均匀分布
- `character_first` (1): 角色关联优先
- `global_first` (2): 全局优先

**上下文注入位置**: `worldInfoBefore`（角色卡前）/ `worldInfoAfter`（角色卡后）

### 3.4 上下文管理（PromptManager）

SillyTavern 的 PromptManager 管理发送给 LLM 的完整提示结构：
- 拖拽排序界面定义 prompt 顺序
- 支持 In-Chat 位置注入（定义深度和顺序）
- 绝对位置 vs 相对位置模式
- World Info 分为 `worldInfoBefore` 和 `worldInfoAfter` 两个注入点

### 3.5 扩展架构

**扩展系统**: 基于 `extensions/` 目录，每个扩展独立 JS 模块。

**关键扩展类别**:
- **TTS**: 20+ 引擎（OpenAI/ElevenLabs/Kokoro/Coqui 等）
- **向量化**: `extensions/vectors/index.js` — 支持 WebLLM 本地嵌入
- **正则引擎**: `extensions/regex/engine.js` — 文本变换
- **画廊**: `extensions/gallery/`

**StoryMode 扩展**（第三方: `Prompt-And-Circumstance/StoryMode`）:
- 将 SillyTavern 变成结构化创作工具
- 支持: 蓝图(Blueprints)、场景(Scenes)、角色管理、作者风格、故事类型
- 架构模块: arc-history, content, drag, events, popups, sections, structure, summary
- 蓝图系统: prompts.js, settings-sync.js, startup.js, types.js
- 设置: settings-blueprint.js, settings-library.js, settings-pacing.js
- 角色: character-injection.js, character-handlers.js, discovery.js, linker.js

**Pathweaver 扩展**（第三方: `mattjaybe/SillyTavern-Pathweaver`）:
- 将故事和角色扮演变成冒险游戏
- AI 驱动的故事建议
- 分支路径探索

**Choices! 扩展**:
- CYOA 风格故事建议
- 每条消息后自动生成可点击的故事选项
- 支持 World Info/Author's Note 上下文

---

## 4. NovelCrafter Codex

**来源**: NovelCrafter 官方文档 + 课程

### 4.1 系统定位

Codex = NovelCrafter 的 **故事圣经 & 世界构建器**，是 AI 写作的长期记忆系统。

### 4.2 核心功能

| 功能 | 说明 |
|------|------|
| **无限条目** | 无限制创建角色/地点/物品/自定义分类条目 |
| **自动提及索引** | 自动扫描手稿，索引每个角色/地点/物品的所有出现位置 |
| **跨文档追踪** | 在手稿、聊天、片段中追踪元素出现 |
| **进度时间线** | 记录角色状态变化（外貌/成长/联盟的时间线）|
| **自定义分类** | 自定义 Codex 类别和标签 |
| **颜色编码** | 视觉分类管理 |
| **图片支持** | 条目可附加参考图片 |
| **预览卡片** | 悬浮预览条目详情 |

### 4.3 Relations 系统

**核心机制**: 建立条目间的引用关系，实现**自动上下文注入**。

```
"银木森林" → 关联 → "精灵部落"
"精灵部落" → 关联 → "艾丽西亚"
```

当某个条目被提及时，所有关联条目**自动**进入 AI 上下文，无需手动添加引用。

**使用场景**:
- "演员阵容"条目关联所有角色 → 一次提及唤起全部角色
- 地点关联控制势力 → 提及地点自动带入势力信息

### 4.4 Scene Context 系统

**机制**: 将 Codex 条目直接附加到场景摘要，作为 beat 补全的上下文。

**适用场景**:
- 条目在场景中重要但不适合在 beat 中逐个提及
- 场景内角色动态需要 AI 记住但不是直接叙述的
- 需要持续可用的背景信息

### 4.5 与我们系统的关联

NovelCrafter 的 Codex 设计启示：
- **自动提及扫描** = 类似 SillyTavern 的关键词匹配但更智能
- **Relations 自动注入** = 我们系统的知识图谱自动上下文
- **Scene Context** = 按场景粒度控制注入内容
- **进度时间线** = 角色状态的时间演化追踪

---

## 5. WHAT-IF 论文

**论文**: "WHAT-IF: Exploring Branching Narratives by Meta-Prompting Large Language Models"
**来源**: arxiv 2412.10582, Georgia Institute of Technology
**会议**: WordPlay Workshop

### 5.1 系统概述

WHAT-IF（Writing a Hero's Alternate Timeline through Interactive Fiction）使用**零样本元提示（zero-shot meta-prompting）** 从线性故事生成分支叙事，创建交互式小说（IF）游戏。

### 5.2 核心方法

**输入**: 现有的线性故事（如《钢铁侠》剧情）

**处理阶段**:

#### 阶段 1: 分支情节树构建

每个节点包含:
```json
{
  "state": "角色当前状态",
  "goal": "角色当前目标",
  "decision": "原故事的关键决定 (KD)",
  "edgeEvents": ["决定导致的事件序列"],
  "alternate_decision": "假设的替代决定 (AD)"
}
```

**示例**（钢铁侠）:
- `node_1.state`: "Tony Stark is a wealthy genius who manufactures weapons."
- `node_1.decision`: "Tony decides to go to Afghanistan for the demonstration."
- `node_1.alternate_decision`: "Tony decides to send a representative while monitoring from the US."

#### 阶段 2: 元提示（Meta-Prompting）

- LLM 被提示考虑故事的主要情节点
- 每个节点基于之前的状态和目标生成
- 分支从每个关键决策点生长
- 交替决策（AD）产生新的分支路径

#### 阶段 3: 叙事生成

- 使用生成的事件为每个决策点创建叙述文本
- 保持角色目标和状态的一致性

#### 阶段 4: 交互式小说呈现

- 分支情节树存储在图结构中
- 玩家在决策点选择路径
- 系统追踪当前位置并提供上下文

### 5.3 关键技术贡献

1. **零样本元提示**: 不需要训练数据或示例，直接用 LLM 从线性故事推导分支
2. **图结构存储**: 分支树作为图维护，既用于提示追踪又用于 IF 系统结构
3. **状态-目标-决策模型**: 每个节点明确建模角色状态、目标和关键决策
4. **交替决策生成**: 自动生成"如果角色做了不同选择"的替代路径

### 5.4 局限性

- 依赖 LLM 的推理能力，分支质量受模型限制
- 线性→分支的转化可能丢失原故事的微妙之处
- 长故事的一致性维护仍有挑战

---

## 6. 跨项目对比与设计启示

### 6.1 分支机制对比

| 特性 | FictionX | WHAT-IF | SillyTavern Pathweaver/Choices |
|------|----------|---------|-------------------------------|
| 分支类型 | 大纲树（多层） | 情节树（双路径） | 消息级 CYOA |
| 分支来源 | LLM 生成 | 元提示推导 | 用户选择 |
| 一致性维护 | Beam Search + 评分 | 状态-目标建模 | World Info 注入 |
| 粒度 | 叶子节点=段落 | 节点=决策点 | 消息=对话回合 |
| 无限扩展 | `extend_by_last_node` | 有限深度 | 用户驱动 |

### 6.2 世界观/知识管理对比

| 特性 | FictionX | AI-Novel-Assistant | SillyTavern | NovelCrafter |
|------|----------|-------------------|-------------|-------------|
| 存储 | JSON 文件 | Prisma + Qdrant | JSON 文件 + 向量 | 云服务 |
| 结构化 | Setting + EntityList | 5层架构 | WI 条目 | Codex 条目 |
| 注入方式 | Prompt 拼接 | 风格 Contract + RAG | 关键词扫描 | 自动提及 + Relations |
| 关系建模 | 无 | 势力/地点/要素关系 | 无 | Relations 图 |
| 触发机制 | 手动 | AI 路由 | 关键词/正则/向量 | 文本扫描 |

### 6.3 写法/风格控制对比

| 特性 | FictionX | AI-Novel-Assistant | SillyTavern |
|------|----------|-------------------|-------------|
| 风格控制 | 无显式机制 | **写法引擎（4维规则 + 反AI + 编译器）** | System Prompt |
| 分层绑定 | 无 | 全书/卷/章/角色/任务 | 无 |
| 检测修正 | 评分 Agent | AI味检测 + 自动修正 | 无 |
| 模板系统 | 无 | 8种内置写法模板 | 无 |

### 6.4 Agent 运行时对比

| 特性 | FictionX | AI-Novel-Assistant |
|------|----------|-------------------|
| Agent 模型 | 3 个固定 Agent | Director + Worker + Runtime |
| 任务队列 | 无 | TaskDispatcher + DirectorTaskQueue |
| 检查点 | 无 | 支持恢复 |
| Prompt 治理 | JSON 模板 + LangChain PromptTemplate | PromptAsset Registry + 修复策略 |
| 多模型路由 | 切换 server_type | 按任务类型路由 |

### 6.5 对我们 Fanfic 平台的设计启示

#### A. 大纲树 + 分支机制

**推荐**: 结合 FictionX 的大纲树结构 + WHAT-IF 的状态-目标建模

```
Fanfic 大纲树:
- 根节点 = 原作设定
- depth=1 = 故事方向（多个 what-if 方向）
- depth=2 = 关键转折点
- depth=3 = 具体场景/事件
- 每个节点: text + scene + characters + state + goal + decision
```

#### B. 知识管理

**推荐**: 采纳 NovelCrafter 的 Relations 思路 + SillyTavern 的扫描机制

```
知识层:
1. 原作知识库（RAG 向量化）
2. 角色卡（SillyTavern V3 格式兼容）
3. World Info 条目（关键词触发）
4. Codex 关系图（自动上下文注入）
```

#### C. 写法控制

**推荐**: 采纳 AI-Novel-Assistant 的写法引擎设计

```
写法资产:
- 叙事规则 / 人物表达 / 语言风格 / 节奏控制
- 反 AI 规则库
- 分层绑定（全书/卷/章/角色视角）
- 编译为 Prompt Contract 注入生成
```

#### D. 上下文管理

**推荐**: 分层注入策略

```
System Prompt
  ├── World Rules（AI-Novel-Assistant 世界规则层）
  ├── Style Contract（写法引擎编译输出）
  ├── Active Lorebook（SillyTavern WI 扫描结果）
  ├── Character Cards（当前场景角色卡）
  ├── Story State（FictionX 大纲树当前路径）
  └── RAG Context（相关原作片段）
```

#### E. 生成流程

**推荐**: AI-Novel-Assistant 的全链路 + FictionX 的 Beam Search

```
用户输入灵感
  → AI 导演: 生成多套方向方案
  → 用户选择 / AI 推荐
  → 大纲树构建（FictionX 风格 + WHAT-IF 分支）
  → 角色准备（角色卡 + 关系图）
  → 章节拆分 + 节奏规划
  → 逐章生成: Beam Search 多候选 + 评分选择
  → 质量修复: 反 AI 检测 + 风格修正
  → 回灌: 更新大纲树状态 + 角色进度
```

---

## 附录：关键文件索引

### FictionX
- `storygenv1/plan/outline.py` — 大纲树节点实现
- `storygenv1/plan/plan_writer.py` — 大纲生成器（角色+大纲+场景+实体检测）
- `storygenv1/story/story_writer.py` — Beam Search 内容生成 + 多维评分
- `storygenv1/common/llm/llm.py` — LLM 客户端（OpenAI/vLLM/Together）
- `storygenv1/common/llm/prompt.py` — Prompt 模板系统

### AI-Novel-Writing-Assistant
- `server/src/services/novel/director/README.md` — 导演子系统架构
- `server/src/services/styleEngine/StyleCompiler.ts` — 写法编译器
- `server/src/services/styleEngine/styleContractText.ts` — Contract 文本生成
- `server/src/services/knowledge/KnowledgeService.ts` — 知识库服务
- `server/src/prompting/README.md` — Prompt 治理规范
- `docs/design/style-engine-v1.md` — 写法引擎设计文档
- `docs/design/world-management-v2.md` — 世界观管理设计文档

### SillyTavern
- `public/scripts/world-info.js` — World Info 核心逻辑（6289行）
- `src/endpoints/worldinfo.js` — WI 后端 API
- `src/character-card-parser.js` — 角色卡 PNG 嵌入解析
- `public/scripts/PromptManager.js` — 提示管理器
