# AI Novel Workshop 技术维度优化方案

**编写人**：开发工程师
**编写日期**：2026-05-28
**依据**：技术审视报告（`/data/share/project/ai-novel-workshop/reports/技术审视报告-2026-05-28.md`）

---

## 优先级定义

| 等级 | 含义 | 处理原则 |
|------|------|----------|
| **P0** | 阻断性缺陷/严重安全风险 | 必须立即修复 |
| **P1** | 核心功能缺陷/性能瓶颈/代码正确性 | 高优先级修复 |
| **P2** | 代码质量/可维护性/中等性能优化 | 计划内修复 |
| **P3** | 锦上添花/长期技术债务 | 有空再做 |

---

## P0 级：阻断性缺陷 / 严重安全风险

### P0-1：Token 估算公式统一

**问题描述**：
项目中存在 4 处独立的 `estimateTokens` 实现，且公式方向相反，导致同一文本在不同模块得到完全不同的 token 数。这直接影响 AI 上下文预算管理的准确性——某个模块认为还有余量，另一个模块认为已超限。

**涉及文件及行号**：

| 文件 | 行号 | 当前公式 | 问题 |
|------|------|----------|------|
| `src/utils/context/pipeline.ts` | 第 66-69 行 | `chineseChars * 1.5 + englishWords + otherChars / 3` | fallback 估算 |
| `src/utils/llm/tokenizer.ts` | 第 37-56 行 | `chineseChars / 1.5 + englishWords + otherChars / 4` | **方向相反**（除以 1.5 严重低估中文 token） |
| `src/utils/summarizer.ts` | 第 113-121 行 | `chineseChars * 1.5 + englishWords * 1.2 + otherChars * 0.5` | 独立重复实现 |
| `src/utils/contextBuilder.ts` | 第 17 行 | 通过 `pipeline.ts` 间接导入 | 依赖链过长 |

**优化目标**：统一为单一估算函数，所有模块引用同一实现。

**具体修改方案**：

1. **`src/utils/llm/tokenizer.ts`**：
   - 新增统一导出函数 `estimateTokens(text: string): number`，作为全局唯一的 fallback 估算入口
   - 修正 `estimateClaudeTokens`（第 37-56 行）中 `otherChars` 的计算维度混用问题：第 45 行 `const otherChars = text.length - chineseChars - englishWords` 中 `englishWords` 是单词数而非字符数，应改为统计英文字符数
   - 统一公式为：`chineseChars * 1.5 + englishChars / 4 + otherChars / 3`（中文约 1.5 token/字符，英文约 4 字符/token，其他约 3 字符/token）

2. **`src/utils/context/pipeline.ts`**：
   - 第 3 行：已从 `../llm/tokenizer` 导入 `countTokens`
   - 第 61-71 行的 `estimateTokens` 函数：删除此独立实现，改为从 `../llm/tokenizer` 重新导入统一版本
   - 第 64 行：`countLLMTokens(text, 'openai')` 硬编码 `'openai'`，应改为可配置参数

3. **`src/utils/summarizer.ts`**：
   - 第 113-121 行：删除本地的 `estimateTokens` 定义，改为从 `./llm/tokenizer` 导入统一版本

4. **`src/utils/contextBuilder.ts`**：
   - 第 17 行：`import { ... estimateTokens ... } from './context/pipeline'` 改为直接从 `'./llm/tokenizer'` 导入，缩短依赖链

**预期效果**：所有模块对同一文本的 token 估算一致，上下文预算管理准确可靠。

---

### P0-2：LLM 调用双重重试消除

**问题描述**：`callLLMWithValidation` 外层有重试循环（maxRetries=3），内层 `callLLM` 又将 `maxRetries` 传给 `AIService` 的内部重试，最坏情况实际 API 调用 3×3=9 次，导致 API 成本意外放大。

**涉及文件及行号**：
- `src/utils/llm/llmCaller.ts` 第 245-250 行：外层 `for (let attempt = 1; attempt <= maxRetries; attempt++)`
- `src/utils/llm/llmCaller.ts` 第 249 行：`const result = await callLLM(currentPrompt, config, { ...options, maxRetries })`

**优化目标**：明确双层重试的职责边界，避免嵌套放大。

**具体修改方案**：

