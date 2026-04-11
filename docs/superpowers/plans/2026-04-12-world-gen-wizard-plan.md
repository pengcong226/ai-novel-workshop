# World Gen Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a "World Gen Wizard" allowing users to chat with AI to bulk-generate entities and relations, preview them on the graph as "draft nodes," and commit them to the main database when approved.

**Architecture:** 
1. Expand `sandbox.ts` Pinia store with `draftEntities`, `draftRelations`, `isWizardMode`.
2. Add a wizard component (`WorldGenWizard.vue`) as an overlay or sidebar that has a chat UI to interact with an AI generation schema.
3. Update `SandboxGraph.vue` to render draft entities and relations with distinct styles (e.g. dashed borders) alongside regular entities when `isWizardMode` is true.
4. Implement a `commitDrafts` function that batch-saves the drafts to the database via existing Tauri IPC commands.

**Tech Stack:** Vue 3, Pinia, AntV G6, Tauri IPC, LLM Structured Outputs

---

### Task 1: Extend SandboxStore with Draft State

**Files:**
- Modify: `src/stores/sandbox.ts`

- [ ] **Step 1: Add draft variables and properties**

In `src/stores/sandbox.ts`, add the draft state refs:

```typescript
  const draftEntities = ref<Entity[]>([]);
  const draftRelations = ref<{ sourceId: string; relation: EntityRelation }[]>([]);
  const isWizardMode = ref(false);
```

- [ ] **Step 2: Add functions to manipulate drafts**

Add these methods to the store:

```typescript
  function clearDrafts() {
    draftEntities.value = [];
    draftRelations.value = [];
  }

  function addDraftEntity(entity: Entity) {
    draftEntities.value.push(entity);
  }

  function addDraftRelation(sourceId: string, relation: EntityRelation) {
    draftRelations.value.push({ sourceId, relation });
  }

  async function commitDrafts() {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // Save draft entities
    for (const entity of draftEntities.value) {
      await invoke('save_entity', { 
        projectId: entity.projectId, 
        entityJson: JSON.stringify(entity) 
      });
    }

    // Save draft relations as StateEvents (assume chapter 1 or baseline)
    for (const draftRel of draftRelations.value) {
      const event: StateEvent = {
        id: crypto.randomUUID(),
        projectId: draftEntities.value[0]?.projectId || '',
        chapterNumber: 0,
        entityId: draftRel.sourceId,
        eventType: 'RELATION_ADD',
        payload: {
          targetId: draftRel.relation.targetId,
          relationType: draftRel.relation.type,
          attitude: draftRel.relation.attitude
        },
        source: 'MANUAL'
      };
      
      await invoke('save_state_event', {
        projectId: event.projectId,
        eventJson: JSON.stringify(event)
      });
    }

    // Reload the store
    const projectId = draftEntities.value[0]?.projectId;
    clearDrafts();
    if (projectId) {
      isLoaded.value = false;
      await loadData(projectId);
    }
  }
```

- [ ] **Step 3: Export draft state**

Update the return object:
```typescript
  return { 
    entities, stateEvents, pendingStateEvents, currentChapter, activeEntitiesState, 
    isLoading, isLoaded, loadData,
    draftEntities, draftRelations, isWizardMode, clearDrafts, addDraftEntity, addDraftRelation, commitDrafts
  };
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/sandbox.ts
git commit -m "feat(sandbox): add draft entities state and commit logic for world gen wizard"
```

### Task 2: Merge Drafts into Graph View

**Files:**
- Modify: `src/components/Sandbox/SandboxGraph.vue`

- [ ] **Step 1: Merge nodes in `SandboxGraph.vue`**

Locate the `nodes` computed property. After the main loop that builds the regular nodes, append the draft nodes:

```typescript
  // Append Draft Nodes
  if (sandboxStore.isWizardMode) {
    for (const draft of sandboxStore.draftEntities) {
      result.push({
        id: draft.id,
        label: draft.name,
        type: 'circle',
        style: {
          ...getStyleForCategory(draft.category),
          lineDash: [4, 4], // Dashed border indicates draft
          shadowColor: '#fcd34d',
          shadowBlur: 20
        },
        labelCfg: { style: { fill: '#fcd34d', fontSize: 12, fontWeight: 'bold' } }
      });
      visibleSet.add(draft.id);
    }
  }
```

