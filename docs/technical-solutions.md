# AI小说工坊 - 核心技术难点解决方案

## 一、100万字长篇的记忆系统设计

### 1.1 问题分析

**挑战**：
- 100万字 ≈ 50-100章节，上下文窗口无法容纳全文
- 人物、情节、设定散布全书，需要随时检索
- 生成新内容时需要参考相关历史信息
- 内存和存储限制

**核心需求**：
1. 快速检索相关信息
2. 保持全局一致性
3. 支持增量更新
4. 可扩展到更长的篇幅

### 1.2 三层记忆架构详解

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         记忆系统架构                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 活跃记忆 (Active Memory)                                         │    │
│  │ ├─ 当前章节全文                                                  │    │
│  │ ├─ 前2-3章摘要                                                   │    │
│  │ ├─ 当前场景人物                                                  │    │
│  │ └─ 存储: 内存 / 容量: ~50K tokens                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              ↓ 溢出归档                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 工作记忆 (Working Memory)                                        │    │
│  │ ├─ 当前卷/篇摘要集合                                             │    │
│  │ ├─ 人物状态快照                                                  │    │
│  │ ├─ 重要事件索引                                                  │    │
│  │ └─ 存储: IndexedDB / 容量: ~500K tokens                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              ↓ 压缩存储                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ 长期记忆 (Long-term Memory)                                      │    │
│  │ ├─ 核心设定向量库                                                │    │
│  │ ├─ 人物档案向量库                                                │    │
│  │ ├─ 情节线索向量库                                                │    │
│  │ ├─ 世界规则向量库                                                │    │
│  │ └─ 存储: ChromaDB / 容量: 无限制                                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 核心实现代码

```javascript
// memory-system.js
class MemorySystem {
  constructor(config = {}) {
    this.activeMemory = new ActiveMemory({
      maxTokens: config.activeTokens || 50000
    });
    this.workingMemory = new WorkingMemory({
      db: config.indexedDB
    });
    this.longTermMemory = new LongTermMemory({
      vectorStore: config.vectorStore,
      embeddingModel: config.embeddingModel
    });

    this.memoryThresholds = {
      activeToWorking: 0.8,   // 活跃记忆80%时归档
      workingToLongTerm: 100  // 工作记忆100章后压缩
    };
  }

  // 构建生成上下文
  async buildContext(task) {
    const context = {
      system: await this.getSystemPrompt(),
      core: await this.getCoreSettings(task),
      characters: await this.getCharacterContext(task),
      history: await this.getHistoricalContext(task),
      current: await this.getCurrentContent(task)
    };

    return this.optimizeContext(context, task.maxTokens);
  }

  // 获取核心设定
  async getCoreSettings(task) {
    const query = `${task.genre} ${task.theme} ${task.worldType}`;
    return this.longTermMemory.search('settings', query, { topK: 5 });
  }

  // 获取人物上下文
  async getCharacterContext(task) {
    const involvedCharacters = task.currentCharacters || [];

    // 从长期记忆获取人物档案
    const profiles = await Promise.all(
      involvedCharacters.map(c =>
        this.longTermMemory.get('characters', c.id)
      )
    );

    // 从工作记忆获取最新状态
    const states = await Promise.all(
      involvedCharacters.map(c =>
        this.workingMemory.getCharacterState(c.id)
      )
    );

    return this.mergeCharacterInfo(profiles, states);
  }

  // 获取历史上下文
  async getHistoricalContext(task) {
    // 1. 从活跃记忆获取最近章节
    const recentSummaries = await this.activeMemory.getRecentSummaries(3);

    // 2. 从工作记忆获取当前卷摘要
    const volumeSummary = await this.workingMemory.getVolumeSummary(
      task.currentVolume
    );

    // 3. 从长期记忆检索相关情节
    const relevantPlots = await this.longTermMemory.search(
      'plots',
      task.currentPlot,
      { topK: 10 }
    );

    // 4. 智能合并
    return this.mergeHistoricalContext({
      recent: recentSummaries,
      volume: volumeSummary,
      relevant: relevantPlots
    });
  }

  // 智能上下文优化（确保不超过token限制）
  optimizeContext(context, maxTokens) {
    let totalTokens = this.estimateTokens(context);
    let optimized = { ...context };

    // 优先级：系统 > 核心 > 人物 > 当前 > 历史
    const priorities = ['system', 'core', 'characters', 'current', 'history'];

    for (const key of priorities.reverse()) {
      if (totalTokens <= maxTokens) break;

      // 压缩低优先级内容
      optimized[key] = this.compress(optimized[key], {
        targetRatio: (maxTokens / totalTokens) * 0.9
      });
      totalTokens = this.estimateTokens(optimized);
    }

    return optimized;
  }

  // 更新记忆
  async update(newContent) {
    // 1. 更新活跃记忆
    await this.activeMemory.add(newContent);

    // 2. 检查是否需要归档
    if (this.activeMemory.utilization > this.memoryThresholds.activeToWorking) {
      const archived = await this.activeMemory.archiveOldest();
      await this.workingMemory.add(archived);
    }

    // 3. 提取关键信息到长期记忆
    const keyInfo = await this.extractKeyInformation(newContent);
    await this.longTermMemory.upsert(keyInfo);

    // 4. 更新人物状态
    await this.updateCharacterStates(newContent);
  }

  // 提取关键信息
  async extractKeyInformation(content) {
    const info = {
      characters: [],
      events: [],
      settings: [],
      relationships: []
    };

    // 使用AI提取关键信息
    const extracted = await this.aiExtract(content, {
      extractCharacters: true,
      extractEvents: true,
      extractSettings: true,
      extractRelationships: true
    });

    return extracted;
  }
}

// 活跃记忆实现
class ActiveMemory {
  constructor(config) {
    this.maxTokens = config.maxTokens;
    this.chapters = []; // { id, content, summary, tokens }
    this.currentChapter = null;
  }

  async add(content) {
    if (content.type === 'chapter') {
      // 生成摘要
      const summary = await this.generateSummary(content.text);

      this.chapters.push({
        id: content.id,
        content: content.text,
        summary: summary,
        tokens: this.countTokens(content.text),
        timestamp: Date.now()
      });

      // 只保留最近的章节
      while (this.calculateTotalTokens() > this.maxTokens) {
        this.chapters.shift();
      }
    }
  }

  get utilization() {
    return this.calculateTotalTokens() / this.maxTokens;
  }

  async archiveOldest() {
    if (this.chapters.length < 3) return null;

    const toArchive = this.chapters.slice(0, -2);
    this.chapters = this.chapters.slice(-2);

    return toArchive;
  }
}

// 长期记忆实现（向量存储）
class LongTermMemory {
  constructor(config) {
    this.vectorStore = config.vectorStore;
    this.embeddingModel = config.embeddingModel;

    // 分类集合
    this.collections = {
      settings: 'world_settings',
      characters: 'character_profiles',
      plots: 'plot_threads',
      events: 'major_events',
      rules: 'world_rules'
    };
  }

  async upsert(info) {
    for (const [type, items] of Object.entries(info)) {
      const collection = this.collections[type];
      if (!collection) continue;

      for (const item of items) {
        const embedding = await this.embeddingModel.embed(item.content);

        await this.vectorStore.upsert(collection, {
          id: item.id,
          embedding: embedding,
          metadata: {
            type: type,
            chapter: item.chapter,
            timestamp: Date.now(),
            ...item.metadata
          },
          document: item.content
        });
      }
    }
  }

  async search(type, query, options = {}) {
    const collection = this.collections[type];
    const queryEmbedding = await this.embeddingModel.embed(query);

    const results = await this.vectorStore.query(collection, {
      queryEmbedding: queryEmbedding,
      topK: options.topK || 10,
      where: options.filter,
      include: ['documents', 'metadatas', 'distances']
    });

    return results.map(r => ({
      content: r.document,
      metadata: r.metadata,
      score: 1 - r.distance
    }));
  }
}
```