- 第 249 行：调用 `callLLM` 时将 `maxRetries` 设为 `1`（禁用内层重试），因为外层 `callLLMWithValidation` 已负责"验证失败→反馈错误→重试"的循环
- 第 273 行：验证失败后的 `await sleep(1000 * attempt)` 应降低为 `await sleep(500)`（固定），因为 JSON 格式问题不会因等待更久而改善
- 第 284 行：API 调用失败后的 sleep 保留指数退避（合理）

**预期效果**：最坏 API 调用次数从 9 次降为 3 次，成本风险降低 3 倍。

---

### P0-3：LLM 调用默认超时修正

**问题描述**：默认超时 30 分钟（1800000ms），API 不可达时用户需等极长时间才能得到错误反馈。

**涉及文件及行号**：
- `src/utils/llm/llmCaller.ts` 第 169 行：`timeout = 1800000`

**优化目标**：将默认超时调整为合理范围。

**具体修改方案**：

- 第 169 行：改为 `timeout = 180000`（3 分钟），对大多数 LLM 调用已足够
- 对于批量生成等需要更长等待的场景，由 `generation-scheduler.ts` 的 `executeBatchGeneration` 通过 `options.timeout` 传入更长超时（如 600000ms = 10 分钟）

**预期效果**：API 异常时用户等待时间从 30 分钟降为 3 分钟。

---

### P0-4：加密模块安全加固

**问题描述**：
1. 密钥派生未使用 KDF，直接从可预测的环境字符串截取 32 字节作为 AES 密钥
2. 环境种子依赖 `navigator.userAgent`，浏览器更新会导致所有已加密密钥无法解密
3. V1 XOR 加密仍在 fallback 路径中被调用

**涉及文件及行号**：
- `src/utils/crypto.ts` 第 56-66 行：`deriveAESKey` 直接 `padEnd(32, '0').slice(0, 32)` 作为密钥材料
- `src/utils/crypto.ts` 第 10-16 行：`getEnvironmentSeed` 包含 `navigator.userAgent`
- `src/utils/crypto.ts` 第 124-127 行：`decryptApiKeyV2` 中 fallback 到 V1 解密

**优化目标**：使用标准 KDF 派生密钥，消除 userAgent 依赖，逐步淘汰 V1。

**具体修改方案**：

1. **第 56-66 行**：将 `deriveAESKey` 改为使用 PBKDF2：
   ```typescript
   async function deriveAESKey(seed: string): Promise<CryptoKey> {
     const encoder = new TextEncoder()
     const keyMaterial = await crypto.subtle.importKey(
       'raw', encoder.encode(seed), 'PBKDF2', false, ['deriveBits', 'deriveKey']
     )
     return crypto.subtle.deriveKey(
       { name: 'PBKDF2', salt: encoder.encode(APP_SECRET_SEED), iterations: 100000, hash: 'SHA-256' },
       keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
     )
   }
   ```

2. **第 10-16 行**：移除 `navigator.userAgent` 依赖，仅保留 `runtime` 和 `origin`（对 Tauri 端使用 `__TAURI_INTERNALS__` 的唯一标识）
   ```typescript
   function getEnvironmentSeed(): string {
     const runtime = isWebRuntime() ? 'web' : 'tauri'
     const origin = typeof window !== 'undefined' ? window.location.origin : 'tauri-local'
     return `${APP_SECRET_SEED}:${runtime}:${origin}`
   }
   ```

3. **第 124-127 行**：V1 解密后立即用 V2 重新加密并存储，实现自动迁移：
   ```typescript
   if (encrypted.startsWith('enc:v1:')) {
     const plaintext = decryptApiKeyV1(encrypted)
     const reEncrypted = await encryptApiKeyV2(plaintext)
     // 调用方负责将 reEncrypted 写回存储
     return { value: plaintext, migrated: reEncrypted }
   }
   ```

**预期效果**：密钥安全性大幅提升（PBKDF2 10万次迭代），浏览器更新不再导致解密失败。

---

### P0-5：ReDoS 防护

**问题描述**：`regex-script.ts` 中用户可提交恶意正则表达式（如 `(a+)+$`），直接 `new RegExp()` 构造后对大文本执行 `replace`，可导致浏览器主线程卡死。

**涉及文件及行号**：
- `src/services/regex-script.ts` 第 374-386 行：`parseRegexString` 无恶意模式检测
- `src/services/regex-script.ts` 第 349 行：`replacedText.replace(regex, ...)` 无超时保护

**优化目标**：防止恶意正则导致的 DoS 攻击。

**具体修改方案**：

