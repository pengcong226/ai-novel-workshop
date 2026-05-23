# AutoNovel + BookWorld 深度技术分析报告

> **AutoNovel 仓库**: https://github.com/NousResearch/autonovel
> **BookWorld 论文**: arxiv 2504.14538 — "BookWorld: From Novels to Interactive Agent Societies for Creative Story Generation"
> **分析时间**: 2026年5月

---

## 第一部分：AutoNovel 全自动小说生产管线

### 一、项目概述

AutoNovel 是 NousResearch 开发的**全自动小说生产管线**——从一个种子概念（seed concept）到印刷级 PDF、ePub、有声书和落地页，全部由 AI agent 自动完成。灵感来自 Karpathy 的 `autoresearch`：同样的「修改→评估→保留/丢弃」循环，应用于小说创作。

**首部成品小说**：*The Second Son of the House of Bells* — 19章，79,456字。

### 二、五层共进架构

AutoNovel 的核心设计思想是**五层共进**（five co-evolving layers）：

```
Layer 5:  voice.md          — HOW we write （声音/风格）
Layer 4:  world.md          — WHAT exists  （世界观）
Layer 3:  characters.md     — WHO acts     （角色）
Layer 2:  outline.md        — WHAT HAPPENS （大纲/情节）
Layer 1:  chapters/ch_NN.md — THE ACTUAL PROSE （正文）
横切层:   canon.md          — WHAT IS TRUE （硬事实数据库）
```

**关键设计**：变更双向传播——向下（世界观改动→大纲改动→章节修订）和向上（写作暴露缺口→更新世界观→检查下游）。`state.json` 追踪传播债务（propagation debts）。

### 三、四阶段管线

#### Phase 1: Foundation（基础构建）

**输入**: `seed.txt`
**输出**: `world.md`, `characters.md`, `outline.md`, `voice.md`, `canon.md`, `MYSTERY.md`
**退出条件**: `foundation_score > 7.5` AND `lore_score > 7.0`

循环过程：
1. `gen_world.py` → 世界观圣经
2. `gen_characters.py` → 角色注册表
3. `gen_outline.py` → 大纲（第一部分：节拍与结构）
4. `gen_outline_part2.py` → 伏笔账本
5. 声音发现：5段试写→选择最佳→填充 voice.md
6. 定义 MYSTERY.md（中心谜题，仅作者可见）
7. `gen_canon.py` → 交叉引用硬事实
8. `evaluate.py --phase=foundation` → 评估
9. 分数改进→git commit；否则→git reset

**关键数据**：基础阶段通常需要 5-15 次迭代，评估器权重中 lore_interconnection 占 40%。

#### Phase 2: First Draft（初稿）

**输入**: 所有基础文档
**输出**: `chapters/ch_01.md` 到 `ch_NN.md`
**退出条件**: 所有章节 `score > 6.0`

每章流程：
1. 加载上下文窗口（voice.md 全文 + world.md 全文 + characters.md 全文 + 本章大纲 + 前章尾部 ~1000 字 + 下章大纲）
2. `draft_chapter.py` → 生成章节
3. `evaluate.py --chapter=N` → 评估
4. 分数 > 6.0 → 保留并 commit；否则 → 丢弃重试（最多 5 次）
5. 从评估输出中提取新 canon 条目
6. 记录到 `results.tsv`

#### Phase 3: Revision（修订）

这是质量真正提升的阶段。3-6 个循环，每个有特定焦点。

**Cycle 1: 基线与诊断**
- `adversarial_edit.py all` → 对抗性编辑分析
- `compare_chapters.py` → Elo 排名锦标赛
- `apply_cuts.py` → 机械性删减（OVER-EXPLAIN + REDUNDANT 约占 55-60%）
- `reader_panel.py` → 4 人设读者面板评估

**Cycle 2-3: 结构性修订**
- 根据读者面板共识（3/4 或 4/4 同意）进行：
  - CUT CANDIDATE → 压缩简报 → `gen_revision.py`
  - MISSING SCENE → 扩展简报
  - THIN CHARACTER → 深化现有场景
  - WEAK SCENE → 戏剧化简报
  - CONSISTENCY/TIMELINE → 修复矛盾

