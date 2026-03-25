<template>
  <div class="outline">
    <el-card class="header-card">
      <div class="header">
        <h2>大纲管理</h2>
        <div class="actions">
          <el-button @click="showTemplateDialog = true">
            <el-icon><Document /></el-icon>
            模板库
          </el-button>
          <el-button type="primary" @click="generateOutline">
            <el-icon><MagicStick /></el-icon>
            AI生成大纲
          </el-button>
          <el-button @click="saveOutline">保存大纲</el-button>
        </div>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" class="content">
      <!-- 总纲 -->
      <el-tab-pane label="总纲" name="synopsis">
        <el-card>
          <el-form :model="outlineForm" label-width="100px">
            <el-form-item label="作品简介">
              <el-input
                v-model="outlineForm.synopsis"
                type="textarea"
                :rows="6"
                placeholder="作品的整体简介，包括核心冲突、主题等"
              />
            </el-form-item>

            <el-form-item label="核心主题">
              <el-input v-model="outlineForm.theme" placeholder="作品要表达的核心主题" />
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 主线与支线 -->
      <el-tab-pane label="故事线" name="plots">
        <div class="plots-section">
          <el-card class="plot-card">
            <template #header>
              <div class="card-header">
                <span>主线</span>
              </div>
            </template>

            <el-form :model="outlineForm.mainPlot" label-width="80px">
              <el-form-item label="名称">
                <el-input v-model="outlineForm.mainPlot.name" />
              </el-form-item>

              <el-form-item label="描述">
                <el-input
                  v-model="outlineForm.mainPlot.description"
                  type="textarea"
                  :rows="4"
                />
              </el-form-item>

              <el-form-item label="章节范围">
                <el-input-number
                  v-model="outlineForm.mainPlot.startChapter"
                  :min="1"
                  placeholder="起始章节"
                  style="width: 150px;"
                />
                <span style="margin: 0 10px;">至</span>
                <el-input-number
                  v-model="outlineForm.mainPlot.endChapter"
                  :min="1"
                  placeholder="结束章节"
                  style="width: 150px;"
                />
              </el-form-item>
            </el-form>
          </el-card>

          <el-card class="plot-card">
            <template #header>
              <div class="card-header">
                <span>支线</span>
                <el-button type="primary" text @click="addSubPlot">
                  <el-icon><Plus /></el-icon>
                  添加支线
                </el-button>
              </div>
            </template>

            <div class="subplots-list">
              <el-card
                v-for="(plot, index) in outlineForm.subPlots"
                :key="plot.id"
                class="subplot-item"
              >
                <el-form :model="plot" label-width="80px">
                  <el-form-item label="名称">
                    <el-input v-model="plot.name" />
                  </el-form-item>

                  <el-form-item label="描述">
                    <el-input
                      v-model="plot.description"
                      type="textarea"
                      :rows="3"
                    />
                  </el-form-item>

                  <el-form-item label="章节范围">
                    <el-input-number
                      v-model="plot.startChapter"
                      :min="1"
                      placeholder="起始章节"
                      style="width: 150px;"
                    />
                    <span style="margin: 0 10px;">至</span>
                    <el-input-number
                      v-model="plot.endChapter"
                      :min="1"
                      placeholder="结束章节"
                      style="width: 150px;"
                    />
                  </el-form-item>

                  <el-button type="danger" @click="removeSubPlot(index)">
                    删除支线
                  </el-button>
                </el-form>
              </el-card>

              <el-empty
                v-if="(outlineForm.subPlots || []).length === 0"
                description="还没有添加支线"
              />
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- 卷大纲 -->
      <el-tab-pane label="卷大纲" name="volumes">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>卷大纲</span>
              <el-button type="primary" text @click="addVolume">
                <el-icon><Plus /></el-icon>
                添加卷
              </el-button>
            </div>
          </template>

          <div class="volumes-list">
            <el-collapse v-model="activeVolumes" accordion>
              <el-collapse-item
                v-for="(volume, index) in outlineForm.volumes"
                :key="volume.id"
                :name="volume.id"
              >
                <template #title>
                  <div class="volume-title">
                    <span class="volume-number">第{{ volume.number }}卷</span>
                    <span class="volume-name">{{ volume.title || '未命名' }}</span>
                    <el-tag size="small" type="info" style="margin-left: 10px;">
                      第{{ volume.startChapter }}-{{ volume.endChapter }}章
                    </el-tag>
                    <div class="volume-progress" v-if="getVolumeProgress(volume)">
                      <el-progress
                        :percentage="getVolumeProgress(volume)"
                        :stroke-width="6"
                        style="width: 100px; margin-left: 15px;"
                      />
                    </div>
                  </div>
                </template>

                <el-form :model="volume" label-width="80px" class="volume-form">
                  <el-row :gutter="20">
                    <el-col :span="8">
                      <el-form-item label="卷号">
                        <el-input-number v-model="volume.number" :min="1" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="起始章">
                        <el-input-number v-model="volume.startChapter" :min="1" />
                      </el-form-item>
                    </el-col>
                    <el-col :span="8">
                      <el-form-item label="结束章">
                        <el-input-number v-model="volume.endChapter" :min="volume.startChapter" />
                      </el-form-item>
                    </el-col>
                  </el-row>

                  <el-form-item label="标题">
                    <el-input v-model="volume.title" placeholder="卷标题" />
                  </el-form-item>

                  <el-form-item label="主题">
                    <el-input v-model="volume.theme" placeholder="本卷的核心主题" />
                  </el-form-item>

                  <el-form-item label="主要事件">
                    <div class="events-list">
                      <div
                        v-for="(event, i) in volume.mainEvents"
                        :key="i"
                        class="event-item"
                        draggable="true"
                        @dragstart="handleEventDragStart($event, index, i)"
                        @dragover.prevent
                        @drop="handleEventDrop($event, index, i)"
                      >
                        <el-icon class="drag-handle"><Rank /></el-icon>
                        <el-input v-model="volume.mainEvents[i]" placeholder="事件描述" />
                        <el-button type="danger" text @click="removeVolumeEvent(index, i)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <el-button @click="addVolumeEvent(index)">
                      <el-icon><Plus /></el-icon>
                      添加事件
                    </el-button>
                  </el-form-item>

                  <el-form-item label="章节归属">
                    <div class="chapter-assignment">
                      <div
                        v-for="chapter in getChaptersForVolume(volume)"
                        :key="chapter.chapterId"
                        class="chapter-chip"
                        draggable="true"
                        @dragstart="handleChapterDragStart($event, chapter)"
                      >
                        <el-tag size="small">{{ chapter.title || `第${getChapterNumber(chapter)}章` }}</el-tag>
                      </div>
                      <el-empty v-if="getChaptersForVolume(volume).length === 0" description="拖拽章节到此卷" :image-size="60" />
                    </div>
                  </el-form-item>

                  <div class="volume-actions">
                    <el-button type="danger" @click="removeVolume(index)">
                      删除此卷
                    </el-button>
                  </div>
                </el-form>
              </el-collapse-item>
            </el-collapse>

            <el-empty
              v-if="(outlineForm.volumes || []).length === 0"
              description="还没有添加卷，可以从模板库选择或手动添加"
            >
              <el-button type="primary" @click="showTemplateDialog = true">从模板创建</el-button>
            </el-empty>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 章节大纲 -->
      <el-tab-pane label="章节大纲" name="chapters">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>章节大纲</span>
              <div>
                <el-button type="primary" text @click="batchGenerateChapters">
                  <el-icon><MagicStick /></el-icon>
                  批量生成
                </el-button>
                <el-button type="primary" text @click="addChapterOutline">
                  <el-icon><Plus /></el-icon>
                  添加章节
                </el-button>
              </div>
            </div>
          </template>

          <div class="chapter-outlines-list">
            <el-collapse v-model="activeChapters">
              <el-collapse-item
                v-for="(chapter, index) in outlineForm.chapters"
                :key="chapter.chapterId"
                :name="chapter.chapterId"
              >
                <template #title>
                  <div class="chapter-header-inline">
                    <span class="chapter-number">第{{ index + 1 }}章</span>
                    <el-input
                      v-model="chapter.title"
                      placeholder="章节标题"
                      style="flex: 1; margin: 0 15px;"
                      @click.stop
                    />
                    <el-tag :type="getChapterStatusType(chapter.status)" size="small">
                      {{ getChapterStatusText(chapter.status) }}
                    </el-tag>
                    <el-tag v-if="getChapterVolume(chapter)" type="info" size="small" style="margin-left: 5px;">
                      {{ getChapterVolume(chapter) }}
                    </el-tag>
                  </div>
                </template>

                <el-form :model="chapter" label-width="100px" class="chapter-form">
                  <!-- 场景管理 -->
                  <el-form-item label="场景">
                    <div class="scenes-list">
                      <el-card
                        v-for="(scene, i) in chapter.scenes"
                        :key="scene.id"
                        class="scene-card"
                        shadow="hover"
                      >
                        <div class="scene-header">
                          <span class="scene-number">场景 {{ i + 1 }}</span>
                          <el-button type="danger" text size="small" @click="removeScene(index, i)">
                            <el-icon><Delete /></el-icon>
                          </el-button>
                        </div>
                        <el-form label-width="60px">
                          <el-form-item label="地点">
                            <el-select
                              v-model="scene.location"
                              placeholder="选择场景地点"
                              filterable
                              allow-create
                            >
                              <el-option
                                v-for="loc in locations"
                                :key="loc.id"
                                :label="loc.name"
                                :value="loc.name"
                              />
                            </el-select>
                          </el-form-item>
                          <el-form-item label="描述">
                            <el-input
                              v-model="scene.description"
                              type="textarea"
                              :rows="2"
                              placeholder="场景描述"
                            />
                          </el-form-item>
                          <el-form-item label="出场人物">
                            <el-select
                              v-model="scene.characters"
                              multiple
                              filterable
                              placeholder="选择此场景出场人物"
                            >
                              <el-option
                                v-for="char in characters"
                                :key="char.id"
                                :label="char.name"
                                :value="char.id"
                              />
                            </el-select>
                          </el-form-item>
                        </el-form>
                      </el-card>
                    </div>
                    <el-button @click="addScene(index)">
                      <el-icon><Plus /></el-icon>
                      添加场景
                    </el-button>
                  </el-form-item>

                  <!-- 出场人物（总体） -->
                  <el-form-item label="出场人物">
                    <el-select
                      v-model="chapter.characters"
                      multiple
                      filterable
                      placeholder="选择本章出场人物"
                    >
                      <el-option
                        v-for="char in characters"
                        :key="char.id"
                        :label="char.name"
                        :value="char.id"
                      />
                    </el-select>
                  </el-form-item>

                  <!-- 主要地点 -->
                  <el-form-item label="主要地点">
                    <el-select
                      v-model="chapter.location"
                      filterable
                      allow-create
                      placeholder="选择本章主要地点"
                    >
                      <el-option
                        v-for="loc in locations"
                        :key="loc.id"
                        :label="loc.name"
                        :value="loc.name"
                      />
                    </el-select>
                  </el-form-item>

                  <!-- 目标 -->
                  <el-form-item label="目标">
                    <div class="goals-list">
                      <div
                        v-for="(goal, i) in chapter.goals"
                        :key="i"
                        class="list-item"
                      >
                        <el-input v-model="chapter.goals[i]" placeholder="本章要达成的目标" />
                        <el-button type="danger" text @click="chapter.goals.splice(i, 1)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <el-button text @click="chapter.goals.push('')">
                      <el-icon><Plus /></el-icon>
                      添加目标
                    </el-button>
                  </el-form-item>

                  <!-- 冲突 -->
                  <el-form-item label="冲突">
                    <div class="conflicts-list">
                      <div
                        v-for="(conflict, i) in chapter.conflicts"
                        :key="i"
                        class="list-item"
                      >
                        <el-input v-model="chapter.conflicts[i]" placeholder="本章的冲突" />
                        <el-button type="danger" text @click="chapter.conflicts.splice(i, 1)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <el-button text @click="chapter.conflicts.push('')">
                      <el-icon><Plus /></el-icon>
                      添加冲突
                    </el-button>
                  </el-form-item>

                  <!-- 解决方案 -->
                  <el-form-item label="解决方案">
                    <div class="resolutions-list">
                      <div
                        v-for="(resolution, i) in chapter.resolutions"
                        :key="i"
                        class="list-item"
                      >
                        <el-input v-model="chapter.resolutions[i]" placeholder="冲突如何解决" />
                        <el-button type="danger" text @click="chapter.resolutions.splice(i, 1)">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <el-button text @click="chapter.resolutions.push('')">
                      <el-icon><Plus /></el-icon>
                      添加解决方案
                    </el-button>
                  </el-form-item>

                  <!-- 伏笔关联 -->
                  <el-form-item label="伏笔">
                    <el-row :gutter="20">
                      <el-col :span="12">
                        <div class="foreshadow-section">
                          <span class="foreshadow-label">要埋设的伏笔</span>
                          <el-select
                            v-model="chapter.foreshadowingToPlant"
                            multiple
                            filterable
                            allow-create
                            placeholder="选择或输入伏笔"
                          >
                            <el-option
                              v-for="fs in unplantedForeshadowings"
                              :key="fs.id"
                              :label="fs.description"
                              :value="fs.id"
                            />
                          </el-select>
                        </div>
                      </el-col>
                      <el-col :span="12">
                        <div class="foreshadow-section">
                          <span class="foreshadow-label">要揭示的伏笔</span>
                          <el-select
                            v-model="chapter.foreshadowingToResolve"
                            multiple
                            filterable
                            allow-create
                            placeholder="选择或输入伏笔"
                          >
                            <el-option
                              v-for="fs in plantedForeshadowings"
                              :key="fs.id"
                              :label="fs.description"
                              :value="fs.id"
                            />
                          </el-select>
                        </div>
                      </el-col>
                    </el-row>
                  </el-form-item>

                  <!-- 状态 -->
                  <el-form-item label="状态">
                    <el-radio-group v-model="chapter.status">
                      <el-radio value="planned">计划中</el-radio>
                      <el-radio value="writing">写作中</el-radio>
                      <el-radio value="completed">已完成</el-radio>
                    </el-radio-group>
                  </el-form-item>

                  <el-button type="danger" @click="removeChapterOutline(index)">
                    删除章节
                  </el-button>
                </el-form>
              </el-collapse-item>
            </el-collapse>

            <el-empty
              v-if="(outlineForm.chapters || []).length === 0"
              description="还没有添加章节大纲"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 伏笔管理 -->
      <el-tab-pane label="伏笔" name="foreshadowings">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>伏笔管理</span>
              <el-button type="primary" text @click="addForeshadowing">
                <el-icon><Plus /></el-icon>
                添加伏笔
              </el-button>
            </div>
          </template>

          <div class="foreshadowings-list">
            <el-card
              v-for="(foreshadowing, index) in outlineForm.foreshadowings"
              :key="foreshadowing.id"
              class="foreshadowing-item"
            >
              <el-form :model="foreshadowing" label-width="100px">
                <el-form-item label="伏笔描述">
                  <el-input
                    v-model="foreshadowing.description"
                    type="textarea"
                    :rows="3"
                  />
                </el-form-item>

                <el-form-item label="埋设章节">
                  <el-input-number v-model="foreshadowing.plantChapter" :min="1" />
                </el-form-item>

                <el-form-item label="揭示章节">
                  <el-input-number v-model="foreshadowing.resolveChapter" :min="foreshadowing.plantChapter" />
                </el-form-item>

                <el-form-item label="状态">
                  <el-select v-model="foreshadowing.status">
                    <el-option label="已埋设" value="planted" />
                    <el-option label="已揭示" value="resolved" />
                    <el-option label="已放弃" value="abandoned" />
                  </el-select>
                </el-form-item>

                <el-button type="danger" @click="removeForeshadowing(index)">
                  删除
                </el-button>
              </el-form>
            </el-card>

            <el-empty
              v-if="(outlineForm.foreshadowings || []).length === 0"
              description="还没有添加伏笔"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 模板选择对话框 -->
    <el-dialog
      v-model="showTemplateDialog"
      title="大纲模板库"
      width="900px"
      :close-on-click-modal="false"
    >
      <div class="template-list">
        <el-card
          v-for="template in outlineTemplates"
          :key="template.structure"
          class="template-card"
          shadow="hover"
          @click="applyTemplate(template)"
        >
          <div class="template-header">
            <h3>{{ template.structure }}</h3>
            <el-tag>{{ template.totalChapters }}章</el-tag>
          </div>
          <p class="template-desc">{{ template.description }}</p>
          <div class="template-volumes">
            <el-tag
              v-for="vol in template.volumes"
              :key="vol.number"
              size="small"
              style="margin-right: 5px; margin-bottom: 5px;"
            >
              {{ vol.title }}
            </el-tag>
          </div>
          <el-button type="primary" text class="template-btn">
            应用此模板
          </el-button>
        </el-card>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, MagicStick, Document, Rank } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Outline, ChapterOutline, Volume } from '@/types'
