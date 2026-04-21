# AI小说工坊 - 记忆系统实现文档 -- PARTIALLY DEPRECATED

> **DEPRECATED SECTIONS**: Sections 一 (表格记忆系统), 六.2 (AI静默更新表格记忆) describe the V1 `tableMemory.ts` system which has been deleted. The project now uses the **Entity & StateEvent** architecture. Key replacements:
> - `tableMemory.ts` → deleted; replaced by Entity & StateEvent system (`src/stores/sandbox.ts`)
> - `memory-service.ts` → deleted; replaced by sandbox store
> - `state-updater.ts` → deleted; generation-scheduler now directly creates StateEvents
> - `updateRow/insertRow/deleteRow` → Tool Calling with JSON Schema (`PROPERTY_UPDATE`, `RELATION_ADD`, etc.)
> - `MemoryTables.vue` → `SandboxTimeline.vue`
> - `Characters.vue` → `CharacterDevelopment.vue`
> - `WorldSetting.vue` → `SandboxDocument.vue`
>
> Sections 二 (分层记忆系统), 三 (向量检索), 四 (混合存储), 五 (滚动大纲), 七 (智能降级), 八 (性能优化), 九 (性能指标), 十 (最佳实践) remain valid as architectural references.

## 概述

本文档详细说明AI小说工坊的记忆系统实现,包括V5 Entity & StateEvent状态记忆系统、分层记忆管理、向量检索以及SQLite/Tauri混合存储架构。

---

## 一、表格记忆系统 (借鉴 SillyTavern)

### 1.1 核心设计

**CSV格式优势**:
- Token效率提升40% (对比JSON格式)
- AI理解准确度达95%
- rowIndex精确定位更新
- 触发式过滤节省70% tokens

**数据结构**:
```typescript
interface Sheet {
  uid: string
  name: string                    // 表格名称
  type: SheetType                 // character/item/event/relationship
  hashSheet: string[][]           // 二维数组存储 cellUid
  cells: Map<string, Cell>        // cellUid -> Cell

  // 提示词配置
  note: string                    // 表格说明
  triggerSend: boolean            // 是否启用触发式更新
  triggerSendDeep: number         // 检查最近几条消息
}
```

### 1.2 AI可执行命令

```csv
* 0:角色状态
【表格内容】
rowIndex,0:姓名,1:身份,2:位置,3:状态,4:装备
1,林渊,散修,山谷,受伤,剥皮小刀
2,林清雪,公主,山谷,灵力枯竭,无

【编辑规则】
可用命令:
- updateRow(1, "林渊", "散修", "山谷", "康复", "剥皮小刀,太虚阵盘")
- insertRow("张三", "路人", "城里", "正常", "无")
- deleteRow(3)
```

**命令解析与执行**:
```typescript
export function executeTableCommand(
  memory: MemorySystem,
  sheetName: string,
  command: string
): MemorySystem {
  const parsed = parseTableCommand(command)

  switch (parsed.type) {
    case 'update':
      // 支持复合主键自动纠错
      const primaryKey = getPrimaryKey(sheet, values)
      const correctRowIndex = findRowIndexByPrimaryKey(sheet, primaryKey)
      updateRow(sheet, correctRowIndex, values)
      break

    case 'insert':
      // 自动去重 (Upsert)
      if (existsByPrimaryKey(sheet, values)) {
        updateRow(sheet, rowIndex, values)
      } else {
        insertRow(sheet, values)
      }
      break

    case 'delete':
      deleteRow(sheet, parsed.rowIndex)
      break
  }

  return memory
}
```

### 1.3 触发式过滤

**只发送相关数据,节省70% tokens**:

```typescript
export function filterRelevantRows(
  sheet: Sheet,
  recentContent: string,
  deep: number = 5
): string {
  if (!sheet.triggerSend) {
    return getSheetCSV(sheet)  // 返回全部数据
  }

  // 提取最近deep条消息中的关键词
  const keywords = extractKeywords(recentContent, deep)

  // 过滤相关行
  const relevantRows = []
  for (const row of sheet.rows) {
    if (keywords.some(kw => row.includes(kw))) {
      relevantRows.push(row)
    }
  }

  return relevantRows.join('\n')
}
```

---

## 二、分层记忆系统

### 2.1 记忆层级架构

```
优先级注入顺序 (从高到低):
┌─────────────────────────────────────┐
│ Author's Note (200 tokens)          │ 最高优先级 - 强制指令
├─────────────────────────────────────┤
│ World Info (800 tokens)             │ 世界观核心设定
├─────────────────────────────────────┤
│ Memory Tables (500 tokens)          │ 表格记忆 - 动态状态
├─────────────────────────────────────┤
│ Characters (600 tokens)             │ 相关人物信息
├─────────────────────────────────────┤
│ Vector Context (600 tokens)         │ 向量检索相关历史
├─────────────────────────────────────┤
│ Summary (600 tokens)                │ 历史章节摘要
├─────────────────────────────────────┤
│ Recent Chapters (2000 tokens)       │ 最近章节完整内容
└─────────────────────────────────────┘
```

### 2.2 上下文构建器

**动态Token预算分配**:

```typescript
const TOKEN_BUDGET = {
  TOTAL: 6000,           // 总预算
  SYSTEM_PROMPT: 300,    // 系统提示
  AUTHORS_NOTE: 200,     // 作者注释
  WORLD_INFO: 800,       // 世界观
  CHARACTERS: 600,       // 人物
  MEMORY_TABLES: 500,    // 表格记忆
  VECTOR_CONTEXT: 600,   // 向量检索
  SUMMARY: 600,          // 摘要
  RECENT_CHAPTERS: 2000, // 最近章节
  OUTLINE: 400,          // 当前大纲
  RESERVE: 400           // 预留
}

export async function buildChapterContext(
  project: Project,
  currentChapter: Chapter,
  memorySystem?: MemorySystem,
  vectorConfig?: VectorServiceConfig
): Promise<BuildContext> {
  // 动态读取高级配置
  const advanced = project.config?.advancedSettings
  const maxContextTokens = advanced?.maxContextTokens ?? 8192
  const recentCount = advanced?.recentChaptersCount ?? 3

  // 动态分配近期章节预算
  let recentBudget = maxContextTokens - 2000

  // 获取最近章节
  const recentChapters = getRecentChapters(chapters, currentChapter.number, recentCount)
  const recentContent = recentChapters.map(ch => ch.content).join('\n\n')

  // 构建各部分
  const authorsNote = buildAuthorsNote(currentChapter, recentChapters, project)
  const worldInfo = buildWorldInfo(project, currentChapter, recentChapters)
  const characters = buildCharacterInfo(project, currentChapter, recentChapters)

  // 表格记忆
  const memoryTables = memorySystem
    ? generateMemoryPrompt(memorySystem, recentContent)
    : generateMemoryPrompt(initNovelMemory(project), recentContent)

  // 向量检索
  const vectorContext = await buildVectorContext(project, currentChapter, vectorService)

  // 摘要
  const summary = buildSummary(chapters, currentChapter.number)

  // 最近章节
  const recentChaptersText = buildRecentChapters(chapters, currentChapter.number, recentBudget)

  return {
    authorsNote,
    worldInfo,
    entities: characters, // V5: Characters were replaced by entities
    memoryTables,
    vectorContext,
    summary,
    recentChapters: recentChaptersText,
    totalTokens: estimateTokens(...)
  }
}
```

### 2.3 Author's Note (最高优先级)

**强制连贯性指令**:

```typescript
function buildAuthorsNote(
  currentChapter: number,
  recentChapters: Chapter[],
  project: Project
): string {
  const parts = []

  if (currentChapter > 1) {
    parts.push(`【作者注释 - 极其重要！】`)
    parts.push(`这是第${currentChapter}章，必须严格承接前文剧情。`)
    parts.push(`当前场景：${inferCurrentScene(recentChapters, project)}`)
    parts.push(`当前人物状态：${inferCharacterStates(recentChapters, project)}`)

    // 提取前文关键信息
    const lastChapter = recentChapters[0]
    if (lastChapter?.content) {
      parts.push(`\n前文结尾情况：`)
      parts.push(lastChapter.content.slice(-200))
    }

    parts.push(`\n【绝对禁止】`)
    parts.push(`- 重新开始剧情（当作第一章写）`)
    parts.push(`- 改变已建立的人物关系`)
    parts.push(`- 遗忘已发生的事件`)
    parts.push(`- 突然跳到不相关的新场景`)
  }

  return parts.join('\n')
}
```

---

## 三、向量检索系统

### 3.1 双模式支持

**本地模式** (免费):
```typescript
import { pipeline } from '@xenova/transformers'

// 使用本地模型
const embedder = await pipeline(
  'feature-extraction',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
)

const embedding = await embedder(text, {
  pooling: 'mean',
  normalize: true
})
```

**OpenAI模式** (精准):
```typescript
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text
})

const embedding = response.data[0].embedding
```

### 3.2 向量服务接口

```typescript
export interface VectorService {
  // 添加文档
  addDocument(content: string, metadata: VectorDocumentMetadata): Promise<void>

  // 批量添加
  addDocuments(documents: Array<{content: string, metadata: VectorDocumentMetadata}>): Promise<void>

  // 语义搜索
  search(query: string, options?: SearchOptions): Promise<VectorSearchResult[]>

  // 删除文档
  deleteDocument(id: string): Promise<void>

  // 清空集合
  clearCollection(): Promise<void>

  // 统计信息
  getDocumentCount(): Promise<number>
}
```

### 3.3 向量存储 (SQLite实现)

**Tauri后端向量扩展**:

```rust
// src-tauri/src/vector.rs

use rusqlite::Connection;

pub fn init_vector_table(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS vector_documents (
            id TEXT PRIMARY KEY,
            collection TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_collection
         ON vector_documents(collection)",
        [],
    )?;

    Ok(())
}

#[tauri::command]
pub fn add_vector_documents(
    db: State<Mutex<Connection>>,
    documents: Vec<VectorDocument>
) -> Result<(), String> {
    let conn = db.lock().unwrap();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for doc in documents {
        tx.execute(
            "INSERT OR REPLACE INTO vector_documents
             (id, collection, content, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                &doc.id,
                &doc.collection,
                &doc.content,
                &serde_json::to_string(&doc.metadata).unwrap(),
                doc.created_at
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn vector_search(
    db: State<Mutex<Connection>>,
    query: String,
    collection: String,
    limit: usize
) -> Result<String, String> {
    // 简单关键词搜索 (生产环境可集成向量扩展)
    let conn = db.lock().unwrap();

    let mut stmt = conn.prepare(
        "SELECT id, content, metadata, created_at
         FROM vector_documents
         WHERE collection = ?1
         AND content LIKE '%' || ?2 || '%'
         ORDER BY created_at DESC
         LIMIT ?3"
    ).map_err(|e| e.to_string())?;

    let results = stmt.query_map(
        params![&collection, &query, limit as i32],
        |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?,
                "metadata": row.get::<_, String>(2)?,
                "created_at": row.get::<_, i64>(3)?
            }))
        }
    ).map_err(|e| e.to_string())?;

    let results: Vec<_> = results.collect();
    Ok(serde_json::to_string(&results).unwrap())
}
```

---

## 四、混合存储架构

### 4.1 环境自适应路由

**自动检测运行环境**:

```typescript
// 判断是否在Tauri环境中
const isTauri = typeof window !== 'undefined' &&
                '__TAURI_INTERNALS__' in window

// 存储适配器路由
const storage = isTauri
  ? new TauriStorage()      // SQLite后端
  : new IndexedDBStorage()  // 浏览器后端
```