**Cycle 4-5: 针对性改进**
- 节奏曲线修复
- 过短章节扩展
- 跨章重复短语消除
- 未解决伏笔补完

**Cycle 6: 抛光**
- 最终对抗性编辑
- 机械性 slop 扫描
- 最终读者面板验证

**Phase 3b: Opus 审查循环**

自动化修订后，交给 Claude Opus 进行**双人设审查**：

> "先以文学评论家身份审查，再以小说教授身份审查。对发现的缺陷给出具体、可操作的建议。"

停止条件：
- 无重大未限定项
- 超过 50% 的项为限定/对冲
- 发现 ≤2 个项

#### Phase 4: Export（导出）

- 章节标题规范化
- LaTeX 排版（EB Garamond，商业平装本规格）
- 艺术品生成（linocut 封面 + 木刻章节装饰）
- 有声书脚本生成（多角色语音）
- ePub 构建
- 落地页生成

### 四、27 个 Python 工具详解

#### 4.1 基础工具（7个）

| 工具 | 功能 | 输入 | 输出 | 模型 |
|------|------|------|------|------|
| `seed.py` | 生成种子概念 | 命令行参数 | 10 个概念方案 | Sonnet 4.6 (temp=1.0) |
| `gen_world.py` | 生成世界圣经 | seed.txt + voice.md | world.md | Sonnet 4.6 (temp=0.7) |
| `gen_characters.py` | 生成角色注册表 | seed + world + voice | characters.md | Sonnet 4.6 (temp=0.7) |
| `gen_outline.py` | 生成大纲（含节拍） | seed + world + chars + mystery + craft | outline.md (Part 1) | Sonnet 4.6 (temp=0.5) |
| `gen_outline_part2.py` | 伏笔账本 | outline + chars | outline.md (Part 2) | Sonnet 4.6 |
| `gen_canon.py` | 交叉引用硬事实 | world + chars | canon.md | Sonnet 4.6 |
| `voice_fingerprint.py` | 声音发现与指纹 | 试写段落 | voice.md Part 2 | Sonnet 4.6 |

#### 4.2 起草工具（2个）

| 工具 | 功能 | 关键设计 |
|------|------|---------|
| `draft_chapter.py` | 写单章 | 加载 voice + world + chars + outline + canon + 前章尾部 + 下章大纲；24 条反模式规则；temp=0.8 |
| `run_drafts.py` | 批量顺序起草 | 自动按顺序起草所有章节 |

#### 4.3 评估工具（5个）

| 工具 | 功能 | 特色 |
|------|------|------|
| `evaluate.py` | 机械 slop 评分 + LLM 裁判 | **双免疫系统**：① 机械检测（无 LLM）② LLM 裁判（Opus 4.6） |
| `adversarial_edit.py` | "砍 500 字"分析 | 6 类切割分类：FAT / REDUNDANT / OVER-EXPLAIN / GENERIC / TELL / STRUCTURAL |
| `compare_chapters.py` | 章节间 Elo 锦标赛 | 头对头比较，生成排名 |
| `reader_panel.py` | 4 人设小说级评估 | 编辑/类型读者/作家/普通读者，10 个问题维度 |
| `review.py` | Opus 双人设深度审查 | 文学评论家 + 小说教授，含停止条件解析 |

#### 4.4 修订工具（4个）

| 工具 | 功能 | 关键设计 |
|------|------|---------|
| `gen_brief.py` | 自动生成修订简报 | 3 种输入模式：--panel / --eval / --cuts / --auto |
| `gen_revision.py` | 根据简报重写章节 | 加载简报 + voice + chars + world + 相邻章 + 原稿 |
| `apply_cuts.py` | 批量对抗性切割 | 按类型过滤（OVER-EXPLAIN / REDUNDANT），报价匹配删除 |
| `build_arc_summary.py` | 重建弧线摘要 | 从章节文件重新生成 arc_summary.md |

#### 4.5 艺术与封面工具（4个）

| 工具 | 功能 |
|------|------|
| `gen_art.py` | 完整艺术管线：风格推导 → 封面变体生成 → 章节装饰 → 矢量化 |
| `gen_art_directions.py` | 生成多样艺术方向供筛选 |
| `gen_cover_composite.py` | 封面文字叠加 |
| `gen_cover_print.py` | 印刷级全包裹封面（Lulu/KDP 规格） |

