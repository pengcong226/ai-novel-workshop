<template>
  <div class="quality-report">
    <el-card class="header-card">
      <div class="header">
        <h2>质量报告</h2>
        <div class="actions">
          <el-button @click="checkAllChapters" :loading="checking">
            <el-icon><Check /></el-icon>
            批量检查
          </el-button>
          <el-button @click="runAIGCDetection" :loading="aigcChecking">
            <el-icon><WarnTriangleFilled /></el-icon>
            AIGC检测
          </el-button>
          <el-button @click="exportReport" :disabled="reports.length === 0">
            <el-icon><Download /></el-icon>
            导出报告
          </el-button>
        </div>
      </div>
    </el-card>

    <div v-if="reports.length === 0 && !checking" class="empty-state">
      <el-empty description="还没有质量报告">
        <el-button type="primary" @click="checkAllChapters">开始质量检查</el-button>
      </el-empty>
    </div>

    <div v-else class="content">
      <!-- 总体概览 -->
      <el-card class="overview-card">
        <template #header>
          <div class="card-header">
            <span>总体概览</span>
          </div>
        </template>

        <el-row :gutter="20">
          <el-col :span="6">
            <el-statistic title="检查章节数" :value="reports.length">
              <template #suffix>章</template>
            </el-statistic>
          </el-col>
          <el-col :span="6">
            <el-statistic title="平均质量分" :value="trendAnalysis.averageScore" :precision="1">
              <template #suffix>/ 10</template>
            </el-statistic>
          </el-col>
          <el-col :span="6">
            <el-statistic title="质量趋势">
              <template #default>
                <el-tag :type="getTrendType(trendAnalysis.scoreTrend)">
                  {{ getTrendText(trendAnalysis.scoreTrend) }}
                </el-tag>
              </template>
            </el-statistic>
          </el-col>
          <el-col :span="6">
            <el-statistic title="待改进章节" :value="needImprovementCount">
              <template #suffix>章</template>
            </el-statistic>
          </el-col>
        </el-row>

        <el-divider />

        <!-- 质量趋势图表 -->
        <div class="chart-container">
          <div ref="trendChartRef" style="width: 100%; height: 300px;"></div>
        </div>
      </el-card>

      <!-- 维度分析 -->
      <el-card class="dimensions-card">
        <template #header>
          <div class="card-header">
            <span>维度分析</span>
          </div>
        </template>

        <div class="chart-container">
          <div ref="radarChartRef" style="width: 100%; height: 400px;"></div>
        </div>

        <el-divider />

        <el-row :gutter="20">
          <el-col
            v-for="(trend, name) in trendAnalysis.dimensionTrends"
            :key="name"
            :span="4"
          >
            <el-card shadow="hover" class="dimension-card">
              <div class="dimension-name">{{ name }}</div>
              <div class="dimension-score">
                {{ trend.scores[trend.scores.length - 1] }} / 10
              </div>
              <el-tag size="small" :type="getDimensionTrendType(trend.trend)">
                {{ trend.trend }}
              </el-tag>
            </el-card>
          </el-col>
        </el-row>
      </el-card>

      <!-- V4-P2-⑨: CED质量看板 (哨兵拦截大盘) -->
      <!-- AIGC检测结果 -->
      <el-card v-if="aigcResults.size > 0" class="aigc-card">
        <template #header>
          <div class="card-header">
            <span>AIGC 检测结果</span>
            <el-tag :type="overallAIGCScore >= 70 ? 'success' : overallAIGCScore >= 40 ? 'warning' : 'danger'">
              人类写作概率: {{ overallAIGCScore }}%
            </el-tag>
          </div>
        </template>
        <el-table :data="aigcTableData" stripe>
          <el-table-column prop="chapter" label="章节" width="80" />
          <el-table-column prop="humanProb" label="人类概率" width="100">
            <template #default="{ row }">
              <el-progress :percentage="row.humanProb" :color="row.humanProb >= 70 ? 'var(--ds-success)' : row.humanProb >= 40 ? 'var(--ds-warning)' : 'var(--ds-danger)'" :stroke-width="10" />
            </template>
          </el-table-column>
          <el-table-column prop="classification" label="判定" width="100">
            <template #default="{ row }">
              <el-tag :type="row.classification === 'human' ? 'success' : row.classification === 'ai' ? 'danger' : 'warning'" size="small">
                {{ row.classification === 'human' ? '人类' : row.classification === 'ai' ? 'AI生成' : '混合' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>


      <el-card class="ced-card">
        <template #header>
          <div class="card-header">
            <span>CED 防跑偏拦截大盘 (一致性检测)</span>
          </div>
        </template>
        <div v-if="cedLogs.length === 0" style="padding: 30px; text-align: center; color: var(--ds-text-tertiary);">
          <el-icon size="40"><CircleCheckFilled /></el-icon>
          <p>当前生成暂无防吃书拦截记录，一致性良好</p>
        </div>
        <div v-else class="ced-logs-container">
          <el-alert
            type="warning"
            show-icon
            :closable="false"
            style="margin-bottom: 20px;"
          >
            <template #title>
              系统累计防御了 {{ cedLogs.length }} 次设定破坏/幻觉等严重一致性错误
            </template>
          </el-alert>
          <el-timeline>
            <el-timeline-item
              v-for="log in cedLogs"
              :key="log.id"
              type="warning"
              :timestamp="`第 ${log.chapterNumber} 章 - ${formatDate(log.timestamp)}`"
              placement="top"
            >
              <el-card shadow="hover">
                <h4 style="margin: 0 0 10px 0; color: var(--ds-warning);">{{ log.title }}</h4>
                <p style="margin: 0; font-size: var(--ds-text-sm);">{{ log.description }}</p>
                <div v-if="log.metadata?.violations" style="margin-top: 10px;">
                  <el-tag
                    v-for="(v, idx) in getViolations(log.metadata)"
                    :key="idx"
                    type="danger"
                    size="small"
                    style="margin-right: 5px; margin-bottom: 5px;"
                  >
                    {{ typeof v === 'string' ? v : `[${v.category}] ${v.description}` }}
                  </el-tag>
                </div>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-card>

      <!-- 章节详情 -->
      <el-card class="chapters-card">
        <template #header>
          <div class="card-header">
            <span>章节详情</span>
            <el-input
              v-model="searchText"
              placeholder="搜索章节"
              style="width: 200px;"
              clearable
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
        </template>

        <el-table :data="filteredReports" style="width: 100%">
          <el-table-column prop="chapterNumber" label="章节" width="80" />
          <el-table-column label="评分" width="120">
            <template #default="{ row }">
              <el-progress
                :percentage="row.overallScore * 10"
                :color="getScoreColor(row.overallScore)"
                :format="() => row.overallScore.toFixed(1)"
              />
            </template>
          </el-table-column>
          <el-table-column label="维度评分" min-width="200">
            <template #default="{ row }">
              <div class="dimension-scores">
                <el-tag
                  v-for="dim in row.dimensions"
                  :key="dim.name"
                  size="small"
                  :type="getScoreTagType(dim.score)"
                  style="margin-right: 4px; margin-bottom: 4px;"
                >
                  {{ dim.name }}: {{ dim.score.toFixed(1) }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="问题数" width="100">
            <template #default="{ row }">
              <el-badge
                :value="getTotalIssues(row)"
                :type="getTotalIssues(row) > 5 ? 'danger' : 'warning'"
              >
                <el-icon><Warning /></el-icon>
              </el-badge>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" @click="viewDetail(row)">查看详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- 改进建议 -->
      <el-card class="recommendations-card">
        <template #header>
          <div class="card-header">
            <span>改进建议</span>
          </div>
        </template>

        <el-alert
          v-if="trendAnalysis.recommendations.length > 0"
          :title="`基于 ${reports.length} 章节的质量分析`"
          type="info"
          :closable="false"
          style="margin-bottom: 20px;"
        />

        <div class="recommendations-list">
          <el-card
            v-for="(rec, index) in trendAnalysis.recommendations"
            :key="index"
            class="recommendation-item"
            shadow="hover"
          >
            <div class="recommendation-number">{{ index + 1 }}</div>
            <div class="recommendation-text">{{ rec }}</div>
          </el-card>
        </div>
      </el-card>
    </div>

    <!-- 详情对话框 -->
    <el-dialog
      v-model="showDetailDialog"
      :title="`第 ${currentReport?.chapterNumber} 章质量报告`"
      width="80%"
      top="5vh"
    >
      <div v-if="currentReport" class="detail-content">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-statistic title="总体评分" :value="currentReport.overallScore" :precision="1">
              <template #suffix>/ 10</template>
            </el-statistic>
          </el-col>
          <el-col :span="6">
            <div class="statistic-card">
              <div class="statistic-title">检查时间</div>
              <div class="statistic-value">{{ formatDate(currentReport.timestamp) }}</div>
            </div>
          </el-col>
        </el-row>

        <el-divider />

        <el-tabs v-model="activeTab">
          <el-tab-pane label="维度分析" name="dimensions">
            <el-row :gutter="20">
              <el-col
                v-for="dim in currentReport.dimensions"
                :key="dim.name"
                :span="12"
              >
                <el-card class="dimension-detail-card" shadow="hover">
                  <div class="dimension-header">
                    <span class="dimension-name">{{ dim.name }}</span>
                    <el-progress
                      :percentage="dim.score * 10"
                      :color="getScoreColor(dim.score)"
                      :format="() => dim.score.toFixed(1)"
                      style="width: 200px;"
                    />
                  </div>

                  <el-divider />

                  <div v-if="dim.issues.length > 0" class="issues-section">
                    <h4>发现的问题</h4>
                    <el-timeline>
                      <el-timeline-item
                        v-for="(issue, idx) in dim.issues"
                        :key="idx"
                        :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                        :size="issue.severity > 5 ? 'large' : 'normal'"
                      >
                        <div class="issue-content">
                          <el-tag
                            :type="issue.type === 'error' ? 'danger' : issue.type === 'warning' ? 'warning' : 'info'"
                            size="small"
                          >
                            {{ issue.type === 'error' ? '错误' : issue.type === 'warning' ? '警告' : '提示' }}
                          </el-tag>
                          <span class="issue-message">{{ issue.message }}</span>
                        </div>
                      </el-timeline-item>
                    </el-timeline>
                  </div>

                  <div v-if="dim.suggestions.length > 0" class="suggestions-section">
                    <h4>改进建议</h4>
                    <ul class="suggestions-list">
                      <li v-for="(suggestion, idx) in dim.suggestions" :key="idx">
                        {{ suggestion }}
                      </li>
                    </ul>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="详细报告" name="details">
            <el-card>
              <div class="markdown-content" v-html="renderedDetails"></div>
            </el-card>
          </el-tab-pane>

          <el-tab-pane label="改进建议" name="improvements">
            <el-card>
              <el-timeline>
                <el-timeline-item
                  v-for="(improvement, idx) in currentReport.improvements"
                  :key="idx"
                  :type="idx < 3 ? 'primary' : 'info'"
                >
                  {{ improvement }}
                </el-timeline-item>
              </el-timeline>
            </el-card>
          </el-tab-pane>

          <!-- 敏感词检测 -->
          <el-tab-pane label="敏感词检测" name="sensitive">
            <div v-if="currentSensitiveIssues.length === 0" class="sensitive-empty">
              <el-icon size="40" style="color: var(--ds-success);"><CircleCheckFilled /></el-icon>
              <p>未检测到敏感词，内容安全</p>
            </div>
            <div v-else class="sensitive-results">
              <el-alert
                :title="`检测到 ${currentSensitiveIssues.length} 个敏感词问题`"
                type="warning"
                show-icon
                :closable="false"
                style="margin-bottom: 16px;"
              />
              <el-timeline>
                <el-timeline-item
                  v-for="(issue, idx) in currentSensitiveIssues"
                  :key="idx"
                  type="danger"
                >
                  <div class="sensitive-issue">
                    <el-tag type="danger" size="small" style="margin-right: 8px;">敏感词</el-tag>
                    <span class="sensitive-desc">{{ issue.description }}</span>
                  </div>
                  <div v-if="issue.suggestion" class="sensitive-suggestion">
                    建议：{{ issue.suggestion }}
                  </div>
                </el-timeline-item>
              </el-timeline>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="showDetailDialog = false">关闭</el-button>
        <el-button type="primary" @click="exportChapterReport">导出报告</el-button>
      </template>
    </el-dialog>

    <!-- 检查进度对话框 -->
    <el-dialog
      v-model="showProgressDialog"
      title="质量检查中..."
      width="500px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-progress :percentage="checkProgress" :format="() => `${checkProgress}%`" />
      <div class="progress-text">
        正在检查第 {{ currentCheckingChapter }} / {{ totalChapters }} 章
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Download, Search, Warning, CircleCheckFilled, WarnTriangleFilled } from '@element-plus/icons-vue'
import { useAuditLog } from '@/composables/useAuditLog'
import { createQualityChecker, analyzeQualityTrend, type QualityReport } from '@/utils/qualityChecker'
import { exportQualityReportAsJSON, exportQualityReportAsMarkdown} from '@/utils/reportExporter'
import * as echarts from 'echarts/core'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getLogger } from '@/utils/logger'
import { formatDate } from '@/utils/formatters'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { AIGCDetector } from '@/services/AIGCDetector'
import type { AIGCDetectionResult } from '@/services/AIGCDetector'
import { validateSensitiveWords } from '@/agents/PostWriteValidator'

const logger = getLogger('quality-report')

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const project = computed(() => projectStore.currentProject)
const chapters = computed(() => project.value?.chapters || [])

const reports = ref<QualityReport[]>([])
const checking = ref(false)
const searchText = ref('')
const showDetailDialog = ref(false)
const currentReport = ref<QualityReport | null>(null)
const activeTab = ref('dimensions')

const aigcResults = ref<Map<number, AIGCDetectionResult>>(new Map())
const aigcChecking = ref(false)
const aigcDetector = new AIGCDetector({ provider: 'local' })

const { logs } = useAuditLog()
const cedLogs = computed(() => {
  return logs.value.filter(log => log.type === 'warning' && log.title.includes('哨兵'))
})

function getViolations(metadata?: Record<string, unknown>): Array<{ category?: string; description?: string }> {
  if (!metadata?.violations || !Array.isArray(metadata.violations)) return []
  return metadata.violations as Array<{ category?: string; description?: string }>
}

// 检查进度
const showProgressDialog = ref(false)
const checkProgress = ref(0)
const currentCheckingChapter = ref(0)
const totalChapters = ref(0)

// 图表引用
const trendChartRef = ref<HTMLElement>()
const radarChartRef = ref<HTMLElement>()
let trendChart: echarts.ECharts | null = null
let radarChart: echarts.ECharts | null = null

// ECharts resize handler (shared reference for add/remove)
const handleChartResize = () => {
  if (trendChart) trendChart.resize()
  if (radarChart) radarChart.resize()
}

// 趋势分析
const trendAnalysis = computed(() => {
  return analyzeQualityTrend(reports.value)
})

// 需改进章节数
const needImprovementCount = computed(() => {
  const threshold = project.value?.config?.qualityThreshold || 7
  return reports.value.filter(r => r.overallScore < threshold).length
})

// 过滤后的报告
const filteredReports = computed(() => {
  if (!searchText.value) return reports.value

  const search = searchText.value.toLowerCase()
  return reports.value.filter(r =>
    (r.chapterNumber != null && r.chapterNumber.toString().includes(search)) ||
    (r.summary && r.summary.toLowerCase().includes(search))
  )
})

// 渲染的详情
const renderedDetails = computed(() => {
  if (!currentReport.value) return ''
  const html = marked.parse(currentReport.value.details) as string
  const sanitized = DOMPurify.sanitize ? DOMPurify.sanitize(html, { FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] }) : html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return sanitized
})