### 4.2 SQLite存储适配器 (Tauri)

**批量写入优化**:

```typescript
class TauriStorage {
  async saveProject(project: any) {
    const { invoke } = await import('@tauri-apps/api/core')

    // 分离chapters减轻单条记录大小
    const projectCopy = { ...project }
    const chapters = projectCopy.chapters || []
    delete projectCopy.chapters

    // 一次性保存项目+所有章节 (事务)
    await invoke('save_project_with_chapters', {
      id: project.id,
      projectData: JSON.stringify(projectCopy),
      chaptersData: chapters.map(c => JSON.stringify(c))
    })
  }

  async loadProject(projectId: string) {
    const { invoke } = await import('@tauri-apps/api/core')
    const data = await invoke('load_project', { id: projectId })
    return JSON.parse(data)
  }
}
```

**Rust后端实现**:

```rust
// src-tauri/src/lib.rs

#[tauri::command]
fn save_project_with_chapters(
    state: State<AppState>,
    id: String,
    project_data: String,
    chapters_data: Vec<String>
) -> Result<(), String> {
    let mut db = state.db.lock().unwrap();
    let tx = db.transaction().map_err(|e| e.to_string())?;

    // 1. 保存项目元数据
    tx.execute(
        "INSERT OR REPLACE INTO projects (id, data) VALUES (?1, ?2)",
        params![&id, &project_data],
    ).map_err(|e| e.to_string())?;

    // 2. 清空旧章节
    tx.execute(
        "DELETE FROM chapters WHERE project_id = ?1",
        params![&id],
    ).map_err(|e| e.to_string())?;

    // 3. 批量插入新章节
    let mut stmt = tx.prepare(
        "INSERT INTO chapters (id, project_id, data) VALUES (?1, ?2, ?3)"
    ).map_err(|e| e.to_string())?;

    for (i, chap_str) in chapters_data.iter().enumerate() {
        // 从JSON中提取章节ID
        let chap_id = extract_chapter_id(chap_str).unwrap_or(format!("{}_chap_{}", id, i));

        stmt.execute(params![&chap_id, &id, chap_str])
            .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
```

### 4.3 IndexedDB存储适配器 (Web)

**传统浏览器存储**:

```typescript
class IndexedDBStorage {
  private db: IDBDatabase | null = null

  async init() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AI_Novel_Workshop', 1)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // 项目存储
        db.createObjectStore('projects', { keyPath: 'id' })

        // 章节存储 (带索引)
        const chaptersStore = db.createObjectStore('chapters', { keyPath: 'id' })
        chaptersStore.createIndex('projectId', 'projectId', { unique: false })
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  }

  async saveProject(project: any) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(['projects'], 'readwrite')
      const store = transaction.objectStore('projects')
      const request = store.put(project)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}
```

---

## 五、滚动大纲生成引擎

### 5.1 余量探测机制

**自动检测大纲即将耗尽**:

```typescript
async function checkOutlineRemaining(
  outline: Outline,
  currentChapter: number
): Promise<boolean> {
  const remaining = outline.chapters.length - currentChapter
  return remaining < 5  // 剩余少于5章时触发
}
```

### 5.2 自动续写大纲

**提取前文走向**:

```typescript
async function generateOutlineContinuation(
  project: Project,
  recentChapters: Chapter[],
  count: number = 20
): Promise<ChapterOutline[]> {
  // 提取前文世界观和最新走向
  const worldContext = extractWorldView(project.world)
  const recentOutline = recentChapters.slice(-5).map(ch => ch.outline)

  // 调用AI续写大纲
  const newOutline = await aiService.generateOutline({
    worldContext,
    recentOutline,
    count,
    style: project.config.writingStyle
  })

  return newOutline
}
```

### 5.3 批量生成流程