import {
  outlineTemplates,
  getTemplateByStructure,
  generateVolumesFromTemplate
} from '@/data/outlineTemplates'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)
const characters = computed(() => project.value?.characters || [])
const locations = computed(() => project.value?.world?.geography?.locations || [])
const chapters = computed(() => project.value?.chapters || [])

const activeTab = ref('synopsis')
const generating = ref(false)
const showTemplateDialog = ref(false)
const activeVolumes = ref<string[]>([])
const activeChapters = ref<string[]>([])

// 拖拽状态
const draggedChapter = ref<ChapterOutline | null>(null)
const draggedEvent = ref<{ volumeIndex: number; eventIndex: number } | null>(null)

const outlineForm = ref<Outline>({
  id: '',
  synopsis: '',
  theme: '',
  mainPlot: {
    id: '',
    name: '主线',
    description: ''
  },
  subPlots: [],
  volumes: [],
  chapters: [],
  foreshadowings: []
})

// 监听project加载
watch(project, (newProject) => {
  if (newProject?.outline) {
    console.log('[Outline] 项目加载完成，加载大纲数据')

    // 深拷贝并转换数据格式
    const outlineData = JSON.parse(JSON.stringify(newProject.outline))

    // 确保 mainPlot 是对象
    if (typeof outlineData.mainPlot === 'string') {
      outlineData.mainPlot = {
        id: `mainplot-${Date.now()}`,
        name: '主线',
        description: outlineData.mainPlot
      }
    } else if (!outlineData.mainPlot) {
      outlineData.mainPlot = {
        id: `mainplot-${Date.now()}`,
        name: '主线',
        description: ''
      }
    } else {
      outlineData.mainPlot = {
        id: outlineData.mainPlot.id || `mainplot-${Date.now()}`,
        name: outlineData.mainPlot.name || '主线',
        description: outlineData.mainPlot.description || ''
      }
    }

    // 确保 subPlots 是对象数组
    if (outlineData.subPlots && Array.isArray(outlineData.subPlots)) {
      outlineData.subPlots = outlineData.subPlots.map((plot: any, index: number) => {
        if (typeof plot === 'string') {
          return {
            id: `subplot-${Date.now()}-${index}`,
            name: `支线${index + 1}`,
            description: plot
          }
        }
        return {
          id: plot.id || `subplot-${Date.now()}-${index}`,
          name: plot.name || `支线${index + 1}`,
          description: plot.description || ''
        }
      })
    }

    // 确保其他数组字段存在
    outlineData.volumes = outlineData.volumes || []
    outlineData.chapters = outlineData.chapters || []
    outlineData.foreshadowings = outlineData.foreshadowings || []

    outlineForm.value = outlineData
  }
}, { immediate: true })

