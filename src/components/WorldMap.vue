<template>
  <div class="world-map">
    <el-card class="header-card">
      <div class="header">
        <h2>世界地图</h2>
        <div class="actions">
          <el-button @click="toggleGrid">
            <el-icon><Grid /></el-icon>
            {{ mapData.gridEnabled ? '隐藏网格' : '显示网格' }}
          </el-button>
          <el-button @click="autoLayout">
            <el-icon><Refresh /></el-icon>
            网格布局
          </el-button>
          <el-button type="warning" @click="autoLayoutWithAI" :loading="autoLayouting">
            <el-icon><MagicStick /></el-icon>
            AI 智能排布
          </el-button>
          <el-button type="primary" @click="showExportDialog = true">
            <el-icon><Download /></el-icon>
            导出
          </el-button>
          <el-button type="success" @click="saveMapData">
            <el-icon><Check /></el-icon>
            保存地图
          </el-button>
          <el-button type="info" @click="showTraceDialog = true">
            <el-icon><Position /></el-icon>
            人物轨迹
          </el-button>
          <el-button type="primary" plain @click="autoGenerateRegions">
            <el-icon><LocationIcon /></el-icon>
            生成势力版图
          </el-button>
          <el-button type="success" plain @click="showBgDialog = true">
            <el-icon><Picture /></el-icon>
            生成幻景底图
          </el-button>
        </div>
      </div>
    </el-card>

    <div class="map-container">
      <!-- 左侧/主体：画布与工具栏 -->
      <div class="map-main">
        <!-- 悬浮工具栏 -->
        <div class="toolbar">
          <div class="toolbar-section">
            <el-radio-group v-model="currentTool" size="small" class="tool-group">
              <el-radio-button value="select">
                <el-tooltip content="选择/拖拽对象" placement="bottom">
                  <el-icon><Pointer /></el-icon>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="pan">
                <el-tooltip content="平移画布" placement="bottom">
                  <el-icon><Rank /></el-icon>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="addLocation">
                <el-tooltip content="添加新地点" placement="bottom">
                  <el-icon><LocationInformation /></el-icon>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="addRegion">
                <el-tooltip content="绘制区域多边形" placement="bottom">
                  <el-icon><MapLocation /></el-icon>
                </el-tooltip>
              </el-radio-button>
              <el-radio-button value="addRoute">
                <el-tooltip content="绘制路径/河流" placement="bottom">
                  <el-icon><Share /></el-icon>
                </el-tooltip>
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="toolbar-section zoom-controls">
            <el-button-group>
              <el-button size="small" @click="zoomOut" title="缩小">
                <el-icon><ZoomOut /></el-icon>
              </el-button>
              <el-button size="small" @click="resetView" title="适应屏幕">
                <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
              </el-button>
              <el-button size="small" @click="zoomIn" title="放大">
                <el-icon><ZoomIn /></el-icon>
              </el-button>
            </el-button-group>
          </div>

          <div class="toolbar-section layer-controls">
            <el-dropdown trigger="click" :hide-on-click="false">
              <el-button size="small">
                <el-icon><CopyDocument /></el-icon> 图层显示
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="layer-dropdown">
                  <el-dropdown-item>
                    <el-checkbox v-model="showLocations">地点地标</el-checkbox>
                  </el-dropdown-item>
                  <el-dropdown-item>
                    <el-checkbox v-model="showRegions">势力区域</el-checkbox>
                  </el-dropdown-item>
                  <el-dropdown-item>
                    <el-checkbox v-model="showRoutes">道路/河流</el-checkbox>
                  </el-dropdown-item>
                  <el-dropdown-item divided>
                    <el-checkbox v-model="showCharacters">人物动态位置</el-checkbox>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- 地图画布 -->
        <div class="canvas-container" ref="canvasContainer">
        <v-stage
          ref="stageRef"
          :config="{
            width: stageWidth,
            height: stageHeight,
            scaleX: scale,
            scaleY: scale,
            x: stageX,
            y: stageY,
            draggable: currentTool === 'pan'
          }"
          @mousedown="handleStageClick"
          @wheel="handleWheel"
        >
          <!-- 背景层 -->
          <v-layer>
            <v-rect
              :config="{
                x: 0,
                y: 0,
                width: mapData.width,
                height: mapData.height,
                fill: mapData.background || '#f5f5f5'
              }"
            />
            <!-- 网格 -->
            <v-group v-if="mapData.gridEnabled">
              <v-line
                v-for="i in Math.ceil(mapData.height / mapData.gridSize)"
                :key="'h' + i"
                :config="{
                  points: [0, i * mapData.gridSize, mapData.width, i * mapData.gridSize],
                  stroke: '#e0e0e0',
                  strokeWidth: 0.5
                }"
              />
              <v-line
                v-for="i in Math.ceil(mapData.width / mapData.gridSize)"
                :key="'v' + i"
                :config="{
                  points: [i * mapData.gridSize, 0, i * mapData.gridSize, mapData.height],
                  stroke: '#e0e0e0',
                  strokeWidth: 0.5
                }"
              />
            </v-group>
          </v-layer>

          <!-- 区域层 -->
          <v-layer v-if="showRegions">
            <v-group>
              <v-line
                v-for="region in mapData.regions"
                :key="region.id"
                :config="{
                  points: flattenPoints(region.points),
                  fill: region.color,
                  stroke: region.borderColor || '#333',
                  strokeWidth: 2,
                  closed: true,
                  opacity: 0.5
                }"
                @click="selectRegion(region)"
              />
            </v-group>
          </v-layer>

          <!-- 路线层 -->
          <v-layer v-if="showRoutes">
            <v-line
              v-for="route in mapData.routes"
              :key="route.id"
              :config="{
                points: flattenPoints(route.points),
                stroke: route.color,
                strokeWidth: getRouteWidth(route.type),
                lineCap: 'round',
                lineJoin: 'round'
              }"
              @click="selectRoute(route)"
            />
          </v-layer>

          <!-- 地点层 -->
          <v-layer v-if="showLocations">
            <v-group
              v-for="location in mapData.locations"
              :key="location.id"
            >
              <v-circle
                v-if="location.position"
                :config="{
                  x: location.position.x,
                  y: location.position.y,
                  radius: getLocationSize(location.importance),
                  fill: location.color || getLocationColor(location.type),
                  stroke: selectedLocation?.id === location.id ? '#FF5722' : '#333',
                  strokeWidth: selectedLocation?.id === location.id ? 3 : 1.5,
                  shadowColor: 'black',
                  shadowBlur: 5,
                  shadowOpacity: 0.3
                }"
                @click="selectLocation(location)"
                @dblclick="editLocation(location)"
                draggable
                @dragend="updateLocationPosition"
              />
              <v-text
                v-if="location.position"
                :config="{
                  x: location.position.x,
                  y: location.position.y - getLocationSize(location.importance) - 20,
                  text: location.name,
                  fontSize: 12,
                  fontStyle: 'bold',
                  fill: '#333',
                  align: 'center',
                  offsetX: getTextWidth(location.name) / 2
                }"
                @click="selectLocation(location)"
              />
            </v-group>
          </v-layer>

          <!-- 人物位置层 -->
          <v-layer v-if="showCharacters">
            <v-group
              v-for="charLoc in mapData.characterLocations"
              :key="charLoc.characterId + '-' + charLoc.locationId"
            >
              <v-circle
                v-if="getLocationById(charLoc.locationId)?.position"
                :config="{
                  x: getLocationById(charLoc.locationId)!.position!.x + 15,
                  y: getLocationById(charLoc.locationId)!.position!.y - 15,
                  radius: 8,
                  fill: '#FF9800',
                  stroke: '#fff',
                  strokeWidth: 2
                }"
              />
              <v-text
                v-if="getLocationById(charLoc.locationId)?.position"
                :config="{
                  x: getLocationById(charLoc.locationId)!.position!.x + 25,
                  y: getLocationById(charLoc.locationId)!.position!.y - 25,
                  text: getCharacterName(charLoc.characterId),
                  fontSize: 10,
                  fill: '#666'
                }"
              />
            </v-group>
          </v-layer>
        </v-stage>
      </div>
      </div> <!-- map-main end -->

      <!-- 侧边栏 -->
      <div class="sidebar">
        <el-tabs v-model="activeTab">
          <!-- 地点列表 -->
          <el-tab-pane label="地点" name="locations">
            <div class="list-container">
              <el-input
                v-model="locationSearch"
                placeholder="搜索地点..."
                prefix-icon="Search"
                clearable
                style="margin-bottom: 10px"
              />
              <el-button type="primary" size="small" @click="addLocation" style="width: 100%; margin-bottom: 10px">
                <el-icon><Plus /></el-icon>
                添加地点
              </el-button>
              <div
                v-for="location in filteredLocations"
                :key="location.id"
                class="location-item"
                :class="{ active: selectedLocation?.id === location.id }"
                @click="selectLocation(location)"
              >
                <div class="location-icon" :style="{ backgroundColor: location.color || getLocationColor(location.type) }"></div>
                <div class="location-info">
                  <div class="location-name">{{ location.name || '未命名地点' }}</div>
                  <div class="location-desc">{{ location.description || '暂无描述' }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 区域列表 -->
          <el-tab-pane label="区域" name="regions">
            <div class="list-container">
              <el-button type="primary" size="small" @click="addRegion" style="width: 100%; margin-bottom: 10px">
                <el-icon><Plus /></el-icon>
                添加区域
              </el-button>
              <div
                v-for="region in mapData.regions"
                :key="region.id"
                class="region-item"
                :class="{ active: selectedRegion?.id === region.id }"
                @click="selectRegion(region)"
              >
                <div class="region-color" :style="{ backgroundColor: region.color }"></div>
                <div class="region-info">
                  <div class="region-name">{{ region.name }}</div>
                  <div class="region-desc">{{ region.description }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <!-- 路线列表 -->
          <el-tab-pane label="路线" name="routes">
            <div class="list-container">
              <el-button type="primary" size="small" @click="addRoute" style="width: 100%; margin-bottom: 10px">
                <el-icon><Plus /></el-icon>
                添加路线
              </el-button>
              <div
                v-for="route in mapData.routes"
                :key="route.id"
                class="route-item"
                :class="{ active: selectedRoute?.id === route.id }"
                @click="selectRoute(route)"
              >
                <div class="route-color" :style="{ backgroundColor: route.color }"></div>
                <div class="route-info">
                  <div class="route-name">{{ route.name }}</div>
                  <div class="route-desc">{{ route.type }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 地点编辑对话框 -->
    <el-dialog v-model="showLocationDialog" title="编辑地点" width="500px">
      <el-form v-if="editingLocation" :model="editingLocation" label-width="100px">
        <el-form-item label="地点名称">
          <el-input v-model="editingLocation.name" placeholder="输入地点名称" />
        </el-form-item>
        <el-form-item label="地点类型">
          <el-select v-model="editingLocation.type" placeholder="选择类型">
            <el-option label="城市" value="city" />
            <el-option label="城镇" value="town" />
            <el-option label="村庄" value="village" />
            <el-option label="山脉" value="mountain" />
            <el-option label="河流" value="river" />
            <el-option label="湖泊" value="lake" />
            <el-option label="森林" value="forest" />
            <el-option label="沙漠" value="desert" />
            <el-option label="海洋" value="ocean" />
            <el-option label="岛屿" value="island" />
            <el-option label="遗迹" value="ruins" />
            <el-option label="地下城" value="dungeon" />
            <el-option label="城堡" value="castle" />
            <el-option label="神庙" value="temple" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editingLocation.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="重要性">
          <el-radio-group v-model="editingLocation.importance">
            <el-radio value="high">高</el-radio>
            <el-radio value="medium">中</el-radio>
            <el-radio value="low">低</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editingLocation.color" />
        </el-form-item>
        <el-form-item label="所属势力">
          <el-select v-model="editingLocation.factionId" placeholder="选择势力" clearable>
            <el-option
              v-for="faction in factions.filter(f => f && f.id)"
              :key="faction.id"
              :label="faction.name"
              :value="faction.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-row :gutter="10">
            <el-col :span="12">
              <el-input-number v-model="editingLocation.position!.x" placeholder="X" :min="0" :max="mapData.width" />
            </el-col>
            <el-col :span="12">
              <el-input-number v-model="editingLocation.position!.y" placeholder="Y" :min="0" :max="mapData.height" />
            </el-col>
          </el-row>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showLocationDialog = false">取消</el-button>
        <el-button type="danger" @click="deleteLocation">删除</el-button>
        <el-button type="primary" @click="saveLocation">保存</el-button>
      </template>
    </el-dialog>

    <!-- 区域编辑对话框 -->
    <el-dialog v-model="showRegionDialog" title="编辑区域" width="500px">
      <el-form v-if="editingRegion" :model="editingRegion" label-width="100px">
        <el-form-item label="区域名称">
          <el-input v-model="editingRegion.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editingRegion.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="填充颜色">
          <el-color-picker v-model="editingRegion.color" />
        </el-form-item>
        <el-form-item label="边框颜色">
          <el-color-picker v-model="editingRegion.borderColor" />
        </el-form-item>
        <el-form-item label="所属势力">
          <el-select v-model="editingRegion.factionId" placeholder="选择势力" clearable>
            <el-option
              v-for="faction in factions.filter(f => f && f.id)"
              :key="faction.id"
              :label="faction.name"
              :value="faction.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRegionDialog = false">取消</el-button>
        <el-button type="danger" @click="deleteRegion">删除</el-button>
        <el-button type="primary" @click="saveRegion">保存</el-button>
      </template>
    </el-dialog>

    <!-- 路线编辑对话框 -->
    <el-dialog v-model="showRouteDialog" title="编辑路线" width="500px">
      <el-form v-if="editingRoute" :model="editingRoute" label-width="100px">
        <el-form-item label="路线名称">
          <el-input v-model="editingRoute.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editingRoute.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editingRoute.type">
            <el-option label="道路" value="road" />
            <el-option label="小径" value="path" />
            <el-option label="河流" value="river" />
            <el-option label="边界" value="border" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editingRoute.color" />
        </el-form-item>
        <el-form-item label="路径点">
          <el-button size="small" @click="addRoutePoint">添加点</el-button>
          <div v-for="(point, index) in editingRoute.points" :key="index" style="margin-top: 5px">
            <el-input-number v-model="point.x" size="small" :min="0" :max="mapData.width" />
            <el-input-number v-model="point.y" size="small" :min="0" :max="mapData.height" style="margin-left: 5px" />
            <el-button size="small" type="danger" @click="removeRoutePoint(index)" style="margin-left: 5px">删除</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRouteDialog = false">取消</el-button>
        <el-button type="danger" @click="deleteRoute">删除</el-button>
        <el-button type="primary" @click="saveRoute">保存</el-button>
      </template>
    </el-dialog>

    <!-- 导出对话框 -->
    <el-dialog v-model="showExportDialog" title="导出地图" width="400px">
      <el-form label-width="100px">
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportFormat">
            <el-radio value="json">JSON</el-radio>
            <el-radio value="svg">SVG</el-radio>
            <el-radio value="png">PNG</el-radio>
            <el-radio value="csv">CSV (地点)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="选项" v-if="exportFormat === 'svg'">
          <el-checkbox v-model="exportOptions.includeGrid">包含网格</el-checkbox>
          <el-checkbox v-model="exportOptions.includeLabels">包含标签</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showExportDialog = false">取消</el-button>
        <el-button type="primary" @click="handleExport">导出</el-button>
      </template>
    </el-dialog>

    <!-- 生成人物轨迹对话框 -->
    <el-dialog v-model="showTraceDialog" title="生成人物行动轨迹" width="400px">
      <el-form label-width="100px">
        <el-form-item label="选择人物">
          <el-select v-model="traceCharacterId" filterable placeholder="选择要追踪的人物">
            <el-option
              v-for="char in characters"
              :key="char.id"
              :label="char.name"
              :value="char.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="轨迹颜色">
          <el-color-picker v-model="traceColor" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTraceDialog = false">取消</el-button>
        <el-button type="primary" @click="generateCharacterTrace" :disabled="!traceCharacterId">生成轨迹路线</el-button>
      </template>
    </el-dialog>

    <!-- 生成底图对话框 -->
    <el-dialog v-model="showBgDialog" title="AI 生成幻景底图" width="500px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 20px;"
      >
        <template #title>
          该功能将根据当前世界观设定生成适配的地图背景提示词。
        </template>
        由于底层尚未接入 DALL-E 3 或 Midjourney 接口，目前将为您生成精准的绘画 Prompt，您可以复制到 AI 绘画工具中使用。
      </el-alert>
      <el-form label-width="100px">
        <el-form-item label="地图风格">
          <el-select v-model="bgStyle">
            <el-option label="复古羊皮纸" value="vintage parchment fantasy map, ink drawing, highly detailed, D&D style" />
            <el-option label="赛博朋克全息图" value="cyberpunk glowing holographic map, neon blue and pink, dark background, futuristic grid" />
            <el-option label="高魔水墨" value="chinese ink wash painting style fantasy map, floating mountains, ethereal clouds" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成的Prompt" v-if="generatedBgPrompt">
          <el-input type="textarea" :rows="6" v-model="generatedBgPrompt" readonly />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBgDialog = false">关闭</el-button>
        <el-button type="primary" @click="generateBgPrompt">生成绘图咒语</el-button>
        <el-button type="success" v-if="generatedBgPrompt" @click="copyBgPrompt">复制咒语</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage } from 'element-plus'
import {
  Grid, Refresh, Download, Check, Plus, ZoomIn, ZoomOut, FullScreen, MagicStick, Position, Picture, Location as LocationIcon, Pointer, Rank, LocationInformation, MapLocation, Share, CopyDocument
} from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { Location, MapRegion, MapRoute, MapData, MapPosition, Faction, Character } from '@/types'
import {
  exportMapToJSON,
  exportMapToSVG,
  exportMapToPNG,
  exportLocationsToCSV,
  downloadFile,
  extractMapDataFromWorld
} from '@/utils/mapExporter'
import { extractJSONArray } from '@/utils/llm/jsonValidator'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)

// Konva refs
const stageRef = ref()
const canvasContainer = ref<HTMLElement>()

// Stage dimensions
const stageWidth = ref(1200)
const stageHeight = ref(800)

// View state
const scale = ref(1)
const stageX = ref(0)
const stageY = ref(0)
const autoLayouting = ref(false)

// Tools
const currentTool = ref<'select' | 'pan' | 'addLocation' | 'addRegion' | 'addRoute'>('select')
const activeTab = ref('locations')

// Layer visibility
const showLocations = ref(true)
const showRegions = ref(true)
const showRoutes = ref(true)
const showCharacters = ref(false)

// Search
const locationSearch = ref('')

// Selection
const selectedLocation = ref<Location | null>(null)
const selectedRegion = ref<MapRegion | null>(null)
const selectedRoute = ref<MapRoute | null>(null)

// Dialogs
const showLocationDialog = ref(false)
const showRegionDialog = ref(false)
const showRouteDialog = ref(false)
const showExportDialog = ref(false)

// Editing
const editingLocation = ref<Location | null>(null)
const editingRegion = ref<MapRegion | null>(null)
const editingRoute = ref<MapRoute | null>(null)

// Export
const exportFormat = ref<'json' | 'svg' | 'png' | 'csv'>('json')
const exportOptions = ref({
  includeGrid: true,
  includeLabels: true
})

// Trace Trajectory
const showTraceDialog = ref(false)
const traceCharacterId = ref('')
const traceColor = ref('#E91E63')

// Background Generation
const showBgDialog = ref(false)
const bgStyle = ref('vintage parchment fantasy map, ink drawing, highly detailed, D&D style')
const generatedBgPrompt = ref('')

// Map data
const mapData = ref<MapData>({
  width: 1200,
  height: 800,
  gridEnabled: true,
  gridSize: 50,
  locations: [],
  regions: [],
  routes: [],
  characterLocations: []
})

// Computed
const factions = computed(() => project.value?.world?.factions || [])

const characters = computed(() => project.value?.characters || [])

const filteredLocations = computed(() => {
  if (!locationSearch.value) return mapData.value.locations
  const search = locationSearch.value.toLowerCase()
  return mapData.value.locations.filter(loc =>
    loc.name.toLowerCase().includes(search) ||
    loc.description.toLowerCase().includes(search)
  )
})

// Initialize map data from world setting
onMounted(() => {
  if (project.value?.world) {
    const extracted = extractMapDataFromWorld(project.value.world)
    mapData.value = {
      ...mapData.value,
      ...extracted,
      locations: extracted.locations || [],
      regions: extracted.regions || []
    }
  }

  // Resize observer
  updateCanvasSize()
  window.addEventListener('resize', updateCanvasSize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateCanvasSize)
})

function updateCanvasSize() {
  if (canvasContainer.value) {
    stageWidth.value = canvasContainer.value.clientWidth
    stageHeight.value = canvasContainer.value.clientHeight
  }
}

// Zoom controls
function zoomIn() {
  scale.value = Math.min(scale.value * 1.2, 3)
}

function zoomOut() {
  scale.value = Math.max(scale.value / 1.2, 0.3)
}

function resetView() {
  scale.value = 1
  stageX.value = 0
  stageY.value = 0
}

function handleWheel(e: any) {
  e.evt.preventDefault()
  const delta = e.evt.deltaY > 0 ? -1 : 1
  const newScale = scale.value + delta * 0.1
  scale.value = Math.min(Math.max(newScale, 0.3), 3)
}

// Grid toggle
function toggleGrid() {
  mapData.value.gridEnabled = !mapData.value.gridEnabled
}

// Auto layout
function autoLayout() {
  const locations = mapData.value.locations
  const cols = Math.ceil(Math.sqrt(locations.length))
  const spacing = Math.min(mapData.value.width, mapData.value.height) / (cols + 1)

  locations.forEach((loc, i) => {
    if (loc.position) {
      const row = Math.floor(i / cols)
      const col = i % cols
      loc.position.x = spacing * (col + 1)
      loc.position.y = spacing * (row + 1)
    }
  })

  ElMessage.success('网格布局完成')
}

// AI Auto layout
async function autoLayoutWithAI() {
  if (!project.value || mapData.value.locations.length === 0) {
    ElMessage.warning('没有可排布的地点数据')
    return
  }

  autoLayouting.value = true
  try {
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (!aiStore.checkInitialized()) {
      ElMessage.warning('请先配置AI模型提供商')
      return
    }

    const locs = mapData.value.locations.map(l => ({ id: l.id, name: l.name, type: l.type, desc: l.description }))
    const factionsInfo = project.value.world?.factions?.map(f => ({ name: f.name, desc: f.description })) || []
    
    const prompt = `你是一个专业奇幻/科幻世界地图生成器。请根据以下世界观设定和地点列表，为这些地点智能分配二维坐标(x, y)。
地图尺寸：宽 ${mapData.value.width}，高 ${mapData.value.height}。

【世界势力背景】：
${JSON.stringify(factionsInfo)}

【地点列表】：
${JSON.stringify(locs)}

【排布要求】：
1. 深入理解地点描述和所属势力。相互关联、同一势力、或地理描述上接近的地点，它们的 (x,y) 坐标应当比较靠近。
2. 注意方向词（如东方、极北等），并在坐标上体现（x较小在西，x较大在东，y较小在北，y较大在南）。
3. 坐标 x 的范围必须在 50 到 ${mapData.value.width - 50} 之间。
4. 坐标 y 的范围必须在 50 到 ${mapData.value.height - 50} 之间。
5. 必须返回一个纯 JSON 数组，每个对象包含 id, x, y。绝对不要输出任何 markdown 标记、解释或其他废话！

返回示例：
[
  { "id": "uuid-123", "x": 400, "y": 500 },
  { "id": "uuid-456", "x": 450, "y": 520 }
]
`
    const response = await aiStore.chat(
      [{ role: 'user', content: prompt }], 
      { type: 'worldbuilding', complexity: 'medium', priority: 'quality' }, 
      { maxTokens: 4000 }
    )

    const validation = extractJSONArray(response.content)
    if (!validation.valid) {
      throw new Error(`AI返回格式有误: ${validation.error}`)
    }

    const parsed = validation.data
    if (!Array.isArray(parsed)) {
      throw new Error('AI没有返回数组格式')
    }

    let updatedCount = 0
    parsed.forEach((pos: any) => {
      if (pos.id && typeof pos.x === 'number' && typeof pos.y === 'number') {
        const loc = mapData.value.locations.find(l => l.id === pos.id)
        if (loc && loc.position) {
          loc.position.x = pos.x
          loc.position.y = pos.y
          updatedCount++
        }
      }
    })

    ElMessage.success(`AI 智能排布完成！成功更新了 ${updatedCount} 个地点的坐标。`)
  } catch (error) {
    console.error('AI 智能排布失败:', error)
    ElMessage.error('智能排布失败，AI 返回格式可能有误。请重试或检查日志。')
  } finally {
    autoLayouting.value = false
  }
}

// Location methods
function selectLocation(location: Location) {
  selectedLocation.value = location
  selectedRegion.value = null
  selectedRoute.value = null
}

function editLocation(location: Location) {
  editingLocation.value = JSON.parse(JSON.stringify(location))
  showLocationDialog.value = true
}

function addLocation() {
  const newLocation: Location = {
    id: uuidv4(),
    name: '新地点',
    description: '',
    importance: 'medium',
    type: 'other',
    position: {
      x: mapData.value.width / 2,
      y: mapData.value.height / 2
    },
    color: undefined,
    factionId: undefined
  }
  editingLocation.value = newLocation
  showLocationDialog.value = true
}

function saveLocation() {
  if (!editingLocation.value) return

  const index = mapData.value.locations.findIndex(l => l.id === editingLocation.value!.id)
  if (index >= 0) {
    mapData.value.locations[index] = editingLocation.value
  } else {
    mapData.value.locations.push(editingLocation.value)
  }

  showLocationDialog.value = false
  ElMessage.success('地点已保存')
}

function deleteLocation() {
  if (!editingLocation.value) return

  const index = mapData.value.locations.findIndex(l => l.id === editingLocation.value!.id)
  if (index >= 0) {
    mapData.value.locations.splice(index, 1)
  }

  showLocationDialog.value = false
  ElMessage.success('地点已删除')
}

function updateLocationPosition(e: any) {
  const location = mapData.value.locations.find(l => l.id === selectedLocation.value?.id)
  if (location && location.position) {
    location.position.x = e.target.x()
    location.position.y = e.target.y()
  }
}

// Region methods
function autoGenerateRegions() {
  if (!project.value || mapData.value.locations.length === 0) {
    ElMessage.warning('没有足够的地点数据来生成势力范围')
    return
  }

  // 根据 factionId 分组
  const factionsMap = new Map<string, Location[]>()
  mapData.value.locations.forEach(loc => {
    if (loc.factionId && loc.position) {
      if (!factionsMap.has(loc.factionId)) {
        factionsMap.set(loc.factionId, [])
      }
      factionsMap.get(loc.factionId)!.push(loc)
    }
  })

  let generatedCount = 0

  factionsMap.forEach((locs, factionId) => {
    if (locs.length < 3) return // 至少需要3个点才能形成多边形区域

    const faction = project.value!.world?.factions?.find(f => f.id === factionId)
    if (!faction) return

    // 获取多边形顶点（简化版凸包算法 - Graham Scan）
    const points = locs.map(l => l.position!)
    const sorted = [...points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y)
    
    const cross = (o: MapPosition, a: MapPosition, b: MapPosition) => 
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

    const lower: MapPosition[] = []
    for (let i = 0; i < sorted.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
        lower.pop()
      }
      lower.push(sorted[i])
    }

    const upper: MapPosition[] = []
    for (let i = sorted.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
        upper.pop()
      }
      upper.push(sorted[i])
    }

    upper.pop()
    lower.pop()
    const hull = lower.concat(upper)

    // 稍微向外膨胀一点边界，包裹住图标
    const center = {
      x: hull.reduce((sum, p) => sum + p.x, 0) / hull.length,
      y: hull.reduce((sum, p) => sum + p.y, 0) / hull.length
    }
    const expandedHull = hull.map(p => ({
      x: p.x + (p.x - center.x) * 0.2, // 膨胀 20%
      y: p.y + (p.y - center.y) * 0.2
    }))

    // 检查是否已存在该势力的区域
    const existingIndex = mapData.value.regions.findIndex(r => r.factionId === factionId)
    const newRegion: MapRegion = {
      id: existingIndex >= 0 ? mapData.value.regions[existingIndex].id : uuidv4(),
      name: `${faction.name} 的势力范围`,
      description: faction.description,
      color: existingIndex >= 0 ? mapData.value.regions[existingIndex].color : `hsla(${Math.random() * 360}, 70%, 50%, 0.2)`,
      borderColor: existingIndex >= 0 ? mapData.value.regions[existingIndex].borderColor : '#333',
      points: expandedHull,
      factionId: factionId
    }

    if (existingIndex >= 0) {
      mapData.value.regions[existingIndex] = newRegion
    } else {
      mapData.value.regions.push(newRegion)
    }
    generatedCount++
  })

  if (generatedCount > 0) {
    ElMessage.success(`成功为 ${generatedCount} 个势力生成了专属版图区域！`)
  } else {
    ElMessage.info('未找到符合条件的势力（每个势力至少需要占领3个带坐标的地点）')
  }
}

