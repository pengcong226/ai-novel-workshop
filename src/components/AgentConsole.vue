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
        <div>这里展示当前项目的 Agent 配置。生成前可运行规划师，生成后可按优先级运行哨兵、编辑审校、读者反馈和抽取器。</div>
      </el-alert>

      <div class="agent-grid">
        <el-card v-for="agent in agentConfigs" :key="agent.role" shadow="never" class="agent-card">
          <div class="agent-title">
            <span>{{ agentLabels[agent.role] }}</span>
            <el-tag :type="agent.enabled ? 'success' : 'info'" size="small">
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
  border-radius: var(--ds-radius-lg);
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ds-space-4);
  margin-top: var(--ds-space-5);
}

.agent-card {
  position: relative;
  overflow: hidden;
  border-radius: var(--ds-radius-md);
}

.agent-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--ds-accent);
}

.agent-title {
  font-weight: 600;
  margin-bottom: var(--ds-space-3);
  padding-left: var(--ds-space-2);
}

.agent-title span:first-child::before {
  content: '🤖';
  margin-right: var(--ds-space-2);
}

.agent-meta {
  flex-direction: column;
  gap: var(--ds-space-2);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  padding-left: var(--ds-space-2);
}
</style>
