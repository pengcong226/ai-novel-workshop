<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="导入结果详情"
    width="900px"
    top="5vh"
  >
    <el-tabs v-model="activeTab">
      <!-- 质量报告 -->
      <el-tab-pane label="质量报告" name="quality">
        <div v-if="qualityReport" class="quality-report">
          <!-- 总体评分 -->
          <div class="overall-score">
            <el-progress
              type="dashboard"
              :percentage="qualityReport.overall"
              :color="getScoreColor(qualityReport.overall)"
              :width="120"
            />
            <div class="score-label">总体评分</div>
          </div>

          <!-- 维度评分 -->
          <div class="dimension-scores">
            <div
              v-for="(score, dimension) in qualityReport.dimensions"
              :key="dimension"
              class="dimension-item"
            >
              <div class="dimension-header">
                <span class="dimension-name">{{ getDimensionName(dimension) }}</span>
                <span class="dimension-score">{{ score }}</span>
              </div>
              <el-progress
                :percentage="score"
                :color="getScoreColor(score)"
                :show-text="false"
              />
              <el-rate
                :model-value="Math.round(score / 20)"
                disabled
                show-score
                text-color="#ff9900"
              />
            </div>
          </div>

          <!-- 问题列表 -->
          <div v-if="qualityReport.issues.length > 0" class="issues-section">
            <h3>发现问题</h3>
            <el-timeline>
              <el-timeline-item
                v-for="(issue, index) in qualityReport.issues"
                :key="index"
                :type="getIssueType(issue.type)"
                :icon="getIssueIcon(issue.type)"
              >
                <el-card>
                  <template #header>
                    <div class="issue-header">
                      <el-tag :type="getIssueType(issue.type)" size="small">
                        {{ issue.dimension }}
                      </el-tag>
                      <span class="issue-description">{{ issue.description }}</span>
                    </div>
                  </template>
                  <div class="issue-content">
                    <p><strong>建议：</strong>{{ issue.suggestion }}</p>
                    <p v-if="issue.location"><strong>位置：</strong>{{ issue.location }}</p>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>

          <!-- 建议 -->
          <div v-if="qualityReport.suggestions.length > 0" class="suggestions-section">
            <h3>改进建议</h3>
            <el-list>
              <el-list-item
                v-for="(suggestion, index) in qualityReport.suggestions"
                :key="index"
              >
                <el-icon><InfoFilled /></el-icon>
                <span>{{ suggestion }}</span>
              </el-list-item>
            </el-list>
          </div>
        </div>
        <el-empty v-else description="暂无质量报告" />
      </el-tab-pane>

      <!-- 世界观 -->
      <el-tab-pane label="世界观" name="world">
        <div v-if="worldInfo" class="world-info">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="时代背景">
              {{ worldInfo.era?.time || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="科技水平">
              {{ worldInfo.era?.techLevel || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="社会形态" :span="2">
              {{ worldInfo.era?.socialForm || '未知' }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 地点 -->
          <div v-if="worldInfo.locations?.length" class="section">
            <h3>主要地点 ({{ worldInfo.locations.length }})</h3>
            <el-tag
              v-for="location in worldInfo.locations.slice(0, 10)"
              :key="location.name"
              style="margin: 5px;"
            >
              {{ location.name }} ({{ location.type }})
            </el-tag>
            <el-tag v-if="worldInfo.locations.length > 10" type="info">
              +{{ worldInfo.locations.length - 10 }}
            </el-tag>
          </div>

          <!-- 势力 -->
          <div v-if="worldInfo.factions?.length" class="section">
            <h3>势力组织 ({{ worldInfo.factions.length }})</h3>
            <el-collapse>
              <el-collapse-item
                v-for="faction in worldInfo.factions"
                :key="faction.name"
                :title="`${faction.name} (${faction.type})`"
              >
                <p>{{ faction.description }}</p>
              </el-collapse-item>
            </el-collapse>
          </div>

          <!-- 力量体系 -->
          <div v-if="worldInfo.powerSystem" class="section">
            <h3>{{ worldInfo.powerSystem.name }}</h3>
            <p class="description">{{ worldInfo.powerSystem.description }}</p>
            <div class="power-levels">
              <el-tag
                v-for="(level, index) in worldInfo.powerSystem.levels"
                :key="index"
                type="primary"
                style="margin: 5px;"
              >
                {{ level.name }}：{{ level.description }}
              </el-tag>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无世界观信息" />
      </el-tab-pane>

      <!-- 大纲结构 -->
      <el-tab-pane label="大纲结构" name="outline">
        <div v-if="outlineInfo" class="outline-info">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="故事结构">
              {{ outlineInfo.structure }}
            </el-descriptions-item>
            <el-descriptions-item label="总章节数">
              {{ outlineInfo.totalChapters }} 章
            </el-descriptions-item>
            <el-descriptions-item label="卷数" :span="2">
              {{ outlineInfo.volumes?.length || 0 }} 卷
            </el-descriptions-item>
          </el-descriptions>

          <!-- 卷结构 -->
          <div v-if="outlineInfo.volumes?.length" class="volumes-section">
            <h3>卷结构</h3>
            <el-timeline>
              <el-timeline-item
                v-for="volume in outlineInfo.volumes"
                :key="volume.number"
                :timestamp="`第${volume.chapterRange.start}-${volume.chapterRange.end}章`"
                placement="top"
              >
                <el-card>
                  <h4>{{ volume.title }}</h4>
                  <p v-if="volume.theme" class="volume-theme">主题：{{ volume.theme }}</p>
                  <div v-if="volume.mainEvents?.length" class="volume-events">
                    <strong>主要事件：</strong>
                    <ul>
                      <li v-for="(event, index) in volume.mainEvents" :key="index">
                        {{ event }}
                      </li>
                    </ul>
                  </div>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>
        </div>
        <el-empty v-else description="暂无大纲信息" />
      </el-tab-pane>

      <!-- 续写建议 -->
      <el-tab-pane label="续写建议" name="continuation">
        <div v-if="continuationSuggestions.length > 0" class="continuation-suggestions">
          <el-alert
            title="基于现有内容分析的续写建议"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 20px;"
          />

          <div
            v-for="(suggestion, index) in continuationSuggestions"
            :key="index"
            class="suggestion-card"
          >
            <el-card>
              <template #header>
                <div class="suggestion-header">
                  <el-tag :type="getSuggestionType(suggestion.type)">
                    {{ getSuggestionTypeName(suggestion.type) }}
                  </el-tag>
                  <el-tag
                    :type="getPriorityType(suggestion.priority)"
                    size="small"
                  >
                    {{ getPriorityName(suggestion.priority) }}
                  </el-tag>
                </div>
                <h4>{{ suggestion.title }}</h4>
              </template>

              <p class="suggestion-description">{{ suggestion.description }}</p>

              <div v-if="suggestion.context" class="suggestion-context">
                <el-icon><InfoFilled /></el-icon>
                <span>{{ suggestion.context }}</span>
              </div>

              <div v-if="suggestion.suggestions?.length" class="suggestion-list">
                <h5>具体建议：</h5>
                <ul>
                  <li v-for="(item, i) in suggestion.suggestions" :key="i">
                    {{ item }}
                  </li>
                </ul>
              </div>
            </el-card>
          </div>
        </div>
        <el-empty v-else description="暂无续写建议" />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <el-button type="primary" @click="handleImport">确认导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref} from 'vue'
import { InfoFilled, Warning, CircleClose } from '@element-plus/icons-vue'
import type { QualityMetrics } from '@/utils/qualityAnalyzer'
import type { ContinuationSuggestion } from '@/utils/continuationSuggester'

interface Props {
  modelValue: boolean
  qualityReport?: QualityMetrics | null
  worldInfo?: any
  outlineInfo?: any
  continuationSuggestions?: ContinuationSuggestion[]
}

const _props = withDefaults(defineProps<Props>(), {
  continuationSuggestions: () => []
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'import'): void
}>()

const activeTab = ref('quality')

// 获取评分颜色
function getScoreColor(score: number): string {
  if (score >= 80) return '#67C23A'
  if (score >= 60) return '#E6A23C'
  return '#F56C6C'
}

// 获取维度名称
function getDimensionName(dimension: string): string {
  const names: Record<string, string> = {
    plot: '情节完整性',
    character: '人物塑造',
    pacing: '节奏把控',
    consistency: '一致性',
    readability: '可读性'
  }
  return names[dimension] || dimension
}

// 获取问题类型
function getIssueType(type: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    error: 'danger',
    warning: 'warning',
    info: 'info'
  }
  return types[type] || 'info'
}

// 获取问题图标
function getIssueIcon(type: string) {
  const icons: Record<string, any> = {
    error: CircleClose,
    warning: Warning,
    info: InfoFilled
  }
  return icons[type] || InfoFilled
}

// 获取建议类型
function getSuggestionType(type: string): '' | 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  const types: Record<string, '' | 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
    plot: 'primary',
    character: 'success',
    scene: 'warning',
    conflict: 'danger',
    foreshadowing: 'info'
  }
  return types[type] || 'info'
}

// 获取建议类型名称
function getSuggestionTypeName(type: string): string {
  const names: Record<string, string> = {
    plot: '情节',
    character: '人物',
    scene: '场景',
    conflict: '冲突',
    foreshadowing: '伏笔'
  }
  return names[type] || type
}

// 获取优先级类型
function getPriorityType(priority: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const types: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return types[priority] || 'info'
}

// 获取优先级名称
function getPriorityName(priority: string): string {
  const names: Record<string, string> = {
    high: '高优先级',
    medium: '中优先级',
    low: '低优先级'
  }
  return names[priority] || priority
}

// 处理导入
function handleImport() {
  emit('import')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.quality-report {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.overall-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px;
}

.score-label {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.dimension-scores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.dimension-item {
  padding: 15px;
  border: 1px solid #E4E7ED;
  border-radius: 8px;
}

.dimension-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.dimension-name {
  font-weight: 600;
  color: #303133;
}

.dimension-score {
  font-size: 18px;
  font-weight: bold;
  color: #409EFF;
}

.issues-section,
.suggestions-section {
  margin-top: 20px;
}

.issues-section h3,
.suggestions-section h3 {
  margin-bottom: 15px;
  color: #303133;
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.issue-description {
  font-weight: 600;
}

.issue-content p {
  margin: 10px 0;
}

.world-info,
.outline-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section {
  margin-top: 20px;
}

.section h3 {
  margin-bottom: 15px;
  color: #303133;
}

.description {
  color: #606266;
  margin-bottom: 15px;
}

.power-levels {
  display: flex;
  flex-wrap: wrap;
}

.volumes-section h3 {
  margin-bottom: 15px;
}

.volume-theme {
  color: #909399;
  margin: 5px 0;
}

.volume-events {
  margin-top: 10px;
}

.volume-events ul {
  margin: 5px 0 0;
  padding-left: 20px;
}

.continuation-suggestions {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.suggestion-card {
  margin-bottom: 10px;
}

.suggestion-header {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.suggestion-description {
  font-size: 14px;
  color: #606266;
  margin-bottom: 10px;
}

.suggestion-context {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 10px;
  background: #F4F4F5;
  border-radius: 4px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #909399;
}

.suggestion-list {
  margin-top: 10px;
}

.suggestion-list h5 {
  margin-bottom: 8px;
  color: #303133;
}

.suggestion-list ul {
  margin: 0;
  padding-left: 20px;
}

.suggestion-list li {
  margin: 5px 0;
  color: #606266;
  font-size: 14px;
}
</style>