function selectRegion(region: MapRegion) {
  selectedRegion.value = region
  selectedLocation.value = null
  selectedRoute.value = null
}

function addRegion() {
  const newRegion: MapRegion = {
    id: uuidv4(),
    name: '新区域',
    description: '',
    color: `hsl(${Math.random() * 360}, 70%, 80%)`,
    borderColor: '#333',
    points: [
      { x: 300, y: 200 },
      { x: 500, y: 200 },
      { x: 550, y: 350 },
      { x: 400, y: 400 },
      { x: 250, y: 350 }
    ],
    factionId: undefined
  }
  editingRegion.value = newRegion
  showRegionDialog.value = true
}

function saveRegion() {
  if (!editingRegion.value) return

  const index = mapData.value.regions.findIndex(r => r.id === editingRegion.value!.id)
  if (index >= 0) {
    mapData.value.regions[index] = editingRegion.value
  } else {
    mapData.value.regions.push(editingRegion.value)
  }

  showRegionDialog.value = false
  ElMessage.success('区域已保存')
}

function deleteRegion() {
  if (!editingRegion.value) return

  const index = mapData.value.regions.findIndex(r => r.id === editingRegion.value!.id)
  if (index >= 0) {
    mapData.value.regions.splice(index, 1)
  }

  showRegionDialog.value = false
  ElMessage.success('区域已删除')
}

