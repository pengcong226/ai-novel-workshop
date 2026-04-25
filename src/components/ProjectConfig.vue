<template>
  <div class="project-config">
    <el-card class="header-card">
      <div class="header">
        <h2>项目配置</h2>
        <div class="header-actions" style="display: flex; align-items: center;">
          <el-radio-group v-model="configMode" size="small" style="margin-right: 20px;">
            <el-radio-button value="storyteller">小白模式 (Story-teller)</el-radio-button>
            <el-radio-button value="engineer">极客老炮 (Engineer)</el-radio-button>
          </el-radio-group>
          <el-button type="primary" @click="saveConfig">保存配置</el-button>
        </div>
      </div>
    </el-card>

    <div class="content">
      <StorytellerPanel
        v-if="configMode === 'storyteller'"
        v-model:config="configForm"
        v-model:advanced="advancedConfig"
      />

      <!-- 模型提供商配置 (已拆解至 ProviderManager) -->
      <ProviderManager
        v-show="configMode === 'engineer'"
        v-model:providers="configForm.providers"
        @save="saveConfig"
      />

      <!-- AI模型选择 -->
      <el-card class="config-card" v-show="configMode === 'engineer'">
        <template #header>
          <div class="card-header">
            <span>AI 模型分配</span>
          </div>
        </template>
        <el-form :model="configForm" label-width="150px">
          <el-form-item label="大纲规划师 (Planner)">
            <el-select v-model="configForm.plannerModel" placeholder="选择规划模型" style="width: 100%;">
              <el-option-group v-for="provider in configForm.providers" :key="provider.id" :label="provider.name">
                <el-option v-for="model in provider.models" :key="model.id" :label="model.name" :value="model.id" />
              </el-option-group>
            </el-select>
            <div class="form-tip">负责推演大纲节点、预测状态变更（建议使用高推理模型）</div>
          </el-form-item>

          <el-form-item label="正文写手 (Writer)">
            <el-select v-model="configForm.writerModel" placeholder="选择写作模型" style="width: 100%;">
              <el-option-group v-for="provider in configForm.providers" :key="provider.id" :label="provider.name">
                <el-option v-for="model in provider.models" :key="model.id" :label="model.name" :value="model.id" />
              </el-option-group>
            </el-select>
            <div class="form-tip">负责根据上下文撰写小说正文（建议使用文笔好的模型）</div>
          </el-form-item>

          <el-form-item label="防吃书审查 (Sentinel)">
            <el-select v-model="configForm.sentinelModel" placeholder="选择审查模型" style="width: 100%;">
              <el-option-group v-for="provider in configForm.providers" :key="provider.id" :label="provider.name">
                <el-option v-for="model in provider.models" :key="model.id" :label="model.name" :value="model.id" />
              </el-option-group>
            </el-select>
            <div class="form-tip">负责在每次生成后校验一致性（建议使用高速响应模型）</div>
          </el-form-item>

          <el-form-item label="沙盘状态提取 (Extractor)">
            <el-select v-model="configForm.extractorModel" placeholder="选择提取模型" style="width: 100%;">
              <el-option-group v-for="provider in configForm.providers" :key="provider.id" :label="provider.name">
                <el-option v-for="model in provider.models" :key="model.id" :label="model.name" :value="model.id" />
              </el-option-group>
            </el-select>
            <div class="form-tip">执行 Tool Calling 输出规范 JSON 以更新底层沙盘数据</div>
          </el-form-item>
        </el-form>
      </el-card>

      <StyleProfilePanel
        v-model:config="configForm"
      />

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
          <el-tab-pane label="大纲规划师" name="planner">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.planner"
                type="textarea"
                :rows="10"
                placeholder="规划模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.planner" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="正文写手" name="writer">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.writer"
                type="textarea"
                :rows="10"
                placeholder="写作模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.writer" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="防吃书审查" name="sentinel">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.sentinel"
                type="textarea"
                :rows="10"
                placeholder="审查模型的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.sentinel" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="沙盘状态提取" name="extractor">
            <div class="prompt-editor">
              <el-input
                v-model="systemPrompts.extractor"
                type="textarea"
                :rows="10"
                placeholder="状态提取引擎的系统提示词..."
              />
              <div class="prompt-tips">
                <div class="prompt-tip-title">可用变量：</div>
                <el-tag size="small" v-for="v in promptVariables.extractor" :key="v" style="margin-right: 8px;">{{ v }}</el-tag>
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

          <el-form-item label="生成后自动审校">
            <el-switch v-model="configForm.enableAutoReview" />
            <div class="form-tip">章节生成完成后在后台运行编辑/读者 Agent，并把结果加入审校批注；开启后会将章节正文及相关项目上下文发送给当前配置的 AI 提供商</div>
          </el-form-item>

          <el-alert v-if="configForm.enableAISuggestions" type="info" :closable="false" show-icon>
            <template #title>
              AI会在章节生成后提供改进建议
            </template>
            <div>包括情节建议、人物塑造、文笔优化等方面</div>
          </el-alert>
        </el-form>
      </el-card>

      <!-- AI Agent -->
      <el-card class="config-card">
        <template #header>
          <div class="card-header">
            <span>AI Agent</span>
            <el-button text @click="resetAgentConfigs">恢复默认</el-button>
          </div>
        </template>

        <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px;">
          <template #title>多 Agent 协作写作</template>
          <div>生成前可启用规划师细化大纲；生成后可按优先级执行编辑审校和读者反馈 Agent。</div>
        </el-alert>

        <el-table :data="configForm.agentConfigs" border>
          <el-table-column label="角色" min-width="130">
            <template #default="{ row }">
              <span>{{ getAgentRoleLabel(row.role) }}</span>
              <el-tag v-if="!isActiveAgentRole(row.role)" size="small" type="info" style="margin-left: 8px;">未接入</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="启用" width="90">
            <template #default="{ row }">
              <el-switch v-if="isActiveAgentRole(row.role)" v-model="row.enabled" />
              <span v-else class="form-tip">—</span>
            </template>
          </el-table-column>
          <el-table-column label="阶段" width="110">
            <template #default="{ row }">
              {{ getAgentPhaseLabel(row.phase) }}
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.priority" :min="1" :max="99" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="仅批量" width="100">
            <template #default="{ row }">
              <el-switch v-if="row.role === 'reader'" v-model="row.batchOnly" />
              <span v-else class="form-tip">—</span>
            </template>
          </el-table-column>
        </el-table>
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
          <el-form-item label="全局主题 (Theme)">
            <el-select v-model="themeStore.activeThemeId" placeholder="选择主题">
              <el-option
                v-for="theme in availableThemes"
                :key="theme.id"
                :label="theme.name"
                :value="theme.id"
              />
            </el-select>
            <div class="form-tip">支持无缝热切换（由 ThemeRegistry 插件系统提供）</div>
          </el-form-item>

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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { debounce } from 'lodash-es'
import StorytellerPanel from './config/StorytellerPanel.vue'
import StyleProfilePanel from './config/StyleProfilePanel.vue'
import ProviderManager from './config/ProviderManager.vue'
import { useProjectStore } from '@/stores/project'
import { usePluginStore } from '@/stores/plugin'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Grid, Setting, Download } from '@element-plus/icons-vue'
import type { ProjectConfig, VectorServiceConfig } from '@/types'
import {
  AGENT_PHASE_LABELS,
  AGENT_ROLE_LABELS,
  DEFAULT_AGENT_CONFIGS,
  isActiveAgentRole,
  isAgentPhase,
  isAgentRole
} from '@/agents/types'
import { DEFAULT_SYSTEM_PROMPTS, SYSTEM_PROMPT_VARIABLES } from '@/utils/systemPrompts'
import { getVectorService, resetVectorService as clearVectorServiceCache } from '@/services/vector-service'
import { getVectorDimensionByModel } from '@/utils/vector-dimension'
import { normalizeProjectConfig, getDefaultProjectConfig } from '@/utils/project-config-normalizer'
import { getLogger } from '@/utils/logger'
import PluginManager from './PluginManager.vue'
import { useThemeStore } from '@/stores/theme'

