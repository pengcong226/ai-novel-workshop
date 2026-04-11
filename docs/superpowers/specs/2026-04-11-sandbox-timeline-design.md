# V5 Sandbox Timeline Design Spec

## 1. Overview
The Sandbox Timeline (`SandboxTimeline.vue`) is the central orchestrator of the V5 Multi-View Sandbox. It replaces the legacy `Outline.vue` and `TimelineEditor.vue`, merging outline planning and state mutation into a single vertical scroll.

## 2. Architecture & Data Binding
*   **State Sources:**
    *   `projectStore.currentProject.outline.chapters`: Source of truth for chapter nodes (Title, Synopsis, Objectives).
    *   `sandboxStore.stateEvents`: Source of truth for entity state changes.
*   **Component Structure:**
    *   Uses Element Plus `<el-timeline>` for the vertical track.
    *   Custom styled `<div class="outline-node">` cards inside `<el-timeline-item>` to match the Sci-Fi Glassmorphism theme.

## 3. The 3-State Node System
Every chapter outline node exists in one of three states, visually distinct:

1.  **🔵 Completed (已完稿)**
    *   *Condition*: `chapter.status === 'completed'`
    *   *Visuals*: Solid muted border, checkmark icon, collapsed text.
    *   *Content*: Chapter title and brief summary.
2.  **🟢 Active (当前进度)**
    *   *Condition*: `chapter.status === 'writing'` or the first node that is `planned`.
    *   *Visuals*: Glowing primary border (`var(--accent-primary)`), edit icon.
    *   *Content*: Full outline text. Contains the primary action button: `[AI 生成正文并同步状态]`.
    *   *State Sync Tray*: A dashed green box that appears below the outline, displaying the `update_entity_state` Tool Calling results (e.g., `[林渊] 练气三层 -> 练气七层`).
3.  **🟡 Pending/Predicted (计划中)**
    *   *Condition*: `chapter.status === 'planned'` (after the active node).
    *   *Visuals*: Dashed warning border (`var(--accent-warning)`), low opacity.
    *   *Content*: Outline text and a "Predicted States" alert if the planner AI foresaw state changes.

## 4. Interaction Flow
*   **Bottom Action Bar**: Contains the `[AI 批量推演后续 5 章大纲]` button. When clicked, it calls `extendOutlineWithLLM` and pushes new `Pending` nodes to the timeline.
*   **Active Node Execution**: Clicking `[AI 生成正文并同步状态]` triggers the chapter generation pipeline in `generation-scheduler.ts`, which writes the text, triggers the `update_entity_state` tool call, writes to `SandboxStore`, and finally transitions the node from `Active` to `Completed`.

## 5. Self-Review
*   *Placeholders*: None.
*   *Internal Consistency*: Matches the mockups and previous architectural decisions. Relies directly on existing `ProjectStore` structures.
*   *Scope check*: Focused entirely on the `SandboxTimeline.vue` implementation.
*   *Ambiguity*: Explicitly defines the visual mapping of the 3 chapter states to UI elements.