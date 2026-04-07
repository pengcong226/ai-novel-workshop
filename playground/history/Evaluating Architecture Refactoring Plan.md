# Evaluating Architecture Refactoring Plan

- **Cascade ID**: `a3cd5084-2aa0-4936-9bc0-69614f309878`
- **Steps**: 63
- **Status**: CASCADE_RUN_STATUS_IDLE
- **Created**: 2026-03-31T05:03:06.544370400Z
- **Last Modified**: 2026-03-31T05:21:52.298568500Z
- **Last User Input**: 2026-03-31T05:21:27.312560400Z
- **Workspace**: file:///e:/Projects/ai-novel-workshop
- **Exported**: 2026-04-08 00:57:02

---

## 🧑 User  `2026-03-31T05:03:06`
你觉得这个架构大手术清单如何，对我这个项目有什么提升？

### 🔧 Tool: `list_dir`  `2026-03-31T05:03:15`
`[List Directory]`

### 🔧 Tool: `list_dir`  `2026-03-31T05:04:44`
`[List Directory]`

### 🔧 Tool: `view_file`  `2026-03-31T05:04:51`
`file:///e:/Projects/ai-novel-workshop/plans/AI%E5%B0%8F%E8%AF%B4%E7%94%9F%E6%88%90%E9%A1%B9%E7%9B%AE%E8%AF%84%E4%BC%B0%E4%B8%8E%E4%BC%98%E5%8C%96%E8%AE%A1%E5%88%92.md` (95 lines, 7861 bytes)

### 🔧 Tool: `view_file`  `2026-03-31T05:05:01`
`file:///e:/Projects/ai-novel-workshop/CODE-REVIEW.md` (160 lines, 4177 bytes)

### 🔧 Tool: `list_dir`  `2026-03-31T05:05:16`
`[List Directory]`

### 🔧 Tool: `view_file`  `2026-03-31T05:05:22`
`file:///e:/Projects/ai-novel-workshop/docs/%E4%BF%AE%E5%A4%8D%E4%B8%8E%E4%BC%98%E5%8C%96%E6%B8%85%E5%8D%95.md` (24 lines, 1996 bytes)

## 🤖 Assistant  `2026-03-31T05:05:22`
<details><summary>💭 Thinking</summary>

**Prioritizing Tool Usage**

I'm now prioritizing the most useful tools available to complete the next steps. I am assessing which tools will provide the most efficient path forward. I'm focusing on their respective strengths to solve the particular requirements.


**Refining Tool Selection**

I'm now zeroing in on the most suitable tools, guided by new rules. I'm focusing on avoiding `cat`, `grep` within `bash`, and `ls`, `cat`, `grep`, and `sed` for their respective generic functions. I've also added a step to list related tools before executing, ensuring I choose the most specific ones. This is particularly relevant when comparing the `plans` and `docs` files, where terms like "architecture major surgery" and "technical debt" are explicitly mentioned.


**Evaluating Proposed Refactoring**

I'm now formulating a Markdown response. I'm focusing on evaluating the proposed refactoring from `AI小说生成项目评估与优化计划.md`. It's a "major surgery", a necessary "rebirth". The original architecture was sufficient for short stories or demos. I'm making sure to highlight the critical nature of this upgrade, avoiding a plan since this response is investigative in nature.


**Analyzing Technical Debt**

I am now focusing on the implications of technical debt, especially with longer novels. The hidden debt will become visible. I'm prioritizing addressing this, specifically by unifying AI calls to avoid rate limits, improve cost accuracy, and enable retry mechanisms. I am also working to refine the vector database's delete/query functions to prevent AI hallucinations caused by accumulating data. Finally, I'm working to implement streamed read/write and Tokenizer to improve performance. I am also considering strict feature freezes until P0 issues are resolved.




</details>

这份“架构大手术清单”（即**《AI小说生成项目评估与优化计划》**）制定得非常精准且具有前瞻性。它直击了系统目前最致命的“痛点”，是一次**从“原型玩具”向“专业级生产力工具”跨越的必经之路**。