// 当前章节的敏感词检测结果
const currentSensitiveIssues = computed(() => {
  if (!currentReport.value) return []
  const chapter = chapters.value.find(c => c.number === currentReport.value!.chapterNumber)
  if (!chapter?.content) return []
  return validateSensitiveWords(chapter.content)
})

onMounted(async () => {
  await nextTick()
  initCharts()

  // Add window resize handler for ECharts
  window.addEventListener('resize', handleChartResize)

  // 如果已有报告，更新图表
  if (reports.value.length > 0) {
    updateCharts()
  }
})

onBeforeUnmount(() => {
  // Remove resize handler
  window.removeEventListener('resize', handleChartResize)

  if (trendChart) {
    trendChart.dispose()
    trendChart = null
  }
  if (radarChart) {
    radarChart.dispose()
    radarChart = null
  }
})

// 获取当前主题色（基于 Design Token）
function getChartThemeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    accent: style.getPropertyValue('--ds-accent').trim() || '#6c5ce7',
    accentText: style.getPropertyValue('--ds-accent-text').trim() || '#a78bfa',
    success: style.getPropertyValue('--ds-success').trim() || '#10b981',
    warning: style.getPropertyValue('--ds-warning').trim() || '#f59e0b',
    danger: style.getPropertyValue('--ds-danger').trim() || '#ef4444',
    info: style.getPropertyValue('--ds-info').trim() || '#3b82f6',
    textPrimary: style.getPropertyValue('--ds-text-primary').trim() || '#ececf1',
    textSecondary: style.getPropertyValue('--ds-text-secondary').trim() || '#8e8ea0',
    textTertiary: style.getPropertyValue('--ds-text-tertiary').trim() || '#565869',
    surfaceBorder: style.getPropertyValue('--ds-surface-border').trim() || 'rgba(255,255,255,0.06)',
    bgPrimary: style.getPropertyValue('--ds-bg-primary').trim() || '#0a0a0f',
    bgSecondary: style.getPropertyValue('--ds-bg-secondary').trim() || '#12121a',
    fontSans: style.getPropertyValue('--ds-font-sans').trim() || 'sans-serif',
  }
}

