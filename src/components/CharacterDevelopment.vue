<template>
  <div class="character-development">
    <!-- 人物选择器 -->
    <el-card shadow="hover" class="selector-card">
      <div class="selector-header">
        <span class="title">选择人物</span>
        <el-select
          v-model="selectedEntityId"
          placeholder="选择要查看成长轨迹的人物"
          filterable
          style="width: 300px"
        >
          <el-option
            v-for="entity in characterEntitiesWithEvents"
            :key="entity.id"
            :label="entity.name"
            :value="entity.id"
          >
            <span>{{ entity.name }}</span>
            <el-tag size="small" style="margin-left: 10px">{{ entity.eventCount }} 个成长节点</el-tag>
          </el-option>
        </el-select>
      </div>
    </el-card>

    <template v-if="selectedEntity">
      <!-- 人物基本信息 -->
      <el-card shadow="hover" class="info-card">
        <div class="character-info">
          <div class="info-main">
            <h3>{{ selectedEntity.name }}</h3>
            <div class="info-tags">
              <el-tag :type="getImportanceType(selectedEntity.importance)">
                {{ getImportanceLabel(selectedEntity.importance) }}
              </el-tag>
            </div>
          </div>
          <div class="info-stats">
            <div class="stat-item">
              <span class="stat-value">{{ entityStateEvents.length }}</span>
              <span class="stat-label">成长节点</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ uniqueChapterCount }}</span>
              <span class="stat-label">出场章节</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 成长时间线 -->
      <el-card shadow="hover" class="timeline-card">
        <template #header>
          <div class="card-header">
            <span>成长轨迹</span>
            <el-button type="primary" size="small" @click="addDevelopmentNode">
              <el-icon><Plus /></el-icon>
              添加节点
            </el-button>
          </div>
        </template>

        <div v-if="entityStateEvents.length === 0" class="empty-state">
          <el-empty description="暂无成长记录">
            <el-button type="primary" @click="addDevelopmentNode">添加第一个成长节点</el-button>
          </el-empty>
        </div>

        <div v-else class="timeline-container">
          <el-timeline>
            <el-timeline-item
              v-for="(evt, index) in entityStateEvents"
              :key="evt.id"
              :timestamp="`第 ${evt.chapterNumber} 章`"
              :type="getTimelineType(index)"
              :hollow="true"
              size="large"
              placement="top"
            >
              <el-card shadow="hover" class="timeline-card-item">
                <div class="development-header">
                  <div class="development-title">
                    <el-tag type="primary" effect="plain">第 {{ evt.chapterNumber }} 章</el-tag>
                    <h4>{{ getEventTitle(evt) }}</h4>
                  </div>
                  <div class="development-actions">
                    <el-button text type="primary" size="small" @click="editDevelopmentNode(evt)">
                      编辑
                    </el-button>
                    <el-button text type="danger" size="small" @click="deleteDevelopmentNode(evt.id)">
                      删除
                    </el-button>
                    <el-button text type="primary" size="small" @click="goToChapter(evt.chapterNumber)">
                      查看章节
                    </el-button>
                  </div>
                </div>

                <div class="development-content">
                  <div class="growth-section">
                    <div class="section-label">成长内容</div>
                    <p>{{ getEventDescription(evt) }}</p>
                  </div>

                  <!-- 显示能力变化 -->
                  <div v-if="evt.eventType === 'ABILITY_CHANGE'" class="changes-section">
                    <div class="section-label">能力变化</div>
                    <div class="ability-changes">
                      <el-tag
                        :type="getAbilityStatusType(evt.payload.abilityStatus)"
                        style="margin-right: 8px; margin-bottom: 8px;"
                      >
                        {{ getAbilityStatusLabel(evt.payload.abilityStatus) }}
                        {{ evt.payload.abilityName }}
                      </el-tag>
                    </div>
                  </div>

                  <!-- 显示关系变化 -->
                  <div v-if="isRelationEvent(evt)" class="changes-section">
                    <div class="section-label">关系变化</div>
                    <div class="relationship-changes">
                      <div class="relationship-change">
                        <el-tag type="info">{{ getEntityName(evt.payload.targetId || '') }}</el-tag>
                        <span class="change-arrow">→</span>
                        <el-tag :type="getRelationType(evt.payload.relationType || '')">{{ getRelationLabel(evt.payload.relationType || '') }}</el-tag>
                      </div>
                    </div>
                  </div>

                  <!-- 显示状态变化 -->
                  <div v-if="evt.eventType === 'VITAL_STATUS_CHANGE'" class="changes-section">
                    <div class="section-label">状态变化</div>
                    <div class="state-change">
                      <div class="state-item">
                        <span class="state-label">状态：</span>
                        <span class="state-new">{{ evt.payload.status }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- 显示位置变化 -->
                  <div v-if="evt.eventType === 'LOCATION_MOVE'" class="changes-section">
                    <div class="section-label">位置变化</div>
                    <div class="state-change">
                      <div class="state-item">
                        <span class="state-label">位置：</span>
                        <span class="state-new">{{ formatCoordinates(evt.payload.coordinates) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-card>

      <!-- 成长统计 -->
      <el-card shadow="hover" class="stats-card">
        <template #header>
          <span>成长统计</span>
        </template>

        <el-row :gutter="20">
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ eventsByType.ability }}</div>
              <div class="stat-label">能力成长</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ eventsByType.relationship }}</div>
              <div class="stat-label">关系变化</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-box">
              <div class="stat-value">{{ eventsByType.state }}</div>
              <div class="stat-label">状态转变</div>
            </div>
          </el-col>
        </el-row>
      </el-card>
    </template>

    <!-- 编辑成长节点对话框 -->
    <el-dialog
      v-model="showEditDialog"
      :title="editingEventId ? '编辑成长节点' : '添加成长节点'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="nodeForm" label-width="100px">
        <el-form-item label="所在章节" required>
          <el-input-number v-model="nodeForm.chapterNumber" :min="1" :max="maxChapter" />
        </el-form-item>

        <el-form-item label="事件类型" required>
          <el-select v-model="nodeForm.eventType" placeholder="选择事件类型">
            <el-option
              v-for="option in EVENT_TYPE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <!-- PROPERTY_UPDATE fields -->
        <template v-if="nodeForm.eventType === 'PROPERTY_UPDATE'">
          <el-form-item label="属性名" required>
            <el-input v-model="nodeForm.payload.key" placeholder="属性名称" />
          </el-form-item>
          <el-form-item label="属性值" required>
            <el-input v-model="nodeForm.payload.value" placeholder="属性值" />
          </el-form-item>
        </template>

        <!-- VITAL_STATUS_CHANGE fields -->
        <template v-if="nodeForm.eventType === 'VITAL_STATUS_CHANGE'">
          <el-form-item label="新状态" required>
            <el-input v-model="nodeForm.payload.status" placeholder="生命状态" />
          </el-form-item>
        </template>

        <template v-if="nodeForm.eventType === 'ABILITY_CHANGE'">
          <el-form-item label="能力名称" required>
            <el-input v-model="nodeForm.payload.abilityName" placeholder="能力名称" />
          </el-form-item>
          <el-form-item label="能力状态" required>
            <el-select v-model="nodeForm.payload.abilityStatus" placeholder="选择状态">
              <el-option
                v-for="option in ABILITY_STATUS_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </template>

        <template v-if="RELATION_EVENT_TYPES.includes(nodeForm.eventType)">
          <el-form-item label="目标人物" required>
            <el-select v-model="nodeForm.payload.targetId" placeholder="选择人物" filterable>
              <el-option
                v-for="entity in otherEntities"
                :key="entity.id"
                :label="entity.name"
                :value="entity.id"
              />
            </el-select>
          </el-form-item>
        </template>

        <!-- RELATION_ADD / RELATION_UPDATE fields -->
        <template v-if="nodeForm.eventType === 'RELATION_ADD' || nodeForm.eventType === 'RELATION_UPDATE'">
          <el-form-item label="关系类型" required>
            <el-select v-model="nodeForm.payload.relationType" placeholder="关系类型">
              <el-option
                v-for="option in RELATION_TYPE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item v-if="nodeForm.eventType === 'RELATION_UPDATE'" label="态度">
            <el-input v-model="nodeForm.payload.attitude" placeholder="态度描述" />
          </el-form-item>
        </template>

        <!-- LOCATION_MOVE fields -->
        <template v-if="nodeForm.eventType === 'LOCATION_MOVE'">
          <el-form-item label="X 坐标" required>
            <el-input-number v-model="nodeForm.payload.coordX" />
          </el-form-item>
          <el-form-item label="Y 坐标" required>
            <el-input-number v-model="nodeForm.payload.coordY" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNode" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSandboxStore, type ResolvedEntity } from '@/stores/sandbox'