在我看来，这份清单对你项目的提升主要体现在以下四个核心方面，并且每一个都是决定整套系统生死存亡的关键：

### 1. 治愈长篇写作的“慢性绝症”（逻辑崩坏与幻觉）
*   **清单动作**：完善向量数据库（Vector DB）的删除与精确查询机制；引入精准的 Tokenizer。
*   **带来的提升**：以前项目运行到中后期，由于大量废弃数据或旧设定没有被清理，会在上下文中引发严重的“脏数据污染”，导致 AI 产生严重的幻觉和剧情崩盘。实施这一手术后，**三层记忆架构（Short/Mid/Long-term）的威力才会被真正释放**，AI 能够精确抓取需要的人物和设定，确保了几十万字级别长篇小说的**逻辑一致性**。

### 2. 重塑底层调度心脏，止住“系统出血”
*   **清单动作**：强制统一 AI 调用层，废弃旧版的直接 `fetch` 请求；重构限流器与带有随机抖动（Jitter）的指数退避重试策略。
*   **带来的提升**：由于之前新旧 API 割裂，容易出现无限死循环重试和 Rate Limit 封禁，甚至导致 API Cost（成本）漏算。这项手术直接排除了高并发“惊群效应”带来的崩溃风险，不仅让生成过程稳如泰山，还能**精细化管控 API 的消耗预算**，避免出现天价账单。

### 3. 突破物理性能天花板（防 OOM 崩溃）
*   **清单动作**：针对大文件/长篇数据的序列化，改用流式读写（Stream API）或分片加载机制。
*   **带来的提升**：这是保障**前端生死存亡**的一环。小说到达百万字后，如果使用传统的 JSON 序列化一次性载入或导出必然会导致浏览器内存溢出（OOM）崩溃。该优化彻底解决了用户“熬夜写万字，导出直接白屏全丢”的毁灭级体验问题，使其能够真正承载商业级体量的工程文件。

### 4. 从“正则堆砌”跨入“智能化质检”
*   **清单动作**：引入轻量级 LLM-as-a-Judge 取代硬编码的正则匹配；完善 JSON 自动修复和柔性自愈机制。
*   **带来的提升**：以前死板的模式匹配很容易误伤带有复杂修辞和铺垫的高质量文笔。借助轻量级大模型做后台裁判，不仅校验更精准灵活，而且把修复过程前置到后台静默完成，极大程度地**维护了用户的沉浸式创作心流**，避免了让人出戏的底层报错弹窗。

---

### 💡 给你的额外建议

1.  **坚决执行“技术债优先” (Feature Freeze)**：在完成清单里标注的 P0 级别的改动（统一 API、VDB优化、流式读写/防抖保存）之前，**强烈建议冻结一切新功能的开发**。地基如果不稳固，大厦盖得越高，未来坍塌时付出的代价就越大。
2.  **保护好你的“护城河”**：清单中提到的 **Table Memory（表格记忆/状态机）** 是这个项目相比市面上同类产品的绝对亮点。不要妥协于主流的纯文本 prompt 拼接，继续深化这种让 AI 以类似数据库逻辑去运转的架构，未来甚至可以向“剧本杀引擎”、“互动跑团（TRPG）游戏导播”等领域降维打击。
3.  **为“极易碎组件”上好保险**：重构 AI 核心调用层时，极大概率会影响到你原来用于处理段落重叠（Overlap Chunking）和异常拦截的代码。在动刀前，一定要用 Vitest 或 Jest **把哪怕是最基础的单元测试先挂上**，否则改完后极易引发连锁反应的 Bug。

总而言之，**这份大手术清单抓住了所有的痛点，请毫不犹豫地推进执行它。** 需要我帮你拆解第一步具体从哪里开始编写代码吗？

*Stop: `STOP_REASON_STOP_PATTERN`*

## 🧑 User  `2026-03-31T05:10:15`
json表格会比csv表格好吗，好在哪里？

## 🤖 Assistant  `2026-03-31T05:10:15`
<details><summary>💭 Thinking</summary>