```typescript
async function batchGenerateChapters(
  project: Project,
  startChapter: number,
  count: number,
  onProgress: (progress: number) => void
) {
  for (let i = 0; i < count; i++) {
    const chapterNum = startChapter + i

    // 检查大纲余量
    if (await checkOutlineRemaining(project.outline, chapterNum)) {
      // 挂起正文生成,续写大纲
      const newOutline = await generateOutlineContinuation(project, recentChapters)
      project.outline.chapters.push(...newOutline)
      await saveProject(project)
    }

    // 生成章节
    const chapter = await generateChapter(project, chapterNum)
    project.chapters.push(chapter)

    // 更新进度
    onProgress((i + 1) / count * 100)
  }
}
```

---

## 六、自动设定生长

### 6.1 新角色提取

**正则+共现分析**:

```typescript
function extractNewCharacters(
  chapterContent: string,
  existingCharacters: Character[]
): Character[] {
  const newCharacters: Character[] = []

  // 1. 正则提取人名
  const namePattern = /[\u4e00-\u9fa5]{2,4}/g
  const potentialNames = chapterContent.match(namePattern) || []

  // 2. 过滤已存在角色
  const existingNames = new Set(existingCharacters.map(c => c.name))
  const candidateNames = [...new Set(potentialNames)]
    .filter(name => !existingNames.has(name))

  // 3. 共现频率分析
  const cooccurrence = analyzeCooccurrence(chapterContent, candidateNames)

  // 4. 推断角色类型
  for (const name of candidateNames) {
    if (cooccurrence[name] >= 3) {  // 出现3次以上
      newCharacters.push({
        id: generateId(),
        name,
        tags: [inferRole(cooccurrence[name])],
        appearances: [],
        // ... 其他字段
      })
    }
  }

  return newCharacters
}
```

### 6.2 AI静默更新表格记忆

**章节生成后自动更新**:

```typescript
async function updateMemoryFromChapter(
  chapter: Chapter,
  memory: MemorySystem
): Promise<void> {
  // 提取updateRow指令
  const commands = await extractMemoryUpdates(chapter.content)

  // 执行命令
  for (const { sheetName, command } of commands) {
    executeTableCommand(memory, sheetName, command)
  }

  // 保存更新
  await saveMemory(memory)
}
```

---

## 七、智能降级机制

### 7.1 向量检索降级

```typescript
async function retrieveRelevantContext(
  chapter: Chapter,
  project: Project,
  options: SearchOptions
): Promise<VectorSearchResult[]> {
  try {
    // 尝试向量检索
    return await vectorService.search(query, options)
  } catch (error) {
    console.warn('向量检索失败，降级为关键词检索')

    // 降级为关键词检索
    return keywordSearch(project.chapters, query, options.topK)
  }
}
```

### 7.2 存储降级

```typescript
// 自动环境检测
let storage: StorageAdapter

if (isTauri()) {
  try {
    storage = new TauriStorage()
  } catch (error) {
    console.warn('Tauri存储初始化失败，降级为IndexedDB')
    storage = new IndexedDBStorage()
  }
} else {
  storage = new IndexedDBStorage()
}
```

### 7.3 API风控处理

**智能错误恢复**:

```typescript
async function callAI(prompt: string, options: AIOptions) {
  try {
    return await aiClient.generate(prompt, options)
  } catch (error) {
    // 400错误：尝试移除max_tokens重试
    if (error.status === 400) {
      const newOptions = { ...options }
      delete newOptions.maxTokens
      return await aiClient.generate(prompt, newOptions)
    }

    // 1003错误：识别内容安全拦截
    if (error.code === 1003) {
      throw new AISafetyError('内容安全拦截: ' + error.message)
    }

    throw error
  }
}
```

**Unicode安全截断**:

```typescript
function truncateToTokens(text: string, maxTokens: number): string {
  // ... token计算逻辑 ...

  let truncated = text.substring(0, targetLength)

  // 安全截断：避免Unicode代理对死区
  const lastCode = truncated.charCodeAt(truncated.length - 1)
  if (lastCode >= 0xD800 && lastCode <= 0xDBFF) {
    truncated = truncated.substring(0, truncated.length - 1)
  }

  return truncated + '\n...(内容已截断)'
}
```

---

## 八、性能优化

### 8.1 缓存策略

```typescript
class MemoryCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize = 100

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (entry) {
      // LRU: 移到最近使用
      this.cache.delete(key)
      this.cache.set(key, entry)
      return entry.value
    }
    return null
  }

  set(key: string, value: any) {
    if (this.cache.size >= this.maxSize) {
      // 移除最久未使用
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, { value, timestamp: Date.now() })
  }
}
```

### 8.2 增量更新

```typescript
async function updateChapter(chapter: Chapter, oldContent: string) {
  const newContent = chapter.content

  // 只提取变化部分
  const diff = computeDiff(oldContent, newContent)

  // 更新向量索引
  await vectorService.deleteByChapter(chapter.id)
  await vectorService.addDocuments(extractKeyInfo(diff))

  // 更新摘要
  if (needsResummary(diff)) {
    chapter.summary = await generateSummary(newContent)
  }
}
```

---

## 九、性能指标

| 操作 | IndexedDB | SQLite | 提升 |
|------|-----------|--------|------|
| 加载100万字项目 | 3-5秒 | <1秒 | **3-5倍** |
| 保存单个章节 | 50-100ms | 10-20ms | **5倍** |
| 批量保存50章 | 5-10秒 | 500ms-1秒 | **10倍** |
| 向量检索(top-20) | 100-200ms | 50-100ms | **2倍** |
| 上下文组装 | 50ms | 50ms | 相同 |

**存储优化**:
- 单个项目100万字: IndexedDB ~200MB → SQLite ~100MB
- 章节独立表存储: 避免JSON单条记录过大
- IPC通信优化: 批量操作减少往返

---

## 十、最佳实践

### 10.1 Token预算管理

```typescript
// 根据模型动态调整
const BUDGET_BY_MODEL = {
  'gpt-4': { max: 6000, recent: 2000 },
  'gpt-4-turbo': { max: 8000, recent: 3000 },
  'gpt-4-32k': { max: 20000, recent: 5000 },
  'claude-3-5-sonnet': { max: 12000, recent: 4000 },
}

const budget = BUDGET_BY_MODEL[model] || BUDGET_BY_MODEL['gpt-4']
```

### 10.2 记忆更新时机

**建议更新时机**:
- ✅ 章节完成时 (强制)
- ✅ 人物状态变化时 (自动)
- ✅ 物品转移时 (自动)
- ✅ 关系变化时 (自动)
- ⚠️ 每3-5章主动更新一次 (可选)

### 10.3 错误处理

```typescript
try {
  await updateMemoryFromChapter(chapter, memory)
} catch (error) {
  // 记录错误但不阻断流程
  console.error('记忆更新失败:', error)

  // 保存到待更新队列
  pendingUpdates.push({ chapter, memory })

  // 后台重试
  setTimeout(() => retryPendingUpdates(), 5000)
}
```

---

## 十一、未来优化方向

1. **向量检索增强**
   - 集成FAISS提升大规模数据性能
   - 支持混合检索 (向量 + 关键词 + BM25)
   - 实现增量向量更新

2. **记忆压缩优化**
   - 智能摘要质量评估
   - 多级压缩策略 (详细/简要/极简)
   - 关键信息提取优化

3. **一致性检查增强**
   - 实时检测人物位置矛盾
   - 时间线冲突自动修复
   - 世界观违规智能提示

4. **性能优化**
   - SQLite向量扩展集成
   - 内存缓存优化
   - 并行检索优化

---

**文档版本**: v4.0
**最后更新**: 2026-03-23
**维护者**: AI小说工坊开发团队