### 1.4 摘要生成策略

```javascript
// 摘要生成器
class SummaryGenerator {
  constructor(aiClient) {
    this.ai = aiClient;
    this.summaryTypes = {
      chapter: {
        maxLength: 300,
        focus: ['主要事件', '人物变化', '情节推进']
      },
      volume: {
        maxLength: 500,
        focus: ['主线进展', '人物成长', '世界观展开']
      },
      book: {
        maxLength: 1000,
        focus: ['故事主题', '人物弧线', '核心冲突']
      }
    };
  }

  async generateSummary(content, type = 'chapter') {
    const config = this.summaryTypes[type];

    const prompt = `请为以下内容生成${type}级摘要：

内容：
${content.text}

摘要要求：
- 长度：${config.maxLength}字以内
- 重点包含：${config.focus.join('、')}
- 突出关键转折和人物变化
- 保留重要细节以便后续引用

请生成结构化摘要：`;

    const summary = await this.ai.generate(prompt, {
      model: 'haiku', // 使用轻量模型
      maxTokens: config.maxLength * 2
    });

    return this.parseSummary(summary);
  }

  parseSummary(text) {
    return {
      events: this.extractEvents(text),
      characters: this.extractCharacters(text),
      settings: this.extractSettings(text),
      fullText: text
    };
  }

  // 增量摘要更新
  async updateSummary(oldSummary, newContent) {
    const prompt = `基于现有摘要和新内容，更新摘要：

现有摘要：
${oldSummary.fullText}

新内容：
${newContent}

请合并更新，保持简洁：`;

    return this.ai.generate(prompt, { model: 'haiku' });
  }
}
```

---

## 二、向量检索实现方案

### 2.1 技术选型

**浏览器端向量数据库对比**：

| 方案 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| ChromaDB | 功能完整、支持多集合 | 需要IndexedDB后端 | 大规模数据 |
| LanceDB | 高性能、支持向量+标量 | 较新、文档少 | 实时查询 |
| hnswlib-wasm | 极快、轻量 | 需手动持久化 | 中小规模 |
| 自建 | 完全可控 | 开发成本高 | 特殊需求 |

**推荐方案**：ChromaDB（浏览器版）

### 2.2 实现代码