**Prioritizing Tool Usage**

I'm now prioritizing the most useful tools available to complete the next steps. I am assessing which tools will provide the most efficient path forward. I'm focusing on their respective strengths to solve the particular requirements.


**Evaluating Format Efficiency**

I'm now zeroing in on the most efficient format for representing tabular data: JSON vs. CSV. I'm focusing on their strengths and weaknesses concerning data storage and retrieval. This appears to be a straight-forward informational question, so I do not need a complex plan. I'm aiming to identify the key differences in their structures, advantages, and disadvantages for a given scenario.


**Assessing Direct Response Capability**

I have determined that a direct response is sufficient, as tool usage isn't required for this. The core question can be addressed without implementing code changes. I will focus on outlining the key differences between the formats in the context of an AI system. My thoughts are focusing on structure and dimensionality, type safety, and LLM readability and parsability.




</details>

在 AI 驱动的项目（特别是类似你正在做的“AI角色状态机”和“Table Memory”表格记忆）中，**JSON 格式在绝大多数情况下比 CSV 更好**。

这两者并非绝对对立，而是各有侧重，下面为你详细剖析 JSON 相比 CSV 的优势（以及为什么你的项目更适合 JSON）：

### 1. 支持复杂的多维/嵌套数据（最核心的优势）
*   **CSV 永远是扁平的二维表**（行和列）。如果一个人物有多个别名、多个随身物品，或者复杂的人际关系：
    *   在 CSV 里，你只能把它们硬塞进一个格子里，比如写成 `"剑, 盾牌, 回血药"`，或者增加冗余列（`物品1, 物品2, 物品3`）。这对于代码解析和 AI 理解都是灾难。
*   **JSON 支持任意深度的嵌套树形结构**。你可以轻松定义：
    ```json
    {
      "name": "亚瑟",
      "inventory": ["圣剑", "旧破甲"],
      "relationships": {
        "梅林": "导师",
        "兰斯洛特": "骑士"
      }
    }
    ```
    对于小说设定这种极其复杂、难以规范化的网状数据，JSON 的表达能力完胜。

### 2. 严格的数据类型（Type Safety）
*   **CSV 里一切皆为字符串**。即使是数字 `25` 或布尔值 `true`，解析出来也是 `"25"` 和 `"true"`，你需要写额外的代码去转换类型。
*   **JSON 原生支持多种数据类型**（String, Number, Boolean, Array, Object, Null）。这让你的前端状态机可以直接拿来进行逻辑判断，比如 `if (character.isAlive === false)`。

### 3. LLM（大语言模型）的亲和力与 Function Calling
*   **格式容错率低 vs 高**：LLM 生成 CSV 时经常翻车（例如文本中本身包含了逗号，却没有加双引号，导致列对齐错乱）。而 JSON 有严格的 `{ }` 和 `[ ]` 闭合规范。
*   **JSON Schema 校验**：目前所有的主流大模型（GPT-4、Claude 3、Gemini 等）都深度支持**结构化输出（Structured Output）**和 **API 工具调用（Function Calling）**。你可以强制 AI 返回符合特定结构的 JSON 表格状态，并且能直接用现成的库（如 Zod）验证它是否合法。若是 CSV，这套生态几乎是没法用的。

### 4. 扩展性与向下兼容（Schema Evolution）
*   **CSV 加字段牵一发而动全身**：如果在 CSV 里加一列“法力值”，你可能得把所有历史数据的表头和对应列都补齐一个空逗号。
*   **JSON 可随意伸缩**：你只需要给有需要的人物对象增加一个 `"mana"` 键即可，旧数据没有这个键也不影响现有的解析逻辑，这非常利于你项目的长期迭代。

---

### ⚠️ 但是，CSV 也有其不可替代的优势（不要一棍子打死）

虽然底层存储和逻辑传输必须用 JSON，但在特定环节，CSV（或者 Markdown 表格）其实更具优势：