// 维度配色方案（柔和、有层次感）
const DIMENSION_COLORS = ['#6c5ce7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

// 初始化图表
function initCharts() {
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value)
  }
  if (radarChartRef.value) {
    radarChart = echarts.init(radarChartRef.value)
  }
}

// 更新图表
function updateCharts() {
  updateTrendChart()
  updateRadarChart()
}

// 更新趋势折线图 — 使用 Design Token 风格
function updateTrendChart() {
  if (!trendChart || reports.value.length === 0) return

  const theme = getChartThemeColors()
  const dimNames = reports.value[0].dimensions.map(d => d.name)
  const chapters = reports.value.map(r => `第${r.chapterNumber}章`)
  const seriesColors = [theme.accent, ...DIMENSION_COLORS.slice(0, dimNames.length)]

  const option = {
    color: seriesColors,
    backgroundColor: 'transparent',
    title: {
      text: '审计趋势',
      left: 0,
      top: 0,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 15,
        fontWeight: 600,
        color: theme.textPrimary,
      },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.bgSecondary,
      borderColor: theme.surfaceBorder,
      borderWidth: 1,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 12,
        color: theme.textPrimary,
      },
      axisPointer: {
        type: 'cross',
        crossStyle: { color: theme.textTertiary },
      },
    },
    legend: {
      data: ['总体评分', ...dimNames],
      top: 32,
      left: 0,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 11,
        color: theme.textSecondary,
      },
      itemWidth: 16,
      itemHeight: 2,
      itemGap: 16,
    },
    grid: {
      left: 12,
      right: 24,
      bottom: 12,
      top: 72,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: chapters,
      boundaryGap: false,
      axisLine: { lineStyle: { color: theme.surfaceBorder } },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: theme.fontSans,
        fontSize: 11,
        color: theme.textTertiary,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 10,
      splitNumber: 5,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: theme.fontSans,
        fontSize: 11,
        color: theme.textTertiary,
      },
      splitLine: {
        lineStyle: {
          color: theme.surfaceBorder,
          type: 'dashed',
        },
      },
    },
    series: [
      {
        name: '总体评分',
        type: 'line',
        data: reports.value.map(r => r.overallScore),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: theme.accent + '30' },
              { offset: 1, color: theme.accent + '05' },
            ],
          },
        },
      },
      ...dimNames.map((name, index) => ({
        name,
        type: 'line' as const,
        data: reports.value.map(r => r.dimensions[index].score),
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 1.5 },
      })),
    ],
    animationDuration: 800,
    animationEasing: 'cubicOut' as const,
  }

  trendChart.setOption(option, true)
}