```javascript
// vector-store.js
import { ChromaClient } from 'chromadb';

class VectorStore {
  constructor(config = {}) {
    this.client = new ChromaClient({
      path: config.path || 'indexeddb://ai-novel-vectors'
    });

    this.embeddingModel = config.embeddingModel || new DefaultEmbedding();
    this.collections = {};
  }

  async initialize() {
    // 创建各类型集合
    const collectionConfigs = {
      settings: {
        name: 'world_settings',
        metadata: { 'hnsw:space': 'cosine' }
      },
      characters: {
        name: 'character_profiles',
        metadata: { 'hnsw:space': 'cosine' }
      },
      plots: {
        name: 'plot_threads',
        metadata: { 'hnsw:space': 'cosine' }
      },
      events: {
        name: 'major_events',
        metadata: { 'hnsw:space': 'cosine' }
      },
      content: {
        name: 'chapter_content',
        metadata: { 'hnsw:space': 'cosine', 'hnsw:M': 32 }
      }
    };

    for (const [key, config] of Object.entries(collectionConfigs)) {
      this.collections[key] = await this.client.getOrCreateCollection({
        name: config.name,
        metadata: config.metadata,
        embeddingFunction: this.embeddingModel
      });
    }
  }

  // 批量添加文档
  async addDocuments(collection, documents) {
    const ids = documents.map(d => d.id);
    const texts = documents.map(d => d.content);
    const metadatas = documents.map(d => d.metadata || {});

    await this.collections[collection].add({
      ids: ids,
      documents: texts,
      metadatas: metadatas
    });
  }

  // 混合检索（向量 + 关键词）
  async hybridSearch(collection, query, options = {}) {
    const vectorResults = await this.vectorSearch(collection, query, options);
    const keywordResults = await this.keywordSearch(collection, query, options);

    // 融合排序
    return this.rrfFusion(vectorResults, keywordResults, {
      k: options.rrfK || 60
    });
  }

  // 向量检索
  async vectorSearch(collection, query, options = {}) {
    const results = await this.collections[collection].query({
      queryTexts: [query],
      nResults: options.topK || 10,
      where: options.filter,
      include: ['documents', 'metadatas', 'distances']
    });

    return results.ids[0].map((id, i) => ({
      id,
      content: results.documents[0][i],
      metadata: results.metadatas[0][i],
      score: 1 - results.distances[0][i],
      source: 'vector'
    }));
  }

  // 关键词检索
  async keywordSearch(collection, query, options = {}) {
    // 使用BM25或简单的关键词匹配
    const keywords = this.extractKeywords(query);

    const results = await this.collections[collection].query({
      queryTexts: [query],
      nResults: options.topK || 10,
      where: {
        $or: keywords.map(k => ({
          content: { $contains: k }
        }))
      }
    });

    return results.ids[0].map((id, i) => ({
      id,
      content: results.documents[0][i],
      metadata: results.metadatas[0][i],
      score: this.bm25Score(query, results.documents[0][i]),
      source: 'keyword'
    }));
  }

  // RRF融合排序
  rrfFusion(vectorResults, keywordResults, options = {}) {
    const k = options.k || 60;
    const scores = new Map();

    // 向量结果打分
    vectorResults.forEach((r, i) => {
      const current = scores.get(r.id) || { result: r, score: 0 };
      current.score += 1 / (k + i + 1);
      scores.set(r.id, current);
    });

    // 关键词结果打分
    keywordResults.forEach((r, i) => {
      const current = scores.get(r.id) || { result: r, score: 0 };
      current.score += 1 / (k + i + 1);
      scores.set(r.id, current);
    });

    // 排序返回
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(s => ({
        ...s.result,
        finalScore: s.score
      }));
  }
}

// 嵌入模型封装
class EmbeddingModel {
  constructor(config = {}) {
    this.provider = config.provider || 'local';
    this.model = config.model || 'all-MiniLM-L6-v2';
    this.dimension = config.dimension || 384;

    // 本地模型使用ONNX Runtime
    if (this.provider === 'local') {
      this.session = null; // 延迟加载
    }
  }

  async initialize() {
    if (this.provider === 'local') {
      const ort = await import('onnxruntime-web');
      this.session = await ort.InferenceSession.create(
        `/models/${this.model}.onnx`
      );
    }
  }

  async embed(text) {
    if (this.provider === 'local') {
      return this.localEmbed(text);
    } else {
      return this.apiEmbed(text);
    }
  }

  async localEmbed(text) {
    // 分词
    const tokens = this.tokenize(text);

    // 运行模型
    const feeds = { input: new ort.Tensor('int64', tokens, [1, tokens.length]) };
    const results = await this.session.run(feeds);

    return Array.from(results.output.data);
  }

  async apiEmbed(text) {
    // 使用外部API（如OpenAI Embeddings）
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: text
      })
    });

    const data = await response.json();
    return data.data[0].embedding;
  }

  // 批量嵌入（提高效率）
  async batchEmbed(texts, batchSize = 32) {
    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await Promise.all(batch.map(t => this.embed(t)));
      results.push(...embeddings);
    }

    return results;
  }
}
```

### 2.3 索引优化策略

```javascript
// 索引管理器
class IndexManager {
  constructor(vectorStore) {
    this.store = vectorStore;
    this.indexStats = new Map();
  }

  // 增量索引
  async incrementalIndex(newContent) {
    // 1. 检测内容变化
    const changes = await this.detectChanges(newContent);

    // 2. 批量更新
    for (const [collection, items] of Object.entries(changes)) {
      await this.store.addDocuments(collection, items);
    }

    // 3. 更新统计
    this.updateStats(changes);
  }

  // 定期重建索引（优化检索质量）
  async rebuildIndex() {
    for (const [name, collection] of Object.entries(this.store.collections)) {
      // 获取所有数据
      const allData = await collection.get({
        include: ['documents', 'metadatas']
      });

      // 删除旧索引
      await this.store.client.deleteCollection({ name });

      // 重新创建
      this.store.collections[name] = await this.store.client.createCollection({
        name: name,
        metadata: { 'hnsw:space': 'cosine' }
      });

      // 重新添加（触发重新嵌入）
      await this.store.addDocuments(name, allData.documents.map((doc, i) => ({
        id: allData.ids[i],
        content: doc,
        metadata: allData.metadatas[i]
      })));
    }
  }

  // 索引健康检查
  async healthCheck() {
    const issues = [];

    for (const [name, collection] of Object.entries(this.store.collections)) {
      const count = await collection.count();

      // 检查索引大小
      if (count > 100000) {
        issues.push({
          collection: name,
          issue: 'index_too_large',
          recommendation: '考虑分片或清理旧数据'
        });
      }

      // 检查向量维度一致性
      // ...
    }

    return issues;
  }
}
```

---

## 三、分层模型路由算法

### 3.1 路由策略设计