import type { Entity, EntityImportance, StateEvent, StateEventType } from '@/types/sandbox'
import { useProjectStore } from '@/stores/project'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import { getLogger } from '@/utils/logger'
import {
  STATE_EVENT_TYPE_LABELS,
  RELATION_EVENT_TYPES,
  STATE_CATEGORY_EVENT_TYPES,
  ABILITY_STATUS_TAG_TYPE,
  ABILITY_STATUS_LABELS,
  ABILITY_STATUS_OPTIONS,
  RELATION_TYPE_TAG_TYPE,
  RELATION_TYPE_LABELS,
  RELATION_TYPE_OPTIONS,
  IMPORTANCE_LABELS,
  IMPORTANCE_TAG_TYPE,
  type AbilityStatus,
  type RelationType
} from '@/utils/eventTypeLabels'

const logger = getLogger('components:CharacterDevelopment')

const sandboxStore = useSandboxStore()
const projectStore = useProjectStore()
const router = useRouter()

const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

// Only CHARACTER type entities
const characterEntities = sandboxStore.characterEntities

const selectedEntityId = ref<string>('')
const showEditDialog = ref(false)
const editingEventId = ref<string | null>(null)
const saving = ref(false)

const EVENT_TYPE_OPTIONS: Array<{ value: StateEventType; label: string }> = (
  Object.entries(STATE_EVENT_TYPE_LABELS) as Array<[StateEventType, string]>
).map(([value, label]) => ({ value, label }))

