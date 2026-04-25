<template>
  <div class="plot-loom-board">
    <div class="loom-header">
      <div>
        <h4>命运织布机</h4>
        <p>管理卷纲、章节细纲、场景、伏笔与 AI 大纲细化提案。</p>
      </div>
      <div class="header-actions">
        <el-select v-model="selectedTemplateId" placeholder="选择结构模板" size="small" style="width: 180px">
          <el-option
            v-for="template in outlineStructureTemplates"
            :key="template.id"
            :label="template.name"
            :value="template.id"
          />
        </el-select>
        <el-button size="small" :disabled="!outline" @click="applyTemplate">套用模板</el-button>
        <el-button size="small" type="primary" :disabled="!outline" :loading="isRefining" @click="runAIRefinement">AI 细化</el-button>
        <el-button size="small" type="success" :disabled="!outline" @click="saveOutline">保存大纲</el-button>
      </div>
    </div>

    <el-empty v-if="!projectStore.currentProject?.outline" description="暂无项目大纲" />

    <div v-else-if="outline" class="outline-workspace">
      <aside class="outline-sidebar">
        <el-card shadow="never" class="summary-card">
          <template #header>总纲</template>
          <label>梗概</label>
          <el-input v-model="outline.synopsis" type="textarea" :rows="4" />
          <label>主题</label>
          <el-input v-model="outline.theme" type="textarea" :rows="2" />
        </el-card>

        <el-card shadow="never" class="summary-card">
          <template #header>
            <div class="card-header">
              <span>AI 细化提案</span>
              <el-tag v-if="proposal" size="small" type="warning">待确认</el-tag>
            </div>
          </template>
          <el-empty v-if="!proposal" description="暂无提案" :image-size="64" />
          <div v-else class="proposal-panel">
            <p>{{ proposal.summary }}</p>
            <div class="proposal-changes">
              <div v-for="change in proposal.changes.slice(0, 12)" :key="change.path" class="proposal-change">
                <strong>{{ change.path }}</strong>
                <span>{{ formatChange(change.after) }}</span>
              </div>
            </div>
            <div class="proposal-actions">
              <el-button size="small" type="primary" @click="acceptProposal">采纳提案</el-button>
              <el-button size="small" @click="proposal = null">忽略</el-button>
            </div>
          </div>
        </el-card>
      </aside>

      <main class="outline-main">
        <section class="volumes-section">
          <div class="section-toolbar">
            <h5>卷纲</h5>
            <el-button size="small" @click="addVolume">新建卷</el-button>
          </div>
          <div class="volumes-container">
            <div v-for="volume in outline.volumes" :key="volume.id" class="volume-column">
              <div class="volume-header">
                <el-input v-model="volume.title" size="small" />
                <div class="volume-range">
                  <el-input-number v-model="volume.startChapter" size="small" :min="1" controls-position="right" />
                  <span>-</span>
                  <el-input-number v-model="volume.endChapter" size="small" :min="volume.startChapter" controls-position="right" />
                </div>
                <el-input v-model="volume.theme" type="textarea" :rows="2" placeholder="本卷主题" />
              </div>

              <div class="anchors-zone">
                <div class="section-label">命运锚点</div>
                <div v-for="anchor in volume.anchors" :key="anchor.id" class="anchor-card">
                  <el-input-number v-model="anchor.targetChapterNumber" size="small" :min="1" controls-position="right" />
                  <el-input v-model="anchor.description" size="small" placeholder="核心事件" />
                  <el-switch v-model="anchor.isResolved" size="small" />
                </div>
                <el-button size="small" text @click="addAnchor(volume)">添加锚点</el-button>
              </div>
            </div>
          </div>
        </section>

        <section class="chapters-section">
          <div class="section-toolbar">
            <h5>章节细纲</h5>
            <el-button size="small" @click="addChapterOutline">新增章节细纲</el-button>
          </div>

          <el-collapse v-model="activeChapterIds">
            <el-collapse-item v-for="(chapter, chapterIndex) in outline.chapters" :key="chapter.chapterId" :name="chapter.chapterId">
              <template #title>
                <div class="chapter-title-row">
                  <el-tag size="small" :type="statusTagType(chapter.status)">第 {{ chapterIndex + 1 }} 章</el-tag>
                  <span>{{ chapter.title || '未命名章节' }}</span>
                  <el-tag v-if="chapter.aiRefinedAt" size="small" type="success">AI 已细化</el-tag>
                </div>
              </template>

              <div class="chapter-editor">
                <div class="chapter-grid">
                  <label>标题</label>
                  <el-input v-model="chapter.title" />
                  <label>状态</label>
                  <el-select v-model="chapter.status">
                    <el-option label="已规划" value="planned" />
                    <el-option label="写作中" value="writing" />
                    <el-option label="已完成" value="completed" />
                    <el-option label="需更新" value="outdated" />
                  </el-select>
                  <label>主场景</label>
                  <el-input v-model="chapter.location" />
                  <label>角色</label>
                  <el-select v-model="chapter.characters" multiple filterable allow-create default-first-option placeholder="输入角色">
                    <el-option v-for="name in knownCharacters" :key="name" :label="name" :value="name" />
                  </el-select>
                </div>

                <div class="list-grid">
                  <outline-string-list title="目标" :items="chapter.goals" @update="updateListItem(chapter.goals, $event.index, $event.value)" @remove="removeListItem(chapter.goals, $event)" @add="chapter.goals.push('新目标')" />
                  <outline-string-list title="冲突" :items="chapter.conflicts" @update="updateListItem(chapter.conflicts, $event.index, $event.value)" @remove="removeListItem(chapter.conflicts, $event)" @add="chapter.conflicts.push('新冲突')" />
                  <outline-string-list title="解决" :items="chapter.resolutions" @update="updateListItem(chapter.resolutions, $event.index, $event.value)" @remove="removeListItem(chapter.resolutions, $event)" @add="chapter.resolutions.push('解决方式')" />
                  <outline-string-list title="伏笔埋设" :items="chapter.foreshadowingToPlant ?? []" @update="updateForeshadowing(chapter, 'plant', $event.index, $event.value)" @remove="removeForeshadowing(chapter, 'plant', $event)" @add="addForeshadowing(chapter, 'plant')" />
                  <outline-string-list title="伏笔回收" :items="chapter.foreshadowingToResolve ?? []" @update="updateForeshadowing(chapter, 'resolve', $event.index, $event.value)" @remove="removeForeshadowing(chapter, 'resolve', $event)" @add="addForeshadowing(chapter, 'resolve')" />
                </div>

                <div class="scenes-zone">
                  <div class="section-toolbar compact">
                    <span>场景</span>
                    <el-button size="small" text @click="addScene(chapter)">添加场景</el-button>
                  </div>
                  <div v-for="(scene, sceneIndex) in chapter.scenes" :key="scene.id" class="scene-card">
                    <el-tag size="small">{{ sceneIndex + 1 }}</el-tag>
                    <el-input v-model="scene.description" type="textarea" :rows="2" placeholder="场景内容" />
                    <el-input v-model="scene.location" size="small" placeholder="地点" />
                    <el-input v-model="scene.purpose" size="small" placeholder="叙事目的" />
                    <el-button size="small" text type="danger" @click="removeScene(chapter, sceneIndex)">删除</el-button>
                  </div>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { v4 as uuidv4 } from 'uuid'