#### 4.6 有声书工具（2个）

| 工具 | 功能 |
|------|------|
| `gen_audiobook_script.py` | 解析章节为说话者归属脚本 |
| `gen_audiobook.py` | 通过 ElevenLabs 生成多语音频 |

#### 4.7 编排工具（3个）

| 工具 | 功能 |
|------|------|
| `run_pipeline.py` | **全自动管线编排器** |
| `build_arc_summary.py` | 从章节重建弧线摘要 |
| `build_outline.py` | 从章节重建大纲 |

### 五、机械 slop 检测系统 (`evaluate.py`)

AutoNovel 最精巧的设计之一是其**无 LLM 的机械检测系统**：

#### 5.1 三级禁词检测

**Tier 1: 禁杀词**（命中即扣分）
```
delve, utilize, leverage, facilitate, elucidate, embark, endeavor,
encompass, multifaceted, tapestry, paradigm, synergy, holistic,
catalyze, juxtapose, myriad, plethora
```

**Tier 2: 可疑词**（单个 OK，一段中 3 个以上则标记）
```
robust, comprehensive, seamless, cutting-edge, innovative, streamline,
empower, foster, enhance, elevate, optimize, pivotal, intricate,
profound, resonate, underscore, harness, cultivate, bolster, galvanize
```

**Tier 3: 填充短语**（正则匹配，直接删除）
```
"It's worth noting that", "It's important to note that",
"Let's dive into", "Not just X, but Y" ...
```

#### 5.2 小说专属 AI 痕迹检测

```python
FICTION_AI_TELLS = [
    r"a sense of \w+",
    r"couldn't help but feel",
    r"the weight of \w+",
    r"the air was thick with",
    r"eyes widened",
    r"a wave of \w+ washed over",
    r"heart pounded in (?:his|her|their) chest",
    r"(?:raven|dark|golden|silver) (?:hair|tresses) (?:spilled|cascaded)",
    r"piercing (?:blue|green|gray) eyes",
    r"a knowing (?:smile|grin|look|glance)",
]
```

#### 5.3 结构性 AI 模式检测

```python
STRUCTURAL_AI_TICS = [
    r"I'm not saying .{3,40}I'm saying",  # "我不是说X。我是说Y"
    r"Not just .{3,40}, but",               # "不仅仅是X，而是Y"
    r"There's a difference\.",               # 公式化收尾
    r"Those are different things\.",         # 公式化收尾
]
```

#### 5.4 Show-don't-tell 检测

```python
TELLING_PATTERNS = [
    r"(?:he|she|they) (?:felt|was|seemed) (?:angry|sad|happy|scared|nervous...)",
    r"(?:angrily|sadly|happily|nervously|excitedly|desperately...)"
]
```

#### 5.5 综合惩罚算法

```python
penalty = 0.0
penalty += min(tier1_hits * 1.5, 4.0)       # Tier1: 最多 4 分
penalty += min(tier2_clusters * 1.0, 2.0)    # Tier2 聚类: 最多 2 分
penalty += min(tier3_count * 0.3, 2.0)       # Tier3: 最多 2 分
if em_dash_density > 15:                      # 破折号密度
    penalty += min((density - 15) * 0.3, 1.0)
if sentence_length_cv < 0.3:                  # 句长均匀度（越低越机械）
    penalty += 1.0
penalty += min(fiction_tells * 0.3, 2.0)      # 小说 AI 痕迹
penalty += min(telling_count * 0.2, 1.5)      # Show-don't-tell
penalty += min(structural_tics * 0.5, 2.0)    # 结构性模式
penalty = min(penalty, 10.0)                   # 上限 10 分
```

### 六、读者面板系统 (`reader_panel.py`)

4 个完全不同的人设评估同一部小说：

| 人设 | 视角 | 关注点 |
|------|------|--------|
| **The Editor** | 资深编辑 | 文本质感、潜台词、句子级工艺、声音一致性 |
| **The Genre Reader** | 狂热类型读者 | 节奏、谜题、世界观回报、翻页欲 |
| **The Writer** | 出版作家 | 结构、伏笔、角色弧线、技巧与故事的差距 |
| **The First Reader** | 普通读者 | 情感体验、直觉反应、不使用术语 |

