# AI小说工坊 - 产品需求文档（PRD）

## 文档信息

- **项目名称：** AI小说工坊
- **版本：** v1.0
- **创建日期：** 2026-03-20
- **文档状态：** 初稿

## 1. 执行摘要

### 1.1 项目概述

AI小说工坊是一个基于AI的长篇小说智能生成工具，支持全自动和半自动双模式，用户可随时干预创作过程。目标是支持100万字以上的长篇小说创作。

### 1.2 核心价值主张

- **分层AI策略**：高智商模型规划 + 性价比模型写作 = 成本降低89%
- **灵活干预**：全自动生成，用户可随时干预调整
- **长篇支持**：智能记忆系统支持100万字+小说
- **本地存储**：无需联网，数据安全
- **模板生态**：可创建、分享、导入模板

### 1.3 目标用户

- 网文作者（提高创作效率）
- 小说爱好者（自娱自乐）
- 内容创作者（快速生成内容）

## 2. 功能需求

### 2.1 核心功能模块

#### 2.1.1 项目管理

**功能描述：** 创建、管理小说项目

**需求清单：**
- ✅ 创建新项目（小说类型、篇幅、风格）
- ✅ 项目列表展示
- ✅ 项目元信息编辑（标题、简介、标签）
- ✅ 项目删除/归档
- ✅ 项目导入导出

**数据结构：**
```typescript
interface Project {
  id: string;
  title: string;
  description: string;
  genre: string;           // 类型：玄幻、都市、科幻等
  targetWords: number;     // 目标字数
  currentWords: number;    // 当前字数
  status: 'draft' | 'writing' | 'completed';
  createdAt: Date;
  updatedAt: Date;

  // 设定数据
  world: WorldSetting;
  characters: Character[];
  outline: Outline;

  // 章节内容
  chapters: Chapter[];

  // 配置
  config: ProjectConfig;
}
```

#### 2.1.2 世界观设定系统

**功能描述：** 构建小说世界的基础设定

**需求清单：**
- ✅ AI自动生成世界观
- ✅ 手动编辑世界观
- ✅ 世界观模板库
- ✅ 世界观一致性检查

**世界观包含：**
```
世界观设定：
├─ 时代背景
│  ├─ 时间设定（年代、纪元）
│  ├─ 科技水平
│  └─ 社会形态
├─ 地理设定
│  ├─ 世界地图
│  ├─ 重要地点
│  └─ 地理规则
├─ 力量体系（如适用）
│  ├─ 修炼体系
│  ├─ 等级划分
│  ├─ 功法技能
│  └─ 法宝装备
├─ 势力设定
│  ├─ 主要势力
│  ├─ 势力关系
│  └─ 组织架构
└─ 规则设定
   ├─ 世界法则
   ├─ 社会规则
   └─ 特殊设定
```

**数据结构：**
```typescript
interface WorldSetting {
  id: string;
  name: string;
  era: EraSetting;
  geography: GeographySetting;
  powerSystem?: PowerSystemSetting;  // 修真、魔法等
  factions: Faction[];
  rules: WorldRule[];

  // AI生成配置
  aiGenerated: boolean;
  generationPrompt?: string;
}

interface PowerSystemSetting {
  name: string;              // "修真体系"
  levels: PowerLevel[];      // ["炼气", "筑基", "金丹", ...]
  skills: Skill[];
  items: Item[];
}
```

#### 2.1.3 人物管理系统

**功能描述：** 管理小说中的所有角色

**需求清单：**
- ✅ AI自动生成人物
- ✅ 手动创建/编辑人物
- ✅ 人物档案管理
- ✅ 人物关系图（可视化）
- ✅ 人物出场记录
- ✅ 人物一致性检查