```javascript
// model-router.js
class ModelRouter {
  constructor(config = {}) {
    this.providers = config.providers || {};
    this.strategies = new Map();
    this.costTracker = new CostTracker();
    this.performanceMonitor = new PerformanceMonitor();

    this.initializeStrategies();
    this.initializeProviders();
  }

  initializeProviders() {
    // 默认模型配置
    this.modelTiers = {
      planning: {
        primary: 'claude-opus-4-6',
        fallback: 'gpt-4-turbo',
        characteristics: {
          reasoning: 10,
          creativity: 10,
          coherence: 10,
          cost: 10 // 成本高
        }
      },
      writing: {
        primary: 'claude-sonnet-4-6',
        fallback: 'deepseek-v3',
        characteristics: {
          reasoning: 8,
          creativity: 9,
          coherence: 9,
          cost: 5
        }
      },
      checking: {
        primary: 'claude-haiku-4-5',
        fallback: 'local-model',
        characteristics: {
          reasoning: 6,
          creativity: 4,
          coherence: 7,
          cost: 1
        }
      }
    };
  }

  initializeStrategies() {
    // 1. 基于任务类型的路由
    this.strategies.set('task-based', async (task) => {
      const taskModelMap = {
        'worldbuilding': 'planning',
        'outline': 'planning',
        'plot-design': 'planning',

        'chapter': 'writing',
        'dialogue': 'writing',
        'description': 'writing',
        'scene': 'writing',

        'consistency-check': 'checking',
        'format-check': 'checking',
        'grammar-check': 'checking'
      };

      return taskModelMap[task.type] || 'writing';
    });

    // 2. 基于复杂度的路由
    this.strategies.set('complexity-based', async (task) => {
      const complexity = await this.assessComplexity(task);

      if (complexity > 0.8) return 'planning';
      if (complexity > 0.4) return 'writing';
      return 'checking';
    });

    // 3. 基于预算的路由
    this.strategies.set('budget-based', async (task, context) => {
      const remaining = context.budget.remaining;
      const estimatedCost = this.estimateCost(task);

      if (estimatedCost > remaining * 0.5) {
        return 'checking'; // 降级到便宜模型
      } else if (estimatedCost > remaining * 0.2) {
        return 'writing';
      } else {
        return this.getDefaultTier(task.type);
      }
    });

    // 4. 自适应路由
    this.strategies.set('adaptive', async (task, context) => {
      // 综合考虑多个因素
      const scores = {
        complexity: await this.assessComplexity(task),
        importance: task.importance || 0.5,
        urgency: task.urgency || 0.5,
        budgetRatio: context.budget ? context.budget.remaining / context.budget.total : 1,
        qualityTarget: context.qualityTarget || 0.8
      };

      // 加权决策
      const tierScore = {
        planning: scores.complexity * 0.4 + scores.importance * 0.3 + scores.qualityTarget * 0.3,
        writing: 0.5 + scores.importance * 0.2,
        checking: (1 - scores.complexity) * 0.5 + (1 - scores.qualityTarget) * 0.3
      };

      return Object.entries(tierScore)
        .sort((a, b) => b[1] - a[1])[0][0];
    });
  }

  // 路由主函数
  async route(task, context = {}) {
    const strategy = context.strategy || 'adaptive';
    const strategyFn = this.strategies.get(strategy);

    // 1. 确定模型层级
    const tier = await strategyFn(task, context);

    // 2. 获取具体模型
    const model = this.selectModel(tier, context);

    // 3. 记录路由决策
    this.logRouting(task, tier, model, context);

    return {
      tier,
      model,
      provider: this.getProvider(model),
      estimatedCost: this.estimateCost(task, model)
    };
  }

  // 复杂度评估
  async assessComplexity(task) {
    const factors = {
      // 内容复杂度
      length: Math.min(task.targetLength / 5000, 1),  // 目标长度
      characters: Math.min(task.characterCount / 10, 1), // 涉及角色数
      plotDepth: task.plotComplexity || 0.5,  // 情节复杂度

      // 技术复杂度
      worldBuilding: task.worldComplexity || 0.5,  // 世界观复杂度
      consistency: task.consistencyRequirement || 0.5,  // 一致性要求
      creativity: task.creativityLevel || 0.5,  // 创意要求

      // 上下文复杂度
      contextSize: Math.min(task.contextTokens / 10000, 1),
      references: Math.min(task.referenceCount / 20, 1)
    };

    // 加权求和
    const weights = {
      length: 0.15,
      characters: 0.1,
      plotDepth: 0.15,
      worldBuilding: 0.15,
      consistency: 0.15,
      creativity: 0.1,
      contextSize: 0.1,
      references: 0.1
    };

    let complexity = 0;
    for (const [key, value] of Object.entries(factors)) {
      complexity += value * weights[key];
    }

    return complexity;
  }

  // 模型选择
  selectModel(tier, context) {
    const tierConfig = this.modelTiers[tier];
    const provider = this.getProvider(tierConfig.primary);

    // 检查主模型可用性
    if (provider && provider.isAvailable()) {
      return tierConfig.primary;
    }

    // 回退到备用模型
    return tierConfig.fallback;
  }

  // 成本估算
  estimateCost(task, model) {
    const inputTokens = task.inputTokens || task.promptLength || 1000;
    const outputTokens = task.targetLength * 1.5;  // 中文约1.5倍

    const pricing = this.getPricing(model);

    return (inputTokens / 1000 * pricing.input) +
           (outputTokens / 1000 * pricing.output);
  }

  // 批量路由（优化成本）
  async batchRoute(tasks, context = {}) {
    const routes = [];

    // 分析任务集合
    const analysis = this.analyzeTasks(tasks);

    // 分组优化
    const groups = this.groupTasks(tasks, analysis);

    for (const group of groups) {
      // 组内使用相同模型（减少上下文切换）
      const groupContext = {
        ...context,
        groupAnalysis: group.analysis
      };

      const route = await this.route(group.tasks[0], groupContext);

      routes.push({
        tasks: group.tasks,
        route: route,
        estimatedCost: route.estimatedCost * group.tasks.length * 0.9 // 批量优惠
      });
    }

    return routes;
  }

  // 任务分组
  groupTasks(tasks, analysis) {
    const groups = {
      planning: { tasks: [], analysis: {} },
      writing: { tasks: [], analysis: {} },
      checking: { tasks: [], analysis: {} }
    };

    for (const task of tasks) {
      const tier = this.getDefaultTier(task.type);
      groups[tier].tasks.push(task);
    }

    return Object.values(groups).filter(g => g.tasks.length > 0);
  }
}
```

### 3.2 动态降级机制

```javascript
// 降级管理器
class DegradationManager {
  constructor(router) {
    this.router = router;
    this.degradationRules = new Map();
    this.healthStatus = new Map();

    this.initializeRules();
    this.startHealthCheck();
  }

  initializeRules() {
    // 降级规则
    this.degradationRules.set('rate-limit', {
      condition: (error) => error.status === 429,
      action: async (context) => {
        // 1. 等待重试
        await this.waitForRetry(error.retryAfter || 60);

        // 2. 切换提供商
        return this.switchProvider(context.model);
      }
    });

    this.degradationRules.set('timeout', {
      condition: (error) => error.code === 'ETIMEDOUT',
      action: async (context) => {
        // 切换到更快的模型
        return this.getFasterAlternative(context.model);
      }
    });

    this.degradationRules.set('budget-exceeded', {
      condition: (error) => error.code === 'BUDGET_EXCEEDED',
      action: async (context) => {
        // 降级到便宜模型
        return this.getCheaperAlternative(context.model);
      }
    });

    this.degradationRules.set('quality-issue', {
      condition: (error) => error.code === 'QUALITY_THRESHOLD',
      action: async (context) => {
        // 升级到更强模型
        return this.getBetterAlternative(context.model);
      }
    });
  }

  // 处理错误并降级
  async handleError(error, context) {
    for (const [name, rule] of this.degradationRules) {
      if (rule.condition(error)) {
        console.log(`触发降级规则: ${name}`);
        const alternative = await rule.action(context);

        return {
          degraded: true,
          rule: name,
          alternative: alternative,
          message: this.getDegradationMessage(name, alternative)
        };
      }
    }

    return { degraded: false };
  }

  // 健康检查
  startHealthCheck() {
    setInterval(async () => {
      for (const [provider, config] of Object.entries(this.router.providers)) {
        try {
          const health = await this.checkProviderHealth(provider);
          this.healthStatus.set(provider, health);
        } catch (error) {
          this.healthStatus.set(provider, {
            healthy: false,
            error: error.message
          });
        }
      }
    }, 60000); // 每分钟检查一次
  }
}
```

