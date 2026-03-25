# AI小说工坊 - 前端架构设计文档

## 1. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.4+ | 核心框架 |
| Vite | 5.x | 构建工具 |
| TypeScript | 5.x | 类型支持 |
| Pinia | 2.x | 状态管理 |
| Vue Router | 4.x | 路由管理 |
| Element Plus | 2.x | UI组件库 |
| @vueuse/core | 10.x | 组合式工具函数 |
| Mermaid | 10.x | 关系图渲染 |
| Marked | 12.x | Markdown解析 |
| CodeMirror | 6.x | 代码编辑器 |

## 2. 项目结构

```
ai-novel-workshop/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/              # 静态资源
│   │   ├── styles/
│   │   │   ├── variables.scss
│   │   │   ├── reset.scss
│   │   │   └── global.scss
│   │   └── icons/
│   ├── components/          # 组件
│   │   ├── common/          # 通用组件
│   │   │   ├── AppHeader.vue
│   │   │   ├── AppSidebar.vue
│   │   │   └── LoadingSpinner.vue
│   │   ├── layout/          # 布局组件
│   │   │   ├── ThreeColumnLayout.vue
│   │   │   ├── LeftPanel.vue
│   │   │   ├── CenterPanel.vue
│   │   │   └── RightPanel.vue
│   │   ├── settings/        # 设定面板组件
│   │   │   ├── WorldBuilding.vue
│   │   │   ├── CharacterManager.vue
│   │   │   ├── OutlineTree.vue
│   │   │   ├── CharacterCard.vue
│   │   │   └── WorldSettingForm.vue
│   │   ├── editor/          # 编辑器组件
│   │   │   ├── MarkdownEditor.vue
│   │   │   ├── EditorToolbar.vue
│   │   │   ├── PreviewPane.vue
│   │   │   └── ChapterList.vue
│   │   ├── assistant/       # AI助手组件
│   │   │   ├── ChatPanel.vue
│   │   │   ├── ChatMessage.vue
│   │   │   ├── SuggestionCard.vue
│   │   │   └── PromptSelector.vue
│   │   └── visualization/   # 可视化组件
│   │       ├── RelationGraph.vue
│   │       ├── TimelineView.vue
│   │       └── NodeDetails.vue
│   ├── composables/         # 组合式函数
│   │   ├── useNovel.ts
│   │   ├── useCharacters.ts
│   │   ├── useOutline.ts
│   │   ├── useAI.ts
│   │   └── useMarkdown.ts
│   ├── stores/              # Pinia状态管理
│   │   ├── index.ts
│   │   ├── novel.ts
│   │   ├── characters.ts
│   │   ├── outline.ts
│   │   ├── editor.ts
│   │   └── assistant.ts
│   ├── router/              # 路由配置
│   │   └── index.ts
│   ├── services/            # API服务
│   │   ├── api.ts
│   │   ├── novelService.ts
│   │   └── aiService.ts
│   ├── types/               # TypeScript类型定义
│   │   ├── novel.ts
│   │   ├── character.ts
│   │   ├── outline.ts
│   │   └── api.ts
│   ├── utils/               # 工具函数
│   │   ├── storage.ts
│   │   ├── markdown.ts
│   │   └── format.ts
│   ├── App.vue
│   └── main.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 3. 三栏布局设计

```
┌────────────────────────────────────────────────────────────────────┐
│                           AppHeader                                 │
│  [Logo] AI小说工坊          [项目名]              [设置] [用户]     │
├──────────────┬──────────────────────────┬─────────────────────────┤
│              │                          │                         │
│   左侧面板    │        中间编辑区         │       右侧辅助区         │
│   (设定区)    │                          │       (AI助手)          │
│              │                          │                         │
│  ┌─────────┐ │  ┌────────────────────┐  │  ┌───────────────────┐  │
│  │世界观设定│ │  │     工具栏         │  │  │    AI对话面板     │  │
│  └─────────┘ │  ├────────────────────┤  │  │                   │  │
│  ┌─────────┐ │  │                    │  │  ├───────────────────┤  │
│  │人物管理  │ │  │   Markdown编辑器   │  │  │   智能建议卡片     │  │
│  │         │ │  │                    │  │  │                   │  │
│  │ [人物1] │ │  │   (CodeMirror)     │  │  ├───────────────────┤  │
│  │ [人物2] │ │  │                    │  │  │   提示词选择器     │  │
│  │ [+]    │ │  ├────────────────────┤  │  │                   │  │
│  └─────────┘ │  │    实时预览区域    │  │  └───────────────────┘  │
│  ┌─────────┐ │  │                    │  │                         │
│  │大纲树    │ │  │   (渲染HTML)       │  │                         │
│  │         │ │  │                    │  │                         │
│  │ 章节1   │ │  └────────────────────┘  │                         │
│  │ 章节2   │ │                          │                         │
│  └─────────┘ │                          │                         │
│              │                          │                         │
│   可调整宽度  │      可调整宽度          │     可调整宽度           │
│   (拖拽)     │      (拖拽)             │     (拖拽)               │
└──────────────┴──────────────────────────┴─────────────────────────┘
```

## 4. 状态管理设计 (Pinia)

### 4.1 Novel Store (小说核心状态)

```typescript
// stores/novel.ts
interface NovelState {
  // 当前项目
  currentProject: Project | null;

