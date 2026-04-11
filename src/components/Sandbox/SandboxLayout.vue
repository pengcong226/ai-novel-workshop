<template>
  <div class="sandbox-layout">
    <div class="sidebar">Entities Tree (WIP)</div>
    <div class="main-view">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="文档视图" name="doc"><SandboxDocument /></el-tab-pane>
        <el-tab-pane label="时间线" name="timeline"><SandboxTimeline /></el-tab-pane>
        <el-tab-pane label="关系图" name="graph"><SandboxGraph /></el-tab-pane>
        <el-tab-pane label="势力图" name="map"><SandboxMap /></el-tab-pane>
      </el-tabs>
    </div>
    <div class="right-sidebar">
      <AutomatonChat />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SandboxDocument from './SandboxDocument.vue'
import SandboxTimeline from './SandboxTimeline.vue'
import SandboxGraph from './SandboxGraph.vue'
import SandboxMap from './SandboxMap.vue'
import AutomatonChat from './AutomatonChat.vue'

const activeTab = ref('timeline')
</script>

<style scoped>
.sandbox-layout {
  display: flex;
  height: 100%;
  gap: 16px;
}
.sidebar { width: 250px; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; }
.main-view { flex: 1; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
.right-sidebar { width: 300px; background: #fff; padding: 16px; border: 1px solid #e4e7ed; border-radius: 4px; }
</style>