**人物数据结构：**
```typescript
interface Character {
  id: string;
  name: string;
  aliases: string[];        // 别名、外号

  // 基本信息
  gender: 'male' | 'female' | 'other';
  age: number;
  appearance: string;       // 外貌描写

  // 性格特征
  personality: string[];     // ["冷酷", "聪明", "谨慎"]
  values: string[];          // 价值观

  // 背景故事
  background: string;
  motivation: string;        // 行为动机

  // 能力设定
  abilities: Ability[];
  powerLevel?: string;       // 力量等级

  // 人物关系
  relationships: Relationship[];

  // 出场记录
  appearances: {
    chapterId: string;
    scenes: string[];
  }[];

  // 成长轨迹
  development: CharacterDevelopment[];

  // AI生成配置
  aiGenerated: boolean;
}

interface Relationship {
  targetId: string;
  type: 'family' | 'friend' | 'enemy' | 'lover' | 'rival' | 'other';
  description: string;
  startChapter?: number;
  evolution: RelationshipEvolution[];
}
```

#### 2.1.4 大纲系统

**功能描述：** 规划小说的整体结构和情节发展

**需求清单：**
- ✅ AI自动生成大纲
- ✅ 手动编辑大纲
- ✅ 多层级大纲（总纲 → 卷大纲 → 章节大纲）
- ✅ 大纲模板
- ✅ 伏笔管理
- ✅ 时间线可视化

**大纲结构：**
```
总纲
├─ 核心主线
├─ 主题思想
└─ 总体节奏

卷大纲
├─ 第一卷：起（1-30章）
│  ├─ 卷主题
│  ├─ 主要情节
│  └─ 人物目标
├─ 第二卷：承（31-60章）
├─ 第三卷：转（61-90章）
└─ 第四卷：合（91-120章）

章节大纲
├─ 第一章
│  ├─ 场景
│  ├─ 人物
│  ├─ 情节
│  ├─ 目标
│  └─ 伏笔
└─ 第二章
```

**数据结构：**
```typescript
interface Outline {
  id: string;

  // 总纲
  synopsis: string;          // 故事梗概
  theme: string;             // 主题
  mainPlot: PlotLine;        // 主线
  subPlots: PlotLine[];      // 支线

  // 卷大纲
  volumes: Volume[];

  // 章节大纲
  chapters: ChapterOutline[];

  // 伏笔管理
  foreshadowings: Foreshadowing[];
}

interface ChapterOutline {
  chapterId: string;
  title: string;

  // 章节内容
  scenes: Scene[];
  characters: string[];      // 出场人物ID
  location: string;          // 地点

  // 情节要素
  goals: string[];           // 人物目标
  conflicts: string[];       // 冲突
  resolutions: string[];     // 解决

  // 伏笔
  foreshadowingToPlant?: string[];   // 要埋的伏笔
  foreshadowingToResolve?: string[]; // 要回收的伏笔

  // AI生成配置
  generationPrompt?: string;
  status: 'planned' | 'writing' | 'completed';
}

interface Foreshadowing {
  id: string;
  description: string;
  plantChapter: number;      // 埋设章节
  resolveChapter?: number;   // 回收章节
  status: 'planted' | 'resolved' | 'abandoned';
}
```

#### 2.1.5 章节生成系统

**功能描述：** 根据大纲生成章节内容

**需求清单：**
- ✅ 实时生成模式（逐章生成，可随时干预）
- ✅ 批量生成模式（指定范围批量生成）
- ✅ AI续写（从指定位置继续）
- ✅ AI改写（修改指定段落）
- ✅ 手动编辑
- ✅ Markdown支持
- ✅ 实时预览

**生成流程：**
```
1. 准备上下文
   ├─ 提取人物设定
   ├─ 检索相关事件
   ├─ 获取最近章节
   └─ 组装提示词

2. AI生成
   ├─ 选择模型层级
   ├─ 发送请求
   └─ 解析响应

3. 后处理
   ├─ 格式化
   ├─ 质量检查
   ├─ 一致性检查
   └─ 保存结果
```

**数据结构：**
```typescript
interface Chapter {
  id: string;
  number: number;
  title: string;

  // 内容
  content: string;
  wordCount: number;

  // 元数据
  outline: ChapterOutline;
  status: 'draft' | 'revised' | 'final';

  // 生成信息
  generatedBy: 'ai' | 'manual' | 'hybrid';
  modelUsed?: string;
  generationTime: Date;

  // 检查点
  checkpoints: Checkpoint[];

  // AI辅助信息
  aiSuggestions?: string[];
  qualityScore?: number;
}

interface Checkpoint {
  id: string;
  timestamp: Date;
  content: string;
  description?: string;
}
```

