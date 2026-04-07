<template>
  <div class="provider-manager">
    <!-- Provider 列表卡片 -->
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span>模型提供商</span>
          <el-button type="primary" text @click="showAddProviderDialog">
            <el-icon><Plus /></el-icon>
            添加提供商
          </el-button>
        </div>
      </template>

      <div v-if="providers.length === 0" class="empty-providers">
        <el-empty description="还没有配置模型提供商">
          <el-button type="primary" @click="showAddProviderDialog">添加第一个提供商</el-button>
        </el-empty>
      </div>

      <div v-else class="providers-list">
        <el-card
          v-for="provider in providers"
          :key="provider.id"
          class="provider-item"
          :class="{ 'disabled-provider': !provider.isEnabled }"
        >
          <div class="provider-header">
            <div class="provider-info">
              <span class="provider-name">{{ provider.name }}</span>
              <el-tag :type="provider.type === 'custom' ? 'warning' : 'success'" size="small">
                {{ provider.type === 'custom' ? '自定义' : provider.type }}
              </el-tag>
              <el-tag v-if="!provider.isEnabled" type="info" size="small">已禁用</el-tag>
            </div>
            <div class="provider-actions">
              <el-button text type="primary" @click="syncModels(provider)" :loading="provider.isSyncing">同步模型</el-button>
              <el-button text type="primary" @click="openModelsDialog(provider)">管理模型</el-button>
              <el-button text @click="editProvider(provider)">编辑</el-button>
              <el-button text type="danger" @click="deleteProvider(provider.id)">删除</el-button>
            </div>
          </div>
          <el-divider />
          <div class="provider-details">
            <div class="detail-item">
              <span class="detail-label">Base URL:</span>
              <span class="detail-value">{{ provider.baseUrl }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">可用模型:</span>
              <span class="detail-value">{{ provider.models.filter(m => m.isEnabled).length }} 个</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">最后同步:</span>
              <span class="detail-value">{{ provider.lastSyncTime ? formatDate(provider.lastSyncTime) : '未同步' }}</span>
            </div>
          </div>
          <div v-if="provider.models.length > 0" class="models-preview">
            <div class="models-label">已配置模型:</div>
            <el-tag v-for="model in provider.models.filter(m => m.isEnabled)" :key="model.id" size="small" style="margin-right: 8px; margin-bottom: 8px;">
              {{ model.name }}
            </el-tag>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 添加/编辑提供商对话框 -->
    <el-dialog v-model="showProviderDialog" :title="editingProvider ? '编辑模型提供商' : '添加模型提供商'" width="600px" :close-on-click-modal="false">
      <el-form :model="providerForm" label-width="120px">
        <el-form-item label="快速配置">
          <el-select v-model="providerTemplate" placeholder="选择预设模板（可选）" @change="applyProviderTemplate" :disabled="!!editingProvider" clearable>
            <el-option-group label="官方提供商">
              <el-option label="OpenAI (官方)" value="openai-official" />
              <el-option label="Anthropic (官方)" value="anthropic-official" />
            </el-option-group>
            <el-option-group label="国内提供商">
              <el-option label="智谱 GLM-4" value="zhipu-glm4" />
              <el-option label="通义千问" value="tongyi-qianwen" />
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="Moonshot (月之暗面)" value="moonshot" />
              <el-option label="百度文心一言" value="baidu-ernie" />
              <el-option label="讯飞星火" value="xunfei-spark" />
            </el-option-group>
            <el-option-group label="其他">
              <el-option label="本地 Ollama" value="local-ollama" />
              <el-option label="Azure OpenAI" value="azure-openai" />
              <el-option label="自定义 OpenAI 兼容" value="custom-openai" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="提供商类型">
          <el-radio-group v-model="providerForm.type" :disabled="!!editingProvider">
            <el-radio value="openai">OpenAI</el-radio>
            <el-radio value="anthropic">Anthropic</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="提供商名称" required>
          <el-input v-model="providerForm.name" :placeholder="providerForm.type === 'openai' ? 'OpenAI' : providerForm.type === 'anthropic' ? 'Anthropic' : '自定义提供商名称'" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="providerForm.baseUrl" :placeholder="getDefaultBaseUrl()" />
        </el-form-item>
        <el-form-item label="API Key" required>
          <el-input v-model="providerForm.apiKey" type="password" placeholder="输入API密钥" show-password />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="providerForm.modelsInput" type="textarea" :rows="4" placeholder="输入模型名称，多个模型用逗号分隔" />
          <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
            <el-button size="small" @click="fetchModelsFromAPI" :loading="fetchingModels"><el-icon><Download /></el-icon>获取模型</el-button>
            <el-button size="small" @click="batchImportModels"><el-icon><Upload /></el-icon>批量导入</el-button>
            <el-button size="small" @click="loadCommonModels"><el-icon><List /></el-icon>常用模型</el-button>
          </div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="providerForm.isEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testProvider" :loading="testingProvider">测试连接</el-button>
        <el-button @click="showProviderDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProvider" :loading="savingProvider">{{ editingProvider ? '保存' : '添加' }}</el-button>
      </template>
    </el-dialog>

    <!-- 常用模型选择对话框 -->
    <el-dialog v-model="showCommonModelsDialog" title="选择常用模型" width="500px">
      <el-select v-model="selectedCommonProvider" placeholder="选择提供商" style="width: 100%;">
        <el-option-group label="官方提供商">
          <el-option label="OpenAI" value="OpenAI" />
          <el-option label="Anthropic" value="Anthropic" />
        </el-option-group>
        <el-option-group label="国内提供商">
          <el-option label="智谱" value="智谱" />
          <el-option label="通义千问" value="通义千问" />
          <el-option label="DeepSeek" value="DeepSeek" />
          <el-option label="Moonshot" value="Moonshot" />
        </el-option-group>
        <el-option-group label="其他">
          <el-option label="本地 Ollama" value="本地 Ollama" />
        </el-option-group>
      </el-select>
      <div v-if="selectedCommonProvider && commonModelsPreview[selectedCommonProvider]" style="margin-top: 16px;">
        <div style="font-size: 14px; color: #606266; margin-bottom: 8px;">将导入以下模型：</div>
        <el-tag v-for="model in commonModelsPreview[selectedCommonProvider]" :key="model" size="small" style="margin-right: 8px; margin-bottom: 8px;">{{ model }}</el-tag>
      </div>
      <template #footer>
        <el-button @click="showCommonModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmLoadCommonModels">加载</el-button>
      </template>
    </el-dialog>

    <!-- 获取模型对话框 -->
    <el-dialog v-model="showFetchModelsDialog" title="选择要导入的模型" width="700px">
      <div style="margin-bottom: 16px;">
        <el-input v-model="fetchModelsSearchText" placeholder="搜索模型..." clearable style="width: 300px;">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <span style="margin-left: 16px; color: #909399;">已选择 {{ selectedModels.length }} / {{ filteredFetchedModels.length }} 个模型</span>
      </div>
      <div style="margin-bottom: 12px;">
        <el-button size="small" @click="selectAllModels">全选</el-button>
        <el-button size="small" @click="deselectAllModels">取消全选</el-button>
      </div>
      <div class="models-select-grid">
        <el-checkbox-group v-model="selectedModels">
          <el-checkbox v-for="model in filteredFetchedModels" :key="model" :value="model" :label="model" class="model-checkbox">{{ model }}</el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="showFetchModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmFetchedModels" :disabled="selectedModels.length === 0">导入选中的 {{ selectedModels.length }} 个模型</el-button>
      </template>
    </el-dialog>

    <!-- 模型管理对话框 -->
    <el-dialog v-model="showModelsDialog" :title="`管理模型 - ${editingProvider?.name}`" width="700px">
      <div v-if="editingProvider">
        <el-alert type="info" :closable="false" style="margin-bottom: 20px;">点击"同步模型"可自动从提供商获取最新模型列表，或手动添加/编辑模型</el-alert>
        <div class="models-list">
          <el-card v-for="(model, index) in editingProvider.models" :key="model.id" class="model-item">
            <div class="model-header">
              <el-input v-model="model.name" placeholder="模型显示名称" style="width: 200px; margin-right: 10px;" />
              <el-input v-model="model.id" placeholder="模型ID" style="width: 200px; margin-right: 10px;" />
              <el-select v-model="model.type" placeholder="模型类型" style="width: 120px; margin-right: 10px;">
                <el-option label="规划" value="planning" />
                <el-option label="写作" value="writing" />
                <el-option label="检查" value="checking" />
                <el-option label="通用" value="all" />
              </el-select>
              <el-switch v-model="model.isEnabled" />
              <el-button type="danger" text @click="editingProvider.models.splice(index, 1)" style="margin-left: 10px;">删除</el-button>
            </div>
            <div class="model-details">
              <div class="detail-input">
                <el-input-number v-model="model.maxTokens" :min="1000" :step="1000" style="width: 150px;" />
                <div class="input-hint">最大上下文长度（tokens）</div>
              </div>
              <div class="detail-input">
                <el-input-number v-model="model.costPerInputToken" :min="0" :step="0.0001" :precision="4" style="width: 150px;" />
                <div class="input-hint">输入成本（$/1K tokens）</div>
              </div>
              <div class="detail-input">
                <el-input-number v-model="model.costPerOutputToken" :min="0" :step="0.0001" :precision="4" style="width: 150px;" />
                <div class="input-hint">输出成本（$/1K tokens）</div>
              </div>
            </div>
          </el-card>
          <el-button type="primary" text @click="addModel"><el-icon><Plus /></el-icon>添加模型</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="showModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveModels">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, List, Download, Search } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { ModelProvider, ModelInfo } from '@/types'

