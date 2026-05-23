<template>
  <div v-if="isDev" class="dev-panel">
    <div class="dev-page-header">
      <h2>开发者面板</h2>
      <el-tag
        v-if="mockEnabled"
        class="mock-indicator"
        type="danger"
        size="small"
      >
        MOCK ON
      </el-tag>
    </div>

    <div class="dev-content">
      <el-card class="card" shadow="never">
        <template #header>日志配置</template>
        <el-form label-width="90px">
          <el-form-item label="日志开关">
            <el-switch v-model="loggerEnabled" @change="applyLoggerConfig" />
          </el-form-item>
          <el-form-item label="日志级别">
            <el-select v-model="loggerLevel" @change="applyLoggerConfig" style="width: 100%">
              <el-option label="debug" value="debug" />
              <el-option label="info" value="info" />
              <el-option label="warn" value="warn" />
              <el-option label="error" value="error" />
              <el-option label="silent" value="silent" />
            </el-select>
          </el-form-item>
          <el-form-item label="命名空间">
            <el-input
              v-model="loggerNamespacesText"
              placeholder="如 app:*,project:*,ai:*"
              @blur="applyLoggerConfig"
            />
          </el-form-item>
          <el-form-item>
            <el-space>
              <el-button size="small" @click="refreshLogs">刷新日志</el-button>
              <el-button size="small" type="danger" plain @click="clearLogs">清空日志</el-button>
            </el-space>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="card" shadow="never">
        <template #header>AI Mock 调试</template>
        <el-space direction="vertical" alignment="start">
          <el-switch
            v-model="mockEnabled"
            active-text="开启免Token Mock"
            inactive-text="关闭 Mock"
            @change="handleMockSwitch"
          />
          <el-text type="info" size="small">
            仅开发环境生效。开启后 `useAIStore.chat()` 与 `useAIStore.chatStream()`
            将返回模拟数据，不触发真实 API 请求。
          </el-text>
        </el-space>
      </el-card>

      <el-card class="card" shadow="never">
        <template #header>系统调试</template>
        <el-space>
          <el-button size="small" @click="refreshPluginStatus">刷新插件状态</el-button>
          <el-button size="small" @click="runConflictTest">运行冲突检测测试</el-button>
        </el-space>
        <pre class="status-preview">{{ pluginStatusText }}</pre>
      </el-card>

      <el-card class="card" shadow="never">
        <template #header>
          日志缓冲 ({{ filteredLogs.length }} / {{ logs.length }})
        </template>

        <el-input
          v-model="logFilter"
          size="small"
          placeholder="按级别/命名空间/关键字过滤"
          clearable
          class="log-filter"
        />

        <div class="log-list">
          <div
            v-for="(entry, index) in filteredLogs"
            :key="`${entry.timestamp}-${index}`"
            class="log-item"
          >
            <div class="log-meta">
              <el-tag size="small" :type="tagType(entry.level)">{{ entry.level }}</el-tag>
              <span class="ns">{{ entry.namespace }}</span>
              <span class="time">{{ formatTime(entry.time) }}</span>
            </div>
            <div class="log-message">{{ entry.message }}</div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getPluginSystemStatus } from '@/plugins/setup'
import { getAIMockEnabled, setAIMockEnabled } from '@/utils/devFlags'
import { getLoggerManager, type LogEntry, type LogLevel } from '@/utils/logger'

const isDev = import.meta.env.DEV

const loggerManager = getLoggerManager()
const logs = ref<LogEntry[]>([])

const loggerEnabled = ref(true)
const loggerLevel = ref<LogLevel>('info')
const loggerNamespacesText = ref('*')

const mockEnabled = ref(getAIMockEnabled())
const pluginStatus = ref<Record<string, unknown> | null>(null)
const logFilter = ref('')

let timer: number | null = null


function syncConfigFromManager() {
  const config = loggerManager.getConfig()
  loggerEnabled.value = config.enabled
  loggerLevel.value = config.level
  loggerNamespacesText.value = config.namespaces.join(',')
}

function parseNamespaces(input: string): string[] {
  return input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function applyLoggerConfig() {
  loggerManager.configure({
    enabled: loggerEnabled.value,
    level: loggerLevel.value,
    namespaces: parseNamespaces(loggerNamespacesText.value)
  })
  syncConfigFromManager()
  refreshLogs()
}

function refreshLogs() {
  logs.value = loggerManager.getLogs().slice().reverse()
}

function clearLogs() {
  loggerManager.clearLogs()
  refreshLogs()
}

function handleMockSwitch(enabled: boolean) {
  setAIMockEnabled(enabled)
  ElMessage.success(enabled ? '已开启 AI Mock 模式' : '已关闭 AI Mock 模式')
}

function refreshPluginStatus() {
  try {
    pluginStatus.value = getPluginSystemStatus() as Record<string, unknown>
  } catch (error) {
    pluginStatus.value = {
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function runConflictTest() {
  const devWindow = window as Window & { runConflictDetectionTest?: () => Promise<void> }
  const tester = devWindow.runConflictDetectionTest
  if (typeof tester === 'function') {
    tester()
    ElMessage.success('已在控制台触发冲突检测测试')
  } else {
    ElMessage.warning('runConflictDetectionTest 未挂载（请确认测试脚本已加载）')
  }
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleTimeString()} .${String(date.getMilliseconds()).padStart(3, '0')}`
}

function tagType(level: LogLevel): 'info' | 'success' | 'warning' | 'danger' {
  if (level === 'debug') return 'info'
  if (level === 'info') return 'success'
  if (level === 'warn') return 'warning'
  return 'danger'
}

const filteredLogs = computed(() => {
  const keyword = logFilter.value.trim().toLowerCase()
  if (!keyword) return logs.value

  return logs.value.filter(entry => {
    const text = `${entry.level} ${entry.namespace} ${entry.message}`.toLowerCase()
    return text.includes(keyword)
  })
})

const pluginStatusText = computed(() => {
  if (!pluginStatus.value) return '暂无状态数据'
  return JSON.stringify(pluginStatus.value, null, 2)
})

onMounted(() => {
  if (!isDev) return

  syncConfigFromManager()
  refreshLogs()
  refreshPluginStatus()
  timer = window.setInterval(() => {
    refreshLogs()
  }, 1200)
})

onUnmounted(() => {
  if (timer !== null) {
    window.clearInterval(timer)
  }

})
</script>

<style scoped>
.dev-panel {
  max-width: 1200px;
  margin: 0 auto;
}

.dev-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dev-page-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}

.mock-indicator {
  margin-left: 8px;
}

.dev-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  border: 1px solid #ebeef5;
}

.status-preview {
  margin-top: 10px;
  max-height: 180px;
  overflow: auto;
  background: #f5f7fa;
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
}

.log-filter {
  margin-bottom: 10px;
}

.log-list {
  max-height: 340px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.log-meta .ns {
  color: #606266;
  font-weight: 500;
}

.log-meta .time {
  margin-left: auto;
  color: #909399;
}

.log-message {
  font-size: 13px;
  color: #303133;
  word-break: break-all;
}
</style>
