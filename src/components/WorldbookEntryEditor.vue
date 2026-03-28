<template>
  <el-dialog
    :model-value="true"
    :title="mode === 'create' ? '新建世界书条目' : '编辑世界书条目'"
    width="90%"
    :close-on-click-modal="false"
    @close="$emit('cancel')"
  >
    <el-form :model="formData" label-width="120px">
      <!-- 基础信息标签页 -->
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基础信息" name="basic">
          <el-form-item label="标题">
            <el-input v-model="formData.title" placeholder="条目标题" />
          </el-form-item>

          <el-form-item label="内容">
            <div class="content-editor">
              <el-input
                v-model="formData.content"
                type="textarea"
                :rows="10"
                placeholder="条目内容"
              />
              <div class="content-preview">
                <div class="preview-header">
                  <span>Markdown预览</span>
                  <span class="token-count">约 {{ tokenCount }} tokens</span>
                </div>
                <div class="preview-content" v-html="renderedContent"></div>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="关键词">
            <div class="keywords-editor">
              <div class="keywords-list">
                <el-tag
                  v-for="(key, index) in formData.keys"
                  :key="index"
                  closable
                  @close="removeKeyword(index)"
                  class="keyword-tag"
                >
                  {{ key }}
                </el-tag>
                <el-input
                  v-model="newKeyword"
                  @keyup.enter="addKeyword"
                  placeholder="输入关键词后按回车添加"
                  style="width: 200px"
                />
              </div>
              <div class="keywords-actions">
                <el-button @click="extractKeywordsFromContent">
                  AI提取关键词
                </el-button>
                <el-button @click="showBatchImport = true">
                  批量导入
                </el-button>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="分组">
            <el-select v-model="formData.group" placeholder="选择分组" clearable>
              <el-option
                v-for="group in worldbookStore.groups"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="启用">
            <el-switch v-model="formData.enabled" />
          </el-form-item>
        </el-tab-pane>

        <!-- 触发条件标签页 -->
        <el-tab-pane label="触发条件" name="conditions">
          <el-form-item label="触发关键词">
            <el-select
              v-model="formData.key"
              placeholder="主要触发关键词"
              allow-create
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="(key, index) in formData.keys"
                :key="index"
                :label="key"
                :value="key"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="关键词逻辑">
            <el-radio-group v-model="formData.keylogic">
              <el-radio label="AND">全部匹配 (AND)</el-radio>
              <el-radio label="NOT">排除 (NOT)</el-radio>
              <el-radio label="OR">任一匹配 (OR)</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="正则表达式">
            <el-input
              v-model="formData.keyregex"
              placeholder="正则表达式模式"
            />
            <div class="form-tip">
              使用正则表达式进行高级匹配。例如：/(章|节)[0-9]+/
            </div>
          </el-form-item>

          <el-form-item label="匹配深度">
            <el-input-number
              v-model="formData.depth"
              :min="0"
              :max="100"
              placeholder="扫描最近的N层聊天"
            />
            <div class="form-tip">
              0 = 永不触发, 1 = 当前消息, 2 = 当前或上一条消息, 以此类推
            </div>
          </el-form-item>

          <el-form-item label="匹配位置">
            <el-select v-model="formData.position">
              <el-option label="在世界信息之前" value="before_char" />
              <el-option label="在世界信息之后" value="after_char" />
              <el-option label="在作者注释之前" value="before_author" />
              <el-option label="在作者注释之后" value="after_author" />
              <el-option label="在系统提示词之后" value="after_system" />
            </el-select>
          </el-form-item>

          <el-form-item label="选择概率">
            <el-slider
              v-model="formData.selectiveLogic"
              :min="0"
              :max="100"
              :format-tooltip="(val: number) => `${val}%`"
            />
            <div class="form-tip">
              100% = 总是触发, 50% = 一半概率触发, 0% = 永不触发
            </div>
          </el-form-item>

          <el-form-item label="扩展关键词">
            <div class="secondary-keys">
              <div
                v-for="(keys, index) in formData.selective"
                :key="index"
                class="secondary-key-group"
              >
                <el-tag
                  v-for="key in keys"
                  :key="key"
                  closable
                  @close="removeSecondaryKey(index, key)"
                >
                  {{ key }}
                </el-tag>
                <el-input
                  v-model="newSecondaryKeys[index]"
                  @keyup.enter="addSecondaryKey(index)"
                  placeholder="输入关键词"
                  style="width: 150px"
                />
                <el-button @click="addSecondaryKeyGroup" type="primary" link>
                  添加新组
                </el-button>
              </div>
            </div>
          </el-form-item>
        </el-tab-pane>

        <!-- 高级设置标签页 -->
        <el-tab-pane label="高级设置" name="advanced">
          <el-form-item label="插入顺序">
            <el-input-number v-model="formData.insertion_order" :min="0" />
            <div class="form-tip">
              数字越小越先插入
            </div>
          </el-form-item>

          <el-form-item label="优先级">
            <el-input-number v-model="formData.priority" :min="0" :max="100" />
            <div class="form-tip">
              更高的优先级意味着更大的重要性，会在Token预算不足时优先保留
            </div>
          </el-form-item>

          <el-form-item label="位置">
            <el-select v-model="formData.position">
              <el-option label="在世界信息之前" value="before_char" />
              <el-option label="在世界信息之后" value="after_char" />
              <el-option label="在作者注释之前" value="before_author" />
              <el-option label="在作者注释之后" value="after_author" />
              <el-option label="在系统提示词之后" value="after_system" />
            </el-select>
          </el-form-item>

          <el-form-item label="章节范围">
            <div class="chapter-range">
              <el-input-number
                v-model="formData.extensions.chapter_range.start"
                placeholder="起始章节"
                :min="0"
              />
              <span>至</span>
              <el-input-number
                v-model="formData.extensions.chapter_range.end"
                placeholder="结束章节"
                :min="0"
              />
              <span>（0表示不限制）</span>
            </div>
          </el-form-item>

          <el-form-item label="角色出场">
            <el-select
              v-model="formData.extensions.character_presence"
              multiple
              placeholder="选择角色"
            >
              <el-option
                v-for="char in projectStore.currentProject?.characters || []"
                :key="char.id"
                :label="char.name"
                :value="char.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="地点访问">
            <el-select
              v-model="formData.extensions.location_visit"
              multiple
              placeholder="选择地点"
            >
              <el-option
                v-for="loc in projectStore.currentProject?.world.geography.locations || []"
                :key="loc.id"
                :label="loc.name"
                :value="loc.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="备注">
            <el-input
              v-model="formData.comment"
              type="textarea"
              :rows="3"
              placeholder="备注信息（不会注入到提示词中）"
            />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
    </el-form>

    <template #footer>
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>

  <!-- 批量导入关键词对话框 -->
  <el-dialog
    v-model="showBatchImport"
    title="批量导入关键词"
    width="500px"
  >
    <el-input
      v-model="batchImportText"
      type="textarea"
      :rows="10"
      placeholder="每行一个关键词"
    />
    <template #footer>
      <el-button @click="showBatchImport = false">取消</el-button>
      <el-button type="primary" @click="handleBatchImport">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'
