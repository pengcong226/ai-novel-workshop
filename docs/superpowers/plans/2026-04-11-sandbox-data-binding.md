# Sandbox Data Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Sandbox Views to real SQLite data via lazy loading, implement a cascading spotlight menu for the G6 Graph, and build a memory-only projection for pending state events.

**Architecture:** 
1. **Lazy Load (1A):** Add `load_entities` and `load_state_events` Tauri IPC commands. Fetch them when `SandboxLayout` mounts.
2. **Spotlight Graph (2A):** Use `<el-cascader>` in `SandboxGraph.vue` to filter nodes to 1-degree connections of the chosen target.
3. **Pending States (3A):** Add `pendingStateEvents` array to `SandboxStore` that temporarily overrides entity states during outline predictions without saving to SQLite.

**Tech Stack:** Tauri, SQLite, Vue 3, Pinia, AntV G6, Element-Plus

---

### Task 1: Tauri Backend API for Lazy Loading

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add `load_entities` command**
```rust
#[tauri::command]
fn load_entities(state: State<'_, AppState>, project_id: String) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db.prepare("SELECT id, project_id, entity_type, name, category, system_prompt, visual_meta, created_at FROM entities WHERE project_id = ?1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query(rusqlite::params![project_id]).map_err(|e| e.to_string())?;
    let mut entities = Vec::new();
    
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap_or_default();
        let pid: String = row.get(1).unwrap_or_default();
        let e_type: String = row.get(2).unwrap_or_default();
        let name: String = row.get(3).unwrap_or_default();
        let cat: String = row.get(4).unwrap_or_default();
        let sys_prompt: String = row.get(5).unwrap_or_default();
        let vis_meta: String = row.get(6).unwrap_or_default();
        let created_at: i64 = row.get(7).unwrap_or_default();
        
        let entity = serde_json::json!({
            "id": id,
            "projectId": pid,
            "type": e_type,
            "name": name,
            "category": cat,
            "systemPrompt": sys_prompt,
            "visualMeta": if vis_meta.is_empty() { serde_json::Value::Null } else { serde_json::from_str(&vis_meta).unwrap_or(serde_json::Value::Null) },
            "createdAt": created_at
        });
        entities.push(entity);
    }
    
    serde_json::to_string(&entities).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Add `load_state_events` command**
```rust
#[tauri::command]
fn load_state_events(state: State<'_, AppState>, project_id: String) -> Result<String, String> {
    let db = lock_db!(state);
    let mut stmt = db.prepare("SELECT id, project_id, chapter_number, entity_id, event_type, payload, source FROM state_events WHERE project_id = ?1").map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query(rusqlite::params![project_id]).map_err(|e| e.to_string())?;
    let mut events = Vec::new();
    
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let id: String = row.get(0).unwrap_or_default();
        let pid: String = row.get(1).unwrap_or_default();
        let chap: i64 = row.get(2).unwrap_or_default();
        let ent_id: String = row.get(3).unwrap_or_default();
        let ev_type: String = row.get(4).unwrap_or_default();
        let payload: String = row.get(5).unwrap_or_default();
        let source: String = row.get(6).unwrap_or_default();
        
        let event = serde_json::json!({
            "id": id,
            "projectId": pid,
            "chapterNumber": chap,
            "entityId": ent_id,
            "eventType": ev_type,
            "payload": if payload.is_empty() { serde_json::Value::Null } else { serde_json::from_str(&payload).unwrap_or(serde_json::Value::Null) },
            "source": source
        });
        events.push(event);
    }
    
    serde_json::to_string(&events).map_err(|e| e.to_string())
}
```

- [ ] **Step 3: Register commands**
Add `load_entities` and `load_state_events` to the `invoke_handler` in `src-tauri/src/lib.rs`.

- [ ] **Step 4: Commit**
```bash
git add src-tauri/src/lib.rs
git commit -m "feat(backend): add load_entities and load_state_events IPC commands"
```

### Task 2: Pinia SandboxStore Lazy Loading & Pending States (1A & 3A)

**Files:**
- Modify: `src/stores/sandbox.ts`
- Modify: `src/components/Sandbox/SandboxLayout.vue`

- [ ] **Step 1: Update sandbox.ts state**
Add `pendingStateEvents`, `isLoading`, and `loadData` function:
```typescript
import { invoke } from '@tauri-apps/api/core'
// ...
  const pendingStateEvents = ref<StateEvent[]>([])
  const isLoading = ref(false)
  const isLoaded = ref(false)

  async function loadData(projectId: string) {
    if (isLoaded.value) return;
    isLoading.value = true;
    try {
      const entitiesJson = await invoke<string>('load_entities', { projectId });
      entities.value = JSON.parse(entitiesJson);
      
      const eventsJson = await invoke<string>('load_state_events', { projectId });
      stateEvents.value = JSON.parse(eventsJson);
      
      isLoaded.value = true;
    } catch (e) {
      console.error("Failed to load sandbox data", e);
    } finally {
      isLoading.value = false;
    }
  }