1. **第 374-386 行**：添加正则安全检查（复用 `worldbook-injector.ts` 中已有的 `createSafeRegex` 模式）：
   ```typescript
   private parseRegexString(regexString: string): RegExp {
     if (regexString.length > 1000) {
       throw new Error('正则表达式过长，最大1000字符')
     }
     // 检测嵌套量词
     if (/\([^)]*[+*][^)]*\)[+*]/.test(regexString)) {
       throw new Error('检测到潜在的ReDoS模式（嵌套量词）')
     }
     const match = regexString.match(/^\/(.*)\/([gimsuy]*)$/)
     if (match) return new RegExp(match[1], match[2])
     return new RegExp(regexString)
   }
   ```

2. **第 320 行前**：添加文本长度检查，超过 100KB 的文本不执行正则脚本

**预期效果**：消除 ReDoS 攻击向量，浏览器不会因恶意正则卡死。

---

### P0-6：CSP 安全策略添加

**问题描述**：`index.html` 完全没有 Content-Security-Policy，无法限制脚本来源、连接来源，XSS 防护缺失。

**涉及文件及行号**：
- `index.html` 第 3-7 行：`<head>` 区域

**优化目标**：添加基础 CSP 策略限制资源加载来源。

**具体修改方案**：

在 `<title>` 标签后添加：
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://tokenpony.cn;
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://api.anthropic.com https://api.openai.com http://localhost:* https:;
  img-src 'self' data: blob:;
  font-src 'self' data:;
">
```

> 注：`'unsafe-inline'` 和 `'unsafe-eval'` 是因为 Vite 开发模式需要，Element Plus 也使用内联样式。`https://tokenpony.cn` 是项目要求的功能插件域名。

**预期效果**：限制外部脚本加载，降低 XSS 攻击风险。

---

### P0-7：GenerationScheduler 并发安全修复

**问题描述**：`GenerationScheduler` 是单例，`isBatchCancelled` 和 `generationRunId` 是实例变量，如果同时发起两次批量生成，后一次会覆盖前一次的取消状态。

**涉及文件及行号**：
- `src/services/generation-scheduler.ts` 第 81-82 行：`private isBatchCancelled = false`、`private generationRunId = 0`

**优化目标**：确保多次批量生成互不干扰。

**具体修改方案**：

将取消状态从实例变量改为基于 `generationRunId` 的原子判断：

```typescript
// 第 81-82 行改为：
private currentRunId = 0

// cancelBatchGeneration（第 85-88 行）改为：
cancelBatchGeneration(): void {
  this.currentRunId++  // 递增 runId 使旧 run 无效
}

// executeBatchGeneration（第 446 行起）中：
const runId = ++this.currentRunId
// 在所有关键检查点使用：
if (runId !== this.currentRunId) return  // 已被新生成取代
```

**预期效果**：多次批量生成互不干扰，取消操作精确作用于目标生成。

---

## P1 级：核心功能缺陷 / 性能瓶颈

### P1-1：Element Plus 按需导入

**问题描述**：Element Plus 全量导入增加约 500KB+ 打包体积。

**涉及文件及行号**：
- `src/main.ts` 第 3-4 行：`import ElementPlus from 'element-plus'` + `import 'element-plus/dist/index.css'`
- `src/main.ts` 第 76 行：`app.use(ElementPlus)` 全局注册

**优化目标**：按需导入 Element Plus 组件，减少打包体积约 500KB。

**具体修改方案**：

1. 安装 `unplugin-vue-components` 和 `unplugin-auto-import`
2. `vite.config.ts` 中添加插件配置：
   ```typescript
   import AutoImport from 'unplugin-auto-import/vite'
   import Components from 'unplugin-vue-components/vite'
   import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

   plugins: [
     AutoImport({ resolvers: [ElementPlusResolver()] }),
     Components({ resolvers: [ElementPlusResolver()] }),
   ]
   ```
3. `src/main.ts` 第 3-4 行：删除 `import ElementPlus from 'element-plus'` 和 `import 'element-plus/dist/index.css'`
4. `src/main.ts` 第 76 行：删除 `app.use(ElementPlus)`
5. 保留 `ElMessage`、`ElNotification`、`ElMessageBox` 等命令式 API 的手动导入（它们不会被自动注册）

**预期效果**：打包体积减少约 500KB（gzip 后约 150KB+），首屏加载速度提升。

---

### P1-2：大文件拆分 — ai-service.ts（1578行→~600行）

**问题描述**：`ai-service.ts` 包含 3 个 Provider 类、速率限制器、成本追踪器、5 个错误类、主服务类，严重违反单一职责。

