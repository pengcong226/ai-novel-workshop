<template>
  <div class="world-setting">
    <el-card class="header-card">
      <div class="header">
        <h2>世界观设定</h2>
        <div class="actions">
          <el-button type="primary" @click="generateWorld">
            <el-icon><MagicStick /></el-icon>
            AI生成设定
          </el-button>
          <el-button @click="saveWorld">保存设定</el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <!-- 基本信息 -->
      <el-card class="section-card">
        <template #header>
          <div class="card-header">
            <span>基本信息</span>
          </div>
        </template>

        <el-form :model="worldForm" label-width="100px">
          <el-form-item label="世界名称">
            <el-input v-model="worldForm.name" placeholder="请输入世界名称" />
          </el-form-item>

          <el-form-item label="时代背景">
            <el-input
              v-model="worldForm.era.time"
              type="textarea"
              :rows="3"
              placeholder="描述世界的时代背景"
            />
          </el-form-item>

          <el-form-item label="科技水平">
            <el-input v-model="worldForm.era.techLevel" placeholder="世界的科技发展程度" />
          </el-form-item>

          <el-form-item label="社会形态">
            <el-input v-model="worldForm.era.socialForm" placeholder="社会的组织形式" />
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 地理设定 -->
      <el-card class="section-card">
        <template #header>
          <div class="card-header">
            <span>地理设定</span>
            <el-button type="primary" text @click="addLocation">
              <el-icon><Plus /></el-icon>
              添加地点
            </el-button>
          </div>
        </template>

        <div class="locations-list">
          <el-card
            v-for="(location, index) in worldForm.geography.locations"
            :key="location.id"
            class="location-item"
            shadow="hover"
          >
            <div class="location-content">
              <el-input
                v-model="location.name"
                placeholder="地点名称"
                style="width: 200px; margin-right: 10px;"
              />
              <el-input
                v-model="location.description"
                placeholder="地点描述"
                style="flex: 1; margin-right: 10px;"
              />
              <el-select
                v-model="location.importance"
                placeholder="重要性"
                style="width: 120px; margin-right: 10px;"
              >
                <el-option label="高" value="high" />
                <el-option label="中" value="medium" />
                <el-option label="低" value="low" />
              </el-select>
              <el-button
                type="danger"
                text
                @click="removeLocation(index)"
              >
                删除
              </el-button>
            </div>
          </el-card>

          <el-empty v-if="worldForm.geography.locations.length === 0" description="还没有添加地点" />
        </div>
      </el-card>

      <!-- 势力设定 -->
      <el-card class="section-card">
        <template #header>
          <div class="card-header">
            <span>势力设定</span>
            <el-button type="primary" text @click="addFaction">
              <el-icon><Plus /></el-icon>
              添加势力
            </el-button>
          </div>
        </template>

        <div class="factions-list">
          <el-card
            v-for="(faction, index) in worldForm.factions"
            :key="faction.id"
            class="faction-item"
            shadow="hover"
          >
            <el-form :model="faction" label-width="80px">
              <el-form-item label="势力名称">
                <el-input v-model="faction.name" />
              </el-form-item>

              <el-form-item label="势力类型">
                <el-input v-model="faction.type" placeholder="如：宗门、帝国、商会等" />
              </el-form-item>

              <el-form-item label="势力描述">
                <el-input
                  v-model="faction.description"
                  type="textarea"
                  :rows="3"
                />
              </el-form-item>

              <el-form-item label="势力关系">
                <el-input
                  :model-value="faction.relationships.join('\n')"
                  type="textarea"
                  :rows="2"
                  placeholder="与其他势力的关系（每行一个）"
                  @update:model-value="(val: string) => { faction.relationships = val.split('\n').filter((r: string) => r.trim()) }"
                />
              </el-form-item>

              <el-button type="danger" @click="removeFaction(index)">删除势力</el-button>
            </el-form>
          </el-card>

          <el-empty v-if="worldForm.factions.length === 0" description="还没有添加势力" />
        </div>
      </el-card>

      <!-- 世界法则 -->
      <el-card class="section-card">
        <template #header>
          <div class="card-header">
            <span>世界法则</span>
            <el-button type="primary" text @click="addRule">
              <el-icon><Plus /></el-icon>
              添加法则
            </el-button>
          </div>
        </template>

        <div class="rules-list">
          <el-card
            v-for="(rule, index) in worldForm.rules"
            :key="rule.id"
            class="rule-item"
            shadow="hover"
          >
            <div class="rule-content">
              <el-input
                v-model="rule.name"
                placeholder="法则名称"
                style="width: 200px; margin-right: 10px;"
              />
              <el-input
                v-model="rule.description"
                placeholder="法则描述"
                style="flex: 1; margin-right: 10px;"
              />
              <el-button
                type="danger"
                text
                @click="removeRule(index)"
              >
                删除
              </el-button>
            </div>
          </el-card>

          <el-empty v-if="worldForm.rules.length === 0" description="还没有添加法则" />
        </div>
      </el-card>

      <!-- 力量体系 -->
      <el-card class="section-card">
        <template #header>
          <div class="card-header">
            <span>力量体系</span>
            <el-button type="primary" text @click="enablePowerSystem">
              启用力量体系
            </el-button>
          </div>
        </template>

        <div v-if="worldForm.powerSystem" class="power-system">
          <el-form :model="worldForm.powerSystem" label-width="100px">
            <el-form-item label="体系名称">
              <el-input v-model="worldForm.powerSystem.name" />
            </el-form-item>

            <el-divider>等级设定</el-divider>

            <el-button type="primary" text @click="addPowerLevel">
              <el-icon><Plus /></el-icon>
              添加等级
            </el-button>

            <div class="power-levels">
              <el-card
                v-for="(level, index) in worldForm.powerSystem.levels"
                :key="index"
                class="level-item"
              >
                <el-input
                  v-model="level.name"
                  placeholder="等级名称"
                  style="width: 200px; margin-right: 10px;"
                />
                <el-input
                  v-model="level.description"
                  placeholder="等级描述"
                  style="flex: 1; margin-right: 10px;"
                />
                <el-button type="danger" text @click="removePowerLevel(index)">
                  删除
                </el-button>
              </el-card>
            </div>
          </el-form>
        </div>

        <el-empty v-else description="尚未启用力量体系" />
      </el-card>
    </div>

    <!-- AI生成对话框 -->
    <el-dialog
      v-model="showGenerateDialog"
      title="AI生成世界观"
      width="600px"
    >
      <el-form :model="generateForm" label-width="100px">
        <el-form-item label="作品类型">
          <el-input v-model="generateForm.genre" />
        </el-form-item>

        <el-form-item label="核心主题">
          <el-input
            v-model="generateForm.theme"
            type="textarea"
            :rows="3"
            placeholder="描述你想要的核心主题"
          />
        </el-form-item>

        <el-form-item label="参考元素">
          <el-input
            v-model="generateForm.elements"
            type="textarea"
            :rows="3"
            placeholder="想要包含的元素，如：修仙、魔法、科技等"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showGenerateDialog = false">取消</el-button>
        <el-button type="primary" @click="doGenerate" :loading="generating">
          开始生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage } from 'element-plus'
