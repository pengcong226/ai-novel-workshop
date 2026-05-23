# Dynamic Affinity Text (动态心理关系) Design Spec

## 1. Goal
在现有的 `Entity` 和 `StateEvent` 架构中，扩展实体间的关系（Relations）表达能力。抛弃死板的数字“好感度”，转而使用符合网文创作习惯的“动态心理态度（Dynamic Affinity Text）”，让 AI 能够精准掌握角色间的实时羁绊变化，避免人设和剧情崩坏。

## 2. Architecture & Data Flow

### 2.1 扩展底层数据模型 (src/types/sandbox.ts)
当前我们记录关系的方式是在实体或 `StateEvent` 中保存 `targetId` 和 `type`（如"师徒"）。
我们需要增加一个字段 `attitude`（态度/心理活动），并且为了支持关系的动态变化，扩展 `RELATION_ADD` 事件或新增 `RELATION_UPDATE` 事件。

```typescript
export interface EntityRelation {
  targetId: string;
  type: string;          // 静态身份：如 "师徒"、"宿敌"、"青梅竹马"
  attitude?: string;     // 动态心理：如 "表面顺从，暗中寻找背叛机会"
}
```

在 `StateEvent` 的 Payload 中，允许通过 `RELATION_UPDATE` 直接覆盖某个已存在关系的 `attitude`：
```typescript
export type StateEventType = 'PROPERTY_UPDATE' | 'RELATION_ADD' | 'RELATION_REMOVE' | 'RELATION_UPDATE' | 'LOCATION_MOVE';

export interface StateEventPayload {
  // ... 其他属性
  targetId?: string;
  relationType?: string;
  attitude?: string; // 随章节推进而变化的心理描述
}
```

### 2.2 状态归约 (SandboxStore Reducer)
在 `src/stores/sandbox.ts` 中，当处理 `activeEntitiesState` 的 `RELATION_UPDATE` 事件时，系统会在目标实体的 `relations` 数组中找到对应的 `targetId`，并更新其 `attitude` 文本。

### 2.3 AI 工具调用 (Structured Output) 更新
在负责章节总结提取（Extract）或规划（Outline）的系统提示词（如 `src/utils/context/middlewares.ts` 中的 `update_entity_state` Schema）中，新增对 `attitude` 的描述：
- **Schema 定义：** 要求 AI 输出变更状态时，一并给出现有关系的心理态度总结（不超过20个字）。
- **执行规则：** 只有当两人的交互产生明显转折（如爆发争吵、生死与共）时，AI 才会生成 `RELATION_UPDATE` 事件，平时不记录琐碎变动。

### 2.4 图谱可视化呈现 (SandboxGraph.vue)
在基于 AntV G6 的关系图谱中，原本线上的标签（Label）只显示“师徒”。
更新后，连线标签的格式将变为：`师徒 (心生嫌隙)`，如果 `attitude` 过长，则截断显示，并在鼠标悬浮（Tooltip / Hover）时展示完整的动态心理文本。同时，如果 `attitude` 中包含“敌对”、“杀意”等负面情绪关键词（由前端轻量级正则判断），连线颜色自动转为警示色（例如赤红或暗紫），反之亦然。

## 3. Trade-offs & Limitations
- **Trade-off:** 使用文本而非数值，虽然增强了小说表达的细腻度，但由于缺乏量化指标，无法像游戏那样通过“阈值触发”特定剧情（如“好感>80则解锁某事件”）。这完全依赖于大纲 AI（Planner）的上下文理解能力，要求我们选用最强模型（如 Sonnet 4.6）来做剧情推演。
- **Limitation:** 在提取时，如果 AI 频繁生成 `RELATION_UPDATE`，可能会导致图谱和时间线变得杂乱。因此需在提示词中严格限定：**“仅在关系发生实质性转折时更新态度”**。

## 4. Execution Plan Summary
1. **类型更新：** 修改 `sandbox.ts` 中的 `EntityRelation`、`StateEventType` 和对应的数据处理逻辑。
2. **Reducer 逻辑：** 在 `activeEntitiesState` 的 `switch` 块中处理 `RELATION_UPDATE`。
3. **AI 提示词 Schema：** 更新调用结构，允许 AI 输出 `attitude`。
4. **图谱 UI：** 在 `SandboxGraph.vue` 中渲染文本标签，并配置悬停气泡提示。