---

## 四、一致性检查算法

### 4.1 检查框架设计

```javascript
// consistency-checker.js
class ConsistencyChecker {
  constructor(config = {}) {
    this.memory = config.memory;
    this.ai = config.aiClient;
    this.rules = this.initializeRules();
    this.cache = new Map();
  }

  initializeRules() {
    return {
      // 人物一致性
      character: new CharacterConsistencyRule(),

      // 世界观一致性
      worldbuilding: new WorldbuildingConsistencyRule(),

      // 时间线一致性
      timeline: new TimelineConsistencyRule(),

      // 情节一致性
      plot: new PlotConsistencyRule(),

      // 风格一致性
      style: new StyleConsistencyRule()
    };
  }

  // 全面检查
  async checkFull(content, context) {
    const results = [];

    for (const [name, rule] of Object.entries(this.rules)) {
      const startTime = Date.now();

      try {
        const result = await rule.check(content, context);
        results.push({
          rule: name,
          ...result,
          duration: Date.now() - startTime
        });
      } catch (error) {
        results.push({
          rule: name,
          passed: false,
          error: error.message,
          duration: Date.now() - startTime
        });
      }
    }

    return this.aggregateResults(results);
  }

  // 快速检查（只检查关键规则）
  async quickCheck(content, context) {
    const criticalRules = ['character', 'timeline'];

    const results = await Promise.all(
      criticalRules.map(name => this.rules[name].check(content, context))
    );

    return results.every(r => r.passed);
  }

  // 聚合结果
  aggregateResults(results) {
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    return {
      overall: failed.length === 0,
      passedCount: passed.length,
      failedCount: failed.length,
      details: results,
      issues: failed.flatMap(f => f.issues || []),
      suggestions: failed.flatMap(f => f.suggestions || [])
    };
  }
}
```

### 4.2 具体规则实现

```javascript
// 人物一致性规则
class CharacterConsistencyRule {
  async check(content, context) {
    const issues = [];
    const suggestions = [];

    // 1. 提取当前内容中的角色
    const characters = await this.extractCharacters(content.text);

    // 2. 对每个角色进行检查
    for (const char of characters) {
      // 获取角色档案
      const profile = await context.memory.getCharacterProfile(char.name);

      if (!profile) {
        issues.push({
          type: 'unknown_character',
          message: `未知的角色: ${char.name}`,
          location: char.location
        });
        continue;
      }

      // 检查基本属性一致性
      const attributeCheck = this.checkAttributes(char, profile);
      issues.push(...attributeCheck.issues);

      // 检查行为合理性
      const behaviorCheck = await this.checkBehavior(char, profile, content, context);
      issues.push(...behaviorCheck.issues);
      suggestions.push(...behaviorCheck.suggestions);

      // 检查对话风格
      const dialogueCheck = await this.checkDialogue(char, profile, content);
      issues.push(...dialogueCheck.issues);
      suggestions.push(...dialogueCheck.suggestions);
    }

    return {
      passed: issues.length === 0,
      issues,
      suggestions
    };
  }

  checkAttributes(char, profile) {
    const issues = [];

    // 检查外貌描述
    if (char.appearance && char.appearance !== profile.appearance) {
      issues.push({
        type: 'attribute_mismatch',
        severity: 'warning',
        message: `角色 ${char.name} 的外貌描述与设定不符`,
        expected: profile.appearance,
        actual: char.appearance
      });
    }

    // 检查性格表现
    // 检查能力/技能
    // ...

    return { issues };
  }

  async checkBehavior(char, profile, content, context) {
    const issues = [];
    const suggestions = [];

    // 使用AI检查行为合理性
    const prompt = `角色信息：
姓名：${profile.name}
性格：${profile.personality}
背景：${profile.background}

当前行为：
${char.actions}

请判断该行为是否符合角色设定。如不符合，说明原因并给出建议。`;

    const analysis = await context.ai.generate(prompt, { model: 'haiku' });

    if (analysis.includes('不符合')) {
      issues.push({
        type: 'behavior_inconsistency',
        severity: 'warning',
        message: analysis,
        character: char.name
      });

      suggestions.push({
        type: 'behavior_fix',
        message: analysis
      });
    }

    return { issues, suggestions };
  }
}

// 时间线一致性规则
class TimelineConsistencyRule {
  async check(content, context) {
    const issues = [];

    // 1. 提取时间信息
    const timeInfo = await this.extractTimeInfo(content.text);

    // 2. 获取时间线
    const timeline = await context.memory.getTimeline();

    // 3. 检查时间顺序
    const orderCheck = this.checkTimeOrder(timeInfo, timeline);
    issues.push(...orderCheck.issues);

    // 4. 检查事件冲突
    const conflictCheck = this.checkEventConflicts(timeInfo, timeline);
    issues.push(...conflictCheck.issues);

    // 5. 检查人物年龄/状态
    const stateCheck = await this.checkCharacterStates(timeInfo, timeline, context);
    issues.push(...stateCheck.issues);

    return {
      passed: issues.length === 0,
      issues
    };
  }

  checkTimeOrder(timeInfo, timeline) {
    const issues = [];

    for (const event of timeInfo.events) {
      const previousEvents = timeline.filter(e =>
        e.timestamp < event.timestamp
      );

      // 检查因果一致性
      for (const dep of event.dependencies || []) {
        const depEvent = timeline.find(e => e.id === dep);
        if (!depEvent) {
          issues.push({
            type: 'missing_dependency',
            message: `事件 ${event.description} 依赖的前置事件 ${dep} 不存在`
          });
        }
      }
    }

    return { issues };
  }
}

// 情节一致性规则
class PlotConsistencyRule {
  async check(content, context) {
    const issues = [];
    const suggestions = [];

    // 1. 获取当前情节线
    const plotThreads = await context.memory.getPlotThreads();

    // 2. 分析内容对情节的影响
    const plotImpact = await this.analyzePlotImpact(content, plotThreads);

    // 3. 检查情节逻辑
    for (const thread of plotThreads) {
      const checkResult = await this.checkThreadConsistency(thread, content, context);
      issues.push(...checkResult.issues);
      suggestions.push(...checkResult.suggestions);
    }

    return {
      passed: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      suggestions
    };
  }

  async analyzePlotImpact(content, plotThreads) {
    // 使用AI分析情节影响
    const prompt = `当前情节线：