const projectStore = useProjectStore()
const pluginStore = usePluginStore()
const themeStore = useThemeStore()
const logger = getLogger('project:config')
const refreshVectorIndexStatusDebounced = debounce(async () => {
  if (!vectorConfig.value.enabled) return
  clearVectorServiceCache()
  await _updateVectorIndexStatus()
}, 400)

const project = computed(() => projectStore.currentProject)

const availableThemes = computed(() => {
  return pluginStore.getRegistries().theme.getAll()
})

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

const configForm = ref<ProjectConfig>(normalizeProjectConfig({
  systemPrompts: { ...DEFAULT_SYSTEM_PROMPTS }
}))

const showAdvanced = ref(false)
const advancedConfig = ref({
  temperature: configForm.value.advancedSettings?.temperature ?? 0.8,
  topP: configForm.value.advancedSettings?.topP ?? 0.9,
  maxTokens: configForm.value.advancedSettings?.maxTokens ?? 4096,
  maxContextTokens: configForm.value.advancedSettings?.maxContextTokens ?? 8192,
  recentChaptersCount: configForm.value.advancedSettings?.recentChaptersCount ?? 3,
  targetWordCount: configForm.value.advancedSettings?.targetWordCount ?? 2000,
  frequencyPenalty: configForm.value.advancedSettings?.frequencyPenalty ?? 0,
  presencePenalty: configForm.value.advancedSettings?.presencePenalty ?? 0,
  stopSequences: [...(configForm.value.advancedSettings?.stopSequences ?? [])] as string[]
})

