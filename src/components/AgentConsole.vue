<template>
  <div class="agent-console">
    <el-card class="console-card">
      <template #header>
        <div class="card-header">
          <span>Agent 控制台</span>
          <el-tag size="small" type="info">最近配置</el-tag>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon>
        <template #title>多 Agent 协作写作状态</template>
        <div>这里展示当前项目的 Agent 配置。当前只有编辑审校和读者反馈接入生成后流程，运行日志会写入调试日志。</div>
      </el-alert>

      <div class="agent-grid">
        <el-card v-for="agent in agentConfigs" :key="agent.role" shadow="never" class="agent-card">
          <div class="agent-title">
            <span>{{ agentLabels[agent.role] }}</span>
            <el-tag v-if="agent.role !== 'editor' && agent.role !== 'reader'" size="small" type="info">未接入</el-tag>
            <el-tag v-else :type="agent.enabled ? 'success' : 'info'" size="small">
              {{ agent.enabled ? '已启用' : '已关闭' }}
            </el-tag>
          </div>
          <div class="agent-meta">
            <span>阶段：{{ phaseLabels[agent.phase] }}</span>
            <span>优先级：{{ agent.priority }}</span>
            <span v-if="agent.batchOnly">仅批量运行</span>
          </div>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { normalizeProjectConfig } from '@/utils/project-config-normalizer'
import type { AgentPhase, AgentRole } from '@/agents/types'

const projectStore = useProjectStore()

const agentLabels: Record<AgentRole, string> = {
  planner: '规划师 Agent',
  writer: '写手 Agent',
  sentinel: '哨兵 Agent',
  extractor: '抽取 Agent',
  editor: '编辑 Agent',
  reader: '读者 Agent',
}

const phaseLabels: Record<AgentPhase, string> = {
  'pre-generation': '生成前',
  generation: '生成中',
  'post-generation': '生成后',
}

const agentConfigs = computed(() =>
  normalizeProjectConfig(projectStore.currentProject?.config).agentConfigs ?? []
)
</script>

<style scoped>
.agent-console {
  max-width: 1100px;
  margin: 0 auto;
}

.console-card {
  border-radius: 12px;
}

.card-header,
.agent-title,
.agent-meta {
  display: flex;
}

.card-header,
.agent-title {
  align-items: center;
  justify-content: space-between;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.agent-card {
  border-radius: 10px;
}

.agent-title {
  font-weight: 600;
  margin-bottom: 12px;
}

.agent-meta {
  flex-direction: column;
  gap: 6px;
  color: #606266;
  font-size: 13px;
}
</style>