**涉及文件**：`src/services/ai-service.ts`

**优化目标**：拆分为 7 个独立模块，主文件瘦身至约 600 行。

**具体修改方案**：

| 目标文件 | 内容来源 | 原行号范围 |
|----------|----------|-----------|
| `src/services/ai/types.ts` | 接口/类型定义、常量 | 第 36-155 行 |
| `src/services/ai/errors.ts` | AIServiceError, RateLimitError, BudgetExceededError, ModelUnavailableError, assertOnlineForAIRequest | 第 157-224 行 |
| `src/services/ai/rate-limiter.ts` | RateLimiter 类 | 第 230-349 行 |
| `src/services/ai/cost-tracker.ts` | CostTracker 类 | 第 354-594 行 |
| `src/services/ai/providers/openai-provider.ts` | OpenAIProvider 类 | 第 600-725 行 |
| `src/services/ai/providers/claude-provider.ts` | ClaudeProvider 类 | 第 730-908 行 |
| `src/services/ai/providers/local-provider.ts` | LocalProvider 类 | 第 914-987 行 |
| `src/services/ai-service.ts`（瘦身） | AIService 主类 + re-export | 第 993-1578 行 |

**模块间依赖**：AIService 依赖所有拆分出的模块；Provider 类仅依赖 `errors.ts`；`CostTracker` 依赖 `errors.ts` 和 `types.ts`。无循环依赖风险。

**同步修改**：`src/services/ai/CircuitBreaker.ts`、`FailoverManager.ts`、`ModelRouter.ts`、`index.ts` 的导入路径无需变更（它们已经在 `ai/` 子目录下）。

**预期效果**：每个文件职责单一，便于独立测试和维护。

---

### P1-3：大文件拆分 — generation-scheduler.ts（1043行→~100行骨架）

**问题描述**：`executeBatchGeneration` 单方法 544 行，`updateProjectSettings` 单方法 259 行。

**涉及文件**：`src/services/generation-scheduler.ts`

**优化目标**：拆分为 4 个独立模块。

**具体修改方案**：

| 目标文件 | 内容来源 | 原行号范围 |
|----------|----------|-----------|
| `src/services/generation/types.ts` | `BatchGenerationOptions` 接口、`buildGenerationOptions`、`HIGH_IMPACT_KEYWORDS`、`hasHighImpactContent` | 第 28-77 行 |
| `src/services/generation/entity-extractor.ts` | `updateProjectSettings` 方法（实体抽取/关系分析/世界体系/状态追踪） | 第 185-443 行 |
| `src/services/generation/agent-orchestrator.ts` | Agent 编排逻辑（`enqueuePostGenerationAgents`、`runExtractionInBackground`、`runPreGenerationAgents`、`runPostGenerationAgents`、`consultPlanner`） | 第 90-183 行 + 第 995-1039 行 |
| `src/services/generation/batch-generator.ts` | `executeBatchGeneration` 主循环逻辑 | 第 446-989 行 |
| `src/services/generation-scheduler.ts`（瘦身） | GenerationScheduler 类骨架 + cancelBatchGeneration + 导出 | 第 79-88 行 + 第 1042 行 |

**预期效果**：每个模块可独立测试，新增功能不再堆叠到超大文件中。

---

### P1-4：大文件拆分 — storage.ts（936行→~170行）

**问题描述**：IndexedDBStorage（523行）和 TauriStorage（201行）与 Pinia store 混在同一文件。

**涉及文件**：`src/stores/storage.ts`

**优化目标**：拆分为 3 个文件，并提取显式 `StorageBackend` 接口。

**具体修改方案**：

| 目标文件 | 内容来源 | 原行号范围 |
|----------|----------|-----------|
| `src/stores/storage/types.ts` | 常量（DB_NAME 等）、工具函数（isValidId、assertValidChapterSnapshot）、新增 `StorageBackend` 接口定义 | 第 1-44 行 + 新增接口 |
| `src/stores/storage/indexeddb-storage.ts` | IndexedDBStorage 类 | 第 46-568 行 |
| `src/stores/storage/tauri-storage.ts` | TauriStorage 类 | 第 570-770 行 |
| `src/stores/storage.ts`（瘦身） | useStorage Pinia store | 第 772-935 行 |