#### 2.1.6 记忆系统（核心创新）

**功能描述：** 智能管理长篇小说的上下文记忆

**需求清单：**
- ✅ 短期记忆（最近3章）
- ✅ 中期记忆（最近10章摘要）
- ✅ 长期记忆（全书设定+关键事件）
- ✅ 向量检索（查找相关情节）
- ✅ 智能上下文组装（控制token数量）

**记忆层级：**
```typescript
class MemorySystem {
  // 短期记忆：完整文本
  shortTerm: {
    recentChapters: Chapter[];  // 最近3章完整文本
    maxTokens: 15000;
  }

  // 中期记忆：摘要
  midTerm: {
    chapterSummaries: {
      chapterId: string;
      summary: string;
      keyEvents: string[];
      characters: string[];
    }[];
    maxTokens: 5000;
  }

  // 长期记忆：设定+索引
  longTerm: {
    worldSetting: WorldSetting;
    characters: Map<string, Character>;
    keyEvents: {
      chapterId: string;
      eventDescription: string;
      importance: number;
      tags: string[];
    }[];
    maxTokens: 3000;
  }

  // 向量检索
  vectorStore: {
    // 存储章节内容的向量表示
    embeddings: Map<string, number[]>;
    // 检索相关内容
    search(query: string, k: number): string[];
  }
}
```

**上下文组装算法：**
```typescript
function assembleContext(
  chapterOutline: ChapterOutline,
  memorySystem: MemorySystem
): Context {

  // 1. 提取本章需要的信息
  const characters = extractCharacters(chapterOutline);
  const locations = extractLocations(chapterOutline);

  // 2. 从长期记忆获取
  const characterProfiles = memorySystem.longTerm
    .characters.filter(c => characters.includes(c.id));
  const locationDetails = memorySystem.longTerm
    .worldSetting.geography.locations
    .filter(l => locations.includes(l.name));

  // 3. 从中期记忆获取相关事件
  const relatedEvents = memorySystem.midTerm
    .chapterSummaries
    .filter(s => hasRelevance(s, characters, locations))
    .slice(0, 10);  // 最多10章摘要

  // 4. 从短期记忆获取最近文本
  const recentText = memorySystem.shortTerm
    .recentChapters
    .map(c => c.content)
    .join('\n\n');

  // 5. 向量检索补充
  const relatedPassages = memorySystem.vectorStore
    .search(chapterOutline.title + ' ' + chapterOutline.scenes.join(' '), 5);

  // 6. 组装上下文（控制token）
  return {
    characters: characterProfiles,      // ~500 tokens
    locations: locationDetails,          // ~300 tokens
    relatedEvents: relatedEvents,        // ~1000 tokens
    recentText: recentText,              // ~5000 tokens
    relatedPassages: relatedPassages,    // ~1000 tokens
    // 总计 ~7800 tokens
  };
}
```

#### 2.1.7 质量检查系统

**功能描述：** 自动检查小说质量

**需求清单：**
- ✅ 前后一致性检查（人物名、设定）
- ✅ 情节逻辑检查
- ✅ 文风统一检查
- ✅ 大纲符合度检查
- ✅ 用户禁止内容检查
- ✅ 质量评分