// 更新雷达图 — 使用 Design Token 风格
function updateRadarChart() {
  if (!radarChart || reports.value.length === 0) return

  const theme = getChartThemeColors()
  const dimensions = reports.value[0].dimensions
  const isManyChapters = reports.value.length > 5

  const radarSeriesData = isManyChapters
    ? [
        {
          value: dimensions.map((_, i) => {
            const sum = reports.value.reduce((s, r) => s + r.dimensions[i].score, 0)
            return +(sum / reports.value.length).toFixed(1)
          }),
          name: '平均',
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2.5, color: theme.accent },
          areaStyle: { color: theme.accent + '20' },
          itemStyle: { color: theme.accent },
        },
        {
          value: dimensions.map((_, i) => {
            return Math.max(...reports.value.map(r => r.dimensions[i].score))
          }),
          name: '最佳',
          symbol: 'diamond',
          symbolSize: 4,
          lineStyle: { width: 1.5, color: theme.success, type: 'dashed' },
          areaStyle: { color: theme.success + '10' },
          itemStyle: { color: theme.success },
        },
        {
          value: dimensions.map((_, i) => {
            return Math.min(...reports.value.map(r => r.dimensions[i].score))
          }),
          name: '最差',
          symbol: 'triangle',
          symbolSize: 4,
          lineStyle: { width: 1.5, color: theme.warning, type: 'dotted' },
          areaStyle: { color: theme.warning + '10' },
          itemStyle: { color: theme.warning },
        },
      ]
    : reports.value.map((r, idx) => ({
        value: r.dimensions.map(d => d.score),
        name: `第${r.chapterNumber}章`,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 1.5, color: DIMENSION_COLORS[idx % DIMENSION_COLORS.length] },
        areaStyle: { color: DIMENSION_COLORS[idx % DIMENSION_COLORS.length] + '18' },
        itemStyle: { color: DIMENSION_COLORS[idx % DIMENSION_COLORS.length] },
      }))

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: '审计维度分布',
      left: 0,
      top: 0,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 15,
        fontWeight: 600,
        color: theme.textPrimary,
      },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: theme.bgSecondary,
      borderColor: theme.surfaceBorder,
      borderWidth: 1,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 12,
        color: theme.textPrimary,
      },
    },
    legend: {
      data: isManyChapters
        ? ['平均', '最佳', '最差']
        : reports.value.map(r => `第${r.chapterNumber}章`),
      top: 32,
      left: 0,
      textStyle: {
        fontFamily: theme.fontSans,
        fontSize: 11,
        color: theme.textSecondary,
      },
      itemWidth: 16,
      itemHeight: 2,
      itemGap: 16,
    },
    radar: {
      center: ['50%', '58%'],
      radius: '62%',
      indicator: dimensions.map(d => ({
        name: d.name,
        max: d.maxScore,
      })),
      shape: 'polygon',
      splitNumber: 5,
      axisName: {
        fontFamily: theme.fontSans,
        fontSize: 11,
        color: theme.textSecondary,
      },
      splitLine: {
        lineStyle: { color: theme.surfaceBorder },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: [theme.bgPrimary, theme.bgSecondary],
        },
      },
      axisLine: {
        lineStyle: { color: theme.surfaceBorder },
      },
    },
    series: [{
      type: 'radar',
      data: radarSeriesData,
    }],
    animationDuration: 800,
    animationEasing: 'cubicOut' as const,
  }

  radarChart.setOption(option, true)
}