// Resolved entity for the selected character
const selectedEntity = computed<ResolvedEntity | null>(() => {
  if (!selectedEntityId.value) return null
  return sandboxStore.activeEntitiesState[selectedEntityId.value] || null
})

const stateEventIndexes = sandboxStore.stateEventIndexes

// State events for the selected entity, sorted by chapter
const entityStateEvents = computed<StateEvent[]>(() => {
  if (!selectedEntityId.value) return []
  return stateEventIndexes.eventsByEntity.get(selectedEntityId.value) || []
})

// Unique chapters the entity appears in
const uniqueChapterCount = computed<number>(() => {
  const chapterSet = new Set(entityStateEvents.value.map(e => e.chapterNumber))
  return chapterSet.size
})

const characterEntitiesWithEvents = computed<Array<Entity & { eventCount: number }>>(() =>
  characterEntities
    .map(e => ({
      ...e,
      eventCount: stateEventIndexes.countsByEntity.get(e.id) || 0
    }))
    .sort((a, b) => b.eventCount - a.eventCount)
)

// Other CHARACTER entities (for relation dropdowns)
const otherEntities = computed<Entity[]>(() =>
  characterEntities.filter(e => e.id !== selectedEntityId.value)
)

const maxChapter = computed<number>(() =>
  chapters.value.length > 0 ? Math.max(...chapters.value.map(c => c.number)) : 1
)

// Stats by category
const eventsByType = computed(() => {
  const events = entityStateEvents.value
  return {
    ability: events.filter(e => e.eventType === 'ABILITY_CHANGE').length,
    relationship: events.filter(e => RELATION_EVENT_TYPES.includes(e.eventType)).length,
    state: events.filter(e => STATE_CATEGORY_EVENT_TYPES.includes(e.eventType)).length
  }
})

// --- Display helpers ---

function getImportanceType(importance: EntityImportance): string {
  return IMPORTANCE_TAG_TYPE[importance] || 'info'
}

function getImportanceLabel(importance: EntityImportance): string {
  return IMPORTANCE_LABELS[importance] || importance
}

function getEventTitle(evt: StateEvent): string {
  return STATE_EVENT_TYPE_LABELS[evt.eventType] || evt.eventType
}

function getEventDescription(evt: StateEvent): string {
  switch (evt.eventType) {
    case 'PROPERTY_UPDATE':
      return `${evt.payload.key ?? ''} 变更为 ${evt.payload.value ?? ''}`
    case 'VITAL_STATUS_CHANGE':
      return `生命状态变更为：${evt.payload.status ?? ''}`
    case 'ABILITY_CHANGE':
      return `能力「${evt.payload.abilityName ?? ''}」${getAbilityStatusLabel(evt.payload.abilityStatus)}`
    case 'RELATION_ADD':
      return `与 ${getEntityName(evt.payload.targetId || '')} 建立了 ${getRelationLabel(evt.payload.relationType || '')} 关系`
    case 'RELATION_REMOVE':
      return `与 ${getEntityName(evt.payload.targetId || '')} 的关系解除`
    case 'RELATION_UPDATE':
      return `与 ${getEntityName(evt.payload.targetId || '')} 的关系更新，态度：${evt.payload.attitude ?? ''}`
    case 'LOCATION_MOVE':
      return `位置迁移至 ${formatCoordinates(evt.payload.coordinates)}`
    default:
      return ''
  }
}