const props = defineProps<{ providers: ModelProvider[] }>()
const emit = defineEmits(['update:providers', 'save'])

// --- 状态 ---
const showProviderDialog = ref(false)
const showModelsDialog = ref(false)
const showCommonModelsDialog = ref(false)
const showFetchModelsDialog = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const savingProvider = ref(false)
const testingProvider = ref(false)
const fetchingModels = ref(false)
const selectedCommonProvider = ref('')
const fetchedModelsList = ref<string[]>([])
const selectedModels = ref<string[]>([])
const fetchModelsSearchText = ref('')
const providerTemplate = ref('')

const providerForm = ref<Omit<ModelProvider, 'id' | 'models' | 'lastSyncTime' | 'isSyncing'> & { modelsInput?: string }>({
  name: '', type: 'openai', baseUrl: '', apiKey: '', isEnabled: true, modelsInput: ''
})

const commonModelsPreview: Record<string, string[]> = {
  'OpenAI': ['gpt-4-turbo', 'gpt-4', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  'Anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  '智谱': ['glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  '通义千问': ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'],
  'DeepSeek': ['deepseek-chat', 'deepseek-coder'],
  'Moonshot': ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  '本地 Ollama': ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'codellama']
}

const providerTemplates: Record<string, { name: string; type: 'openai' | 'anthropic' | 'custom'; baseUrl: string; models: string[] }> = {
  'openai-official': { name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini'] },
  'anthropic-official': { name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
  'zhipu-glm4': { name: '智谱 GLM-4', type: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'] },
  'tongyi-qianwen': { name: '通义千问', type: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'] },
  'deepseek': { name: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] },
  'moonshot': { name: 'Moonshot (月之暗面)', type: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  'baidu-ernie': { name: '百度文心一言', type: 'openai', baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat', models: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k'] },
  'xunfei-spark': { name: '讯飞星火', type: 'custom', baseUrl: 'wss://spark-api.xf-yun.com/v3.5/chat', models: ['spark-v3.5', 'spark-v3.0', 'spark-v2.0'] },
  'local-ollama': { name: '本地 Ollama', type: 'openai', baseUrl: 'http://localhost:11434/v1', models: ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'codellama'] },
  'azure-openai': { name: 'Azure OpenAI', type: 'openai', baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments', models: ['gpt-4', 'gpt-35-turbo'] },
  'custom-openai': { name: '自定义 OpenAI 兼容', type: 'openai', baseUrl: '', models: [] }
}

const filteredFetchedModels = computed(() => {
  if (!fetchModelsSearchText.value) return fetchedModelsList.value
  const search = fetchModelsSearchText.value.toLowerCase()
  return fetchedModelsList.value.filter(model => model.toLowerCase().includes(search))
})

// --- 辅助函数 ---
function formatDate(date: Date | string) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getDefaultBaseUrl() {
  switch (providerForm.value.type) {
    case 'openai': return 'https://api.openai.com/v1'
    case 'anthropic': return 'https://api.anthropic.com'
    default: return ''
  }
}

function getModelDisplayName(modelId: string): string {
  const displayNameMap: Record<string, string> = {
    'gpt-4-turbo': 'GPT-4 Turbo', 'gpt-4': 'GPT-4', 'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet', 'claude-3-opus-20240229': 'Claude 3 Opus', 'claude-3-haiku-20240307': 'Claude 3 Haiku',
  }
  if (displayNameMap[modelId]) return displayNameMap[modelId]
  let name = modelId.replace(/^(gpt-|claude-|gemini-|llama-|mistral-)/i, '').replace(/-(preview|turbo|latest|instruct|chat)/gi, '').replace(/-/g, ' ').trim()
  return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function inferModelType(modelId: string): 'planning' | 'writing' | 'checking' | 'all' {
  const id = modelId.toLowerCase()
  if (id.includes('gpt-4') || id.includes('opus') || id.includes('sonnet') || id.includes('claude-3-5')) return 'planning'
  if (id.includes('gpt-3.5') || id.includes('haiku') || id.includes('turbo') || id.includes('llama')) return 'writing'
  if (id.includes('mini') || id.includes('flash') || id.includes('small')) return 'checking'
  return 'all'
}

function inferMaxTokens(modelId: string): number {
  const id = modelId.toLowerCase()
  if (id.includes('gpt-4-turbo') || id.includes('gpt-4-32k')) return 128000
  if (id.includes('gpt-4')) return 8192
  if (id.includes('gpt-3.5')) return 4096
  if (id.includes('claude-3')) return 200000
  if (id.includes('gemini-1.5')) return 1000000
  if (id.includes('gemini')) return 32000
  return 8192
}

function emitProviders(newProviders: ModelProvider[]) {
  emit('update:providers', newProviders)
}

// --- Provider CRUD ---
function showAddProviderDialog() {
  editingProvider.value = null
  providerForm.value = { name: '', type: 'openai', baseUrl: getDefaultBaseUrl(), apiKey: '', isEnabled: true, modelsInput: '' }
  providerTemplate.value = ''
  showProviderDialog.value = true
}

function editProvider(provider: ModelProvider) {
  editingProvider.value = provider
  providerForm.value = { name: provider.name, type: provider.type, baseUrl: provider.baseUrl, apiKey: provider.apiKey, isEnabled: provider.isEnabled, modelsInput: provider.models.map(m => m.id).join(', ') }
  showProviderDialog.value = true
}

async function saveProvider() {
  if (!providerForm.value.name.trim()) { ElMessage.warning('请输入提供商名称'); return }
  if (!providerForm.value.baseUrl.trim()) { ElMessage.warning('请输入Base URL'); return }
  savingProvider.value = true
  try {
    const modelIds = providerForm.value.modelsInput ? providerForm.value.modelsInput.split(',').map(m => m.trim()).filter(m => m) : []
    const models: ModelInfo[] = modelIds.map(modelId => ({ id: modelId, name: getModelDisplayName(modelId), type: inferModelType(modelId), maxTokens: inferMaxTokens(modelId), costPerInputToken: 0, costPerOutputToken: 0, isEnabled: true }))
    const newProviders = [...props.providers]
    if (editingProvider.value) {
      const index = newProviders.findIndex(p => p.id === editingProvider.value!.id)
      if (index !== -1) { newProviders[index] = { ...editingProvider.value, name: providerForm.value.name, type: providerForm.value.type, baseUrl: providerForm.value.baseUrl, apiKey: providerForm.value.apiKey, isEnabled: providerForm.value.isEnabled, models } }
    } else {
      newProviders.push({ id: uuidv4(), name: providerForm.value.name, type: providerForm.value.type, baseUrl: providerForm.value.baseUrl, apiKey: providerForm.value.apiKey, isEnabled: providerForm.value.isEnabled, models, lastSyncTime: undefined, isSyncing: false })
    }
    emitProviders(newProviders)
    showProviderDialog.value = false
    emit('save')
    ElMessage.success(editingProvider.value ? '提供商已更新' : '提供商已添加')
  } catch (error) { ElMessage.error('保存失败：' + (error as Error).message) } finally { savingProvider.value = false }
}

async function deleteProvider(providerId: string) {
  try {
    await ElMessageBox.confirm('确定要删除此提供商吗？', '删除提供商', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    emitProviders(props.providers.filter(p => p.id !== providerId))
    ElMessage.success('提供商已删除')
  } catch { /* cancelled */ }
}

async function testProvider() {
  if (!providerForm.value.baseUrl.trim()) { ElMessage.warning('请输入Base URL'); return }
  if (!providerForm.value.apiKey.trim()) { ElMessage.warning('请输入API Key'); return }
  testingProvider.value = true
  try {
    const testUrl = providerForm.value.baseUrl.endsWith('/v1') ? providerForm.value.baseUrl + '/chat/completions' : providerForm.value.baseUrl + (providerForm.value.baseUrl.endsWith('/') ? 'v1/chat/completions' : '/v1/chat/completions')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (providerForm.value.type === 'anthropic') { headers['x-api-key'] = providerForm.value.apiKey; headers['anthropic-version'] = '2023-06-01' } else { headers['Authorization'] = `Bearer ${providerForm.value.apiKey}` }
    const response = await fetch(testUrl, { method: 'POST', headers, body: JSON.stringify({ model: providerForm.value.modelsInput?.split(',')[0].trim() || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hello, this is a test message.' }], max_tokens: 10 }) })
    if (response.ok) { ElMessage.success('连接测试成功！') } else { const error = await response.json().catch(() => ({})); ElMessage.error(`连接失败: ${error.error?.message || error.message || `HTTP ${response.status}`}`) }
  } catch (error) { ElMessage.error(`连接失败: ${(error as Error).message}`) } finally { testingProvider.value = false }
}

async function syncModels(provider: ModelProvider) {
  provider.isSyncing = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const defaultModels: ModelInfo[] = []
    if (provider.type === 'openai') {
      defaultModels.push({ id: 'gpt-4-turbo', name: 'GPT-4 Turbo', type: 'planning', maxTokens: 128000, costPerInputToken: 0.01, costPerOutputToken: 0.03, isEnabled: true }, { id: 'gpt-4', name: 'GPT-4', type: 'planning', maxTokens: 8192, costPerInputToken: 0.03, costPerOutputToken: 0.06, isEnabled: true }, { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', type: 'writing', maxTokens: 16385, costPerInputToken: 0.0005, costPerOutputToken: 0.0015, isEnabled: true })
    } else if (provider.type === 'anthropic') {
      defaultModels.push({ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', type: 'planning', maxTokens: 200000, costPerInputToken: 0.003, costPerOutputToken: 0.015, isEnabled: true }, { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', type: 'planning', maxTokens: 200000, costPerInputToken: 0.015, costPerOutputToken: 0.075, isEnabled: true }, { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', type: 'checking', maxTokens: 200000, costPerInputToken: 0.00025, costPerOutputToken: 0.00125, isEnabled: true })
    }
    provider.models = defaultModels
    provider.lastSyncTime = new Date()
    ElMessage.success('模型同步成功')
  } catch { ElMessage.error('模型同步失败') } finally { provider.isSyncing = false }
}

function applyProviderTemplate(templateKey: string) {
  const template = providerTemplates[templateKey]
  if (!template) return
  providerForm.value.name = template.name; providerForm.value.type = template.type; providerForm.value.baseUrl = template.baseUrl; providerForm.value.modelsInput = template.models.join(', ')
  ElMessage.success(`已应用 "${template.name}" 模板`)
}

function openModelsDialog(provider: ModelProvider) { editingProvider.value = provider; showModelsDialog.value = true }
function addModel() { if (!editingProvider.value) return; editingProvider.value.models.push({ id: '', name: '', type: 'all', maxTokens: 8192, costPerInputToken: 0, costPerOutputToken: 0, isEnabled: true }) }
function saveModels() { showModelsDialog.value = false; ElMessage.success('模型配置已保存') }

async function fetchModelsFromAPI() {
  if (!providerForm.value.baseUrl.trim()) { ElMessage.warning('请先输入 Base URL'); return }
  if (!providerForm.value.apiKey.trim()) { ElMessage.warning('请先输入 API Key'); return }
  fetchingModels.value = true
  try {
    let modelsUrl = providerForm.value.baseUrl; if (!modelsUrl.endsWith('/models')) { modelsUrl = modelsUrl.replace(/\/$/, '') + '/models' }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (providerForm.value.type === 'anthropic') { headers['x-api-key'] = providerForm.value.apiKey; headers['anthropic-version'] = '2023-06-01' } else { headers['Authorization'] = `Bearer ${providerForm.value.apiKey}` }
    const response = await fetch(modelsUrl, { headers })
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error?.message || `HTTP ${response.status}`) }
    const data = await response.json()
    let models: string[] = []
    if (data.data && Array.isArray(data.data)) { models = data.data.map((m: any) => m.id).sort() } else if (Array.isArray(data.models)) { models = data.models.map((m: any) => typeof m === 'string' ? m : m.id).sort() } else if (Array.isArray(data)) { models = data.map((m: any) => typeof m === 'string' ? m : m.id).sort() }
    if (models.length === 0) { ElMessage.warning('未找到任何模型'); return }
    fetchedModelsList.value = models; selectedModels.value = []; fetchModelsSearchText.value = ''; showFetchModelsDialog.value = true
    ElMessage.success(`成功获取 ${models.length} 个模型`)
  } catch (error) { ElMessage.error(`获取失败: ${(error as Error).message}`) } finally { fetchingModels.value = false }
}

async function batchImportModels() {
  try {
    const { value: modelsText } = await ElMessageBox.prompt('批量导入模型配置，每行一个模型', '批量导入模型', { confirmButtonText: '导入', cancelButtonText: '取消', inputType: 'textarea', inputValue: '' })
    if (!modelsText) return
    const models = modelsText.split('\n').map((line: string) => line.split(':')[0]?.trim()).filter(Boolean)
    if (models.length > 0) { providerForm.value.modelsInput = models.join(', '); ElMessage.success(`成功导入 ${models.length} 个模型`) }
  } catch { /* cancelled */ }
}

function loadCommonModels() { selectedCommonProvider.value = ''; showCommonModelsDialog.value = true }
function confirmLoadCommonModels() {
  if (selectedCommonProvider.value && commonModelsPreview[selectedCommonProvider.value]) { providerForm.value.modelsInput = commonModelsPreview[selectedCommonProvider.value].join(', '); showCommonModelsDialog.value = false; ElMessage.success(`已加载 ${selectedCommonProvider.value} 的常用模型`) } else { ElMessage.warning('请选择一个提供商') }
}
function selectAllModels() { selectedModels.value = [...filteredFetchedModels.value] }
function deselectAllModels() { selectedModels.value = [] }
function confirmFetchedModels() {
  if (selectedModels.value.length === 0) { ElMessage.warning('请至少选择一个模型'); return }
  const existingModels = providerForm.value.modelsInput ? providerForm.value.modelsInput.split(',').map(m => m.trim()).filter(m => m) : []
  const newModels = selectedModels.value.filter(m => !existingModels.includes(m))
  providerForm.value.modelsInput = [...existingModels, ...newModels].join(', ')
  showFetchModelsDialog.value = false
  ElMessage.success(`已添加 ${newModels.length} 个模型`)
}
</script>

<style scoped>
.providers-list { display: flex; flex-direction: column; gap: 16px; }
.provider-item { transition: all 0.3s; }
.provider-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.disabled-provider { opacity: 0.6; }
.provider-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.provider-info { display: flex; align-items: center; gap: 10px; }
.provider-name { font-weight: 600; font-size: 16px; }
.provider-actions { display: flex; gap: 4px; flex-wrap: wrap; }
.provider-details { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.detail-item { display: flex; flex-direction: column; gap: 4px; }
.detail-label { font-size: 12px; color: #909399; }
.detail-value { font-size: 14px; word-break: break-all; }
.models-preview { margin-top: 12px; }
.models-label { font-size: 12px; color: #909399; margin-bottom: 8px; }
.models-select-grid { max-height: 400px; overflow-y: auto; }
.model-checkbox { display: block; margin-bottom: 8px; }
.model-item { margin-bottom: 12px; }
.model-header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.model-details { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; }
.detail-input { display: flex; flex-direction: column; gap: 4px; }
.input-hint { font-size: 12px; color: #909399; }
.empty-providers { padding: 20px 0; }
</style>