**新增 `StorageBackend` 接口**：
```typescript
interface StorageBackend {
  init(): Promise<void>
  loadProjectsList(): Promise<ProjectListItem[]>
  saveProjectsList(list: ProjectListItem[]): Promise<void>
  loadProject(projectId: string): Promise<Project | null>
  saveProject(project: Project): Promise<void>
  deleteProject(projectId: string): Promise<void>
  loadChapter(projectId: string, chapterId: string): Promise<Chapter | null>
  saveChapter(projectId: string, chapter: Chapter): Promise<void>
  deleteChapter(projectId: string, chapterId: string): Promise<void>
  reorderChapters(projectId: string, chapterIds: string[]): Promise<void>
  // ... 快照方法
}
```

**预期效果**：消除运行时 `isWebRuntime()` 检查散布在每个方法中的问题，通过接口多态实现存储切换。

---

### P1-5：错误处理统一

**问题描述**：项目中存在 throw/静默吞没（warn）/返回 null 三种错误处理模式混用，V5 bridge 同步失败完全不通知用户。

**涉及文件及行号**：

| 文件 | 行号 | 问题 | 修改方案 |
|------|------|------|----------|
| `src/stores/character-card.ts` | 第 516-518 行 | `syncFromSandbox` catch 仅 warn | 改为 `logger.error` + 设置 `error.value` |
| `src/stores/character-card.ts` | 第 586-588 行 | `dispatchToSandbox` catch 仅 warn | 同上 |
| `src/stores/worldbook.ts` | 第 296-298, 353-355, 389-391, 420-422, 459-461, 825-827, 889-891 行 | 7 处 V5 bridge catch 仅 warn | 统一改为 `logger.error` + 新增 `bridgeError` ref 暴露错误状态 |
| `src/stores/storage.ts` | 第 218-220 行 | IndexedDB `loadProject` 返回 null | 在 `useStorage` 的 `loadProject`（第 793 行）增加判空抛错 |
| `src/stores/storage.ts` | 第 622-624 行 | Tauri `loadProject` 返回 null | 改为 `throw new Error(...)` |
| `src/stores/vector.ts` | 第 179-181 行 | `refreshStats` 空 catch | 添加 `logger.debug` |
| `src/assistant/actions/actionEnvelope.ts` | 第 24-26 行 | JSON 解析错误静默忽略 | 添加 `logger.warn` 并扩展 ParseResult 类型 |

**统一错误处理策略**：
1. **数据持久化层**（storage/store）：I/O 错误一律 throw，由上层决定降级策略
2. **V5 bridge 层**：设置 `bridgeError` ref，UI 层可选择展示"同步失败"提示
3. **AI 调用层**：保留现有的重试+熔断+降级机制
4. **UI 辅助层**（refreshStats 等）：允许静默失败，但必须记录日志

**预期效果**：错误处理行为一致可预期，V5 bridge 同步失败不再被用户无感知地忽略。

---

### P1-6：内存泄漏修复

**问题描述**：多处数据结构无限增长或缺乏防抖机制。

**涉及文件及行号**：

| 文件 | 行号 | 问题 | 修改方案 |
|------|------|------|----------|
| `src/services/ai-service.ts` | 第 359, 419-422 行 | `CostTracker.records` 无限增长 | 添加上限裁剪：超过 10000 条时保留最近 5000 条 |
| `src/stores/tokenUsage.ts` | 第 37-39 行 | 每次记录全量复制+排序+截断 | 改为直接 push + 仅在超限时裁剪（新 timestamp 总是最大，无需排序） |
| `src/stores/suggestions.ts` | 第 195-206 行 + 10 处调用点 | `saveToStorage` 缺乏防抖 | 改为 500ms 防抖写入 |
| `src/stores/taskManager.ts` | 第 29, 57 行 | `tasks` 数组只增不减 | 在 `completeTask`/`failTask`/`cancelTask` 后自动清理已完成任务（保留最近 50 条） |
| `src/stores/taskManager.ts` | 第 91 行 | 运算符优先级 bug | 改为 `if (task && (task.status === 'running' \|\| task.status === 'pending'))` |
| `src/composables/useDeepImportSession.ts` | 第 29-38 行 | 模块级 ref 引用大对象不释放 | `clearSession` 中增加 `extractor.value?.abort()` 和 `parsedChapters.value = []` |

**预期效果**：长时间运行后内存使用稳定，不会因数据结构无限增长而 OOM。

---

### P1-7：性能关键优化

**问题描述**：多处明确的性能瓶颈。

**涉及文件及行号**：