// Route methods
function selectRoute(route: MapRoute) {
  selectedRoute.value = route
  selectedLocation.value = null
  selectedRegion.value = null
}

function addRoute() {
  const newRoute: MapRoute = {
    id: uuidv4(),
    name: '新路线',
    description: '',
    type: 'road',
    color: '#8D6E63',
    points: [
      { x: 200, y: 200 },
      { x: 400, y: 300 },
      { x: 600, y: 250 }
    ]
  }
  editingRoute.value = newRoute
  showRouteDialog.value = true
}

function addRoutePoint() {
  if (!editingRoute.value) return
  const lastPoint = editingRoute.value.points[editingRoute.value.points.length - 1] || { x: 0, y: 0 }
  editingRoute.value.points.push({ x: lastPoint.x + 50, y: lastPoint.y + 50 })
}

function removeRoutePoint(index: number) {
  if (!editingRoute.value) return
  editingRoute.value.points.splice(index, 1)
}

function saveRoute() {
  if (!editingRoute.value) return

  const index = mapData.value.routes.findIndex(r => r.id === editingRoute.value!.id)
  if (index >= 0) {
    mapData.value.routes[index] = editingRoute.value
  } else {
    mapData.value.routes.push(editingRoute.value)
  }

  showRouteDialog.value = false
  ElMessage.success('路线已保存')
}