**检查算法：**
```typescript
class QualityChecker {

  // 一致性检查
  checkConsistency(chapter: Chapter, memory: MemorySystem): Issue[] {
    const issues: Issue[] = [];

    // 1. 人物名字检查
    const characters = extractCharacters(chapter);
    for (const char of characters) {
      const profile = memory.longTerm.characters.get(char.name);
      if (profile && char.name !== profile.name) {
        issues.push({
          type: 'naming',
          severity: 'high',
          message: `人物名不一致：${char.name} vs ${profile.name}`,
          location: chapter.number
        });
      }
    }

    // 2. 性格一致性检查
    for (const char of characters) {
      const profile = memory.longTerm.characters.get(char.name);
      if (profile) {
        const match = checkPersonalityMatch(char.behavior, profile.personality);
        if (match < 0.7) {
          issues.push({
            type: 'character',
            severity: 'medium',
            message: `${char.name}性格表现与设定不符`,
            location: chapter.number
          });
        }
      }
    }

    // 3. 设定一致性
    // ... 其他检查

    return issues;
  }

  // 情节逻辑检查
  checkPlotLogic(chapter: Chapter, outline: Outline): Issue[] {
    // ...
  }

  // 文风统一检查
  checkStyleConsistency(chapter: Chapter, style: StyleProfile): Issue[] {
    // ...
  }

  // 禁止内容检查
  checkForbiddenContent(chapter: Chapter, forbidden: string[]): Issue[] {
    // ...
  }

  // 综合质量评分
  calculateQualityScore(chapter: Chapter): number {
    // 0-10分
    return 8.5;
  }
}
```

#### 2.1.8 AI模型系统（核心创新）

**功能描述：** 分层AI模型策略实现

**需求清单：**
- ✅ 支持多个模型提供商（OpenAI、Claude、本地模型）
- ✅ 用户自定义模型提供商（API Key、Base URL）
- ✅ 三层模型路由（规划/写作/检查）
- ✅ 预设配置（快速/标准/精细）
- ✅ 成本估算和显示
- ✅ 模型性能统计

**模型分层策略：**
```typescript
class ModelRouter {

  // 第一层：规划模型（高智商、高成本）
  planningModels = [
    { name: 'GPT-4', cost: 0.03, performance: 10 },
    { name: 'Claude-3.5-Sonnet', cost: 0.03, performance: 10 },
    { name: 'GPT-4-Turbo', cost: 0.01, performance: 9 },
  ];

  // 第二层：写作模型（中等智商、性价比）
  writingModels = [
    { name: 'GPT-3.5-Turbo', cost: 0.0005, performance: 7 },
    { name: 'Claude-3-Haiku', cost: 0.00025, performance: 7 },
    { name: 'GPT-4-Turbo', cost: 0.01, performance: 9 },
  ];

  // 第三层：检查模型（低成本、快速）
  checkingModels = [
    { name: 'GPT-3.5-Turbo', cost: 0.0005, performance: 7 },
    { name: 'Local-Qwen-7B', cost: 0, performance: 5 },
  ];

  // 智能路由
  route(task: Task): Model {
    switch (task.type) {
      case 'world-building':
      case 'character-design':
      case 'outline-generation':
        return this.selectModel(this.planningModels, task.preset);

      case 'chapter-writing':
      case 'dialogue':
      case 'description':
        return this.selectModel(this.writingModels, task.preset);

      case 'quality-check':
      case 'consistency-check':
        return this.selectModel(this.checkingModels, task.preset);
    }
  }

  // 根据预设选择模型
  selectModel(models: Model[], preset: 'fast' | 'standard' | 'quality'): Model {
    switch (preset) {
      case 'fast':
        return models[models.length - 1];  // 最便宜的
      case 'quality':
        return models[0];                    // 最好的
      default:
        return models[Math.floor(models.length / 2)];  // 中等
    }
  }

  // 成本估算
  estimateCost(project: Project): number {
    // 根据字数、模型选择估算总成本
    const wordCount = project.targetWords;
    const avgCostPerWord = 0.00002;  // 基于分层策略的平均成本
    return wordCount * avgCostPerWord;
  }
}
```