// 批量检查所有章节
async function runAIGCDetection() {
  aigcChecking.value = true
  aigcResults.value = new Map()
  try {
    for (const report of reports.value) {
      const chapter = chapters.value.find(c => c.number === report.chapterNumber)
      if (chapter?.content) {
        const result = await aigcDetector.detect(chapter.content)
        aigcResults.value.set(report.chapterNumber, result)
      }
    }
    ElMessage.success('AIGC检测完成')
  } catch (error) {
    ElMessage.error('AIGC检测失败：' + (error instanceof Error ? error.message : String(error)))
  } finally {
    aigcChecking.value = false
  }
}

const overallAIGCScore = computed(() => {
  if (aigcResults.value.size === 0) return 0
  const scores = Array.from(aigcResults.value.values()).map(r => r.humanProbability * 100)
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const aigcTableData = computed(() => {
  return Array.from(aigcResults.value.entries()).map(([chapterNum, result]) => ({
    chapter: `第${chapterNum}章`,
    humanProb: Math.round(result.humanProbability * 100),
    classification: result.humanProbability > 0.7 ? 'human' : result.humanProbability < 0.3 ? 'ai' : 'mixed',
  }))
})

async function checkAllChapters() {
  if (!project.value || chapters.value.length === 0) {
    ElMessage.warning('没有可检查的章节')
    return
  }

  checking.value = true
  showProgressDialog.value = true
  checkProgress.value = 0
  currentCheckingChapter.value = 0
  totalChapters.value = chapters.value.length
  reports.value = []

  try {
    const checker = createQualityChecker(
      Object.values(sandboxStore.activeEntitiesState).filter(e => e.type === 'LORE'),
      Object.values(sandboxStore.activeEntitiesState).filter(e => e.type === 'CHARACTER'),
      project.value.outline,
      project.value.config
    )

    for (let i = 0; i < chapters.value.length; i++) {
      currentCheckingChapter.value = i + 1
      const report = await checker.checkChapter(chapters.value[i], (progress) => {
        checkProgress.value = Math.round(((i + progress / 100) / chapters.value.length) * 100)
      })
      reports.value.push(report)
    }

    checkProgress.value = 100
    ElMessage.success(`质量检查完成！共检查 ${chapters.value.length} 章`)

    // 更新图表
    await nextTick()
    updateCharts()
  } catch (error) {
    logger.error('质量检查失败:', error)
    ElMessage.error('质量检查失败：' + getErrorMessage(error))
  } finally {
    checking.value = false
    setTimeout(() => {
      showProgressDialog.value = false
    }, 1000)
  }
}

// 查看详情
function viewDetail(report: QualityReport) {
  currentReport.value = report
  activeTab.value = 'dimensions'
  showDetailDialog.value = true
}

// 导出报告
function exportReport() {
  if (reports.value.length === 0) {
    ElMessage.warning('没有可导出的报告')
    return
  }

  // 使用 Element Plus 的 MessageBox 选择格式
  ElMessageBox({
    title: '导出报告',
    message: '请选择导出格式：',
    showCancelButton: true,
    confirmButtonText: '导出 JSON',
    cancelButtonText: '导出 Markdown',
    distinguishCancelAndClose: true,
    type: 'info'
  })
    .then(() => {
      // 确认 - 导出 JSON
      exportQualityReportAsJSON(
        reports.value,
        project.value?.title || '未命名项目',
        trendAnalysis.value
      )
      ElMessage.success('报告已导出为 JSON')
    })
    .catch((action) => {
      if (action === 'cancel') {
        // 取消 - 导出 Markdown
        exportQualityReportAsMarkdown(
          reports.value,
          project.value?.title || '未命名项目'
        )
        ElMessage.success('报告已导出为 Markdown')
      }
    })
}

// 导出单章报告
function exportChapterReport() {
  if (!currentReport.value) return

  const blob = new Blob([JSON.stringify(currentReport.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `第${currentReport.value.chapterNumber}章质量报告.json`
  a.click()
  URL.revokeObjectURL(url)

  ElMessage.success('报告已导出')
}

// 辅助方法
function getTrendType(trend: string) {
  return trend === 'improving' ? 'success' : trend === 'declining' ? 'danger' : 'info'
}

function getTrendText(trend: string) {
  return trend === 'improving' ? '上升' : trend === 'declining' ? '下降' : '稳定'
}

function getScoreColor(score: number) {
  if (score >= 8) return getComputedStyle(document.documentElement).getPropertyValue('--ds-success').trim() || '#10b981'
  if (score >= 6) return getComputedStyle(document.documentElement).getPropertyValue('--ds-warning').trim() || '#f59e0b'
  return getComputedStyle(document.documentElement).getPropertyValue('--ds-danger').trim() || '#ef4444'
}

function getScoreTagType(score: number) {
  if (score >= 8) return 'success'
  if (score >= 6) return 'warning'
  return 'danger'
}

function getDimensionTrendType(trend: string) {
  return trend === '上升' ? 'success' : trend === '下降' ? 'danger' : 'info'
}

function getTotalIssues(report: QualityReport) {
  return report.dimensions.reduce((sum, dim) => sum + dim.issues.length, 0)
}

// 监听窗口大小变化，重新渲染图表
watch(() => [trendChartRef.value, radarChartRef.value], () => {
  if (trendChart) trendChart.resize()
  if (radarChart) radarChart.resize()
})
</script>

<style scoped>
.quality-report {
  max-width: 1400px;
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
  font-size: var(--ds-text-xl);
}

.actions {
  display: flex;
  gap: var(--ds-space-3);
}

.empty-state {
  padding-top: var(--ds-space-16);
  padding-bottom: var(--ds-space-16);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-5);
}

.overview-card,
.dimensions-card,
.ced-card,
.chapters-card,
.recommendations-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  margin-top: var(--ds-space-4);
  padding: var(--ds-space-4);
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-surface-border);
  border-radius: var(--ds-radius-md);
}

.dimension-card {
  text-align: center;
  padding: var(--ds-space-3);
  cursor: pointer;
  transition: all 0.3s;
}

.dimension-card:hover {
  transform: translateY(-5px);
}

.dimension-name {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin-bottom: var(--ds-space-3);
}

.dimension-score {
  font-size: var(--ds-text-2xl);
  font-weight: bold;
  color: var(--ds-info);
  margin-bottom: var(--ds-space-3);
}

.dimension-scores {
  display: flex;
  flex-wrap: wrap;
}

.dimension-detail-card {
  margin-bottom: var(--ds-space-5);
}

.dimension-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--ds-space-4);
}