import { ElMessage } from 'element-plus'
import { useWorldbookStore } from '@/stores/worldbook'
import { useProjectStore } from '@/stores/project'
import { extractKeywords } from '@/services/worldbook-ai'
import type { WorldbookEntry } from '@/types/worldbook'

interface Props {
  entry: WorldbookEntry | null
  mode: 'create' | 'edit'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  save: [entry: WorldbookEntry]
  cancel: []
}>()

const worldbookStore = useWorldbookStore()
const projectStore = useProjectStore()

const activeTab = ref('basic')
const newKeyword = ref('')
const newSecondaryKeys = ref<string[]>([])
const showBatchImport = ref(false)
const batchImportText = ref('')

const formData = ref<WorldbookEntry>({
  id: '',
  keys: [],
  key: '',
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  selective: false,
  selectiveLogic: 100,
  group: '',
  group_priority: 0,
  group_weight: 100,
  group_override: false,
  order: 0,
  insertion_order: 0,
  priority: 50,
  enabled: true,
  position: 'after_char',
  excludeRecursion: false,
  preventRecursion: false,
  depth: 4,
  keylogic: 'AND',
  keyregex: '',
  extensions: {
    chapter_range: { start: 0, end: 0 },
    character_presence: [],
    location_visit: []
  },
  created_at: Date.now(),
  updated_at: Date.now()
})