| 文件 | 行号 | 问题 | 修改方案 |
|------|------|------|----------|
| `src/utils/qualityAnalyzer.ts` | 第 52, 154, 197 行 | 全文 3 次拼接 | 在 `analyzeQuality` 入口处拼接一次，作为参数传入 |
| `src/utils/summarizer.ts` | 第 494-522 行 | 批量摘要串行+500ms 延迟 | 改为并发池（并发度 3-5）+ 动态退避 |
| `src/composables/useGlobalSearch.ts` | 第 19-71 行 | 缺少 debounce | 改为 `watchDebounced`（延迟 200ms）+ 普通 ref 存储结果 |
| `src/stores/sandbox.ts` | 第 351-373 行 | `activeEntitiesState` 全量重算 | 为 `replayReducer` 增加增量计算能力，缓存上次结果 |
| `src/utils/context/pipeline.ts` | 第 82 行 | `truncateToTokens` 的 0.9 保守系数 | 改为 0.95，截断后增加一次 token 校验循环 |
| `src/utils/contextBuilder.ts` | 第 57-69 行 | Token 预算分配总和 102% | 将 RESERVE 从 15% 调整为 13% |

**预期效果**：批量摘要耗时降低 3-5 倍，搜索不再每次按键触发全量遍历，内存峰值降低。

---

### P1-8：懒加载优化

**问题描述**：多个大型组件/库未使用懒加载，影响首屏性能。

**涉及文件及行号**：

| 文件 | 行号 | 问题 | 修改方案 |
|------|------|------|----------|
| `src/components/Sandbox/SandboxLayout.vue` | 第 32-39 行 | 8 个子组件全部静态 import | 改为 `defineAsyncComponent(() => import(...))` |
| `src/components/AIAssistant.vue` | 第 78 行 | ECharts 顶层导入 | 改为动态 `import('echarts/core')`，仅在 `initCharts()` 时加载 |
| `src/main.ts` | 第 3-4 行 | Element Plus 全量导入 | 见 P1-1 |
| `vite.config.ts` | 第 76-95 行 | 部分大型依赖未分割 | 添加 `konva`、`vis-timeline`、`marked`、`html2canvas`、`docx` 的 chunk 分割 |
| `vite.config.ts` | 第 99 行 | `chunkSizeWarningLimit: 1000` | 降低为 500 |
| `vite.config.ts` | 第 72 行 | `sourcemap: true` | 改为 `sourcemap: 'hidden'` |

**预期效果**：首屏 JS 体积显著减少，用户只在需要时才加载重型组件/库。

---

## P2 级：代码质量 / 可维护性 / 中等优化

### P2-1：代码重复消除

| 重复项 | 涉及文件及行号 | 修改方案 |
|--------|---------------|----------|
| SSE 解析逻辑重复 | `openai-provider.ts:140-173`、`anthropic-provider.ts:156-191`、`local-provider.ts:124-157` | 抽取 `src/utils/sse-parser.ts` 共享模块，接收 `chunkExtractor` 回调处理协议差异 |
| `prepareEntry`/`filterNovelWorkshopExtensions` 重复 | `worldbook-exporter.ts:490-574`、`worldbook-png-writer.ts:806-898` | 抽取 `src/services/worldbook-common.ts` 共享模块 |
| 角色卡导入后处理重复 | `unified-importer.ts:355-428` 与 `501-578` | 抽取 `private async applyCharacterCardResult()` 方法 |
| `useAIStore` 12 处动态导入 | `worldbook-ai.ts:148,209,257,303,357,413,478,529,572,637,702,731` | 在类中添加 `private getAiStore()` 方法，集中管理一次导入 |
| 独立 JSON 提取逻辑 | `outlineGenerator.ts:150-161` | 替换为 `safeParseAIJson(response.content)` |
| `estimateTokens` 4 处实现 | 见 P0-1 | 统一为单一实现 |

**预期效果**：消除约 500+ 行重复代码，修改一处即全局生效。

---

### P2-2：shallowRef 优化

**问题描述**：服务类实例被 `ref()` 深度代理，浪费性能且可能破坏内部行为。

**涉及文件及行号**：

| 文件 | 行号 | 当前代码 | 修改 |
|------|------|----------|------|
| `src/stores/ai.ts` | 第 12 行 | `const aiService = ref<AIService \| null>(null)` | 改为 `shallowRef` |
| `src/stores/vector.ts` | 第 29 行 | `const service = ref<VectorService \| null>(null)` | 改为 `shallowRef` |
| `src/stores/worldbook.ts` | 第 51, 54 行 | `injector` 和 `aiAssistant` 使用 `ref` | 改为普通变量或 `shallowRef` |

