<template>
  <div class="character-statistics">
    <!-- 统计概览 -->
    <el-row :gutter="20" class="stats-overview">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ totalCharacters }}</div>
          <div class="stat-label">总人物数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ protagonistCount }}</div>
          <div class="stat-label">主角</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ supportingCount }}</div>
          <div class="stat-label">配角</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-value">{{ totalAppearances }}</div>
          <div class="stat-label">总出场次数</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="20" class="charts-section">
      <!-- 出场频率柱状图 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>人物出场频率</span>
              <el-select v-model="chartSort" size="small" style="width: 120px">
                <el-option label="按频率排序" value="frequency" />
                <el-option label="按名称排序" value="name" />
              </el-select>
            </div>
          </template>
          <div ref="barChartRef" class="chart-container"></div>
        </el-card>
      </el-col>

      <!-- 人物类型饼图 -->
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>人物类型分布</span>
            </div>
          </template>
          <div ref="pieChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 出场趋势折线图 -->
    <el-card shadow="hover" class="trend-section">
      <template #header>
        <div class="card-header">
          <span>出场趋势</span>
          <div class="header-actions">
            <el-select v-model="selectedCharactersForTrend" multiple collapse-tags placeholder="选择人物" style="width: 300px">
              <el-option
                v-for="char in topCharacters"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
            <el-select v-model="trendRange" size="small" style="width: 120px; margin-left: 10px">
              <el-option label="最近10章" :value="10" />
              <el-option label="最近20章" :value="20" />
              <el-option label="最近50章" :value="50" />
              <el-option label="全部" :value="0" />
            </el-select>
          </div>
        </div>
      </template>
      <div ref="lineChartRef" class="chart-container large"></div>
    </el-card>

    <!-- 章节出场详情 -->
    <el-card shadow="hover" class="chapter-section">
      <template #header>
        <div class="card-header">
          <span>章节出场详情</span>
          <el-input
            v-model="chapterSearch"
            placeholder="搜索章节"
            style="width: 200px"
            clearable
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </template>

      <el-table :data="filteredChapterAppearances" style="width: 100%" max-height="400">
        <el-table-column prop="chapter" label="章节" width="80" />
        <el-table-column prop="title" label="标题" min-width="150" />
        <el-table-column label="出场人物" min-width="300">
          <template #default="{ row }">
            <el-tag
              v-for="char in row.characters"
              :key="char.id"
              :type="getTagType(char.importance)"
              size="small"
              style="margin-right: 5px; margin-bottom: 5px;"
            >
              {{ char.name }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="场景" width="150" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="goToChapter(row.chapter)">
              查看
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 人物标签管理 -->
    <el-card shadow="hover" class="tags-section">
      <template #header>
        <div class="card-header">
          <span>人物标签统计</span>
        </div>
      </template>

      <div class="tags-grid">
        <div
          v-for="tag in characterTags"
          :key="tag.type"
          class="tag-card"
          :style="{ borderColor: tag.color }"
        >
          <div class="tag-header" :style="{ backgroundColor: tag.color }">
            <span class="tag-name">{{ tag.label }}</span>
            <span class="tag-count">{{ tag.count }}</span>
          </div>
          <div class="tag-characters">
            <el-tag
              v-for="char in tag.characters.slice(0, 5)"
              :key="char.id"
              size="small"
              style="margin: 3px;"
            >
              {{ char.name }}
            </el-tag>
            <el-tag v-if="tag.characters.length > 5" size="small" type="info">
              +{{ tag.characters.length - 5 }}
            </el-tag>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import * as echarts from 'echarts/core'
import type { Entity, EntityImportance } from '@/types/sandbox'

const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const router = useRouter()

const project = computed(() => projectStore.currentProject)
const characters = computed(() => sandboxStore.entities.filter(e => e.type === 'CHARACTER' && !e.isArchived))
const chapters = computed(() => project.value?.chapters || [])
const outline = computed(() => project.value?.outline)

// 图表引用
const barChartRef = ref<HTMLElement>()
const pieChartRef = ref<HTMLElement>()
const lineChartRef = ref<HTMLElement>()

// 图表实例
let barChart: echarts.ECharts | null = null
let pieChart: echarts.ECharts | null = null
let lineChart: echarts.ECharts | null = null

// 筛选条件
const chartSort = ref<'frequency' | 'name'>('frequency')
const selectedCharactersForTrend = ref<string[]>([])
const trendRange = ref(20)
const chapterSearch = ref('')

// 标签配置 — V5 EntityImportance
const TAG_CONFIG: Record<EntityImportance, { label: string; color: string }> = {
  critical: { label: '核心人物', color: '#409EFF' },
  major: { label: '重要人物', color: '#67C23A' },
  minor: { label: '次要人物', color: '#909399' },
  background: { label: '背景人物', color: '#E6A23C' }
}

// 辅助：获取实体的状态事件数
function entityEventCount(entityId: string): number {
  return sandboxStore.stateEvents.filter(e => e.entityId === entityId).length
}

// 统计数据
const totalCharacters = computed(() => characters.value.length)

const protagonistCount = computed(() =>
  characters.value.filter(c => c.importance === 'critical').length
)

const supportingCount = computed(() =>
  characters.value.filter(c => c.importance === 'major').length
)

const totalAppearances = computed(() =>
  characters.value.reduce((sum, c) => sum + entityEventCount(c.id), 0)
)

// 出场次数最多的人物（前10名）
const topCharacters = computed(() => {
  return [...characters.value]
    .sort((a, b) => entityEventCount(b.id) - entityEventCount(a.id))
    .slice(0, 10)
})

// 人物标签统计 — V5: group by EntityImportance
const characterTags = computed(() => {
  const tagMap = new Map<EntityImportance, { count: number; characters: Entity[] }>()

  Object.keys(TAG_CONFIG).forEach(tag => {
    tagMap.set(tag as EntityImportance, { count: 0, characters: [] })
  })

  characters.value.forEach(char => {
    const importance = char.importance || 'background'
    const data = tagMap.get(importance)
    if (data) {
      data.count++
      data.characters.push(char)
    }
  })

  return Object.entries(TAG_CONFIG).map(([type, config]) => ({
    type: type as EntityImportance,
    label: config.label,
    color: config.color,
    count: tagMap.get(type as EntityImportance)?.count || 0,
    characters: tagMap.get(type as EntityImportance)?.characters || []
  }))
})

// 章节出场数据 — V5: derive from stateEvents
const chapterAppearances = computed(() => {
  if (!chapters.value || chapters.value.length === 0) return []

  return chapters.value.map(chapter => {
    const outlineChapter = (outline.value?.chapters || []).find(c => c.chapterId === chapter.id)
    const chapterEvents = sandboxStore.stateEvents.filter(e => e.chapterNumber === chapter.number)
    const entityIdsInChapter = new Set(chapterEvents.map(e => e.entityId))
    const chapterCharacters = characters.value
      .filter(c => entityIdsInChapter.has(c.id))
      .map(c => ({
        id: c.id,
        name: c.name,
        importance: c.importance || 'background'
      }))

    return {
      chapter: chapter.number,
      title: chapter.title,
      characters: chapterCharacters,
      location: outlineChapter?.location || ''
    }
  })
})

// 过滤后的章节出场
const filteredChapterAppearances = computed(() => {
  let result = chapterAppearances.value

  if (chapterSearch.value) {
    const search = chapterSearch.value.toLowerCase()
    result = result.filter(c =>
      c.title.toLowerCase().includes(search) ||
      (c.chapter != null && c.chapter.toString().includes(search))
    )
  }

  return result
})

// 初始化图表
function initCharts() {
  nextTick(() => {
    // 确保DOM元素可见后才初始化
    setTimeout(() => {
      if (barChartRef.value && barChartRef.value.clientWidth > 0) {
        barChart = echarts.init(barChartRef.value)
        updateBarChart()
      }
      if (pieChartRef.value && pieChartRef.value.clientWidth > 0) {
        pieChart = echarts.init(pieChartRef.value)
        updatePieChart()
      }
      if (lineChartRef.value && lineChartRef.value.clientWidth > 0) {
        lineChart = echarts.init(lineChartRef.value)
        updateLineChart()
      }
    }, 100)
  })
}

// 更新柱状图
function updateBarChart() {
  if (!barChart) return

  let sortedCharacters = [...characters.value]
  if (chartSort.value === 'frequency') {
    sortedCharacters.sort((a, b) => entityEventCount(b.id) - entityEventCount(a.id))
  } else {
    sortedCharacters.sort((a, b) => a.name.localeCompare(b.name))
  }

  // 只显示前15个人物
  const displayCharacters = sortedCharacters.slice(0, 15)

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: displayCharacters.map(c => c.name),
      axisLabel: {
        rotate: 30,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: '出场次数'
    },
    series: [{
      name: '出场次数',
      type: 'bar',
      data: displayCharacters.map(c => entityEventCount(c.id)),
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#409EFF' },
          { offset: 1, color: '#79BBFF' }
        ])
      },
      emphasis: {
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#337ECC' },
            { offset: 1, color: '#409EFF' }
          ])
        }
      }
    }]
  }

  barChart.setOption(option)
}