onMounted(() => {
  if (project.value?.outline) {
    // 使用相同的转换逻辑
    const outlineData = JSON.parse(JSON.stringify(project.value.outline))

    // 确保 mainPlot 是对象
    if (typeof outlineData.mainPlot === 'string') {
      outlineData.mainPlot = {
        id: `mainplot-${Date.now()}`,
        name: '主线',
        description: outlineData.mainPlot
      }
    } else if (!outlineData.mainPlot) {
      outlineData.mainPlot = {
        id: `mainplot-${Date.now()}`,
        name: '主线',
        description: ''
      }
    } else {
      outlineData.mainPlot = {
        id: outlineData.mainPlot.id || `mainplot-${Date.now()}`,
        name: outlineData.mainPlot.name || '主线',
        description: outlineData.mainPlot.description || ''
      }
    }

    if (outlineData.subPlots && Array.isArray(outlineData.subPlots)) {
      outlineData.subPlots = outlineData.subPlots.map((plot: any, index: number) => {
        if (typeof plot === 'string') {
          return {
            id: `subplot-${Date.now()}-${index}`,
            name: `支线${index + 1}`,
            description: plot
          }
        }
        return {
          id: plot.id || `subplot-${Date.now()}-${index}`,
          name: plot.name || `支线${index + 1}`,
          description: plot.description || ''
        }
      })
    }

    outlineData.volumes = outlineData.volumes || []
    outlineData.chapters = outlineData.chapters || []
    outlineData.foreshadowings = outlineData.foreshadowings || []

    outlineForm.value = outlineData
  }
})