import { MagicStick, Plus } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { WorldSetting } from '@/types'

const projectStore = useProjectStore()
const project = computed(() => projectStore.currentProject)

const worldForm = ref<WorldSetting>({
  id: '',
  name: '',
  era: {
    time: '',
    techLevel: '',
    socialForm: ''
  },
  geography: {
    locations: []
  },
  factions: [],
  rules: [],
  aiGenerated: false
})

const showGenerateDialog = ref(false)
const generating = ref(false)
const generateForm = ref({
  genre: '',
  theme: '',
  elements: ''
})

// 当project加载完成时，加载world数据
watch(project, (newProject) => {
  if (newProject?.world) {
    console.log('[WorldSetting] 项目加载完成，加载世界观数据')
    worldForm.value = JSON.parse(JSON.stringify(newProject.world))
  }
}, { immediate: true })

onMounted(() => {
  // 初始加载（如果project已经存在）
  if (project.value?.world) {
    console.log('[WorldSetting] 组件挂载，项目已存在，加载世界观数据')
    worldForm.value = JSON.parse(JSON.stringify(project.value.world))
  } else {
    console.log('[WorldSetting] 组件挂载，项目尚未加载，等待project加载')
  }
})

function addLocation() {
  worldForm.value.geography.locations.push({
    id: uuidv4(),
    name: '',
    description: '',
    importance: 'medium'
  })
}

function removeLocation(index: number) {
  worldForm.value.geography.locations.splice(index, 1)
}

function addFaction() {
  worldForm.value.factions.push({
    id: uuidv4(),
    name: '',
    type: '',
    description: '',
    relationships: []
  })
}

function removeFaction(index: number) {
  worldForm.value.factions.splice(index, 1)
}

function addRule() {
  worldForm.value.rules.push({
    id: uuidv4(),
    name: '',
    description: ''
  })
}

function removeRule(index: number) {
  worldForm.value.rules.splice(index, 1)
}

function enablePowerSystem() {
  worldForm.value.powerSystem = {
    name: '',
    levels: [],
    skills: [],
    items: []
  }
}

function addPowerLevel() {
  if (worldForm.value.powerSystem) {
    worldForm.value.powerSystem.levels.push({
      name: '',
      description: ''
    })
  }
}

function removePowerLevel(index: number) {
  if (worldForm.value.powerSystem) {
    worldForm.value.powerSystem.levels.splice(index, 1)
  }
}

function generateWorld() {
  showGenerateDialog.value = true
  generateForm.value.genre = project.value?.genre || ''
}