1.  **极端节省 Token（适合放入 Prompt）**
    JSON 的缺点是“键名冗余”。如果你有 100 个人物，`"name": ` 和 `"age": ` 这个键名会在 Prompt 里重复 100 次，极大地浪费昂贵的上下文 Token。
    *   **优化方案**：**存储和计算用 JSON，但扔给 AI 阅读时，将平铺的属性转成 CSV 或 Markdown 表格！**
    ```markdown
    |姓名|年龄|阵营|
    |---|---|---|
    |亚瑟|25|圆桌骑士|
    ```
    这种方式在 Prompt 中极其省 Token，且 AI 完全能看懂。

2.  **便于人类非技术作者直接编辑**
    如果是你的用户（小说作者）想要自己手工整理一堆大纲或者人物卡导入，他们最习惯的是 Excel。提供一个允许导入 CSV（然后在后台转化为 JSON 存入 IndexedDB/SQLite）的功能，体验会极佳。

### 总结建议对你的提升
在你的架构大手术里，你应该建立这套标准：
**数据库存储、前后端通信、AI 意图解析** 统一收口使用 **JSON**；但在构建**让 AI 读取的短期记忆（Context）** 以及与 **普通创作者的导入导出文件** 时，考虑向 **CSV/表格 格式桥接**。长短互补。

*Stop: `STOP_REASON_STOP_PATTERN`*

## 🧑 User  `2026-03-31T05:12:46`
现在酒馆主流的表格插件是怎样的，你搜一下，总结对比不同的表格

### 🔧 Tool: `search_web`  `2026-03-31T05:12:54`
Query: "SillyTavern" "table" OR "表格" plugin

### 🔧 Tool: `search_web`  `2026-03-31T05:13:02`
Query: "SillyTavern" extension table database OR "variables" OR data OR "CSV" site:github.com

### 🔧 Tool: `search_web`  `2026-03-31T05:13:14`
Query: "SillyTavern" "表格" AND "插件"

### 🔧 Tool: `search_web`  `2026-03-31T05:13:24`
Query: "SillyTavern" "Data Bank" OR "table" plugin extension

### 🔧 Tool: `view_file`  `2026-03-31T05:13:35`
`file:///e:/Projects/ai-novel-workshop-tavern-parser/tavern-parser/output/44bc156be56c646e1a0b698cdc86895b794175786ad6e5c22f76f46d27dceabf.0.md` (3050 lines, 195711 bytes)

### 🔧 Tool: `view_file`  `2026-03-31T05:13:44`
`file:///e:/Projects/ai-novel-workshop/docs/table-memory-system.md` (649 lines, 15573 bytes)

### 🔧 Tool: `read_url`  `2026-03-31T05:13:55`
`https://raw.githubusercontent.com/muyoou/st-memory-enhancement/main/README.md`

### 🔧 Tool: `search_web`  `2026-03-31T05:14:04`
Query: "st-memory-enhancement" AND "SillyTavern"

### 🔧 Tool: `list_dir`  `2026-03-31T05:14:14`
`[List Directory]`

## 🤖 Assistant  `2026-03-31T05:14:43`
<details><summary>💭 Thinking</summary>

**Prioritizing Tool Usage**

I'm now prioritizing the most useful tools for this task. The focus is on selecting the correct tool for the job to improve efficiency. I am thinking through the best ways to integrate different tools as required. My current approach involves a step-by-step assessment of which tool is most appropriate given a specific action is needed.


**Refining Tool Choices**

I'm now refining tool selection based on specific constraints, like avoiding `cat` for file creation and preferring `grep_search`. I'm also remembering to list all relevant tools before executing any, to ensure the most specific and appropriate ones are chosen. The `st-memory-enhancement` tool seems relevant and I'm investigating alternative "table plugins" used in SillyTavern, such as ST-Script and Quick Replies.


**Synthesizing Table Plugin Knowledge**

I'm now focusing on synthesizing my understanding of SillyTavern's table plugin landscape. I'm contrasting native Lorebooks with plugins like `st-memory-enhancement` and `SillyTavern-Data-Bank`, considering how they handle data structures. My goal is a comprehensive comparison of each plugin's features and utility. I will address various formats used for table data, including W++, Markdown tables, CSV, and JSON, to offer a complete summary. I'm aiming for a structured output highlighting the strengths and weaknesses of each option.