// 计算属性：未埋设的伏笔
const unplantedForeshadowings = computed(() => {
  return outlineForm.value.foreshadowings.filter(f => f.status === 'planted' || !f.resolveChapter)
})

// 计算属性：已埋设待揭示的伏笔
const plantedForeshadowings = computed(() => {
  return outlineForm.value.foreshadowings.filter(f => f.status === 'planted')
})

// 获取卷进度
function getVolumeProgress(volume: Volume): number {
  const volumeChapters = getChaptersForVolume(volume)
  if (volumeChapters.length === 0) return 0
  const completed = volumeChapters.filter(c => c.status === 'completed').length
  return Math.round((completed / volumeChapters.length) * 100)
}

// 获取卷内的章节
function getChaptersForVolume(volume: Volume): ChapterOutline[] {
  return outlineForm.value.chapters.filter((chapter, index) => {
    const chapterNum = index + 1
    return chapterNum >= volume.startChapter && chapterNum <= volume.endChapter
  })
}

// 获取章节号
function getChapterNumber(chapter: ChapterOutline): number {
  return outlineForm.value.chapters.findIndex(c => c.chapterId === chapter.chapterId) + 1
}

// 获取章节所属卷
function getChapterVolume(chapter: ChapterOutline): string {
  const chapterNum = getChapterNumber(chapter)
  const volume = outlineForm.value.volumes.find(
    v => chapterNum >= v.startChapter && chapterNum <= v.endChapter
  )
  return volume ? `第${volume.number}卷` : ''
}

