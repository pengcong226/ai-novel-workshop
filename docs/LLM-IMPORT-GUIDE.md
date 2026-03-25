# LLM导入系统使用指南

## 概述

LLM导入系统是一个完整的、LLM驱动的小说分析系统，支持智能章节检测、人物识别、世界观提取和大纲生成。

## 核心功能

### ✅ 已完成功能

1. **智能章节检测**
   - 三轮对话式检测：模式识别 → 列表提取 → 验证修正
   - 快速/完整双模式支持
   - 自动填充章节内容和字数统计

2. **人物识别和关系提取**
   - 双轮对话：人物识别 → 关系提取
   - 角色分类（主角/配角/反派/路人）
   - 置信度评分
   - 快速模式分析前20%章节

3. **世界观提取**
   - 单轮对话提取完整世界观
   - 快速模式分析首/中/尾各5章
   - 支持多种世界类型识别

4. **大纲生成**
   - 单轮对话生成结构化大纲
   - 主线、支线、关键事件提取

5. **基础设施**
   - 多provider支持（Anthropic/OpenAI/Custom）
   - Token计数和成本估算
   - IndexedDB断点续传
   - JSON Schema验证
   - 完整的Prompt模板系统

## 快速开始

### 1. 基础使用

```typescript
import { analyzeNovelWithLLM, DEFAULT_QUICK_MODE_SAMPLING } from '@/utils/llm'

// 配置LLM
const config = {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  apiKey: 'your-api-key',
  maxTokens: 4000,
  temperature: 0.7,
  pricing: { input: 3, output: 15 }
}

// 读取小说文件
const novelText = await readFileAsText(file)

// 分析小说（快速模式）
const result = await analyzeNovelWithLLM(
  novelText,
  'quick',
  config,
  DEFAULT_QUICK_MODE_SAMPLING,
  (progress) => {
    console.log(`[${progress.stage}] ${progress.message} (${progress.current}%)`)
  }
)

console.log('检测到章节数:', result.chapters.length)
console.log('识别到人物数:', result.characters.length)
console.log('总字数:', result.stats.totalWords)
```

### 2. 完整模式

```typescript
// 完整模式：分析所有章节
const result = await analyzeNovelWithLLM(
  novelText,
  'full',
  config
)
```

### 3. 自定义快速模式配置

```typescript
const customSampling = {
  chapterDetection: {
    start: 10000,  // 前10000字符
    end: 5000,     // 后5000字符
    validation: "pattern-match-full-text"
  },
  characterExtraction: {
    chapters: "first-20-percent",
    minChapters: 15,
    maxChapters: 50
  },
  worldExtraction: {
    chapters: "first-5-middle-5-last-5"
  },
  outlineGeneration: {
    basis: "analyzed-chapters"
  }
}

const result = await analyzeNovelWithLLM(
  novelText,
  'quick',
  config,
  customSampling
)
```

## API文档

### analyzeNovelWithLLM()

主分析函数，协调整个分析流程。

```typescript
async function analyzeNovelWithLLM(
  text: string,                    // 小说文本
  mode: AnalysisMode,              // 'quick' | 'full'
  config: LLMProviderConfig,       // LLM配置
  quickModeSampling?: QuickModeSampling,  // 快速模式配置
  onProgress?: (progress: AnalysisProgress) => void  // 进度回调
): Promise<LLMAnalysisResult>
```

### 返回结果

```typescript
interface LLMAnalysisResult {
  mode: AnalysisMode

  chapters: LLMChapter[]           // 检测到的章节
  chapterPattern: ChapterPattern   // 章节模式

  characters: LLMCharacter[]       // 识别的人物
  relationships: LLMRelationship[] // 人物关系

  worldSetting: LLMWorldSetting    // 世界观设定
  outline: LLMOutline              // 大纲

  stats: {                         // 统计信息
    totalWords: number
    totalChapters: number
    avgWordsPerChapter: number
    analysisTime: number
    tokenUsage: {
      input: number
      output: number
    }
  }

  errors: Array<{                  // 错误信息
    stage: string
    message: string
    retryable: boolean
  }>
}
```