// 更新饼图
function updatePieChart() {
  if (!pieChart) return

  const data = characterTags.value.map(tag => ({
    name: tag.label,
    value: tag.count
  })).filter(d => d.value > 0)

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left'
    },
    series: [{
      name: '人物类型',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      labelLine: {
        show: true
      },
      data: data,
      color: characterTags.value.filter(t => t.count > 0).map(t => t.color)
    }]
  }

  pieChart.setOption(option)
}

// 更新折线图
function updateLineChart() {
  if (!lineChart) return

  // 确定要显示的人物
  const displayCharacterIds = selectedCharactersForTrend.value.length > 0
    ? selectedCharactersForTrend.value
    : topCharacters.value.slice(0, 5).map(c => c.id)

  const displayCharacters = characters.value.filter(c =>
    displayCharacterIds.includes(c.id)
  )

  // 确定章节范围
  const totalChapters = chapters.value.length
  const rangeStart = trendRange.value === 0 ? 0 : Math.max(0, totalChapters - trendRange.value)

  // 构建章节标签
  const chapterLabels = chapters.value
    .slice(rangeStart)
    .map(c => `第${c.number}章`)

  // 构建系列数据
  const series = displayCharacters.map(char => {
    const entityEvents = sandboxStore.stateEvents.filter(e => e.entityId === char.id)
    const eventChapters = new Set(entityEvents.map(e => e.chapterNumber))
    const data = chapters.value.slice(rangeStart).map(chapter => {
      return eventChapters.has(chapter.number) ? 1 : 0
    })

    return {
      name: char.name,
      type: 'line',
      data: data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6
    }
  })

  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: displayCharacters.map(c => c.name),
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chapterLabels,
      axisLabel: {
        rotate: 45,
        interval: Math.floor(chapterLabels.length / 20) // 自动调整间隔
      }
    },
    yAxis: {
      type: 'value',
      name: '是否出场',
      min: 0,
      max: 1,
      interval: 1,
      axisLabel: {
        formatter: (value: number) => value === 1 ? '出场' : '未出场'
      }
    },
    series: series as any[]
  }

  lineChart.setOption(option)
}