import type { ChapterOutline, Scene, Volume } from '@/types'
import type { OutlineRefinementChange, OutlineRefinementProposal } from '@/services/outline-refiner'
import { useProjectStore } from '@/stores/project'
import { outlineStructureTemplates, getOutlineTemplateById } from '@/data/outlineTemplates'
import { applyOutlineRefinementProposal, refineOutlineWithAI } from '@/services/outline-refiner'

const OutlineStringList = defineComponent({
  name: 'OutlineStringList',
  props: {
    title: { type: String, required: true },
    items: { type: Array<string>, required: true },
  },
  emits: ['add', 'update', 'remove'],
  setup(props, { emit }) {
    return () => h('div', { class: 'string-list' }, [
      h('div', { class: 'section-toolbar compact' }, [
        h('span', props.title),
        h('button', { class: 'inline-add-button', onClick: () => emit('add') }, '添加'),
      ]),
      ...props.items.map((_, index) => h('div', { class: 'string-list-item' }, [
        h('input', {
          value: props.items[index],
          onInput: (event: Event) => emit('update', { index, value: (event.target as HTMLInputElement).value }),
        }),
        h('button', { onClick: () => emit('remove', index) }, '删除'),
      ])),
    ])
  },
})

const projectStore = useProjectStore()
const selectedTemplateId = ref<string>()
const isRefining = ref(false)
const proposal = ref<OutlineRefinementProposal | null>(null)
const activeChapterIds = ref<string[]>([])

