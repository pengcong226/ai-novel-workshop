# AI小说工坊 - 数据架构设计

## 一、记忆系统架构

### 1.1 三层记忆模型

```
┌─────────────────────────────────────────────────────────────────┐
│                        长期记忆 (Long-term Memory)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ 实体库        │  │ 状态事件      │  │ 关键事件向量库        │   │
│  │ - 角色/地点等 │  │ - 事件追踪   │  │ - ChromaDB/FAISS      │   │
│  │ - 关系网络    │  │ - 历史记录   │  │ - 语义检索           │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 语义检索
┌─────────────────────────────────────────────────────────────────┐
│                        中期记忆 (Medium-term Memory)             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 最近10章摘要 (滚动窗口)                                    │   │
│  │ - 每章摘要 500-1000 tokens                                │   │
│  │ - 总计约 5000-10000 tokens                                │   │
│  │ - 用于剧情推进和伏笔追踪                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ 直接拼接
┌─────────────────────────────────────────────────────────────────┐
│                        短期记忆 (Short-term Memory)              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 最近3章完整文本 (滑动窗口)                                 │   │
│  │ - 每章约 3000-5000 tokens                                 │   │
│  │ - 总计约 9000-15000 tokens                                │   │
│  │ - 用于上下文连贯和写作风格一致性                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 记忆容量估算

| 记忆层级 | 内容 | Token估算 | 检索方式 |
|---------|------|-----------|----------|
| 短期记忆 | 3章完整文本 | 9,000-15,000 | 直接拼接 |
| 中期记忆 | 10章摘要 | 5,000-10,000 | 直接拼接 |
| 长期记忆 | 全书实体+事件 | 无限制 | 向量检索Top-K |

**总上下文预算：15,000-25,000 tokens（不含新生成内容）**

---

## 二、数据存储架构

### 2.1 项目结构

```
ai-novel-workshop/
├── data/
│   ├── novels/                    # 小说项目目录
│   │   └── {novel-id}/
│   │       ├── metadata.json      # 项目元数据
│   │       ├── outline.json       # 大纲结构
│   │       ├── entities/          # 实体信息
│   │       │   ├── {entity-id}.json
│   │       │   └── relations.json
│   │       ├── state_events/      # 状态事件流
│   │       │   └── events.jsonl
│   │       ├── chapters/          # 章节内容
│   │       │   ├── chapter_001.json
│   │       │   ├── chapter_002.json
│   │       │   └── ...
│   │       ├── memory/            # 记忆系统数据
│   │       │   ├── short_term.json    # 短期记忆缓存
│   │       │   ├── medium_term.json   # 中期记忆摘要
│   │       │   └── vectors/           # 向量数据库
│   │       │       ├── chroma.db
│   │       │       └── index.faiss
│   │       └── exports/           # 导出文件
│   │           ├── novel_{timestamp}.txt
│   │           └── backup_{timestamp}.zip
│   └── templates/                 # 模板库
│       ├── genres/
│       └── presets/
├── config/
│   └── settings.json
└── cache/
    └── model_cache/
```

### 2.2 核心数据模型

```typescript
// 元数据
interface NovelMetadata {
  id: string;
  title: string;
  author: string;
  genre: string;
  targetWords: number;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'writing' | 'completed';
}

// 大纲
interface Outline {
  acts: Act[];
  totalChapters: number;
  currentChapter: number;
}

interface Act {
  id: string;
  name: string;
  chapters: ChapterOutline[];
  description: string;
}

interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string;
  pov: string;           // 视角人物
  keyEvents: string[];
  foreshadowing: string[]; // 伏笔
}

// 世界观 (V4 原子化存储节点)
interface Worldview {
  basicRules: BasicRules;
  history: HistoricalEvent[];
  locations: Location[];
  factions: Faction[];
  magicSystem?: MagicSystem;
  technology?: Technology;
}

