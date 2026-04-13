<template>
  <div class="sandbox-document-container">
    <el-empty v-if="!activeEntityId" description="请从左侧实体库选择一个条目查看详细档案" />

    <div v-else class="entity-details">
      <!-- Top Section: Static Encyclopedia Data -->
      <div v-if="activeEntity" class="field-group">
        <div class="field-title">
          <i class="ri-fingerprint-line"></i> 基础档案 (系统约束设定)
        </div>
        <div class="field-row">
          <div class="field">
            <label>实体名称</label>
            <input type="text" v-model="activeEntity.name" @blur="saveEntity" />
          </div>
          <div class="field">
            <label>分类类型</label>
            <select v-model="activeEntity.category" @change="saveEntity">
              <option value="Protagonist">核心人物 (Protagonist)</option>
              <option value="Supporting">重要配角 (Supporting)</option>
              <option value="Antagonist">反派 (Antagonist)</option>
              <option value="Faction">势力/门派 (Faction)</option>
              <option value="Location">地点 (Location)</option>
              <option value="Lore">功法/物品 (Lore & Item)</option>
            </select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>核心设定 (喂给大模型的硬性System约束)</label>
            <textarea
              rows="4"
              v-model="activeEntity.systemPrompt"
              placeholder="请输入实体的背景、性格或世界观规则..."
              @blur="saveEntity"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Bottom Section: Dynamic Computed State -->
      <div class="field-group state-group">
        <div class="field-title state-title">
          <i class="ri-node-tree"></i> 动态状态快照 (第 {{ sandboxStore.currentChapter }} 章)
        </div>
        <p class="state-desc">
          基于大纲时间线的 StateEvent 实时推演，AI 只会读取当前最新状态以防止吃书。
        </p>

        <!-- Dynamic Properties (e.g. Level, Status) -->
        <div v-if="currentState?.properties && Object.keys(currentState.properties).length > 0" class="props-grid">
          <div class="prop-item" v-for="(val, key) in currentState.properties" :key="key">
            <span class="prop-key">{{ key }}</span>
            <span class="prop-val">{{ val }}</span>
          </div>
        </div>

        <div class="field-row" style="margin-top: 16px;">
          <div class="field">
            <label>实体羁绊 / 图谱关联 (双向链接)</label>
            <div class="tag-container">
              <!-- Render Relationship links -->
              <span
                class="tag rel-tag"
                v-for="rel in currentState?.relations || []"
                :key="rel.targetId"
              >
                <i class="ri-link"></i> #{{ getEntityName(rel.targetId) }} <span style="opacity:0.6;font-size:10px;">({{ rel.type }})</span>
              </span>

              <!-- Render Location link -->
              <span
                class="tag loc-tag"
                v-if="currentState?.location"
              >
                <i class="ri-map-pin-line"></i> @坐标: [{{ currentState.location.x }}, {{ currentState.location.y }}]
              </span>

              <span class="tag empty-tag" v-if="!currentState?.relations?.length && !currentState?.location">
                暂无状态关联
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSandboxStore } from '@/stores/sandbox'
import type { ActiveEntityState } from '@/stores/sandbox'
import { getLogger } from '@/utils/logger'

const logger = getLogger('sandbox:document')

const sandboxStore = useSandboxStore()

// For the prototype, we assume the first entity is active if none selected.
// Real app should have a `sandboxStore.activeEntityId`.
const activeEntityId = computed(() => {
  return sandboxStore.entities.length > 0 ? sandboxStore.entities[0].id : null
})

const activeEntity = computed(() => {
  return sandboxStore.entities.find(e => e.id === activeEntityId.value)
})

// Extract the dynamic state computed by the Pinia reducer
const currentState = computed<ActiveEntityState | null>(() => {
  if (!activeEntityId.value) return null
  return sandboxStore.activeEntitiesState[activeEntityId.value] || null
})

function getEntityName(id: string) {
  const e = sandboxStore.entities.find(e => e.id === id)
  return e ? e.name : id
}

function saveEntity() {
  if (activeEntity.value) {
    // TODO: Implement persistence - currently edits are not saved
    logger.warn('saveEntity not yet implemented - edits will be lost')
  }
}
</script>

<style scoped>
.sandbox-document-container {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.entity-details {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.field-group {
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  padding: 20px;
}
.state-group {
  border-color: rgba(16, 185, 129, 0.2);
}

.field-title {
  font-size: 14px;
  color: var(--accent-glow);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}
.state-title {
  color: var(--accent-success);
}
.state-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.field-row { display: flex; gap: 16px; margin-bottom: 16px; }
.field { flex: 1; }
.field label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
.field input, .field textarea, .field select {
  width: 100%;
  background: rgba(0,0,0,0.4);
  border: 1px solid var(--border-color);
  color: white;
  padding: 10px;
  border-radius: 6px;
  outline: none;
  font-family: inherit;
  transition: all 0.3s;
}
.field input:focus, .field textarea:focus, .field select:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.3) inset;
}

.props-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.prop-item {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  padding: 8px 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
}
.prop-key {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.prop-val {
  font-size: 14px;
  color: var(--accent-success);
  font-weight: bold;
  margin-top: 4px;
}

.tag-container { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.3s;
}
.rel-tag {
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.4);
  color: #c4b5fd;
}
.loc-tag {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fcd34d;
}
.empty-tag {
  background: transparent;
  border: 1px dashed rgba(255,255,255,0.2);
  color: var(--text-muted);
}
</style>