const outline = computed(() => projectStore.currentProject?.outline ?? null)

const knownCharacters = computed(() => {
  const names = new Set<string>()
  if (!outline.value) return []
  for (const chapter of outline.value.chapters) {
    for (const name of chapter.characters) names.add(name)
  }
  return [...names]
})

function createScene(index: number): Scene {
  return {
    id: uuidv4(),
    description: '新场景',
    characters: [],
    location: '',
    order: index,
  }
}

function createChapterOutline(index: number): ChapterOutline {
  return {
    chapterId: uuidv4(),
    title: `第 ${index + 1} 章`,
    scenes: [createScene(0)],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned',
    draftedAt: Date.now(),
  }
}

function addVolume(): void {
  if (!outline.value) return
  const volumes = outline.value.volumes
  const number = volumes.length + 1
  volumes.push({
    id: uuidv4(),
    number,
    title: `第 ${number} 卷`,
    theme: '新篇章',
    startChapter: (number - 1) * 30 + 1,
    endChapter: number * 30,
    mainEvents: [],
    anchors: [],
    chapters: [],
  })
}

function addAnchor(volume: Volume): void {
  volume.anchors ??= []
  volume.anchors.push({
    id: uuidv4(),
    targetChapterNumber: volume.endChapter,
    description: '核心事件',
    isResolved: false,
  })
}

function addChapterOutline(): void {
  if (!outline.value) return
  const chapter = createChapterOutline(outline.value.chapters.length)
  outline.value.chapters.push(chapter)
  activeChapterIds.value = [chapter.chapterId]
}

function addScene(chapter: ChapterOutline): void {
  chapter.scenes.push(createScene(chapter.scenes.length))
}

function removeScene(chapter: ChapterOutline, index: number): void {
  chapter.scenes.splice(index, 1)
  chapter.scenes.forEach((scene, sceneIndex) => { scene.order = sceneIndex })
}


function updateListItem(items: string[], index: number, value: string): void {
  items[index] = value
}

function removeListItem(items: string[], index: number): void {
  items.splice(index, 1)
}

function updateForeshadowing(chapter: ChapterOutline, type: 'plant' | 'resolve', index: number, value: string): void {
  const items = type === 'plant' ? chapter.foreshadowingToPlant : chapter.foreshadowingToResolve
  if (!items) return
  items[index] = value
}

function removeForeshadowing(chapter: ChapterOutline, type: 'plant' | 'resolve', index: number): void {
  const items = type === 'plant' ? chapter.foreshadowingToPlant : chapter.foreshadowingToResolve
  items?.splice(index, 1)
}

function addForeshadowing(chapter: ChapterOutline, type: 'plant' | 'resolve'): void {
  if (type === 'plant') {
    chapter.foreshadowingToPlant ??= []
    chapter.foreshadowingToPlant.push('新伏笔')
    return
  }
  chapter.foreshadowingToResolve ??= []
  chapter.foreshadowingToResolve.push('待回收伏笔')
}

async function applyTemplate(): Promise<void> {
  if (!selectedTemplateId.value) {
    ElMessage.warning('请选择结构模板')
    return
  }

  const template = getOutlineTemplateById(selectedTemplateId.value)
  if (!template) return

  if (!outline.value) return

  if (outline.value.volumes.some(volume => volume.title || volume.anchors?.length || volume.mainEvents.length)) {
    try {
      await ElMessageBox.confirm('套用模板会替换现有卷纲和锚点，是否继续？', '确认套用模板', { type: 'warning' })
    } catch {
      return
    }
  }

  outline.value.template = template.id
  outline.value.structure = template.structure
  outline.value.volumes = template.phases.map((phase, index) => {
    const priorRatio = template.phases.slice(0, index).reduce((sum, item) => sum + item.chapterRatio, 0)
    const currentRatio = template.phases.slice(0, index + 1).reduce((sum, item) => sum + item.chapterRatio, 0)
    const startChapter = Math.max(1, Math.round(template.defaultChapterCount * priorRatio) + 1)
    const endChapter = index === template.phases.length - 1
      ? template.defaultChapterCount
      : Math.max(startChapter, Math.round(template.defaultChapterCount * currentRatio))
    return {
      id: uuidv4(),
      number: index + 1,
      title: phase.name,
      theme: phase.description,
      startChapter,
      endChapter,
      mainEvents: [...phase.goals],
      anchors: phase.keyBeats.map((beat, beatIndex) => ({
        id: uuidv4(),
        targetChapterNumber: Math.min(endChapter, startChapter + beatIndex),
        description: beat,
        isResolved: false,
      })),
      chapters: [],
    }
  })
  ElMessage.success('结构模板已套用')
}

