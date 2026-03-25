<template>
  <div class="project-config">
    <el-card class="header-card">
      <div class="header">
        <h2>项目配置</h2>
        <el-button type="primary" @click="saveConfig">保存配置</el-button>
      </div>
    </el-card>

    <div class="content">
      <!-- 模型提供商配置 -->
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

        <div v-if="configForm.providers.length === 0" class="empty-providers">
          <el-empty description="还没有配置模型提供商">
            <el-button type="primary" @click="showAddProviderDialog">添加第一个提供商</el-button>
          </el-empty>
        </div>

        <div v-else class="providers-list">
          <el-card
            v-for="provider in configForm.providers"
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
                <el-button text type="primary" @click="syncModels(provider)" :loading="provider.isSyncing">
                  同步模型
                </el-button>
                <el-button text type="primary" @click="openModelsDialog(provider)">
                  管理模型
                </el-button>
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
              <el-tag
                v-for="model in provider.models.filter(m => m.isEnabled)"
                :key="model.id"
                size="small"
                style="margin-right: 8px; margin-bottom: 8px;"
              >
                {{ model.name }}
              </el-tag>
            </div>
          </el-card>
        </div>
      </el-card>

      <!-- AI模型选择 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>AI模型选择</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="规划模型">
            <el-select v-model="configForm.planningModel" placeholder="选择规划模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('planning')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于世界观、人物、大纲等高层规划</div>
          </el-form-item>

          <el-form-item label="写作模型">
            <el-select v-model="configForm.writingModel" placeholder="选择写作模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('writing')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于章节内容的生成</div>
          </el-form-item>

          <el-form-item label="检查模型">
            <el-select v-model="configForm.checkingModel" placeholder="选择检查模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('checking')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于质量检查、一致性验证</div>
          </el-form-item>

          <el-form-item label="助手模型">
            <el-select v-model="configForm.assistantModel" placeholder="选择助手模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('all')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于AI助手对话，帮助作者创作</div>
          </el-form-item>

          <el-form-item label="表格记忆模型">
            <el-select v-model="configForm.memoryModel" placeholder="选择表格记忆模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('all')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于表格记忆的自动填写和更新，需要较强的结构化理解能力</div>
          </el-form-item>

          <el-form-item label="导入识别模型">
            <el-select v-model="configForm.importModel" placeholder="选择导入识别模型" :disabled="!hasEnabledProviders">
              <el-option
                v-for="model in getAvailableModels('all')"
                :key="model.id"
                :label="`${model.providerName} - ${model.name}`"
                :value="model.id"
              >
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ model.providerName }} - {{ model.name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ model.maxTokens }}K tokens</span>
                </div>
              </el-option>
            </el-select>
            <div class="form-tip">用于小说导入时的人物、世界观、大纲智能识别，推荐使用高性能模型</div>
          </el-form-item>

          <el-alert v-if="!hasEnabledProviders" type="warning" :closable="false" show-icon>
            <template #title>
              请先配置模型提供商
            </template>
            <div>在上方"模型提供商"部分添加至少一个提供商后，才能选择模型</div>
          </el-alert>

          <el-alert v-else type="info" :closable="false" show-icon>
            <template #title>
              分层模型策略可节省约89%的成本
            </template>
            <div>规划模型用于高层决策，写作模型生成内容，检查模型验证质量，助手模型提供创作建议，表格记忆模型自动维护记忆表格</div>
          </el-alert>
        </el-form>
      </el-card>

      <!-- 系统提示词配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>系统提示词</span>
            <el-button text @click="resetSystemPrompts">
              <el-icon><Refresh /></el-icon>
              恢复默认
            </el-button>
          </div>
        </template>

        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px;">
          <template #title>
            为每种模型设置专属角色提示词
          </template>
          <div>系统提示词会在每次调用AI时作为角色定义发送，让AI更好地理解其职责</div>
        </el-alert>

        <el-tabs v-model="activePromptTab">
          <el-tab-pane label="规划模型" name="planning">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.planning"
                type="textarea"
                :rows="10"
                placeholder="规划模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.planning" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="写作模型" name="writing">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.writing"
                type="textarea"
                :rows="10"
                placeholder="写作模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.writing" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="检查模型" name="checking">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.checking"
                type="textarea"
                :rows="10"
                placeholder="检查模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.checking" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="助手模型" name="assistant">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.assistant"
                type="textarea"
                :rows="10"
                placeholder="助手模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.assistant" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="表格记忆模型" name="memory">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.memory"
                type="textarea"
                :rows="10"
                placeholder="表格记忆模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.memory" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <!-- 生成预设 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>生成预设</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="预设模式">
            <el-radio-group v-model="configForm.preset">
              <el-radio value="fast">
                <div class="radio-label">
                  <div class="label-title">快速模式</div>
                  <div class="label-desc">生成速度快，成本较低，适合初稿</div>
                </div>
              </el-radio>
              <el-radio value="standard">
                <div class="radio-label">
                  <div class="label-title">标准模式</div>
                  <div class="label-desc">平衡质量与速度，适合日常创作</div>
                </div>
              </el-radio>
              <el-radio value="quality">
                <div class="radio-label">
                  <div class="label-title">质量模式</div>
                  <div class="label-desc">最高质量，成本较高，适合重要章节</div>
                </div>
              </el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 插件管理 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>插件管理</span>
            <el-button type="primary" text @click="openPluginManager">
              <el-icon><Grid /></el-icon>
              管理插件
            </el-button>
          </div>
        </template>

        <el-alert type="info" :closable="false" style="margin-bottom: 20px;">
          <div>插件可以扩展应用功能，包括AI提供商、导出格式、数据处理等</div>
        </el-alert>

        <el-row :gutter="20">
          <el-col :span="6">
            <el-statistic title="已安装插件" :value="pluginStats.total" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="已启用插件" :value="pluginStats.active" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="AI提供商" :value="pluginStats.providers" />
          </el-col>
          <el-col :span="6">
            <el-statistic title="导出格式" :value="pluginStats.exporters" />
          </el-col>
        </el-row>

        <el-divider />

        <div class="plugin-actions">
          <el-button @click="openPluginManager">
            <el-icon><Setting /></el-icon>
            管理插件
          </el-button>
          <el-button @click="showInstallPluginDialog">
            <el-icon><Download /></el-icon>
            安装新插件
          </el-button>
          <el-button @click="refreshPlugins">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </el-card>

      <!-- 思考深度 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>思考深度</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="规划深度">
            <el-radio-group v-model="configForm.planningDepth">
              <el-radio value="shallow">浅层规划</el-radio>
              <el-radio value="medium">中等规划</el-radio>
              <el-radio value="deep">深度规划</el-radio>
            </el-radio-group>
            <div class="form-tip">影响世界观、大纲等规划的详细程度</div>
          </el-form-item>

          <el-form-item label="写作深度">
            <el-radio-group v-model="configForm.writingDepth">
              <el-radio value="fast">快速写作</el-radio>
              <el-radio value="standard">标准写作</el-radio>
              <el-radio value="detailed">详细写作</el-radio>
            </el-radio-group>
            <div class="form-tip">影响章节内容的丰富程度</div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 质量检查 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>质量检查</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="启用质量检查">
            <el-switch v-model="configForm.enableQualityCheck" />
          </el-form-item>

          <el-form-item v-if="configForm.enableQualityCheck" label="质量阈值">
            <div style="width: 100%;">
              <el-slider
                v-model="configForm.qualityThreshold"
                :min="1"
                :max="10"
                :marks="qualityMarks"
                show-stops
              />
              <div class="form-tip" style="margin-top: 12px;">
                低于此分数的章节将被标记需要修订
              </div>
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 成本控制 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>成本控制</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="每章最大成本">
            <el-input-number
              v-model="configForm.maxCostPerChapter"
              :min="0.01"
              :max="1"
              :step="0.01"
              :precision="2"
            />
            <span style="margin-left: 10px;">美元</span>
            <div class="form-tip">单个章节的API调用成本上限</div>
          </el-form-item>

          <el-form-item label="预计成本">
            <el-statistic :value="estimatedCost" :precision="2">
              <template #suffix>美元</template>
            </el-statistic>
            <div class="form-tip">
              基于{{ project?.targetWords || 0 }}字目标，估算总成本
            </div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 成本统计 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>成本统计</span>
            <el-button text @click="resetCostStats">
              <el-icon><Refresh /></el-icon>
              重置统计
            </el-button>
          </div>
        </template>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-statistic title="总调用次数" :value="costStats.totalCalls">
              <template #suffix>次</template>
            </el-statistic>
          </el-col>
          <el-col :span="8">
            <el-statistic title="总输入Token" :value="costStats.totalInputTokens">
              <template #suffix>K</template>
            </el-statistic>
          </el-col>
          <el-col :span="8">
            <el-statistic title="总输出Token" :value="costStats.totalOutputTokens">
              <template #suffix>K</template>
            </el-statistic>
          </el-col>
        </el-row>

        <el-divider />

        <el-row :gutter="20">
          <el-col :span="12">
            <el-statistic title="总成本" :value="costStats.totalCost" :precision="4">
              <template #suffix>美元</template>
            </el-statistic>
          </el-col>
          <el-col :span="12">
            <el-statistic title="平均章节成本" :value="averageChapterCost" :precision="4">
              <template #suffix>美元</template>
            </el-statistic>
          </el-col>
        </el-row>

        <el-alert type="info" :closable="false" style="margin-top: 20px;">
          <template #title>
            成本统计基于实际API调用记录
          </template>
          <div>每次章节生成都会记录实际的token使用量和成本</div>
        </el-alert>
      </el-card>

      <!-- AI建议 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>AI建议</span>
          </div>
        </template>

        <el-form :model="configForm" label-width="150px">
          <el-form-item label="启用AI建议">
            <el-switch v-model="configForm.enableAISuggestions" />
          </el-form-item>

          <el-alert v-if="configForm.enableAISuggestions" type="info" :closable="false" show-icon>
            <template #title>
              AI会在章节生成后提供改进建议
            </template>
            <div>包括情节建议、人物塑造、文笔优化等方面</div>
          </el-alert>
        </el-form>
      </el-card>

      <!-- 向量检索配置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>向量检索</span>
            <el-switch v-model="vectorConfig.enabled" />
          </div>
        </template>

        <el-form :model="vectorConfig" label-width="150px" :disabled="!vectorConfig.enabled">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 20px;">
            <template #title>
              语义搜索和智能上下文检索
            </template>
            <div>使用向量检索技术自动查找与当前章节相关的历史内容，提高长篇小说的连贯性</div>
          </el-alert>

          <el-form-item label="嵌入服务">
            <el-radio-group v-model="vectorConfig.provider">
              <el-radio value="local">本地模型</el-radio>
              <el-radio value="openai">OpenAI</el-radio>
            </el-radio-group>
            <div class="form-tip">
              本地模型：免费，隐私性好，首次使用需下载模型（约 50MB）<br>
              OpenAI：高质量，需 API Key 和网络连接，产生费用
            </div>
          </el-form-item>

          <el-form-item v-if="vectorConfig.provider === 'openai'" label="OpenAI API Key">
            <el-input
              v-model="vectorConfig.apiKey"
              type="password"
              placeholder="sk-..."
              show-password
            />
            <div class="form-tip">用于 OpenAI Embeddings API 的 API Key</div>
          </el-form-item>

          <el-form-item v-if="vectorConfig.provider === 'openai'" label="嵌入模型">
            <el-select v-model="vectorConfig.model" placeholder="选择嵌入模型">
              <el-option label="text-embedding-3-small (推荐)" value="text-embedding-3-small" />
              <el-option label="text-embedding-3-large" value="text-embedding-3-large" />
              <el-option label="text-embedding-ada-002" value="text-embedding-ada-002" />
            </el-select>
            <div class="form-tip">small: 1536维，性价比高；large: 3072维，质量更高</div>
          </el-form-item>

          <el-form-item v-if="vectorConfig.provider === 'local'" label="本地模型">
            <el-select v-model="vectorConfig.model" placeholder="选择本地模型">
              <el-option label="BGE Small (中文最强，极速版)" value="Xenova/bge-small-zh-v1.5" />
              <el-option label="all-MiniLM-L6-v2 (推荐，384维)" value="Xenova/all-MiniLM-L6-v2" />
              <el-option label="all-mpnet-base-v2 (768维)" value="Xenova/all-mpnet-base-v2" />
              <el-option label="paraphrase-multilingual-MiniLM-L12-v2 (多语言)" value="Xenova/paraphrase-multilingual-MiniLM-L12-v2" />
            </el-select>
            <div class="form-tip">完全离线运行，无需联网！(首次需要在后台执行 node 下载脚本)</div>
          </el-form-item>

          <el-form-item label="检索数量">
            <el-slider
              v-model="vectorConfig.topK"
              :min="3"
              :max="20"
              :step="1"
              show-input
            />
            <div class="form-tip">每次检索返回的相关文档数量，建议 5-10</div>
          </el-form-item>

          <el-form-item label="相似度阈值">
            <el-slider
              v-model="vectorConfig.minScore"
              :min="0"
              :max="1"
              :step="0.05"
              :format-tooltip="(val: number) => `${(val * 100).toFixed(0)}%`"
              show-input
            />
            <div class="form-tip">只返回相似度高于此阈值的结果，建议 0.5-0.7</div>
          </el-form-item>

          <el-form-item label="混合搜索权重">
            <el-slider
              v-model="vectorConfig.vectorWeight"
              :min="0"
              :max="1"
              :step="0.1"
              :format-tooltip="(val: number) => `向量 ${((val) * 100).toFixed(0)}% / 关键词 ${((1-val) * 100).toFixed(0)}%`"
              show-input
            />
            <div class="form-tip">向量搜索和关键词搜索的权重比例，建议向量 0.7</div>
          </el-form-item>

          <el-form-item label="索引状态">
            <div v-if="vectorIndexStatus">
              <el-tag :type="vectorIndexStatus.indexed ? 'success' : 'info'">
                {{ vectorIndexStatus.indexed ? '已索引' : '未索引' }}
              </el-tag>
              <span style="margin-left: 12px; color: #606266;">
                {{ vectorIndexStatus.documentCount }} 个文档
              </span>
            </div>
            <div v-else style="color: #909399;">未初始化</div>
          </el-form-item>

          <el-form-item>
            <el-button @click="rebuildVectorIndex" :loading="rebuildingIndex" :disabled="!vectorConfig.enabled">
              重建索引
            </el-button>
            <el-button @click="clearVectorIndex" :disabled="!vectorConfig.enabled">
              清空索引
            </el-button>
            <div class="form-tip">重建索引会重新处理所有章节内容，可能需要一些时间</div>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 高级设置 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>高级设置</span>
            <el-button text @click="showAdvanced = !showAdvanced">
              {{ showAdvanced ? '收起' : '展开' }}
              <el-icon>
                <component :is="showAdvanced ? 'ArrowUp' : 'ArrowDown'" />
              </el-icon>
            </el-button>
          </div>
        </template>

        <el-collapse-transition>
          <div v-show="showAdvanced">
            <el-form :model="advancedConfig" label-width="150px">
              <el-form-item label="温度系数">
                <el-slider
                  v-model="advancedConfig.temperature"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  show-input
                />
                <div class="form-tip">控制生成的随机性，0=确定性，2=最大随机性。推荐值：0.7-1.0</div>
              </el-form-item>

              <el-form-item label="Top P">
                <el-slider
                  v-model="advancedConfig.topP"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  show-input
                />
                <div class="form-tip">核采样参数。推荐值：0.9-1.0</div>
              </el-form-item>

              <el-form-item label="最大Token数 (输出)">
                <el-input-number
                  v-model="advancedConfig.maxTokens"
                  :min="100"
                  :max="128000"
                  :step="100"
                />
                <div class="form-tip">单次生成（回复）的最大token数。请根据模型能力设置。</div>
              </el-form-item>

              <el-form-item label="最大上下文 (输入)">
                <el-input-number
                  v-model="advancedConfig.maxContextTokens"
                  :min="4000"
                  :max="200000"
                  :step="1000"
                />
                <div class="form-tip">投喂给大模型的最大历史上下文 Token 数量（如 8192 或 128000）。</div>
              </el-form-item>

              <el-form-item label="单章预期字数">
                <el-input-number
                  v-model="advancedConfig.targetWordCount"
                  :min="500"
                  :max="10000"
                  :step="500"
                />
                <div class="form-tip">每次 AI 写作时的目标字数，系统将作为 Prompt 要求发送。</div>
              </el-form-item>

              <el-form-item label="附带前文章节数">
                <el-input-number
                  v-model="advancedConfig.recentChaptersCount"
                  :min="1"
                  :max="20"
                  :step="1"
                />
                <div class="form-tip">生成新章节时，连同最近的几章原文一起发送给 AI 以保证连贯性。</div>
              </el-form-item>

              <el-form-item label="频率惩罚">
                <el-slider
                  v-model="advancedConfig.frequencyPenalty"
                  :min="-2"
                  :max="2"
                  :step="0.1"
                  show-input
                />
                <div class="form-tip">降低重复相同内容的概率。-2到2，推荐值：0-0.5</div>
              </el-form-item>

              <el-form-item label="存在惩罚">
                <el-slider
                  v-model="advancedConfig.presencePenalty"
                  :min="-2"
                  :max="2"
                  :step="0.1"
                  show-input
                />
                <div class="form-tip">降低讨论新话题的概率。-2到2，推荐值：0-0.5</div>
              </el-form-item>

              <el-form-item label="停止序列">
                <el-select
                  v-model="advancedConfig.stopSequences"
                  multiple
                  filterable
                  allow-create
                  placeholder="输入停止序列（可选）"
                  style="width: 100%;"
                />
                <div class="form-tip">遇到这些序列时停止生成。通常留空即可</div>
              </el-form-item>
            </el-form>
          </div>
        </el-collapse-transition>
      </el-card>

      <!-- 配置管理 -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>配置管理</span>
          </div>
        </template>

        <el-form label-width="150px">
          <el-form-item label="导出配置">
            <el-button @click="exportConfig">导出为文件</el-button>
            <div class="form-tip">将当前配置导出为JSON文件，可在其他项目导入使用</div>
          </el-form-item>

          <el-form-item label="导入配置">
            <el-upload
              :show-file-list="false"
              :before-upload="importConfig"
              accept=".json"
            >
              <el-button>从文件导入</el-button>
            </el-upload>
            <div class="form-tip">从JSON文件导入配置，会覆盖当前配置</div>
          </el-form-item>

          <el-form-item label="重置配置">
            <el-popconfirm
              title="确定要重置为默认配置吗？"
              @confirm="resetConfig"
            >
              <template #reference>
                <el-button type="danger">重置为默认</el-button>
              </template>
            </el-popconfirm>
            <div class="form-tip">恢复所有配置为默认值，此操作不可恢复</div>
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <!-- 添加/编辑提供商对话框 -->
    <el-dialog
      v-model="showProviderDialog"
      :title="editingProvider ? '编辑模型提供商' : '添加模型提供商'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="providerForm" label-width="120px">
        <el-form-item label="快速配置">
          <el-select
            v-model="providerTemplate"
            placeholder="选择预设模板（可选）"
            @change="applyProviderTemplate"
            :disabled="!!editingProvider"
            clearable
          >
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
          <div class="form-tip">选择预设模板可快速填充配置信息</div>
        </el-form-item>

        <el-form-item label="提供商类型">
          <el-radio-group v-model="providerForm.type" :disabled="!!editingProvider">
            <el-radio value="openai">OpenAI</el-radio>
            <el-radio value="anthropic">Anthropic</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="提供商名称" required>
          <el-input
            v-model="providerForm.name"
            :placeholder="providerForm.type === 'openai' ? 'OpenAI' : providerForm.type === 'anthropic' ? 'Anthropic' : '自定义提供商名称'"
          />
        </el-form-item>

        <el-form-item label="Base URL" required>
          <el-input
            v-model="providerForm.baseUrl"
            :placeholder="getDefaultBaseUrl()"
          />
          <div class="form-tip">
            {{ providerForm.type === 'openai' ? 'OpenAI API地址，默认: https://api.openai.com/v1' :
               providerForm.type === 'anthropic' ? 'Anthropic API地址，默认: https://api.anthropic.com' :
               '自定义API地址，如: http://localhost:11434/v1' }}
          </div>
        </el-form-item>

        <el-form-item label="API Key" required>
          <el-input
            v-model="providerForm.apiKey"
            type="password"
            placeholder="输入API密钥"
            show-password
          />
          <div class="form-tip">
            {{ providerForm.type === 'openai' ? '从 platform.openai.com 获取' :
               providerForm.type === 'anthropic' ? '从 console.anthropic.com 获取' :
               '自定义API的认证密钥（可选）' }}
          </div>
        </el-form-item>

        <el-form-item label="模型名称">
          <el-input
            v-model="providerForm.modelsInput"
            type="textarea"
            :rows="4"
            placeholder="输入模型名称，多个模型用逗号分隔，如：gpt-4-turbo, gpt-3.5-turbo, gpt-4"
          />
          <div class="form-tip">
            可手动输入模型名称，或点击"获取模型"按钮从API自动获取。多个模型用逗号分隔
          </div>
          <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
            <el-button size="small" @click="fetchModelsFromAPI" :loading="fetchingModels">
              <el-icon><Download /></el-icon>
              获取模型
            </el-button>
            <el-button size="small" @click="batchImportModels">
              <el-icon><Upload /></el-icon>
              批量导入
            </el-button>
            <el-button size="small" @click="loadCommonModels">
              <el-icon><List /></el-icon>
              常用模型
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="启用状态">
          <el-switch v-model="providerForm.isEnabled" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="testProvider" :loading="testingProvider">测试连接</el-button>
        <el-button @click="showProviderDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProvider" :loading="savingProvider">
          {{ editingProvider ? '保存' : '添加' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 常用模型选择对话框 -->
    <el-dialog
      v-model="showCommonModelsDialog"
      title="选择常用模型"
      width="500px"
    >
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
        <el-tag
          v-for="model in commonModelsPreview[selectedCommonProvider]"
          :key="model"
          size="small"
          style="margin-right: 8px; margin-bottom: 8px;"
        >
          {{ model }}
        </el-tag>
      </div>
      <template #footer>
        <el-button @click="showCommonModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmLoadCommonModels">加载</el-button>
      </template>
    </el-dialog>

    <!-- 获取模型对话框 -->
    <el-dialog
      v-model="showFetchModelsDialog"
      title="选择要导入的模型"
      width="700px"
    >
      <div style="margin-bottom: 16px;">
        <el-input
          v-model="fetchModelsSearchText"
          placeholder="搜索模型..."
          clearable
          style="width: 300px;"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <span style="margin-left: 16px; color: #909399;">
          已选择 {{ selectedModels.length }} / {{ filteredFetchedModels.length }} 个模型
        </span>
      </div>

      <div style="margin-bottom: 12px;">
        <el-button size="small" @click="selectAllModels">全选</el-button>
        <el-button size="small" @click="deselectAllModels">取消全选</el-button>
      </div>

      <div class="models-select-grid">
        <el-checkbox-group v-model="selectedModels">
          <el-checkbox
            v-for="model in filteredFetchedModels"
            :key="model"
            :value="model"
            :label="model"
            class="model-checkbox"
          >
            {{ model }}
          </el-checkbox>
        </el-checkbox-group>
      </div>

      <template #footer>
        <el-button @click="showFetchModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmFetchedModels" :disabled="selectedModels.length === 0">
          导入选中的 {{ selectedModels.length }} 个模型
        </el-button>
      </template>
    </el-dialog>

    <!-- 模型管理对话框 -->
    <el-dialog
      v-model="showModelsDialog"
      :title="`管理模型 - ${editingProvider?.name}`"
      width="700px"
    >
      <div v-if="editingProvider">
        <el-alert type="info" :closable="false" style="margin-bottom: 20px;">
          点击"同步模型"可自动从提供商获取最新模型列表，或手动添加/编辑模型
        </el-alert>

        <div class="models-list">
          <el-card
            v-for="(model, index) in editingProvider.models"
            :key="model.id"
            class="model-item"
          >
            <div class="model-header">
              <el-input
                v-model="model.name"
                placeholder="模型显示名称"
                style="width: 200px; margin-right: 10px;"
              />
              <el-input
                v-model="model.id"
                placeholder="模型ID（API调用时使用）"
                style="width: 200px; margin-right: 10px;"
              />
              <el-select v-model="model.type" placeholder="模型类型" style="width: 120px; margin-right: 10px;">
                <el-option label="规划" value="planning" />
                <el-option label="写作" value="writing" />
                <el-option label="检查" value="checking" />
                <el-option label="通用" value="all" />
              </el-select>
              <el-switch v-model="model.isEnabled" />
              <el-button
                type="danger"
                text
                @click="editingProvider.models.splice(index, 1)"
                style="margin-left: 10px;"
              >
                删除
              </el-button>
            </div>
            <div class="model-details">
              <div class="detail-input">
                <el-input-number
                  v-model="model.maxTokens"
                  :min="1000"
                  :step="1000"
                  style="width: 150px;"
                />
                <div class="input-hint">最大上下文长度（tokens）</div>
              </div>
              <div class="detail-input">
                <el-input-number
                  v-model="model.costPerInputToken"
                  :min="0"
                  :step="0.0001"
                  :precision="4"
                  style="width: 150px;"
                />
                <div class="input-hint">输入成本（$/1K tokens）</div>
              </div>
              <div class="detail-input">
                <el-input-number
                  v-model="model.costPerOutputToken"
                  :min="0"
                  :step="0.0001"
                  :precision="4"
                  style="width: 150px;"
                />
                <div class="input-hint">输出成本（$/1K tokens）</div>
              </div>
            </div>
          </el-card>

          <el-button type="primary" text @click="addModel">
            <el-icon><Plus /></el-icon>
            添加模型
          </el-button>
        </div>
      </div>

      <template #footer>
        <el-button @click="showModelsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveModels">保存</el-button>
      </template>
    </el-dialog>

    <!-- 插件管理对话框 -->
    <el-dialog
      v-model="showPluginManagerDialog"
      title="插件管理"
      width="90%"
      top="5vh"
      :close-on-click-modal="false"
    >
      <PluginManager v-if="showPluginManagerDialog" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, List, Refresh, Download, Search, Grid, Setting } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import type { ProjectConfig, ModelProvider, ModelInfo, VectorServiceConfig } from '@/types'
import { DEFAULT_SYSTEM_PROMPTS, SYSTEM_PROMPT_VARIABLES } from '@/utils/systemPrompts'
import { getVectorService, clearVectorServiceCache } from '@/utils/vectorService'
import PluginManager from './PluginManager.vue'

const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const project = computed(() => projectStore.currentProject)

// 插件统计
const pluginStats = computed(() => {
  const registries = pluginStore.getRegistries()
  return {
    total: pluginStore.plugins.length,
    active: pluginStore.activePlugins.length,
    providers: registries.aiProvider.getAll().length,
    exporters: registries.exporter.getAll().length
  }
})

// 插件管理对话框
const showPluginManagerDialog = ref(false)

// 插件管理方法
function openPluginManager() {
  showPluginManagerDialog.value = true
}

function showInstallPluginDialog() {
  showPluginManagerDialog.value = true
}

async function refreshPlugins() {
  try {
    await pluginStore.loadInstalledPlugins()
    ElMessage.success('插件列表已刷新')
  } catch (error) {
    ElMessage.error('刷新失败: ' + error)
  }
}

const configForm = ref<ProjectConfig>({
  preset: 'standard',
  providers: [],
  planningModel: '',
  writingModel: '',
  checkingModel: '',
  assistantModel: '',
  memoryModel: '',
  systemPrompts: { ...DEFAULT_SYSTEM_PROMPTS },
  planningDepth: 'medium',
  writingDepth: 'standard',
  enableQualityCheck: true,
  qualityThreshold: 7,
  maxCostPerChapter: 0.15,
  enableAISuggestions: true
})

const showAdvanced = ref(false)
const advancedConfig = ref({
  temperature: 0.8,
  topP: 0.9,
  maxTokens: 4096,
  maxContextTokens: 8192,
  recentChaptersCount: 3,
  targetWordCount: 2000,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: [] as string[]
})

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

const commonModelsPreview: Record<string, string[]> = {
  'OpenAI': ['gpt-4-turbo', 'gpt-4', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  'Anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  '智谱': ['glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  '通义千问': ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext'],
  'DeepSeek': ['deepseek-chat', 'deepseek-coder'],
  'Moonshot': ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  '本地 Ollama': ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'codellama']
}

const providerForm = ref<Omit<ModelProvider, 'id' | 'models' | 'lastSyncTime' | 'isSyncing'> & { modelsInput?: string }>({
  name: '',
  type: 'openai',
  baseUrl: '',
  apiKey: '',
  isEnabled: true,
  modelsInput: ''
})

const providerTemplate = ref('')

// 向量检索配置
const vectorConfig = ref({
  enabled: false,
  provider: 'local' as 'local' | 'openai',
  model: 'Xenova/all-MiniLM-L6-v2',
  apiKey: '',
  baseUrl: '',
  topK: 5,
  minScore: 0.6,
  vectorWeight: 0.7
})

const vectorIndexStatus = ref<{
  indexed: boolean
  documentCount: number
} | null>(null)

const rebuildingIndex = ref(false)

// 成本统计
const costStats = ref({
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCost: 0
})

const averageChapterCost = computed(() => {
  if (costStats.value.totalCalls === 0) return 0
  return costStats.value.totalCost / costStats.value.totalCalls
})

// 系统提示词配置
const activePromptTab = ref('planning')
const systemPrompts = ref({
  planning: DEFAULT_SYSTEM_PROMPTS.planning,
  writing: DEFAULT_SYSTEM_PROMPTS.writing,
  checking: DEFAULT_SYSTEM_PROMPTS.checking,
  assistant: DEFAULT_SYSTEM_PROMPTS.assistant,
  memory: DEFAULT_SYSTEM_PROMPTS.memory
})

const promptVariables = SYSTEM_PROMPT_VARIABLES

const filteredFetchedModels = computed(() => {
  if (!fetchModelsSearchText.value) return fetchedModelsList.value
  const search = fetchModelsSearchText.value.toLowerCase()
  return fetchedModelsList.value.filter(model => model.toLowerCase().includes(search))
})

// 提供商模板配置
const providerTemplates: Record<string, {
  name: string
  type: 'openai' | 'anthropic' | 'custom'
  baseUrl: string
  models: string[]
}> = {
  'openai-official': {
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']
  },
  'anthropic-official': {
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
  },
  'zhipu-glm4': {
    name: '智谱 GLM-4',
    type: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-flash']
  },
  'tongyi-qianwen': {
    name: '通义千问',
    type: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext']
  },
  'deepseek': {
    name: 'DeepSeek',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder']
  },
  'moonshot': {
    name: 'Moonshot (月之暗面)',
    type: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  'baidu-ernie': {
    name: '百度文心一言',
    type: 'openai',
    baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat',
    models: ['ernie-4.0-8k', 'ernie-3.5-8k', 'ernie-speed-8k']
  },
  'xunfei-spark': {
    name: '讯飞星火',
    type: 'custom',
    baseUrl: 'wss://spark-api.xf-yun.com/v3.5/chat',
    models: ['spark-v3.5', 'spark-v3.0', 'spark-v2.0']
  },
  'local-ollama': {
    name: '本地 Ollama',
    type: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral', 'codellama']
  },
  'azure-openai': {
    name: 'Azure OpenAI',
    type: 'openai',
    baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments',
    models: ['gpt-4', 'gpt-35-turbo']
  },
  'custom-openai': {
    name: '自定义 OpenAI 兼容',
    type: 'openai',
    baseUrl: '',
    models: []
  }
}

const qualityMarks = {
  1: '很差',
  3: '较差',
  5: '一般',
  7: '良好',
  9: '优秀',
  10: '完美'
}

const estimatedCost = computed(() => {
  const targetWords = project.value?.targetWords || 100000
  const avgCostPerChapter = configForm.value.maxCostPerChapter
  const avgWordsPerChapter = 3000
  const chapterCount = Math.ceil(targetWords / avgWordsPerChapter)
  return chapterCount * avgCostPerChapter
})

const hasEnabledProviders = computed(() => {
  return configForm.value.providers.some(p => p.isEnabled && p.models.some(m => m.isEnabled))
})

onMounted(async () => {
  // 优先加载项目配置，其次加载全局配置
  if (project.value?.config) {
    configForm.value = JSON.parse(JSON.stringify(project.value.config))
  } else {
    // 加载全局配置
    await projectStore.loadGlobalConfig()
    if (projectStore.globalConfig) {
      configForm.value = JSON.parse(JSON.stringify(projectStore.globalConfig))
    }
  }

  // 确保 providers 数组存在
  if (!configForm.value.providers) {
    configForm.value.providers = []
  }

  // 加载系统提示词配置
  if (configForm.value.systemPrompts) {
    systemPrompts.value = { ...DEFAULT_SYSTEM_PROMPTS, ...configForm.value.systemPrompts }
  }
})

function getDefaultBaseUrl() {
  switch (providerForm.value.type) {
    case 'openai':
      return 'https://api.openai.com/v1'
    case 'anthropic':
      return 'https://api.anthropic.com'
    default:
      return ''
  }
}

function showAddProviderDialog() {
  editingProvider.value = null
  providerForm.value = {
    name: '',
    type: 'openai',
    baseUrl: getDefaultBaseUrl(),
    apiKey: '',
    isEnabled: true,
    modelsInput: ''
  }
  showProviderDialog.value = true
}

function editProvider(provider: ModelProvider) {
  editingProvider.value = provider
  // 将模型列表转换为逗号分隔的字符串
  const modelsInput = provider.models.map(m => m.id).join(', ')
  providerForm.value = {
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    isEnabled: provider.isEnabled,
    modelsInput
  }
  showProviderDialog.value = true
}

async function saveProvider() {
  if (!providerForm.value.name.trim()) {
    ElMessage.warning('请输入提供商名称')
    return
  }
  if (!providerForm.value.baseUrl.trim()) {
    ElMessage.warning('请输入Base URL')
    return
  }

  savingProvider.value = true
  try {
    // 确保 providers 数组存在
    if (!configForm.value.providers) {
      configForm.value.providers = []
    }

    console.log('[ProjectConfig] 保存提供商前，providers 数量:', configForm.value.providers.length)

    // 解析模型名称字符串
    const modelIds = providerForm.value.modelsInput
      ? providerForm.value.modelsInput.split(',').map(m => m.trim()).filter(m => m)
      : []

    // 将模型ID转换为ModelInfo对象
    const models: ModelInfo[] = modelIds.map(modelId => ({
      id: modelId,
      name: getModelDisplayName(modelId),
      type: inferModelType(modelId),
      maxTokens: inferMaxTokens(modelId),
      costPerInputToken: 0,
      costPerOutputToken: 0,
      isEnabled: true
    }))

    if (editingProvider.value) {
      // 更新现有提供商
      const index = configForm.value.providers.findIndex(p => p.id === editingProvider.value!.id)
      if (index !== -1) {
        configForm.value.providers[index] = {
          ...editingProvider.value,
          name: providerForm.value.name,
          type: providerForm.value.type,
          baseUrl: providerForm.value.baseUrl,
          apiKey: providerForm.value.apiKey,
          isEnabled: providerForm.value.isEnabled,
          models
        }
      }
    } else {
      // 添加新提供商
      const newProvider: ModelProvider = {
        id: uuidv4(),
        name: providerForm.value.name,
        type: providerForm.value.type,
        baseUrl: providerForm.value.baseUrl,
        apiKey: providerForm.value.apiKey,
        isEnabled: providerForm.value.isEnabled,
        models,
        lastSyncTime: undefined,
        isSyncing: false
      }
      configForm.value.providers.push(newProvider)
      console.log('[ProjectConfig] 添加提供商后，providers 数量:', configForm.value.providers.length)
      console.log('[ProjectConfig] 提供商列表:', configForm.value.providers)
    }

    showProviderDialog.value = false

    // 立即保存配置到 IndexedDB
    await saveConfig()

    console.log('[ProjectConfig] 保存配置后，providers 数量:', configForm.value.providers.length)

    ElMessage.success(editingProvider.value ? '提供商已更新' : '提供商已添加')
  } catch (error) {
    console.error('保存提供商失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  } finally {
    savingProvider.value = false
  }
}

async function testProvider() {
  if (!providerForm.value.baseUrl.trim()) {
    ElMessage.warning('请输入Base URL')
    return
  }
  if (!providerForm.value.apiKey.trim()) {
    ElMessage.warning('请输入API Key')
    return
  }

  testingProvider.value = true
  try {
    // 构建测试请求
    const testUrl = providerForm.value.baseUrl.endsWith('/v1')
      ? providerForm.value.baseUrl + '/chat/completions'
      : providerForm.value.baseUrl + (providerForm.value.baseUrl.endsWith('/') ? 'v1/chat/completions' : '/v1/chat/completions')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 根据提供商类型设置认证头
    if (providerForm.value.type === 'anthropic') {
      headers['x-api-key'] = providerForm.value.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${providerForm.value.apiKey}`
    }

    // 发送测试请求
    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: providerForm.value.modelsInput?.split(',')[0].trim() || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello, this is a test message.' }],
        max_tokens: 10
      })
    })

    if (response.ok) {
      ElMessage.success('连接测试成功！')
    } else {
      const error = await response.json().catch(() => ({}))
      const errorMsg = error.error?.message || error.message || `HTTP ${response.status}`
      ElMessage.error(`连接失败: ${errorMsg}`)
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    ElMessage.error(`连接失败: ${(error as Error).message}`)
  } finally {
    testingProvider.value = false
  }
}

async function deleteProvider(providerId: string) {
  try {
    await ElMessageBox.confirm(
      '确定要删除此提供商吗？所有相关模型配置将被删除。',
      '删除提供商',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    configForm.value.providers = configForm.value.providers.filter(p => p.id !== providerId)

    // 清空相关模型选择
    if (configForm.value.planningModel.startsWith(providerId)) {
      configForm.value.planningModel = ''
    }
    if (configForm.value.writingModel.startsWith(providerId)) {
      configForm.value.writingModel = ''
    }
    if (configForm.value.checkingModel.startsWith(providerId)) {
      configForm.value.checkingModel = ''
    }

    ElMessage.success('提供商已删除')
  } catch {
    // 用户取消
  }
}

async function syncModels(provider: ModelProvider) {
  provider.isSyncing = true
  try {
    // TODO: 实际调用API获取模型列表
    // 这里模拟获取模型
    await new Promise(resolve => setTimeout(resolve, 1000))

    const defaultModels: ModelInfo[] = []

    if (provider.type === 'openai') {
      defaultModels.push(
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', type: 'planning', maxTokens: 128000, costPerInputToken: 0.01, costPerOutputToken: 0.03, isEnabled: true },
        { id: 'gpt-4', name: 'GPT-4', type: 'planning', maxTokens: 8192, costPerInputToken: 0.03, costPerOutputToken: 0.06, isEnabled: true },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', type: 'writing', maxTokens: 16385, costPerInputToken: 0.0005, costPerOutputToken: 0.0015, isEnabled: true }
      )
    } else if (provider.type === 'anthropic') {
      defaultModels.push(
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', type: 'planning', maxTokens: 200000, costPerInputToken: 0.003, costPerOutputToken: 0.015, isEnabled: true },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', type: 'planning', maxTokens: 200000, costPerInputToken: 0.015, costPerOutputToken: 0.075, isEnabled: true },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', type: 'checking', maxTokens: 200000, costPerInputToken: 0.00025, costPerOutputToken: 0.00125, isEnabled: true }
      )
    }

    provider.models = defaultModels
    provider.lastSyncTime = new Date()

    ElMessage.success('模型同步成功')
  } catch (error) {
    ElMessage.error('模型同步失败')
  } finally {
    provider.isSyncing = false
  }
}

function applyProviderTemplate(templateKey: string) {
  const template = providerTemplates[templateKey]
  if (!template) return

  providerForm.value.name = template.name
  providerForm.value.type = template.type
  providerForm.value.baseUrl = template.baseUrl
  providerForm.value.modelsInput = template.models.join(', ')

  ElMessage.success(`已应用 "${template.name}" 模板`)
}

function openModelsDialog(provider: ModelProvider) {
  editingProvider.value = provider
  showModelsDialog.value = true
}


function addModel() {
  if (!editingProvider.value) return

  editingProvider.value.models.push({
    id: '',
    name: '',
    type: 'all',
    maxTokens: 8192,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    isEnabled: true
  })
}

function saveModels() {
  showModelsDialog.value = false
  ElMessage.success('模型配置已保存')
}

function getAvailableModels(type: 'planning' | 'writing' | 'checking') {
  const models: Array<ModelInfo & { providerId: string; providerName: string }> = []

  for (const provider of configForm.value.providers) {
    if (!provider.isEnabled) continue

    for (const model of provider.models) {
      if (!model.isEnabled) continue
      if (model.type === type || model.type === 'all') {
        models.push({
          ...model,
          providerId: provider.id,
          providerName: provider.name
        })
      }
    }
  }

  return models
}

async function saveConfig() {
  try {
    console.log('[ProjectConfig] 开始保存配置...')

    // 保存高级设置到配置中
    configForm.value.advancedSettings = advancedConfig.value

    // 保存系统提示词配置
    configForm.value.systemPrompts = { ...systemPrompts.value }

    if (project.value) {
      console.log('[ProjectConfig] 当前项目ID:', project.value.id)
      console.log('[ProjectConfig] 配置提供商数量:', configForm.value.providers.length)

      // 直接更新 config 字段，不要重新赋值整个对象
      project.value.config = JSON.parse(JSON.stringify(configForm.value))

      await projectStore.saveCurrentProject()

      console.log('[ProjectConfig] 配置保存成功')
      ElMessage.success('项目配置已保存')
    } else {
      // 保存到全局配置
      const configData = JSON.parse(JSON.stringify(configForm.value))
      await projectStore.saveGlobalConfig(configData)
      ElMessage.success('全局配置已保存')
    }

    console.log('配置已保存:', {
      providers: configForm.value.providers.length,
      models: configForm.value.providers.reduce((sum, p) => sum + p.models.length, 0),
      advanced: configForm.value.advancedSettings
    })
  } catch (error) {
    console.error('[ProjectConfig] 保存配置失败:', error)
    ElMessage.error('保存配置失败：' + (error as Error).message)
  }
}

function exportConfig() {
  const config = {
    ...configForm.value,
    advanced: advancedConfig.value
  }

  const data = JSON.stringify(config, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `ai-novel-config-${Date.now()}.json`
  a.click()

  URL.revokeObjectURL(url)
  ElMessage.success('配置已导出')
}

function importConfig(file: File) {
  const reader = new FileReader()

  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)

      // 导入主配置
      if (data.preset) configForm.value.preset = data.preset
      if (data.providers) configForm.value.providers = data.providers
      if (data.planningModel) configForm.value.planningModel = data.planningModel
      if (data.writingModel) configForm.value.writingModel = data.writingModel
      if (data.checkingModel) configForm.value.checkingModel = data.checkingModel
      if (data.assistantModel !== undefined) configForm.value.assistantModel = data.assistantModel
      if (data.memoryModel !== undefined) configForm.value.memoryModel = data.memoryModel
      if (data.planningDepth) configForm.value.planningDepth = data.planningDepth
      if (data.writingDepth) configForm.value.writingDepth = data.writingDepth
      if (data.enableQualityCheck !== undefined) configForm.value.enableQualityCheck = data.enableQualityCheck
      if (data.qualityThreshold) configForm.value.qualityThreshold = data.qualityThreshold
      if (data.maxCostPerChapter) configForm.value.maxCostPerChapter = data.maxCostPerChapter
      if (data.enableAISuggestions !== undefined) configForm.value.enableAISuggestions = data.enableAISuggestions

      // 导入系统提示词配置
      if (data.systemPrompts) {
        systemPrompts.value = { ...DEFAULT_SYSTEM_PROMPTS, ...data.systemPrompts }
        configForm.value.systemPrompts = systemPrompts.value
      }

      // 导入高级设置
      if (data.advanced || data.advancedSettings) {
        const advanced = data.advanced || data.advancedSettings
        advancedConfig.value = {
          temperature: advanced.temperature ?? 0.8,
          topP: advanced.topP ?? 0.9,
          maxTokens: advanced.maxTokens ?? 4096,
          maxContextTokens: advanced.maxContextTokens ?? 8192,
          recentChaptersCount: advanced.recentChaptersCount ?? 3,
          targetWordCount: advanced.targetWordCount ?? 2000,
          frequencyPenalty: advanced.frequencyPenalty ?? 0,
          presencePenalty: advanced.presencePenalty ?? 0,
          stopSequences: advanced.stopSequences ?? []
        }
      }

      const providerCount = data.providers?.length || 0
      ElMessage.success(`配置已导入：${providerCount} 个提供商`)
    } catch (error) {
      console.error('导入配置失败:', error)
      ElMessage.error('配置文件格式错误，请检查文件内容')
    }
  }

  reader.onerror = () => {
    ElMessage.error('读取文件失败')
  }

  reader.readAsText(file)
  return false
}

function resetConfig() {
  configForm.value = {
    preset: 'standard',
    providers: [],
    planningModel: '',
    writingModel: '',
    checkingModel: '',
    assistantModel: '',
    memoryModel: '',
    systemPrompts: { ...DEFAULT_SYSTEM_PROMPTS },
    planningDepth: 'medium',
    writingDepth: 'standard',
    enableQualityCheck: true,
    qualityThreshold: 7,
    maxCostPerChapter: 0.15,
    enableAISuggestions: true,
    advancedSettings: {
      temperature: 0.8,
      topP: 0.9,
      maxTokens: 4096,
      maxContextTokens: 8192,
      recentChaptersCount: 3,
      targetWordCount: 2000,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stopSequences: []
    }
  }

  advancedConfig.value = {
    temperature: 0.8,
    topP: 0.9,
    maxTokens: 4096,
    maxContextTokens: 8192,
    recentChaptersCount: 3,
    targetWordCount: 2000,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stopSequences: []
  }

  systemPrompts.value = { ...DEFAULT_SYSTEM_PROMPTS }

  ElMessage.success('配置已重置')
}

function formatDate(date: Date | string) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 辅助函数：从模型ID生成显示名称
function getModelDisplayName(modelId: string): string {
  // 移除常见前缀和后缀
  let name = modelId
    .replace(/^(gpt-|claude-|gemini-|llama-|mistral-)/i, '')
    .replace(/-(preview|turbo|latest|instruct|chat)/gi, '')
    .replace(/-/g, ' ')
    .trim()

  // 特殊处理
  const displayNameMap: Record<string, string> = {
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet',
    'claude-3-opus-20240229': 'Claude 3 Opus',
    'claude-3-haiku-20240307': 'Claude 3 Haiku',
  }

  return displayNameMap[modelId] || name.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

// 辅助函数：从模型ID推断模型类型
function inferModelType(modelId: string): 'planning' | 'writing' | 'checking' | 'all' {
  const id = modelId.toLowerCase()

  // 规划模型（高质量、大参数）
  if (id.includes('gpt-4') || id.includes('opus') || id.includes('sonnet') || id.includes('claude-3-5')) {
    return 'planning'
  }

  // 写作模型（中等质量、高性价比）
  if (id.includes('gpt-3.5') || id.includes('haiku') || id.includes('turbo') || id.includes('llama')) {
    return 'writing'
  }

  // 检查模型（快速、低成本）
  if (id.includes('mini') || id.includes('flash') || id.includes('small')) {
    return 'checking'
  }

  // 默认为通用
  return 'all'
}

// 辅助函数：从模型ID推断最大token数
function inferMaxTokens(modelId: string): number {
  const id = modelId.toLowerCase()

  // 已知模型的token数
  if (id.includes('gpt-4-turbo') || id.includes('gpt-4-32k')) return 128000
  if (id.includes('gpt-4')) return 8192
  if (id.includes('gpt-3.5-turbo-16k')) return 16385
  if (id.includes('gpt-3.5')) return 4096
  if (id.includes('claude-3')) return 200000
  if (id.includes('claude-2')) return 100000
  if (id.includes('gemini-1.5')) return 1000000
  if (id.includes('gemini')) return 32000
  if (id.includes('llama-3') || id.includes('llama3')) return 8192
  if (id.includes('mistral')) return 32000

  // 默认值
  return 8192
}

// 批量导入模型
async function batchImportModels() {
  try {
    const { value: modelsText } = await ElMessageBox.prompt(
      '批量导入模型配置，每行一个模型，格式：模型ID:显示名称:类型:最大Tokens（可选）',
      '批量导入模型',
      {
        confirmButtonText: '导入',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: 'gpt-4-turbo:GPT-4 Turbo:planning:128000\ngpt-3.5-turbo:GPT-3.5 Turbo:writing:16385\nclaude-3-haiku-20240307:Claude 3 Haiku:checking:200000',
        inputValue: ''
      }
    )

    if (!modelsText) return

    const lines = modelsText.split('\n').map(line => line.trim()).filter(line => line)
    const models: string[] = []

    for (const line of lines) {
      const parts = line.split(':')
      if (parts[0]) {
        models.push(parts[0].trim())
      }
    }

    if (models.length > 0) {
      providerForm.value.modelsInput = models.join(', ')
      ElMessage.success(`成功导入 ${models.length} 个模型`)
    }
  } catch {
    // 用户取消
  }
}

// 加载常用模型
function loadCommonModels() {
  selectedCommonProvider.value = ''
  showCommonModelsDialog.value = true
}

// 确认加载常用模型
function confirmLoadCommonModels() {
  if (selectedCommonProvider.value && commonModelsPreview[selectedCommonProvider.value]) {
    providerForm.value.modelsInput = commonModelsPreview[selectedCommonProvider.value].join(', ')
    showCommonModelsDialog.value = false
    ElMessage.success(`已加载 ${selectedCommonProvider.value} 的常用模型`)
  } else {
    ElMessage.warning('请选择一个提供商')
  }
}

// 从API获取模型列表
async function fetchModelsFromAPI() {
  if (!providerForm.value.baseUrl.trim()) {
    ElMessage.warning('请先输入 Base URL')
    return
  }
  if (!providerForm.value.apiKey.trim()) {
    ElMessage.warning('请先输入 API Key')
    return
  }

  fetchingModels.value = true
  try {
    // 构建 API URL
    let modelsUrl = providerForm.value.baseUrl
    if (!modelsUrl.endsWith('/models')) {
      modelsUrl = modelsUrl.replace(/\/$/, '') + '/models'
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // 根据提供商类型设置认证头
    if (providerForm.value.type === 'anthropic') {
      headers['x-api-key'] = providerForm.value.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${providerForm.value.apiKey}`
    }

    const response = await fetch(modelsUrl, { headers })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || error.message || `HTTP ${response.status}`)
    }

    const data = await response.json()

    // 解析模型列表 (OpenAI 格式)
    let models: string[] = []
    if (data.data && Array.isArray(data.data)) {
      models = data.data.map((m: any) => m.id).sort()
    } else if (Array.isArray(data.models)) {
      models = data.models.map((m: any) => typeof m === 'string' ? m : m.id).sort()
    } else if (Array.isArray(data)) {
      models = data.map((m: any) => typeof m === 'string' ? m : m.id).sort()
    }

    if (models.length === 0) {
      ElMessage.warning('未找到任何模型')
      return
    }

    // 显示选择对话框
    fetchedModelsList.value = models
    selectedModels.value = []
    fetchModelsSearchText.value = ''
    showFetchModelsDialog.value = true

    ElMessage.success(`成功获取 ${models.length} 个模型`)
  } catch (error) {
    console.error('获取模型列表失败:', error)
    ElMessage.error(`获取失败: ${(error as Error).message}`)
  } finally {
    fetchingModels.value = false
  }
}

// 全选模型
function selectAllModels() {
  selectedModels.value = [...filteredFetchedModels.value]
}

// 取消全选
function deselectAllModels() {
  selectedModels.value = []
}

// 确认选中的模型
function confirmFetchedModels() {
  if (selectedModels.value.length === 0) {
    ElMessage.warning('请至少选择一个模型')
    return
  }

  // 合并已有模型和新选择的模型
  const existingModels = providerForm.value.modelsInput
    ? providerForm.value.modelsInput.split(',').map(m => m.trim()).filter(m => m)
    : []

  const newModels = selectedModels.value.filter(m => !existingModels.includes(m))
  const allModels = [...existingModels, ...newModels]

  providerForm.value.modelsInput = allModels.join(', ')
  showFetchModelsDialog.value = false

  ElMessage.success(`已添加 ${newModels.length} 个模型`)
}

// 重置成本统计
async function resetCostStats() {
  try {
    await ElMessageBox.confirm(
      '确定要重置成本统计数据吗？此操作不可恢复。',
      '重置成本统计',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    costStats.value = {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0
    }

    ElMessage.success('成本统计已重置')
  } catch {
    // 用户取消
  }
}

// 重置系统提示词
async function resetSystemPrompts() {
  try {
    await ElMessageBox.confirm(
      '确定要恢复默认系统提示词吗？此操作不可恢复。',
      '重置提示词',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    systemPrompts.value = { ...DEFAULT_SYSTEM_PROMPTS }
    ElMessage.success('已恢复默认系统提示词')
  } catch {
    // 用户取消
  }
}

// 重建向量索引
async function rebuildVectorIndex() {
  if (!project.value) {
    ElMessage.warning('请先打开项目')
    return
  }

  rebuildingIndex.value = true

  try {
    const config: VectorServiceConfig = {
      provider: vectorConfig.value.provider,
      model: vectorConfig.value.model,
      dimension: vectorConfig.value.provider === 'local' ? 384 : 1536,
      apiKey: vectorConfig.value.apiKey,
      baseUrl: vectorConfig.value.baseUrl,
      projectId: project.value.id
    }

    // 重建前必须清理旧的缓存实例，否则配置更改不会生效
    clearVectorServiceCache(project.value.id)
    const vectorService = await getVectorService(project.value.id, config)

    // 清空现有索引
    await vectorService.clear()

    // 重新索引项目
    await vectorService.indexProject(project.value)

    // 更新状态
    const docCount = await vectorService.getDocumentCount()
    vectorIndexStatus.value = {
      indexed: true,
      documentCount: docCount
    }

    ElMessage.success(`索引重建完成，共 ${docCount} 个文档`)
  } catch (error) {
    console.error('重建索引失败:', error)
    ElMessage.error('重建索引失败：' + (error as Error).message)
  } finally {
    rebuildingIndex.value = false
  }
}

// 清空向量索引
async function clearVectorIndex() {
  if (!project.value) {
    ElMessage.warning('请先打开项目')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确定要清空向量索引吗？这将删除所有已索引的文档。',
      '清空索引',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const config: VectorServiceConfig = {
      provider: vectorConfig.value.provider,
      model: vectorConfig.value.model,
      dimension: vectorConfig.value.provider === 'local' ? 384 : 1536,
      projectId: project.value.id
    }

    const vectorService = await getVectorService(project.value.id, config)
    await vectorService.clear()

    // 清理缓存
    clearVectorServiceCache(project.value.id)

    vectorIndexStatus.value = {
      indexed: false,
      documentCount: 0
    }

    ElMessage.success('索引已清空')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('清空索引失败:', error)
      ElMessage.error('清空索引失败：' + (error as Error).message)
    }
  }
}

// 更新向量索引状态
async function updateVectorIndexStatus() {
  if (!project.value || !vectorConfig.value.enabled) {
    vectorIndexStatus.value = null
    return
  }

  try {
    const config: VectorServiceConfig = {
      provider: vectorConfig.value.provider,
      model: vectorConfig.value.model,
      dimension: vectorConfig.value.provider === 'local' ? 384 : 1536,
      apiKey: vectorConfig.value.apiKey,
      baseUrl: vectorConfig.value.baseUrl,
      projectId: project.value.id
    }

    const vectorService = await getVectorService(project.value.id, config)
    const documentCount = await vectorService.getDocumentCount()

    vectorIndexStatus.value = {
      indexed: documentCount > 0,
      documentCount
    }
  } catch (error) {
    console.error('获取索引状态失败:', error)
    vectorIndexStatus.value = null
  }
}

</script>

<style scoped>
.project-config {
  max-width: 1000px;
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

.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-providers {
  padding: 40px 0;
}

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.provider-item {
  margin-bottom: 0;
}

.provider-item.disabled-provider {
  opacity: 0.6;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.provider-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-name {
  font-size: 16px;
  font-weight: 600;
}

.provider-actions {
  display: flex;
  gap: 8px;
}

.provider-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: #909399;
}

.detail-value {
  font-size: 14px;
  color: #606266;
}

.models-preview {
  padding-top: 12px;
  border-top: 1px solid #e4e7ed;
}

.models-label {
  font-size: 14px;
  color: #606266;
  margin-bottom: 8px;
}

.radio-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-title {
  font-weight: 600;
  font-size: 14px;
}

.label-desc {
  font-size: 12px;
  color: #909399;
}

.form-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.models-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-item {
  margin-bottom: 0;
}

.model-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.model-details {
  display: flex;
  gap: 12px;
}

.detail-input {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.input-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.models-select-grid {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #fafafa;
}

.models-select-grid :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.model-checkbox {
  margin: 0 !important;
  padding: 8px 12px;
  background-color: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  transition: all 0.2s;
}

.model-checkbox:hover {
  border-color: #409eff;
}

.model-checkbox.is-checked {
  background-color: #ecf5ff;
  border-color: #409eff;
}

.prompt-editor {
  margin-top: 16px;
}

.prompt-tips {
  margin-top: 12px;
  padding: 12px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.prompt-tip-title {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 8px;
}

:deep(.el-radio-group) {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

:deep(.el-radio) {
  height: auto;
  align-items: flex-start;
}

.plugin-actions {
  display: flex;
  gap: 10px;
}
</style>