// 配置界面模式切换
const configMode = ref<'storyteller'|'engineer'>('storyteller')
// 向量检索配置
const vectorConfig = ref({
  enabled: configForm.value.enableVectorRetrieval,
  provider: configForm.value.vectorConfig?.provider ?? 'local' as 'local' | 'openai',
  model: configForm.value.vectorConfig?.model
    ?? (configForm.value.vectorConfig?.provider === 'openai' ? 'text-embedding-3-small' : 'Xenova/all-MiniLM-L6-v2'),
  apiKey: configForm.value.vectorConfig?.apiKey ?? '',
  baseUrl: configForm.value.vectorConfig?.baseUrl ?? '',
  topK: configForm.value.vectorConfig?.topK ?? 5,
  minScore: configForm.value.vectorConfig?.minScore ?? 0.6,
  vectorWeight: configForm.value.vectorConfig?.vectorWeight ?? 0.7
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

const estimatedCost = computed(() => {
  const targetWords = project.value?.targetWords ?? 0
  const perChapterWords = advancedConfig.value.targetWordCount || 2000
  if (targetWords <= 0 || perChapterWords <= 0) return 0

  const estimatedChapters = Math.ceil(targetWords / perChapterWords)
  return estimatedChapters * configForm.value.maxCostPerChapter
})

// 系统提示词配置
const activePromptTab = ref('planner')
const systemPrompts = ref({
  planner: DEFAULT_SYSTEM_PROMPTS.planner,
  writer: DEFAULT_SYSTEM_PROMPTS.writer,
  sentinel: DEFAULT_SYSTEM_PROMPTS.sentinel,
  extractor: DEFAULT_SYSTEM_PROMPTS.extractor
})

const promptVariables = SYSTEM_PROMPT_VARIABLES

function getAgentRoleLabel(value: unknown): string {
  return isAgentRole(value) ? AGENT_ROLE_LABELS[value] : '未知角色'
}

function getAgentPhaseLabel(value: unknown): string {
  return isAgentPhase(value) ? AGENT_PHASE_LABELS[value] : '未知阶段'
}

function resetAgentConfigs() {
  configForm.value.agentConfigs = DEFAULT_AGENT_CONFIGS.map(config => ({ ...config }))
}

const qualityMarks = {
  1: '很差',
  3: '较差',
  5: '一般',
  7: '良好',
  9: '优秀',
  10: '完美'
}

function buildVectorServiceConfig(projectId?: string): VectorServiceConfig {
  return {
    provider: vectorConfig.value.provider,
    model: vectorConfig.value.model,
    dimension: getVectorDimensionByModel(vectorConfig.value.provider, vectorConfig.value.model),
    apiKey: vectorConfig.value.apiKey,
    baseUrl: vectorConfig.value.baseUrl,
    projectId,
    topK: vectorConfig.value.topK,
    minScore: vectorConfig.value.minScore,
    vectorWeight: vectorConfig.value.vectorWeight
  }
}

function getNormalizedConfigWithOverrides(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  const merged = normalizeProjectConfig({
    ...configForm.value,
    ...overrides,
    systemPrompts: { ...systemPrompts.value },
    advancedSettings: { ...advancedConfig.value },
    enableVectorRetrieval: vectorConfig.value.enabled,
    vectorConfig: {
      ...configForm.value.vectorConfig,
      provider: vectorConfig.value.provider,
      model: vectorConfig.value.model,
      dimension: getVectorDimensionByModel(vectorConfig.value.provider, vectorConfig.value.model),
      apiKey: vectorConfig.value.apiKey,
      baseUrl: vectorConfig.value.baseUrl,
      projectId: project.value?.id,
      topK: vectorConfig.value.topK,
      minScore: vectorConfig.value.minScore,
      vectorWeight: vectorConfig.value.vectorWeight
    }
  })

  configForm.value = merged
  return merged
}

function applyConfigToEditorState(config: ProjectConfig) {
  const normalizedConfig = normalizeProjectConfig(config)
  const fallbackAdvancedSettings = getDefaultProjectConfig().advancedSettings!
  const advancedSettings = normalizedConfig.advancedSettings ?? fallbackAdvancedSettings
  configForm.value = normalizedConfig

  advancedConfig.value = {
    temperature: advancedSettings.temperature,
    topP: advancedSettings.topP,
    maxTokens: advancedSettings.maxTokens,
    maxContextTokens: advancedSettings.maxContextTokens ?? 8192,
    recentChaptersCount: advancedSettings.recentChaptersCount ?? 3,
    targetWordCount: advancedSettings.targetWordCount ?? 2000,
    frequencyPenalty: advancedSettings.frequencyPenalty,
    presencePenalty: advancedSettings.presencePenalty,
    stopSequences: [...advancedSettings.stopSequences]
  }

  systemPrompts.value = {
    ...DEFAULT_SYSTEM_PROMPTS,
    ...normalizedConfig.systemPrompts
  }

  vectorConfig.value = {
    enabled: normalizedConfig.enableVectorRetrieval,
    provider: normalizedConfig.vectorConfig?.provider ?? 'local',
    model: normalizedConfig.vectorConfig?.model
      ?? (normalizedConfig.vectorConfig?.provider === 'openai'
        ? 'text-embedding-3-small'
        : 'Xenova/all-MiniLM-L6-v2'),
    apiKey: normalizedConfig.vectorConfig?.apiKey ?? '',
    baseUrl: normalizedConfig.vectorConfig?.baseUrl ?? '',
    topK: normalizedConfig.vectorConfig?.topK ?? 5,
    minScore: normalizedConfig.vectorConfig?.minScore ?? 0.6,
    vectorWeight: normalizedConfig.vectorConfig?.vectorWeight ?? 0.7
  }
}

onMounted(async () => {
  let initialConfig: ProjectConfig | null = null

  if (project.value?.config) {
    initialConfig = normalizeProjectConfig(project.value.config)
  } else {
    await projectStore.loadGlobalConfig()
    if (projectStore.globalConfig) {
      initialConfig = normalizeProjectConfig(projectStore.globalConfig)
    }
  }

  applyConfigToEditorState(initialConfig ?? normalizeProjectConfig(undefined))

  if (!configForm.value.providers) {
    configForm.value.providers = []
  }

  await _updateVectorIndexStatus()
})

async function saveConfig() {
  try {
    const normalizedConfig = getNormalizedConfigWithOverrides()

    if (project.value) {
      project.value.config = normalizedConfig
      await projectStore.saveCurrentProject()
      ElMessage.success('项目配置已保存')
    } else {
      await projectStore.saveGlobalConfig(normalizedConfig)
      ElMessage.success('全局配置已保存')
    }

    await _updateVectorIndexStatus()
  } catch (error) {
    logger.error('保存配置失败', error)
    ElMessage.error('保存配置失败：' + (error as Error).message)
  }
}

function exportConfig() {
  const config = getNormalizedConfigWithOverrides()
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

  reader.onload = async (e) => {
    try {
      const rawData = JSON.parse(e.target?.result as string) as Partial<ProjectConfig> & {
        advanced?: Partial<ProjectConfig['advancedSettings']>
      }

      const importedConfig = normalizeProjectConfig(rawData)
      applyConfigToEditorState(importedConfig)
      await _updateVectorIndexStatus()

      const providerCount = importedConfig.providers?.length || 0
      ElMessage.success(`配置已导入：${providerCount} 个提供商`)
    } catch (error) {
      logger.error('导入配置失败', error)
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
  const defaultConfig = normalizeProjectConfig(undefined)
  applyConfigToEditorState(defaultConfig)
  void _updateVectorIndexStatus()

  ElMessage.success('配置已重置')
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
    const config = buildVectorServiceConfig(project.value.id)

    // 重建前必须清理旧的缓存实例，否则配置更改不会生效
    clearVectorServiceCache()
    const vectorService = await getVectorService(config)

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
    logger.error('重建索引失败', error)
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

    const config = buildVectorServiceConfig(project.value.id)

    const vectorService = await getVectorService(config)
    await vectorService.clear()

    // 清理缓存
    clearVectorServiceCache()

    vectorIndexStatus.value = {
      indexed: false,
      documentCount: 0
    }

    ElMessage.success('索引已清空')
  } catch (error) {
    if (error !== 'cancel') {
      logger.error('清空索引失败', error)
      ElMessage.error('清空索引失败：' + (error as Error).message)
    }
  }
}

// 更新向量索引状态
async function _updateVectorIndexStatus() {
  if (!project.value || !vectorConfig.value.enabled) {
    vectorIndexStatus.value = null
    return
  }

  try {
    const config = buildVectorServiceConfig(project.value.id)

    const vectorService = await getVectorService(config)
    const documentCount = await vectorService.getDocumentCount()

    vectorIndexStatus.value = {
      indexed: documentCount > 0,
      documentCount
    }
  } catch (error) {
    logger.error('获取索引状态失败', error)
    vectorIndexStatus.value = null
  }
}

watch(() => project.value?.id, () => {
  void _updateVectorIndexStatus()
})

watch(() => vectorConfig.value.enabled, async (enabled) => {
  configForm.value.enableVectorRetrieval = enabled
  if (enabled) {
    await _updateVectorIndexStatus()
  } else {
    vectorIndexStatus.value = null
  }
})

watch(
  () => [
    vectorConfig.value.provider,
    vectorConfig.value.model,
    vectorConfig.value.apiKey,
    vectorConfig.value.baseUrl
  ],
  () => {
    void refreshVectorIndexStatusDebounced()
  }
)

onUnmounted(() => {
  refreshVectorIndexStatusDebounced.cancel()
})

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