.dimension-header .dimension-name {
  font-size: var(--ds-text-lg);
  font-weight: 600;
  margin: 0;
}

.issues-section,
.suggestions-section {
  margin-top: var(--ds-space-5);
}

.issues-section h4,
.suggestions-section h4 {
  margin-bottom: var(--ds-space-4);
  color: var(--ds-text-primary);
}

.issue-content {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
}

.issue-message {
  color: var(--ds-text-secondary);
}

.suggestions-list {
  padding-left: 20px;
  color: var(--ds-text-secondary);
  line-height: 1.8;
}

.recommendations-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-4);
}

.recommendation-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-4);
}

.recommendation-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ds-info);
  color: var(--ds-text-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.recommendation-text {
  flex: 1;
  line-height: 32px;
  color: var(--ds-text-secondary);
}

.progress-text {
  margin-top: 20px;
  text-align: center;
  color: var(--ds-text-secondary);
}

.markdown-content {
  line-height: 1.8;
  color: var(--ds-text-primary);
}

.markdown-content h2 {
  margin-top: 20px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--ds-surface-border);
}

.markdown-content h3 {
  margin-top: 15px;
  margin-bottom: 10px;
}

.markdown-content ul {
  padding-left: 20px;
}

.markdown-content li {
  margin-bottom: 5px;
}

.detail-content {
  min-height: 400px;
}

/* 敏感词检测样式 */
.sensitive-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-8) var(--ds-space-4);
  text-align: center;
  color: var(--ds-text-secondary);
}

.sensitive-empty p {
  margin-top: var(--ds-space-3);
  font-size: var(--ds-text-sm);
}

.sensitive-results {
  padding: var(--ds-space-2);
}

.sensitive-issue {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-2);
}

.sensitive-desc {
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  line-height: 1.6;
}

.sensitive-suggestion {
  margin-top: var(--ds-space-2);
  padding: var(--ds-space-2) var(--ds-space-3);
  background: var(--ds-bg-secondary);
  border-radius: var(--ds-radius-sm);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-secondary);
}
</style>