function isRelationEvent(evt: StateEvent): boolean {
  return RELATION_EVENT_TYPES.includes(evt.eventType)
}

function formatCoordinates(coords: { x: number; y: number } | undefined): string {
  if (!coords) return '未知'
  return `(${coords.x}, ${coords.y})`
}

function getEntityName(id: string): string {
  const entity = sandboxStore.entities.find(e => e.id === id)
  return entity?.name || id
}

function getAbilityStatusType(status: string | undefined): string {
  return ABILITY_STATUS_TAG_TYPE[status as AbilityStatus] || 'info'
}

function getAbilityStatusLabel(status: string | undefined): string {
  return ABILITY_STATUS_LABELS[status as AbilityStatus] || '变化'
}

function getRelationType(type: string): string {
  return RELATION_TYPE_TAG_TYPE[type as RelationType] || ''
}

function getRelationLabel(type: string): string {
  return RELATION_TYPE_LABELS[type as RelationType] || type
}

function getTimelineType(index: number): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const types: ('primary' | 'success' | 'warning' | 'danger' | 'info')[] = ['primary', 'success', 'warning', 'danger', 'info']
  return types[index % types.length]
}

// --- Dialog form state ---

interface NodeFormPayload {
  key: string
  value: string
  targetId: string
  relationType: string
  attitude: string
  status: string
  abilityName: string
  abilityStatus: string
  coordX: number
  coordY: number
}

interface NodeForm {
  chapterNumber: number
  eventType: StateEventType
  payload: NodeFormPayload
}

const nodeForm = ref<NodeForm>(createEmptyForm())

function createEmptyForm(): NodeForm {
  return {
    chapterNumber: 1,
    eventType: 'PROPERTY_UPDATE',
    payload: {
      key: '',
      value: '',
      targetId: '',
      relationType: 'other',
      attitude: '',
      status: '',
      abilityName: '',
      abilityStatus: 'active',
      coordX: 0,
      coordY: 0
    }
  }
}

function addDevelopmentNode() {
  editingEventId.value = null
  nodeForm.value = createEmptyForm()
  showEditDialog.value = true
}

function editDevelopmentNode(evt: StateEvent) {
  editingEventId.value = evt.id
  nodeForm.value = {
    chapterNumber: evt.chapterNumber,
    eventType: evt.eventType,
    payload: {
      key: evt.payload.key || '',
      value: evt.payload.value || '',
      targetId: evt.payload.targetId || '',
      relationType: evt.payload.relationType || 'other',
      attitude: evt.payload.attitude || '',
      status: evt.payload.status || '',
      abilityName: evt.payload.abilityName || '',
      abilityStatus: evt.payload.abilityStatus || 'active',
      coordX: evt.payload.coordinates?.x ?? 0,
      coordY: evt.payload.coordinates?.y ?? 0
    }
  }
  showEditDialog.value = true
}