**10 个评估维度**：
1. `momentum_loss` — 故事在哪里失去动力？
2. `earned_ending` — 结局是否被前文充分铺垫？
3. `cut_candidate` — 如果必须缩短 10%，先砍哪里？
4. `missing_scene` — 小说需要但缺少的场景？
5. `thinnest_character` — 最单薄的角色？
6. `best_scene` — 最好的场景？
7. `worst_scene` — 最弱的场景？
8. `would_recommend` — 会推荐吗？
9. `haunts_you` — 读后萦绕的台词或瞬间？
10. `next_book` — 会读作者下一本书吗？

**共识发现**：自动识别 3/4 或 4/4 读者同意的问题，作为修订优先级。

### 七、Opus 审查循环 (`review.py`)

发送全稿给 Claude Opus 进行双人设审查：

```python
REVIEW_PROMPT = """Read the below novel, "{title}". Review it first as a literary
critic (like a newspaper book review) and then as a professor of fiction. In the
later review, give specific, actionable suggestions for any defects you find. Be
fair but honest. You don't *have* to find defects."""
```

**解析与停止判断**：
- 提取星级评分
- 解析教授审查的每个项：严重程度（major/moderate/minor）、类型（compression/addition/mechanical/structural）、是否限定/对冲
- 停止条件：
  - ★★★★½ 且无重大项
  - ★★★★ 且 >50% 项为限定
  - ≤2 个项

### 八、反模式与写作规则系统

#### 8.1 voice.md Part 1: 护栏（永久，所有小说通用）

**Tier 1 禁词替换表**（完整版）：

| 禁用 | 替代 |
|------|------|
| delve | dig into, examine |
| utilize | use |
| leverage (动词) | use, take advantage of |
| tapestry | (描述实际事物) |
| nuanced (填充) | (删除——如果有 nuance，展示出来) |
| realm | area, field |
| landscape (隐喻) | field, space, situation |

**结构性 slop 模式**：
- 段落模板机：禁止重复「主题句→展开→例子→总结」结构
- 句长均匀性：每句 15-25 字 = 人工合成感
- 过渡词瘾：连续段落以 However/Furthermore/Additionally 开头 = 重写
- 对称瘾：不要三个优点、三个缺点、五个步骤——真实写作是凹凸不平的
- 破折号过载：每页 1-2 个 OK，每段 5 个 = 痕迹

#### 8.2 CRAFT.md: 创作教育

包含 8 大创作框架：
1. **Save the Cat Beat Sheet** — 15 个百分比标记节拍
2. **Dan Harmon Story Circle** — 8 步故事圈
3. **Sanderson 三定律** — 魔法系统设计
4. **Wound/Want/Need/Lie** — 角色心理因果链
5. **对话独特性** — 8 维度可测量
6. **Show Don't Tell** — 可操作定义
7. **稳定性陷阱** — AI 最差倾向及对策
8. **评估标准** — 各维度评分细则

#### 8.3 ANTI-SLOP.md + ANTI-PATTERNS.md

- `ANTI-SLOP.md`：词级 AI 痕迹检测规则
- `ANTI-PATTERNS.md`：结构级 AI 模式检测规则

### 九、管线编排器 (`run_pipeline.py`)

全自动编排器，管理状态、git 提交、评估和重试逻辑：

```python
# 关键常量
FOUNDATION_THRESHOLD = 7.5    # 基础阶段退出分数
CHAPTER_THRESHOLD = 6.0       # 章节保留分数
MAX_FOUNDATION_ITERS = 20     # 基础最大迭代
MAX_CHAPTER_ATTEMPTS = 5      # 章节最大重试
MIN_REVISION_CYCLES = 3       # 最少修订循环
MAX_REVISION_CYCLES = 6       # 最多修订循环
PLATEAU_DELTA = 0.3           # 分数高原阈值
```

**状态管理** (`state.json`)：
```json
{
  "phase": "foundation|drafting|revision|export",
  "current_focus": "planning|chapter_drafting|full_novel",
  "iteration": 5,
  "foundation_score": 7.8,
  "lore_score": 7.2,
  "chapters_drafted": 12,
  "chapters_total": 24,
  "novel_score": 7.5,
  "revision_cycle": 2,
  "debts": ["ch07_voice_drift", "canon_date_mismatch"]
}
```

