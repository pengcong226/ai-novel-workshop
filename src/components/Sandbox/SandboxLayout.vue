<template>
  <div class="sandbox-layout">
    <div class="sidebar">Entities Tree (WIP)</div>
    <div class="main-view">
      <div style="margin-bottom: 10px;">
        <el-button type="warning" plain icon="ri-magic-line" @click="sandboxStore.isWizardMode = true">批量世界生成向导</el-button>
        <el-button type="primary" plain @click="showDeepImport = true">深度小说导入</el-button>
      </div>
      <ChapterScrubber
        v-model="sandboxStore.currentChapter"
        :total-chapters="totalChapters"
      />
      <el-tabs v-model="activeTab">
        <el-tab-pane label="文档视图" name="doc"><SandboxDocument /></el-tab-pane>
        <el-tab-pane label="命运织布机" name="timeline"><PlotLoomBoard /></el-tab-pane>
        <el-tab-pane label="关系图" name="graph"><SandboxGraph /></el-tab-pane>
        <el-tab-pane label="势力图" name="map"><SandboxMap /></el-tab-pane>
      </el-tabs>
    </div>
    <div class="right-sidebar">
      <NovelDeepImportDialog v-if="showDeepImport" @close="showDeepImport = false" @done="handleDeepImportDone" />
      <WorldGenWizard v-else-if="sandboxStore.isWizardMode" @close="sandboxStore.isWizardMode = false" />
      <AutomatonChat v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSandboxStore } from '@/stores/sandbox'
import SandboxDocument from './SandboxDocument.vue'
import PlotLoomBoard from './PlotLoomBoard.vue'
import SandboxGraph from './SandboxGraph.vue'
import SandboxMap from './SandboxMap.vue'
import AutomatonChat from './AutomatonChat.vue'
import WorldGenWizard from './WorldGenWizard.vue'
import NovelDeepImportDialog from './NovelDeepImportDialog.vue'
import ChapterScrubber from './ChapterScrubber.vue'

const activeTab = ref('timeline')
const projectStore = useProjectStore()
const sandboxStore = useSandboxStore()
const showDeepImport = ref(false)

const totalChapters = computed(() => {
  return projectStore.currentProject?.chapters.length || 1
})

function handleDeepImportDone() {
  showDeepImport.value = false
  if (projectStore.currentProject) {
    sandboxStore.isLoaded = false
    sandboxStore.loadData(projectStore.currentProject.id)
  }
}

let lastLoadedProjectId = ''

onMounted(() => {
  if (projectStore.currentProject) {
    lastLoadedProjectId = projectStore.currentProject.id
    sandboxStore.loadData(projectStore.currentProject.id)
  }
})

watch(() => projectStore.currentProject, (newProj) => {
  if (newProj && newProj.id !== lastLoadedProjectId) {
    lastLoadedProjectId = newProj.id
    sandboxStore.isLoaded = false
    sandboxStore.loadData(newProj.id)
  }
})
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