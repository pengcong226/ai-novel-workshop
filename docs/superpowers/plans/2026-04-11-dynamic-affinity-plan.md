# Dynamic Affinity Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Entity Sandbox system with a new `attitude` property for relationships and allow AI extraction tools to update it via a `RELATION_UPDATE` state event.

**Architecture:** We will extend the `sandbox.ts` schema to support `attitude`, update the `StateEventType` union to include `RELATION_UPDATE`, add the reducer logic in `SandboxStore`, extend the V5 JSON Schema in `generation-scheduler.ts` to include `attitude` and `RELATION_UPDATE`, and render the dynamic affinity attitude in `SandboxGraph.vue` edge labels.

**Tech Stack:** Vue 3, Pinia, TypeScript, AntV G6

---

### Task 1: Update Schema and SandboxStore Reducer

**Files:**
- Modify: `src/types/sandbox.ts`
- Modify: `src/stores/sandbox.ts`

- [ ] **Step 1: Update the types in `sandbox.ts`**

In `src/types/sandbox.ts`, extend the interfaces:

```typescript
export interface EntityRelation {
  targetId: string;
  type: string;          
  attitude?: string;     
}

export type StateEventType = 'PROPERTY_UPDATE' | 'RELATION_ADD' | 'RELATION_REMOVE' | 'RELATION_UPDATE' | 'LOCATION_MOVE';

export interface StateEvent {
  // ... (keep existing properties)
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
    attitude?: string;
    coordinates?: { x: number; y: number };
  };
  source: 'MANUAL' | 'AI_EXTRACTED';
}
```

- [ ] **Step 2: Update the `SandboxStore` type exports**

In `src/stores/sandbox.ts`, update `EntityRelation` to match the new `attitude` property:

```typescript
export interface EntityRelation {
  targetId: string;
  type: string;
  attitude?: string;
}
```

- [ ] **Step 3: Update the Reducer in `sandbox.ts`**

In `src/stores/sandbox.ts`, locate the `activeEntitiesState` computed property and add a case for `RELATION_UPDATE`:

```typescript
        case 'RELATION_ADD':
          if (event.payload.targetId && event.payload.relationType) {
            target.relations.push({ 
              targetId: event.payload.targetId, 
              type: event.payload.relationType,
              attitude: event.payload.attitude
            });
          }
          break;
        case 'RELATION_REMOVE':
          if (event.payload.targetId) {
            target.relations = target.relations.filter((r: EntityRelation) => r.targetId !== event.payload.targetId);
          }
          break;
        case 'RELATION_UPDATE':
          if (event.payload.targetId && event.payload.attitude) {
            const rel = target.relations.find(r => r.targetId === event.payload.targetId);
            if (rel) {
              rel.attitude = event.payload.attitude;
            }
          }
          break;
```

- [ ] **Step 4: Verify Compilation**

Run: `npm run build`
Expected: PASS (No TypeScript compilation errors)

- [ ] **Step 5: Commit**

```bash
git add src/types/sandbox.ts src/stores/sandbox.ts
git commit -m "feat(sandbox): add attitude property and RELATION_UPDATE event to core schema"
```

### Task 2: Extend AI V5 Extraction Schema

**Files:**
- Modify: `src/services/generation-scheduler.ts`

- [ ] **Step 1: Modify `update_entity_state` schema in `generation-scheduler.ts`**

Locate the `update_entity_state` schema around line 627 and extend its properties:

```typescript
// Replace lines 639-644 with:
                          entityName: { type: "string" },
                          eventType: { type: "string", enum: ['PROPERTY_UPDATE', 'RELATION_ADD', 'RELATION_UPDATE', 'LOCATION_MOVE'] },
                          details: { type: "string" },
                          attitude: { type: "string", description: "Only used for RELATION_UPDATE to describe psychological attitude/affinity, max 20 chars" }
                        },
                        required: ["entityName", "eventType", "details"],
```

- [ ] **Step 2: Update the `extractionPrompt`**

Locate `extractionPrompt` around line 653 and add an instruction about attitude:

```typescript
              const extractionPrompt = `Please extract any significant state changes from the following chapter.
If there is a significant shift in psychological attitude or affinity between characters, output a RELATION_UPDATE event and provide a short 'attitude' description (under 20 chars).
Chapter Content:
${chapterData.content}

If there are no changes, return an empty array.`;
```

- [ ] **Step 3: Run ESLint**

Run: `npm run lint`
Expected: PASS (No new errors)

- [ ] **Step 4: Commit**

```bash
git add src/services/generation-scheduler.ts
git commit -m "feat(ai): enable AI tool calling to output RELATION_UPDATE and attitude"
```

### Task 3: Render Affinity in Sandbox Graph

**Files:**
- Modify: `src/components/Sandbox/SandboxGraph.vue`

- [ ] **Step 1: Update the `edges` computed property**

In `src/components/Sandbox/SandboxGraph.vue`, locate the `edges` computed property and update the edge label formatting:

```typescript
// Inside the state.relations.forEach loop:
        if (visibleNodes.has(rel.targetId)) {
          let labelText = rel.type || '';
          if (rel.attitude) {
            // Format label with attitude, truncate if necessary
            const shortAttitude = rel.attitude.length > 8 ? rel.attitude.substring(0, 8) + '...' : rel.attitude;
            labelText = `${labelText} (${shortAttitude})`;
          }
          
          // Basic sentiment analysis for edge color
          let edgeColor = 'rgba(60, 130, 246, 0.4)'; // Default blue
          if (rel.attitude) {
            const negativeWords = ['恨', '敌', '杀', '死', '仇', '怒', '厌', '利用', '背叛', '嫌隙'];
            const positiveWords = ['爱', '喜', '信任', '生死', '倾心', '护', '忠'];
            if (negativeWords.some(w => rel.attitude!.includes(w))) {
              edgeColor = 'rgba(239, 68, 68, 0.6)'; // Red
            } else if (positiveWords.some(w => rel.attitude!.includes(w))) {
              edgeColor = 'rgba(16, 185, 129, 0.6)'; // Green
            }
          }

          result.push({
            source: sourceId,
            target: rel.targetId,
            label: labelText,
            style: {
              stroke: edgeColor,
              lineWidth: 2,
              endArrow: {
                path: 'M 0,0 L 8,4 L 8,-4 Z',
                fill: edgeColor
              }
            },
            labelCfg: {
              style: { fill: '#94a3b8', fontSize: 10, background: { fill: '#0a0a0f', padding: [2, 4], radius: 4 } }
            }
          })
        }
```

- [ ] **Step 2: Verify Build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/Sandbox/SandboxGraph.vue
git commit -m "feat(sandbox): visualize dynamic affinity and psychological attitude on graph edges"
```