// 初始化表单数据
watch(() => props.entry, (entry) => {
  if (entry) {
    formData.value = { ...entry }
  } else {
    formData.value = {
      id: crypto.randomUUID(),
      keys: [],
      key: '',
      keysecondary: [],
      comment: '',
      content: '',
      constant: false,
      selective: false,
      selectiveLogic: 100,
      group: '',
      group_priority: 0,
      group_weight: 100,
      group_override: false,
      order: 0,
      insertion_order: worldbookStore.entryCount,
      priority: 50,
      enabled: true,
      position: 'after_char',
      excludeRecursion: false,
      preventRecursion: false,
      depth: 4,
      keylogic: 'AND',
      keyregex: '',
      extensions: {
        chapter_range: { start: 0, end: 0 },
        character_presence: [],
        location_visit: []
      },
      created_at: Date.now(),
      updated_at: Date.now()
    }
  }
}, { immediate: true })

// 计算属性
const tokenCount = computed(() => {
  const content = formData.value.content
  const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
  const englishWords = (content.match(/[a-zA-Z]+/g) || []).length
  return Math.ceil(chineseChars / 1.5 + englishWords / 4)
})

const renderedContent = computed(() => {
  return marked(formData.value.content)
})

// 方法
function addKeyword() {
  if (newKeyword.value.trim()) {
    formData.value.keys.push(newKeyword.value.trim())
    if (!formData.value.key) {
      formData.value.key = newKeyword.value.trim()
    }
    newKeyword.value = ''
  }
}

function removeKeyword(index: number) {
  formData.value.keys.splice(index, 1)
}

async function extractKeywordsFromContent() {
  try {
    const keywords = await extractKeywords(formData.value.content)
    formData.value.keys = [...new Set([...formData.value.keys, ...keywords])]
    ElMessage.success(`提取了 ${keywords.length} 个关键词`)
  } catch (error) {
    ElMessage.error('关键词提取失败')
  }
}

function handleBatchImport() {
  const keywords = batchImportText.value
    .split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0)

  formData.value.keys = [...new Set([...formData.value.keys, ...keywords])]
  showBatchImport.value = false
  batchImportText.value = ''
  ElMessage.success(`导入了 ${keywords.length} 个关键词`)
}

function addSecondaryKeyGroup() {
  formData.value.selective.push([])
  newSecondaryKeys.value.push('')
}

function addSecondaryKey(groupIndex: number) {
  const key = newSecondaryKeys.value[groupIndex]
  if (key && key.trim()) {
    formData.value.selective[groupIndex].push(key.trim())
    newSecondaryKeys.value[groupIndex] = ''
  }
}

function removeSecondaryKey(groupIndex: number, key: string) {
  const index = formData.value.selective[groupIndex].indexOf(key)
  if (index > -1) {
    formData.value.selective[groupIndex].splice(index, 1)
  }
}

function handleSave() {
  if (!formData.value.key && formData.value.keys.length > 0) {
    formData.value.key = formData.value.keys[0]
  }

  formData.value.updated_at = Date.now()

  emit('save', formData.value)
}
</script>

<style scoped lang="scss">
.content-editor {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.content-preview {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 10px;
  background: #f5f7fa;
  max-height: 300px;
  overflow-y: auto;

  .preview-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    font-weight: bold;
    border-bottom: 1px solid #dcdfe6;
    padding-bottom: 5px;
  }

  .token-count {
    font-weight: normal;
    color: #909399;
  }
}

.keywords-editor {
  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 10px;
  }

  .keywords-actions {
    display: flex;
    gap: 10px;
  }
}

.keyword-tag {
  margin: 2px;
}

.form-tip {
  color: #909399;
  font-size: 12px;
  margin-top: 5px;
}

.chapter-range {
  display: flex;
  align-items: center;
  gap: 10px;
}

.secondary-keys {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .secondary-key-group {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
}
</style>