**Git 集成**：每个决策点自动 commit，分数下降时 `git reset --hard` 回滚。

### 十、API 调用架构

所有工具统一使用 Anthropic Messages API（非 OpenAI 格式）：

```python
def call_writer(prompt, max_tokens=16000):
    headers = {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "context-1m-2025-08-07",  # 1M 上下文窗口
        "content-type": "application/json",
    }
    payload = {
        "model": WRITER_MODEL,       # 默认 claude-sonnet-4-6
        "max_tokens": max_tokens,
        "temperature": 0.7,          # 起草用 0.8，评估用 0.3
        "system": SYSTEM_PROMPT,     # 每个工具有专属系统提示
        "messages": [{"role": "user", "content": prompt}],
    }
```

**模型分工**：
- **写作** (Sonnet 4.6): 快速、长上下文、高产出
- **评估** (Opus 4.6): 严格、批判性、精确
- **审查** (Opus 4.6): 最佳文学分析能力

关键：写作和评估使用**不同模型**，避免自我祝贺（self-congratulation）。

### 十一、时间线与成本

| 阶段 | API 时间 | 说明 |
|------|---------|------|
| Phase 1 (Foundation) | 2-4 小时 | 5-15 次迭代 |
| Phase 2 (First Draft) | 8-16 小时 | 23-30 章 |
| Phase 3 (Revision) | 4-8 小时 | 3-6 循环 |
| Phase 4 (Export) | 30 分钟 | 排版 + 艺术 |
| **总计** | **~15-30 小时** | **75k 字小说** |

---

## 第二部分：BookWorld 论文分析

### 一、论文概述

**标题**: BookWorld: From Novels to Interactive Agent Societies for Creative Story Generation
**作者**: Ran Wang, Zhongjiang Wang, Yuxuan Chen, et al.
**机构**: 包含 LLM 和多智能体系统领域的研究者
**arxiv**: 2504.14538

### 二、核心问题

BookWorld 试图解决一个关键问题：**如何从小说文本自动构建可交互的多智能体社会**，用于创意故事生成。

传统方法的局限：
- 角色模拟依赖人工编写的 profile
- 世界观设定需要手动编码
- 角色间的社会关系需要人工定义

### 三、系统架构

BookWorld 的架构分为三个核心阶段：

#### 3.1 小说解析阶段 (Novel Parsing)

从原始小说文本中自动提取：

```
原始小说文本
    │
    ├── 角色提取 (Character Extraction)
    │   ├── 姓名识别
    │   ├── 性格特征分析
    │   ├── 行为模式识别
    │   ├── 关系网络构建
    │   └── 对话风格分析
    │
    ├── 世界观提取 (Worldview Extraction)
    │   ├── 地理空间信息
    │   ├── 社会制度
    │   ├── 文化习俗
    │   └── 历史背景
    │
    ├── 事件提取 (Event Extraction)
    │   ├── 情节事件时间线
    │   ├── 因果关系链
    │   └── 冲突结构
    │
    └── 地理空间图构建 (Geospatial Map)
        ├── 地点识别
        ├── 地点间关系
        └── 空间层次结构
```

#### 3.2 智能体构建阶段 (Agent Construction)

将提取的信息转化为多智能体系统：

- **角色智能体 (Role Agents)**：每个角色一个 agent，加载性格、记忆、目标、关系
- **世界智能体 (World Agent)**：环境管理、大纲处理、事件生成

#### 3.3 模拟阶段 (Simulation)

以场景为单位推进模拟：
- 角色智能体进行交互（工作、交流、交易）
- 世界智能体处理环境响应
- 根据世界观设定生成交互结果
- 根据用户设置生成冲突性事件

### 四、角色提取方法

BookWorld 的角色提取包含多个层次：

#### 4.1 角色属性提取

```json
{
  "name": "角色姓名",
  "personality": "性格特征描述",
  "background": "背景故事",
  "goals": ["目标1", "目标2"],
  "relationships": {
    "角色B": "关系类型和描述",
    "角色C": "关系类型和描述"
  },
  "speech_style": "对话风格",
  "behavior_patterns": ["行为模式1", "行为模式2"],
  "skills": ["技能1", "技能2"],
  "secrets": ["秘密1"]
}
```