- [ ] **Step 2: Merge edges in `SandboxGraph.vue`**

Locate the `edges` computed property. After the main loop, append the draft edges:

```typescript
  // Append Draft Edges
  if (sandboxStore.isWizardMode) {
    sandboxStore.draftRelations.forEach(draftRel => {
      if (visibleNodes.has(draftRel.sourceId) && visibleNodes.has(draftRel.relation.targetId)) {
        let labelText = draftRel.relation.type || '';
        if (draftRel.relation.attitude) {
          const shortAttitude = draftRel.relation.attitude.length > 8 ? draftRel.relation.attitude.substring(0, 8) + '...' : draftRel.relation.attitude;
          labelText = `${labelText} (${shortAttitude})`;
        }
        
        result.push({
          source: draftRel.sourceId,
          target: draftRel.relation.targetId,
          label: labelText,
          style: {
            stroke: 'rgba(245, 158, 11, 0.8)', // Gold/Amber to signify draft
            lineWidth: 2,
            lineDash: [4, 4],
            endArrow: {
              path: 'M 0,0 L 8,4 L 8,-4 Z',
              fill: 'rgba(245, 158, 11, 0.8)'
            }
          },
          labelCfg: {
            style: { fill: '#fcd34d', fontSize: 10, background: { fill: '#0a0a0f', padding: [2, 4], radius: 4 } }
          }
        });
      }
    });
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sandbox/SandboxGraph.vue
git commit -m "feat(sandbox): render draft nodes and edges in SandboxGraph"
```

### Task 3: Build the WorldGenWizard Component

**Files:**
- Create: `src/components/Sandbox/WorldGenWizard.vue`
- Modify: `src/components/Sandbox/SandboxLayout.vue`

- [ ] **Step 1: Create `WorldGenWizard.vue` UI**