// 应用模板
async function applyTemplate(template: typeof outlineTemplates[0]) {
  try {
    await ElMessageBox.confirm(
      `确定要应用"${template.structure}"模板吗？这将替换现有的卷大纲。`,
      '应用模板',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 生成卷数据
    const volumesData = generateVolumesFromTemplate(template)

    outlineForm.value.volumes = volumesData.map(v => ({
      id: uuidv4(),
      number: v.number,
      title: v.title,
      theme: v.theme,
      startChapter: v.chapterRange.start,
      endChapter: v.chapterRange.end,
      mainEvents: [...v.mainEvents]
    }))

    showTemplateDialog.value = false
    ElMessage.success(`已应用"${template.structure}"模板`)
  } catch {
    // 用户取消
  }
}

// 添加支线
function addSubPlot() {
  outlineForm.value.subPlots.push({
    id: uuidv4(),
    name: '',
    description: ''
  })
}

function removeSubPlot(index: number) {
  outlineForm.value.subPlots.splice(index, 1)
}

// 添加卷
function addVolume() {
  const lastVolume = outlineForm.value.volumes[outlineForm.value.volumes.length - 1]
  const startChapter = lastVolume ? lastVolume.endChapter + 1 : 1

  outlineForm.value.volumes.push({
    id: uuidv4(),
    number: outlineForm.value.volumes.length + 1,
    title: '',
    theme: '',
    startChapter: startChapter,
    endChapter: startChapter + 9,
    mainEvents: []
  })
}

function removeVolume(index: number) {
  outlineForm.value.volumes.splice(index, 1)
  // 重新编号
  outlineForm.value.volumes.forEach((v, i) => {
    v.number = i + 1
  })
}

function addVolumeEvent(volumeIndex: number) {
  outlineForm.value.volumes[volumeIndex].mainEvents.push('')
}

function removeVolumeEvent(volumeIndex: number, eventIndex: number) {
  outlineForm.value.volumes[volumeIndex].mainEvents.splice(eventIndex, 1)
}

// 事件拖拽
function handleEventDragStart(e: DragEvent, volumeIndex: number, eventIndex: number) {
  draggedEvent.value = { volumeIndex, eventIndex }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

function handleEventDrop(e: DragEvent, volumeIndex: number, eventIndex: number) {
  if (!draggedEvent.value) return

  const { volumeIndex: fromVol, eventIndex: fromIdx } = draggedEvent.value
  const fromEvents = outlineForm.value.volumes[fromVol].mainEvents
  const toEvents = outlineForm.value.volumes[volumeIndex].mainEvents

  // 移动事件
  if (fromVol === volumeIndex) {
    // 同卷内移动
    const [event] = fromEvents.splice(fromIdx, 1)
    toEvents.splice(eventIndex, 0, event)
  } else {
    // 跨卷移动
    const [event] = fromEvents.splice(fromIdx, 1)
    toEvents.push(event)
  }

  draggedEvent.value = null
}

// 章节拖拽
function handleChapterDragStart(e: DragEvent, chapter: ChapterOutline) {
  draggedChapter.value = chapter
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
  }
}

// 添加章节大纲
function addChapterOutline() {
  outlineForm.value.chapters.push({
    chapterId: uuidv4(),
    title: '',
    scenes: [],
    characters: [],
    location: '',
    goals: [],
    conflicts: [],
    resolutions: [],
    foreshadowingToPlant: [],
    foreshadowingToResolve: [],
    status: 'planned'
  })
}

function removeChapterOutline(index: number) {
  outlineForm.value.chapters.splice(index, 1)
}

// 添加场景
function addScene(chapterIndex: number) {
  outlineForm.value.chapters[chapterIndex].scenes.push({
    id: uuidv4(),
    description: '',
    characters: [],
    location: ''
  })
}

function removeScene(chapterIndex: number, sceneIndex: number) {
  outlineForm.value.chapters[chapterIndex].scenes.splice(sceneIndex, 1)
}

// 添加伏笔
function addForeshadowing() {
  outlineForm.value.foreshadowings.push({
    id: uuidv4(),
    description: '',
    plantChapter: 1,
    status: 'planted'
  })
}

function removeForeshadowing(index: number) {
  outlineForm.value.foreshadowings.splice(index, 1)
}

// AI生成大纲
async function generateOutline() {
  generating.value = true
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (aiStore.checkInitialized()) {
      const projectStore = useProjectStore()
      const world = projectStore.currentProject?.world

      const prompt = `请为小说创建大纲。

${world?.name ? '世界观：' + world.name : ''}
${world?.era ? '时代背景：' + world.era.time + '，科技水平：' + world.era.techLevel : ''}
${world?.factions?.length ? '主要势力：' + world.factions.map(f => f.name).join('、') : ''}

请以JSON格式返回大纲：
{
  "synopsis": "作品简介（2-3句话）",
  "theme": "核心主题",
  "mainPlot": {
    "name": "主线名称",
    "description": "主线描述"
  },
  "subPlots": [
    { "name": "支线名称", "description": "支线描述" }
  ],
  "volumes": [
    {
      "number": 1,
      "title": "第一卷标题",
      "theme": "卷主题",
      "startChapter": 1,
      "endChapter": 20,
      "mainEvents": ["事件1", "事件2", "事件3"]
    }
  ],
  "chapters": [
    {
      "chapterId": "chapter-1",
      "title": "第一章标题",
      "scenes": [
        { "description": "场景描述", "location": "地点", "characters": [] }
      ],
      "characters": ["人物ID"],
      "location": "主要地点",
      "goals": ["章节目标1"],
      "conflicts": ["冲突1"],
      "resolutions": ["解决方案1"],
      "foreshadowingToPlant": ["要埋设的伏笔"],
      "foreshadowingToResolve": ["要揭示的伏笔"],
      "status": "planned"
    }
  ],
  "foreshadowings": [
    { "description": "伏笔内容", "plantChapter": 1, "status": "planted" }
  ]
}

请只返回JSON，不要包含其他说明文字。`

      const messages = [{ role: 'user', content: prompt }]
      const context = { type: 'outline', complexity: 'high', priority: 'quality' }

      console.log('[大纲生成] 开始调用AI服务...')
      const response = await aiStore.chat(messages, context, { maxTokens: 8000 })
      console.log('[大纲生成] AI响应:', response)

      const content = response.content.trim()
      let jsonStr = content
      const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) jsonStr = jsonMatch[1]
      else if (jsonStr.includes('```')) jsonStr = jsonStr.replace(/```\w*\n?/g, '').trim()

      const parsed = JSON.parse(jsonStr)
      const outline: Outline = {
        id: uuidv4(),
        ...parsed,
        mainPlot: { id: uuidv4(), ...parsed.mainPlot },
        subPlots: parsed.subPlots?.map((sp: any) => ({ id: uuidv4(), ...sp })) || [],
        volumes: parsed.volumes?.map((v: any) => ({ id: uuidv4(), ...v })) || [],
        chapters: parsed.chapters?.map((c: any) => ({
          chapterId: c.chapterId || uuidv4(),
          title: c.title || '',
          scenes: c.scenes?.map((s: any) =>
            typeof s === 'string' ? { id: uuidv4(), description: s, location: '', characters: [] } : { id: uuidv4(), ...s }
          ) || [],
          characters: c.characters || [],
          location: c.location || '',
          goals: c.goals || [],
          conflicts: c.conflicts || [],
          resolutions: c.resolutions || [],
          foreshadowingToPlant: c.foreshadowingToPlant || [],
          foreshadowingToResolve: c.foreshadowingToResolve || [],
          status: c.status || 'planned'
        })) || [],
        foreshadowings: parsed.foreshadowings?.map((f: any) => ({ id: uuidv4(), ...f })) || []
      }

      outlineForm.value = outline
      ElMessage.success('AI生成大纲成功！')
    } else {
      await generateDefaultOutline()
    }
  } catch (error: any) {
    console.error('[大纲生成] 失败:', error)

    // 使用错误诊断工具
    const { diagnoseAPIError, formatDiagnosticMessage } = await import('@/utils/errorDiagnostics')
    const projectStore = useProjectStore()
    const config = projectStore.currentProject?.config || projectStore.globalConfig
    const provider = config?.providers?.find(p => p.isEnabled)

    const diagnostic = diagnoseAPIError(error, {
      provider: provider?.type,
      baseUrl: provider?.baseUrl,
      model: provider?.models?.find(m => m.isEnabled)?.id
    })

    ElMessage({
      type: 'error',
      message: formatDiagnosticMessage(diagnostic),
      duration: 10000,
      showClose: true
    })

    await generateDefaultOutline()
  } finally {
    generating.value = false
  }
}

async function generateDefaultOutline() {
  const exampleOutline: Outline = {
    id: uuidv4(),
    synopsis: '一个天赋异禀的少年，在修炼之路上不断突破，最终成为一代强者的故事。',
    theme: '成长、友情、正义',
    mainPlot: {
      id: uuidv4(),
      name: '主线：成长之路',
      description: '主角从平凡少年成长为强者的历程'
    },
    subPlots: [
      { id: uuidv4(), name: '寻找父亲', description: '主角寻找失踪父亲的下落' },
      { id: uuidv4(), name: '宗门纷争', description: '修炼宗门之间的矛盾和冲突' }
    ],
    volumes: [
      {
        id: uuidv4(),
        number: 1,
        title: '初入修炼',
        theme: '踏入修炼世界',
        startChapter: 1,
        endChapter: 50,
        mainEvents: ['发现修炼天赋', '拜入宗门', '第一次历练']
      }
    ],
    chapters: [
      {
        chapterId: uuidv4(),
        title: '第一章 天赋觉醒',
        scenes: [
          { id: uuidv4(), description: '主角在山中发现奇遇', location: '青云山', characters: [] }
        ],
        characters: [],
        location: '青云山',
        goals: ['介绍主角背景', '触发修炼天赋'],
        conflicts: ['主角与家人的矛盾'],
        resolutions: ['天赋觉醒'],
        foreshadowingToPlant: ['神秘的玉佩'],
        foreshadowingToResolve: [],
        status: 'planned'
      }
    ],
    foreshadowings: [
      { id: uuidv4(), description: '神秘的玉佩蕴含秘密', plantChapter: 1, status: 'planted' }
    ]
  }

  outlineForm.value = exampleOutline
  ElMessage.success('已生成示例大纲数据。要使用AI生成，请在配置中添加API密钥。')
}

function batchGenerateChapters() {
  ElMessage.info('批量生成章节大纲功能开发中...')
}

async function saveOutline() {
  if (!project.value) {
    ElMessage.warning('请先打开或创建项目')
    return
  }

  try {
    // 将 reactive 对象转换为普通对象
    const outlineData = JSON.parse(JSON.stringify(outlineForm.value))
    project.value.outline = outlineData
    await projectStore.saveCurrentProject()
    ElMessage.success('大纲已保存')
  } catch (error) {
    console.error('保存失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  }
}

function getChapterStatusType(status: string) {
  const types: Record<string, string> = {
    planned: 'info',
    writing: 'warning',
    completed: 'success'
  }
  return types[status] || 'info'
}

function getChapterStatusText(status: string) {
  const texts: Record<string, string> = {
    planned: '计划中',
    writing: '写作中',
    completed: '已完成'
  }
  return texts[status] || status
}
</script>

<style scoped>
.outline {
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
  font-size: 20px;
}

.actions {
  display: flex;
  gap: 10px;
}

.content {
  background: white;
  padding: 20px;
  border-radius: 4px;
}

.plots-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.plot-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.subplots-list,
.volumes-list,
.chapter-outlines-list,
.foreshadowings-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.subplot-item,
.volume-item,
.chapter-outline-item,
.foreshadowing-item {
  margin-bottom: 0;
}

/* 卷大纲样式 */
.volume-title {
  display: flex;
  align-items: center;
  flex: 1;
}

.volume-number {
  font-weight: 600;
  margin-right: 10px;
  color: #409eff;
}

.volume-name {
  font-weight: 500;
}

.volume-form {
  padding: 20px 0;
}

.volume-actions {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.event-item .drag-handle {
  cursor: move;
  color: #909399;
}

.event-item .drag-handle:hover {
  color: #409eff;
}

.chapter-assignment {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 60px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px dashed #dcdfe6;
}

.chapter-chip {
  cursor: move;
}

/* 章节大纲样式 */
.chapter-header-inline {
  display: flex;
  align-items: center;
  flex: 1;
}

.chapter-number {
  font-weight: 600;
  font-size: 16px;
  min-width: 80px;
}

.chapter-form {
  padding: 10px 0;
}

.scenes-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 10px;
}

.scene-card {
  margin-bottom: 0;
}

.scene-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.scene-number {
  font-weight: 500;
  color: #409eff;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.list-item .el-input {
  flex: 1;
}

.foreshadow-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.foreshadow-label {
  font-size: 12px;
  color: #909399;
}

/* 模板对话框样式 */
.template-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.template-card {
  cursor: pointer;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.template-card:hover {
  border-color: #409eff;
  transform: translateY(-2px);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.template-header h3 {
  margin: 0;
  font-size: 18px;
}

.template-desc {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 15px;
}

.template-volumes {
  margin-bottom: 15px;
}

.template-btn {
  margin-top: 10px;
}
</style>