// 获取标签类型 — V5 EntityImportance → el-tag type
function getTagType(importance?: EntityImportance): string {
  if (!importance) return 'info'
  const types: Record<EntityImportance, string> = {
    critical: 'primary',
    major: 'success',
    minor: 'info',
    background: 'warning'
  }
  return types[importance] || 'info'
}

// 跳转到章节
function goToChapter(chapterNumber: number) {
  if (project.value) {
    router.push(`/project/${project.value.id}/chapters?chapter=${chapterNumber}`)
  }
}

// 窗口大小变化处理
function handleResize() {
  barChart?.resize()
  pieChart?.resize()
  lineChart?.resize()
}

// 监听数据变化
watch([characters, chapters, chartSort], () => {
  updateBarChart()
  updatePieChart()
})

watch([selectedCharactersForTrend, trendRange], () => {
  updateLineChart()
})

// 初始化选中人物
watch(topCharacters, (newTop) => {
  if (selectedCharactersForTrend.value.length === 0 && newTop.length > 0) {
    selectedCharactersForTrend.value = newTop.slice(0, 5).map(c => c.id)
  }
}, { immediate: true })

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (barChart) {
    barChart.dispose()
    barChart = null
  }
  if (pieChart) {
    pieChart.dispose()
    pieChart = null
  }
  if (lineChart) {
    lineChart.dispose()
    lineChart = null
  }
})
</script>

<style scoped>
.character-statistics {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stats-overview {
  margin-bottom: 0;
}

.stat-card {
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #409EFF;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 5px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
}

.chart-container {
  width: 100%;
  height: 300px;
}

.chart-container.large {
  height: 400px;
}

.tags-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.tag-card {
  border: 2px solid;
  border-radius: 8px;
  overflow: hidden;
}

.tag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  color: white;
}

.tag-name {
  font-weight: 600;
}

.tag-count {
  font-size: 18px;
  font-weight: bold;
}

.tag-characters {
  padding: 10px;
  min-height: 60px;
}

.charts-section,
.trend-section,
.chapter-section,
.tags-section {
  margin-bottom: 0;
}
</style>