function deleteRoute() {
  if (!editingRoute.value) return

  const index = mapData.value.routes.findIndex(r => r.id === editingRoute.value!.id)
  if (index >= 0) {
    mapData.value.routes.splice(index, 1)
  }

  showRouteDialog.value = false
  ElMessage.success('路线已删除')
}

// Generate Character Trajectory
function generateCharacterTrace() {
  if (!traceCharacterId.value || !project.value) return;

  const character = project.value.characters.find(c => c.id === traceCharacterId.value);
  if (!character) {
    ElMessage.error('找不到该人物');
    return;
  }

  const history = character.stateHistory || [];
  if (history.length === 0) {
    ElMessage.warning('该人物没有状态变更历史记录，无法生成轨迹');
    return;
  }

  // 按照时间戳或章节排序（假设本来就是按时间顺序，或者我们反向/正向排序）
  // 注意：在之前的实现中，历史记录可能是 unshift 插在头部的，所以我们需要倒序获取以符合时间线顺序
  const sortedHistory = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const points: MapPosition[] = [];
  const visitedLocations = new Set<string>();

  sortedHistory.forEach(record => {
    if (record.location) {
      // 模糊匹配地点名
      const loc = mapData.value.locations.find(l => 
        l.name === record.location || record.location.includes(l.name) || l.name.includes(record.location)
      );
      if (loc && loc.position) {
        // 防止同一个地点连续记录重复点
        const lastPoint = points[points.length - 1];
        if (!lastPoint || lastPoint.x !== loc.position.x || lastPoint.y !== loc.position.y) {
          points.push({ x: loc.position.x, y: loc.position.y });
          visitedLocations.add(loc.name);
        }
      }
    }
  });

  if (points.length < 2) {
    ElMessage.warning(`找到的有效地理坐标不足 2 个。已匹配到的地点：${Array.from(visitedLocations).join(', ')}。请确保人物历史记录中的地点名称在地图中存在。`);
    return;
  }

  const newRoute: MapRoute = {
    id: uuidv4(),
    name: `${character.name} 的行动轨迹`,
    description: `自动生成的行动轨迹`,
    type: 'custom',
    color: traceColor.value,
    points: points
  };

  mapData.value.routes.push(newRoute);
  showTraceDialog.value = false;
  ElMessage.success(`成功生成 ${character.name} 的轨迹路线！包含了 ${points.length} 个节点。`);
}