#### 4.2 角色关系网络

自动构建角色间的关系图谱：
- 正向关系：盟友、家人、朋友
- 负向关系：敌人、竞争者
- 复杂关系：亦敌亦友、隐藏关系
- 关系强度量化

#### 4.3 角色记忆系统

每个角色 agent 维护：
- **短期记忆**：最近的交互事件
- **长期记忆**：重要的人生事件
- **情感状态**：当前对其他角色的情感
- **目标追踪**：当前正在追求的目标

### 五、世界智能体 (World Agent)

世界智能体是 BookWorld 的核心创新之一，处理角色交互之外的所有任务：

#### 5.1 环境管理

当角色与环境交互时，世界智能体根据世界观设定和当前位置信息生成结果。

#### 5.2 事件刺激

根据用户设置，世界智能体生成冲突性事件：
- 基于背景设定
- 根据角色实时行动更新
- 确保事件与世界观一致

#### 5.3 大纲处理

世界智能体处理故事大纲：
- 将大纲分解为场景
- 追踪大纲完成进度
- 确保模拟按大纲推进

### 六、多智能体模拟

#### 6.1 场景级模拟

模拟以场景为单位推进：

```
场景初始化
    ↓
角色 agent 加载场景上下文
    ↓
角色间交互（对话、行动）
    ↓
世界 agent 生成环境响应
    ↓
事件更新和冲突插入
    ↓
场景结束，更新状态
    ↓
下一场景
```

#### 6.2 角色自主性

角色 agent 具有自主决策能力：
- 根据性格选择行动
- 基于记忆调整策略
- 根据关系动态反应
- 追求自身目标

#### 6.3 一致性维护

- 角色行为必须符合性格设定
- 对话必须符合角色的说话风格
- 事件必须符合世界观规则
- 时间线必须保持连贯

### 七、与 AutoNovel 的互补关系

| 维度 | AutoNovel | BookWorld |
|------|-----------|-----------|
| **核心方法** | 管线式顺序生成 | 多智能体模拟 |
| **角色模型** | Wound/Want/Need/Lie 手工框架 | 从小说自动提取 + agent 自主行为 |
| **世界观** | 手工构建 world.md | 从文本自动提取 |
| **故事生成** | 按大纲逐章写作 | 角色模拟自然涌现 |
| **一致性** | canon.md 硬事实数据库 | 规则引擎 + 世界 agent 约束 |
| **评估** | 机械检测 + LLM 裁判 + 读者面板 | 模拟结果自然评估 |
| **适用场景** | 从零创作完整小说 | 基于已有作品的扩展/改写 |

### 八、对 Fanfic 平台的启示

#### 8.1 可借鉴的 BookWorld 技术

1. **角色自动提取**：从原著小说自动提取角色属性，作为 fanfic 创作的基础
2. **关系网络构建**：自动分析角色间关系，确保 fanfic 中的关系一致性
3. **世界 agent 概念**：用独立 agent 管理世界观一致性
4. **场景级模拟**：以场景为单位推进故事，比逐字生成更自然
5. **记忆系统**：角色记忆确保行为连贯

#### 8.2 可借鉴的 AutoNovel 技术

1. **五层共进架构**：voice/world/characters/outline/chapters 协同演化
2. **机械 slop 检测**：无 LLM 的 AI 痕迹检测系统
3. **读者面板**：多人设评估系统
4. **修订简报系统**：从评估反馈自动生成修订指令
5. **反模式规则库**：24 条具体可执行的写作规则
6. **canon.md 数据库**：硬事实的一致性追踪

#### 8.3 建议的融合架构

```
Fanfic 创作平台融合架构
─────────────────────────────────────────

原著解析层 (from BookWorld)
├── 角色自动提取 → 角色注册表
├── 世界观自动提取 → 世界圣经
├── 关系网络构建 → 关系图谱
└── 地理空间图 → 地图数据

创作规划层 (from AutoNovel)
├── 五层共进架构
├── 声音发现系统
├── 大纲生成（Save the Cat + 伏笔账本）
└── canon.md 硬事实数据库

写作执行层 (融合)
├── 章节生成（上下文窗口管理）
├── 角色对话（基于关系网络 + 说话风格）
├── 世界观一致性检查（世界 agent）
└── 流式输出 + 实时预览

质量保证层 (from AutoNovel)
├── 机械 slop 检测（三级禁词 + AI 痕迹）
├── LLM 评估（写作/评估使用不同模型）
├── 读者面板（多人设评估）
└── 修订简报自动生成

用户交互层 (from 91Writing)
├── Vue 3 + Element Plus UI
├── 提示词变量系统
├── 章节管理三态模型
└── Token 计费管理
```

