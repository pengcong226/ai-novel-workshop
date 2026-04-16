<template>
  <div class="conflict-report">
    <el-card class="header-card">
      <div class="header">
        <h2>冲突检测</h2>
        <div class="actions">
          <el-button @click="showConfigDialog = true">
            <el-icon><Setting /></el-icon>
            配置
          </el-button>
          <el-button type="primary" @click="runDetection" :loading="detecting">
            <el-icon><Search /></el-icon>
            开始检测
          </el-button>
          <el-button @click="exportReport" :disabled="!result">
            <el-icon><Download /></el-icon>
            导出报告
          </el-button>
        </div>
      </div>
    </el-card>

    <div v-if="!result" class="empty-state">
      <el-empty description="还没有进行冲突检测">
        <el-button type="primary" @click="runDetection">开始检测</el-button>
      </el-empty>
    </div>

    <div v-else class="content">
      <!-- 统计概览 -->
      <el-card class="statistics-card">
        <template #header>
          <div class="card-header">
            <span>检测概览</span>
            <span class="detect-time">{{ formatDate(result.detectedAt) }}</span>
          </div>
        </template>

        <el-row :gutter="20">
          <el-col :span="6">
            <div class="stat-item">
              <div class="stat-value">{{ result.statistics.total }}</div>
              <div class="stat-label">总计</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-item critical">
              <div class="stat-value">{{ result.statistics.critical }}</div>
              <div class="stat-label">严重</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-item warning">
              <div class="stat-value">{{ result.statistics.warning }}</div>
              <div class="stat-label">警告</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-item info">
              <div class="stat-value">{{ result.statistics.info }}</div>
              <div class="stat-label">提示</div>
            </div>
          </el-col>
        </el-row>

        <el-divider />

        <!-- 按类型统计 -->
        <div class="type-statistics">
          <h4>按类型统计</h4>
          <div class="type-list">
            <div
              v-for="(count, type) in result.statistics.byType"
              :key="type"
              class="type-item"
            >
              <span class="type-name">{{ getTypeName(type as ConflictType) }}</span>
              <el-tag>{{ count }}</el-tag>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 筛选器 -->
      <el-card class="filter-card">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-select v-model="filterType" placeholder="冲突类型" clearable>
              <el-option label="全部" value="" />
              <el-option label="人物设定" value="character_personality" />
              <el-option label="人物能力" value="character_ability" />
              <el-option label="人物外貌" value="character_appearance" />
              <el-option label="时间线" value="timeline_age" />
              <el-option label="世界观" value="world_rule" />
              <el-option label="情节逻辑" value="plot_logic" />
              <el-option label="伏笔" value="foreshadowing" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-select v-model="filterSeverity" placeholder="严重程度" clearable>
              <el-option label="全部" value="" />
              <el-option label="严重" value="critical" />
              <el-option label="警告" value="warning" />
              <el-option label="提示" value="info" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-select v-model="filterStatus" placeholder="状态" clearable>
              <el-option label="全部" value="" />
              <el-option label="活动" value="active" />
              <el-option label="已忽略" value="ignored" />
              <el-option label="已解决" value="resolved" />
            </el-select>
          </el-col>
          <el-col :span="6">
            <el-button @click="clearFilters">清除筛选</el-button>
          </el-col>
        </el-row>
      </el-card>

      <!-- 冲突列表 -->
      <div class="conflicts-list">
        <el-card
          v-for="conflict in filteredConflicts"
          :key="conflict.id"
          class="conflict-card"
          :class="`severity-${conflict.severity}`"
        >
          <div class="conflict-header">
            <div class="conflict-title">
              <el-tag
                :type="getSeverityType(conflict.severity)"
                size="small"
              >
                {{ getSeverityText(conflict.severity) }}
              </el-tag>
              <span class="title-text">{{ conflict.title }}</span>
            </div>
            <div class="conflict-actions">
              <el-button
                v-if="conflict.status === 'active'"
                size="small"
                @click="ignoreConflict(conflict)"
              >
                忽略
              </el-button>
              <el-button
                v-if="conflict.status === 'ignored'"
                size="small"
                @click="restoreConflict(conflict)"
              >
                恢复
              </el-button>
              <el-button
                size="small"
                type="primary"
                @click="viewConflictDetail(conflict)"
              >
                查看详情
              </el-button>
            </div>
          </div>

          <el-divider />

          <div class="conflict-body">
            <div class="conflict-description">
              {{ conflict.description }}
            </div>

            <div v-if="conflict.evidences.length > 0" class="evidences">
              <h4>证据</h4>
              <div
                v-for="(evidence, index) in conflict.evidences"
                :key="index"
                class="evidence-item"
              >
                <el-icon><Document /></el-icon>
                <span>{{ evidence.description }}</span>
                <el-tag v-if="evidence.chapterNumber" size="small">
                  第{{ evidence.chapterNumber }}章
                </el-tag>
              </div>
            </div>

            <div v-if="conflict.suggestions.length > 0" class="suggestions">
              <h4>修复建议</h4>
              <div
                v-for="suggestion in conflict.suggestions"
                :key="suggestion.id"
                class="suggestion-item"
              >
                <el-icon><Warning /></el-icon>
                <span>{{ suggestion.description }}</span>
                <el-progress
                  :percentage="suggestion.confidence * 100"
                  :format="() => `${(suggestion.confidence * 100).toFixed(0)}%`"
                  style="width: 100px"
                />
              </div>
            </div>

            <div class="conflict-meta">
              <el-tag v-if="conflict.relatedChapters && conflict.relatedChapters.length > 0">
                章节：{{ conflict.relatedChapters.join(', ') }}
              </el-tag>
              <el-tag v-if="conflict.status === 'ignored'" type="info">
                已忽略
              </el-tag>
              <el-tag v-if="conflict.status === 'resolved'" type="success">
                已解决
              </el-tag>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 配置对话框 -->
    <el-dialog
      v-model="showConfigDialog"
      title="检测配置"
      width="600px"
    >
      <el-form :model="config" label-width="150px">
        <el-divider content-position="left">检测范围</el-divider>

        <el-form-item label="人物设定冲突">
          <el-switch v-model="config.enableCharacterConflicts" />
        </el-form-item>

        <el-form-item label="时间线冲突">
          <el-switch v-model="config.enableTimelineConflicts" />
        </el-form-item>

        <el-form-item label="世界观冲突">
          <el-switch v-model="config.enableWorldConflicts" />
        </el-form-item>

        <el-form-item label="情节逻辑检测">
          <el-switch v-model="config.enablePlotLogicConflicts" />
        </el-form-item>

        <el-form-item label="伏笔检测">
          <el-switch v-model="config.enableForeshadowingConflicts" />
        </el-form-item>

        <el-divider content-position="left">检测参数</el-divider>

        <el-form-item label="性格变化阈值">
          <el-slider
            v-model="config.personalityChangeThreshold"
            :min="0"
            :max="1"
            :step="0.1"
            show-input
          />
          <div class="form-item-hint">值越小越严格，检测出更多潜在冲突</div>
        </el-form-item>

        <el-form-item label="时间跨度容忍度">
          <el-input-number
            v-model="config.timeDurationTolerance"
            :min="1"
            :max="30"
          />
          <span>天</span>
        </el-form-item>

        <el-form-item label="年龄误差容忍度">
          <el-input-number
            v-model="config.ageErrorTolerance"
            :min="0"
            :max="5"
          />
          <span>岁</span>
        </el-form-item>

        <el-form-item label="最小置信度阈值">
          <el-slider
            v-model="config.minConfidenceThreshold"
            :min="0"
            :max="1"
            :step="0.1"
            show-input
          />
          <div class="form-item-hint">低于此阈值的冲突将被忽略</div>
        </el-form-item>

        <el-form-item label="忽略已标记冲突">
          <el-switch v-model="config.ignoreMarkedConflicts" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showConfigDialog = false">取消</el-button>
        <el-button type="primary" @click="saveConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- 冲突详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      title="冲突详情"
      width="70%"
    >
      <div v-if="selectedConflict" class="conflict-detail">
        <div class="detail-header">
          <el-tag :type="getSeverityType(selectedConflict.severity)">
            {{ getSeverityText(selectedConflict.severity) }}
          </el-tag>
          <el-tag>{{ getTypeName(selectedConflict.type) }}</el-tag>
          <span class="detail-title">{{ selectedConflict.title }}</span>
        </div>

        <el-divider />

        <div class="detail-section">
          <h4>描述</h4>
          <p>{{ selectedConflict.description }}</p>
        </div>

        <div v-if="selectedConflict.evidences.length > 0" class="detail-section">
          <h4>证据</h4>
          <el-table :data="selectedConflict.evidences" border>
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="description" label="描述" />
            <el-table-column label="章节" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.chapterNumber">第{{ row.chapterNumber }}章</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="textSnippet" label="原文片段">
              <template #default="{ row }">
                <div class="text-snippet">{{ row.textSnippet || '-' }}</div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="selectedConflict.suggestions.length > 0" class="detail-section">
          <h4>修复建议</h4>
          <el-table :data="selectedConflict.suggestions" border>
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="row.type === 'auto' ? 'success' : 'info'">
                  {{ row.type === 'auto' ? '自动' : '手动' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="建议" />
            <el-table-column label="置信度" width="150">
              <template #default="{ row }">
                <el-progress
                  :percentage="row.confidence * 100"
                  :format="() => `${(row.confidence * 100).toFixed(0)}%`"
                />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="detail-section">
          <h4>元数据</h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="创建时间">
              {{ formatDate(selectedConflict.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="更新时间">
              {{ formatDate(selectedConflict.updatedAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="相关章节">
              {{ selectedConflict.relatedChapters?.join(', ') || '无' }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getStatusType(selectedConflict.status)">
                {{ getStatusText(selectedConflict.status) }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <div v-if="selectedConflict.notes" class="detail-section">
          <h4>备注</h4>
          <p>{{ selectedConflict.notes }}</p>
        </div>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button
          v-if="selectedConflict && selectedConflict.status === 'active'"
          @click="ignoreConflict(selectedConflict)"
        >
          忽略
        </el-button>
        <el-button
          v-if="selectedConflict && selectedConflict.status === 'ignored'"
          @click="restoreConflict(selectedConflict)"
        >
          恢复
        </el-button>
        <el-button type="success" @click="markAsResolved(selectedConflict)">
          标记为已解决
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage } from 'element-plus'
import { Setting, Search, Download, Document, Warning } from '@element-plus/icons-vue'
import type { ConflictType, ConflictSeverity, ConflictReport, ConflictDetectionConfig, ConflictDetectionResult } from '@/types/conflicts'
import { ConflictDetector, DEFAULT_CONFIG, exportConflictsAsMarkdown, exportConflictsAsJSON } from '@/utils/conflictDetector'

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const project = computed(() => projectStore.currentProject)

const detecting = ref(false)
const result = ref<ConflictDetectionResult | null>(null)
const showConfigDialog = ref(false)
const showDetailDialog = ref(false)
const selectedConflict = ref<ConflictReport | null>(null)

const config = ref<ConflictDetectionConfig>({ ...DEFAULT_CONFIG })

const filterType = ref('')
const filterSeverity = ref('')
const filterStatus = ref('')

// 筛选后的冲突列表
const filteredConflicts = computed(() => {
  if (!result.value) return []

  let conflicts = result.value.conflicts

  if (filterType.value) {
    conflicts = conflicts.filter(c => c.type === filterType.value)
  }

  if (filterSeverity.value) {
    conflicts = conflicts.filter(c => c.severity === filterSeverity.value)
  }

  if (filterStatus.value) {
    conflicts = conflicts.filter(c => c.status === filterStatus.value)
  }

  return conflicts
})

onMounted(() => {
  // 加载保存的配置
  loadConfig()
})

async function runDetection() {
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  detecting.value = true

  try {
    const detector = new ConflictDetector({
      entities: Object.values(sandboxStore.activeEntitiesState),
      chapters: project.value.chapters || [],
      outline: project.value.outline
    }, config.value)
    result.value = await detector.detect()

    ElMessage.success(`检测完成！发现 ${result.value.statistics.total} 个冲突`)
  } catch (error) {
    console.error('冲突检测失败:', error)
    ElMessage.error('冲突检测失败：' + (error as Error).message)
  } finally {
    detecting.value = false
  }
}

function loadConfig() {
  const savedConfig = localStorage.getItem('conflict-detection-config')
  if (savedConfig) {
    try {
      config.value = { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) }
    } catch (error) {
      console.error('加载配置失败:', error)
    }
  }
}

function saveConfig() {
  localStorage.setItem('conflict-detection-config', JSON.stringify(config.value))
  showConfigDialog.value = false
  ElMessage.success('配置已保存')
}

function clearFilters() {
  filterType.value = ''
  filterSeverity.value = ''
  filterStatus.value = ''
}

function viewConflictDetail(conflict: ConflictReport) {
  selectedConflict.value = conflict
  showDetailDialog.value = true
}

function ignoreConflict(conflict: ConflictReport) {
  conflict.status = 'ignored'
  conflict.updatedAt = new Date()
  ElMessage.success('已忽略该冲突')
}

function restoreConflict(conflict: ConflictReport) {
  conflict.status = 'active'
  conflict.updatedAt = new Date()
  ElMessage.success('已恢复该冲突')
}

function markAsResolved(conflict: ConflictReport | null) {
  if (!conflict) return
  conflict.status = 'resolved'
  conflict.updatedAt = new Date()
  showDetailDialog.value = false
  ElMessage.success('已标记为已解决')
}

function exportReport() {
  if (!result.value || !project.value) return

  const format = 'markdown' // 或 'json'
  const content = format === 'markdown'
    ? exportConflictsAsMarkdown(result.value, project.value.title)
    : exportConflictsAsJSON(result.value)

  // 创建下载
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `conflict-report-${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : 'json'}`
  link.click()
  URL.revokeObjectURL(url)

  ElMessage.success('报告已导出')
}

function getTypeName(type: ConflictType): string {
  const names: Record<ConflictType, string> = {
    character_personality: '人物性格',
    character_ability: '人物能力',
    character_appearance: '人物外貌',
    timeline_sequence: '时间线顺序',
    timeline_duration: '时间跨度',
    timeline_age: '人物年龄',
    world_rule: '世界规则',
    world_setting: '世界设定',
    plot_logic: '情节逻辑',
    relationship: '人物关系',
    location: '地点位置',
    item: '物品属性',
    foreshadowing: '伏笔',
    custom: '自定义'
  }
  return names[type] || type
}

function getSeverityType(severity: ConflictSeverity): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<ConflictSeverity, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    critical: 'danger',
    warning: 'warning',
    info: 'info'
  }
  return types[severity] || 'info'
}

function getSeverityText(severity: ConflictSeverity): string {
  const texts: Record<ConflictSeverity, string> = {
    critical: '严重',
    warning: '警告',
    info: '提示'
  }
  return texts[severity] || severity
}

function getStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const types: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    active: 'warning',
    ignored: 'info',
    resolved: 'success'
  }
  return types[status] || 'info'
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '活动',
    ignored: '已忽略',
    resolved: '已解决'
  }
  return texts[status] || status
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.conflict-report {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  margin-bottom: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
}

.empty-state {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.statistics-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detect-time {
  color: #909399;
  font-size: 14px;
}

.stat-item {
  text-align: center;
  padding: 20px;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409eff;
  margin-bottom: 10px;
}

.stat-item.critical .stat-value {
  color: #f56c6c;
}

.stat-item.warning .stat-value {
  color: #e6a23c;
}

.stat-item.info .stat-value {
  color: #909399;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

.type-statistics h4 {
  margin-bottom: 15px;
}

.type-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.type-name {
  font-size: 14px;
}

.filter-card {
  margin-bottom: 0;
}

.conflicts-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.conflict-card {
  margin-bottom: 0;
  border-left: 4px solid #909399;
}

.conflict-card.severity-critical {
  border-left-color: #f56c6c;
}

.conflict-card.severity-warning {
  border-left-color: #e6a23c;
}

.conflict-card.severity-info {
  border-left-color: #909399;
}

.conflict-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.conflict-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
}

.conflict-actions {
  display: flex;
  gap: 10px;
}

.conflict-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.conflict-description {
  color: #606266;
  line-height: 1.6;
}

.evidences h4,
.suggestions h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #303133;
}

.evidence-item,
.suggestion-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 8px;
}

.evidence-item:last-child,
.suggestion-item:last-child {
  margin-bottom: 0;
}

.conflict-meta {
  display: flex;
  gap: 10px;
}

.form-item-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}

.conflict-detail {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-title {
  font-size: 18px;
  font-weight: 600;
}

.detail-section h4 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: #303133;
}

.detail-section p {
  margin: 0;
  color: #606266;
  line-height: 1.6;
}

.text-snippet {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
