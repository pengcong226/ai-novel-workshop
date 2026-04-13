/**
 * 记忆系统服务
 * @module services/memory-service
 *
 * 实现三层记忆架构：
 * - 短期记忆（ShortTermMemory）：最近3章完整内容，约12K tokens
 * - 中期记忆（MidTermMemory）：最近10章摘要，约5K tokens
 * - 长期记忆（LongTermMemory）：通过向量检索相关信息，约3K tokens
 */

import type { Chapter, Character, WorldSetting, KeyEvent, ChapterSummary } from '../types/index';
import { getLogger } from '@/utils/logger';

const logger = getLogger('memory:service');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 记忆层级
 */
export type MemoryLevel = 'short' | 'mid' | 'long';

/**
 * 记忆条目
 */
export interface MemoryEntry {
  id: string;
  type: 'chapter' | 'summary' | 'character' | 'event' | 'setting' | 'plot';
  content: string;
  metadata: {
    chapterId?: string;
    chapterNumber?: number;
    timestamp: number;
    tokens: number;
    importance: number; // 0-1
    tags?: string[];
  };
  embedding?: number[];
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  entries: MemoryEntry[];
  totalTokens: number;
  sources: {
    short: number;
    mid: number;
    long: number;
  };
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  /** 短期记忆最大token数 */
  shortTermMaxTokens: number;
  /** 中期记忆最大token数 */
  midTermMaxTokens: number;
  /** 长期记忆最大token数 */
  longTermMaxTokens: number;
  /** 短期记忆保留章节数 */
  shortTermChapters: number;
  /** 中期记忆保留章节数 */
  midTermChapters: number;
}

/**
 * 向量检索接口
 */
export interface VectorStore {
  add(collection: string, entries: MemoryEntry[]): Promise<void>;
  search(collection: string, query: string | number[], topK: number): Promise<MemoryEntry[]>;
  delete(collection: string, ids: string[]): Promise<void>;
}

/**
 * AI服务接口（用于生成摘要）
 */
export interface AIService {
  generateSummary(content: string, type: 'chapter' | 'volume' | 'book'): Promise<string>;
  extractKeywords(text: string): Promise<string[]>;
  generateEmbedding(text: string): Promise<number[]>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: MemoryConfig = {
  shortTermMaxTokens: 12000,
  midTermMaxTokens: 5000,
  longTermMaxTokens: 3000,
  shortTermChapters: 3,
  midTermChapters: 10,
};

// ============================================================================
// IndexedDB 存储管理器
// ============================================================================

class MemoryStorage {
  private dbName = 'AI_Novel_Memory';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  private stores = {
    shortTerm: 'short_term_memory',
    midTerm: 'mid_term_memory',
    longTerm: 'long_term_memory',
    metadata: 'memory_metadata',
  };

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 短期记忆存储
        if (!db.objectStoreNames.contains(this.stores.shortTerm)) {
          const shortStore = db.createObjectStore(this.stores.shortTerm, { keyPath: 'id' });
          shortStore.createIndex('chapterNumber', 'metadata.chapterNumber', { unique: false });
          shortStore.createIndex('timestamp', 'metadata.timestamp', { unique: false });
        }

        // 中期记忆存储
        if (!db.objectStoreNames.contains(this.stores.midTerm)) {
          const midStore = db.createObjectStore(this.stores.midTerm, { keyPath: 'id' });
          midStore.createIndex('chapterNumber', 'metadata.chapterNumber', { unique: false });
        }

        // 长期记忆存储
        if (!db.objectStoreNames.contains(this.stores.longTerm)) {
          const longStore = db.createObjectStore(this.stores.longTerm, { keyPath: 'id' });
          longStore.createIndex('type', 'type', { unique: false });
          longStore.createIndex('importance', 'metadata.importance', { unique: false });
        }