**预期效果**：减少不必要的深度响应式代理开销。

---

### P2-3：路由完善

**涉及文件及行号**：
- `src/router/index.ts` 全文

**具体修改方案**：

1. **第 4 行**：`createWebHashHistory()` 替代 `createWebHistory()`（按项目要求使用 hashRouter）
2. **第 23 行前**：添加 404 通配路由：`{ path: '/:pathMatch(.*)*', redirect: '/' }`
3. **第 23 行后**：添加全局前置守卫设置页面标题：
   ```typescript
   router.afterEach((to) => {
     document.title = `${to.meta.title || 'AI小说工坊'} - AI小说工坊`
   })
   ```

**预期效果**：路由模式符合项目要求，404 有兜底，页面标题动态更新。

---

### P2-4：Store 并发保护

| 文件 | 行号 | 问题 | 修改方案 |
|------|------|------|----------|
| `src/stores/knowledge.ts` | 第 109-183 行 | `loadKnowledge` 无防重入 | 增加 generation counter 模式，新请求使旧请求自动废弃 |
| `src/stores/project.ts` | 第 296-371 行 | `saveCurrentProject` 递归并发锁 | 改为队列模式：保存完成后取最新快照保存，不递归调用 |

**预期效果**：消除并发状态不一致和潜在栈溢出。

---

### P2-5：Token 预算截断精度提升

**涉及文件及行号**：
- `src/utils/context/pipeline.ts` 第 81-82 行：`let targetLength = Math.floor(text.length * ratio * 0.9)`

**修改方案**：
- 去掉 `* 0.9` 保守系数
- 截断后增加一次 `estimateTokens` 校验，若仍超限则二分缩小

**预期效果**：上下文预算利用率从约 90% 提升到 95%+。

---

### P2-6：UID 生成策略统一

**涉及文件及行号**：
- `src/services/knowledge-base.ts` 第 566-568 行：`Date.now() % 1000000` 碰撞概率高
- `src/stores/knowledge.ts` 第 253-257 行：`Math.max(0, ...uids) + 1`

**修改方案**：统一使用自增计数器（模块级 `let nextUid = 1`），在加载知识库时初始化为 `max(existingUids) + 1`。

**预期效果**：UID 唯一性有保障，不会碰撞。

---

### P2-7：TypeScript 严格度提升

**涉及文件及行号**：
- `tsconfig.json`：补充 `forceConsistentCasingInImports: true`
- `.eslintrc.cjs` 第 32 行：`@typescript-eslint/no-explicit-any` 从 `warn` 改为 `error`
- `.eslintrc.cjs` 第 24-34 行：添加 `@typescript-eslint/consistent-type-imports`、`vue/no-v-html`、`no-console` 规则

**注意**：`noUncheckedIndexedAccess` 建议渐进式启用，需大量类型守卫代码。

**预期效果**：编译器和 lint 工具能捕获更多潜在错误。

---

### P2-8：`inputSanitizer.ts` escapeBraces 默认值修正

**涉及文件及行号**：
- `src/utils/inputSanitizer.ts` 第 79 行：`escapeBraces = true`
- `src/utils/contextBuilder.ts` 第 688-691 行：未显式传入 `escapeBraces: false`

**修改方案**：
- 第 79 行：将默认值改为 `false`
- 显式需要转义花括号的调用方（如直接拼接进 prompt template 的场景）手动传入 `escapeBraces: true`

**预期效果**：用户输入的小说文本中的花括号不再被替换为全角字符，避免内容失真。

---

## P3 级：锦上添花 / 长期技术债务

### P3-1：组件拆分

| 组件 | 当前行数 | 拆分方案 |
|------|----------|----------|
| `Chapters.vue` | ~983 行 | 提取 `ChapterBatchDialog.vue`、`ChapterValidationDialog.vue`、`ChapterCheckpointsDialog.vue` 三个子组件；提取 `useChapterDragSort`、`useChapterPreview` 两个 composable |
| `ProjectEditor.vue` | ~778 行 | 提取 `EditorSidebar.vue` 子组件和 `useEditorShortcuts` composable |

---

### P3-2：类型系统清理