**预设配置：**
```typescript
interface PresetConfig {
  name: string;

  // 模型选择
  planningModel: string;
  writingModel: string;
  checkingModel: string;

  // 思考深度
  planningDepth: 'shallow' | 'medium' | 'deep';
  writingDepth: 'fast' | 'standard' | 'detailed';

  // 质量检查
  enableQualityCheck: boolean;
  qualityThreshold: number;  // 0-10

  // 成本控制
  maxCostPerChapter: number;
}

const PRESETS: PresetConfig[] = [
  {
    name: '快速模式',
    planningModel: 'GPT-3.5-Turbo',
    writingModel: 'GPT-3.5-Turbo',
    checkingModel: 'Local-Qwen-7B',
    planningDepth: 'shallow',
    writingDepth: 'fast',
    enableQualityCheck: false,
    qualityThreshold: 6,
    maxCostPerChapter: 0.05,
  },
  {
    name: '标准模式',
    planningModel: 'GPT-4-Turbo',
    writingModel: 'GPT-3.5-Turbo',
    checkingModel: 'GPT-3.5-Turbo',
    planningDepth: 'medium',
    writingDepth: 'standard',
    enableQualityCheck: true,
    qualityThreshold: 7,
    maxCostPerChapter: 0.15,
  },
  {
    name: '精细模式',
    planningModel: 'GPT-4',
    writingModel: 'GPT-4-Turbo',
    checkingModel: 'GPT-3.5-Turbo',
    planningDepth: 'deep',
    writingDepth: 'detailed',
    enableQualityCheck: true,
    qualityThreshold: 8.5,
    maxCostPerChapter: 0.50,
  },
];
```

#### 2.1.9 模板系统

**功能描述：** 预设模板管理和分享

**需求清单：**
- ✅ 内置模板库（玄幻、都市、科幻等）
- ✅ 从项目创建模板
- ✅ 模板导出（JSON文件）
- ✅ 模板导入
- ✅ 模板分享（文件）
- ✅ 模板编辑

**模板数据结构：**
```typescript
interface NovelTemplate {
  meta: {
    name: string;
    version: string;
    author: string;
    description: string;
    tags: string[];
    createdAt: Date;
  };

  // 世界观模板
  worldTemplate: Partial<WorldSetting>;

  // 人物模板
  characterTemplates: {
    role: 'protagonist' | 'supporting' | 'antagonist';
    template: Partial<Character>;
  }[];

  // 大纲模板
  plotTemplate: {
    structure: string;        // "三幕结构" | "英雄之旅"
    phases: PhaseTemplate[];
  };

  // 风格模板
  styleTemplate: {
    tone: string;             // "轻松" | "严肃" | "幽默"
    narrativePerspective: string;  // "第一人称" | "第三人称"
    dialogueStyle: string;    // "简洁" | "华丽"
    descriptionLevel: string; // "详细" | "简洁"
  };

  // 生成提示词模板
  promptTemplates: {
    worldGeneration: string;
    characterGeneration: string;
    chapterGeneration: string;
  };
}
```

#### 2.1.10 AI建议系统

**功能描述：** AI主动或被动提供建议

**需求清单：**
- ✅ 可开关（默认开启）
- ✅ 开启时主动建议
- ✅ 关闭时只在用户询问时建议
- ✅ 建议类型（修改、优化、问题）

**建议类型：**
```typescript
interface Suggestion {
  type: 'improvement' | 'issue' | 'question';
  priority: 'low' | 'medium' | 'high';
  message: string;
  location: {
    chapter?: number;
    paragraph?: number;
    field?: string;
  };
  action?: {
    type: 'accept' | 'reject' | 'manual';
    autoFix?: string;
  };
}

// 示例建议
const examples = [
  {
    type: 'issue',
    priority: 'high',
    message: '主角性格在第5章和第10章不一致',
    location: { chapter: 10 },
    action: {
      type: 'manual',
      autoFix: null,
    }
  },
  {
    type: 'improvement',
    priority: 'medium',
    message: '建议在第8章增加环境描写，增强氛围',
    location: { chapter: 8 },
  },
  {
    type: 'question',
    priority: 'low',
    message: '第3章埋设的伏笔是否需要在第15章回收？',
    location: { chapter: 15 },
  },
];
```

#### 2.1.11 双模式生成

**功能描述：** 支持批量生成和实时生成两种模式

