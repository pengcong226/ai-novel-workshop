# V5 UI & AI Config Refactor Design Spec

## 1. Overview
The current UI is cluttered with legacy RP/chat menus (Worldbook, Character Cards) and the `ProjectConfig` page contains confusing settings for AI models that don't map to the actual novel generation pipeline. 

This design unifies all setting/world-building interfaces into a single **Multi-View Sandbox** component, and explicitly reorganizes the AI configuration into four distinct pipeline roles, where users can select which *specific model* (e.g. Claude 3.5, GPT-4o) powers each role.

## 2. Left Sidebar Navigation (`src/views/ProjectEditor.vue`)
*   **Removed (8 items)**: 世界观设定、世界书、角色卡、世界地图、人物设定、关系图、大纲、表格记忆、时间线.
    *   *Note on Timeline*: The old Timeline editor is completely merged into the new Sandbox Timeline view, as they share the same chronological state logic.
*   **Added (1 item)**: `多维设定沙盘 (Sandbox)`.
*   **Retained**: 章节 (Chapters for pure text editing), 摘要管理 (Summary), 质量报告 (Quality), 配置 (Config).

## 3. Sandbox Component Architecture (`src/components/Sandbox/`)
The Multi-View Sandbox is built as a single monolithic route with internal tab-switching to preserve state.

*   `SandboxLayout.vue`: The container. Renders the left-side Entity Explorer tree and the top tab bar.
*   `SandboxDocument.vue`: Replaces Character Cards/Worldbooks. Displays static entity traits, tags (bi-directional links), and computed current state.
*   `SandboxTimeline.vue`: Replaces the old Outline and Timeline components. Displays chapters as nodes. Contains buttons for "Batch Predict Outlines" and "Generate Chapter & Sync State".
*   `SandboxGraph.vue`: AntV G6 integration. Auto-generates relationship nodes/edges based on tags.
*   `SandboxMap.vue`: GIS visualization syncing with entity location states.
*   `AutomatonChat.vue`: The right-side AI Co-creator panel that executes state extraction tools.

## 4. AI Configuration Refactor (`src/components/ProjectConfig.vue`)

The AI configuration will be remodeled to reflect the 4-stage generation pipeline. 

### 4.1 Model Selection Dropdowns
Users will see four distinct dropdowns. The dropdowns are populated with actual models (e.g., `gpt-4o`, `claude-3-5-sonnet`) fetched from the configured providers. The user selects *which model* does what job:

1.  **大纲规划师 (Planner Model)**: Used for macro-level plot generation and predicting state changes. (Requires high reasoning, e.g., Opus/GPT-4).
2.  **正文写手 (Writer Model)**: Used for writing the actual chapter prose. (Requires good creative writing, e.g., Sonnet/GPT-4o).
3.  **防吃书审查 (Sentinel Model)**: Used for running the consistency checks and logic validation against the generated text. (Requires fast, cheap logic, e.g., Haiku/GPT-4o-mini).
4.  **沙盘提取 (Extractor Model)**: Used for executing the `update_entity_state` JSON Schema tool call. (Must support strict JSON structured outputs).

### 4.2 System Prompts & Advanced Settings
*   **Removed**: Legacy RP prompts (e.g., `first_mes`, `scenario`, `mes_example`, chat behavior templates).
*   **Added**: Four dedicated text areas for customizing the System Prompts for the four roles above.
*   **Granular Knobs**: Users can set `Temperature`, `Top P`, and `Max Tokens` individually for the Writer model vs the Planner model, rather than one global setting.

## 5. Self-Review
*   *Placeholders*: None.
*   *Internal consistency*: The removal of the Timeline menu correctly aligns with the addition of `SandboxTimeline.vue`. The model dropdowns specifically address selecting *models* for roles, fixing the user's previous concern.
*   *Scope check*: This design covers frontend Vue component restructuring and `ProjectConfig.vue` refactoring. It relies on the backend/pinia architecture already implemented in the previous plan.
*   *Ambiguity*: Explicitly states that the model dropdowns select models (GPT-4, Claude), not the roles themselves.