        // 元数据存储
        if (!db.objectStoreNames.contains(this.stores.metadata)) {
          db.createObjectStore(this.stores.metadata, { keyPath: 'key' });
        }
      };
    });
  }

  async save(level: MemoryLevel, entries: MemoryEntry[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const storeName = this.getStoreName(level);
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      for (const entry of entries) {
        store.put(entry);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async load(level: MemoryLevel): Promise<MemoryEntry[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const storeName = this.getStoreName(level);
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(level: MemoryLevel, ids: string[]): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const storeName = this.getStoreName(level);
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      for (const id of ids) {
        store.delete(id);
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clear(level: MemoryLevel): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const storeName = this.getStoreName(level);
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setMetadata(key: string, value: any): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.stores.metadata, 'readwrite');
      const store = transaction.objectStore(this.stores.metadata);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.stores.metadata, 'readonly');
      const store = transaction.objectStore(this.stores.metadata);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? (result.value as T) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private getStoreName(level: MemoryLevel): string {
    switch (level) {
      case 'short':
        return this.stores.shortTerm;
      case 'mid':
        return this.stores.midTerm;
      case 'long':
        return this.stores.longTerm;
    }
  }
}

// ============================================================================
// Token 估算器
// ============================================================================

class TokenEstimator {
  /**
   * 估算文本的token数量
   * 中文约1.5字符/token，英文约4字符/token
   */
  estimate(text: string): number {
    // 简化的token估算
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 估算对象的token数量
   */
  estimateObject(obj: any): number {
    return this.estimate(JSON.stringify(obj));
  }
}

// ============================================================================
// 摘要生成器
// ============================================================================

class SummaryGenerator {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  /**
   * 生成章节摘要
   */
  async generateChapterSummary(chapter: Chapter): Promise<ChapterSummary> {
    const summary = await this.aiService.generateSummary(chapter.content, 'chapter');

    return {
      chapterId: chapter.id,
      summary,
      keyEvents: await this.extractKeyEvents(chapter.content),
      characters: await this.extractCharacters(chapter.content),
    };
  }

  /**
   * 生成卷摘要
   */
  async generateVolumeSummary(summaries: ChapterSummary[]): Promise<string> {
    const combinedSummaries = summaries
      .map(s => `第${s.chapterId}章：${s.summary}`)
      .join('\n');

    return this.aiService.generateSummary(combinedSummaries, 'volume');
  }

  /**
   * 生成全书摘要
   */
  async generateBookSummary(volumeSummaries: string[]): Promise<string> {
    const combined = volumeSummaries.join('\n\n');
    return this.aiService.generateSummary(combined, 'book');
  }

  /**
   * 提取关键事件
   */
  private async extractKeyEvents(content: string): Promise<string[]> {
    // 简化实现：从摘要中提取关键词作为事件
    const keywords = await this.aiService.extractKeywords(content);
    return keywords.slice(0, 5);
  }

  /**
   * 提取涉及人物
   */
  private async extractCharacters(content: string): Promise<string[]> {
    // 简化实现：使用关键词提取识别人物名
    const keywords = await this.aiService.extractKeywords(content);
    // 实际项目中应使用NER或专门的实体识别
    return keywords.filter(k => k.length >= 2 && k.length <= 4);
  }
}

// ============================================================================
// 短期记忆管理器
// ============================================================================

class ShortTermMemoryManager {
  private storage: MemoryStorage;
  private config: MemoryConfig;
  private tokenEstimator: TokenEstimator;

  constructor(storage: MemoryStorage, config: MemoryConfig) {
    this.storage = storage;
    this.config = config;
    this.tokenEstimator = new TokenEstimator();
  }

  /**
   * 添加章节到短期记忆
   */
  async addChapter(chapter: Chapter): Promise<void> {
    const entries = await this.storage.load('short');

    // 创建新的记忆条目
    const entry: MemoryEntry = {
      id: `chapter-${chapter.id}`,
      type: 'chapter',
      content: chapter.content,
      metadata: {
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        timestamp: Date.now(),
        tokens: this.tokenEstimator.estimate(chapter.content),
        importance: 1.0,
      },
    };

    // 按章节号排序
    entries.push(entry);
    entries.sort((a, b) => (a.metadata.chapterNumber || 0) - (b.metadata.chapterNumber || 0));

    // 只保留最近的章节
    while (entries.length > this.config.shortTermChapters) {
      entries.shift();
    }

    // 检查token限制
    let totalTokens = entries.reduce((sum, e) => sum + e.metadata.tokens, 0);
    while (totalTokens > this.config.shortTermMaxTokens && entries.length > 1) {
      const removed = entries.shift()!;
      totalTokens -= removed.metadata.tokens;
    }

    await this.storage.clear('short');
    await this.storage.save('short', entries);
  }

  /**
   * 获取短期记忆
   */
  async getRecentChapters(): Promise<MemoryEntry[]> {
    return this.storage.load('short');
  }

  /**
   * 获取token使用情况
   */
  async getUtilization(): Promise<{ used: number; max: number; ratio: number }> {
    const entries = await this.storage.load('short');
    const used = entries.reduce((sum, e) => sum + e.metadata.tokens, 0);
    return {
      used,
      max: this.config.shortTermMaxTokens,
      ratio: used / this.config.shortTermMaxTokens,
    };
  }

  /**
   * 清理过期内容
   */
  async archive(chapterNumbersToKeep: number[]): Promise<MemoryEntry[]> {
    const entries = await this.storage.load('short');
    const toArchive = entries.filter(e => !chapterNumbersToKeep.includes(e.metadata.chapterNumber || 0));
    const toKeep = entries.filter(e => chapterNumbersToKeep.includes(e.metadata.chapterNumber || 0));

    await this.storage.clear('short');
    await this.storage.save('short', toKeep);

    return toArchive;
  }
}

// ============================================================================
// 中期记忆管理器
// ============================================================================

class MidTermMemoryManager {
  private storage: MemoryStorage;
  private config: MemoryConfig;
  private tokenEstimator: TokenEstimator;
  private summaryGenerator: SummaryGenerator;

  constructor(
    storage: MemoryStorage,
    config: MemoryConfig,
    aiService: AIService
  ) {
    this.storage = storage;
    this.config = config;
    this.tokenEstimator = new TokenEstimator();
    this.summaryGenerator = new SummaryGenerator(aiService);
  }

  /**
   * 添加章节摘要
   */
  async addChapterSummary(summary: ChapterSummary, tokens: number): Promise<void> {
    const entries = await this.storage.load('mid');

    const entry: MemoryEntry = {
      id: `summary-${summary.chapterId}`,
      type: 'summary',
      content: summary.summary,
      metadata: {
        chapterId: summary.chapterId,
        timestamp: Date.now(),
        tokens,
        importance: 0.8,
        tags: summary.keyEvents,
      },
    };

    entries.push(entry);

    // 按时间戳排序（旧的在前）
    entries.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp);

    // 只保留指定数量的章节摘要
    while (entries.length > this.config.midTermChapters) {
      entries.shift();
    }

    // 检查token限制
    let totalTokens = entries.reduce((sum, e) => sum + e.metadata.tokens, 0);
    while (totalTokens > this.config.midTermMaxTokens && entries.length > 1) {
      const removed = entries.shift()!;
      totalTokens -= removed.metadata.tokens;
    }

    await this.storage.clear('mid');
    await this.storage.save('mid', entries);
  }

  /**
   * 获取所有摘要
   */
  async getSummaries(): Promise<MemoryEntry[]> {
    return this.storage.load('mid');
  }

  /**
   * 获取指定范围的摘要
   */
  async getSummariesRange(startChapter: number, endChapter: number): Promise<MemoryEntry[]> {
    const entries = await this.storage.load('mid');
    return entries.filter(e => {
      const chapterNum = e.metadata.chapterNumber;
      return chapterNum !== undefined && chapterNum >= startChapter && chapterNum <= endChapter;
    });
  }

  /**
   * 生成并存储章节摘要
   */
  async generateAndStoreSummary(chapter: Chapter): Promise<ChapterSummary> {
    const summary = await this.summaryGenerator.generateChapterSummary(chapter);
    const tokens = this.tokenEstimator.estimate(summary.summary);
    await this.addChapterSummary(summary, tokens);
    return summary;
  }
}

// ============================================================================
// 长期记忆管理器
// ============================================================================

class LongTermMemoryManager {
  private storage: MemoryStorage;
  private vectorStore: VectorStore | null;
  private aiService: AIService;
  private tokenEstimator: TokenEstimator;

  private collections = {
    characters: 'characters',
    events: 'events',
    settings: 'settings',
    plots: 'plots',
  };

  constructor(
    storage: MemoryStorage,
    vectorStore: VectorStore | null,
    aiService: AIService,
    _config: MemoryConfig
  ) {
    this.storage = storage;
    this.vectorStore = vectorStore;
    this.aiService = aiService;
    this.tokenEstimator = new TokenEstimator();
  }

  /**
   * 添加人物档案
   */
  async addCharacterProfile(character: Character): Promise<void> {
    const content = this.formatCharacterContent(character);
    const embedding = await this.aiService.generateEmbedding(content);

    const entry: MemoryEntry = {
      id: `character-${character.id}`,
      type: 'character',
      content,
      embedding,
      metadata: {
        timestamp: Date.now(),
        tokens: this.tokenEstimator.estimate(content),
        importance: 0.9,
        tags: [character.name, ...character.aliases],
      },
    };

    await this.storage.save('long', [entry]);

    if (this.vectorStore) {
      await this.vectorStore.add(this.collections.characters, [entry]);
    }
  }

  /**
   * 添加事件记录
   */
  async addKeyEvent(event: KeyEvent): Promise<void> {
    const content = event.eventDescription;
    const embedding = await this.aiService.generateEmbedding(content);

    const entry: MemoryEntry = {
      id: `event-${event.chapterId}-${Date.now()}`,
      type: 'event',
      content,
      embedding,
      metadata: {
        chapterId: event.chapterId,
        timestamp: Date.now(),
        tokens: this.tokenEstimator.estimate(content),
        importance: event.importance,
        tags: event.tags,
      },
    };

    await this.storage.save('long', [entry]);

    if (this.vectorStore) {
      await this.vectorStore.add(this.collections.events, [entry]);
    }
  }

  /**
   * 添加世界设定
   */
  async addWorldSetting(setting: WorldSetting): Promise<void> {
    const content = this.formatWorldSetting(setting);
    const embedding = await this.aiService.generateEmbedding(content);

    const entry: MemoryEntry = {
      id: `setting-${setting.id}`,
      type: 'setting',
      content,
      embedding,
      metadata: {
        timestamp: Date.now(),
        tokens: this.tokenEstimator.estimate(content),
        importance: 1.0,
        tags: [setting.name],
      },
    };

    await this.storage.save('long', [entry]);

    if (this.vectorStore) {
      await this.vectorStore.add(this.collections.settings, [entry]);
    }
  }

  /**
   * 语义检索
   */
  async search(query: string, options: {
    collection?: string;
    topK?: number;
    minImportance?: number;
  } = {}): Promise<MemoryEntry[]> {
    const { topK = 5, minImportance = 0.5 } = options;

    // 如果有向量存储，使用语义检索
    if (this.vectorStore) {
      const collection = options.collection || this.collections.settings;
      const results = await this.vectorStore.search(collection, query, topK);
      return results.filter(e => e.metadata.importance >= minImportance);
    }

    // 否则使用简单的关键词匹配
    return this.keywordSearch(query, topK, minImportance);
  }

  /**
   * 关键词搜索（后备方案）
   */
  private async keywordSearch(query: string, topK: number, minImportance: number): Promise<MemoryEntry[]> {
    const entries = await this.storage.load('long');

    // 简单的关键词匹配
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = entries
      .filter(e => e.metadata.importance >= minImportance)
      .map(entry => {
        const content = entry.content.toLowerCase();
        const score = keywords.reduce((sum, kw) => {
          return sum + (content.includes(kw) ? 1 : 0);
        }, 0);
        return { entry, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.entry);

    return scored;
  }

  /**
   * 获取所有人物档案
   */
  async getCharacterProfiles(): Promise<MemoryEntry[]> {
    const entries = await this.storage.load('long');
    return entries.filter(e => e.type === 'character');
  }

  /**
   * 获取所有事件记录
   */
  async getKeyEvents(): Promise<MemoryEntry[]> {
    const entries = await this.storage.load('long');
    return entries.filter(e => e.type === 'event');
  }

  /**
   * 格式化人物内容
   */
  private formatCharacterContent(character: Character): string {
    const parts = [
      `【人物：${character.name}】`,
      `别名：${character.aliases.join('、') || '无'}`,
      `性别：${character.gender === 'male' ? '男' : character.gender === 'female' ? '女' : '其他'}`,
      `年龄：${character.age}`,
      `外貌：${character.appearance}`,
      `性格：${character.personality.join('、')}`,
      `价值观：${character.values.join('、')}`,
      `背景：${character.background}`,
      `动机：${character.motivation}`,
      `能力：${character.abilities.map(a => `${a.name}(${a.level})`).join('、')}`,
    ];

    if (character.powerLevel) {
      parts.push(`实力等级：${character.powerLevel}`);
    }

    parts.push(`关系：${character.relationships.map(r => `${r.targetId}(${r.type})`).join('、')}`);

    return parts.join('\n');
  }

  /**
   * 格式化世界设定
   */
  private formatWorldSetting(setting: WorldSetting): string {
    const parts = [
      `【世界：${setting.name}】`,
      `时代：${setting.era.time}`,
      `科技水平：${setting.era.techLevel}`,
      `社会形态：${setting.era.socialForm}`,
      `地理：${setting.geography.locations.map(l => l.name).join('、')}`,
    ];

    if (setting.powerSystem) {
      parts.push(`力量体系：${setting.powerSystem.name}`);
      parts.push(`等级：${setting.powerSystem.levels.map(l => l.name).join('、')}`);
    }

    parts.push(`势力：${setting.factions.map(f => f.name).join('、')}`);
    parts.push(`规则：${setting.rules.map(r => r.name).join('、')}`);

    return parts.join('\n');
  }
}

// ============================================================================
// 主记忆服务类
// ============================================================================

/**
 * @deprecated V5 架构下不再使用。记忆功能已迁移到 V5 Graph-Guided RAG + Table Memory。
 */
export class MemoryService {
  private storage: MemoryStorage;
  private shortTerm: ShortTermMemoryManager;
  private midTerm: MidTermMemoryManager;
  private longTerm: LongTermMemoryManager;
  private config: MemoryConfig;

  constructor(
    aiService: AIService,
    vectorStore?: VectorStore,
    config: Partial<MemoryConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = new MemoryStorage();

    this.shortTerm = new ShortTermMemoryManager(this.storage, this.config);
    this.midTerm = new MidTermMemoryManager(this.storage, this.config, aiService);
    this.longTerm = new LongTermMemoryManager(this.storage, vectorStore || null, aiService, this.config);
  }

  /**
   * 初始化记忆服务
   */
  async initialize(): Promise<void> {
    await this.storage.init();
  }

  /**
   * 构建生成上下文
   * 自动组装相关的短期、中期、长期记忆
   */
  async buildContext(options: {
    currentChapter?: number;
    involvedCharacters?: string[];
    plotKeywords?: string[];
    maxTokens?: number;
  } = {}): Promise<RetrievalResult> {
    const maxTokens = options.maxTokens || 20000;
    const result: RetrievalResult = {
      entries: [],
      totalTokens: 0,
      sources: { short: 0, mid: 0, long: 0 },
    };

    // 1. 获取短期记忆（最近的章节）
    const shortTermEntries = await this.shortTerm.getRecentChapters();

    for (const entry of shortTermEntries) {
      if (result.totalTokens + entry.metadata.tokens > maxTokens * 0.5) break;
      result.entries.push(entry);
      result.totalTokens += entry.metadata.tokens;
      result.sources.short++;
    }

    // 2. 获取中期记忆（章节摘要）
    const midTermEntries = await this.midTerm.getSummaries();
    for (const entry of midTermEntries) {
      if (result.totalTokens + entry.metadata.tokens > maxTokens * 0.75) break;
      result.entries.push(entry);
      result.totalTokens += entry.metadata.tokens;
      result.sources.mid++;
    }

    // 3. 获取长期记忆（人物、事件、设定）

    // 获取相关人物
    if (options.involvedCharacters && options.involvedCharacters.length > 0) {
      const characterEntries = await this.longTerm.getCharacterProfiles();
      const relevant = characterEntries.filter(e =>
        options.involvedCharacters!.some(name =>
          e.metadata.tags?.includes(name) || e.content.includes(name)
        )
      );

      for (const entry of relevant.slice(0, 3)) {
        if (result.totalTokens + entry.metadata.tokens > maxTokens * 0.9) break;
        result.entries.push(entry);
        result.totalTokens += entry.metadata.tokens;
        result.sources.long++;
      }
    }

    // 根据关键词搜索相关内容
    if (options.plotKeywords && options.plotKeywords.length > 0) {
      const query = options.plotKeywords.join(' ');
      const searchResults = await this.longTerm.search(query, { topK: 3 });

      for (const entry of searchResults) {
        if (result.totalTokens + entry.metadata.tokens > maxTokens * 0.95) break;
        if (!result.entries.find(e => e.id === entry.id)) {
          result.entries.push(entry);
          result.totalTokens += entry.metadata.tokens;
          result.sources.long++;
        }
      }
    }

    return result;
  }

  /**
   * 更新记忆
   * 处理新章节内容，更新三层记忆
   */
  async update(chapter: Chapter, worldSetting?: WorldSetting, characters?: Character[]): Promise<void> {
    // 1. 更新短期记忆
    await this.shortTerm.addChapter(chapter);

    // 2. 生成并存储摘要到中期记忆
    await this.midTerm.generateAndStoreSummary(chapter);

    // 3. 提取并存储关键事件到长期记忆
    const events = await this.extractKeyEvents(chapter);
    for (const event of events) {
      await this.longTerm.addKeyEvent(event);
    }

    // 4. 更新世界设定（如果提供）
    if (worldSetting) {
      await this.longTerm.addWorldSetting(worldSetting);
    }

    // 5. 更新人物档案（如果提供）
    if (characters) {
      for (const character of characters) {
        await this.longTerm.addCharacterProfile(character);
      }
    }

    // 6. 检查并执行记忆归档
    await this.checkAndArchive();
  }

  /**
   * 提取章节中的关键事件
   */
  private async extractKeyEvents(chapter: Chapter): Promise<KeyEvent[]> {
    // 简化实现：从章节内容中提取关键词作为事件
    // 实际项目中应使用AI进行更精确的事件提取
    const events: KeyEvent[] = [];

    // 基于章节大纲创建事件
    if (chapter.outline.goals.length > 0) {
      events.push({
        chapterId: chapter.id,
        eventDescription: `第${chapter.number}章目标：${chapter.outline.goals.join('、')}`,
        importance: 0.8,
        tags: ['目标', `第${chapter.number}章`],
      });
    }

    if (chapter.outline.foreshadowingToPlant && chapter.outline.foreshadowingToPlant.length > 0) {
      events.push({
        chapterId: chapter.id,
        eventDescription: `第${chapter.number}章埋下伏笔：${chapter.outline.foreshadowingToPlant.join('、')}`,
        importance: 0.7,
        tags: ['伏笔', `第${chapter.number}章`],
      });
    }

    return events;
  }

  /**
   * 检查并执行记忆归档
   */
  private async checkAndArchive(): Promise<void> {
    const utilization = await this.shortTerm.getUtilization();

    // 如果短期记忆使用超过80%，归档最旧的内容
    if (utilization.ratio > 0.8) {
      const entries = await this.shortTerm.getRecentChapters();
      if (entries.length > 2) {
        // 保留最近的2章，归档其他的
        const keepNumbers = entries.slice(-2).map(e => e.metadata.chapterNumber || 0);
        const archived = await this.shortTerm.archive(keepNumbers);

        // 归档的内容已经在中期记忆中（摘要形式），这里只需清理短期记忆
        logger.info(`Archived ${archived.length} entries from short-term memory`);
      }
    }
  }

  /**
   * 获取人物上下文
   */
  async getCharacterContext(characterNames: string[]): Promise<string> {
    const entries = await this.longTerm.getCharacterProfiles();
    const relevant = entries.filter(e =>
      characterNames.some(name =>
        e.metadata.tags?.includes(name) || e.content.includes(name)
      )
    );

    return relevant.map(e => e.content).join('\n\n');
  }

  /**
   * 获取历史上下文
   */
  async getHistoricalContext(query: string, topK: number = 5): Promise<string> {
    const results = await this.longTerm.search(query, { topK });
    return results.map(e => e.content).join('\n\n');
  }

  /**
   * 清理所有记忆
   */
  async clearAll(): Promise<void> {
    await this.storage.clear('short');
    await this.storage.clear('mid');
    await this.storage.clear('long');
  }

  /**
   * 导出记忆数据
   */
  async export(): Promise<{
    short: MemoryEntry[];
    mid: MemoryEntry[];
    long: MemoryEntry[];
  }> {
    return {
      short: await this.storage.load('short'),
      mid: await this.storage.load('mid'),
      long: await this.storage.load('long'),
    };
  }

  /**
   * 导入记忆数据
   */
  async import(data: {
    short?: MemoryEntry[];
    mid?: MemoryEntry[];
    long?: MemoryEntry[];
  }): Promise<void> {
    if (data.short) {
      await this.storage.clear('short');
      await this.storage.save('short', data.short);
    }
    if (data.mid) {
      await this.storage.clear('mid');
      await this.storage.save('mid', data.mid);
    }
    if (data.long) {
      await this.storage.clear('long');
      await this.storage.save('long', data.long);
    }
  }

  /**
   * 获取记忆统计信息
   */
  async getStats(): Promise<{
    short: { count: number; tokens: number; utilization: number };
    mid: { count: number; tokens: number };
    long: { count: number; tokens: number };
  }> {
    const shortEntries = await this.storage.load('short');
    const midEntries = await this.storage.load('mid');
    const longEntries = await this.storage.load('long');

    const shortTokens = shortEntries.reduce((sum, e) => sum + e.metadata.tokens, 0);
    const utilization = await this.shortTerm.getUtilization();

    return {
      short: {
        count: shortEntries.length,
        tokens: shortTokens,
        utilization: utilization.ratio,
      },
      mid: {
        count: midEntries.length,
        tokens: midEntries.reduce((sum, e) => sum + e.metadata.tokens, 0),
      },
      long: {
        count: longEntries.length,
        tokens: longEntries.reduce((sum, e) => sum + e.metadata.tokens, 0),
      },
    };
  }
}

// ============================================================================
// 默认导出
// ============================================================================

export default MemoryService;