**批量生成模式：**
```typescript
interface BatchGeneration {
  mode: 'batch';
  startChapter: number;
  endChapter: number;

  // 批量前检查
  preCheck: boolean;          // 生成前检查设定
  showProgress: boolean;      // 显示进度

  // 生成中
  onPause: boolean;           // 允许暂停
  showCost: boolean;          // 显示预估成本

  // 批量后检查
  postCheck: boolean;         // 生成后质量检查
  autoFix: boolean;           // 自动修复问题
}
```

**实时生成模式：**
```typescript
interface RealtimeGeneration {
  mode: 'realtime';
  currentChapter: number;

  // 生成配置
  autoNext: boolean;          // 自动生成下一章
  showSuggestion: boolean;    // 显示AI建议

  // 检查配置
  checkBeforeNext: boolean;   // 生成前检查一致性
  allowIntervene: boolean;    // 允许用户干预
}
```

**模式切换：**
```typescript
// 随时可以切换模式
function switchMode(
  from: 'batch' | 'realtime',
  to: 'batch' | 'realtime',
  state: ProjectState
): void {
  // 保存当前状态
  saveCheckpoint();

  // 切换模式
  state.generationMode = to;

  // 恢复状态
  if (to === 'realtime') {
    // 从批量模式的停止点继续
  } else {
    // 允许批量生成多个章节
  }
}
```

### 2.2 高级功能模块

#### 2.2.1 风格提示系统

**功能描述：** 分析和模仿特定作家风格

```typescript
interface StyleProfile {
  sentenceLength: {
    average: number;
    distribution: number[];
  };

  vocabulary: {
    commonWords: string[];
    uniqueWords: string[];
    wordFrequency: Map<string, number>;
  };

  dialogueStyle: {
    avgLength: number;
    patterns: string[];
  };

  descriptionPattern: {
    sensoryDetails: number;    // 感官描写比例
    metaphorUsage: number;     // 比喻使用频率
    pacing: 'fast' | 'medium' | 'slow';
  };

  promptTemplate: string;  // 风格提示词
}

// 分析作品风格
function analyzeStyle(text: string): StyleProfile {
  // ...
}

// 应用风格
function applyStylePrompt(style: StyleProfile): string {
  return `请用以下风格写作：
- 句子平均长度：${style.sentenceLength.average}字
- 使用${style.vocabulary.commonWords.slice(0, 10).join('、')}等词汇
- 对话风格：${style.dialogueStyle.patterns[0]}
- 描写特点：${style.descriptionPattern.metaphorUsage > 0.5 ? '善用比喻' : '简洁直接'}
`;
}
```

#### 2.2.2 可视化功能

**人物关系图：**
- 使用D3.js或Cytoscape.js
- 节点：人物
- 边：关系类型
- 交互：点击查看详情

**时间线编辑器：**
- 使用Vis.js Timeline
- 显示章节事件
- 可拖拽调整
- 显示伏笔埋设和回收

**世界观地图：**
- 简单的SVG/Canvas绘制
- 标记重要地点
- 显示势力分布

### 2.3 数据存储

#### 2.3.1 本地存储架构

```typescript
// LocalStorage - 项目列表和配置
interface LocalStorageData {
  projects: ProjectMeta[];
  globalConfig: GlobalConfig;
  recentProjects: string[];
}

// IndexedDB - 项目详细数据
interface ProjectDB {
  project: Project;
  chapters: Chapter[];
  world: WorldSetting;
  characters: Character[];
  outline: Outline;

  // 记忆数据
  shortTermMemory: ShortTermMemory;
  midTermMemory: MidTermMemory;
  longTermMemory: LongTermMemory;
  embeddings: Embedding[];

  // 历史记录
  checkpoints: Checkpoint[];
  versions: Version[];
}
```

#### 2.3.2 导出导入

**导出格式：**
```yaml
项目导出（.anproj）：
  - project.json          # 项目元数据
  - world.json            # 世界观
  - characters.json       # 人物
  - outline.json          # 大纲
  - chapters/             # 章节内容
    - chapter-001.md
    - chapter-002.md
    - ...
  - config.json           # 配置
  - memory/               # 记忆数据
    - embeddings.bin
    - events.json
  - assets/               # 素材
    - images/
    - notes/

模板导出（.antemplate）：
  - template.json         # 模板数据
  - README.md            # 说明文档
```