  // 世界观设定
  worldSettings: WorldSettings;

  // 章节列表
  chapters: Chapter[];

  // 当前编辑章节
  currentChapter: Chapter | null;

  // 加载状态
  loading: boolean;
}

interface WorldSettings {
  name: string;           // 世界名称
  era: string;            // 时代背景
  magic: boolean;         // 是否有魔法体系
  technology: string;     // 科技水平
  geography: string;      // 地理环境
  society: string;        // 社会结构
  rules: Rule[];          // 世界规则
}
```

### 4.2 Characters Store (人物管理)

```typescript
// stores/characters.ts
interface CharactersState {
  // 人物列表
  characters: Character[];

  // 当前选中人物
  selectedCharacter: Character | null;

  // 人物关系图数据
  relationships: Relationship[];

  // 搜索过滤
  searchQuery: string;
}

interface Character {
  id: string;
  name: string;
  nickname: string;
  age: number;
  gender: string;
  appearance: string;     // 外貌描述
  personality: string;    // 性格特点
  background: string;     // 背景故事
  skills: string[];       // 技能/能力
  relationships: {
    targetId: string;
    type: 'family' | 'friend' | 'enemy' | 'lover' | 'other';
    description: string;
  }[];
  avatar?: string;        // 头像URL
}
```

### 4.3 Outline Store (大纲管理)

```typescript
// stores/outline.ts
interface OutlineState {
  // 大纲树结构
  outlineTree: OutlineNode[];

  // 当前选中节点
  selectedNode: OutlineNode | null;

  // 展开状态
  expandedKeys: string[];
}

interface OutlineNode {
  id: string;
  title: string;
  type: 'volume' | 'chapter' | 'scene';
  summary: string;
  wordCount: number;
  status: 'planned' | 'drafting' | 'completed';
  children: OutlineNode[];
  order: number;
}
```

### 4.4 Editor Store (编辑器状态)

```typescript
// stores/editor.ts
interface EditorState {
  // 编辑器模式
  mode: 'edit' | 'preview' | 'split';

  // 编辑器内容
  content: string;

  // 光标位置
  cursorPosition: { line: number; column: number };

  // 选中文本
  selectedText: string;

  // 历史记录
  history: {
    undoStack: string[];
    redoStack: string[];
  };

  // 自动保存状态
  autoSaveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
}
```

### 4.5 Assistant Store (AI助手状态)

```typescript
// stores/assistant.ts
interface AssistantState {
  // 对话历史
  messages: ChatMessage[];

  // 当前输入
  currentInput: string;

  // AI状态
  aiStatus: 'idle' | 'thinking' | 'responding' | 'error';

  // 建议列表
  suggestions: Suggestion[];