// 人物 (V4 原子化存储节点)
interface Character {
  id: string;
  name: string;
  aliases: string[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  attributes: {
    age: number;
    gender: string;
    appearance: string;
    personality: string[];
    abilities: string[];
  };
  background: string;
  goals: string[];
  relationships: Relationship[];
  arc: CharacterArc;
  appearances: string[]; // 出场章节ID
}

// 章节
interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  summary: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'revised' | 'final';
  metadata: {
    pov: string;
    location: string;
    characters: string[];
    keyEvents: string[];
    foreshadowing: {
      planted: string[];   // 埋下的伏笔
      resolved: string[];  // 回收的伏笔
    };
  };
}
```

### 2.3 存储分离与原子化 IPC (V5 架构新增)
在 V5 Tauri+SQLite 架构下，千万字的文本一旦以整棵 Project 树序列化，会直接导致大 JSON OOM 或者吃书截断。因此在 `stores/storage.ts` 层：
1. **数据剥离**: 将 Project 主体树中的 `chapters`, `entities`, `state_events` 脱水。
2. **批量发送**: 将脱水的主体配置和数组通过多个独立的原子化后端 API (如 `save_entity_atomic` 等) 以分离的形式发送到 Rust 端。
3. **原生入库**: 后端接收的不再是大块 JSON 字符串，而是具体的每个条目的 JSON，从而快速、安全地插入 SQLite。

---

## 三、向量检索系统

### 3.1 向量数据库选型

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **ChromaDB** | 轻量级、Python原生、支持本地 | 功能相对简单 | ★★★★★ |
| FAISS | 高性能、Meta出品 | 需要额外管理元数据 | ★★★★☆ |
| LanceDB | 无服务器、高性能 | 社区较小 | ★★★★☆ |

**推荐方案：ChromaDB**

### 3.2 向量化内容

```python
# 需要向量化的内容类型
class VectorContentType(Enum):
    CHAPTER_SUMMARY = "chapter_summary"      # 章节摘要
    KEY_EVENT = "key_event"                  # 关键事件
    ENTITY_MOMENT = "entity_moment"          # 实体状态事件
    FORESHADOWING = "foreshadowing"          # 伏笔
    DIALOGUE = "dialogue"                    # 重要对话

# 向量记录结构
class VectorRecord:
    id: str
    content: str           # 原始文本
    embedding: List[float] # 向量
    metadata: {
        type: str,         # 内容类型
        chapter_id: str,   # 所属章节
        entity_ids: List[str], # 相关实体
        importance: float, # 重要程度 0-1
        timestamp: str
    }
```

### 3.3 检索策略

```python
class MemoryRetriever:
    def retrieve_for_chapter(self, context: ChapterContext) -> RetrievedMemory:
        """为章节生成检索上下文"""

        # 1. 短期记忆：直接获取最近3章
        short_term = self.get_recent_chapters(limit=3)

        # 2. 中期记忆：获取最近10章摘要
        medium_term = self.get_recent_summaries(limit=10)

        # 3. 长期记忆：向量检索
        query = context.build_retrieval_query()
        long_term = self.vector_search(
            query=query,
            filters={
                "entity_ids": context.entities,
                "min_importance": 0.3
            },
            top_k=20
        )

        # 4. 去重合并
        return self.merge_memories(short_term, medium_term, long_term)

    def vector_search(self, query: str, filters: dict, top_k: int) -> List[VectorRecord]:
        """向量检索核心逻辑"""
        query_embedding = self.embed(query)

        results = self.chroma_collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=filters
        )

        return self.rerank_by_relevance(results, context)
```

### 3.4 嵌入模型选择

```python
# 推荐方案（按优先级）
EMBEDDING_MODELS = {
    "local": {
        "model": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        "dimension": 384,
        "优点": "本地运行、支持中文、速度快",
        "缺点": "精度中等"
    },
    "openai": {
        "model": "text-embedding-3-small",
        "dimension": 1536,
        "优点": "精度高、官方支持",
        "缺点": "需要API、有成本"
    },
    "bge": {
        "model": "BAAI/bge-large-zh-v1.5",
        "dimension": 1024,
        "优点": "中文优化、精度高",
        "缺点": "模型较大"
    }
}
```

---

## 四、记忆管理算法

### 4.1 章节完成后的记忆更新流程

```python
class MemoryManager:
    def update_memory_after_chapter(self, chapter: Chapter):
        """章节完成后更新记忆系统"""

        # 1. 更新短期记忆（滑动窗口）
        self.short_term_memory.push(chapter)
        if len(self.short_term_memory) > 3:
            old_chapter = self.short_term_memory.pop_oldest()
            # 将移出的章节摘要存入中期记忆
            self.medium_term_memory.add_summary(old_chapter.summary)

        # 2. 更新中期记忆（滚动窗口）
        self.medium_term_memory.add_summary(chapter.summary)
        if len(self.medium_term_memory) > 10:
            oldest_summary = self.medium_term_memory.pop_oldest()
            # 将移出的摘要向量化存入长期记忆
            self.vectorize_and_store(oldest_summary)

        # 3. 提取关键信息并向量存储
        key_events = self.extract_key_events(chapter)
        for event in key_events:
            self.vector_store.add(
                content=event.description,
                metadata={
                    "type": "key_event",
                    "chapter_id": chapter.id,
                    "importance": event.importance
                }
            )

        # 4. 更新人物出场记录
        for char_id in chapter.metadata.characters:
            self.characters[char_id].appearances.append(chapter.id)

        # 5. 检查伏笔状态
        self.check_foreshadowing(chapter)
