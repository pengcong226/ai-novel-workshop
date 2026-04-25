<template>
  <div class="table-chart">
    <el-card class="chart-card">
      <template #header>
        <div class="chart-header">
          <span>数据可视化</span>
          <div class="chart-controls">
            <el-select v-model="chartType" size="small" style="width: 120px">
              <el-option label="柱状图" value="bar" />
              <el-option label="饼图" value="pie" />
              <el-option label="折线图" value="line" />
            </el-select>
            <el-select v-model="selectedColumn" size="small" style="width: 150px">
              <el-option label="选择列" :value="-1" disabled />
              <el-option
                v-for="(col, index) in columns"
                :key="index"
                :label="col"
                :value="index"
              />
            </el-select>
            <el-button size="small" @click="exportChart">
              <el-icon><Download /></el-icon>
              导出图表
            </el-button>
          </div>
        </div>
      </template>

      <div class="chart-container" ref="chartContainer">
        <v-chart
          v-if="chartData.length > 0 && chartReady"
          :option="chartOption"
          :autoresize="true"
          class="chart"
        />
        <el-empty
          v-else
          description="请选择列以生成图表"
        />
      </div>
    </el-card>

    <!-- 统计信息 -->
    <el-card v-if="statistics" class="stats-card">
      <template #header>
        <span>统计信息</span>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="总行数">
          {{ statistics.totalRows }}
        </el-descriptions-item>
        <el-descriptions-item label="唯一值">
          {{ statistics.uniqueValues }}
        </el-descriptions-item>
        <el-descriptions-item label="空值">
          {{ statistics.emptyValues }}
        </el-descriptions-item>
        <el-descriptions-item label="最常见值">
          {{ statistics.mostCommon }}
        </el-descriptions-item>
        <el-descriptions-item label="出现次数">
          {{ statistics.mostCommonCount }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent, onMounted } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

// 异步加载 vue-echarts
const VChart = defineAsyncComponent(() =>
  import('vue-echarts').then(mod => mod.default)
)

interface Props {
  columns: string[]
  data: string[][]
}

const props = defineProps<Props>()

const chartType = ref<'bar' | 'pie' | 'line'>('bar')
const selectedColumn = ref<number>(-1)
const chartContainer = ref<HTMLElement>()
const chartReady = ref(false)

interface ChartAnalysis {
  data: [string, number][]
  statistics: {
    totalRows: number
    uniqueValues: number
    emptyValues: number
    mostCommon: string
    mostCommonCount: number
  } | null
}

const chartAnalysis = computed<ChartAnalysis>(() => {
  if (selectedColumn.value < 0 || !props.data.length) {
    return { data: [], statistics: null }
  }

  const colIndex = selectedColumn.value
  const valueCounts = new Map<string, number>()

  props.data.forEach(row => {
    const value = row[colIndex]?.trim() || '(空)'
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1)
  })

  // 按出现次数排序，取前 20 个
  const sorted = Array.from(valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  return {
    data: sorted,
    statistics: {
      totalRows: props.data.length,
      uniqueValues: valueCounts.size,
      emptyValues: valueCounts.get('(空)') || 0,
      mostCommon: sorted[0]?.[0] || '-',
      mostCommonCount: sorted[0]?.[1] || 0
    }
  }
})

const statistics = computed(() => chartAnalysis.value.statistics)

// 计算图表数据
const chartData = computed(() => chartAnalysis.value.data)

// 图表配置
const chartOption = computed(() => {
  if (chartData.value.length === 0) {
    return {}
  }

  const baseOption = {
    title: {
      text: selectedColumn.value >= 0
        ? `${props.columns[selectedColumn.value]} - 数据分布`
        : '数据分布',
      left: 'center'
    },
    tooltip: {
      trigger: chartType.value === 'pie' ? 'item' : 'axis',
      formatter: chartType.value === 'pie'
        ? '{b}: {c} ({d}%)'
        : '{b}: {c}'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    }
  }

  if (chartType.value === 'pie') {
    return {
      ...baseOption,
      legend: {
        orient: 'vertical',
        left: 'left',
        top: 'middle'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {d}%'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        data: chartData.value.map(([name, value]) => ({
          name: name.substring(0, 20),  // 限制名称长度
          value
        }))
      }]
    }
  }

  // 柱状图和折线图
  return {
    ...baseOption,
    xAxis: {
      type: 'category',
      data: chartData.value.map(([name]) =>
        name.length > 10 ? name.substring(0, 10) + '...' : name
      ),
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: '出现次数'
    },
    series: [{
      type: chartType.value,
      data: chartData.value.map(([, value]) => value),
      smooth: chartType.value === 'line',
      itemStyle: {
        color: '#409eff'
      },
      areaStyle: chartType.value === 'line' ? {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
          ]
        }
      } : undefined,
      label: {
        show: true,
        position: 'top'
      }
    }]
  }
})

// 监听数据变化
watch([chartData, chartType], () => {
  if (chartData.value.length > 0) {
    chartReady.value = false
    setTimeout(() => {
      chartReady.value = true
    }, 100)
  }
})

onMounted(() => {
  chartReady.value = true
})

// 导出图表
function exportChart() {
  if (!chartContainer.value) {
    return
  }

  // 获取 canvas
  const canvas = chartContainer.value.querySelector('canvas')
  if (!canvas) {
    ElMessage.warning('图表尚未渲染完成')
    return
  }

  try {
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `chart-${Date.now()}.png`
    a.click()
    ElMessage.success('图表已导出')
  } catch (error) {
    ElMessage.error('导出失败: ' + error)
  }
}
</script>

<style scoped>
.table-chart {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chart-card {
  width: 100%;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-controls {
  display: flex;
  gap: 10px;
}

.chart-container {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart {
  width: 100%;
  height: 100%;
}

.stats-card {
  width: 100%;
}
</style>