### 2.4 UI/UX设计规范

#### 2.4.1 布局设计

```
┌─────────────────────────────────────────────────────────┐
│  AI小说工坊          [新建] [我的作品] [模板] [设置]   │
├──────────┬──────────────────────────┬────────────────┤
│ 设定面板 │    编辑器                 │ AI助手面板     │
│          │                          │                │
│ [世界观] │  # 第一章 初入江湖        │ [AI建议]      │
│ [人物]   │                          │                │
│ [大纲]   │  李青河站在青云峰顶...    │ [生成建议]    │
│ [时间线] │                          │                │
│          │  [AI续写] [手动编辑]      │ [对话]        │
│          │                          │                │
│          │  ━━━━━━━━━━━━━━━━━━━━━ │ [历史]        │
│          │  大纲：3/10章             │                │
│          │  字数：2,345              │                │
│          │  [上一章] [下一章]        │                │
└──────────┴──────────────────────────┴────────────────┘
```

#### 2.4.2 交互设计

**快捷键：**
```
Ctrl+N      新建项目
Ctrl+S      保存
Ctrl+G      AI生成
Ctrl+E      导出
Ctrl+Z      撤销
Ctrl+Shift+Z  重做
```

**拖拽操作：**
- 拖拽章节调整顺序
- 拖拽人物到关系图
- 拖拽模板到项目

**右键菜单：**
- 章节右键：生成、重写、删除、导出
- 人物右键：编辑、删除、生成关系图
- 大纲右键：编辑、生成章节、调整顺序

## 3. 非功能需求

### 3.1 性能需求

- 单章节生成时间：< 30秒
- 100万字项目加载时间：< 3秒
- 内存占用：< 500MB
- 向量检索时间：< 100ms

### 3.2 可用性需求

- 新用户上手时间：< 10分钟
- 关键操作步骤：< 3步
- 错误提示清晰度：提供修复建议

### 3.3 可维护性

- 代码注释覆盖率：> 30%
- 模块化设计
- 单元测试覆盖率：> 70%

### 3.4 可扩展性

- 支持插件系统（后期）
- 支持主题切换
- 支持多语言（后期）

