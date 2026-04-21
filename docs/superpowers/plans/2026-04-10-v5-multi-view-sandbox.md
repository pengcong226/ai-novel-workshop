# V5 多维设定沙盘架构 (Multi-View Sandbox) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将废弃的酒馆角色卡(RP)结构重构为“统一实体 + 时间线状态机”模型，并联动大纲、文档、图谱、地图四视图，实现 AI 一键自动更新。

**Architecture:** 
1. **Rust 后端**: 新建 `entities` 和 `state_events` 两张表，废弃大 JSON 文件存储。
2. **前端 Pinia**: 建立响应式 `SandboxStore`，利用计算属性推导当前章节的 Entity 最终状态。
3. **AI 引擎**: 整合 Tool Calling (Structured Outputs) 来抽取和输出 `update_entity_state` 命令。

**Tech Stack:** Tauri 2 (Rust), SQLite, Vue 3, Pinia, AntV G6 (图谱), Vis-timeline, Zod / Tool Calling

---

### Task 1: 建立 Rust SQLite 数据库 Schema

**Files:**
- Modify: `src-tauri/src/db/sqlite.rs`

- [x] **Step 1: 编写建立 Entity 表的 SQL 语句**
在数据库初始化代码中添加新表：
```rust
let create_entities_table = "
    CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        system_prompt TEXT,
        visual_meta TEXT,
        created_at INTEGER NOT NULL
    );
";
```

- [x] **Step 2: 编写建立 StateEvent 表的 SQL 语句**
```rust
let create_state_events_table = "
    CREATE TABLE IF NOT EXISTS state_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        entity_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        source TEXT NOT NULL
    );
";
```

- [x] **Step 3: 运行 SQL 语句以确保表成功创建**
更新 `init_db` 函数，确保执行了上述两条 CREATE 语句。

- [x] **Step 4: Commit**
```bash
git add src-tauri/src/db/sqlite.rs
git commit -m "feat(db): add schema for V5 Entity and StateEvent tables"
```

---

### Task 2: 新增 Tauri 存储与更新 IPC API (原子化 API)

**Files:**
- Modify: `src-tauri/src/lib.rs` (或者专门的 command 模块)

- [x] **Step 1: 编写 `save_entity` 的 Tauri Command**
使用原子化更新原则插入实体：
```rust
#[tauri::command]
async fn save_entity(project_id: String, entity_json: String) -> Result<(), String> {
    // Deserialize and insert/replace into entities table
    // Return success or mapped error
}
```

- [x] **Step 2: 编写 `save_state_event` 的 Tauri Command**
```rust
#[tauri::command]
async fn save_state_event(project_id: String, event_json: String) -> Result<(), String> {
    // Deserialize and insert into state_events table
}
```

- [x] **Step 3: 注册 Tauri Command**
在 `tauri::Builder::default().invoke_handler(...)` 中注册这几个新的 command。

- [x] **Step 4: Commit**
```bash
git add src-tauri/src/lib.rs
git commit -m "feat(tauri): add ipc commands for Entity and StateEvent atomics"
```

---

### Task 3: 前端 TypeScript 类型定义

**Files:**
- Create: `src/types/sandbox.ts`

- [x] **Step 1: 创建 Entity 类型定义**
```typescript
export type EntityType = 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM';

export interface Entity {
  id: string;
  projectId: string;
  type: EntityType;
  name: string;
  category: string;
  systemPrompt: string;
  visualMeta?: {
    color?: string;
    icon?: string;
    defaultCoordinates?: { x: number; y: number };
  };
  createdAt: number;
}
```

- [x] **Step 2: 创建 StateEvent 类型定义**
```typescript
export type StateEventType = 'PROPERTY_UPDATE' | 'RELATION_ADD' | 'RELATION_REMOVE' | 'LOCATION_MOVE';

export interface StateEvent {
  id: string;
  projectId: string;
  chapterNumber: number;
  entityId: string;
  eventType: StateEventType;
  payload: {
    key?: string;
    value?: string;
    targetId?: string;
    relationType?: string;
    coordinates?: { x: number; y: number };
  };
  source: 'MANUAL' | 'AI_EXTRACTED';
}
```

- [x] **Step 3: Commit**
```bash
git add src/types/sandbox.ts
git commit -m "feat(types): define V5 Multi-View Sandbox core types"
```

---

### Task 4: 构建前端 Pinia 状态管理层 (SandboxStore)

**Files:**
- Create: `src/stores/sandbox.ts`

- [x] **Step 1: 编写基础 Store 框架**
```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Entity, StateEvent } from '../types/sandbox';

export const useSandboxStore = defineStore('sandbox', () => {
  const entities = ref<Entity[]>([]);
  const stateEvents = ref<StateEvent[]>([]);
  const currentChapter = ref<number>(1);

  // Computed state reducer
  const activeEntitiesState = computed(() => {
    // Reduce stateEvents up to currentChapter and apply them to entities
  });

  return { entities, stateEvents, currentChapter, activeEntitiesState };
});
```

- [x] **Step 2: 编写调用后端 API 的动作**
在 store 内增加 `saveEntityToDb(entity)` 和 `saveStateEventToDb(event)` 函数，对接 Tauri API。

- [x] **Step 3: Commit**
```bash
git add src/stores/sandbox.ts
git commit -m "feat(store): add pinia store for multi-view sandbox state reduction"
```

---

### Task 5: 集成 AI 工具调用 (State Extraction Tool Calling)

**Files:**
- Modify: `src/services/generation-scheduler.ts` (或对应的调用逻辑)

- [x] **Step 1: 定义提取状态的 JSON Schema**
确保强制输出严格 JSON (`strict: true`) 以更新状态。
```typescript
const updateEntityStateSchema = {
  name: "update_entity_state",
  description: "Extract state changes from the generated chapter text",
  strict: true,
  parameters: {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entityName: { type: "string" },
            eventType: { type: "string", enum: ['PROPERTY_UPDATE', 'RELATION_ADD', 'LOCATION_MOVE'] },
            details: { type: "string" }
          },
          required: ["entityName", "eventType", "details"],
          additionalProperties: false
        }
      }
    },
    required: ["events"],
    additionalProperties: false
  }
};
```

- [x] **Step 2: 绑定 AI 提取回调**
当 AI 章节生成或推演大纲完成后，调用该 Schema 函数并把结果转化为前端的 `StateEvent` 推入 `sandboxStore`。

- [x] **Step 3: Commit**
```bash
git add src/services/generation-scheduler.ts
git commit -m "feat(ai): add tool calling schema for automated state extraction"
```

---

### Task 6: 迁移历史数据工具 (Migration Script)

**Files:**
- Create: `src/utils/sandbox-migration.ts`

- [x] **Step 1: 编写从旧版 Worldbook 转换到 Entity 的逻辑**
丢弃多余 RP 字段。
```typescript
export function migrateLegacyWorldbookToEntities(legacyData: any): Entity[] {
    // Map title -> name
    // Map content -> systemPrompt
    // Return mapped Entity[]
}
```

- [x] **Step 2: 导出并在启动时执行（或提供手动按钮）**
方便旧项目升级到 V5。

- [x] **Step 3: Commit**
```bash
git add src/utils/sandbox-migration.ts
git commit -m "feat(migration): add migration script for legacy RP formats to V5 Sandbox"
```

---

### 总结

以上任务涵盖了从后端数据结构变更、前端持久层到 AI 提取工具链的一整套底层支持。UI 展示层（图谱、地图联动）将在这些底层 API 全部打通后，通过订阅 Pinia 的 `activeEntitiesState` 计算属性自动获得支持。