  // 选中的提示词模板
  selectedPrompt: PromptTemplate | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    chapterId?: string;
    characterId?: string;
    selectedText?: string;
  };
}

interface Suggestion {
  id: string;
  type: 'continuation' | 'dialogue' | 'description' | 'plot';
  content: string;
  confidence: number;
}
```

## 5. 路由结构

```typescript
// router/index.ts
const routes = [
  {
    path: '/',
    redirect: '/projects'
  },
  {
    path: '/projects',
    name: 'ProjectList',
    component: () => import('@/views/ProjectList.vue'),
    meta: { title: '我的项目' }
  },
  {
    path: '/project/:id',
    component: () => import('@/layouts/EditorLayout.vue'),
    children: [
      {
        path: '',
        name: 'Editor',
        component: () => import('@/views/Editor.vue'),
        meta: { title: '编辑器' }
      },
      {
        path: 'settings',
        name: 'ProjectSettings',
        component: () => import('@/views/ProjectSettings.vue'),
        meta: { title: '项目设置' }
      },
      {
        path: 'characters',
        name: 'CharacterManager',
        component: () => import('@/views/CharacterManager.vue'),
        meta: { title: '人物管理' }
      },
      {
        path: 'outline',
        name: 'OutlineView',
        component: () => import('@/views/OutlineView.vue'),
        meta: { title: '大纲视图' }
      },
      {
        path: 'visualization',
        name: 'Visualization',
        component: () => import('@/views/Visualization.vue'),
        meta: { title: '可视化' }
      }
    ]
  }
];
```

## 6. 组件API设计

### 6.1 MarkdownEditor 组件

```vue
<!-- components/editor/MarkdownEditor.vue -->
<script setup lang="ts">
interface Props {
  modelValue: string;
  placeholder?: string;
  readonly?: boolean;
  height?: string;
  theme?: 'light' | 'dark';
}

interface Emits {
  (e: 'update:modelValue', value: string): void;
  (e: 'save', content: string): void;
  (e: 'selectionChange', text: string): void;
}
</script>
```

### 6.2 CharacterCard 组件

```vue
<!-- components/settings/CharacterCard.vue -->
<script setup lang="ts">
interface Props {
  character: Character;
  selected?: boolean;
  compact?: boolean;
}

interface Emits {
  (e: 'select', character: Character): void;
  (e: 'edit', character: Character): void;
  (e: 'delete', id: string): void;
}
</script>
```

### 6.3 RelationGraph 组件

```vue
<!-- components/visualization/RelationGraph.vue -->
<script setup lang="ts">
interface Props {
  characters: Character[];
  relationships: Relationship[];
  highlightId?: string;
  width?: number;
  height?: number;
}

interface Emits {
  (e: 'nodeClick', character: Character): void;
  (e: 'edgeClick', relationship: Relationship): void;
}
</script>
```

### 6.4 ChatPanel 组件

```vue
<!-- components/assistant/ChatPanel.vue -->
<script setup lang="ts">
interface Props {
  messages: ChatMessage[];
  loading?: boolean;
  placeholder?: string;
}

interface Emits {
  (e: 'send', message: string): void;
  (e: 'clear'): void;
  (e: 'retry', messageId: string): void;
}
</script>
```

## 7. 性能优化策略

1. **虚拟滚动**: 大纲树、章节列表使用虚拟滚动
2. **懒加载**: 路由组件按需加载
3. **防抖节流**: 编辑器输入、搜索使用防抖
4. **缓存策略**: 使用 Pinia 持久化缓存
5. **Web Worker**: Markdown渲染放入Worker

## 8. 响应式设计断点

```scss
// 断点定义
$breakpoints: (
  'xs': 0,
  'sm': 576px,
  'md': 768px,
  'lg': 992px,
  'xl': 1200px,
  'xxl': 1400px
);

// 三栏布局适配
// >= 1400px: 三栏完整显示
// 992px - 1400px: 右侧面板可折叠
// < 992px: 切换为标签页模式
```