// Export methods
async function handleExport() {
  try {
    switch (exportFormat.value) {
      case 'json': {
        const json = exportMapToJSON(mapData.value)
        downloadFile(json, 'world-map.json', 'application/json')
        break
      }
      case 'svg': {
        const svg = exportMapToSVG(mapData.value, exportOptions.value)
        downloadFile(svg, 'world-map.svg', 'image/svg+xml')
        break
      }
      case 'png': {
        if (stageRef.value) {
          const blob = await exportMapToPNG(mapData.value, stageRef.value.getStage())
          downloadFile(blob, 'world-map.png')
        }
        break
      }
      case 'csv': {
        const csv = exportLocationsToCSV(mapData.value.locations)
        downloadFile(csv, 'locations.csv', 'text/csv')
        break
      }
    }
    showExportDialog.value = false
    ElMessage.success('导出成功')
  } catch (error) {
    ElMessage.error('导出失败：' + (error as Error).message)
  }
}

// Save map data
async function saveMapData() {
  if (!project.value) {
    ElMessage.error('项目未加载')
    return
  }

  try {
    // Update locations in world setting
    if (project.value.world) {
      project.value.world.geography.locations = mapData.value.locations.map(loc => ({
        id: loc.id,
        name: loc.name,
        description: loc.description,
        importance: loc.importance,
        type: loc.type,
        position: loc.position,
        color: loc.color,
        factionId: loc.factionId
      }))
    }

    await projectStore.saveCurrentProject()
    ElMessage.success('地图数据已保存')
  } catch (error) {
    ElMessage.error('保存失败：' + (error as Error).message)
  }
}