async function runAIRefinement(): Promise<void> {
  const project = projectStore.currentProject
  if (!project) return

  isRefining.value = true
  try {
    proposal.value = await refineOutlineWithAI({ project })
    if (proposal.value) {
      activeChapterIds.value = proposal.value.chapterUpdates.map(update => update.chapterId)
      ElMessage.success('AI 已生成大纲细化提案')
    } else {
      ElMessage.warning('AI 未返回可用细化提案')
    }
  } catch (error) {
    ElMessage.error(`AI 细化失败：${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    isRefining.value = false
  }
}

async function acceptProposal(): Promise<void> {
  if (!proposal.value || !projectStore.currentProject) return
  const project = projectStore.currentProject
  const outlineSnapshot = structuredClone(project.outline)
  const impact = applyOutlineRefinementProposal(project, proposal.value)
  if (!impact) {
    ElMessage.warning('提案已过期，未应用任何变更')
    proposal.value = null
    return
  }
  try {
    await projectStore.saveCurrentProject()
    proposal.value = null
    ElMessage.success(`已采纳 ${impact.affectedChapterIds.length} 个章节细化`)
  } catch (error) {
    project.outline = outlineSnapshot
    ElMessage.error(`保存失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

async function saveOutline(): Promise<void> {
  if (!projectStore.currentProject) return
  await projectStore.saveCurrentProject()
  ElMessage.success('大纲已保存')
}

function formatChange(value: OutlineRefinementChange['after']): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value).slice(0, 160)
}

function statusTagType(status: ChapterOutline['status']): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'completed') return 'success'
  if (status === 'writing') return 'warning'
  if (status === 'outdated') return 'danger'
  return 'info'
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
  gap: 16px;
}

.loom-header h4 {
  margin: 0;
}

.loom-header p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.header-actions,
.proposal-actions,
.section-toolbar,
.card-header,
.chapter-title-row,
.volume-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.outline-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  padding: 16px;
}

.outline-sidebar,
.outline-main {
  min-height: 0;
  overflow: auto;
}

.summary-card + .summary-card,
.volumes-section + .chapters-section {
  margin-top: 16px;
}

.summary-card label,
.chapter-grid label {
  display: block;
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.proposal-panel p {
  margin: 0 0 12px;
  font-size: 13px;
}

.proposal-change {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}

.proposal-change strong,
.proposal-change span {
  display: block;
}

.proposal-change span {
  color: var(--text-secondary);
  margin-top: 4px;
}

.section-toolbar {
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-toolbar h5 {
  margin: 0;
}

.section-toolbar.compact {
  margin-bottom: 8px;
}

.volumes-container {
  display: flex;
  overflow-x: auto;
  gap: 16px;
  padding-bottom: 8px;
}

.volume-column {
  min-width: 320px;
  width: 320px;
  background: var(--bg-color);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.volume-header,
.anchors-zone {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.volume-header {
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  border-radius: 8px 8px 0 0;
}

.section-label {
  font-size: 12px;
  font-weight: bold;
  color: var(--text-secondary);
}

.anchor-card,
.scene-card,
.string-list-item {
  display: flex;
  gap: 8px;
  align-items: center;
}

.anchor-card {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.24);
  border-radius: 6px;
  padding: 8px;
}

.chapter-title-row {
  width: 100%;
}

.chapter-editor {
  padding: 4px 0 12px;
}

.chapter-grid {
  display: grid;
  grid-template-columns: 80px 1fr 80px 1fr;
  gap: 8px 12px;
  align-items: center;
}

.chapter-grid label {
  margin: 0;
}

.list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.string-list {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
}

.string-list-item {
  margin-bottom: 8px;
}

.string-list-item input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 6px;
  background: var(--bg-color);
  color: var(--text-primary);
}

.string-list-item button,
.inline-add-button {
  border: none;
  background: transparent;
  color: var(--primary-color);
  cursor: pointer;
}

.scenes-zone {
  margin-top: 16px;
}

.scene-card {
  align-items: flex-start;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 8px;
}
</style>