```vue
<template>
  <div class="world-gen-wizard">
    <div class="wizard-header">
      <h4>创世向导</h4>
      <el-button size="small" type="danger" text @click="closeWizard">退出</el-button>
    </div>
    
    <div class="chat-history">
      <div v-for="(msg, i) in messages" :key="i" :class="['message', msg.role]">
        {{ msg.content }}
      </div>
    </div>
    
    <div class="chat-input">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        placeholder="例如：生成一个叫血刀门的邪派，掌门叫血魔，和主角有仇"
        @keyup.enter.native="sendMessage"
        :disabled="isGenerating"
      />
      <div class="actions">
        <el-button type="primary" @click="sendMessage" :loading="isGenerating">发送</el-button>
        <el-button type="success" @click="commit" v-if="sandboxStore.draftEntities.length > 0">注入本源世界</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useSandboxStore } from '@/stores/sandbox';
import { useProjectStore } from '@/stores/project';
import { useAIStore } from '@/stores/ai';
import { v4 as uuidv4 } from 'uuid';

const sandboxStore = useSandboxStore();
const projectStore = useProjectStore();
const aiStore = useAIStore();

const inputText = ref('');
const messages = ref<{role: string, content: string}[]>([
  { role: 'assistant', content: '你好，我是创世向导。请告诉我你想生成什么样的世界或人物门派？' }
]);
const isGenerating = ref(false);

const emit = defineEmits(['close']);

function closeWizard() {
  sandboxStore.isWizardMode = false;
  sandboxStore.clearDrafts();
  emit('close');
}

async function commit() {
  await sandboxStore.commitDrafts();
  closeWizard();
}

async function sendMessage() {
  if (!inputText.value.trim() || isGenerating.value) return;
  
  messages.value.push({ role: 'user', content: inputText.value });
  const userInput = inputText.value;
  inputText.value = '';
  isGenerating.value = true;
  
  try {
    const schemaPayload = {
      name: "generate_world_entities",
      description: "Generate a batch of novel entities and their initial relations",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string" },
                type: { type: "string", enum: ['CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM'] },
                systemPrompt: { type: "string", description: "Detailed description or background" },
                relations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      targetName: { type: "string" },
                      relationType: { type: "string" },
                      attitude: { type: "string" }
                    },
                    required: ["targetName", "relationType"],
                    additionalProperties: false
                  }
                }
              },
              required: ["name", "category", "type", "systemPrompt", "relations"],
              additionalProperties: false
            }
          }
        },
        required: ["entities"],
        additionalProperties: false
      }
    };

    const res = await aiStore.chat(
      [
        { role: 'system', content: 'You are a master world builder. Bulk generate novel entities as requested.' },
        ...messages.value
      ] as any,
      { type: 'check', complexity: 'medium', priority: 'quality' },
      { maxTokens: 4000, tools: [schemaPayload], toolChoice: { type: "function", function: { name: "generate_world_entities" } } } as any
    );

    const parsed = JSON.parse(res.content);
    
    // Clear old drafts on new generation to keep it simple, or we could append.
    sandboxStore.clearDrafts();
    
    const nameToIdMap: Record<string, string> = {};
    
    if (parsed.entities && Array.isArray(parsed.entities)) {
      // 1st pass: create entities
      parsed.entities.forEach((ent: any) => {
        const id = uuidv4();
        nameToIdMap[ent.name] = id;
        sandboxStore.addDraftEntity({
          id,
          projectId: projectStore.currentProject?.id || '',
          type: ent.type,
          name: ent.name,
          category: ent.category,
          systemPrompt: ent.systemPrompt,
          createdAt: Date.now()
        });
      });
      
      // 2nd pass: create relations
      parsed.entities.forEach((ent: any) => {
        const sourceId = nameToIdMap[ent.name];
        if (ent.relations && Array.isArray(ent.relations)) {
          ent.relations.forEach((rel: any) => {
            const targetId = nameToIdMap[rel.targetName];
            if (targetId && sourceId) {
              sandboxStore.addDraftRelation(sourceId, {
                targetId,
                type: rel.relationType,
                attitude: rel.attitude
              });
            }
          });
        }
      });
    }

    messages.value.push({ role: 'assistant', content: `我已经为您生成了图谱草稿，请在右侧查看。如果满意，可以点击“注入本源世界”。如果不满意，您可以继续告诉我如何修改。` });

  } catch (e) {
    console.error(e);
    messages.value.push({ role: 'assistant', content: '生成出错，请重试。' });
  } finally {
    isGenerating.value = false;
  }
}
</script>

<style scoped>
.world-gen-wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid var(--border-color);
}
.wizard-header {
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
.message {
  margin-bottom: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  max-width: 80%;
}
.message.assistant {
  background: var(--bg-color-secondary);
  align-self: flex-start;
}
.message.user {
  background: var(--accent-color);
  color: white;
  align-self: flex-end;
  margin-left: auto;
}
.chat-input {
  padding: 10px;
  border-top: 1px solid var(--border-color);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
</style>
```

- [ ] **Step 2: Add Wizard entry to SandboxLayout.vue**

In `src/components/Sandbox/SandboxLayout.vue`:
1. Import `WorldGenWizard.vue`.
2. Add a button "💡 世界生成向导" at the top of the sidebar.
3. Replace the `right-sidebar` content with the Wizard component when `sandboxStore.isWizardMode` is true.

```vue
<!-- Insert before <el-tabs> in main-view -->
<div style="margin-bottom: 10px;">
  <el-button type="warning" plain icon="ri-magic-line" @click="sandboxStore.isWizardMode = true">💡 批量世界生成向导</el-button>
</div>

<!-- Replace right-sidebar content -->
<div class="right-sidebar">
  <WorldGenWizard v-if="sandboxStore.isWizardMode" @close="sandboxStore.isWizardMode = false" />
  <AutomatonChat v-else />
</div>
```

- [ ] **Step 3: Verify Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Sandbox/WorldGenWizard.vue src/components/Sandbox/SandboxLayout.vue
git commit -m "feat(sandbox): add WorldGenWizard component and integrate into SandboxLayout"
```