## 4. 技术架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端层 (Vue 3)                        │
├─────────────────────────────────────────────────────────┤
│  UI组件  │  状态管理  │  路由  │  事件总线              │
├─────────────────────────────────────────────────────────┤
│                    业务逻辑层                           │
├─────────────────────────────────────────────────────────┤
│  项目管理 │ 设定管理 │ 生成引擎 │ 质量检查              │
├─────────────────────────────────────────────────────────┤
│                    AI抽象层                             │
├─────────────────────────────────────────────────────────┤
│  模型路由 │ 提示词管理 │ 响应解析 │ 成本计算            │
├─────────────────────────────────────────────────────────┤
│                    模型提供商层                         │
├─────────────────────────────────────────────────────────┤
│  OpenAI │ Claude │ 本地模型 │ 自定义提供商              │
├─────────────────────────────────────────────────────────┤
│                    数据层                               │
├─────────────────────────────────────────────────────────┤
│  存储管理 │ 记忆系统 │ 向量检索 │ 导入导出              │
└─────────────────────────────────────────────────────────┘
```

### 4.2 技术栈选择

**前端框架：** Vue 3
- 理由：轻量、性能好、TypeScript支持
- 版本：3.4+

**构建工具：** Vite
- 理由：快速开发服务器、优秀的开发体验
- 版本：5.0+

**状态管理：** Pinia
- 理由：Vue 3官方推荐、类型安全
- 版本：2.1+

**UI组件：** Naive UI
- 理由：Vue 3原生、组件丰富、样式现代
- 版本：2.38+

**Markdown编辑器：** Milkdown
- 理由：基于ProseMirror、可扩展、插件丰富
- 版本：7.3+

**可视化：**
- D3.js（关系图）
- Vis.js（时间线）
- Canvas/SVG（地图）

**向量检索：**
- ChromaDB浏览器版
- 或使用transformers.js本地向量化

**数据存储：**
- LocalStorage（配置、项目列表）
- IndexedDB（项目数据）

## 5. 开发计划

### Phase 1: 核心框架（2周）

**Week 1：**
- [ ] 项目初始化
- [ ] 基础UI框架（三栏布局）
- [ ] 路由配置
- [ ] 状态管理设置

**Week 2：**
- [ ] 模型提供商系统
- [ ] 本地存储系统
- [ ] 基础项目管理

### Phase 2: 核心功能（3周）

**Week 3-4：**
- [ ] 世界观生成器
- [ ] 人物管理器
- [ ] 大纲生成器
- [ ] 短期+中期记忆系统

**Week 5：**
- [ ] 章节生成器（基础版）
- [ ] 实时生成模式
- [ ] AI对话修改

### Phase 3: 高级功能（3周）

**Week 6：**
- [ ] 批量生成模式
- [ ] 长期记忆+向量检索
- [ ] 质量检查系统

**Week 7：**
- [ ] AI建议系统
- [ ] 模板系统
- [ ] 导入导出

**Week 8：**
- [ ] 性能优化
- [ ] 用户体验优化

### Phase 4: 可视化功能（2周）

**Week 9：**
- [ ] 人物关系图
- [ ] 时间线编辑器
- [ ] 素材库

**Week 10：**
- [ ] 世界观地图（基础）
- [ ] 灵感记录
- [ ] 风格提示系统

### Phase 5: 优化扩展（2周）

**Week 11：**
- [ ] 全面测试
- [ ] Bug修复
- [ ] 性能优化

**Week 12：**
- [ ] 文档完善
- [ ] 用户指南
- [ ] 发布准备

## 6. 验收标准

### 6.1 功能验收

- [ ] 支持创建100万字以上项目
- [ ] 分层模型策略有效降低成本（验证降低80%以上）
- [ ] 批量生成和实时生成模式可正常切换
- [ ] 质量检查能发现一致性问题
- [ ] 模板可导入导出

### 6.2 性能验收

- [ ] 单章节生成 < 30秒
- [ ] 100万字项目加载 < 3秒
- [ ] 内存占用 < 500MB
- [ ] 向量检索 < 100ms

### 6.3 用户验收

- [ ] 新用户10分钟内创建第一个项目
- [ ] 生成内容质量达到可接受水平
- [ ] 用户干预体验流畅

## 7. 风险和挑战

### 7.1 技术风险

**长篇小说记忆管理**
- 风险：100万字以上记忆系统可能性能不足
- 缓解：分层记忆+向量检索，控制token消耗

**AI成本控制**
- 风险：用户可能过度生成导致成本过高
- 缓解：显示预估成本，提供预算限制

**一致性检查准确度**
- 风险：AI检查可能误报
- 缓解：提供置信度，让用户确认

### 7.2 产品风险

**用户学习成本**
- 风险：功能复杂，用户难以上手
- 缓解：提供模板、教程、渐进式引导

**生成质量不稳定**
- 风险：AI生成内容质量参差不齐
- 缓解：提供多个预设、允许重新生成、手动编辑

## 8. 后期规划

### 8.1 第二期功能

- 在线模板市场
- 云端同步（可选）
- 移动端适配
- 多语言支持
- 插件系统

### 8.2 第三期功能

- 协作写作（P2P）
- AI训练定制风格
- 语音输入
- 图像生成（封面、插图）

## 9. 附录

### 9.1 术语表

- **分层模型策略**：根据任务复杂度选择不同成本的AI模型
- **记忆系统**：分层存储小说信息，解决长文本上下文问题
- **模板**：预设的设定和结构，可复用
- **预设**：模型配置和生成参数的组合
- **检查点**：章节的保存状态，支持回滚

### 9.2 参考资料

- OpenAI API文档
- Claude API文档
- 《小说写作教程》
- 《故事：材质、结构、风格和银幕剧作的原理》

---

**文档结束**