${plotThreads.map(t => `- ${t.name}: ${t.status}`).join('\n')}

新内容：
${content.text}

请分析：
1. 哪些情节线被推进了？
2. 是否有新的情节线出现？
3. 是否有情节线被意外结束？`;

    return await this.ai.generate(prompt, { model: 'haiku' });
  }
}
```

### 4.3 实时检查与批量检查

```javascript
// 检查模式切换
class CheckModeManager {
  constructor(checker) {
    this.checker = checker;
    this.mode = 'batch'; // 'realtime' | 'batch'

    // 实时检查配置
    this.realtimeConfig = {
      interval: 500,  // 每500ms检查一次
      maxQueueSize: 100,
      criticalRules: ['character', 'timeline']
    };

    // 批量检查配置
    this.batchConfig = {
      rules: 'all',
      parallelism: 3
    };
  }

  // 切换模式
  setMode(mode) {
    if (this.mode === 'realtime') {
      this.stopRealtimeCheck();
    }

    this.mode = mode;

    if (mode === 'realtime') {
      this.startRealtimeCheck();
    }
  }

  // 实时检查
  startRealtimeCheck() {
    this.queue = [];
    this.timer = setInterval(() => {
      this.processQueue();
    }, this.realtimeConfig.interval);
  }

  stopRealtimeCheck() {
    clearInterval(this.timer);
  }

  // 添加检查任务
  enqueue(content, context) {
    if (this.queue.length >= this.realtimeConfig.maxQueueSize) {
      // 丢弃最旧的
      this.queue.shift();
    }

    this.queue.push({ content, context, timestamp: Date.now() });
  }

  // 处理队列
  async processQueue() {
    if (this.queue.length === 0) return;

    // 合并最近的检查请求
    const latest = this.queue[this.queue.length - 1];
    this.queue = [];

    // 执行快速检查
    const result = await this.checker.quickCheck(latest.content, latest.context);

    // 发送结果
    this.emit('check-result', result);
  }

  // 批量检查
  async batchCheck(contents, context) {
    const results = [];

    // 并行处理
    const batches = this.chunk(contents, this.batchConfig.parallelism);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(c => this.checker.checkFull(c, context))
      );
      results.push(...batchResults);
    }

    return this.summarizeBatchResults(results);
  }
}
```

---

## 五、批量生成与实时模式切换

### 5.1 模式架构

```javascript
// generation-mode-manager.js
class GenerationModeManager {
  constructor(config = {}) {
    this.modes = {
      batch: new BatchGenerator(config),
      realtime: new RealtimeGenerator(config)
    };

    this.currentMode = 'batch';
    this.state = {
      paused: false,
      progress: 0,
      queue: [],
      completed: []
    };

    this.listeners = new Map();
  }

  // 切换模式
  async switchMode(newMode, options = {}) {
    if (this.currentMode === newMode) return;

    // 保存当前状态
    await this.saveState();

    // 切换模式
    this.currentMode = newMode;

    // 恢复状态
    await this.restoreState(options);

    this.emit('mode-changed', { mode: newMode });
  }

  // 保存状态
  async saveState() {
    const currentState = {
      mode: this.currentMode,
      state: { ...this.state },
      timestamp: Date.now()
    };

    await storage.set('generation-state', currentState);
  }

  // 恢复状态
  async restoreState(options) {
    const saved = await storage.get('generation-state');

    if (saved && options.continue) {
      this.state = saved.state;
    } else {
      this.resetState();
    }
  }
}
```

### 5.2 批量生成器

```javascript
class BatchGenerator {
  constructor(config) {
    this.config = {
      maxConcurrent: config.maxConcurrent || 3,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      checkpointInterval: config.checkpointInterval || 5 // 每5章保存一次
    };

    this.router = config.router;
    this.memory = config.memory;
    this.checker = config.checker;
  }

  // 批量生成
  async generateBatch(tasks, options = {}) {
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };

    // 初始化进度
    this.initializeProgress(tasks.length);

    // 创建任务队列
    const queue = new TaskQueue(this.config.maxConcurrent);

    for (const task of tasks) {
      queue.add(async () => {
        try {
          // 1. 路由模型
          const route = await this.router.route(task, options);

          // 2. 构建上下文
          const context = await this.memory.buildContext(task);

          // 3. 生成内容
          const content = await this.generateWithRetry(task, context, route);

          // 4. 质量检查
          const checkResult = await this.checker.checkFull(content, {
            memory: this.memory,
            ...options
          });

          if (!checkResult.overall) {
            // 尝试修复
            const fixed = await this.attemptFix(content, checkResult);

            if (fixed) {
              results.successful.push({ task, content: fixed });
            } else {
              results.failed.push({ task, content, issues: checkResult.issues });
            }
          } else {
            results.successful.push({ task, content });
          }

          // 5. 更新记忆
          await this.memory.update(content);

          // 6. 更新进度
          this.updateProgress();

          // 7. 检查点
          if (results.successful.length % this.config.checkpointInterval === 0) {
            await this.saveCheckpoint(results);
          }

        } catch (error) {
          results.failed.push({ task, error: error.message });
        }
      });
    }

    await queue.runAll();
    return results;
  }

  // 带重试的生成
  async generateWithRetry(task, context, route, attempt = 1) {
    try {
      const provider = this.router.getProvider(route.model);
      const content = await provider.generate({
        model: route.model,
        prompt: this.buildPrompt(task, context),
        maxTokens: task.targetLength * 2,
        temperature: task.temperature || 0.7
      });

      return content;

    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        await this.delay(this.config.retryDelay * attempt);

        // 降级重试
        const degradedRoute = await this.router.degrade(route);

        return this.generateWithRetry(task, context, degradedRoute, attempt + 1);
      }

      throw error;
    }
  }

  // 尝试修复
  async attemptFix(content, checkResult) {
    const issues = checkResult.issues.filter(i => i.severity === 'error');

    if (issues.length === 0) return content;

    // 使用AI修复
    const fixPrompt = `以下内容存在问题：