---

## 第三部分：关键设计模式总结

### 一、上下文窗口管理

| 方案 | 来源 | 适用场景 |
|------|------|---------|
| `slice(-500)` | 91Writing | 简单原型 |
| voice + world + chars 全文 + 前章尾部 2000 字 + 下章大纲 | AutoNovel | 高质量创作 |
| 场景上下文 + 角色记忆 + 世界观 + 关系状态 | BookWorld | 交互式模拟 |
| 语义检索 + 滑动窗口 + 选择性加载 | 建议方案 | Fanfic 平台 |

### 二、一致性保证

| 方案 | 来源 | 机制 |
|------|------|------|
| 无 | 91Writing | 依赖用户记忆 |
| canon.md 硬事实数据库 | AutoNovel | 交叉引用 + 评估检查 |
| 世界 agent 规则引擎 | BookWorld | 实时一致性约束 |
| canon + 世界 agent + 评估三重保障 | 建议方案 | 多层防御 |

### 三、质量评估

| 方案 | 来源 | 维度 |
|------|------|------|
| 本地情感分析 + AI 分析 | 91Writing | 基础 |
| 机械 slop + LLM 裁判 + 读者面板 + Opus 审查 | AutoNovel | 深度 |
| 模拟自然涌现 | BookWorld | 自然 |
| 四层评估融合 | 建议方案 | 全面 |

### 四、角色建模

| 方案 | 来源 | 深度 |
|------|------|------|
| name/description/traits | 91Writing | 扁平 |
| Wound/Want/Need/Lie + Three Sliders + 8维对话 | AutoNovel | 深度 |
| 自动提取 + agent 自主行为 + 记忆系统 | BookWorld | 动态 |
| AutoNovel 框架 + BookWorld agent + 关系图谱 | 建议方案 | 完整 |

---

## 附录：AutoNovel 项目文件结构

```
FRAMEWORK (reusable, on master):
  README.md              — 项目概述
  WORKFLOW.md            — 分步指南
  PIPELINE.md            — 自动化规范
  program.md             — 每阶段 agent 指令
  CRAFT.md               — 创作教育（情节、角色、世界、散文）
  ANTI-SLOP.md           — 词级 AI 痕迹检测
  ANTI-PATTERNS.md       — 结构级 AI 模式检测

TEMPLATES (per-novel on branch):
  voice.md               — Part 1 护栏（永久）+ Part 2 声音（每部小说）
  world.md               — 世界圣经模板
  characters.md          — 角色注册表模板
  outline.md             — 章节大纲模板
  canon.md               — 硬事实数据库
  MYSTERY.md             — 中心谜题（仅作者可见）
  state.json             — 管线状态追踪

TOOLS (27 Python scripts):
  Foundation: seed.py, gen_world.py, gen_characters.py, gen_outline.py,
              gen_outline_part2.py, gen_canon.py, voice_fingerprint.py
  Drafting:   draft_chapter.py, run_drafts.py
  Evaluation: evaluate.py, adversarial_edit.py, compare_chapters.py,
              reader_panel.py, review.py
  Revision:   gen_brief.py, gen_revision.py, apply_cuts.py, build_arc_summary.py
  Art:        gen_art.py, gen_art_directions.py, gen_cover_composite.py,
              gen_cover_print.py
  Audiobook:  gen_audiobook_script.py, gen_audiobook.py
  Orchestr.:  run_pipeline.py, build_outline.py

TYPESETTING:
  typeset/novel.tex      — LaTeX 模板（EB Garamond，商业平装本）
  typeset/build_tex.py   — 章节 → LaTeX + 矢量装饰
  typeset/epub_*          — ePub 元数据、CSS、封面

CONFIG:
  .env.example           — API 密钥（Anthropic, fal.ai, ElevenLabs）
  pyproject.toml         — Python 依赖（httpx, dotenv）
```