async function saveNode() {
  if (!selectedEntityId.value) return

  const form = nodeForm.value

  // Basic validation
  if (!form.eventType) {
    ElMessage.warning('请选择事件类型')
    return
  }

  saving.value = true
  try {
    const projectId = project.value?.id || ''
    const entityId = selectedEntityId.value

    // Build the payload from the form
    const payload: StateEvent['payload'] = {}

    switch (form.eventType) {
      case 'PROPERTY_UPDATE':
        if (!form.payload.key.trim()) {
          ElMessage.warning('请输入属性名')
          return
        }
        payload.key = form.payload.key
        payload.value = form.payload.value
        break
      case 'VITAL_STATUS_CHANGE':
        if (!form.payload.status.trim()) {
          ElMessage.warning('请输入生命状态')
          return
        }
        payload.status = form.payload.status
        break
      case 'ABILITY_CHANGE':
        if (!form.payload.abilityName.trim()) {
          ElMessage.warning('请输入能力名称')
          return
        }
        payload.abilityName = form.payload.abilityName
        payload.abilityStatus = form.payload.abilityStatus
        break
      case 'RELATION_ADD':
      case 'RELATION_UPDATE':
        if (!form.payload.targetId) {
          ElMessage.warning('请选择目标人物')
          return
        }
        payload.targetId = form.payload.targetId
        payload.relationType = form.payload.relationType
        if (form.eventType === 'RELATION_UPDATE') {
          payload.attitude = form.payload.attitude
        }
        break
      case 'RELATION_REMOVE':
        if (!form.payload.targetId) {
          ElMessage.warning('请选择目标人物')
          return
        }
        payload.targetId = form.payload.targetId
        payload.relationType = form.payload.relationType || undefined
        break
      case 'LOCATION_MOVE':
        payload.coordinates = { x: form.payload.coordX, y: form.payload.coordY }
        break
    }

    if (editingEventId.value) {
      // For edits, delete the old event first (persists to backend), then add replacement
      await sandboxStore.deleteStateEvent(editingEventId.value)

      const updatedEvent: StateEvent = {
        id: editingEventId.value,
        projectId,
        chapterNumber: form.chapterNumber,
        entityId,
        eventType: form.eventType,
        payload,
        source: 'MANUAL'
      }
      await sandboxStore.addStateEvent(updatedEvent)
    } else {
      const newEvent: StateEvent = {
        id: uuidv4(),
        projectId,
        chapterNumber: form.chapterNumber,
        entityId,
        eventType: form.eventType,
        payload,
        source: 'MANUAL'
      }
      await sandboxStore.addStateEvent(newEvent)
    }

    ElMessage.success('保存成功')
    showEditDialog.value = false
  } catch (error) {
    logger.error('保存失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function deleteDevelopmentNode(eventId: string) {
  if (!selectedEntityId.value) return

  try {
    await ElMessageBox.confirm('确定要删除这个成长节点吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const evt = sandboxStore.stateEvents.find(e => e.id === eventId)
    if (evt) {
      await sandboxStore.deleteStateEvent(evt.id)
    }

    ElMessage.success('删除成功')
  } catch {
    // User cancelled
  }
}

function goToChapter(chapterNumber: number) {
  if (project.value) {
    router.push(`/project/${project.value.id}/chapters?chapter=${chapterNumber}`)
  }
}

// Auto-select the first character entity with events
watch(characterEntitiesWithEvents, (newEntities) => {
  if (!selectedEntityId.value && newEntities.length > 0) {
    const withEvents = newEntities.find(e => e.eventCount > 0)
    selectedEntityId.value = withEvents?.id || newEntities[0].id
  }
}, { immediate: true })
</script>

<style scoped>
.character-development {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.selector-card {
  margin-bottom: 0;
}

.selector-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.selector-header .title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.info-card {
  margin-bottom: 0;
}

.character-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-main h3 {
  margin: 0 0 10px 0;
  font-size: 20px;
}

.info-tags {
  display: flex;
  gap: 8px;
}

.info-stats {
  display: flex;
  gap: 30px;
}

.stat-item {
  text-align: center;
}

.stat-item .stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #409EFF;
}

.stat-item .stat-label {
  font-size: 12px;
  color: #909399;
}

.timeline-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-state {
  padding: 40px 0;
}

.timeline-container {
  padding: 20px 0;
}

.timeline-card-item {
  margin-bottom: 0;
}

.development-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.development-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.development-title h4 {
  margin: 0;
  font-size: 16px;
}

.development-actions {
  display: flex;
  gap: 5px;
}

.development-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 8px;
}

.growth-section p {
  margin: 0;
  line-height: 1.6;
  color: #606266;
}

.changes-section {
  padding-top: 10px;
  border-top: 1px dashed #E4E7ED;
}

.ability-changes,
.relationship-changes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.relationship-change {
  display: flex;
  align-items: center;
  gap: 8px;
}

.change-arrow {
  color: #909399;
}

.state-change {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-item {
  display: flex;
  align-items: center;
}

.state-label {
  width: 50px;
  color: #909399;
  font-size: 13px;
}

.state-old {
  color: #909399;
}

.state-new {
  color: #409EFF;
  font-weight: 600;
}

.stats-card {
  margin-bottom: 0;
}

.stat-box {
  text-align: center;
  padding: 20px;
  background: #F5F7FA;
  border-radius: 8px;
}

.stat-box .stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409EFF;
}

.stat-box .stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
}

.ability-changes-editor,
.relationship-changes-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.change-item {
  display: flex;
  align-items: center;
}

.state-change-editor {
  width: 100%;
}
</style>
