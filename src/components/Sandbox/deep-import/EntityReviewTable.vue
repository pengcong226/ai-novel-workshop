<template>
  <div class="entity-review-table">
    <el-table :data="entities" border size="small" max-height="500" style="width: 100%">
      <el-table-column type="index" width="40" />
      <el-table-column prop="name" label="名称" min-width="100">
        <template #default="{ row }">
          <el-input v-model="row.name" size="small" />
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型" width="110">
        <template #default="{ row }">
          <el-select v-model="row.type" size="small">
            <el-option label="角色" value="CHARACTER" />
            <el-option label="势力" value="FACTION" />
            <el-option label="地点" value="LOCATION" />
            <el-option label="传说" value="LORE" />
            <el-option label="物品" value="ITEM" />
            <el-option label="概念" value="CONCEPT" />
            <el-option label="世界" value="WORLD" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="importance" label="重要度" width="100">
        <template #default="{ row }">
          <el-select v-model="row.importance" size="small">
            <el-option label="核心" value="critical" />
            <el-option label="重要" value="major" />
            <el-option label="次要" value="minor" />
            <el-option label="背景" value="background" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="category" label="分类" width="90">
        <template #default="{ row }">
          <el-input v-model="row.category" size="small" />
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="180">
        <template #default="{ row }">
          <el-input v-model="row.description" type="textarea" size="small" :rows="2" />
        </template>
      </el-table-column>
      <el-table-column prop="aliases" label="别名" width="120">
        <template #default="{ row }">
          <el-tag v-for="alias in row.aliases" :key="alias" size="small" closable @close="removeAlias(row, alias)">{{ alias }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="证据" width="200">
        <template #default="{ row }">
          <EvidenceHighlight v-if="row.evidence" :evidence="row.evidence" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="60" fixed="right">
        <template #default="{ $index }">
          <el-button type="danger" size="small" text @click="removeEntity($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import type { ExtractedEntityCandidate } from '@/types/deep-import'
import EvidenceHighlight from './EvidenceHighlight.vue'

const props = defineProps<{
  entities: ExtractedEntityCandidate[]
}>()

function removeAlias(entity: ExtractedEntityCandidate, alias: string) {
  const idx = entity.aliases.indexOf(alias)
  if (idx !== -1) entity.aliases.splice(idx, 1)
}

function removeEntity(index: number) {
  const entities = props.entities
  entities.splice(index, 1)
}
</script>

<style scoped>
.entity-review-table {
  width: 100%;
}
</style>