// Background Generation
async function generateBgPrompt() {
  if (!project.value) return;
  const worldName = project.value.world?.name || '未知大陆';
  const locationsStr = mapData.value.locations.map(l => l.name).join(', ');
  
  generatedBgPrompt.value = `${bgStyle.value}. A map of a world called "${worldName}". Key landmarks include: ${locationsStr}. The map should have a blank, empty space in the center for pins, with decorative elements on the borders like compass rose, sea monsters, and mountains. 8k resolution, masterpiece.`;
  ElMessage.success('提示词已生成！');
}

async function copyBgPrompt() {
  try {
    await navigator.clipboard.writeText(generatedBgPrompt.value);
    ElMessage.success('已复制到剪贴板！');
  } catch (err) {
    ElMessage.error('复制失败，请手动选择复制。');
  }
}

// Helper functions
function flattenPoints(points: MapPosition[]): number[] {
  const result: number[] = []
  points.forEach(p => {
    result.push(p.x, p.y)
  })
  return result
}

function getLocationSize(importance?: 'high' | 'medium' | 'low'): number {
  switch (importance) {
    case 'high': return 15
    case 'medium': return 12
    case 'low': return 8
    default: return 10
  }
}

function getLocationColor(type?: string): string {
  const colors: Record<string, string> = {
    city: '#E91E63',
    town: '#9C27B0',
    village: '#673AB7',
    mountain: '#795548',
    river: '#2196F3',
    lake: '#03A9F4',
    forest: '#4CAF50',
    desert: '#FF9800',
    ocean: '#00BCD4',
    island: '#8BC34A',
    ruins: '#607D8B',
    dungeon: '#424242',
    castle: '#FF5722',
    temple: '#FFC107',
    other: '#9E9E9E'
  }
  return colors[type || 'other'] || colors.other
}