| 类型 | 文件及行号 | 修改方案 |
|------|-----------|----------|
| `[key: string]: any` | `character-card.ts:41,203,229,316,334,474`、`index.ts:705`、`ai.ts:38` | 改为 `[key: string]: unknown`，使用处添加类型守卫 |
| `NovelTemplate` 的 `any` 字段 | `index.ts:848-850` | `world?: Partial<WorldSetting>`、`characters?: Partial<Character>[]`、`outline?: Partial<Outline>` |
| `CharacterBookV1/V2/V3` 重复 | `character-card.ts:47,117,170` | 提取 `CharacterBookBase` 接口，三者继承 |
| `RegexScript` 重复 | `character-card.ts:208` 与 `regex-script.ts:30` | 删除 `character-card.ts` 版本，统一使用 `regex-script.ts` 版本 |
| enum vs 联合字面量混用 | `index.ts:460`(enum)、`sandbox.ts:1`(联合) | 统一使用 `as const` 联合字面量 |

---

### P3-3：过时依赖升级

| 依赖 | 当前版本 | 建议 | 风险 |
|------|----------|------|------|
| `@xenova/transformers` | ^2.17.1 | 迁移至 `@huggingface/transformers` | API 可能有变更 |
| `xlsx` | ^0.18.5 | 评估迁移至 `exceljs` | 安全漏洞 |
| `eslint` | ^8.57.0 | 升级到 9.x flat config | 配置格式变更 |

---

### P3-4：错误处理器改进

**涉及文件及行号**：
- `src/utils/errorHandler.ts` 第 260 行：`window.location.reload()` 改为回调式重试
- `src/utils/errorHandler.ts` 第 286 行：`localStorage.clear()` 改为精确清除应用 key
- 新增 `clearPersistentErrors()` 方法

---

### P3-5：safeParseAIJson 增强

**涉及文件及行号**：
- `src/utils/safeParseAIJson.ts` 第 28 行：贪婪正则改为非贪婪或括号配对算法
- 新增尾部逗号清理、注释清理等常见 AI 输出格式问题的修复步骤

---

## 优化项总览

| 编号 | 优先级 | 优化项 | 影响文件数 | 预期收益 |
|------|--------|--------|-----------|----------|
| P0-1 | P0 | Token 估算公式统一 | 4 | 上下文预算准确性 |
| P0-2 | P0 | LLM 双重重试消除 | 1 | API 成本降低 3 倍 |
| P0-3 | P0 | LLM 默认超时修正 | 1 | 用户体验 |
| P0-4 | P0 | 加密模块安全加固 | 1 | 安全性 |
| P0-5 | P0 | ReDoS 防护 | 1 | 安全性 |
| P0-6 | P0 | CSP 安全策略 | 1 | 安全性 |
| P0-7 | P0 | GenerationScheduler 并发安全 | 1 | 数据正确性 |
| P1-1 | P1 | Element Plus 按需导入 | 2 | 包体积 -500KB |
| P1-2 | P1 | ai-service.ts 拆分 | 1→7 | 可维护性 |
| P1-3 | P1 | generation-scheduler.ts 拆分 | 1→4 | 可维护性 |
| P1-4 | P1 | storage.ts 拆分 | 1→3 | 可维护性 |
| P1-5 | P1 | 错误处理统一 | 5 | 数据一致性 |
| P1-6 | P1 | 内存泄漏修复 | 5 | 稳定性 |
| P1-7 | P1 | 性能关键优化 | 6 | 响应速度 |
| P1-8 | P1 | 懒加载优化 | 4 | 首屏速度 |
| P2-1 | P2 | 代码重复消除 | 7 | 可维护性 |
| P2-2 | P2 | shallowRef 优化 | 3 | 性能 |
| P2-3 | P2 | 路由完善 | 1 | 用户体验 |
| P2-4 | P2 | Store 并发保护 | 2 | 数据安全 |
| P2-5 | P2 | Token 截断精度 | 1 | 预算利用率 |
| P2-6 | P2 | UID 生成策略统一 | 2 | 数据正确性 |
| P2-7 | P2 | TypeScript 严格度 | 2 | 代码质量 |
| P2-8 | P2 | escapeBraces 默认值 | 2 | 内容完整性 |
| P3-1 | P3 | 组件拆分 | 2 | 可维护性 |
| P3-2 | P3 | 类型系统清理 | 3 | 类型安全 |
| P3-3 | P3 | 过时依赖升级 | 3 | 安全性/兼容性 |
| P3-4 | P3 | 错误处理器改进 | 1 | 用户体验 |
| P3-5 | P3 | safeParseAIJson 增强 | 1 | AI 输出解析可靠性 |

---

*方案结束*
