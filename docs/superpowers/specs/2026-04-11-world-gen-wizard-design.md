# World Gen Wizard (批量世界观生成向导) Design Spec

## 1. Goal
降低普通用户创作长篇小说的门槛，提供“聊天式一键创世”体验。通过“填充级（Fleshed Out）”的大语言模型批量生成能力，一句话扩写出包含几十个门派、NPC、功法、设定的世界观网络，并采用“草稿预览沙盒（Preview Sandbox Mode）”保护正式数据库不被废稿污染。

## 2. Architecture & Data Flow

### 2.1 状态管理 (Draft State Architecture)
在现有的 `src/stores/sandbox.ts` (Pinia) 中引入“草稿态”：
- `draftEntities: Entity[]`
- `draftStateEvents: StateEvent[]` （如果需要预生成第一章的关系，可以使用 `StateEvent` 或直接预绑定到 `Entity.relations` 中）
这两个响应式变量仅存在于内存，生命周期与向导组件绑定。

### 2.2 可视化预览 (Preview Canvas)
在 `SandboxGraph.vue` 中扩展数据源计算属性：
- 向导模式下，图谱的 `nodes` 和 `edges` 计算将同时合并 `activeEntitiesState` (正式库) 与 `draftEntities` (草稿库)。
- 草稿节点在渲染时（G6 `style`），采用特殊的虚线描边、高亮阴影或发光标识，使其与正式节点有明显的视觉区分。
- 图谱上支持对草稿节点的右键快速操作（删除/重命名）。

### 2.3 AI 工具调用管道 (AI Tool Calling Pipeline)
用户在聊天界面输入创世灵感后，触发 AI 助手流程：
1. **System Prompt 注入:** 将向导定义为资深网文主编和设定架构师，要求在收到一句话脑洞后，发散出完整且成体系的势力架构、人物裙带关系和修炼体系。
2. **`generate_world_entities` Schema:** 定义一个支持批量数组输出的 Tool Schema，要求 AI 必须以严格的 JSON 结构输出生成的 `Entity` 列表（包括 `category`, `type`, `systemPrompt`, 初始的 `relations` 等）。
3. **增量/重绘更新:** AI 支持两种草稿指令：
   - 全新生成：清空现有草稿，覆盖为新生成的 JSON。
   - 局部精修：根据用户的后续对话（如“把反派门派改叫血刀门”），在现有的 `draftEntities` 基础上发送增量 Patch 或直接让 AI 吐出修改后的节点 JSON。

### 2.4 落盘与提交 (Commit to Origin)
向导界面底部常驻一个【✅ 确认注入本源世界】按钮。
- 用户确认无误后，前端触发 Tauri 的批量 IPC（或循环调用现有的 `save_entity` 和 `save_state_event`）。
- 将 `draftEntities` 和相关初始关系映射到正式库。
- 清空草稿数组并退出向导模式，此时右侧图谱上的虚线节点将变为实线正式节点。

## 3. Trade-offs & Limitations
- **Trade-off:** 复杂的“草稿”与“正式”节点合并渲染可能导致逻辑边界模糊。必须在 `SandboxGraph.vue` 或相关的 Reducer 中做好严格区分，特别是当草稿节点与正式节点存在关系连线时的连线颜色与箭头渲染。
- **Limitation:** 大批量生成（一次吐出几十个实体）对大模型的输出长度限制（Token limits）和结构化 JSON 的稳定性（Structured Output）提出了极高要求。必须使用能力强且遵循 Schema 严格的模型（推荐 Sonnet 4.6 或更高版本）。

## 4. Execution Plan Summary
1. **状态扩充：** 在 `sandbox.ts` 中添加 `draftEntities` 等响应式草稿变量及对应的合并、提交（commit）、清空方法。
2. **AI 工具集成：** 在 `ai-service.ts` 或 `generation-scheduler.ts` 中新增 `generate_world_entities` Schema 和专用的世界观扩写提问通道。
3. **UI 改造：**
   - 增加 Wizard 交互面板（可作为一个新的侧边栏或对话框形态）。
   - 在 `SandboxGraph.vue` 中支持 `draftEntities` 的合并渲染和草稿特效样式。
4. **落盘对接：** 实现一键将 `draftEntities` 经 Tauri IPC 持久化至 SQLite 的确认流程。