### 独立模块使用

也可以单独使用各个模块：

```typescript
import {
  detectChaptersWithLLM,
  extractCharactersWithLLM,
  extractWorldWithLLM,
  generateOutlineWithLLM
} from '@/utils/llm'

// 只检测章节
const { chapters, pattern } = await detectChaptersWithLLM(
  novelText,
  'quick',
  config,
  quickModeSampling
)

// 只识别人物
const { characters, relationships } = await extractCharactersWithLLM(
  novelText,
  chapters,
  'quick',
  config,
  quickModeSampling
)

// 只提取世界观
const worldSetting = await extractWorldWithLLM(
  novelText,
  chapters,
  'quick',
  config,
  quickModeSampling
)

// 只生成大纲
const outline = await generateOutlineWithLLM(chapters, config)
```

## 缓存和断点续传

系统自动缓存分析结果，支持断点续传：

```typescript
import { cacheManager, resumeAnalysisFromCache } from '@/utils/llm'

// 检查是否有缓存
const lastStage = await cacheManager.getLastStage(novelText)
if (lastStage && lastStage !== 'complete') {
  console.log('检测到未完成的分析，最后阶段:', lastStage)

  // 从缓存恢复
  const cachedResult = await resumeAnalysisFromCache(novelText)
  if (cachedResult) {
    // 继续分析...
  }
}

// 清除缓存
await cacheManager.deleteCache(novelText)

// 清理所有过期缓存
await cacheManager.cleanup()
```

## 成本估算

### 快速模式成本（默认配置）

- **章节检测**：~5000 input + ~1000 output tokens
- **人物识别**：~10000 input + ~2000 output tokens
- **世界观提取**：~15000 input + ~1000 output tokens
- **大纲生成**：~5000 input + ~1500 output tokens

**总计**：~35000 input + ~5500 output tokens

使用 Claude 3.5 Sonnet：
- 输入：$0.105 (35K × $3/1M)
- 输出：$0.0825 (5.5K × $15/1M)
- **总成本：~$0.19**

### 完整模式成本

取决于小说长度，通常是快速模式的3-5倍。

## 最佳实践

### 1. 选择合适的模式

```typescript
// 短篇小说（<10万字）：使用完整模式
if (wordCount < 100000) {
  mode = 'full'
}
// 中长篇小说（10-50万字）：使用快速模式
else if (wordCount < 500000) {
  mode = 'quick'
}
// 超长篇小说（>50万字）：使用快速模式，调整采样
else {
  mode = 'quick'
  sampling = {
    chapterDetection: { start: 5000, end: 2000 },
    characterExtraction: { chapters: "first-20-percent", minChapters: 10, maxChapters: 20 },
    worldExtraction: { chapters: "first-3-middle-3-last-3" },
    outlineGeneration: { basis: "analyzed-chapters" }
  }
}
```

### 2. 错误处理

```typescript
try {
  const result = await analyzeNovelWithLLM(text, 'quick', config)

  if (result.errors.length > 0) {
    console.warn('分析完成，但有错误:', result.errors)
  }

  // 使用结果
  processResult(result)

} catch (error) {
  console.error('分析失败:', error)

  // 从缓存恢复
  const cached = await resumeAnalysisFromCache(text)
  if (cached) {
    console.log('从缓存恢复成功')
    processResult(cached)
  }
}
```

### 3. 进度显示

```typescript
const result = await analyzeNovelWithLLM(
  text,
  'quick',
  config,
  sampling,
  (progress) => {
    // 更新UI进度条
    progressBar.value = progress.current

    // 显示阶段信息
    stageText.value = progress.message

    // 显示token使用
    if (progress.tokenUsage) {
      tokenText.value = `输入: ${progress.tokenUsage.input} / 输出: ${progress.tokenUsage.output}`
    }

    // 显示预估成本
    if (progress.estimatedCost) {
      costText.value = `预估成本: $${progress.estimatedCost.toFixed(4)}`
    }
  }
)
```