```

### 4.2 关键信息提取算法

```python
class KeyInfoExtractor:
    def extract_from_chapter(self, chapter: Chapter) -> ExtractedInfo:
        """使用LLM提取章节关键信息"""

        prompt = f"""
分析以下章节，提取关键信息：

章节内容：
{chapter.content}

请提取：
1. 关键事件（重要剧情转折、冲突、决定性时刻）
2. 人物重要时刻（情感变化、成长、关系转变）
3. 伏笔（埋下的线索、暗示）
4. 伏笔回收（解开的谜团、呼应）
5. 世界观展示（新出现的规则、设定）

以JSON格式输出。
"""

        return self.llm.generate(prompt, response_format="json")
```

### 4.3 一致性检查机制

```python
class ConsistencyChecker:
    def check_before_generation(self, context: GenerationContext) -> List[Warning]:
        """生成前一致性检查"""

        warnings = []

        # 1. 人物一致性
        for char_id in context.active_characters:
            char = self.get_character(char_id)
            # 检查人物是否在当前位置合理
            if not self.is_location_consistent(char, context.location):
                warnings.append(f"角色 {char.name} 位置不一致")

            # 检查人物状态是否合理
            if not self.is_state_consistent(char, context):
                warnings.append(f"角色 {char.name} 状态不一致")

        # 2. 世界观一致性
        worldview_rules = self.get_relevant_rules(context)
        for rule in worldview_rules:
            if self.violates_rule(context, rule):
                warnings.append(f"违反世界观规则: {rule.name}")

        # 3. 时间线一致性
        if not self.is_timeline_consistent(context):
            warnings.append("时间线存在矛盾")

        # 4. 伏笔状态
        unresolved = self.get_unresolved_foreshadowing()
        if len(unresolved) > 5:  # 超过5个未回收的伏笔
            warnings.append(f"存在 {len(unresolved)} 个未回收的伏笔")

        return warnings
```

---

## 五、Token消耗优化策略

### 5.1 动态上下文组装

```python
class ContextAssembler:
    MAX_CONTEXT_TOKENS = 20000  # 预留给生成约4000 tokens

    def assemble_context(self, chapter_context: ChapterContext) -> str:
        """动态组装上下文，控制token消耗"""

        budget = self.MAX_CONTEXT_TOKENS
        context_parts = []

        # 1. 系统提示（必须，约500 tokens）
        system_prompt = self.get_system_prompt()
        budget -= self.count_tokens(system_prompt)
        context_parts.append(system_prompt)

        # 2. 世界观核心规则（必须，约1000 tokens）
        worldview_core = self.get_core_worldview()
        budget -= self.count_tokens(worldview_core)
        context_parts.append(worldview_core)

        # 3. 当前章节大纲（必须，约300 tokens）
        outline = self.get_chapter_outline(chapter_context.chapter_number)
        budget -= self.count_tokens(outline)
        context_parts.append(outline)

        # 4. 活跃人物信息（动态）
        characters = self.get_active_characters(chapter_context)
        characters_text = self.format_characters(characters, max_tokens=budget * 0.2)
        budget -= self.count_tokens(characters_text)
        context_parts.append(characters_text)

        # 5. 短期记忆（3章完整，约12000 tokens）
        if budget >= 12000:
            short_term = self.get_short_term_memory()
            context_parts.append(short_term)
            budget -= 12000
        else:
            # 预算不足，只取最近1章
            short_term = self.get_recent_chapters(limit=1)
            context_parts.append(short_term)
            budget -= self.count_tokens(short_term)

        # 6. 中期记忆（摘要，约5000 tokens）
        if budget >= 5000:
            medium_term = self.get_medium_term_memory()
            context_parts.append(medium_term)
            budget -= 5000

        # 7. 长期记忆（向量检索，使用剩余预算）
        if budget > 500:
            query = chapter_context.build_retrieval_query()
            long_term = self.vector_search(query, max_tokens=budget)
            context_parts.append(long_term)

        return "\n\n---\n\n".join(context_parts)
