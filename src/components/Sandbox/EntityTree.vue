<template>
  <div class="entity-tree">
    <div class="tree-header">
      <span class="tree-title">实体库</span>
      <el-button type="primary" text size="small" @click="createEntity">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>

    <el-input
      v-model="searchQuery"
      placeholder="搜索实体..."
      clearable
      size="small"
      class="tree-search"
    >
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>

    <div v-if="filteredGroups.length === 0 && searchQuery" class="tree-empty">
      <span>未找到匹配实体</span>
    </div>
    <div v-else-if="allEntities.length === 0" class="tree-empty">
      <span>暂无实体</span>
      <el-button type="primary" text size="small" @click="createEntity">
        创建第一个实体
      </el-button>
    </div>

    <el-scrollbar v-else class="tree-scroll">
      <div v-for="group in filteredGroups" :key="group.type" class="tree-group">
        <div class="group-header" @click="toggleGroup(group.type)">
          <el-icon class="group-arrow" :class="{ collapsed: collapsedGroups.has(group.type) }">
            <ArrowDown />
          </el-icon>
          <span class="group-icon">{{ typeIcons[group.type] }}</span>
          <span class="group-label">{{ typeLabels[group.type] }}</span>
          <span class="group-count">{{ group.entities.length }}</span>
        </div>
        <transition name="slide">
          <div v-show="!collapsedGroups.has(group.type)" class="group-items">
            <div
              v-for="entity in group.entities"
              :key="entity.id"
              class="tree-item"
              :class="{ active: entity.id === selectedEntityId }"
              @click="selectEntity(entity.id)"
            >
              <span
                class="item-dot"
                :style="{ background: entity.visualMeta?.color || importanceColors[entity.importance] }"
              ></span>
              <span class="item-name" :title="entity.name">{{ entity.name }}</span>
              <el-tag
                v-if="entity.importance === 'critical' || entity.importance === 'major'"
                size="small"
                :type="entity.importance === 'critical' ? 'danger' : 'warning'"
                class="item-tag"
              >
                {{ entity.importance === 'critical' ? '核心' : '重要' }}
              </el-tag>
            </div>
          </div>
        </transition>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, Search, ArrowDown } from '@element-plus/icons-vue'
import { useSandboxStore } from '@/stores/sandbox'
import { useProjectStore } from '@/stores/project'
import { generateId } from '@/utils/generateId'
import { ElMessage } from 'element-plus'
import type { EntityType, EntityImportance, Entity } from '@/types/sandbox'

const emit = defineEmits<{
  (e: 'select', entityId: string): void
}>()

const sandboxStore = useSandboxStore()
const projectStore = useProjectStore()

const searchQuery = ref('')
const selectedEntityId = ref<string | null>(null)
const collapsedGroups = ref(new Set<EntityType>())

const typeLabels: Record<EntityType, string> = {
  CHARACTER: '人物',
  FACTION: '势力',
  LOCATION: '地点',
  LORE: '设定',
  ITEM: '物品',
  CONCEPT: '概念',
  WORLD: '世界',
}

const typeIcons: Record<EntityType, string> = {
  CHARACTER: '👤',
  FACTION: '⚔️',
  LOCATION: '📍',
  LORE: '📜',
  ITEM: '🎒',
  CONCEPT: '💡',
  WORLD: '🌍',
}

const importanceColors: Record<EntityImportance, string> = {
  critical: '#f56c6c',
  major: '#e6a23c',
  minor: '#909399',
  background: '#c0c4cc',
}

const allEntities = computed(() =>
  sandboxStore.entities.filter(e => !e.isArchived)
)

interface EntityGroup {
  type: EntityType
  entities: Entity[]
}

const entityGroups = computed<EntityGroup[]>(() => {
  const typeOrder: EntityType[] = ['CHARACTER', 'FACTION', 'LOCATION', 'LORE', 'ITEM', 'CONCEPT', 'WORLD']
  const map = new Map<EntityType, Entity[]>()

  for (const entity of allEntities.value) {
    if (!map.has(entity.type)) map.set(entity.type, [])
    map.get(entity.type)!.push(entity)
  }

  return typeOrder
    .filter(type => map.has(type))
    .map(type => ({
      type,
      entities: (map.get(type) || []).sort((a, b) => {
        const importanceOrder: Record<EntityImportance, number> = { critical: 0, major: 1, minor: 2, background: 3 }
        return (importanceOrder[a.importance] ?? 4) - (importanceOrder[b.importance] ?? 4)
      })
    }))
})

const filteredGroups = computed<EntityGroup[]>(() => {
  if (!searchQuery.value.trim()) return entityGroups.value
  const query = searchQuery.value.trim().toLowerCase()
  return entityGroups.value
    .map(group => ({
      ...group,
      entities: group.entities.filter(e =>
        e.name.toLowerCase().includes(query) ||
        e.aliases.some(a => a.toLowerCase().includes(query))
      )
    }))
    .filter(group => group.entities.length > 0)
})

function toggleGroup(type: EntityType) {
  if (collapsedGroups.value.has(type)) {
    collapsedGroups.value.delete(type)
  } else {
    collapsedGroups.value.add(type)
  }
  // Force reactivity
  collapsedGroups.value = new Set(collapsedGroups.value)
}

function selectEntity(entityId: string) {
  selectedEntityId.value = entityId
  emit('select', entityId)
}

async function createEntity() {
  const projectId = projectStore.currentProject?.id
  if (!projectId) return

  const newEntity: Entity = {
    id: generateId() || Math.random().toString(36).slice(2),
    projectId,
    type: 'CHARACTER',
    name: '新角色',
    aliases: [],
    importance: 'minor',
    category: 'Supporting',
    systemPrompt: '',
    isArchived: false,
    createdAt: Date.now()
  }

  await sandboxStore.addEntity(newEntity)
  selectedEntityId.value = newEntity.id
  emit('select', newEntity.id)
  ElMessage.success('已创建新实体')
}
</script>

<style scoped>
.entity-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--ds-space-2);
}

.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--ds-space-1);
}

.tree-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.tree-search {
  flex-shrink: 0;
}

.tree-scroll {
  flex: 1;
  overflow: hidden;
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-6) 0;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
}

.group-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-2) var(--ds-space-1);
  cursor: pointer;
  user-select: none;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color var(--ds-transition-fast);
}

.group-header:hover {
  color: var(--ds-text-primary);
}

.group-arrow {
  transition: transform var(--ds-transition-fast);
  font-size: 12px;
}

.group-arrow.collapsed {
  transform: rotate(-90deg);
}

.group-icon {
  font-size: 14px;
}

.group-label {
  flex: 1;
}

.group-count {
  font-size: 10px;
  background: var(--ds-bg-tertiary);
  color: var(--ds-text-tertiary);
  padding: 0 var(--ds-space-1);
  border-radius: var(--ds-radius-full);
  min-width: 18px;
  text-align: center;
  line-height: 16px;
}

.group-items {
  padding-left: var(--ds-space-3);
}

.tree-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-2);
  padding: var(--ds-space-1) var(--ds-space-2);
  border-radius: var(--ds-radius-sm);
  cursor: pointer;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  transition: all var(--ds-transition-fast);
  white-space: nowrap;
  overflow: hidden;
}

.tree-item:hover {
  background: var(--ds-bg-hover);
  color: var(--ds-text-primary);
}

.tree-item.active {
  background: color-mix(in srgb, var(--ds-accent) 12%, transparent);
  color: var(--ds-accent-text);
}

.item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tag {
  flex-shrink: 0;
  transform: scale(0.85);
}

/* slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all var(--ds-transition-fast);
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
