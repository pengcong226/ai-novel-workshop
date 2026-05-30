# AI小说工坊 质量维度优化方案

**编制日期**：2026-05-28
**编制人**：测试工程师
**依据报告**：`/data/share/project/tests/质量审视报告-2026-05-28.md`

---

## 目录

- [P0 级：必须立即修复](#p0-级必须立即修复)
  - [P0-1: XSS 漏洞修复（reportExporter.ts）](#p0-1-xss-漏洞修复)
  - [P0-2: saveChapter/saveProject 数据竞态修复](#p0-2-savechaptersaveproject-数据竞态修复)
  - [P0-3: IndexedDB 版本升级删库修复](#p0-3-indexeddb-版本升级删库修复)
- [P1 级：高优先级修复](#p1-级高优先级修复)
  - [P1-1: AI fetch 超时控制](#p1-1-ai-fetch-超时控制)
  - [P1-2: localStorage sandbox 数据容量保护](#p1-2-localstorage-sandbox-数据容量保护)
  - [P1-3: crypto.randomUUID 统一降级方案](#p1-3-cryptorandomuuid-统一降级方案)
  - [P1-4: public 目录调试文件清理](#p1-4-public-目录调试文件清理)
- [P2 级：中优先级修复](#p2-级中优先级修复)
  - [P2-1: 空 catch 块修复（11 处）](#p2-1-空-catch-块修复)
  - [P2-2: 后端 API Key 加密存储](#p2-2-后端-api-key-加密存储)
  - [P2-3: suggestions store 内存泄漏修复](#p2-3-suggestions-store-内存泄漏修复)
  - [P2-4: worldbook-sandbox V5 桥接非原子修复](#p2-4-worldbook-sandbox-v5-桥接非原子修复)
  - [P2-5: v-html 安全加固](#p2-5-v-html-安全加固)
  - [P2-6: novelImporter 大文件处理优化](#p2-6-novelimporter-大文件处理优化)
- [P3 级：低优先级优化](#p3-级低优先级优化)
  - [P3-1: browserslist 配置](#p3-1-browserslist-配置)
  - [P3-2: Autoprefixer 配置](#p3-2-autoprefixer-配置)
  - [P3-3: 响应式设计补充](#p3-3-响应式设计补充)
  - [P3-4: 测试覆盖率提升计划](#p3-4-测试覆盖率提升计划)

---

## P0 级：必须立即修复

### P0-1: XSS 漏洞修复

**优化目标**：消除 `reportExporter.ts` 中通过 `document.write` 输出未转义 HTML 导致的 XSS 攻击面。

**涉及文件**：
- `src/utils/reportExporter.ts` — 第 146-213 行（`generateReportHTML`）、第 236-258 行（`printQualityReport`）
- `src/utils/pdfExporter.ts` — 第 532 行（同样使用 `document.write`）

**当前问题**：

| 行号 | 未转义变量 | 来源 | 风险 |
|------|-----------|------|------|
| 第 152 行 | `${projectName}` | 用户输入的项目名 | 高 |
| 第 193 行 | `${dim.name}` | AI 生成的维度名 | 高 |
| 第 205 行 | `${imp}` | AI 生成的改进建议 | 高 |
| 第 244 行 | `${projectName}` | `printQualityReport` 中 `<title>` 标签 | 中 |

**具体改什么 & 怎么改**：

1. **新增 `escapeHTML` 工具函数**（插入在第 11 行之后）：

```typescript
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

2. **`generateReportHTML` 函数中所有字符串拼接点转义**：
   - 第 152 行：`${projectName}` → `${escapeHTML(projectName)}`
   - 第 193 行：`${dim.name}` → `${escapeHTML(dim.name)}`
   - 第 205 行：`<li>${imp}</li>` → `<li>${escapeHTML(imp)}</li>`

3. **`printQualityReport` 函数增加 DOMPurify 过滤**（第 241-252 行）：
   - `<title>质量报告 - ${projectName}</title>` → `<title>质量报告 - ${escapeHTML(projectName)}</title>`
   - `${html}` → `${DOMPurify.sanitize(html)}`

4. **`pdfExporter.ts` 第 532 行同步修复**：对传入 `document.write` 的 HTML 做 `DOMPurify.sanitize()` 处理。

**改后预期效果**：
- 所有用户可控和 AI 生成的文本在拼接进 HTML 前均经过转义
- `document.write` 路径增加 DOMPurify 纵深防御
- XSS 攻击面完全消除

---

### P0-2: saveChapter/saveProject 数据竞态修复

**优化目标**：消除 `saveChapter` 与 `saveProject` 并发执行时导致章节正文丢失的数据竞态。

**涉及文件**：
- `src/stores/storage.ts` — 第 178-195 行（`IndexedDBStorage.saveProject` 的 `writeNextChapter` 函数）
- `src/stores/project.ts` — 第 380-420 行（`saveChapter` 方法）、第 297-371 行（`saveCurrentProject`）

**当前问题 — 竞态触发时序**：

```
saveChapter(chapterA):
  [1] storage.saveChapter(chapterA)  ← 保存完整章节（含 content）到 IndexedDB ✓
  [2] delete shallowChapter.content  ← 前端状态剥离 content
  [3] currentProject.chapters[index] = shallowChapter

saveCurrentProject (并发):
  [A] project = currentProject.value  ← chapters 已是无 content 的骨架
  [B] storage.saveProject(project)    ← 用骨架覆盖完整章节 → 数据丢失！
```

**具体改什么 & 怎么改**：

1. **修改 `IndexedDBStorage.saveProject` 中的 `writeNextChapter`**（storage.ts 第 178-195 行）：

```typescript
// 在 chaptersStore.put(chapter) 之前，增加 content 保留逻辑
const writeNextChapter = (index: number) => {
  if (index >= chapters.length) return
  const chapter = { ...chapters[index], projectId: projectData.id }
  const getRequest = chaptersStore.get(chapter.id)
  getRequest.onsuccess = () => {
    const existingChapter = getRequest.result
    if (existingChapter && existingChapter.projectId !== projectData.id) {
      transaction.abort()
      return
    }
    // 【新增】保留已有章节的 content 字段，防止无 content 的骨架覆盖完整内容
    if (existingChapter && existingChapter.content && !chapter.content) {
      chapter.content = existingChapter.content
    }
    chaptersStore.put(chapter)
    writeNextChapter(index + 1)
  }
  getRequest.onerror = () => reject(getRequest.error)
}
```

2. **在 `saveChapter` 中等待正在进行的 `saveCurrentProject`**（project.ts 第 380 行附近）：

```typescript
async function saveChapter(chapter: any) {
  if (!currentProject.value) { ... }
  // 【新增】等待正在进行的 saveCurrentProject 完成
  if (currentSavePromise) {
    await currentSavePromise.catch(() => {})
  }
  // ... 原有逻辑 ...
}
```

**改后预期效果**：
- 即使 `saveChapter` 和 `saveProject` 并发执行，`saveProject` 写入时会保留已有的 `content` 字段
- `saveChapter` 主动等待 `saveCurrentProject` 完成，从源头减少并发交叉
- 用户编辑的章节正文不再有丢失风险

---

### P0-3: IndexedDB 版本升级删库修复

**优化目标**：将"检测缺失即删库重建"改为安全的增量版本迁移，保护用户数据。

**涉及文件**：
- `src/stores/storage.ts` — 第 49-97 行（`IndexedDBStorage.init` 方法）

**当前问题**：

- 第 63-83 行：`onsuccess` 中检测到对象存储不完整时，调用 `indexedDB.deleteDatabase(DB_NAME)` **直接删除整个数据库**
- 第 70 行：`deleteDatabase()` 是异步的，紧接着同步 `open()` 存在竞态隐患
- 结果：用户所有项目数据丢失

**具体改什么 & 怎么改**：

1. **改造 `onupgradeneeded` 为版本增量迁移**（第 91-96 行）：

```typescript
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result
  const oldVersion = event.oldVersion

  // 版本 0 → 当前：按版本号逐步创建对象存储
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
      db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
      const chaptersStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' })
      chaptersStore.createIndex('projectId', 'projectId', { unique: false })
      chaptersStore.createIndex('number', 'number', { unique: false })
    }
  }
  if (oldVersion < 3) {
    if (!db.objectStoreNames.contains(CHAPTER_SNAPSHOTS_STORE)) {
      const snapshotsStore = db.createObjectStore(CHAPTER_SNAPSHOTS_STORE, { keyPath: 'id' })
      snapshotsStore.createIndex('chapterId', 'chapterId', { unique: false })
      snapshotsStore.createIndex('projectId', 'projectId', { unique: false })
    }
  }
}
```

2. **移除 `onsuccess` 中的删库逻辑**（第 63-83 行）：

```typescript
request.onsuccess = () => {
  this.db = request.result
  // 仅做完整性检查并记录日志，不再删库
  const missingStores = [PROJECTS_STORE, CHAPTERS_STORE, CHAPTER_SNAPSHOTS_STORE]
    .filter(storeName => !this.db!.objectStoreNames.contains(storeName))
  if (missingStores.length > 0) {
    logger.error(`IndexedDB 对象存储不完整，缺失: ${missingStores.join(', ')}。请用户手动清理浏览器数据。`)
  }
  resolve()
}
```

**改后预期效果**：
- 版本升级时 `onupgradeneeded` 按版本号增量创建缺失的存储，已有数据不被删除
- 消除 `deleteDatabase()` + 立即 `open()` 的竞态隐患
- 极端情况下（存储仍不完整）仅记录日志，不丢数据

---

## P1 级：高优先级修复

### P1-1: AI fetch 超时控制

**优化目标**：为所有 AI 服务的 fetch 请求添加超时控制，防止 LLM 响应挂起时请求永久阻塞。

**涉及文件**：
- `src/services/ai-service.ts` — 6 处 fetch 调用：第 616 行、第 650 行、第 781 行、第 823 行、第 930 行、第 961 行
- `src/utils/sse-stream.ts` — 第 27-57 行（`readSSEStream` 的 `reader.read()` 循环）

**当前问题**：
- 所有 `fetch` 调用均未传入 `AbortSignal`
- `sse-stream.ts` 第 31 行 `await reader.read()` 无超时保护，可永久挂起
- `reader.read()` 不响应 `AbortSignal`，循环开头的 `signal?.aborted` 检查无法生效

**具体改什么 & 怎么改**：

1. **在 ai-service.ts 顶部新增超时工具**（第 57 行之后）：

```typescript
const REQUEST_TIMEOUT_MS = 60_000   // 非流式 60s
const STREAM_TIMEOUT_MS = 120_000   // 流式 120s

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}
```

2. **为每个 Provider 的 `chat()` 和 `chatStream()` 添加 signal**：

以 `OpenAIProvider.chat()`（第 616 行）为例：
```typescript
async chat(request: ChatRequest): Promise<OpenAIResponse> {
  const { signal, cancel } = createTimeoutController(REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal })
    // ...
  } finally { cancel() }
}
```

同样修改：第 650 行（OpenAI stream）、第 781 行（Claude chat）、第 823 行（Claude stream）、第 930 行（Local chat）、第 961 行（Local stream）。

3. **将 signal 传递给 readSSEStream**：

第 676、854、985 行的 `yield* readSSEStream(...)` 调用增加 `signal` 参数。

4. **在 sse-stream.ts 中为 `reader.read()` 添加竞态超时**（第 27-57 行）：

```typescript
const SSE_CHUNK_TIMEOUT_MS = 60_000

while (true) {
  if (signal?.aborted) break
  const readPromise = reader.read()
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('SSE stream read timeout')), SSE_CHUNK_TIMEOUT_MS)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')) }, { once: true })
  })
  const { done, value } = await Promise.race([readPromise, timeoutPromise])
  if (done) break
  // ...
}
```

5. **在 `shouldRetry` 中增加 AbortError 重试判断**（第 1476-1494 行）：

```typescript
if (error.name === 'AbortError' || error.message?.includes('timeout')) return true
```

**改后预期效果**：
- 非流式请求 60 秒超时，流式请求 120 秒超时
- SSE 流单次 `reader.read()` 60 秒无数据即超时
- 超时错误进入重试机制（最多 3 次），重试失败后抛出 `AIServiceError`
- UI 不再出现"请求中..."永久卡死

---

### P1-2: localStorage sandbox 数据容量保护

**优化目标**：防止 sandbox 数据量超出 localStorage 限制时静默丢失数据。

**涉及文件**：
- `src/stores/sandbox.ts` — 第 129-135 行（`saveWebSandboxEntities`、`saveWebSandboxStateEvents`）

**当前问题**：
- `localStorage.setItem` 超出 5-10MB 限制时抛 `QuotaExceededError`
- 调用方（第 228、253、280、305、332、474、510、543、580 行等 8+ 处）均未捕获
- 内存中 `entities.value` 已更新但持久化失败 → 刷新页面数据丢失

**具体改什么 & 怎么改**：

1. **新增安全写入函数**（第 115 行之后）：

```typescript
const LS_SAFE_LIMIT_BYTES = 4 * 1024 * 1024

function safeSetItem(key: string, value: string): void {
  const byteSize = new Blob([value]).size
  if (byteSize > LS_SAFE_LIMIT_BYTES) {
    throw new Error(`[sandbox] 数据容量超限: ${(byteSize / 1024 / 1024).toFixed(2)}MB，阈值 4MB。请清理归档实体。`)
  }
  try {
    localStorage.setItem(key, value)
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      throw new Error(`[sandbox] localStorage 写入失败: 浏览器存储空间已满。`)
    }
    throw e
  }
}
```

2. **替换原有的 `saveWebSandboxEntities` 和 `saveWebSandboxStateEvents`**：

```typescript
function saveWebSandboxEntities(projectId: string, nextEntities: Entity[]): void {
  safeSetItem(webSandboxKey(projectId, 'entities'), JSON.stringify(nextEntities))
}
function saveWebSandboxStateEvents(projectId: string, nextEvents: StateEvent[]): void {
  safeSetItem(webSandboxKey(projectId, 'state-events'), JSON.stringify(nextEvents))
}
```

**改后预期效果**：
- 超限写入抛出明确错误，UI 层可提示"数据量过大，请清理归档实体"
- 预检查在写入前拦截，避免浏览器 QuotaExceededError
- 不再有"内存已更新但持久化失败"的静默数据丢失

---

### P1-3: crypto.randomUUID 统一降级方案

**优化目标**：创建统一的 UUID 生成工具，确保在所有运行时（HTTP/非安全上下文/旧 WebView）下可用。

**涉及文件**（共 10 个源文件 + 1 个新文件）：

| 文件 | 行号 | 当前调用 |
|------|------|---------|
| `src/stores/worldbook.ts` | 874 | `crypto.randomUUID()` |
| `src/stores/character-card.ts` | 411 | `crypto.randomUUID()` |
| `src/stores/tokenUsage.ts` | 32 | `crypto.randomUUID()` |
| `src/composables/useAuditLog.ts` | 22 | `crypto.randomUUID()` |
| `src/utils/chapterVersioning.ts` | 16 | `crypto.randomUUID()` |
| `src/utils/v1ToV5Migration.ts` | 24 | `crypto.randomUUID()` |
| `src/utils/epubExporter.ts` | 25 | `crypto.randomUUID()` |
| `src/components/Sandbox/AutomatonChat.vue` | 131 | `crypto.randomUUID()` |
| `src/plugins/builtin/assistant-actions.ts` | 20 | `crypto.randomUUID()` |
| `src/data/stylePresets.ts` | 235, 249 | `globalThis.crypto?.randomUUID?.()` (有降级但不统一) |

**具体改什么 & 怎么改**：

1. **新建 `src/utils/generateId.ts`**：

```typescript
export function generateId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
  } catch { /* 某些环境 crypto 存在但调用抛错 */ }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
```

2. **逐文件替换**：上述 10 个文件中，将 `crypto.randomUUID()` 或 `globalThis.crypto?.randomUUID?.() ?? ...` 替换为 `generateId()`，并添加 `import { generateId } from '@/utils/generateId'`。

**改后预期效果**：
- 所有 UUID 生成收敛到一个函数，消除 10 处分散的降级逻辑
- 降级链路：原生 → `getRandomValues` → `Math.random`，覆盖所有运行时
- 非 HTTPS 环境不再崩溃

---

### P1-4: public 目录调试文件清理

**优化目标**：移除生产构建中的调试/测试文件，减少 11.3MB 构建产物并消除信息泄露风险。

**涉及文件**：

| 文件 | 大小 | 类型 |
|------|------|------|
| `public/check-db.html` | 4.8 KB | 调试页面 |
| `public/check-store.html` | 11 KB | 调试页面 |
| `public/debug-config.html` | 10 KB | 调试页面 |
| `public/test-ai-service.js` | 9.2 KB | 测试脚本 |
| `public/test-db.html` | 12 KB | 测试页面 |
| `public/test-timeline.html` | 8.5 KB | 测试页面 |
| `public/test-world-gen.js` | 4.1 KB | 测试脚本 |
| `public/png-test.html` | 12 KB | 测试页面 |
| `public/fix-all-prompts.js` | 2.3 KB | 修复脚本 |
| `public/sync-payload.json` | **11.2 MB** | 大型数据文件 |

**具体改什么 & 怎么改**：

1. **直接删除上述 10 个文件**
2. **在 `.gitignore` 中添加排除规则**：

```
public/check-*.html
public/debug-*.html
public/test-*.html
public/test-*.js
public/fix-*.js
public/png-*.html
public/sync-payload.json
```

3. **在 `vite.config.ts` 中添加构建钩子**（防御性措施）：

```typescript
{
  name: 'remove-debug-files',
  buildStart() {
    if (process.argv.includes('build')) {
      // 构建前自动清理调试文件（如果存在）
    }
  }
}
```

**改后预期效果**：
- 生产构建包减少约 11.3 MB
- 调试页面和测试脚本不再暴露在生产环境
- `sync-payload.json` 不再被 git 追踪

---

## P2 级：中优先级修复

### P2-1: 空 catch 块修复

**优化目标**：为所有空 catch 块添加日志记录，消除错误被静默吞没的问题。

**涉及文件与行号**（共 11 处）：

| 文件 | 行号 | 修复方案 |
|------|------|---------|
| `src/services/vector-service.ts` | 615 | 区分"文档不存在"（正常）和其他错误（记录 warn） |
| `src/services/vector-service.ts` | 629 | 旧版文档删除失败记录 debug 日志 |
| `src/services/novel-extractor.ts` | 434 | 记录 JSON 解析错误详情和内容预览 |
| `src/services/novel-extractor.ts` | 479 | 同上 |
| `src/services/novel-extractor.ts` | 685 | 记录快速扫描解析失败并保留 fallback 返回值 |
| `src/services/novel-extractor.ts` | 1079 | 记录 localStorage 索引数据损坏详情 |
| `src/services/novel-extractor.ts` | 1112 | 记录缓存会话反序列化失败 |
| `src/stores/tokenUsage.ts` | 99 | 记录数据加载失败和 projectId |
| `src/stores/tokenUsage.ts` | 107 | 区分 QuotaExceededError（warn）和隐私模式（静默） |
| `src/stores/tokenUsage.ts` | 116 | 保持静默（removeItem 极少失败，无数据丢失风险） |
| `src/services/ai-service.ts` | 1463 | catch 中添加 `logger.debug('Failed to show retry toast', e)` |

**改后预期效果**：
- 所有异常在日志中有迹可循
- 生产环境调试效率显著提升
- 正常业务逻辑（如"文档不存在"的 break）不受影响

---

### P2-2: 后端 API Key 加密存储

**优化目标**：对数据库中的用户 API Key 进行加密存储，防止数据库泄露时密钥暴露。

**涉及文件**：
- `backend/app/models/user.py` — 第 12 行（`api_keys = Column(JSON)`）
- `backend/app/routers/users.py` — 第 54-59 行（写入逻辑）

**具体改什么 & 怎么改**：

1. **新增 `backend/app/services/crypto.py`**：使用 `cryptography.fernet.Fernet` 对称加密
2. **修改 `users.py`**：写入时 `encrypt_api_key(data.api_key)`，读取时返回掩码形式 `decrypt_api_key(key)[:4] + "****" + decrypt_api_key(key)[-4:]`
3. **`requirements.txt` 新增**：`cryptography>=41.0.0`
4. **环境变量**：`API_KEY_ENCRYPTION_KEY` 控制加密密钥

**改后预期效果**：
- 数据库中 API Key 以 Fernet 密文存储
- 前端只看到掩码形式
- 即使数据库泄露也无法直接获取明文 Key

---

### P2-3: suggestions store 内存泄漏修复

**优化目标**：修复 `setInterval` 永不清理导致的内存泄漏。

**涉及文件**：
- `src/stores/suggestions.ts` — 第 22 行（模块级 `periodicCheckInterval`）、第 209-224 行
- `src/components/AIAssistant.vue` — 第 145-152 行（`onUnmounted`）

**具体改什么 & 怎么改**：

1. **将 `periodicCheckInterval` 移入 store 内部**（从第 22 行的模块级变量移入 `defineStore` 的闭包内）
2. **在 AIAssistant.vue `onUnmounted` 中调用清理**：

```typescript
onUnmounted(() => {
  // ... 现有清理 ...
  suggestionsStore.stopPeriodicCheck()  // 【新增】
})
```

3. **新增 `dispose()` 方法**，重置 `isInitialized` 状态以便重新挂载时可重新初始化

**改后预期效果**：
- 组件卸载后定时器被正确清理
- 不再有后台持续消耗资源
- 重新挂载组件时可正常初始化

---

### P2-4: worldbook-sandbox V5 桥接非原子修复

**优化目标**：确保 worldbook 和 sandbox 之间的数据同步失败时有回滚保护。

**涉及文件**：
- `src/stores/worldbook.ts` — `addEntry`（第 242-303 行）、`updateEntry`（第 308-360 行）、`deleteEntry`（第 365-394 行）

**具体改什么 & 怎么改**：

采用"先暂存旧状态 → 操作 → 同步 → 失败回滚"模式：

```typescript
async function addEntry(entry) {
  const previousEntries = [...worldbook.value.entries]  // 暂存
  worldbook.value.entries.push(newEntry)
  await saveWorldbook()

  try {
    await sandboxStore.addEntity({ ... })
  } catch (e) {
    logger.error('V5 bridge sync failed, rolling back', e)
    worldbook.value.entries = previousEntries  // 回滚
    await saveWorldbook()
    throw new Error(`V5 同步失败，已回滚: ${e.message}`)
  }
}
```

同样修改 `updateEntry` 和 `deleteEntry`。

**改后预期效果**：
- V5 bridge 失败时 worldbook 自动回滚到之前的状态
- 不再有 worldbook 和 sandbox 之间的数据不一致
- 失败时向调用方抛出明确错误

---

### P2-5: v-html 安全加固

**优化目标**：参照 `AutomatonChat.vue` 的严格策略，加固其他 v-html 使用点。

**涉及文件**：
- `src/assistant/commands/assistantChat.ts` — 第 77-82 行（`formatAssistantMessage`）
- `src/stores/theme.ts` — 第 50 行（`styleTag.innerHTML`）

**具体改什么 & 怎么改**：

1. **`assistantChat.ts` 的 `formatAssistantMessage` 增加 FORBID_TAGS/FORBID_ATTR**：

```typescript
return DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['strong', 'br', 'em', 'p', 'span', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'title', 'class'],
  FORBID_TAGS: ['img', 'iframe', 'object', 'embed', 'script', 'style', 'svg'],
  FORBID_ATTR: ['srcset', 'onerror', 'onclick', 'onload', 'style']
})
```

2. **`theme.ts` 对 `globalCss` 增加 CSS 注入过滤**：

```typescript
function sanitizeCss(css: string): string {
  return css
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(\s*['"]?\s*javascript:/gi, 'url(')
    .replace(/-moz-binding\s*:/gi, '')
    .replace(/behavior\s*:/gi, '')
}
// 第 50 行改为：
styleTag.innerHTML = sanitizeCss(theme.globalCss || '')
```

**改后预期效果**：
- `formatAssistantMessage` 使用白名单策略，仅允许富文本必需标签
- `theme.globalCss` 过滤已知 CSS 注入向量
- 与 `AutomatonChat.vue` 保持一致的安全策略

---

### P2-6: novelImporter 大文件处理优化

**优化目标**：大文件（50MB+）分块读取，避免单次内存峰值过高。

**涉及文件**：
- `src/utils/novelImporter.ts` — 第 99-114 行（`parseFile` 函数）

**具体改什么 & 怎么改**：

1. **新增文件大小检查**（100MB 上限）
2. **小文件（< 4MB）走原有快速路径**
3. **大文件分块读取**（4MB/块），带进度回调：

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024
const CHUNK_SIZE = 4 * 1024 * 1024

async function parseFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  if (file.size > MAX_FILE_SIZE) throw new Error(`文件过大: ${(file.size/1024/1024).toFixed(1)}MB`)
  if (file.size <= CHUNK_SIZE) return readChunkAsText(file, 0, file.size)

  const chunks: string[] = []
  let offset = 0
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size)
    chunks.push(await readChunkAsText(file, offset, end))
    offset = end
    onProgress?.(Math.round((offset / file.size) * 100))
  }
  return chunks.join('')
}

function readChunkAsText(file: File, start: number, end: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error(`文件读取失败 (offset ${start}-${end}): ${reader.error?.message}`))
    reader.readAsText(file.slice(start, end), 'UTF-8')
  })
}
```

**改后预期效果**：
- 大文件分块读取，内存峰值从"文件大小×2"降至"8MB"
- 文件大小限制防止浏览器崩溃
- 读取有进度反馈，用户体验更好

---

## P3 级：低优先级优化

### P3-1: browserslist 配置

**优化目标**：明确浏览器兼容范围，确保 Vite/PostCSS/Autoprefixer 工具链对齐。

**涉及文件**：
- `package.json` — 新增 `browserslist` 字段
- `vite.config.ts` — 新增 `build.target` 和 `optimizeDeps.esbuildOptions.target`
- `tsconfig.json` — 确认 `target: ES2020`（不变）

**具体配置**：

`package.json` 新增：
```json
"browserslist": [
  "Chrome >= 90",
  "Firefox >= 90",
  "Safari >= 15",
  "Edge >= 90",
  "not dead",
  "not IE 11"
]
```

`vite.config.ts` 新增：
```typescript
build: { target: 'es2020', /* ... */ },
optimizeDeps: { esbuildOptions: { target: 'es2020' }, /* ... */ }
```

**选型理由**：Chrome/Firefox 90、Safari 15 对应 ES2020 完整支持基线，与 `tsconfig.json` 的 `target: ES2020` 保持一致。

---

### P3-2: Autoprefixer 配置

**优化目标**：自动为 CSS 属性添加浏览器前缀，解决 `backdrop-filter` 等属性的兼容性。

**涉及文件**：
- 新建 `postcss.config.js`（项目根目录）
- `src/assets/styles/design-system.css` — `backdrop-filter`（第 265、281 行）需 `-webkit-` 前缀

**具体操作**：
1. `npm install -D autoprefixer`
2. 创建 `postcss.config.js`：

```javascript
export default {
  plugins: {
    autoprefixer: {
      overrideBrowserslist: ['Chrome >= 90', 'Firefox >= 90', 'Safari >= 15', 'Edge >= 90'],
      grid: false,
      remove: false
    }
  }
}
```

**改后预期效果**：
- `backdrop-filter` 自动获得 `-webkit-backdrop-filter` 前缀
- `color-scheme` 等属性在 Safari 15 部分版本下正确显示
- 不影响已有手动前缀（`remove: false`）

---

### P3-3: 响应式设计补充

**优化目标**：为核心布局组件添加移动端/平板适配，建立标准化断点系统。

**现状**：仅 4 处 `@media` 查询，76 个组件中绝大多数无移动适配。

**具体改什么**：

1. **在 `design-system.css` 的 `:root` 中定义断点变量**：

```css
--ds-breakpoint-sm: 480px;
--ds-breakpoint-md: 768px;
--ds-breakpoint-lg: 1024px;
--ds-breakpoint-xl: 1440px;
```

2. **核心布局组件新增响应式样式**（按优先级排序）：

| 组件 | 断点 | 修改内容 |
|------|------|---------|
| `src/views/ProjectEditor.vue` | 600px | 侧边栏隐藏，内容全宽 |
| `src/components/Sandbox/SandboxLayout.vue` | 1024px, 768px | 侧边栏折叠为抽屉，右侧面板可收起 |
| `src/views/ProjectList.vue` | 1024px-768px | 卡片网格自适应中间断点 |
| `src/components/editor/NovelEditor.vue` | 600px | 编辑器内边距缩小，气泡菜单适配 |
| `src/components/Chapters.vue` | 768px | 章节内容区域 `max-width: 100%` |

3. **内联固定宽度治理**：将 `style="width: 300px"` 等改为 `min-width` + `width: 100%` 或 `flex: 1`。

---

### P3-4: 测试覆盖率提升计划

**优化目标**：为 10 个关键未覆盖模块补充约 200 个测试用例，将覆盖率从 ~20% 提升至 ~45%。

#### 安全关键工具（最高优先级补测试）

**文件 1：`src/utils/inputSanitizer.ts`**
- 测试文件：`src/utils/__tests__/inputSanitizer.test.ts`
- 需覆盖函数：`stripControlChars`、`validateInput`、`sanitizeForPrompt`
- 用例数：~19 个
- 重点用例：
  - 中文/英文注入语句检测（"忽略所有指令"、"ignore previous instructions"）
  - 控制字符剥离（保留 `\t`/`\n`/`\r`，移除 `\x00`-`\x1F` 其他）
  - 截断保护（默认 500 字符，自定义 maxLength）
  - 花括号转义（`escapeBraces: true/false`）
  - strict 模式拦截
- Mock 策略：纯函数，无需 mock

**文件 2：`src/utils/safeParseAIJson.ts`**
- 测试文件：`src/utils/__tests__/safeParseAIJson.test.ts`
- 需覆盖函数：`safeParseAIJson`
- 用例数：~14 个
- 重点用例：
  - 正常 JSON / markdown 代码块包裹 / 混合文本提取
  - 空字符串 / null / 非字符串输入 → 返回 null
  - 嵌套对象 / 转义字符正确解析
- Mock 策略：mock `@/utils/logger`

**文件 3：`src/utils/crypto.ts`**
- 测试文件：`src/utils/__tests__/crypto.test.ts`
- 需覆盖函数：`isEncryptedApiKey`、`encryptApiKey`/`decryptApiKey`（V1/V2）、`maskSecret`、`redactSensitiveText`、`writeEncryptedLocalStorage`/`readEncryptedLocalStorage`、`encryptProjectConfig`/`decryptProjectConfig`
- 用例数：~24 个
- 重点用例：
  - V1/V2 加解密往返
  - V2 向后兼容 V1
  - `maskSecret` 短密钥/空值处理
  - `redactSensitiveText` 替换 Bearer token 和 x-api-key
  - `encryptProjectConfig` 中 providers 的 apiKey 被加密
- Mock 策略：mock `@/utils/anthropic-guard`（控制环境种子）、mock `localStorage`

#### 核心 Store

**文件 4：`src/stores/project.ts`**
- 测试文件：`src/stores/__tests__/project.test.ts`
- 需覆盖函数：`saveChapter`、`saveCurrentProject`、`importProject`、`exportProject`、`createProject`、`deleteProject`、`reorderChapters`
- 用例数：~26 个
- 重点用例：
  - `saveChapter` 成功保存并剥离 content
  - `saveCurrentProject` 并发保存排队（`isSaving` 锁机制）
  - `importProject` 标准 JSON / .anprojl 流式 / backup 格式
  - `importProject` 失败回滚
  - `debouncedSaveCurrentProject` 防抖生效
- Mock 策略：mock `@/stores/storage`、`@/stores/sandbox`、`@/utils/crypto`、`uuid`

**文件 5：`src/stores/storage.ts`**
- 测试文件：`src/stores/__tests__/storage.test.ts`
- 需覆盖函数：`IndexedDBStorage` 类的 `init`、`saveProject`、`loadProject`、`loadChapters`、`saveChapter`、`deleteChapter`、`reorderChapters`、`saveChapterSnapshot`、`pruneChapterSnapshots`、`deleteProject` 等
- 用例数：~26 个
- 重点用例：
  - 首次初始化创建三个对象存储
  - `saveProject` + `loadProject` 往返
  - 章节 ID 冲突检测
  - `deleteChapter` 级联删除快照
  - `pruneChapterSnapshots` 保留指定数量
  - `assertValidChapterSnapshot` 校验
- Mock 策略：使用 `fake-indexeddb` 库模拟 IndexedDB；mock `@/utils/anthropic-guard`（强制 Web 路径）

#### 核心 AI 服务

**文件 6：`src/services/ai/CircuitBreaker.ts`**
- 测试文件：`src/services/ai/__tests__/CircuitBreaker.test.ts`
- 用例数：~17 个
- 重点用例：
  - 三态状态机完整生命周期（CLOSED → OPEN → HALF_OPEN → CLOSED）
  - 瞬态错误识别（429、5xx、timeout）
  - 致命错误识别（401/403、invalid_api_key）
  - 冷却期过后的探活
  - `forceOpen` 强制熔断 5 分钟
- Mock 策略：mock `@/utils/logger`、`vi.useFakeTimers()` 控制时间推进

**文件 7：`src/services/ai/ModelRouter.ts`**
- 测试文件：`src/services/ai/__tests__/ModelRouter.test.ts`
- 用例数：~21 个
- 重点用例：
  - 任务类型到模型层级的映射（worldbuilding→planning、chapter→writing、check→checking）
  - 用户偏好模型优先排序
  - 配额不足的模型被跳过
  - quality/speed 优先级权重差异
  - `SimpleUsageTracker` 配额记录和重置
- Mock 策略：使用真实 `SimpleUsageTracker`，无需额外 mock

**文件 8：`src/services/ai/FailoverManager.ts`**
- 测试文件：`src/services/ai/__tests__/FailoverManager.test.ts`
- 用例数：~12 个
- 重点用例：
  - 首个模型成功直接返回
  - 首个失败自动切换到第二个
  - 所有模型失败抛出"所有可用模型均已瘫痪"
  - 熔断中的模型被跳过
  - `onSwitch` 回调在切换时触发、首次成功不触发
  - 同一 provider 复用同一个 breaker
- Mock 策略：mock `ModelRouter`（控制候选列表）、通过 `requestFn` 闭包控制成功/失败

#### LLM 工具

**文件 9：`src/utils/llm/jsonValidator.ts`**
- 测试文件：`src/utils/llm/__tests__/jsonValidator.test.ts`
- 用例数：~21 个
- 重点用例：
  - schema 验证（匹配/不匹配）
  - markdown 代码块提取
  - 从混合文本中提取对象/数组
  - `allowAggressiveRepair` 闭合修复
  - 嵌套花括号/转义引号处理
- Mock 策略：纯函数，无需 mock

**文件 10：`src/utils/llm/cacheManager.ts`**
- 测试文件：`src/utils/llm/__tests__/cacheManager.test.ts`
- 用例数：~20 个
- 重点用例：
  - `saveStage` + `loadCache` 往返
  - 多阶段累积保存
  - 过期缓存自动删除（7 天）
  - `cleanup` 清理过期保留未过期
  - `checkStorageQuota` 空间检查
- Mock 策略：使用 `fake-indexeddb`、`vi.useFakeTimers()` 控制缓存过期

#### 测试基础设施补充

1. **安装依赖**：`npm install -D fake-indexeddb @vue/test-utils`
2. **创建共享 mock fixture**：`src/__tests__/helpers/` 目录，包含通用 mock（logger、storage、crypto）
3. **配置 coverage**：在 `vite.config.ts` 的 `test` 中添加 `coverage: { provider: 'v8', reporter: ['text', 'html'], thresholds: { lines: 45 } }`
4. **分 3 个 PR 提交**：P0 测试（安全工具）→ P1 测试（store + AI 服务）→ P2 测试（LLM 工具）

---

## 优化项总览

| 优先级 | 编号 | 问题 | 涉及文件数 | 工作量 |
|--------|------|------|-----------|--------|
| **P0** | P0-1 | XSS 漏洞修复 | 2 | 0.5h |
| **P0** | P0-2 | saveChapter/saveProject 竞态 | 2 | 1h |
| **P0** | P0-3 | IndexedDB 版本升级删库 | 1 | 1h |
| **P1** | P1-1 | AI fetch 超时控制 | 2 | 2-3h |
| **P1** | P1-2 | localStorage 容量保护 | 1 | 1h |
| **P1** | P1-3 | crypto.randomUUID 降级 | 11 | 1-2h |
| **P1** | P1-4 | public 目录清理 | 11 | 0.5h |
| **P2** | P2-1 | 空 catch 块修复 | 4 | 1h |
| **P2** | P2-2 | API Key 加密存储 | 3 | 2h |
| **P2** | P2-3 | suggestions 内存泄漏 | 2 | 0.5h |
| **P2** | P2-4 | V5 桥接非原子 | 1 | 1.5h |
| **P2** | P2-5 | v-html 安全加固 | 2 | 0.5h |
| **P2** | P2-6 | 大文件处理优化 | 1 | 1.5h |
| **P3** | P3-1 | browserslist 配置 | 2 | 0.5h |
| **P3** | P3-2 | Autoprefixer 配置 | 2 | 0.5h |
| **P3** | P3-3 | 响应式设计补充 | 5+ | 4-6h |
| **P3** | P3-4 | 测试覆盖率提升 | 10 新测试文件 | 8-12h |

**预估总工作量**：26-36 小时

---

## 实施建议

1. **分批实施**：P0 → P1 → P2 → P3，每个优先级单独提交 PR
2. **P0 立即执行**：3 项修复涉及数据安全和 XSS，不合并后续任何功能前应先修复
3. **P1 与 P2 可并行**：不同开发者可同时处理不同优先级
4. **P3 长期迭代**：响应式设计和测试覆盖率作为持续改进目标
5. **验证标准**：
   - P0/P1 修复后：运行现有 42 个测试文件确认无回归
   - P3-4 测试补充后：`vitest --coverage` 行覆盖率 >= 45%