```

### 5.2 摘要压缩策略

```python
class SummaryCompressor:
    def compress_chapter(self, chapter: Chapter, target_ratio: float = 0.2) -> str:
        """将章节压缩为摘要"""

        # 目标长度约为原文的20%
        target_length = int(len(chapter.content) * target_ratio)

        prompt = f"""
请将以下章节压缩为简洁摘要，保留：
1. 核心事件和转折
2. 人物重要决策和情感变化
3. 关键对话要点
4. 伏笔和线索

原文（约{len(chapter.content)}字）：
{chapter.content}

目标长度：约{target_length}字
"""

        return self.llm.generate(prompt)
```

---

## 六、本地存储方案

### 6.1 文件存储策略

```python
class LocalStorage:
    def __init__(self, novel_id: str):
        self.base_path = Path(f"data/novels/{novel_id}")
        self.vector_db = None

    def save_chapter(self, chapter: Chapter):
        """保存章节"""
        path = self.base_path / "chapters" / f"chapter_{chapter.chapterNumber:03d}.json"
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(chapter.dict(), f, ensure_ascii=False, indent=2)

        # 同时更新内存缓存
        self.memory_cache.update_chapter(chapter)

    def load_novel(self) -> Novel:
        """加载整个小说项目"""
        novel = Novel()

        # 加载元数据
        with open(self.base_path / "metadata.json") as f:
            novel.metadata = NovelMetadata(**json.load(f))

        # 加载世界观
        with open(self.base_path / "worldview.json") as f:
            novel.worldview = Worldview(**json.load(f))

        # 加载人物（延迟加载，只在需要时加载）
        novel.characters = LazyCharacterLoader(self.base_path / "characters")

        # 加载章节索引
        novel.chapter_index = self.load_chapter_index()

        return novel
```

### 6.2 向量数据库本地存储

```python
import chromadb
from chromadb.config import Settings

class VectorStore:
    def __init__(self, novel_id: str):
        self.db_path = Path(f"data/novels/{novel_id}/memory/vectors")
        self.client = chromadb.PersistentClient(
            path=str(self.db_path),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )

        self.collection = self.client.get_or_create_collection(
            name="novel_memory",
            metadata={"hnsw:space": "cosine"}
        )

    def add_memory(self, content: str, metadata: dict):
        """添加记忆向量"""
        embedding = self.embed(content)
        doc_id = f"{metadata['type']}_{metadata['chapter_id']}_{uuid.uuid4()}"

        self.collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )

    def search(self, query: str, top_k: int = 20, filters: dict = None) -> List[dict]:
        """向量检索"""
        query_embedding = self.embed(query)

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=filters
        )

        return self._format_results(results)