function getRouteWidth(type: string): number {
  switch (type) {
    case 'road': return 4
    case 'river': return 5
    case 'path': return 2
    case 'border': return 3
    default: return 3
  }
}

function getTextWidth(text: string): number {
  return text.length * 12
}

function getLocationById(id: string): Location | undefined {
  return mapData.value.locations.find(loc => loc.id === id)
}

function getCharacterName(id: string): string {
  const char = characters.value.find(c => c.id === id)
  return char?.name || '未知'
}

// Stage click handler
function handleStageClick(e: any) {
  if (currentTool.value === 'addLocation') {
    const stage = stageRef.value?.getStage()
    if (stage) {
      const pointerPos = stage.getPointerPosition()
      const pos = {
        x: (pointerPos.x - stageX.value) / scale.value,
        y: (pointerPos.y - stageY.value) / scale.value
      }

      const newLocation: Location = {
        id: uuidv4(),
        name: '新地点',
        description: '',
        importance: 'medium',
        type: 'other',
        position: pos
      }

      editingLocation.value = newLocation
      showLocationDialog.value = true
    }
  }
}
</script>

<style scoped>
.world-map {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-card {
  margin-bottom: 10px;
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

.map-container {
  flex: 1;
  display: flex;
  gap: 10px;
  overflow: hidden;
}

.map-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #fff;
  border-radius: 8px;
  margin-bottom: 10px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar-section {
  display: flex;
  align-items: center;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.zoom-level {
  font-size: 12px;
  color: #666;
  min-width: 50px;
}

.layer-controls {
  display: flex;
  gap: 15px;
  margin-left: auto;
}

.canvas-container {
  flex: 1;
  background: white;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 300px;
  background: white;
  border-radius: 4px;
  padding: 15px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.list-container {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

.location-item,
.region-item,
.route-item {
  display: flex;
  align-items: center;
  padding: 10px;
  margin-bottom: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.location-item:hover,
.region-item:hover,
.route-item:hover {
  background: #ecf5ff;
}

.location-item.active,
.region-item.active,
.route-item.active {
  background: #d9ecff;
  border-left: 3px solid #409eff;
}

.location-icon,
.region-color,
.route-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 10px;
  flex-shrink: 0;
}

.location-info,
.region-info,
.route-info {
  flex: 1;
  overflow: hidden;
}

.location-name,
.region-name,
.route-name {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.location-desc,
.region-desc,
.route-desc {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