${content.text}

问题列表：
${issues.map(i => `- ${i.message}`).join('\n')}

请修复这些问题并输出修正后的内容。保持原有风格和情节。`;

    try {
      const fixed = await this.router.generate(fixPrompt, {
        model: 'writing',
        maxTokens: content.text.length * 1.2
      });

      return fixed;
    } catch {
      return null;
    }
  }

  // 保存检查点
  async saveCheckpoint(results) {
    await storage.set('batch-checkpoint', {
      timestamp: Date.now(),
      successful: results.successful,
      failed: results.failed,
      memory: await this.memory.export()
    });
  }

  // 从检查点恢复
  async restoreFromCheckpoint() {
    const checkpoint = await storage.get('batch-checkpoint');

    if (checkpoint) {
      await this.memory.import(checkpoint.memory);
      return checkpoint;
    }

    return null;
  }
}

// 任务队列
class TaskQueue {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.active = new Set();
  }

  add(task) {
    this.queue.push(task);
  }

  async runAll() {
    const results = [];

    while (this.queue.length > 0 || this.active.size > 0) {
      // 填充活跃任务
      while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
        const task = this.queue.shift();
        const promise = task().then(result => {
          this.active.delete(promise);
          results.push(result);
        });
        this.active.add(promise);
      }

      // 等待任意一个完成
      if (this.active.size > 0) {
        await Promise.race(this.active);
      }
    }

    return results;
  }
}
```

### 5.3 实时生成器

```javascript
class RealtimeGenerator {
  constructor(config) {
    this.config = {
      streamChunkSize: config.streamChunkSize || 100,
      interventionTimeout: config.interventionTimeout || 30000
    };

    this.router = config.router;
    this.memory = config.memory;
    this.checker = config.checker;
    this.interventionPoints = new InterventionManager();
  }

  // 实时生成（流式）
  async generateRealtime(task, options = {}) {
    const route = await this.router.route(task, options);
    const context = await this.memory.buildContext(task);
    const provider = this.router.getProvider(route.model);

    // 创建生成器
    const stream = provider.streamGenerate({
      model: route.model,
      prompt: this.buildPrompt(task, context),
      maxTokens: task.targetLength * 2,
      temperature: task.temperature || 0.7
    });

    let buffer = '';
    let sentenceBuffer = '';

    for await (const chunk of stream) {
      buffer += chunk;
      sentenceBuffer += chunk;

      // 按句子分割
      const sentences = this.splitSentences(sentenceBuffer);

      for (const sentence of sentences.complete) {
        // 检查干预点
        const intervention = await this.checkIntervention(sentence, task);

        if (intervention) {
          // 暂停生成，等待用户输入
          const userAction = await this.waitForIntervention(intervention);

          if (userAction.type === 'modify') {
            // 修改后继续
            buffer = userAction.newContent;
          } else if (userAction.type === 'stop') {
            return { content: buffer, stopped: true };
          }
          // 'continue' 则继续
        }

        // 实时检查
        const quickCheck = await this.checker.quickCheck(
          { text: sentence },
          { memory: this.memory }
        );

        if (!quickCheck) {
          // 发现问题，暂停
          const issue = await this.diagnoseIssue(sentence);
          this.emit('issue-detected', issue);
        }

        // 发送输出
        this.emit('chunk', sentence);
      }

      // 保留未完成的句子
      sentenceBuffer = sentences.incomplete;
    }

    // 最终检查
    const finalCheck = await this.checker.checkFull(
      { text: buffer },
      { memory: this.memory, ...options }
    );

    return {
      content: buffer,
      checkResult: finalCheck
    };
  }

  // 检查干预点
  async checkIntervention(sentence, task) {
    // 检查是否是关键节点
    const points = this.interventionPoints.check(sentence, task);

    if (points.length > 0) {
      return points[0]; // 返回第一个干预点
    }

    return null;
  }

  // 等待用户干预
  async waitForIntervention(intervention) {
    return new Promise((resolve) => {
      this.emit('intervention-required', intervention);

      const timeout = setTimeout(() => {
        resolve({ type: 'continue' }); // 超时自动继续
      }, this.config.interventionTimeout);

      this.once('intervention-response', (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  // 句子分割
  splitSentences(text) {
    const delimiters = ['。', '！', '？', '…', '\n'];
    const complete = [];
    let incomplete = '';

    // 简单分割逻辑
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (delimiters.includes(text[i])) {
        complete.push(text.slice(start, i + 1));
        start = i + 1;
      }
    }

    incomplete = text.slice(start);

    return { complete, incomplete };
  }
}

// 干预点管理器
class InterventionManager {
  constructor() {
    this.rules = [
      {
        id: 'plot-twist',
        trigger: (text, task) => {
          const keywords = ['突然', '意外', '原来', '竟然'];
          return keywords.some(k => text.includes(k));
        },
        type: 'warning',
        message: '检测到情节转折，是否需要调整？'
      },
      {
        id: 'character-death',
        trigger: (text, task) => {
          const keywords = ['死亡', '牺牲', '离世', '陨落'];
          return keywords.some(k => text.includes(k));
        },
        type: 'critical',
        message: '检测到角色死亡情节，请确认'
      },
      {
        id: 'major-event',
        trigger: (text, task) => {
          return task.majorEvents?.some(e => text.includes(e.keyword));
        },
        type: 'info',
        message: '触发重要事件'
      }
    ];
  }

  check(text, task) {
    return this.rules
      .filter(rule => rule.trigger(text, task))
      .map(rule => ({
        id: rule.id,
        type: rule.type,
        message: rule.message,
        options: this.getOptions(rule.type)
      }));
  }

  getOptions(type) {
    switch (type) {
      case 'critical':
        return ['确认继续', '修改内容', '暂停生成'];
      case 'warning':
        return ['继续', '调整方向', '跳过此段'];
      default:
        return ['继续', '暂停'];
    }
  }
}
```