## 集成到现有项目

### Vue组件示例

```vue
<template>
  <div>
    <AnalysisProgress
      v-if="analyzing"
      :progress="currentProgress"
      :status="analysisStatus"
      :token-usage="tokenUsage"
      :estimated-cost="estimatedCost"
      @cancel="handleCancel"
    />

    <ChapterPreview
      v-if="result?.chapters"
      v-model="result.chapters"
      @confirm="handleConfirmChapters"
    />

    <CharacterPreview
      v-if="result?.characters"
      v-model="result.characters"
      :relationships="result.relationships"
      @confirm="handleConfirmCharacters"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { analyzeNovelWithLLM } from '@/utils/llm'
import AnalysisProgress from '@/components/novel-import/AnalysisProgress.vue'
import ChapterPreview from '@/components/novel-import/ChapterPreview.vue'
import CharacterPreview from '@/components/novel-import/CharacterPreview.vue'

const analyzing = ref(false)
const analysisStatus = ref('idle')
const currentProgress = ref(null)
const tokenUsage = ref({ input: 0, output: 0 })
const estimatedCost = ref(0)
const result = ref(null)

async function startAnalysis(file) {
  analyzing.value = true
  analysisStatus.value = 'running'

  const text = await file.text()
  const config = getLLMConfig() // 从项目配置获取

  result.value = await analyzeNovelWithLLM(
    text,
    'quick',
    config,
    undefined,
    (progress) => {
      currentProgress.value = progress
      if (progress.tokenUsage) {
        tokenUsage.value = progress.tokenUsage
        estimatedCost.value = calculateCost(progress.tokenUsage)
      }
    }
  )

  analysisStatus.value = 'completed'
  analyzing.value = false
}
</script>
```

## 故障排查

### 问题：LLM返回的JSON格式不正确

**解决方案**：系统已内置JSON Schema验证和自动重试机制。如果仍有问题：

```typescript
// 检查LLM输出
const result = await callLLM(prompt, config)
console.log('原始输出:', result.content)

// 手动验证
import { validateLLMOutput, chapterListSchema } from '@/utils/llm'
const validation = validateLLMOutput(result.content, chapterListSchema)
console.log('验证结果:', validation)
```

### 问题：成本过高

**解决方案**：使用快速模式并调整采样配置：

```typescript
const sampling = {
  chapterDetection: { start: 3000, end: 1000 },  // 减少采样
  characterExtraction: { chapters: "first-10-percent", minChapters: 5, maxChapters: 15 },
  worldExtraction: { chapters: "first-3-middle-3-last-3" },
  outlineGeneration: { basis: "analyzed-chapters" }
}
```

### 问题：断点续传不工作

**解决方案**：检查IndexedDB：

```typescript
// 查看所有缓存
const caches = await cacheManager.getAllCaches()
console.log('缓存列表:', caches)

// 检查存储空间
const hasSpace = await cacheManager.checkStorageQuota()
console.log('存储空间充足:', hasSpace)
```

## 性能优化建议

1. **使用快速模式**：对于长篇小说，快速模式可以节省70%成本
2. **调整采样配置**：根据小说特点调整采样策略
3. **使用缓存**：系统自动缓存，避免重复分析
4. **批量处理**：对于多个文件，考虑串行处理以控制成本

## 已知限制

1. **Token限制**：单次分析最多处理约200K tokens（取决于模型）
2. **网络依赖**：需要稳定的网络连接
3. **API限制**：受LLM provider的API限制影响
4. **成本**：完整模式成本较高，建议先用快速模式

## 未来改进方向

- [ ] 流式输出支持
- [ ] 本地模型支持
- [ ] 多语言支持
- [ ] 更精细的采样策略
- [ ] 实时预览集成

---

**版本**：1.0.0
**更新日期**：2026-03-21