```

- [ ] **Step 2: Update activeEntitiesState reducer**
Combine `stateEvents` and `pendingStateEvents` during reduction:
```typescript
    const combinedEvents = [...stateEvents.value, ...pendingStateEvents.value];
    const relevantEvents = combinedEvents
      .filter(event => event.chapterNumber <= currentChapter.value)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
```

- [ ] **Step 3: Export new properties**
Return `pendingStateEvents`, `isLoading`, `isLoaded`, and `loadData`.

- [ ] **Step 4: Trigger lazy loading in SandboxLayout**
In `src/components/Sandbox/SandboxLayout.vue`, call `loadData`:
```typescript
import { onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()

onMounted(() => {
  if (projectStore.currentProject) {
    sandboxStore.loadData(projectStore.currentProject.id)
  }
})

watch(() => projectStore.currentProject, (newProj) => {
  if (newProj) {
    sandboxStore.isLoaded = false
    sandboxStore.loadData(newProj.id)
  }
})
```

- [ ] **Step 5: Commit**
```bash
git add src/stores/sandbox.ts src/components/Sandbox/SandboxLayout.vue
git commit -m "feat(sandbox): implement lazy loading and pending state buffers"
```

### Task 3: Spotlight Graph with Cascading Menu (2A)

**Files:**
- Modify: `src/components/Sandbox/SandboxGraph.vue`

- [ ] **Step 1: Add cascader UI**
Add an `el-cascader` to select the graph focus center.
```vue
      <el-cascader
        v-model="focusSelection"
        :options="focusOptions"
        size="small"
        placeholder="选择图谱中心"
        @change="handleFocusChange"
      />
```

- [ ] **Step 2: Build focusOptions (Computed)**
```typescript
const focusSelection = ref(['chapter', 'current'])

const focusOptions = computed(() => {
  const charOptions = sandboxStore.entities
    .filter(e => e.type === 'CHARACTER')
    .map(c => ({ value: c.id, label: c.name }))
    
  return [
    {
      value: 'chapter',
      label: '按章节出场人物',
      children: [
        { value: 'current', label: `当前章节 (第 ${sandboxStore.currentChapter} 章)` }
        // We can add more specific chapters here later
      ]
    },
    {
      value: 'character',
      label: '按特定人物为中心',
      children: charOptions
    }
  ]
})
```

- [ ] **Step 3: Implement 1-Degree BFS Filtering**
In the `nodes` and `edges` computed properties, calculate a `visibleSet` of Node IDs that are 1 degree away from the chosen focus center (e.g. if focus is a specific character, show them + anyone they have relations with. If focus is chapter, show all characters present in the chapter + their 1st degree relations).
*Note: Since finding active characters in a chapter requires reading `projectStore.chapters`, you can default to the Protagonist if 'current' chapter characters aren't easily extractable yet.*

- [ ] **Step 4: Commit**
```bash
git add src/components/Sandbox/SandboxGraph.vue
git commit -m "feat(sandbox): implement spotlight graph with cascading center selection"
```