```

---

## 七、数据导入导出

### 7.1 导出功能

```python
class NovelExporter:
    def export_to_txt(self, novel: Novel, output_path: Path):
        """导出为TXT格式"""
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"{novel.metadata.title}\n")
            f.write(f"作者：{novel.metadata.author}\n")
            f.write("=" * 50 + "\n\n")

            for chapter in novel.get_all_chapters():
                f.write(f"第{chapter.chapterNumber}章 {chapter.title}\n\n")
                f.write(chapter.content)
                f.write("\n\n" + "=" * 30 + "\n\n")

    def export_to_json(self, novel: Novel, output_path: Path):
        """导出完整JSON备份"""
        export_data = {
            "version": "1.0",
            "exported_at": datetime.now().isoformat(),
            "novel": novel.dict()
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

    def export_to_markdown(self, novel: Novel, output_dir: Path):
        """导出为Markdown格式"""
        output_dir.mkdir(parents=True, exist_ok=True)

        # 导出元数据
        with open(output_dir / "README.md", 'w', encoding='utf-8') as f:
            f.write(f"# {novel.metadata.title}\n\n")
            f.write(f"作者：{novel.metadata.author}\n\n")
            f.write(f"类型：{novel.metadata.genre}\n\n")
            f.write(f"目标字数：{novel.metadata.targetWords}\n\n")

        # 导出世界观
        self.export_worldview_markdown(novel.worldview, output_dir / "世界观")

        # 导出人物
        self.export_characters_markdown(novel.characters, output_dir / "人物")

        # 导出章节
        chapters_dir = output_dir / "章节"
        chapters_dir.mkdir(parents=True, exist_ok=True)
        for chapter in novel.get_all_chapters():
            path = chapters_dir / f"{chapter.chapterNumber:03d}_{chapter.title}.md"
            with open(path, 'w', encoding='utf-8') as f:
                f.write(f"# 第{chapter.chapterNumber}章 {chapter.title}\n\n")
                f.write(chapter.content)
```

### 7.2 导入功能

```python
class NovelImporter:
    def import_from_json(self, json_path: Path) -> Novel:
        """从JSON备份导入"""
        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)

        novel = Novel(**data["novel"])

        # 重建向量索引
        self.rebuild_vector_index(novel)

        return novel

    def import_from_txt(self, txt_path: Path, metadata: NovelMetadata) -> Novel:
        """从TXT导入（需要解析章节）"""
        with open(txt_path, encoding='utf-8') as f:
            content = f.read()

        novel = Novel(metadata=metadata)

        # 解析章节
        chapters = self.parse_chapters(content)
        for i, chapter_content in enumerate(chapters, 1):
            chapter = Chapter(
                id=str(uuid.uuid4()),
                chapterNumber=i,
                title=f"第{i}章",
                content=chapter_content,
                wordCount=len(chapter_content)
            )
            novel.add_chapter(chapter)

        return novel
```

---

## 八、性能优化

### 8.1 缓存策略

```python
class MemoryCache:
    """内存缓存，避免频繁IO"""

    def __init__(self, max_size: int = 100):
        self.cache = OrderedDict()
        self.max_size = max_size

    def get_chapter(self, chapter_id: str) -> Optional[Chapter]:
        if chapter_id in self.cache:
            # LRU: 移到最近使用
            self.cache.move_to_end(chapter_id)
            return self.cache[chapter_id]
        return None

    def set_chapter(self, chapter_id: str, chapter: Chapter):
        if chapter_id in self.cache:
            self.cache.move_to_end(chapter_id)
        else:
            if len(self.cache) >= self.max_size:
                # 移除最久未使用的
                self.cache.popitem(last=False)
            self.cache[chapter_id] = chapter
```

### 8.2 增量更新

```python
class IncrementalUpdater:
    """增量更新，避免全量重建"""

    def update_after_edit(self, chapter: Chapter, old_content: str, new_content: str):
        """编辑后增量更新"""
        # 1. 重新生成摘要
        new_summary = self.generate_summary(new_content)

        # 2. 提取变化的关键信息
        old_events = self.extract_key_events(old_content)
        new_events = self.extract_key_events(new_content)

        # 3. 更新向量数据库
        # 删除旧向量
        self.vector_store.delete_by_chapter(chapter.id)

        # 添加新向量
        for event in new_events:
            self.vector_store.add_memory(
                content=event.description,
                metadata={
                    "type": "key_event",
                    "chapter_id": chapter.id,
                    "importance": event.importance
                }
            )

        # 4. 更新中期记忆中的摘要
        self.medium_term_memory.update_summary(chapter.chapterNumber, new_summary)
```

---

## 九、技术栈推荐

```
核心框架：
- Python 3.10+
- Pydantic (数据验证)
- ChromaDB (向量数据库)

嵌入模型：
- 本地：sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
- 在线：OpenAI text-embedding-3-small

LLM集成：
- 支持 OpenAI、Claude、本地模型(Ollama)

存储：
- JSON文件 (元数据和配置)
- ChromaDB (向量存储)

前端：
- Streamlit / Gradio (原型阶段)
- Electron + React (正式版本)
```

---

## 十、实现路线图

### Phase 1: 基础架构 (Week 1-2)
- [ ] 设计数据模型
- [ ] 实现本地存储
- [ ] 搭建ChromaDB

### Phase 2: 记忆系统 (Week 3-4)
- [ ] 实现短期记忆
- [ ] 实现中期记忆
- [ ] 实现向量检索

### Phase 3: 一致性检查 (Week 5-6)
- [ ] 人物一致性检查
- [ ] 世界观一致性检查
- [ ] 伏笔追踪系统

### Phase 4: 优化与测试 (Week 7-8)
- [ ] Token消耗优化
- [ ] 缓存系统
- [ ] 增量更新
- [ ] 性能测试
