<template>
  <div class="plot-loom-board">
    <div class="loom-header">
      <h4>命运织布机 (Plot Loom)</h4>
      <el-button size="small" type="primary" @click="addVolume">➕ 新建卷 (Volume)</el-button>
    </div>

    <div class="volumes-container" v-if="projectStore.currentProject?.outline">
      <div class="volume-column" v-for="(vol, vIndex) in projectStore.currentProject.outline.volumes" :key="vol.id">
        <div class="volume-header">
          <input v-model="vol.title" class="vol-title-input" />
          <div class="vol-meta">第 {{vol.startChapter}} - {{vol.endChapter}} 章</div>
        </div>

        <div class="anchors-zone">
          <div class="section-label">📌 命运锚点</div>
          <div class="anchor-card" v-for="anchor in vol.anchors" :key="anchor.id">
            <span class="anchor-target">第{{anchor.targetChapterNumber}}章</span>
            <input v-model="anchor.description" class="anchor-desc" />
          </div>
          <el-button size="small" text @click="addAnchor(vol)">+ 添加锚点</el-button>
        </div>

        <div class="chapters-zone">
          <div class="section-label">📄 单章细纲</div>
          <div class="chapter-card" v-for="chap in vol.chapters" :key="chap.chapterId">
            <div class="chap-title">{{chap.title}}</div>
          </div>
          <el-button size="small" text @click="addChapterOutline(vol)">+ 补全本卷空缺</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useProjectStore } from '@/stores/project';
import { v4 as uuidv4 } from 'uuid';

const projectStore = useProjectStore();

function addVolume() {
  if (!projectStore.currentProject) return;
  if (!projectStore.currentProject.outline.volumes) {
    projectStore.currentProject.outline.volumes = [];
  }
  const volNumber = projectStore.currentProject.outline.volumes.length + 1;
  projectStore.currentProject.outline.volumes.push({
    id: uuidv4(),
    number: volNumber,
    title: `第 ${volNumber} 卷`,
    startChapter: (volNumber - 1) * 30 + 1,
    endChapter: volNumber * 30,
    theme: '新篇章',
    mainEvents: [],
    anchors: [],
    chapters: []
  });
}

function addAnchor(vol: any) {
  if (!vol.anchors) vol.anchors = [];
  vol.anchors.push({
    id: uuidv4(),
    targetChapterNumber: vol.endChapter,
    description: '核心事件',
    isResolved: false
  });
}

function addChapterOutline(vol: any) {
  // Placeholder for AI generation hook
  if (!vol.chapters) vol.chapters = [];
  vol.chapters.push({
    chapterId: uuidv4(),
    title: `第 ${vol.startChapter + vol.chapters.length} 章`,
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned'
  });
}
</script>

<style scoped>
.plot-loom-board {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-page);
}
.loom-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
}
.volumes-container {
  display: flex;
  flex: 1;
  overflow-x: auto;
  padding: 16px;
  gap: 16px;
}
.volume-column {
  min-width: 320px;
  width: 320px;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}
.volume-header {
  padding: 12px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  border-radius: 8px 8px 0 0;
}
.vol-title-input {
  width: 100%;
  background: transparent;
  border: none;
  font-size: 16px;
  font-weight: bold;
  color: var(--text-primary);
  outline: none;
}
.vol-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
.anchors-zone {
  padding: 12px;
  background: rgba(245, 158, 11, 0.05);
  border-bottom: 1px solid var(--border-color);
}
.section-label {
  font-size: 12px;
  font-weight: bold;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.anchor-card {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
  display: flex;
  gap: 8px;
}
.anchor-target {
  font-size: 12px;
  color: #d97706;
  font-weight: bold;
  white-space: nowrap;
}
.anchor-desc {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
}
.chapters-zone {
  padding: 12px;
  flex: 1;
  overflow-y: auto;
}
.chapter-card {
  background: var(--bg-color-page);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}
.chap-title {
  font-size: 13px;
  font-weight: 500;
}
</style>