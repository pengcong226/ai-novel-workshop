# Plot Loom (命运织布机 - 宏观大纲看板) Design Spec

## 1. Goal
彻底重构长篇小说的“大纲”与“时间线”交互体系。废弃原本线性、被动的瀑布流大纲列表，升级为“卡片看板（Kanban） + 未来锚点（Plot Anchors）”相结合的 2D 互动白板（Plot Loom）。
目标受众（普通人）只需钉下几个宏大的“命运节点（锚点）”，AI 便可基于前后文自动推演补全过程序章；同时在生成正文时，AI 能够通过读取前方的“命运节点”实现长线伏笔的收束，彻底解决长篇小说后期主线涣散的问题。

## 2. Architecture & Data Flow

### 2.1 底层数据结构 (Pinia: `src/types/index.ts` & `project.ts`)
重构现有的 `Outline` 和 `Chapter` 数据模型，引入“卷（Volume/Arc）”和“锚点（Anchor/Milestone）”概念。

```typescript
export interface PlotAnchor {
  id: string;
  targetChapterNumber: number; // 预计发生的章数，或者范围
  description: string;         // 核心事件（例如：魔王苏醒，主角断臂）
  isResolved: boolean;         // 进度推过此章后，是否成功收束
}

export interface VolumeArc {
  id: string;
  title: string;
  startChapter: number;
  endChapter: number;
  theme: string;               // 本卷基调
  anchors: PlotAnchor[];       // 本卷内必须发生的命运节点
  chapters: ChapterOutline[];  // 具体的单章细纲卡片
}

export interface NovelOutline {
  volumes: VolumeArc[];        // 替代原本平铺的 chapters 数组
  globalAnchors: PlotAnchor[]; // 贯穿全书的终极目标
}
```

### 2.2 UI/UX 视图层 (SandboxTimeline 重构为 PlotLoomBoard)
将现有的 `SandboxTimeline.vue` 升级为一个可拖拽的 2D 看板视图（可借用 `vis-timeline` 或基于 HTML5 Drag & Drop 的 Kanban 板）：
- **横向（X轴）：** 以时间 / 卷（Volume）为单位向右延伸。
- **列（Columns）：** 每一列代表一卷（Volume）。
- **行（Rows）/ 卡片：**
  - **顶部钉板区：** 放置高优先级的 `PlotAnchor`（以鲜艳的图钉图标显示），用户可以随意左右拖拽图钉改变其预定章数。
  - **下方细纲区：** 陈列属于这一卷的 `ChapterOutline` 卡片。用户可以自由上下拖动调整本章的顺序，或者双击展开局部编辑。

### 2.3 AI 智能推演引擎 (Plot Interpolation)
对现存的 `extendOutlineWithLLM`（在 `generation-scheduler.ts` 中）进行重构。
- **双向锚点插值生成 (Bidirectional Anchor Interpolation)：**
  当用户在一卷中放下了“开局（第1章）”和“结尾锚点（第30章：打败宗主）”，但中间是空的时，点击【AI 补全卷大纲】。
  系统会把前 30 章的空白区间作为任务交给 AI，并在 System Prompt 中注入：
  > "你需要填充第 2 到第 29 章的详细大纲卡片。请记住，在第 30 章时必须发生【打败宗主】的事件，你需要在这 28 章中逐步铺垫主角的成长、冲突和机遇，平滑地过渡到最终锚点。"

### 2.4 正文生成的约束闭环 (Context Builder Injection)
在 `src/utils/context/middlewares.ts` 中，新建 `PlotAnchorMiddleware`：
- 在生成第 N 章正文时，不仅仅提取历史摘要，还要**向前看**。
- 如果检测到未来 5-10 章内有一个 `PlotAnchor`，将该锚点作为**“潜意识收束目标”**注入给写作大模型的 Prompt，指示 AI 开始收网填坑。

## 3. Trade-offs & Limitations
- **Trade-off:** 将一维数组大纲升级为 2D 卷轴看板，在 UI 渲染和拖拽交互上的开发成本极高。可能需要引入第三方看板库（如 `vuedraggable` 或复用现存的图谱库）以降低难度。
- **Limitation:** 强依赖于 AI 对长逻辑链的遵循能力（特别是“插值补全”功能），遇到较弱的本地小模型可能会产生和目标完全脱节的情节。因此在功能提示中应建议开启 Sonnet 或更高智力的主模型。

## 4. Execution Plan Summary
1. **重构大纲模型：** 在 `src/types/` 中用 `VolumeArc` 和 `PlotAnchor` 重塑 `Outline` 数据结构。
2. **升级大纲生成管线：** 改造 `outlineGenerator.ts`，实现“基于锚点的空白插值补全”算法。
3. **改造上下文中间件：** 编写 `PlotAnchorMiddleware`，在生成正文前探测未来的命运节点并作为条件注入给大模型。
4. **重制看板视图：** 开发 `PlotLoomBoard.vue` 替换原有的时间线/大纲面板，实现列状的卷展示、顶部的图钉挂载，以及卡片的拖拽排序功能。