async function doGenerate() {
  if (!generateForm.value.genre.trim()) {
    ElMessage.warning('请输入作品类型')
    return
  }

  generating.value = true
  try {
    // 尝试使用真实AI服务
    const { useAIStore } = await import('@/stores/ai')
    const aiStore = useAIStore()

    if (aiStore.checkInitialized()) {
      // 构建AI提示词
      const prompt = `请为"${generateForm.value.genre}"类型的小说创建一个世界观设定。
主题：${generateForm.value.theme || '自由发挥'}
风格：${generateForm.value.style || '史诗风格'}

**重要：请直接输出JSON格式，不要有任何思考过程、解释或额外文字。**

返回格式：
{"name":"世界名称","era":{"time":"时间","techLevel":"科技水平","socialForm":"社会形态"},"geography":{"locations":[{"name":"地点名","description":"描述","importance":"high"}]},"factions":[{"name":"势力名","type":"类型","description":"描述","relationships":[]}],"rules":[{"name":"规则名","description":"描述"}]}

现在请直接输出JSON：`

      const messages: any[] = [
        { role: 'user', content: prompt }
      ]

      const context: any = {
        type: 'worldbuilding',
        complexity: 'high',
        priority: 'quality'
      }

      console.log('开始调用AI服务...')
      const response = await aiStore.chat(messages, context, {
        maxTokens: 5000  // 增加到5000避免GLM-5截断
      })

      console.log('AI响应:', response)
      const content = response.content

      // 解析AI返回的JSON
      try {
        // 尝试提取JSON部分
        let jsonStr = content.trim()
        // 如果包含markdown代码块，提取JSON
        const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonStr = jsonMatch[1]
        } else if (jsonStr.includes('```')) {
          // 去除代码块标记
          jsonStr = jsonStr.replace(/```\w*\n?/g, '').trim()
        }

        const parsed = JSON.parse(jsonStr)
        const generated = {
          id: uuidv4(),
          ...parsed,
          aiGenerated: true
        }

        worldForm.value = generated
        ElMessage.success('世界观生成成功！')
        showGenerateDialog.value = false
      } catch (parseError) {
        console.error('解析AI响应失败:', parseError, '原始内容:', content)
        ElMessage.warning('AI返回格式有误，请重试或使用默认生成')
        // 如果解析失败，使用默认生成
        await generateDefault()
      }
    } else {
      // AI服务未初始化，使用默认生成
      console.log('AI服务未初始化，使用默认生成')
      await generateDefault()
    }
  } catch (error) {
    console.error('生成失败:', error)
    ElMessage.error('生成失败：' + (error as Error).message)
  } finally {
    generating.value = false
  }
}

async function generateDefault() {
  // 默认生成逻辑
  const generated = {
    id: uuidv4(),
    name: generateForm.value.genre + '世界',
    era: {
      time: generateForm.value.theme || '远古时代',
      techLevel: '冷兵器时代',
      socialForm: '帝国制'
    },
    geography: {
      locations: [
        { id: uuidv4(), name: '中央帝国', description: '世界的中心，繁华的帝国首都', importance: 'high' },
        { id: uuidv4(), name: '北方荒原', description: '寒冷的北方，神秘力量的发源地', importance: 'medium' },
        { id: uuidv4(), name: '东海群岛', description: '散布在东海的岛屿群，贸易繁荣', importance: 'medium' }
      ]
    },
    factions: [
      { id: uuidv4(), name: '帝国皇室', type: '统治势力', description: '统治中央帝国的皇室家族', relationships: [] },
      { id: uuidv4(), name: '修炼宗门', type: '修炼势力', description: '追求修炼之道的宗门联盟', relationships: [] }
    ],
    rules: [
      { id: uuidv4(), name: '灵气法则', description: '天地间存在灵气，可被修炼者吸收' },
      { id: uuidv4(), name: '境界限制', description: '修炼者需突破境界才能继续提升' }
    ],
    aiGenerated: false
  }

  worldForm.value = generated
  ElMessage.success('已生成示例世界观。要使用AI生成，请在配置中添加API密钥。')
  showGenerateDialog.value = false
}

async function saveWorld() {
  if (!project.value) {
    ElMessage.error('项目未加载，请刷新页面或返回项目列表重新打开')
    return
  }

  try {
    // 将 reactive 对象转换为普通对象
    const worldData = JSON.parse(JSON.stringify(worldForm.value))
    project.value.world = worldData
    await projectStore.saveCurrentProject()
    ElMessage.success('世界观设定已保存')
  } catch (error) {
    console.error('[WorldSetting] 保存失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  }
}
</script>

<style scoped>
.world-setting {
  max-width: 1200px;
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.locations-list,
.factions-list,
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.location-item,
.faction-item,
.rule-item,
.level-item {
  margin-bottom: 0;
}

.location-content,
.rule-content {
  display: flex;
  align-items: center;
}

.power-system {
  margin-top: 10px;
}

.power-levels {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
