<template>
  <div class="state-diff-viewer">
    <div class="diff-header">
      <h4>改写差异报告 ({{ report.diffs.length }} 项变化)</h4>
      <div class="diff-stats">
        <el-tag type="warning">{{ report.diffs.length }} 项变化</el-tag>
        <el-tag type="success">{{ report.newEntities.length }} 新实体</el-tag>
        <el-tag v-if="report.brokenForeshadowing.length > 0" type="danger">
          {{ report.brokenForeshadowing.length }} 伏笔断裂
        </el-tag>
      </div>
    </div>

    <el-tabs v-model="activeTab">
      <!-- Entity Changes -->
      <el-tab-pane label="实体变化" name="changes">
        <el-table :data="report.diffs" border size="small" max-height="400">
          <el-table-column prop="entityName" label="实体" width="100" />
          <el-table-column prop="category" label="类型" width="120">
            <template #default="{ row }">
              <el-tag :type="categoryTagType(row.category)" size="small">
                {{ categoryLabel(row.category) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="150" />
          <el-table-column label="之前" width="120">
            <template #default="{ row }">
              <span class="before-val">{{ row.before || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="之后" width="120">
            <template #default="{ row }">
              <span class="after-val">{{ row.after || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row, $index }">
              <el-button-group>
                <el-button
                  size="small"
                  :type="row.accepted === true ? 'success' : ''"
                  @click="setAccepted($index, true)"
                >接受</el-button>
                <el-button
                  size="small"
                  :type="row.accepted === false ? 'danger' : ''"
                  @click="setAccepted($index, false)"
                >拒绝</el-button>
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- New Entities -->
      <el-tab-pane :label="`新实体 (${report.newEntities.length})`" name="new">
        <div v-if="report.newEntities.length === 0" class="empty-state">无新实体</div>
        <div v-else class="new-entity-list">
          <el-tag v-for="entity in report.newEntities" :key="entity.id" style="margin: 2px;">
            {{ entity.name }} ({{ entity.type }})
          </el-tag>
        </div>
      </el-tab-pane>

      <!-- Broken Foreshadowing -->
      <el-tab-pane :label="`伏笔断裂 (${report.brokenForeshadowing.length})`" name="foreshadowing">
        <div v-if="report.brokenForeshadowing.length === 0" class="empty-state">无断裂伏笔</div>
        <div v-else class="foreshadowing-list">
          <el-alert
            v-for="(fs, i) in report.brokenForeshadowing"
            :key="i"
            :title="`第${fs.plantedInChapter}章伏笔断裂`"
            :description="fs.reason"
            type="warning"
            show-icon
            style="margin-bottom: 8px;"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <div class="diff-actions">
      <el-button @click="acceptAll">全部接受</el-button>
      <el-button type="danger" plain @click="rejectAll">全部拒绝</el-button>
      <el-button type="primary" @click="$emit('accept')">确认接受改写</el-button>
      <el-button @click="$emit('reject')">撤销改写</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { StateDiffReport, StateDiffCategory } from '@/types/rewrite-continuation'

const props = defineProps<{
  report: StateDiffReport
}>()

defineEmits<{
  (e: 'accept'): void
  (e: 'reject'): void
}>()

const activeTab = ref('changes')

function categoryLabel(cat: StateDiffCategory): string {
  const map: Record<StateDiffCategory, string> = {
    property_added: '属性新增', property_removed: '属性移除', property_changed: '属性变更',
    relation_added: '关系建立', relation_removed: '关系解除', relation_changed: '关系变化',
    location_changed: '位置变化', vital_status_changed: '生死变化',
    ability_changed: '能力变化', entity_added: '新实体', entity_removed: '实体消失'
  }
  return map[cat] || cat
}

function categoryTagType(cat: StateDiffCategory): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (cat === 'property_added' || cat === 'relation_added' || cat === 'entity_added') return 'success'
  if (cat === 'property_removed' || cat === 'relation_removed' || cat === 'entity_removed' || cat === 'vital_status_changed') return 'danger'
  return 'warning'
}

function setAccepted(index: number, accepted: boolean) {
  const diff = props.report.diffs[index]
  if (!diff) return
  Object.assign(diff, { accepted })
}

function acceptAll() {
  props.report.diffs.forEach(diff => {
    Object.assign(diff, { accepted: true })
  })
}

function rejectAll() {
  props.report.diffs.forEach(diff => {
    Object.assign(diff, { accepted: false })
  })
}
</script>

<style scoped>
.state-diff-viewer {
  padding: 12px 0;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.diff-header h4 { margin: 0; }

.diff-stats {
  display: flex;
  gap: 8px;
}

.before-val { color: #f56c6c; font-size: 12px; }
.after-val { color: #67c23a; font-size: 12px; }

.empty-state {
  text-align: center;
  color: #909399;
  padding: 20px;
}

.new-entity-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.foreshadowing-list {
  max-height: 400px;
  overflow-y: auto;
}

.diff-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>