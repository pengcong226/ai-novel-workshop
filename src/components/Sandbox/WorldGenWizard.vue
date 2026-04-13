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
        @keyup.enter="sendMessage"
        :disabled="isGenerating"
      />
      <div class="actions">
        <el-button type="primary" @click="sendMessage" :loading="isGenerating">发送</el-button>
        <el-button type="success" @click="commit" v-if="sandboxStore.draftEntities.length > 0" :loading="isCommitting">注入本源世界</el-button>
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
import type { ChatMessage } from "@/types/ai";

const sandboxStore = useSandboxStore();
const projectStore = useProjectStore();
const aiStore = useAIStore();

const inputText = ref('');
const messages = ref<ChatMessage[]>([
  { role: 'assistant', content: '你好，我是创世向导。请告诉我你想生成什么样的世界或人物门派？' }
]);
const isGenerating = ref(false);
const isCommitting = ref(false);

const emit = defineEmits(['close']);

function closeWizard() {
  sandboxStore.isWizardMode = false;
  sandboxStore.clearDrafts();
  emit('close');
}

async function commit() {
  if (isCommitting.value) return;
  isCommitting.value = true;
  try {
    await sandboxStore.commitDrafts();
    closeWizard();
  } catch (e) {
    console.error(e);
  } finally {
    isCommitting.value = false;
  }
}

async function sendMessage() {
  if (!inputText.value.trim() || isGenerating.value) return;

  messages.value.push({ role: 'user', content: inputText.value });
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
                      attitude: { type: "number", description: "Attitude score from -100 to 100" }
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
      ],
      { type: "check", complexity: "medium", priority: "quality" },
      { maxTokens: 4000, response_format: { type: "json_schema", json_schema: schemaPayload } }
    );

    const cleanContent = res.content.replace(/```json\n?|```/g, '').trim();
    const parsed = JSON.parse(cleanContent);

    // Clear old drafts on new generation to keep it simple, or we could append.
    sandboxStore.clearDrafts();

    const nameToIdMap: Record<string, string> = {};

    interface DraftEntity {
      name: string;
      category: string;
      type: 'CHARACTER' | 'FACTION' | 'LOCATION' | 'LORE' | 'ITEM';
      systemPrompt: string;
      relations: {
        targetName: string;
        relationType: string;
        attitude?: number;
      }[];
    }

    if (parsed.entities && Array.isArray(parsed.entities)) {
      // 1st pass: create entities
      parsed.entities.forEach((ent: DraftEntity) => {
        const id = uuidv4();
        nameToIdMap[ent.name] = id;
        sandboxStore.addDraftEntity({
          id,
          projectId: projectStore.currentProject?.id || '',
          type: ent.type || 'CHARACTER',
          name: ent.name || 'Unnamed',
          category: ent.category || 'NPC',
          systemPrompt: ent.systemPrompt || '',
          createdAt: Date.now()
        });
      });

      // 2nd pass: create relations
      parsed.entities.forEach((ent: DraftEntity) => {
        const sourceId = nameToIdMap[ent.name];
        if (ent.relations && Array.isArray(ent.relations)) {
          ent.relations.forEach(rel => {
            const targetId = nameToIdMap[rel.targetName];
            if (targetId && sourceId) {
              sandboxStore.addDraftRelation(sourceId, {
                targetId,
                type: rel.relationType || 'Unknown',
                attitude: rel.attitude?.toString()
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