**Analyzing Table Solutions**

I am now categorizing SillyTavern's table solutions into native format and advanced plugin levels. Under native formats, I see W++ and Markdown tables, both having their limitations.  I'm also analyzing advanced plugin solutions, highlighting `st-memory-enhancement` (muyoou's work), focusing on its CSV-based structure, sheet system, dynamic row updates, and Token savings. The next plugin will be added soon.




</details>

在如今的“酒馆”（SillyTavern - ST）和开源 AI 跑团/创作社区中，对于“表格”或者说“结构化记忆（状态机）”的管理，其实分为**纯格式流派（写给大模型看）**和**代码插件流派（程序动态管理）**两大方向。

我综合梳理了目前 ST 社区生态中最主流的解决方案，并为你做出对比：

### 1. 纯格式流派（原生 Lorebook / Character Card 定义）
这类不依赖外部代码插件，而是利用 ST 自带的“世界书（World Info）”或角色介绍框，采用特定的文本排版来模拟表格功能。

| 方案名称 | 工作原理 | 优点 | 缺点 |
| :--- | :--- | :--- | :--- |
| **W++ / Plist 格式** | 采用 `[身份("剑客" + "流浪汉")]` 或带有大括号的伪代码格式定义属性。 | 社区接受度极高；绝大多数模型（如 Claude 3 / GPT-4）天生对这种结构体敏感。 | **静态死板**：这只是一种显示格式，一旦写死，模型无法在对话中自己去持久化修改它。 |
| **Markdown 表格** | 直接在 Worldbook 里画 `\|姓名\|年纪\|`，在打上特定触发词时塞给模型。 | 可读性最好，特别适合少量人物和简单设定的罗列。 | **极度浪费 Token**：每次触发都会整表发送；模型难以基于 Markdown 返回精确的增删改查指令。 |
| **CSV 纯文本表** | 用逗号分隔值，如 `Name,Age,Status`。 | 最节省 Context Token，尤其适合大量数据的堆叠。 | 一般人阅读困难，如果没有代码辅助定位，很难维护。 |

---

### 2. 代码插件流派（动态记忆与表格插件）
这是目前进阶玩家和高阶创作者用来解决“AI 遗忘”和“数值化跑团”的主流手段。

#### 🟢 标杆插件一：`st-memory-enhancement` (你项目中所借鉴的那个)
目前在中文（特别是 NGA / 贴吧 / TG群）及独立创作圈非常火爆的状态机扩展。
*   **机制**：在侧边栏建立独立的 CSV/JSON 表格页（Sheets）。在对话时，通过**触发式检索**（只把相关的几行内容抽出来发给 AI），并且**赋权给 AI**（让 AI 输出特定的命令，例如 `updateRow(1, "重伤")`）由后台解析并覆写进原始表格。
*   **对比优势**：**真正的“状态读写双向绑定”**。别的方案只能“读”，它是目前为数不多能让 AI 自己“修剪和更新”长期记忆的优质方案。极其省 Token。
*   **适用场景**：长篇连载生成、跑团、多角色复杂群像剧。

#### 🔵 标杆插件二：`SillyTavern Data Bank` (数据银行)
在纯英文社区（如 Reddit、ST 官方 Discord）很受欢迎的数值化模组扩展。
*   **机制**：它并非以“表格”形式呈现，而是提供了一个键值对（Key-Value）数据库。你可以建立像 `Player_Gold`, `Affection_Level` 这样的变量库。
*   **对比优势**：**和 ST 原生功能整合极好**。它不仅给大模型看，还能与 ST 自带的 `ST-Script`（宏指令）、触发器（Regex）深度结合。比如匹配到“给你一金币”，后台程序就自动让 `Player_Gold + 1`，不需要大模型耗费算力去判断。
*   **适用场景**：带好感度/金币面板的纯 RPG 跑团体验游戏。

#### 🟣 标杆系统三：ST 自带的全局宏与 `Quick Replies` 配合
这不是单独插件，而是利用 ST 的变量宏字典。
*   **机制**：创建一个专用的隐藏角色卡或快速回复库，利用 `{{getvar::XXX}}` 和 `{{setvar::XXX}}` 不断修改内部状态。把角色的背包、状态作为变量动态注入到 Prompt 里。
*   **对比优势**：无须装任何外置模块，开箱即用。
*   **适用场景**：只想要记住简单的“今天穿了什么衣服”、“拿了什么武器”的轻度玩家。

---

### 💡 对你的项目有何启示？

纵观整个酒馆生态，大家都在苦苦挣扎于 **“Token 开销 vs 记忆连贯性”** 的矛盾。

相比之下，你目前的架构规划（也就是参考 **st-memory-enhancement**，把表格做成底层的 **CSV行定位 + AI update指令反馈**）是**最先进且最适合硬核文字创作**的一套体系。因为：

1.  它没有 `Data Bank` 那么“游戏化”（小说大纲不需要管金币整数是不是+1，而是需要懂“这把剑在哪一段被谁捡走了”的剧情逻辑）。
2.  它解决了 W++ 和 Markdown “只能读不能写”、随对话不断膨胀变质的死循环。

由于酒馆（ST）终究是一个偏向聊天和跑团的个人玩具框架，所以他们的插件受限于前端界面，很难做很重。而你做的是一个**完整的工坊工作流**，不仅可以在后来加入刚才我们讨论的 **JSON 原生数据驱动**，还可以建立一套比 ST 更优雅、更稳健的、独立运行于后端的全量长期记忆库。

*Stop: `STOP_REASON_STOP_PATTERN`*

## 🧑 User  `2026-03-31T05:21:27`
我目前用的csv表格，感觉不太行，不如经常出现格式问题，同一个人有多个状态等，反而我看酒馆社区里那些表格插件很少有这些问题

## 🤖 Assistant  `2026-03-31T05:21:27`
<details><summary>💭 Thinking</summary>

**Prioritizing Tool Usage**

I'm now prioritizing the most useful tools for this task. The focus is on selecting the correct tool for the job to improve efficiency. I am thinking through the best ways to integrate different tools as required. My current approach involves a step-by-step assessment of which tool is most appropriate given a specific action is needed.


**Investigating Data Formats**

I'm now investigating data formats, specifically considering the limitations of CSV files. I'm noting the frequent format problems and multiple status entries per person. This is prompting me to explore alternative data management solutions, particularly looking at the table plugins used in the SillyTavern community as a potential solution to these problems. I need to make a more informed choice based on these limitations.


**Analyzing Data Architectures**

I'm now analyzing architectural designs for state management, focusing on JSON versus CSV and how to handle multiple statuses effectively. I understand CSV's limitations—its flat structure and the challenge of representing multiple states in a single cell, leading to parsing problems. I'm exploring how SillyTavern plugins use JSON/dictionary structures internally to overcome these issues, even if they sometimes use CSV prompts for token efficiency. My aim is to explain the benefits of these more structured data formats.




</details>

这恰好印证了我们之前讨论的 **“JSON（结构化） vs CSV（扁平纯文本）”** 最致命的分歧点。

你所遇到的“经常出现格式化问题”和“同一个人出现多个状态（导致表格分裂或重复行）”，是所有试图让大模型**直接操控底层 CSV 纯文本**的开发者都会踩的大坑。

你觉得“酒馆社区的插件很少遇到这些问题”，其实是因为**插件在底层耍了“偷梁换柱”的工程学把戏**。下面我为你揭秘酒馆插件到底是怎么解决这些痛点的，以及你现在的架构该如何调整：

### 痛点剖析：为什么你的 CSV 会崩？

1.  **“多个状态”引发的逗号（,）危机**：
    比如，你想让“亚瑟”处于“中毒、愤怒、流血”三个状态。
    在 CSV 里，如果 AI 生成了：`1,亚瑟,骑士,中毒,愤怒,流血,王城`。
    **灾难发生了**：对于标准的 CSV 解析器来说，原本只有 6 列的表，现在变成了 7 列，整个后续的行全部错位对齐失败（格式崩溃）。
2.  **“同一个人的多重分身”（幻觉叠加）**：
    由于大模型缺乏严格的“关系型数据库主键（Primary Key）”概念，如果你让它自己以纯文本续写表，当亚瑟状态改变时，很多大模型不会去覆写第一行，而是在全表末尾凭空捏造一行新的 `99,亚瑟,骑士,健康...`。这会导致一个人有了薛定谔的多种状态。

---

### 揭秘：酒馆插件是怎么解决这些问题的？

酒馆社区那些优秀的表格类插件（包括 `st-memory-enhancement` 或变量库）表面上给大模型看的是“轻量级纯文本”，但实际上后台做了一套严密的**防线**：

#### 1. 底层存储绝对不用 CSV，而是强类型 JSON 或 Map
这回答了你最核心的疑惑。酒馆插件的运行内存（State）里，人物是这样的对象：
```json
{
  "name": "亚瑟",
  "status": ["中毒", "愤怒", "流血"]  // 这是一个数组，不是字符串！
}
```
它完美容纳了多状态。**CSV 只是为了省 Token 临时“渲染”给大模型看的一张大字报而已**。

#### 2. 收缴大模型的“全表修改权”，改为“方法调用权”
普通的 CSV 提示词往往是：“*这是当前的 CSV 表格，请根据剧情，重新输出一张新的 CSV 表格。*” —— 这样做 100% 会导致格式崩坏。

而高级的酒馆插件，给大模型的提示词是这样的：
> “如需修改人物状态，请不要修改表格，而是必须严格输出：`addStatus("亚瑟", "中毒")` 或 `removeStatus("亚瑟", "健康")`”

当大模型输出这段代码后，插件利用底层的 JavaScript，精确地找到了名为“亚瑟”的 JSON 对象，往他的 `status` 数组里 `push` 或 `splice`（增删）元素。大模型**根本接触不到且无法破坏原始的行列结构**。

#### 3. 严格的“主键（Id/Name）合并与防呆”
如果大模型犯傻，非要发送语句尝试生成一个新的同名角色：`insertRow("亚瑟", "国王")`，酒馆插件的代码层会有一层防呆逻辑（UPSERT 机制）：
```javascript
// 如果名字叫“亚瑟”的人已经在这个库里了，则把 insert 强行转化成 update！
if (database.hasPlayer("亚瑟")) {
   // 合并状态，而不是新增一行
   database.update("亚瑟", newData);
}
```

---

### 🚀 给你的“大手术”优化建议

既然你要做脱胎换骨的架构大手术，请务必立刻抛弃“使用 CSV 持久化存储数据并让 AI 读写”的做法，拥抱以下现代工程范式：

1.  **前后端分离（读写分离）**:
    *   **读（Context Injection）**：把大纲和状态发给大模型阅读时，继续把它压平成 CSV（或 Markdown），为了极度省 Token。
    *   **写（Update/Store）**：接收大模型的更新指令时，**全程使用 JSON Schema（结构化输出） 或者 Function Calling（工具调用）**。
2.  **强制 Function Calling 约束大模型**:
    利用目前绝大部分模型（包括开源模型）都支持的 Tools/Function 功能。让大模型调用设定好的函数：
    *   `updateCharacter({"name": "亚瑟", "add_statuses": ["重伤"], "remove_statuses": ["健康"]})`
    只要用这套标准，你再也不用写复杂的正则去切分逗号了，JSON 库会自动接管一切数据错乱拦截。
3.  **引入状态机（State Machine）校验**:
    如果你使用 JSON 存储，人物就有明确的“主键隔离”。在你的 TS 代码里写一条规则：修改人物数据前，必须校验这个人物是否存在。如果存在，新旧数组自动去重合并（比如 `Set()`），这样同一个角色永远不会分裂出两个相互矛盾的分身。

*Stop: `STOP_REASON_STOP_PATTERN`*