### 5.4 模式切换机制

```javascript
// 无缝切换控制器
class SeamlessSwitchController {
  constructor(generationManager) {
    this.manager = generationManager;
    this.switchQueue = [];
    this.isSwitching = false;
  }

  // 请求切换
  async requestSwitch(newMode, context) {
    // 如果正在切换，排队等待
    if (this.isSwitching) {
      return new Promise((resolve) => {
        this.switchQueue.push({ newMode, context, resolve });
      });
    }

    this.isSwitching = true;

    try {
      // 1. 暂停当前生成
      const currentState = await this.pauseCurrent();

      // 2. 转换状态
      const convertedState = await this.convertState(currentState, newMode);

      // 3. 启动新模式
      await this.manager.switchMode(newMode, {
        continue: context.continue,
        state: convertedState
      });

      // 4. 恢复生成
      await this.resumeWith(newMode, convertedState);

      return { success: true, mode: newMode };

    } finally {
      this.isSwitching = false;

      // 处理队列中的切换请求
      const next = this.switchQueue.shift();
      if (next) {
        this.requestSwitch(next.newMode, next.context)
          .then(next.resolve);
      }
    }
  }

  // 暂停当前生成
  async pauseCurrent() {
    const currentGenerator = this.manager.modes[this.manager.currentMode];

    if (this.manager.currentMode === 'batch') {
      // 批量模式：保存当前进度
      return {
        completed: currentGenerator.completed,
        queue: currentGenerator.queue,
        progress: currentGenerator.progress
      };
    } else {
      // 实时模式：保存当前内容
      return {
        content: currentGenerator.currentContent,
        position: currentGenerator.currentPosition,
        context: currentGenerator.currentContext
      };
    }
  }

  // 状态转换
  async convertState(state, newMode) {
    if (this.manager.currentMode === 'batch' && newMode === 'realtime') {
      // 批量 -> 实时
      return {
        type: 'batch-to-realtime',
        content: state.completed[state.completed.length - 1]?.content || '',
        nextChapter: state.queue[0],
        previousContext: state.completed
      };
    } else {
      // 实时 -> 批量
      return {
        type: 'realtime-to-batch',
        currentContent: state.content,
        queue: [state.nextChapter].filter(Boolean)
      };
    }
  }

  // 恢复生成
  async resumeWith(mode, state) {
    const generator = this.manager.modes[mode];

    if (mode === 'batch') {
      await generator.restoreFromState(state);
    } else {
      await generator.continueFrom(state);
    }
  }
}
```

---

## 六、性能优化建议

### 6.1 内存优化

```javascript
// 内存管理器
class MemoryOptimizer {
  constructor(config) {
    this.memory = config.memory;
    this.thresholds = {
      activeMemory: 50 * 1024 * 1024,  // 50MB
      totalMemory: 500 * 1024 * 1024,  // 500MB
      warningLevel: 0.8
    };

    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      const usage = this.getMemoryUsage();

      if (usage.ratio > this.thresholds.warningLevel) {
        this.optimize();
      }
    }, 30000); // 每30秒检查一次
  }

  getMemoryUsage() {
    // 获取内存使用情况
    const performance = window.performance || {};
    const memory = performance.memory || {};

    return {
      used: memory.usedJSHeapSize || 0,
      total: memory.totalJSHeapSize || 0,
      ratio: (memory.usedJSHeapSize || 0) / (memory.jsHeapSizeLimit || 1)
    };
  }

  async optimize() {
    // 1. 清理活跃记忆中的旧数据
    await this.memory.activeMemory.compress();

    // 2. 归档工作记忆到长期记忆
    await this.memory.workingMemory.archive();

    // 3. 清理缓存
    this.clearCaches();

    // 4. 触发垃圾回收（如果可用）
    if (window.gc) {
      window.gc();
    }
  }

  clearCaches() {
    // 清理响应缓存
    this.responseCache?.clear();

    // 清理嵌入缓存
    this.embeddingCache?.prune(0.5); // 保留50%最常用的

    // 清理临时数据
    this.temporaryData?.clear();
  }
}
```

### 6.2 网络优化

```javascript
// 网络优化器
class NetworkOptimizer {
  constructor(config) {
    this.requestQueue = new PriorityQueue();
    this.connectionPool = new ConnectionPool(config.maxConnections || 3);
    this.rateLimiter = new RateLimiter(config.rateLimits);
  }

  // 优化的请求
  async optimizedRequest(request) {
    // 1. 检查缓存
    const cached = await this.cache.get(request.key);
    if (cached) return cached;

    // 2. 排队等待
    await this.rateLimiter.acquire();

    // 3. 发送请求
    try {
      const response = await this.connectionPool.request(request);

      // 4. 缓存结果
      await this.cache.set(request.key, response);

      return response;
    } finally {
      this.rateLimiter.release();
    }
  }
}

// 速率限制器
class RateLimiter {
  constructor(limits) {
    this.limits = limits; // { requestsPerMinute: 60, tokensPerMinute: 100000 }
    this.counters = {
      requests: { count: 0, resetAt: Date.now() + 60000 },
      tokens: { count: 0, resetAt: Date.now() + 60000 }
    };
  }

  async acquire() {
    // 检查并重置计数器
    const now = Date.now();
    for (const [key, counter] of Object.entries(this.counters)) {
      if (now > counter.resetAt) {
        counter.count = 0;
        counter.resetAt = now + 60000;
      }
    }

    // 检查限制
    if (this.counters.requests.count >= this.limits.requestsPerMinute) {
      const waitTime = this.counters.requests.resetAt - now;
      await this.delay(waitTime);
    }

    this.counters.requests.count++;
  }

  release() {
    // 连接返回连接池
  }
}
```

---

*文档版本：v1.0*
*最后更新：2026-03-20*
*作者：优化专家*
